import type { Monster } from '@/types/Monster';
import {
  BestSetupAssumptions, DEFAULT_ASSUMPTIONS, PRESETS, PresetDef, StyleGroup,
} from '@/lib/fracturedArchive/presets';
import { SEARCH_POOL, StylePool } from '@/lib/fracturedArchive/searchCandidates';
import { BEST_SETUP_TARGETS } from '@/lib/fracturedArchive/targets';
import { FA_TRAVEL_MINUTES, faRoomSecondsFor } from '@/lib/fracturedArchive/roomTimes';
import {
  BestSetupTarget, DEFAULT_COX_INPUTS, DEFAULT_RAID, DEFAULT_TOA_INPUTS, DEFAULT_TOB_INPUTS, RaidId, ScalingInputDef,
  Spellbook, TOA_PATHS, TOB_MODES,
} from '@/lib/raids/types';
import { TOA_TARGETS } from '@/lib/raids/toa/targets';
import { TOA_DEFAULT_ASSUMPTIONS, TOA_PRESETS } from '@/lib/raids/toa/presets';
import { TOA_SEARCH_POOL } from '@/lib/raids/toa/searchPool';
import { COX_TARGETS } from '@/lib/raids/cox/targets';
import { COX_DEFAULT_ASSUMPTIONS, COX_PRESETS } from '@/lib/raids/cox/presets';
import { COX_SEARCH_POOL } from '@/lib/raids/cox/searchPool';
import {
  COX_MAX_COMBAT_LEVEL, COX_MAX_HP_LEVEL, COX_MAX_PARTY, COX_MIN_PARTY, COX_MINING_LEVEL,
} from '@/lib/raids/cox/constants';
import { TOB_TARGETS, TOB_VERSIONS } from '@/lib/raids/tob/targets';
import { TOB_DEFAULT_ASSUMPTIONS, TOB_PRESETS } from '@/lib/raids/tob/presets';
import { TOB_SEARCH_POOL } from '@/lib/raids/tob/searchPool';
import { TOB_MAX_PARTY, TOB_MIN_PARTY } from '@/lib/raids/tob/constants';
import {
  COX_PLAN_DEFAULTS, FA_PLAN_DEFAULTS, RaidPlanDefaults, TOA_PLAN_DEFAULTS, TOB_PLAN_DEFAULTS,
} from '@/lib/raids/planDefaults';

/**
 * Phase 18: the per-raid rules the pure best-setup modules need (bestSetup.ts, search.ts, raidTime.ts, planner.ts look
 * them up here by `assumptions.raid` / `target.raid`, so shared code has no raid branches). Data only — no import of
 * those modules (no cycles). `RaidConfig` (src/lib/raids/index.ts) extends this with the time model and the UI bits.
 */
