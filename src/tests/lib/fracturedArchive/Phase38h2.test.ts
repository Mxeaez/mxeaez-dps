import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Monster } from '@/types/Monster';
import { generateEmptyPlayer } from '@/state';
import {
  attemptsFromCounts, buildTargetMonster, findTarget, SpecCounts,
} from '@/lib/fracturedArchive/bestSetup';
import {
  assignedKit, budgetedEncounter, drainEventsOf, drainHpValue, eventWantedCounts,
} from '@/lib/fracturedArchive/encounterBudget';
import { allocateBudget, AllocationProblem } from '@/lib/fracturedArchive/specBudget';
import { BestSetupAssumptions } from '@/lib/fracturedArchive/presets';
import {
  drainModel, DrainModel, SPEC_WEAPONS, SpecOutcome, specPlayer, specProfile,
} from '@/lib/fracturedArchive/specs';
import { resolveItem } from '@/lib/fracturedArchive/loadout';
import { getCombatStylesForCategory } from '@/utils';
import { EquipmentCategory } from '@/enums/EquipmentCategory';
import {
  defenceOutcome, DefenceDrainWeapon, DrainStep, kitDrainPlan,
} from '@/lib/fracturedArchive/teamSpecs';
import { kitCarriers, NO_CARRIERS, pickCarriersByHp } from '@/lib/fracturedArchive/specChoice';
import { kitLoadouts, retimeHeadline } from '@/tests/utils/probes';
import { headlineCase } from '@/tests/utils/headlines';
import { phase37Fixture } from '@/tests/utils/phase37';
import {
  compareRoutes, createKitEvaluator, drainFightSecondsOf, encounterTime, PhaseTime, presetKitLoadout, raidTimeAssumptionsFrom,
} from '@/lib/fracturedArchive/raidTime';
import { assumptionsForTarget } from '@/lib/raids/toa/supplies';
import { raidConfig } from '@/lib/raids';

// Phase 38h-2: spec bars valued in boss HP. A drain is worth H × g ÷ (1 + g) (H = the damage until the next Defence
// reset, g = the DPS gain at the drained Defence), a damage spec its net damage; per bar the larger, the drain kept
// within 10%; the drain plans re-planned within what the bars can still pay; interleaved send orders. Chances below are
// built from upstream's spec calc at each drained Defence (the Phase38h1.test.ts helpers).

const A: BestSetupAssumptions = raidConfig('fractured-archive').defaultAssumptions;

type Boss = { monster: Monster, a: BestSetupAssumptions, m: DrainModel };
const boss = (key: string, phase?: string, base: BestSetupAssumptions = A): Boss => {
  const t = findTarget(key);
  const monster = buildTargetMonster(t, phase, 'none', base).monster;
  const a = assumptionsForTarget(t, base);
  return { monster, a, m: drainModel(monster, a) };
};
const atDef = (b: Boss, d: number): Monster => ({
  ...b.monster,
  inputs: { ...b.monster.inputs, defenceReductions: { ...b.monster.inputs.defenceReductions, bgs: b.m.def - d } },
});
const exact = (b: Boss, w: DefenceDrainWeapon, d: number): SpecOutcome[] => {
  const style = specProfile(b.monster, w, undefined, b.a).style;
  const item = resolveItem(SPEC_WEAPONS[w].item);
  const s = getCombatStylesForCategory(item.category || EquipmentCategory.NONE).find((x) => `${x.name} (${x.stance})` === style)!;
  const m = atDef(b, d);
  return specProfile(m, w, specPlayer(m, w, s, b.a), b.a).outcomes;
};
const drop = (d: number, floor: number, w: DefenceDrainWeapon, o: SpecOutcome, magic: number) => {
  let x = d;
  if (w === 'elderMaul') for (let i = 0; i < o.hits; i++) x = Math.max(floor, x - Math.trunc((x * 35) / 100));
  else if (w === 'tonalztics') for (let i = 0; i < o.hits; i++) x = Math.max(floor, x - Math.trunc(magic / 8));
  else x = Math.max(floor, x - o.damage);
  return x;
};
/** Independent enumeration: P(Defence ≤ target) after `seq` in this order, every spec at the Defence then. */
const enumerate = (b: Boss, seq: DefenceDrainWeapon[], target = b.m.floor): number => {
  const memo = new Map<string, number>();
  const rec = (i: number, d: number): number => {
    if (i === seq.length) return d <= target ? 1 : 0;
    const k = `${i}|${d}`;
    if (!memo.has(k)) {
      memo.set(k, exact(b, seq[i], d).reduce((t, o) => t + o.p * rec(i + 1, drop(d, b.m.floor, seq[i], o, b.m.magicLevel)), 0));
    }
    return memo.get(k)!;
  };
  return rec(0, b.m.def);
};
const seqOf = (steps: DrainStep[]): DefenceDrainWeapon[] => steps.flatMap((s) => Array(s.count).fill(s.weapon) as DefenceDrainWeapon[]);
const M: DefenceDrainWeapon = 'elderMaul';
const T: DefenceDrainWeapon = 'tonalztics';

