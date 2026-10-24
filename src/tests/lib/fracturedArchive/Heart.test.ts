import { describe, expect, test } from '@jest/globals';
import Potion from '@/enums/Potion';
import {
  DEFAULT_NON_ITEM_SLOTS,
  DEFAULT_SUPPLIES,
  HEART_ITEMS,
  inventoryGrid,
  kitSlotUsage,
  plan,
  PlanItem,
  planAssumptions,
  planItemByName,
  SUPPLY_TYPES,
  SupplyCounts,
} from '@/lib/fracturedArchive/planner';
import { RAID_TIME_DEFAULTS } from '@/lib/fracturedArchive/raidTime';
import { BestSetupAssumptions, DEFAULT_ASSUMPTIONS, PRESETS } from '@/lib/fracturedArchive/presets';
import {
  applyPresetToPlayer, buildTargetMonster, evaluateLoadout, findTarget, presetStyles,
} from '@/lib/fracturedArchive/bestSetup';
import {
  CHAMBERS_OF_XERIC_RAID, FRACTURED_ARCHIVE_RAID, THEATRE_OF_BLOOD_RAID, TOMBS_OF_AMASCUT_RAID,
} from '@/lib/raids';
import { generateEmptyPlayer } from '@/state';

// Fix (2026-10-23): the magic boost is a Saturated heart, a pinned item (one slot for the whole raid), not a potion
// supply. FA / ToB: magic is boosted iff a heart is pinned. ToA / CoX: the raid potion ("Other") boosts every style.

const NO_SUPPLIES: SupplyCounts = {
  brew: 0, restore: 0, ranging: 0, superCombat: 0, food: 0, other: 0,
};
const SATURATED = planItemByName('Saturated heart').id;
const IMBUED = planItemByName('Imbued heart').id;
const SHADOW = PRESETS.find((p) => p.name === 'Tumeken\'s shadow (Ancestral)')!;

const shadowDps = (a: BestSetupAssumptions, targetKey: string) => {
  const { monster } = buildTargetMonster(findTarget(targetKey), undefined, 'none', a);
  const player = applyPresetToPlayer(generateEmptyPlayer(), SHADOW, presetStyles(SHADOW)[0], null, monster, a);
  return { dps: evaluateLoadout(player, monster, false).dps, potions: player.buffs.potions };
};

