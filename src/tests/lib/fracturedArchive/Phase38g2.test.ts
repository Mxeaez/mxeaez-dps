import { describe, expect, test } from '@jest/globals';
import { Monster } from '@/types/Monster';
import { buildTargetMonster, findTarget } from '@/lib/fracturedArchive/bestSetup';
import { drainFacts } from '@/lib/fracturedArchive/drainLine';
import { BestSetupAssumptions } from '@/lib/fracturedArchive/presets';
import {
  drainModel, DrainModel, SPEC_WEAPONS, SpecOutcome, specPlayer, specProfile,
} from '@/lib/fracturedArchive/specs';
import { resolveItem } from '@/lib/fracturedArchive/loadout';
import { getCombatStylesForCategory } from '@/utils';
import { EquipmentCategory } from '@/enums/EquipmentCategory';
import {
  bestDrainPlan, DefenceDrainWeapon, drainSequence, helpfulSpecs, outcomesAt, planChance,
} from '@/lib/fracturedArchive/teamSpecs';
import { assumptionsForTarget } from '@/lib/raids/toa/supplies';
import { raidConfig } from '@/lib/raids';

// Phase 38g-2: the drain line recommends ONE plan per boss / phase: the combination of the available drain specs and the
// order to send them that reaches the floor (or d*) at 95% in the fewest specs with the highest chance, each spec rolled
// at the Defence the earlier ones leave. The expectations below are built from upstream's spec calc at each drained
// Defence (`specProfile` of the monster with that Defence, BGS-style reduction), not from teamSpecs' rebuilt outcomes.

const A: BestSetupAssumptions = raidConfig('fractured-archive').defaultAssumptions;
type Boss = { monster: Monster, a: BestSetupAssumptions, m: DrainModel };
const boss = (key: string, phase?: string): Boss => {
  const t = findTarget(key);
  const monster = buildTargetMonster(t, phase, 'none', A).monster;
  const a = assumptionsForTarget(t, A);
  return { monster, a, m: drainModel(monster, a) };
};
/** The monster at Defence `d` (a BGS reduction of def − d: upstream lowers the Defence by it, no overflow above 0). */
const atDef = (b: Boss, d: number): Monster => ({
  ...b.monster,
  inputs: { ...b.monster.inputs, defenceReductions: { ...b.monster.inputs.defenceReductions, bgs: b.m.def - d } },
});
/**
 * Upstream's outcomes of one spec at Defence `d`, in the combat style the drain model uses (the undrained Defence's most
 * accurate one; near a floor of 0 every style is ~100% accurate and `specProfile` alone could pick another).
 */
const exact = (b: Boss, w: DefenceDrainWeapon, d: number): SpecOutcome[] => {
  const style = specProfile(b.monster, w, undefined, b.a).style;
  const item = resolveItem(SPEC_WEAPONS[w].item);
  const s = getCombatStylesForCategory(item.category || EquipmentCategory.NONE).find((x) => `${x.name} (${x.stance})` === style)!;
  const m = atDef(b, d);
  return specProfile(m, w, specPlayer(m, w, s, b.a), b.a).outcomes;
};
/** P(the maul lands) at Defence d. */
const maul = (b: Boss, d: number) => exact(b, 'elderMaul', d).filter((o) => o.hits > 0).reduce((t, o) => t + o.p, 0);
/** P(a charged Tonalztics spec lands h damaging hits) at Defence d. */
const tona = (b: Boss, d: number, h: number) => exact(b, 'tonalztics', d).filter((o) => o.hits === h).reduce((t, o) => t + o.p, 0);
const drop = (d: number, floor: number, w: DefenceDrainWeapon, o: SpecOutcome, magic: number) => {
  let x = d;
  if (w === 'elderMaul') for (let i = 0; i < o.hits; i++) x = Math.max(floor, x - Math.trunc((x * 35) / 100));
  else if (w === 'dwh') for (let i = 0; i < o.hits; i++) x = Math.max(floor, x - Math.trunc((x * 3) / 10));
  else if (w === 'tonalztics') for (let i = 0; i < o.hits; i++) x = Math.max(floor, x - Math.trunc(magic / 8));
  else x = Math.max(floor, x - o.damage);
  return x;
};
/** An independent enumeration: P(Defence ≤ target) after `seq` in this order, every spec at the Defence then (upstream). */
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
const ALL: DefenceDrainWeapon[] = ['elderMaul', 'dwh', 'tonalztics', 'bgs'];
const solo = (b: Boss, weapons = ALL) => bestDrainPlan(b.m, { weapons, maxSpecs: 8 })!;

