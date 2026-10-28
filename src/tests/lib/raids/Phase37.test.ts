import { describe, expect, test } from '@jest/globals';
import { OTHER_RAIDS, otherRaidsDescribe, otherRaidsTest } from '@/tests/utils/otherRaids';
import React from 'react';
import { TextDecoder, TextEncoder } from 'util';
import { existsSync } from 'fs';
import { slowTest } from '@/tests/utils/slow';
import { join } from 'path';
import { generateEmptyPlayer } from '@/state';
import { TraceMemo, TraceRecorder } from '@/lib/fracturedArchive/traceMemo';
import { createKitMemo } from '@/lib/fracturedArchive/kitMemo';
import {
  compareRoutes, createKitEvaluator, KitChoice, kitEvaluatorCache, KitLoadout, phaseKey, PhaseQuery, presetKitLoadout,
  RaidTimeAssumptions, raidTimeAssumptionsFrom, RouteComparison, specCountsKey,
} from '@/lib/fracturedArchive/raidTime';
import { EncounterAlloc } from '@/lib/fracturedArchive/encounterBudget';
import { damageSpecRanking, DamageSpecProfile, gainPerFullBar } from '@/lib/fracturedArchive/damageSpecs';
import { buildTargetMonster, findTarget } from '@/lib/fracturedArchive/bestSetup';
import SpecDamageBox from '@/app/components/bestSetup/SpecDamageBox';
import { allocateBudget, AllocationProblem } from '@/lib/fracturedArchive/specBudget';
import {
  plan, PlanInputs, planRingRun, PlanTuning, RingRunResult,
} from '@/lib/fracturedArchive/planner';
import {
  memoWithin, normalised, PHASE37_FIXTURES, phase37Fixture, reducedCase,
} from '@/tests/utils/phase37';
import {
  decodeRingRuns, encodeRingRuns, parallelRingRuns, parallelRingsApply,
} from '@/lib/fracturedArchive/parallelRings';
import { BestSetupAssumptions } from '@/lib/fracturedArchive/presets';
import { raidConfig } from '@/lib/raids';
import { RaidId } from '@/lib/raids/types';
import {
  DrainLine, drainLineItem, DrainLineItem, encounterBrief, encounterDrainSummary,
} from '@/lib/fracturedArchive/drainLine';

// Phase 37: performance without changing a result. The planner's kits memoise encounter times and model passes exactly
// (traceMemo.ts, kitMemo.ts: a remembered run is reused only by a kit that answers every question the run asked the
// same way), the exact re-times share one DPS memo, and the DP's state key lists its pools once per row. Docs:
// docs/BEST_SETUP.md *Performance (phase 37)*.

// --- the trace memo --------------------------------------------------------------------------------------------------

/** A deterministic run that reads its input only through `ask`: which questions it asks depends on the answers. */
const toyRun = (ask: (q: string) => number): string => {
  const a = ask('a');
  const b = a > 0 ? ask('b') : ask('c');
  const again = ask('a'); // a repeated question
  return `${a}/${b}/${again}/${b > 1 ? ask('d') : -1}`;
};

const memoised = (memo: TraceMemo<string, string>, oracle: Record<string, number>, key = 'k') => {
  const hit = memo.get(key, (q) => oracle[q]);
  if (hit) return { result: hit.result, hit: true };
  const rec = new TraceRecorder<string>();
  const result = toyRun((q) => {
    rec.note({ id: q, question: q, answer: oracle[q] });
    return oracle[q];
  });
  memo.set(key, rec.steps, result);
  return { result, hit: false };
};

