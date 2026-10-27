import { EquipmentPiece, Player, PlayerEquipment } from '@/types/Player';
import { Monster } from '@/types/Monster';
import Potion from '@/enums/Potion';
import {
  AmmoApplicability, ammoApplicability, availableEquipment, getCanonicalItemId,
} from '@/lib/Equipment';
import {
  applyLoadoutToPlayer,
  buildTargetMonster,
  DrainStateId,
  evaluateLoadout,
  findTarget,
  presetSpells,
  presetStyles,
  resolveItem,
  resolvePresetEquipment,
  monsterForSpecCounts,
  specCountsDrainKey,
  styleLabel,
} from '@/lib/fracturedArchive/bestSetup';
import {
  BestSetupAssumptions, ItemRef, PresetDef, StyleGroup,
} from '@/lib/fracturedArchive/presets';
import {
  GearSearchOptions, GearSearchProgress, GearSearchResult, runGearSearch, SearchItem, SearchRow, StyleOption,
} from '@/lib/fracturedArchive/search';
import {
  assertTimeModelForRaid,
  compareRoutes,
  createKitEvaluator,
  drainFightSecondsOf,
  EncounterId,
  EncounterTime,
  encounterTime,
  FA_TIME_MODEL,
  formatDuration,
  KitChoice,
  kitEvaluatorCache,
  KitLoadout,
  PhaseQuery,
  phaseKey,
  RaidKit,
  RaidTimeAssumptions,
  raidTimeAssumptionsFrom,
  surgeClockSpan,
  RaidTimeModel,
  Route,
  RouteComparison,
  routesFor,
  specCountsKey,
  specHitsOf,
} from '@/lib/fracturedArchive/raidTime';
import { scaleMonster } from '@/lib/MonsterScaling';
import {
  atHpLeft, DAMAGE_SPEC_WEAPON_IDS, DAMAGE_SPEC_WEAPONS, damageSpecItemName, damageSpecLabel, damageSpecProfile, DamageSpecWeapon,
} from '@/lib/fracturedArchive/damageSpecs';
import { EncounterAlloc, encounterWallSeconds } from '@/lib/fracturedArchive/encounterBudget';
import { createKitMemo } from '@/lib/fracturedArchive/kitMemo';
import { dosesAllowed, SURGE_DOSES_PER_POTION } from '@/lib/fracturedArchive/specBudget';
import { assumptionsForTarget } from '@/lib/raids/toa/supplies';
import { raidBase } from '@/lib/raids/base';
import { TimeSettings } from '@/lib/raids/types';
import {
  DEFAULT_FIGHT_SECONDS, drainModel, LIGHTBEARER_REGEN_SECONDS, PlannerWeapon, SPEC_REGEN_SECONDS, SPEC_WEAPONS, SpecWeapon,
} from '@/lib/fracturedArchive/specs';
import { DefenceReductions } from '@/lib/fracturedArchive/drains';
import {
  assignMe,
  bringText,
  CarrierCounts,
  carriersText,
  CarrierStep,
  greedyCarriers,
  itemBeam,
  ItemBeamChild,
  itemStepNet,
  mostNeededWeapon,
  mySpecsForSubset,
  NO_CARRIERS,
  pickSpecItem,
  pickSeeds,
  RoleTarget,
  rowsFromCarriers,
  searchSpecSubsets,
  SHARE_MAX_SLOT_SECONDS,
  ShareDecision,
  SPEC_CANDIDATES,
  specWeaponLabel,
  SUBSET_GUARD_FACTOR,
  SubsetSearchResult,
  TeamRoles,
  teamRoles,
} from '@/lib/fracturedArchive/specChoice';
import { FA_PLAN_DEFAULTS } from '@/lib/raids/planDefaults';
import {
  filterPresets, isOwned, normaliseNotOwned, unownedBase,
} from '@/lib/fracturedArchive/ownership';

/**
 * Phase 17: raid planner ("Plan" tab of /best-setup). Pure and React-free: runs in the search worker
 * (WorkerRequestType.RAID_PLAN) and in Jest. Docs: docs/BEST_SETUP.md, *Plan tab*.
 *
 * Turns the user's constraints (28 inventory slots, supplies, items always carried, spec weapons) into the kit — a
 * worn loadout plus switch items — that minimises the route time of the phase 16 model (raidTime.ts):
 *
 * 1. Candidates. One all-style gear search per phase target the route(s) query; per phase and style group the best
 *    `perGroupWeapons` weapons, and up to `perWeapon` distinct loadouts of each, plus every preset. Then partial
 *    switches: for a base loadout A (the best `bases` per style) and a partner B of another style (the best `partners`
 *    per style, plus the best loadout of every carried weapon), A with B's weapon (+ ammo, + shield or none if
 *    two-handed) and B's k best other pieces, k = 0..all. Pieces are ranked by the DPS each adds on B's best phase
 *    (the phase where B is closest to the best candidate); pieces carried anyway (pinned) come first since they're
 *    free. Duplicates (same items + group) are merged; the total is capped at `maxCandidates`.
 * 2. DPS matrix: every candidate × every phase target, under the chosen drain state, evaluated once (best of its
 *    style options; can't hit → 0).
 * 3. Slot cost: inventory items = |items of all kit loadouts ∪ pinned ∪ spec weapons| − min over kit loadouts of its
 *    item count (the most the inventory ever holds: while wearing the smallest loadout); + supplies + non-item slots.
 *    Must be ≤ 28. Which loadout is worn doesn't change this, so the worn set is the loadout used on the route's first
 *    phase (saves a switch).
 * 4. Optimiser (`optimiseKit`): from each seed (the best `seeds` single loadouts by their own route time), two greedy
 *    passes — add the candidate with the best Δtime / Δslots, and the one with the best Δtime — while one fits and
 *    improves; then local search (swap one kit loadout for another candidate; drop one that doesn't help) until no
 *    change. Best kit overall: lowest time, then fewest slots. Deterministic (fixed orders, stable ties).
 *    The inner loop times kits from the matrix with drains planned at the fixed fight length (exact for Team / None,
 *    an approximation for Solo); the reported times are recomputed with `createKitEvaluator` + `compareRoutes`.
 *
 * Phase 21: per-raid defaults (`RaidBase.planDefaults`); raid-supplied items (ToB's Dawnbringer) cost 0 slots and the
 * raid weapon is put, weapon only, on every full candidate of another style; single-piece swaps within a base's weapon
 * (e.g. + Salve amulet(ei)); the dedupe rule (`SWITCH_MIN_*`) prunes every optimiser result.
 */

export const INVENTORY_SLOTS = 28;

// --- inputs --------------------------------------------------------------------------------------------------------

export type SupplyType = 'brew' | 'restore' | 'ranging' | 'superCombat' | 'food' | 'other';

/**
 * Supply types; `image` = file under src/public/img/potions (Ranging, Super combat) or src/public/img/supplies (phase 30:
 * wiki inventory images; null = generic icon). No magic potion supply: the magic boost is a heart (Saturated /
 * Imbued, `HEART_ITEMS`), reusable, one slot for the whole raid; phase 31: it is magic's kit potion (`kitPotions`).
 */
export const SUPPLY_TYPES: { id: SupplyType, label: string, image: string | null }[] = [
  { id: 'brew', label: 'Saradomin brew', image: 'Saradomin brew(4).png' },
  { id: 'restore', label: 'Super restore', image: 'Super restore(4).png' },
  { id: 'ranging', label: 'Ranging potion', image: 'Ranging.png' },
  { id: 'superCombat', label: 'Super combat', image: 'Super combat.png' },
  { id: 'food', label: 'Food', image: 'Anglerfish.png' },
  { id: 'other', label: 'Other', image: null },
];

export type SupplyCounts = Record<SupplyType, number>;

/**
 * The Fractured Archive's default comfort supplies (6 brew / 4 restore; phase 27: the combat potions come from the kit).
 * Phase 21: each raid has its own (`RaidBase.planDefaults`, src/lib/raids/planDefaults.ts); this name stays for the
 * phase 17 code and tests.
 */
export const DEFAULT_SUPPLIES: SupplyCounts = FA_PLAN_DEFAULTS.supplies;

/**
 * Phase 27: the supplies the user enters ("Comfort supplies (your call)"): brews, restores, food, other. The combat
 * potions (`KIT_POTIONS`) are not inputs any more.
 */
export const COMFORT_SUPPLY_TYPES: SupplyType[] = ['brew', 'restore', 'food', 'other'];

/** The comfort part of a supply count (combat potions zeroed: the planner derives them from the kit). */
export const comfortSupplies = (s: SupplyCounts): SupplyCounts => ({ ...s, ranging: 0, superCombat: 0 });

/**
 * Phase 27: the potion each style brings where the potions are brought (FA, ToB: `boostsNeedSupplies`): a kit with a
 * melee loadout brings one Super combat, with a ranged loadout one Ranging potion (one potion item = one slot, whatever
 * its doses). Phase 31: magic's is the heart (`kitHeart`: a pinned heart, else the Assumptions box's heart, else the
 * Saturated heart), one slot only when the kit has a magic loadout. ToA / CoX: the raid potion ("Other").
 */
export const KIT_POTIONS: Partial<Record<StyleGroup, SupplyType>> = {
  melee: 'superCombat', ranged: 'ranging',
};

/** Phase 21 name of the inverse map (supply → style); kept for the inventory code and tests. */
export const SUPPLY_POTION_GROUP: Partial<Record<SupplyType, StyleGroup>> = {
  superCombat: 'melee', ranging: 'ranged',
};

/** Slots taken by a kit's potions: one per distinct potion among its members (null = none). */
export const potionSlots = (potions: (string | null | undefined)[]): number => new Set(potions.filter((x) => !!x)).size;

const GROUP_ORDER_POTIONS: StyleGroup[] = ['melee', 'ranged', 'magic'];

/** Phase 31: a kit potion: a supply potion (melee / ranged) or the heart (magic). */
export type KitPotionType = SupplyType | 'heart';

export interface KitPotion {
  type: KitPotionType;
  label: string;
  group: StyleGroup;
  /** Phase 31: the heart's pseudo id (magic only). */
  heartId?: number;
}

/**
 * The magic boost items: reusable, one inventory slot for the whole raid, never worn. Not equipment, so they have
 * pseudo ids (negative, far from the `-1` "no weapon" sentinel) that live in the pinned list next to equipment ids;
 * `planItemByName` resolves their names. `image` = file under src/public/img/potions.
 */
export const HEART_ITEMS: { id: number, name: string, potion: Potion, image: string }[] = [
  {
    id: -9001, name: 'Saturated heart', potion: Potion.SATURATED_HEART, image: 'Saturated heart.png',
  },
  {
    id: -9002, name: 'Imbued heart', potion: Potion.IMBUED_HEART, image: 'Imbued heart.png',
  },
];

export const heartById = (id: number) => HEART_ITEMS.find((h) => h.id === id);
export const heartByPotion = (p: Potion) => HEART_ITEMS.find((h) => h.potion === p);

/** The first heart among the pinned ids (equipment ids + heart pseudo ids), if any. */
export const pinnedHeart = (pinned: number[]) => pinned.map(heartById).find((h) => !!h);

/**
 * Phase 31: the heart magic's kit potion is: a pinned heart (then it is carried anyway: counted once, with the pinned
 * items), else the Assumptions box's heart (its magic potion), else the Saturated heart.
 */
export const kitHeart = (a: Pick<BestSetupAssumptions, 'potions'>, pinned: number[] = []): typeof HEART_ITEMS[number] => (
  pinnedHeart(pinned) ?? heartByPotion(a.potions.magic) ?? HEART_ITEMS[0]);

/**
 * Phase 27: the potions a kit of these style groups brings (none in ToA / CoX). Phase 31: magic brings `heart` (default
 * the Saturated heart), shown beside the potions.
 */
export const kitPotions = (
  groups: StyleGroup[],
  boostsNeedSupplies: boolean,
  heart: typeof HEART_ITEMS[number] = HEART_ITEMS[0],
): KitPotion[] => (boostsNeedSupplies ? GROUP_ORDER_POTIONS.filter((g) => groups.includes(g)).map((g): KitPotion => {
  if (g === 'magic') {
    return {
      type: 'heart', label: heart.name, group: g, heartId: heart.id,
    };
  }
  return { type: KIT_POTIONS[g]!, label: SUPPLY_TYPES.find((x) => x.id === KIT_POTIONS[g])!.label, group: g };
}) : []);

/**
 * Phase 27: the comfort supplies plus the kit's potions (what the inventory holds). Phase 31: the heart is an item (its
 * pseudo id, carried with the kit), not a supply count.
 */
export const kitSupplies = (comfort: SupplyCounts, groups: StyleGroup[], boostsNeedSupplies: boolean): SupplyCounts => {
  const out = comfortSupplies(comfort);
  kitPotions(groups, boostsNeedSupplies).forEach((p) => {
    if (p.type !== 'heart') out[p.type] = 1;
  });
  return out;
};

/**
 * The best-setup assumptions as the plan uses them (Search / Summary always assume every style's boost):
 * - potions brought (FA, ToB: `boostsNeedSupplies`): phase 27: melee / ranged keep their boost (the kit brings the
 *   potion of every style it has: `KIT_POTIONS`, counted in its slot cost); phase 31: magic likewise, with `kitHeart`'s
 *   boost (the kit brings the heart when it has a magic loadout, one slot).
 * - raid potions (ToA Smelling salts, CoX Overload: boost every style): every style keeps the raid's boost iff the
 *   "Other" supply count is > 0; with none, magic falls back to a pinned heart, melee / ranged lose the boost.
 */
export const planAssumptions = (a: BestSetupAssumptions, supplies: SupplyCounts, pinned: number[] = []): BestSetupAssumptions => {
  if (!raidBase(a.raid).boostsNeedSupplies) {
    const heart = pinnedHeart(pinned);
    if (supplies.other > 0) return a;
    if (heart) return { ...a, potions: { ...a.potions, magic: heart.potion }, withoutPotion: ['melee', 'ranged'] };
    return { ...a, withoutPotion: ['melee', 'ranged', 'magic'] };
  }
  const heart = kitHeart(a, pinned);
  return a.potions.magic !== heart.potion ? { ...a, potions: { ...a.potions, magic: heart.potion } } : a;
};

/**
 * Items the user always brings in the Fractured Archive (the user's own kit, 2026-10-23); spec weapons come from "My
 * specs" on top. Phase 21: per raid in `RaidBase.planDefaults.pinned`; this name stays for the phase 17 code and tests.
 */
export const DEFAULT_PINNED_NAMES: ItemRef[] = FA_PLAN_DEFAULTS.pinned;

/** Non-equipment slots (rune pouch, teleports, ...); the first is labelled "Rune pouch". */
export const DEFAULT_NON_ITEM_SLOTS = FA_PLAN_DEFAULTS.nonItemSlots;

/**
 * Phase 21 dedupe rule for kit loadouts (applied to every optimiser result: `optimiseKit`'s prune step): a loadout stays in the kit only
 * if removing it would cost at least `SWITCH_MIN_SAVING_SECONDS` of route time, and at least
 * `SWITCH_MIN_SECONDS_PER_SLOT` per inventory slot it takes. So a switch that costs 0 extra slots but saves < 1 s (a
 * near-duplicate of another loadout: same weapon, one different piece) is dropped, and a switch must save ≥ 1 s per
 * extra slot. Switching costs a tick in-game while the model counts it as free, so sub-second differences are noise.
 */
export const SWITCH_MIN_SAVING_SECONDS = 1;
export const SWITCH_MIN_SECONDS_PER_SLOT = 1;

/** The seconds a kit loadout taking `slots` extra inventory slots must save to stay (the dedupe rule). */
export const switchSavingRequired = (slots: number): number => Math
  .max(SWITCH_MIN_SAVING_SECONDS, Math.max(0, slots) * SWITCH_MIN_SECONDS_PER_SLOT);

const SPEC_ORDER: SpecWeapon[] = ['elderMaul', 'dwh', 'bgs', 'tonalztics', 'ayak'];

/** Item names of the drain weapons the user carries ("Specs I bring", phase 23-28 "My specs"; Ayak when its spec count > 0). */
export const carriedSpecWeaponNames = (mySpecs: BestSetupAssumptions['mySpecs']): ItemRef[] => SPEC_ORDER
  .filter((k) => (k === 'ayak' ? mySpecs.ayak > 0 : mySpecs[k as 'elderMaul' | 'dwh' | 'bgs' | 'tonalztics']))
  .map((k) => SPEC_WEAPONS[k].item);

// --- items ---------------------------------------------------------------------------------------------------------

/** Phase 21: equipment ids of the raid's own items (`RaidBase.planDefaults.raidSupplied`; every version of each name). */
export const raidSuppliedItemIds = (a: Pick<BestSetupAssumptions, 'raid'>): number[] => {
  const names = new Set(raidBase(a.raid).planDefaults.raidSupplied.map((r) => (typeof r === 'string' ? r : r[0])));
  if (!names.size) return [];
  return availableEquipment.filter((e) => names.has(e.name)).map((e) => e.id).sort((x, y) => x - y);
};

export type Slot = keyof PlayerEquipment;

/** Every equipment slot, in the calculator's grid order (EquipmentGrid.tsx). */
export const ALL_SLOTS: Slot[] = ['head', 'cape', 'neck', 'ammo', 'weapon', 'body', 'shield', 'legs', 'hands', 'feet', 'ring'];

/** Slots a partial switch can take from the partner piece by piece (weapon, ammo and shield go with the weapon). */
export const PIECE_SLOTS: Slot[] = ['head', 'body', 'legs', 'cape', 'neck', 'hands', 'feet', 'ring'];

export interface PlanItem extends SearchItem {
  slot: Slot;
  twoHanded?: boolean;
}

export type PlanEquipment = Partial<Record<Slot, PlanItem>>;

let byId: Map<number, EquipmentPiece> | null = null;
export const equipmentById = (id: number): EquipmentPiece | undefined => {
  if (!byId) {
    byId = new Map();
    availableEquipment.forEach((e) => byId!.set(e.id, e));
  }
  return byId.get(id);
};

// --- quiver (phase 31) ----------------------------------------------------------------------------------------------

/**
 * Phase 31: Dizana's quiver's extra ammunition slot. Wiki (https://oldschool.runescape.wiki/w/Dizana%27s_quiver, read
 * 2026-10-24): "The quiver provides an additional ammunition slot, which can only be filled with arrows or bolts", "only
 * appearing if the quiver is in the inventory or equipped". So a kit that carries a quiver (any variant, worn or not)
 * holds one extra arrow / bolt type in it at no inventory cost. Blessed Dizana's quiver and Dizana's max cape keep the
 * quiver's perks (their pages; UNVERIFIED D23); javelins, atlatl darts, blessings and blowpipe darts don't go in it.
 * Phase 32: the max cape page (https://oldschool.runescape.wiki/w/Dizana%27s_max_cape, read 2026-10-24) in full: "it
 * only acts as a cosmetic upgrade to blessed Dizana's quiver with the following exceptions when worn: [the skill-cape
 * perks]" and, as its own paragraph, "The cape retains the perks of the blessed Dizana's quiver. It cannot normally be
 * hung on a cape hanger if it contains arrows." ("when worn" is the max-cape exceptions'; the page doesn't say whether
 * the extra slot works from the inventory: assumed like the quiver's.) Two types of the same kind (bolts + bolts) still
 * free the slot, though switching between them needs a manual swap through a free slot (not modelled; D23).
 */
export const QUIVER_NAMES = ["Dizana's quiver", "Blessed Dizana's quiver", "Dizana's max cape"];

/** Item ids the quiver logic looks at: the quivers and the ammo the quiver's extra slot takes. */
export interface QuiverSpec {
  quivers: number[];
  ammo: number[];
}

/** An arrow / bolt (ammo slot, the name says arrow or bolts; Karil's bolt rack is not counted, UNVERIFIED D23). */
export const isQuiverAmmo = (p: Pick<EquipmentPiece, 'name' | 'slot'> | undefined): boolean => !!p && p.slot === 'ammo'
  && /\b(arrows?|bolts?)\b/i.test(p.name) && p.name !== 'Bolt rack';

export const isQuiver = (p: Pick<EquipmentPiece, 'name'> | undefined): boolean => !!p && QUIVER_NAMES.includes(p.name);

/** The quiver spec of these item ids (real equipment ids; pseudo ids such as hearts are ignored). */
export const quiverSpecOf = (ids: Iterable<number>): QuiverSpec => {
  const quivers: number[] = [];
  const ammo: number[] = [];
  new Set(ids).forEach((id) => {
    const e = equipmentById(id);
    if (isQuiver(e)) quivers.push(id);
    else if (isQuiverAmmo(e)) ammo.push(id);
  });
  return { quivers: quivers.sort((a, b) => a - b), ammo: ammo.sort((a, b) => a - b) };
};

/**
 * Phase 31: inventory slots the quiver saves for a kit carrying the item ids `all` (the union of its loadouts and the
 * carried items): 1 when a quiver is among them and at least two distinct arrow / bolt types are (one of them is
 * worn or in the inventory, one sits in the quiver), else 0. Only one extra type per quiver.
 */
export const quiverSavedSlots = (all: { has: (id: number) => boolean }, q: QuiverSpec | undefined): number => {
  if (!q || !q.quivers.some((id) => all.has(id))) return 0;
  let n = 0;
  for (const id of q.ammo) {
    if (all.has(id)) n += 1;
    if (n >= 2) return 1;
  }
  return 0;
};