describe('outcomes at the drained Defence match upstream\'s spec calc', () => {
  test.each([
    ['ag-grounded', undefined], ['bork', 'Smorks 100-76% HP (armour 8)'], ['smorks', undefined], ['ezekiel', undefined],
    ['xarth', undefined], ['ocellus-p1', 'At a corner'], ['ocellus-p2', undefined], ['ocellus-p3', 'Quadrants 1-3'],
  ])('%s %s', (key, phase) => {
    const b = boss(key, phase);
    // a plain accuracy roll for every weapon that can hit and isn't guaranteed
    expect(Object.keys(b.m.accuracy!).sort()).toEqual([...ALL].sort());
    [b.m.def - 1, Math.round((b.m.def + b.m.floor) / 2), b.m.floor + 2].forEach((d) => ALL.forEach((w) => {
      const mine = outcomesAt(b.m, w, d);
      exact(b, w, d).forEach((o) => {
        const q = mine.filter((x) => x.hits === o.hits && x.damage === o.damage).reduce((t, x) => t + x.p, 0);
        expect(Math.abs(q - o.p)).toBeLessThan(1e-12);
      });
    }));
  });

  test('a guaranteed hit (stunned Bork, melee) keeps its outcomes', () => {
    const b = boss('bork', 'Stunned (armour 0)');
    expect(b.m.accuracy!.elderMaul).toBeUndefined();
    expect(outcomesAt(b.m, 'elderMaul', 200)).toBe(b.m.outcomes.elderMaul);
  });
});

