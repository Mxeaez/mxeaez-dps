import { describe, expect, test } from '@jest/globals';
import {
  DEFAULT_NON_ITEM_SLOTS,
  DEFAULT_PINNED_NAMES,
  DEFAULT_SUPPLIES,
  INVENTORY_SLOTS,
  inventoryGrid,
  kitSlotUsage,
  optimiseKit,
  partialSwitchVariants,
  plan,
  PlanEquipment,
  PlanInputs,
  PlanItem,
  planItemByName,
  PlanTuning,
  planAssumptions,
  routePhaseTargets,
  SupplyCounts,
} from '@/lib/fracturedArchive/planner';
import {
  compareRoutes,
  createKitEvaluator,
  enumerateRoutes,
  phaseKey,
  presetKitLoadout,
  RAID_TIME_DEFAULTS,
  raidTimeAssumptionsFrom,
} from '@/lib/fracturedArchive/raidTime';
import { DEFAULT_ASSUMPTIONS, PRESETS } from '@/lib/fracturedArchive/presets';
import {
  applyPresetToPlayer, buildTargetMonster, evaluateLoadout, findTarget, presetStyles,
} from '@/lib/fracturedArchive/bestSetup';
import { generateEmptyPlayer } from '@/state';

// Phase 17: raid planner (src/lib/fracturedArchive/planner.ts).

const NO_SUPPLIES: SupplyCounts = {
  brew: 0, restore: 0, ranging: 0, superCombat: 0, food: 0, other: 0,
};

const item = (id: number, slot: PlanItem['slot'], twoHanded = false): PlanItem => ({
  id, name: `item${id}`, version: '', slot, ...(twoHanded ? { twoHanded: true } : {}),
});

