import { describe, expect, test } from '@jest/globals';
import { buildTargetMonster, DrainStateId, findTarget } from '@/lib/fracturedArchive/bestSetup';
import {
  BRING_SECOND_FACTOR, bringRule, damageSpecRow, kitHpCostOf, mergeGains, PhaseSpecGains, profileGain, rankedAt,
  routeSpecGains, thenText,
} from '@/lib/fracturedArchive/bringRule';
import {
  bestDamageVariant, DAMAGE_SPEC_WEAPON_IDS, DAMAGE_SPEC_WEAPONS, damageSpecProfile, DamageSpecWeapon,
} from '@/lib/fracturedArchive/damageSpecs';
import { DEFAULT_SPEC_MODE, plan, PlanResult } from '@/lib/fracturedArchive/planner';
import { pickCarriersByHp } from '@/lib/fracturedArchive/specChoice';
import { createKitEvaluator } from '@/lib/fracturedArchive/raidTime';
import { assumptionsForTarget } from '@/lib/raids/toa/supplies';
import { finalAssumptions, kitLoadouts, retimeHeadline } from '@/tests/utils/probes';
import { headline, HeadlineName } from '@/tests/utils/headlines';
import { phase37Fixture } from '@/tests/utils/phase37';
import { planInputsFor, planTuningFor } from '@/tests/utils/crossRaid';
import { raidConfig } from '@/lib/raids';
import { slowTest } from '@/tests/utils/slow';

// Phase 38h-3: the bring rule (the damage spec ranked first, in HP per full bar, on the most bosses / phases; a second
// only where the first can't hit or another deals ≥ 1.2× per bar), no seconds in spec choices (Solo drain weapons =
// those the plan with every owned one specs; Team "you carry vs you spec" by the HP the bars pay), and the per-boss
// "Then: 1. … (per bar)". Docs: docs/BEST_SETUP.md *Bring rule, no seconds in spec choices (phase 38h-3, FA)*.

const P = (key: string, gains: PhaseSpecGains['gains']): PhaseSpecGains => ({ key, label: key, gains });
const ALL: DamageSpecWeapon[] = ['voidwaker', 'dragonClaws', 'burningClaws', 'zcb', 'crimsonKisten'];