describe('heart as a pinned item', () => {
  test('no magic potion supply type', () => {
    expect(SUPPLY_TYPES.map((t) => t.id)).not.toContain('magic');
    expect(Object.keys(DEFAULT_SUPPLIES)).not.toContain('magic');
  });

  test('the hearts resolve to pseudo items (not equipment ids, not the -1 "no weapon" sentinel)', () => {
    expect(HEART_ITEMS.map((h) => h.name)).toEqual(['Saturated heart', 'Imbued heart']);
    [SATURATED, IMBUED].forEach((id) => expect(id).toBeLessThan(-1));
    expect(planItemByName('Saturated heart').name).toBe('Saturated heart');
  });

  test('default pinned lists: the heart in FA and ToB, not in ToA / CoX (their raid potion boosts magic)', () => {
    expect(FRACTURED_ARCHIVE_RAID.planDefaults.pinned).toContain('Saturated heart');
    expect(THEATRE_OF_BLOOD_RAID.planDefaults.pinned).toContain('Saturated heart');
    expect(TOMBS_OF_AMASCUT_RAID.planDefaults.pinned).not.toContain('Saturated heart');
    expect(CHAMBERS_OF_XERIC_RAID.planDefaults.pinned).not.toContain('Saturated heart');
    expect(TOMBS_OF_AMASCUT_RAID.defaultSupplies.other).toBeGreaterThan(0);
    expect(CHAMBERS_OF_XERIC_RAID.defaultSupplies.other).toBeGreaterThan(0);
  });

  test.each([
    ['fractured-archive', DEFAULT_ASSUMPTIONS, 'xarth'],
    ['tob', THEATRE_OF_BLOOD_RAID.defaultAssumptions, 'tob-maiden'],
  ] as [string, BestSetupAssumptions, string][])('%s: magic is boosted iff a heart is pinned, with that heart', (_, a, targetKey) => {
    const without = planAssumptions(a, DEFAULT_SUPPLIES, []);
    const sat = planAssumptions(a, DEFAULT_SUPPLIES, [SATURATED]);
    const imb = planAssumptions(a, DEFAULT_SUPPLIES, [IMBUED]);
    expect(without.withoutPotion).toEqual(['magic']);
    expect(sat.withoutPotion).toBeUndefined();
    expect(sat.potions.magic).toBe(Potion.SATURATED_HEART);
    expect(imb.withoutPotion).toBeUndefined();
    expect(imb.potions.magic).toBe(Potion.IMBUED_HEART);
    // ranging / super combat are still supplies
    expect(planAssumptions(a, NO_SUPPLIES, [SATURATED]).withoutPotion).toEqual(['melee', 'ranged']);
    const off = shadowDps(without, targetKey);
    const on = shadowDps(sat, targetKey);
    expect(off.potions).toEqual([]);
    expect(on.potions).toEqual([Potion.SATURATED_HEART]);
    expect(on.dps).toBeGreaterThan(off.dps);
    // the Plan with a heart matches Search / Summary (which always assume it)
    expect(on.dps).toBe(shadowDps(a, targetKey).dps);
  });

  test.each([
    ['toa', TOMBS_OF_AMASCUT_RAID.defaultAssumptions, 'toa-zebak'],
    ['cox', CHAMBERS_OF_XERIC_RAID.defaultAssumptions, 'cox-tekton'],
  ] as [string, BestSetupAssumptions, string][])('%s: every style keeps the raid potion iff "Other" > 0; no heart needed', (_, a, targetKey) => {
    expect(planAssumptions(a, { ...NO_SUPPLIES, other: 1 }, [])).toBe(a);
    expect(planAssumptions(a, NO_SUPPLIES, []).withoutPotion).toEqual(['melee', 'ranged', 'magic']);
    // without the raid potion, a pinned heart still boosts magic
    const heart = planAssumptions(a, NO_SUPPLIES, [SATURATED]);
    expect(heart.withoutPotion).toEqual(['melee', 'ranged']);
    expect(heart.potions.magic).toBe(Potion.SATURATED_HEART);
    expect(shadowDps(a, targetKey).dps).toBeGreaterThan(shadowDps(planAssumptions(a, NO_SUPPLIES, []), targetKey).dps);
  });

  test('slot accounting: the heart takes one slot, counted once, never worn', () => {
    const base = kitSlotUsage([[1, 2, 3]], 0, [], NO_SUPPLIES, 0);
    const one = kitSlotUsage([[1, 2, 3]], 0, [SATURATED], NO_SUPPLIES, 0);
    const twice = kitSlotUsage([[1, 2, 3]], 0, [SATURATED, SATURATED], NO_SUPPLIES, 0);
    expect(one.used).toBe(base.used + 1);
    expect(twice.used).toBe(one.used);
    const heart = planItemByName('Saturated heart');
    const item = (id: number, slot: PlanItem['slot']): PlanItem => ({
      id, name: `item${id}`, version: '', slot,
    });
    const cells = inventoryGrid([{ equipment: { weapon: item(1, 'weapon') }, group: 'magic' }], 0, [], [heart, heart], NO_SUPPLIES, 0);
    expect(cells.filter((c) => c.kind === 'pinned').map((c) => c.label)).toEqual(['Saturated heart']);
    expect(cells.filter((c) => c.kind === 'supply')).toEqual([]);
  });

  test('a pinned heart is reported unused only when the kit has no magic loadout; never as an unused supply', () => {
    const r = plan({
      basePlayer: generateEmptyPlayer(),
      assumptions: DEFAULT_ASSUMPTIONS,
      drain: 'team',
      settings: RAID_TIME_DEFAULTS,
      route: 'archive-guardian>bork-smorks>moia>xarth>ocellus',
      pinned: [SATURATED],
      nonItemSlots: DEFAULT_NON_ITEM_SLOTS,
      supplies: { ...DEFAULT_SUPPLIES, ranging: 0 },
    }, {
      search: { weapons: ['Scythe of Vitur'], maxPasses: 1 },
      presets: PRESETS.filter((p) => p.name === 'Torva + Scythe (slash)'),
      perGroupWeapons: 1,
      perWeapon: 1,
      bases: 1,
      partners: 1,
      seeds: 2,
    });
    expect(r.kit.every((k) => k.group === 'melee')).toBe(true);
    expect(r.unusedSupplies).toEqual([]);
    expect(r.unusedCarried.map((x) => x.name)).toEqual(['Saturated heart']);
    expect(r.inventory.filter((c) => c.kind === 'pinned').map((c) => c.label)).toEqual(['Saturated heart']);
    expect(r.slots!.supplies).toBe(11); // 6 brews, 4 restores, 1 super combat: the heart is not a supply
  });
});