describe('a drain in boss HP (drainHpValue)', () => {
  const row = (key: string, damage: number, dps: number, extra: Partial<PhaseTime> = {}): PhaseTime => ({
    key, label: key, targetKey: key, damage, dps, seconds: damage / dps, choice: null, ...extra,
  });
  test('H × g ÷ (1 + g) per row; a fixed-length row counts through the damage it takes off a later one (by hand)', () => {
    // H = 1000 at 10 DPS, drained 12.5 DPS: g = 0.25, 1000 × 0.25 ÷ 1.25 = 200 (= 1000 × (1 − 10 ÷ 12.5))
    expect(drainHpValue([row('a', 1000, 10)], [row('a', 1000, 12.5)])).toBeCloseTo(200, 9);
    // the fight length cancels: the same H and g at any DPS give the same HP
    expect(drainHpValue([row('a', 1000, 40)], [row('a', 1000, 50)])).toBeCloseTo(200, 9);
    // Ocellus P2 style: P2 (fixed 120 s) deals 1200 → 1500 at the drained DPS, half carried: P3 1400 → 1250 at the same
    // DPS. P2 itself counts nothing (its length is fixed); P3: 1400 − 1250 × 1 = 150 HP no longer to deal
    expect(drainHpValue(
      [row('p2', 1200, 10, { fixedWall: true, seconds: 120 }), row('p3', 1400, 8)],
      [row('p2', 1500, 12.5, { fixedWall: true, seconds: 120 }), row('p3', 1250, 8)],
    )).toBeCloseTo(150, 9);
  });
});

describe('interleaved send orders (review 38h-1 carry-over b)', () => {
  test('The Smorks, 2 Elder maul + 3 Tonalztics carriers: T ×3 → M ×3 → T ×3 97.5%, the best block order 95.0%', () => {
    const b = boss('smorks');
    const plan = kitDrainPlan(b.m, { drain: 'team', carriers: { elderMaul: 2, tonalztics: 3 } })!;
    expect(plan.steps).toEqual([{ weapon: T, count: 3 }, { weapon: M, count: 3 }, { weapon: T, count: 3 }]);
    expect(plan.counts).toEqual({ tonalztics: 6, elderMaul: 3 });
    // by enumeration of upstream's spec calc at each Defence
    const inter = enumerate(b, seqOf(plan.steps));
    expect(inter).toBeCloseTo(0.97498, 4);
    expect(plan.p).toBeCloseTo(inter, 9);
    expect(enumerate(b, [M, M, M, T, T, T, T, T, T])).toBeCloseTo(0.95047, 4);
    expect(enumerate(b, [T, T, T, T, T, T, M, M, M])).toBeCloseTo(0.51409, 4);
    // the drain state with these counts sends them the same way (the ranked Defence follows)
    const o = defenceOutcome(b.m, [M, M, M, T, T, T, T, T, T]);
    expect(o.steps).toEqual(plan.steps);
    expect(o.pFloor).toBeCloseTo(inter, 9);
  });
});

