import { describe, expect, test } from '@jest/globals';
import { generateEmptyPlayer } from '@/state';
import Potion from '@/enums/Potion';
import { availableEquipment } from '@/lib/Equipment';
import {
  applyPresetToPlayer, buildTargetMonster, evaluateLoadout, findTarget, presetStyles, resolvePresetEquipment,
} from '@/lib/fracturedArchive/bestSetup';
import {
  DEFAULT_RING_POLICY,
  equipmentById,
  equipmentItemIds,
  inventoryGrid,
  isQuiver,
  isQuiverAmmo,
  kitHeart,
  kitPotions,
  kitSlotUsage,
  lightenKit,
  plan,
  PlanEquipment,
  PlanInputs,
  PlanItem,
  planAssumptions,
  planItemByName,
  PlanResult,
  PlanTuning,
  QuiverSpec,
  quiverHeldAmmo,
  quiverSavedSlots,
  quiverSpecOf,
  SupplyCounts,
} from '@/lib/fracturedArchive/planner';
import { formatDuration } from '@/lib/fracturedArchive/raidTime';
import {
  BestSetupAssumptions, PresetDef, PRESETS, StyleGroup,
} from '@/lib/fracturedArchive/presets';
import { searchSpecSubsets, SHARE_MAX_SLOT_SECONDS, weaponDeltaText } from '@/lib/fracturedArchive/specChoice';
import { PlannerWeapon } from '@/lib/fracturedArchive/specs';
import {
  CHAMBERS_OF_XERIC_RAID, FRACTURED_ARCHIVE_RAID, RaidConfig, THEATRE_OF_BLOOD_RAID, TOMBS_OF_AMASCUT_RAID,
} from '@/lib/raids';

// Phase 31: (1) Dizana's quiver holds a second arrow / bolt type at no inventory cost; (2) the Saturated heart is
// magic's kit potion (one slot when the kit has a magic loadout, FA / ToB), not a pinned item; (3) the Solo spec-subset
// search prices a slot at SHARE_MAX_SLOT_SECONDS (a larger subset must save ≥ 1 s per extra slot).
// Docs: docs/BEST_SETUP.md (*Quiver ammo and the heart (phase 31)*), docs/UNVERIFIED.md D23.

const NO_SUPPLIES: SupplyCounts = {
  brew: 0, restore: 0, ranging: 0, superCombat: 0, food: 0, other: 0,
};
const FA = FRACTURED_ARCHIVE_RAID;
const SATURATED = planItemByName('Saturated heart').id;

// --- 1. quiver: toy kits, hand-computed ------------------------------------------------------------------------------

// toy ids: Q = a quiver, A1..A3 = arrow / bolt types, 1..5 = other items
const Q = 100;
const A1 = 201;
const A2 = 202;
const A3 = 203;
const TOY: QuiverSpec = { quivers: [Q], ammo: [A1, A2, A3] };
/** `null` = no quiver spec (the pre-phase-31 count). */
const used = (loadouts: number[][], quiver: QuiverSpec | null = TOY, worn = 0) => kitSlotUsage(loadouts, worn, [], NO_SUPPLIES, 0, 28, [], quiver ?? undefined);
/** The optimiser's count of the same kit (lightenKit without pruning = usedOf of the members). */
const optimiserUsed = (loadouts: number[][], quiver: QuiverSpec | null = TOY) => lightenKit({
  items: loadouts, carried: [], fixedSlots: 0, totalSlots: 28, time: () => 0, seeds: [0], quiver: quiver ?? undefined, noPrune: true,
}, loadouts.map((_, i) => i)).used;

