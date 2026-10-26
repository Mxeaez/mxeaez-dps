import { describe, expect, test } from '@jest/globals';
import { generateEmptyPlayer } from '@/state';
import PlayerVsNPCCalc from '@/lib/PlayerVsNPCCalc';
import { buildTargetMonster, findTarget } from '@/lib/fracturedArchive/bestSetup';
import {
  atHpLeft, bestDamageVariant, DAMAGE_SPEC_ARMOUR, DAMAGE_SPEC_WEAPONS, DamageSpecWeapon, damageSpecPlayer, damageSpecProfile, damageSpecRanking, netSpecDamage,
  specCalcNumbers, specSecondsSaved,
} from '@/lib/fracturedArchive/damageSpecs';
import {
  allocateBudget, AllocationProblem, CARRY_SPEC_ENERGY, dosesAllowed, placeDoses, regenTicks, rowSecondsAfter,
  spendFromGroup, SPEC_MAX_ENERGY, SURGE_COOLDOWN_SECONDS, SURGE_DOSE_ENERGY,
} from '@/lib/fracturedArchive/specBudget';
import {
  budgetedEncounter, budgetGroups, capOptions, CLOCK_ROUNDS, damageLimited, drainEventsOf, MAX_EVENT_OPTIONS, rowHpLeft,
} from '@/lib/fracturedArchive/encounterBudget';
import {
  compareRoutes, createKitEvaluator, encounterPlan, encounterTime, EncounterTime, formatDuration, KitLoadout, presetKitLoadout,
  RAID_TIME_DEFAULTS, raidTimeAssumptionsFrom, routesFor, routeSurgeDoses, specBudgetFrom,
} from '@/lib/fracturedArchive/raidTime';
import { pickSpecItem } from '@/lib/fracturedArchive/specChoice';
import {
  comfortSupplies, DEFAULT_CARRIER_MODE, DEFAULT_RING_POLICY, DEFAULT_SPEC_MODE, plan, planAssumptions, PlanHooks, planItemByName,
  ringAssumptions, toPlayerEquipment,
} from '@/lib/fracturedArchive/planner';
import { applyLoadoutToPlayer } from '@/lib/fracturedArchive/loadout';
import { raidConfig } from '@/lib/raids';
import { BestSetupAssumptions } from '@/lib/fracturedArchive/presets';
import { RaidId, NO_DRAINS_ADDS } from '@/lib/raids/types';
import { getCombatStylesForCategory } from '@/utils';
import { EquipmentCategory } from '@/enums/EquipmentCategory';

// Phase 36: damage specs vs drains, the surge potion, one spec budget per encounter. Docs: docs/BEST_SETUP.md *Damage
// specs, surge potion and one spec budget per encounter (phase 36)*; readings: UNVERIFIED B10, D27-D29.

const A = (id: RaidId): BestSetupAssumptions => raidConfig(id).defaultAssumptions;

// --- E[spec damage] by hand vs upstream's spec calc ------------------------------------------------------------------

const styleOf = (category: EquipmentCategory, name: string, stance: string) => getCombatStylesForCategory(category)
  .find((s) => s.name === name && s.stance === stance)!;

/** Voidwaker (wiki: "guaranteed Magic damage between 50-150% of the wielder's maximum melee hit"): uniform, mean. */
const voidwakerByHand = (normalMax: number): number => {
  const lo = Math.trunc(normalMax / 2);
  const hi = normalMax + lo;
  return (lo + hi) / 2;
};

/**
 * Dragon claws, upstream's rework (src/lib/dists/claws.ts, matches the wiki's "four strikes" cascade): the k-th roll
 * (k = 0..3) is the first accurate one with probability (1 − p)^k p; the total is uniform in [trunc(M (4 − k) / 4),
 * M + trunc(M (4 − k) / 4) − 1], split as 1/2, 1/4, 1/8, 1/8 + 1 (k = 0), 1/2, 1/4, 1/4 + 1 (k = 1), 1/2, 1/2 + 1 (k = 2),
 * all + 1 (k = 3); all four miss: 2 damage with probability 2/3.
 */
const clawsByHand = (p: number, M: number): number => {
  let e = 0;
  for (let k = 0; k < 4; k++) {
    const low = Math.trunc((M * (4 - k)) / 4);
    const high = M + low - 1;
    const pk = (1 - p) ** k * p;
    let sum = 0;
    for (let d = low; d <= high; d++) {
      if (k === 0) sum += Math.trunc(d / 2) + Math.trunc(d / 4) + Math.trunc(d / 8) + Math.trunc(d / 8) + 1;
      else if (k === 1) sum += Math.trunc(d / 2) + Math.trunc(d / 4) + Math.trunc(d / 4) + 1;
      else if (k === 2) sum += Math.trunc(d / 2) + Math.trunc(d / 2) + 1;
      else sum += d + 1;
    }
    e += (pk * sum) / (high - low + 1);
  }
  return e + ((1 - p) ** 4 * 2 * 2) / 3;
};