export interface RaidBase {
  id: RaidId;
  targets: BestSetupTarget[];
  /** Party size range of the calculator's scaling input for this raid's monsters. */
  partySize: { min: number, max: number };
  /** Boss hp scales with party size (then the default team-DPS multiplier is the party size; else 1). */
  hpScalesWithParty: boolean;
  /** Extra calculator monster inputs for a target (ToA: raid level, path level). */
  monsterInputs: (target: BestSetupTarget, a: BestSetupAssumptions) => Partial<Monster['inputs']>;
  /** The assumptions box's raid inputs (party size first). */
  scalingInputs: ScalingInputDef[];
  defaultAssumptions: BestSetupAssumptions;
  presets: PresetDef[];
  searchPool: Record<StyleGroup, StylePool>;
  /**
   * Plan tab: a style's potion boost needs its potion among the inventory supplies (FA, ToB; magic: a pinned heart).
   * false: the boost is the raid's own potion (ToA Smelling salts, CoX Overload: the "Other" supply), every style keeps
   * it while Other > 0.
   */
  boostsNeedSupplies: boolean;
  /**
   * Phase 20: the monster version a target uses for these assumptions (ToB: one monster per mode). Undefined = the
   * target's own name / version. Applied by buildTargetMonster.
   */
  resolveTarget?: (target: BestSetupTarget, a: BestSetupAssumptions) => BestSetupTarget;
  /**
   * Phase 21: Plan-tab defaults (items always brought, rune pouch / non-item slots, supplies) and the raid-supplied
   * items the planner gives 0 inventory slots (src/lib/raids/planDefaults.ts).
   */
  planDefaults: RaidPlanDefaults;
  /**
   * Phase 21: whether a target is offered in the Search boss list for these assumptions (ToB: the Nylocas Prinkipas
   * only in Hard Mode). Undefined = always. Summary rows and the time model don't use it.
   */
  targetVisible?: (target: BestSetupTarget, a: BestSetupAssumptions) => boolean;
  /**
   * Phase 38a: the typical raid length in minutes (default of the Plan tab's "Typical raid length", Advanced (plan)):
   * the raid's wall clock, into which the time model spreads its fight time (raidTime.ts `raidClock`). Sources:
   * `RAID_LENGTH_SOURCES` (unverified, UNVERIFIED D30).
   */
  typicalRaidMinutes: number;
  /**
   * Phase 38c: the raid's non-fight time in minutes (default of the Plan tab's "Non-fight time"): the typical length
   * minus the Team headline's fight wall time at the default party size, so the clock is fight wall + this (a solo raid's
   * longer fight lengthens the raid instead of squeezing the travel; UNVERIFIED D30).
   */
  nonFightMinutes: number;
  /**
   * Phase 38j: measured room seconds per encounter for a party size (the FA: the user's raid stats, roomTimes.ts). When
   * set, each encounter lasts at least its room time on the spec budget's clock and `nonFightMinutes` is the travel time
   * between the rooms, spread evenly (UNVERIFIED D36); undefined = the phase 38c clock (fight wall + non-fight time).
   */
  roomSeconds?: (partySize: number) => Record<string, number>;
  /** Phase 38a (ToB): the surge cooldown pauses between encounters (only fight time counts for it). */
  surgePausesBetweenEncounters?: boolean;
  /**
   * Phase 38b: the default spellbook of the Plan tab's "Spellbook" input (Advanced (plan)): Arceuus for every raid
   * (Death Charge in the spec budget). `SPELLBOOK_NOTES` says what it costs.
   */
  spellbook: Spellbook;
}

/** Phase 38b: what the Arceuus default leaves out per raid (shown with the input; not modelled). */
export const SPELLBOOK_NOTES: Record<RaidId, string> = {
  'fractured-archive': 'the Xarth freezer (Plan: Required variants) Ice Barrages from the Ancient spellbook: no Death Charge for that player (not modelled)',
  toa: 'no freezes needed',
  cox: 'no freezes needed',
  tob: 'Maiden needs one freezer on the Ancient spellbook (no Death Charge for that player)',
};

/**
 * Phase 38a: where each raid's default typical length comes from (docs/DATA_SOURCES.md *Phase 38a*). The wiki publishes
 * no "typical" time, only time limits and speed tasks, so the ToA / CoX / ToB defaults sit above the speed tasks.
 */
export const RAID_LENGTH_SOURCES: Record<RaidId, string> = {
  'fractured-archive': 'the user\'s in-game raid stats (docs/calibration/fa-times-2026-10-25.md): personal bests 24:50 (3 players), 25:38 (4), 22:01 (5), 24:32 (6)',
  toa: 'wiki Tombs of Amascut: time-limit invocations 40 / 35 / 30 / 25 min (30 = Run for It); Tombs Speed Runner II: expert within 20 min (Grandmaster)',
  cox: 'wiki Chambers of Xeric (5-Scale) Speed-Chaser: under 15:00 (Master); (Trio) Speed-Chaser: under 16:30. A typical team is slower',
  tob: 'wiki Theatre (4-Scale) Speed-Chaser: under 17 min (Master); (5-Scale): under 16 min. A typical team is slower',
};

const partyInput = (min: number, max: number, title: string): ScalingInputDef => ({
  key: 'partySize',
  label: 'party size',
  min,
  max,
  default: 6,
  title,
  get: (a) => a.partySize,
  set: (a, v) => ({ ...a, partySize: v }),
});