describe('quiver: second arrow / bolt type costs 0 slots (toy kits)', () => {
  test('(a) quiver + 2 ammo types: the second one is free', () => {
    // union {1, 2, 3, Q, A1, A2} = 6, smallest loadout 3 → 3 slots; the quiver holds A2 → 2
    const k = [[1, 2, Q, A1], [3, Q, A2]];
    expect(used(k).used).toBe(2);
    expect(used(k).quiverAmmo).toBe(1);
    expect(used(k, null).used).toBe(3);
    expect(optimiserUsed(k)).toBe(2);
    // same whichever loadout is worn (the swap reserve covers the smaller one)
    expect(used(k, TOY, 1).used).toBe(2);
  });

  test('(b) quiver + 1 ammo type: nothing free', () => {
    // union {1, 2, 3, Q, A1} = 5, smallest 2 → 3
    const k = [[1, 2, Q, A1], [3, Q]];
    expect(used(k).used).toBe(3);
    expect(used(k).quiverAmmo).toBe(0);
    expect(optimiserUsed(k)).toBe(3);
  });

  test('(c) no quiver + 2 ammo types: both cost', () => {
    // item 4 in the cape slot instead of the quiver: union {1, 2, 3, 4, 5, A1, A2} = 7, smallest 3 → 4
    const k = [[1, 2, 4, A1], [3, 5, A2]];
    expect(used(k).used).toBe(4);
    expect(used(k).quiverAmmo).toBe(0);
    expect(used(k).used).toBe(used(k, null).used);
    expect(optimiserUsed(k)).toBe(4);
  });

  test('(d) quiver + 3 ammo types: only one is free', () => {
    // union {1, 2, 3, Q, A1, A2, A3} = 7, smallest 3 → 4, the quiver holds one → 3
    const k = [[1, Q, A1], [2, Q, A2], [3, Q, A3]];
    expect(used(k).used).toBe(3);
    expect(used(k).quiverAmmo).toBe(1);
    expect(optimiserUsed(k)).toBe(3);
    expect(quiverSavedSlots(new Set([Q, A1, A2, A3]), TOY)).toBe(1);
    expect(quiverSavedSlots(new Set([A1, A2, A3]), TOY)).toBe(0);
    expect(quiverSavedSlots(new Set([Q, A1, A2]), undefined)).toBe(0);
  });

  test('the inventory grid leaves the quiver-held ammo out (one per quiver) and reports it', () => {
    const it = (id: number, slot: PlanItem['slot']): PlanItem => ({
      id, name: `item${id}`, version: '', slot,
    });
    const kitOf = (ls: [number, PlanItem['slot']][][]) => ls.map((l) => ({
      group: 'ranged' as StyleGroup,
      equipment: Object.fromEntries(l.map(([id, slot]) => [slot, it(id, slot)])) as PlanEquipment,
    }));
    // (a) worn: 1, 2, Q, A1 → the switch is 3 + A2; A2 rides in the quiver: one cell (3)
    const a = kitOf([[[1, 'weapon'], [2, 'body'], [Q, 'cape'], [A1, 'ammo']], [[3, 'weapon'], [Q, 'cape'], [A2, 'ammo']]]);
    expect(quiverHeldAmmo(a, 0, [], TOY)?.id).toBe(A2);
    const cells = inventoryGrid(a, 0, [], [], NO_SUPPLIES, 0, 28, [], { quiver: TOY });
    expect(cells.filter((c) => c.kind === 'switch').map((c) => c.item!.id)).toEqual([3]);
    expect(cells.filter((c) => c.kind !== 'free').length).toBe(used([[1, 2, Q, A1], [3, Q, A2]]).used);
    // no quiver spec: A2 takes a cell (grid order = the equipment grid's: ammo before weapon)
    expect(inventoryGrid(a, 0, [], [], NO_SUPPLIES, 0).filter((c) => c.kind === 'switch').map((c) => c.item!.id)).toEqual([A2, 3]);
    // (d) worn 1, Q, A1: A2 in the quiver, A3 in the grid
    const d = kitOf([[[1, 'weapon'], [Q, 'cape'], [A1, 'ammo']], [[2, 'weapon'], [Q, 'cape'], [A2, 'ammo']], [[3, 'weapon'], [Q, 'cape'], [A3, 'ammo']]]);
    expect(quiverHeldAmmo(d, 0, [], TOY)?.id).toBe(A2);
    expect(inventoryGrid(d, 0, [], [], NO_SUPPLIES, 0, 28, [], { quiver: TOY }).filter((c) => c.kind === 'switch').map((c) => c.item!.id)).toEqual([2, A3, 3]);
    // (b) one type: nothing held
    const b = kitOf([[[1, 'weapon'], [Q, 'cape'], [A1, 'ammo']], [[3, 'weapon'], [Q, 'cape']]]);
    expect(quiverHeldAmmo(b, 1, [], TOY)).toBeNull();
  });
});

// --- 1b. quiver: the real items --------------------------------------------------------------------------------------