describe('E[spec damage]: hand-computed vs upstream (getSpecCalc().getExpectedDamage())', () => {
  const cases: [string, string, RaidId][] = [['Xarth', 'xarth', 'fractured-archive'], ['Zebak', 'toa-zebak', 'toa']];
  test.each(cases)('%s: Voidwaker = mean of 50-150%% of the normal max, accuracy 100%%', (_n, key, raid) => {
    const a = A(raid);
    const m = buildTargetMonster(findTarget(key), undefined, 'none', a).monster;
    const style = styleOf(EquipmentCategory.SLASH_SWORD, 'Slash', 'Aggressive');
    const player = damageSpecPlayer(m, 'voidwaker', style, DAMAGE_SPEC_ARMOUR.melee[0].preset, undefined, a);
    const normalMax = new PlayerVsNPCCalc(player, m).getDistribution().getMax();
    const spec = specCalcNumbers(player, m);
    expect(spec.accuracy).toBe(1);
    expect(spec.ticks).toBe(4);
    expect(spec.expected).toBeCloseTo(voidwakerByHand(normalMax), 9);
    // the profile keeps this variant
    const prof = damageSpecProfile(m, 'voidwaker', a);
    expect(prof.variants.find((v) => v.label === 'Slash (Aggressive), Torva')!.expected).toBeCloseTo(spec.expected, 9);
  });
  test.each(cases)('%s: Dragon claws = the cascade at the spec accuracy and the normal max', (_n, key, raid) => {
    const a = A(raid);
    const m = buildTargetMonster(findTarget(key), undefined, 'none', a).monster;
    const style = styleOf(EquipmentCategory.CLAW, 'Slash', 'Aggressive');
    const player = damageSpecPlayer(m, 'dragonClaws', style, DAMAGE_SPEC_ARMOUR.melee[0].preset, undefined, a);
    const normal = new PlayerVsNPCCalc(player, m);
    const spec = specCalcNumbers(player, m);
    const p = normal.getSpecCalc()!.getHitChance();
    expect(spec.expected).toBeCloseTo(clawsByHand(p, normal.getDistribution().getMax()), 9);
    expect(spec.expected).toBeGreaterThan(0);
  });
  test('Xarth (FA, as printed in phase 36): Voidwaker Slash (Aggressive), Torva = 54 (max hit 54 → 27-81)', () => {
    const a = A('fractured-archive');
    const m = buildTargetMonster(findTarget('xarth'), undefined, 'none', a).monster;
    const v = damageSpecProfile(m, 'voidwaker', a).variants.find((x) => x.label === 'Slash (Aggressive), Torva')!;
    expect(v.maxHit).toBe(81);
    expect(v.expected).toBeCloseTo(54, 9);
  });
  test('a spec weapon that can\'t hit deals 0: Voidwaker on Moia (out of melee reach), on the flying Archive Guardian', () => {
    const a = A('fractured-archive');
    ['moia', 'ag-flying'].forEach((k) => {
      const m = buildTargetMonster(findTarget(k), undefined, 'none', a).monster;
      const p = damageSpecProfile(m, 'voidwaker', a);
      expect(p.canHit).toBe(false);
      expect(p.variants.every((v) => v.expected === 0)).toBe(true);
    });
    const zcb = damageSpecProfile(buildTargetMonster(findTarget('moia'), undefined, 'none', a).monster, 'zcb', a);
    expect(zcb.canHit).toBe(true);
  });
});

describe('value of a damage spec (toy)', () => {
  test('net = E − DPS × ticks × 0.6; seconds = net ÷ (multiplier × DPS)', () => {
    // E 60 in 4 ticks at 10 DPS: the normal attacks would have dealt 10 × 2.4 = 24
    expect(netSpecDamage({ expected: 60, ticks: 4 }, 10)).toBeCloseTo(36, 12);
    // a party of 4 at 10 DPS each: 36 ÷ 40 = 0.9 s; alone (FA's multiplier 1): 3.6 s
    expect(specSecondsSaved(36, 10, 4)).toBeCloseTo(0.9, 12);
    expect(specSecondsSaved(36, 10, 1)).toBeCloseTo(3.6, 12);
    // worse than attacking normally: worth nothing
    expect(specSecondsSaved(netSpecDamage({ expected: 20, ticks: 4 }, 10), 10, 1)).toBe(0);
  });
  test('a row\'s seconds after m specs: seconds × (1 − m × net ÷ damage), not below 0', () => {
    const o = { seconds: 30, damage: 300, damageSpecs: [{ weapon: 'vw', cost: 50, net: 36 }] };
    expect(rowSecondsAfter(o, { vw: 2 })).toBeCloseTo(30 * (1 - 72 / 300), 12);
    expect(rowSecondsAfter(o, { vw: 20 })).toBe(0);
  });
  test('Search ranking (Xarth, Team, at the top row\'s DPS): sorted by seconds per spec, each = net ÷ (mult × DPS)', () => {
    const a = A('fractured-archive');
    const m = buildTargetMonster(findTarget('xarth'), undefined, 'team', a).monster;
    const rows = damageSpecRanking(m, a, 10, 1);
    rows.forEach((r, i) => {
      if (i > 0 && r.canHit && rows[i - 1].canHit) expect(rows[i - 1].saved).toBeGreaterThanOrEqual(r.saved);
      expect(r.saved).toBeCloseTo(r.net > 0 ? r.net / 10 : 0, 9);
      expect(r.net).toBeCloseTo(r.expected - 10 * r.ticks * 0.6, 9);
    });
  });
});

// --- the budget DP vs an exhaustive search ------------------------------------------------------------------------

/** One fixed plan simulated directly (the module's rules, written out again): seconds, or Infinity if it can't be paid. */
const simulateOnce = (p: AllocationProblem, opts: number[], choice: Record<string, number>[], drinkAt: number): number => {
  const state: Record<string, number[]> = JSON.parse(JSON.stringify(p.start));
  let total = 0;
  for (let r = 0; r < p.rows.length; r++) {
    let mineSpent = false;
    for (let ei = 0; ei < p.events.length; ei++) {
      for (const sp of p.events[ei].options[opts[ei]].spends) {
        if (sp.row === r && sp.specs) {
          const paid = spendFromGroup(state[sp.group], sp.specs, sp.cost);
          if (!paid) return Infinity;
          state[sp.group] = paid;
          if (sp.group === 'me') mineSpent = true;
        }
      }
    }
    let drank = false;
    if (r === drinkAt && mineSpent) {
      state.me[0] = Math.min(SPEC_MAX_ENERGY, state.me[0] + SURGE_DOSE_ENERGY);
      drank = true;
    }
    const row = p.rows[r];
    for (const g of Object.keys(state)) {
      const reg = regenTicks(row.start, row.end, p.groups.find((x) => x.id === g)!.regenSeconds) * 10;
      state[g] = state[g].map((e) => e + reg);
    }
    const o = p.rowOutcome(r, opts[row.event]);
    let spent = 0;
    for (const c of o.damageSpecs) spent += (choice[r][c.weapon] ?? 0) * c.cost;
    const late = r === drinkAt && !drank;
    if (late && !(spent > 0 || state.me[0] < SPEC_MAX_ENERGY)) return Infinity;
    if (spent > (state.me?.[0] ?? 0) + (late ? SURGE_DOSE_ENERGY : 0) + 1e-9) return Infinity;
    if (state.me) state.me[0] = state.me[0] - spent + (late ? SURGE_DOSE_ENERGY : 0);
    for (const g of Object.keys(state)) state[g] = state[g].map((e) => Math.min(SPEC_MAX_ENERGY, e)).sort((x, y) => y - x);
    total += rowSecondsAfter(o, choice[r]);
  }
  return total;
};

