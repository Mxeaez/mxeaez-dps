// NPC ids for The Fractured Archive (raid 4). Sources and dates: docs/DATA_SOURCES.md.
// Id reference: RuneLite gameval NpcID (cache-derived), names in comments are the gameval names.
// Re-exported from '@/lib/constants'.

export const ARCHIVE_GUARDIAN_IDS = [
  16659, // TFA_GUARDIAN
  16660, // TFA_GUARDIAN_UNSHIELDED
];
export const THE_SMORKS_IDS = [16641];
export const BORK_IDS = [16640];
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
