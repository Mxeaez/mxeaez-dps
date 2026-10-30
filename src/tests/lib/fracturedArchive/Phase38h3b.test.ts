import { describe, expect, test } from '@jest/globals';
import { allocateBudget, AllocationProblem } from '@/lib/fracturedArchive/specBudget';
import {
  leftoverWeapon, thenWithLeftover, withLeftover,
} from '@/lib/fracturedArchive/bringRule';
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
    // ZCB first (75%): the best of the cheaper ones (kisten 50% at 60 > claws 35% at 50) fills; it is the second, so
    // "1. A (per bar) · leftover: B"
    const g = { zcb: 80, crimsonKisten: 60, burningClaws: 50 };
    expect(leftoverWeapon({ gains: g }, ['zcb', 'crimsonKisten', 'burningClaws'])).toBe('crimsonKisten');
    expect(thenWithLeftover({ gains: g }, ['zcb', 'crimsonKisten', 'burningClaws'])).toBe('Then: 1. Zaryte crossbow (per bar) · leftover: Crimson kisten');
    // Voidwaker first (50%): ZCB (75%) can't fill, kisten 50% neither (not cheaper); Burning claws (35%) does
    const v = {
      voidwaker: 90, zcb: 80, crimsonKisten: 60, burningClaws: 40,
    };
    expect(thenWithLeftover({ gains: v }, ['voidwaker', 'zcb', 'crimsonKisten', 'burningClaws'])).toBe('Then: 1. Voidwaker 2. Zaryte crossbow (per bar) · leftover: Burning claws');
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

describe.each(['fa', 'faSolo'] as HeadlineName[])('the %s headline: Burning claws fills after the Zaryte crossbow', (name) => {
  test('the ZCB specs per encounter are those of the plan without the filler; claws only add', () => {
    const fx = phase37Fixture(name) as PlanResult;
    expect(fx.specs.filler).toBe('burningClaws');
    const { out: withFiller } = countsOf(name);
    const { out: without } = countsOf(name, (a) => {
      const { damageFiller, ...rest } = a;
      return { ...rest, damageSpecs: (a.damageSpecs ?? []).filter((w) => !(damageFiller ?? []).includes(w)) };
    });
    Object.keys(withFiller).forEach((id) => expect([id, withFiller[id].zcb ?? 0]).toEqual([id, without[id].zcb ?? 0]));
    const claws = Object.values(withFiller).reduce((t, n) => t + (n.burningClaws ?? 0), 0);
    expect(claws).toBe(name === 'fa' ? 4 : 3);
  }, 120000);

  test('Xarth by hand: the energy left after the ZCB spec covers one Burning claws spec (35%)', () => {
    const { cmp } = countsOf(name);
    const x = cmp.routes[0].encounters.find((e) => e.id === 'xarth')!;
    const sp = x.specPlan!;
    expect(sp.start.me).toEqual([100]);
    expect(Object.values(sp.damage ?? {})).toEqual([{ zcb: 1, burningClaws: 1 }]);
    // fa (Team, the carriers pay the drains): 100 + 1 regen tick (10) + Death Charge 2.5 (15% ÷ party 6) − ZCB 75 =
    // 37.5 left ≥ 35: claws, 2.5% at the end. faSolo (your bar pays Tonalztics 50%): 100 + 6 ticks (60, 181.6 s) +
    // Death Charge 15 − 50 − 75 = 50 left ≥ 35: claws, 15% at the end
    expect(sp.events.map((e) => e.counts)).toEqual(name === 'fa' ? [{ elderMaul: 2, tonalztics: 1 }] : [{ tonalztics: 1 }]);
    expect(sp.end.me[0]).toBeCloseTo(name === 'fa' ? 100 + 10 + 2.5 - 75 - 35 : 100 + 60 + 15 - 50 - 75 - 35, 6);
  }, 120000);
});
