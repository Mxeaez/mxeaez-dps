import Potion from '@/enums/Potion';
import { DRAIN_STATES, DrainStateId } from '@/lib/fracturedArchive/bestSetup';
import { BestSetupAssumptions, MySpecs, TeamSpecAssumptions } from '@/lib/fracturedArchive/presets';
import {
  COMFORT_SUPPLY_TYPES, DEFAULT_RING_POLICY, DEFAULT_SPEC_MODE, equipmentById, heartById, heartByPotion, planItemByName,
  RING_POLICIES, RingPolicy, SPEC_MODES, SpecMode, SupplyCounts,
} from '@/lib/fracturedArchive/planner';
import { enumerateRoutes } from '@/lib/fracturedArchive/raidTime';
import {
  DEFAULT_RAID, RaidConfig, raidConfig, RaidId, RAIDS, TimeSettings, withScalingInput,
} from '@/lib/raids';
import { Spellbook, SPELLBOOKS } from '@/lib/raids/types';

/**
 * Phase 37b: "Remember my settings". Every best-setup input is kept per raid in localStorage under one versioned key
 * (`SETTINGS_STORAGE_KEY`) and restored on load. Pure (React-free): the page (BestSetup.tsx) holds the settings and
 * writes them through on every change; plan results are never stored.
 *
 * Stored JSON (`version` must be `SETTINGS_VERSION`, else everything falls back to the defaults):
 *   { "version": 1, "raid": "toa", "raids": { "<raid id>": {
 *       "assumptions": { ...only the inputs that differ from the raid's defaults },
 *       "time": { ...time-model settings that differ }, "drain": "solo", "specMode": "manual",
 *       "plan": { "route", "supplies": { "brew": 5 }, "ringPolicy", "mages", "nonItem", "pinned": [item ids], "raidMinutes",
 *         "spellbook" } } } }
 * Only values that differ from the defaults are written (a later default change still reaches untouched inputs); a raid
 * with nothing changed has no entry, and the key is removed when nothing at all differs.
 *
 * Restoring validates every field on its own (`validateRaidSettings`): unknown keys are ignored, a value of the wrong
 * type or out of range falls back to that input's default, and a missing part keeps its defaults. The assumptions
 * restored are the Assumptions box's inputs only (party size and the raid inputs, potions / heart, Zeal, fragments,
 * Specs I bring + Lightbearer + energy priority, team carriers + mode + Lightbearer, floor threshold, players at your
 * DPS); what the planner sets for its own runs (fight length, damage specs, surge potions, ...) is not.
 */
export const SETTINGS_STORAGE_KEY = 'mxeaez-dps:settings:v1';
export const SETTINGS_VERSION = 1;

/** The Plan tab's inputs (PlanView.tsx); "Spec weapons" is `RaidSettings.specMode`, shared with the Assumptions box. */
export interface PlanInputSettings {
  route: string;
  /** Comfort supplies (brew, restore, food, other); the kit's potions are the planner's. */
  supplies: SupplyCounts;
  ringPolicy: RingPolicy;
  /** Mages in party; undefined = auto. */
  mages?: number;
  /** Rune pouch / other non-item slots. */
  nonItem: number;
  /** "Items I always bring" (equipment ids + heart pseudo ids). */
  pinned: number[];
  /** Phase 38a: "Typical raid length" in minutes (the raid clock; default `RaidBase.typicalRaidMinutes`). */
  raidMinutes: number;
  /** Phase 38b: "Spellbook" (Arceuus: Death Charge; default `RaidBase.spellbook`). */
  spellbook: Spellbook;
}

/** Phase 38a: the range of the "Typical raid length" input (minutes). */
export const RAID_MINUTES_RANGE = { min: 0, max: 120 };

export interface RaidSettings {
  assumptions: BestSetupAssumptions;
  time: TimeSettings;
  /** The Drains selector as chosen (a party of 1 shows Team as Solo without changing it). */
  drain: DrainStateId;
  /** "Specs I bring" mode = the Plan tab's "Spec weapons". */
  specMode: SpecMode;
  plan: PlanInputSettings;
}

