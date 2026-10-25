import { describe, expect, test } from '@jest/globals';
import { generateEmptyPlayer } from '@/state';
import Potion from '@/enums/Potion';
import {
  CAMP_RINGS,
  campRingItems,
  clearPlanCaches,
  COMFORT_SUPPLY_TYPES,
  comfortSupplies,
  DEFAULT_RING_POLICY,
  DEFAULT_SUPPLIES,
  inventoryGrid,
  kitPotions,
  kitSupplies,
  optimiseKit,
  plan,
  planAssumptions,
  planItemByName,
  PlanResult,
  potionSlots,
  RING_GUARD_FACTOR,
  RING_POLICIES,
  ringAssumptions,
  RingPolicy,
  SupplyCounts,
} from '@/lib/fracturedArchive/planner';
import { DEFAULT_ASSUMPTIONS } from '@/lib/fracturedArchive/presets';
import { energyBudget } from '@/lib/fracturedArchive/specs';
import {
  FRACTURED_ARCHIVE_RAID, RaidConfig, RAIDS, raidConfig, TOMBS_OF_AMASCUT_RAID,
} from '@/lib/raids';
import { withPhase32Specs } from '@/tests/utils/phase32Specs';

// Phase 27: Plan tab — potions derived from the kit (one Super combat / Ranging potion per style present, part of the
// kit's slot cost), comfort supplies entered by the user, and the ring policy (camp one ring / camp Lightbearer / allow
// ring switches). Docs: docs/BEST_SETUP.md, *Plan tab*.

const NO_SUPPLIES: SupplyCounts = {
  brew: 0, restore: 0, ranging: 0, superCombat: 0, food: 0, other: 0,
};
const SATURATED = planItemByName('Saturated heart').id;

/** The CrossRaid reduced plan (group presets + pickaxe; one search weapon per style; small pools). */
const groupPresets = (raid: RaidConfig) => (['melee', 'ranged', 'magic'] as const)
  .map((g) => raid.presets.find((p) => p.group === g)!)
  .filter(Boolean);
const reduced = (raid: RaidConfig) => ({
  model: raid.time,
  presets: [...groupPresets(raid), ...raid.presets.filter((p) => p.name.includes('pickaxe'))],
  search: { weapons: ['Scythe of Vitur', 'Tumeken\'s shadow', 'Twisted bow'], maxPasses: 1 },
  perGroupWeapons: 1,
  perWeapon: 1,
  bases: 1,
  partners: 1,
  seeds: 2,
});
/**
 * Phase 30: the default pinned lists became empty (FA / ToB keep the heart); these reduced-pool pins were measured with
 * the phase 27-29 lists, which they keep as explicit inputs (they check the planner, not the defaults).
 */
const PHASE29_PINNED: Record<RaidConfig['id'], string[]> = {
  'fractured-archive': ['Lightbearer', 'Zaryte crossbow', 'Kodai wand', 'Ancestral robe top', 'Elidinis\' ward (f)', 'Saturated heart'],
  toa: ['Lightbearer', 'Zaryte crossbow'],
  cox: ['Dragon pickaxe'],
  tob: ['Saturated heart'],
};
const runs = new Map<string, PlanResult>();
const planned = (raid: RaidConfig, ringPolicy?: RingPolicy, drain: 'team' | 'solo' = 'team'): PlanResult => {
  const key = `${raid.id}|${ringPolicy}|${drain}`;
  if (!runs.has(key)) {
    runs.set(key, plan({
      basePlayer: generateEmptyPlayer(),
      assumptions: withPhase32Specs(raid.defaultAssumptions),
      drain,
      settings: raid.defaultTimeSettings,
      route: 'all',
      pinned: PHASE29_PINNED[raid.id].map((n) => planItemByName(n).id),
      nonItemSlots: raid.planDefaults.nonItemSlots,
      supplies: raid.defaultSupplies,
      ...(ringPolicy ? { ringPolicy } : {}),
    }, reduced(raid)));
  }
  return runs.get(key)!;
};
const total = (r: PlanResult) => r.comparison!.routes[r.planned].seconds;
const rings = (r: PlanResult) => r.kit.map((c) => c.equipment.ring?.name ?? null);

