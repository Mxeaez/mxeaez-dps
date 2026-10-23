import type { Monster } from '@/types/Monster';
import {
  BestSetupAssumptions, DEFAULT_ASSUMPTIONS, PRESETS, PresetDef, StyleGroup,
} from '@/lib/fracturedArchive/presets';
import { SEARCH_POOL, StylePool } from '@/lib/fracturedArchive/searchCandidates';
import { BEST_SETUP_TARGETS } from '@/lib/fracturedArchive/targets';
import {
  BestSetupTarget, DEFAULT_RAID, DEFAULT_TOA_INPUTS, RaidId, ScalingInputDef, TOA_PATHS,
} from '@/lib/raids/types';
import { TOA_TARGETS } from '@/lib/raids/toa/targets';
import { TOA_DEFAULT_ASSUMPTIONS, TOA_PRESETS } from '@/lib/raids/toa/presets';
import { TOA_SEARCH_POOL } from '@/lib/raids/toa/searchPool';

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
   * Plan tab: a style's potion boost needs its potion among the inventory supplies (FA). false: the boost comes from the
   * raid itself (ToA: Smelling salts from the supply chest), every style keeps it.
   */
  boostsNeedSupplies: boolean;
}

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
  partySize: { min: 2, max: 8 },
  // the party-size hp table is an identity table today (UNVERIFIED C1)
  hpScalesWithParty: false,
  monsterInputs: () => ({}),
  scalingInputs: [partyInput(2, 8, 'Team spec planner party size; also the HP scaling party size (identity table, unverified)')],
  defaultAssumptions: DEFAULT_ASSUMPTIONS,
  presets: PRESETS,
  searchPool: SEARCH_POOL,
  boostsNeedSupplies: true,
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
};

export const RAID_BASES: RaidBase[] = [FRACTURED_ARCHIVE_BASE, TOMBS_OF_AMASCUT_BASE];

export const raidBase = (id: RaidId | undefined): RaidBase => RAID_BASES.find((r) => r.id === (id ?? DEFAULT_RAID)) ?? FRACTURED_ARCHIVE_BASE;

/** Every raid's targets (keys are unique across raids). */
export const ALL_RAID_TARGETS: BestSetupTarget[] = RAID_BASES.flatMap((r) => r.targets);

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
