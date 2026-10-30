import { availableEquipment } from '@/lib/Equipment';
import { ItemRef } from '@/lib/fracturedArchive/presets';
import { aliasGroupsByName } from '@/lib/fracturedArchive/ownership';
import { AUDIT_EXTRA_REFS } from '@/lib/fracturedArchive/poolAuditSources';
import { refName } from '@/lib/fracturedArchive/searchCandidates';
import { RAID_BASES } from '@/lib/raids/base';

/**
 * Phase 39b: "Import my bank" from the RuneLite character-exporter plugin (`bank.json`). Pure; parsed in the browser,
 * nothing is uploaded and only the item names are looked at.
 *
 * `bank.json`: `{ exported_at, kind: "bank", items: [{ slot, id, quantity, name }] }`.
 *
 * What counts as GEAR: every pool / preset / spec item that is worn (weapons, armour, rings, capes, amulets, shields).
 * Not ammo (arrows, bolts, any item in the ammo slot), not blowpipe darts, and nothing that isn't an equipment item.
 *
 * A pool item P is owned when the bank holds an item B with
 * 1. B is P, or B is a version of P: `P (...)` - "(uncharged)", "(l)", "(max)", "(f)", "(or)", "(i)", "(g)" ... (owning
 *    the upgrade means owning the base; the other way round it does not hold, so a pool "Avernic treads (max)" needs
 *    the (max)), or
 * 2. B is an ornament kit of P: the same name behind "Sanguine ", "Holy ", "Radiant " (Sanguine torva full helm,
 *    Holy scythe of vitur, Radiant oathplate helm ...) - then rule 1 applies to what is left, or
 * 3. B is in the same upstream alias group as P (locked / broken / cosmetic recolours: src/lib/EquipmentAliases.ts).
 * Everything else is not found; the UI lets the user untick items carried or stored elsewhere.
 */

export interface BankItem {
  id: number;
  name: string;
}

export interface ParsedBank {
  items: BankItem[];
  exportedAt: string | null;
}

/** Reads `bank.json`; an error text for anything else. */
export const parseBank = (raw: unknown): ParsedBank | { error: string } => {
  if (!raw || typeof raw !== 'object') return { error: 'Not a bank.json file.' };
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.items)) return { error: 'No "items" list in the file.' };
  if (obj.kind !== undefined && obj.kind !== 'bank') return { error: `This is a "${String(obj.kind)}" export, not the bank.` };
  const items: BankItem[] = [];
  for (const it of obj.items) {
    if (!it || typeof it !== 'object') continue;
    const { id, name } = it as { id?: unknown, name?: unknown };
    if (typeof name !== 'string' || !name.trim()) continue;
    items.push({ id: typeof id === 'number' ? id : -1, name: name.trim() });
  }
  return { items, exportedAt: typeof obj.exported_at === 'string' ? obj.exported_at : null };
};

const ORNAMENT_PREFIXES = ['sanguine ', 'holy ', 'radiant ', 'frozen ', 'volcanic '];

/** The names a bank item stands for: itself, its id's name, its alias group, without an ornament prefix (lower case). */
const ownedForms = (b: BankItem): string[] => {
  const names = [b.name];
  const byId = availableEquipment.find((e) => e.id === b.id);
  if (byId && byId.name !== b.name) names.push(byId.name);
  for (const n of [...names]) names.push(...(aliasGroupsByName().get(n) || []));
  const lower = names.map((n) => n.toLowerCase());
  for (const n of [...lower]) {
    const pre = ORNAMENT_PREFIXES.find((p) => n.startsWith(p));
    if (pre) lower.push(n.slice(pre.length));
  }
  return Array.from(new Set(lower));
};

/** Does the bank own the pool item `name`? */
export const bankOwns = (name: string, bank: BankItem[]): boolean => {
  const p = name.toLowerCase();
  return bank.some((b) => ownedForms(b).some((f) => f === p || f.startsWith(`${p} (`)));
};

/** Pool gear names for the import: worn items of every pool / preset / spec weapon, without ammo and darts. */
export const poolGearNames = (): string[] => {
  const refs: ItemRef[] = [...AUDIT_EXTRA_REFS];
  const ammo = new Set<string>();
  for (const base of RAID_BASES) {
    for (const pool of Object.values(base.searchPool)) {
      pool.weapons.forEach((w) => {
        refs.push(w.weapon);
        (w.ammo || []).forEach((a) => ammo.add(refName(a)));
        if (w.dart) ammo.add(refName(w.dart));
      });
      Object.values(pool.slots).forEach((cands) => (cands || []).forEach((c) => refs.push(c.ref)));
      pool.sets.forEach((s) => refs.push(...(Object.values(s.pieces) as ItemRef[])));
      (pool.weaponExtras || []).forEach((x) => Object.values(x.slots).forEach((cands) => (cands || []).forEach((c) => refs.push(c.ref))));
    }
    base.presets.forEach((p) => refs.push(...(Object.values(p.equipment) as ItemRef[])));
  }
  const out: string[] = [];
  new Set(refs.map(refName)).forEach((name) => {
    if (ammo.has(name)) return;
    const pieces = availableEquipment.filter((e) => e.name === name);
    if (!pieces.length || pieces.every((e) => e.slot === 'ammo')) return;
    out.push(name);
  });
  return out.sort((a, b) => a.localeCompare(b));
};

export interface BankMatch {
  /** Pool gear found in the bank. */
  matched: string[];
  /** Pool gear not found (what the import marks "not owned" unless unticked). */
  missing: string[];
}

export const matchBank = (bank: BankItem[], poolNames: string[] = poolGearNames()): BankMatch => {
  const matched: string[] = [];
  const missing: string[] = [];
  poolNames.forEach((n) => (bankOwns(n, bank) ? matched : missing).push(n));
  return { matched, missing };
};

/**
 * The new "Items I don't own" list: the import's `missing` (minus what the user unticked) plus the entries of the
 * current list the import doesn't judge (not pool gear, e.g. typed in by hand). Entries it does judge are replaced.
 */
export const mergeNotOwned = (current: string[], missing: string[], poolNames: string[] = poolGearNames()): string[] => {
  const judged = new Set(poolNames);
  const out = current.filter((n) => !judged.has(n));
  missing.forEach((n) => { if (!out.includes(n)) out.push(n); });
  return out;
};

export const BANK_IMPORT_STORAGE_KEY = 'mxeaez-dps:bank-import';

export interface BankImportInfo {
  exportedAt: string | null;
  importedAt: string;
  matched: number;
  missing: number;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const defaultStorage = (): StorageLike | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

export const loadBankImport = (storage: StorageLike | null = defaultStorage()): BankImportInfo | null => {
  try {
    const raw = storage?.getItem(BANK_IMPORT_STORAGE_KEY);
    if (!raw) return null;
    const r = JSON.parse(raw);
    if (typeof r?.importedAt !== 'string') return null;
    return {
      exportedAt: typeof r.exportedAt === 'string' ? r.exportedAt : null,
      importedAt: r.importedAt,
      matched: Number(r.matched) || 0,
      missing: Number(r.missing) || 0,
    };
  } catch {
    return null;
  }
};

export const saveBankImport = (info: BankImportInfo | null, storage: StorageLike | null = defaultStorage()): void => {
  try {
    if (info) storage?.setItem(BANK_IMPORT_STORAGE_KEY, JSON.stringify(info));
    else storage?.removeItem(BANK_IMPORT_STORAGE_KEY);
  } catch {
    // ignored
  }
};

/** "27 Oct" for an ISO timestamp; '' when unreadable. */
export const shortDate = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};
