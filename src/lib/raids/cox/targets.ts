import { BestSetupTarget } from '@/lib/raids/types';

/**
 * Phase 19: Chambers of Xeric targets of the best-setup view (Search boss list, Summary rows, time-model phases). Every
 * one is an upstream monster (cdn/json/monsters.json, attribute "xerician"); upstream scales hp, offence and Defence
 * by party size, the party's best combat / hitpoints levels and Challenge Mode (src/lib/scaling/ChambersOfXeric.ts),
 * and models Tekton's ranged immunity and ÷5 magic, Vespula's melee immunity (flying), the Abyssal portal's melee
 * immunity, the Glowing crystal's ranged immunity and ÷3 magic, Olm's hand / head mitigation (magic on the left claw and
 * head, ranged on both claws), the Guardians' pickaxe-only rule + mining damage factor, and the Ice demon's ÷3 unless fire
 * spell / demonbane. Phase 19 adds melee on the head / right claw (src/lib/raids/cox/damage.ts). Keys start with "cox-".
 * Encounter sequence: src/lib/raids/cox/time.ts.
 */
// eslint-disable-next-line import/prefer-default-export
export const COX_TARGETS: BestSetupTarget[] = [
  {
    key: 'cox-tekton',
    label: 'Tekton',
    name: 'Tekton',
    version: 'Normal',
    raid: 'cox',
    note: 'Immune to ranged, magic ÷5 (upstream); weakest to crush.',
  },
  {
    key: 'cox-tekton-enraged',
    label: 'Tekton (enraged)',
    name: 'Tekton',
    version: 'Enraged',
    raid: 'cox',
    note: 'After the anvil: higher melee defence bonuses for a few attacks.',
  },
  {
    key: 'cox-vasa', label: 'Vasa Nistirio', name: 'Vasa Nistirio', version: 'Normal', raid: 'cox',
  },
  {
    key: 'cox-glowing-crystal',
    label: 'Glowing crystal (Vasa)',
    name: 'Glowing crystal',
    version: 'Normal',
    raid: 'cox',
    note: 'Immune to ranged, magic ÷3 (upstream); weak to stab. Not CM-scaled.',
  },
  {
    key: 'cox-vanguard-melee',
    label: 'Vanguard (melee)',
    name: 'Vanguard',
    version: 'Melee',
    raid: 'cox',
    noDrains: 'Vanguards restore drained stats in their shell',
  },
  {
    key: 'cox-vanguard-ranged',
    label: 'Vanguard (ranged)',
    name: 'Vanguard',
    version: 'Ranged',
    raid: 'cox',
    noDrains: 'Vanguards restore drained stats in their shell',
  },
  {
    key: 'cox-vanguard-magic',
    label: 'Vanguard (magic)',
    name: 'Vanguard',
    version: 'Magic',
    raid: 'cox',
    noDrains: 'Vanguards restore drained stats in their shell',
  },
  {
    key: 'cox-vespula',
    label: 'Vespula',
    name: 'Vespula',
    version: 'Normal',
    raid: 'cox',
    note: 'Flying: immune to melee (upstream) until she lands at 20%.',
  },
  {
    key: 'cox-abyssal-portal',
    label: 'Abyssal portal (Vespula)',
    name: 'Abyssal portal',
    version: 'Normal',
    raid: 'cox',
    note: 'Seven tiles away: immune to melee (upstream). Destroying it ends the room.',
  },
  {
    key: 'cox-muttadile-small', label: 'Muttadile (small)', name: 'Muttadile', version: 'Small', raid: 'cox',
  },
  {
    key: 'cox-muttadile-large', label: 'Muttadile (large)', name: 'Muttadile', version: 'Large', raid: 'cox',
  },
  {
    key: 'cox-mystic',
    label: 'Skeletal Mystic',
    name: 'Skeletal Mystic',
    version: 'Normal',
    raid: 'cox',
    note: 'Undead (Salve amulet(ei)).',
  },
  {
    key: 'cox-shaman',
    label: 'Lizardman shaman',
    name: 'Lizardman shaman (Chambers of Xeric)',
    version: 'Normal',
    raid: 'cox',
  },
  {
    key: 'cox-guardian',
    label: 'Guardian',
    name: 'Guardian (Chambers of Xeric)',
    version: 'Normal',
    raid: 'cox',
    note: 'Only pickaxes deal damage (upstream; × (50 + Mining + pickaxe level) / 150).',
  },
  {
    key: 'cox-ice-demon',
    label: 'Ice demon',
    name: 'Ice demon',
    version: 'Normal',
    raid: 'cox',
    note: 'Damage ÷3 unless a fire spell or demonbane (upstream).',
  },
  {
    key: 'cox-olm-left',
    label: 'Great Olm left claw (melee hand)',
    name: 'Great Olm',
    version: 'Left claw (Normal)',
    raid: 'cox',
    note: 'Dragon. Magic and ranged ÷3 (upstream).',
  },
  {
    key: 'cox-olm-right',
    label: 'Great Olm right claw (mage hand)',
    name: 'Great Olm',
    version: 'Right claw (Normal)',
    raid: 'cox',
    note: 'Dragon. Ranged ÷3 (upstream), melee ÷3 (wiki "66% damage mitigation from all non-mage attacks").',
  },
  {
    key: 'cox-olm-head',
    label: 'Great Olm head (final phase)',
    name: 'Great Olm',
    version: 'Head (Normal)',
    raid: 'cox',
    note: 'Dragon. Only damageable in the final phase. Magic ÷3 (upstream), melee ÷3 (wiki: 66% from all non-ranged).',
  },
];
