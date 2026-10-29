import { describe, expect, test } from '@jest/globals';
import { OTHER_RAIDS, otherRaidsDescribe } from '@/tests/utils/otherRaids';
import { generateEmptyPlayer } from '@/state';
import {
  allocateBudget, AllocationProblem, BudgetRow, costFactorAt, damageSpecCost, deathChargeSchedule, DEATH_CHARGE_ENERGY,
  simulateBudget,
} from '@/lib/fracturedArchive/specBudget';
import {
  budgetedEncounter, damageLimited, rowKills, withDeathCharge,
} from '@/lib/fracturedArchive/encounterBudget';
import {
  createKitEvaluator, encounterTime, presetKitLoadout, raidTimeAssumptionsFrom, specBudgetFrom,
} from '@/lib/fracturedArchive/raidTime';
import { DAMAGE_SPEC_WEAPONS } from '@/lib/fracturedArchive/damageSpecs';
import { findTarget } from '@/lib/fracturedArchive/bestSetup';
import { BestSetupAssumptions } from '@/lib/fracturedArchive/presets';
import { raidConfig } from '@/lib/raids';
import { spellbookOf } from '@/lib/raids/base';
import { defaultPlanInputs, validatePlanInputs } from '@/lib/raids/settings';
import { TOA_ADRENALINE_DOSES } from '@/lib/raids/toa/time';
import { LIQUID_ADRENALINE_SECONDS } from '@/lib/raids/toa/supplies';
import { NO_DRAINS_ADDS, RaidId } from '@/lib/raids/types';

// Phase 38b: Death Charge (Arceuus), Liquid adrenaline (ToA), damage specs on adds. Docs: docs/BEST_SETUP.md *Death
// Charge, Liquid adrenaline, damage specs on adds (phase 38b)*; readings: UNVERIFIED D32 / D33.

const A = (id: RaidId): BestSetupAssumptions => raidConfig(id).defaultAssumptions;
const kitOf = (id: RaidId, a: BestSetupAssumptions) => {
  const raid = raidConfig(id);
  const presets = (['melee', 'ranged', 'magic'] as const).map((g) => raid.presets.find((p) => p.group === g)!);
  return createKitEvaluator(presets.map((p) => presetKitLoadout(generateEmptyPlayer(), p, a)), a);
};