describe('the plan per FA boss / phase (hand-computed)', () => {
  test('Archive Guardian (Grounded): Tonalztics → Elder maul ×2, and the order changes the chance', () => {
    const b = boss('ag-grounded');
    // Def 260, floor 156, Magic 250: a Tonalztics hit −31, a landed maul −35%
    expect([b.m.def, b.m.floor, b.m.magicLevel]).toEqual([260, 156, 250]);
    const p = solo(b);
    expect(p.steps).toEqual([{ weapon: 'tonalztics', count: 1 }, { weapon: 'elderMaul', count: 2 }]);
    // T 2 hits → 198 (one maul: 198 − 69 = 129 → floor); 1 hit → 229 (229 − 80 = 149 → floor); 0 → 260 (two mauls:
    // 169, then 110 → floor)
    const one = (d: number) => 1 - (1 - maul(b, d)) ** 2;
    const tFirst = tona(b, 260, 2) * one(198) + tona(b, 260, 1) * one(229) + tona(b, 260, 0) * maul(b, 260) * maul(b, 169);
    expect(p.p).toBeCloseTo(tFirst, 12);
    expect(enumerate(b, ['tonalztics', 'elderMaul', 'elderMaul'])).toBeCloseTo(tFirst, 12);
    // maul ×2 then Tonalztics (upstream's order): M M: 260 → 169 → floor; M miss M: 169 then T ≥ 1 hit (138); one landed
    // (either) → 169, T needs 1 hit; none → T can't (260 − 62 = 198)
    const m260 = maul(b, 260);
    const m169 = maul(b, 169);
    const t1 = (d: number) => 1 - tona(b, d, 0);
    const mFirst = m260 * m169 + m260 * (1 - m169) * t1(169) + (1 - m260) * m260 * t1(169);
    expect(planChance(b.m, [{ weapon: 'elderMaul', count: 2 }, { weapon: 'tonalztics', count: 1 }])).toBeCloseTo(mFirst, 12);
    expect(enumerate(b, ['elderMaul', 'elderMaul', 'tonalztics'])).toBeCloseTo(mFirst, 12);
    expect(tFirst).toBeGreaterThan(mFirst + 0.005);
    expect(tFirst).toBeGreaterThanOrEqual(0.95);
    // no 2-spec plan gets there at 95% (every pair of the four weapons, either order)
    ALL.forEach((x) => ALL.forEach((y) => expect(enumerate(b, [x, y])).toBeLessThan(0.95)));
    expect(drainFacts(b.m, { drain: 'solo', partySize: 1 }).text).toBe(`Drain: Tonalztics → Elder maul ×2 (floor ${Math.round(tFirst * 100)}%)`);
    expect(drainFacts(b.m, { drain: 'team', partySize: 4 }).text)
      .toBe(`Drain: Tonalztics → Elder maul ×2 (floor ${Math.round(tFirst * 100)}%); 1 brings Tonalztics, 1 brings Elder maul`);
  });

  test('Bork (Smorks 100-76%): Elder maul ×4, 2 must land (the second at Def 195)', () => {
    const b = boss('bork', 'Smorks 100-76% HP (armour 8)');
    expect([b.m.def, b.m.floor]).toEqual([300, 180]); // 300 → 195 → 127 (floor 180)
    const p = solo(b);
    expect(p.steps).toEqual([{ weapon: 'elderMaul', count: 4 }]);
    const a = maul(b, 300);
    const c = maul(b, 195);
    let want = 0;
    for (let i = 1; i <= 3; i++) want += (1 - a) ** (i - 1) * a * (1 - (1 - c) ** (4 - i));
    expect(p.p).toBeCloseTo(want, 12);
    expect(c).toBeGreaterThan(a); // the second maul rolls against the lower Defence
    expect(drainFacts(b.m, { drain: 'team', partySize: 4 }).text).toBe(`Drain: Elder maul ×4 (floor ${Math.round(want * 100)}%); 2 bring Elder maul`);
  });

  test('The Smorks: Tonalztics ×8 (10 hits of 16 to floor 0)', () => {
    const b = boss('smorks');
    expect([b.m.def, b.m.floor, Math.trunc(b.m.magicLevel / 8)]).toEqual([220, 0, 23]);
    const p = solo(b);
    expect(p.steps).toEqual([{ weapon: 'tonalztics', count: 8 }]);
    const want = enumerate(b, Array(8).fill('tonalztics'));
    expect(p.p).toBeCloseTo(want, 12);
    expect(want).toBeGreaterThanOrEqual(0.95);
    expect(enumerate(b, Array(7).fill('tonalztics'))).toBeLessThan(0.95);
  });

  test('Ezekiel: Elder maul ×3 (130 → 85 → floor 78)', () => {
    const b = boss('ezekiel');
    expect([b.m.def, b.m.floor]).toEqual([130, 78]);
    const p = solo(b);
    expect(p.steps).toEqual([{ weapon: 'elderMaul', count: 3 }]);
    const a = maul(b, 130);
    const c = maul(b, 85);
    const want = a * (1 - (1 - c) ** 2) + (1 - a) * a * c;
    expect(p.p).toBeCloseTo(want, 12);
  });

  test('Xarth: Tonalztics ×2 (2 hits of 43: 170 → 84, floor 102)', () => {
    const b = boss('xarth');
    expect([b.m.def, b.m.floor, Math.trunc(b.m.magicLevel / 8)]).toEqual([170, 102, 43]);
    const p = solo(b);
    expect(p.steps).toEqual([{ weapon: 'tonalztics', count: 2 }]);
    const want = tona(b, 170, 2) + tona(b, 170, 1) * (1 - tona(b, 127, 0)) + tona(b, 170, 0) * tona(b, 170, 2);
    expect(p.p).toBeCloseTo(want, 12);
  });

  test('Ocellus P1 (at a corner): Tonalztics ×2 (215 → 129 = the floor)', () => {
    const b = boss('ocellus-p1', 'At a corner');
    expect([b.m.def, b.m.floor, Math.trunc(b.m.magicLevel / 8)]).toEqual([215, 129, 43]);
    const p = solo(b);
    expect(p.steps).toEqual([{ weapon: 'tonalztics', count: 2 }]);
    const want = tona(b, 215, 2) + tona(b, 215, 1) * (1 - tona(b, 172, 0)) + tona(b, 215, 0) * tona(b, 215, 2);
    expect(p.p).toBeCloseTo(want, 12);
  });

  test('Ocellus P2: Elder maul ×4 → Tonalztics ×2 to floor 0', () => {
    const b = boss('ocellus-p2');
    expect([b.m.def, b.m.floor]).toEqual([250, 0]);
    const p = solo(b);
    expect(p.steps).toEqual([{ weapon: 'elderMaul', count: 4 }, { weapon: 'tonalztics', count: 2 }]);
    const want = enumerate(b, [...Array(4).fill('elderMaul'), 'tonalztics', 'tonalztics']);
    expect(p.p).toBeCloseTo(want, 12);
    // the other order of the same specs lands less often
    expect(enumerate(b, ['tonalztics', 'tonalztics', ...Array(4).fill('elderMaul')])).toBeLessThan(want);
  });

  test('Ocellus P3 (quadrants 1-3): Elder maul ×3 → Tonalztics; Tonalztics first lands less often', () => {
    const b = boss('ocellus-p3', 'Quadrants 1-3');
    expect([b.m.def, b.m.floor, Math.trunc(b.m.magicLevel / 8)]).toEqual([250, 150, 37]);
    const p = solo(b);
    expect(p.steps).toEqual([{ weapon: 'elderMaul', count: 3 }, { weapon: 'tonalztics', count: 1 }]);
    // 250 → 163 (one maul) → 106 (two: floor); one maul + one Tonalztics hit: 163 − 37 = 126 (floor); no maul: T can't
    const a = maul(b, 250);
    const c = maul(b, 163);
    let two = 0;
    let oneOnly = 0;
    for (let i = 1; i <= 3; i++) {
      two += (1 - a) ** (i - 1) * a * (1 - (1 - c) ** (3 - i));
      oneOnly += (1 - a) ** (i - 1) * a * (1 - c) ** (3 - i);
    }
    const want = two + oneOnly * (1 - tona(b, 163, 0));
    expect(p.p).toBeCloseTo(want, 12);
    // Tonalztics first: 0 / 1 / 2 hits → 250 / 213 / 176, then 3 mauls (213: one maul → 139; 176: one → 115; 250: two)
    const at213 = maul(b, 213);
    const at176 = maul(b, 176);
    let none = 0;
    for (let i = 1; i <= 2; i++) none += (1 - a) ** (i - 1) * a * (1 - (1 - c) ** (3 - i));
    const tFirst = tona(b, 250, 2) * (1 - (1 - at176) ** 3) + tona(b, 250, 1) * (1 - (1 - at213) ** 3) + tona(b, 250, 0) * none;
    expect(planChance(b.m, [{ weapon: 'tonalztics', count: 1 }, { weapon: 'elderMaul', count: 3 }])).toBeCloseTo(tFirst, 12);
    expect(tFirst).toBeLessThan(want);
    expect(drainFacts(b.m, { drain: 'team', partySize: 6 }).text)
      .toBe(`Drain: Elder maul ×3 → Tonalztics (floor ${Math.round(want * 100)}%); 2 bring Elder maul, 1 brings Tonalztics`);
  });

  test('Ocellus P3 (last quadrant, Deflect Melee): Tonalztics ×5 (3 hits of 37: 250 → 139, floor 150)', () => {
    const b = boss('ocellus-p3', 'Last quadrant: Deflect Melee');
    expect(b.m.canHit.elderMaul).toBe(false);
    const p = solo(b);
    expect(p.steps).toEqual([{ weapon: 'tonalztics', count: 5 }]);
    expect(p.p).toBeCloseTo(enumerate(b, Array(5).fill('tonalztics')), 12);
    expect(enumerate(b, Array(4).fill('tonalztics'))).toBeLessThan(0.95);
  });
});