describe('specs the bars can\'t pay are re-planned within what is left (review 38h-1 carry-over a)', () => {
  test('Ocellus P3 quadrants 1-3, 1 Elder maul spec left (+ 6 Tonalztics): T ×3 → M → T 98.1%, not the cut M + T 68.9%', () => {
    const b = boss('ocellus-p3', 'Quadrants 1-3');
    const cfg = { drain: 'team' as const, carriers: { elderMaul: 2, tonalztics: 3 } };
    // the line's plan within the kit: Elder maul ×3 → Tonalztics
    expect(eventWantedCounts(cfg, [b.m])).toEqual({ elderMaul: 3, tonalztics: 1 });
    // what is left after Ocellus P2 can pay 1 maul spec: re-planned over both weapons (a two-weapon remainder)
    expect(eventWantedCounts(cfg, [b.m], 0.95, { elderMaul: 1, tonalztics: 6 })).toEqual({ elderMaul: 1, tonalztics: 4 });
    const plan = kitDrainPlan(b.m, cfg, 0.95, { elderMaul: 1, tonalztics: 6 })!;
    expect(plan.steps).toEqual([{ weapon: T, count: 3 }, { weapon: M, count: 1 }, { weapon: T, count: 1 }]);
    expect(enumerate(b, seqOf(plan.steps))).toBeCloseTo(0.98120, 4);
    expect(plan.p).toBeCloseTo(enumerate(b, seqOf(plan.steps)), 9);
    // the phase 38h-1 cut (the line's plan minus what doesn't fit): Elder maul → Tonalztics, below 95%
    expect(enumerate(b, [M, T])).toBeCloseTo(0.68915, 4);
  });
});

describe('kit carriers by HP (kitCarriers `value`; replaces the coverage and worst P(floor) tie-breaks)', () => {
  // Bork (armour 8) and the Smorks, party 6 (you have no damage specs: a 6th carrier is you). Each weapon at most what
  // its line needs (2 Elder maul for Bork's Elder maul ×4, 4 Tonalztics for the Smorks' ×8). Toy HP values: Bork 100
  // when its plan within the kit is the line's Elder maul ×4, else 0; the Smorks `w` per Tonalztics spec of its plan
  // within the kit (kitDrainPlan: 2 + 4 carriers → Tonalztics ×8; 2 + 3 → T ×3 → M ×3 → T ×3, 6 Tonalztics specs).
  const targets = [
    { key: 'bork', label: 'Bork', model: boss('bork', 'Smorks 100-76% HP (armour 8)').m },
    { key: 'smorks', label: 'The Smorks', model: boss('smorks').m },
  ];
  const run = (w: number) => kitCarriers(targets, {
    partySize: 6,
    mages: 0,
    party: 6,
    value: (key, c) => {
      if (key === 'bork') return (c.elderMaul ?? 0) === 4 ? 100 : 0;
      return w * (c.tonalztics ?? 0);
    },
  }).carriers;
  test('the most HP wins, even when it makes you a carrier (more than 1.1 × the best kit leaving you out)', () => {
    // w = 10: 2 + 4 (you carry) = 100 + 80 = 180; best leaving you out 2 + 3 = 100 + 60 = 160; 180 > 1.1 × 160 = 176
    expect(run(10)).toMatchObject({ elderMaul: 2, tonalztics: 4 });
  });
  test('within 10% the kit leaving you out wins (your slot stays yours)', () => {
    // w = 7: 2 + 4 = 156; 2 + 3 = 142; 156 ≤ 1.1 × 142 = 156.2
    expect(run(7)).toMatchObject({ elderMaul: 2, tonalztics: 3 });
  });
});