describe('slot accounting', () => {
  test('items shared by loadouts are counted once; worn items take no slot', () => {
    const u = kitSlotUsage([[1, 2, 3], [2, 3, 4]], 0, [], NO_SUPPLIES, 0);
    expect(u.carriedItems).toBe(4);
    expect(u.inventoryItems).toBe(1); // item 4
    expect(u.swapReserve).toBe(0);
    expect(u.used).toBe(1);
    expect(u.free).toBe(INVENTORY_SLOTS - 1);
  });

  test('pinned items take a slot unless a loadout already has them', () => {
    const u = kitSlotUsage([[1, 2, 3], [2, 3, 4]], 0, [3, 5, 5], NO_SUPPLIES, 0);
    expect(u.carriedItems).toBe(5); // 1..5; 3 is in a loadout, 5 is pinned once
    expect(u.inventoryItems).toBe(2); // 4 and 5
  });

  test('supplies and non-item slots are added; a smaller loadout needs swap space', () => {
    // default comfort supplies 6 + 4 = 10 (phase 27: potions come from the kit), + rune pouch
    const u = kitSlotUsage([[1, 2, 3], [4, 5]], 0, [], { ...DEFAULT_SUPPLIES, ranging: 2, superCombat: 1 }, DEFAULT_NON_ITEM_SLOTS);
    expect(DEFAULT_SUPPLIES.brew + DEFAULT_SUPPLIES.restore).toBe(10);
    expect(u.supplies).toBe(13);
    expect(u.nonItem).toBe(1);
    expect(u.inventoryItems).toBe(2); // 4, 5 while wearing 1-3
    expect(u.swapReserve).toBe(1); // wearing {4,5}: 1, 2, 3 in the bag
    expect(u.used).toBe(13 + 1 + 2 + 1);
    // which loadout is worn doesn't change the slots needed
    const v = kitSlotUsage([[1, 2, 3], [4, 5]], 1, [], { ...DEFAULT_SUPPLIES, ranging: 2, superCombat: 1 }, DEFAULT_NON_ITEM_SLOTS);
    expect(v.used).toBe(u.used);
    expect(v.inventoryItems).toBe(3);
    expect(v.swapReserve).toBe(0);
  });

  test('free slots are never negative; overfull is flagged', () => {
    const u = kitSlotUsage([[1, 2]], 0, [7, 8], { ...NO_SUPPLIES, brew: 30 }, 1);
    expect(u.used).toBe(33);
    expect(u.free).toBe(0);
    expect(u.overfull).toBe(true);
  });

  test('inventory grid: 28 cells in order supplies, switches by style, spec weapons, pinned, non-item, swap, free', () => {
    const worn: PlanEquipment = { weapon: item(1, 'weapon'), head: item(2, 'head') };
    const magic: PlanEquipment = { weapon: item(3, 'weapon'), head: item(2, 'head'), body: item(4, 'body') };
    const melee: PlanEquipment = { weapon: item(5, 'weapon') };
    const grid = inventoryGrid(
      [{ equipment: worn, group: 'ranged' }, { equipment: magic, group: 'magic' }, { equipment: melee, group: 'melee' }],
      0,
      [item(9, 'weapon')],
      [item(10, 'ring'), item(3, 'weapon')],
      { ...NO_SUPPLIES, brew: 2, restore: 1 },
      1,
    );
    expect(grid).toHaveLength(INVENTORY_SLOTS);
    expect(grid.slice(0, 9).map((c) => `${c.kind}:${c.item?.id ?? c.label}`)).toEqual([
      'supply:Saradomin brew', 'supply:Saradomin brew', 'supply:Super restore',
      'switch:5', // melee first
      'switch:3', 'switch:4', // magic (weapon, body; the head is worn)
      'spec:9',
      'pinned:10', // pinned 3 is already a switch item
      'non-item:Rune pouch',
    ]);
    expect(grid[9].kind).toBe('swap'); // the worn set has 2 items, the melee switch 1
    expect(grid.slice(10).every((c) => c.kind === 'free')).toBe(true);
    // the grid agrees with the slot accounting
    const u = kitSlotUsage([[1, 2], [2, 3, 4], [5]], 0, [9, 10, 3], { ...NO_SUPPLIES, brew: 2, restore: 1 }, 1);
    expect(grid.filter((c) => c.kind !== 'free')).toHaveLength(u.used);
    // wearing the 2-item loadout while a 1-item one exists: one swap cell
    expect(u.swapReserve).toBe(1);
  });
});

describe('partial switches', () => {
  test('weapon (+ ammo, two-handed drops the shield), then the best pieces, carried pieces first', () => {
    const base: PlanEquipment = {
      weapon: item(1, 'weapon'), shield: item(2, 'shield'), head: item(3, 'head'), body: item(4, 'body'), legs: item(5, 'legs'), ammo: item(6, 'ammo'),
    };
    const target: PlanEquipment = {
      weapon: item(10, 'weapon', true), ammo: item(11, 'ammo'), head: item(12, 'head'), body: item(13, 'body'), legs: item(14, 'legs'),
    };
    const weights: Record<number, number> = { 12: 3, 13: 1, 14: 2 };
    const dpsOf = (eq: PlanEquipment) => Object.values(eq).reduce((t, it) => t + (weights[it!.id] ?? 0), 0);
    const vs = partialSwitchVariants(base, target, dpsOf, (id) => id === 13);
    const ids = (eq: PlanEquipment) => Object.values(eq).map((it) => it!.id).sort((a, b) => a - b);
    expect(vs.map((v) => v.pieces)).toEqual([[], ['body'], ['body', 'head'], ['body', 'head', 'legs']]);
    expect(ids(vs[0].equipment)).toEqual([3, 4, 5, 10, 11]); // base armour, target weapon + ammo, no shield
    expect(ids(vs[1].equipment)).toEqual([3, 5, 10, 11, 13]);
    expect(ids(vs[2].equipment)).toEqual([5, 10, 11, 12, 13]);
    expect(ids(vs[3].equipment)).toEqual([10, 11, 12, 13, 14]);
  });

  test('one-handed target: its shield, or the base shield when it has none; a two-handed base leaves no shield', () => {
    const base: PlanEquipment = { weapon: item(1, 'weapon'), shield: item(2, 'shield') };
    const withShield = partialSwitchVariants(base, { weapon: item(10, 'weapon'), shield: item(20, 'shield') }, () => 0);
    expect(withShield[0].equipment.shield?.id).toBe(20);
    const noShield = partialSwitchVariants(base, { weapon: item(10, 'weapon') }, () => 0);
    expect(noShield[0].equipment.shield?.id).toBe(2);
    const twoHandedBase = partialSwitchVariants({ weapon: item(1, 'weapon', true) }, { weapon: item(10, 'weapon') }, () => 0);
    expect(twoHandedBase[0].equipment.shield).toBeUndefined();
    expect(twoHandedBase).toHaveLength(1);
  });
});

