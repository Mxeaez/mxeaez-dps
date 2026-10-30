import { describe, expect, test } from '@jest/globals';
import { allocateBudget, AllocationProblem } from '@/lib/fracturedArchive/specBudget';
import {
  damageThenText, leftoverWeapon, thenWithLeftover, withLeftover,
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

// phase 38j: the filler is Crimson kisten now (the room times' regen leaves ≥ 50% after the ZCB specs)
describe.each(['fa', 'faSolo'] as HeadlineName[])('the %s headline: Crimson kisten fills after the Zaryte crossbow', (name) => {
  test('the ZCB specs per encounter are those of the plan without the filler; the filler only adds', () => {
    const fx = phase37Fixture(name) as PlanResult;
    expect(fx.specs.filler).toBe('crimsonKisten');
    const { out: withFiller, cmp: cmpWith } = countsOf(name);
    const { out: without, cmp: cmpWithout } = countsOf(name, (a) => {
      const { damageFiller, ...rest } = a;
      return { ...rest, damageSpecs: (a.damageSpecs ?? []).filter((w) => !(damageFiller ?? []).includes(w)) };
    });
    // phase 38j: the filler moves where the surge doses help most: fa without it doses Xarth (2 ZCB there: 100 + 40 + 25 +
    // 2.5 = 167.5 ≥ 150) instead of Ocellus; compare the encounters whose dose is the same in both plans
    const dosesWith = new Set(cmpWith.routes[0].surgeDoses ?? []);
    const dosesWithout = new Set(cmpWithout.routes[0].surgeDoses ?? []);
    expect([...dosesWithout]).toEqual(name === 'fa' ? ['archive-guardian', 'xarth'] : [...dosesWith]);
    const same = Object.keys(withFiller).filter((id) => dosesWith.has(id) === dosesWithout.has(id));
    expect(same.length).toBe(name === 'fa' ? 3 : 5);
    same.forEach((id) => expect([id, withFiller[id].zcb ?? 0]).toEqual([id, without[id].zcb ?? 0]));
    const kisten = Object.values(withFiller).reduce((t, n) => t + (n.crimsonKisten ?? 0), 0);
    expect(kisten).toBe(name === 'fa' ? 2 : 1);
  }, 120000);

  test('Xarth by hand (phase 38j: regen over the room time)', () => {
    const { cmp } = countsOf(name);
    const x = cmp.routes[0].encounters.find((e) => e.id === 'xarth')!;
    const sp = x.specPlan!;
    expect(sp.start.me).toEqual([100]);
    // fa (Team, the carriers pay the drains; Ultor ring): Xarth's room 141 s (personal best, 6 players) = 4 regen ticks
    // (40) + Death Charge 2.5 (15% ÷ party 6) − ZCB 75 = 67.5 left ≥ 50: kisten, 17.5% at the end. faSolo (your bar pays
    // Tonalztics 50%; Lightbearer: a tick per 15 s; a surge dose here): room 252 × 1.819193 = 458.4 s (global best ×
    // the user's pace) = 30 ticks (300) + 25 + Death Charge 15 − 50 = 390: 5 ZCB (375), 15% left < 50: no kisten
    expect(Object.values(sp.damage ?? {})).toEqual([name === 'fa' ? { zcb: 1, crimsonKisten: 1 } : { zcb: 5 }]);
    expect(sp.events.map((e) => e.counts)).toEqual(name === 'fa' ? [{ elderMaul: 2, tonalztics: 1 }] : [{ tonalztics: 1 }]);
    expect(sp.end.me[0]).toBeCloseTo(name === 'fa' ? 100 + 40 + 2.5 - 75 - 50 : 100 + 300 + 25 + 15 - 50 - 5 * 75, 6);
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
    expect(fx.specs.then!.xarth).toBe('Then: 1. Zaryte crossbow (per bar) · leftover: Crimson kisten');
    expect(damageThenText(monster, ta, row.dps)).toBe(fx.specs.then!.xarth);
  }, 120000);
});