describe('bring rule (toys, by hand)', () => {
  test('first = ranked first on the most phases; second where the first can\'t hit or another deals ≥ 1.2× per bar', () => {
    // P1 zcb 100 > vw 90; P2 vw 100 ≥ 1.2 × zcb 80 = 96; P3 zcb can't hit, burning claws 50; P4 kisten 70 < 1.2 × 60 = 72
    // (no second there, but kisten is first on P4); P5 zcb only. First votes: zcb P1 P5 (2), vw P2, burning claws P3,
    // kisten P4 (1 each) → zcb. Second votes: P2 vw, P3 burning claws (1 each); Σ HP per bar over every phase: vw 90 +
    // 100 = 190, burning claws 50 → Voidwaker
    const phases = [
      P('P1', { zcb: 100, voidwaker: 90 }),
      P('P2', { zcb: 80, voidwaker: 100 }),
      P('P3', { zcb: 0, burningClaws: 50 }),
      P('P4', { zcb: 60, crimsonKisten: 70 }),
      P('P5', { zcb: 100 }),
    ];
    const d = bringRule(phases, ALL);
    expect(d.first).toBe('zcb');
    expect(d.firstOn).toEqual(['P1', 'P5']);
    expect(d.second).toBe('voidwaker');
    expect(d.secondOn).toEqual(['P2']);
    expect(d.bring).toEqual(['zcb', 'voidwaker']);
  });

  test('exactly 1.2× brings a second; just under does not; a weapon not owned never counts', () => {
    expect(BRING_SECOND_FACTOR).toBe(1.2);
    expect(bringRule([P('a', { zcb: 50, voidwaker: 60 }), P('b', { zcb: 50 })], ALL).bring).toEqual(['zcb', 'voidwaker']);
    expect(bringRule([P('a', { zcb: 50, voidwaker: 59.9 }), P('b', { zcb: 50 })], ALL).bring).toEqual(['zcb']);
    // Voidwaker first on a, but not owned: zcb first on both
    expect(bringRule([P('a', { zcb: 50, voidwaker: 99 }), P('b', { zcb: 50 })], ['zcb', 'burningClaws']).bring).toEqual(['zcb']);
  });

  test('ties: Σ HP per bar over every phase, then the weapon order; nothing gains → nothing brought', () => {
    // one vote each; Σ: zcb 40 + 10 = 50, vw 30 + 0 = 30 → zcb; the second is Voidwaker (zcb 10 → vw 30 ≥ 12 on b)
    expect(bringRule([P('a', { zcb: 40 }), P('b', { zcb: 10, voidwaker: 30 })], ALL).bring).toEqual(['zcb', 'voidwaker']);
    // equal Σ: the weapon order (Voidwaker before Zaryte crossbow)
    expect(bringRule([P('a', { zcb: 40 }), P('b', { voidwaker: 40 })], ALL).first).toBe('voidwaker');
    expect(bringRule([P('a', { zcb: 0, voidwaker: -5 })], ALL)).toMatchObject({ first: null, second: null, bring: [] });
  });

  test('rankedAt, mergeGains, thenText', () => {
    expect(rankedAt(P('x', { zcb: 40, voidwaker: 55, burningClaws: 0 }), ALL)).toEqual(['voidwaker', 'zcb']);
    // rows of 100 and 300 damage: (100 × 10 + 300 × 20) ÷ 400 = 17.5
    expect(mergeGains('k', 'k', [{ damage: 100, gains: { zcb: 10 } }, { damage: 300, gains: { zcb: 20 } }]).gains.zcb).toBeCloseTo(17.5, 12);
    expect(thenText({ gains: { zcb: 40, voidwaker: 55, burningClaws: 3 } }, ALL)).toBe('Then: 1. Voidwaker 2. Zaryte crossbow (per bar)');
    expect(thenText({ gains: { zcb: 40, voidwaker: 55 } }, ['zcb'])).toBe('Then: 1. Zaryte crossbow (per bar)');
    expect(thenText({ gains: { zcb: 0 } }, ALL)).toBeNull();
  });

  test('profileGain: (E − DPS × ticks × 0.6) ÷ energy × 100, at most the hp left', () => {
    const variants = [{
      label: 'v', expected: 50, ticks: 5, maxHit: 99, accuracy: 1,
    }];
    const p = {
      weapon: 'zcb' as const, label: 'Zaryte crossbow', energy: 75, canHit: true, variants,
    };
    // 50 − 10 × 5 × 0.6 = 20 → 20 ÷ 75 × 100 = 26.67
    expect(profileGain(p, 10)).toBeCloseTo(2000 / 75, 9);
    // hp left 30: 30 − 30 = 0
    expect(profileGain(p, 10, 30)).toBe(0);
    expect(profileGain({ ...p, canHit: false }, 10)).toBe(0);
  });
});

describe('kitHpCostOf: the HP a kit change costs (review fix 1, by hand)', () => {
  test('1000 damage at DPS 10 → 9.5 costs 50 HP; a fixed-length row with carry-over 0.4, 20 HP; a faster row is negative', () => {
    // 1000 × (1 − 9.5 ÷ 10) = 50
    expect(kitHpCostOf([{ key: 'a', damage: 1000, dps: 10 }], [{ key: 'a', dps: 9.5 }])).toBeCloseTo(50, 9);
    // the same drop on Ocellus P2 (fixed length): 50 × 0.4 = 20
    expect(kitHpCostOf([{
      key: 'p2', damage: 1000, dps: 10, fixedWall: true, carryOver: 0.4,
    }], [{ key: 'p2', dps: 9.5 }])).toBeCloseTo(20, 9);
    // 10 → 11: 1000 × (1 − 1.1) = −100; summed with the first row: 50 − 100 = −50
    expect(kitHpCostOf([{ key: 'b', damage: 1000, dps: 10 }], [{ key: 'b', dps: 11 }])).toBeCloseTo(-100, 9);
    expect(kitHpCostOf([{ key: 'a', damage: 1000, dps: 10 }, { key: 'b', damage: 1000, dps: 10 }], [{ key: 'a', dps: 9.5 }, { key: 'b', dps: 11 }])).toBeCloseTo(-50, 9);
    // a row missing from the new pass, or with no DPS in the old, counts 0
    expect(kitHpCostOf([{ key: 'a', damage: 1000, dps: 10 }, { key: 'c', damage: 500, dps: 0 }], [{ key: 'c', dps: 5 }])).toBe(0);
  });
});