/** Exhaustive: every option per event × every damage count (0-3) per row × every row to drink the dose. */
const bruteForce = (p: AllocationProblem): number => {
  let best = Infinity;
  const n = p.rows.length;
  const assign = (ei: number, opts: number[]) => {
    if (ei < p.events.length) {
      p.events[ei].options.forEach((_, oi) => assign(ei + 1, [...opts, oi]));
      return;
    }
    const per: Record<string, number>[][] = p.rows.map((_, i) => {
      let combos: Record<string, number>[] = [{}];
      p.rowOutcome(i, opts[p.rows[i].event]).damageSpecs.forEach((c) => {
        combos = combos.flatMap((x) => [0, 1, 2, 3].map((m) => (m ? { ...x, [c.weapon]: m } : x)));
      });
      return combos;
    });
    const walk = (i: number, choice: Record<string, number>[]) => {
      if (i === n) {
        for (let drinkAt = -1; drinkAt < (p.surge ? n : 0); drinkAt++) best = Math.min(best, simulateOnce(p, opts, choice, drinkAt));
        return;
      }
      per[i].forEach((c) => walk(i + 1, [...choice, c]));
    };
    walk(0, []);
  };
  assign(0, []);
  return best;
};

/**
 * A Solo toy: event 0 (rows 0-1, 0-40-70 s) and a Defence reset, event 1 (row 2, 70-130 s); maul specs at 50%; Voidwaker
 * damage specs (50%, net 30 on 300 damage) on every row. More maul specs = faster rows of that event, with diminishing
 * returns.
 */
const toy = (surge = false): AllocationProblem => {
  const opt = (n: number, row: number) => ({
    counts: (n ? { maul: n } : {}) as Record<string, number>,
    spends: n ? [{
      group: 'me', specs: n, cost: 50, row,
    }] : [],
  });
  const secs = [[40, 30, 25], [30, 22, 20], [60, 40, 36]];
  return {
    rows: [{
      key: 'a', event: 0, start: 0, end: 40,
    }, {
      key: 'b', event: 0, start: 40, end: 70,
    }, {
      key: 'c', event: 1, start: 70, end: 130,
    }],
    events: [{ firstRow: 0, options: [opt(0, 0), opt(1, 0), opt(2, 0)] }, { firstRow: 2, options: [opt(0, 2), opt(1, 2), opt(2, 2)] }],
    groups: [{ id: 'me', count: 1, regenSeconds: 30 }],
    start: { me: [100] },
    rowOutcome: (i, o) => ({ seconds: secs[i][o], damage: 300, damageSpecs: [{ weapon: 'vw', cost: 50, net: 30 }] }),
    ...(surge ? { surge: true } : {}),
  };
};

describe('budget allocation (specBudget.ts allocateBudget)', () => {
  test('toy with two events: the DP matches an exhaustive search over spec counts', () => {
    const p = toy();
    const r = allocateBudget(p);
    expect(r.seconds).toBeCloseTo(bruteForce(p), 9);
    // by hand: 100% at the start, +10% at 30, 60, 90, 120 s. 2 maul specs at the start (25 + 20) leave 20% at 70 s: row c
    // unspecced, 105 s. 1 maul spec (30 + 22) leaves 50 + 10 + 10 = 70% at 70 s: one more maul spec on event 1 (40):
    // 92 s, the best (a Voidwaker spec on row a or b would leave event 1 short of 50%)
    expect(r.options).toEqual([1, 1]);
    expect(r.rows.every((x) => !Object.keys(x.damage).length)).toBe(true);
    expect(r.seconds).toBeCloseTo(30 + 22 + 40, 9);
  });
  test('with a surge dose: matches the exhaustive search; the dose pays for a Voidwaker spec on row c', () => {
    const p = toy(true);
    const r = allocateBudget(p);
    expect(r.seconds).toBeCloseTo(bruteForce(p), 9);
    // 1 maul (50%), the dose right after (75%), 95% at 70 s: 1 maul on event 1 (45%), 65% at the end of row c: Voidwaker
    expect(r.options).toEqual([1, 1]);
    expect(r.rows[2].damage).toEqual({ vw: 1 });
    expect(r.seconds).toBeCloseTo(30 + 22 + 40 * 0.9, 9);
  });
  test('never slower than no specs; a richer budget (Lightbearer) is never slower', () => {
    const p = toy();
    const none = [0, 1, 2].reduce((t, i) => t + p.rowOutcome(i, 0).seconds, 0);
    expect(allocateBudget(p).seconds).toBeLessThanOrEqual(none + 1e-9);
    const lb = { ...p, groups: [{ id: 'me', count: 1, regenSeconds: 15 }] };
    expect(allocateBudget(lb).seconds).toBeLessThanOrEqual(allocateBudget(p).seconds + 1e-9);
    expect(allocateBudget(lb).seconds).toBeCloseTo(bruteForce(lb), 9);
  });
  test('Team: carriers are pools; spends come from the fullest carrier; the DP matches the exhaustive search', () => {
    expect(spendFromGroup([100, 60], 1, 50)).toEqual([60, 50]);
    expect(spendFromGroup([40, 30], 1, 50)).toBeNull();
    const base = toy();
    const p: AllocationProblem = {
      ...base,
      groups: [{ id: 'maul', count: 2, regenSeconds: 30 }],
      start: { maul: [100, 100] },
      events: base.events.map((e) => ({
        ...e,
        options: [0, 1, 2, 3, 4].map((n) => ({
          counts: (n ? { maul: n } : {}) as Record<string, number>,
          spends: n ? [{
            group: 'maul', specs: n, cost: 50, row: e.firstRow,
          }] : [],
        })),
      })),
      rowOutcome: (i, o) => ({ seconds: [[40, 30, 25, 24, 23], [30, 22, 20, 19, 19], [60, 40, 36, 35, 35]][i][o], damage: 300, damageSpecs: [] }),
    };
    const r = allocateBudget(p);
    expect(r.seconds).toBeCloseTo(bruteForce(p), 9);
    // 4 specs at the start leave 20% each at 70 s (102 s); 3 + 1: 24 + 19 + 40 = 83; 2 + 2 (each carrier 50% → 70%
    // at 70 s): 25 + 20 + 36 = 81, the best
    expect(r.options).toEqual([2, 2]);
    expect(r.seconds).toBeCloseTo(81, 9);
  });
  test('regen ticks: on the clock, a tick at a row\'s start belongs to the row before', () => {
    expect(regenTicks(0, 30, 30)).toBe(1);
    expect(regenTicks(30, 59, 30)).toBe(0);
    expect(regenTicks(29, 61, 30)).toBe(2);
    expect(regenTicks(0, 60, 15)).toBe(4);
  });
});

