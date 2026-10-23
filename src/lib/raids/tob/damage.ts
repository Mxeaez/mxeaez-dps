import { Monster } from '@/types/Monster';
import { CombatStyleType } from '@/types/PlayerCombatStyle';
import { VERZIK_P1_IDS } from '@/lib/constants';
import {
  NYLO_MAGIC_FORM, NYLO_RANGED_FORM, NYLOCAS_VASILIAS_IDS, VERZIK_P1_NO_DAWNBRINGER,
} from '@/lib/raids/tob/constants';

/**
 * Phase 20: Theatre of Blood damage rules that upstream doesn't model. Hooked into `PlayerVsNPCCalc.isImmune` and the
 * calculator warnings in `BaseCalc` (one line each, like the ToA prayers / Ocellus).
 *
 * - Nylocas style gating. Strategies → The Nylocas: "Each spider is immune to damage outside of their combat style -
 *   ranged must be used against the Toxobolos, magic against the Hagios, and melee against the Ischyros"; Nylocas
 *   Vasilias: "Just like the waves of nylocas before, the boss is immune to damage of the wrong combat style" (its form
 *   is the calculator phase, default the melee form it spawns in); Hard Mode's Nylocas Prinkipas work "similarly to
 *   normal mode Vasilias" (its form is the monster version). Verzik's nylocas (version "Verzik") are not gated.
 * - Dawnbringer: only usable on Verzik's first phase ("Used to break Verzik Vitur's shield during the first phase ...
 *   After her shield is destroyed, the Dawnbringer will crumble to dust", Dawnbringer page; upstream already warns
 *   "This weapon cannot be used against the select monster"), so it deals nothing to anything else; nor on P1 under the
 *   phase "Shield (Dawnbringer with a teammate)" (one staff per raid: the time model's other team members).
 */

export type TobStyle = 'melee' | 'ranged' | 'magic';

const WAVE_NYLO_STYLE: Record<string, TobStyle> = {
  'Nylocas Ischyros': 'melee',
  'Nylocas Toxobolos': 'ranged',
  'Nylocas Hagios': 'magic',
};

const vasiliasStyle = (phase: string | undefined): TobStyle => {
  if (phase === NYLO_RANGED_FORM) return 'ranged';
  if (phase === NYLO_MAGIC_FORM) return 'magic';
  return 'melee';
};

/** The only style that damages this ToB nylocas (null: any style, or not a gated monster). */
export const tobRequiredStyle = (m: Monster): TobStyle | null => {
  if (NYLOCAS_VASILIAS_IDS.includes(m.id)) return vasiliasStyle(m.inputs.phase);
  if (m.name === 'Nylocas Prinkipas') {
    const v = (m.version || '').toLowerCase();
    if (v === 'melee' || v === 'ranged' || v === 'magic') return v;
    return null;
  }
  const wave = WAVE_NYLO_STYLE[m.name];
  if (wave && !(m.version || '').includes('Verzik')) return wave;
  return null;
};

export const isBlockedByTobStyle = (m: Monster, styleType: CombatStyleType, isMelee: boolean): boolean => {
  const required = tobRequiredStyle(m);
  if (!required) return false;
  const used = isMelee ? 'melee' : styleType;
  return used !== required;
};

/** The Dawnbringer deals no damage outside Verzik's first phase (or when a teammate holds it). */
export const isDawnbringerWrongTarget = (m: Monster, wearingDawnbringer: boolean): boolean => wearingDawnbringer
  && (!VERZIK_P1_IDS.includes(m.id) || m.inputs.phase === VERZIK_P1_NO_DAWNBRINGER);
