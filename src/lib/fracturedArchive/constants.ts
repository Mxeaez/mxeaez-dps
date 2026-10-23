// NPC ids for The Fractured Archive (raid 4). Sources and dates: docs/DATA_SOURCES.md.
// Id reference: RuneLite gameval NpcID (cache-derived), names in comments are the gameval names.
// Re-exported from '@/lib/constants'.

export const ARCHIVE_GUARDIAN_IDS = [
  16659, // TFA_GUARDIAN
  16660, // TFA_GUARDIAN_UNSHIELDED
];
export const THE_SMORKS_IDS = [16641];
export const BORK_IDS = [16640];

// Bork's flat armour by phase input; how it's applied: src/lib/fracturedArchive/bork.ts. Sources: docs/DATA_SOURCES.md.
export const BORK_STUNNED_PHASE = 'Stunned (armour 0)';

/**
 * "starting at 8 flat armour at 100% health, and adding 2 flat armour every 25% damage the Smorks take", max 14.
 * The first option is the default (the UI selects phases[0]); the wiki recommends killing Bork first, so the Smorks
 * are usually near full health while Bork is attacked.
 */
export const BORK_FLAT_ARMOUR_BY_PHASE: [phase: string, flatArmour: number][] = [
  ['Smorks 100-76% HP (armour 8)', 8],
  ['Smorks 75-51% HP (armour 10)', 10],
  ['Smorks 50-26% HP (armour 12)', 12],
  ['Smorks 25-0% HP (armour 14)', 14],
  // "temporarily removing his damage reduction and all melee attacks on him are dealt as successful hits"
  [BORK_STUNNED_PHASE, 0],
];

export const BORK_PHASES = BORK_FLAT_ARMOUR_BY_PHASE.map(([phase]) => phase);
export const DREADNOTH_IDS = [16665];
export const DREADNOTH_JELLY_IDS = [16666];
export const XARTH_IDS = [16684];
export const OCELLUS_P1_IDS = [
  16673, // TFA_OCELLUS_INTRO_MET (pre-fight form; the id the wiki infobox/monsters.json uses for P1)
  16674, // TFA_OCELLUS_P1
];
export const OCELLUS_P2_IDS = [
  100090, // manual entry (scripts/manual_monster.json)
  16675, // TFA_OCELLUS_P2
  16676, // TFA_OCELLUS_P2_SWORD_HITBOX ("The Blade", the target hit during P2)
];
export const OCELLUS_P3_IDS = [16677];
export const OCELLUS_IDS = [...OCELLUS_P1_IDS, ...OCELLUS_P2_IDS, ...OCELLUS_P3_IDS];

// Ocellus's prayers / damage reduction by phase input; how they're applied: src/lib/fracturedArchive/ocellus.ts.
// The first option of each list is the default (the UI selects phases[0]). Sources: docs/DATA_SOURCES.md.
export const OCELLUS_P1_WALKING_PHASE = 'Walking to a corner (Protect from Melee)';
export const OCELLUS_P1_PHASES = ['At a corner', OCELLUS_P1_WALKING_PHASE];

export const OCELLUS_P3_DEFLECT_MELEE_PHASE = 'Last quadrant: Deflect Melee';
export const OCELLUS_P3_DEFLECT_MELEE_VOID_PHASE = 'Last quadrant: Deflect Melee + void explosions';
export const OCELLUS_P3_SOUL_SPLIT_PHASE = 'Last quadrant: Soul Split';
export const OCELLUS_P3_DEFLECT_RANGED_PHASE = 'Last quadrant: Deflect Ranged';
export const OCELLUS_P3_DEFLECT_RANGED_VOID_PHASE = 'Last quadrant: Deflect Ranged + void explosions';
export const OCELLUS_P3_PHASES = [
  'Quadrants 1-3',
  OCELLUS_P3_DEFLECT_MELEE_PHASE,
  OCELLUS_P3_DEFLECT_MELEE_VOID_PHASE,
  OCELLUS_P3_SOUL_SPLIT_PHASE,
  OCELLUS_P3_DEFLECT_RANGED_PHASE,
  OCELLUS_P3_DEFLECT_RANGED_VOID_PHASE,
];
export const EZEKIEL_IDS = [16652];
export const MOIA_IDS = [16667];
export const DAGONHAI_IDS = [
  16643, // Elder (TFA_DAGONHAI_LEADER)
  16644, // TFA_DAGONHAI_LEADER_UNSHIELDED
  16645, // Monk (Staff) (TFA_DAGONHAI_MINION_1)
  16646, // TFA_DAGONHAI_MINION_1_UNSHIELDED
  16647, // Monk (Book) (TFA_DAGONHAI_MINION_2)
  16648, // TFA_DAGONHAI_MINION_2_UNSHIELDED
];

// bosses whose hitpoints scale with party size ("All bosses' hitpoints scale to the amount of players present",
// https://oldschool.runescape.wiki/w/The_Fractured_Archive); adds such as the jellies are not listed
export const FRACTURED_ARCHIVE_BOSS_IDS = [
  ...ARCHIVE_GUARDIAN_IDS,
  ...THE_SMORKS_IDS,
  ...BORK_IDS,
  ...DREADNOTH_IDS,
  ...XARTH_IDS,
  ...OCELLUS_IDS,
  ...EZEKIEL_IDS,
  ...MOIA_IDS,
  ...DAGONHAI_IDS,
];

export const FRACTURED_ARCHIVE_MONSTER_IDS = [
  ...FRACTURED_ARCHIVE_BOSS_IDS,
  ...DREADNOTH_JELLY_IDS,
];
