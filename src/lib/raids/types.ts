import type { BestSetupAssumptions } from '@/lib/fracturedArchive/presets';

/**
 * Phase 18: shared raid types. Data-only (only type imports) so that bestSetup.ts, presets.ts and the per-raid data
 * files can all import it without import cycles. The per-raid rules the pure modules need are in
 * `src/lib/raids/base.ts`; the full `RaidConfig` (time model, UI) is in `src/lib/raids/index.ts`.
 */

export type RaidId = 'fractured-archive' | 'toa';

export const DEFAULT_RAID: RaidId = 'fractured-archive';

/** ToA path (= the path's boss) for the path-level inputs. */
export type ToaPath = 'akkha' | 'baba' | 'kephri' | 'zebak';

export const TOA_PATHS: { id: ToaPath, label: string }[] = [
  { id: 'akkha', label: 'Het (Akkha)' },
  { id: 'baba', label: 'Apmeken (Ba-Ba)' },
  { id: 'kephri', label: 'Scabaras (Kephri)' },
  { id: 'zebak', label: 'Crondis (Zebak)' },
];

/** ToA scaling inputs of the best-setup assumptions (raid level and path levels; party size is shared). */
export interface ToaInputs {
  /** Raid (invocation) level, 0-600; upstream scales hp and the NPC defence roll with it. */
  invocationLevel: number;
  /** Path level per path, 0-6; upstream scales the path bosses' hp with it. */
  pathLevels: Record<ToaPath, number>;
}

export const DEFAULT_TOA_INPUTS: ToaInputs = {
  invocationLevel: 500,
  pathLevels: {
    akkha: 0, baba: 0, kephri: 0, zebak: 0,
  },
};

/** A boss / phase the best-setup view can target (Search boss list, Summary rows, time-model phases). */
export interface BestSetupTarget {
  key: string;
  label: string;
  name: string;
  version: string;
  /** Raid the target belongs to (default: the Fractured Archive). */
  raid?: RaidId;
  /** ToA: the path whose path level scales this target's hp (upstream only scales the path monsters). */
  toaPath?: ToaPath;
  /** Phase dropdown options (MONSTER_PHASES_BY_ID); the first one is the default. */
  phases?: string[];
  /** Phase options that get their own row in the Summary table. */
  summaryPhases?: string[];
  /** Not shown as its own Summary row (still searchable and used by the time model). */
  noSummary?: boolean;
  /** Expected TTK isn't meaningful (Ocellus P2: the Blade phase is timed, damage transfers 50% to P3). */
  ttkNotApplicable?: boolean;
  note?: string;
}

/** One scaling input shown in the assumptions box of a raid tab; it reads and writes its own assumption field. */
export interface ScalingInputDef {
  key: string;
  label: string;
  min: number;
  max: number;
  step?: number;
  default: number;
  title?: string;
  get: (a: BestSetupAssumptions) => number;
  /** Sets the (already clamped) value. */
  set: (a: BestSetupAssumptions, value: number) => BestSetupAssumptions;
}

/** A time model's settings (each model has its own object; FA: RaidTimeSettings, ToA: ToaTimeSettings). */
export type TimeSettings = Record<string, number | boolean | string>;

/** One field of a time model's settings box (Routes / Encounters tab). */
export interface TimeSettingField {
  key: string;
  label: string;
  /** number (with `unit`), percent (stored as a fraction), bool (checkbox), select (`options`). */
  kind: 'number' | 'percent' | 'bool' | 'select';
  unit?: string;
  title: string;
  max?: number;
  options?: { value: string, label: string }[];
}

/** Tombs of Amascut time-model settings (src/lib/raids/toa/time.ts, Encounters tab). */
export type ToaTimeSettings = {
  /** The warden fought in Wardens P2 (the other one is P3). Strategies: Elidinis' is the usual choice. */
  p2Warden: 'elidinis' | 'tumeken';
  /**
   * Akkha prays against the style he attacks with and rotates on a fixed attack count: true = equal *time* under
   * Praying Melee / Ranged / Magic (his hp split in proportion to the kit's best DPS under each); false = always
   * attacked with an unprotected style.
   */
  akkhaPrayerRotation: boolean;
  /** Extra Kephri shield per intermission from leaked swarms, as a fraction of one shield (0-1; Strategies: ~10%/swarm). */
  kephriSwarmLeak: number;
  /** Kill the overlord scarabs (Spitting in intermission 1, Soldier + Arcane in intermission 2). */
  kephriOverlords: boolean;
  /** Share of the P3 Warden's hp taken off by reversed energy siphons (unpublished; 0 = not counted). */
  p3SiphonFraction: number;
};