/** Toy problem: phases with damage, candidates with DPS per phase and items; time = Σ damage ÷ best DPS in the kit. */
const toyProblem = (damage: number[], dps: number[][], items: number[][], fixedSlots: number, totalSlots = 28) => {
  const time = (m: number[]) => damage.reduce((t, d, p) => {
    const best = Math.max(0, ...m.map((c) => dps[c][p]));
    return t + (best > 0 ? d / best : Infinity);
  }, 0);
  const usedOf = (m: number[]) => fixedSlots + new Set(m.flatMap((c) => items[c])).size - Math.min(...m.map((c) => items[c].length));
  const brute = () => {
    let best: { m: number[], t: number, used: number } | null = null;
    for (let mask = 1; mask < (1 << items.length); mask++) {
      const m = items.map((_, i) => i).filter((i) => mask & (1 << i));
      const used = usedOf(m);
      if (used > totalSlots) continue;
      const t = time(m);
      if (!best || t < best.t - 1e-9 || (Math.abs(t - best.t) <= 1e-9 && used < best.used)) best = { m, t, used };
    }
    return best!;
  };
  const solve = () => optimiseKit({
    items, carried: [], fixedSlots, totalSlots, time, seeds: items.map((_, i) => i),
  });
  return { time, brute, solve };
};

describe('optimiser', () => {
  // A (melee) can't hit phase 1; B (ranged) and C (magic) hit both; C shares 3 items with A
  const damage = [100, 100];
  const dps = [[0, 10], [4, 5], [5, 4]];
  const items = [[1, 2, 3, 4, 5], [6, 7, 8, 9, 10], [1, 2, 3, 11, 12]];

  test('2 phases, 3 loadouts: finds the hand-computed optimum {A, C} = 30 s (= brute force)', () => {
    // {A}: ∞; {B}, {C}: 45; {A,B}: 25 + 10 = 35 (25 slots); {A,C}: 20 + 10 = 30 (22); {B,C}: 40; {A,B,C}: 30 (27)
    const p = toyProblem(damage, dps, items, 20);
    const r = p.solve();
    expect(r.best.time).toBeCloseTo(30, 9);
    expect([...r.best.members].sort()).toEqual([0, 2]);
    expect(r.best.used).toBe(22);
    const b = p.brute();
    expect(r.best.time).toBeCloseTo(b.t, 9);
    expect(b.m).toEqual([0, 2]);
    // not a no-op: the first candidate alone can't clear phase 1
    expect(p.time([0])).toBe(Infinity);
  });

  test('a single-style kit wins when the switches do not fit', () => {
    // 3 phases: A, B, C each best on one phase (the 3-way is the fastest kit), D (index 3) is decent everywhere
    const d3 = [100, 100, 100];
    const dps3 = [[12, 1, 1], [1, 12, 1], [1, 1, 12], [6, 6, 6]];
    const items3 = [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16]];
    const roomy = toyProblem(d3, dps3, items3, 10, 28);
    expect([...roomy.solve().best.members].sort()).toEqual([0, 1, 2]); // 25 s, 18 slots
    expect(roomy.solve().best.time).toBeCloseTo(25, 9);
    const tight = toyProblem(d3, dps3, items3, 10, 15); // 3-way needs 18, any pair 14 — but D alone is 50 s ...
    const tr = tight.solve();
    const tb = tight.brute();
    expect(tr.best.time).toBeCloseTo(tb.t, 9);
    // pairs fit (14 slots): A + D = 100/12 + 100/6 + 100/6 = 41.7 < D alone 50
    expect(tr.best.members).toHaveLength(2);
    const tighter = toyProblem(d3, dps3, items3, 10, 13); // only singles fit
    const sr = tighter.solve();
    expect(sr.best.members).toEqual([3]);
    expect(sr.best.time).toBeCloseTo(50, 9);
    expect(sr.best.time).toBeCloseTo(tighter.brute().t, 9);
    // the 3-way is faster but needs 18 slots
    expect(tighter.time([0, 1, 2])).toBeLessThan(sr.best.time);
  });

  test('deterministic, and stops when cancelled', () => {
    const p = toyProblem(damage, dps, items, 20);
    expect(p.solve()).toEqual(p.solve());
    expect(() => optimiseKit({
      items, carried: [], fixedSlots: 20, totalSlots: 28, time: p.time, seeds: [0, 1, 2], shouldCancel: () => true,
    })).toThrow('cancelled');
  });
});