// --- surge doses ---------------------------------------------------------------------------------------------------

describe('surge doses along a route (placeDoses, routeSurgeDoses)', () => {
  test('≥ 300 s apart, at most 4 per potion, the most time saved (exact)', () => {
    const items = [
      { id: 'a', at: 0, gain: 3 }, { id: 'b', at: 200, gain: 5 }, { id: 'c', at: 450, gain: 1 }, { id: 'd', at: 520, gain: 4 },
    ];
    // a + d = 7 (520 ≥ 300); b + d: 520 − 200 = 320 → 9; b + c: 250 < 300; a + c + ... a, c (450), not d (70 s after c)
    expect(placeDoses(items, 4)).toEqual(['b', 'd']);
    expect(placeDoses(items, 1)).toEqual(['b']);
    expect(placeDoses(items.map((x) => ({ ...x, gain: 0 })), 4)).toEqual([]);
    expect(SURGE_COOLDOWN_SECONDS).toBe(300);
    expect(dosesAllowed(0)).toBe(1);
    expect(dosesAllowed(299)).toBe(1);
    expect(dosesAllowed(900)).toBe(4);
    expect(dosesAllowed(1200)).toBe(5);
  });
  test('the route clock counts the encounters\' wall time only (ToB: the cooldown pauses between rooms; travel 0 s)', () => {
    const enc = (id: string, seconds: number) => ({ id, seconds } as unknown as EncounterTime);
    // ToB at party 4: wall = seconds × 4 ÷ 4; encounters of 200, 150 and 120 s start at 0, 200 and 350 s
    const plain = [enc('x', 200), enc('y', 150), enc('z', 120)];
    const dosed = [enc('x', 199), enc('y', 148), enc('z', 117)];
    expect(routeSurgeDoses(plain, dosed, { dpsMultiplier: 4, partySize: 4 }, 1)).toEqual(['x', 'z']);
    // FA (multiplier 1, party 4): the same seconds are 50, 37.5, 30 s of wall time: only one dose fits
    expect(routeSurgeDoses(plain, dosed, { dpsMultiplier: 1, partySize: 4 }, 1)).toEqual(['z']);
  });
});

describe('the 1 s per slot rule for damage spec weapons and the Surge potion (pickSpecItem)', () => {
  test('an item must save ≥ 1 s per slot; carried anyway (0 slots) > 0.05 s; the best net of its slots wins', () => {
    expect(pickSpecItem([{ item: 'vw', seconds: 99.2, slots: 1 }], 100)).toBeNull();
    expect(pickSpecItem([{ item: 'vw', seconds: 99, slots: 1 }], 100)?.item).toBe('vw');
    expect(pickSpecItem([{ item: 'zcb', seconds: 99.9, slots: 0 }], 100)?.item).toBe('zcb');
    expect(pickSpecItem([{ item: 'zcb', seconds: 99.97, slots: 0 }], 100)).toBeNull();
    expect(pickSpecItem([{ item: 'a', seconds: 97, slots: 1 }, { item: 'b', seconds: 96.5, slots: 2 }], 100)?.item).toBe('a');
  });
});

// --- the time model ------------------------------------------------------------------------------------------------

const kitOf = (id: RaidId, a: BestSetupAssumptions) => {
  const raid = raidConfig(id);
  const presets = (['melee', 'ranged', 'magic'] as const).map((g) => raid.presets.find((p) => p.group === g)!);
  return createKitEvaluator(presets.map((p) => presetKitLoadout(generateEmptyPlayer(), p, a)), a);
};
const enc = (id: RaidId, e: string, a: BestSetupAssumptions, drain: 'team' | 'solo' = 'team') => encounterTime(e, kitOf(id, a), raidTimeAssumptionsFrom(a, drain, raidConfig(id).defaultTimeSettings, raidConfig(id).time));