export const toPlanItem = (p: EquipmentPiece, slot: Slot = p.slot as Slot): PlanItem => ({
  id: p.id,
  name: p.name,
  version: p.version,
  slot,
  ...(p.itemVars ? { itemVars: p.itemVars } : {}),
  ...(p.isTwoHanded ? { twoHanded: true } : {}),
});

/** A heart as a plan item (inventory only: never worn, so `slot` is a placeholder no loadout reads). */
export const heartPlanItem = (h: typeof HEART_ITEMS[number]): PlanItem => ({
  id: h.id, name: h.name, version: '', slot: 'ring',
});

/**
 * Phase 36: Surge potions (4 doses each; one inventory slot each). Not equipment: pseudo ids like the hearts. The first
 * is the planner's 1-slot candidate, the second only when the route allows more than 4 doses (`dosesAllowed`).
 * `image` = file under src/public/img/supplies (the wiki's Surge potion(4) inventory image).
 */
export const SURGE_ITEMS: { id: number, name: string, image: string }[] = [
  { id: -9101, name: 'Surge potion(4)', image: 'Surge potion(4).png' },
  { id: -9102, name: 'Surge potion(4) (second)', image: 'Surge potion(4).png' },
];
export const surgeById = (id: number) => SURGE_ITEMS.find((s) => s.id === id);
export const surgePlanItem = (s: typeof SURGE_ITEMS[number]): PlanItem => ({
  id: s.id, name: s.name, version: '', slot: 'ring',
});

export const planItemByName = (name: ItemRef): PlanItem => {
  const heart = typeof name === 'string' ? HEART_ITEMS.find((h) => h.name === name) : undefined;
  if (heart) return heartPlanItem(heart);
  const surge = typeof name === 'string' ? SURGE_ITEMS.find((h) => h.name === name) : undefined;
  return surge ? surgePlanItem(surge) : toPlanItem(resolveItem(name));
};

/** A pinned id as a plan item: equipment, a heart or (phase 36) a Surge potion. */
export const pinnedPlanItem = (id: number): PlanItem | undefined => {
  const heart = heartById(id);
  if (heart) return heartPlanItem(heart);
  const surge = surgeById(id);
  if (surge) return surgePlanItem(surge);
  const p = equipmentById(id);
  return p ? toPlanItem(p) : undefined;
};

// --- ring policy ---------------------------------------------------------------------------------------------------

/**
 * Phase 27: rings across a kit. 'switch' = each loadout keeps the ring its search / preset found (ring switches are
 * inventory items, the phase 17-26 behaviour); 'camp-one' = every loadout wears one ring, the best of `CAMP_RINGS` by
 * route time; 'camp-lightbearer' = every loadout wears Lightbearer (constant spec regen: the Solo spec budget uses the
 * Lightbearer regen).
 */
export type RingPolicy = 'switch' | 'camp-one' | 'camp-lightbearer';

/** The Plan tab's default (the user, 2026-10-23: "a lot of people don't bring ring switches"). */
export const DEFAULT_RING_POLICY: RingPolicy = 'camp-one';

export const RING_POLICIES: { id: RingPolicy, label: string, title: string }[] = [
  { id: 'camp-one', label: 'Camp one ring', title: 'Every loadout wears the same ring; the planner picks the ring with the lowest route time' },
  { id: 'camp-lightbearer', label: 'Camp Lightbearer', title: 'Every loadout wears Lightbearer: spec energy regenerates twice as fast (Solo drains), a bit less DPS' },
  { id: 'switch', label: 'Allow ring switches', title: 'Each loadout wears its own best ring; a ring switch is an inventory item' },
];

/** The rings "Camp one ring" tries (unowned ones are skipped). */
export const CAMP_RINGS: ItemRef[] = ['Ultor ring', 'Bellator ring', 'Venator ring', 'Magus ring', ['Ring of shadows', 'Charged'], 'Lightbearer'];

/** The camped rings the user owns, as plan items. */
export const campRingItems = (notOwned: string[] = []): PlanItem[] => CAMP_RINGS
  .filter((r) => isOwned(typeof r === 'string' ? r : r[0], notOwned))
  .map((r) => { try { return planItemByName(r); } catch { return null; } })
  .filter((x): x is PlanItem => !!x && x.id > 0)
  .map((x) => ({ ...x, slot: 'ring' as Slot }));

/**
 * Phase 27 review: the ring screen's guard. g = the best-screened ring's screen time − its full-plan time (what partial
 * switches etc. are worth); every ring whose screen time is within `RING_GUARD_FACTOR` × g of the best full time is
 * planned in full too. A ring outside it is reported as "≥ +(screen − best − RING_ESTIMATE_FACTOR × g) s (estimate)": the
 * screens of the FA defaults overstated their ring by 2.2-3.2 g (Bellator, Venator), so 4 g keeps that a lower bound
 * there; it is an estimate, not a guarantee.
 */
export const RING_GUARD_FACTOR = 2;
/** Phase 27 review: the g multiple taken off a screen-only ring's screen gap for its "≥ +X s (estimate)". */
export const RING_ESTIMATE_FACTOR = 4;
/**
 * Phase 29 review 2: the ring guard. Plans the best two screened rings in full (`already` = those planned before), then
 * g = the largest screen − full gap among the rings planned in full, and every screened ring within `factor` × g of the
 * best full time is planned in full; re-checked after each full run. Returns the full times and the final g.
 */
export const guardedFullRuns = <K>(
  screened: { key: K, seconds: number }[],
  runFull: (key: K) => number,
  factor = RING_GUARD_FACTOR,
  already: Map<K, number> = new Map(),
): { full: Map<K, number>, g: number } => {
  const done = already;
  const run = (k: K) => {
    if (!done.has(k)) done.set(k, runFull(k));
  };
  const order = [...screened].sort((a, b) => (a.seconds === b.seconds ? 0 : a.seconds - b.seconds));
  order.slice(0, 2).forEach((x) => run(x.key));
  for (;;) {
    let g = 0;
    order.forEach((x) => {
      const f = done.get(x.key);
      if (f !== undefined && Number.isFinite(f) && Number.isFinite(x.seconds)) g = Math.max(g, x.seconds - f);
    });
    const bestFull = Math.min(...Array.from(done.values()));
    const next = order.find((x) => !done.has(x.key) && (factor === Infinity || x.seconds <= bestFull + factor * g + 1e-9));
    if (!next) return { full: done, g };
    run(next.key);
  }
};

/**
 * Phase 29 review 2: the carriers that count: the first `party` in teamSpecPlan's order (the keys' order), Eye of Ayak
 * at most `mages`.
 */
export const effectiveCarriers = (raw: Partial<CarrierCounts>, party: number, mages: number): CarrierCounts => {
  const out: CarrierCounts = { ...NO_CARRIERS };
  let left = Math.max(0, Math.floor(party));
  (Object.keys(raw) as PlannerWeapon[]).forEach((w) => {
    const k = Math.min(Math.max(0, Math.floor(raw[w] ?? 0)), left);
    out[w] = w === 'ayak' ? Math.min(k, Math.max(0, mages)) : k;
    left -= k;
  });
  return out;
};

/** Optimiser seeds of a ring screen. */
const SCREEN_SEEDS = 6;

/**
 * Phase 27 review: caches that live as long as the module (the search worker): DPS per (assumptions, base player,
 * monster: drain / target / phase / fight length, style group, equipment, style options) and the picked search rows
 * per (plan assumptions, drain, target / phase, "Items I don't own", search hooks, row caps). Any assumption that changes
 * DPS changes the key, so nothing needs invalidating; both are cleared when they grow past their cap.
 */
const DPS_CACHE = new Map<string, { dps: number, option: number }>();
const DPS_CACHE_MAX = 400000;
const SEARCH_CACHE = new Map<string, SearchRow[]>();
const SEARCH_CACHE_MAX = 400;
/**
 * Phase 29: the Solo drains of a spec subset per (target / phase, subset, energy budget, the other assumptions): the
 * subset search builds 2^5 drain states per phase per ring, and only the budget (not the exact fight length) changes
 * the reductions, so rings and re-plans share them.
 */
const SOLO_DRAIN_CACHE = new Map<string, DefenceReductions>();
const SOLO_DRAIN_CACHE_MAX = 50000;

/** Empties the planner's caches (tests, timings). */
export const clearPlanCaches = () => {
  DPS_CACHE.clear();
  SEARCH_CACHE.clear();
  SOLO_DRAIN_CACHE.clear();
};

const ringLabel = (ring: PlanItem | null) => (ring ? `ring: ${ring.name}` : 'rings as searched');

/**
 * Phase 27: the assumptions of a ring run: a camp policy sets the Solo spec budget's Lightbearer regen
 * (`mySpecs.lightbearer`) to whether the camped ring is Lightbearer; 'switch' keeps the user's flag.
 */
export const ringAssumptions = (a: BestSetupAssumptions, policy: RingPolicy, ring: { name: string } | null): BestSetupAssumptions => {
  if (policy === 'switch' || !ring) return a;
  const lb = ring.name === 'Lightbearer';
  return a.mySpecs.lightbearer === lb ? a : { ...a, mySpecs: { ...a.mySpecs, lightbearer: lb } };
};

// --- spec weapons (phase 29) ---------------------------------------------------------------------------------------

/**
 * Phase 29: who decides the spec weapons. 'auto' (the Plan tab's default) = the planner: Solo tries every subset of
 * Elder maul / DWH / BGS / Tonalztics / Eye of Ayak with the kit (specChoice.ts `searchSpecSubsets`); Team works out
 * the team's carriers (`teamRoles`) and your share ("assign me", `assignMe`). 'manual' = "Specs I bring" (the
 * assumptions' `mySpecs`, the phase 17-28 behaviour; `plan()`'s default).
 */
export type SpecMode = 'auto' | 'manual';
export const DEFAULT_SPEC_MODE: SpecMode = 'auto';
/** Phase 29 review: who picks the team's carriers (see `PlanInputs.carrierMode`). */
export type CarrierMode = 'auto' | 'manual';
export const DEFAULT_CARRIER_MODE: CarrierMode = 'auto';

export const SPEC_MODES: { id: SpecMode, label: string, title: string }[] = [
  { id: 'auto', label: 'Planner decides', title: 'Solo: the planner tries every set of spec weapons with the kit. Team: it works out the carriers the team needs and your share' },
  { id: 'manual', label: 'Specs I bring', title: 'The weapons ticked under "Specs I bring" above, each a slot' },
];

/** Optimiser seeds of a Solo spec subset's quick run. */
const SUBSET_QUICK_SEEDS = 4;
/** Optimiser seeds of a Solo spec subset in a ring screen. */
const SUBSET_SCREEN_SEEDS = 2;
/** Solo spec subsets (by quick time) given the full optimiser run. */
const SUBSET_FINALISTS = 3;

export interface PlanSpecs {
  mode: SpecMode;
  drain: DrainStateId;
  /** Spec weapons the plan carries (their items are `specItems`). */
  bring: PlannerWeapon[];
  /** e.g. "Bring: Elder maul, Tonalztics". */
  text: string;
  /** Solo, planner decides: the subset search (matrix times, drains at each encounter's fixed fight length). */
  solo?: Pick<SubsetSearchResult<PlannerWeapon>, 'perWeapon' | 'bestRejected' | 'signatures' | 'pruned' | 'bestWithout'> & {
    evaluated: number,
    /** Camp one ring: the subset the ring screens timed (= `bring` when ring and subset agree), and the screen rounds. */
    screenedWith?: PlannerWeapon[],
    ringRounds?: number,
  };
  /** Team: the team briefing for the planned route and party size. */
  team?: TeamRoles;
  /** Team: your share (planner decides: "assign me"; Specs I bring: manual). */
  share?: ShareDecision & { manual: boolean, slotValueSeconds?: number };
  /** e.g. the Ayak hint (carried but no magic loadout uses it / no mages in the party). */
  notes: string[];
  /** Phase 36: your damage spec weapons (planner decides; their items are in `specItems`). */
  damage?: DamageSpecWeapon[];
  /** Phase 36: Surge potions brought (4 doses each). */
  surgePotions?: number;
  /** Phase 36: the encounters of the planned route that get a surge dose (labels, route order). */
  surgeAt?: string[];
  /** Phase 36: the damage-spec / surge items the planner added (or dropped), in order, with what each saved. */
  items?: PlanItemStep[];
}

/** Phase 36: one step of the planner's damage-spec / surge greedy. */
export interface PlanItemStep {
  item: string;
  /** Route seconds it saved (the spec budget's DP on the kit). */
  saved: number;
  /** Slots it took (−1: a drain weapon left at home). */
  slots: number;
  how: string;
}

const SPEC_ITEM_NAMES = Object.fromEntries(SPEC_CANDIDATES.map((w) => {
  const it = SPEC_WEAPONS[w].item;
  return [w, typeof it === 'string' ? it : it[0]];
})) as Record<PlannerWeapon, string>;

/** The spec weapon of a plan item (by name), if it is one. */
const specWeaponOf = (it: { name: string }): PlannerWeapon | undefined => SPEC_CANDIDATES.find((w) => SPEC_ITEM_NAMES[w] === it.name);

/** One ring run of the planner (internal). */
/** One ring's run of the planner: a screen (seconds only) or a full run (the plan). */
export interface RingRun {
  seconds: number;
  ms: number;
  result?: PlanResult;
  /** Phase 37 (a screen run by a helper worker): the Solo spec subset the screens use after it. */
  screenSubset?: PlannerWeapon[] | null;
}

/** Phase 37: a helper worker's ring run (`planRingRun`): its key, the run, the search rows it used. */
export interface RingRunResult {
  key: string;
  run: RingRun;
  searchRows: Record<string, SearchRow[]>;
}

/** Phase 37: the key of a ring run (`PlanHooks.ringRuns`): the ring's item id (null = rings as searched), screen or full. */
export const ringRunKey = (ring: number | null, screen: boolean, subset: PlannerWeapon[] | null = null): string => `${ring ?? 'none'}|${screen ? 'screen' : 'full'}|${subset ? subset.join('+') : ''}`;

/** The equipment as the calculator holds it: every slot set (null when empty), blowpipe darts kept. */
export const toPlayerEquipment = (eq: PlanEquipment): Partial<PlayerEquipment> => Object.fromEntries(ALL_SLOTS.map((slot) => {
  const it = eq[slot];
  if (!it) return [slot, null];
  const piece = equipmentById(it.id);
  if (!piece) throw new Error(`Planner: no item with id ${it.id} (${it.name})`);
  return [slot, it.itemVars ? { ...piece, itemVars: it.itemVars } : piece];
}));

/** Phase 32: ammo-slot items with an effect beyond their stats on a weapon that fires no ammo (PlayerVsNPCCalc). */
const AMMO_SLOT_EFFECT_NAMES = ['Crystal blessing'];

/**
 * Phase 32: the loadout's ammo-slot item changes none of its DPS: the weapon fires no ammo (`ammoApplicability`
 * ALLOWED: the item's ranged attack / strength don't count) and the item has no other offensive or strength bonus and
 * no special effect (e.g. Rada's blessing 4: prayer only). Such an item is no part of the switch: it costs no slot and is
 * not shown, and the loadout leaves the ammo slot as it is (e.g. the worn set's bolts stay equipped while meleeing).
 */
export const isUnusedAmmo = (eq: PlanEquipment): boolean => {
  const it = eq.ammo;
  if (!it || !eq.weapon) return false;
  if (ammoApplicability(getCanonicalItemId(eq.weapon.id), getCanonicalItemId(it.id)) !== AmmoApplicability.ALLOWED) return false;
  const p = equipmentById(it.id);
  if (!p || p.slot !== 'ammo' || AMMO_SLOT_EFFECT_NAMES.includes(p.name)) return false;
  const o = p.offensive;
  return !o.stab && !o.slash && !o.crush && !o.magic && !p.bonuses.str && !p.bonuses.magic_str;
};

/** Phase 32: the loadout without an unused ammo-slot item (`isUnusedAmmo`); the same object when there is none. */
export const withoutUnusedAmmo = (eq: PlanEquipment): PlanEquipment => {
  if (!isUnusedAmmo(eq)) return eq;
  const { ammo, ...rest } = eq;
  return rest;
};

/**
 * The distinct item ids of a loadout (each is one inventory slot when not worn). Phase 32: an unused ammo-slot item
 * (`isUnusedAmmo`) is left out, so it never costs a slot (a pinned one is counted once, as a pinned item).
 */
export const equipmentItemIds = (eq: PlanEquipment): number[] => {
  const unused = isUnusedAmmo(eq);
  return Array.from(new Set(ALL_SLOTS
    .filter((s) => !(unused && s === 'ammo'))
    .map((s) => eq[s]?.id).filter((id): id is number => id !== undefined))).sort((a, b) => a - b);
};

/** Phase 32: the loadout wears an ammo-slot item of its own (one its weapon uses, or one with a DPS effect). */
export const wearsAmmo = (eq: PlanEquipment): boolean => !!eq.ammo && !isUnusedAmmo(eq);

/**
 * Phase 32: items a kit loadout keeps out of the inventory while it is worn: its own items, + 1 when it has no ammo of
 * its own but the kit carries an ammo-slot item (`wears[i]` false while some `wears[j]` is true): switching to it
 * leaves the ammo slot as it is (e.g. the bolts stay equipped while meleeing), and worn from the start it wears one of
 * the kit's ammo items. A melee / magic weapon (or a ranged one that fires no ammo) ignores what is in the ammo slot,
 * so this changes no DPS (the kit's ammo has no melee / magic stats; Phase32.test.ts). `wears` omitted = the phase 31
 * count (the sizes as given).
 */
export const wornItemCounts = (sizes: number[], wears?: boolean[]): number[] => {
  const any = !!wears && wears.some(Boolean);
  return sizes.map((n, i) => n + (any && !wears![i] ? 1 : 0));
};

const equipmentKey = (eq: PlanEquipment) => ALL_SLOTS
  .map((s) => `${eq[s]?.id ?? 0}${eq[s]?.itemVars?.blowpipeDartId ? `d${eq[s]!.itemVars!.blowpipeDartId}` : ''}`).join(',');

// --- slot accounting -----------------------------------------------------------------------------------------------

export interface SlotUsage {
  total: number;
  supplies: number;
  nonItem: number;
  /** |items of every kit loadout ∪ pinned ∪ spec weapons|. */
  carriedItems: number;
  /** Items of the worn loadout. */
  wornItems: number;
  /** Fewest items of any kit loadout (phase 32: + 1 for a loadout that keeps a kit ammo item in its ammo slot; `wornItemCounts`). */
  minLoadoutItems: number;
  /**
   * Phase 32: 1 when the worn loadout has no ammo of its own and wears one of the kit's ammo items in its ammo slot
   * (one carried item fewer in the inventory), else 0.
   */
  keptAmmo: number;
  /** Inventory items while wearing the worn set (= carried − worn − kept ammo). */
  inventoryItems: number;
  /** Extra slots needed while wearing a smaller loadout (worn − min); kept free for swaps. */
  swapReserve: number;
  /** Phase 31: slots the quiver saves (0 / 1: a second arrow / bolt type held in Dizana's quiver; `quiverSavedSlots`). */
  quiverAmmo: number;
  /** supplies + non-item + inventory items + swap reserve − quiver ammo. */
  used: number;
  /** total − used, never below 0. */
  free: number;
  /** used > total (the fixed items alone don't fit). */
  overfull: boolean;
}

const sumSupplies = (s: SupplyCounts) => SUPPLY_TYPES.reduce((t, x) => t + Math.max(0, Math.floor(s[x.id] || 0)), 0);

/**
 * Slot use of a kit. `loadouts` = item ids per kit loadout, `worn` = index of the worn one, `carried` = pinned items +
 * spec weapons (free to use in loadouts; counted once). Phase 21: `raidSupplied` = items the raid hands out (ToB's
 * Dawnbringer): never in the carried union (0 slots), but still counted in a loadout's size, so a loadout that wears
 * one in place of a weapon needs no extra swap space (it takes the place of the item it replaces). Phase 31: `quiver`
 * (the planner: `quiverSpecOf` of its items) = a second arrow / bolt type rides in Dizana's quiver (`quiverAmmo`).
 * Phase 32: `ammoWorn` (per loadout: `wearsAmmo`, it has an ammo-slot item of its own) = a loadout without one keeps a kit ammo
 * item in its ammo slot (`wornItemCounts`); omitted = the phase 31 count.
 */
