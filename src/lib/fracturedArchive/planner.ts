import { EquipmentPiece, Player, PlayerEquipment } from '@/types/Player';
import { availableEquipment } from '@/lib/Equipment';
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
  styleLabel,
} from '@/lib/fracturedArchive/bestSetup';
import {
  BestSetupAssumptions, ItemRef, PresetDef, StyleGroup,
} from '@/lib/fracturedArchive/presets';
import {
  GearSearchOptions, GearSearchProgress, GearSearchResult, runGearSearch, SearchItem, SearchRow, StyleOption,
} from '@/lib/fracturedArchive/search';
import {
  compareRoutes,
  createKitEvaluator,
  EncounterId,
  encounterTime,
  KitChoice,
  KitLoadout,
  PhaseQuery,
  phaseKey,
  RaidKit,
  RaidTimeAssumptions,
  raidTimeAssumptionsFrom,
  RaidTimeModel,
  Route,
  RouteComparison,
  routesFor,
} from '@/lib/fracturedArchive/raidTime';
import { raidBase } from '@/lib/raids/base';
import { TimeSettings } from '@/lib/raids/types';
import { SPEC_WEAPONS, SpecWeapon } from '@/lib/fracturedArchive/specs';
import { FA_PLAN_DEFAULTS } from '@/lib/raids/planDefaults';

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

export type SupplyType = 'brew' | 'restore' | 'ranging' | 'superCombat' | 'magic' | 'food' | 'other';

/** Supply types; `image` = file under src/public/img/potions (null = generic icon). */
export const SUPPLY_TYPES: { id: SupplyType, label: string, image: string | null }[] = [
  { id: 'brew', label: 'Saradomin brew', image: null },
  { id: 'restore', label: 'Super restore', image: null },
  { id: 'ranging', label: 'Ranging potion', image: 'Ranging.png' },
  { id: 'superCombat', label: 'Super combat', image: 'Super combat.png' },
  { id: 'magic', label: 'Magic boost (Saturated heart)', image: 'Saturated heart.png' },
  { id: 'food', label: 'Food', image: null },
  { id: 'other', label: 'Other', image: null },
];

export type SupplyCounts = Record<SupplyType, number>;

/**
 * The Fractured Archive's default supplies (6 brew / 4 restore / 2 ranging / 1 super combat). Phase 21: each raid has its
 * own (`RaidBase.planDefaults`, src/lib/raids/planDefaults.ts); this name stays for the phase 17 code and tests.
 */
export const DEFAULT_SUPPLIES: SupplyCounts = FA_PLAN_DEFAULTS.supplies;

/**
 * The supply that carries each style's boost. A style whose supply count is 0 is evaluated without its potion (the
 * Assumptions box's potion is the one used "if brought"). The drain / spec model keeps the potions.
 */
export const SUPPLY_POTION_GROUP: Partial<Record<SupplyType, StyleGroup>> = {
  superCombat: 'melee', ranging: 'ranged', magic: 'magic',
};

