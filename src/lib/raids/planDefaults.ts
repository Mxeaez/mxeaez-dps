import type { SupplyCounts } from '@/lib/fracturedArchive/planner';
import type { ItemRef } from '@/lib/fracturedArchive/presets';

/**
 * Phase 21: the Plan tab's per-raid defaults (items always brought, non-item slots, supplies) and the items the raid
 * itself hands out (0 inventory slots in the planner). Data only (type imports only), so `src/lib/raids/base.ts` and
 * `planner.ts` can both use it without import cycles. Each raid's `RaidBase` points at one of these
 * (`defaultPinned`, `defaultNonItemSlots`, `defaultSupplies`, `raidSuppliedItems`); docs/BEST_SETUP.md, *Plan tab*,
 * lists them with their sources.
 *
 * Spec weapons are not listed here: they come from "My specs" (default Elder maul + Eye of Ayak) and are counted once
 * with the pinned items. The supply types are slot counts; in raids that make their own potions the brew / restore
 * counts stand for the raid's equivalents (CoX: Xeric's aid / Prayer enhance or Revitalisation; ToA: Nectar / Tears of
 * Elidinis, Sanfew serums before the Helpful Spirit).
 */
export interface RaidPlanDefaults {
  /** Items always brought (take a slot unless a loadout wears them). */
  pinned: ItemRef[];
  /** Non-equipment slots; the first is the rune pouch. */
  nonItemSlots: number;
  supplies: SupplyCounts;
  /**
   * Items the raid hands out (ToB: the Dawnbringer, picked up at Verzik): free to use in any loadout, 0 inventory
   * slots (the planner leaves them out of the carried-item union; a loadout's size still counts them, so wearing one in
   * place of a weapon costs no swap space).
   */
  raidSupplied: ItemRef[];
  /** Where the defaults come from (shown in docs; one line). */
  source: string;
}

const supplies = (s: Partial<SupplyCounts>): SupplyCounts => ({
  brew: 0, restore: 0, ranging: 0, superCombat: 0, magic: 0, food: 0, other: 0, ...s,
});

/**
 * The Fractured Archive: the user's own kit (2026-10-23): rune pouch, Lightbearer, Elder maul, Zaryte crossbow, Kodai
 * wand, Ancestral robe top, Elidinis' ward (f); 6 brews, 4 restores, 2 ranging, 1 super combat (phase 17 defaults).
 */
export const FA_PLAN_DEFAULTS: RaidPlanDefaults = {
  pinned: ['Lightbearer', 'Elder maul', 'Zaryte crossbow', 'Kodai wand', 'Ancestral robe top', 'Elidinis\' ward (f)'],
  nonItemSlots: 1,
  supplies: supplies({
    brew: 6, restore: 4, ranging: 2, superCombat: 1,
  }),
  raidSupplied: [],
  source: 'the user\'s kit (2026-10-23)',
};

/**
 * Tombs of Amascut. Strategies (https://oldschool.runescape.wiki/w/Tombs_of_Amascut/Strategies, read 2026-10-23), the
 * max-gear inventory: Zaryte crossbow, Lightbearer, six Sanfew serums, one Divine super combat, Divine rune pouch (no
 * brews: "Players can no longer eat food within the raid" at higher invocations). Supplies (Smelling salts, Nectar,
 * Tears of Elidinis, Silk dressing) come from the Helpful Spirit "once after completing two paths, and once again after
 * completing the remaining two paths" (Tombs of Amascut page), so they replace the brought potions on the way: 6
 * restores (Sanfew serum, later Tears / Nectar) + 2 "Other" (Smelling salts, the raid's boost for every style: no
 * combat potions, `boostsNeedSupplies: false`). Elder maul comes from "My specs".
 */
export const TOA_PLAN_DEFAULTS: RaidPlanDefaults = {
  pinned: ['Lightbearer', 'Zaryte crossbow'],
  nonItemSlots: 1,
  supplies: supplies({ restore: 6, other: 2 }),
  raidSupplied: [],
  source: 'Tombs of Amascut/Strategies max inventory (Zaryte crossbow, Lightbearer, 6 Sanfew serums, rune pouch); salts from the Helpful Spirit',
};

/**
 * Chambers of Xeric. Strategies (https://oldschool.runescape.wiki/w/Chambers_of_Xeric/Strategies, read 2026-10-23):
 * "If guardians are in the raid, bring the best pickaxe possible" (Dragon pickaxe; the Crystal pickaxe is only lighter);
 * specials "Bandos godsword + Elder maul > Dragon warhammer" for Tekton ("The first special attack made by a dragon
 * warhammer or elder maul will always hit"); every example inventory has a rune pouch. Overloads, Xeric's aids,
 * Revitalisations and Prayer enhances are made in the raid (and dropped by Tekton, Vasa, Vanguards, Vespula,
 * Muttadiles) — the boost is always Overload (+) (`boostsNeedSupplies: false`), so the default carries a small stock
 * between rooms: 2 brew (Xeric's aid) + 2 restore (Prayer enhance / Revitalisation) + 1 Other (Overload). Olm itself
 * wants more ("each player should have at least one overload, one prayer enhance, 2-3 restores and 6-7 brews"): raise
 * the counts for an Olm-only plan.
 */
export const COX_PLAN_DEFAULTS: RaidPlanDefaults = {
  pinned: ['Dragon pickaxe', 'Elder maul'],
  nonItemSlots: 1,
  supplies: supplies({ brew: 2, restore: 2, other: 1 }),
  raidSupplied: [],
  source: 'Chambers of Xeric/Strategies (pickaxe for Guardians, Elder maul for Tekton, rune pouch); potions made in the raid',
};

/**
 * Theatre of Blood. Strategies (https://oldschool.runescape.wiki/w/Theatre_of_Blood/Strategies, read 2026-10-23): the
 * max-gear inventories bring Elder maul (+ Bandos godsword, Dragon claws), a rune pouch, 1 brew, 1 restore, combat /
 * ranging potions and food; "Additional supplies ... are available after each death and after defeating Pestilent Bloat
 * and Sotetseg", and the chests sell Saradomin brews and Super restores — so the default stock is moderate: 4 brew,
 * 3 restore, 1 ranging, 1 super combat, 1 Saturated heart (ToB has no raid boost: the potions are brought). The
 * Dawnbringer is the raid's own item ("Used to break Verzik Vitur's shield during the first phase"): 0 slots, not pinned.
 * Lightbearer isn't in the Strategies inventories: not pinned.
 */
export const TOB_PLAN_DEFAULTS: RaidPlanDefaults = {
  pinned: ['Elder maul'],
  nonItemSlots: 1,
  supplies: supplies({
    brew: 4, restore: 3, ranging: 1, superCombat: 1, magic: 1,
  }),
  raidSupplied: ['Dawnbringer'],
  source: 'Theatre of Blood/Strategies inventories (Elder maul, rune pouch); brews / restores topped up from the chests after Bloat and Sotetseg; Dawnbringer from the raid',
};
