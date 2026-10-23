import type { SupplyCounts } from '@/lib/fracturedArchive/planner';
import { TOA_ENCOUNTER_TARGET, TOA_TIME_DEFAULTS, TOA_TIME_MODEL } from '@/lib/raids/toa/time';
import { TOMBS_OF_AMASCUT_BASE } from '@/lib/raids/base';
import type { RaidConfig } from '@/lib/raids/index';

/**
 * Phase 18: Tombs of Amascut supplies. Salts, nectars, tears and ambrosia come from the raid's supply chest; they still
 * take slots, entered as "Other" (default 8: e.g. 3 nectar, 2 tears, 3 salts). The boost is always Smelling salts
 * (`boostsNeedSupplies: false`), so the potion supply types default to 0.
 */
export const TOA_DEFAULT_SUPPLIES: SupplyCounts = {
  brew: 0, restore: 0, ranging: 0, superCombat: 0, magic: 0, food: 0, other: 8,
};

/**
 * Phase 18: Tombs of Amascut. Monsters, hp scaling (raid level, path level, party size), the defence-roll scaling,
 * Defence floors (`getDefenceFloor`: Akkha 70, Ba-Ba 60, Kephri 60, Zebak 50, Obelisk 60, P3 Warden 120), weaknesses
 * (monsters.json) and the ToA item effects (Tumeken's shadow ×4, fang, kerises, P2 Warden damage) are upstream's;
 * this config adds the targets, presets, pool, prayers (src/lib/raids/toa/prayers.ts) and the time model.
 */
export const TOMBS_OF_AMASCUT_RAID: RaidConfig = {
  ...TOMBS_OF_AMASCUT_BASE,
  name: 'Tombs of Amascut',
  shortName: 'Tombs of Amascut',
  raidOnlyAssumptions: false,
  presetsNote: 'Presets: the Fractured Archive list + src/lib/raids/toa/presets.ts.',
  time: TOA_TIME_MODEL,
  defaultTimeSettings: TOA_TIME_DEFAULTS,
  timeModelNote: 'Time = Σ damage ÷ (team-DPS multiplier × your DPS) per phase, with the kit\'s best loadout + style per '
    + 'phase (switching is free); DPS time only (no paths, puzzles, invulnerable phases or healing). HP: upstream\'s ToA '
    + 'scaling (raid level, path level, party size; verified in-game). Kephri: 3 shields, the overlord scarabs, then her '
    + 'hp; Akkha: equal time under each of his prayers + 4 shadows + 20% final stand in melee; Wardens: obelisk, P2 downs '
    + '(shield, then the core for 21/29/37 ticks, ×5 damage), P3 95% + 25% enraged.',
  timeSettingFields: [
    {
      key: 'p2Warden',
      label: 'P2 warden',
      kind: 'select',
      title: 'The warden fought in P2 (prays Melee + Ranged: Elidinis\', Melee + Magic: Tumeken\'s); the other one is P3 (same stats)',
      options: [{ value: 'elidinis', label: 'Elidinis\' (magic only)' }, { value: 'tumeken', label: 'Tumeken\'s (ranged only)' }],
    },
    {
      key: 'akkhaPrayerRotation', label: 'Akkha prayer rotation', kind: 'bool', title: 'Akkha prays against the style he attacks with and rotates on a fixed attack count: equal time under each prayer (his hp split by the kit\'s DPS under each). Off: always an unprotected style',
    },
    {
      key: 'kephriOverlords', label: 'Kephri scarabs', kind: 'bool', title: 'Kill Kephri\'s overlord scarabs (Spitting, Soldier, Arcane)',
    },
    {
      key: 'kephriSwarmLeak', label: 'Kephri swarm leak', kind: 'percent', title: 'Extra Kephri shield per intermission from leaked swarms, as % of one shield (Strategies: ~10% per swarm, capped ~15% over max)',
    },
    {
      key: 'p3SiphonFraction', label: 'P3 siphons', kind: 'percent', title: 'Share of the P3 Warden hp taken off by reversed energy siphons (unpublished; 0 = not counted)',
    },
  ],
  routesLabel: 'Encounters',
  encounterTarget: TOA_ENCOUNTER_TARGET,
  hpNote: 'HP scaled by raid level, path level and party size (upstream, verified in-game).',
  defaultSupplies: TOA_DEFAULT_SUPPLIES,
  planNote: 'ToA: salts, nectar and tears come from the supply chest — enter their slots under "Other"; every style keeps the Smelling salts boost.',
};