describe('TraceMemo', () => {
  test('a remembered run is reused exactly when every question it asked gets the same answer', () => {
    const memo = new TraceMemo<string, string>();
    const oracles: Record<string, number>[] = [];
    // every oracle over a..d in {0, 1, 2}
    for (let i = 0; i < 81; i++) {
      oracles.push({
        a: i % 3, b: Math.floor(i / 3) % 3, c: Math.floor(i / 9) % 3, d: Math.floor(i / 27) % 3,
      });
    }
    let hits = 0;
    [...oracles, ...oracles].forEach((o) => {
      const r = memoised(memo, o);
      expect(r.result).toBe(toyRun((q) => o[q]));
      if (r.hit) hits += 1;
    });
    // the second pass is all hits; the first pass hits whenever an unasked question differs only
    expect(hits).toBeGreaterThanOrEqual(81);
    expect(hits).toBeLessThan(162);
  });

  test('keys are separate; the steps of a hit; a trace that disagrees with the tree is not stored', () => {
    const memo = new TraceMemo<string, string>();
    const o = {
      a: 1, b: 2, c: 0, d: 1,
    };
    memoised(memo, o, 'x');
    expect(memo.get('y', (q) => (o as Record<string, number>)[q])).toBeNull();
    const hit = memo.get('x', (q) => (o as Record<string, number>)[q], true)!;
    expect(hit.result).toBe('1/2/1/1');
    expect(hit.steps.map((s) => `${s.id}=${s.answer}`)).toEqual(['a=1', 'b=2', 'd=1']);
    // a non-deterministic run (other questions after the same answers) is refused
    const before = memo.size;
    memo.set('x', [{ id: 'a', question: 'a', answer: 1 }, { id: 'z', question: 'z', answer: 0 }], 'bad');
    expect(memo.size).toBe(before);
    expect(memo.get('x', (q) => (o as Record<string, number>)[q])!.result).toBe('1/2/1/1');
  });

  test('a recorder forwards first asks to its parent, once', () => {
    const parent = new TraceRecorder<string>();
    const child = new TraceRecorder<string>(parent);
    parent.note({ id: 'a', question: 'a', answer: 1 });
    child.note({ id: 'a', question: 'a', answer: 1 });
    child.note({ id: 'b', question: 'b', answer: 0 });
    child.note({ id: 'b', question: 'b', answer: 0 });
    expect(parent.steps.map((s) => s.id)).toEqual(['a', 'b']);
    expect(child.steps.map((s) => s.id)).toEqual(['a', 'b']);
  });
});

// --- the memoised kits vs the same kits without the memos --------------------------------------------------------------

/** Toy DPS of member m on a drain state (deterministic, ties included: members 0 and 1 are equal everywhere). */
const toyDps = (id: string, m: number): number => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 100003;
  const mm = m === 1 ? 0 : m;
  return 2 + ((h + mm * 7919) % 89) / 10;
};

/** A damage spec whose value depends on the hp left (the ZCB's ruby proc) and the drains (the query's counts). */
const toyProfile = (q: PhaseQuery, w: string): DamageSpecProfile => ({
  weapon: w as DamageSpecProfile['weapon'],
  label: w,
  energy: w === 'zcb' ? 75 : 50,
  canHit: true,
  variants: [{
    label: 'toy', expected: Math.min(q.hpLeft ?? 1e9, 40 + (w === 'zcb' ? 0.22 * (q.hpLeft ?? 500) : 30) + specCountsKey(q.specs?.counts).length), ticks: 4, maxHit: 99, accuracy: 0.9,
  }],
});

const memoFor = () => {
  const memo = createKitMemo<string>({
    ask: (q) => {
      const id = `${phaseKey(q.targetKey, q.phase)}|${q.drain === 'none' ? '' : specCountsKey(q.specs?.counts)}`;
      return { id, state: id };
    },
    pick: (_, id, members) => {
      let bi = -1;
      let bd = 0;
      for (const m of members) {
        const d = toyDps(id, m);
        if (bi < 0 || d > bd) {
          bi = m;
          bd = d;
        }
      }
      return bi;
    },
    choice: (bi, _, id): KitChoice | null => (bi < 0 ? null : {
      loadout: `L${bi}`, style: '-', dps: toyDps(id, bi),
    }),
    parts: {
      specDamage: (q, w) => toyProfile(q, w),
      specHits: () => ({}),
      drainKey: (q) => `${phaseKey(q.targetKey, q.phase)}|${q.drain === 'none' ? '' : specCountsKey(q.specs?.counts)}`,
    },
  });
  return memo;
};

const timeA = (id: RaidId, a: Partial<BestSetupAssumptions>, drain: 'team' | 'solo' = 'team'): RaidTimeAssumptions => {
  const raid = raidConfig(id);
  return raidTimeAssumptionsFrom({ ...raid.defaultAssumptions, ...a }, drain, raid.defaultTimeSettings, raid.time);
};
const team = (id: RaidId, carriers: Partial<BestSetupAssumptions['team']['carriers']>) => ({
  team: { ...raidConfig(id).defaultAssumptions.team, carriers: { ...raidConfig(id).defaultAssumptions.team.carriers, ...carriers } },
});
const NO_CARRIERS = {
  elderMaul: 0, tonalztics: 0, dwh: 0, bgs: 0, ayak: 0,
};
const total = (c: RouteComparison) => c.routes[c.fastest].seconds;
const allocOf = (cmp: RouteComparison): Partial<Record<string, EncounterAlloc>> => {
  const out: Partial<Record<string, EncounterAlloc>> = {};
  cmp.routes[cmp.fastest].encounters.forEach((e) => {
    if (e.specPlan) {
      out[e.id] = {
        events: e.specPlan.events, rowEvent: e.specPlan.rowEvent, damage: e.specPlan.damage, surge: e.specPlan.surge,
      };
    }
  });
  return out;
};