describe('drain events and Defence resets', () => {
  test('wiki resets are drain events: Sotetseg mazes, Bloat\'s stomp, Kephri\'s final phase, the Warden\'s enrage, Olm phases', () => {
    const keys = (rows: { key: string, targetKey: string, drainReset?: string }[]) => drainEventsOf(rows).events.map((e) => e.reset ?? '-');
    expect(keys([
      { key: 'a', targetKey: 'tob-sotetseg' }, { key: 'b', targetKey: 'tob-sotetseg', drainReset: 'maze 1' }, { key: 'c', targetKey: 'tob-sotetseg', drainReset: 'maze 2' },
    ])).toEqual(['-', 'maze 1', 'maze 2']);
    const toa = enc('toa', 'toa-kephri', A('toa'));
    expect(toa.phases.find((p) => p.key === 'kephri-final')?.drainReset).toBe('the final phase');
    const w = enc('toa', 'toa-wardens', A('toa'));
    expect(w.phases.find((p) => p.key === 'wardens-p3-enraged')?.drainReset).toBe('the enrage');
  });
});

describe('the spec budget in the time model', () => {
  test('Sotetseg: the three events share one budget per carrier (2 Elder maul + 2 BGS, party 4: 8 specs at most from the start)', () => {
    const e = enc('tob', 'tob-sotetseg', A('tob'));
    const sp = e.specPlan!;
    expect(sp.events.map((x) => x.reset ?? '-')).toEqual(['-', 'maze 1', 'maze 2']);
    const total = (w: 'elderMaul' | 'bgs') => sp.events.reduce((t, x) => t + (x.counts[w] ?? 0), 0);
    // each carrier: 100% + 10% per 30 s of the fight (wall time ≈ the seconds at party 4) → 2 + floor(regen / 50) specs
    const ticks = Math.floor(e.seconds / 30) + 1;
    const most = 2 * (2 + Math.floor((ticks * 10) / 50));
    expect(total('elderMaul')).toBeLessThanOrEqual(most);
    expect(total('bgs')).toBeLessThanOrEqual(most);
    // the old model gave every event the full 4 + 4 specs
    expect(total('elderMaul') + total('bgs')).toBeLessThan(3 * 8);
  });
  test('adds get nothing: no drain specs and no damage specs on the ToA scarabs / Akkha\'s Shadows', () => {
    const a = { ...A('toa'), damageSpecs: ['voidwaker' as const, 'dragonClaws' as const] };
    ['toa-kephri', 'toa-akkha'].forEach((id) => {
      const e = enc('toa', id, a);
      e.phases.forEach((p) => {
        if (findTarget(p.targetKey).noDrains === NO_DRAINS_ADDS) {
          expect(p.damageSpecs ?? []).toEqual([]);
          expect(damageLimited(p, a.partySize)).toBe(false);
        }
      });
      e.specPlan!.events.forEach((ev) => {
        if (/Scarab|Shadow/.test(ev.npc)) expect(ev.counts).toEqual({});
      });
    });
  });
  test('never slower than spending nothing; damage specs only make it faster', () => {
    (['fractured-archive', 'toa', 'tob'] as RaidId[]).forEach((id) => {
      const e0 = raidConfig(id).time.routeSlots.map((s) => s.options[0])[1];
      const plain = enc(id, e0, A(id));
      expect(plain.seconds).toBeLessThanOrEqual(plain.specPlan!.noSpecSeconds + 1e-9);
      const dmg = enc(id, e0, { ...A(id), damageSpecs: ['voidwaker', 'zcb'] });
      expect(dmg.seconds).toBeLessThanOrEqual(plain.seconds + 1e-9);
    });
  });
  test('energy is not carried between encounters by default (CARRY_SPEC_ENERGY); the flag carries the leftover', () => {
    expect(CARRY_SPEC_ENERGY).toBe(false);
    const a = A('tob');
    const ta = raidTimeAssumptionsFrom(a, 'team', raidConfig('tob').defaultTimeSettings, raidConfig('tob').time);
    const kit = kitOf('tob', a);
    const first = encounterTime('tob-maiden', kit, ta);
    const carried = encounterTime('tob-bloat', kit, { ...ta, specBudget: { ...ta.specBudget!, carry: true } }, { startState: first.specPlan!.end, clock0: first.seconds });
    expect(carried.specPlan!.start).toEqual(first.specPlan!.end);
    expect(carried.seconds).toBeGreaterThanOrEqual(encounterTime('tob-bloat', kit, ta).seconds - 1e-9);
  });
});

describe('brute force on real encounters: the DP (pruned options) = an exhaustive search (every option)', () => {
  const problemOf = (id: RaidId, e: string, a: BestSetupAssumptions, drain: 'team' | 'solo', surge = false) => {
    const raid = raidConfig(id);
    const ta = raidTimeAssumptionsFrom(a, drain, raid.defaultTimeSettings, raid.time);
    const kit = kitOf(id, a);
    const pass = (k: Parameters<typeof raid.time.encounterPass>[1], d: 'none' | 'team' | 'solo', f: number) => raid.time.encounterPass(e, k, ta, d, f);
    const first = pass(kit, 'none', ta.fallbackFightSeconds);
    let got: { pruned: AllocationProblem, full: AllocationProblem } | undefined;
    const r = budgetedEncounter(kit, ta, ta.specBudget!, {
      drain, pass, first, fightSeconds: 60, clock0: 0, surge, onProblem: (pruned, full) => { got = { pruned, full }; },
    });
    return { r, ...got! };
  };
  test('ToB Sotetseg (Team, 2 Elder maul + 2 BGS, three events): every option combination', () => {
    const { r, pruned, full } = problemOf('tob', 'tob-sotetseg', A('tob'), 'team');
    expect(full.events).toHaveLength(3);
    const dp = allocateBudget(pruned).seconds;
    expect(dp).toBeCloseTo(bruteForce(full), 6);
    // the plan the time model reports is the DP's (the top-up only adds specs that cost no time)
    expect(r.seconds).toBeCloseTo(dp, 6);
  });
  test('FA Xarth (Solo, party 4, Elder maul + Tonalztics + Voidwaker + a surge dose): drains, damage specs and the dose', () => {
    const a: BestSetupAssumptions = {
      ...A('fractured-archive'),
      partySize: 4,
      mySpecs: {
        ...A('fractured-archive').mySpecs, elderMaul: true, tonalztics: true,
      },
      damageSpecs: ['voidwaker'],
      surgePotions: 1,
    };
    const { r, pruned, full } = problemOf('fractured-archive', 'xarth', a, 'solo', true);
    const dp = allocateBudget(pruned).seconds;
    expect(dp).toBeCloseTo(bruteForce(full), 6);
    expect(r.seconds).toBeCloseTo(dp, 6);
    expect(r.plan.events[0].counts.elderMaul ?? 0).toBeGreaterThanOrEqual(0);
  });
});

