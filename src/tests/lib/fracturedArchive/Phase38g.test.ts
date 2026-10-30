import { describe, expect, test } from '@jest/globals';
import { OTHER_RAIDS, otherRaidsTest } from '@/tests/utils/otherRaids';
import React from 'react';
import { TextDecoder, TextEncoder } from 'util';
import { generateEmptyPlayer } from '@/state';
import { buildTargetMonster, findTarget } from '@/lib/fracturedArchive/bestSetup';
import { drainFacts } from '@/lib/fracturedArchive/drainLine';
import { briefingRows } from '@/lib/fracturedArchive/briefing';
import { eventWantedCounts } from '@/lib/fracturedArchive/encounterBudget';
import { BestSetupAssumptions } from '@/lib/fracturedArchive/presets';
import {
  createKitEvaluator, encounterTime, EncounterTime, presetKitLoadout, raidTimeAssumptionsFrom,
} from '@/lib/fracturedArchive/raidTime';
import { runGearSearch } from '@/lib/fracturedArchive/search';
import { kitCarriers, NO_CARRIERS, RoleTarget } from '@/lib/fracturedArchive/specChoice';
import { drainModel, DrainModel } from '@/lib/fracturedArchive/specs';
import {
  applyOutcome, drainOrder, helpfulSpecs, MAX_FLOOR_SPECS, neededSpecs, passingTeams, planChance, recommendCarriers,
} from '@/lib/fracturedArchive/teamSpecs';
import { assumptionsForTarget } from '@/lib/raids/toa/supplies';
import { raidConfig } from '@/lib/raids';
import { RaidId } from '@/lib/raids/types';
import { DrainFactsLine } from '@/app/components/bestSetup/DrainLineView';
import PlanBriefing from '@/app/components/bestSetup/PlanBriefing';
import SpecPlanPanel from '@/app/components/bestSetup/SpecPlanPanel';

// Phase 38g: drains as facts, no seconds. Per boss / phase: the drain weapons that can hit, ordered by the Defence one
// spec removes on average, with their hit chances; the specs to the floor at 95% (was: if every spec lands); Team: the
// fewest carriers at 95% (`recommendCarriers`), the kit's carriers = per weapon the most any boss needs. The time model
// makes one fixed drain set per event (Team: the carriers' first-round specs; Solo: your bar pays the drains first),
// cut to what the bars pay. Search, Plan and Summary show the same drain line. Docs: docs/BEST_SETUP.md *Phase 38g*.

const A = (id: RaidId): BestSetupAssumptions => raidConfig(id).defaultAssumptions;
const modelOf = (raid: RaidId, key: string, phase?: string, a: BestSetupAssumptions = A(raid)): DrainModel => {
  const t = findTarget(key);
  return drainModel(buildTargetMonster(t, phase, 'none', a).monster, assumptionsForTarget(t, a));
};
/** P(at least k of n independent specs land), each with probability h (Elder maul: one hit or a miss). */
const atLeast = (k: number, n: number, h: number): number => {
  let p = 0;
  const choose = (a: number, b: number) => { let c = 1; for (let i = 1; i <= b; i++) c = (c * (a - b + i)) / i; return c; };
  for (let j = k; j <= n; j++) p += choose(n, j) * h ** j * (1 - h) ** (n - j);
  return p;
};
/** The fewest n with P(at least k of n land) ≥ 95%. */
const fewest = (k: number, h: number): number => {
  for (let n = k; n <= 20; n++) if (atLeast(k, n, h) >= 0.95) return n;
  return Infinity;
};
/** Elder maul landed specs from `def` to `floor` (each −trunc(35% of the current Defence), floor applied). */
const maulLanded = (def: number, floor: number): number => {
  let d = def;
  for (let k = 1; k <= 50; k++) {
    d = Math.max(floor, d - Math.trunc((d * 35) / 100));
    if (d <= floor) return k;
  }
  return Infinity;
};