describe('Death Charge', () => {
  test('casts: 2 kills per cast within 60 s, then a 60 s cooldown (greedy, by hand)', () => {
    // cast at 10 covers 10 and 20; 30 is the cast's 3rd kill (no); 40 is inside the cooldown (ready at 70); cast at 75
    // covers 75 and 80; cast at 200 covers 200
    expect(deathChargeSchedule([10, 20, 30, 40, 75, 80, 200])).toEqual([true, true, false, false, true, true, true]);
    // unupgraded (1 per cast): 10, 75, 200
    expect(deathChargeSchedule([10, 20, 30, 40, 75, 80, 200], 0, 1)).toEqual([true, false, false, false, true, false, true]);
    // input order kept; a kill at the window's last moment (10 + 60) still counts
    expect(deathChargeSchedule([70, 10])).toEqual([true, true]);
  });

  test('kills: each NPC dies at its last row; the wiki exceptions (Glowing crystal, Olm\'s hands, the obelisk) never trigger it', () => {
    expect(rowKills([{ key: 's', targetKey: 'cox-muttadile-small' }, { key: 'l', targetKey: 'cox-muttadile-large' }])).toEqual([1, 1]);
    expect(rowKills([{ key: 'c', targetKey: 'cox-glowing-crystal' }, { key: 'v', targetKey: 'cox-vasa' }])).toEqual([0, 1]);
    expect(rowKills([
      { key: 'r', targetKey: 'cox-olm-right' }, { key: 'l', targetKey: 'cox-olm-left' }, { key: 'r2', targetKey: 'cox-olm-right' }, { key: 'h', targetKey: 'cox-olm-head' },
    ])).toEqual([0, 0, 0, 1]);
    // the Archive Guardian's three rows are one NPC: one kill, at its last row
    expect(rowKills([{ key: 'a', targetKey: 'ag-flying' }, { key: 'b', targetKey: 'ag-grounded' }, { key: 'c', targetKey: 'ag-flying' }])).toEqual([0, 0, 1]);
    // a row's own count: Akkha's four Shadows
    expect(rowKills([{ key: 'x', targetKey: 'toa-akkha-shadow', kills: 4 }, { key: 'y', targetKey: 'toa-akkha' }])).toEqual([4, 1]);
    expect(rowKills([{ key: 'o', targetKey: 'toa-obelisk' }])).toEqual([0]);
  });

  test('toy encounter with N = 2 kills: +15% each at the rows\' ends turns 1 + 1 maul specs into 2 + 1 (by hand)', () => {
    // Solo, one bar, 30 s regen. Event 0 = rows a (0-50 s, a kill at 50) and b (50-110 s, a kill at 110), maul specs
    // (50%) at row a; event 1 = row c (110-170 s), maul specs at row c. Phase 38h-2: options worth HP (event 0: 1 maul
    // 50, 2 mauls 75; event 1: 1 maul 40)
    const values = [[0, 50, 75], [0, 40]];
    const opt = (n: number, row: number) => ({
      counts: (n ? { maul: n } : {}) as Record<string, number>,
      spends: n ? [{
        group: 'me', specs: n, cost: 50, row,
      }] : [],
      value: values[row === 0 ? 0 : 1][n],
    });
    const secs = [[30, 25, 20], [30, 25, 20], [60, 40]];
    const clock: BudgetRow[] = [{
      key: 'a', event: 0, start: 0, end: 50,
    }, {
      key: 'b', event: 0, start: 50, end: 110,
    }, {
      key: 'c', event: 1, start: 110, end: 170,
    }];
    const problem = (rows: BudgetRow[]): AllocationProblem => ({
      rows,
      events: [{ firstRow: 0, options: [opt(0, 0), opt(1, 0), opt(2, 0)] }, { firstRow: 2, options: [opt(0, 2), opt(1, 2)] }],
      groups: [{ id: 'me', count: 1, regenSeconds: 30 }],
      start: { me: [100] },
      rowOutcome: (i, o) => ({ seconds: secs[i][o], damage: 100, damageSpecs: [] }),
    });
    // without Death Charge: 2 specs leave 0% + 1 tick (row a) + 2 ticks (row b) = 30% at row c (no spec): 75 HP;
    // 1 spec leaves 50 + 30 = 80% at row c (a spec): 50 + 40 = 90 HP, the best
    const plain = allocateBudget(problem(clock));
    expect(plain.options).toEqual([1, 1]);
    expect(plain.hp).toBeCloseTo(90, 9);
    expect(plain.seconds).toBeCloseTo(90, 9);
    // with Death Charge (party 1): both kills covered (cast at 50, the second kill at 110 = cast + 60 s) → +15% at the
    // ends of rows a and b
    const dc = withDeathCharge(clock, [1, 1, 0], 1, 0);
    expect(dc.plan).toEqual({ kills: 2, covered: 2, perKill: DEATH_CHARGE_ENERGY });
    expect(dc.rows.map((r) => r.restore ?? 0)).toEqual([15, 15, 0]);
    // 2 specs: 0 + 10 (tick) + 15 (kill) + 20 (2 ticks) + 15 (kill) = 60% at row c: a spec → 75 + 40 = 115 HP
    const charged = allocateBudget(problem(dc.rows));
    expect(charged.options).toEqual([2, 1]);
    expect(charged.hp).toBeCloseTo(115, 9);
    expect(charged.seconds).toBeCloseTo(80, 9);
    expect(simulateBudget(problem(dc.rows), { options: [2, 1], damage: [{}, {}, {}], drinkRow: -1 }).end.me[0]).toBeCloseTo(60 - 50 + 20, 9);
    // party 2 (7.5% per kill): 0 + 10 + 7.5 + 20 + 7.5 = 45% < 50%, back to 1 + 1 (90 HP)
    const half = allocateBudget(problem(withDeathCharge(clock, [1, 1, 0], 0.5, 0).rows));
    expect(half.options).toEqual([1, 1]);
    expect(half.hp).toBeCloseTo(90, 9);
    // a kill at a full bar restores nothing (wiki: it "will trigger the active effect ... without actually restoring")
    const full = simulateBudget(problem(dc.rows), { options: [0, 0], damage: [{}, {}, {}], drinkRow: -1 });
    expect(full.end.me[0]).toBe(100);
  });

  test('on the Arceuus spellbook only (the default): share = 1 ÷ party size; Plan input saved and validated', () => {
    expect(spellbookOf(A('fractured-archive'))).toBe('arceuus');
    expect(specBudgetFrom({ ...A('fractured-archive'), partySize: 4 }, 'team')!.deathCharge).toEqual({ share: 0.25 });
    expect(specBudgetFrom({ ...A('fractured-archive'), partySize: 1 }, 'solo')!.deathCharge).toEqual({ share: 1 });
    expect(specBudgetFrom({ ...A('fractured-archive'), spellbook: 'ancients' }, 'team')!.deathCharge).toBeUndefined();
    const fa = raidConfig('fractured-archive');
    (['fractured-archive', 'toa', 'cox', 'tob'] as RaidId[]).filter((id) => OTHER_RAIDS || id === 'fractured-archive').forEach((id) => expect(defaultPlanInputs(raidConfig(id)).spellbook).toBe('arceuus'));
    expect(validatePlanInputs(fa, { spellbook: 'lunar' }, fa.defaultAssumptions).spellbook).toBe('lunar');
    expect(validatePlanInputs(fa, { spellbook: 'necromancy' }, fa.defaultAssumptions).spellbook).toBe('arceuus');
  });

  test('in the time model: Bork & Smorks (party 1, Solo) restores 15% at Bork\'s death, before the Smorks', () => {
    const a = { ...A('fractured-archive'), partySize: 1 };
    const ta = raidTimeAssumptionsFrom(a, 'solo', raidConfig('fractured-archive').defaultTimeSettings, raidConfig('fractured-archive').time);
    const e = encounterTime('bork-smorks', kitOf('fractured-archive', a), ta);
    // Bork (its last row) and the Smorks: 2 kills, both covered (the Smorks die within the cast's 60 s, or later, when
    // the cooldown has passed and a new cast covers them)
    expect(e.specPlan!.deathCharge).toEqual({ kills: 2, covered: 2, perKill: 15 });
    const off = encounterTime('bork-smorks', kitOf('fractured-archive', a), { ...ta, specBudget: { ...ta.specBudget!, deathCharge: undefined } });
    expect(e.seconds).toBeLessThanOrEqual(off.seconds + 1e-9);
  });
});