const byName = (name: string, version?: string) => {
  const e = availableEquipment.find((x) => x.name === name && (version === undefined || x.version === version));
  if (!e) throw new Error(`no item ${name}`);
  return equipmentById(e.id)!;
};

describe('quiver: which items count (wiki: "can only be filled with arrows or bolts")', () => {
  test('every Dizana\'s quiver variant (and the max cape / blessed quiver) is a quiver; the decorative armour is not', () => {
    availableEquipment.filter((e) => e.name === "Dizana's quiver").forEach((e) => expect(isQuiver(e)).toBe(true));
    expect(isQuiver(byName("Blessed Dizana's quiver"))).toBe(true);
    expect(isQuiver(byName("Dizana's max cape"))).toBe(true);
    expect(isQuiver(byName('Decorative armour (quiver)'))).toBe(false);
    expect(isQuiver(byName("Ava's assembler"))).toBe(false);
  });

  test('arrows and bolts are quiver ammo; blessings, javelins, atlatl darts and the bolt rack are not', () => {
    ['Dragon arrow', 'Seeking dragon arrow', 'Ruby dragon bolts (e)', 'Diamond bolts (e)', 'Diamond ascension bolts (e)', 'Broad arrows', 'Amethyst broad bolts']
      .forEach((n) => expect(isQuiverAmmo(byName(n))).toBe(true));
    ["Rada's blessing 4", 'Dragon javelin', 'Atlatl dart', 'Bolt rack', 'Holy blessing']
      .forEach((n) => expect(isQuiverAmmo(byName(n))).toBe(false));
    // blowpipe darts are not ammo-slot items at all (an item var of the blowpipe)
    expect(availableEquipment.filter((e) => e.name === 'Dragon dart').every((e) => e.slot !== 'ammo')).toBe(true);
  });

  test('quiverSpecOf on the FA presets: Twisted bow + Ascension crossbows (both wear the quiver) → one slot saved', () => {
    const ids = (name: string) => Object.values(resolvePresetEquipment(PRESETS.find((p) => p.name === name)!)).filter((x) => !!x).map((x) => x!.id);
    const tbow = ids('Twisted bow (Masori)');
    const asc = ids('Ascension crossbows + diamond (e) (Masori)');
    const scythe = ids('Torva + Scythe (slash)');
    const q = quiverSpecOf([...tbow, ...asc, ...scythe]);
    expect(q.quivers.map((id) => equipmentById(id)!.name)).toEqual(["Dizana's quiver"]);
    expect(q.ammo.map((id) => equipmentById(id)!.name).sort()).toEqual(['Diamond ascension bolts (e)', 'Seeking dragon arrow']);
    expect(kitSlotUsage([tbow, asc], 0, [], NO_SUPPLIES, 0, 28, [], q).quiverAmmo).toBe(1);
    // melee + one ranged loadout: one arrow type, the blessing doesn't count
    expect(kitSlotUsage([scythe, tbow], 0, [], NO_SUPPLIES, 0, 28, [], q).quiverAmmo).toBe(0);
  });
});

// --- 1c. brute force: the slot formula vs an exhaustive count over the worn states -----------------------------------

/**
 * Independent count (no planner code): for every loadout L the kit can wear, the inventory holds U \ L (U = every item
 * carried); the quiver (if carried) takes one arrow / bolt type out of it when the kit carries ≥ 2 such types (the
 * phase 31 rule). The kit needs the worst of those. Names checked by hand here, not with isQuiver / isQuiverAmmo.
 * Phase 32 (`keptAmmo`, the planner's count since): a loadout with no ammo-slot item keeps one of the kit's ammo items
 * in its ammo slot (one the quiver can't hold first), so it holds one item fewer in the inventory.
 */