const toaOf = (a: BestSetupAssumptions) => a.toa || DEFAULT_TOA_INPUTS;

export const FRACTURED_ARCHIVE_BASE: RaidBase = {
  id: 'fractured-archive',
  targets: BEST_SETUP_TARGETS,
  // phase 29: 1 = solo (launch guides: "2–8 players, solo = 2-scale"; the hp table clamps to 2): Solo drains in the Plan
  partySize: { min: 1, max: 8 },
  // the party-size hp table is an identity table today (UNVERIFIED C1)
  hpScalesWithParty: false,
  monsterInputs: () => ({}),
  scalingInputs: [partyInput(1, 8, 'Team spec planner party size (1 = solo: Solo drains); also the HP scaling party size (identity table, unverified; solo scales as 2)')],
  defaultAssumptions: DEFAULT_ASSUMPTIONS,
  presets: PRESETS,
  searchPool: SEARCH_POOL,
  boostsNeedSupplies: true,
  planDefaults: FA_PLAN_DEFAULTS,
  typicalRaidMinutes: 25,
  // phase 38j: the travel between the measured rooms (roomTimes.ts FA_TRAVEL_MINUTES; was 38c's 21.5 min of non-fight
  // time spread in proportion to the fight)
  nonFightMinutes: FA_TRAVEL_MINUTES,
  roomSeconds: faRoomSecondsFor,
  spellbook: 'arceuus',
};

export const TOMBS_OF_AMASCUT_BASE: RaidBase = {
  id: 'toa',
  targets: TOA_TARGETS,
  partySize: { min: 1, max: 8 },
  hpScalesWithParty: true,
  // the calculator's own ToA inputs; upstream scales hp and the defence roll from them
  monsterInputs: (target, a) => ({
    toaInvocationLevel: Math.max(0, Math.trunc(toaOf(a).invocationLevel)),
    toaPathLevel: target.toaPath ? Math.min(6, Math.max(0, Math.trunc(toaOf(a).pathLevels[target.toaPath] ?? 0))) : 0,
  }),
  scalingInputs: [
    partyInput(1, 8, 'Party size: hp scaling (upstream, verified) and the team spec planner'),
    {
      key: 'toaInvocationLevel',
      label: 'raid level',
      min: 0,
      max: 600,
      step: 5,
      default: DEFAULT_TOA_INPUTS.invocationLevel,
      title: 'Invocation (raid) level: +4% hp per 10 levels (core: +1%), NPC defence roll × (250 + level) / 250 (upstream)',
      get: (a) => toaOf(a).invocationLevel,
      set: (a, v) => ({ ...a, toa: { ...toaOf(a), invocationLevel: v } }),
    },
    ...TOA_PATHS.map((p): ScalingInputDef => ({
      key: `toaPath-${p.id}`,
      label: `${p.label} path`,
      min: 0,
      max: 6,
      default: DEFAULT_TOA_INPUTS.pathLevels[p.id],
      title: 'Path level: +8% hp at level 1, +5% per further level (path bosses and their adds; upstream)',
      get: (a) => toaOf(a).pathLevels[p.id],
      set: (a, v) => ({ ...a, toa: { ...toaOf(a), pathLevels: { ...toaOf(a).pathLevels, [p.id]: v } } }),
    })),
  ],
  defaultAssumptions: TOA_DEFAULT_ASSUMPTIONS,
  presets: TOA_PRESETS,
  searchPool: TOA_SEARCH_POOL,
  boostsNeedSupplies: false,
  planDefaults: TOA_PLAN_DEFAULTS,
  // phase 38a: the copies of the rooms before the supplies are the time model's, not the Search list's
  targetVisible: (target) => !target.beforeSupplies,
  typicalRaidMinutes: 30,
  // 30 min − the ToA headline's 870.1 s of fight wall (phase 38b) = 15.50
  nonFightMinutes: 15.5,
  spellbook: 'arceuus',
};

const coxOf = (a: BestSetupAssumptions) => a.cox || DEFAULT_COX_INPUTS;

