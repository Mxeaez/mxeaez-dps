import { describe, expect, test } from '@jest/globals';
import { faRows, otherRaidsDescribe, otherRaidsTest } from '@/tests/utils/otherRaids';
import { generateEmptyPlayer } from '@/state';
import {
  DEFAULT_NON_ITEM_SLOTS,
  DEFAULT_PINNED_NAMES,
  DEFAULT_SUPPLIES,
  INVENTORY_SLOTS,
  inventoryGrid,
  kitSlotUsage,
  lightenKit,
  optimiseKit,
  plan,
  PlanItem,
  planItemByName,
  raidSuppliedItemIds,
  SupplyCounts,
  SWITCH_MIN_SAVING_SECONDS,
  SWITCH_MIN_SECONDS_PER_SLOT,
  switchSavingRequired,
} from '@/lib/fracturedArchive/planner';
import {
  encounterTime, PhaseQuery, RaidKit, raidTimeAssumptionsFrom,
} from '@/lib/fracturedArchive/raidTime';
import { BestSetupAssumptions } from '@/lib/fracturedArchive/presets';
import {
  CHAMBERS_OF_XERIC_RAID, FRACTURED_ARCHIVE_RAID, RAIDS, raidBase, THEATRE_OF_BLOOD_RAID, TOMBS_OF_AMASCUT_RAID,
  visibleTargets,
} from '@/lib/raids';
import { TOB_DEFAULT_ASSUMPTIONS, TOB_PRESETS } from '@/lib/raids/tob/presets';
import { dawnbringerSpecs, tobEncounterPlan } from '@/lib/raids/tob/time';
import { DAWNBRINGER_SPEC_AVERAGE, DAWNBRINGER_SPEC_SECONDS } from '@/lib/raids/tob/constants';

// Phase 21: Plan tab per raid — per-raid defaults (src/lib/raids/planDefaults.ts), raid-supplied items at 0 slots, the
// dedupe rule (SWITCH_MIN_*), Prinkipas only in Hard Mode, Dawnbringer spec count = the team-DPS multiplier.

const NO_SUPPLIES: SupplyCounts = {
  brew: 0, restore: 0, ranging: 0, superCombat: 0, food: 0, other: 0,
};
const supplySlots = (s: SupplyCounts) => Object.values(s).reduce((t, n) => t + n, 0);
const refName = (r: string | [string, string]) => (typeof r === 'string' ? r : r[0]);