// --- per FA boss: each event's drain is worth H × g ÷ (1 + g), recomputed outside the budget -------------------------

const FA = raidConfig('fractured-archive');
const kitFor = (a: BestSetupAssumptions) => createKitEvaluator(
  (['melee', 'ranged', 'magic'] as const).map((g) => FA.presets.find((p) => p.group === g)!)
    .map((p) => presetKitLoadout(generateEmptyPlayer(), p, a)),
  a,
);
// Team: the fa headline's carriers (2 Elder maul + 3 Tonalztics), you bring Zaryte crossbow (your bar: damage specs)
const TEAM_A: BestSetupAssumptions = {
  ...A,
  team: {
    ...A.team,
    carriers: {
      elderMaul: 2, dwh: 0, bgs: 0, tonalztics: 3, ayak: 0,
    },
  },
  damageSpecs: ['zcb'],
};
// Solo: party 1, Elder maul + Tonalztics + Zaryte crossbow on one bar
const SOLO_A: BestSetupAssumptions = {
  ...A,
  partySize: 1,
  mySpecs: { ...A.mySpecs, elderMaul: true, tonalztics: true },
  damageSpecs: ['zcb'],
};

/** Independent enumeration: the Defence distribution after `seq`, every spec at the Defence then (upstream's spec calc). */
const distribution = (b: Boss, seq: DefenceDrainWeapon[]): Map<number, number> => {
  let states = new Map<number, number>([[b.m.def, 1]]);
  seq.forEach((w) => {
    const next = new Map<number, number>();
    states.forEach((p, d) => exact(b, w, d).forEach((o) => {
      if (o.p <= 0) return;
      const nd = drop(d, b.m.floor, w, o, b.m.magicLevel);
      next.set(nd, (next.get(nd) ?? 0) + p * o.p);
    }));
    states = next;
  });
  return states;
};

/**
 * The HP value written out, averaged over the drain's outcomes: per row of the event, Σ P(Defence d) × H × (1 − DPS
 * without ÷ DPS at d) (H = the row's damage, the other events at the line's plan); a fixed-length row (Ocellus P2) the
 * extra damage at the expected DPS × its carry-over. The outcomes by enumerating upstream's spec calc in the plan's send
 * order; the DPS at d = the kit's best on the monster with Defence d.
 */
const valueByHand = (id: string, a: BestSetupAssumptions, drain: 'team' | 'solo', ei: number, counts: SpecCounts): number => {
  const ta = raidTimeAssumptionsFrom(a, drain, FA.defaultTimeSettings, FA.time);
  const kit = kitFor(a);
  const first = FA.time.encounterPass(id, kit, ta, 'none', ta.fallbackFightSeconds);
  const { events, rowEvent } = drainEventsOf(first);
  const fight = drainFightSecondsOf(first.reduce((t, r) => t + r.seconds, 0), ta);
  const line = events.map((e) => {
    const rows = e.rows.filter((i) => !findTarget(first[i].targetKey).noDrains);
    const models = rows.map((i) => kit.drainModel!({
      targetKey: first[i].targetKey, phase: first[i].phase, drain: 'none', fightSeconds: fight, rowKey: first[i].key,
    }));
    return rows.length ? eventWantedCounts(ta.specBudget!, models, ta.specBudget!.threshold) : {};
  });
  const rowEv = new Map(first.map((r, i) => [r.key, rowEvent[i]]));
  const npcEv = new Map<string, number>();
  events.forEach((e, i) => { if (!npcEv.has(e.npc)) npcEv.set(e.npc, i); });
  const without = FA.time.encounterPass(id, assignedKit(kit, rowEv, npcEv, line.map((l, j) => (j === ei ? {} : l))), ta, drain, fight);
  return without.reduce((t, r0) => {
    const ev = rowEv.get(r0.key) ?? npcEv.get(findTarget(r0.targetKey).npc ?? findTarget(r0.targetKey).name);
    if (ev !== ei || findTarget(r0.targetKey).noDrains || !(r0.damage > 0)) return t;
    const b = boss(r0.targetKey, r0.phase, a);
    const att = attemptsFromCounts(b.m, counts).filter((w): w is DefenceDrainWeapon => w !== 'ayak');
    if (!att.length || b.m.def <= b.m.floor) return t;
    const seq = seqOf(defenceOutcome(b.m, att).steps!);
    let dps = 0;
    let gain = 0;
    distribution(b, seq).forEach((p, d) => {
      const dd = d === b.m.def ? r0.dps : kit.best({
        targetKey: r0.targetKey, phase: r0.phase, drain, fightSeconds: fight, defence: { undrainedDef: b.m.def, def: d, ayak: 0 },
      })!.dps;
      dps += p * dd;
      gain += p * (1 - r0.dps / dd);
    });
    return t + (r0.fixedWall ? (dps / r0.dps - 1) * r0.damage * (r0.carryOver ?? 0) : r0.damage * gain);
  }, 0);
};