otherRaidsDescribe('Liquid adrenaline (ToA)', () => {
  test('doses: none before the supplies, 1 each in rooms 3-4 (the first drop\'s 2 doses), 2 on the Wardens', () => {
    // phase 38c: every path room has a before-supplies encounter (0 doses) and an after-supplies one (1 dose)
    expect(TOA_ADRENALINE_DOSES).toEqual({
      'toa-kephri-before-supplies': 0,
      'toa-zebak-before-supplies': 0,
      'toa-akkha-before-supplies': 0,
      'toa-baba-before-supplies': 0,
      'toa-kephri': 1,
      'toa-zebak': 1,
      'toa-akkha': 1,
      'toa-baba': 1,
      'toa-wardens': 2,
    });
    expect(LIQUID_ADRENALINE_SECONDS).toBe(150);
    expect(specBudgetFrom(A('toa'), 'team')!.adrenaline).toBe(true);
    expect(specBudgetFrom(A('fractured-archive'), 'team')!.adrenaline).toBeUndefined();
    const ta = raidTimeAssumptionsFrom(A('toa'), 'team', raidConfig('toa').defaultTimeSettings, raidConfig('toa').time);
    expect(encounterTime('toa-baba', kitOf('toa', A('toa')), ta).specPlan!.adrenalineSeconds).toBe(150);
    expect(encounterTime('toa-zebak-before-supplies', kitOf('toa', A('toa')), ta).specPlan!.adrenalineSeconds).toBeUndefined();
    expect(costFactorAt({ halfCostUntil: 150 }, { start: 149 })).toBe(0.5);
    expect(costFactorAt({ halfCostUntil: 150 }, { start: 150 })).toBe(1);
  });

  test('a ZCB spec on Zebak costs 37.5% instead of 75% inside the window: 3 specs instead of 2 (by hand)', () => {
    // Zebak (room 2) has no adrenaline in the model (before the supplies); the dose is given to the budget directly
    const toa = raidConfig('toa');
    const b: BestSetupAssumptions = {
      ...A('toa'),
      mySpecs: {
        ...A('toa').mySpecs, elderMaul: false, dwh: false, bgs: false, tonalztics: false, ayak: 0,
      },
      damageSpecs: ['zcb'],
    };
    const tb = raidTimeAssumptionsFrom(b, 'solo', toa.defaultTimeSettings, toa.time);
    const kit = kitOf('toa', b);
    // phase 38c: the before-supplies encounter (the phase 38b 'toa-zebak')
    const pass = (k: Parameters<typeof toa.time.encounterPass>[1], d: 'none' | 'team' | 'solo', f: number) => toa.time.encounterPass('toa-zebak-before-supplies', k, tb, d, f);
    const first = pass(kit, 'none', tb.fallbackFightSeconds);
    const run = (adrenalineSeconds: number) => budgetedEncounter(kit, tb, { ...tb.specBudget!, deathCharge: undefined }, {
      drain: 'solo', pass, first, fightSeconds: 60, clock0: 0, surge: false, adrenalineSeconds,
    });
    const plain = run(0);
    const dosed = run(LIQUID_ADRENALINE_SECONDS);
    expect(DAMAGE_SPEC_WEAPONS.zcb.energy).toBe(75);
    const row = first[0];
    const mult = tb.dpsMultiplier ?? 1;
    const s0 = row.damage / (mult * row.dps);
    const { net } = plain.phases[0].damageSpecs![0];
    const secondsAfter = (m: number) => s0 * (1 - (m * net) / row.damage);
    // without: the fight is ~152 s of wall time = 5 regen ticks: 100 + 50 = 150% → 2 specs at 75%
    expect(Math.floor(plain.seconds / 30)).toBe(5);
    expect(plain.plan.damage.zebak).toEqual({ zcb: 2 });
    expect(plain.seconds).toBeCloseTo(secondsAfter(2), 6);
    // with Liquid adrenaline (150 s; the row runs to ~151 s, past the window): 100 + 4 ticks before 150 s = 140% →
    // 3 specs at 37.5% (112.5%); a 4th would be funded by the tick at 150 s, after the window: 75% more, 187.5 > 150
    // (fix round: it was priced at 37.5%, 4 specs)
    expect(Math.floor(dosed.seconds / 30)).toBe(5);
    expect(dosed.plan.damage.zebak).toEqual({ zcb: 3 });
    expect(dosed.seconds).toBeCloseTo(secondsAfter(3), 6);
    expect(dosed.plan.end.me[0]).toBeCloseTo(150 - 112.5, 9);
  });
});