/** The planned route of a headline, re-timed outside the planner, and its kit evaluator. */
const routeOf = (name: HeadlineName) => {
  const fx = phase37Fixture(name) as PlanResult;
  const a = finalAssumptions(name, fx);
  const r = retimeHeadline(name);
  const route = r.comparison.routes.find((x) => x.route.id === headline(name).route)!;
  return {
    fx, a, route, kit: createKitEvaluator(kitLoadouts(fx.kit, a), a),
  };
};

/**
 * Independent HP per bar: per row damage specs can apply to, the monster at the row's drain event (buildTargetMonster
 * with the event's counts), upstream's spec profile, the best variant at the row's DPS: (E − DPS × ticks × 0.6) ÷ cost × 100.
 */
const independentGains = (name: HeadlineName, drain: DrainStateId) => {
  const { a, route } = routeOf(name);
  const out = new Map<string, { label: string, rows: { damage: number, gains: PhaseSpecGains['gains'] }[] }>();
  route.encounters.forEach((e) => e.phases.forEach((row) => {
    if (!damageSpecRow(row)) return;
    const ev = e.specPlan!.events[e.specPlan!.rowEvent[row.key]];
    const t = findTarget(row.targetKey);
    const ta = assumptionsForTarget(t, a);
    const m = buildTargetMonster(t, row.phase, drain, ta, ev.counts).monster;
    const gains: PhaseSpecGains['gains'] = {};
    DAMAGE_SPEC_WEAPON_IDS.forEach((w) => {
      const p = damageSpecProfile(m, w, ta);
      const v = bestDamageVariant(p, row.dps)!;
      gains[w] = p.canHit ? ((v.expected - row.dps * v.ticks * 0.6) / DAMAGE_SPEC_WEAPONS[w].energy) * 100 : 0;
    });
    const k = `${row.targetKey}|${row.phase ?? ''}`;
    if (!out.has(k)) out.set(k, { label: row.label, rows: [] });
    out.get(k)!.rows.push({ damage: row.damage, gains });
  }));
  return Array.from(out.entries()).map(([k, v]) => mergeGains(k, v.label, v.rows));
};

// HP per full bar of the Zaryte crossbow per FA boss / phase on the headline plans (the independent path above; 0.1 HP),
// and the best other weapon. Melee can't hit AG (Flying), Moia and Ocellus P3's Deflect Melee quadrant: ZCB alone there.
// Closest calls: Team Ocellus P3 Q1-3, Crimson kisten 59.8 vs ZCB 62.3 (0.96×); Solo Ocellus P3 Q1-3, Crimson kisten
// 59.3 vs 58.7 (1.01×: first there, but < 1.2×, so no second weapon). ZCB is first on 12 of 12 Team phases, 7 of 8 Solo.
// Phase 38j: the Solo kit now camps the Lightbearer (+ a Torva full helm switch): lower DPS on some phases, so ZCB per
// bar rises there (AG grounded 81.9 → 86.0, Ezekiel 67.1 → 71.4, Xarth 74.9 → 79.2, Ocellus P1 86.5 → 90.6, P3 Q1-3
// 58.7 → 62.8); the ranking is unchanged.
const ZCB_PER_BAR: Record<string, Record<string, [number, string | null]>> = {
  fa: {
    'ag-flying|': [90.9, null],
    'ag-grounded|': [82.0, 'crimsonKisten'],
    'bork|Smorks 100-76% HP (armour 8)': [85.9, 'crimsonKisten'],
    'bork|Smorks 75-51% HP (armour 10)': [85.6, 'voidwaker'],
    'bork|Smorks 50-26% HP (armour 12)': [85.2, 'voidwaker'],
    'bork|Smorks 25-0% HP (armour 14)': [84.8, 'voidwaker'],
    'smorks|': [85.1, 'crimsonKisten'],
    'moia|': [85.5, null],
    'xarth|': [74.9, 'crimsonKisten'],
    'ocellus-p1|At a corner': [86.5, 'crimsonKisten'],
    'ocellus-p3|Quadrants 1-3': [62.3, 'crimsonKisten'],
    'ocellus-p3|Last quadrant: Deflect Melee': [81.0, null],
  },
  faSolo: {
    'ag-flying|': [90.9, null],
    'ag-grounded|': [86.0, 'crimsonKisten'],
    'ezekiel|': [71.4, 'crimsonKisten'],
    'moia|': [85.5, null],
    'xarth|': [79.2, 'crimsonKisten'],
    'ocellus-p1|At a corner': [90.6, 'crimsonKisten'],
    'ocellus-p3|Quadrants 1-3': [62.8, 'crimsonKisten'],
    'ocellus-p3|Last quadrant: Deflect Melee': [79.1, null],
  },
};