export const kitSlotUsage = (
  loadouts: number[][],
  worn: number,
  carried: number[],
  supplies: SupplyCounts,
  nonItemSlots: number,
  total = INVENTORY_SLOTS,
  raidSupplied: number[] = [],
  quiver?: QuiverSpec,
  ammoWorn?: boolean[],
): SlotUsage => {
  const free = new Set(raidSupplied);
  const all = new Set<number>(carried.filter((id) => !free.has(id)));
  loadouts.forEach((l) => l.forEach((id) => {
    if (!free.has(id)) all.add(id);
  }));
  const wornSet = loadouts.length ? new Set(loadouts[worn]) : new Set<number>();
  const wornItems = wornSet.size;
  const wornFree = Array.from(wornSet).filter((id) => free.has(id)).length;
  const counts = wornItemCounts(loadouts.map((l) => new Set(l).size), ammoWorn);
  const minLoadoutItems = loadouts.length ? Math.min(...counts) : 0;
  const keptAmmo = loadouts.length ? counts[worn] - wornItems : 0;
  const s = sumSupplies(supplies);
  const nonItem = Math.max(0, Math.floor(nonItemSlots || 0));
  const inventoryItems = all.size - (wornItems - wornFree) - keptAmmo;
  const swapReserve = wornItems - wornFree + keptAmmo - minLoadoutItems;
  const quiverAmmo = quiverSavedSlots(all, quiver);
  const used = s + nonItem + inventoryItems + swapReserve - quiverAmmo;
  return {
    total,
    supplies: s,
    nonItem,
    carriedItems: all.size,
    wornItems,
    minLoadoutItems,
    keptAmmo,
    inventoryItems,
    swapReserve,
    quiverAmmo,
    used,
    free: Math.max(0, total - used),
    overfull: used > total,
  };
};

// --- inventory grid ------------------------------------------------------------------------------------------------

export type InventoryCellKind = 'supply' | 'potion' | 'switch' | 'spec' | 'pinned' | 'non-item' | 'swap' | 'free';

export interface InventoryCell {
  kind: InventoryCellKind;
  label: string;
  item?: PlanItem;
  group?: StyleGroup;
  supply?: SupplyType;
}

const GROUP_ORDER: StyleGroup[] = ['melee', 'ranged', 'magic'];

/**
 * Phase 32: the kit ammo item the worn loadout keeps in its ammo slot when it has no ammo of its own (`wornItemCounts`):
 * the first one in inventory-grid order (switch loadouts by style) that Dizana's quiver can't hold, else the first one.
 * Null when the worn loadout has its own ammo or no loadout has any.
 */
export const wornKeptAmmo = (kit: { equipment: PlanEquipment, group: StyleGroup }[], worn: number): PlanItem | null => {
  if (!kit.length || wearsAmmo(kit[worn].equipment)) return null;
  const ammo: PlanItem[] = [];
  for (const g of GROUP_ORDER) {
    kit.forEach((l, i) => {
      if (i !== worn && l.group === g && wearsAmmo(l.equipment)) ammo.push(l.equipment.ammo!);
    });
  }
  return ammo.find((it) => !isQuiverAmmo(equipmentById(it.id))) ?? ammo[0] ?? null;
};

/**
 * Phase 31: the arrow / bolt type that rides in Dizana's quiver (no inventory cell): when the kit carries a quiver and
 * at least two arrow / bolt types (`quiverSavedSlots`), the first one not worn by the worn loadout, in inventory-grid
 * order (switch items by style, then spec weapons, then pinned items). Null otherwise.
 */
export const quiverHeldAmmo = (
  kit: { equipment: PlanEquipment, group: StyleGroup }[],
  worn: number,
  carriedItems: PlanItem[],
  quiver: QuiverSpec | undefined,
): PlanItem | null => {
  if (!quiver || !kit.length) return null;
  const all = new Set<number>(carriedItems.map((it) => it.id));
  kit.forEach((l) => equipmentItemIds(l.equipment).forEach((id) => all.add(id)));
  if (!quiverSavedSlots(all, quiver)) return null;
  const wornIds = new Set(equipmentItemIds(kit[worn].equipment));
  const kept = wornKeptAmmo(kit, worn); // phase 32: worn in the ammo slot, not in the quiver
  if (kept) wornIds.add(kept.id);
  const ammo = new Set(quiver.ammo);
  const pick = (it: PlanItem | undefined) => !!it && ammo.has(it.id) && !wornIds.has(it.id);
  for (const g of GROUP_ORDER) {
    for (let i = 0; i < kit.length; i++) {
      if (i !== worn && kit[i].group === g) {
        const it = kit[i].equipment.ammo;
        if (pick(it)) return it!;
      }
    }
  }
  return carriedItems.find(pick) ?? null;
};

/**
 * The 4×7 inventory while wearing the worn set: supplies (phase 31: the heart, magic's kit potion, after the potions),
 * switch items grouped by style (melee, ranged, magic; slot order), spec weapons, pinned items, non-item slots, swap
 * space (free slots needed while wearing a smaller loadout), free slots. Phase 31: the quiver-held ammo
 * (`quiverHeldAmmo`) takes no cell. Never more than `total` cells unless the kit is overfull (then every item is listed).
 */
export const inventoryGrid = (
  kit: { equipment: PlanEquipment, group: StyleGroup }[],
  worn: number,
  specItems: PlanItem[],
  pinnedItems: PlanItem[],
  supplies: SupplyCounts,
  nonItemSlots: number,
  total = INVENTORY_SLOTS,
  raidSupplied: number[] = [],
  extras: { potionItems?: PlanItem[], quiver?: QuiverSpec } = {},
): InventoryCell[] => {
  const cells: InventoryCell[] = [];
  const free = new Set(raidSupplied);
  const wornIds = new Set(kit.length ? equipmentItemIds(kit[worn].equipment) : []);
  // raid-supplied items (ToB's Dawnbringer) take no cell; nor does the quiver-held ammo (phase 31)
  const held = quiverHeldAmmo(kit, worn, [...specItems, ...pinnedItems], extras.quiver);
  // phase 32: the kit ammo the worn loadout keeps in its ammo slot takes no cell either
  const kept = wornKeptAmmo(kit, worn);
  const placed = new Set<number>([...Array.from(wornIds), ...raidSupplied, ...(held ? [held.id] : []), ...(kept ? [kept.id] : [])]);
  SUPPLY_TYPES.forEach((t) => {
    for (let i = 0; i < Math.max(0, Math.floor(supplies[t.id] || 0)); i++) cells.push({ kind: 'supply', label: t.label, supply: t.id });
    // phase 31: the heart beside the potions (once, also when pinned)
    if (t.id === 'superCombat') {
      (extras.potionItems ?? []).forEach((it) => {
        if (placed.has(it.id)) return;
        placed.add(it.id);
        cells.push({
          kind: 'potion', label: it.name, item: it, group: 'magic',
        });
      });
    }
  });
  for (const g of GROUP_ORDER) {
    kit.forEach((l, i) => {
      if (i === worn || l.group !== g) return;
      const unusedAmmo = isUnusedAmmo(l.equipment);
      ALL_SLOTS.forEach((slot) => {
        const it = l.equipment[slot];
        if (!it || placed.has(it.id) || (unusedAmmo && slot === 'ammo')) return;
        placed.add(it.id);
        cells.push({
          kind: 'switch', label: it.name, item: it, group: g,
        });
      });
    });
  }
  // switch items of loadouts whose group sorted earlier are placed; anything left (shouldn't happen) is caught below
  specItems.forEach((it) => {
    if (placed.has(it.id)) return;
    placed.add(it.id);
    cells.push({ kind: 'spec', label: it.name, item: it });
  });
  pinnedItems.forEach((it) => {
    if (placed.has(it.id)) return;
    placed.add(it.id);
    cells.push({ kind: 'pinned', label: it.name, item: it });
  });
  for (let i = 0; i < Math.max(0, Math.floor(nonItemSlots || 0)); i++) cells.push({ kind: 'non-item', label: i === 0 ? 'Rune pouch' : 'Other (non-item)' });
  const loadoutSizes = wornItemCounts(kit.map((l) => equipmentItemIds(l.equipment).length), kit.map((l) => wearsAmmo(l.equipment)));
  const wornFree = Array.from(wornIds).filter((id) => free.has(id)).length;
  const reserve = kit.length ? loadoutSizes[worn] - wornFree - Math.min(...loadoutSizes) : 0;
  for (let i = 0; i < reserve && cells.length < total; i++) cells.push({ kind: 'swap', label: 'Swap space (a smaller loadout is worn)' });
  while (cells.length < total) cells.push({ kind: 'free', label: 'Free slot' });
  return cells;
};

// --- partial switches ----------------------------------------------------------------------------------------------

export interface PartialVariant {
  equipment: PlanEquipment;
  /** Partner pieces added on top of the weapon set, in the order taken. */
  pieces: Slot[];
}

/**
 * Partial switches from base loadout `base` towards `target`: the target's weapon (+ its ammo when it has one; its
 * shield, or no shield when the weapon is two-handed; the base shield is kept otherwise), then its k best other pieces
 * for k = 0..all. `dpsOf` scores a loadout (the real planner: the target's best phase); pieces are ranked by the DPS
 * each adds to the weapon-only switch, `isFree` pieces (already carried) first. Ties keep PIECE_SLOTS order.
 */
export const partialSwitchVariants = (
  base: PlanEquipment,
  target: PlanEquipment,
  dpsOf: (eq: PlanEquipment) => number,
  isFree: (id: number) => boolean = () => false,
): PartialVariant[] => {
  const v0: PlanEquipment = { ...base, weapon: target.weapon };
  if (target.ammo) v0.ammo = target.ammo;
  if (target.weapon?.twoHanded) {
    delete v0.shield;
  } else if (target.shield) {
    v0.shield = target.shield;
  } else if (base.weapon?.twoHanded) {
    delete v0.shield;
  }
  const slots = PIECE_SLOTS.filter((s) => target[s] && target[s]!.id !== v0[s]?.id);
  const d0 = dpsOf(v0);
  const ranked = slots
    .map((slot, i) => ({
      slot, i, gain: dpsOf({ ...v0, [slot]: target[slot] }) - d0, free: isFree(target[slot]!.id),
    }))
    .sort((a, b) => (Number(b.free) - Number(a.free)) || (b.gain - a.gain) || (a.i - b.i));
  const out: PartialVariant[] = [{ equipment: v0, pieces: [] }];
  let eq = v0;
  const pieces: Slot[] = [];
  for (const r of ranked) {
    eq = { ...eq, [r.slot]: target[r.slot] };
    pieces.push(r.slot);
    out.push({ equipment: eq, pieces: [...pieces] });
  }
  return out;
};

// --- optimiser (generic) -------------------------------------------------------------------------------------------

export interface KitProblem {
  /** Item ids per candidate loadout. */
  items: number[][];
  /** Items carried anyway (pinned + spec weapons). */
  carried: number[];
  /** Supplies + non-item slots. */
  fixedSlots: number;
  totalSlots: number;
  /** Route time of a kit (candidate indices); lower is better, Infinity allowed. */
  time: (members: number[]) => number;
  /** Candidate indices to start from. */
  seeds: number[];
  /** Only these candidates may join a kit (default: all). */
  allowed?: boolean[];
  /** Phase 21: raid-supplied item ids (0 slots; see kitSlotUsage). */
  raidSupplied?: number[];
  /**
   * Phase 27: the potion each candidate needs (any label; null = none): a kit pays one slot per distinct potion of its
   * members (`potionSlots`), so a melee + ranged kit pays Super combat + Ranging potion and a melee-only kit one.
   */
  potions?: (string | null)[];
  /** Phase 31: the quiver's extra ammo slot (`quiverSavedSlots`: −1 slot for a second arrow / bolt type). */
  quiver?: QuiverSpec;
  /** Phase 32: per candidate, whether it wears an ammo item of its own (`wearsAmmo`; `wornItemCounts`). */
  wearsAmmo?: boolean[];
  /** Phase 21: skip the dedupe rule (the optimiser's prune step); default false. */
  noPrune?: boolean;
  /** Phase 21 (`lightenKit`): prune this kit with drops and same-group swaps instead of optimising. */
  lighten?: number[];
  /**
   * Phase 21: style group (any label) per candidate, for the "lighter kit" swaps (`lightenKit`): a kit loadout may be
   * swapped for a cheaper candidate of the same group. Not used by `optimiseKit` (its prune step only drops).
   */
  groups?: string[];
  shouldCancel?: () => boolean;
  onProgress?: (done: number, total: number) => void;
}

export interface KitSolution {
  /** Candidate indices: the seed first, then in the order added. */
  members: number[];
  time: number;
  used: number;
  seed: number;
}

export interface KitOptimum {
  best: KitSolution;
  /** Final kit of every seed × strategy. */
  finals: KitSolution[];
  kitsEvaluated: number;
}

export class PlanCancelled extends Error {
  constructor() {
    super('cancelled');
  }
}

const EPS = 1e-9;

/** Better kit: feasible first, then lower time, fewer slots, fewer loadouts, lexicographically smaller. */
const better = (a: KitSolution, b: KitSolution, total: number): boolean => {
  const fa = a.used <= total;
  const fb = b.used <= total;
  if (fa !== fb) return fa;
  if (!fa && a.used !== b.used) return a.used < b.used;
  if (Math.abs(a.time - b.time) > EPS && !(a.time === b.time)) return a.time < b.time;
  if (a.used !== b.used) return a.used < b.used;
  if (a.members.length !== b.members.length) return a.members.length < b.members.length;
  return [...a.members].sort((x, y) => x - y).join(',') < [...b.members].sort((x, y) => x - y).join(',');
};

/** Greedy + local search over kits (see the module comment). Deterministic. */
export const optimiseKit = (p: KitProblem): KitOptimum => {
  const n = p.items.length;
  const timeMemo = new Map<string, number>();
  let kitsEvaluated = 0;
  const keyOf = (m: number[]) => [...m].sort((a, b) => a - b).join(',');
  const timeOf = (m: number[]) => {
    const k = keyOf(m);
    let t = timeMemo.get(k);
    if (t === undefined) {
      if (p.shouldCancel?.()) throw new PlanCancelled();
      t = p.time(m);
      timeMemo.set(k, t);
      kitsEvaluated += 1;
    }
    return t;
  };
  const free = new Set(p.raidSupplied || []);
  const usedOf = (m: number[]) => {
    const all = new Set<number>(p.carried.filter((id) => !free.has(id)));
    for (const i of m) {
      p.items[i].forEach((id) => {
        if (!free.has(id)) all.add(id);
      });
    }
    const counts = wornItemCounts(m.map((i) => p.items[i].length), p.wearsAmmo && m.map((i) => p.wearsAmmo![i]));
    return p.fixedSlots + all.size - (m.length ? Math.min(...counts) : 0) + (p.potions ? potionSlots(m.map((i) => p.potions![i])) : 0)
      - quiverSavedSlots(all, p.quiver);
  };
  const solution = (members: number[], seed: number): KitSolution => ({
    members, time: timeOf(members), used: usedOf(members), seed,
  });

  // the dedupe rule (SWITCH_MIN_*): repeatedly apply the move that breaks it the most, until none does — drop a loadout
  // that saves less than switchSavingRequired(its slots); with `swaps` (lightenKit only) also swap one for a cheaper
  // candidate of the same style (`groups`) when the slots it frees bought less than SWITCH_MIN_SECONDS_PER_SLOT each.
  // A kit that can't clear the route (∞) is left alone.
  const loss = (from: KitSolution, to: KitSolution) => (to.time === from.time ? 0 : to.time - from.time);
  const prune = (start: KitSolution, swaps = false): KitSolution => {
    if (p.noPrune || !Number.isFinite(start.time)) return start;
    let cur = start;
    for (let iter = 0; iter < 50 && cur.members.length > 0; iter++) {
      let move: { s: KitSolution, margin: number } | null = null;
      for (let i = 0; i < cur.members.length; i++) {
        if (cur.members.length > 1) {
          const s = solution(cur.members.filter((_, j) => j !== i), cur.seed);
          const margin = loss(cur, s) - switchSavingRequired(cur.used - s.used);
          if (margin < -EPS && (!move || margin < move.margin)) move = { s, margin };
        }
        if (swaps && p.groups) {
          for (let c = 0; c < n; c++) {
            if (p.groups[c] !== p.groups[cur.members[i]] || cur.members.includes(c) || (p.allowed && !p.allowed[c])) continue;
            const m = cur.members.map((x, j) => (j === i ? c : x));
            const used = usedOf(m);
            if (used >= cur.used) continue;
            const s = solution(m, cur.seed);
            const margin = loss(cur, s) - (cur.used - used) * SWITCH_MIN_SECONDS_PER_SLOT;
            if (margin < -EPS && (!move || margin < move.margin)) move = { s, margin };
          }
        }
      }
      if (!move) return cur;
      cur = move.s;
    }
    return cur;
  };

  const greedy = (start: KitSolution, byRatio: boolean): KitSolution => {
    let cur = start;
    for (;;) {
      let pick: { s: KitSolution, ratio: number } | null = null;
      for (let c = 0; c < n; c++) {
        if (cur.members.includes(c) || (p.allowed && !p.allowed[c])) continue;
        const m = [...cur.members, c];
        const used = usedOf(m);
        if (used > p.totalSlots) continue;
        const t = timeOf(m);
        if (!(t < cur.time - EPS)) continue;
        const ds = used - cur.used;
        const dt = cur.time - t;
        let ratio = dt;
        if (byRatio) ratio = ds <= 0 ? Infinity : dt / ds;
        const s: KitSolution = {
          members: m, time: t, used, seed: start.seed,
        };
        if (!pick || ratio > pick.ratio || (ratio === pick.ratio && better(s, pick.s, p.totalSlots))) pick = { s, ratio };
      }
      if (!pick) return cur;
      cur = pick.s;
    }
  };

  const local = (start: KitSolution, byRatio: boolean): KitSolution => {
    let cur = start;
    for (let iter = 0; iter < 20; iter++) {
      let next: KitSolution | null = null;
      // drop a loadout that doesn't help (frees slots)
      for (let i = 0; i < cur.members.length && cur.members.length > 1 && !next; i++) {
        const m = cur.members.filter((_, j) => j !== i);
        const s = solution(m, cur.seed);
        if (s.time <= cur.time + EPS && s.used <= cur.used) next = s;
      }
      // swap one loadout for another candidate
      if (!next) {
        for (let i = 0; i < cur.members.length; i++) {
          for (let c = 0; c < n; c++) {
            if (cur.members.includes(c) || (p.allowed && !p.allowed[c])) continue;
            const m = cur.members.map((x, j) => (j === i ? c : x));
            const used = usedOf(m);
            if (used > p.totalSlots) continue;
            const s = solution(m, cur.seed);
            if (s.time < cur.time - EPS && (!next || better(s, next, p.totalSlots))) next = s;
          }
        }
      }
      if (!next) return cur;
      cur = greedy(next, byRatio);
    }
    return cur;
  };

  if (p.lighten) {
    const start = solution(p.lighten, p.lighten[0] ?? 0);
    const light = prune(start, true);
    return { best: light, finals: [light], kitsEvaluated };
  }

  const finals: KitSolution[] = [];
  let best: KitSolution | null = null;
  p.seeds.forEach((seed, i) => {
    p.onProgress?.(i, p.seeds.length);
    const start = solution([seed], seed);
    for (const byRatio of [true, false]) {
      const s = prune(local(greedy(start, byRatio), byRatio));
      finals.push(s);
      if (!best || better(s, best, p.totalSlots)) best = s;
    }
  });
  p.onProgress?.(p.seeds.length, p.seeds.length);
  if (!best) throw new Error('Planner: no seeds');
  return { best, finals, kitsEvaluated };
};

/**
 * Phase 21: the "lighter kit" of a kit: the dedupe rule plus swaps of a loadout for a cheaper same-group candidate
 * whenever the slots it frees bought < SWITCH_MIN_SECONDS_PER_SLOT each. Slower (or equal) and lighter; the planner
 * offers it as an alternative, not as the plan (the plan minimises time within the slots).
 */
export const lightenKit = (p: KitProblem, members: number[]): KitSolution => optimiseKit({ ...p, lighten: members, seeds: members }).best;

// --- the real planner ----------------------------------------------------------------------------------------------

export interface PlanCandidate {
  key: string;
  /** Unique label (the kit loadout's name). */
  label: string;
  kind: 'preset' | 'search' | 'partial';
  group: StyleGroup;
  equipment: PlanEquipment;
  options: StyleOption[];
  /** Where it came from, e.g. "search: Xarth" or "Torva + Scythe (slash) → Kodai wand, +2 pieces". */
  source: string;
  /** Partial switches: base and partner labels and the partner pieces taken. */
  base?: string;
  partner?: string;
  pieces?: Slot[];
}

export interface PlanInputs {
  basePlayer: Player;
  assumptions: BestSetupAssumptions;
  drain: DrainStateId;
  settings: TimeSettings;
  /** A route id (enumerateRoutes / routesFor) or 'all' (plan for the fastest route). */
  route: string;
  /** Items always brought (equipment ids). */
  pinned: number[];
  nonItemSlots: number;
  /**
   * The comfort supplies (brew, restore, food, other). Phase 27: the combat potions (ranging, superCombat) are ignored —
   * they come from the kit (`kitPotions`, one slot per style present).
   */
  supplies: SupplyCounts;
  /** Phase 27: rings across the kit (default 'switch'; the Plan tab's default is DEFAULT_RING_POLICY). */
  ringPolicy?: RingPolicy;
  /** Phase 29: who picks the spec weapons (default 'manual' = `mySpecs`; the Plan tab's default is DEFAULT_SPEC_MODE). */
  specMode?: SpecMode;
  /** Phase 29 (Team): mages in the party (Eye of Ayak carriers only if > 0); undefined = 1 if the kit has a magic loadout, else 0. */
  magesInParty?: number;
  /**
   * Phase 29 review (Team): who picks the team's carriers: 'auto' (the Plan tab's default, DEFAULT_CARRIER_MODE) = the
   * planner (greedy on the route time; the drain state uses them); 'manual' (`plan()`'s default) = the assumptions'
   * `team.carriers` (Advanced).
   */
  carrierMode?: CarrierMode;
  totalSlots?: number;
  /** Search rows already known, by phase key (the UI's session cache); missing phases are searched. */
  searchRows?: Record<string, SearchRow[]>;
  /**
   * Phase 26: "Items I don't own" (ownership.ts). Always honoured: unowned items leave the search pool, presets that
   * use one are dropped, unowned pinned items are dropped (with a notice). `searchRows` must come from searches with the
   * same list.
   */
  notOwned?: string[];
}

