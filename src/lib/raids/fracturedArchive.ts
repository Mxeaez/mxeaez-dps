import { FA_TIME_MODEL, RAID_TIME_DEFAULTS } from '@/lib/fracturedArchive/raidTime';
import { FRACTURED_ARCHIVE_BASE } from '@/lib/raids/base';
import type { RaidConfig } from '@/lib/raids/index';

/**
 * Phase 18: The Fractured Archive as a RaidConfig. Everything it points at is the phase 8-17 code, unchanged (FA
 * behaviour and tests are the same as before the raid abstraction).
 */
// eslint-disable-next-line import/prefer-default-export
export const FRACTURED_ARCHIVE_RAID: RaidConfig = {
  ...FRACTURED_ARCHIVE_BASE,
  name: 'The Fractured Archive',
  shortName: 'Fractured Archive',
  raidOnlyAssumptions: true,
  time: FA_TIME_MODEL,
  defaultTimeSettings: RAID_TIME_DEFAULTS,
  timeModelNote: 'Time = Σ damage ÷ DPS per phase, the kit\'s best loadout + style per phase (switching is free); no '
    + 'puzzles, travel, healing or adds. HP: infobox × party-size table (unverified). Drains (Solo / Team) are planned '
    + 'per encounter with that encounter\'s undrained time as the fight length.',
  timeSettingFields: [
    {
      key: 'agShieldHp', label: 'AG shield', kind: 'number', unit: 'hp', title: 'Archive Guardian flying shield hp at 6 players (wiki: "1490 health shield in 6-scale", unverified), dealt at the Flying version\'s DPS; scaled by the (identity, unverified) party-size table',
    },
    {
      key: 'agGroundedFraction', label: 'AG grounded', kind: 'percent', title: 'Share of AG\'s 550 hp dealt while grounded; the rest at Flying DPS (it flies permanently below 30%)',
    },
    {
      key: 'borkStunUptime', label: 'Bork stun uptime', kind: 'percent', title: 'Share of Bork\'s damage dealt while he is stunned (heavy cannonball); the rest is split over armour 8/10/12/14. Stun length unpublished',
    },
    {
      key: 'ocellusWalkingFraction', label: 'Ocellus P1 walking', kind: 'percent', title: 'Share of P1\'s hp dealt while he walks to a corner (Protect from Melee)',
    },
    {
      key: 'ocellusP2Seconds', label: 'Ocellus P2 length', kind: 'number', unit: 's', title: 'P2 (The Blade) is time-limited: its length in seconds (0 = ignore P2). The damage dealt to the Blade × carry-over comes off P3', max: 600,
    },
    {
      key: 'ocellusP2CarryOver', label: 'P2 carry-over', kind: 'percent', title: 'Share of the Blade damage that comes off P3 (wiki: half)',
    },
    {
      key: 'ocellusLastQuadrantFraction', label: 'Ocellus last quadrant', kind: 'percent', title: 'Share of P3\'s hp dealt in the last quadrant, at the Deflect option that blocks the kit\'s best style (pessimistic)',
    },
  ],
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
  defaultSupplies: FRACTURED_ARCHIVE_BASE.planDefaults.supplies,
};
