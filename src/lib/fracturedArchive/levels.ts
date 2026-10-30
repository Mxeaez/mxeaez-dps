import { Player, PlayerSkills } from '@/types/Player';

/**
 * Phase 39b: the player levels imported from the RuneLite character-exporter (`character.json`). The best-setup page
 * assumes 99s (`generateEmptyPlayer`); an import sets the real levels instead, and the potion boosts are recomputed
 * from them (`applyLoadoutToPlayer` -> `potionBoosts`). Pure; the UI keeps the entry in localStorage.
 */
export const LEVELS_STORAGE_KEY = 'mxeaez-dps:levels';

export type SavedLevelSkills = Pick<PlayerSkills, 'atk' | 'def' | 'hp' | 'magic' | 'prayer' | 'ranged' | 'str' | 'mining' | 'herblore'>;

/** RuneLite skill name -> calculator skill key; `required` ones must be present in the file (the rest default to 99). */
export const LEVEL_SKILLS: { name: string, key: keyof SavedLevelSkills, required: boolean }[] = [
  { name: 'Attack', key: 'atk', required: true },
  { name: 'Strength', key: 'str', required: true },
  { name: 'Defence', key: 'def', required: true },
  { name: 'Hitpoints', key: 'hp', required: true },
  { name: 'Ranged', key: 'ranged', required: true },
  { name: 'Magic', key: 'magic', required: true },
  { name: 'Prayer', key: 'prayer', required: true },
  { name: 'Mining', key: 'mining', required: false },
  { name: 'Herblore', key: 'herblore', required: false },
];

export interface SavedLevels {
  levels: SavedLevelSkills;
  /** The export's own timestamp (ISO) when the file had one. */
  exportedAt: string | null;
  /** When it was imported (ISO). */
  importedAt: string;
}

export const MAX_LEVELS: SavedLevelSkills = {
  atk: 99, def: 99, hp: 99, magic: 99, prayer: 99, ranged: 99, str: 99, mining: 99, herblore: 99,
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const defaultStorage = (): StorageLike | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

const isLevel = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 126;

/**
 * Reads `character.json`: `{ stats: { Attack: { real_level, ... }, ... } }`. The account name (and everything else) is
 * dropped here. Returns the levels, or an error text.
 */
export const parseCharacter = (raw: unknown): { levels: SavedLevelSkills, exportedAt: string | null } | { error: string } => {
  if (!raw || typeof raw !== 'object') return { error: 'Not a character.json file.' };
  const obj = raw as Record<string, unknown>;
  const stats = obj.stats as Record<string, { real_level?: unknown }> | undefined;
  if (!stats || typeof stats !== 'object') return { error: 'No "stats" in the file.' };
  const levels = { ...MAX_LEVELS };
  for (const s of LEVEL_SKILLS) {
    const lvl = stats[s.name]?.real_level;
    if (lvl === undefined && !s.required) continue;
    if (!isLevel(lvl)) return { error: `Missing or invalid ${s.name} level.` };
    levels[s.key] = Math.min(99, lvl);
  }
  const at = typeof obj.exported_at === 'string' ? obj.exported_at : null;
  return { levels, exportedAt: at };
};

const validSaved = (raw: unknown): SavedLevels | null => {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const lv = r.levels as Record<string, unknown> | undefined;
  if (!lv || typeof lv !== 'object') return null;
  const levels = { ...MAX_LEVELS };
  for (const s of LEVEL_SKILLS) {
    const v = lv[s.key];
    if (v === undefined) continue;
    if (!isLevel(v)) return null;
    levels[s.key] = Math.min(99, v);
  }
  return {
    levels,
    exportedAt: typeof r.exportedAt === 'string' ? r.exportedAt : null,
    importedAt: typeof r.importedAt === 'string' ? r.importedAt : '',
  };
};

export const loadLevels = (storage: StorageLike | null = defaultStorage()): SavedLevels | null => {
  if (!storage) return null;
  try {
    const raw = storage.getItem(LEVELS_STORAGE_KEY);
    return raw ? validSaved(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
};

export const saveLevels = (saved: SavedLevels | null, storage: StorageLike | null = defaultStorage()): void => {
  if (!storage) return;
  try {
    if (saved) storage.setItem(LEVELS_STORAGE_KEY, JSON.stringify(saved));
    else storage.removeItem(LEVELS_STORAGE_KEY);
  } catch {
    // blocked storage: not remembered
  }
};

// The levels the page currently uses (set by BestSetup.tsx on load / import); null = all 99.
let active: SavedLevelSkills | null = null;

export const setActiveLevels = (levels: SavedLevelSkills | null): void => {
  active = levels;
};

export const getActiveLevels = (): SavedLevelSkills | null => active;

/** `base` with the active levels as its skills (boosts are recomputed per loadout). Unchanged when none are set. */
export const withActiveLevels = (base: Player): Player => (active ? { ...base, skills: { ...base.skills, ...active } } : base);