describe('memoised kits = the same kits without the memos', () => {
  const check = (memo: ReturnType<typeof memoFor>, members: number[], a: RaidTimeAssumptions): RouteComparison => {
    const got = compareRoutes(memo.kit(members), a);
    expect(got).toEqual(compareRoutes(memo.plain(members), a));
    return got;
  };

  test.each((['fractured-archive', 'tob', 'toa'] as RaidId[]).filter((id) => OTHER_RAIDS || id === 'fractured-archive'))('%s: every key component (carriers, items, surge, drain state, hp left, members, spec plan)', (id) => {
    const memo = memoFor();
    const m0 = [0, 2, 3];
    const base = check(memo, m0, timeA(id, { ...team(id, { ...NO_CARRIERS, elderMaul: 1, tonalztics: 1 }) }));
    // same inputs again: all hits, the same object
    const runs0 = memo.stats.encounterRuns;
    expect(compareRoutes(memo.kit(m0), timeA(id, { ...team(id, { ...NO_CARRIERS, elderMaul: 1, tonalztics: 1 }) }))).toEqual(base);
    expect(memo.stats.encounterRuns).toBe(runs0);
    expect(memo.stats.encounterHits).toBeGreaterThan(0);
    // carriers: a miss (other pools, other options)
    const moreCarriers = check(memo, m0, timeA(id, { ...team(id, { ...NO_CARRIERS, elderMaul: 2, tonalztics: 2 }) }));
    expect(total(moreCarriers)).not.toBe(total(base));
    // items (damage specs; hp left: the toy ZCB's value is a share of the hp left at the row) and the surge potion
    const items = check(memo, m0, timeA(id, { ...team(id, { ...NO_CARRIERS, elderMaul: 1 }), damageSpecs: ['zcb'] }));
    const surge = check(memo, m0, timeA(id, { ...team(id, { ...NO_CARRIERS, elderMaul: 1 }), damageSpecs: ['zcb'], surgePotions: 1 }));
    expect(total(items)).not.toBe(total(base));
    expect(total(surge)).toBeLessThanOrEqual(total(items));
    // drain state: Solo (your bar, the weapons you carry)
    const solo = check(memo, m0, timeA(id, { mySpecs: { ...raidConfig(id).defaultAssumptions.mySpecs, elderMaul: true } }, 'solo'));
    expect(total(solo)).not.toBe(total(base));
    // members (ownership: a member removed / added; 0 and 1 tie everywhere, so the order matters for the pick only)
    [[0, 3], [2, 3], [1, 2, 3], [0, 1, 2, 3], [3, 2, 0], [4, 5, 6], [0, 2, 3, 7]].forEach((m) => {
      check(memo, m, timeA(id, { ...team(id, { ...NO_CARRIERS, elderMaul: 1, tonalztics: 1 }) }));
      check(memo, m, timeA(id, { ...team(id, { ...NO_CARRIERS, elderMaul: 1 }), damageSpecs: ['zcb'], surgePotions: 1 }));
    });
    // a fixed spec plan (the optimiser's replay) and its kits
    const fixedA: RaidTimeAssumptions = { ...timeA(id, { ...team(id, { ...NO_CARRIERS, elderMaul: 1, tonalztics: 1 }) }), fixedAlloc: allocOf(base) as RaidTimeAssumptions['fixedAlloc'] };
    [m0, [0, 3], [4, 5, 6], m0].forEach((m) => check(memo, m, fixedA));
    expect(memo.stats.passHits).toBeGreaterThan(0);
  }, 120000);

  otherRaidsTest('a long random sequence (the optimiser\'s access pattern) on ToB', () => {
    const memo = memoFor();
    let seed = 7;
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    const as = [
      timeA('tob', team('tob', { ...NO_CARRIERS, elderMaul: 1, tonalztics: 2 })),
      timeA('tob', team('tob', { ...NO_CARRIERS, tonalztics: 2 })),
      timeA('tob', { ...team('tob', { ...NO_CARRIERS, elderMaul: 1 }), damageSpecs: ['dragonClaws'] }),
    ];
    for (let i = 0; i < 40; i++) {
      const members = Array.from(new Set(Array.from({ length: 1 + rnd(4) }, () => rnd(8))));
      check(memo, members, as[rnd(as.length)]);
    }
    expect(memo.stats.encounterHits).toBeGreaterThan(0);
  }, 120000);
});