describe('per-raid plan defaults', () => {
  test.each(faRows(RAIDS).map((r) => [r.id, r] as const))('%s: pinned items resolve, supplies valid, fixed slots leave room', (_, raid) => {
    const d = raid.planDefaults;
    expect(raidBase(raid.id === 'fractured-archive' ? undefined : raid.id).planDefaults).toBe(d);
    expect(raid.defaultSupplies).toBe(d.supplies);
    d.pinned.forEach((n) => expect(planItemByName(n).name).toBe(refName(n)));
    expect(Object.values(d.supplies).every((n) => Number.isInteger(n) && n >= 0)).toBe(true);
    expect(d.nonItemSlots).toBe(1); // the rune pouch
    expect(supplySlots(d.supplies) + d.nonItemSlots + d.pinned.length).toBeLessThanOrEqual(INVENTORY_SLOTS - 6);
    expect(d.source.length).toBeGreaterThan(10);
    d.raidSupplied.forEach((n) => expect(d.pinned.map(refName)).not.toContain(refName(n)));
  });

  test('the Fractured Archive pins nothing (phase 31); the phase 17 names point at it', () => {
    // phase 29: no spec weapons (the planner picks them); phase 30: nothing else either (the planner decides the
    // styles); phase 31: the heart is magic's kit potion, not pinned
    expect(FRACTURED_ARCHIVE_RAID.planDefaults.pinned).toEqual([]);
    // phase 27: comfort supplies only (the combat potions come from the kit)
    expect(FRACTURED_ARCHIVE_RAID.defaultSupplies).toEqual({
      brew: 6, restore: 4, ranging: 0, superCombat: 0, food: 0, other: 0,
    });
    expect(DEFAULT_PINNED_NAMES).toBe(FRACTURED_ARCHIVE_RAID.planDefaults.pinned);
    expect(DEFAULT_SUPPLIES).toBe(FRACTURED_ARCHIVE_RAID.defaultSupplies);
    expect(DEFAULT_NON_ITEM_SLOTS).toBe(1);
  });

  otherRaidsTest('ToA / CoX / ToB defaults (Strategies pages)', () => {
    // phase 30: empty pinned lists (the planner decides; the list is for the user's own additions)
    expect(TOMBS_OF_AMASCUT_RAID.planDefaults.pinned).toEqual([]);
    expect(TOMBS_OF_AMASCUT_RAID.defaultSupplies).toMatchObject({ brew: 0, restore: 6, other: 2 });
    expect(CHAMBERS_OF_XERIC_RAID.planDefaults.pinned).toEqual([]); // phase 30: the planner adds the pickaxe for the Guardians
    expect(CHAMBERS_OF_XERIC_RAID.defaultSupplies).toMatchObject({ brew: 2, restore: 2, other: 1 });
    expect(THEATRE_OF_BLOOD_RAID.planDefaults.pinned).toEqual([]); // phase 29: Elder maul left to the planner; phase 31: the heart too
    expect(THEATRE_OF_BLOOD_RAID.defaultSupplies).toEqual({
      brew: 4, restore: 3, ranging: 0, superCombat: 0, food: 0, other: 0,
    });
    // potion boosts: from the raid in ToA / CoX (no combat potions by default), brought in ToB / FA
    [TOMBS_OF_AMASCUT_RAID, CHAMBERS_OF_XERIC_RAID].forEach((r) => {
      expect(r.boostsNeedSupplies).toBe(false);
      expect(r.defaultSupplies.ranging + r.defaultSupplies.superCombat).toBe(0);
      expect(r.planDefaults.pinned).not.toContain('Saturated heart'); // the raid potion boosts magic
    });
  });

  otherRaidsTest('raid-supplied items: the Dawnbringer in ToB only', () => {
    expect(THEATRE_OF_BLOOD_RAID.planDefaults.raidSupplied).toEqual(['Dawnbringer']);
    [FRACTURED_ARCHIVE_RAID, TOMBS_OF_AMASCUT_RAID, CHAMBERS_OF_XERIC_RAID].forEach((r) => expect(r.planDefaults.raidSupplied).toEqual([]));
    expect(raidSuppliedItemIds({ raid: 'tob' })).toEqual([planItemByName('Dawnbringer').id]);
    expect(raidSuppliedItemIds({})).toEqual([]);
    expect(raidSuppliedItemIds({ raid: 'cox' })).toEqual([]);
  });
});

const item = (id: number, slot: PlanItem['slot']): PlanItem => ({
  id, name: `item${id}`, version: '', slot,
});

describe('raid-supplied items cost 0 slots', () => {
  // worn A = [1 weapon, 2, 3]; A' = A with the raid item 99 as the weapon (1 goes to the inventory, 99 replaces it)
  const A = [1, 2, 3];
  const withRaidWeapon = [99, 2, 3];

  test('slot accounting: a loadout wearing a raid item in place of a weapon adds nothing', () => {
    const alone = kitSlotUsage([A], 0, [], NO_SUPPLIES, 1);
    const free = kitSlotUsage([A, withRaidWeapon], 0, [], NO_SUPPLIES, 1, INVENTORY_SLOTS, [99]);
    expect(free.used).toBe(alone.used);
    expect(free.inventoryItems).toBe(0);
    expect(free.swapReserve).toBe(0);
    // as a normal item it costs a slot
    expect(kitSlotUsage([A, withRaidWeapon], 0, [], NO_SUPPLIES, 1).used).toBe(alone.used + 1);
    // carried by mistake (pinned): still 0
    expect(kitSlotUsage([A, withRaidWeapon], 0, [99], NO_SUPPLIES, 1, INVENTORY_SLOTS, [99]).used).toBe(alone.used);
  });

  test('inventory grid: no cell for the raid item; cells = slot accounting', () => {
    const kit = [
      { equipment: { weapon: item(1, 'weapon'), head: item(2, 'head'), body: item(3, 'body') }, group: 'melee' as const },
      { equipment: { weapon: item(99, 'weapon'), head: item(2, 'head'), body: item(3, 'body') }, group: 'magic' as const },
    ];
    const cells = inventoryGrid(kit, 0, [], [], NO_SUPPLIES, 1, INVENTORY_SLOTS, [99]);
    expect(cells.length).toBe(INVENTORY_SLOTS);
    expect(cells.some((c) => c.item?.id === 99)).toBe(false);
    expect(cells.filter((c) => c.kind !== 'free').length).toBe(kitSlotUsage([A, withRaidWeapon], 0, [], NO_SUPPLIES, 1, INVENTORY_SLOTS, [99]).used);
  });

  test('optimiser: the raid-item switch is taken at 0 slots when only 0 slots are free', () => {
    // 2 phases; A can't hit phase 2 (Verzik P1), A' (raid weapon) only phase 2
    const items = [A, withRaidWeapon];
    const time = (m: number[]) => (m.includes(0) ? 10 : Infinity) + (m.includes(1) ? 5 : Infinity);
    const fixedSlots = INVENTORY_SLOTS - 1; // A alone uses 1 + 3 - 3 = 28
    const r = optimiseKit({
      items, carried: [], fixedSlots, totalSlots: INVENTORY_SLOTS, time, seeds: [0], raidSupplied: [99],
    });
    expect([...r.best.members].sort()).toEqual([0, 1]);
    expect(r.best.used).toBe(INVENTORY_SLOTS - 1);
    const paid = optimiseKit({
      items, carried: [], fixedSlots, totalSlots: INVENTORY_SLOTS, time, seeds: [0],
    });
    expect(paid.best.used).toBe(INVENTORY_SLOTS);
  });
});

