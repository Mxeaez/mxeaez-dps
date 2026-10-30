import { availableEquipment, equipmentAliases } from '@/lib/Equipment';
import { ItemRef, PresetDef, StyleGroup } from '@/lib/fracturedArchive/presets';
import {
  CandidateItem, refName, SearchSlot, StylePool,
} from '@/lib/fracturedArchive/searchCandidates';

/**
 * Phase 26: the "Items I don't own" list of /best-setup. The page assumes max gear; the user crosses off what they
 * don't have. Pure (React-free) — the UI keeps the list in localStorage (`NOT_OWNED_STORAGE_KEY`), the search / planner
 * get it as plain names.
 *
 * Semantics:
 * - Search / Summary search the full pool by default (the true best) and mark rows that use an unowned item; with
 *   "Only items I own" they search `filterPool(pool)` instead.
 * - Plan always honours the list: unowned items leave the candidate pool, presets that use one are dropped, and unowned
 *   pinned items are dropped with a notice (planner.ts).
 *
 * Matching (`unownedBase`): names are exact `cdn/json/equipment.json` names. An item is unowned when, for some listed
 * name E, its name
 * 1. is E (every version: Charged / Uncharged / Restored ... share the name), or
 * 2. starts with "E (" — the upgraded / ornament / imbued variants of the base: "Avernic treads" covers "Avernic treads
 *    (max)", "Necklace of anguish" covers "Necklace of anguish (or)", "Masori body" covers "Masori body (f)" (you can't
 *    own the upgrade without the base). The other way round doesn't hold: listing "Avernic treads (max)" leaves the
 *    plain treads owned. Or
 * 3. is in the same upstream alias group (src/lib/EquipmentAliases.ts: base id → variants "identical in function",
 *    i.e. locked / broken / cosmetic recolours) as an item named E. Alias groups are symmetric (one item).
 */

export const NOT_OWNED_STORAGE_KEY = 'mxeaez-dps:not-owned';
export const ONLY_OWNED_STORAGE_KEY = 'mxeaez-dps:only-owned';

/** The Fractured Archive rewards: the likely gaps, offered as quick-add buttons. */
export const RAID4_REWARDS: string[] = ['Obligator', 'Ascension crossbows', "Zorya's tome", 'Rondache'];

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const defaultStorage = (): StorageLike | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