// --- shared DPS memo of the exact re-times ------------------------------------------------------------------------------

otherRaidsDescribe('exact re-times share one DPS memo', () => {
  test('kits timed with a shared memo = timed alone; the second kit evaluates only its new loadouts', () => {
    const raid = raidConfig('tob');
    const a = raid.defaultAssumptions;
    const base = generateEmptyPlayer();
    const all: KitLoadout[] = raid.presets.slice(0, 4).map((p) => presetKitLoadout(base, p, a));
    const ta = raidTimeAssumptionsFrom(a, 'team', raid.defaultTimeSettings, raid.time);
    const cache = kitEvaluatorCache();
    const k1 = createKitEvaluator(all.slice(0, 3), a, cache);
    const c1 = compareRoutes(k1, ta);
    const k2 = createKitEvaluator(all.slice(1, 4), a, cache);
    const c2 = compareRoutes(k2, ta);
    expect(c1).toEqual(compareRoutes(createKitEvaluator(all.slice(0, 3), a), ta));
    expect(c2).toEqual(compareRoutes(createKitEvaluator(all.slice(1, 4), a), ta));
    const alone = createKitEvaluator(all.slice(1, 4), a);
    compareRoutes(alone, ta);
    expect(k2.evaluations()).toBeLessThan(alone.evaluations());
  }, 120000);
});

// --- the DP's state key ----------------------------------------------------------------------------------------------

describe('spec budget DP', () => {
  test('pools with no spend left drop out of the state key per row (the same plan as keeping them, keepEnd)', () => {
    const p: AllocationProblem = {
      rows: [
        {
          key: 'r0', event: 0, start: 0, end: 40,
        },
        {
          key: 'r1', event: 1, start: 40, end: 100,
        },
      ],
      events: [
        {
          firstRow: 0,
          options: [{ counts: {}, spends: [] }, {
            counts: { elderMaul: 2 },
            spends: [{
              group: 'elderMaul', specs: 2, cost: 50, row: 0,
            }],
          }],
        },
        {
          firstRow: 1,
          options: [{ counts: {}, spends: [] }, {
            counts: { tonalztics: 2 },
            spends: [{
              group: 'tonalztics', specs: 2, cost: 50, row: 1,
            }],
          }],
        },
      ],
      groups: [{ id: 'elderMaul', count: 1, regenSeconds: 30 }, { id: 'tonalztics', count: 1, regenSeconds: 30 }],
      start: { elderMaul: [100], tonalztics: [100] },
      rowOutcome: (r: number, o: number) => ({ seconds: r === 0 ? 40 - 10 * o : 60 - 15 * o, damage: 0, damageSpecs: [] }),
    };
    const a = allocateBudget(p);
    const b = allocateBudget({ ...p, keepEnd: true });
    expect(a.options).toEqual([1, 1]);
    expect(a.seconds).toBe(b.seconds);
    expect(a.options).toEqual(b.options);
  });
});

// --- the Search tab's Specs box (user, 2026-10-25: plain words, gain per 100% energy) --------------------------------

// react-dom/server needs TextEncoder, which jsdom doesn't provide: set it, then load the renderer
Object.assign(globalThis, { TextEncoder, TextDecoder });
// eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
const { renderToStaticMarkup } = require('react-dom/server') as typeof import('react-dom/server');

