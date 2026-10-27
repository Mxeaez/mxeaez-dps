import { describe, expect, test } from '@jest/globals';
import { generateEmptyPlayer } from '@/state';
import {
  DEFAULT_SPEC_MODE, kitSlotUsage, plan, PlanInputs,
} from '@/lib/fracturedArchive/planner';
import {
  CarrierCounts, itemBeam, ItemBeamChild, itemStepNet, NO_CARRIERS, pickSpecItem, swapCarriers,
} from '@/lib/fracturedArchive/specChoice';
import { raidConfig } from '@/lib/raids';
import { WORKER_JSON_REPLACER, WORKER_JSON_REVIVER } from '@/utils';
import { planInputsFor } from '@/tests/utils/crossRaid';

// Phase 38e: the planner's item steps (damage spec weapons / Surge potions) as a small beam ranked by each step's real
// result (a slot from the kit = the kit re-optimised with the item), swaps after it, an item accepted at 0 slots pinned
// in the carried list, and swaps on the team's carriers. Docs: docs/BEST_SETUP.md *Item beam, swaps, 0-slot pin (phase
// 38e)*.

describe('itemStepNet: seconds saved less 1 s per free slot used up', () => {
  test('by hand', () => {
    // a free slot taken: 33.29 − 1 × (1 − 0)
    expect(itemStepNet(33.29, 1, 0)).toBeCloseTo(32.29, 9);
    // carried anyway (0 slots): no slot used
    expect(itemStepNet(3.98, 0, 0)).toBeCloseTo(3.98, 9);
    // a slot from the kit (re-optimised), the new kit full: 24.51
    expect(itemStepNet(24.51, 0, 0)).toBeCloseTo(24.51, 9);
    // … and the new kit leaves a slot free: credit 1 s → 25.51
    expect(itemStepNet(24.51, 0, 1)).toBeCloseTo(25.51, 9);
  });
});

describe('itemBeam: greedy order vs the first look', () => {
  // states are item sets; seconds depend on the path (the kit differs), as in the planner
  type S = string;
  const key = (s: S) => s.split('').sort().join('');
  const tree: Record<S, { s: S, t: number }[]> = {
    '': [{ s: 'A', t: 90 }, { s: 'B', t: 91 }],
    A: [{ s: 'AB', t: 88 }, { s: 'AC', t: 89 }],
    B: [{ s: 'BA', t: 87.5 }, { s: 'BC', t: 86 }],
  };
  const expand = (s: S, t: number): ItemBeamChild<S>[] => (tree[s] ?? []).map((c) => ({ state: c.s, seconds: c.t, net: t - c.t }));

  test('width 1 = the greedy: A (saves 10) then AB (2) = 88 s', () => {
    const r = itemBeam<S>('', 100, key, expand, { width: 1 });
    expect(r.state).toBe('AB');
    expect(r.seconds).toBe(88);
    expect(r.expanded).toBe(3); // '', A, AB
  });

  test('width 2: B (saves 9, second at the first look) then BC (5) = 86 s; AB reached twice keeps the faster (87.5)', () => {
    const seen: string[] = [];
    const r = itemBeam<S>('', 100, key, (s, t) => {
      seen.push(`${s}@${t}`);
      return expand(s, t);
    }, { width: 2, depth: 3 });
    expect(r.state).toBe('BC');
    expect(r.seconds).toBe(86);
    // layer 2: AB as BA (via B, 87.5 — not via A, 88; the first-seen slot), AC, BC; expanded: '', A, B, then those three
    expect(seen).toEqual(['@100', 'A@90', 'B@91', 'BA@87.5', 'AC@89', 'BC@86']);
  });

  test('depth 1: only the first step branches; after it, one child per state', () => {
    const r = itemBeam<S>('', 100, key, expand, { width: 2, depth: 1 });
    // A → AB (88), B → BC (86, the best net of B: 5 vs 3.5)
    expect(r.state).toBe('BC');
  });

  test('nothing accepted: the root', () => {
    expect(itemBeam<S>('', 100, key, () => [])).toEqual({ state: '', seconds: 100, expanded: 1 });
  });

  test('the user\'s party-8 FA step 0 (2026-10-27 probe): the first look picks Crimson kisten, the re-optimised rank Zaryte crossbow', () => {
    // free-slot savings 33.29 (kisten) vs 32.41 (ZCB), 0 free: the phase 36 pick
    expect(pickSpecItem([{ item: 'kisten', seconds: 1546.13 - 33.29, slots: 1 }, { item: 'zcb', seconds: 1546.13 - 32.41, slots: 1 }], 1546.13)?.item).toBe('kisten');
    // re-optimised with the item carried (a slot from the kit, the new kit full): kisten 24.51, ZCB 25.24
    const kids: ItemBeamChild<string>[] = [
      { state: 'kisten', seconds: 1546.13 - 24.51, net: itemStepNet(24.51, 0, 0) },
      { state: 'zcb', seconds: 1546.13 - 25.24, net: itemStepNet(25.24, 0, 0) },
    ];
    expect(itemBeam<string>('', 1546.13, (s) => s, (s) => (s ? [] : kids), { width: 1 }).state).toBe('zcb');
  });
});

