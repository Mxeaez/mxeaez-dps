// Tombs of Amascut phase options added in phase 18 (the monsters and their ids are upstream's, '@/lib/constants').
// Strings only, so '@/lib/constants' can register them in MONSTER_PHASES_BY_ID without an import cycle.
// Sources (read 2026-10-23, ?action=raw): https://oldschool.runescape.wiki/w/Akkha,
// https://oldschool.runescape.wiki/w/Tombs_of_Amascut/Strategies (Akkha, The Wardens), Elidinis' / Tumeken's Warden.
// How they are applied: src/lib/raids/toa/prayers.ts. Notes: docs/DATA_SOURCES.md, "Tombs of Amascut".

// Akkha "will always pray against the same style with which he is currently attacking"; in his final stand he has
// "Protect from Magic and Missiles simultaneously active" (Strategies: "making melee the only way to damage him").
// The first option is the default and changes nothing (upstream behaviour: no prayer).
export const AKKHA_NO_PRAYER_PHASE = 'Not praying against your style';
export const AKKHA_PRAYING_MELEE_PHASE = 'Praying Melee';
export const AKKHA_PRAYING_RANGED_PHASE = 'Praying Ranged';
export const AKKHA_PRAYING_MAGIC_PHASE = 'Praying Magic';
export const AKKHA_FINAL_STAND_PHASE = 'Final stand (Protect from Magic + Missiles)';
export const AKKHA_PHASES = [
  AKKHA_NO_PRAYER_PHASE,
  AKKHA_PRAYING_MELEE_PHASE,
  AKKHA_PRAYING_RANGED_PHASE,
  AKKHA_PRAYING_MAGIC_PHASE,
  AKKHA_FINAL_STAND_PHASE,
];

// Wardens P2: "The Warden will always have protection prayers active against two attack styles, with Protect from
// Melee being always active; however Tumeken's Warden will always initially pray against magic, while Elidinis' will
// always initially pray against ranged." The first option is the default and changes nothing (upstream behaviour, and
// upstream's own P2 damage tests use ranged on Elidinis'); the time model picks the warden's prayer phase explicitly.
export const P2_WARDEN_NO_PRAYER_PHASE = 'Not praying against your style';
export const P2_WARDEN_MELEE_RANGED_PHASE = 'Praying Melee + Ranged';
export const P2_WARDEN_MELEE_MAGIC_PHASE = 'Praying Melee + Magic';
export const P2_WARDEN_PHASES = [P2_WARDEN_NO_PRAYER_PHASE, P2_WARDEN_MELEE_RANGED_PHASE, P2_WARDEN_MELEE_MAGIC_PHASE];
/** The initial prayers of each warden in P2 (Strategies). */
export const P2_ELIDINIS_INITIAL_PHASE = P2_WARDEN_MELEE_RANGED_PHASE;
export const P2_TUMEKEN_INITIAL_PHASE = P2_WARDEN_MELEE_MAGIC_PHASE;

export const P2_WARDEN_ACTIVE_IDS = [
  11753, 11754, // Elidinis' Warden (Active)
  11756, 11757, // Tumeken's Warden (Active)
];