describe('dedupe rule (SWITCH_MIN_SAVING_SECONDS / SWITCH_MIN_SECONDS_PER_SLOT)', () => {
  test('constants and the required saving', () => {
    expect(SWITCH_MIN_SAVING_SECONDS).toBe(1);
    expect(SWITCH_MIN_SECONDS_PER_SLOT).toBe(1);
    expect([0, 1, 2, 3].map(switchSavingRequired)).toEqual([1, 1, 2, 3]);
  });

  // A = [1, 2, 3]; B = A with the carried item 5 (0 extra slots), saves 0.2 s; C = A with item 6 (+1 slot), saves 3 s
  const items = [[1, 2, 3], [1, 2, 5], [1, 2, 6]];
  // A is needed (nothing else hits phase 1)
  const time = (m: number[]) => (m.includes(0) ? 100 : Infinity) - (m.includes(1) ? 0.2 : 0) - (m.includes(2) ? 3 : 0);
  const solve = (noPrune = false) => optimiseKit({
    items, carried: [5], fixedSlots: 10, totalSlots: INVENTORY_SLOTS, time, seeds: [0, 1, 2], noPrune,
  });

  test('a 0-slot / 0.2 s duplicate is dropped; a 1-slot / 3 s switch is kept', () => {
    const r = solve();
    expect([...r.best.members].sort()).toEqual([0, 2]);
    expect(r.best.time).toBeCloseTo(97, 9);
    // without the rule the optimiser keeps the duplicate (its time is 0.2 s lower)
    const raw = solve(true);
    expect([...raw.best.members].sort()).toEqual([0, 1, 2]);
    expect(raw.best.time).toBeCloseTo(96.8, 9);
    // every final kit obeys the rule
    r.finals.forEach((f) => expect(f.members.includes(1) && f.members.length > 1).toBe(false));
  });

  test('a switch must save ≥ 1 s per extra slot: 2 slots for 1.5 s is dropped, 2 slots for 2.5 s kept', () => {
    const its = [[1, 2, 3], [1, 7, 8]];
    const t = (gain: number) => (m: number[]) => (m.includes(0) ? 100 : Infinity) - (m.includes(1) ? gain : 0);
    const run = (gain: number) => optimiseKit({
      items: its, carried: [], fixedSlots: 10, totalSlots: INVENTORY_SLOTS, time: t(gain), seeds: [0],
    }).best.members;
    expect(run(1.5)).toEqual([0]);
    expect([...run(2.5)].sort()).toEqual([0, 1]);
  });

  test('the plan keeps the faster costly variant; the lighter kit swaps it for the cheaper one (2 slots bought 0.5 s)', () => {
    // D: +2 slots, saves 2.5 s; E (same style, 0 slots: item 5 is carried) saves 2.0 s
    const its = [[1, 2, 3], [1, 7, 8], [1, 2, 5]];
    const t = (m: number[]) => (m.includes(0) ? 100 : Infinity) - Math.max(m.includes(1) ? 2.5 : 0, m.includes(2) ? 2.0 : 0);
    const prob = {
      items: its, carried: [5], fixedSlots: 10, totalSlots: INVENTORY_SLOTS, time: t, seeds: [0], groups: ['melee', 'magic', 'magic'],
    };
    const r = optimiseKit(prob);
    expect([...r.best.members].sort()).toEqual([0, 1]); // minimum time; groups are ignored by the optimiser
    expect(r.best.time).toBeCloseTo(97.5, 9);
    const light = lightenKit(prob, r.best.members);
    expect([...light.members].sort()).toEqual([0, 2]);
    expect(light.time).toBeCloseTo(98, 9);
    expect(r.best.used - light.used).toBe(2);
  });

  test('a kit that cannot clear the route (∞) is not pruned', () => {
    const its = [[1, 2, 3], [4, 5, 6], [7, 8, 9]];
    const t = () => Infinity;
    const r = optimiseKit({
      items: its, carried: [], fixedSlots: 10, totalSlots: INVENTORY_SLOTS, time: t, seeds: [0],
    });
    expect(r.best.members).toEqual([0]); // nothing helps, nothing added
    expect(lightenKit({
      items: its, carried: [], fixedSlots: 10, totalSlots: INVENTORY_SLOTS, time: t, seeds: [0],
    }, [0, 1, 2])).toMatchObject({ members: [0, 1, 2] });
  });
});

