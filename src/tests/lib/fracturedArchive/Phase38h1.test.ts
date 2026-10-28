import { describe, expect, test } from '@jest/globals';
import { Monster } from '@/types/Monster';
import { buildTargetMonster, findTarget } from '@/lib/fracturedArchive/bestSetup';
import { eventWantedCounts } from '@/lib/fracturedArchive/encounterBudget';
import { BestSetupAssumptions } from '@/lib/fracturedArchive/presets';
import {
  drainModel, DrainModel, SPEC_WEAPONS, SpecOutcome, specPlayer, specProfile,
} from '@/lib/fracturedArchive/specs';
import { resolveItem } from '@/lib/fracturedArchive/loadout';
import { getCombatStylesForCategory } from '@/utils';
import { EquipmentCategory } from '@/enums/EquipmentCategory';
import {
  defenceOutcome, DefenceDrainWeapon, DrainStep, reproducingCounts,
} from '@/lib/fracturedArchive/teamSpecs';
import { assumptionsForTarget } from '@/lib/raids/toa/supplies';
import { raidConfig } from '@/lib/raids';

// Phase 38h-1: the bars pay the drain line's plan. The drain state (the Search / Plan drain brief) and the spec budget's
// event counts make the line's specs (teamSpecs.ts `bestDrainPlan`: its combination), each rolled at the Defence the
// earlier ones leave in the line's order (`defenceOutcome`), so the brief's spec counts and P(floor) are the line's.
// The expected chances below are built from upstream's spec calc at each drained Defence (the monster with that
// Defence), not from teamSpecs' rebuilt outcomes (the same helpers as Phase38g2.test.ts).

const A: BestSetupAssumptions = raidConfig('fractured-archive').defaultAssumptions;
// Team: 2 Elder maul + 4 Tonalztics carriers (6, the party), enough for every FA boss's line plan; no Eye of Ayak
const TEAM: BestSetupAssumptions = {
  ...A,
  team: {
    ...A.team,
    carriers: {
      elderMaul: 2, dwh: 0, bgs: 0, tonalztics: 4, ayak: 0,
    },
  },
};
// Solo: the four Defence drain weapons and a long fight (the bars pay every spec of the plan)
const SOLO: BestSetupAssumptions = {
  ...A,
  fightSeconds: 900,
  mySpecs: {
    ...A.mySpecs, elderMaul: true, dwh: true, bgs: true, tonalztics: true, ayak: 0,
  },
};

type Boss = { monster: Monster, a: BestSetupAssumptions, m: DrainModel, key: string, phase?: string };
const boss = (key: string, phase?: string): Boss => {
  const t = findTarget(key);
  const monster = buildTargetMonster(t, phase, 'none', A).monster;
  const a = assumptionsForTarget(t, A);
  return {
    monster, a, m: drainModel(monster, a), key, phase,
  };
};
const atDef = (b: Boss, d: number): Monster => ({
  ...b.monster,
  inputs: { ...b.monster.inputs, defenceReductions: { ...b.monster.inputs.defenceReductions, bgs: b.m.def - d } },
});
/** Upstream's outcomes of one spec at Defence `d` (the drain model's combat style). */
const exact = (b: Boss, w: DefenceDrainWeapon, d: number): SpecOutcome[] => {
  const style = specProfile(b.monster, w, undefined, b.a).style;
  const item = resolveItem(SPEC_WEAPONS[w].item);
  const s = getCombatStylesForCategory(item.category || EquipmentCategory.NONE).find((x) => `${x.name} (${x.stance})` === style)!;
  const m = atDef(b, d);
  return specProfile(m, w, specPlayer(m, w, s, b.a), b.a).outcomes;
};
const maul = (b: Boss, d: number) => exact(b, 'elderMaul', d).filter((o) => o.hits > 0).reduce((t, o) => t + o.p, 0);
const tona = (b: Boss, d: number, h: number) => exact(b, 'tonalztics', d).filter((o) => o.hits === h).reduce((t, o) => t + o.p, 0);
const drop = (d: number, floor: number, w: DefenceDrainWeapon, o: SpecOutcome, magic: number) => {
  let x = d;
  if (w === 'elderMaul') for (let i = 0; i < o.hits; i++) x = Math.max(floor, x - Math.trunc((x * 35) / 100));
  else if (w === 'dwh') for (let i = 0; i < o.hits; i++) x = Math.max(floor, x - Math.trunc((x * 3) / 10));
  else if (w === 'tonalztics') for (let i = 0; i < o.hits; i++) x = Math.max(floor, x - Math.trunc(magic / 8));
  else x = Math.max(floor, x - o.damage);
  return x;
};
/** Independent enumeration: P(floor) after `seq` in this order, every spec at the Defence then (upstream's spec calc). */
const enumerate = (b: Boss, seq: DefenceDrainWeapon[]): number => {
  const memo = new Map<string, number>();
  const rec = (i: number, d: number): number => {
    if (i === seq.length) return d <= b.m.floor ? 1 : 0;
    const k = `${i}|${d}`;
    if (!memo.has(k)) {
      memo.set(k, exact(b, seq[i], d).reduce((t, o) => t + o.p * rec(i + 1, drop(d, b.m.floor, seq[i], o, b.m.magicLevel)), 0));
    }
    return memo.get(k)!;
  };
  return rec(0, b.m.def);
};
const seqOf = (steps: DrainStep[]): DefenceDrainWeapon[] => steps.flatMap((s) => Array(s.count).fill(s.weapon) as DefenceDrainWeapon[]);
const countsOf = (steps: DrainStep[]) => Object.fromEntries(steps.map((s) => [s.weapon, s.count]));

