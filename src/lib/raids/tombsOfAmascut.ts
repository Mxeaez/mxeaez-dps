import { TOA_TARGETS } from '@/lib/raids/toa/targets';
import { TOA_DEFAULT_ASSUMPTIONS, TOA_PRESETS } from '@/lib/raids/toa/presets';
import { TOA_SEARCH_POOL } from '@/lib/raids/toa/searchPool';
import { TOA_ENCOUNTER_TARGET, TOA_RAID_TIME_DEFAULTS, TOA_TIME_MODEL } from '@/lib/raids/toa/time';
import { DEFAULT_TOA_INPUTS, TOA_PATHS } from '@/lib/raids/types';
import type { RaidConfig } from '@/lib/raids/index';

/**
 * Phase 18: Tombs of Amascut. Monsters, hp scaling (raid level, path level, party size), the defence-roll scaling,
 * Defence floors (`getDefenceFloor`: Akkha 70, Ba-Ba 60, Kephri 60, Zebak 50, Obelisk 60, P3 Warden 120), weaknesses
 * (monsters.json) and the ToA item effects (Tumeken's shadow ×4, fang, kerises, P2 Warden damage) are upstream's;
 * this config adds the targets, presets, pool, prayers (src/lib/raids/toa/prayers.ts) and the time model.
 */
// eslint-disable-next-line import/prefer-default-export
export const TOMBS_OF_AMASCUT_RAID: RaidConfig = {
  id: 'toa',
  name: 'Tombs of Amascut',
  shortName: 'Tombs of Amascut',
  targets: TOA_TARGETS,
  scalingInputs: [
    {
      key: 'partySize', label: 'party size', min: 1, max: 8, default: 6, title: 'Party size: hp scaling (upstream, verified) and the team spec planner',
    },
    {
      key: 'toaInvocationLevel',
      label: 'raid level',
      min: 0,
      max: 600,
      step: 5,
      default: DEFAULT_TOA_INPUTS.invocationLevel,
      title: 'Invocation (raid) level: +4% hp per 10 levels (core: +1%), NPC defence roll × (250 + level) / 250 (upstream)',
    },
    ...TOA_PATHS.map((p) => ({
      key: `toaPath.${p.id}`,
      label: `${p.label} path`,
      min: 0,
      max: 6,
      default: DEFAULT_TOA_INPUTS.pathLevels[p.id],
      title: 'Path level: +8% hp at level 1, +5% per further level (path bosses and their adds; upstream)',
    })),
  ],
  partySize: { min: 1, max: 8 },
  raidOnlyAssumptions: false,
  defaultAssumptions: TOA_DEFAULT_ASSUMPTIONS,
  presets: TOA_PRESETS,
  searchPool: TOA_SEARCH_POOL,
  time: TOA_TIME_MODEL,
  defaultTimeSettings: TOA_RAID_TIME_DEFAULTS,
  routesLabel: 'Encounters',
  encounterTarget: TOA_ENCOUNTER_TARGET,
  hpNote: 'HP scaled by raid level, path level and party size (upstream, verified in-game); Encounter times assume every party member deals your DPS.',
};