// --- the real planner on a reduced pool ----------------------------------------------------------------------------

const ROUTE = 'archive-guardian>bork-smorks>moia>xarth>ocellus';
const SMALL: PlanTuning = {
  search: { weapons: ['Scythe of Vitur', 'Twisted bow', 'Tumeken\'s shadow', 'Kodai wand'], maxPasses: 1 },
  presets: PRESETS.filter((p) => ['Torva + Scythe (slash)', 'Twisted bow (Masori)', 'Tumeken\'s shadow (Ancestral)', 'Kodai + best Surge (Ancestral)'].includes(p.name)),
  perGroupWeapons: 2,
  perWeapon: 1,
  bases: 1,
  partners: 1,
  seeds: 6,
};
const inputs = (patch: Partial<PlanInputs> = {}): PlanInputs => ({
  basePlayer: generateEmptyPlayer(),
  assumptions: DEFAULT_ASSUMPTIONS,
  drain: 'team',
  settings: RAID_TIME_DEFAULTS,
  route: ROUTE,
  pinned: DEFAULT_PINNED_NAMES.map((n) => planItemByName(n).id),
  nonItemSlots: DEFAULT_NON_ITEM_SLOTS,
  supplies: DEFAULT_SUPPLIES,
  ...patch,
});

describe('plan (reduced pool)', () => {
  const first = plan(inputs(), SMALL);

  test('the route\'s phase targets only', () => {
    const route = enumerateRoutes().filter((r) => r.id === ROUTE);
    const targets = routePhaseTargets(route, raidTimeAssumptionsFrom(DEFAULT_ASSUMPTIONS, 'team', RAID_TIME_DEFAULTS)).map((t) => t.targetKey);
    expect(targets).toContain('xarth');
    expect(targets).not.toContain('ezekiel');
    expect(first.stats.phases).toBe(targets.length);
  });

  test('a kit within 28 slots, a 28-cell grid, partial switches generated', () => {
    expect(first.cancelled).toBe(false);
    expect(first.kit.length).toBeGreaterThan(0);
    expect(first.slots!.used).toBeLessThanOrEqual(INVENTORY_SLOTS);
    expect(first.slots!.free).toBe(INVENTORY_SLOTS - first.slots!.used);
    expect(first.inventory).toHaveLength(INVENTORY_SLOTS);
    expect(first.inventory.filter((c) => c.kind === 'free')).toHaveLength(first.slots!.free);
    expect(first.stats.candidates.partial).toBeGreaterThan(0);
    expect(first.comparison!.routes).toHaveLength(1);
    expect(first.planned).toBe(0);
    // the worn set is the loadout used on the route's first phase
    const firstPhase = first.comparison!.routes[0].encounters[0].phases[0];
    expect(firstPhase.choice!.loadout).toBe(first.kit[0].label);
  });

  test('the plan beats (or ties) every single preset of the pool, and the inner loop\'s time is exact for Team', () => {
    const planned = first.comparison!.routes[first.planned].seconds;
    expect(planned).toBeCloseTo(first.stats.objectiveSeconds, 6);
    const a = raidTimeAssumptionsFrom(DEFAULT_ASSUMPTIONS, 'team', RAID_TIME_DEFAULTS);
    const route = enumerateRoutes().filter((r) => r.id === ROUTE);
    for (const preset of SMALL.presets!) {
      const kit = createKitEvaluator([presetKitLoadout(generateEmptyPlayer(), preset, DEFAULT_ASSUMPTIONS)], DEFAULT_ASSUMPTIONS);
      const t = compareRoutes(kit, a, route).routes[0].seconds;
      expect(planned).toBeLessThanOrEqual(t + 1e-9);
    }
  });

  test('deterministic; cached search rows give the same plan without searching', () => {
    const again = plan(inputs({ searchRows: first.searchRows }), SMALL);
    expect(again.stats.searches).toBe(0);
    expect(again.kit.map((k) => k.key)).toEqual(first.kit.map((k) => k.key));
    expect(again.comparison!.routes[0].seconds).toBe(first.comparison!.routes[0].seconds);
    expect(again.inventory).toEqual(first.inventory);
  });

  test('more supplies → fewer free slots, never negative', () => {
    const more = plan(inputs({ searchRows: first.searchRows, supplies: { ...DEFAULT_SUPPLIES, brew: 10 } }), SMALL);
    // phase 32: the comfort part grows by 4 (the kit's potions follow its styles, which may change with the room left)
    const potionSupplies = (r: typeof first) => r.potions.filter((p) => p.type !== 'heart').length;
    expect(more.slots!.supplies - potionSupplies(more)).toBe(first.slots!.supplies - potionSupplies(first) + 4);
    expect(more.slots!.used).toBeLessThanOrEqual(INVENTORY_SLOTS);
    expect(more.slots!.free).toBe(INVENTORY_SLOTS - more.slots!.used);
    expect(more.comparison!.routes[0].seconds).toBeGreaterThanOrEqual(first.comparison!.routes[0].seconds - 1e-9);
    const full = plan(inputs({ searchRows: first.searchRows, supplies: { ...DEFAULT_SUPPLIES, brew: 40 } }), SMALL);
    expect(full.slots!.free).toBe(0);
    expect(full.slots!.overfull).toBe(true);
    expect(full.kit).toHaveLength(1); // no room for switches
  });

  test('cancellation: before the searches and during the optimiser', () => {
    expect(plan(inputs(), SMALL, { shouldCancel: () => true }).cancelled).toBe(true);
    let optimising = false;
    const r = plan(inputs({ searchRows: first.searchRows }), SMALL, {
      onProgress: (p) => {
        if (p.stage === 'optimise') optimising = true;
      },
      shouldCancel: () => optimising,
    });
    expect(r.cancelled).toBe(true);
    expect(r.kit).toEqual([]);
  });
});