describe('specs to the floor at 95%, not if every spec lands (hand-computed, Elder maul only)', () => {
  test('FA Bork, armour 8: Def 300 → 195 → 127 (2 landed specs, best case 2); at 77% per spec 4 specs reach 95%', () => {
    const m = modelOf('fractured-archive', 'bork', 'Smorks 100-76% HP (armour 8)');
    expect([m.def, m.floor]).toEqual([300, 180]);
    expect(maulLanded(300, 180)).toBe(2);
    const h = m.hitChance.elderMaul;
    expect(h).toBeCloseTo(0.77, 2);
    // P(≥ 2 of 3) = 3h²(1 − h) + h³ ≈ 0.87; P(≥ 2 of 4) = 1 − (1 − h)⁴ − 4h(1 − h)³ ≈ 0.96
    expect(atLeast(2, 3, h)).toBeLessThan(0.95);
    expect(fewest(2, h)).toBe(4);
    const nd = neededSpecs(m, { elderMaul: MAX_FLOOR_SPECS });
    expect(nd.defence).toEqual({ elderMaul: 4 });
    // phase 38h-1: the specs after the first landed one roll at Def 195 (more accurate), so 4 specs land the floor more
    // often than 4 at the undrained hit chance (Phase38g2.test.ts builds the 97.4% from upstream's hit chances)
    expect(nd.pFloor).toBeGreaterThan(atLeast(2, 4, h) + 0.01);
    expect(nd.pFloor).toBeCloseTo(planChance(m, [{ weapon: 'elderMaul', count: 4 }]), 12);
  });

  otherRaidsTest('ToA Kephri (low accuracy): Def 80 → floor 60 with 1 landed spec (best case 1), but 63% per spec needs 4 for 95%', () => {
    const m = modelOf('toa', 'toa-kephri');
    expect([m.def, m.floor]).toEqual([80, 60]);
    expect(maulLanded(80, 60)).toBe(1);
    const h = m.hitChance.elderMaul;
    expect(h).toBeCloseTo(0.63, 2);
    // P(≥ 1 of n) = 1 − (1 − h)ⁿ: n = 3 → 0.949 (< 95%), n = 4 → 0.981
    expect(1 - (1 - h) ** 3).toBeLessThan(0.95);
    expect(fewest(1, h)).toBe(4);
    const nd = neededSpecs(m, { elderMaul: MAX_FLOOR_SPECS });
    expect(nd.defence).toEqual({ elderMaul: 4 });
    expect(nd.pFloor).toBeCloseTo(1 - (1 - h) ** 4, 10);
    // the drain order: one landed maul removes 20 (80 → 60), so a spec removes 20h on average
    const order = drainOrder(m);
    expect(order[0].weapon).toBe('elderMaul');
    expect(order[0].expectedDrop).toBeCloseTo(20 * h, 10);
    expect(order[0].hitChance).toBe(h);
    expect(order.map((x) => x.expectedDrop)).toEqual([...order.map((x) => x.expectedDrop)].sort((a, b) => b - a));
  });

  otherRaidsTest('ToB Sotetseg: Def 200 → 130 → 85 (2 landed); at 75% per spec the maul alone needs 5 for 95% (4 give 94.9%)', () => {
    const m = modelOf('tob', 'tob-sotetseg');
    expect([m.def, m.floor]).toEqual([200, 100]);
    expect(maulLanded(200, 100)).toBe(2);
    const h = m.hitChance.elderMaul;
    expect(h).toBeCloseTo(0.75, 2);
    expect(atLeast(2, 4, h)).toBeLessThan(0.95);
    expect(fewest(2, h)).toBe(5);
    expect(neededSpecs(m, { elderMaul: MAX_FLOOR_SPECS }).defence).toEqual({ elderMaul: 5 });
    // with every weapon the fewest is never more than the maul alone
    const all = neededSpecs(m, {
      elderMaul: MAX_FLOOR_SPECS, dwh: MAX_FLOOR_SPECS, tonalztics: MAX_FLOOR_SPECS, bgs: MAX_FLOOR_SPECS,
    }).defence!;
    expect(Object.values(all).reduce((t, n) => t + (n ?? 0), 0)).toBeLessThanOrEqual(5);
  });

  otherRaidsTest('CoX Tekton: floor 0 is never reached (8 landed mauls leave Def 8: 215 → 140 → 91 → 60 → 39 → 26 → 17 → 12 → 8)', () => {
    const m = modelOf('cox', 'cox-tekton');
    expect([m.def, m.floor]).toEqual([215, 0]);
    let d = 215;
    const chain = [d];
    for (let k = 0; k < 8; k++) {
      d = applyOutcome(m, 'elderMaul', d, { p: 1, hits: 1, damage: 0 });
      chain.push(d);
    }
    expect(chain).toEqual([215, 140, 91, 60, 39, 26, 17, 12, 8]);
    expect(neededSpecs(m, { elderMaul: MAX_FLOOR_SPECS }).defence).toBeNull();
    // fix round (the user: "cap at what helps"): d* = the lowest Defence 6 maul specs reach at 95% (one landed spec each
    // step: 215 → 140 → 91 → 60), and the fewest of them that still reach it. With h per spec: P(≥ 2 of 6) ≈ 98% and
    // P(≥ 3 of 6) ≈ 92%, so d* = 91; P(≥ 2 of 4) ≈ 89%, P(≥ 2 of 5) ≈ 96%: 5 specs
    const h = m.hitChance.elderMaul;
    expect(atLeast(2, 6, h)).toBeGreaterThanOrEqual(0.95);
    expect(atLeast(3, 6, h)).toBeLessThan(0.95);
    expect(fewest(2, h)).toBe(5);
    const six = helpfulSpecs(m, Array(6).fill('elderMaul'));
    expect(six).toEqual({ dStar: 91, counts: { elderMaul: 5 }, specs: 5 });
    // Team: 2 maul carriers (4 specs): P(≥ 1 of 4) ≈ 99%, P(≥ 2 of 4) ≈ 89% → d* = 140; P(≥ 1 of 3) ≈ 96% → 3 specs, so 2
    // whole carriers (4 specs)
    expect(1 - (1 - h) ** 3).toBeGreaterThanOrEqual(0.95);
    expect(1 - (1 - h) ** 2).toBeLessThan(0.95);
    expect(helpfulSpecs(m, Array(4).fill('elderMaul'))).toEqual({ dStar: 140, counts: { elderMaul: 3 }, specs: 3 });
    // the facts line, party 4: floor 0 out of reach in 2 × 4 = 8 specs (fix round B1: the count goes as far as the carriers)
    const f = drainFacts(m, { drain: 'team', partySize: 4 });
    expect(f.specs).toBeNull();
    expect(f.text).toMatch(/floor not reached in 8 specs; ~\d+ specs to Def \d+ at 95%; \d+ bring [A-Za-z ]+ for Def \d+$/);
    expect(f.help!.specs).toBeGreaterThan(0);
    expect(drainFacts(m, { drain: 'team', partySize: 4, paid: 4 }).short).toBe('floor not reached, the team has ~4');
  });

  test('fix round B1: the Team count goes as far as 2 specs per party member (the Smorks: Tonalztics reach floor 0 within 12)', () => {
    const m = modelOf('fractured-archive', 'smorks');
    expect(m.floor).toBe(0);
    const f = drainFacts(m, { drain: 'team', partySize: 6 });
    expect(f.specs).not.toBeNull();
    expect(f.specs!).toBeLessThanOrEqual(12);
    expect(f.text).not.toMatch(/floor not reached/);
    // phase 38g-2 (each spec at the Defence the earlier ones leave): Solo gets there in exactly 8 Tonalztics specs
    expect(drainFacts(m, { drain: 'solo', partySize: 1 }).specs).toBe(8);
  });

  test('fix round B2: Solo counts over the weapons you bring (FA Solo Ezekiel with Tonalztics: 4 specs (38g-2); every weapon: 3)', () => {
    const fa = raidConfig('fractured-archive');
    const a: BestSetupAssumptions = {
      ...fa.defaultAssumptions, partySize: 1, mySpecs: { ...fa.defaultAssumptions.mySpecs, tonalztics: true },
    };
    const ez = buildTargetMonster(findTarget('ezekiel'), undefined, 'solo', a).drain;
    // phase 38g-2: one plan over the weapons you bring (was "~5 specs" with every hit chance at the undrained Defence)
    expect(ez.line!.facts!.text).toMatch(/^Drain: Tonalztics ×4 \(floor \d+%\)$/);
    expect(drainFacts(modelOf('fractured-archive', 'ezekiel', undefined, a), { drain: 'solo', partySize: 1 }).specs).toBe(3);
  });
});

