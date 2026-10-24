import type { SupplyCounts } from '@/lib/fracturedArchive/planner';
import type { ItemRef } from '@/lib/fracturedArchive/presets';

/** The heart's name in the pinned lists (a pseudo item: planner.ts `HEART_ITEMS`). */
export const SATURATED_HEART = 'Saturated heart';

/**
 * Phase 21: the Plan tab's per-raid defaults (items always brought, non-item slots, supplies) and the items the raid
 * itself hands out (0 inventory slots in the planner). Data only (type imports only), so `src/lib/raids/base.ts` and
 * `planner.ts` can both use it without import cycles. Each raid's `RaidBase` points at one of these
 * (`defaultPinned`, `defaultNonItemSlots`, `defaultSupplies`, `raidSuppliedItems`); docs/BEST_SETUP.md, *Plan tab*,
 * lists them with their sources.
 *
 * The magic boost is a heart (`SATURATED_HEART`: reusable, one slot for the whole raid; nobody brings magic potions), so
 * it is a pinned item, not a supply: pinned by default where the potions are brought (FA, ToB). ToA / CoX don't pin it:
 * their raid potion (Smelling salts / Overload, the "Other" supply) boosts magic too.
 *
 * Phase 30: the pinned lists are empty (the user's decision, ROADMAP round 4: the planner decides the styles, so nothing
 * is "always brought"; the list is for the user's own additions) — except the heart in FA / ToB until phase 31 makes it
 * magic's kit potion. CoX's Dragon pickaxe needs no pin: the Guardians take damage from pickaxes only, so the planner
 * adds the pickaxe switch itself (it is in the CoX pool and presets).
 *
 * Spec weapons are not listed here (phase 29: the Elder maul the FA / CoX / ToB lists had is gone too): the Plan tab's
 * planner decides them (Solo: the subset search; Team: your share of the team's carriers), or "Specs I bring" does
 * when picked; they are counted once with the pinned items. The supply types are slot counts; in raids that make their own potions the brew / restore
 * counts stand for the raid's equivalents (CoX: Xeric's aid / Prayer enhance or Revitalisation; ToA: Nectar / Tears of
 * Elidinis, Sanfew serums before the Helpful Spirit).
 */
export interface RaidPlanDefaults {
  /** Items always brought (take a slot unless a loadout wears them). */
  pinned: ItemRef[];
  /** Non-equipment slots; the first is the rune pouch. */
  nonItemSlots: number;
  /** Comfort supplies (brew, restore, food, other); phase 27: ranging / super combat stay 0 (derived from the kit). */
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
  brew: 0, restore: 0, ranging: 0, superCombat: 0, food: 0, other: 0, ...s,
});

/**
 * The Fractured Archive: the user's own kit (2026-10-23): rune pouch, Lightbearer, Elder maul, Zaryte crossbow, Kodai
 * wand, Ancestral robe top, Elidinis' ward (f) (phase 30: the items left the pinned list, the planner decides); 6 brews,
 * 4 restores (phase 17 defaults; phase 27: the 2 ranging / 1 super combat became one potion per style in the kit,
 * derived by the planner); and a Saturated heart (the magic boost, user correction 2026-10-23: "Nobody uses magic
 * potions, they use Saturated heart").
 */
export const FA_PLAN_DEFAULTS: RaidPlanDefaults = {
  pinned: [SATURATED_HEART],
  nonItemSlots: 1,
  supplies: supplies({ brew: 6, restore: 4 }),
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
 * combat potions, `boostsNeedSupplies: false`). Spec weapons: the planner (phase 29).
 */
export const TOA_PLAN_DEFAULTS: RaidPlanDefaults = {
  pinned: [],
  nonItemSlots: 1,
  supplies: supplies({ restore: 6, other: 2 }),
  raidSupplied: [],
  source: 'Tombs of Amascut/Strategies max inventory (6 Sanfew serums, rune pouch; phase 30: the planner decides the gear); salts from the Helpful Spirit',
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
  pinned: [],
  nonItemSlots: 1,
  supplies: supplies({ brew: 2, restore: 2, other: 1 }),
  raidSupplied: [],
  source: 'Chambers of Xeric/Strategies (rune pouch; the planner adds the pickaxe for the Guardians and picks the spec weapons); potions made in the raid',
};

/**
 * Theatre of Blood. Strategies (https://oldschool.runescape.wiki/w/Theatre_of_Blood/Strategies, read 2026-10-23): the
 * max-gear inventories bring Elder maul (+ Bandos godsword, Dragon claws), a rune pouch, 1 brew, 1 restore, combat /
 * ranging potions and food; "Additional supplies ... are available after each death and after defeating Pestilent Bloat
 * and Sotetseg", and the chests sell Saradomin brews and Super restores — so the default stock is moderate: 4 brew,
 * 3 restore (phase 27: the kit's potions — 1 Super combat / 1 Ranging potion per style present — are derived by the
 * planner), and a pinned Saturated heart (ToB has no raid boost: the potions are brought). The
 * Dawnbringer is the raid's own item ("Used to break Verzik Vitur's shield during the first phase"): 0 slots, not pinned.
 * Lightbearer isn't in the Strategies inventories: not pinned.
 */
export const TOB_PLAN_DEFAULTS: RaidPlanDefaults = {
  pinned: [SATURATED_HEART],
  nonItemSlots: 1,
  supplies: supplies({ brew: 4, restore: 3 }),
  raidSupplied: ['Dawnbringer'],
  source: 'Theatre of Blood/Strategies inventories (Elder maul, rune pouch); brews / restores topped up from the chests after Bloat and Sotetseg; Dawnbringer from the raid',
};
