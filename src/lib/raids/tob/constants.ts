// Theatre of Blood rules added in phase 20 (the monsters, ids and hp scaling are upstream's: '@/lib/constants',
// src/lib/scaling/TheatreOfBlood.ts). Sources (read 2026-10-23, ?action=raw):
// https://oldschool.runescape.wiki/w/Theatre_of_Blood, https://oldschool.runescape.wiki/w/Theatre_of_Blood/Strategies,
// https://oldschool.runescape.wiki/w/Theatre_of_Blood/Hard_Mode and the boss pages; notes in docs/DATA_SOURCES.md,
// "Theatre of Blood". This file imports nothing from '@/lib/constants' (which imports the phase names from here).

/**
 * Party-size range of the ToB tab: "players = 1-5" (Theatre of Blood infobox). Default 4 (the Strategies page's role
 * summaries are written "as they appear in a 4-Scale"); the shared default of 6 is outside the range.
 */
export const TOB_MIN_PARTY = 1;
export const TOB_MAX_PARTY = 5;
export const TOB_DEFAULT_PARTY = 4;

/**
 * Nylocas Vasilias ids (infobox: Entry 10786-10789, Normal 8354-8357, Hard 10807-10810). monsters.json uses the first
 * id of each mode (10786, 8354, 10807), which upstream's TOB_MONSTER_IDS / TOB_EM_MONSTER_IDS miss (phase 20 adds them
 * there, so the boss's hp scales like the infobox's "scaledhp = Yes").
 */
export const NYLOCAS_VASILIAS_IDS = [
  10786, 10787, 10788, 10789,
  8354, 8355, 8356, 8357,
  10807, 10808, 10809, 10810,
];

/**
 * The Vasilias's form, as a calculator phase. Strategies → Nylocas Vasilias: "The boss will change forms every 10 ticks
 * (6 seconds) to another form that it is not currently using"; "Vasilias will always spawn in its melee form"; "Just like
 * the waves of nylocas before, the boss is immune to damage of the wrong combat style". First = default (spawn form).
 */
export const NYLO_MELEE_FORM = 'Melee form';
export const NYLO_RANGED_FORM = 'Ranged form';
export const NYLO_MAGIC_FORM = 'Magic form';
export const NYLOCAS_VASILIAS_PHASES = [NYLO_MELEE_FORM, NYLO_RANGED_FORM, NYLO_MAGIC_FORM];

/** Hard Mode: "Three Nylocas Prinkipas will also spawn during pre-challenge build-up ... on the tenth, twentieth and thirtieth wave". */
export const PRINKIPAS_COUNT = 3;

/** Maiden: "summon a group of Nylocas Matomenos whenever she first reaches 70%, 50%, and 30% of her health" (Strategies). */
export const MAIDEN_THRESHOLDS = [0.7, 0.5, 0.3];

/**
 * Bloat: "The team will have roughly 18 seconds to deal damage before it reactivates" (Strategies; it is down for 32
 * ticks); "If its Defence has been reduced, it will regenerate to full when it stomps" (Pestilent Bloat).
 */
export const BLOAT_DOWN_SECONDS = 18;

/** Sotetseg: the shadow mazes "At 66.6% and 33.3% health"; "After clearing the maze, Sotetseg's Defence level is restored". */
export const SOTETSEG_MAZES = 2;

/**
 * Xarpus: P1 "starting with 75% of his health" and healing from exhumeds; P3 "Upon reaching ~25% of his health"
 * (Strategies; Entry Mode: "Xarpus will screech when below 22.5% health"). P2 and P3 share one infobox ("Phase 2 & 3"):
 * no stat change.
 */
export const XARPUS_START_FRACTION = 0.75;
export const XARPUS_P3_FRACTION = 0.25;
export const XARPUS_P3_FRACTION_ENTRY = 0.225;

/**
 * Dawnbringer special attack "Pulsate": "inflicting 75-150 hitpoints of damage towards her and consuming 35% of the
 * wielder's special attack energy" (Dawnbringer page) → 112.5 on average; one 4-tick attack (speed 4). Players have full
 * energy at Verzik ("When each boss is killed, the ... special attack energy of all team members are restored to full"),
 * so two specs each.
 */
export const DAWNBRINGER_SPEC_AVERAGE = 112.5;
export const DAWNBRINGER_SPEC_SECONDS = 2.4;
export const DAWNBRINGER_SPECS_PER_PLAYER = 2;

/** Hard Mode Verzik: "upon reaching 5% or lower of her health, Verzik will trigger a one-time heal ... heal 30% of her health". */
export const VERZIK_HM_FINAL_HEAL = 0.3;

/**
 * Verzik P1 as a calculator phase: there is one Dawnbringer per raid ("it is mandatory for teammates to drop the staff
 * for another player"), so the team's other members attack without it. "Dawnbringer with a teammate" = the Dawnbringer
 * deals nothing (src/lib/raids/tob/damage.ts). First = default: any weapon (upstream behaviour unchanged).
 */
export const VERZIK_P1_ANY_WEAPON = 'Shield';
export const VERZIK_P1_NO_DAWNBRINGER = 'Shield (Dawnbringer with a teammate)';
export const VERZIK_P1_PHASES = [VERZIK_P1_ANY_WEAPON, VERZIK_P1_NO_DAWNBRINGER];