describe('carriers by headcount (no seconds)', () => {
  test('per event: the fewest of the kit\'s carriers at 95%, 2 specs each (Bork: 1 maul carrier 59%, 2 carriers 96%)', () => {
    const m = modelOf('fractured-archive', 'bork', 'Smorks 100-76% HP (armour 8)');
    const h = m.hitChance.elderMaul;
    expect(h * h).toBeLessThan(0.95); // 1 carrier: 2 specs, both must land
    expect(atLeast(2, 4, h)).toBeGreaterThanOrEqual(0.95);
    expect(eventWantedCounts({ drain: 'team', carriers: { elderMaul: 3 } }, [m])).toEqual({ elderMaul: 4 });
  });

  otherRaidsTest('per event, ToA / CoX: the fewest carriers at 95%, the cap at what helps', () => {
    // Kephri: 1 carrier 1 − (1 − h)² ≈ 86%, 2 carriers ≈ 98%
    const k = modelOf('toa', 'toa-kephri');
    expect(1 - (1 - k.hitChance.elderMaul) ** 2).toBeLessThan(0.95);
    expect(eventWantedCounts({ drain: 'team', carriers: { elderMaul: 2 } }, [k])).toEqual({ elderMaul: 4 });
    // Solo: your specs to the floor at 95% (the bar pays what it can; see below)
    expect(eventWantedCounts({ drain: 'solo', solo: { elderMaul: 99 } }, [k])).toEqual({ elderMaul: 4 });
    // no team within the kit reaches the floor (Tekton): the fix round's "cap at what helps", d* = Def 140 with 4 specs,
    // reached by 3 = 2 whole carriers (see the Tekton test)
    const t = modelOf('cox', 'cox-tekton');
    expect(eventWantedCounts({ drain: 'team', carriers: { elderMaul: 2, tonalztics: 1 } }, [t])).toEqual({ elderMaul: 4 });
  });

  test('recommendCarriers within the kit\'s carriers (`available`), the same as passingTeams\' first', () => {
    const m = modelOf('fractured-archive', 'bork', 'Smorks 100-76% HP (armour 8)');
    expect(recommendCarriers(m, { partySize: 6 }).best!.carriers).toEqual(passingTeams(m, { partySize: 6 })[0].carriers);
    expect(recommendCarriers(m, { partySize: 6, available: { tonalztics: 6 } }).best?.carriers ?? null)
      .toEqual(passingTeams(m, { partySize: 6 }).find((r) => !r.carriers.elderMaul && !r.carriers.dwh && !r.carriers.bgs)?.carriers ?? null);
  });

  test('the kit = per weapon the most any boss needs; more than the party: the fewest within it that still cover every boss', () => {
    const a = A('fractured-archive');
    const target = (key: string, phase?: string): RoleTarget => ({ key, label: key, model: modelOf('fractured-archive', key, phase, a) });
    const bork = target('bork', 'Smorks 100-76% HP (armour 8)');
    const ag = target('ag-flying');
    // Bork: 2 Elder maul; AG flying (Tonalztics only): 2 Tonalztics → 2 + 2 within a party of 4
    expect(kitCarriers([bork, ag], { partySize: 4, mages: 0 }).carriers).toMatchObject({ elderMaul: 2, tonalztics: 2 });
    // a party of 3 can't hold 2 + 2: one boss is covered either way; the user (fix round): a kit that leaves you out wins
    // (2 Tonalztics, not 2 Elder maul + 1 Tonalztics)
    expect(kitCarriers([bork, ag], { partySize: 3, mages: 0 })).toEqual({ carriers: { ...NO_CARRIERS, tonalztics: 2 }, uncovered: ['bork'] });
    // 3 bars in a party of 4 (your bar is yours): the walk never makes you a carrier; on equal coverage the higher worst P(floor)
    expect(kitCarriers([bork, ag], { partySize: 3, mages: 0, party: 4 }).uncovered).toHaveLength(1);
  });
});