/** Phase 26: the pinned ids without the unowned ones (and the dropped ones). Hearts are matched by their name too. */
export const ownedPinned = (pinned: number[], notOwned: string[] = []): { kept: number[], dropped: number[] } => {
  const kept: number[] = [];
  const dropped: number[] = [];
  for (const id of pinned) {
    const name = heartById(id)?.name ?? equipmentById(id)?.name;
    if (name && !isOwned(name, notOwned)) dropped.push(id);
    else kept.push(id);
  }
  return { kept, dropped };
};

/** Candidate-pool sizes and test hooks. Defaults keep the default plan within ~30 s in the browser. */
export interface PlanTuning {
  /** Weapons kept per style group per phase search (default 3). */
  perGroupWeapons?: number;
  /** Distinct loadouts kept per weapon per phase search (default 2). */
  perWeapon?: number;
  /** Bases per style group for partial switches (default 2). */
  bases?: number;
  /** Partners per style group for partial switches (default 2) + the best loadout of each carried weapon. */
  partners?: number;
  /** Total candidate cap (default 600); partial switches beyond it are dropped (fewest pieces kept first). */
  maxCandidates?: number;
  /** Seeds for the optimiser (default 20). */
  seeds?: number;
  /** Search hooks (reduced pools in tests). */
  search?: Pick<GearSearchOptions, 'weapons' | 'pool' | 'maxPasses'>;
  /** Presets offered as candidates (default: the raid's presets, src/lib/raids/base.ts). */
  presets?: PresetDef[];
  /** Phase 18: the raid's time model (default: the Fractured Archive's; the worker passes the one of `assumptions.raid`). */
  model?: RaidTimeModel;
  /** Phase 21: skip the dedupe rule (comparisons / tests only). */
  noPrune?: boolean;
  /** Phase 27 review: the ring guard factor (default RING_GUARD_FACTOR; Infinity = plan every camp ring in full). */
  ringGuard?: number;
}

export const PLAN_DEFAULTS: Required<Omit<PlanTuning, 'search' | 'presets' | 'model' | 'noPrune' | 'ringGuard'>> = {
  perGroupWeapons: 3,
  perWeapon: 2,
  bases: 2,
  partners: 2,
  maxCandidates: 600,
  seeds: 20,
};

/** Rows kept per phase search before picking (enough for every weapon's top loadouts). */
const SEARCH_TOP_N = 80;

/** Best optimiser kits re-timed exactly before the winner is picked (matters for Solo drains). */
const RETIME_TOP = 5;
/** Phase 38e: the item steps' beam (specChoice.ts itemBeam): the best 2 by net saving for the first 3 steps. */
const ITEM_BEAM_WIDTH = 2;
const ITEM_BEAM_DEPTH = 3;

export interface PlanProgress {
  stage: 'search' | 'matrix' | 'partials' | 'optimise' | 'rings' | 'final';
  done: number;
  total: number;
  label: string;
  search?: GearSearchProgress;
}

export interface PlanHooks {
  onProgress?: (p: PlanProgress) => void;
  shouldCancel?: () => boolean;
  /**
   * Phase 37: ring runs already made (by `ringRunKey`; the page's helper workers run the camp-one ring screens and
   * full runs in parallel): taken instead of running them. They must come from `planRingRun` with the same inputs.
   */
  ringRuns?: Record<string, RingRun>;
  /** Phase 37 (`planRingRun`): run only this ring (by item id; null = rings as searched) and report it to `onRingRun`. */
  onlyRing?: { ring: number | null, screen: boolean, screenSubset?: PlannerWeapon[] | null };
  onRingRun?: (run: RingRun) => void;
  /**
   * Phase 36 review (tests): the final kit space — the candidates, a kit's slots with the plan's carried items, the
   * slots, and a kit's exact route time (createKitEvaluator + compareRoutes under the plan's final spec plan inputs).
   */
  onKitSpace?: (s: {
    candidates: PlanCandidate[],
    used: (members: number[]) => number,
    total: number,
    exactSeconds: (members: number[]) => number,
    members: number[],
    /** The camped ring of this run (null: rings as searched); the plan keeps one run's kit. */
    ring: string | null,
  }) => void;
}

export interface PlanRejection {
  label: string;
  kind: 'addition' | 'alternative';
  /** Seconds the route would gain (+) or lose (−) vs the plan. */
  deltaSeconds: number;
  /** Extra inventory slots vs the plan (+ = more). */
  deltaSlots: number;
  reason: string;
  /** Phase 34: the weapon of each loadout in `label` (in order; '' when none), for the icons. */
  weapons?: string[];
}

export interface PlanResult {
  cancelled: boolean;
  /** Kit loadouts, the worn one first. */
  kit: PlanCandidate[];
  /**
   * Phase 21: per kit loadout (same order), the inventory slots it adds and the route seconds it saves vs the kit without
   * it (optimiser times; a single-loadout kit: 0 slots, Infinity). The dedupe rule keeps saved ≥ switchSavingRequired(slots).
   */
  kitMarginal: { slots: number, seconds: number }[];
  slots: SlotUsage | null;
  inventory: InventoryCell[];
  specItems: PlanItem[];
  pinnedItems: PlanItem[];
  /** Exact route times of the kit (createKitEvaluator + compareRoutes). */
  comparison: RouteComparison | null;
  /** Index into comparison.routes of the planned route (the fastest in compare-all mode). */
  planned: number;
  rejected: PlanRejection[];
  alternatives: PlanRejection[];
  /** Phase 27: the potions the kit brings (one per style present; in the inventory grid and slot count; phase 31: magic's heart). */
  potions: KitPotion[];
  /** Phase 31: the arrow / bolt type held in Dizana's quiver (0 slots; not in the inventory grid), if any. */
  quiverAmmo: PlanItem | null;
  /** Phase 32: the kit ammo item the worn loadout (no ammo of its own) keeps in its ammo slot (`wornKeptAmmo`), if any. */
  keptAmmo: PlanItem | null;
  /** Phase 29: the spec weapons (what the kit carries and why; Team: the briefing and your share). */
  specs: PlanSpecs;
  /**
   * Phase 27: the ring policy used; `ring` = the ring every loadout wears (camp policies; null for switch);
   * `screened` (camp one ring): each ring's route time, fastest first (`full` = from a full run; else the screen's
   * time, an upper bound, and `atLeast` = the gap to the chosen ring it is assumed to have at least: screen − best −
   * RING_ESTIMATE_FACTOR × g, an estimate, see RING_GUARD_FACTOR).
   */
  ring: { policy: RingPolicy, ring: string | null, screened: { ring: string, seconds: number, full: boolean, atLeast?: number }[] };
  /** The optimiser's (matrix) DPS of the kit per phase key, for checking against the exact times. */
  matrixDps: Record<string, number>;
  /**
   * Pinned items (not spec weapons) that no kit loadout wears: carried for other reasons, a slot each. A pinned heart is
   * listed only when no kit loadout is magic (it boosts magic loadouts; it is never worn).
   */
  unusedCarried: PlanItem[];
  /** Phase 26: the "Items I don't own" list the plan honoured (empty = max gear). */
  excluded: string[];
  /** Phase 26: pinned items dropped because they're on the list. */
  droppedPinned: PlanItem[];
  /** Phase 26: what the list changed beyond the pool (dropped pinned items, unowned spec weapons in "Specs I bring"). */
  ownershipNotices: string[];
  /** Selected search rows per phase key (for the UI cache). */
  searchRows: Record<string, SearchRow[]>;
  stats: {
    searches: number;
    phases: number;
    candidates: { preset: number, search: number, partial: number, total: number, capped: number };
    evaluations: number;
    kitsEvaluated: number;
    /** The optimiser's time of the kit (drains at the fixed fight length; = the exact time for Team / None). */
    objectiveSeconds: number;
    /** Kits re-timed exactly before picking the winner. */
    retimed: number;
    /**
     * Phase 37: the ring run's encounter / pass memos (kitMemo.ts): remembered results reused (hits) and runs made —
     * deterministic, so the tests catch a memo that stops working whatever the machine's load.
     */
    memo?: { encounterHits: number, encounterRuns: number, passHits: number, passRuns: number };
    /** Solo: fight length (s) per encounter the drains were planned with in the matrix. */
    fightSeconds?: Partial<Record<EncounterId, number>>;
    ms: { search: number, matrix: number, optimise: number, total: number };
  };
}

const groupsLabel = (gs: StyleGroup[]) => GROUP_ORDER.filter((g) => gs.includes(g)).join(' + ');

/** The phase targets (target + phase) the time model asks about for these routes. */
export const routePhaseTargets = (routes: Route[], a: RaidTimeAssumptions): { targetKey: string, phase?: string }[] => {
  const seen = new Map<string, { targetKey: string, phase?: string }>();
  const recorder: RaidKit = {
    best: (q: PhaseQuery): KitChoice => {
      const k = phaseKey(q.targetKey, q.phase);
      if (!seen.has(k)) seen.set(k, { targetKey: q.targetKey, phase: q.phase });
      return {
        loadout: 'x', style: 'x', dps: 1,
      };
    },
  };
  compareRoutes(recorder, { ...a, drain: 'none' }, routes);
  return Array.from(seen.values());
};

/** The phase targets of each encounter of these routes (in route order). */
export const encounterPhaseTargets = (routes: Route[], a: RaidTimeAssumptions): Map<EncounterId, { targetKey: string, phase?: string }[]> => {
  const out = new Map<EncounterId, { targetKey: string, phase?: string }[]>();
  routes.forEach((r) => r.encounters.forEach((e) => {
    if (!out.has(e)) out.set(e, routePhaseTargets([{ id: e, label: e, encounters: [e] }], a));
  }));
  return out;
};

const optionKey = (o: StyleOption) => `${o.style.name}|${o.style.stance}|${o.spell ?? ''}`;

const mergeOptions = (a: StyleOption[], b: StyleOption[]) => {
  const keys = new Set(a.map(optionKey));
  return [...a, ...b.filter((o) => !keys.has(optionKey(o)))];
};

/** Picks the search rows kept per phase: per group the best `perGroupWeapons` weapons, `perWeapon` loadouts each. */
export const pickSearchRows = (r: Pick<GearSearchResult, 'rows' | 'rowsByWeapon'>, perGroupWeapons: number, perWeapon: number): SearchRow[] => {
  const out: SearchRow[] = [];
  for (const g of GROUP_ORDER) {
    const weapons = r.rowsByWeapon.filter((x) => x.group === g && x.dps > 0).slice(0, perGroupWeapons);
    for (const w of weapons) {
      const rows = r.rows.filter((x) => x.group === g && x.weaponLabel === w.weaponLabel && x.dps > 0).slice(0, perWeapon);
      out.push(...(rows.length ? rows : [w]));
    }
  }
  return out;
};

const searchRowEquipment = (row: SearchRow): PlanEquipment => Object.fromEntries(Object.entries(row.equipment).map(([slot, it]) => {
  const piece = equipmentById(it!.id);
  return [slot, {
    ...it!, slot: slot as Slot, ...(piece?.isTwoHanded ? { twoHanded: true } : {}),
  }];
}));

const presetEquipment = (preset: PresetDef): PlanEquipment => Object.fromEntries(Object.entries(resolvePresetEquipment(preset))
  .filter(([, p]) => p).map(([slot, p]) => [slot, toPlanItem(p!, slot as Slot)]));

