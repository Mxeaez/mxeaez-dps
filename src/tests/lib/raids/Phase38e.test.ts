import { describe, expect, test } from '@jest/globals';
import { generateEmptyPlayer } from '@/state';
import {
  DEFAULT_SPEC_MODE, kitSlotUsage, plan, PlanInputs,
} from '@/lib/fracturedArchive/planner';
import { raidConfig } from '@/lib/raids';
import { WORKER_JSON_REPLACER, WORKER_JSON_REVIVER } from '@/utils';
import { planInputsFor } from '@/tests/utils/crossRaid';
// Phase 38e: the planner's item steps (damage spec weapons / Surge potions) as a small beam ranked by each step's real
// result (a slot from the kit = the kit re-optimised with the item), swaps after it, an item accepted at 0 slots pinned
// in the carried list. (Carrier swaps were built and dropped in the fix round: the next phase changes the spec model.)
// Docs: docs/BEST_SETUP.md *Item beam, swaps, 0-slot pin (phase 38e)*.

// phase 38h-3: the item beam / swaps (itemBeam, itemStepNet, pickSpecItem: route seconds, 1 s a slot) are gone; the
// damage spec weapons follow the bring rule (Phase38h3.test.ts)

describe('slots: 29 items in 28 slots is overfull', () => {
  test('kitSlotUsage by hand: 29 carried items, no supplies → used 29 / 28, overfull', () => {
    const ids = Array.from({ length: 29 }, (_, i) => 1000 + i);
    const s = kitSlotUsage([], 0, ids, {
      brew: 0, restore: 0, ranging: 0, superCombat: 0, food: 0, other: 0,
    }, 0, 28);
    expect(s.used).toBe(29);
    expect(s.free).toBe(0);
    expect(s.overfull).toBe(true);
  });
});

const ROUTE = 'archive-guardian>bork-smorks>dreadnoth>xarth>ocellus';
const fa = raidConfig('fractured-archive');
const supplies = {
  brew: 4, restore: 4, ranging: 0, superCombat: 0, food: 0, other: 3,
};
/** The user's Plan tab (2026-10-27): party 8, no Obligator, ring switches, one route, P2 off; through the worker's JSON. */
const sitePlanInputs = (): PlanInputs => {
  const assumptions = { ...fa.defaultAssumptions, partySize: 8 };
  const inputs = {
    basePlayer: generateEmptyPlayer(),
    assumptions,
    drain: 'team',
    settings: { ...fa.defaultTimeSettings, ocellusP2Seconds: 0 },
    route: ROUTE,
    pinned: [],
    nonItemSlots: 1,
    supplies,
    ringPolicy: 'switch',
    specMode: DEFAULT_SPEC_MODE,
    carrierMode: assumptions.team.manual ? 'manual' : 'auto',
    searchRows: {},
    notOwned: ['Obligator'],
  } as PlanInputs;
  return JSON.parse(JSON.stringify(inputs, WORKER_JSON_REPLACER), WORKER_JSON_REVIVER);
};

(process.env.RUN_SLOW_TESTS ? describe : describe.skip)('the user\'s party-8 FA plan (slow)', () => {
  test('25:15.9 (phase 38h-3, the bring rule; was 25:07.9 with the beam): Zaryte crossbow; never more cells than slots', () => {
    const r = plan(sitePlanInputs(), { model: fa.time });
    const seconds = r.comparison!.routes[r.planned].seconds;
    // phase 38h-2 (bars valued in boss HP, not seconds): 25:07.9 → 25:08.7. Phase 38h-3 (the bring rule: ZCB only, no
    // seconds-picked Crimson kisten / surge): 25:15.9
    expect(seconds).toBeLessThanOrEqual(25 * 60 + 15.9);
    expect(r.specItems.map((x) => x.name)).toContain('Zaryte crossbow');
    const cells = r.inventory.filter((x) => x.kind !== 'free').length;
    expect(r.slots!.overfull).toBe(false);
    expect(cells).toBeLessThanOrEqual(r.slots!.total);
  }, 600000);

  test('the 0-slot pin: an item carried anyway, then a slot from the kit — the cells fit and the kit is not overfull', () => {
    // planInputsFor's FA inputs with the user's overrides: Crimson kisten, then Zaryte crossbow carried anyway (its
    // loadout is in the kit), then Surge re-optimises the kit; before the pin that could drop the ZCB loadout (29 cells)
    const base = planInputsFor(fa, false, ['Obligator']);
    const r = plan({
      ...base, assumptions: { ...base.assumptions, partySize: 8 }, ringPolicy: 'switch', route: ROUTE, supplies, nonItemSlots: 1,
    } as PlanInputs, { model: fa.time });
    const cells = r.inventory.filter((x) => x.kind !== 'free').length;
    expect(r.slots!.overfull).toBe(false);
    expect(cells).toBeLessThanOrEqual(r.slots!.total);
    (r.specs.items ?? []).filter((s) => s.how === 'carried anyway').forEach((s) => {
      expect(r.specItems.map((x) => x.name)).toContain(s.item);
    });
  }, 600000);
});