describe('Solo: your bar pays the drains first; the line says when it can\'t pay for 95%', () => {
  test('FA Bork, party 1, Elder maul only: 4 specs to the floor at 95%, the bar pays 2 (100% ÷ 50%), one per NPC (38h-2)', () => {
    const fa = raidConfig('fractured-archive');
    const a: BestSetupAssumptions = {
      ...fa.defaultAssumptions, partySize: 1, mySpecs: { ...fa.defaultAssumptions.mySpecs, elderMaul: true },
    };
    const kit = createKitEvaluator(fa.presets.map((p) => presetKitLoadout(generateEmptyPlayer(), p, a)), a);
    const e = encounterTime('bork-smorks', kit, raidTimeAssumptionsFrom(a, 'solo', fa.defaultTimeSettings, fa.time));
    // phase 38h-2 (in HP, averaged over the outcomes): the bar's specs go where each is worth most: 1 on Bork (82 HP),
    // 2 on the Smorks (101 HP; the regen pays the second)
    expect(e.specPlan!.events.map((x) => x.counts)).toEqual([{ elderMaul: 1 }, { elderMaul: 2 }]);
    expect(e.specPlan!.events[1].hp).toBeGreaterThan(e.specPlan!.events[0].hp!);
    const facts = e.phases[0].choice!.drainLine!.facts!;
    expect(facts.paid).toBe(1);
    expect(facts.specs).toBe(4);
    expect(facts.short).toBe('needs 4 specs, you have ~1');
    // the time model uses what the bar paid: 1 maul spec on Bork (300 → 195)
    expect(e.phases[0].choice!.drainLine!.items.find((i) => i.weapon === 'elderMaul')!.count).toBe(1);
  });
});

