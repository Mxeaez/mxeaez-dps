import { Monster } from '@/types/Monster';
import {
  DREADNOTH_IDS, OCELLUS_P1_IDS, OCELLUS_P3_IDS, XARTH_IDS,
} from '@/lib/fracturedArchive/constants';

// Demonbane effectiveness of Fractured Archive demons. Source (2026-10-22):
// https://oldschool.runescape.wiki/w/Demon_(attribute) "List of monsters": "Unless stated below, all demons have 100%
// demonbane effectiveness. ... Dreadnoth the Jellied: 25% effectiveness ... Ocellus: 80% effectiveness ... Xarth: 80%
// effectiveness" (added 2026-10-20, edit summary "per orion"; no in-game citation, so the exact values are
// unverified). Matches the Strategies page's "Dreadnoth is considered a demon, however he has low demonbane values".
// The Jelly (Dreadnoth) is not listed -> 100%. Ocellus is a demon in phases 1 and 3 only (the infobox gives phase 2,
// The Blade, no attributes), so P2 gets no demonbane bonus at all. Model notes: docs/DATA_SOURCES.md.

/**
 * Percent of a demonbane bonus that applies (same meaning as upstream's Duke Sucellus 70): Arclight's +70% becomes
 * +trunc(70 * 25 / 100) = +17% on Dreadnoth. Read by BaseCalc.demonbaneVulnerability, so it reaches every
 * demonbane effect upstream models (demonbane swords, burning/bone claws, scorching bow, holy water, demonbane
 * spells and Mark of Darkness incl. the purging staff).
 */
export const DEMONBANE_EFFECTIVENESS: [ids: number[], percent: number][] = [
  [DREADNOTH_IDS, 25],
  [XARTH_IDS, 80],
  [OCELLUS_P1_IDS, 80],
  [OCELLUS_P3_IDS, 80],
];

export const getFracturedArchiveDemonbaneVulnerability = (m: Monster): number | undefined => DEMONBANE_EFFECTIVENESS
  .find(([ids]) => ids.includes(m.id))?.[1];