/** HP values pinned (0.1 HP; the presets kit above): moved only by a numbers change, each explained in PROGRESS. */
const HP_PINS: Record<string, number> = {
  'team|archive-guardian|0': 381.7,
  'team|bork-smorks|1': 246.9,
  'team|xarth|0': 192.7,
  'team|ocellus|0': 414.9,
  'team|ocellus|1': 195.4,
  'team|ocellus|2': 718.2,
  'solo|archive-guardian|0': 338.5,
  'solo|ocellus|2': 495.9,
};
const ENCOUNTERS = ['archive-guardian', 'bork-smorks', 'ezekiel', 'moia', 'xarth', 'dagonhai', 'ocellus'];
describe.each([['team', TEAM_A], ['solo', SOLO_A]] as ['team' | 'solo', BestSetupAssumptions][])('per FA boss (%s): each event\'s HP value = Σ P(d) × H × g ÷ (1 + g) by hand', (drain, a) => {
  test.each(ENCOUNTERS)('%s', (id) => {
    const e = encounterTime(id, kitFor(a), raidTimeAssumptionsFrom(a, drain, FA.defaultTimeSettings, FA.time));
    const evs = e.specPlan!.events;
    // eslint-disable-next-line no-console
    if (process.env.PRINT_PINS) console.log(drain, id, JSON.stringify(evs.map((x) => [x.counts, x.hp && Math.round(x.hp * 10) / 10, x.closeCall])), JSON.stringify(e.specPlan!.damage), Math.round(e.seconds * 100) / 100);
    expect(evs.length).toBeGreaterThan(0);
    evs.forEach((ev, ei) => {
      if (!Object.keys(ev.counts).length) {
        expect(ev.hp).toBeUndefined();
        return;
      }
      expect(ev.hp!).toBeGreaterThan(0);
      expect(ev.hp!).toBeCloseTo(valueByHand(id, a, drain, ei, ev.counts), 6);
      const pin = HP_PINS[`${drain}|${id}|${ei}`];
      if (pin !== undefined) expect(Math.round(ev.hp! * 10) / 10).toBe(pin);
    });
    // Team: only your bar has damage specs, the carriers' bars only drains (no close calls)
    if (drain === 'team') expect(evs.some((ev) => ev.closeCall)).toBe(false);
  }, 120000);
});

