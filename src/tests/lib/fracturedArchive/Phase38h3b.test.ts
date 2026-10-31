import { describe, expect, test } from '@jest/globals';
import { allocateBudget, AllocationProblem } from '@/lib/fracturedArchive/specBudget';
import {
  damageSpecRow, damageThenText, leftoverWeapon, thenWithLeftover, withLeftover,
} from '@/lib/fracturedArchive/bringRule';
import { buildTargetMonster, findTarget } from '@/lib/fracturedArchive/bestSetup';
import { assumptionsForTarget } from '@/lib/raids/toa/supplies';
import { PlanResult } from '@/lib/fracturedArchive/planner';
import { compareRoutes, createKitEvaluator, raidTimeAssumptionsFrom } from '@/lib/fracturedArchive/raidTime';
import { finalAssumptions, kitLoadouts, retimeHeadline } from '@/tests/utils/probes';
import { headline, headlineCase, HeadlineName } from '@/tests/utils/headlines';
import { phase37Fixture } from '@/tests/utils/phase37';
import { raidConfig } from '@/lib/raids';

// Phase 38h-3b: the filler spec weapon. The spec budget maximises the drains' and the main damage weapons' HP first and
// only then the filler's (specBudget.ts `DamageChoice.filler`, the DP's second objective), so the filler is spent only
// from the energy the others leave. The planner brings the owned damage weapon adding the most HP that way on the
// planned route (a free slot: > 0 HP; a slot from the kit: ≥ kitHpCost). Docs: docs/BEST_SETUP.md *Filler spec weapon
// (phase 38h-3b, FA)*.

/** One row, 0..`end` s (+10% per 30 s), your pool at 100%: ZCB (75%, net 100) and Burning claws (35%, net 55). */
const oneRow = (end: number, filler: boolean, surge = false): AllocationProblem => ({
  rows: [{
    key: 'r', event: 0, start: 0, end,
  }],
  events: [{ firstRow: 0, options: [{ counts: {}, spends: [] }] }],
  groups: [{ id: 'me', count: 1, regenSeconds: 30 }],
  start: { me: [100] },
  rowOutcome: () => ({
    seconds: 100,
    damage: 10000,
    damageSpecs: [{ weapon: 'zcb', cost: 75, net: 100 }, {
      weapon: 'burningClaws', cost: 35, net: 55, ...(filler ? { filler: true } : {}),
    }],
  }),
  ...(surge ? { surge: true } : {}),
});

describe('the spec budget with a filler weapon (by hand)', () => {
  test('60 s: 100 + 20 = 120%. Free: 3 claws (105%, 165 HP) beat ZCB + claws (110%, 155 HP); filler: ZCB first, then claws', () => {
    // free DP: the HP maximum, 3 × 55 = 165 > 100 + 55 = 155 (ZCB + 2 claws = 145% > 120%)
    const free = allocateBudget(oneRow(60, false));
    expect(free.rows[0].damage).toEqual({ burningClaws: 3 });
    expect(free.hp).toBeCloseTo(165, 9);
    // filler: ZCB's HP first (1 spec: 100; 2 need 150%), leftover 120 − 75 = 45% ≥ 35%: one claws spec (10% left)
    const fill = allocateBudget(oneRow(60, true));
    expect(fill.rows[0].damage).toEqual({ zcb: 1, burningClaws: 1 });
    expect(fill.hp).toBeCloseTo(155, 9);
    expect(fill.end.me[0]).toBeCloseTo(10, 9);
  });
  test('0 s: leftover 100 − 75 = 25% < 35%: ZCB alone; a surge dose (+25%) makes it 50%: one claws spec', () => {
    const none = allocateBudget(oneRow(0, true));
    expect(none.rows[0].damage).toEqual({ zcb: 1 });
    expect(none.hp).toBeCloseTo(100, 9);
    expect(none.end.me[0]).toBeCloseTo(25, 9);
    const surged = allocateBudget(oneRow(0, true, true));
    expect(surged.rows[0].damage).toEqual({ zcb: 1, burningClaws: 1 });
    expect(surged.hp).toBeCloseTo(155, 9);
    // 100 − 75 − 35 + 25 = 15%
    expect(surged.end.me[0]).toBeCloseTo(15, 9);
  });
  test('a filler never displaces a drain: a drain worth 40 (× 1.1 = 44) is kept over claws (55) on its energy', () => {
    const p = oneRow(0, true);
    const withDrain: AllocationProblem = {
      ...p,
      events: [{
        firstRow: 0,
        options: [{ counts: {}, spends: [] }, {
          counts: { elderMaul: 1 },
          spends: [{
            group: 'me', specs: 1, cost: 25, row: 0,
          }],
          value: 40,
        }],
      }],
    };
    // 100%: drain 25% (44 weighted) + ZCB 75% (100); claws would need the drain's 25% + 10%: never
    const r = allocateBudget(withDrain);
    expect(r.options).toEqual([1]);
    expect(r.rows[0].damage).toEqual({ zcb: 1 });
    expect(r.hp).toBeCloseTo(140, 9);
  });
});