otherRaidsDescribe('ToB: Prinkipas only in Hard Mode', () => {
  const keys = (a: BestSetupAssumptions) => visibleTargets(THEATRE_OF_BLOOD_RAID, a).map((t) => t.key);
  const prinkipas = ['tob-prinkipas-melee', 'tob-prinkipas-ranged', 'tob-prinkipas-magic'];

  test('the Search list hides them in Normal / Entry Mode and shows them in Hard Mode', () => {
    prinkipas.forEach((k) => {
      expect(keys(TOB_DEFAULT_ASSUMPTIONS)).not.toContain(k);
      expect(keys({ ...TOB_DEFAULT_ASSUMPTIONS, tob: { mode: 'entry' } })).not.toContain(k);
      expect(keys({ ...TOB_DEFAULT_ASSUMPTIONS, tob: { mode: 'hard' } })).toContain(k);
    });
    expect(keys(TOB_DEFAULT_ASSUMPTIONS).length).toBe(THEATRE_OF_BLOOD_RAID.targets.length - 3);
    expect(keys({ ...TOB_DEFAULT_ASSUMPTIONS, tob: { mode: 'hard' } }).length).toBe(THEATRE_OF_BLOOD_RAID.targets.length);
  });

  test('the raid\'s targets (Summary rows, time model) are unchanged; other raids show every target', () => {
    prinkipas.forEach((k) => expect(THEATRE_OF_BLOOD_RAID.targets.map((t) => t.key)).toContain(k));
    expect(THEATRE_OF_BLOOD_RAID.targets.filter((t) => !t.noSummary).map((t) => t.key)).not.toContain('tob-prinkipas-melee');
    [FRACTURED_ARCHIVE_RAID, CHAMBERS_OF_XERIC_RAID].forEach((r) => {
      expect(visibleTargets(r, r.defaultAssumptions)).toBe(r.targets);
    });
    // phase 38a: ToA hides only the time model's copies of rooms 1-2 (`beforeSupplies`)
    expect(visibleTargets(TOMBS_OF_AMASCUT_RAID, TOMBS_OF_AMASCUT_RAID.defaultAssumptions))
      .toEqual(TOMBS_OF_AMASCUT_RAID.targets.filter((t) => !t.beforeSupplies));
  });
});

