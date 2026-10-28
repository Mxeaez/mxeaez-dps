import { describe, expect, test } from '@jest/globals';
import { generateEmptyPlayer } from '@/state';
import { availableEquipment, equipmentAliases, getCanonicalItemId } from '@/lib/Equipment';
import { ITEM_VERSION_PREFERENCE, resolveItem } from '@/lib/fracturedArchive/loadout';
import {
  clearPlanCaches, plan, PlanInputs, planItemByName, PlanResult, RingPolicy,
} from '@/lib/fracturedArchive/planner';
import { drainFightSecondsOf } from '@/lib/fracturedArchive/raidTime';
import { FRACTURED_ARCHIVE_RAID, RaidConfig } from '@/lib/raids';
import { slowTest } from '@/tests/utils/slow';

// Phase 28 (final review, round 3): the alias / item caches return what upstream's uncached code returns, the
// planner's worker-lifetime caches miss when a DPS input changes, and the Plan's Solo fight length uses the same
// formula as Search (hp ÷ (party size × DPS)).

/** Upstream's getCanonicalItemId before the reverse map (src/lib/Equipment.ts at 89c3e25). */
const upstreamCanonical = (itemId: number): number => {
  for (const [k, v] of Object.entries(equipmentAliases)) {
    if (v.includes(itemId)) return parseInt(k);
  }
  return itemId;
};

/** resolveItem before the memo (phase 27 review). */
const uncachedResolve = (name: string) => {
  const matches = availableEquipment.filter((e) => e.name === name);
  return ITEM_VERSION_PREFERENCE.map((v) => matches.find((e) => e.version === v)).find((e) => e) || matches[0];
};

describe('alias / item caches = upstream', () => {
  test('getCanonicalItemId (reverse map) equals the linear alias scan for every item in equipment.json and every alias id', () => {
    const ids = new Set<number>(availableEquipment.map((e) => e.id));
    Object.entries(equipmentAliases).forEach(([k, v]) => {
      ids.add(parseInt(k));
      v.forEach((id) => ids.add(id));
    });
    const mismatches = Array.from(ids).filter((id) => getCanonicalItemId(id) !== upstreamCanonical(id));
    expect(ids.size).toBeGreaterThan(availableEquipment.length / 2);
    expect(mismatches).toEqual([]);
    // an id no group lists maps to itself
    expect(getCanonicalItemId(-12345)).toBe(-12345);
  });

  test('resolveItem (memoised) returns the uncached pick for every item name, and the same object on a repeat', () => {
    const names = Array.from(new Set(availableEquipment.map((e) => e.name)));
    const wrong = names.filter((n) => resolveItem(n) !== uncachedResolve(n));
    expect(wrong).toEqual([]);
    names.slice(0, 50).forEach((n) => expect(resolveItem(n)).toBe(resolveItem(n)));
    // an explicit version is a different key from the default pick
    expect(resolveItem(['Ring of shadows', 'Charged']).version).toBe('Charged');
  });
});

describe('Plan Solo fight length (phase 28 fix)', () => {
  test('drainFightSecondsOf = encounter time × multiplier ÷ party size, clamped 15-600 s; fallback when it can\'t be killed', () => {
    const fa = { partySize: 6, dpsMultiplier: 1, fallbackFightSeconds: 90 };
    expect(drainFightSecondsOf(600, fa)).toBe(100); // 6-man FA: a sixth of the "you alone" time
    expect(drainFightSecondsOf(600, { ...fa, dpsMultiplier: 6 })).toBe(600); // ToA / CoX / ToB defaults: unchanged
    expect(drainFightSecondsOf(1200, { ...fa, dpsMultiplier: 6 })).toBe(600); // clamp max
    expect(drainFightSecondsOf(30, fa)).toBe(15); // clamp min
    expect(drainFightSecondsOf(Infinity, fa)).toBe(90);
    expect(drainFightSecondsOf(0, fa)).toBe(90);
    expect(drainFightSecondsOf(600, { partySize: 6, fallbackFightSeconds: 90 })).toBe(100); // no multiplier = 1
  });
});

const reduced = (raid: RaidConfig) => ({
  model: raid.time,
  presets: (['melee', 'ranged', 'magic'] as const).map((g) => raid.presets.find((p) => p.group === g)!).filter(Boolean),
  search: { weapons: ['Scythe of Vitur', 'Tumeken\'s shadow', 'Twisted bow'], maxPasses: 1 },
  perGroupWeapons: 1,
  perWeapon: 1,
  bases: 1,
  partners: 1,
  seeds: 2,
});
const raid = FRACTURED_ARCHIVE_RAID;
const inputs = (over: Partial<PlanInputs> = {}): PlanInputs => ({
  basePlayer: generateEmptyPlayer(),
  assumptions: raid.defaultAssumptions,
  drain: 'team',
  settings: raid.defaultTimeSettings,
  route: 'all',
  pinned: raid.planDefaults.pinned.map((n) => planItemByName(n).id),
  nonItemSlots: raid.planDefaults.nonItemSlots,
  supplies: raid.defaultSupplies,
  ringPolicy: 'switch' as RingPolicy,
  ...over,
});
const total = (r: PlanResult) => r.comparison!.routes[r.planned].seconds;
/** A plan with warm caches, and the same plan with cold caches. */
const warmAndCold = (i: PlanInputs) => {
  const warm = plan(i, reduced(raid));
  clearPlanCaches();
  const cold = plan(i, reduced(raid));
  return { warm, cold };
};

