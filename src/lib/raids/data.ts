import { BEST_SETUP_TARGETS, BestSetupTarget } from '@/lib/fracturedArchive/bestSetup';
import { PRESETS, PresetDef, StyleGroup } from '@/lib/fracturedArchive/presets';
import { SEARCH_POOL, StylePool } from '@/lib/fracturedArchive/searchCandidates';
import { RaidId } from '@/lib/raids/types';
import { TOA_TARGETS } from '@/lib/raids/toa/targets';
import { TOA_PRESETS } from '@/lib/raids/toa/presets';
import { TOA_SEARCH_POOL } from '@/lib/raids/toa/searchPool';

/**
 * Phase 18: the per-raid data the pure best-setup modules (search.ts, raidTime.ts, planner.ts) pick by
 * `assumptions.raid` (undefined = the Fractured Archive, so every phase 8-17 caller is unchanged). The full raid
 * configs (with the time models and UI inputs) are in src/lib/raids/index.ts.
 */
export const raidTargets = (raid?: RaidId): BestSetupTarget[] => (raid === 'toa' ? TOA_TARGETS : BEST_SETUP_TARGETS);

export const raidPresets = (raid?: RaidId): PresetDef[] => (raid === 'toa' ? TOA_PRESETS : PRESETS);

export const raidSearchPool = (raid?: RaidId): Record<StyleGroup, StylePool> => (raid === 'toa' ? TOA_SEARCH_POOL : SEARCH_POOL);
