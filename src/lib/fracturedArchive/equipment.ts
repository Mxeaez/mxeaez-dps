import { Monster } from '@/types/Monster';
import { Player } from '@/types/Player';
import { Spellement } from '@/types/Spell';
import { Factor } from '@/lib/Math';
import { HitDistribution, Hitsplat, WeightedHit } from '@/lib/HitDist';

// Fractured Archive rewards (phase 7b). Sources (2026-10-22): the item pages on https://oldschool.runescape.wiki
// (Obligator, Zorya's tome, Ascension crossbows, Diamond/Onyx ascension bolts (e), Rondache, Fragment of *, Zeal),
// the raid page's Rewards section and the news posts quoted on them. Details and unverified bits: docs/DATA_SOURCES.md
// ("Equipment"). Upstream files only call into this module.

// --- Obligator ---------------------------------------------------------------------------------------------------

export const OBLIGATOR = 'Obligator';

/** "In the thrust combat style, the Obligator makes two damage rolls per attack." */
export const OBLIGATOR_BASE_DAMAGE_ROLLS = 2;

/** Attack speed of the "Smash" style ("a faster attack speed of 3 ticks"); "Thrust" uses the item's 5. */
export const OBLIGATOR_SMASH_ATTACK_SPEED = 3;

/**
 * "it gains 20% or 40% bonus damage against 2x2- and 3x3-sized (or bigger) targets respectively", stated under the
 * thrust style ("lose its damage re-rolls and multi-target capabilities in exchange for faster attacks" for smash).
 * Applied to each hit after the best roll is picked ("20% or 40% of the player's hit", development history);
 * **unverified**: whether it is applied per hit or to the max hit, and whether smash also gets it (modelled: no).
 */
export const OBLIGATOR_SIZE_BONUS_PERCENT: [minSize: number, percent: number][] = [
  [3, 40],
  [2, 20],
];

const isWieldingObligator = (player: Player): boolean => player.equipment.weapon?.name === OBLIGATOR;

export const isObligatorThrust = (player: Player): boolean => isWieldingObligator(player)
  && player.style.type === 'crush'
  && player.style.name === 'Thrust';

/**
 * Two rolls, plus one more for each of stab and slash defence that is higher than crush defence: Phosani's Nightmare
 * (stab and slash above crush) gets four, General Graardor (all equal) gets two.
 */
export const getObligatorDamageRolls = (monster: Monster): number => {
  const { stab, slash, crush } = monster.defensive;
  return OBLIGATOR_BASE_DAMAGE_ROLLS + (stab > crush ? 1 : 0) + (slash > crush ? 1 : 0);
};

export const getObligatorSizeBonusPercent = (size: number): number => OBLIGATOR_SIZE_BONUS_PERCENT
  .find(([minSize]) => size >= minSize)?.[1] ?? 0;

/**
 * One accuracy roll; on a hit the damage is the best of `rolls` independent uniform rolls in [min, max]
 * ("After all possible damage rolls are made, it picks the best of them as its damage"), so
 * P(damage <= d) = ((d - min + 1) / (max - min + 1)) ^ rolls. **Unverified**: the wiki says "damage rolls", read as
 * a single accuracy roll (not one accuracy roll per damage roll).
 */
export const bestOfRollsHitDistribution = (accuracy: number, min: number, max: number, rolls: number): HitDistribution => {
  const d = new HitDistribution([]);
  const n = max - min + 1;
  for (let dmg = min; dmg <= max; dmg++) {
    const below = (dmg - min) / n;
    const atOrBelow = (dmg - min + 1) / n;
    d.addHit(new WeightedHit(accuracy * (atOrBelow ** rolls - below ** rolls), [new Hitsplat(dmg)]));
  }
  d.addHit(new WeightedHit(1 - accuracy, [Hitsplat.INACCURATE]));
  return d;
};

