import { describe, expect, test } from '@jest/globals';
import { generateEmptyPlayer } from '@/state';
import PlayerVsNPCCalc from '@/lib/PlayerVsNPCCalc';
import { buildTargetMonster, findTarget } from '@/lib/fracturedArchive/bestSetup';
import {
  DAMAGE_SPEC_ARMOUR, damageSpecPlayer, damageSpecProfile, damageSpecRanking, netSpecDamage, specCalcNumbers,
  specSecondsSaved,
} from '@/lib/fracturedArchive/damageSpecs';
import {
  allocateBudget, AllocationProblem, CARRY_SPEC_ENERGY, dosesAllowed, placeDoses, regenTicks, rowSecondsAfter,
  spendFromGroup, SPEC_MAX_ENERGY, SURGE_COOLDOWN_SECONDS, SURGE_DOSE_ENERGY,
} from '@/lib/fracturedArchive/specBudget';
import {
  budgetedEncounter, capOptions, damageLimited, drainEventsOf, MAX_EVENT_OPTIONS,
} from '@/lib/fracturedArchive/encounterBudget';
import {
  createKitEvaluator, encounterTime, EncounterTime, formatDuration, presetKitLoadout, raidTimeAssumptionsFrom, routeSurgeDoses,
} from '@/lib/fracturedArchive/raidTime';
import { pickSpecItem } from '@/lib/fracturedArchive/specChoice';
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
    const plan = e.specPlan!;
    expect(plan.events.map((x) => x.reset ?? '-')).toEqual(['-', 'maze 1', 'maze 2']);
    const total = (w: 'elderMaul' | 'bgs') => plan.events.reduce((t, x) => t + (x.counts[w] ?? 0), 0);
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