export interface SavedSettings {
  /** The active raid tab. */
  raid: RaidId;
  raids: Record<RaidId, RaidSettings>;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const defaultStorage = (): StorageLike | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

// --- validation ----------------------------------------------------------------------------------------------------

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const field = (o: unknown, k: string): unknown => (isObj(o) ? o[k] : undefined);
const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);
const int = (v: unknown, lo: number, hi: number, d: number): number => (Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi ? v as number : d);
const num = (v: unknown, lo: number, hi: number, d: number): number => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : d);
const oneOf = <T>(v: unknown, options: readonly T[], d: T): T => (options.includes(v as T) ? v as T : d);
const isPotion = (v: unknown): v is Potion => Number.isInteger(v) && typeof Potion[v as number] === 'string';

const MAX_CARRIERS = 8;
const MAX_AYAK = 10;
const MAX_SLOTS = 28;

/** The pinned defaults of a raid (the Plan tab's "reset"): its pinned list, a heart replaced by the Assumptions' heart. */
export const defaultPinnedIds = (raid: RaidConfig, magicPotion: Potion): number[] => {
  const heart = heartByPotion(magicPotion);
  return raid.planDefaults.pinned.map((n) => planItemByName(n).id)
    .flatMap((id) => {
      if (!heartById(id)) return [id];
      return heart ? [heart.id] : [];
    });
};

export const defaultPlanInputs = (raid: RaidConfig, a: BestSetupAssumptions = raid.defaultAssumptions): PlanInputSettings => ({
  route: 'all',
  supplies: { ...raid.defaultSupplies },
  ringPolicy: DEFAULT_RING_POLICY,
  nonItem: raid.planDefaults.nonItemSlots,
  pinned: defaultPinnedIds(raid, a.potions.magic),
  raidMinutes: raid.typicalRaidMinutes,
  spellbook: raid.spellbook,
});

export const defaultRaidSettings = (raid: RaidConfig): RaidSettings => ({
  assumptions: raid.defaultAssumptions,
  time: { ...raid.defaultTimeSettings },
  drain: 'team',
  specMode: DEFAULT_SPEC_MODE,
  plan: defaultPlanInputs(raid),
});

export const defaultSettings = (): SavedSettings => ({
  raid: DEFAULT_RAID,
  raids: Object.fromEntries(RAIDS.map((r) => [r.id, defaultRaidSettings(r)])) as Record<RaidId, RaidSettings>,
});

/** The Assumptions box's inputs from `raw` (a stored partial or a full object), each validated; the rest are defaults. */
export const validateAssumptions = (raid: RaidConfig, raw: unknown): BestSetupAssumptions => {
  const d = raid.defaultAssumptions;
  const potions = field(raw, 'potions');
  const my = field(raw, 'mySpecs');
  const team = field(raw, 'team');
  const carriers = field(team, 'carriers');
  const lb = field(team, 'lightbearer');
  const mySpecs: MySpecs = {
    ...d.mySpecs,
    elderMaul: bool(field(my, 'elderMaul'), d.mySpecs.elderMaul),
    dwh: bool(field(my, 'dwh'), d.mySpecs.dwh),
    bgs: bool(field(my, 'bgs'), d.mySpecs.bgs),
    tonalztics: bool(field(my, 'tonalztics'), d.mySpecs.tonalztics),
    ayak: int(field(my, 'ayak'), 0, MAX_AYAK, d.mySpecs.ayak),
    lightbearer: bool(field(my, 'lightbearer'), d.mySpecs.lightbearer),
    priority: oneOf<MySpecs['priority']>(field(my, 'priority'), ['defence', 'ayak'], d.mySpecs.priority),
  };
  const teamOut: TeamSpecAssumptions = {
    carriers: Object.fromEntries(Object.entries(d.team.carriers)
      .map(([k, v]) => [k, int(field(carriers, k), 0, MAX_CARRIERS, v)])) as TeamSpecAssumptions['carriers'],
    lightbearer: Object.fromEntries(Object.entries(d.team.lightbearer)
      .map(([k, v]) => [k, bool(field(lb, k), v)])) as TeamSpecAssumptions['lightbearer'],
  };
  const manual = field(team, 'manual');
  if (typeof manual === 'boolean') teamOut.manual = manual;
  else if (d.team.manual !== undefined) teamOut.manual = d.team.manual;
  const potionOf = (g: keyof BestSetupAssumptions['potions']) => {
    const v = field(potions, g);
    return isPotion(v) ? v : d.potions[g];
  };
  let a: BestSetupAssumptions = {
    ...d,
    potions: { melee: potionOf('melee'), ranged: potionOf('ranged'), magic: potionOf('magic') },
    useZeal: bool(field(raw, 'useZeal'), d.useZeal),
    elementalFragments: bool(field(raw, 'elementalFragments'), d.elementalFragments),
    mySpecs,
    team: teamOut,
    floorThreshold: num(field(raw, 'floorThreshold'), 0.01, 1, d.floorThreshold),
  };
  const mult = field(raw, 'teamDpsMultiplier');
  if (typeof mult === 'number' && Number.isFinite(mult) && mult >= 1 && mult <= raid.partySize.max) a.teamDpsMultiplier = mult;
  // party size and the raid inputs: each scaling input reads the stored value (out of its range → its default)
  raid.scalingInputs.forEach((def) => {
    let v: number;
    try {
      v = def.get(isObj(raw) ? { ...d, ...raw } as BestSetupAssumptions : d);
    } catch {
      v = def.get(d);
    }
    const ok = typeof v === 'number' && Number.isFinite(v) && v >= def.min && v <= def.max;
    a = withScalingInput(a, def, ok ? v : def.get(d));
  });
  return a;
};