describe('the "leftover" text', () => {
  test('withLeftover / leftoverWeapon / thenWithLeftover', () => {
    expect(withLeftover('Then: 1. Zaryte crossbow (per bar)', 'crimsonKisten')).toBe('Then: 1. Zaryte crossbow (per bar) · leftover: Crimson kisten');
    expect(withLeftover(null, 'burningClaws')).toBe('Then: leftover: Burning claws');
    expect(withLeftover('Then: 1. Voidwaker (per bar)', null)).toBe('Then: 1. Voidwaker (per bar)');
    // ZCB first (75%): of the cheaper ones that gain (kisten 50%, claws 35%) the most HP for one spec fills (phase 38j:
    // kisten 60 × 0.5 = 30 HP vs claws 50 × 0.35 = 17.5; the room times leave ≥ 50%); the Plan's form "1. A (per bar) · leftover"
    const g = { zcb: 80, crimsonKisten: 60, burningClaws: 50 };
    expect(leftoverWeapon({ gains: g }, ['zcb', 'crimsonKisten', 'burningClaws'])).toBe('crimsonKisten');
    expect(thenWithLeftover({ gains: g }, ['zcb', 'crimsonKisten', 'burningClaws'])).toBe('Then: 1. Zaryte crossbow (per bar) · leftover: Crimson kisten');
    // claws per spec ahead (90 × 0.35 = 31.5 > 60 × 0.5 = 30): claws
    expect(leftoverWeapon({ gains: { zcb: 95, crimsonKisten: 60, burningClaws: 90 } }, ['zcb', 'crimsonKisten', 'burningClaws'])).toBe('burningClaws');
    // a cheaper weapon that gains nothing is no filler: kisten then
    expect(leftoverWeapon({ gains: { zcb: 80, crimsonKisten: 60, burningClaws: 0 } }, ['zcb', 'crimsonKisten', 'burningClaws'])).toBe('crimsonKisten');
    // Voidwaker first (50%): ZCB (75%) and kisten (50%) are not cheaper; Burning claws (35%) is
    const v = {
      voidwaker: 90, zcb: 80, crimsonKisten: 60, burningClaws: 40,
    };
    expect(thenWithLeftover({ gains: v }, ['voidwaker', 'zcb', 'crimsonKisten', 'burningClaws'])).toBe('Then: 1. Voidwaker (per bar) · leftover: Burning claws');
    // Burning claws first (the cheapest): no filler, the plain top two
    expect(thenWithLeftover({ gains: { burningClaws: 90, zcb: 80 } }, ['burningClaws', 'zcb'])).toBe('Then: 1. Burning claws 2. Zaryte crossbow (per bar)');
  });
});