const exhaustive = (loadouts: number[][], carried: number[], keptAmmo = false): number => {
  const U = new Set([...carried, ...loadouts.flat()]);
  const nameOf = (id: number) => equipmentById(id)?.name ?? '';
  const quiver = Array.from(U).some((id) => ["Dizana's quiver", "Blessed Dizana's quiver", "Dizana's max cape"].includes(nameOf(id)));
  const ammo = (id: number) => equipmentById(id)?.slot === 'ammo' && /arrow|bolts/i.test(nameOf(id)) && nameOf(id) !== 'Bolt rack';
  const types = Array.from(U).filter(ammo).length;
  const isAmmoSlot = (id: number) => equipmentById(id)?.slot === 'ammo';
  const kitAmmo = loadouts.flat().filter(isAmmoSlot);
  let worst = 0;
  loadouts.forEach((L) => {
    const worn = new Set(L);
    let inv = Array.from(U).filter((id) => !worn.has(id));
    if (keptAmmo && !L.some(isAmmoSlot)) {
      const kept = inv.find((id) => kitAmmo.includes(id) && !ammo(id)) ?? inv.find((id) => kitAmmo.includes(id));
      if (kept !== undefined) inv = inv.filter((id) => id !== kept);
    }
    const held = quiver && types >= 2 && inv.some(ammo) ? 1 : 0;
    worst = Math.max(worst, inv.length - held);
  });
  return worst;
};

describe('brute force: every subset of the FA presets', () => {
  test('kitSlotUsage (every worn index) and the optimiser equal the exhaustive count', () => {
    const pool = PRESETS.map((p) => Array.from(new Set(Object.values(resolvePresetEquipment(p)).filter((x) => !!x).map((x) => x!.id))));
    const q = quiverSpecOf(pool.flat());
    let saved = 0;
    for (let mask = 1; mask < (1 << pool.length); mask++) {
      const k = pool.filter((_, i) => (mask >> i) & 1);
      const ex = exhaustive(k, [SATURATED]);
      for (let w = 0; w < k.length; w++) expect(kitSlotUsage(k, w, [SATURATED], NO_SUPPLIES, 0, 28, [], q).used).toBe(ex);
      expect(lightenKit({
        items: k, carried: [SATURATED], fixedSlots: 0, totalSlots: 28, time: () => 0, seeds: [0], quiver: q, noPrune: true,
      }, k.map((_, i) => i)).used).toBe(ex);
      if (kitSlotUsage(k, 0, [], NO_SUPPLIES, 0, 28, [], q).quiverAmmo) saved += 1;
    }
    // the rule fires on some kits (the ranged presets wear the quiver with different ammo)
    expect(saved).toBeGreaterThan(0);
  });
});

// --- 2. heart as magic's kit potion ----------------------------------------------------------------------------------

const preset = (raid: RaidConfig, name: string): PresetDef => {
  const p = raid.presets.find((x) => x.name === name);
  if (!p) throw new Error(`no preset ${name}`);
  return p;
};
const reduced = (raid: RaidConfig, presets: PresetDef[], weapons: string[]): PlanTuning => ({
  model: raid.time,
  presets,
  search: { weapons, maxPasses: 1 },
  perGroupWeapons: 1,
  perWeapon: 1,
  bases: 1,
  partners: 1,
  seeds: 2,
});
const noSpecs = (a: BestSetupAssumptions): BestSetupAssumptions => ({
  ...a,
  mySpecs: {
    ...a.mySpecs, elderMaul: false, dwh: false, bgs: false, tonalztics: false, ayak: 0,
  },
});
const inputsFor = (raid: RaidConfig, patch: Partial<PlanInputs> = {}): PlanInputs => ({
  basePlayer: generateEmptyPlayer(),
  assumptions: noSpecs(raid.defaultAssumptions),
  drain: 'team',
  settings: raid.defaultTimeSettings,
  route: 'all',
  pinned: [],
  nonItemSlots: raid.planDefaults.nonItemSlots,
  supplies: raid.defaultSupplies,
  ...patch,
});
const runs = new Map<string, PlanResult>();
const planned = (key: string, raid: RaidConfig, tuning: PlanTuning, patch: Partial<PlanInputs> = {}) => {
  if (!runs.has(key)) runs.set(key, plan(inputsFor(raid, patch), tuning));
  return runs.get(key)!;
};
const total = (r: PlanResult) => r.comparison!.routes[r.planned].seconds;
const supplyCount = (s: SupplyCounts) => Object.values(s).reduce((t, x) => t + x, 0);
const FA_MAGIC = reduced(FA, [preset(FA, "Tumeken's shadow (Ancestral)")], ["Tumeken's shadow"]);
const FA_MELEE = reduced(FA, [preset(FA, 'Torva + Scythe (slash)')], ['Scythe of Vitur']);
const kitItems = (r: PlanResult) => r.kit.map((c) => equipmentItemIds(c.equipment));