describe('review fixes', () => {
  test('Solo: the matrix plans drains with each encounter length; Bork / Smorks DPS within 1% of the exact times', () => {
    const r = plan(inputs({ drain: 'solo' }), SMALL);
    expect(r.cancelled).toBe(false);
    // computed, not the 90 s fallback; phase 28: hp ÷ (party 6 × DPS) (was the 1-player time, > 90 s)
    expect(r.stats.fightSeconds?.['bork-smorks']).toBeGreaterThan(15);
    expect(r.stats.fightSeconds?.['bork-smorks']).toBeLessThan(90);
    expect(r.stats.retimed).toBeGreaterThan(0);
    const bork = r.comparison!.routes[r.planned].encounters.find((e) => e.id === 'bork-smorks')!;
    // phase 40b (stun-swap): stunned, armour 14 (party 1: 4 stuns cover a sixth of Bork) and the Smorks (was 5 rows)
    expect(bork.phases.map((p) => p.key)).toEqual(['bork-stunned', 'bork-14', 'smorks']);
    for (const ph of bork.phases) {
      const m = r.matrixDps[phaseKey(ph.targetKey, ph.phase)];
      expect(Math.abs(m - ph.dps) / ph.dps).toBeLessThan(0.01);
    }
  });

  test('phase 27: melee / ranged always keep their potion (the kit brings it); phase 31: magic too (the heart); drains keep the potions', () => {
    const tbow = PRESETS.find((p) => p.name === 'Twisted bow (Masori)')!;
    const scythe = PRESETS.find((p) => p.name === 'Torva + Scythe (slash)')!;
    const heart = [planItemByName('Saturated heart').id];
    const withPots = planAssumptions(DEFAULT_ASSUMPTIONS, DEFAULT_SUPPLIES, heart);
    // the old "no ranging potion supply" case: the planner no longer reads the count; an unboosted ranged player is
    // modelled with withoutPotion (what the planner did before phase 27)
    const noRanging = { ...withPots, withoutPotion: ['ranged' as const] };
    expect(withPots.withoutPotion).toBeUndefined();
    expect(planAssumptions(DEFAULT_ASSUMPTIONS, { ...DEFAULT_SUPPLIES, ranging: 0 }, heart).withoutPotion).toBeUndefined();
    expect(planAssumptions(DEFAULT_ASSUMPTIONS, DEFAULT_SUPPLIES).withoutPotion).toBeUndefined(); // phase 31: the kit's heart
    const { monster } = buildTargetMonster(findTarget('xarth'), undefined, 'team', withPots);
    const dpsOf = (preset: typeof tbow, a: typeof withPots) => evaluateLoadout(
      applyPresetToPlayer(generateEmptyPlayer(), preset, presetStyles(preset)[0], null, monster, a),
      monster,
      false,
    ).dps;
    expect(dpsOf(tbow, noRanging)).toBeLessThan(dpsOf(tbow, withPots));
    expect(dpsOf(scythe, noRanging)).toBe(dpsOf(scythe, withPots));
    expect(applyPresetToPlayer(generateEmptyPlayer(), tbow, presetStyles(tbow)[0], null, monster, noRanging).buffs.potions).toEqual([]);
    // the drain model is unchanged
    const drained = buildTargetMonster(findTarget('xarth'), undefined, 'team', noRanging).monster;
    expect(drained.inputs.defenceReductions).toEqual(monster.inputs.defenceReductions);
  });

  test('phase 27: the kit brings only the potions of its styles (no unused potions)', () => {
    const r = plan(inputs({ route: ROUTE }), {
      ...SMALL,
      search: { weapons: ['Scythe of Vitur'], maxPasses: 1 },
      presets: PRESETS.filter((p) => p.name === 'Torva + Scythe (slash)'),
    });
    expect(r.kit.every((k) => k.group === 'melee')).toBe(true);
    expect(r.potions).toEqual([{ type: 'superCombat', label: 'Super combat', group: 'melee' }]);
    expect(r.inventory.filter((c) => c.kind === 'supply' && c.supply === 'superCombat').length).toBe(1);
    expect(r.inventory.filter((c) => c.kind === 'supply' && c.supply === 'ranging').length).toBe(0);
  });
});