describe.each([
  ['fa', 'team'],
  ['faSolo', 'solo'],
] as [HeadlineName, DrainStateId][])('per FA boss on the %s headline (%s): Zaryte crossbow, no second weapon', (name, drain) => {
  test('every boss / phase: ZCB per bar as pinned, no other weapon ≥ 1.2× it; ZCB first on the most; the plan brings ZCB only', () => {
    const phases = independentGains(name, drain);
    // eslint-disable-next-line no-console
    if (process.env.PRINT_PINS) console.log(name, JSON.stringify(phases.map((p) => [p.key, Math.round(p.gains.zcb! * 10) / 10, rankedAt(p, ALL.filter((w) => w !== 'zcb'))[0] ?? null, rankedAt(p, ALL)[0]])));
    // every FA boss / phase of the route that takes damage specs (Ocellus P2 is a fixed-length phase: none)
    expect(phases.map((p) => p.key)).toEqual(Object.keys(ZCB_PER_BAR[name]));
    let firsts = 0;
    phases.forEach((p) => {
      const [zcb, other] = ZCB_PER_BAR[name][p.key];
      expect([p.key, Math.round(p.gains.zcb! * 10) / 10]).toEqual([p.key, zcb]);
      const others = rankedAt(p, ALL.filter((w) => w !== 'zcb'));
      expect([p.key, others[0] ?? null]).toEqual([p.key, other]);
      const best = others[0] ? p.gains[others[0]]! : 0;
      expect(best).toBeLessThan(BRING_SECOND_FACTOR * p.gains.zcb!);
      if (rankedAt(p, ALL)[0] === 'zcb') firsts += 1;
    });
    expect(firsts).toBe(name === 'fa' ? 12 : 7);
    expect(bringRule(phases, ALL).bring).toEqual(['zcb']);
    const { fx } = routeOf(name);
    // phase 38h-3b: a filler comes along (leftover energy), outside the bring rule; phase 38j: Crimson kisten (50%), not
    // Burning claws (35%): the room times' regen leaves ≥ 50% after the ZCB specs on Xarth / Ocellus P3
    expect(fx.specs.damage).toEqual(['zcb', 'crimsonKisten']);
    expect(fx.specs.filler).toBe('crimsonKisten');
    expect(fx.specs.bringRule).toMatchObject({ first: 'zcb', second: null, bring: ['zcb'] });
    // the plan's stored decision is the rule on its own stored gains
    expect(bringRule(fx.specs.bringRule!.gains, ALL)).toEqual(fx.specs.bringRule);
  }, 120000);

  test('routeSpecGains (the planner\'s path, kit.specDamage) = the independent HP per bar on the final plan', () => {
    const { route, kit } = routeOf(name);
    const viaKit = routeSpecGains(kit, route.encounters, ALL, { drain, fightSeconds: 0 }).phases;
    const ind = independentGains(name, drain);
    expect(viaKit.map((p) => p.key)).toEqual(ind.map((p) => p.key));
    viaKit.forEach((p, i) => ALL.forEach((w) => expect([p.key, w, p.gains[w]! - ind[i].gains[w]!]).toEqual([p.key, w, expect.closeTo(0, 6)])));
  }, 120000);

  test('the briefing: "Then: 1. Zaryte crossbow (per bar)" on every encounter of the route (38h-3b: + the filler where specced)', () => {
    const { fx } = routeOf(name);
    expect(Object.keys(fx.specs.then ?? {})).toEqual(Object.keys(headline(name).encounters));
    // phase 38h-3b: "· leftover: <filler>" on the encounters where the plan makes a filler spec (phase 38j: Crimson kisten
    // on Xarth and Ocellus P3 (fa), Ocellus P3 (faSolo))
    const fills = name === 'fa' ? ['xarth', 'ocellus'] : ['ocellus'];
    Object.entries(fx.specs.then ?? {}).forEach(([id, t]) => expect([id, t]).toEqual([id,
      `Then: 1. Zaryte crossbow (per bar)${fills.includes(id) ? ' · leftover: Crimson kisten' : ''}`]));
  }, 120000);
});

