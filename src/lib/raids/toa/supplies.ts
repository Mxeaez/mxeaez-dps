import Potion from '@/enums/Potion';
import { BestSetupAssumptions, DEFAULT_ASSUMPTIONS, StyleGroup } from '@/lib/fracturedArchive/presets';
import type { BestSetupTarget } from '@/lib/raids/types';

/**
 * Phase 38a: ToA supplies by room. The raid's supplies (Smelling salts, Liquid adrenaline, Nectar, Tears) come from the
 * Helpful Spirit, which appears after any two paths and again before the Wardens (user, 2026-10-25: "supplies come
 * after any 2 rooms, then after all 4 before the warden"; wiki Tombs of Amascut: "They can be claimed from the spirit
 * once after completing two paths, and once again after completing the remaining two paths and before proceeding to"
 * the Wardens). So
 * the first two rooms of the route are fought with the user's normal potions (Super combat, Ranging potion, the
 * Saturated heart: the Fractured Archive's defaults), the 3rd room on with the raid potion. ToA's route is fixed
 * (Kephri, Zebak, Akkha, Ba-Ba, then the Wardens; the real path order is the team's choice), so Kephri and Zebak are
 * the rooms before the supplies. Slot-neutral: the normal potions are assumed to sit in the slots the raid's supplies
 * take later (UNVERIFIED D31). Liquid adrenaline (spec cost) is phase 38b; Nectar / Tears change no DPS.
 *
 * Mechanism: the rooms before the supplies query their own copies of the targets (`<key>-before-supplies`, same
 * monster, `beforeSupplies`), and every DPS / drain computation of such a target uses `assumptionsForTarget`.
 */

/** The rooms (route positions) fought before the first supply drop. */
export const TOA_ROOMS_BEFORE_SUPPLIES = 2;

/** ToA's own boost (the "Other" supply); every other potion is kept as it is. */
export const TOA_RAID_POTIONS: Potion[] = [Potion.SMELLING_SALTS];

/** The normal potion per style the rooms before the supplies use instead of the raid potion. */
export const NORMAL_POTIONS: Record<StyleGroup, Potion> = { ...DEFAULT_ASSUMPTIONS.potions };

export const BEFORE_SUPPLIES_SUFFIX = '-before-supplies';

/** The key of a target's copy for the rooms before the supplies. */
export const beforeSuppliesKey = (key: string): string => (key.endsWith(BEFORE_SUPPLIES_SUFFIX) ? key : `${key}${BEFORE_SUPPLIES_SUFFIX}`);

/** The copies of these targets for the rooms before the supplies (not in the Search list or the Summary). */
export const beforeSuppliesTargets = (targets: BestSetupTarget[]): BestSetupTarget[] => targets.map((t) => ({
  ...t,
  key: beforeSuppliesKey(t.key),
  label: `${t.label} (before supplies)`,
  noSummary: true,
  beforeSupplies: true,
}));

/**
 * The assumptions a target's DPS and drains are computed with: a target fought before the supplies swaps the raid
 * potion for the normal potion of each style (`withoutPotion` kept: a style without its boost stays without). Any other
 * target gets the same object back.
 */
export const assumptionsForTarget = (target: Pick<BestSetupTarget, 'beforeSupplies'>, a: BestSetupAssumptions): BestSetupAssumptions => {
  if (!target.beforeSupplies) return a;
  const groups = Object.keys(a.potions) as StyleGroup[];
  if (!groups.some((g) => TOA_RAID_POTIONS.includes(a.potions[g]))) return a;
  return {
    ...a,
    potions: Object.fromEntries(groups.map((g) => [g, TOA_RAID_POTIONS.includes(a.potions[g]) ? NORMAL_POTIONS[g] : a.potions[g]])) as Record<StyleGroup, Potion>,
  };
};
