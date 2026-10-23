import Potion from '@/enums/Potion';
import {
  BestSetupAssumptions, DEFAULT_ASSUMPTIONS, MASORI_F, MELEE_FILL, PRESETS, PresetDef, TORVA,
} from '@/lib/fracturedArchive/presets';
import { DEFAULT_COX_INPUTS } from '@/lib/raids/types';
import { COX_DEFAULT_PARTY } from '@/lib/raids/cox/constants';

/**
 * Phase 19: Chambers of Xeric presets = the Fractured Archive list (Twisted bow, Scythe, Inquisitor's mace, Shadow,
 * Kodai + Fire Surge are already in it) plus the CoX standards from the Strategies page's recommended equipment:
 * - Dragon hunter lance: the Great Olm is a dragon in the data ("attributes = dragon,xerician"; the Great Olm page:
 *   "vulnerable to dragonbane weapons"), so the lance / crossbow bonuses apply (upstream) — the melee hand's weapon.
 * - Dragon hunter crossbow + ruby (e): Strategies "Only used on high defence monsters; Shamans, Vespula, Vasa, Mystics,
 *   Olm Head"; its dragonbane bonus only counts on Olm.
 * - Dragon pickaxe: the Guardians "can only be harmed through pickaxes" (crush: "set the pickaxe to a crushing option").
 * Edit like presets.ts; src/tests/lib/raids/CoX.test.ts checks that every item resolves.
 */
const TORVA_MELEE = { ...MELEE_FILL, ...TORVA, shield: 'Avernic defender' };

export const COX_EXTRA_PRESETS: PresetDef[] = [
  {
    name: 'Dragon hunter lance (Torva)',
    group: 'melee',
    equipment: { ...TORVA_MELEE, weapon: 'Dragon hunter lance' },
    note: 'Dragonbane: Great Olm (upstream)',
  },
  {
    name: 'Dragon pickaxe (Torva)',
    group: 'melee',
    equipment: { ...TORVA_MELEE, weapon: 'Dragon pickaxe' },
    styles: ['Smash'],
    note: 'Guardians: pickaxes only, × (50 + Mining + 61) / 150 (upstream)',
  },
  {
    name: 'Dragon hunter crossbow + ruby (e) (Masori)',
    group: 'ranged',
    equipment: {
      ...MASORI_F, weapon: 'Dragon hunter crossbow', shield: 'Twisted buckler', ammo: 'Ruby dragon bolts (e)',
    },
    styles: ['Accurate', 'Rapid'],
    note: 'Dragonbane: Great Olm (upstream)',
  },
];

export const COX_PRESETS: PresetDef[] = [...PRESETS, ...COX_EXTRA_PRESETS];

/**
 * CoX assumptions: Overload (+) for every style (the raid's own boost, from its herbs: "Increases Attack, Strength,
 * Defence, Ranged and Magic"), Piety / Rigour / Augury, no Zeal / elemental fragments (Fractured Archive only), normal
 * mode, party 6. Team drain carriers: the Fractured Archive's (Elder maul 2, Tonalztics 2, Ayak 1) + 1 Bandos godsword
 * (Strategies, Tekton: "In teams the bandos godsword should be used to lower his defence to zero"; the special-weapon
 * row: "Bandos godsword + Elder maul > Dragon warhammer"; "In trios and larger one player should bring a Tonalztics").
 */
export const COX_DEFAULT_ASSUMPTIONS: BestSetupAssumptions = {
  ...DEFAULT_ASSUMPTIONS,
  potions: { melee: Potion.OVERLOAD_PLUS, ranged: Potion.OVERLOAD_PLUS, magic: Potion.OVERLOAD_PLUS },
  useZeal: false,
  elementalFragments: false,
  partySize: COX_DEFAULT_PARTY,
  team: {
    ...DEFAULT_ASSUMPTIONS.team,
    carriers: { ...DEFAULT_ASSUMPTIONS.team.carriers, bgs: 1 },
  },
  raid: 'cox',
  cox: { ...DEFAULT_COX_INPUTS },
};
