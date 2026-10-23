import {
  ANCESTRAL, BestSetupAssumptions, DEFAULT_ASSUMPTIONS, MELEE_FILL, PRESETS, PresetDef, TORVA,
} from '@/lib/fracturedArchive/presets';
import { DEFAULT_TOB_INPUTS } from '@/lib/raids/types';
import { TOB_DEFAULT_PARTY } from '@/lib/raids/tob/constants';

/**
 * Phase 20: Theatre of Blood presets = the Fractured Archive list (Scythe of Vitur, Twisted bow, Tumeken's shadow are
 * already in it: the Strategies page's Maiden / Bloat / Nylocas / Sotetseg / Xarpus / Verzik weapons) plus:
 * - Dawnbringer: Verzik P1 ("The Dawnbringer is the lone exception [to the damage cap], which also ignores accuracy
 *   rolls"; upstream models the cap exemption, the guaranteed hit and the halved max hit).
 * - Scythe + Salve amulet(ei): Bloat ("Being undead, the salve amulet is very powerful against Bloat ... weak to melee,
 *   especially slash attacks").
 * Edit like presets.ts; src/tests/lib/raids/ToB.test.ts checks that every item resolves.
 */
export const TOB_EXTRA_PRESETS: PresetDef[] = [
  {
    name: 'Torva + Salve (ei) + Scythe (slash)',
    group: 'melee',
    equipment: {
      ...MELEE_FILL, ...TORVA, neck: 'Salve amulet(ei)', weapon: 'Scythe of Vitur',
    },
    styles: ['Reap', 'Chop'],
    note: 'Undead: Pestilent Bloat',
  },
  {
    name: 'Dawnbringer (Ancestral)',
    group: 'magic',
    equipment: { ...ANCESTRAL, weapon: 'Dawnbringer' },
    note: 'Verzik P1 only: no damage cap, always hits (upstream)',
  },
];

export const TOB_PRESETS: PresetDef[] = [...PRESETS, ...TOB_EXTRA_PRESETS];

/**
 * ToB assumptions: the Fractured Archive potions (Super combat / Ranging / Saturated heart: ToB has no raid boost;
 * the supply chests sell brews, restores and staminas), Piety / Rigour / Augury, no Zeal / elemental fragments, normal
 * mode, party 4. Team drain carriers: 2 Elder maul + 2 Bandos godsword, the Strategies page's 4-scale Maiden plan
 * ("Melee & Ranger: Instantly hammer Maiden ... Freezers: BGS one tick after hammers"; "The most efficient way to reduce
 * Maiden's defence is by hitting two Elder maul special attacks ... and then 85 damage with the Bandos godsword"), also
 * used at Sotetseg ("special attack roles") and Xarpus ("at least two successful hammer/maul specials before draining
 * the remaining Defence with godsword specials").
 */
export const TOB_DEFAULT_ASSUMPTIONS: BestSetupAssumptions = {
  ...DEFAULT_ASSUMPTIONS,
  useZeal: false,
  elementalFragments: false,
  partySize: TOB_DEFAULT_PARTY,
  // copies, so no object is shared with another raid's defaults (phase 22)
  mySpecs: { ...DEFAULT_ASSUMPTIONS.mySpecs },
  team: {
    lightbearer: { ...DEFAULT_ASSUMPTIONS.team.lightbearer },
    carriers: {
      elderMaul: 2, dwh: 0, bgs: 2, tonalztics: 0, ayak: 0,
    },
  },
  raid: 'tob',
  tob: { ...DEFAULT_TOB_INPUTS },
};
