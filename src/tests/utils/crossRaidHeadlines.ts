import { describe, expect, test } from '@jest/globals';
import { generateEmptyPlayer } from '@/state';
import {
  compareRoutes, createKitEvaluator, formatDuration, KitLoadout, raidTimeAssumptionsFrom, specBudgetFrom,
} from '@/lib/fracturedArchive/raidTime';
import { budgetGroups } from '@/lib/fracturedArchive/encounterBudget';
import {
  comfortSupplies, DEFAULT_RING_POLICY, PlanResult, planAssumptions, planItemByName, ringAssumptions, toPlayerEquipment,
} from '@/lib/fracturedArchive/planner';
import { applyLoadoutToPlayer } from '@/lib/fracturedArchive/loadout';
import { RaidConfig, raidConfig } from '@/lib/raids';
import {
  cpuSeconds, memoWithin, normalised, phase37Fixture,
} from '@/tests/utils/phase37';
import { planFor } from '@/tests/utils/crossRaid';
import {
  FA_NOT_OWNED, headline, HeadlineName, headlineOf,
} from '@/tests/utils/headlines';

// Phase 37: CrossRaid's slow headline tests, moved here unchanged so two test files (CrossRaidHeadlines.test.ts: FA,
// ToA, ToB; CrossRaidHeadlinesCox.test.ts: CoX and FA without Obligator / Ascension) run them in parallel Jest workers.

/**
 * The four headline plan totals (default assumptions and Plan inputs, camp one ring, Team drains, compare all;
 * docs/BEST_SETUP.md, *Plan tab*; scripts/verifyPhase21.mjs reads the same numbers in the browser). A full default plan
 * per raid takes 1-2 min here (camp one ring screens six rings), so this block only runs with `RUN_SLOW_TESTS=1`
 * (`$env:RUN_SLOW_TESTS=1; node .yarn/releases/yarn-4.9.2.cjs test CrossRaid`); the fast pins (CrossRaid.test.ts) run always.
 */