export const plan = (inputs: PlanInputs, tuning: PlanTuning = {}, hooks: PlanHooks = {}): PlanResult => {
  const t0 = Date.now();
  const cfg = { ...PLAN_DEFAULTS, ...tuning };
  const { drain, settings, basePlayer } = inputs;
  // phase 26: the "Items I don't own" list (pool, presets, pinned items)
  const notOwned = normaliseNotOwned(inputs.notOwned);
  const { kept: pinnedIds, dropped: droppedIds } = ownedPinned(inputs.pinned, notOwned);
  // phase 27: the potions come from the kit (kitPotions); only the comfort supplies are the user's
  const comfort = comfortSupplies(inputs.supplies);
  const planA = planAssumptions(inputs.assumptions, comfort, pinnedIds);
  const policy: RingPolicy = inputs.ringPolicy ?? 'switch';
  const boostsNeedSupplies = raidBase(planA.raid).boostsNeedSupplies;
  // phase 31: magic's potion is the heart (one slot; none when a heart is pinned: it is carried anyway, counted once)
  const heart = kitHeart(inputs.assumptions, pinnedIds);
  const heartPinned = !!pinnedHeart(pinnedIds);
  const potionOf = (g: StyleGroup): KitPotionType | null => {
    if (!boostsNeedSupplies) return null;
    if (g === 'magic') return heartPinned ? null : 'heart';
    return KIT_POTIONS[g] ?? null;
  };
  const total = inputs.totalSlots ?? INVENTORY_SLOTS;
  const cancelled = () => hooks.shouldCancel?.() === true;
  const progress = (p: PlanProgress) => hooks.onProgress?.(p);
  assertTimeModelForRaid(tuning.model ?? FA_TIME_MODEL, planA);
  const routeA = raidTimeAssumptionsFrom(planA, drain, settings, tuning.model);
  const allRoutes = routesFor(routeA);
  const routes = inputs.route === 'all' ? allRoutes : allRoutes.filter((r) => r.id === inputs.route);
  if (!routes.length) throw new Error(`Planner: unknown route '${inputs.route}'`);
  // phase 23: the assumptions no longer carry a fight length by default; the planner's fallback stays 90 s
  const fallbackFight = planA.fightSeconds ?? DEFAULT_FIGHT_SECONDS;

  // phase 29: planner decides = no spec weapons up front (the Solo subset search / the Team share add them per ring run)
  const specMode: SpecMode = inputs.specMode ?? 'manual';
  const autoSpecs = specMode === 'auto';
  const specItems = autoSpecs ? [] : carriedSpecWeaponNames(planA.mySpecs).map(planItemByName);
  const ownedSpecs = SPEC_CANDIDATES.filter((w) => isOwned(SPEC_ITEM_NAMES[w], notOwned));
  // phase 29 review: the team's carriers picked by the planner (Team drains)
  const autoCarriers = drain === 'team' && (inputs.carrierMode ?? 'manual') === 'auto';
  // equipment + hearts (a heart is never worn: always one inventory slot, counted once)
  const pinnedItems = pinnedIds.map(pinnedPlanItem).filter((p): p is PlanItem => !!p);
  const droppedPinned = droppedIds.map(pinnedPlanItem).filter((p): p is PlanItem => !!p);
  const ownershipNotices = [
    ...droppedPinned.map((it) => `Dropped ${it.name} from "Items I always bring": on your "Items I don't own" list.`),
    ...specItems.filter((it) => !isOwned(it.name, notOwned)).map((it) => `${it.name} is in "Specs I bring" but on your "Items I don't own" list (${unownedBase(it.name, notOwned)}): untick it in Specs I bring.`),
    // phase 28: Camp Lightbearer always wears it
    ...(policy === 'camp-lightbearer' && !isOwned('Lightbearer', notOwned)
      ? ['Ring policy "Camp Lightbearer" wears Lightbearer, which is on your "Items I don\'t own" list: pick another ring policy (Advanced (plan)).']
      : []),
  ];
  // phase 21: the raid's own items (ToB: Dawnbringer) cost no slot and are free to put on any loadout
  const raidSupplied = raidSuppliedItemIds(planA);
  const raidSuppliedSet = new Set(raidSupplied);
  const carried = Array.from(new Set([...specItems, ...pinnedItems].map((i) => i.id)));
  const carriedSet = new Set(carried);
  const isFreeItem = (id: number) => carriedSet.has(id) || raidSuppliedSet.has(id);
  // the kit's potions are added per kit (KitProblem.potions)
  const fixedSlots = sumSupplies(comfort) + Math.max(0, Math.floor(inputs.nonItemSlots || 0));

  const emptyResult = (searchRows: Record<string, SearchRow[]>): PlanResult => ({
    cancelled: true,
    kit: [],
    kitMarginal: [],
    slots: null,
    inventory: [],
    specItems,
    pinnedItems,
    comparison: null,
    planned: -1,
    rejected: [],
    alternatives: [],
    unusedCarried: [],
    excluded: notOwned,
    droppedPinned,
    ownershipNotices,
    potions: [],
    quiverAmmo: null,
    keptAmmo: null,
    specs: {
      mode: specMode, drain, bring: [], text: bringText([]), notes: [],
    },
    ring: { policy, ring: null, screened: [] },
    matrixDps: {},
    searchRows,
    stats: {
      searches: 0,
      phases: 0,
      candidates: {
        preset: 0, search: 0, partial: 0, total: 0, capped: 0,
      },
      evaluations: 0,
      kitsEvaluated: 0,
      objectiveSeconds: Infinity,
      retimed: 0,
      ms: {
        search: 0, matrix: 0, optimise: 0, total: Date.now() - t0,
      },
    },
  });

  // 1. phase targets and searches
  const byEncounter = encounterPhaseTargets(routes, routeA);
  const targets: { targetKey: string, phase?: string }[] = [];
  const encounterOfCol: EncounterId[] = [];
  byEncounter.forEach((ts, e) => ts.forEach((t) => {
    if (targets.some((x) => phaseKey(x.targetKey, x.phase) === phaseKey(t.targetKey, t.phase))) return;
    targets.push(t);
    encounterOfCol.push(e);
  }));
  const searchRows: Record<string, SearchRow[]> = { ...(inputs.searchRows || {}) };
  const basePlayerKey = JSON.stringify(basePlayer);
  const searchKey = (t: { targetKey: string, phase?: string }) => JSON.stringify([
    planA, drain, t.targetKey, t.phase ?? null, notOwned, tuning.search ?? null, cfg.perGroupWeapons, cfg.perWeapon, basePlayerKey,
  ]);
  targets.forEach((t) => {
    const k = phaseKey(t.targetKey, t.phase);
    const hit = searchRows[k] ? undefined : SEARCH_CACHE.get(searchKey(t));
    if (hit) searchRows[k] = hit;
  });
  const missing = targets.filter((t) => !searchRows[phaseKey(t.targetKey, t.phase)]);
  for (const [i, t] of missing.entries()) {
    if (cancelled()) return emptyResult(searchRows);
    const label = `${findTarget(t.targetKey).label}${t.phase ? ` (${t.phase})` : ''}`;
    progress({
      stage: 'search', done: i, total: missing.length, label,
    });
    const r = runGearSearch(basePlayer, {
      targetKey: t.targetKey, phase: t.phase, drain, styles: 'all',
    }, planA, {
      ...(tuning.search || {}),
      notOwned,
      topN: SEARCH_TOP_N,
      shouldCancel: hooks.shouldCancel,
      onProgress: (search) => progress({
        stage: 'search', done: i, total: missing.length, label, search,
      }),
    });
    if (r.cancelled) return emptyResult(searchRows);
    searchRows[phaseKey(t.targetKey, t.phase)] = pickSearchRows(r, cfg.perGroupWeapons, cfg.perWeapon);
    if (SEARCH_CACHE.size >= SEARCH_CACHE_MAX) SEARCH_CACHE.clear();
    SEARCH_CACHE.set(searchKey(t), searchRows[phaseKey(t.targetKey, t.phase)]);
  }
  const tSearch = Date.now();

  // phase 29: the Solo spec subset of the first ring screen, reused by the other screens
  let screenSubset: PlannerWeapon[] | null = null;

  // phase 27: one run of steps 2-7 per ring (`ring` = the camped ring on every candidate; null = rings as searched).
  // `screen`: full candidates only (no partial switches), fewer seeds, one exact re-time, no explanations — ranks the
  // rings of "Camp one ring" before the full runs.
  const computeRing = (ring: PlanItem | null, screen: boolean): RingRun => {
    const tRing = Date.now();
    const ringA = ringAssumptions(planA, policy, ring);
    // phase 29 (Solo, planner decides): a subset's drains = the Solo plan of those weapons ("My specs" of the subset);
    // the candidates are generated against the drains of every owned spec weapon, the subset search picks the set
    const autoSolo = autoSpecs && drain === 'solo';
    const withSubset = (sub: PlannerWeapon[]): BestSetupAssumptions => ({ ...ringA, mySpecs: mySpecsForSubset(sub, ringA.mySpecs) });
    let assumptions = autoSolo ? withSubset(ownedSpecs) : ringA;
    let exactA = raidTimeAssumptionsFrom(assumptions, drain, settings, tuning.model);
    // Team / None: drains don't depend on the fight length, any fixed length is exact. Solo: set per encounter below.
    const fastA: RaidTimeAssumptions = { ...exactA, fixedFightSeconds: drain === 'none' ? undefined : fallbackFight };
    // 2. full candidates (presets + search rows), merged by items + group
    const candidates: PlanCandidate[] = [];
    const byKey = new Map<string, PlanCandidate>();
    const labelCount = new Map<string, number>();
    const uniqueLabel = (l: string) => {
      const n = (labelCount.get(l) ?? 0) + 1;
      labelCount.set(l, n);
      return n === 1 ? l : `${l} #${n}`;
    };
    const addCandidate = (c0: Omit<PlanCandidate, 'key' | 'label'> & { label: string }): PlanCandidate | null => {
      // a camped ring replaces every candidate's ring (merging candidates that only differed by it)
      const c1 = ring ? { ...c0, equipment: { ...c0.equipment, ring } } : c0;
      // phase 32: an ammo-slot item the weapon doesn't use and that changes no DPS is no part of the switch
      const c = { ...c1, equipment: withoutUnusedAmmo(c1.equipment) };
      const key = `${c.group}|${equipmentKey(c.equipment)}`;
      const old = byKey.get(key);
      if (old) {
        old.options = mergeOptions(old.options, c.options);
        return null;
      }
      const cand: PlanCandidate = { ...c, key, label: uniqueLabel(c.label) };
      byKey.set(key, cand);
      candidates.push(cand);
      return cand;
    };
    let nPreset = 0;
    let nSearch = 0;
    for (const preset of filterPresets(tuning.presets || raidBase(assumptions.raid).presets, notOwned)) {
      let equipment: PlanEquipment;
      try {
        equipment = presetEquipment(preset);
      } catch {
        continue;
      }
      const options = presetStyles(preset).flatMap((style) => presetSpells(preset).map((spell) => ({ style, spell })));
      if (addCandidate({
        label: preset.name, kind: 'preset', group: preset.group, equipment, options, source: 'preset',
      })) nPreset += 1;
    }
    for (const t of targets) {
      const where = `${findTarget(t.targetKey).label}${t.phase ? ` (${t.phase})` : ''}`;
      for (const row of searchRows[phaseKey(t.targetKey, t.phase)] || []) {
        if (addCandidate({
          label: row.weaponLabel,
          kind: 'search',
          group: row.group,
          equipment: searchRowEquipment(row),
          options: [{ style: row.style, spell: row.spell }],
          source: `search: ${where}`,
        })) nSearch += 1;
      }
    }

    // 3. DPS matrix (columns = phase targets under the drain state at the fixed fight length)
    const colIx = new Map(targets.map((t, i) => [phaseKey(t.targetKey, t.phase), i]));
    let evaluations = 0;
    const monstersAt = (d: DrainStateId, fightOf: (col: number) => number, a: BestSetupAssumptions = assumptions) => targets.map((t, col) => buildTargetMonster(
      findTarget(t.targetKey),
      t.phase,
      d,
      { ...a, fightSeconds: fightOf(col) },
    ).monster);
    // the monster of each column, as a cache key: phase 29: its drains (the rest of the monster depends on the
    // assumptions in ctxKey), so drain states that land on the same reductions share their DPS
    const tagsOf = (ms: { inputs: { defenceReductions: unknown } }[]) => targets
      .map((t, col) => `${phaseKey(t.targetKey, t.phase)}|${JSON.stringify(ms[col].inputs.defenceReductions)}`);
    // the spec / carrier / fight-length assumptions only change the drains (in the tags), not the player
    const ctxKey = JSON.stringify([{
      ...assumptions, mySpecs: null, team: null, fightSeconds: null,
    }, basePlayerKey]);
    let monsters = monstersAt(drain, () => fallbackFight);
    let tags = tagsOf(monsters);
    const dpsOn = (
      c: Pick<PlanCandidate, 'group' | 'options' | 'label'>,
      eq: PlanEquipment,
      col: number,
      ms = monsters,
      mt = tags,
    ): { dps: number, option: number } => {
      const key = `${ctxKey}|${mt[col]}|${c.group}|${equipmentKey(eq)}|${c.options.map(optionKey).join(';')}`;
      const hit = DPS_CACHE.get(key);
      if (hit) return hit;
      let best = { dps: 0, option: 0 };
      const playerEq = toPlayerEquipment(eq);
      // phase 38a: the column's target (tags start with its key) may be a ToA room before the supplies
      const colA = assumptionsForTarget(findTarget(mt[col].slice(0, mt[col].indexOf('|'))), assumptions);
      c.options.forEach((o, oi) => {
        let dps = 0;
        try {
          const player = applyLoadoutToPlayer(basePlayer, c.label, c.group, playerEq, o.style, o.spell, ms[col], colA);
          dps = evaluateLoadout(player, ms[col], false).dps;
        } catch {
          dps = 0;
        }
        evaluations += 1;
        if (dps > best.dps) best = { dps, option: oi };
      });
      if (DPS_CACHE.size >= DPS_CACHE_MAX) DPS_CACHE.clear();
      DPS_CACHE.set(key, best);
      return best;
    };
    let dps: number[][] = [];
    const bestOpt: number[][] = [];
    const optLabel = (i: number, col: number) => {
      const o = candidates[i].options[bestOpt[i]?.[col] ?? 0];
      return o ? styleLabel(o.style, o.spell) : '-';
    };
    // phase 36: the spec budget's drain states. A query with an event's spec counts (encounterBudget.ts) is the monster
    // built with exactly those specs; its DPS column (lazily per candidate) is keyed by the drained monster's stats, so
    // counts that land on the same Defence share their DPS. Drains "None" queries are the no-specs state.
    const allocMemo = new Map<string, { monster: ReturnType<typeof monstersAt>[number], tag: string }>();
    // phase 37: the same lookup by the counts themselves (skips the drain key, the replays' hot path)
    const allocByCounts = new Map<string, { monster: ReturnType<typeof monstersAt>[number], tag: string }>();
    const allocMonster = (q: PhaseQuery) => {
      const counts = q.drain === 'none' ? {} : (q.specs?.counts ?? {});
      const pk = phaseKey(q.targetKey, q.phase);
      const ck = `${pk}|${specCountsKey(counts)}`;
      const known = allocByCounts.get(ck);
      if (known) return known;
      // counts that leave the same drains share the monster (its drain line is not used here)
      const k = `${pk}|${specCountsDrainKey(findTarget(q.targetKey), q.phase, drain, ringA, counts)}`;
      let v = allocMemo.get(k);
      if (!v) {
        const m = monsterForSpecCounts(findTarget(q.targetKey), q.phase, drain, ringA, counts);
        const s = scaleMonster(m);
        v = { monster: m, tag: `${pk}#${JSON.stringify([s.skills, s.defensive, m.inputs.phase ?? ''])}` };
        allocMemo.set(k, v);
      }
      allocByCounts.set(ck, v);
      return v;
    };
    const allocCols = new Map<string, Float64Array>();
    const allocDps = (tag: string, monster: ReturnType<typeof monstersAt>[number], i: number): number => {
      let col = allocCols.get(tag);
      if (!col || col.length < candidates.length) {
        const old = col;
        col = new Float64Array(candidates.length).fill(NaN);
        if (old) col.set(old);
        allocCols.set(tag, col);
      }
      if (Number.isNaN(col[i])) col[i] = dpsOn(candidates[i], candidates[i].equipment, 0, [monster], [tag]).dps;
      return col[i];
    };
    const specDamageMemo = new Map<string, ReturnType<typeof damageSpecProfile>>();
    const specHitsMemo = new Map<string, Record<string, boolean>>();
    const drainKeyMemo = new Map<string, string>();
    const budgetKitParts: Pick<RaidKit, 'specDamage' | 'specHits' | 'drainKey'> = {
      drainKey: (q) => {
        // phase 37: memoised by the counts (specCountsDrainKey builds a JSON key per call)
        const k = `${phaseKey(q.targetKey, q.phase)}|${q.drain}|${specCountsKey(q.specs?.counts)}`;
        let dk = drainKeyMemo.get(k);
        if (dk === undefined) {
          dk = specCountsDrainKey(findTarget(q.targetKey), q.phase, q.drain, ringA, q.specs?.counts ?? {});
          drainKeyMemo.set(k, dk);
        }
        return dk;
      },
      specDamage: (q, w) => {
        const { monster, tag } = allocMonster(q);
        const m = atHpLeft(monster, q.hpLeft);
        const k = `${tag}|${w}|${m.inputs.monsterCurrentHp}`;
        if (!specDamageMemo.has(k)) specDamageMemo.set(k, damageSpecProfile(m, w, assumptionsForTarget(findTarget(q.targetKey), ringA)));
        return specDamageMemo.get(k)!;
      },
      specHits: (q) => {
        const pk = phaseKey(q.targetKey, q.phase);
        if (!specHitsMemo.has(pk)) specHitsMemo.set(pk, specHitsOf(allocMonster({ ...q, drain: 'none', specs: undefined }).monster, ringA));
        return specHitsMemo.get(pk)!;
      },
    };
    // the kit's pick on a drain state (by its tag): the highest DPS member, the first on ties; -1 = no member
    const pickOf = (tag: string, monster: ReturnType<typeof monstersAt>[number], members: number[]): number => {
      let bi = -1;
      let bd = 0;
      for (const m of members) {
        const d = allocDps(tag, monster, m);
        if (bi < 0 || d > bd) {
          bi = m;
          bd = d;
        }
      }
      return bi;
    };
    const pickChoice = (bi: number, tag: string, monster: ReturnType<typeof monstersAt>[number]): KitChoice | null => (bi < 0 ? null : {
      loadout: candidates[bi].label, style: '-', group: candidates[bi].group, dps: allocDps(tag, monster, bi),
    });
    // phase 37: the budget kits memoise their encounter times and model passes exactly (kitMemo.ts): a kit answers
    // through the drain state's tag (allocMonster) and its pick there; the rest (budgetKitParts) is the same for every kit
    const kitMemo = createKitMemo<Monster>({
      ask: (q) => {
        const { monster, tag } = allocMonster(q);
        return { id: tag, state: monster };
      },
      pick: (monster, tag, members) => pickOf(tag, monster, members),
      choice: (bi, monster, tag) => pickChoice(bi, tag, monster),
      parts: budgetKitParts,
    });
    const matrixKit = (members: number[], table: number[][] = dps, budget = false): RaidKit => (budget ? kitMemo.kit(members) : {
      best: (q) => {
        const col = colIx.get(phaseKey(q.targetKey, q.phase));
        if (col === undefined) throw new Error(`Planner: phase ${phaseKey(q.targetKey, q.phase)} not in the matrix`);
        let bi = -1;
        for (const m of members) {
          if (bi < 0 || table[m][col] > table[bi][col]) bi = m;
        }
        if (bi < 0) return null;
        return {
          loadout: candidates[bi].label, style: optLabel(bi, col), group: candidates[bi].group, dps: table[bi][col],
        };
      },
    });
    // Solo: the drains depend on the fight length. Each encounter's length = its undrained time with the best single
    // full candidate (one extra undrained pass over the presets + search rows); the matrix plans drains with it.
    let soloFight: Partial<Record<EncounterId, number>> | undefined;
    if (drain === 'solo') {
      const noneMonsters = monstersAt('none', () => fallbackFight);
      const noneTags = tagsOf(noneMonsters);
      const noneDps: number[][] = candidates.map((c, i) => {
        if (cancelled()) throw new PlanCancelled();
        if (i % 5 === 0) {
          progress({
            stage: 'matrix', done: i, total: candidates.length, label: 'fight lengths (undrained)',
          });
        }
        return targets.map((_, col) => dpsOn(c, c.equipment, col, noneMonsters, noneTags).dps);
      });
      const noneA: RaidTimeAssumptions = { ...exactA, drain: 'none' };
      soloFight = {};
      for (const e of Array.from(byEncounter.keys())) {
        let bestT = Infinity;
        candidates.forEach((_, i) => {
          const t = encounterTime(e, matrixKit([i], noneDps), noneA).seconds;
          if (t < bestT) bestT = t;
        });
        // phase 28: the fight length as the time model computes it (hp ÷ (party size × DPS), not the multiplier's)
        soloFight[e] = drainFightSecondsOf(bestT, { ...noneA, fallbackFightSeconds: fallbackFight });
      }
      fastA.fixedFightSeconds = soloFight;
      monsters = monstersAt(drain, (col) => soloFight![encounterOfCol[col]] ?? fallbackFight);
      tags = tagsOf(monsters);
    }
    const fillMatrix = (from: number, stage: PlanProgress['stage']) => {
      for (let i = from; i < candidates.length; i++) {
        if (cancelled()) throw new PlanCancelled();
        if ((i - from) % 5 === 0) {
          progress({
            stage, done: i - from, total: candidates.length - from, label: candidates[i].label,
          });
        }
        // DPS_CACHE: a ring's screen and full run, and later plans with other supplies / items / route, reuse the rows
        const row = targets.map((_, col) => dpsOn(candidates[i], candidates[i].equipment, col));
        dps[i] = row.map((x) => x.dps);
        bestOpt[i] = row.map((x) => x.option);
      }
    };

    fillMatrix(0, 'matrix');
    const colMax = targets.map((_, col) => Math.max(0, ...dps.map((r) => r[col])));
    const score = (i: number) => dps[i].reduce((s, d, col) => s + (colMax[col] > 0 ? d / colMax[col] : 0), 0);
    const ranked = (ixs: number[]) => ixs.map((i) => ({ i, s: score(i) })).sort((a, b) => (b.s - a.s) || (a.i - b.i)).map((x) => x.i);
    const fullCount = candidates.length;

    // 4. partial switches
    let nPartial = 0;
    let capped = 0;
    if (!screen) {
      const byGroup = (g: StyleGroup) => ranked(candidates.map((_, i) => i).filter((i) => candidates[i].group === g && dps[i].some((d) => d > 0)));
      const bases = GROUP_ORDER.flatMap((g) => byGroup(g).slice(0, cfg.bases));
      const partnersOf = (g: StyleGroup) => {
        const top = byGroup(g).slice(0, cfg.partners);
        // + the best loadout of each carried / raid-supplied weapon of this group (they cost no slot)
        const carriedWeapons = byGroup(g).filter((i) => isFreeItem(candidates[i].equipment.weapon?.id ?? -1));
        const seenWeapon = new Set<number>();
        const extra = carriedWeapons.filter((i) => {
          const w = candidates[i].equipment.weapon!.id;
          if (seenWeapon.has(w)) return false;
          seenWeapon.add(w);
          return !top.includes(i);
        });
        return [...top, ...extra];
      };
      const pending: (Omit<PlanCandidate, 'key' | 'label'> & { label: string })[] = [];
      const pairs = bases.flatMap((a) => GROUP_ORDER.filter((g) => g !== candidates[a].group).flatMap((g) => partnersOf(g).map((b) => [a, b])));
      // phase 21: single-piece swaps within a weapon — a base with one piece of another full loadout of the same weapon
      // (e.g. Torva helm + Oathplate + Scythe with the Salve amulet(ei) of "Torva + Salve (ei) + Scythe"), so near-duplicate
      // sets of one weapon can merge into one set + the pieces that matter (then the dedupe rule drops the leftovers)
      bases.forEach((a) => {
        const A = candidates[a];
        const weapon = A.equipment.weapon?.id;
        if (weapon === undefined) return;
        const seenPiece = new Set<string>();
        for (let b = 0; b < fullCount; b++) {
          const B = candidates[b];
          if (b === a || B.group !== A.group || B.equipment.weapon?.id !== weapon || !dps[b].some((d) => d > 0)) continue;
          PIECE_SLOTS.forEach((slot) => {
            const it = B.equipment[slot];
            if (!it || it.id === A.equipment[slot]?.id || seenPiece.has(`${slot}|${it.id}`)) return;
            seenPiece.add(`${slot}|${it.id}`);
            pending.push({
              label: `${A.label} + ${it.name}`,
              kind: 'partial',
              group: A.group,
              equipment: { ...A.equipment, [slot]: it },
              options: mergeOptions(A.options, B.options),
              source: `${A.label} with ${it.name} (${slot}, from ${B.label})`,
              base: A.label,
              partner: B.label,
              pieces: [slot],
            });
          });
        }
      });
      // phase 21: a raid-supplied weapon (ToB's Dawnbringer) on every full candidate of another style ("Dawnbringer on
      // worn gear"): weapon only, so it costs 0 slots whichever loadout ends up worn
      const freeWeaponPartners = GROUP_ORDER.flatMap((g) => byGroup(g)).filter((i) => raidSuppliedSet.has(candidates[i].equipment.weapon?.id ?? -1));
      const seenFreeWeapon = new Set<number>();
      freeWeaponPartners.forEach((b) => {
        const w = candidates[b].equipment.weapon!.id;
        if (seenFreeWeapon.has(w)) return;
        seenFreeWeapon.add(w);
        const B = candidates[b];
        for (let a = 0; a < fullCount; a++) {
          const A = candidates[a];
          if (A.group === B.group || bases.includes(a) || !dps[a].some((d) => d > 0)) continue;
          const v0 = partialSwitchVariants(A.equipment, B.equipment, () => 0)[0];
          // the variant also takes the partner's ammo / shield (or drops the shield for a two-hander): say so
          let extras = B.equipment.ammo ? ' + ammo' : '';
          if ((v0.equipment.shield?.id ?? -1) !== (A.equipment.shield?.id ?? -1)) extras += v0.equipment.shield ? ' + shield' : ', shield removed';
          pending.push({
            label: `${B.equipment.weapon?.name ?? B.label} switch on ${A.label}`,
            kind: 'partial',
            group: B.group,
            equipment: v0.equipment,
            options: B.options,
            source: `${A.label} → ${B.label}, weapon${extras} (the raid item: 0 slots)`,
            base: A.label,
            partner: B.label,
            pieces: [],
          });
        }
      });
      pairs.forEach(([a, b], pi) => {
        if (cancelled()) throw new PlanCancelled();
        const A = candidates[a];
        const B = candidates[b];
        progress({
          stage: 'partials', done: pi, total: pairs.length, label: `${A.label} → ${B.label}`,
        });
        // B's best phase: where it is closest to the best candidate (ties: higher DPS)
        let col = 0;
        dps[b].forEach((d, c) => {
          const rel = colMax[c] > 0 ? d / colMax[c] : 0;
          const relBest = colMax[col] > 0 ? dps[b][col] / colMax[col] : 0;
          if (rel > relBest + EPS || (Math.abs(rel - relBest) <= EPS && d > dps[b][col])) col = c;
        });
        const variants = partialSwitchVariants(A.equipment, B.equipment, (eq) => dpsOn(B, eq, col).dps, isFreeItem);
        variants.forEach((v) => {
          pending.push({
            label: `${B.equipment.weapon?.name ?? B.label} switch${v.pieces.length ? ` +${v.pieces.length}` : ''} on ${A.label}`,
            kind: 'partial',
            group: B.group,
            equipment: v.equipment,
            options: B.options,
            source: `${A.label} → ${B.label}${v.pieces.length ? `: ${v.pieces.map((s) => B.equipment[s]!.name).join(', ')}` : ', weapon only'}`,
            base: A.label,
            partner: B.label,
            pieces: v.pieces,
          });
        });
      });
      // cap: keep the cheaper switches (fewer pieces) first, stable
      const room = Math.max(0, cfg.maxCandidates - candidates.length);
      const order = pending.map((p, i) => ({ p, i })).sort((x, y) => (x.p.pieces!.length - y.p.pieces!.length) || (x.i - y.i));
      order.forEach(({ p }) => {
        if (byKey.has(`${p.group}|${equipmentKey(p.equipment)}`)) {
          addCandidate(p);
          return;
        }
        if (candidates.length - fullCount >= room) {
          capped += 1;
          return;
        }
        if (addCandidate(p)) nPartial += 1;
      });
      fillMatrix(fullCount, 'partials');
    }
    const tMatrix = Date.now();

    // 5. optimise
    // Phase 36: kits are timed with `ta` (default `runA`). With the spec budget (Solo / Team), the optimiser replays a
    // fixed spec plan (`fixedAlloc`, found by the budget's DP on a reference kit: `fixedFor`), one pass per encounter;
    // the bootstrap (`legacyA`) times the phase 14-35 per-target drain states of the table, to find that first kit.
    const legacyA: RaidTimeAssumptions = { ...fastA, specBudget: undefined, fixedAlloc: undefined };
    const budgetOn = !!fastA.specBudget;
    let runA: RaidTimeAssumptions = legacyA;
    const routeTimeWith = (table: number[][], ta?: RaidTimeAssumptions) => (members: number[]) => {
      const t = ta ?? runA;
      const cmp = compareRoutes(matrixKit(members, table, !!t.specBudget), t, routes);
      return cmp.fastest >= 0 ? cmp.routes[cmp.fastest].seconds : Infinity;
    };
    // the current matrix and spec plan (phase 29: the chosen spec subset's / carriers', once picked)
    const routeTime = (members: number[]) => routeTimeWith(dps)(members);
    const items = candidates.map((c) => equipmentItemIds(c.equipment));
    // phase 32: a candidate without ammo of its own keeps a kit ammo item in its ammo slot (wornItemCounts)
    const ammoWorn = candidates.map((c) => wearsAmmo(c.equipment));
    const minWorn = (m: number[]) => Math.min(...wornItemCounts(m.map((x) => items[x].length), m.map((x) => ammoWorn[x])));
    // phase 27: the potion each candidate needs (Super combat / Ranging potion; phase 31: magic the heart; ToA / CoX: none)
    const potions = candidates.map((c) => potionOf(c.group));
    // phase 31: Dizana's quiver holds a second arrow / bolt type (−1 slot; quiverSavedSlots)
    const quiver = quiverSpecOf([...items.flat(), ...carried]);
    // seeds: the best single loadouts by their own route time (ties: matrix score), plus the best of every style group so
    // single-style and mixed kits both get explored. Phase 29 review: ranked under the drain state being optimised (each
    // spec subset / carrier set its own table; phase 36: and spec plan), and the group bests are kept however few seeds
    // are asked for.
    const seedsMemo = new Map<RaidTimeAssumptions, Map<number[][], Map<number, number[]>>>();
    const seedsFor = (table: number[][], n: number, ta?: RaidTimeAssumptions): number[] => {
      const t = ta ?? runA;
      if (!seedsMemo.has(t)) seedsMemo.set(t, new Map());
      const byTable = seedsMemo.get(t)!;
      let byN = byTable.get(table);
      if (!byN) {
        byN = new Map();
        byTable.set(table, byN);
      }
      if (!byN.has(n)) {
        const rt = routeTimeWith(table, t);
        const cmax = targets.map((_, col) => Math.max(0, ...table.map((r) => r[col])));
        const singles = candidates.map((c, i) => ({
          i, t: rt([i]), s: table[i].reduce((a, d, col) => a + (cmax[col] > 0 ? d / cmax[col] : 0), 0), group: c.group,
        })).filter((x) => table[x.i].some((d) => d > 0));
        byN.set(n, pickSeeds(singles, GROUP_ORDER, n));
      }
      return byN.get(n)!;
    };
    const seedCount = screen ? Math.min(cfg.seeds, SCREEN_SEEDS) : cfg.seeds;
    let seeds = seedsFor(dps, seedCount, legacyA);
    const optimiseFor = (table: number[][], carriedIds: number[], seedList: number[], label: string, ta?: RaidTimeAssumptions) => optimiseKit({
      items,
      carried: carriedIds,
      fixedSlots,
      totalSlots: total,
      time: routeTimeWith(table, ta),
      seeds: seedList.length ? seedList : [0],
      raidSupplied,
      potions,
      quiver,
      wearsAmmo: ammoWorn,
      noPrune: tuning.noPrune,
      shouldCancel: hooks.shouldCancel,
      onProgress: (done, n) => progress({
        stage: screen ? 'rings' : 'optimise', done, total: n, label: screen ? ringLabel(ring) : label,
      }),
    });
    // slots of a kit with these carried items (the optimiser's usedOf)
    const usedWith = (carriedIds: number[], m: number[]) => {
      const allIds = new Set<number>(carriedIds.filter((id) => !raidSuppliedSet.has(id)));
      m.forEach((x) => items[x].forEach((id) => {
        if (!raidSuppliedSet.has(id)) allIds.add(id);
      }));
      return fixedSlots + allIds.size - (m.length ? minWorn(m) : 0) + potionSlots(m.map((x) => potions[x]))
        - quiverSavedSlots(allIds, quiver);
    };

    // phase 29: DPS columns per distinct drain state (by tag = the monster's reductions), shared by the spec subsets /
    // carrier sets of this run (the bootstrap's tables and the seeds' scores)
    const colCache = new Map<string, number[]>();
    targets.forEach((_, col) => colCache.set(tags[col], dps.map((r) => r[col])));
    const tableMemo = new Map<string, number[][]>();
    const tableFor = (ms: ReturnType<typeof monstersAt>, ts: string[], label: string) => {
      const memoKey = ts.join('#');
      if (tableMemo.has(memoKey)) return tableMemo.get(memoKey)!;
      ts.forEach((tag, col) => {
        if (colCache.has(tag)) return;
        if (cancelled()) throw new PlanCancelled();
        progress({
          stage: 'matrix', done: col, total: ts.length, label,
        });
        colCache.set(tag, candidates.map((c) => dpsOn(c, c.equipment, col, ms, ts).dps));
      });
      const table = candidates.map((_, i) => ts.map((tag) => colCache.get(tag)![i]));
      tableMemo.set(memoKey, table);
      return table;
    };
    const cmpSeconds = (cmp: RouteComparison) => (cmp.fastest >= 0 ? cmp.routes[cmp.fastest].seconds : Infinity);
    // phase 36: the spec budget's DP on a kit (the matrix, these members) for the assumptions' specs, and the spec plan
    // it picks as the optimiser's fixed plan (the fastest route's encounters win: their surge doses)
    const budgetA = (a: BestSetupAssumptions): RaidTimeAssumptions => ({
      ...raidTimeAssumptionsFrom(a, drain, settings, tuning.model),
      ...(fastA.fixedFightSeconds !== undefined ? { fixedFightSeconds: fastA.fixedFightSeconds } : {}),
    });
    const dpMemo = new Map<string, RouteComparison>();
    const dpCmp = (members: number[], a: BestSetupAssumptions): RouteComparison => {
      const k = JSON.stringify([[...members].sort((x, y) => x - y), a.mySpecs, a.team, a.damageSpecs ?? [], a.surgePotions ?? 0]);
      let cmp = dpMemo.get(k);
      if (!cmp) {
        if (cancelled()) throw new PlanCancelled();
        cmp = compareRoutes(matrixKit(members, dps, true), budgetA(a), routes);
        dpMemo.set(k, cmp);
      }
      return cmp;
    };
    const allocOf = (cmp: RouteComparison): Partial<Record<EncounterId, EncounterAlloc>> => {
      const out: Partial<Record<EncounterId, EncounterAlloc>> = {};
      const take = (e: EncounterTime) => {
        if (e.specPlan) {
          out[e.id] = {
            events: e.specPlan.events, rowEvent: e.specPlan.rowEvent, damage: e.specPlan.damage, surge: e.specPlan.surge,
          };
        }
      };
      cmp.routes.forEach((r) => r.encounters.forEach((e) => { if (!out[e.id]) take(e); }));
      if (cmp.fastest >= 0) cmp.routes[cmp.fastest].encounters.forEach(take);
      return out;
    };
    const fixedFor = (a: BestSetupAssumptions, members: number[]): RaidTimeAssumptions => (budgetOn
      ? { ...budgetA(a), fixedAlloc: allocOf(dpCmp(members, a)) }
      : legacyA);
    /** The drain state of every phase of a fixed plan (its DPS columns' tags): equal = the same problem. */
    const planSignature = (ta: RaidTimeAssumptions): string => {
      const parts: string[] = [];
      Object.keys(ta.fixedAlloc ?? {}).sort().forEach((id) => {
        const al = ta.fixedAlloc![id]!;
        (byEncounter.get(id) ?? []).forEach((t) => {
          al.events.forEach((ev) => {
            parts.push(allocMonster({
              targetKey: t.targetKey, phase: t.phase, drain, fightSeconds: fallbackFight, specs: { counts: ev.counts },
            }).tag);
          });
        });
        parts.push(JSON.stringify(al.damage));
      });
      return parts.join('#');
    };

    // phase 29: the spec weapons. Solo (planner decides): every subset of the owned spec weapons with the kit
    // (specChoice.ts searchSpecSubsets). Team: the carriers (planner decides: greedy on the route time, review fix), then
    // the briefing and your share ("assign me"). Phase 36: each timed with the spec budget (one per encounter).
    let runCarried = carried;
    let runSpecItems = specItems;
    let subsetResult: SubsetSearchResult<PlannerWeapon> | undefined;
    let opt: KitOptimum;
    const specId = (w: PlannerWeapon) => planItemByName(SPEC_WEAPONS[w].item).id;
    const magesOf = (m: number[]) => inputs.magesInParty ?? (m.some((i) => candidates[i].group === 'magic') ? 1 : 0);
    // Team: the monsters of a carrier set (the drain state = teamSpecPlan with exactly these carriers)
    const teamMemo = new Map<string, { a: BestSetupAssumptions, ms: ReturnType<typeof monstersAt>, ts: string[] }>();
    const teamData = (c: CarrierCounts) => {
      const k = JSON.stringify(c);
      let d = teamMemo.get(k);
      if (!d) {
        if (cancelled()) throw new PlanCancelled();
        const a: BestSetupAssumptions = { ...assumptions, team: { ...assumptions.team, carriers: { ...c } } };
        const ms = monstersAt('team', () => fallbackFight, a);
        d = { a, ms, ts: tagsOf(ms) };
        teamMemo.set(k, d);
      }
      return d;
    };
    // phase 36: a carrier set's route time on a kit = the spec budget's DP with exactly these carriers
    const teamCmp = (c: CarrierCounts, members: number[]) => dpCmp(members, {
      ...teamData(c).a, damageSpecs: assumptions.damageSpecs, surgePotions: assumptions.surgePotions,
    });
    let carrierSteps: CarrierStep[] | undefined;
    // review 2: Eye of Ayak carriers capped at the mages in the party (only mages gain from its drain; the time model
    // treats teammates as copies of you, so an uncapped count overstates it, UNVERIFIED D22). Phase 36 review: `total`
    // = the party, or the party − 1 when you damage-spec / drink surge doses (you are not a carrier then).
    const carrierWeaponsFor = (m: number[]): PlannerWeapon[] => ['elderMaul', 'tonalztics', 'dwh', 'bgs', ...(magesOf(m) > 0 ? ['ayak' as PlannerWeapon] : [])];
    const carrierGreedy = (m: number[], totalCarriers: number) => greedyCarriers({
      weapons: carrierWeaponsFor(m),
      total: totalCarriers,
      perWeapon: totalCarriers,
      caps: { ayak: magesOf(m) },
      time: (c) => cmpSeconds(teamCmp(c, m)),
    });
    const carrierNotes: string[] = [];
    let soloWithSubset: ((sub: PlannerWeapon[]) => BestSetupAssumptions) | undefined;
    if (autoSolo) {
      const fightOfCol = (col: number) => soloFight?.[encounterOfCol[col]] ?? fallbackFight;
      const subsetMemo = new Map<string, { a: BestSetupAssumptions, ms: ReturnType<typeof monstersAt>, ts: string[] }>();
      // the subset's monsters: the undrained monster + the Solo reductions (SOLO_DRAIN_CACHE); phase 36: the bootstrap
      const soloMonstersAt = (a: BestSetupAssumptions) => targets.map((t, col) => {
        const fight = fightOfCol(col);
        const regen = a.mySpecs.lightbearer ? LIGHTBEARER_REGEN_SECONDS : SPEC_REGEN_SECONDS;
        const key = JSON.stringify([t.targetKey, t.phase ?? null, a.mySpecs, Math.floor(fight / regen), {
          ...a, mySpecs: null, team: null, fightSeconds: null,
        }]);
        const fa = { ...a, fightSeconds: fight };
        const target = findTarget(t.targetKey);
        let r = SOLO_DRAIN_CACHE.get(key);
        if (!r) {
          r = buildTargetMonster(target, t.phase, drain, fa).monster.inputs.defenceReductions;
          if (SOLO_DRAIN_CACHE.size >= SOLO_DRAIN_CACHE_MAX) SOLO_DRAIN_CACHE.clear();
          SOLO_DRAIN_CACHE.set(key, r);
        }
        const m = buildTargetMonster(target, t.phase, 'none', fa).monster;
        return { ...m, inputs: { ...m.inputs, defenceReductions: r } };
      });
      const subsetData = (sub: PlannerWeapon[]) => {
        const k = sub.join('+');
        let d = subsetMemo.get(k);
        if (!d) {
          if (cancelled()) throw new PlanCancelled();
          const a = withSubset(sub);
          const ms = soloMonstersAt(a);
          d = { a, ms, ts: tagsOf(ms) };
          subsetMemo.set(k, d);
        }
        return d;
      };
      const tableOf = (sub: PlannerWeapon[]) => {
        const { ms, ts } = subsetData(sub);
        return tableFor(ms, ts, `drains with ${bringText(sub).replace('Bring: ', '')}`);
      };
      const carriedWith = (sub: PlannerWeapon[]) => Array.from(new Set([...carried, ...sub.map(specId)]));
      const quickSeeds = Math.min(screen ? SUBSET_SCREEN_SEEDS : SUBSET_QUICK_SEEDS, seedCount);
      // phase 36: the reference kit of the subsets' spec plans: the bootstrap kit with every owned spec weapon
      const refTable = tableOf(ownedSpecs);
      const ref = optimiseFor(refTable, carriedWith(ownedSpecs), seedsFor(refTable, quickSeeds, legacyA), 'kits', legacyA);
      const subA = new Map<string, RaidTimeAssumptions>();
      const subPlan = (sub: PlannerWeapon[]) => {
        const k = sub.join('+');
        if (!subA.has(k)) subA.set(k, budgetOn ? fixedFor(withSubset(sub), ref.best.members) : legacyA);
        return subA.get(k)!;
      };
      const optMemo = new Map<string, KitOptimum>();
      // review fix: each subset's seeds are ranked under its own table (they were the all-weapons table's first n)
      const runSub = (sub: PlannerWeapon[], n: number) => {
        const k = `${n}|${sub.join('+')}`;
        if (!optMemo.has(k)) {
          const table = tableOf(sub);
          const ta = budgetOn ? subPlan(sub) : legacyA;
          optMemo.set(k, optimiseFor(table, carriedWith(sub), seedsFor(table, n, ta), `spec weapons: ${bringText(sub).replace('Bring: ', '')}`, ta));
        }
        return optMemo.get(k)!;
      };
      // ring screens with a subset fixed by the ring loop (`screenSubset`) time only it; full runs always search
      const fixed = screen ? screenSubset : null;
      subsetResult = fixed ? undefined : searchSpecSubsets<PlannerWeapon>({
        weapons: ownedSpecs,
        // phase 36: the same spec plan (drain state of every phase) = the same problem
        signature: (sub) => (budgetOn ? planSignature(subPlan(sub)) : subsetData(sub).ts.join('#')),
        slots: (sub) => sub.filter((w) => !carriedSet.has(specId(w))).length,
        quick: (sub) => runSub(sub, quickSeeds).best.time,
        // a subset whose every DPS is ≤ another's (with no more slots) can't be faster (phase 36: only for the
        // phase 14-35 tables; the spec plans differ per subset)
        ...(budgetOn ? {} : {
          dominated: (sub: PlannerWeapon[], by: PlannerWeapon[]) => {
            const a = tableOf(sub);
            const b = tableOf(by);
            return a.every((row, i) => row.every((d, col) => d <= b[i][col] + 1e-9));
          },
        }),
        ...(screen ? {} : { full: (sub: PlannerWeapon[]) => runSub(sub, seedCount).best.time }),
        finalists: screen ? 1 : SUBSET_FINALISTS,
        guard: screen ? 0 : SUBSET_GUARD_FACTOR,
      });
      const best = fixed ?? subsetResult!.best;
      if (screen && !fixed) screenSubset = best;
      opt = runSub(best, seedCount);
      assumptions = subsetData(best).a;
      dps = tableOf(best);
      runA = budgetOn ? subPlan(best) : legacyA;
      if (budgetOn) {
        // phase 36: the spec plan of the chosen kit (the DP on its members), the kit re-optimised once under it
        runA = fixedFor(assumptions, opt.best.members);
        opt = optimiseFor(dps, carriedWith(best), seedsFor(dps, seedCount), `spec weapons: ${bringText(best).replace('Bring: ', '')}`);
        runA = fixedFor(assumptions, opt.best.members);
      }
      exactA = raidTimeAssumptionsFrom(assumptions, drain, settings, tuning.model);
      seeds = seedsFor(dps, seedCount);
      runCarried = carriedWith(best);
      runSpecItems = best.map((w) => planItemByName(SPEC_WEAPONS[w].item));
      soloWithSubset = withSubset;
    } else if (autoCarriers) {
      // review fix: the carriers are planner output. Greedy (specChoice.ts greedyCarriers) on the route time of the kit
      // optimised under the Advanced carriers; then the kit is re-optimised under the chosen carriers, and if it changed,
      // the greedy runs once more on it (at most two rounds). The Team drain state uses exactly these carriers. Phase 36:
      // each carrier set timed with the spec budget's DP on the kit (a carrier that saves nothing is never added).
      const party = Math.max(1, Math.floor(assumptions.partySize));
      const greedyOn = (m: number[]) => carrierGreedy(m, party);
      opt = optimiseFor(dps, carried, seeds, 'kits', legacyA);
      let g = greedyOn(opt.best.members);
      for (let round = 0; round < 2; round++) {
        const { ms, ts } = teamData(g.carriers);
        const table = tableFor(ms, ts, `drains with ${carriersText(party, rowsFromCarriers(g.carriers, () => ({ saved: 0, drivers: [] })))}`);
        const before = [...opt.best.members].sort((x, y) => x - y).join(',');
        dps = table;
        runA = fixedFor(teamData(g.carriers).a, opt.best.members);
        seeds = seedsFor(table, seedCount);
        opt = optimiseFor(table, carried, seeds, 'kits');
        if (round === 1 || [...opt.best.members].sort((x, y) => x - y).join(',') === before) break;
        const g2 = greedyOn(opt.best.members);
        const same = JSON.stringify(g2.carriers) === JSON.stringify(g.carriers);
        g = g2; // review 2: the steps as measured on the final kit
        if (same) break;
      }
      carrierSteps = g.steps;
      assumptions = teamData(g.carriers).a;
      runA = fixedFor(assumptions, opt.best.members);
      exactA = raidTimeAssumptionsFrom(assumptions, drain, settings, tuning.model);
    } else {
      opt = optimiseFor(dps, carried, seeds, 'kits', legacyA);
      if (drain === 'team') {
        // review 2: manual carriers — only the first party-size count (teamSpecPlan's order), Eye of Ayak capped at the
        // mages; when that changes the drains, re-optimise under the clamped carriers
        const party = Math.max(1, Math.floor(assumptions.partySize));
        const raw: CarrierCounts = { ...NO_CARRIERS, ...assumptions.team.carriers };
        const eff = effectiveCarriers(assumptions.team.carriers, party, magesOf(opt.best.members));
        const rawTotal = Object.values(raw).reduce((a, v) => a + v, 0);
        if (rawTotal > party) carrierNotes.push(`${rawTotal} carriers set in Advanced for a party of ${party}: only the first ${party} count.`);
        if (eff.ayak < raw.ayak) {
          carrierNotes.push(`Eye of Ayak carriers capped at the mages in the party (${eff.ayak}): only mages gain from its drain here.`);
        }
        // the party cut is what teamSpecPlan does anyway (same drains); the Ayak cap changes them: re-optimise then
        if (eff.ayak < effectiveCarriers(assumptions.team.carriers, party, Infinity).ayak) {
          const { ms, ts } = teamData(eff);
          dps = tableFor(ms, ts, 'drains with the carriers that count');
          seeds = seedsFor(dps, seedCount, legacyA);
          opt = optimiseFor(dps, carried, seeds, 'kits', legacyA);
        }
        assumptions = teamData(eff).a;
        exactA = raidTimeAssumptionsFrom(assumptions, drain, settings, tuning.model);
      }
      if (budgetOn) {
        // phase 36: the spec plan of the bootstrap kit, the kit re-optimised once under it
        runA = fixedFor(assumptions, opt.best.members);
        seeds = seedsFor(dps, seedCount);
        opt = optimiseFor(dps, carried, seeds, 'kits');
        runA = fixedFor(assumptions, opt.best.members);
      }
    }

    // phase 36: your damage spec weapons and Surge potions (planner decides). Greedy on the spec budget's DP with the
    // kit: add the item that saves the most route time while it saves ≥ 1 s per slot it takes (a free slot or one
    // taken from the kit: the kit is re-optimised with it carried); Solo then drops a drain weapon whose slot is worth
    // < 1 s now that the energy has other uses. Team: damage specs are your own energy, so you carry none of the
    // team's drain weapons then (your share below).
    let damageBring: DamageSpecWeapon[] = [];
    let surgePotions = 0;
    let itemSteps: PlanItemStep[] = [];
    const itemNotes: string[] = [];
    // phase 36 review: Team — you are a carrier OR you damage-spec / drink doses (one bar each, the party's bars): the
    // state before the items (you carry, the carriers up to the party) to compare against
    const carryState = {
      opt, assumptions, runA, exactA, runCarried, runSpecItems, carrierSteps,
    };
    if (autoSpecs && budgetOn && !screen) {
      const ownedDamage = DAMAGE_SPEC_WEAPON_IDS.filter((w) => isOwned(damageSpecItemName(w), notOwned));
      const damageId = (w: DamageSpecWeapon) => planItemByName(DAMAGE_SPEC_WEAPONS[w].item).id;
      const withItems = (a: BestSetupAssumptions, dmg: DamageSpecWeapon[], surge: number): BestSetupAssumptions => ({
        ...a, damageSpecs: [...dmg], surgePotions: surge,
      });
      // phase 36 review: Team (auto carriers) — with items your bar is yours, so the carriers must fit in party − 1: the
      // carrier whose removal costs least on this kit makes way (specBudgetFrom would cut the last one in order)
      const teamParty = Math.max(1, Math.floor(assumptions.partySize));
      const fitBars = (a: BestSetupAssumptions, m: number[]): BestSetupAssumptions => {
        if (drain !== 'team' || !autoCarriers || !((a.damageSpecs ?? []).length || (a.surgePotions ?? 0) > 0)) return a;
        let c: CarrierCounts = { ...NO_CARRIERS, ...a.team.carriers };
        let cur = a;
        while (Object.values(c).reduce((t, v) => t + v, 0) > teamParty - 1) {
          let bestA: BestSetupAssumptions | null = null;
          let bestT = Infinity;
          for (const w of Object.keys(c) as PlannerWeapon[]) {
            if (c[w] > 0) {
              const x: BestSetupAssumptions = { ...cur, team: { ...cur.team, carriers: { ...c, [w]: c[w] - 1 } } };
              const t = cmpSeconds(dpCmp(m, x));
              if (t < bestT - 1e-9) {
                bestT = t;
                bestA = x;
              }
            }
          }
          if (!bestA) break;
          cur = bestA;
          c = { ...NO_CARRIERS, ...cur.team.carriers };
        }
        return cur;
      };
      // phase 38e: the item steps as a small beam (specChoice.ts itemBeam: the best ITEM_BEAM_WIDTH by net saving for
      // ITEM_BEAM_DEPTH steps, then greedy; the fastest state wins), each step ranked by what it really gives: with a
      // free slot (or carried anyway) on the kit as is, with none on the kit re-optimised with the item carried
      // (itemStepNet: a slot the new kit leaves free is credited). Then swaps (an item for one not brought, same kit).
      // An accepted item is pinned in the carried list, also at 0 slots (a later re-optimisation must keep it).
      interface ItemState {
        opt: KitOptimum, a: BestSetupAssumptions, carried: number[], damage: DamageSpecWeapon[], surge: number,
        /** notes: the rejections on the way here; own: those of its own expansion (filled when it is expanded) */
        steps: PlanItemStep[], notes: Map<string, string>, own?: Map<string, string>,
      }
      const inKitOf = (id: number, m: number[], carriedIds: number[]) => carriedIds.includes(id) || m.some((x) => items[x].includes(id));
      const pinItem = (carriedIds: number[], id: number) => (carriedIds.includes(id) ? carriedIds : [...carriedIds, id]);
      const rescoreWith = (o: KitOptimum, carriedIds: number[]): KitOptimum => {
        const rescore = (x: KitSolution): KitSolution => ({ ...x, used: usedWith(carriedIds, x.members) });
        return { ...o, best: rescore(o.best), finals: o.finals.map(rescore) };
      };
      // phase 38a: the doses the surge clock allows (the raid clock; ToB: fight time only)
      const maxPotionsOn = (m: number[], a: BestSetupAssumptions) => {
        const route = dpCmp(m, a);
        const wall = route.fastest >= 0 ? route.routes[route.fastest].encounters.reduce((t, e) => t + encounterWallSeconds(e.seconds, fastA), 0) : 0;
        return dosesAllowed(surgeClockSpan(wall, fastA)) > SURGE_DOSES_PER_POTION ? 2 : 1;
      };
      const expandItems = (s: ItemState, curT: number): ItemBeamChild<ItemState>[] => {
        const m = s.opt.best.members;
        const maxPotions = maxPotionsOn(m, withItems(s.a, s.damage, s.surge));
        const cands: { key: string, label: string, id: number, a: BestSetupAssumptions, dmg?: DamageSpecWeapon }[] = [
          ...ownedDamage.filter((w) => !s.damage.includes(w)).map((w) => ({
            key: w, label: DAMAGE_SPEC_WEAPONS[w].label, id: damageId(w), a: fitBars(withItems(s.a, [...s.damage, w], s.surge), m), dmg: w,
          })),
          ...(s.surge < maxPotions ? [{
            key: `surge${s.surge + 1}`, label: SURGE_ITEMS[s.surge].name, id: SURGE_ITEMS[s.surge].id, a: fitBars(withItems(s.a, s.damage, s.surge + 1), m),
          }] : []),
        ];
        const free = total - s.opt.best.used;
        const notes = new Map(s.notes); // the children's: these + this expansion's rejections (filled below)
        const own = new Map<string, string>();
        const kids: ItemBeamChild<ItemState>[] = [];
        cands.forEach((c) => {
          const slots = c.dmg && inKitOf(c.id, m, s.carried) ? 0 : 1;
          const t = cmpSeconds(dpCmp(m, c.a));
          if (!pickSpecItem([{ item: c, seconds: t, slots }], curT)) return; // < 1 s per slot even with a free slot
          const withId = pinItem(s.carried, c.id);
          const child = (o: KitOptimum, tt: number, how: string): ItemBeamChild<ItemState> => ({
            state: {
              opt: o,
              a: c.a,
              carried: withId,
              damage: c.dmg ? [...s.damage, c.dmg] : s.damage,
              surge: c.dmg ? s.surge : s.surge + 1,
              steps: [...s.steps, {
                item: c.label, saved: curT - tt, slots, how,
              }],
              notes,
            },
            seconds: tt,
            net: itemStepNet(curT - tt, free, total - o.best.used),
          });
          if (slots === 0 || free >= slots) {
            kids.push(child(rescoreWith(s.opt, withId), t, slots ? 'a free slot' : 'carried anyway'));
            return;
          }
          // no free slot: the kit re-optimised with the item carried (its spec plan from the current kit)
          const ta = fixedFor(c.a, m);
          const opt2 = optimiseFor(dps, withId, seedsFor(dps, seedCount, ta), `spec items: ${c.label}`, ta);
          const t2 = cmpSeconds(dpCmp(opt2.best.members, c.a));
          if (opt2.best.used <= total && curT - t2 >= slots * SHARE_MAX_SLOT_SECONDS - 1e-9) {
            kids.push(child(opt2, t2, 'a slot from the kit (re-optimised)'));
          } else {
            own.set(c.key, `${c.label}: saves ${(curT - t).toFixed(1)} s with a free slot, but none is free and the kit without a slot for it loses more`);
          }
        });
        own.forEach((v, k) => notes.set(k, v));
        Object.assign(s, { own });
        return kids;
      };
      const rootCarried = runCarried;
      const root: ItemState = {
        opt, a: assumptions, carried: runCarried, damage: [], surge: 0, steps: [], notes: new Map(),
      };
      const itemKey = (s: ItemState) => JSON.stringify([[...s.damage].sort(), s.surge]);
      const beam = itemBeam(root, cmpSeconds(dpCmp(opt.best.members, withItems(assumptions, [], 0))), itemKey, expandItems, {
        width: ITEM_BEAM_WIDTH, depth: ITEM_BEAM_DEPTH, maxSteps: 12,
      });
      let best = beam.state;
      let curT = beam.seconds;
      // swaps: one item brought for one not brought (a damage spec weapon / a Surge potion) on the same kit, while one
      // saves ≥ 0.05 s and 1 s per slot it adds
      for (let guard = 0; guard < 4 && best.steps.length; guard++) {
        const cur = best;
        const baseT = curT;
        const m = cur.opt.best.members;
        const maxPotions = maxPotionsOn(m, withItems(cur.a, cur.damage, cur.surge));
        const outs = [
          ...cur.damage.map((w) => ({
            dmg: cur.damage.filter((x) => x !== w), surge: cur.surge, id: damageId(w), label: DAMAGE_SPEC_WEAPONS[w].label,
          })),
          ...(cur.surge ? [{
            dmg: cur.damage, surge: cur.surge - 1, id: SURGE_ITEMS[cur.surge - 1].id, label: SURGE_ITEMS[cur.surge - 1].name,
          }] : []),
        ];
        const ins: { w?: DamageSpecWeapon, id: number, label: string }[] = ownedDamage.filter((w) => !cur.damage.includes(w))
          .map((w) => ({ w, id: damageId(w), label: DAMAGE_SPEC_WEAPONS[w].label }));
        let pick: { s: ItemState, t: number, net: number } | null = null;
        outs.forEach((o) => {
          const inList = [...ins, ...(o.surge === cur.surge && cur.surge < maxPotions
            ? [{ id: SURGE_ITEMS[cur.surge].id, label: SURGE_ITEMS[cur.surge].name }] : [])];
          inList.forEach((i) => {
            const dmg = i.w ? [...o.dmg, i.w] : o.dmg;
            const surge = i.w ? o.surge : o.surge + 1;
            const carried2 = pinItem(rootCarried.includes(o.id) ? cur.carried : cur.carried.filter((id) => id !== o.id), i.id);
            const used2 = usedWith(carried2, m);
            if (used2 > total) return;
            const a2 = fitBars(withItems(cur.a, dmg, surge), m);
            const t = cmpSeconds(dpCmp(m, a2));
            const saved = baseT - t;
            const added = used2 - cur.opt.best.used;
            if (!(saved >= Math.max(0.05, added * SHARE_MAX_SLOT_SECONDS) - 1e-9)) return;
            const net = itemStepNet(saved, total - cur.opt.best.used, total - used2);
            if (pick && net <= pick.net + 1e-9) return;
            pick = {
              t,
              net,
              s: {
                opt: rescoreWith(cur.opt, carried2),
                a: a2,
                carried: carried2,
                damage: dmg,
                surge,
                steps: [...cur.steps.filter((st) => st.item !== o.label), {
                  item: i.label, saved, slots: Math.max(0, added), how: `swapped in for ${o.label} (same kit)`,
                }],
                notes: cur.notes,
                own: cur.own,
              },
            };
          });
        });
        if (!pick) break;
        const { s: sw, t: tw } = pick as { s: ItemState, t: number, net: number };
        best = sw;
        curT = tw;
      }
      if (best.steps.length) {
        opt = best.opt;
        runCarried = best.carried;
        damageBring = [...best.damage];
        surgePotions = best.surge;
        assumptions = withItems(best.a, damageBring, surgePotions);
        itemSteps = best.steps;
      }
      new Map([...Array.from(best.notes), ...Array.from(best.own ?? [])]).forEach((note, key) => {
        const brought = damageBring.includes(key as DamageSpecWeapon) || (/^surge\d$/.test(key) && Number(key.slice(5)) <= surgePotions);
        if (!brought) itemNotes.push(note);
      });
      // Solo: a drain weapon whose slot is worth < 1 s with the damage specs / doses brought is left at home
      if (soloWithSubset && (damageBring.length || surgePotions)) {
        let sub = SPEC_CANDIDATES.filter((w) => runSpecItems.some((it) => it.id === specId(w)));
        sub.forEach((w) => {
          if (carriedSet.has(specId(w))) return;
          const fewer = sub.filter((x) => x !== w);
          const a2 = withItems({ ...assumptions, mySpecs: mySpecsForSubset(fewer, assumptions.mySpecs) }, damageBring, surgePotions);
          const t = cmpSeconds(dpCmp(opt.best.members, a2));
          if (t - curT < SHARE_MAX_SLOT_SECONDS - 1e-9) {
            itemSteps.push({
              item: `without ${SPEC_WEAPONS[w].label}`, saved: curT - t, slots: -1, how: 'drain weapon dropped',
            });
            sub = fewer;
            curT = t;
            assumptions = a2;
            runCarried = runCarried.filter((id) => id !== specId(w));
            const rescore = (x: KitSolution): KitSolution => ({ ...x, used: usedWith(runCarried, x.members) });
            opt = { ...opt, best: rescore(opt.best), finals: opt.finals.map(rescore) };
          }
        });
        runSpecItems = sub.map((w) => planItemByName(SPEC_WEAPONS[w].item));
      }
      if (itemSteps.length) {
        runA = fixedFor(assumptions, opt.best.members);
        exactA = raidTimeAssumptionsFrom(assumptions, drain, settings, tuning.model);
        // the optimiser's times were under the plan without the items: re-time its kits under the new plan
        const retime = (x: KitSolution): KitSolution => ({ ...x, time: routeTime(x.members) });
        opt = { ...opt, best: retime(opt.best), finals: opt.finals.map(retime) };
      }
      if (drain === 'team' && (damageBring.length || surgePotions)) {
        // phase 36 review: with your damage specs / doses you are not a carrier, so the carriers are at most the party − 1
        // (specBudgetFrom cuts the list there). Auto carriers: the greedy again with party − 1 on this kit; then the
        // faster of "you carry, no items" and "you spec, these carriers" is kept.
        const party = Math.max(1, Math.floor(assumptions.partySize));
        const m = opt.best.members;
        let specT = curT;
        let specCarriers: CarrierCounts = { ...NO_CARRIERS, ...assumptions.team.carriers };
        let specSteps = carrierSteps;
        if (autoCarriers) {
          // the faster of: the greedy from scratch with party − 1, and the carriers the item greedy fitted (fitBars: the
          // greedy's carriers less the cheapest, its steps without the last ones of the removed weapons)
          const g = carrierGreedy(m, party - 1);
          if (g.seconds < curT - 1e-9) {
            specT = g.seconds;
            specCarriers = g.carriers;
            specSteps = g.steps;
          } else {
            const left = { ...specCarriers };
            const kept = (carrierSteps ?? []).filter((st) => {
              if (left[st.weapon] > 0) {
                left[st.weapon] -= 1;
                return true;
              }
              return false;
            });
            specSteps = kept;
          }
        } else {
          specT = cmpSeconds(dpCmp(m, assumptions));
        }
        const carryT = cmpSeconds(dpCmp(carryState.opt.best.members, carryState.assumptions));
        if (specT < carryT - 1e-9) {
          if (autoCarriers) {
            assumptions = withItems(teamData(specCarriers).a, damageBring, surgePotions);
            carrierSteps = specSteps;
            runA = fixedFor(assumptions, m);
            exactA = raidTimeAssumptionsFrom(assumptions, drain, settings, tuning.model);
            const retime = (x: KitSolution): KitSolution => ({ ...x, time: routeTime(x.members) });
            opt = { ...opt, best: retime(opt.best), finals: opt.finals.map(retime) };
          }
          const n = Object.values(specCarriers).reduce((t, v) => t + v, 0);
          if (!autoCarriers && Object.values({ ...NO_CARRIERS, ...carryState.assumptions.team.carriers }).reduce((t, v) => t + v, 0) > party - 1) {
            carrierNotes.push(`You damage-spec, so you are not a carrier: only the first ${party - 1} carriers count.`);
          }
          itemNotes.push(`Your spec bar goes to ${[...damageBring.map(damageSpecLabel), ...(surgePotions ? ['surge doses'] : [])].join(' / ')}: ${n} carrier${n === 1 ? '' : 's'} (party − 1), ${formatDuration(specT)} vs ${formatDuration(carryT)} if you carry a drain weapon instead.`);
        } else {
          itemNotes.push(`Damage specs / surge doses: you carrying a drain weapon is faster (${formatDuration(carryT)} vs ${formatDuration(specT)} with ${party - 1} carrier${party - 1 === 1 ? '' : 's'}).`);
          ({
            opt, assumptions, runA, exactA, runCarried, runSpecItems, carrierSteps,
          } = carryState);
          damageBring = [];
          surgePotions = 0;
          itemSteps = [];
        }
      }
      runSpecItems = [
        ...runSpecItems,
        ...damageBring.map((w) => planItemByName(DAMAGE_SPEC_WEAPONS[w].item)),
        ...SURGE_ITEMS.slice(0, surgePotions).map(surgePlanItem),
      ];
    }
    // phase 30: the greedy's steps re-timed on a kit (the returned one): each prefix of the carriers added, in order, on
    // these members (the greedy measured them on the kit before partial switches / the final re-optimisation)
    const retimeSteps = (steps: CarrierStep[], members: number[]): CarrierStep[] => {
      let c: CarrierCounts = { ...NO_CARRIERS };
      let prev = cmpSeconds(teamCmp(c, members));
      return steps.map((st) => {
        c = { ...c, [st.weapon]: c[st.weapon] + 1 };
        const t = cmpSeconds(teamCmp(c, members));
        const saved = t === prev ? 0 : prev - t;
        prev = t;
        return { ...st, saved, seconds: t };
      });
    };
    // Team: the briefing of the carriers the drain state uses (per weapon: carriers, what the last one saves, the
    // encounters it saves most on) + the per-boss 95% minimum (teamRoles) on a route
    const teamCarriers = (): CarrierCounts => ({ ...NO_CARRIERS, ...assumptions.team.carriers });
    const briefing = (members: number[], rt: { encounters: { id: EncounterId }[] } | null): TeamRoles => {
      const c = teamCarriers();
      const base = teamCmp(c, members);
      const encOf = (cmp: RouteComparison) => new Map((cmp.fastest >= 0 ? cmp.routes[cmp.fastest].encounters : []).map((e) => [e.id, e]));
      const baseEnc = encOf(base);
      const rows = rowsFromCarriers(c, (w) => {
        const minus = teamCmp({ ...c, [w]: c[w] - 1 }, members);
        const s0 = cmpSeconds(base);
        const s1 = cmpSeconds(minus);
        const drivers = Array.from(encOf(minus).values())
          .map((e) => ({ label: e.label, d: e.seconds - (baseEnc.get(e.id)?.seconds ?? e.seconds) }))
          .filter((x) => x.d > 0.05)
          .sort((a, b) => b.d - a.d)
          .map((x) => `${x.label} (${x.d >= 100 || !Number.isFinite(x.d) ? x.d.toFixed(0) : x.d.toFixed(1)} s)`);
        return { saved: s1 === s0 ? 0 : s1 - s0, drivers };
      });
      // the per-boss 95% minimum, for reference
      const seen = new Set<string>();
      const rts: RoleTarget[] = [];
      (rt?.encounters ?? []).forEach((e) => (byEncounter.get(e.id) || []).forEach((t) => {
        const k = phaseKey(t.targetKey, t.phase);
        if (seen.has(k)) return;
        seen.add(k);
        const target = findTarget(t.targetKey);
        if (target.noDrains) return;
        const m = buildTargetMonster(target, t.phase, 'none', assumptions).monster;
        rts.push({
          // phase 38c: a ToA room before the supplies drains with the normal potions
          key: k, label: `${target.label}${t.phase ? ` (${t.phase})` : ''}`, group: target.label, model: drainModel(m, assumptionsForTarget(target, assumptions)),
        });
      }));
      const party = Math.max(1, Math.floor(assumptions.partySize));
      const per = teamRoles(rts, { partySize: party, mages: magesOf(members), threshold: assumptions.floorThreshold });
      return {
        ...per,
        rows,
        text: carriersText(party, rows),
        carriers: c,
        mode: autoCarriers ? 'auto' : 'manual',
        ...(carrierSteps ? { steps: retimeSteps(carrierSteps, members) } : {}),
      };
    };
    let share: PlanSpecs['share'];
    if (drain === 'team' && !screen) {
      if (!autoSpecs) {
        share = {
          weapon: null, carry: false, reason: 'you bring the weapons ticked under "Specs I bring"', manual: true,
        };
      } else {
        const cmp0 = teamCmp(teamCarriers(), opt.best.members);
        const roles0 = briefing(opt.best.members, cmp0.fastest >= 0 ? cmp0.routes[cmp0.fastest] : null);
        const w = mostNeededWeapon(roles0, (x) => ownedSpecs.includes(x));
        const carriers = roles0.rows.find((r) => r.weapon === w)?.carriers;
        if (damageBring.length || surgePotions) {
          // phase 36: your spec energy goes to your damage specs / surge doses: a teammate carries the drain weapon
          share = {
            weapon: null,
            carry: false,
            reason: `your spec energy goes to your ${[...damageBring.map((x) => `${damageSpecLabel(x)} specs`), ...(surgePotions ? ['surge doses'] : [])].join(' / ')}${w ? ` — let a teammate carry ${specWeaponLabel(w)}${carriers ? ` (most needed: ${carriers} carrier${carriers === 1 ? '' : 's'})` : ''}` : ''}`,
            manual: false,
          };
        } else if (!w || carriedSet.has(specId(w))) {
          share = {
            ...assignMe({
              weapon: w, carriers, carriedAnyway: !!w, freeSlots: 0,
            }),
            manual: false,
          };
          if (w) runSpecItems = [planItemByName(SPEC_WEAPONS[w].item), ...runSpecItems];
        } else {
          const withW = [...runCarried, specId(w)];
          const free = total - opt.best.used;
          let slotValue: number | undefined;
          let opt2: KitOptimum | null = null;
          if (free < 1) {
            opt2 = optimiseFor(dps, withW, seeds, `your share: ${SPEC_WEAPONS[w].label}`);
            slotValue = opt2.best.time === opt.best.time ? 0 : Math.max(0, opt2.best.time - opt.best.time);
          }
          const d = assignMe({
            weapon: w, carriers, carriedAnyway: false, freeSlots: free, slotValueSeconds: slotValue,
          });
          share = { ...d, manual: false, ...(slotValue !== undefined ? { slotValueSeconds: slotValue } : {}) };
          if (d.carry) {
            if (opt2) {
              opt = opt2;
            } else {
              // a free slot: the same kits, one more item carried
              const rescore = (x: KitSolution): KitSolution => ({ ...x, used: usedWith(withW, x.members) });
              opt = { ...opt, best: rescore(opt.best), finals: opt.finals.map(rescore) };
            }
            runCarried = withW;
            runSpecItems = [planItemByName(SPEC_WEAPONS[w].item), ...runSpecItems];
          }
        }
      }
    }
    const tOpt = Date.now();
    progress({
      stage: 'final', done: 0, total: 1, label: 'route times',
    });

    // 6. exact times: the best RETIME_TOP kits of the optimiser are re-timed with the Routes tab's code (createKitEvaluator
    // + compareRoutes, drains planned with each kit's own encounter lengths) and the fastest wins (ties: optimiser order)
    const kitLoadoutsOf = (m: number[]): KitLoadout[] => m.map((i) => {
      const c = candidates[i];
      const eq = toPlayerEquipment(c.equipment);
      return {
        id: c.key,
        name: c.label,
        group: c.group,
        options: c.options,
        toPlayer: (monster, o, a) => applyLoadoutToPlayer(basePlayer, c.label, c.group, eq, o.style, o.spell, monster, a ?? assumptions),
      };
    });
    const sortedFinals = [opt.best, ...opt.finals]
      .filter((x) => x.used <= total || x === opt.best)
      .sort((a, b) => (better(a, b, total) ? -1 : Number(better(b, a, total))));
    const finalists: KitSolution[] = [];
    sortedFinals.forEach((x) => {
      const k = [...x.members].sort((a, b) => a - b).join(',');
      if (finalists.length < (screen ? 1 : RETIME_TOP) && !finalists.some((f) => [...f.members].sort((a, b) => a - b).join(',') === k)) finalists.push(x);
    });
    let chosen = finalists[0];
    // phase 37: the re-timed kits share their DPS memo (same assumptions; a loadout's id is its candidate key)
    const exactCache = kitEvaluatorCache();
    let evaluator = createKitEvaluator(kitLoadoutsOf(chosen.members), assumptions, exactCache);
    let comparison = compareRoutes(evaluator, exactA, routes);
    let exactEvaluations = evaluator.evaluations();
    const exactSeconds = (c: RouteComparison) => (c.fastest >= 0 ? c.routes[c.fastest].seconds : Infinity);
    for (const f of finalists.slice(1)) {
      const ev = createKitEvaluator(kitLoadoutsOf(f.members), assumptions, exactCache);
      const cmp = compareRoutes(ev, exactA, routes);
      exactEvaluations += ev.evaluations();
      if (exactSeconds(cmp) < exactSeconds(comparison) - EPS) {
        chosen = f;
        evaluator = ev;
        comparison = cmp;
      }
    }
    if (screen) return { seconds: exactSeconds(comparison), ms: Date.now() - tRing };
    const { members } = chosen;
    hooks.onKitSpace?.({
      candidates,
      used: (m) => usedWith(runCarried, m),
      total,
      exactSeconds: (m) => exactSeconds(compareRoutes(createKitEvaluator(kitLoadoutsOf(m), assumptions), exactA, routes)),
      members,
      ring: ring?.name ?? null,
    });
    const planned = comparison.fastest;
    // worn = the loadout used on the planned route's first phase (saves one switch)
    const firstChoice = planned >= 0
      ? comparison.routes[planned].encounters.flatMap((e) => e.phases).find((p) => p.choice)?.choice
      : undefined;
    let wornIx = members.findIndex((i) => candidates[i].label === firstChoice?.loadout);
    if (wornIx < 0) wornIx = 0;
    const kitOrder = [members[wornIx], ...members.filter((_, j) => j !== wornIx)];
    const kit = kitOrder.map((i) => candidates[i]);
    const supplies = kitSupplies(comfort, kit.map((c) => c.group), boostsNeedSupplies);
    // phase 31: the heart is magic's potion: an item carried with the kit (deduplicated with a pinned heart)
    const heartItems = boostsNeedSupplies && kit.some((c) => c.group === 'magic') ? [heartPlanItem(heart)] : [];
    const slots = kitSlotUsage(kitOrder.map((i) => items[i]), 0, [...runCarried, ...runSpecItems.map((it) => it.id), ...heartItems.map((h) => h.id)], supplies, inputs.nonItemSlots, total, raidSupplied, quiver, kitOrder.map((i) => ammoWorn[i]));
    const inventory = inventoryGrid(kit, 0, runSpecItems, pinnedItems, supplies, inputs.nonItemSlots, total, raidSupplied, { potionItems: heartItems, quiver });
    const quiverAmmo = quiverHeldAmmo(kit, 0, [...runSpecItems, ...pinnedItems], quiver);
    const keptAmmo = wornKeptAmmo(kit, 0);

    // 7. why: improvements that don't fit, and the best kit of every other style mix
    // phase 36: the kit's time under the final spec plan (the optimiser's time may predate the damage specs / doses)
    const T = routeTime(chosen.members);
    const usedOfKit = (m: number[]) => {
      const allIds = new Set<number>(runCarried.filter((id) => !raidSuppliedSet.has(id)));
      m.forEach((x) => items[x].forEach((id) => {
        if (!raidSuppliedSet.has(id)) allIds.add(id);
      }));
      return fixedSlots + allIds.size - minWorn(m) + potionSlots(m.map((x) => potions[x]))
        - quiverSavedSlots(allIds, quiver);
    };
    // phase 21: what each kit loadout costs and saves (vs the kit without it; optimiser times)
    const kitMarginal = kitOrder.map((i) => {
      if (kitOrder.length < 2) return { slots: 0, seconds: Infinity };
      const without = kitOrder.filter((x) => x !== i);
      const tw = routeTime(without);
      return { slots: chosen.used - usedOfKit(without), seconds: tw === T ? 0 : tw - T };
    });
    const additions: PlanRejection[] = [];
    candidates.forEach((c, i) => {
      if (members.includes(i)) return;
      const m = [...members, i];
      const t = routeTime(m);
      if (!(t < T - 0.05)) return;
      const used = usedOfKit(m);
      const extra = used - chosen.used;
      let reason = 'fits (not taken)';
      if (used > total) reason = `needs ${extra} more slot${extra === 1 ? '' : 's'}, ${Math.max(0, total - chosen.used)} free`;
      else if (T - t < switchSavingRequired(extra)) reason = `fits, but saves < ${switchSavingRequired(extra)} s for ${Math.max(0, extra)} slot${extra === 1 ? '' : 's'} (dedupe rule)`;
      additions.push({
        label: c.label,
        kind: 'addition',
        deltaSeconds: T - t,
        deltaSlots: extra,
        reason,
        weapons: [c.equipment.weapon?.name ?? ''],
      });
    });
    additions.sort((a, b) => (b.deltaSeconds - a.deltaSeconds) || (a.deltaSlots - b.deltaSlots) || a.label.localeCompare(b.label));
    const rejected: PlanRejection[] = [];
    const seenLabel = new Set<string>();
    for (const a of additions) {
      if (rejected.length >= 3) break;
      if (seenLabel.has(a.label)) continue;
      seenLabel.add(a.label);
      rejected.push(a);
    }
    const mixOf = (s: KitSolution) => groupsLabel(Array.from(new Set(s.members.map((i) => candidates[i].group))));
    const usedOf = usedOfKit;
    const chosenMix = mixOf(chosen);
    // the best kit of every other style mix: optimised over that mix's candidates only; a group the optimiser left out
    // is forced in with its best addition (fitting if one fits, else the fewest extra slots)
    const MIXES: StyleGroup[][] = [['melee'], ['ranged'], ['magic'], ['melee', 'ranged'], ['melee', 'magic'], ['ranged', 'magic'], GROUP_ORDER];
    const alternatives: PlanRejection[] = [];
    for (const mix of MIXES) {
      const label = groupsLabel(mix);
      if (label === chosenMix) continue;
      const allowed = candidates.map((c) => mix.includes(c.group));
      const mixSeeds = seeds.filter((i) => allowed[i]).slice(0, 5);
      if (!mixSeeds.length) continue;
      let s = optimiseKit({
        items, carried: runCarried, fixedSlots, totalSlots: total, time: routeTime, seeds: mixSeeds, allowed, raidSupplied, potions, quiver, wearsAmmo: ammoWorn, noPrune: tuning.noPrune, shouldCancel: hooks.shouldCancel,
      }).best;
      for (const g of mix) {
        if (s.members.some((i) => candidates[i].group === g)) continue;
        // fitting: the best kit; none fits: the best Δtime per extra slot (ties: fewer slots)
        const base = s;
        let fit: KitSolution | null = null;
        let over: { k: KitSolution, ratio: number } | null = null;
        for (let i = 0; i < candidates.length; i++) {
          if (candidates[i].group !== g) continue;
          const m = [...base.members, i];
          const k: KitSolution = {
            members: m, time: routeTime(m), used: usedOf(m), seed: base.seed,
          };
          if (k.used <= total) {
            if (!fit || better(k, fit, total)) fit = k;
          } else {
            const dt = base.time === k.time ? 0 : base.time - k.time;
            const ratio = dt / Math.max(1, k.used - base.used);
            if (!over || ratio > over.ratio || (ratio === over.ratio && k.used < over.k.used)) over = { k, ratio };
          }
        }
        const pick = fit ?? over?.k;
        if (pick) s = pick;
      }
      if (mixOf(s) !== label) continue;
      let reason = Number.isFinite(s.time) ? `${(s.time - T).toFixed(1)} s slower` : 'cannot clear the route';
      if (s.used > total) reason = `does not fit (${s.used} of ${total} slots)`;
      alternatives.push({
        label: `${label}: ${s.members.map((i) => candidates[i].label).join(' / ')}`,
        kind: 'alternative',
        deltaSeconds: T - s.time,
        deltaSlots: s.used - chosen.used,
        reason,
        weapons: s.members.map((i) => candidates[i].equipment.weapon?.name ?? ''),
      });
    }
    alternatives.sort((a, b) => (b.deltaSeconds - a.deltaSeconds) || a.label.localeCompare(b.label));
    // phase 21: the lighter kit (same-style cheaper swaps where the slots bought < 1 s each), listed first when it frees slots
    const light = lightenKit({
      items, carried: runCarried, fixedSlots, totalSlots: total, time: routeTime, seeds: members, raidSupplied, potions, quiver, wearsAmmo: ammoWorn, groups: candidates.map((c) => c.group), shouldCancel: hooks.shouldCancel,
    }, members);
    const freed = chosen.used - light.used;
    if (freed >= 1 && Number.isFinite(light.time)) {
      const slower = light.time === T ? 0 : light.time - T;
      alternatives.unshift({
        label: `Lighter kit: ${light.members.map((i) => candidates[i].label).join(' / ')}`,
        kind: 'alternative',
        deltaSeconds: T - light.time,
        deltaSlots: -freed,
        reason: `−${freed} slot${freed === 1 ? '' : 's'} for +${slower.toFixed(1)} s (each freed slot cost < ${SWITCH_MIN_SECONDS_PER_SLOT} s)`,
        weapons: light.members.map((i) => candidates[i].equipment.weapon?.name ?? ''),
      });
    }

    // phase 29: the spec weapons of the plan (Team: the briefing on the planned route; the Ayak hint)
    const bring = runSpecItems.map(specWeaponOf).filter((w): w is PlannerWeapon => !!w);
    const roles = drain === 'team' && planned >= 0 ? briefing(members, comparison.routes[planned]) : undefined;
    const notes: string[] = drain === 'team' ? [...carrierNotes, ...itemNotes] : [...itemNotes];
    if (bring.includes('ayak')) {
      if (drain === 'team' && roles && roles.mages === 0) {
        notes.push('Eye of Ayak is carried but "Mages in party" is 0 (Advanced (plan)): its Magic defence drain helps no one.');
      } else if (drain !== 'team' && !kit.some((c) => c.group === 'magic')) {
        notes.push('Eye of Ayak is carried but no magic loadout in your kit uses its Magic defence drain.');
      }
    }
    // phase 36: the damage spec weapons and Surge potions after the drain weapons
    const extras = [...damageBring.map(damageSpecLabel), ...(surgePotions ? [surgePotions > 1 ? `${surgePotions} Surge potions` : 'Surge potion'] : [])];
    let bringLine = bringText(bring);
    if (extras.length) bringLine = bring.length ? `${bringLine}, ${extras.join(', ')}` : `Bring: ${extras.join(', ')}`;
    const plannedRoute = planned >= 0 ? comparison.routes[planned] : null;
    const surgeAt = (plannedRoute?.surgeDoses ?? []).map((id) => plannedRoute!.encounters.find((e) => e.id === id)?.label ?? id);
    const specs: PlanSpecs = {
      mode: specMode,
      drain,
      bring,
      text: bringLine,
      ...(damageBring.length ? { damage: [...damageBring] } : {}),
      ...(surgePotions ? { surgePotions, surgeAt } : {}),
      ...(itemSteps.length ? { items: itemSteps } : {}),
      ...(subsetResult ? {
        solo: {
          perWeapon: subsetResult.perWeapon,
          bestRejected: subsetResult.bestRejected,
          signatures: subsetResult.signatures,
          pruned: subsetResult.pruned,
          bestWithout: subsetResult.bestWithout,
          evaluated: subsetResult.evaluated.length,
        },
      } : {}),
      ...(roles ? { team: roles } : {}),
      ...(share ? { share } : {}),
      notes,
    };

    const tEnd = Date.now();
    const result: PlanResult = {
      cancelled: false,
      kit,
      kitMarginal,
      slots,
      inventory,
      specItems: runSpecItems,
      pinnedItems,
      comparison,
      planned,
      rejected,
      alternatives,
      potions: kitPotions(kit.map((c) => c.group), boostsNeedSupplies, heart),
      quiverAmmo,
      keptAmmo,
      specs,
      ring: { policy, ring: ring?.name ?? null, screened: [] },
      matrixDps: Object.fromEntries(targets.map((t, col) => [phaseKey(t.targetKey, t.phase), Math.max(0, ...members.map((m) => dps[m][col]))])),
      unusedCarried: pinnedItems
        .filter((it, i, all) => all.findIndex((x) => x.id === it.id) === i)
        .filter((it) => !runSpecItems.some((x) => x.id === it.id))
        .filter((it) => (heartById(it.id)
          ? !kit.some((c) => c.group === 'magic')
          : !kit.some((c) => equipmentItemIds(c.equipment).includes(it.id)))),
      excluded: notOwned,
      droppedPinned,
      ownershipNotices,
      searchRows,
      stats: {
        searches: missing.length,
        phases: targets.length,
        candidates: {
          preset: nPreset, search: nSearch, partial: nPartial, total: candidates.length, capped,
        },
        evaluations: evaluations + exactEvaluations,
        kitsEvaluated: opt.kitsEvaluated,
        objectiveSeconds: chosen.time,
        retimed: finalists.length,
        memo: { ...kitMemo.stats },
        ...(soloFight ? { fightSeconds: soloFight } : {}),
        ms: {
          search: tSearch - t0, matrix: tMatrix - tRing, optimise: tOpt - tMatrix, total: tEnd - t0,
        },
      },
    };
    return { seconds: exactSeconds(comparison), ms: tEnd - tRing, result };
  };
  // phase 37: ring runs computed elsewhere (the page's helper workers, `planRingRun`) are taken as they are; a run is
  // deterministic given the inputs, its ring, screen or full, and (Solo screens) the subset the first screen picked
  const runRing = (ring: PlanItem | null, screen: boolean): RingRun => {
    const pre = hooks.ringRuns?.[ringRunKey(ring?.id ?? null, screen, screen ? screenSubset : null)];
    if (pre) {
      if (screen && !screenSubset && pre.screenSubset) screenSubset = [...pre.screenSubset];
      return pre;
    }
    return computeRing(ring, screen);
  };

  // phase 27: the ring policy. Switch: one run, rings as searched. Camp Lightbearer: one run, Lightbearer on every
  // candidate. Camp one ring: every owned CAMP_RINGS ring is screened (full candidates only); the best-screened ring
  // gets the full run, which gives g = its screen − full time; then every ring whose screen is within
  // RING_GUARD_FACTOR × g of the best full time gets the full run too (review fix); the fastest exact route wins.
  try {
    if (hooks.onlyRing) {
      // phase 37: one ring run for the page's helper workers (planRingRun)
      const { ring: ringId, screen, screenSubset: sub } = hooks.onlyRing;
      screenSubset = sub ? [...sub] : null;
      const it = ringId === null ? null : (campRingItems(notOwned).find((x) => x.id === ringId) ?? pinnedPlanItem(ringId) ?? null);
      const run = computeRing(it, screen);
      hooks.onRingRun?.({ ...run, ...(screen ? { screenSubset: screenSubset ? [...screenSubset] : null } : {}) });
      return { ...emptyResult(searchRows), cancelled: false };
    }
    if (policy !== 'camp-one') {
      const only = policy === 'camp-lightbearer' ? planItemByName('Lightbearer') : null;
      return runRing(only, false).result!;
    }
    const rings = campRingItems(notOwned);
    if (!rings.length) {
      const r = runRing(null, false).result!;
      return { ...r, ring: { policy, ring: null, screened: [] } };
    }
    const screenAll = () => rings.map((it, i) => {
      progress({
        stage: 'rings', done: i, total: rings.length, label: it.name,
      });
      return { ring: it, seconds: runRing(it, true).seconds };
    }).sort((a, b) => ((a.seconds === b.seconds ? 0 : a.seconds - b.seconds) || a.ring.name.localeCompare(b.ring.name)));
    let screened = screenAll();
    const runs = new Map<number, RingRun>();
    const fullSeconds = new Map<number, number>();
    const full = (ring: PlanItem) => {
      const run = runRing(ring, false);
      runs.set(ring.id, run);
      fullSeconds.set(ring.id, run.seconds);
      return run;
    };
    const first = full(screened[0].ring);
    // phase 29 review (Solo, planner decides): the screens timed the first ring's subset; if the full run of the best
    // screened ring picks another subset, screen the rings again with it, and plan the new best ring in full if it
    // changed (at most two rounds), so the ring and the spec weapons are chosen together
    let ringRounds = 1;
    const chosenSubset = (run: RingRun) => run.result?.specs.bring ?? [];
    // (set by the first screen, inside runRing: TypeScript can't see that)
    const screenedSubset = screenSubset as PlannerWeapon[] | null;
    if (autoSpecs && drain === 'solo' && screenedSubset && chosenSubset(first).join('+') !== screenedSubset.join('+')) {
      screenSubset = chosenSubset(first);
      ringRounds = 2;
      screened = screenAll();
    }
    // review 2: the guard (guardedFullRuns): the best two screened rings in full, g = the largest screen − full gap of
    // the rings planned in full, and every ring within RING_GUARD_FACTOR × g of the best full time in full, re-checked
    // after each full run (one ring's small screen error used to hide another's large one)
    const guard = guardedFullRuns(
      screened.map((x) => ({ key: x.ring.id, seconds: x.seconds })),
      (id) => full(screened.find((x) => x.ring.id === id)!.ring).seconds,
      tuning.ringGuard ?? RING_GUARD_FACTOR,
      fullSeconds,
    );
    let best: { ring: PlanItem, run: RingRun } | null = null;
    screened.forEach((x) => {
      const run = runs.get(x.ring.id);
      if (run && (!best || run.seconds < best.run.seconds - EPS)) best = { ring: x.ring, run };
    });
    const { g } = guard;
    const r0 = best!.run.result!;
    const r = r0.specs.solo ? {
      ...r0, specs: { ...r0.specs, solo: { ...r0.specs.solo, screenedWith: (screenSubset as PlannerWeapon[] | null) ?? [], ringRounds } },
    } : r0;
    const bestSeconds = best!.run.seconds;
    return {
      ...r,
      ring: {
        policy,
        ring: best!.ring.name,
        screened: screened.map((x) => (fullSeconds.has(x.ring.id) ? {
          ring: x.ring.name, seconds: fullSeconds.get(x.ring.id)!, full: true,
        } : {
          ring: x.ring.name, seconds: x.seconds, full: false, atLeast: Math.max(0, x.seconds - bestSeconds - RING_ESTIMATE_FACTOR * g),
        })).sort((a, b) => ((a.seconds === b.seconds ? 0 : a.seconds - b.seconds) || a.ring.localeCompare(b.ring))),
      },
      stats: { ...r.stats, ms: { ...r.stats.ms, total: Date.now() - t0 } },
    };
  } catch (e) {
    if (e instanceof PlanCancelled) return emptyResult(searchRows);
    throw e;
  }
};

