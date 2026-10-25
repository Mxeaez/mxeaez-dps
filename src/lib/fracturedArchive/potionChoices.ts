import Potion from '@/enums/Potion';
import { PotionMap } from '@/utils';
import { StyleGroup } from '@/lib/fracturedArchive/presets';

/**
 * Phase 34: the Assumptions box's potion / Heart pickers are custom lists with icons (native selects can't show images).
 * The relevant choices come first and the rest are under "more"; together they are exactly the old select's options.
 */

/** Every potion, in the calculator's order (the old selects' option list). */
export const POTION_OPTIONS: Potion[] = (Object.keys(PotionMap) as unknown as string[])
  .map((k) => Number(k) as Potion)
  .sort((a, b) => PotionMap[a].order - PotionMap[b].order);

export const HEART_POTIONS: Potion[] = [Potion.SATURATED_HEART, Potion.IMBUED_HEART];

/** The relevant choices per style, first in the list. */
export const RELEVANT_POTIONS: Record<StyleGroup, Potion[]> = {
  melee: [Potion.SUPER_COMBAT, Potion.OVERLOAD_PLUS, Potion.SMELLING_SALTS],
  ranged: [Potion.RANGING, Potion.OVERLOAD_PLUS, Potion.SMELLING_SALTS],
  magic: [Potion.SATURATED_HEART, Potion.IMBUED_HEART, Potion.OVERLOAD_PLUS, Potion.SMELLING_SALTS],
};

/**
 * The old select's options for a style: every potion, or (`heart`: the raids where the magic boost is a brought heart)
 * the two hearts plus the current value.
 */
export const potionOptions = (current: Potion, heart: boolean): Potion[] => (heart
  ? POTION_OPTIONS.filter((p) => HEART_POTIONS.includes(p) || p === current)
  : POTION_OPTIONS);

/** The options split into the relevant ones (first) and the rest ("more"), each in a stable order. */
export const potionChoices = (group: StyleGroup, current: Potion, heart: boolean): { primary: Potion[], more: Potion[] } => {
  const options = potionOptions(current, heart);
  const primary = RELEVANT_POTIONS[group].filter((p) => options.includes(p));
  return { primary, more: options.filter((p) => !primary.includes(p)) };
};