/** The best-setup assumptions as the plan uses them: styles whose potion isn't in the supplies lose the boost. */
export const planAssumptions = (a: BestSetupAssumptions, supplies: SupplyCounts): BestSetupAssumptions => {
  if (!raidBase(a.raid).boostsNeedSupplies) return a; // e.g. ToA: salts from the raid's supply chest
  const without = (Object.entries(SUPPLY_POTION_GROUP) as [SupplyType, StyleGroup][])
    .filter(([t]) => !(supplies[t] > 0)).map(([, g]) => g);
  return without.length ? { ...a, withoutPotion: without } : a;
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

/** Item names of the drain weapons the user carries ("My specs"; Ayak when its spec count > 0). */
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

export const toPlanItem = (p: EquipmentPiece, slot: Slot = p.slot as Slot): PlanItem => ({
  id: p.id,
  name: p.name,
  version: p.version,
  slot,
  ...(p.itemVars ? { itemVars: p.itemVars } : {}),
  ...(p.isTwoHanded ? { twoHanded: true } : {}),
});

export const planItemByName = (name: ItemRef): PlanItem => toPlanItem(resolveItem(name));

/** The equipment as the calculator holds it: every slot set (null when empty), blowpipe darts kept. */
export const toPlayerEquipment = (eq: PlanEquipment): Partial<PlayerEquipment> => Object.fromEntries(ALL_SLOTS.map((slot) => {
  const it = eq[slot];
  if (!it) return [slot, null];
  const piece = equipmentById(it.id);
  if (!piece) throw new Error(`Planner: no item with id ${it.id} (${it.name})`);
  return [slot, it.itemVars ? { ...piece, itemVars: it.itemVars } : piece];
}));

/** The distinct item ids of a loadout (each is one inventory slot when not worn). */
export const equipmentItemIds = (eq: PlanEquipment): number[] => Array.from(new Set(ALL_SLOTS
  .map((s) => eq[s]?.id).filter((id): id is number => id !== undefined))).sort((a, b) => a - b);

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
  /** Fewest items of any kit loadout. */
  minLoadoutItems: number;
  /** Inventory items while wearing the worn set (= carried − worn). */
  inventoryItems: number;
  /** Extra slots needed while wearing a smaller loadout (worn − min); kept free for swaps. */
  swapReserve: number;
  /** supplies + non-item + inventory items + swap reserve. */
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
 * one in place of a weapon needs no extra swap space (it takes the place of the item it replaces).
 */
export const kitSlotUsage = (
  loadouts: number[][],
  worn: number,
  carried: number[],
  supplies: SupplyCounts,
  nonItemSlots: number,
  total = INVENTORY_SLOTS,
  raidSupplied: number[] = [],
): SlotUsage => {
  const free = new Set(raidSupplied);
  const all = new Set<number>(carried.filter((id) => !free.has(id)));
  loadouts.forEach((l) => l.forEach((id) => {
    if (!free.has(id)) all.add(id);
  }));
  const wornSet = loadouts.length ? new Set(loadouts[worn]) : new Set<number>();
  const wornItems = wornSet.size;
  const wornFree = Array.from(wornSet).filter((id) => free.has(id)).length;
  const minLoadoutItems = loadouts.length ? Math.min(...loadouts.map((l) => new Set(l).size)) : 0;
  const s = sumSupplies(supplies);
  const nonItem = Math.max(0, Math.floor(nonItemSlots || 0));
  const inventoryItems = all.size - (wornItems - wornFree);
  const swapReserve = wornItems - wornFree - minLoadoutItems;
  const used = s + nonItem + inventoryItems + swapReserve;
  return {
    total,
    supplies: s,
    nonItem,
    carriedItems: all.size,
    wornItems,
    minLoadoutItems,
    inventoryItems,
    swapReserve,
    used,
    free: Math.max(0, total - used),
    overfull: used > total,
  };
};

// --- inventory grid ------------------------------------------------------------------------------------------------

export type InventoryCellKind = 'supply' | 'switch' | 'spec' | 'pinned' | 'non-item' | 'swap' | 'free';

export interface InventoryCell {
  kind: InventoryCellKind;
  label: string;
  item?: PlanItem;
  group?: StyleGroup;
  supply?: SupplyType;
}

const GROUP_ORDER: StyleGroup[] = ['melee', 'ranged', 'magic'];

/**
 * The 4×7 inventory while wearing the worn set: supplies, switch items grouped by style (melee, ranged, magic; slot
 * order), spec weapons, pinned items, non-item slots, swap space (free slots needed while wearing a smaller loadout),
 * free slots. Never more than `total` cells unless the kit is overfull (then every item is listed).
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
): InventoryCell[] => {
  const cells: InventoryCell[] = [];
  const free = new Set(raidSupplied);
  SUPPLY_TYPES.forEach((t) => {
    for (let i = 0; i < Math.max(0, Math.floor(supplies[t.id] || 0)); i++) cells.push({ kind: 'supply', label: t.label, supply: t.id });
  });
  const wornIds = new Set(kit.length ? equipmentItemIds(kit[worn].equipment) : []);
  // raid-supplied items (ToB's Dawnbringer) take no cell
  const placed = new Set<number>([...Array.from(wornIds), ...raidSupplied]);
  for (const g of GROUP_ORDER) {
    kit.forEach((l, i) => {
      if (i === worn || l.group !== g) return;
      ALL_SLOTS.forEach((slot) => {
        const it = l.equipment[slot];
        if (!it || placed.has(it.id)) return;
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
  const loadoutSizes = kit.map((l) => equipmentItemIds(l.equipment).length);
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
  /** Phase 21: skip the dedupe rule (the optimiser's prune step); default false. */
  noPrune?: boolean;
  /**
   * Phase 21: style group (any label) per candidate; the dedupe rule may swap a kit loadout for a cheaper candidate of
   * the same group. Undefined = drops only.
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
    let min = Infinity;
    for (const i of m) {
      p.items[i].forEach((id) => {
        if (!free.has(id)) all.add(id);
      });
      min = Math.min(min, p.items[i].length);
    }
    return p.fixedSlots + all.size - (m.length ? min : 0);
  };
  const solution = (members: number[], seed: number): KitSolution => ({
    members, time: timeOf(members), used: usedOf(members), seed,
  });

  // the dedupe rule (SWITCH_MIN_*): repeatedly apply the move that breaks it the most, until none does —
  // drop a loadout that saves less than switchSavingRequired(its slots), or swap one for a cheaper candidate of the same
  // style (`groups`) when the slots it frees bought less than SWITCH_MIN_SECONDS_PER_SLOT each
  const loss = (from: KitSolution, to: KitSolution) => (to.time === from.time ? 0 : to.time - from.time);
  const prune = (start: KitSolution): KitSolution => {
    if (p.noPrune) return start;
    let cur = start;
    for (let iter = 0; iter < 50 && cur.members.length > 0; iter++) {
      let move: { s: KitSolution, margin: number } | null = null;
      for (let i = 0; i < cur.members.length; i++) {
        if (cur.members.length > 1) {
          const s = solution(cur.members.filter((_, j) => j !== i), cur.seed);
          const margin = loss(cur, s) - switchSavingRequired(cur.used - s.used);
          if (margin < -EPS && (!move || margin < move.margin)) move = { s, margin };
        }
        if (p.groups) {
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
  supplies: SupplyCounts;
  totalSlots?: number;
  /** Search rows already known, by phase key (the UI's session cache); missing phases are searched. */
  searchRows?: Record<string, SearchRow[]>;
}

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
}