otherRaidsDescribe('ToB: Dawnbringer spec count follows the team-DPS multiplier', () => {
  const settings = THEATRE_OF_BLOOD_RAID.defaultTimeSettings;
  const timeA = (mult?: number) => raidTimeAssumptionsFrom(
    mult === undefined ? TOB_DEFAULT_ASSUMPTIONS : { ...TOB_DEFAULT_ASSUMPTIONS, teamDpsMultiplier: mult },
    'none',
    settings,
    THEATRE_OF_BLOOD_RAID.time,
  );
  const kit: RaidKit = {
    best: (q: PhaseQuery) => ({ loadout: 'toy', style: 'x', dps: q.phase ? 4 : 5 }),
  };

  test('default (party 4): 2 × 4 = 8 specs, 900 damage, 4.8 s — as in phase 20', () => {
    expect(dawnbringerSpecs(timeA())).toEqual({ specs: 8, damage: 8 * DAWNBRINGER_SPEC_AVERAGE });
    const v = encounterTime('tob-verzik', kit, timeA());
    expect(v.phases[0].seconds).toBeCloseTo(2 * DAWNBRINGER_SPEC_SECONDS);
  });

  test.each([1, 2, 3, 5])('Team DPS × %d: specs = 2 × N, their time stays 2 × 2.4 s, the rest of the shield shrinks with it', (n) => {
    const a = timeA(n);
    const spec = dawnbringerSpecs(a);
    expect(spec.specs).toBe(2 * n);
    expect(spec.damage).toBeCloseTo(Math.min(1750, 2 * n * DAWNBRINGER_SPEC_AVERAGE));
    const rows = tobEncounterPlan('tob-verzik', a);
    expect(rows[0].damage + rows[1].damage).toBeCloseTo(1750); // P1 hp at party 4
    const v = encounterTime('tob-verzik', kit, a);
    const specRow = v.phases.find((p) => p.key === 'verzik-p1-dawnbringer')!;
    // spec time = specs × 2.4 ÷ N: each player's own 2 specs, whatever N is
    expect(specRow.seconds).toBeCloseTo(2 * DAWNBRINGER_SPEC_SECONDS);
    expect(specRow.damage / (specRow.seconds * n)).toBeCloseTo(DAWNBRINGER_SPEC_AVERAGE / DAWNBRINGER_SPEC_SECONDS);
  });
});

otherRaidsDescribe('ToB plan (reduced pool): a Dawnbringer loadout, the staff at 0 slots', () => {
  test('the kit carries a Dawnbringer loadout; the grid has no Dawnbringer cell', () => {
    const raid = THEATRE_OF_BLOOD_RAID;
    const res = plan({
      basePlayer: generateEmptyPlayer(),
      assumptions: TOB_DEFAULT_ASSUMPTIONS,
      drain: 'team',
      settings: raid.defaultTimeSettings,
      route: 'all',
      pinned: raid.planDefaults.pinned.map((n) => planItemByName(n).id),
      nonItemSlots: raid.planDefaults.nonItemSlots,
      supplies: raid.defaultSupplies,
    }, {
      model: raid.time,
      presets: TOB_PRESETS.filter((p) => ['Torva + Scythe (slash)', 'Tumeken\'s shadow (Ancestral)', 'Dawnbringer (Ancestral)', 'Twisted bow (Masori)'].includes(p.name)),
      search: { weapons: ['Scythe of Vitur', 'Tumeken\'s shadow', 'Twisted bow', 'Dawnbringer'], maxPasses: 1 },
      perGroupWeapons: 2,
      perWeapon: 1,
      seeds: 4,
    });
    expect(res.cancelled).toBe(false);
    const dawn = planItemByName('Dawnbringer').id;
    const i = res.kit.findIndex((c) => c.equipment.weapon?.id === dawn);
    expect(i).toBeGreaterThan(0);
    // the Dawnbringer itself is free: whatever the loadout adds is its other pieces (at most one here)
    expect(res.kitMarginal[i].slots).toBeLessThanOrEqual(1);
    expect(res.kitMarginal[i].seconds).toBeGreaterThanOrEqual(SWITCH_MIN_SAVING_SECONDS);
    expect(res.inventory.some((c) => c.item?.id === dawn)).toBe(false);
    expect(res.inventory.filter((c) => c.kind !== 'free').length).toBe(res.slots!.used);
    // the holder uses it on Verzik P1
    const verzik = res.comparison!.routes[res.planned].encounters.find((e) => e.id === 'tob-verzik')!;
    expect(verzik.phases.find((p) => p.key === 'verzik-p1')!.note).toMatch(/Dawnbringer/);
    // every kit loadout obeys the dedupe rule
    res.kitMarginal.forEach((m) => expect(m.seconds).toBeGreaterThanOrEqual(switchSavingRequired(m.slots) - 1e-9));
  }, 300000);
});