/** Thrust-style Obligator hit distribution: best-of-N damage, then the size bonus. */
export const obligatorHitDistribution = (accuracy: number, min: number, max: number, monster: Monster): HitDistribution => {
  const dist = bestOfRollsHitDistribution(accuracy, min, max, getObligatorDamageRolls(monster));
  const bonus = getObligatorSizeBonusPercent(monster.size);
  return bonus > 0 ? dist.scaleDamage(100 + bonus, 100) : dist;
};

/** Hook for calculateAttackSpeed: the smash style attacks every 3 ticks. */
export const getObligatorAttackSpeed = (player: Player): number | undefined => {
  if (isWieldingObligator(player) && player.style.name === 'Smash') {
    return OBLIGATOR_SMASH_ATTACK_SPEED;
  }
  return undefined;
};

// --- Zorya's tome ------------------------------------------------------------------------------------------------

export const ZORYAS_TOME = "Zorya's tome";

/**
 * "It has a 3-tick attack rate and a base max hit of 18". The wiki gives no formula; modelled as a flat 18 at every
 * Magic level (**unverified**: it may scale with Magic like other powered staves, e.g. floor(magic / 3) - 15 which is
 * also 18 at 99).
 */
export const ZORYAS_TOME_BASE_MAX_HIT = 18;

/** Zorya's flow: "50% of the player's special attack energy". */
export const ZORYAS_TOME_SPEC_COST = 50;

/** "150% increased accuracy" = x2.5 attack roll (**unverified**: applied to the attack roll like other specs). */
export const ZORYAS_TOME_SPEC_ACCURACY: Factor = [5, 2];

/** "60% increased damage" = x1.6 max hit, applied after magic damage (**unverified** ordering). */
export const ZORYAS_TOME_SPEC_DAMAGE: Factor = [8, 5];

/**
 * After a successful spec "the next three attacks from the tome are buffed, gaining the same 150% accuracy and 60%
 * damage increase while attacking every 2 ticks". Not modelled by the calculator (spec DPS is the spec hit only);
 * exported for the gear finder.
 */
export const ZORYAS_TOME_EMPOWERED_ATTACKS = 3;
export const ZORYAS_TOME_EMPOWERED_ATTACK_SPEED = 2;

// --- Ascension crossbows -----------------------------------------------------------------------------------------

export const ASCENSION_CROSSBOWS_ID = 34681;

/** "The crossbows can only fire ascension bolts, alongside their gem-tipped variants." */
export const ASCENSION_BOLT_IDS = [
  34684, // Ascension bolts
  34690, // Diamond ascension bolts
  34696, // Diamond ascension bolts (e)
  34702, // Onyx ascension bolts
  34708, // Onyx ascension bolts (e)
];

/**
 * Enchanted ascension bolts use the regular bolt effects ("the armour-piercing Diamond bolts, or the high-roller
 * life-leech Onyx bolts", rewards poll blog). **Unverified**: same proc chances and damage as the normal (e) bolts.
 */
export const DIAMOND_ASCENSION_BOLTS_E = 'Diamond ascension bolts (e)';
export const ONYX_ASCENSION_BOLTS_E = 'Onyx ascension bolts (e)';

// --- Elemental fragments -----------------------------------------------------------------------------------------

/**
 * Fragments of whispering wind / deep water / living earth / burning fire are not equipped: breaking one
 * "permanently increase[s] the base max hit of [element] spells by 2. This damage bonus is added before magic damage
 * and elemental weakness modifiers are applied". Modelled as a player unlock per element (buffs.elementalFragments).
 */
export const ELEMENTAL_FRAGMENT_MAX_HIT_BONUS = 2;

export const ELEMENTAL_FRAGMENT_NAMES: Record<Spellement, string> = {
  air: 'Fragment of whispering wind',
  water: 'Fragment of deep water',
  earth: 'Fragment of living earth',
  fire: 'Fragment of burning fire',
};

/** Base max hit bonus for the player's spell from unlocked fragments (0 for non-elemental spells and powered staves). */
export const getElementalFragmentBonus = (player: Player): number => {
  const element = player.spell?.element;
  if (!element || !player.buffs.elementalFragments?.[element]) {
    return 0;
  }
  return ELEMENTAL_FRAGMENT_MAX_HIT_BONUS;
};