describe('potions from the kit', () => {
  test('one potion per style present where the potions are brought; none in ToA / CoX', () => {
    expect(kitPotions(['melee'], true).map((p) => p.type)).toEqual(['superCombat']);
    expect(kitPotions(['ranged'], true).map((p) => p.type)).toEqual(['ranging']);
    // phase 31: magic's potion is the heart (was a pinned item)
    expect(kitPotions(['magic'], true).map((p) => p.type)).toEqual(['heart']);
    expect(kitPotions(['magic', 'ranged', 'melee', 'melee'], true).map((p) => p.type)).toEqual(['superCombat', 'ranging', 'heart']);
    expect(kitPotions(['melee', 'ranged', 'magic'], false)).toEqual([]);
    // comfort supplies: the user's counts; combat potion counts are ignored and replaced by the kit's
    expect(COMFORT_SUPPLY_TYPES).toEqual(['brew', 'restore', 'food', 'other']);
    expect(comfortSupplies({ ...DEFAULT_SUPPLIES, ranging: 3, superCombat: 2 })).toEqual({ ...DEFAULT_SUPPLIES, ranging: 0, superCombat: 0 });
    expect(kitSupplies({ ...NO_SUPPLIES, brew: 6, ranging: 4 }, ['melee', 'magic'], true)).toEqual({ ...NO_SUPPLIES, brew: 6, superCombat: 1 });
    // every raid's defaults are comfort supplies only
    RAIDS.forEach((r) => expect(r.defaultSupplies.ranging + r.defaultSupplies.superCombat).toBe(0));
  });

  test('the potion slots are part of a kit\'s slot cost: a 3-way kit pays 2, melee-only 1, magic-only 0', () => {
    expect(potionSlots(['superCombat', 'ranging', null])).toBe(2);
    expect(potionSlots(['superCombat', 'superCombat'])).toBe(1);
    expect(potionSlots([null])).toBe(0);
    // same items in every candidate, so only the potions differ: melee (0), ranged (1), magic (2)
    const problem = (allowed: boolean[]) => optimiseKit({
      items: [[1, 2], [1, 2], [1, 2]],
      carried: [],
      fixedSlots: 10,
      totalSlots: 28,
      // every extra loadout saves 10 s
      time: (m) => 100 - 10 * m.length,
      seeds: allowed.map((a, i) => (a ? i : -1)).filter((i) => i >= 0),
      allowed,
      potions: ['superCombat', 'ranging', null],
      noPrune: true,
    }).best;
    const all = problem([true, true, true]);
    const melee = problem([true, false, false]);
    const magic = problem([false, false, true]);
    expect(all.members.length).toBe(3);
    expect(all.used).toBe(10 + 2);
    expect(melee.used).toBe(10 + 1);
    expect(magic.used).toBe(10);
    expect(all.used - magic.used).toBe(2);
    // when the slots are tight, the potion decides: 11 slots fit melee + magic (1 potion), not all three
    const tight = optimiseKit({
      items: [[1, 2], [1, 2], [1, 2]],
      carried: [],
      fixedSlots: 10,
      totalSlots: 11,
      time: (m) => 100 - 10 * m.length,
      seeds: [0, 1, 2],
      potions: ['superCombat', 'ranging', null],
      noPrune: true,
    }).best;
    expect(tight.used).toBe(11);
    expect(tight.members.length).toBe(2);
  });

  test('the plan counts the kit\'s potions in its slots and shows them in the grid', () => {
    const r = planned(FRACTURED_ARCHIVE_RAID, 'switch');
    const groups = Array.from(new Set(r.kit.map((c) => c.group)));
    const pots = kitPotions(groups, true);
    expect(r.potions).toEqual(pots);
    // phase 31: the heart (magic) is an item cell ('potion'), not a supply count
    const supplyPots = pots.filter((p) => p.type !== 'heart');
    expect(r.slots!.supplies).toBe(6 + 4 + supplyPots.length);
    supplyPots.forEach((p) => expect(r.inventory.filter((c) => c.kind === 'supply' && c.supply === p.type).length).toBe(1));
    expect(r.inventory.filter((c) => c.kind === 'supply').length).toBe(10 + supplyPots.length);
    expect(r.inventory.filter((c) => c.kind === 'potion').length).toBe(pots.length - supplyPots.length);
    // ToA: the raid's potion (Other) only
    const toa = planned(TOMBS_OF_AMASCUT_RAID, 'switch');
    expect(toa.potions).toEqual([]);
    expect(toa.inventory.some((c) => c.supply === 'ranging' || c.supply === 'superCombat')).toBe(false);
  }, 300000);

  // phase 31: the heart became magic's kit potion (Phase31.test.ts); a pinned heart still counts once, as a pinned item
  test('a pinned heart: magic boosted, one cell; magic in the kit lists the heart beside the potions', () => {
    const a = planAssumptions(DEFAULT_ASSUMPTIONS, NO_SUPPLIES, [SATURATED]);
    expect(a.withoutPotion).toBeUndefined();
    expect(a.potions.magic).toBe(Potion.SATURATED_HEART);
    expect(planAssumptions(DEFAULT_ASSUMPTIONS, NO_SUPPLIES, []).withoutPotion).toBeUndefined();
    const cells = inventoryGrid([], 0, [], [planItemByName('Saturated heart')], kitSupplies(NO_SUPPLIES, ['magic'], true), 0);
    expect(cells.filter((c) => c.kind === 'pinned').map((c) => c.label)).toEqual(['Saturated heart']);
    expect(cells.filter((c) => c.kind === 'supply')).toEqual([]);
    const r = planned(FRACTURED_ARCHIVE_RAID, 'switch');
    expect(r.potions.some((p) => p.group === 'magic')).toBe(r.kit.some((c) => c.group === 'magic'));
    // pinned here (the phase 29 list): one cell either way (a 'potion' cell when the kit has magic, else 'pinned')
    expect(r.inventory.filter((c) => c.label === 'Saturated heart').length).toBe(1);
  }, 300000);
});

