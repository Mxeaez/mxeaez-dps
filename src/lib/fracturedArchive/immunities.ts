import { Monster } from '@/types/Monster';
import { Spell, Spellbook } from '@/types/Spell';
import { ARCHIVE_GUARDIAN_IDS, MOIA_IDS } from '@/lib/fracturedArchive/constants';

// Fractured Archive immunities that upstream has no generic field for. Sources and dates: docs/DATA_SOURCES.md.

/**
 * Spellbooks a monster takes no damage from.
 * Archive Guardian: "It is immune to Ancient Magicks." (https://oldschool.runescape.wiki/w/Archive_Guardian, 2026-10-22)
 */
const SPELLBOOK_IMMUNITIES: [ids: number[], spellbook: Spellbook][] = [
  [ARCHIVE_GUARDIAN_IDS, 'ancient'],
];

export const isImmuneToSpell = (m: Monster, spell: Spell | null | undefined): boolean => !!spell
  && SPELLBOOK_IMMUNITIES.some(([ids, spellbook]) => ids.includes(m.id) && spell.spellbook === spellbook);

/**
 * Monsters whose Magic level can't be drained (accursed sceptre spec, seercull spec, ...).
 * Archive Guardian: "Magic level reducing effects [Accursed sceptre], etc.) seem to be absorbed."
 * (https://oldschool.runescape.wiki/w/Archive_Guardian, 2026-10-22). Only the Magic level is protected; the Defence
 * part of the accursed spec still applies (down to the defence floor).
 */
const MAGIC_DRAIN_IMMUNE_IDS = [
  ...ARCHIVE_GUARDIAN_IDS,
];

export const isImmuneToMagicLevelDrains = (m: Monster): boolean => MAGIC_DRAIN_IMMUNE_IDS.includes(m.id);

/**
 * Monsters melee (halberds included) can't reach.
 * Moia: "Moia begins the fight outside of her arena and primarily attacks with a fast ranged projectile. A ranged or
 * magic weapon is required as she is too far to reach with melee or halberds."
 * (https://oldschool.runescape.wiki/w/The_Fractured_Archive/Strategies#Moia, 2026-10-23). The wiki doesn't say she
 * ever becomes reachable (enrage included), so the whole fight is melee-immune (unverified, docs/UNVERIFIED.md).
 */
const OUT_OF_MELEE_REACH_IDS = [
  ...MOIA_IDS,
];

export const isOutOfMeleeReach = (m: Monster): boolean => OUT_OF_MELEE_REACH_IDS.includes(m.id);