describe('one drain line on Search, Plan and Summary (same source: drainLine.ts drainFacts)', () => {
  Object.assign(globalThis, { TextEncoder, TextDecoder });
  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
  const { renderToStaticMarkup } = require('react-dom/server') as typeof import('react-dom/server');
  const factsIn = (html: string): string[] => {
    const div = document.createElement('div');
    div.innerHTML = html;
    return Array.from(div.querySelectorAll('[data-testid="drain-facts"]')).map((x) => `${x.getAttribute('data-text')}|${x.getAttribute('data-short')}`);
  };
  const encounterOf = (raid: RaidId, id: string, a: BestSetupAssumptions, drain: 'team' | 'solo'): EncounterTime => {
    const r = raidConfig(raid);
    const kit = createKitEvaluator(r.presets.map((p) => presetKitLoadout(generateEmptyPlayer(), p, a)), a);
    return encounterTime(id, kit, raidTimeAssumptionsFrom(a, drain, r.defaultTimeSettings, r.time));
  };

  test.each([
    ['fractured-archive', 'xarth'], ['toa', 'toa-kephri'], ['cox', 'cox-tekton'], ['tob', 'tob-sotetseg'],
  ].filter(([raid]) => OTHER_RAIDS || raid === 'fractured-archive') as [RaidId, string][])('%s %s (Team, default party): the three tabs render the same line', (raid, id) => {
    const a = A(raid);
    const e = encounterOf(raid, id, a, 'team');
    const first = e.phases.find((p) => !findTarget(p.targetKey).noDrains)!;
    // Search: the Spec plan panel of that boss / phase
    const search = factsIn(renderToStaticMarkup(React.createElement(SpecPlanPanel, {
      targetKey: first.targetKey, phase: first.phase, drain: 'team', assumptions: a,
    })));
    // Summary: the cell renders its search result's drain state
    const result = runGearSearch(generateEmptyPlayer(), {
      targetKey: first.targetKey, phase: first.phase, drain: 'team', styles: 'all',
    }, a, { weapons: ['Twisted bow'], maxPasses: 1, topN: 1 });
    const summary = factsIn(renderToStaticMarkup(React.createElement(DrainFactsLine, { facts: result.drain.line!.facts })));
    // Plan: the briefing row's first drain event
    const [row] = briefingRows([e], 'team');
    const planned = factsIn(renderToStaticMarkup(React.createElement(PlanBriefing, { rows: [row], kit: [], imageOf: () => null })));
    expect(search).toHaveLength(1);
    expect(summary).toEqual(search.map((x) => x.replace(/\|.*$/, `|${result.drain.line!.facts!.short ?? ''}`)));
    // the facts text is the same everywhere (the "needs N, you have ~M" mark follows each tab's own drain plan)
    const text = (x: string) => x.replace(/\|.*$/, '');
    expect(text(planned[0])).toBe(text(search[0]));
    expect(text(summary[0])).toBe(text(search[0]));
    expect(text(search[0])).toMatch(/^Drain: /);
  }, 120000);

  otherRaidsTest('Solo, Team and any party size: the same order and specs; only the carriers change', () => {
    const m = modelOf('toa', 'toa-kephri');
    const pct = (p: number) => `${Math.round(p * 100)}%`;
    const head = `Drain: ${drainOrder(m).map((x, i) => `${{
      elderMaul: 'Elder maul', dwh: 'DWH', tonalztics: 'Tonalztics', bgs: 'BGS',
    }[x.weapon]} (${i === 0 ? 'lands ' : ''}${pct(x.hitChance)})`).join(' → ')}, ~4 specs to the floor`;
    expect(drainFacts(m, { drain: 'solo', partySize: 1 }).text).toBe(head);
    expect(drainFacts(m, { drain: 'solo', partySize: 4 }).text).toBe(head);
    expect(drainFacts(m, { drain: 'team', partySize: 4 }).text).toBe(`${head}; 2 bring Elder maul for 95%`);
    expect(drainFacts(m, { drain: 'team', partySize: 8 }).text).toBe(`${head}; 2 bring Elder maul for 95%`);
    // a party of 1 in Team has no carriers part
    expect(drainFacts(m, { drain: 'team', partySize: 1 }).text).toBe(head);
    // the mark: the bars pay fewer than the specs to the floor
    expect(drainFacts(m, { drain: 'solo', partySize: 1, paid: 2 }).short).toBe('needs 4 specs, you have ~2');
    expect(drainFacts(m, { drain: 'team', partySize: 4, paid: 4 }).short).toBeUndefined();
  });
});