describe('Specs (damage) box', () => {
  test('gainPerFullBar = gain ÷ cost × 100 (0 when it cannot hit)', () => {
    expect(gainPerFullBar({ net: 20.6, energy: 50, canHit: true })).toBeCloseTo(41.2, 10);
    expect(gainPerFullBar({ net: 56.2, energy: 75, canHit: true })).toBeCloseTo(74.933, 3);
    expect(gainPerFullBar({ net: 30, energy: 50, canHit: false })).toBe(0);
  });

  test('FA Xarth (Team): plain headers with tooltips, the same numbers as damageSpecRanking, sorted by gain per 100% energy', () => {
    const a = raidConfig('fractured-archive').defaultAssumptions;
    const dps = 13.917;
    const div = document.createElement('div');
    div.innerHTML = renderToStaticMarkup(React.createElement(SpecDamageBox, {
      targetKey: 'xarth', phase: undefined, drain: 'team', assumptions: a, dps, mult: 1,
    }));
    const heads = Array.from(div.querySelectorAll('th'));
    expect(heads.map((h) => h.textContent)).toEqual(['Weapon', 'Avg damage', 'Gain over normal hits', 'Time saved', 'Cost', 'Gain per 100% energy']);
    expect(heads.slice(1).every((h) => (h.getAttribute('title') ?? '').length > 10)).toBe(true);
    expect(heads[1].getAttribute('title')).toBe('Average damage of one spec, hits and misses included');
    const rows = Array.from(div.querySelectorAll('[data-testid="spec-damage-row"]'));
    const ranking = damageSpecRanking(buildTargetMonster(findTarget('xarth'), undefined, 'team', a).monster, a, dps, 1);
    expect(rows.map((r) => r.getAttribute('data-weapon')).sort()).toEqual(ranking.map((r) => r.weapon).sort());
    const per = rows.map((r) => Number(r.getAttribute('data-per-energy')));
    expect(per.every((x, i) => i === 0 || per[i - 1] >= x)).toBe(true);
    rows.forEach((row) => {
      const r = ranking.find((x) => x.weapon === row.getAttribute('data-weapon'))!;
      const cells = Array.from(row.querySelectorAll('td')).map((c) => c.textContent);
      expect(cells.slice(1)).toEqual([
        r.expected.toFixed(1), r.net.toFixed(1), r.canHit ? `${r.saved.toFixed(2)} s` : '—', `${r.energy}%`, r.canHit ? gainPerFullBar(r).toFixed(1) : '—',
      ]);
    });
    // Voidwaker (BEST_SETUP's worked example): avg 54.0, gain 20.6, 1.48 s, 50%, 41.2 per 100%
    const vw = rows.find((r) => r.getAttribute('data-weapon') === 'voidwaker')!;
    expect(Array.from(vw.querySelectorAll('td')).map((c) => c.textContent).slice(1)).toEqual(['54.0', '20.6', '1.48 s', '50%', '41.2']);
  });
});

// --- briefing: an NPC the budget gives no specs (user, FA party 4: Bork none, everything on The Smorks) --------------

describe('drain summary: a drainable NPC with no specs keeps its label', () => {
  const line = (items: DrainLineItem[], defAfter: number): DrainLine => ({
    items, defAfter, magicDefAfter: 0, text: '',
  });
  const tonal = { ...drainLineItem('tonalztics', 4, 0.9), needed: 4, landed: 8 };
  const bgs = { ...drainLineItem('bgs', 2, 0.9), needed: 2 };
  const phases = [
    {
      key: 'bork-1', label: 'Bork (armour 1)', drainLine: line([], 300), npc: 'Bork',
    },
    {
      key: 'bork-2', label: 'Bork (armour 2)', drainLine: line([], 300), npc: 'Bork',
    },
    {
      key: 'smorks', label: 'The Smorks', drainLine: line([tonal, bgs], 48), npc: 'Smorks',
    },
    {
      key: 'add', label: 'An add', drainLine: line([], 50), npc: 'Add', noDrains: 'adds: not worth a spec',
    },
  ];
  test('Bork: no specs · Smorks: … (two labelled parts; the add stays out)', () => {
    const s = encounterDrainSummary(phases, 'team')!;
    expect(s.events.map((e) => e.npc)).toEqual(['Bork', 'Smorks']);
    expect(s.events[0].text).toBe('Bork: no specs');
    expect(s.text.startsWith('Bork: no specs · Smorks: ')).toBe(true);
    const groups = encounterBrief(s);
    expect(groups.map((g) => g.label)).toEqual(['Bork', 'Smorks']);
    expect(groups[0].text).toBe('Bork: no specs');
    expect(groups[0].items).toEqual([]);
    expect(groups[1].text).toBe('Smorks: Tonalztics 8 hits + BGS 2 specs → Def 48');
  });
  test('an add with specs nobody planned and only one drainable NPC: unlabelled, as before', () => {
    const s = encounterDrainSummary(phases.filter((p) => p.npc !== 'Bork'), 'team')!;
    expect(s.events.map((e) => e.npc)).toEqual([undefined]);
    expect(encounterBrief(s).map((g) => g.label)).toEqual([undefined]);
  });
});