describe('d*: the best mix, not the first weapon alone', () => {
  // a hand-built model, every spec lands: Elder maul −35%, Tonalztics 2 hits of −10 (Magic 80); Def 100, floor 0
  const toy: DrainModel = {
    def: 100,
    floor: 0,
    magicLevel: 80,
    magicDef: 0,
    energy: {
      elderMaul: 50, dwh: 50, tonalztics: 50, bgs: 50, ayak: 50,
    },
    canHit: {
      elderMaul: true, dwh: false, tonalztics: true, bgs: false, ayak: false,
    },
    hitChance: {
      elderMaul: 1, dwh: 0, tonalztics: 1, bgs: 0, ayak: 0,
    },
    expectedDamage: {
      elderMaul: 0, dwh: 0, tonalztics: 0, bgs: 0, ayak: 0,
    },
    outcomes: {
      elderMaul: [{ p: 1, hits: 1, damage: 0 }],
      dwh: [{ p: 1, hits: 0, damage: 0 }],
      tonalztics: [{ p: 1, hits: 2, damage: 0 }],
      bgs: [{ p: 1, hits: 0, damage: 0 }],
      ayak: [{ p: 1, hits: 0, damage: 0 }],
    },
  };
  test('3 specs: M M T → 100 → 65 → 43 → 23 (M ×3: 28; T M M: 34); floor 0 not reached', () => {
    // every order of 3 specs by hand: MMM 28, MMT 23, MTM 30 (45 − 15), MTT 25, TMM 34, TMT 32, TTM 39, TTT 40
    const p = bestDrainPlan(toy, { weapons: ['elderMaul', 'tonalztics'], maxSpecs: 3 })!;
    expect(p.floor).toBe(false);
    expect(p.target).toBe(23);
    expect(p.steps).toEqual([{ weapon: 'elderMaul', count: 2 }, { weapon: 'tonalztics', count: 1 }]);
    // the 38g fix took the first weapon of the drain order alone (Elder maul ×3: Def 28)
    expect(helpfulSpecs(toy, drainSequence(['elderMaul', 'tonalztics'], () => 3, 3)).dStar).toBe(28);
  });

  test('FA, the Smorks with Elder maul + BGS: the mix reaches a lower Def than the maul alone', () => {
    const b = boss('smorks');
    const mix = solo(b, ['elderMaul', 'bgs']);
    const alone = solo(b, ['elderMaul']);
    expect(mix.floor).toBe(false);
    expect(alone.floor).toBe(false);
    expect(mix.target).toBeLessThan(alone.target);
    expect(mix.steps.map((s) => s.weapon)).toEqual(['elderMaul', 'bgs']);
    expect(mix.p).toBeCloseTo(enumerate(b, mix.steps.flatMap((s) => Array(s.count).fill(s.weapon)), mix.target), 12);
    expect(drainFacts(b.m, { drain: 'solo', partySize: 1, weapons: ['elderMaul', 'bgs'] }).text)
      .toBe(`Drain: Elder maul ×${mix.counts.elderMaul} → BGS (Def ${mix.target} ${Math.round(mix.p * 100)}%; floor not reached in 8 specs)`);
  });
});