describe('caches (review fix)', () => {
  test('a second plan with other supplies reuses the searches and the DPS rows', () => {
    clearPlanCaches();
    const raid = FRACTURED_ARCHIVE_RAID;
    const inputs = (brew: number) => ({
      basePlayer: generateEmptyPlayer(),
      assumptions: withPhase32Specs(raid.defaultAssumptions),
      drain: 'team' as const,
      settings: raid.defaultTimeSettings,
      route: 'all',
      pinned: raid.planDefaults.pinned.map((n) => planItemByName(n).id),
      nonItemSlots: 1,
      supplies: { ...raid.defaultSupplies, brew },
      ringPolicy: 'switch' as const,
    });
    const first = plan(inputs(6), reduced(raid));
    const second = plan(inputs(7), reduced(raid));
    expect(first.stats.searches).toBeGreaterThan(0);
    expect(second.stats.searches).toBe(0);
    expect(second.stats.evaluations).toBeLessThan(first.stats.evaluations / 5);
    // same DPS as an uncached run
    clearPlanCaches();
    const fresh = plan(inputs(7), reduced(raid));
    expect(total(second)).toBe(total(fresh));
  }, 600000);
});

describe('ring policy', () => {
  test('policies and defaults', () => {
    expect(DEFAULT_RING_POLICY).toBe('camp-one');
    expect(RING_POLICIES.map((p) => p.id)).toEqual(['camp-one', 'camp-lightbearer', 'switch']);
    expect(campRingItems().map((x) => x.name)).toEqual(['Ultor ring', 'Bellator ring', 'Venator ring', 'Magus ring', 'Ring of shadows', 'Lightbearer']);
    expect(CAMP_RINGS.length).toBe(6);
    // unowned rings are not tried
    expect(campRingItems(['Ultor ring', 'Lightbearer']).map((x) => x.name)).toEqual(['Bellator ring', 'Venator ring', 'Magus ring', 'Ring of shadows']);
  });

  test('camp Lightbearer / camping Lightbearer sets the Solo spec budget\'s Lightbearer regen; camping another ring clears it; switch keeps it', () => {
    const lb = { name: 'Lightbearer' };
    const ultor = { name: 'Ultor ring' };
    const off = { ...DEFAULT_ASSUMPTIONS, mySpecs: { ...DEFAULT_ASSUMPTIONS.mySpecs, lightbearer: false } };
    const on = { ...DEFAULT_ASSUMPTIONS, mySpecs: { ...DEFAULT_ASSUMPTIONS.mySpecs, lightbearer: true } };
    expect(ringAssumptions(off, 'camp-lightbearer', lb).mySpecs.lightbearer).toBe(true);
    expect(ringAssumptions(off, 'camp-one', lb).mySpecs.lightbearer).toBe(true);
    expect(ringAssumptions(on, 'camp-one', ultor).mySpecs.lightbearer).toBe(false);
    expect(ringAssumptions(on, 'switch', null)).toBe(on);
    expect(ringAssumptions(off, 'switch', null)).toBe(off);
    // the budget doubles its regen (10% per 15 s instead of 30 s)
    expect(energyBudget({ seconds: 120, lightbearer: true }) - 100).toBe(2 * (energyBudget({ seconds: 120, lightbearer: false }) - 100));
  });

  test.each(RAIDS.map((r) => [r.id, r] as const))('%s: camp one ring picks the fastest single ring and wears it in every loadout', (_, raid) => {
    const r = planned(raid, 'camp-one');
    expect(r.ring.policy).toBe('camp-one');
    expect(r.ring.ring).not.toBeNull();
    expect(rings(r).every((x) => x === r.ring.ring)).toBe(true);
    // no ring switch items in the inventory
    expect(r.inventory.some((c) => c.kind === 'switch' && c.item?.slot === 'ring')).toBe(false);
    // every owned camp ring was tried; the chosen one is the fastest of the full runs and of the screens
    expect(r.ring.screened.map((x) => x.ring).sort()).toEqual(campRingItems().map((x) => x.name).sort());
    expect(r.ring.screened[0].ring).toBe(r.ring.ring);
    expect(r.ring.screened[0].full).toBe(true);
    expect(Math.abs(r.ring.screened[0].seconds - total(r))).toBeLessThan(1e-6);
    r.ring.screened.forEach((x) => expect(total(r)).toBeLessThanOrEqual(x.seconds + 1e-6));
    // review fix: a ring planned only by its screen carries the gap it is assumed to have at least (≥ 0), never a delta
    r.ring.screened.forEach((x) => expect(x.full ? x.atLeast : x.atLeast! >= 0).toBe(x.full ? undefined : true));
    // camping Lightbearer is one of the options: never faster than the chosen ring
    expect(total(r)).toBeLessThanOrEqual(total(planned(raid, 'camp-lightbearer')) + 1e-6);
  }, 600000);

  test.each(RAIDS.map((r) => [r.id, r] as const))('%s: camp Lightbearer wears Lightbearer everywhere (a pinned Lightbearer is worn, not carried)', (_, raid) => {
    const r = planned(raid, 'camp-lightbearer');
    expect(r.ring).toEqual({ policy: 'camp-lightbearer', ring: 'Lightbearer', screened: [] });
    expect(rings(r).every((x) => x === 'Lightbearer')).toBe(true);
    expect(r.inventory.some((c) => c.label === 'Lightbearer')).toBe(false);
    expect(r.unusedCarried.map((x) => x.name)).not.toContain('Lightbearer');
  }, 300000);

  test('camp one ring with a ring other than Lightbearer: a pinned Lightbearer stays carried and is reported unused', () => {
    const r = planned(raidConfig('toa'), 'camp-one');
    expect(r.ring.ring).not.toBe('Lightbearer');
    expect(r.inventory.filter((c) => c.kind === 'pinned' && c.label === 'Lightbearer').length).toBe(1);
    expect(r.unusedCarried.map((x) => x.name)).toContain('Lightbearer');
  }, 300000);

  /**
   * Allow ring switches = the phase 17-26 planner. These reduced-pool totals were checked against the phase 26 planner
   * given the same potions (the kit's: FA 1 Super combat, ToB 1 Super combat + 1 Ranging potion, ToA / CoX none): the
   * same kits and totals to the last digit (A/B run during phase 27). Phase 32 (no Rada's blessing, a loadout without
   * ammo keeps the kit's ammo in its ammo slot): FA 1533.2 → 1493.8, ToA 879.7 → 872.6; CoX / ToB unchanged. Phase 35 (no
   * specs on adds: the scarabs, Akkha's Shadows, CoX Mystics / Shamans / small Muttadile / crystals / portal at full
   * Defence): ToA 872.6 → 879.6, CoX 411.9 → 442.0; FA / ToB unchanged. Phase 36 (one spec budget per encounter; the
   * wiki's Kephri / Warden / Olm Defence resets; Manual specs, no damage specs): ToA 879.6 → 881.1, CoX 442.0 → 448.9,
   * ToB 455.1 → 457.3 (Sotetseg's thirds share the carriers' energy); FA unchanged. Phase 36 review (regen on the
   * drained clock): ToA 881.1 → 881.2, CoX 448.9 → 452.7 (Olm's phases: fewer regen ticks); FA / ToB unchanged.
   */
  test.each([
    ['fractured-archive', 1493.8],
    ['toa', 881.2],
    ['cox', 452.7],
    ['tob', 457.3],
  ] as [RaidConfig['id'], number][])('%s: allow switches reproduces the previous planner (%s s)', (id, seconds) => {
    const r = planned(raidConfig(id), 'switch');
    expect(r.ring).toEqual({ policy: 'switch', ring: null, screened: [] });
    expect(Math.abs(total(r) - seconds)).toBeLessThan(0.05);
    // 'switch' is the planner's default when no policy is given (the Plan tab passes camp one ring)
    expect(total(planned(raidConfig(id)))).toBe(total(r));
  }, 600000);
});

