import type { SupplyCounts } from '@/lib/fracturedArchive/planner';
import type { RaidTimeModel } from '@/lib/fracturedArchive/raidTime';
import {
  DEFAULT_RAID, RaidId, TimeSettingField, TimeSettings,
} from '@/lib/raids/types';
import { RaidBase } from '@/lib/raids/base';
import { FRACTURED_ARCHIVE_RAID } from '@/lib/raids/fracturedArchive';
import { TOMBS_OF_AMASCUT_RAID } from '@/lib/raids/tombsOfAmascut';
import { CHAMBERS_OF_XERIC_RAID } from '@/lib/raids/chambersOfXeric';

export * from '@/lib/raids/types';
export {
  raidBase, teamDpsMultiplier, teamTimeLabel, withScalingInput,
} from '@/lib/raids/base';
export type { RaidBase } from '@/lib/raids/base';

/**
 * Phase 18: per-raid configuration. Search / Plan / Routes (Encounters) / Summary are raid-independent code driven by
 * one of these (the raid is `assumptions.raid`; undefined = the Fractured Archive). Tabs at the top of /best-setup
 * list `RAIDS` in order (phase 19: + Chambers of Xeric; ToB comes later).
 *
 * `RaidBase` (src/lib/raids/base.ts) holds what the pure modules need: targets, party-size range, monster inputs,
 * scaling inputs (each with its own get / set), default assumptions, presets, search pool, whether boss hp scales with
 * party size (default team-DPS multiplier) and whether potion boosts need inventory supplies. On top of it:
 * - `time`, `defaultTimeSettings`, `timeSettingFields`, `timeModelNote`: the encounter damage model (FA: 8 routes; ToA:
 *   one fixed route), its own settings object and how the settings box shows it.
 * - `defaultSupplies`, `planNote`: Plan-tab defaults.
 * - `routesLabel`, `encounterTarget`, `hpNote`, `raidOnlyAssumptions`: UI.
 * Drain floors, weaknesses and immunities come from upstream (`getDefenceFloor`, monsters.json, `isImmune`) plus the
 * raid's own hooks (FA: src/lib/fracturedArchive/*; ToA: src/lib/raids/toa/prayers.ts).
 */
export interface RaidConfig extends RaidBase {
  name: string;
  shortName: string;
  /** Show the Fractured Archive-only assumptions (Zeal, elemental fragments). */
  raidOnlyAssumptions: boolean;
  /** Phase 19: the assumptions box's line about where the presets come from (default: the Fractured Archive's). */
  presetsNote?: string;
  time: RaidTimeModel;
  defaultTimeSettings: TimeSettings;
  timeSettingFields: TimeSettingField[];
  /** First paragraph of the time-model settings box. */
  timeModelNote: string;
  /** Title of the routes tab ("Routes" / "Encounters" when the raid has one fixed route). */
  routesLabel: string;
  /** Target whose icon stands for each encounter. */
  encounterTarget: Record<string, string>;
  /** Footer note about hp / TTK. */
  hpNote: string;
  defaultSupplies: SupplyCounts;
  /** Extra line in the Plan tab's assumptions. */
  planNote?: string;
}

export { CHAMBERS_OF_XERIC_RAID, FRACTURED_ARCHIVE_RAID, TOMBS_OF_AMASCUT_RAID };

export const RAIDS: RaidConfig[] = [FRACTURED_ARCHIVE_RAID, TOMBS_OF_AMASCUT_RAID, CHAMBERS_OF_XERIC_RAID];

export const raidConfig = (id: RaidId | undefined): RaidConfig => RAIDS.find((r) => r.id === (id ?? DEFAULT_RAID)) ?? FRACTURED_ARCHIVE_RAID;

/** The raid of an assumptions object (undefined = the Fractured Archive). */
export const raidOf = (a: { raid?: RaidId }): RaidConfig => raidConfig(a.raid);