describe('formatDuration (phase 36 fix)', () => {
  test('rounds to the tenth before splitting minutes: 1499.96 s is 25:00.0 (was "24:60.0")', () => {
    expect(formatDuration(1499.96)).toBe('25:00.0');
    expect(formatDuration(1499.94)).toBe('24:59.9');
    expect(formatDuration(59.97)).toBe('1:00.0');
    expect(formatDuration(245.3)).toBe('4:05.3');
  });
});

describe('option cap per event (MAX_EVENT_OPTIONS)', () => {
  test('keeps option 0, the fastest option per spec count, then the fastest; unchanged below the cap', () => {
    expect(MAX_EVENT_OPTIONS).toBe(24);
    const secs = [100, 90, 80, 85, 70, 60, 75];
    const specs = [0, 1, 1, 2, 2, 3, 3];
    const kept = [0, 1, 2, 3, 4, 5, 6];
    expect(capOptions(kept, (i) => secs[i], (i) => specs[i])).toEqual(kept);
    // cap 4: option 0, the best of 1 spec (2: 80 s), 2 specs (4: 70 s), 3 specs (5: 60 s)
    expect(capOptions(kept, (i) => secs[i], (i) => specs[i], 4)).toEqual([0, 2, 4, 5]);
    // cap 5: + the fastest left (6: 75 s)
    expect(capOptions(kept, (i) => secs[i], (i) => specs[i], 5)).toEqual([0, 2, 4, 5, 6]);
  });
});

// --- phase 36 review fixes --------------------------------------------------------------------------------------------

describe('review: one spec bar per party member (Team)', () => {
  test('with damage specs or a Surge potion you are not a carrier: carriers ≤ party − 1, bars = party', () => {
    const a: BestSetupAssumptions = {
      ...A('fractured-archive'),
      partySize: 6,
      team: {
        ...A('fractured-archive').team,
        carriers: {
          ...A('fractured-archive').team.carriers, elderMaul: 2, tonalztics: 4, dwh: 0, bgs: 0, ayak: 0,
        },
      },
    };
    const bars = (x: BestSetupAssumptions) => budgetGroups(specBudgetFrom(x, 'team')!).reduce((t, g) => t + g.count, 0);
    expect(bars(a)).toBe(6);
    expect(specBudgetFrom(a, 'team')!.carriers).toEqual({ elderMaul: 2, tonalztics: 4 });
    // the last carriers in teamSpecPlan's order make way for your bar
    expect(specBudgetFrom({ ...a, damageSpecs: ['zcb'] }, 'team')!.carriers).toEqual({ elderMaul: 2, tonalztics: 3 });
    expect(bars({ ...a, damageSpecs: ['zcb'] })).toBe(6);
    expect(bars({ ...a, surgePotions: 1 })).toBe(6);
    // fewer carriers than the party: nobody is dropped
    const four = { ...a, team: { ...a.team, carriers: { ...a.team.carriers, tonalztics: 2 } } };
    expect(specBudgetFrom({ ...four, damageSpecs: ['zcb'] }, 'team')!.carriers).toEqual({ elderMaul: 2, tonalztics: 2 });
    expect(bars({ ...four, damageSpecs: ['zcb'] })).toBe(5);
    // Solo: your bar only
    expect(budgetGroups(specBudgetFrom({ ...a, damageSpecs: ['zcb'] }, 'solo')!)).toHaveLength(1);
  });
});

describe('review: damage specs valued at the hp left at the row\'s start', () => {
  test('rowHpLeft: the NPC\'s damage still to deal in its drain event (a Defence reset starts a new count)', () => {
    const rows = encounterPlan('archive-guardian', RAID_TIME_DEFAULTS, 6);
    const left = rowHpLeft(rows);
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r.damage]));
    expect(left.get('ag-flying')).toBeCloseTo(byKey['ag-flying'], 9);
    expect(left.get('ag-grounded')).toBeCloseTo(byKey['ag-grounded'] + byKey['ag-flying'], 9);
    // the shield row: the kits cap it at the boss's full hp (atHpLeft)
    expect(left.get('ag-shield')).toBeCloseTo(byKey['ag-shield'] + byKey['ag-grounded'] + byKey['ag-flying'], 9);
    const sot = rowHpLeft([
      { key: 'a', targetKey: 'tob-sotetseg', damage: 100 },
      {
        key: 'b', targetKey: 'tob-sotetseg', damage: 50, drainReset: 'maze 1',
      },
      { key: 'c', targetKey: 'tob-sotetseg', damage: 25 },
    ]);
    expect([sot.get('a'), sot.get('b'), sot.get('c')]).toEqual([100, 75, 25]);
  });
  test('a Zaryte crossbow spec on the AG\'s last 165 hp: the ruby proc is worth ≤ 36 (a share of 165, not of the full hp)', () => {
    const a = A('fractured-archive');
    const m = buildTargetMonster(findTarget('ag-flying'), undefined, 'none', a).monster;
    const flying = encounterPlan('archive-guardian', RAID_TIME_DEFAULTS, a.partySize).find((r) => r.key === 'ag-flying')!.damage;
    expect(flying).toBeCloseTo(165, 0);
    const best = (hp?: number) => bestDamageVariant(damageSpecProfile(atHpLeft(m, hp), 'zcb', a), 14)!.expected;
    // hp 1: no proc to speak of; the proc's share of the expected damage at 165 hp is ≤ 0.22 × 165 = 36.3
    expect(best(165) - best(1)).toBeLessThanOrEqual(0.22 * 165 + 1e-6);
    expect(best(undefined) - best(1)).toBeGreaterThan(50);
    expect(atHpLeft(m, 1e9)).toBe(m);
    expect(atHpLeft(m, 164.2).inputs.monsterCurrentHp).toBe(165);
    // in the time model: a ZCB spec on the flying row is valued at that hp
    const e = enc('fractured-archive', 'archive-guardian', { ...a, damageSpecs: ['zcb'] });
    const row = e.phases.find((p) => p.key === 'ag-flying')!;
    (row.damageSpecs ?? []).filter((d) => d.weapon === 'zcb').forEach((d) => {
      expect(d.expected).toBeLessThanOrEqual(best(165) + 1e-6);
    });
  });
});