// phase 25 (rupture / Seeking dragon arrows / Elemental amulet in the pool): CoX 6:41.9 → 6:39.9, ToB 7:32.2 → 7:32.4.
// Phase 27 (potions from the kit, camp one ring by default): FA 23:30.4 → 22:47.9 (camp Ultor ring; 1 Super combat +
// 1 Ranging potion instead of 2 ranging + 1 super combat frees a slot; allow switches would be 22:47.7); ToA 14:20.2 →
// 14:22.3 (camp Magus ring; switches 14:20.2); CoX 6:39.9 → 6:40.3 (camp Ultor ring; switches 6:39.9); ToB 7:32.4 →
// 7:31.7 (camp Ultor ring: no ring switch items, the freed slots buy a better kit; switches 7:32.4).
// Phase 29 (the planner decides the spec weapons; no Elder maul in the pinned defaults; Team = your share of the
// team's carriers, "assign me"): FA 22:47.9 → 21:53.0 (the default "My specs" Elder maul + Eye of Ayak no longer take
// two slots; Tonalztics, the most-needed weapon, goes in a free slot); ToA 14:22.3 → 14:10.5 (no spec weapon: the slot is
// worth 6.2 s of gear); CoX 6:40.3 → 6:36.3 (none: 3.4 s); ToB 7:31.7 → 7:30.6 (Tonalztics: its slot was worth 0.5 s).
// Phase 29 review (the planner picks the team's carriers: greedy on route time, the Team drains use them): FA 21:53.0
// (2 Elder maul + 2 Tonalztics = the Advanced counts minus the Ayak carrier, which saves nothing without a magic kit);
// ToA 14:10.5 → 13:19.6 (1 Elder maul + 5 Eye of Ayak, camp Magus ring); CoX 6:36.3 (2 maul, 2 Tonalztics, 1 BGS,
// 1 Ayak); ToB 7:30.6 → 7:30.0 (2 Tonalztics, 1 maul).
// Phase 30 (empty pinned defaults; FA / ToB keep the heart): FA 21:53.0 → 21:44.4 (of the 5 freed slots, 2 carry a
// second ranged weapon: Ascension crossbows + diamond bolts (e) worn, the Twisted bow + Seeking dragon arrows a switch;
// Archive Guardian 190.7 → 182.1 s; 3 slots stay free); ToA 14:10.6 → 14:06.0 (Lightbearer + Zaryte crossbow freed: a
// Twisted bow + Seeking dragon arrows switch, Zebak 126.5 → 121.9 s);
// CoX 6:36.3 (the planner adds the Dragon pickaxe switch for the Guardians itself: the same kit); ToB 7:30.0 (only the
// heart was pinned).
// Phase 31 (Dizana's quiver holds a second arrow / bolt type; the heart is magic's kit potion, no longer pinned): FA
// 21:44.4 (the quiver holds the Seeking dragon arrows and the unused pinned heart is gone: 2 more free slots, 5 in all,
// nothing saves ≥ 1 s per slot); ToA 14:06.0 → 14:04.1 (the quiver holds the diamond ascension bolts (e); the slot buys
// a Keris partisan of breaching loadout, Kephri 147.7 → 145.8 s); CoX 6:36.3 → 6:35.9 (the quiver holds the diamond
// ascension bolts (e) beside the Seeking dragon arrows; the kit re-shuffled: Inquisitor's + Obligator worn, Twisted bow
// + Scorching bow switches, Tekton 16.3 → 14.4 s); ToB 7:30.0 (the heart now a kit potion for its Shadow switch: the
// same slots).
// Phase 32 (no Rada's blessing in the melee / magic loadouts; a loadout without ammo keeps the kit's ammo in its ammo
// slot): FA 21:44.4 (same kit; the melee switch is 9 items: 6 free, was 5); ToA 14:04.1 and CoX 6:35.9 (same kits; the
// worn melee set keeps the diamond ascension bolts (e) in its ammo slot: the freed slot carries your share, ToA Eye of
// Ayak, CoX Tonalztics); ToB 7:30.0 → 7:29.5 (the freed slots turn the Tumeken's shadow partial switch into the full
// Tumeken's shadow (Ancestral) loadout: Nylocas 41.5 → 41.0 s).
// Phase 35 (no specs on adds: they rank at full Defence): FA 21:44.4 and ToB 7:29.5 (no adds in their time models);
// ToA 14:04.1 → 14:12.1 (same kit; Akkha 138.5 → 144.5 s: the 4 shadows 42.8 → 48.8; Kephri 145.8 → 147.8: the overlord
// scarabs 17.8 → 19.8; the Tonalztics carrier, worth 3.5 s mostly on adds, is dropped: 1 Elder maul + 1 Eye of Ayak; your
// share Elder maul, was Eye of Ayak); CoX 6:35.9 → 7:01.3 (Mystics 31.8 → 43.9, Shamans 25.1 → 29.7, Vespula 19.3 → 23.4:
// the portal 12.2 → 15.8, Vasa 18.5 → 21.8: the crystals 5.6 → 8.9, Muttadiles 21.6 → 22.8: the small one 11.0 → 12.3;
// one Tonalztics carrier fewer: 2 Elder maul, 1 Tonalztics, 1 BGS, 1 Eye of Ayak; your share Elder maul, was Tonalztics).
// Phase 36 (one spec budget per encounter; damage specs; the surge potion; the wiki's Kephri / Warden / Olm resets): FA
// 21:44.4 → 21:04.9 (Bring Zaryte crossbow + Burning claws + a Surge potion, a dose at Ocellus; carriers 2 Elder maul + 4
// Tonalztics); ToA 14:12.1 → 14:05.5 (Bring Voidwaker; 1 Elder maul + 1 Eye of Ayak); CoX 7:01.3 → 7:03.6 (Bring Dragon
// claws; Olm's phases re-drained from one budget: slower; carriers 4 Elder maul + 2 Tonalztics); ToB 7:29.5 → 7:21.2 (Bring Dragon claws; 2 Elder maul + 2
// Tonalztics).
// Phase 36 review (one spec bar per party member: with damage specs / doses you are not a carrier, carriers ≤ party − 1;
// damage specs valued at the hp left at the phase's start; regen on the drained clock): FA 21:04.9 → 21:07.7 (2 Elder
// maul + 3 Tonalztics); ToA 14:05.5 → 14:07.8 (1 Elder maul + 1 Eye of Ayak, Voidwaker); CoX 7:03.6 → 7:08.7 (3 Elder
// maul + 1 BGS + 1 Tonalztics, Dragon claws); ToB 7:21.2 → 7:23.4 (1 Elder maul + 2 Tonalztics, Dragon claws).
// Phase 37b: the totals (and the rest of each headline: kit, carriers, items, encounters) come from
// src/tests/fixtures/headlines.json; `node scripts/pinHeadlines.mjs` re-pins them after a numbers phase.
export const HEADLINE_NAME: Record<string, HeadlineName> = {
  'fractured-archive': 'fa', toa: 'toa', cox: 'cox', tob: 'tob',
};
export const HEADLINES: [string, string, number][] = Object.entries(HEADLINE_NAME)
  .map(([id, n]) => [id, headline(n).total, headline(n).seconds]);