/**
 * Phase 19: Chambers of Xeric. Upstream scales every "xerician" monster from the calculator's CoX inputs
 * (src/lib/scaling/ChambersOfXeric.ts): party size (hp, offence and Defence), the party's best combat / hitpoints levels
 * (all 99s here: 126 / 99, no reduction), the party's total Mining level (Guardians' hp; 99 × party size) and Challenge
 * Mode (`isFromCoxCm`).
 */
export const CHAMBERS_OF_XERIC_BASE: RaidBase = {
  id: 'cox',
  targets: COX_TARGETS,
  partySize: { min: COX_MIN_PARTY, max: COX_MAX_PARTY },
  hpScalesWithParty: true,
  monsterInputs: (_target, a) => {
    const party = Math.min(COX_MAX_PARTY, Math.max(COX_MIN_PARTY, Math.trunc(a.partySize)));
    return {
      isFromCoxCm: !!coxOf(a).challengeMode,
      partyMaxCombatLevel: COX_MAX_COMBAT_LEVEL,
      partyMaxHpLevel: COX_MAX_HP_LEVEL,
      partySumMiningLevel: COX_MINING_LEVEL * party,
    };
  },
  scalingInputs: [
    partyInput(COX_MIN_PARTY, COX_MAX_PARTY, 'Party size: hp and Defence scaling (upstream, verified), Mystic / shaman counts, Olm phases (+1 per 8 players) and the team spec planner. CoX allows 1-100; this tab stops at 15'),
    {
      key: 'coxChallengeMode',
      label: 'Challenge Mode',
      kind: 'bool',
      min: 0,
      max: 1,
      default: 0,
      title: 'Challenge Mode: +50% combat stats and hp (Olm keeps its hp; Tekton Defence +20% below 4 players, +35% from 4; Glowing crystal unchanged) (upstream)',
      get: (a) => (coxOf(a).challengeMode ? 1 : 0),
      set: (a, v) => ({ ...a, cox: { ...coxOf(a), challengeMode: v > 0 } }),
    },
  ],
  defaultAssumptions: COX_DEFAULT_ASSUMPTIONS,
  presets: COX_PRESETS,
  searchPool: COX_SEARCH_POOL,
  // Overloads come from the raid's own herbs
  boostsNeedSupplies: false,
  planDefaults: COX_PLAN_DEFAULTS,
  typicalRaidMinutes: 20,
  // 20 min − the CoX headline's 426.9 s of fight wall = 12.89
  nonFightMinutes: 12.9,
  spellbook: 'arceuus',
};

const tobOf = (a: BestSetupAssumptions) => a.tob || DEFAULT_TOB_INPUTS;

/**
 * Phase 20: Theatre of Blood. Upstream scales ToB monsters' hp (only hp: "tob only scales hp and nothing else") from
 * the calculator's party size (src/lib/scaling/TheatreOfBlood.ts: normal / Hard Mode (party 3-5) / 8, i.e. 75% at 1-3,
 * 87.5% at 4, 100% at 5; Entry Mode 10-40 / 40 for 1-5). The mode is a monster version, not a calculator input, so this
 * raid swaps the target's version (`resolveTarget`, TOB_VERSIONS).
 */
