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
    + 'per encounter, for a fight as long as that encounter takes undrained with the whole party at your DPS.',
  timeSettingFields: [
    {
      key: 'agShieldHp', label: 'AG shield', kind: 'number', unit: 'hp', title: 'Archive Guardian flying shield hp at 6 players (wiki: "1490 health shield in 6-scale", unverified), dealt at the Flying version\'s DPS; scaled by the (identity, unverified) party-size table',
    },
    {
      key: 'agGroundedFraction', label: 'AG grounded', kind: 'percent', title: 'Share of AG\'s 550 hp dealt while grounded; the rest at Flying DPS (it flies permanently below 30%)',
    },
    {
      key: 'borkKillOrder',
      label: 'Bork kill order',
      kind: 'select',
      title: 'Stun-swap (default): Bork is hit only while a heavy cannonball has him stunned (armour 0, every melee hit lands), the Smorks between stuns (kept alive until Bork dies: their cannonballs cause the stuns); Bork hp the stuns can\'t cover is fought at armour 14. Killed evenly: Bork\'s hp in four quarters at armour 8 / 10 / 12 / 14, no stun',
      options: [{ value: 'stun-swap', label: 'Stun-swap' }, { value: 'evenly', label: 'Killed evenly' }],
    },
    {
      key: 'borkStunsPerKill', label: 'Bork stuns per kill', kind: 'number', title: 'Heavy-cannonball stuns per Bork kill (stun-swap; the user: ~4)', max: 20,
    },
    {
      key: 'borkStunTicks', label: 'Bork stun length (ticks, ≈ 5 Scythe hits)', kind: 'number', unit: 'ticks', title: 'Length of one stun in game ticks (0.6 s). Unpublished; the user: "enough time to get around 5 Scythe hits in" (the Scythe attacks every 5 ticks: 21-25 ticks); default 25 ticks = 15 s (unverified)', max: 50,
    },
    {
      key: 'ocellusWalkingFraction', label: 'Ocellus P1 walking', kind: 'percent', title: 'Share of P1\'s hp dealt while he walks to a corner (Protect from Melee)',
    },
    {
      key: 'ocellusP2Seconds', label: 'Ocellus P2 length', kind: 'number', unit: 's', title: 'P2 (The Blade) is time-limited: its length in seconds (0 = ignore P2; default 120 s, the user\'s in-game estimate, unverified). The damage dealt to the Blade × carry-over comes off P3. The Defence resets at P2 and again at P3: three drain events', max: 600,
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