describe('heart: magic\'s kit potion (FA / ToB)', () => {
  test('nothing pins the heart by default; kitHeart = pinned heart, else the Assumptions box\'s, else Saturated', () => {
    [FA, TOMBS_OF_AMASCUT_RAID, CHAMBERS_OF_XERIC_RAID, THEATRE_OF_BLOOD_RAID].forEach((r) => expect(r.planDefaults.pinned).not.toContain('Saturated heart'));
    const a = FA.defaultAssumptions;
    expect(kitHeart(a).name).toBe('Saturated heart');
    expect(kitHeart({ potions: { ...a.potions, magic: Potion.IMBUED_HEART } }).name).toBe('Imbued heart');
    expect(kitHeart(a, [planItemByName('Imbued heart').id]).name).toBe('Imbued heart');
    expect(kitHeart({ potions: { ...a.potions, magic: Potion.MAGIC } }).name).toBe('Saturated heart');
    expect(kitPotions(['magic'], true)).toEqual([{
      type: 'heart', label: 'Saturated heart', group: 'magic', heartId: SATURATED,
    }]);
    expect(kitPotions(['magic'], false)).toEqual([]);
  });

  test('(e) FA kit with a magic loadout: the heart counted once, in the potions, not pinned', () => {
    const r = planned('fa-magic', FA, FA_MAGIC);
    expect(r.kit.some((c) => c.group === 'magic')).toBe(true);
    expect(r.potions.map((p) => p.label)).toContain('Saturated heart');
    expect(r.pinnedItems).toEqual([]);
    const heartCells = r.inventory.filter((c) => c.label === 'Saturated heart');
    expect(heartCells.map((c) => c.kind)).toEqual(['potion']);
    // hand count: 6 brews + 4 restores (+ Super combat / Ranging potion if melee / ranged) + 1 rune pouch + the kit's
    // items without the heart + 1 heart
    const supplies = 10 + r.potions.filter((p) => p.type !== 'heart').length;
    const withoutHeart = kitSlotUsage(kitItems(r), 0, [], NO_SUPPLIES, 0, 28, [], quiverSpecOf(kitItems(r).flat())).used;
    expect(r.slots!.supplies).toBe(supplies);
    expect(r.slots!.used).toBe(supplies + 1 + withoutHeart + 1);
    expect(r.unusedCarried).toEqual([]);
  }, 300000);

  test('(f) FA kit without magic: no heart slot', () => {
    const r = planned('fa-melee', FA, FA_MELEE);
    expect(r.kit.every((c) => c.group === 'melee')).toBe(true);
    expect(r.potions.map((p) => p.type)).toEqual(['superCombat']);
    expect(r.inventory.some((c) => c.label === 'Saturated heart')).toBe(false);
    const withoutHeart = kitSlotUsage(kitItems(r), 0, [], NO_SUPPLIES, 0, 28, [], quiverSpecOf(kitItems(r).flat())).used;
    expect(r.slots!.used).toBe(10 + 1 + 1 + withoutHeart); // brews / restores, Super combat, rune pouch, items
  }, 300000);

  test('(g) the user pins the heart + a magic loadout: counted once (same slots, same time as unpinned)', () => {
    const free = planned('fa-magic', FA, FA_MAGIC);
    const pinned = planned('fa-magic-pinned', FA, FA_MAGIC, { pinned: [SATURATED] });
    expect(pinned.pinnedItems.map((x) => x.name)).toEqual(['Saturated heart']);
    expect(pinned.slots!.used).toBe(free.slots!.used);
    expect(total(pinned)).toBeCloseTo(total(free), 9);
    expect(pinned.inventory.filter((c) => c.label === 'Saturated heart').length).toBe(1);
    expect(pinned.potions.map((p) => p.label)).toContain('Saturated heart');
    expect(pinned.unusedCarried).toEqual([]);
    // pinned without a magic loadout: carried anyway (one slot) and reported unused
    const melee = planned('fa-melee-pinned', FA, FA_MELEE, { pinned: [SATURATED] });
    expect(melee.unusedCarried.map((x) => x.name)).toEqual(['Saturated heart']);
    expect(melee.slots!.used).toBe(planned('fa-melee', FA, FA_MELEE).slots!.used + 1);
  }, 300000);

  test('magic keeps the heart\'s boost: the plan\'s DPS = Search\'s (heart assumed) = the phase 30 pinned-heart DPS', () => {
    const shadow = PRESETS.find((p) => p.name === "Tumeken's shadow (Ancestral)")!;
    const dps = (a: BestSetupAssumptions) => {
      const { monster } = buildTargetMonster(findTarget('xarth'), undefined, 'none', a);
      const player = applyPresetToPlayer(generateEmptyPlayer(), shadow, presetStyles(shadow)[0], null, monster, a);
      return { dps: evaluateLoadout(player, monster, false).dps, potions: player.buffs.potions };
    };
    const a = FA.defaultAssumptions;
    const now = dps(planAssumptions(a, FA.defaultSupplies, []));
    expect(now.potions).toEqual([Potion.SATURATED_HEART]);
    expect(now.dps).toBe(dps(a).dps);
    expect(now.dps).toBe(dps(planAssumptions(a, FA.defaultSupplies, [SATURATED])).dps);
    expect(now.dps).toBeGreaterThan(dps({ ...a, withoutPotion: ['magic'] }).dps);
  });

  test('ToB: same rule (magic kit → the heart in the potions)', () => {
    const tob = THEATRE_OF_BLOOD_RAID;
    const magic = tob.presets.find((p) => p.group === 'magic')!;
    const r = planned('tob-magic', tob, reduced(tob, [magic], ["Tumeken's shadow"]));
    expect(r.kit.some((c) => c.group === 'magic')).toBe(true);
    expect(r.potions.filter((p) => p.type === 'heart').map((p) => p.label)).toEqual(['Saturated heart']);
    expect(r.inventory.filter((c) => c.kind === 'potion').length).toBe(1);
  }, 300000);

  test.each([
    ['toa', TOMBS_OF_AMASCUT_RAID, 'toa-zebak'],
    ['cox', CHAMBERS_OF_XERIC_RAID, 'cox-tekton'],
  ] as [string, RaidConfig, string][])('(h) %s: no heart slot, magic still boosted by the raid potion (DPS as before)', (id, raid, targetKey) => {
    const magic = raid.presets.find((p) => p.group === 'magic')!;
    const r = planned(`${id}-magic`, raid, reduced(raid, [magic, ...raid.presets.filter((p) => p.name.includes('pickaxe'))], ["Tumeken's shadow"]));
    expect(r.kit.some((c) => c.group === 'magic')).toBe(true);
    expect(r.potions).toEqual([]);
    expect(r.inventory.some((c) => c.kind === 'potion' || c.label.endsWith('heart'))).toBe(false);
    expect(r.slots!.supplies).toBe(supplyCount(raid.defaultSupplies));
    // the assumptions the plan uses are the raid's own (the "Other" potion boosts every style): same DPS as before
    const a = raid.defaultAssumptions;
    expect(planAssumptions(a, raid.defaultSupplies, [])).toBe(a);
    const { monster } = buildTargetMonster(findTarget(targetKey), undefined, 'none', a);
    const player = applyPresetToPlayer(generateEmptyPlayer(), magic, presetStyles(magic)[0], null, monster, planAssumptions(a, raid.defaultSupplies, []));
    expect(player.buffs.potions.length).toBeGreaterThan(0);
  }, 300000);
});

