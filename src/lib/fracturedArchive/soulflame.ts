import { DrainModel, SPEC_WEAPONS, SpecWeapon } from '@/lib/fracturedArchive/specs';

/**
 * Phase 38h-4: the Soulflame horn, display only (no plan choice; ROADMAP decision 2026-10-28).
 * OSRS Wiki (Soulflame horn, read 2026-10-29, docs/DATA_SOURCES.md): the special attack Entice costs 25% of the horn
 * user's special energy per OTHER player affected (the user always gets it free); "the player's next melee attack
 * within 10 ticks (6 seconds) is always a successful hit; this also applies to melee special attacks"; works in raids.
 *
 * So one Entice makes one melee drain spec (Elder maul, DWH, BGS) a guaranteed accurate roll. A drain that needs one
 * landed spec costs 1 / p specs on average at hit chance p, and 1 / p' with Entice (p' = the chance a guaranteed
 * accurate roll still drains: 1 for the maul, damage > 0 for DWH / BGS). Valued as the drain specs it saves: the spec
 * bars (energy) those specs would have spent, less the horn's 25% for the one ally enticed. Shown only where that is
 * above zero (a low-accuracy drain: the maul below 2/3 at 50% energy); silent elsewhere.
 */

export const ENTICE_ENERGY = 25;

/** Melee drain weapons Entice's guaranteed hit applies to (not Tonalztics / Eye of Ayak: ranged / magic). */
export const ENTICE_WEAPONS: SpecWeapon[] = ['elderMaul', 'dwh', 'bgs'];

export interface SoulflameSaving {
  weapon: SpecWeapon;
  label: string;
  /** The weapon's drain chance per spec, and with Entice's guaranteed accurate roll. */
  hitChance: number;
  enticedChance: number;
  /** Specs saved per landed drain: 1 / p − 1 / p'. */
  specsSaved: number;
  /** Spec energy those specs would cost (% of a bar), the horn's 25% for one ally, and the difference. */
  energySaved: number;
  hornEnergy: number;
  netEnergy: number;
  /** The note shown on the drain line. */
  text: string;
}

/**
 * The horn's saving for one weapon on a boss / phase, or undefined when it frees nothing (the weapon is not melee, can't
 * hit, or saves no more energy than the 25% Entice costs).
 */
export const soulflameSaving = (
  model: Pick<DrainModel, 'hitChance' | 'energy' | 'canHit' | 'accuracy'>,
  weapon: SpecWeapon,
): SoulflameSaving | undefined => {
  if (!ENTICE_WEAPONS.includes(weapon)) return undefined;
  const w = weapon as 'elderMaul' | 'dwh' | 'bgs';
  const p = model.hitChance[w];
  if (!model.canHit[w] || p <= 0) return undefined;
  const acc = model.accuracy?.[w]?.acc;
  const enticed = acc && acc > 0 ? Math.min(1, p / acc) : 1;
  const specsSaved = 1 / p - 1 / enticed;
  const energySaved = specsSaved * model.energy[w];
  const net = energySaved - ENTICE_ENERGY;
  if (net <= 0) return undefined;
  const label = SPEC_WEAPONS[weapon].label;
  const text = `Soulflame horn (Entice, ${ENTICE_ENERGY}% per ally) guarantees the hit: ${label} ${Math.round(p * 100)}% → ${Math.round(enticed * 100)}%, saves ≈ ${specsSaved.toFixed(1)} specs per landed drain (${Math.round(energySaved)}% energy, ${Math.round(net)}% net of the horn)`;
  return {
    weapon, label, hitChance: p, enticedChance: enticed, specsSaved, energySaved, hornEnergy: ENTICE_ENERGY, netEnergy: net, text,
  };
};

/** The horn's note for the weapons a drain plan uses: the weapon saving the most energy, undefined when none frees any. */
export const soulflameNote = (
  model: Pick<DrainModel, 'hitChance' | 'energy' | 'canHit' | 'accuracy'>,
  attempts: SpecWeapon[],
): string | undefined => {
  const best = ENTICE_WEAPONS.filter((w) => attempts.includes(w))
    .map((w) => soulflameSaving(model, w))
    .filter((s): s is SoulflameSaving => !!s)
    .sort((a, b) => b.netEnergy - a.netEnergy)[0];
  return best?.text;
};