/** The time-model settings from `raw`: each of the raid's fields validated by its kind; the rest are defaults. */
export const validateTime = (raid: RaidConfig, raw: unknown): TimeSettings => {
  const out: TimeSettings = { ...raid.defaultTimeSettings };
  raid.timeSettingFields.forEach((f) => {
    const v = field(raw, f.key);
    const d = raid.defaultTimeSettings[f.key];
    if (v === undefined) return;
    if (f.kind === 'bool') out[f.key] = bool(v, d as boolean);
    else if (f.kind === 'select') out[f.key] = oneOf(v, (f.options || []).map((o) => o.value), d as string);
    else if (f.kind === 'percent') out[f.key] = num(v, 0, 1, d as number);
    else out[f.key] = num(v, 0, f.max ?? Number.MAX_SAFE_INTEGER, d as number);
  });
  return out;
};

export const validatePlanInputs = (raid: RaidConfig, raw: unknown, a: BestSetupAssumptions): PlanInputSettings => {
  const d = defaultPlanInputs(raid, a);
  const routes = ['all', ...enumerateRoutes(raid.time.routeSlots, raid.time.labels).map((r) => r.id)];
  const supplies = field(raw, 'supplies');
  const out: PlanInputSettings = {
    route: oneOf(field(raw, 'route'), routes, d.route),
    supplies: {
      ...d.supplies,
      ...Object.fromEntries(COMFORT_SUPPLY_TYPES.map((s) => [s, int(field(supplies, s), 0, MAX_SLOTS, d.supplies[s])])),
    },
    ringPolicy: oneOf(field(raw, 'ringPolicy'), RING_POLICIES.map((p) => p.id), d.ringPolicy),
    nonItem: int(field(raw, 'nonItem'), 0, MAX_SLOTS, d.nonItem),
    pinned: d.pinned,
    raidMinutes: num(field(raw, 'raidMinutes'), RAID_MINUTES_RANGE.min, RAID_MINUTES_RANGE.max, d.raidMinutes),
    spellbook: oneOf(field(raw, 'spellbook'), SPELLBOOKS.map((b) => b.id), d.spellbook),
  };
  const mages = field(raw, 'mages');
  if (Number.isInteger(mages) && (mages as number) >= 0 && (mages as number) <= raid.partySize.max) out.mages = mages as number;
  const pinned = field(raw, 'pinned');
  if (Array.isArray(pinned)) {
    out.pinned = pinned.filter((id, i) => Number.isInteger(id) && pinned.indexOf(id) === i && (!!heartById(id) || !!equipmentById(id)));
  }
  return out;
};

/** A raid's settings from its stored entry (a partial is fine; anything invalid or missing → its default). */
export const validateRaidSettings = (raid: RaidConfig, raw: unknown): RaidSettings => {
  const assumptions = validateAssumptions(raid, field(raw, 'assumptions'));
  return {
    assumptions,
    time: validateTime(raid, field(raw, 'time')),
    drain: oneOf(field(raw, 'drain'), DRAIN_STATES.map((s) => s.id), 'team'),
    specMode: oneOf(field(raw, 'specMode'), SPEC_MODES.map((m) => m.id), DEFAULT_SPEC_MODE),
    plan: validatePlanInputs(raid, field(raw, 'plan'), assumptions),
  };
};