describe('swapCarriers: one carrier for another, or one dropped', () => {
  const c = (x: Partial<CarrierCounts>): CarrierCounts => ({ ...NO_CARRIERS, ...x });

  test('an Eye of Ayak carrier that saves nothing (no mage) is swapped for a 4th Tonalztics: 91 → 88 s', () => {
    // time = 100 − 3 per Tonalztics; Ayak not in the weapons (the kit has no mage)
    const time = (x: CarrierCounts) => 100 - 3 * x.tonalztics;
    const steps = [
      { weapon: 'tonalztics' as const, saved: 3, seconds: 97 },
      { weapon: 'tonalztics' as const, saved: 3, seconds: 94 },
      { weapon: 'tonalztics' as const, saved: 3, seconds: 91 },
      { weapon: 'ayak' as const, saved: 0, seconds: 91 },
    ];
    const r = swapCarriers({
      weapons: ['elderMaul', 'tonalztics', 'dwh', 'bgs'], total: 4, time, start: c({ tonalztics: 3, ayak: 1 }), steps,
    });
    expect(r.carriers).toEqual(c({ tonalztics: 4 }));
    expect(r.seconds).toBe(88);
    expect(r.steps.map((s) => s.weapon)).toEqual(['tonalztics', 'tonalztics', 'tonalztics', 'tonalztics']);
    expect(r.steps[3]).toEqual({ weapon: 'tonalztics', saved: 3, seconds: 88 });
  });

  test('a carrier that costs time is dropped (+1 s per BGS): 96 → 95 s; a 0.04 s gain is not taken', () => {
    const time = (x: CarrierCounts) => 100 - 5 * x.elderMaul + x.bgs;
    const r = swapCarriers({
      weapons: ['elderMaul', 'bgs'], total: 2, perWeapon: 1, time, start: c({ elderMaul: 1, bgs: 1 }),
    });
    // swapping the BGS for a second maul is capped (perWeapon 1): drop it
    expect(r.carriers).toEqual(c({ elderMaul: 1 }));
    expect(r.seconds).toBe(95);
    const tiny = swapCarriers({
      weapons: ['elderMaul', 'bgs'], total: 2, time: (x) => 100 - 0.04 * x.bgs, start: c({ elderMaul: 1 }),
    });
    expect(tiny.carriers).toEqual(c({ elderMaul: 1 }));
  });
});

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
  test('≤ 25:07.4 (was 25:18.1 with Crimson kisten + Voidwaker); Zaryte crossbow brought; never more cells than slots', () => {
    const r = plan(sitePlanInputs(), { model: fa.time });
    const seconds = r.comparison!.routes[r.planned].seconds;
    expect(seconds).toBeLessThanOrEqual(25 * 60 + 7.4);
    expect(r.specItems.map((x) => x.name)).toContain('Zaryte crossbow');
    const cells = r.inventory.filter((x) => x.kind !== 'free').length;
    expect(cells <= r.slots!.total || r.slots!.overfull).toBe(true);
  }, 600000);

  test('the 0-slot pin: an item carried anyway, then a slot from the kit — the cells fit or the kit says overfull', () => {
    // planInputsFor's FA inputs with the user's overrides: Crimson kisten, then Zaryte crossbow carried anyway (its
    // loadout is in the kit), then Surge re-optimises the kit; before the pin that could drop the ZCB loadout (29 cells)
    const base = planInputsFor(fa, false, ['Obligator']);
    const r = plan({
      ...base, assumptions: { ...base.assumptions, partySize: 8 }, ringPolicy: 'switch', route: ROUTE, supplies, nonItemSlots: 1,
    } as PlanInputs, { model: fa.time });
    const cells = r.inventory.filter((x) => x.kind !== 'free').length;
    expect(cells <= r.slots!.total || r.slots!.overfull).toBe(true);
    (r.specs.items ?? []).filter((s) => s.how === 'carried anyway').forEach((s) => {
      expect(r.specItems.map((x) => x.name)).toContain(s.item);
    });
  }, 600000);
});