describe('a close call (Solo): the damage specs a drain\'s energy buys are within 10% of it, the drain kept', () => {
  test('The Smorks, party 1, Elder maul + Zaryte crossbow on one bar: 1 maul spec (64 HP) vs the Zaryte crossbow instead', () => {
    const a: BestSetupAssumptions = {
      ...A, partySize: 1, mySpecs: { ...A.mySpecs, elderMaul: true }, damageSpecs: ['zcb'],
    };
    const ta = raidTimeAssumptionsFrom(a, 'solo', FA.defaultTimeSettings, FA.time);
    const kit = kitFor(a);
    const pass = (k: Parameters<typeof FA.time.encounterPass>[1], d: 'none' | 'team' | 'solo', f: number) => FA.time.encounterPass('bork-smorks', k, ta, d, f);
    const first = pass(kit, 'none', ta.fallbackFightSeconds);
    let problem: AllocationProblem | undefined;
    const r = budgetedEncounter(kit, ta, ta.specBudget!, {
      drain: 'solo', pass, first, fightSeconds: drainFightSecondsOf(first.reduce((t, x) => t + x.seconds, 0), ta), clock0: 0, surge: false, onProblem: (p) => { problem = p; },
    });
    const p2 = r.plan.events[1];
    expect(p2.npc).toBe('Smorks');
    expect(p2.counts).toEqual({ elderMaul: 1 });
    expect(p2.closeCall).toBe(true);
    // by the rule: the best plan without this drain, minus the rest of the chosen plan = what its energy buys instead
    const best = allocateBudget(problem!);
    const without = allocateBudget({ ...problem!, events: problem!.events.map((e, j) => (j === 1 ? { ...e, options: [e.options[0]] } : e)) });
    const instead = without.hp - (best.hp - p2.hp!);
    expect(instead).toBeGreaterThanOrEqual(0.9 * p2.hp! - 1e-9);
    expect(instead).toBeLessThanOrEqual(1.1 * p2.hp! + 1e-9);
  }, 60000);
});

describe('Ocellus (Team): the chosen drains are the HP maximum over every drain combination (exhaustive)', () => {
  test('every option of P1 × P2 × P3, the DP placing your damage specs and the dose for each: none beats the plan', () => {
    const ta = raidTimeAssumptionsFrom(TEAM_A, 'team', FA.defaultTimeSettings, FA.time);
    const kit = kitFor(TEAM_A);
    const pass = (k: Parameters<typeof FA.time.encounterPass>[1], d: 'none' | 'team' | 'solo', f: number) => FA.time.encounterPass('ocellus', k, ta, d, f);
    const first = pass(kit, 'none', ta.fallbackFightSeconds);
    let problem: AllocationProblem | undefined;
    const r = budgetedEncounter(kit, ta, ta.specBudget!, {
      drain: 'team', pass, first, fightSeconds: drainFightSecondsOf(first.reduce((t, x) => t + x.seconds, 0), ta), clock0: 0, surge: true, onProblem: (p) => { problem = p; },
    });
    const p = problem!;
    // the objective: drains × 1.1 + damage specs (specBudget.ts); per combination its drains fixed, the rest by the DP
    const weighted = (opts: number[]) => {
      const fixed = allocateBudget({ ...p, events: p.events.map((e, j) => ({ ...e, options: [e.options[opts[j]]] })), rowOutcome: (i, o) => p.rowOutcome(i, o === 0 ? opts[p.rows[i].event] : o) });
      const v = opts.reduce((t, oi, j) => t + (p.events[j].options[oi].value ?? 0), 0);
      return Number.isFinite(fixed.hp) ? fixed.hp + 0.1 * v : -Infinity;
    };
    let best = -Infinity;
    let combos = 0;
    const walk = (j: number, opts: number[]) => {
      if (j === p.events.length) {
        combos += 1;
        best = Math.max(best, weighted(opts));
        return;
      }
      p.events[j].options.forEach((_, oi) => walk(j + 1, [...opts, oi]));
    };
    walk(0, []);
    expect(combos).toBeGreaterThan(50);
    const chosen = r.plan.events.map((ev, j) => p.events[j].options.findIndex((o) => JSON.stringify(o.counts) === JSON.stringify(ev.counts)));
    expect(chosen.every((x) => x >= 0)).toBe(true);
    expect(weighted(chosen)).toBeGreaterThanOrEqual(best - 1e-6);
  }, 300000);
});