// --- 3. the Solo subset search's slot price --------------------------------------------------------------------------

describe('Solo subset search: ≥ 1 s per extra slot', () => {
  // Tonalztics alone saves 10 s; Elder maul on top saves `extra` more for one more slot
  const toy = (extra: number, slotSeconds?: number) => {
    const t: Record<string, number> = {
      '': 100, tonalztics: 90, elderMaul: 99, 'elderMaul+tonalztics': 90 - extra,
    };
    return searchSpecSubsets<PlannerWeapon>({
      weapons: ['elderMaul', 'tonalztics'],
      signature: (s) => s.join('+'),
      slots: (s) => s.length,
      quick: (s) => t[s.join('+')],
      ...(slotSeconds !== undefined ? { slotSeconds } : {}),
    });
  };

  test('(i) a second weapon saving 0.5 s is not brought; 1.5 s is', () => {
    expect(SHARE_MAX_SLOT_SECONDS).toBe(1);
    const half = toy(0.5);
    expect(half.best).toEqual(['tonalztics']);
    expect(half.seconds).toBe(90);
    const maul = half.perWeapon.find((d) => d.weapon === 'elderMaul')!;
    expect(maul).toMatchObject({ chosen: false, deltaSeconds: 0.5, deltaSlots: 1 });
    expect(weaponDeltaText(maul)).toBe('adding Elder maul to this plan: −0.5 s (1 slot, < 1 s per slot)');
    expect(half.bestRejected?.weapon).toBe('elderMaul');
    const more = toy(1.5);
    expect(more.best).toEqual(['elderMaul', 'tonalztics']);
    expect(more.seconds).toBe(88.5);
    expect(weaponDeltaText(more.perWeapon.find((d) => d.weapon === 'elderMaul')!)).toBe('dropping Elder maul from this plan: +1.5 s (frees 1 slot)');
    // exactly 1 s per slot: brought (≥, like the kit switches)
    expect(toy(1).best).toEqual(['elderMaul', 'tonalztics']);
    // slotSeconds 0 = the phase 29 ranking (fastest)
    expect(toy(0.5, 0).best).toEqual(['elderMaul', 'tonalztics']);
    // a lone weapon saving < 1 s isn't brought either
    expect(searchSpecSubsets<PlannerWeapon>({
      weapons: ['elderMaul'], signature: (s) => s.join('+'), slots: (s) => s.length, quick: (s) => (s.length ? 99.4 : 100),
    }).best).toEqual([]);
  });
});