describe('review: regen on the drained clock', () => {
  test('Archive Guardian (Team, ZCB + Burning claws): re-planned on the clock of its own drained phases', () => {
    const a: BestSetupAssumptions = { ...A('fractured-archive'), damageSpecs: ['zcb', 'burningClaws'] };
    const raid = raidConfig('fractured-archive');
    const ta = raidTimeAssumptionsFrom(a, 'team', raid.defaultTimeSettings, raid.time);
    const kit = kitOf('fractured-archive', a);
    const pass = (k: Parameters<typeof raid.time.encounterPass>[1], d: 'none' | 'team' | 'solo', f: number) => raid.time.encounterPass('archive-guardian', k, ta, d, f);
    const first = pass(kit, 'none', ta.fallbackFightSeconds);
    const clocks: number[] = [];
    const r = budgetedEncounter(kit, ta, ta.specBudget!, {
      drain: 'team',
      pass,
      first,
      fightSeconds: 60,
      clock0: 0,
      surge: false,
      onProblem: (p) => { clocks.push(p.rows[p.rows.length - 1].end); },
    });
    expect(clocks.length).toBeGreaterThanOrEqual(2);
    expect(clocks.length).toBeLessThanOrEqual(CLOCK_ROUNDS + 1);
    // the first clock is the undrained pass; the later ones the drained plan's phases (shorter: fewer regen ticks)
    const wall = (secs: number) => (secs * (ta.dpsMultiplier ?? 1)) / ta.partySize;
    expect(clocks[0]).toBeCloseTo(wall(first.reduce((t, p) => t + p.seconds, 0)), 6);
    expect(clocks[clocks.length - 1]).toBeLessThan(clocks[0] - 1);
    // your bar (100% + 10% per 30 s of the drained fight) pays for the damage specs the plan makes
    const mine = Object.values(r.plan.damage).reduce((t, d) => t + (d.zcb ?? 0) * DAMAGE_SPEC_WEAPONS.zcb.energy + (d.burningClaws ?? 0) * DAMAGE_SPEC_WEAPONS.burningClaws.energy, 0);
    expect(mine).toBeGreaterThan(0);
    expect(mine).toBeLessThanOrEqual(100 + 10 * Math.floor(wall(r.seconds) / 30) + 1e-9);
  });
});

describe('review: the optimiser\'s fixed spec plan vs the exact per-kit allocation (reduced pool, brute force)', () => {
  // The planner's optimiser replays one spec plan (the DP on a reference kit); the reported time of a kit is its own
  // exact allocation. Brute force over every kit of the reduced pool's candidates (up to KIT_MAX loadouts, within the
  // slots, the plan's carried items, carriers, damage specs and doses) with that exact time: the planner's kit is the
  // fastest (gap 0).
  const KIT_MAX = 4;
  const ROUTE = 'archive-guardian>bork-smorks>moia>xarth>ocellus';
  (process.env.RUN_SLOW_TESTS ? test : test.skip)(`FA Team, route ${ROUTE}: the planner's kit = the brute-force best`, () => {
    const raid = raidConfig('fractured-archive');
    const spaces: Parameters<NonNullable<PlanHooks['onKitSpace']>>[0][] = [];
    const res = plan({
      ringPolicy: DEFAULT_RING_POLICY,
      specMode: DEFAULT_SPEC_MODE,
      carrierMode: DEFAULT_CARRIER_MODE,
      basePlayer: generateEmptyPlayer(),
      assumptions: raid.defaultAssumptions,
      drain: 'team',
      settings: raid.defaultTimeSettings,
      route: ROUTE,
      pinned: raid.planDefaults.pinned.map((n) => planItemByName(n).id),
      nonItemSlots: raid.planDefaults.nonItemSlots,
      supplies: raid.defaultSupplies,
    }, {
      model: raid.time,
      presets: (['melee', 'ranged', 'magic'] as const).map((g) => raid.presets.find((p) => p.group === g)!),
      search: { weapons: ['Scythe of Vitur', 'Tumeken\'s shadow', 'Twisted bow'], maxPasses: 1 },
      perGroupWeapons: 1,
      perWeapon: 1,
      bases: 1,
      partners: 1,
      seeds: 4,
      maxCandidates: 10,
    }, { onKitSpace: (x) => { spaces.push(x); } });
    // camp one ring: one run per ring screened in full; the plan is the chosen ring's run
    const s = spaces.find((x) => x.ring === res.ring.ring)!;
    expect(s).toBeDefined();
    const planned = res.comparison!.routes[res.planned].seconds;
    expect(s.exactSeconds(s.members)).toBeCloseTo(planned, 6);
    const n = s.candidates.length;
    let best = Infinity;
    let bestKit: number[] = [];
    let kits = 0;
    const walk = (from: number, m: number[]) => {
      if (m.length) {
        if (s.used(m) <= s.total) {
          kits += 1;
          const t = s.exactSeconds(m);
          if (t < best - 1e-9) {
            best = t;
            bestKit = [...m];
          }
        }
      }
      if (m.length >= KIT_MAX) return;
      for (let i = from; i < n; i++) walk(i + 1, [...m, i]);
    };
    walk(0, []);
    // eslint-disable-next-line no-console
    console.log(`brute force: ${kits} kits of ${n} candidates; best ${best.toFixed(4)} (${bestKit.map((i) => s.candidates[i].label).join(' + ')}); planner ${planned.toFixed(4)} (${s.members.map((i) => s.candidates[i].label).join(' + ')}); gap ${(planned - best).toFixed(4)}`);
    expect(kits).toBeGreaterThan(n);
    expect(planned - best).toBeLessThanOrEqual(1e-6);
  }, 3600000);
});