// Phase 28: the FA plan without Obligator and Ascension crossbows ("Items I don't own"; phase 26 pinned 25:46.8 with
// switches and the old potions, before phase 27). Phase 28 (camp one ring, potions from the kit): 25:24.5, camping
// Lightbearer (the pinned Lightbearer is worn, which frees its slot; Magus / Ultor screens ≥ 36 s slower); kit Twisted
// bow (Masori) worn + Inquisitor's + Scythe (slash).
// Phase 29 (planner decides the spec weapons): 25:24.5 → 24:53.8, camping Ultor ring; Tonalztics in a free slot.
// Phase 30 (empty pinned defaults): 24:53.8 → 24:45.3; the 5 freed slots + Tonalztics' slot buy a Tumeken's shadow
// (Ancestral) loadout (the pinned heart, unused before, now boosts it), the Twisted bow a partial switch on it, the route
// via Bork + Smorks; no spec weapon (your last slot is worth 8.5 s of gear).
// Phase 32 (no blessing; kept ammo): 24:45.3 → 24:34.1; the worn Twisted bow partial switch on the Tumeken's shadow
// becomes the full Twisted bow (Masori) loadout (Archive Guardian 198.9 → 196.5, Ocellus 775.4 → 767.3 s).
// Phase 36 (one spec budget per encounter; damage specs; the surge potion): 24:34.1 → 24:05.1; phase 36 review: 24:11.9
export const ONLY_OWNED_HEADLINE: [string, number] = [headline('faNotOwned').total, headline('faNotOwned').seconds];
export { FA_NOT_OWNED };

/**
 * Phase 28: the total re-computed outside the planner from the returned kit: each kit loadout as a KitLoadout
 * (applyLoadoutToPlayer with the plan's assumptions and the camped ring's flag), compareRoutes over the raid's routes.
 */
export const recomputed = (raid: RaidConfig, res: PlanResult): number => {
  const pinned = raid.planDefaults.pinned.map((n) => planItemByName(n).id);
  const ringA = ringAssumptions(planAssumptions(raid.defaultAssumptions, comfortSupplies(raid.defaultSupplies), pinned), DEFAULT_RING_POLICY, res.ring.ring ? { name: res.ring.ring } : null);
  // phase 29 review: the Team drains use the planner's carriers
  const planA0 = res.specs.team?.carriers ? { ...ringA, team: { ...ringA.team, carriers: res.specs.team.carriers } } : ringA;
  // phase 36: and your damage spec weapons / Surge potions (the spec budget spends your energy on them)
  const planA = { ...planA0, damageSpecs: res.specs.damage ?? [], surgePotions: res.specs.surgePotions ?? 0 };
  const base = generateEmptyPlayer();
  const loadouts: KitLoadout[] = res.kit.map((c) => {
    const eq = toPlayerEquipment(c.equipment);
    return {
      id: c.key,
      name: c.label,
      group: c.group,
      options: c.options,
      toPlayer: (m, o, ta) => applyLoadoutToPlayer(base, c.label, c.group, eq, o.style, o.spell, m, ta ?? planA),
    };
  });
  const cmp = compareRoutes(createKitEvaluator(loadouts, planA), raidTimeAssumptionsFrom(planA, 'team', raid.defaultTimeSettings, raid.time));
  return cmp.routes[cmp.fastest].seconds;
};

/**
 * Phase 37: each headline plan is also compared with the plan the phase 36 planner returned (bit-identical, every field
 * but the run statistics: src/tests/utils/phase37.ts); its memo counters must stay near the recorded ones (`memoWithin`:
 * deterministic, catches a memo that stops working) and its CPU time within a catastrophe-only budget (5× its phase 37
 * time alone on the dev machine — FA 22 s, ToA 36 s, ToB 25 s, CoX 63 s, FA without Obligator / Ascension 61 s — since
 * under the parallel slow suites a plan's CPU time is 3-4× its time alone).
 */