describe('no seconds in the spec choices (the headline plans)', () => {
  // phase 38j (room times: more energy): Elder maul 2 → 5 in the reference plan, 1 → 2 in the final one
  test('Solo: brought ⇔ the plan with every owned one specs it (Elder maul 5, Tonalztics 10); the final plan makes 2 / 7', () => {
    const fx = phase37Fixture('faSolo') as PlanResult;
    // review fix 3: `specs` = the final plan's route (the damage specs and the surge dose take energy), `refSpecs` = the
    // reference plan that chose them; free slots there, so no slot check
    expect(fx.specs.solo!.perWeapon).toEqual([
      {
        weapon: 'elderMaul', chosen: true, specs: 2, refSpecs: 5,
      },
      {
        weapon: 'dwh', chosen: false, specs: 0, refSpecs: 0,
      },
      {
        weapon: 'bgs', chosen: false, specs: 0, refSpecs: 0,
      },
      {
        weapon: 'tonalztics', chosen: true, specs: 7, refSpecs: 10,
      },
      {
        weapon: 'ayak', chosen: false, specs: 0, refSpecs: 0,
      },
    ]);
    expect(fx.specs.bring).toEqual(['elderMaul', 'tonalztics']);
    // the spec items are valued in HP, not seconds
    (fx.specs.items ?? []).forEach((s) => {
      expect(typeof s.hp).toBe('number');
      expect(s).not.toHaveProperty('saved');
    });
  });

  test('Team: you spec (ZCB, 5 carriers) because the bars pay more HP than with you carrying (pickCarriersByHp)', () => {
    ['fa', 'faNotOwned'].forEach((name) => {
      const fx = phase37Fixture(name as HeadlineName) as PlanResult;
      const note = fx.specs.notes.find((n) => n.startsWith('Your spec bar goes to'))!;
      const [, spec, carry] = /the bars pay (\d+) HP on the route vs (\d+) HP if you carry/.exec(note)!.map(Number);
      // party 6: you spec = 5 carriers (leaves you out), you carry = 6
      const pick = pickCarriersByHp([{ hp: carry, total: 6, k: 'carry' }, { hp: spec, total: 5, k: 'spec' }], 6);
      expect(pick!.k).toBe('spec');
      expect(Object.values(fx.specs.team!.carriers!).reduce((t, v) => t + v, 0)).toBe(5);
    });
  });
});

describe('Solo drain weapons against a kit slot (review fix 2)', () => {
  // a reduced Solo plan with an inventory full of supplies: a drain weapon needs a slot from the kit, so it is kept only
  // when the HP it adds on the route is at least the HP the kit change costs (kitHpCostOf, both kits without it)
  slowTest('every slot-checked weapon: kept ⇔ adds ≥ costs; one left at home says so in the notes', () => {
    const fa = raidConfig('fractured-archive');
    const base = planInputsFor(fa, true);
    const r = plan({
      ...base,
      drain: 'solo',
      specMode: DEFAULT_SPEC_MODE,
      assumptions: { ...fa.defaultAssumptions, partySize: 1 },
      nonItemSlots: 12,
    }, planTuningFor(fa, true));
    const checked = r.specs.solo!.perWeapon.filter((d) => d.slot);
    expect(checked.length).toBeGreaterThan(0);
    checked.forEach((d) => {
      expect([d.weapon, d.chosen]).toEqual([d.weapon, d.slot!.adds >= d.slot!.costs - 1e-9]);
      if (!d.chosen) expect(r.specs.notes.some((n) => n.includes('no free slot') && n.includes(`${d.slot!.adds.toFixed(0)} HP`))).toBe(true);
    });
    // as measured (0.1 HP): Elder maul adds 0 HP (Tonalztics / Eye of Ayak cover its drains) vs 148.9: left at home;
    // Tonalztics 1045.0 vs 194.0 and Eye of Ayak 420.4 vs 339.8: kept. Phase 38j (the room times' regen): Tonalztics adds
    // 1061.4, Eye of Ayak 436.8
    const hp = Object.fromEntries(checked.map((d) => [d.weapon, [Math.round(d.slot!.adds * 10) / 10, Math.round(d.slot!.costs * 10) / 10]]));
    expect(hp).toEqual({ elderMaul: [0, 148.9], tonalztics: [1061.4, 194], ayak: [436.8, 339.8] });
    expect(r.specs.bring).toEqual(['tonalztics', 'ayak']);
  }, 900000);
});