describe('Liquid adrenaline: a row crossing the end of the window (phase 38h-2: no window guard)', () => {
  // one row, 0-200 s, window to 100 s, 30 s regen: ticks at 30 / 60 / 90 / 120 / 150 / 180 s (160% in all); a damage
  // spec costs 50% (25% on a row starting inside the window), net 10 HP of 1000 damage
  const problem = (halfCostUntil?: number): AllocationProblem => ({
    rows: [{
      key: 'a', event: 0, start: 0, end: 200,
    }],
    events: [{ firstRow: 0, options: [{ counts: {}, spends: [] }] }],
    groups: [{ id: 'me', count: 1, regenSeconds: 30 }],
    start: { me: [100] },
    rowOutcome: () => ({ seconds: 200, damage: 1000, damageSpecs: [{ weapon: 'x', cost: 50, net: 10 }] }),
    ...(halfCostUntil !== undefined ? { halfCostUntil } : {}),
  });
  test('a row starting inside the window: every spec costs half; starting after it: full (by hand)', () => {
    const p = problem(100);
    const row = p.rows[0];
    const choice = [{ weapon: 'x', cost: 50 }];
    // phase 38h-2: the row starts at 0 s, inside the window: 6 specs cost 6 × 25 = 150% (was 175%: the window guard
    // priced the specs only the ticks after 100 s fund at full cost; gone with the seconds objective)
    expect(damageSpecCost(p, row, choice, { x: 6 })).toBe(150);
    expect(damageSpecCost(p, { start: 100 }, choice, { x: 2 })).toBe(100);
    // the DP: 160% buys 6 specs at 25% (a 7th would need 175%): 6 × 10 = 60 HP; 10% left
    const r = allocateBudget(p);
    expect(r.rows[0].damage).toEqual({ x: 6 });
    expect(r.hp).toBeCloseTo(60, 9);
    expect(simulateBudget(p, { options: [0], damage: [{ x: 6 }], drinkRow: -1 }).end.me[0]).toBeCloseTo(10, 9);
    expect(simulateBudget(p, { options: [0], damage: [{ x: 7 }], drinkRow: -1 }).feasible).toBe(false);
    // no window: 160% buys 3 full-price specs → 30 HP
    expect(allocateBudget(problem()).hp).toBeCloseTo(30, 9);
  });
});

