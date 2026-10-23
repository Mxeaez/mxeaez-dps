// Chambers of Xeric rules added in phase 19 (the monsters, ids and stat scaling are upstream's: '@/lib/constants',
// src/lib/scaling/ChambersOfXeric.ts). Sources (read 2026-10-23, ?action=raw):
// https://oldschool.runescape.wiki/w/Chambers_of_Xeric/Strategies, https://oldschool.runescape.wiki/w/Great_Olm and
// the room pages; notes in docs/DATA_SOURCES.md, "Chambers of Xeric".

/**
 * Party-size range of the CoX tab. The raid allows 1-100 players ("The raid can be started with just one player or up to
 * 100 at a time"); the tab stops at 15 because its times assume every member deals the user's DPS, which stops meaning
 * anything for mass raids. Upstream's scaling itself accepts 1-100.
 */
export const COX_MIN_PARTY = 1;
export const COX_MAX_PARTY = 15;
export const COX_DEFAULT_PARTY = 6;

/** All skills 99 (best-setup assumption): upstream's scaling inputs for the party's best player. */
export const COX_MAX_COMBAT_LEVEL = 126;
export const COX_MAX_HP_LEVEL = 99;
export const COX_MINING_LEVEL = 99;

/**
 * Great Olm: "In a team size of 1-7, Olm has four phases in total, three standard phases and a head phase. For every 8
 * players in the raid, Olm will gain an additional standard phase" (Strategies → Great Olm; Great Olm page: "Olm has at
 * least four phases, with an additional phase for every 8 players in the raid"). Upstream's hand / head hp uses the
 * same count: `min(partySize - 1, 50) - 3 * trunc(min(partySize, 50) / 8)`.
 */
export const olmStandardPhases = (partySize: number): number => 3 + Math.trunc(Math.min(Math.max(1, Math.trunc(partySize)), 50) / 8);

/** Skeletal Mystics per party size (Strategies → Skeletal Mystics table: 1-2 → 3, 3-5 → 4, …, 27+ → 12). */
export const mysticCount = (partySize: number): number => Math.min(12, 3 + Math.trunc(Math.max(1, Math.trunc(partySize)) / 3));

/** Lizardman shamans per party size (Strategies → Lizardman Shamans table: 1-4 → 2, 5-9 → 3, 10-14 → 4, 15+ → 5). */
export const shamanCount = (partySize: number): number => Math.min(5, 2 + Math.trunc(Math.max(1, Math.trunc(partySize)) / 5));

/** "Two Guardian statues are guarding a passageway" (Strategies → Guardians). */
export const GUARDIAN_COUNT = 2;

/** "Upon reaching 20% of her health, Vespula has a chance to land" (Vespula page). */
export const VESPULA_LANDS_AT = 0.2;