/** Every raid's settings from the stored JSON text (null / unreadable / another version → the defaults). */
export const parseSettings = (text: string | null): SavedSettings => {
  if (!text) return defaultSettings();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return defaultSettings();
  }
  if (field(raw, 'version') !== SETTINGS_VERSION) return defaultSettings();
  const raids = field(raw, 'raids');
  return {
    raid: oneOf(field(raw, 'raid'), RAIDS.map((r) => r.id), DEFAULT_RAID),
    raids: Object.fromEntries(RAIDS.map((r) => [r.id, validateRaidSettings(r, field(raids, r.id))])) as Record<RaidId, RaidSettings>,
  };
};

// --- serialising ---------------------------------------------------------------------------------------------------

/** The parts of `value` that differ from `def` (objects compared key by key; undefined values are left out). */
const diff = (def: unknown, value: unknown): unknown => {
  if (isObj(def) && isObj(value)) {
    const out: Obj = {};
    Object.keys(value).forEach((k) => {
      if (value[k] === undefined) return;
      const x = diff(def[k], value[k]);
      if (x !== undefined) out[k] = x;
    });
    return Object.keys(out).length ? out : undefined;
  }
  return JSON.stringify(def) === JSON.stringify(value) ? undefined : value;
};

/** A raid's stored entry: only what differs from its defaults (validated first); undefined when nothing does. */
export const raidSettingsDiff = (raid: RaidConfig, s: RaidSettings): Obj | undefined => {
  const d = defaultRaidSettings(raid);
  const v = validateRaidSettings(raid, s);
  const out: Obj = {};
  const add = (k: string, x: unknown) => {
    if (x !== undefined) out[k] = x;
  };
  add('assumptions', diff(d.assumptions, v.assumptions));
  add('time', diff(d.time, v.time));
  add('drain', diff(d.drain, v.drain));
  add('specMode', diff(d.specMode, v.specMode));
  // the pinned default follows the (restored) heart
  add('plan', diff(defaultPlanInputs(raid, v.assumptions), v.plan));
  return Object.keys(out).length ? out : undefined;
};

/** The stored JSON text of these settings, or null when everything is the default (the key is then removed). */
export const serialiseSettings = (s: SavedSettings): string | null => {
  const raids: Obj = {};
  RAIDS.forEach((r) => {
    const x = s.raids[r.id] ? raidSettingsDiff(r, s.raids[r.id]) : undefined;
    if (x) raids[r.id] = x;
  });
  if (!Object.keys(raids).length && s.raid === DEFAULT_RAID) return null;
  return JSON.stringify({ version: SETTINGS_VERSION, raid: s.raid, raids });
};

// --- storage -------------------------------------------------------------------------------------------------------

/** Reads the saved settings; the defaults when missing, unreadable or blocked. */
export const loadSettings = (storage: StorageLike | null = defaultStorage()): SavedSettings => {
  try {
    return parseSettings(storage?.getItem(SETTINGS_STORAGE_KEY) ?? null);
  } catch {
    return defaultSettings();
  }
};

/** Writes the settings (removes the key when everything is the default). Storage errors are ignored. */
export const saveSettings = (s: SavedSettings, storage: StorageLike | null = defaultStorage()): void => {
  try {
    const text = serialiseSettings(s);
    if (text === null) storage?.removeItem(SETTINGS_STORAGE_KEY);
    else storage?.setItem(SETTINGS_STORAGE_KEY, text);
  } catch {
    // private window / blocked storage: the settings just aren't remembered
  }
};

/** "Reset" (Assumptions box): this raid back to its defaults, saved. */
export const resetRaidSettings = (s: SavedSettings, id: RaidId): SavedSettings => ({
  ...s, raids: { ...s.raids, [id]: defaultRaidSettings(raidConfig(id)) },
});

/** "Reset all saved settings" (the ? help): removes the key. "Items I don't own" is kept (its own key). */
export const clearSettings = (storage: StorageLike | null = defaultStorage()): void => {
  try {
    storage?.removeItem(SETTINGS_STORAGE_KEY);
  } catch {
    // ignored
  }
};