/** The drain brief of a drain state: its Defence specs per weapon (the drain line items), P(floor), the line's plan. */
const brief = (b: Boss, id: 'team' | 'solo') => {
  const { drain } = buildTargetMonster(findTarget(b.key), b.phase, id, id === 'team' ? TEAM : SOLO);
  const facts = drain.line!.facts!;
  return {
    counts: Object.fromEntries(drain.line!.items.filter((i) => i.weapon !== 'ayak').map((i) => [i.weapon, i.count])),
    pFloor: drain.pFloor!,
    defAfter: drain.defAfter,
    facts,
  };
};

// per FA boss / phase: the line's plan (the order to send the specs), as phase 38g-2 pinned it (Phase38g2.test.ts)
const CASES: [string, string | undefined, DrainStep[]][] = [
  ['ag-flying', undefined, [{ weapon: 'tonalztics', count: 4 }]],
  ['ag-grounded', undefined, [{ weapon: 'tonalztics', count: 1 }, { weapon: 'elderMaul', count: 2 }]],
  ['bork', 'Smorks 100-76% HP (armour 8)', [{ weapon: 'elderMaul', count: 4 }]],
  ['smorks', undefined, [{ weapon: 'tonalztics', count: 8 }]],
  ['ezekiel', undefined, [{ weapon: 'elderMaul', count: 3 }]],
  ['xarth', undefined, [{ weapon: 'tonalztics', count: 2 }]],
  ['ocellus-p1', 'At a corner', [{ weapon: 'tonalztics', count: 2 }]],
  ['ocellus-p2', undefined, [{ weapon: 'elderMaul', count: 4 }, { weapon: 'tonalztics', count: 2 }]],
  ['ocellus-p3', 'Quadrants 1-3', [{ weapon: 'elderMaul', count: 3 }, { weapon: 'tonalztics', count: 1 }]],
  ['ocellus-p3', 'Last quadrant: Deflect Melee', [{ weapon: 'tonalztics', count: 5 }]],
];

