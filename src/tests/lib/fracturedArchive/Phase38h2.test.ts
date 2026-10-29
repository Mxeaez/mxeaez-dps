import { describe, expect, test } from '@jest/globals';
import { Monster } from '@/types/Monster';
import { generateEmptyPlayer } from '@/state';
import { buildTargetMonster, findTarget, SpecCounts } from '@/lib/fracturedArchive/bestSetup';
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
import { kitCarriers } from '@/lib/fracturedArchive/specChoice';
import {
  createKitEvaluator, drainFightSecondsOf, encounterTime, PhaseTime, presetKitLoadout, raidTimeAssumptionsFrom,
} from '@/lib/fracturedArchive/raidTime';
import { assumptionsForTarget } from '@/lib/raids/toa/supplies';
import { raidConfig } from '@/lib/raids';

// Phase 38h-2: spec bars valued in boss HP. A drain is worth H × g ÷ (1 + g) (H = the damage until the next Defence
// reset, g = the DPS gain at the drained Defence), a damage spec its net damage; per bar the larger, the drain kept
// within 10%; the drain plans re-planned within what the bars can still pay; interleaved send orders. Chances below are
// built from upstream's spec calc at each drained Defence (the Phase38h1.test.ts helpers).

const A: BestSetupAssumptions = raidConfig('fractured-archive').defaultAssumptions;

type Boss = { monster: Monster, a: BestSetupAssumptions, m: DrainModel };
const boss = (key: string, phase?: string): Boss => {
  const t = findTarget(key);
  const monster = buildTargetMonster(t, phase, 'none', A).monster;
  const a = assumptionsForTarget(t, A);
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

/**
 * The HP value written out: per row of the pass, damage × (1 − DPS without ÷ DPS with) (= H × g ÷ (1 + g), H the row's
 * damage, g = DPS with ÷ DPS without − 1), a fixed-length row nothing itself, a row whose damage the drain shrinks (P3
 * after P2) the damage it no longer has to deal. The other events at the line's plan (the budget's baseline).
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
  const pass = (c: SpecCounts) => FA.time.encounterPass(id, assignedKit(kit, rowEv, npcEv, line.map((l, j) => (j === ei ? c : l))), ta, drain, fight);
  const without = pass({});
  const withIt = new Map(pass(counts).map((r) => [r.key, r]));
  return without.reduce((t, r0) => {
    const r1 = withIt.get(r0.key)!;
    if (r0.fixedWall) return t;
    return t + r0.damage - r1.damage * (r0.dps / r1.dps);
  }, 0);
};

const ENCOUNTERS = ['archive-guardian', 'bork-smorks', 'ezekiel', 'moia', 'xarth', 'dagonhai', 'ocellus'];
describe.each([['team', TEAM_A], ['solo', SOLO_A]] as ['team' | 'solo', BestSetupAssumptions][])('per FA boss (%s): each event\'s HP value = H × g ÷ (1 + g) by hand', (drain, a) => {
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
    });
    // the plan's HP = its drains + its damage specs' net (each spec at the Defence its drains leave)
    const dmg = e.phases.reduce((t, r) => t + (r.damageSpecs ?? []).reduce((x, d) => x + d.count * d.net, 0), 0);
    expect(e.specPlan!.hp!).toBeCloseTo(evs.reduce((t, ev) => t + (ev.hp ?? 0), 0) + dmg, 6);
    // Team: only your bar has damage specs, the carriers' bars only drains (no close calls); Solo: a close call is a
    // drain your bar pays
    if (drain === 'team') expect(evs.some((ev) => ev.closeCall)).toBe(false);
  }, 60000);
});

describe('a close call (Solo): the damage specs a drain\'s energy buys are within 10% of it, the drain kept', () => {
  test('Ocellus P2, party 4, Elder maul + Zaryte crossbow on one bar: 1 maul spec (54 HP) vs the Zaryte crossbow instead', () => {
    const a: BestSetupAssumptions = {
      ...A, partySize: 4, mySpecs: { ...A.mySpecs, elderMaul: true }, damageSpecs: ['zcb'],
    };
    const ta = raidTimeAssumptionsFrom(a, 'solo', FA.defaultTimeSettings, FA.time);
    const kit = kitFor(a);
    const pass = (k: Parameters<typeof FA.time.encounterPass>[1], d: 'none' | 'team' | 'solo', f: number) => FA.time.encounterPass('ocellus', k, ta, d, f);
    const first = pass(kit, 'none', ta.fallbackFightSeconds);
    let problem: AllocationProblem | undefined;
    const r = budgetedEncounter(kit, ta, ta.specBudget!, {
      drain: 'solo', pass, first, fightSeconds: drainFightSecondsOf(first.reduce((t, x) => t + x.seconds, 0), ta), clock0: 0, surge: false, onProblem: (p) => { problem = p; },
    });
    const p2 = r.plan.events[1];
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