/** Normalises a list: trimmed, unique, non-empty names, in the order given. */
export const normaliseNotOwned = (names: unknown): string[] => {
  if (!Array.isArray(names)) return [];
  const out: string[] = [];
  for (const n of names) {
    if (typeof n !== 'string') continue;
    const t = n.trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
};

/** Reads the list from storage; empty (max gear assumed) when missing, unreadable or blocked. */
export const loadNotOwned = (storage: StorageLike | null = defaultStorage()): string[] => {
  if (!storage) return [];
  try {
    const raw = storage.getItem(NOT_OWNED_STORAGE_KEY);
    return raw ? normaliseNotOwned(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
};

/** Writes the list (an empty list removes the key). Storage errors are ignored. */
export const saveNotOwned = (names: string[], storage: StorageLike | null = defaultStorage()): void => {
  if (!storage) return;
  try {
    const list = normaliseNotOwned(names);
    if (list.length) storage.setItem(NOT_OWNED_STORAGE_KEY, JSON.stringify(list));
    else storage.removeItem(NOT_OWNED_STORAGE_KEY);
  } catch {
    // private window / blocked storage: the list just isn't remembered
  }
};

export const loadOnlyOwned = (storage: StorageLike | null = defaultStorage()): boolean => {
  try {
    return storage?.getItem(ONLY_OWNED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
};

export const saveOnlyOwned = (on: boolean, storage: StorageLike | null = defaultStorage()): void => {
  try {
    if (on) storage?.setItem(ONLY_OWNED_STORAGE_KEY, '1');
    else storage?.removeItem(ONLY_OWNED_STORAGE_KEY);
  } catch {
    // ignored
  }
};

// --- matching ------------------------------------------------------------------------------------------------------

let aliasGroups: Map<string, string[]> | null = null;

/** Item name → every name of its upstream alias group (incl. itself); names without aliases are absent. */
export const aliasGroupsByName = (): Map<string, string[]> => {
  if (aliasGroups) return aliasGroups;
  const nameOf = new Map(availableEquipment.map((e) => [e.id, e.name]));
  const groups = new Map<string, Set<string>>();
  for (const [base, variants] of Object.entries(equipmentAliases)) {
    const names = [Number(base), ...variants].map((id) => nameOf.get(id)).filter((n): n is string => !!n);
    const set = new Set(names);
    // merge with groups already holding one of these names
    for (const n of names) groups.get(n)?.forEach((x) => set.add(x));
    set.forEach((n) => groups.set(n, set));
  }
  aliasGroups = new Map(Array.from(groups.entries()).map(([n, s]) => [n, Array.from(s)]));
  return aliasGroups;
};

/** The listed name that makes `name` unowned (rules in the header), or null when it is owned. */
export const unownedBase = (name: string, notOwned: string[]): string | null => {
  if (!notOwned.length) return null;
  const candidates = [name, ...(aliasGroupsByName().get(name) || [])];
  for (const e of notOwned) {
    if (candidates.some((n) => n === e || n.startsWith(`${e} (`))) return e;
  }
  return null;
};

export const isOwned = (name: string, notOwned: string[]): boolean => unownedBase(name, notOwned) === null;

const refOwned = (ref: ItemRef, notOwned: string[]) => isOwned(refName(ref), notOwned);

/**
 * The listed names a loadout uses (unique, in slot order). Accepts search / plan equipment ({ name }), resolved pieces
 * or preset refs.
 */
export const loadoutUsesUnowned = (
  equipment: Partial<Record<string, { name: string } | ItemRef | null | undefined>>,
  notOwned: string[],
): string[] => {
  if (!notOwned.length) return [];
  const out: string[] = [];
  for (const it of Object.values(equipment)) {
    if (!it) continue;
    const name = typeof it === 'string' || Array.isArray(it) ? refName(it as ItemRef) : it.name;
    const base = unownedBase(name, notOwned);
    if (base && !out.includes(base)) out.push(base);
  }
  return out;
};

const filterCands = (cands: CandidateItem[] | undefined, notOwned: string[]) => (cands || []).filter((c) => refOwned(c.ref, notOwned));

const filterSlots = (slots: Partial<Record<SearchSlot, CandidateItem[]>>, notOwned: string[]) => Object.fromEntries(
  Object.entries(slots).map(([slot, cands]) => [slot, filterCands(cands, notOwned)]),
) as Partial<Record<SearchSlot, CandidateItem[]>>;

/**
 * One style group's pool without the unowned items: weapons (incl. their ammo options and blowpipe dart; a weapon whose
 * every ammo option is unowned goes too), slot candidates, weapon extras, and every set that has an unowned piece.
 */
export const filterStylePool = (pool: StylePool, notOwned: string[]): StylePool => {
  if (!notOwned.length) return pool;
  const weapons = pool.weapons.flatMap((w) => {
    if (!refOwned(w.weapon, notOwned)) return [];
    if (w.dart && !refOwned(w.dart, notOwned)) return [];
    if (w.ammo) {
      const ammo = w.ammo.filter((a) => refOwned(a, notOwned));
      return ammo.length ? [{ ...w, ammo }] : [];
    }
    return [w];
  });
  return {
    ...pool,
    weapons,
    slots: filterSlots(pool.slots, notOwned),
    sets: pool.sets.filter((s) => Object.values(s.pieces).every((r) => !r || refOwned(r, notOwned))),
    ...(pool.weaponExtras
      ? { weaponExtras: pool.weaponExtras.map((x) => ({ ...x, slots: filterSlots(x.slots, notOwned) })) }
      : {}),
  };
};

/** A raid's search pool (per style group) without the unowned items. */
export const filterPool = <T extends Partial<Record<StyleGroup, StylePool>>>(pool: T, notOwned: string[]): T => {
  if (!notOwned.length) return pool;
  return Object.fromEntries(Object.entries(pool)
    .map(([g, p]) => [g, p ? filterStylePool(p, notOwned) : p])) as T;
};

/** The presets that use no unowned item. */
export const filterPresets = (presets: PresetDef[], notOwned: string[]): PresetDef[] => (notOwned.length
  ? presets.filter((p) => loadoutUsesUnowned(p.equipment, notOwned).length === 0)
  : presets);

/** Adds `unowned` (the listed names a row uses) to search rows; rows using none get an empty list. */
export const markUnowned = <R extends { equipment: Partial<Record<string, { name: string } | undefined>> }>(
  rows: R[],
  notOwned: string[],
): (R & { unowned: string[] })[] => rows.map((r) => ({ ...r, unowned: loadoutUsesUnowned(r.equipment, notOwned) }));

/** "Obligator, Ascension crossbows" (for the badges / notices). */
export const unownedLabel = (names: string[]): string => names.join(', ');