describe('the drain brief = the drain line (spec counts and P(floor), hand-built from upstream at each drained Defence)', () => {
  test.each(CASES)('%s %s', (key, phase, steps) => {
    const b = boss(key, phase);
    const want = enumerate(b, seqOf(steps));
    expect(want).toBeGreaterThanOrEqual(0.95);
    (['team', 'solo'] as const).forEach((id) => {
      const x = brief(b, id);
      // the line recommends this plan with this chance
      expect(x.facts.plan!.steps).toEqual(steps);
      expect(x.facts.pFloor).toBeCloseTo(want, 12);
      // the brief makes exactly its specs, sent in its order, and lands the floor as often
      expect(x.counts).toEqual(countsOf(steps));
      expect(x.pFloor).toBeCloseTo(want, 12);
      expect(x.defAfter).toBe(b.m.floor);
      expect(x.facts.short).toBeUndefined();
      // the spec budget's event counts (one phase) are the same specs
      const cfg = id === 'team'
        ? { drain: 'team' as const, carriers: TEAM.team.carriers }
        : {
          drain: 'solo' as const,
          solo: {
            elderMaul: 8, dwh: 8, bgs: 8, tonalztics: 8,
          },
        };
      expect(eventWantedCounts(cfg, [b.m])).toEqual(countsOf(steps));
      expect(defenceOutcome(b.m, seqOf(steps)).steps).toEqual(steps);
    });
  });

  test('AG Grounded by hand: Tonalztics first (2 hits → 198, 1 → 229, 0 → 260), then the maul at the Defence it leaves', () => {
    const b = boss('ag-grounded');
    expect([b.m.def, b.m.floor, b.m.magicLevel]).toEqual([260, 156, 250]);
    // 198 − 69 = 129 → floor with 1 landed maul of 2; 229 − 80 = 149 → floor with 1 of 2; 260: both (169, then 110)
    const one = (d: number) => 1 - (1 - maul(b, d)) ** 2;
    const want = tona(b, 260, 2) * one(198) + tona(b, 260, 1) * one(229) + tona(b, 260, 0) * maul(b, 260) * maul(b, 169);
    const t = brief(b, 'team');
    expect(t.counts).toEqual({ elderMaul: 2, tonalztics: 1 });
    expect(t.pFloor).toBeCloseTo(want, 12);
    // was: upstream's order (maul ×2 → Tonalztics) at the undrained hit chances, a lower chance
    const m260 = b.m.hitChance.elderMaul;
    const t1 = 1 - b.m.outcomes.tonalztics.filter((o) => o.hits === 0).reduce((s, o) => s + o.p, 0);
    const old = m260 * m260 + 2 * m260 * (1 - m260) * t1;
    expect(t.pFloor).toBeGreaterThan(old + 0.005);
  });

  test('Bork by hand: Elder maul ×4, 2 must land, the second at Def 195 (more accurate than at 300)', () => {
    const b = boss('bork', 'Smorks 100-76% HP (armour 8)');
    const a = maul(b, 300);
    const c = maul(b, 195);
    let want = 0;
    for (let i = 1; i <= 3; i++) want += (1 - a) ** (i - 1) * a * (1 - (1 - c) ** (4 - i));
    expect(brief(b, 'team').pFloor).toBeCloseTo(want, 12);
    expect(brief(b, 'solo').pFloor).toBeCloseTo(want, 12);
    // phase 38g's number (every maul at Def 300): P(≥ 2 of 4) = 95.9%
    const old = 1 - (1 - a) ** 4 - 4 * a * (1 - a) ** 3;
    expect(want).toBeGreaterThan(old + 0.01);
  });
});

describe('the spec budget pays the line\'s plan', () => {
  test('Team: exactly the plan\'s specs (AG Grounded: 1 Tonalztics spec, not the carrier\'s 2)', () => {
    const b = boss('ag-grounded');
    expect(eventWantedCounts({ drain: 'team', carriers: { elderMaul: 2, tonalztics: 2 } }, [b.m])).toEqual({ elderMaul: 2, tonalztics: 1 });
    // within the kit: no maul → Tonalztics ×4 (2 carriers); 1 Tonalztics carrier (2 specs) → the specs that help most
    expect(eventWantedCounts({ drain: 'team', carriers: { tonalztics: 2 } }, [b.m])).toEqual({ tonalztics: 4 });
  });

  test('an event: a later phase the specs so far already floor adds none (AG: the shield\'s Tonalztics ×4 floor Grounded)', () => {
    const flying = boss('ag-flying');
    const grounded = boss('ag-grounded');
    const kit = { drain: 'team' as const, carriers: { elderMaul: 2, tonalztics: 3 } };
    // the maul can't hit the flying phases: Tonalztics ×4 (99%); on Grounded those 4 floor it at ≥ 95% too
    expect(defenceOutcome(grounded.m, Array(4).fill('tonalztics')).pFloor).toBeGreaterThanOrEqual(0.95);
    expect(eventWantedCounts(kit, [flying.m, grounded.m, flying.m])).toEqual({ tonalztics: 4 });
    // Grounded alone: the line's Tonalztics → Elder maul ×2
    expect(eventWantedCounts(kit, [grounded.m])).toEqual({ elderMaul: 2, tonalztics: 1 });
  });
});

describe('ranked counts reproduce the Defence in upstream\'s order', () => {
  test('toy: Def 100, Magic 80 (−10 a hit): Tonalztics then maul leaves 59, upstream\'s maul then Tonalztics 55', () => {
    const model = { def: 100, floor: 0, magicLevel: 80 };
    // T: 100 → 90; M: 90 − trunc(31.5) = 59. Upstream with the same landed drains: 100 → 65 → 55
    expect(reproducingCounts(model, 59, {
      elderMaul: 1, dwh: 0, tonalztic: 1, bgs: 0,
    })).toEqual({
      elderMaul: 1, dwh: 0, tonalztic: 0, bgs: 6,
    });
    // the same Defence in upstream's order: kept as landed
    expect(reproducingCounts(model, 55, {
      elderMaul: 1, dwh: 0, tonalztic: 1, bgs: 0,
    })).toEqual({
      elderMaul: 1, dwh: 0, tonalztic: 1, bgs: 0,
    });
  });
});