otherRaidsDescribe('damage specs on adds (drains still off)', () => {
  const cox = raidConfig('cox');
  const a = { ...A('cox'), damageSpecs: ['burningClaws' as const] };
  const ta = raidTimeAssumptionsFrom(a, 'team', cox.defaultTimeSettings, cox.time);
  test('Burning claws on Vasa\'s Glowing crystals (an add: no drains) and on the Ice demon', () => {
    const vasa = encounterTime('cox-vasa', kitOf('cox', a), ta);
    const crystals = vasa.phases.find((p) => p.key === 'vasa-crystals')!;
    expect(findTarget(crystals.targetKey).noDrains).toBe(NO_DRAINS_ADDS);
    // drains stay off: the crystals' drain event has no specs (the team's carriers spec Vasa)
    const ev = vasa.specPlan!.events.find((e) => e.npc === 'Glowing crystal')!;
    expect(ev.counts).toEqual({});
    expect(crystals.choice?.drainLine).toBeUndefined();
    // the undrained row is damage-limited, so damage specs apply; the plan spends its 100% on 2 claws specs (35% each)
    const raw = encounterTime('cox-vasa', kitOf('cox', a), { ...ta, specBudget: { ...ta.specBudget!, damage: [] } }).phases.find((p) => p.key === 'vasa-crystals')!;
    expect(damageLimited(raw, ta.dpsMultiplier ?? 1)).toBe(true);
    expect(vasa.specPlan!.damage['vasa-crystals']).toEqual({ burningClaws: 2 });
    const d = crystals.damageSpecs![0];
    expect(d.weapon).toBe('burningClaws');
    // seconds = the row's seconds × (1 − 2 × net ÷ damage)
    expect(crystals.seconds).toBeCloseTo(raw.seconds * (1 - (2 * d.net) / raw.damage), 6);
    const ice = encounterTime('cox-ice-demon', kitOf('cox', a), ta);
    expect(ice.specPlan!.damage['ice-demon']).toEqual({ burningClaws: 2 });
  });
});