/**
 * Review fix: the ring screen's guard. Planning every camp ring in full (`ringGuard: Infinity`) on the default FA plan
 * picks the same ring and total as the guarded default (screen, then full plans within RING_GUARD_FACTOR × g).
 * Slow (a full default plan per ring): `RUN_SLOW_TESTS=1`.
 */
(process.env.RUN_SLOW_TESTS ? describe : describe.skip)('ring guard (slow)', () => {
  test('FA defaults: the guarded camp-one ring is the true best of all six rings planned in full', () => {
    const raid = FRACTURED_ARCHIVE_RAID;
    const inputs = {
      basePlayer: generateEmptyPlayer(),
      assumptions: withPhase32Specs(raid.defaultAssumptions),
      drain: 'team' as const,
      settings: raid.defaultTimeSettings,
      route: 'all',
      pinned: raid.planDefaults.pinned.map((n) => planItemByName(n).id),
      nonItemSlots: raid.planDefaults.nonItemSlots,
      supplies: raid.defaultSupplies,
      ringPolicy: 'camp-one' as const,
    };
    expect(RING_GUARD_FACTOR).toBe(2);
    const guarded = plan(inputs, { model: raid.time });
    const all = plan(inputs, { model: raid.time, ringGuard: Infinity });
    expect(all.ring.screened.every((x) => x.full)).toBe(true);
    expect(guarded.ring.ring).toBe(all.ring.ring);
    expect(total(guarded)).toBe(total(all));
    // every screen-only ring's estimated gap is no more than its true gap
    guarded.ring.screened.filter((x) => !x.full).forEach((x) => {
      const truth = all.ring.screened.find((y) => y.ring === x.ring)!.seconds - total(all);
      // eslint-disable-next-line no-console
      console.log(`${x.ring}: estimate ≥ +${x.atLeast!.toFixed(1)} s, true +${truth.toFixed(1)} s`);
      expect(x.atLeast!).toBeLessThanOrEqual(truth + 1e-6);
    });
  }, 1800000);
});
