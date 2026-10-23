import { BEST_SETUP_TARGETS } from '@/lib/fracturedArchive/bestSetup';
import { DEFAULT_ASSUMPTIONS, PRESETS } from '@/lib/fracturedArchive/presets';
import { SEARCH_POOL } from '@/lib/fracturedArchive/searchCandidates';
import { FA_TIME_MODEL, RAID_TIME_DEFAULTS } from '@/lib/fracturedArchive/raidTime';
import type { RaidConfig } from '@/lib/raids/index';

/**
 * Phase 18: The Fractured Archive as a RaidConfig. Everything it points at is the phase 8-17 code, unchanged (FA
 * behaviour and tests are the same as before the raid abstraction).
 */
// eslint-disable-next-line import/prefer-default-export
export const FRACTURED_ARCHIVE_RAID: RaidConfig = {
  id: 'fractured-archive',
  name: 'The Fractured Archive',
  shortName: 'Fractured Archive',
  targets: BEST_SETUP_TARGETS,
  scalingInputs: [
    {
      key: 'partySize',
      label: 'party size',
      min: 2,
      max: 8,
      default: 6,
      title: 'Team spec planner party size; also the HP scaling party size (identity table, unverified)',
    },
  ],
  partySize: { min: 2, max: 8 },
  raidOnlyAssumptions: true,
  defaultAssumptions: DEFAULT_ASSUMPTIONS,
  presets: PRESETS,
  searchPool: SEARCH_POOL,
  time: FA_TIME_MODEL,
  defaultTimeSettings: RAID_TIME_DEFAULTS,
  routesLabel: 'Routes',
  encounterTarget: {
    'archive-guardian': 'ag-flying',
    ezekiel: 'ezekiel',
    'bork-smorks': 'bork',
    moia: 'moia',
    dreadnoth: 'dreadnoth',
    dagonhai: 'dagonhai',
    xarth: 'xarth',
    ocellus: 'ocellus-p1',
  },
  hpNote: 'Expected TTK uses the infobox HP (party-size scaling unverified) — compare setups, don\'t trust the absolute seconds.',
};