export const THEATRE_OF_BLOOD_BASE: RaidBase = {
  id: 'tob',
  targets: TOB_TARGETS,
  partySize: { min: TOB_MIN_PARTY, max: TOB_MAX_PARTY },
  hpScalesWithParty: true,
  monsterInputs: () => ({}),
  scalingInputs: [
    {
      ...partyInput(TOB_MIN_PARTY, TOB_MAX_PARTY, 'Party size 1-5: hp scaling (75% at 1-3, 87.5% at 4, 100% at 5; Entry Mode 25-100%; upstream, wiki) and the team spec planner'),
      default: TOB_DEFAULT_ASSUMPTIONS.partySize,
    },
    {
      key: 'tobMode',
      label: 'mode',
      kind: 'select',
      min: 0,
      max: TOB_MODES.length - 1,
      default: 0,
      options: TOB_MODES.map((m, i) => ({ value: i, label: m.label })),
      title: 'Normal / Hard Mode / Entry Mode: each mode has its own monsters (Hard Mode: Bloat 2400 hp, Xarpus 6000 hp and Defence 200, three Nylocas Prinkipas, Verzik heals 30% at 5%)',
      get: (a) => Math.max(0, TOB_MODES.findIndex((m) => m.id === tobOf(a).mode)),
      set: (a, v) => ({ ...a, tob: { ...tobOf(a), mode: (TOB_MODES[v] ?? TOB_MODES[0]).id } }),
    },
  ],
  defaultAssumptions: TOB_DEFAULT_ASSUMPTIONS,
  presets: TOB_PRESETS,
  searchPool: TOB_SEARCH_POOL,
  // ToB has no raid boost: the potions are brought
  boostsNeedSupplies: true,
  resolveTarget: (target, a) => {
    const version = TOB_VERSIONS[target.key]?.[tobOf(a).mode];
    return version && version !== target.version ? { ...target, version } : target;
  },
  planDefaults: TOB_PLAN_DEFAULTS,
  // targets tagged with modes (Hard Mode's Nylocas Prinkipas) are only offered in those modes
  targetVisible: (target, a) => !target.tobModes || target.tobModes.includes(tobOf(a).mode),
  typicalRaidMinutes: 20,
  // 20 min − the ToB headline's 443.4 s of fight wall = 12.61 (its surge clock is fight time only)
  nonFightMinutes: 12.6,
  // phase 36: the surge cooldown pauses between ToB rooms
  surgePausesBetweenEncounters: true,
  spellbook: 'arceuus',
};

export const RAID_BASES: RaidBase[] = [FRACTURED_ARCHIVE_BASE, TOMBS_OF_AMASCUT_BASE, CHAMBERS_OF_XERIC_BASE, THEATRE_OF_BLOOD_BASE];

export const raidBase = (id: RaidId | undefined): RaidBase => RAID_BASES.find((r) => r.id === (id ?? DEFAULT_RAID)) ?? FRACTURED_ARCHIVE_BASE;

/** Phase 38b: the spellbook of these assumptions (default: the raid's). */
export const spellbookOf = (a: Pick<BestSetupAssumptions, 'spellbook' | 'raid'>): Spellbook => a.spellbook ?? raidBase(a.raid).spellbook;

/** Every raid's targets (keys are unique across raids). */
export const ALL_RAID_TARGETS: BestSetupTarget[] = RAID_BASES.flatMap((r) => r.targets);

/** The targets the Search boss list offers for these assumptions (`targetVisible`; default all). */
export const visibleTargets = (base: RaidBase, a: BestSetupAssumptions): BestSetupTarget[] => (base.targetVisible
  ? base.targets.filter((t) => base.targetVisible!(t, a))
  : base.targets);

/** Sets a scaling input, clamped to its range (non-numbers → its default). */
export const withScalingInput = (a: BestSetupAssumptions, def: ScalingInputDef, value: number): BestSetupAssumptions => def
  .set(a, Math.min(def.max, Math.max(def.min, Math.trunc(Number.isFinite(value) ? value : def.default))));

/**
 * Team-DPS multiplier of the time displays (Search TTK, Routes / Encounters, Plan, Summary): times assume this many
 * players dealing the user's DPS. Default: the party size where boss hp scales with it (ToA), else 1 (FA: identity hp
 * table). `assumptions.teamDpsMultiplier` overrides it.
 */
export const teamDpsMultiplier = (a: BestSetupAssumptions): number => {
  if (a.teamDpsMultiplier !== undefined && a.teamDpsMultiplier > 0) return a.teamDpsMultiplier;
  return raidBase(a.raid).hpScalesWithParty ? Math.max(1, Math.trunc(a.partySize)) : 1;
};

/** "times assume 6 players at your DPS" / "your DPS alone". */
export const teamTimeLabel = (n: number): string => (n === 1 ? 'times: your DPS alone' : `times assume ${n} players at your DPS`);