/**
 * Phase 37: one ring run of a plan (a camp-one ring screen or full run), for a helper worker; with the search rows the
 * run used (the main plan can take them). `plan(inputs, tuning, { ringRuns })` with these runs gives exactly the plan
 * it would compute alone.
 */
export const planRingRun = (
  inputs: PlanInputs,
  tuning: PlanTuning,
  which: { ring: number | null, screen: boolean, screenSubset?: PlannerWeapon[] | null },
  hooks: Pick<PlanHooks, 'shouldCancel'> = {},
): RingRunResult | null => {
  let run: RingRun | null = null;
  const res = plan(inputs, tuning, { ...hooks, onlyRing: which, onRingRun: (r) => { run = r; } });
  if (!run) return null;
  return { key: ringRunKey(which.ring, which.screen, which.screen ? which.screenSubset ?? null : null), run, searchRows: res.searchRows };
};

/**
 * The player of a kit loadout against a monster, with its best style option there (for "Load into calculator").
 * `target` (phase 38c): the monster's best-setup target, so a ToA room before the supplies gets the normal potions
 * (`assumptionsForTarget`), as the plan timed it.
 */
export const planLoadoutToPlayer = (
  base: Player,
  c: PlanCandidate,
  monster: Parameters<typeof applyLoadoutToPlayer>[6],
  assumptions: BestSetupAssumptions,
  target?: { beforeSupplies?: boolean },
): Player => {
  const eq = toPlayerEquipment(c.equipment);
  const a = target ? assumptionsForTarget(target, assumptions) : assumptions;
  let best: { p: Player, dps: number } | null = null;
  for (const o of c.options) {
    const p = applyLoadoutToPlayer(base, c.label, c.group, eq, o.style, o.spell, monster, a);
    let d = 0;
    try {
      d = evaluateLoadout(p, monster, false).dps;
    } catch {
      d = 0;
    }
    if (!best || d > best.dps) best = { p, dps: d };
  }
  return best!.p;
};