describe('review: you carry a drain weapon or you damage-spec (Team, one bar each)', () => {
  // The planner keeps the faster of "you carry, no damage specs / doses" and "you spec, carriers ≤ party − 1". Checked
  // both ways with the exact time model on the planned kit: the option not taken is never faster.
  const raid = raidConfig('fractured-archive');
  const ROUTE = 'archive-guardian>bork-smorks>moia>xarth>ocellus';
  const planAt = (party: number) => plan({
    ringPolicy: DEFAULT_RING_POLICY,
    specMode: DEFAULT_SPEC_MODE,
    carrierMode: DEFAULT_CARRIER_MODE,
    basePlayer: generateEmptyPlayer(),
    assumptions: { ...raid.defaultAssumptions, partySize: party },
    drain: 'team',
    settings: raid.defaultTimeSettings,
    route: ROUTE,
    pinned: raid.planDefaults.pinned.map((n) => planItemByName(n).id),
    nonItemSlots: raid.planDefaults.nonItemSlots,
    supplies: raid.defaultSupplies,
  }, {
    model: raid.time,
    presets: (['melee', 'ranged', 'magic'] as const).map((g) => raid.presets.find((p) => p.group === g)!),
    search: { weapons: ['Scythe of Vitur', 'Tumeken\'s shadow', 'Twisted bow'], maxPasses: 1 },
    perGroupWeapons: 1,
    perWeapon: 1,
    bases: 1,
    partners: 1,
    seeds: 2,
  });
  /** The planned kit's exact route time with these carriers / damage specs / doses. */
  const exactWith = (res: ReturnType<typeof planAt>, party: number, carriers: Record<string, number>, damage: DamageSpecWeapon[], surge: number) => {
    const ringA = ringAssumptions(planAssumptions({ ...raid.defaultAssumptions, partySize: party }, comfortSupplies(raid.defaultSupplies), raid.planDefaults.pinned.map((n) => planItemByName(n).id)), DEFAULT_RING_POLICY, res.ring.ring ? { name: res.ring.ring } : null);
    const a: BestSetupAssumptions = {
      ...ringA,
      team: {
        ...ringA.team,
        carriers: {
          elderMaul: 0, dwh: 0, bgs: 0, tonalztics: 0, ayak: 0, ...carriers,
        },
      },
      damageSpecs: damage,
      surgePotions: surge,
    };
    const base = generateEmptyPlayer();
    const loadouts: KitLoadout[] = res.kit.map((c) => {
      const eq = toPlayerEquipment(c.equipment);
      return {
        id: c.key, name: c.label, group: c.group, options: c.options, toPlayer: (m, o, ta) => applyLoadoutToPlayer(base, c.label, c.group, eq, o.style, o.spell, m, ta ?? a),
      };
    });
    const cmp = compareRoutes(createKitEvaluator(loadouts, a), raidTimeAssumptionsFrom(a, 'team', raid.defaultTimeSettings, raid.time), routesFor({ model: raid.time }).filter((r) => r.id === ROUTE));
    return cmp.routes[cmp.fastest].seconds;
  };
  (process.env.RUN_SLOW_TESTS ? test : test.skip)('party 1: your one bar carries the drain weapon (a damage spec instead is slower); party 6: the reverse', () => {
    const one = planAt(1);
    const t1 = one.comparison!.routes[one.planned].seconds;
    expect(one.specs.damage ?? []).toEqual([]);
    expect(one.specs.surgePotions ?? 0).toBe(0);
    const c1 = one.specs.team!.carriers!;
    expect(Object.values(c1).reduce((t, v) => t + v, 0)).toBe(1);
    // the same kit with your bar on a Zaryte crossbow / Voidwaker and no carrier: slower
    expect(exactWith(one, 1, {}, ['zcb'], 0)).toBeGreaterThan(t1);
    expect(exactWith(one, 1, {}, ['voidwaker'], 0)).toBeGreaterThan(t1);
    expect(exactWith(one, 1, c1, [], 0)).toBeCloseTo(t1, 6);

    const six = planAt(6);
    const t6 = six.comparison!.routes[six.planned].seconds;
    const c6 = six.specs.team!.carriers!;
    expect((six.specs.damage ?? []).length).toBeGreaterThan(0);
    expect(Object.values(c6).reduce((t, v) => t + v, 0)).toBeLessThanOrEqual(5);
    expect(exactWith(six, 6, c6, six.specs.damage ?? [], six.specs.surgePotions ?? 0)).toBeCloseTo(t6, 6);
    // you carrying instead (one more carrier of each weapon, no items): slower
    (Object.keys(c6) as (keyof typeof c6)[]).filter((w) => w !== 'ayak').forEach((w) => {
      expect(exactWith(six, 6, { ...c6, [w]: c6[w] + 1 }, [], 0)).toBeGreaterThan(t6);
    });
  }, 3600000);
});