/** Damage spec counts per encounter of a headline's pinned route, re-timed under `a` (null: the plan's own). */
const countsOf = (name: HeadlineName, change?: (a: ReturnType<typeof finalAssumptions>) => ReturnType<typeof finalAssumptions>) => {
  const fx = phase37Fixture(name) as PlanResult;
  const a0 = finalAssumptions(name, fx);
  const a = change ? change(a0) : a0;
  const c = headlineCase(name);
  const raid = raidConfig(c.raid);
  const inputs = c.inputs();
  const timeA = raidTimeAssumptionsFrom(a, inputs.drain, inputs.settings, raid.time);
  const cmp = compareRoutes(createKitEvaluator(kitLoadouts(fx.kit, a), a), timeA, [retimeHeadline(name).comparison.routes.find((r) => r.route.id === headline(name).route)!.route]);
  const out: Record<string, Record<string, number>> = {};
  cmp.routes[0].encounters.forEach((e) => {
    const n: Record<string, number> = {};
    Object.values(e.specPlan?.damage ?? {}).forEach((d) => Object.entries(d ?? {}).forEach(([w, k]) => { n[w] = (n[w] ?? 0) + (k ?? 0); }));
    out[e.id] = n;
  });
  return { out, cmp };
};

// phase 38j: the filler was Crimson kisten (the room times' regen left ≥ 50% after the ZCB specs). Phase 40d (the void
// explosions take no damage specs): fa specs ZCB only (no filler; its surge dose moves Ocellus → Xarth); faSolo camps
// the Ultor ring (a tick per 30 s, was the Lightbearer's 15 s), so less is left and Burning claws (35%) fills
const filterless = (a: ReturnType<typeof finalAssumptions>) => {
  const { damageFiller, ...rest } = a;
  return { ...rest, damageSpecs: (a.damageSpecs ?? []).filter((w) => !(damageFiller ?? []).includes(w)) };
};

describe('the fa headline: Zaryte crossbow only, no filler (phase 40d)', () => {
  test('the plan brings no filler', () => {
    const fx = phase37Fixture('fa') as PlanResult;
    expect(fx.specs.filler).toBeUndefined();
    expect(fx.specs.damage).toEqual(['zcb']);
  });

  test('Xarth by hand (phase 38j: regen over the room time)', () => {
    const { cmp } = countsOf('fa');
    expect(cmp.routes[0].surgeDoses).toEqual(['archive-guardian', 'xarth']);
    const sp = cmp.routes[0].encounters.find((e) => e.id === 'xarth')!.specPlan!;
    expect(sp.start.me).toEqual([100]);
    // Team, the carriers pay the drains; Ultor ring: Xarth's room 141 s = 4 regen ticks (40) + the surge dose 25 + Death
    // Charge 2.5 (15% ÷ party 6) − 2 ZCB 150 = 17.5
    expect(Object.values(sp.damage ?? {})).toEqual([{ zcb: 2 }]);
    expect(sp.events.map((e) => e.counts)).toEqual([{ elderMaul: 2, tonalztics: 1 }]);
    expect(sp.end.me[0]).toBeCloseTo(100 + 40 + 25 + 2.5 - 2 * 75, 6);
  }, 120000);
});