export const PLAN_DEFAULTS: Required<Omit<PlanTuning, 'search' | 'presets' | 'model' | 'noPrune'>> = {
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

export interface PlanProgress {
  stage: 'search' | 'matrix' | 'partials' | 'optimise' | 'final';
  done: number;
  total: number;
  label: string;
  search?: GearSearchProgress;
}

export interface PlanHooks {
  onProgress?: (p: PlanProgress) => void;
  shouldCancel?: () => boolean;
}

export interface PlanRejection {
  label: string;
  kind: 'addition' | 'alternative';
  /** Seconds the route would gain (+) or lose (−) vs the plan. */
  deltaSeconds: number;
  /** Extra inventory slots vs the plan (+ = more). */
  deltaSlots: number;
  reason: string;
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
  /** Potion supplies whose style no kit loadout uses (they only take slots). */
  unusedSupplies: { type: SupplyType, label: string, count: number, group: StyleGroup }[];
  /** The optimiser's (matrix) DPS of the kit per phase key, for checking against the exact times. */
  matrixDps: Record<string, number>;
  /** Pinned items (not spec weapons) that no kit loadout wears: carried for other reasons, a slot each. */
  unusedCarried: PlanItem[];
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
  const assumptions = planAssumptions(inputs.assumptions, inputs.supplies);
  const total = inputs.totalSlots ?? INVENTORY_SLOTS;
  const cancelled = () => hooks.shouldCancel?.() === true;
  const progress = (p: PlanProgress) => hooks.onProgress?.(p);
  const exactA = raidTimeAssumptionsFrom(assumptions, drain, settings, tuning.model);
  const allRoutes = routesFor(exactA);
  const routes = inputs.route === 'all' ? allRoutes : allRoutes.filter((r) => r.id === inputs.route);
  if (!routes.length) throw new Error(`Planner: unknown route '${inputs.route}'`);
  // Team / None: drains don't depend on the fight length, any fixed length is exact. Solo: set per encounter below.
  const fastA: RaidTimeAssumptions = { ...exactA, fixedFightSeconds: drain === 'none' ? undefined : assumptions.fightSeconds };

  const specItems = carriedSpecWeaponNames(assumptions.mySpecs).map(planItemByName);
  const pinnedItems = inputs.pinned.map((id) => equipmentById(id)).filter((p): p is EquipmentPiece => !!p).map((p) => toPlanItem(p));
  // phase 21: the raid's own items (ToB: Dawnbringer) cost no slot and are free to put on any loadout
  const raidSupplied = raidSuppliedItemIds(assumptions);
  const raidSuppliedSet = new Set(raidSupplied);
  const carried = Array.from(new Set([...specItems, ...pinnedItems].map((i) => i.id)));
  const carriedSet = new Set(carried);
  const isFreeItem = (id: number) => carriedSet.has(id) || raidSuppliedSet.has(id);
  const fixedSlots = sumSupplies(inputs.supplies) + Math.max(0, Math.floor(inputs.nonItemSlots || 0));

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
    unusedSupplies: [],
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
  const byEncounter = encounterPhaseTargets(routes, exactA);
  const targets: { targetKey: string, phase?: string }[] = [];
  const encounterOfCol: EncounterId[] = [];
  byEncounter.forEach((ts, e) => ts.forEach((t) => {
    if (targets.some((x) => phaseKey(x.targetKey, x.phase) === phaseKey(t.targetKey, t.phase))) return;
    targets.push(t);
    encounterOfCol.push(e);
  }));
  const searchRows: Record<string, SearchRow[]> = { ...(inputs.searchRows || {}) };
  const missing = targets.filter((t) => !searchRows[phaseKey(t.targetKey, t.phase)]);
  for (const [i, t] of missing.entries()) {
    if (cancelled()) return emptyResult(searchRows);
    const label = `${findTarget(t.targetKey).label}${t.phase ? ` (${t.phase})` : ''}`;
    progress({
      stage: 'search', done: i, total: missing.length, label,
    });
    const r = runGearSearch(basePlayer, {
      targetKey: t.targetKey, phase: t.phase, drain, styles: 'all',
    }, assumptions, {
      ...(tuning.search || {}),
      topN: SEARCH_TOP_N,
      shouldCancel: hooks.shouldCancel,
      onProgress: (search) => progress({
        stage: 'search', done: i, total: missing.length, label, search,
      }),
    });
    if (r.cancelled) return emptyResult(searchRows);
    searchRows[phaseKey(t.targetKey, t.phase)] = pickSearchRows(r, cfg.perGroupWeapons, cfg.perWeapon);
  }
  const tSearch = Date.now();

  // 2. full candidates (presets + search rows), merged by items + group
  const candidates: PlanCandidate[] = [];
  const byKey = new Map<string, PlanCandidate>();
  const labelCount = new Map<string, number>();
  const uniqueLabel = (l: string) => {
    const n = (labelCount.get(l) ?? 0) + 1;
    labelCount.set(l, n);
    return n === 1 ? l : `${l} #${n}`;
  };
  const addCandidate = (c: Omit<PlanCandidate, 'key' | 'label'> & { label: string }): PlanCandidate | null => {
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
  for (const preset of tuning.presets || raidBase(assumptions.raid).presets) {
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
  const monstersAt = (d: DrainStateId, fightOf: (col: number) => number) => targets.map((t, col) => buildTargetMonster(
    findTarget(t.targetKey),
    t.phase,
    d,
    { ...assumptions, fightSeconds: fightOf(col) },
  ).monster);
  let monsters = monstersAt(drain, () => assumptions.fightSeconds);
  const dpsOn = (
    c: Pick<PlanCandidate, 'group' | 'options' | 'label'>,
    eq: PlanEquipment,
    col: number,
    ms = monsters,
  ): { dps: number, option: number } => {
    let best = { dps: 0, option: 0 };
    const playerEq = toPlayerEquipment(eq);
    c.options.forEach((o, oi) => {
      let dps = 0;
      try {
        const player = applyLoadoutToPlayer(basePlayer, c.label, c.group, playerEq, o.style, o.spell, ms[col], assumptions);
        dps = evaluateLoadout(player, ms[col], false).dps;
      } catch {
        dps = 0;
      }
      evaluations += 1;
      if (dps > best.dps) best = { dps, option: oi };
    });
    return best;
  };
  const dps: number[][] = [];
  const bestOpt: number[][] = [];
  const optLabel = (i: number, col: number) => {
    const o = candidates[i].options[bestOpt[i]?.[col] ?? 0];
    return o ? styleLabel(o.style, o.spell) : '-';
  };
  const matrixKit = (members: number[], table: number[][] = dps): RaidKit => ({
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
    try {
      const noneMonsters = monstersAt('none', () => assumptions.fightSeconds);
      const noneDps: number[][] = candidates.map((c, i) => {
        if (cancelled()) throw new PlanCancelled();
        if (i % 5 === 0) {
          progress({
            stage: 'matrix', done: i, total: candidates.length, label: 'fight lengths (undrained)',
          });
        }
        return targets.map((_, col) => dpsOn(c, c.equipment, col, noneMonsters).dps);
      });
      const noneA: RaidTimeAssumptions = { ...exactA, drain: 'none' };
      soloFight = {};
      for (const e of Array.from(byEncounter.keys())) {
        let bestT = Infinity;
        candidates.forEach((_, i) => {
          const t = encounterTime(e, matrixKit([i], noneDps), noneA).seconds;
          if (t < bestT) bestT = t;
        });
        soloFight[e] = Number.isFinite(bestT) && bestT > 0 ? Math.round(bestT) : assumptions.fightSeconds;
      }
    } catch (e) {
      if (e instanceof PlanCancelled) return emptyResult(searchRows);
      throw e;
    }
    fastA.fixedFightSeconds = soloFight;
    monsters = monstersAt(drain, (col) => soloFight![encounterOfCol[col]] ?? assumptions.fightSeconds);
  }
  const fillMatrix = (from: number, stage: PlanProgress['stage']) => {
    for (let i = from; i < candidates.length; i++) {
      if (cancelled()) throw new PlanCancelled();
      if ((i - from) % 5 === 0) {
        progress({
          stage, done: i - from, total: candidates.length - from, label: candidates[i].label,
        });
      }
      const row = targets.map((_, col) => dpsOn(candidates[i], candidates[i].equipment, col));
      dps[i] = row.map((x) => x.dps);
      bestOpt[i] = row.map((x) => x.option);
    }
  };

  try {
    fillMatrix(0, 'matrix');
  } catch (e) {
    if (e instanceof PlanCancelled) return emptyResult(searchRows);
    throw e;
  }
  const colMax = targets.map((_, col) => Math.max(0, ...dps.map((r) => r[col])));
  const score = (i: number) => dps[i].reduce((s, d, col) => s + (colMax[col] > 0 ? d / colMax[col] : 0), 0);
  const ranked = (ixs: number[]) => ixs.map((i) => ({ i, s: score(i) })).sort((a, b) => (b.s - a.s) || (a.i - b.i)).map((x) => x.i);
  const fullCount = candidates.length;

  // 4. partial switches
  let nPartial = 0;
  let capped = 0;
  try {
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
        pending.push({
          label: `${B.equipment.weapon?.name ?? B.label} switch on ${A.label}`,
          kind: 'partial',
          group: B.group,
          equipment: v0.equipment,
          options: B.options,
          source: `${A.label} → ${B.label}, weapon only (raid item: 0 slots)`,
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
  } catch (e) {
    if (e instanceof PlanCancelled) return emptyResult(searchRows);
    throw e;
  }
  const tMatrix = Date.now();

  // 5. optimise
  const routeTime = (members: number[]) => {
    const cmp = compareRoutes(matrixKit(members), fastA, routes);
    return cmp.fastest >= 0 ? cmp.routes[cmp.fastest].seconds : Infinity;
  };
  const items = candidates.map((c) => equipmentItemIds(c.equipment));
  // seeds: the best single loadouts by their own route time (ties: matrix score)
  const singles = candidates.map((_, i) => ({ i, t: routeTime([i]), s: score(i) }));
  const seeds = singles
    .filter((x) => dps[x.i].some((d) => d > 0))
    .sort((a, b) => ((a.t === b.t ? 0 : a.t - b.t) || (b.s - a.s) || (a.i - b.i)))
    .slice(0, cfg.seeds)
    .map((x) => x.i);
  // at least the best seed of every style group, so single-style and mixed kits both get explored
  for (const g of GROUP_ORDER) {
    const top = singles.filter((x) => candidates[x.i].group === g && dps[x.i].some((d) => d > 0))
      .sort((a, b) => ((a.t === b.t ? 0 : a.t - b.t) || (b.s - a.s) || (a.i - b.i)))[0];
    if (top && !seeds.includes(top.i)) seeds.push(top.i);
  }
  let opt: KitOptimum;
  try {
    opt = optimiseKit({
      items,
      carried,
      fixedSlots,
      totalSlots: total,
      time: routeTime,
      seeds: seeds.length ? seeds : [0],
      raidSupplied,
      noPrune: tuning.noPrune,
      groups: candidates.map((c) => c.group),
      shouldCancel: hooks.shouldCancel,
      onProgress: (done, n) => progress({
        stage: 'optimise', done, total: n, label: 'kits',
      }),
    });
  } catch (e) {
    if (e instanceof PlanCancelled) return emptyResult(searchRows);
    throw e;
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
      toPlayer: (monster, o) => applyLoadoutToPlayer(basePlayer, c.label, c.group, eq, o.style, o.spell, monster, assumptions),
    };
  });
  const sortedFinals = [opt.best, ...opt.finals]
    .filter((x) => x.used <= total || x === opt.best)
    .sort((a, b) => (better(a, b, total) ? -1 : Number(better(b, a, total))));
  const finalists: KitSolution[] = [];
  sortedFinals.forEach((x) => {
    const k = [...x.members].sort((a, b) => a - b).join(',');
    if (finalists.length < RETIME_TOP && !finalists.some((f) => [...f.members].sort((a, b) => a - b).join(',') === k)) finalists.push(x);
  });
  let chosen = finalists[0];
  let evaluator = createKitEvaluator(kitLoadoutsOf(chosen.members), assumptions);
  let comparison = compareRoutes(evaluator, exactA, routes);
  let exactEvaluations = evaluator.evaluations();
  const exactSeconds = (c: RouteComparison) => (c.fastest >= 0 ? c.routes[c.fastest].seconds : Infinity);
  for (const f of finalists.slice(1)) {
    const ev = createKitEvaluator(kitLoadoutsOf(f.members), assumptions);
    const cmp = compareRoutes(ev, exactA, routes);
    exactEvaluations += ev.evaluations();
    if (exactSeconds(cmp) < exactSeconds(comparison) - EPS) {
      chosen = f;
      evaluator = ev;
      comparison = cmp;
    }
  }
  const { members } = chosen;
  const planned = comparison.fastest;
  // worn = the loadout used on the planned route's first phase (saves one switch)
  const firstChoice = planned >= 0
    ? comparison.routes[planned].encounters.flatMap((e) => e.phases).find((p) => p.choice)?.choice
    : undefined;
  let wornIx = members.findIndex((i) => candidates[i].label === firstChoice?.loadout);
  if (wornIx < 0) wornIx = 0;
  const kitOrder = [members[wornIx], ...members.filter((_, j) => j !== wornIx)];
  const kit = kitOrder.map((i) => candidates[i]);
  const slots = kitSlotUsage(kitOrder.map((i) => items[i]), 0, carried, inputs.supplies, inputs.nonItemSlots, total, raidSupplied);
  const inventory = inventoryGrid(kit, 0, specItems, pinnedItems, inputs.supplies, inputs.nonItemSlots, total, raidSupplied);

  // 7. why: improvements that don't fit, and the best kit of every other style mix
  const T = chosen.time;
  const usedOfKit = (m: number[]) => {
    const allIds = new Set<number>(carried.filter((id) => !raidSuppliedSet.has(id)));
    m.forEach((x) => items[x].forEach((id) => {
      if (!raidSuppliedSet.has(id)) allIds.add(id);
    }));
    return fixedSlots + allIds.size - Math.min(...m.map((x) => items[x].length));
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
  try {
    for (const mix of MIXES) {
      const label = groupsLabel(mix);
      if (label === chosenMix) continue;
      const allowed = candidates.map((c) => mix.includes(c.group));
      const mixSeeds = seeds.filter((i) => allowed[i]).slice(0, 5);
      if (!mixSeeds.length) continue;
      let s = optimiseKit({
        items, carried, fixedSlots, totalSlots: total, time: routeTime, seeds: mixSeeds, allowed, raidSupplied, noPrune: tuning.noPrune, groups: candidates.map((c) => c.group), shouldCancel: hooks.shouldCancel,
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
      });
    }
  } catch (e) {
    if (e instanceof PlanCancelled) return emptyResult(searchRows);
    throw e;
  }
  alternatives.sort((a, b) => (b.deltaSeconds - a.deltaSeconds) || a.label.localeCompare(b.label));

  const tEnd = Date.now();
  return {
    cancelled: false,
    kit,
    kitMarginal,
    slots,
    inventory,
    specItems,
    pinnedItems,
    comparison,
    planned,
    rejected,
    alternatives,
    unusedSupplies: (Object.entries(SUPPLY_POTION_GROUP) as [SupplyType, StyleGroup][])
      .filter(([t, g]) => inputs.supplies[t] > 0 && !kit.some((c) => c.group === g))
      .map(([t, g]) => ({
        type: t, label: SUPPLY_TYPES.find((x) => x.id === t)!.label, count: inputs.supplies[t], group: g,
      })),
    matrixDps: Object.fromEntries(targets.map((t, col) => [phaseKey(t.targetKey, t.phase), Math.max(0, ...members.map((m) => dps[m][col]))])),
    unusedCarried: pinnedItems
      .filter((it, i, all) => all.findIndex((x) => x.id === it.id) === i)
      .filter((it) => !specItems.some((x) => x.id === it.id))
      .filter((it) => !kit.some((c) => equipmentItemIds(c.equipment).includes(it.id))),
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
      ...(soloFight ? { fightSeconds: soloFight } : {}),
      ms: {
        search: tSearch - t0, matrix: tMatrix - tSearch, optimise: tOpt - tMatrix, total: tEnd - t0,
      },
    },
  };
};

/** The player of a kit loadout against a monster, with its best style option there (for "Load into calculator"). */
export const planLoadoutToPlayer = (
  base: Player,
  c: PlanCandidate,
  monster: Parameters<typeof applyLoadoutToPlayer>[6],
  assumptions: BestSetupAssumptions,
): Player => {
  const eq = toPlayerEquipment(c.equipment);
  let best: { p: Player, dps: number } | null = null;
  for (const o of c.options) {
    const p = applyLoadoutToPlayer(base, c.label, c.group, eq, o.style, o.spell, monster, assumptions);
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
