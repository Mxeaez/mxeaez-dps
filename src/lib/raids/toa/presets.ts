import Potion from '@/enums/Potion';
import {
  BestSetupAssumptions, DEFAULT_ASSUMPTIONS, MELEE_FILL, PRESETS, PresetDef, TORVA,
} from '@/lib/fracturedArchive/presets';
import { DEFAULT_TOA_INPUTS } from '@/lib/raids/types';

/**
 * Phase 18: Tombs of Amascut presets = the Fractured Archive list (same items; the raid's rewards work anywhere) plus
 * the standard ToA melee stab setups the Strategies page recommends (Kephri: "Osmumten's fang / Keris partisan of
 * breaching"; the core: "Ghrazi rapier / Blade of Saeldor / Inquisitor's mace"). Tumeken's shadow (×4 magic bonus in
 * ToA, upstream), Twisted bow (double accuracy scaling at P2, upstream) and the Scythe are already in the FA list.
 * Edit like presets.ts; src/tests/lib/raids/ToA.test.ts checks that every item resolves.
 */
const TORVA_STAB = { ...MELEE_FILL, ...TORVA, shield: 'Avernic defender' };

export const TOA_EXTRA_PRESETS: PresetDef[] = [
  {
    name: 'Osmumten\'s fang (Torva)',
    group: 'melee',
    equipment: { ...TORVA_STAB, weapon: 'Osmumten\'s fang' },
    styles: ['Stab', 'Lunge'],
    note: 'Fang: accuracy rolled twice in ToA (upstream)',
  },
  {
    name: 'Keris partisan of breaching (Torva)',
    group: 'melee',
    equipment: { ...TORVA_STAB, weapon: 'Keris partisan of breaching' },
    styles: ['Stab', 'Lunge'],
    note: 'Kalphites (Kephri, scarabs): +33% accuracy, keris damage bonus (upstream)',
  },
  {
    name: 'Ghrazi rapier (Torva)',
    group: 'melee',
    equipment: { ...TORVA_STAB, weapon: 'Ghrazi rapier' },
    styles: ['Stab', 'Lunge'],
  },
];

export const TOA_PRESETS: PresetDef[] = [...PRESETS, ...TOA_EXTRA_PRESETS];

/**
 * ToA assumptions: Smelling salts for every style (the raid's own boost, higher than super combat / ranging / Saturated
 * heart), Piety / Rigour / Augury, no Zeal and no elemental fragments (Fractured Archive only), raid level 500, path
 * levels 0, party 6; drain carriers as in the Fractured Archive.
 */
export const TOA_DEFAULT_ASSUMPTIONS: BestSetupAssumptions = {
  ...DEFAULT_ASSUMPTIONS,
  // copies, so no object is shared with another raid's defaults (phase 22)
  mySpecs: { ...DEFAULT_ASSUMPTIONS.mySpecs },
  team: {
    carriers: { ...DEFAULT_ASSUMPTIONS.team.carriers },
    lightbearer: { ...DEFAULT_ASSUMPTIONS.team.lightbearer },
  },
  potions: { melee: Potion.SMELLING_SALTS, ranged: Potion.SMELLING_SALTS, magic: Potion.SMELLING_SALTS },
  useZeal: false,
  elementalFragments: false,
  raid: 'toa',
  toa: { ...DEFAULT_TOA_INPUTS, pathLevels: { ...DEFAULT_TOA_INPUTS.pathLevels } },
};