describe('planner caches: a changed DPS input misses (phase 28)', () => {
  test('Zeal (the assumptions in the cache keys) re-searches / re-evaluates; warm = cold', () => {
    clearPlanCaches();
    const base = plan(inputs(), reduced(raid));
    expect(base.stats.searches).toBeGreaterThan(0);
    expect(plan(inputs(), reduced(raid)).stats.searches).toBe(0);

    // Zeal on (default off): assumptions change → searches and DPS rows miss
    const zeal = inputs({ assumptions: { ...raid.defaultAssumptions, useZeal: true } });
    const z = warmAndCold(zeal);
    expect(z.warm.stats.searches).toBeGreaterThan(0);
    expect(z.warm.stats.evaluations).toBeGreaterThan(0);
    expect(total(z.warm)).toBe(total(z.cold));
    expect(total(z.warm)).not.toBe(total(base));
  }, 600000);

  // phase 38f: the other cache keys (fragments, ownership, ring policy) run in the slow suite (each is warm + cold plans)
  slowTest('Fragments, ownership and the ring policy each re-search / re-evaluate; warm = cold', () => {
    clearPlanCaches();
    const base = plan(inputs(), reduced(raid));
    expect(base.stats.searches).toBeGreaterThan(0);
    // elemental fragments off
    clearPlanCaches();
    plan(inputs(), reduced(raid));
    const noFrag = warmAndCold(inputs({ assumptions: { ...raid.defaultAssumptions, elementalFragments: false } }));
    expect(noFrag.warm.stats.searches).toBeGreaterThan(0);
    expect(total(noFrag.warm)).toBe(total(noFrag.cold));

    // ownership: the search cache key holds the list
    clearPlanCaches();
    plan(inputs(), reduced(raid));
    const owned = warmAndCold(inputs({ notOwned: ['Twisted bow'] }));
    expect(owned.warm.stats.searches).toBeGreaterThan(0);
    expect(total(owned.warm)).toBe(total(owned.cold));

    // ring policy: camping Lightbearer puts a new ring on every loadout (new DPS rows) and sets the regen flag
    clearPlanCaches();
    plan(inputs(), reduced(raid));
    const lb = warmAndCold(inputs({ ringPolicy: 'camp-lightbearer', drain: 'solo' }));
    expect(lb.warm.stats.evaluations).toBeGreaterThan(0);
    expect(total(lb.warm)).toBe(total(lb.cold));
    expect(lb.warm.kit.every((c) => c.equipment.ring?.name === 'Lightbearer')).toBe(true);
  }, 600000);

  test('Camp Lightbearer with Lightbearer on the "don\'t own" list: a notice', () => {
    const r = plan(inputs({ ringPolicy: 'camp-lightbearer', notOwned: ['Lightbearer'] }), reduced(raid));
    expect(r.ownershipNotices.some((n) => n.includes('Camp Lightbearer'))).toBe(true);
    const ok = plan(inputs({ ringPolicy: 'camp-lightbearer' }), reduced(raid));
    expect(ok.ownershipNotices.some((n) => n.includes('Camp Lightbearer'))).toBe(false);
  }, 300000);

  test('Solo plan: every encounter\'s drain fight length = undrained time ÷ party size (FA ×1), within 15-600 s', () => {
    const r = plan(inputs({ drain: 'solo' }), reduced(raid));
    const fights = r.stats.fightSeconds!;
    expect(Object.keys(fights).length).toBeGreaterThan(0);
    Object.values(fights).forEach((s) => {
      expect(s).toBeGreaterThanOrEqual(15);
      expect(s).toBeLessThanOrEqual(600);
    });
    // the reported (exact) times plan drains with the kit's own undrained time, by the same formula: ≤ 600 s, and the
    // kit is at least as fast as the best single loadout the matrix used
    r.comparison!.routes[r.planned].encounters.forEach((e) => {
      expect(e.drainFightSeconds!).toBeLessThanOrEqual(fights[e.id]! + 1);
    });
    // Bork + Smorks: ~220 s for you alone → well under 90 s for a 6-man (was > 90 before the fix)
    expect(fights['bork-smorks']!).toBeLessThan(90);
  }, 300000);
});