describe('Eye of Ayak carriers never exceed the mages (review 38h-2)', () => {
  test.each(['fa', 'faSolo', 'faNotOwned'])('%s headline plan', (name) => {
    const f = JSON.parse(readFileSync(join(__dirname, '..', 'raids', 'phase37', `${name}.json`), 'utf8'));
    const team = f.specs?.team as { mages: number, carriers?: { ayak?: number } } | undefined;
    if (name !== 'faSolo') expect(team?.carriers).toBeDefined();
    if (team?.carriers) expect(team.carriers.ayak ?? 0).toBeLessThanOrEqual(team.mages);
  });
});

describe('carrier sets valued by the HP the bars really pay (review 38h-2 N1)', () => {
  test('pickCarriersByHp: the most HP; within 10% a set leaving you out; ties: more carriers (by hand)', () => {
    const sets = [{ id: 'a', hp: 100, total: 5 }, { id: 'b', hp: 108, total: 6 }, { id: 'c', hp: 100, total: 4 }];
    // party 6: b makes you a carrier and is worth 108 ≤ 1.1 × 100 (a, the more carriers of the two at 100): a
    expect(pickCarriersByHp(sets, 6)!.id).toBe('a');
    // b at 111 > 110: b
    expect(pickCarriersByHp([...sets.slice(0, 1), { id: 'b', hp: 111, total: 6 }], 6)!.id).toBe('b');
    // party 7: everyone leaves you out: the most HP
    expect(pickCarriersByHp(sets, 7)!.id).toBe('b');
  });
  test('faNotOwned: the plan\'s carriers pay the most HP on the planned route among the review\'s alternatives', () => {
    const r = retimeHeadline('faNotOwned');
    const c = headlineCase('faNotOwned');
    const inputs = c.inputs();
    const fx = phase37Fixture('faNotOwned') as unknown as { kit: Parameters<typeof kitLoadouts>[0] };
    const hpOf = (carriers: Record<string, number>) => {
      const a = { ...r.assumptions, team: { ...r.assumptions.team, carriers: { ...NO_CARRIERS, ...carriers } } };
      const ta = raidTimeAssumptionsFrom(a, inputs.drain, inputs.settings, FA.time);
      const route = r.comparison.routes.find((x) => x.route.id === r.route)!.route;
      const cmp = compareRoutes(createKitEvaluator(kitLoadouts(fx.kit, a), a), ta, [route]);
      return { hp: cmp.routes[0].encounters.reduce((t, e) => t + (e.specPlan?.hp ?? 0), 0), seconds: cmp.routes[0].seconds };
    };
    const planned = hpOf(r.assumptions.team.carriers);
    // the review's alternatives on the final kit (seconds there: 1481.98 / 1485.02 / 1488.38 / 1484.56; the plan 1483.36):
    // HP 3347.1 / 3355.3 / 3293.2 / 3324.5 vs the plan's 1 Elder maul + 4 Tonalztics 3358.9. Phase 38j (room times):
    // the plan (1 Elder maul + 4 Tonalztics on the Ultor kit; kits ranked by their own spec plan) 3614.7 vs 3602.5 / 3611.1
    // / 3548.7 / 3582.9
    const sets: Record<string, number>[] = [
      { elderMaul: 1, tonalztics: 3, ayak: 1 }, { elderMaul: 2, tonalztics: 3 }, { tonalztics: 4, ayak: 1 },
      { elderMaul: 2, tonalztics: 2, ayak: 1 },
    ];
    const alternatives = sets.map(hpOf);
    // eslint-disable-next-line no-console
    if (process.env.PRINT_PINS) console.log(JSON.stringify([r.assumptions.team.carriers, planned, alternatives]));
    alternatives.forEach((x) => expect(planned.hp).toBeGreaterThanOrEqual(x.hp - 1e-6));
    expect(Math.round(planned.hp * 10) / 10).toBe(3614.7);
  }, 300000);
});