// --- slow: the full FA plans -----------------------------------------------------------------------------------------
/** Phase 31: FA Solo party 1 (defaults, planner decides). Pinned after the run; see PROGRESS. */
// phase 36 (one spec budget per encounter; damage specs; the surge potion): 22:01.9 → 21:54.8
// phase 36 review (damage specs at the hp left; regen on the drained clock): 21:54.8 → 21:59.0
const SOLO_HEADLINE: [string, number] = ['21:59.0', 1319.0];

(process.env.RUN_SLOW_TESTS ? describe : describe.skip)('FA defaults (slow)', () => {
  const full = (patch: Partial<PlanInputs>) => plan({
    ...inputsFor(FA, patch),
    assumptions: patch.assumptions ?? FA.defaultAssumptions,
    pinned: [],
    ringPolicy: DEFAULT_RING_POLICY,
    specMode: 'auto',
  }, { model: FA.time });

  test('Solo, party 1, planner decides: Bring Tonalztics (Elder maul saves < 1 s for its slot)', () => {
    const r = full({ drain: 'solo', assumptions: { ...FA.defaultAssumptions, partySize: 1 } });
    expect(r.specs.bring).toEqual(['tonalztics']);
    expect(formatDuration(total(r))).toBe(SOLO_HEADLINE[0]);
    expect(Math.abs(total(r) - SOLO_HEADLINE[1])).toBeLessThanOrEqual(0.05);
    // every weapon not brought saves < 1 s per slot (or costs time)
    r.specs.solo!.perWeapon.filter((d) => !d.chosen).forEach((d) => expect(d.deltaSeconds).toBeLessThan(d.deltaSlots * SHARE_MAX_SLOT_SECONDS));
    // the slot count = the exhaustive count of the returned kit (heart and spec weapons carried)
    const carried = [...r.specItems.map((x) => x.id), ...(r.potions.some((p) => p.type === 'heart') ? [SATURATED] : [])];
    expect(r.slots!.used).toBe(r.slots!.supplies + r.slots!.nonItem + exhaustive(kitItems(r), carried, true));
  }, 900000);

  test('Team (default): the slot count = the exhaustive count; the quiver holds the second ammo type when there is one', () => {
    const r = full({});
    const carried = [...r.specItems.map((x) => x.id), ...(r.potions.some((p) => p.type === 'heart') ? [SATURATED] : [])];
    expect(r.slots!.used).toBe(r.slots!.supplies + r.slots!.nonItem + exhaustive(kitItems(r), carried, true));
    expect(r.slots!.quiverAmmo).toBe(r.quiverAmmo ? 1 : 0);
    if (r.quiverAmmo) expect(isQuiverAmmo(equipmentById(r.quiverAmmo.id))).toBe(true);
    expect(r.inventory.some((c) => c.item?.id === r.quiverAmmo?.id)).toBe(false);
    expect(r.pinnedItems).toEqual([]);
  }, 900000);
});