// --- plans: bit-identical to the phase 36 planner ----------------------------------------------------------------------

/**
 * The plans captured at HEAD 7864dacc (phase 36 fixes) before any phase 37 change: src/tests/lib/raids/phase37/*.json,
 * compared with `normalised` (src/tests/utils/phase37.ts: every field but the run statistics). The four reduced Phase27
 * plans are checked here; the headline plans (FA, ToA, CoX, ToB, FA without Obligator / Ascension crossbows: CrossRaid's
 * slow headline tests; FA Solo party 1: Phase31's) are checked where they are already planned, with a CPU-time budget
 * each, so the slow suites plan each of them once.
 */
const timed = (name: string, c: [PlanInputs, PlanTuning]) => {
  const t0 = Date.now();
  const r = plan(...c);
  const seconds = (Date.now() - t0) / 1000;
  // eslint-disable-next-line no-console
  if (process.env.PRINT_PINS) console.log(`${name}: ${seconds.toFixed(1)} s`);
  return { r, seconds };
};

// [name, drain, spec / carrier mode, slow, helper slots]: the screens, then the best `slots` rings in full (6 = every
// ring)
const parallelCases: [string, 'team' | 'solo', 'auto' | 'manual', boolean, number][] = [
  ['Team, manual carriers / specs, 3 helpers', 'team', 'manual', true, 3],
  ['Team, manual carriers / specs, 6 helpers', 'team', 'manual', false, 6],
  ['Team, carriers by the planner', 'team', 'auto', true, 3],
  ['Solo, planner decides (subset of the first screen), 6 helpers', 'solo', 'auto', true, 6],
];
describe('camp-one rings in parallel helpers (the page workers): the same plan', () => {
  // phase 38f: all four are slow now (each plans the reduced FA twice with six ring runs; 32 s the cheapest)
  slowTest.each(parallelCases)('FA reduced, %s', async (_, drain, mode, __, slots) => {
    const [inputs0, tuning] = reducedCase('fractured-archive');
    const inputs: PlanInputs = {
      ...inputs0, ringPolicy: 'camp-one', drain, specMode: mode, carrierMode: mode,
    };
    expect(parallelRingsApply(inputs)).toBe(true);
    const alone = plan(inputs, tuning);
    // the helpers' runs travel as worker JSON (encodeRingRuns keeps Infinity)
    const asked: string[] = [];
    const { ringRuns, searchRows } = await parallelRingRuns(inputs, async (which, rows) => {
      const r = planRingRun(rows ? { ...inputs, searchRows: rows } : inputs, tuning, which);
      asked.push(r!.key);
      return decodeRingRuns<RingRunResult | null>(encodeRingRuns(r));
    }, slots);
    expect(asked.filter((k) => k.includes('|screen|')).length).toBe(6);
    expect(asked.filter((k) => k.includes('|full|')).length).toBe(Math.min(6, slots));
    if (drain === 'solo') expect(asked.slice(1).every((k) => !k.includes('|screen|') || k.split('|')[2] !== '' || alone.specs.solo?.screenedWith?.length === 0)).toBe(true);
    const merged = plan({ ...inputs, searchRows }, tuning, { ringRuns: decodeRingRuns(encodeRingRuns(ringRuns)) });
    expect(normalised(merged)).toEqual(normalised(alone));
    expect(decodeRingRuns<{ x: number[] }>(encodeRingRuns({ x: [Infinity, -Infinity, 1.5] })).x).toEqual([Infinity, -Infinity, 1.5]);
  }, 600000);
});

describe('reduced plans: bit-identical to phase 36', () => {
  test.each((['fractured-archive', 'toa', 'cox', 'tob'] as RaidId[]).filter((id) => OTHER_RAIDS || id === 'fractured-archive'))('%s', (id) => {
    const name = `r27${({
      'fractured-archive': 'fa', toa: 'toa', cox: 'cox', tob: 'tob',
    } as Record<RaidId, string>)[id]}`;
    expect(existsSync(join(PHASE37_FIXTURES, `${name}.json`))).toBe(true);
    const { r } = timed(name, reducedCase(id));
    expect(normalised(r)).toEqual(phase37Fixture(name));
    // the memos work: near the recorded counters, and most encounters are reused
    expect(memoWithin(r, name)).toBe(true);
    expect(r.stats.memo!.encounterHits).toBeGreaterThan(5 * r.stats.memo!.encounterRuns);
  }, 300000);
});
