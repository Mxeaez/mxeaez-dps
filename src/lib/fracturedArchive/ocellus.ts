import { Monster } from '@/types/Monster';
import { CombatStyleType } from '@/types/PlayerCombatStyle';
import {
  OCELLUS_P1_IDS,
  OCELLUS_P1_WALKING_PHASE,
  OCELLUS_P3_DEFLECT_MELEE_PHASE,
  OCELLUS_P3_DEFLECT_MELEE_VOID_PHASE,
  OCELLUS_P3_DEFLECT_RANGED_PHASE,
  OCELLUS_P3_DEFLECT_RANGED_VOID_PHASE,
  OCELLUS_P3_IDS,
} from '@/lib/fracturedArchive/constants';

// Ocellus's prayers and damage reduction. Sources (2026-10-22): https://oldschool.runescape.wiki/w/Ocellus and
// https://oldschool.runescape.wiki/w/The_Fractured_Archive/Strategies#Ocellus. Model notes: docs/DATA_SOURCES.md.

/**
 * Phase inputs during which Ocellus prays against a style.
 * P1: "While walking to a quadrant, he will have Protect from Melee active."
 * P3 last quadrant ("Phase 4" on the Strategies page): Deflect Melee while floating, Soul Split while landed, then
 * Deflect Range. Unverified: neither page says how much of a player's damage his prayer blocks; modelled as a full
 * block, like other NPC protection prayers (the Ocellus page body also says magic is deflected in both states, the
 * Strategies page doesn't; we follow the Strategies page).
 */
const PRAYERS: [ids: number[], phase: string, style: 'melee' | 'ranged'][] = [
  [OCELLUS_P1_IDS, OCELLUS_P1_WALKING_PHASE, 'melee'],
  [OCELLUS_P3_IDS, OCELLUS_P3_DEFLECT_MELEE_PHASE, 'melee'],
  [OCELLUS_P3_IDS, OCELLUS_P3_DEFLECT_MELEE_VOID_PHASE, 'melee'],
  [OCELLUS_P3_IDS, OCELLUS_P3_DEFLECT_RANGED_PHASE, 'ranged'],
  [OCELLUS_P3_IDS, OCELLUS_P3_DEFLECT_RANGED_VOID_PHASE, 'ranged'],
];

/** "While the explosions are occurring the boss takes 50% less damage" (rounding unverified: rounded down). */
const VOID_EXPLOSION_PHASES = [OCELLUS_P3_DEFLECT_MELEE_VOID_PHASE, OCELLUS_P3_DEFLECT_RANGED_VOID_PHASE];

export const isBlockedByOcellusPrayer = (m: Monster, styleType: CombatStyleType, isMelee: boolean): boolean => PRAYERS
  .some(([ids, phase, style]) => ids.includes(m.id)
    && m.inputs.phase === phase
    && (style === 'melee' ? isMelee : styleType === 'ranged'));

/** Divisor applied to each hitsplat (1 = no reduction). */
export const getOcellusDamageDivisor = (m: Monster): number => (OCELLUS_P3_IDS.includes(m.id)
  && VOID_EXPLOSION_PHASES.includes(m.inputs.phase || '') ? 2 : 1);