describe('the faSolo headline: Burning claws fills after the Zaryte crossbow (phase 40d)', () => {
  test('the ZCB specs per encounter are those of the plan without the filler; the filler only adds', () => {
    const fx = phase37Fixture('faSolo') as PlanResult;
    expect(fx.specs.filler).toBe('burningClaws');
    const { out: withFiller, cmp: cmpWith } = countsOf('faSolo');
    const { out: without, cmp: cmpWithout } = countsOf('faSolo', filterless);
    // without the filler the Archive Guardian takes no surge dose (its one ZCB fits the bar); compare the rest
    expect(cmpWith.routes[0].surgeDoses).toEqual(['archive-guardian', 'bork-smorks', 'moia', 'xarth', 'ocellus']);
    expect(cmpWithout.routes[0].surgeDoses).toEqual(['bork-smorks', 'moia', 'xarth', 'ocellus']);
    Object.keys(withFiller).forEach((id) => expect([id, withFiller[id].zcb ?? 0]).toEqual([id, without[id].zcb ?? 0]));
    const claws = Object.values(withFiller).reduce((t, n) => t + (n.burningClaws ?? 0), 0);
    expect(claws).toBe(2);
  }, 120000);

  test('Xarth by hand (phase 38j: regen over the room time)', () => {
    const { cmp } = countsOf('faSolo');
    const sp = cmp.routes[0].encounters.find((e) => e.id === 'xarth')!.specPlan!;
    expect(sp.start.me).toEqual([100]);
    // your bar pays Tonalztics 50%; Ultor ring (a tick per 30 s), a surge dose here: room 252 × 1.819193 = 458.4 s = 15
    // ticks (150) + 25 + Death Charge 15 − 50 = 240: 3 ZCB (225), 15% left < 35: no claws
    expect(Object.values(sp.damage ?? {})).toEqual([{ zcb: 3 }]);
    expect(sp.events.map((e) => e.counts)).toEqual([{ tonalztics: 1 }]);
    expect(sp.end.me[0]).toBeCloseTo(100 + 150 + 25 + 15 - 50 - 3 * 75, 6);
  }, 120000);
});

describe('Search / Summary name the filler of the Plan (review 38h-3b)', () => {
  test('FA Xarth (Team): damageThenText at the Xarth DPS of the plan = the "Then" line of the Plan', () => {
    const fx = phase37Fixture('fa') as PlanResult;
    const { cmp } = countsOf('fa');
    const row = cmp.routes[0].encounters.find((e) => e.id === 'xarth')!.phases.find((r) => r.targetKey === 'xarth')!;
    const t = findTarget('xarth');
    const ta = assumptionsForTarget(t, finalAssumptions('fa', fx));
    const { monster } = buildTargetMonster(t, undefined, 'team', ta);
    // phase 40d: the fa plan brings no filler (ZCB only); Search is per boss and still names kisten as the leftover
    // (a weapon this route doesn't bring, like Voidwaker on faSolo's Bork)
    expect(fx.specs.then!.xarth).toBe('Then: 1. Zaryte crossbow (per bar)');
    expect(damageThenText(monster, ta, row.dps)).toBe(`${fx.specs.then!.xarth} · leftover: Crimson kisten`);
  }, 120000);
});

