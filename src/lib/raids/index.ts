import type { BestSetupAssumptions, PresetDef, StyleGroup } from '@/lib/fracturedArchive/presets';
import type { StylePool } from '@/lib/fracturedArchive/searchCandidates';
import type { RaidTimeModel, RaidTimeSettings } from '@/lib/fracturedArchive/raidTime';
import {
  BestSetupTarget, DEFAULT_RAID, DEFAULT_TOA_INPUTS, RaidId, ScalingInputDef, ToaPath,
} from '@/lib/raids/types';
import { FRACTURED_ARCHIVE_RAID } from '@/lib/raids/fracturedArchive';
import { TOMBS_OF_AMASCUT_RAID } from '@/lib/raids/tombsOfAmascut';

export * from '@/lib/raids/types';

/**
 * Phase 18: per-raid configuration. Search / Plan / Routes (Encounters) / Summary are raid-independent code driven by
 * one of these (the raid is `assumptions.raid`; undefined = the Fractured Archive). Tabs at the top of /best-setup
 * list `RAIDS` in order (CoX and ToB come in later phases).
 *
 * - `targets`: the bosses / phases (monster name + version in monsters.json, phase options, path for ToA).
 * - `scalingInputs`: the assumptions box's raid inputs with defaults (ToA: party size, raid level, 4 path levels).
 * - `defaultAssumptions`: potions / prayers / spec carriers / raid inputs (ToA: Smelling salts, raid level 500).
 * - `presets`, `searchPool`: what the Search, Plan and Routes tabs evaluate (ToA: the FA lists + ToA weapons).
 * - `time`: the encounter damage model (FA: 8 routes; ToA: one fixed route) and its default settings.
 * - Drain floors, weaknesses and immunities come from upstream (`getDefenceFloor`, monsters.json, `isImmune`) plus the
 *   raid's own hooks (FA: src/lib/fracturedArchive/*; ToA: src/lib/raids/toa/prayers.ts).
 */
export interface RaidConfig {
  id: RaidId;
  name: string;
  shortName: string;
  targets: BestSetupTarget[];
  scalingInputs: ScalingInputDef[];
  partySize: { min: number, max: number };
  /** Show the Fractured Archive-only assumptions (Zeal, elemental fragments). */
  raidOnlyAssumptions: boolean;
  defaultAssumptions: BestSetupAssumptions;
  presets: PresetDef[];
  searchPool: Record<StyleGroup, StylePool>;
  time: RaidTimeModel;
  defaultTimeSettings: RaidTimeSettings;
  /** Title of the routes tab ("Routes" / "Encounters" when the raid has one fixed route). */
  routesLabel: string;
  /** Target whose icon stands for each encounter. */
  encounterTarget: Record<string, string>;
  /** Footer note about hp / TTK. */
  hpNote: string;
}

export { FRACTURED_ARCHIVE_RAID, TOMBS_OF_AMASCUT_RAID };

export const RAIDS: RaidConfig[] = [FRACTURED_ARCHIVE_RAID, TOMBS_OF_AMASCUT_RAID];

export const raidConfig = (id: RaidId | undefined): RaidConfig => RAIDS.find((r) => r.id === (id ?? DEFAULT_RAID)) ?? FRACTURED_ARCHIVE_RAID;

/** The raid of an assumptions object (undefined = the Fractured Archive). */
export const raidOf = (a: Pick<BestSetupAssumptions, 'raid'>): RaidConfig => raidConfig(a.raid);

/** Current value of a scaling input (`partySize`, `toaInvocationLevel`, `toaPath.<path>`). */
export const scalingInputValue = (a: BestSetupAssumptions, key: string): number => {
  if (key === 'partySize') return a.partySize;
  const toa = a.toa || DEFAULT_TOA_INPUTS;
  if (key === 'toaInvocationLevel') return toa.invocationLevel;
  if (key.startsWith('toaPath.')) return toa.pathLevels[key.slice(8) as ToaPath] ?? 0;
  throw new Error(`Unknown scaling input '${key}'`);
};

/** Sets a scaling input (clamped to its definition). */
export const withScalingInput = (a: BestSetupAssumptions, def: ScalingInputDef, value: number): BestSetupAssumptions => {
  const v = Math.min(def.max, Math.max(def.min, Math.trunc(Number.isFinite(value) ? value : def.default)));
  if (def.key === 'partySize') return { ...a, partySize: v };
  const toa = a.toa || DEFAULT_TOA_INPUTS;
  if (def.key === 'toaInvocationLevel') return { ...a, toa: { ...toa, invocationLevel: v } };
  if (def.key.startsWith('toaPath.')) {
    return { ...a, toa: { ...toa, pathLevels: { ...toa.pathLevels, [def.key.slice(8)]: v } } };
  }
  throw new Error(`Unknown scaling input '${def.key}'`);
};