export const PHASE37_FIXTURE: Record<string, [string, number]> = {
  'fractured-archive': ['fa', 110], toa: ['toa', 180], cox: ['cox', 315], tob: ['tob', 125],
};

/** Registers the slow headline tests of these raids (and, with `notOwned`, the FA plan without Obligator / Ascension). */
export const headlineTests = (ids: string[], notOwned: boolean): void => (process.env.RUN_SLOW_TESTS ? describe : describe.skip)('headline plan totals (slow)', () => {
  const cases = HEADLINES.filter((h) => ids.includes(h[0]));
  if (cases.length) {
    test.each(cases)('%s: %s', (id, text, seconds) => {
      const raid = raidConfig(id as RaidConfig['id']);
      const { result: res, seconds: cpu } = cpuSeconds(() => planFor(raid, false));
      expect(normalised(res)).toEqual(phase37Fixture(PHASE37_FIXTURE[id][0]));
      expect(memoWithin(res, PHASE37_FIXTURE[id][0])).toBe(true);
      expect(cpu).toBeLessThan(PHASE37_FIXTURE[id][1]);
      const total = res.comparison!.routes[res.planned].seconds;
      expect(Math.abs(total - seconds)).toBeLessThanOrEqual(1e-6);
      expect(formatDuration(total)).toBe(text);
      // phase 37b: the whole headline (kit, ring, carriers, items, your share, encounters) = the fixture
      expect(headlineOf(HEADLINE_NAME[id], res)).toEqual(headline(HEADLINE_NAME[id]));
      // phase 28: independent re-computation, the camped ring on every loadout, within 28 slots
      expect(Math.abs(recomputed(raid, res) - total)).toBeLessThan(1e-6);
      expect(res.kit.every((c) => c.equipment.ring?.name === res.ring.ring)).toBe(true);
      expect(res.slots!.used).toBeLessThanOrEqual(28);
      // phase 36 review: one spec bar per party member — the carriers, plus yours when you damage-spec / drink doses
      const carriers = Object.values(res.specs.team?.carriers ?? {}).reduce((t, v) => t + v, 0);
      const mine = (res.specs.damage ?? []).length > 0 || (res.specs.surgePotions ?? 0) > 0 ? 1 : 0;
      expect(carriers + mine).toBeLessThanOrEqual(raid.defaultAssumptions.partySize);
      const budget = specBudgetFrom({
        ...raid.defaultAssumptions,
        team: { ...raid.defaultAssumptions.team, carriers: { ...raid.defaultAssumptions.team.carriers, ...res.specs.team?.carriers } },
        damageSpecs: res.specs.damage ?? [],
        surgePotions: res.specs.surgePotions ?? 0,
      }, 'team')!;
      expect(budgetGroups(budget).reduce((t, g) => t + g.count, 0)).toBe(carriers + mine);
    }, 600000);
  }

  if (notOwned) {
    test(`fractured-archive without ${FA_NOT_OWNED.join(' / ')}: ${ONLY_OWNED_HEADLINE[0]}`, () => {
      const raid = raidConfig('fractured-archive');
      const { result: res, seconds: cpu } = cpuSeconds(() => planFor(raid, false, FA_NOT_OWNED));
      // phase 37: bit-identical to phase 36, within a CPU budget (see PHASE37_FIXTURE)
      expect(normalised(res)).toEqual(phase37Fixture('faNotOwned'));
      expect(memoWithin(res, 'faNotOwned')).toBe(true);
      expect(cpu).toBeLessThan(305);
      const total = res.comparison!.routes[res.planned].seconds;
      expect(formatDuration(total)).toBe(ONLY_OWNED_HEADLINE[0]);
      expect(Math.abs(total - ONLY_OWNED_HEADLINE[1])).toBeLessThanOrEqual(1e-6);
      expect(headlineOf('faNotOwned', res)).toEqual(headline('faNotOwned'));
      expect(Math.abs(recomputed(raid, res) - total)).toBeLessThan(1e-6);
      expect(res.kit.some((c) => Object.values(c.equipment).some((it) => it && FA_NOT_OWNED.includes(it.name)))).toBe(false);
      expect(total).toBeGreaterThan(HEADLINES[0][2]);
    }, 600000);
  }
});