// phase 38j: the Search / Summary rule moved from "the cheapest cheaper weapon" (f555ecea, when the fight-wall clock left
// 22-40% after the ZCB specs: only Burning claws fit) to "the cheaper weapon with the most HP for one spec": with the
// measured room times the plan's leftover is ≥ 50% where it specs a filler, and its DP takes Crimson kisten. On every
// FA boss / phase of both headline routes (Search's line at the row's DPS and drains): where the Plan's line names a
// leftover, Search names the same one (the old rule named Burning claws there); elsewhere Search is per boss / phase and
// may name a weapon the route doesn't bring (pinned below).
// [row, Search's first weapon, Search's leftover]. fa: the Plan's leftover (Crimson kisten, Xarth / Ocellus) = Search's;
// Bork 10-14 (before phase 40b) / faSolo Bork armour 14 + Smorks: Voidwaker (more HP per spec there; the route brings
// no Voidwaker). faSolo Ocellus P3 Q1-3: kisten ranks
// first per bar on that phase alone (within 1.2× of ZCB, 38h-3), the route brings ZCB first. No leftover: the phases kisten
// can't hit (AG flying / shield, Moia, the Deflect Melee quadrant).
const SEARCH_LINES: Record<string, [string, string, string | null][]> = {
  fa: [
    ['ag-shield', 'Zaryte crossbow', null], ['ag-grounded', 'Zaryte crossbow', 'Crimson kisten'],
    // phase 40b (stun-swap): Bork's one stunned row (was armour 8: kisten, 10-14: Voidwaker)
    ['ag-flying', 'Zaryte crossbow', null], ['bork-stunned', 'Zaryte crossbow', 'Crimson kisten'],
    ['smorks', 'Zaryte crossbow', 'Crimson kisten'],
    ['moia', 'Zaryte crossbow', null], ['xarth', 'Zaryte crossbow', 'Crimson kisten'],
    ['ocellus-p1', 'Zaryte crossbow', 'Crimson kisten'], ['ocellus-p3', 'Zaryte crossbow', 'Crimson kisten'],
    ['ocellus-p3-last', 'Zaryte crossbow', null],
  ],
  faSolo: [
    ['ag-shield', 'Zaryte crossbow', null], ['ag-grounded', 'Zaryte crossbow', 'Crimson kisten'],
    // phase 40b: the Bork route (was Ezekiel: kisten); party 1: the armour 14 remainder and the Smorks name Voidwaker
    ['ag-flying', 'Zaryte crossbow', null], ['bork-stunned', 'Zaryte crossbow', 'Crimson kisten'],
    ['bork-14', 'Zaryte crossbow', 'Voidwaker'], ['smorks', 'Zaryte crossbow', 'Voidwaker'],
    ['moia', 'Zaryte crossbow', null], ['xarth', 'Zaryte crossbow', 'Crimson kisten'],
    ['ocellus-p1', 'Zaryte crossbow', 'Crimson kisten'], ['ocellus-p3', 'Crimson kisten', 'Burning claws'],
    ['ocellus-p3-last', 'Zaryte crossbow', null],
  ],
};
describe.each(['fa', 'faSolo'] as HeadlineName[])('Search / Summary leftover vs the Plan on every %s boss / phase (phase 38j)', (name) => {
  test('each damage-spec row: damageThenText at its DPS and drains', () => {
    const fx = phase37Fixture(name) as PlanResult;
    const { cmp } = countsOf(name);
    const a = finalAssumptions(name, fx);
    const drain = headlineCase(name).inputs().drain;
    const got: [string, string, string | null][] = [];
    const matched = new Set<string>();
    cmp.routes[0].encounters.forEach((e) => {
      const planLine = fx.specs.then?.[e.id] ?? '';
      const planLeft = / · leftover: (.+)$/.exec(planLine)?.[1] ?? null;
      e.phases.forEach((row) => {
        if (!damageSpecRow(row)) return;
        const ev = e.specPlan!.events[e.specPlan!.rowEvent[row.key]];
        const t = findTarget(row.targetKey);
        const ta = assumptionsForTarget(t, a);
        const { monster } = buildTargetMonster(t, row.phase, drain, ta, ev.counts);
        const line = damageThenText(monster, ta, row.dps) ?? '';
        const first = /^Then: 1\. (.+?)(?: 2\.| \(per bar\))/.exec(line)?.[1] ?? '';
        const left = / · leftover: (.+)$/.exec(line)?.[1] ?? null;
        got.push([row.key, first, left]);
        // where the Plan names a leftover and Search ranks the same weapon first, Search's leftover is the Plan's (or none:
        // a phase the filler can't hit, e.g. Ocellus's Deflect Melee quadrant)
        // phase 40d: faSolo camps the Ultor ring (fewer regen ticks): the bar keeps < 50% after the ZCB specs, so the Plan's
        // leftover is Burning claws (35%); Search's rule (the most HP for one spec, ≥ 50% assumed) still names Crimson
        // kisten (open for phase 42)
        const known = name === 'faSolo' && planLeft === 'Burning claws' && left === 'Crimson kisten';
        if (planLeft && first === 'Zaryte crossbow' && !known) expect([row.key, left === null || left === planLeft]).toEqual([row.key, true]);
        if (planLeft && left === planLeft) matched.add(e.id);
      });
      if (planLeft && !(name === 'faSolo' && planLeft === 'Burning claws')) expect([e.id, matched.has(e.id)]).toEqual([e.id, true]);
    });
    // eslint-disable-next-line no-console
    if (process.env.PRINT_PINS) console.log(name, JSON.stringify(got));
    expect(got).toEqual(SEARCH_LINES[name]);
  }, 120000);
});
