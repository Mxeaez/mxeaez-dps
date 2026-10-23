import { Monster } from '@/types/Monster';
import { CombatStyleType } from '@/types/PlayerCombatStyle';
import { AKKHA_IDS, P2_WARDEN_IDS } from '@/lib/constants';
import {
  AKKHA_FINAL_STAND_PHASE,
  AKKHA_PRAYING_MAGIC_PHASE,
  AKKHA_PRAYING_MELEE_PHASE,
  AKKHA_PRAYING_RANGED_PHASE,
  P2_WARDEN_MELEE_MAGIC_PHASE,
  P2_WARDEN_MELEE_RANGED_PHASE,
} from '@/lib/raids/toa/constants';

/**
 * Phase 18: Tombs of Amascut protection prayers that upstream doesn't model (it has no prayer for Akkha or the P2
 * Wardens). Full block, like every other NPC protection prayer against players. Hooked into `PlayerVsNPCCalc.isImmune`
 * and the calculator warning in `BaseCalc` (one line each, like Ocellus's prayers).
 *
 * - Akkha: phase input "Praying Melee / Ranged / Magic" (he prays against the style he attacks with) and "Final stand"
 *   (Protect from Magic and Missiles: melee only). Default "Not praying against your style" = no block.
 * - P2 Warden (Active, the shielded body; not the core): phase input "Praying Melee + Ranged" (Elidinis' initially) /
 *   "Praying Melee + Magic" (Tumeken's initially). Default "Not praying against your style" = no block, so the main
 *   calculator and upstream's tests are unchanged; the ToA time model selects the warden's initial prayers.
 */

type PrayedStyle = 'melee' | 'ranged' | 'magic';

const akkhaPrayers = (phase: string | undefined): PrayedStyle[] => {
  switch (phase) {
    case AKKHA_PRAYING_MELEE_PHASE: return ['melee'];
    case AKKHA_PRAYING_RANGED_PHASE: return ['ranged'];
    case AKKHA_PRAYING_MAGIC_PHASE: return ['magic'];
    case AKKHA_FINAL_STAND_PHASE: return ['ranged', 'magic'];
    default: return [];
  }
};

const wardenPrayers = (phase: string): PrayedStyle[] => {
  if (phase === P2_WARDEN_MELEE_RANGED_PHASE) return ['melee', 'ranged'];
  if (phase === P2_WARDEN_MELEE_MAGIC_PHASE) return ['melee', 'magic'];
  return [];
};

/** The styles the ToA boss is praying against (empty for every other monster). */
export const toaPrayedStyles = (m: Monster): PrayedStyle[] => {
  if (AKKHA_IDS.includes(m.id)) return akkhaPrayers(m.inputs.phase);
  if (P2_WARDEN_IDS.includes(m.id)) return wardenPrayers(m.inputs.phase || '');
  return [];
};

export const isBlockedByToaPrayer = (m: Monster, styleType: CombatStyleType, isMelee: boolean): boolean => {
  const prayed = toaPrayedStyles(m);
  if (!prayed.length) return false;
  if (isMelee) return prayed.includes('melee');
  return (styleType === 'ranged' && prayed.includes('ranged')) || (styleType === 'magic' && prayed.includes('magic'));
};
