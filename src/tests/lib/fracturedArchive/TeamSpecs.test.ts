import { describe, expect, test } from '@jest/globals';
import { scaleMonster } from '@/lib/MonsterScaling';
import { Monster } from '@/types/Monster';
import { buildTargetMonster, findTarget } from '@/lib/fracturedArchive/bestSetup';
import { DEFAULT_ASSUMPTIONS } from '@/lib/fracturedArchive/presets';
import {
  DrainModel, drainModel, PlannerWeapon, SpecOutcome,
} from '@/lib/fracturedArchive/specs';
import {
  ayakOutcome, carriersFromCounts, countsToReductions, defenceDistribution, defenceOutcome, expectedAttemptsToFloor,
  inUpstreamOrder, rankedDefence, recommendCarriers, soloSpecPlan, teamSpecPlan,
} from '@/lib/fracturedArchive/teamSpecs';

// Phase 14: exact spec planners (src/lib/fracturedArchive/teamSpecs.ts). Synthetic models with hand-computed
// probabilities, then the real bosses.

const A = DEFAULT_ASSUMPTIONS;
const NONE: SpecOutcome[] = [{ p: 1, hits: 0, damage: 0 }];
const hitOrMiss = (p: number): SpecOutcome[] => [{ p: 1 - p, hits: 0, damage: 0 }, { p, hits: 1, damage: 0 }];
const all = <T>(v: T): Record<PlannerWeapon, T> => ({
  elderMaul: v, dwh: v, tonalztics: v, bgs: v, ayak: v,
});

/** Bork-like: Defence 300, floor 180 → two landed Elder mauls reach it (300 → 195 → 180). */
const model = (over: Partial<DrainModel> = {}): DrainModel => ({
  def: 300,
  floor: 180,
  magicLevel: 0,
  magicDef: 0,
  energy: all(50),
  canHit: all(true),
  hitChance: { ...all(0), elderMaul: 0.8 },
  expectedDamage: all(0),
  outcomes: { ...all(NONE), elderMaul: hitOrMiss(0.8) },
  ...over,
});

describe('binomial / convolution (hand-computed)', () => {
  test('p = 0.8, 2 carriers × 2 attempts, need 2 hits: P = 1 − (0.2⁴ + 4·0.8·0.2³) = 0.9728', () => {
    const m = model();
    const plan = teamSpecPlan(m, { partySize: 6, carriers: carriersFromCounts({ elderMaul: 2 }), fightSeconds: 0 });
    expect(plan.firstRound.attempts).toEqual(['elderMaul', 'elderMaul', 'elderMaul', 'elderMaul']);
    expect(plan.firstRound.defence.pFloor).toBeCloseTo(1 - (0.2 ** 4 + 4 * 0.8 * 0.2 ** 3), 12);
    expect(plan.firstRound.defence.pFloor).toBeCloseTo(0.9728, 12);
    // E[Def] = 0.2⁴·300 + 4·0.8·0.2³·195 + 0.9728·180
    expect(plan.firstRound.defence.expectedDef).toBeCloseTo(0.0016 * 300 + 0.0256 * 195 + 0.9728 * 180, 9);
    expect(plan.firstRound.defence.rankedDef).toBe(180); // ≥ 95%
    expect(plan.reductions).toMatchObject({ elderMaul: 2, ayak: 0 });
  });

  test('states: Defence after 0 / 1 / 2 hits with upstream rounding (300 → 195 → 180 floor)', () => {
    const states = defenceDistribution(model(), ['elderMaul', 'elderMaul']);
    expect(states.map((s) => [s.def, +s.p.toFixed(12)])).toEqual([[180, 0.64], [195, 0.32], [300, 0.04]]);
  });

  test('Tonalztics: 0/1/2 landed hits per spec (0.1 / 0.3 / 0.6), 10 Def per hit, need 3 hits from 2 specs: 0.72', () => {
    const m = model({
      def: 50, floor: 20, magicLevel: 80, outcomes: { ...all(NONE), tonalztics: [{ p: 0.1, hits: 0, damage: 0 }, { p: 0.3, hits: 1, damage: 0 }, { p: 0.6, hits: 2, damage: 0 }] },
    });
    // P(≥ 3 of 4 possible hits) = P(1,2) + P(2,1) + P(2,2) = 0.18 + 0.18 + 0.36
    expect(defenceOutcome(m, ['tonalztics', 'tonalztics']).pFloor).toBeCloseTo(0.72, 12);
  });

  test('BGS: damage convolution, 2 specs of {0: ½, 10: ¼, 20: ¼} vs 30 Defence (floor 0): P(Σ ≥ 30) = 3/16', () => {
    const m = model({
      def: 30,
      floor: 0,
      outcomes: {
        ...all(NONE),
        bgs: [{ p: 0.5, hits: 0, damage: 0 }, { p: 0.25, hits: 1, damage: 10 }, { p: 0.25, hits: 1, damage: 20 }],
      },
    });
    const o = defenceOutcome(m, ['bgs', 'bgs']);
    expect(o.pFloor).toBeCloseTo(3 / 16, 12);
    expect(o.bestCaseDef).toBe(0);
  });

  test('Eye of Ayak: P(Σ ≥ 50 magic def) for 2 specs of {0: ½, 30: ½} = ¼; expected drain = 2 × 15', () => {
    const m = model({
      magicDef: 50,
      expectedDamage: { ...all(0), ayak: 15 },
      outcomes: { ...all(NONE), ayak: [{ p: 0.5, hits: 0, damage: 0 }, { p: 0.5, hits: 1, damage: 30 }] },
    });
    const o = ayakOutcome(m, 2);
    expect(o.pZero).toBeCloseTo(0.25, 12);
    expect(o.expectedDrain).toBe(30);
    expect(o.rankedDrain).toBe(30);
    expect(o.magicDefAfter).toBe(20);
    expect(ayakOutcome(m, 10).rankedDrain).toBe(50); // P(0) > 95% → the whole bonus
    expect(ayakOutcome({ ...m, magicDef: -5 }, 2)).toMatchObject({ pZero: 1, rankedDrain: 0 });
  });

  test('expected attempts to the floor over 4 attempts: 1 + 1 + 0.36 + 0.104 = 2.464', () => {
    const r = expectedAttemptsToFloor(model(), ['elderMaul', 'elderMaul', 'elderMaul', 'elderMaul']);
    expect(r.expected).toBeCloseTo(1 + 1 + (1 - 0.64) + (0.2 ** 3 + 3 * 0.8 * 0.2 ** 2), 12);
    expect(r.pWithin).toBeCloseTo(0.9728, 12);
  });

  test('ranking below the threshold: the reachable Defence nearest to the expected Defence', () => {
    const states = defenceDistribution(model(), ['elderMaul', 'elderMaul']); // E = 0.64·180 + 0.32·195 + 0.04·300 = 189.6
    const o = rankedDefence(states, 180);
    expect(o.expectedDef).toBeCloseTo(189.6, 9);
    expect(o.rankedDef).toBe(195);
    expect(o.rankedCounts.elderMaul).toBe(1);
    expect(rankedDefence(states, 180, 0.6).rankedDef).toBe(180); // P(floor) 0.64 ≥ 0.6
  });

  test('upstream order: % drains before flat ones', () => {
    expect(inUpstreamOrder(['bgs', 'tonalztics', 'elderMaul', 'dwh'])).toEqual(['elderMaul', 'dwh', 'tonalztics', 'bgs']);
  });
});

describe('recommendation', () => {
  test('synthetic p = 0.8: 1 carrier → 64%, 2 → 97.3% ≥ 95%; at 99%: 3 carriers (1 − P(≤1 of 6) = 0.9984)', () => {
    const r = recommendCarriers(model({ canHit: { ...all(false), elderMaul: true } }), { partySize: 6 });
    expect(r.table).toHaveLength(1);
    expect(r.table[0].p[0]).toBeCloseTo(0.64, 12);
    expect(r.table[0].p[1]).toBeCloseTo(0.9728, 12);
    expect(r.best).toEqual({ carriers: { elderMaul: 2 }, pFloor: expect.closeTo(0.9728, 12) });
    expect(r.previous?.carriers).toEqual({ elderMaul: 1 });
    expect(r.text).toBe('6-man: 1 Elder maul → 64%, 2 Elder maul → 97% (≥ 95% from the first round)');
    const strict = recommendCarriers(model({ canHit: { ...all(false), elderMaul: true } }), { partySize: 6, threshold: 0.99 });
    expect(strict.best?.carriers).toEqual({ elderMaul: 3 });
    expect(strict.best?.pFloor).toBeCloseTo(1 - (0.2 ** 6 + 6 * 0.8 * 0.2 ** 5), 12);
  });

  test('none within the party size', () => {
    const r = recommendCarriers(model({ canHit: { ...all(false), elderMaul: true }, outcomes: { ...all(NONE), elderMaul: hitOrMiss(0.1) } }), { partySize: 2 });
    expect(r.best).toBeNull();
    expect(r.text).toContain('no team of ≤ 2 carriers reaches 95%');
  });

  test('6-man Bork: 2 Elder maul carriers reach ≥ 95% from the first round, 1 does not', () => {
    const m = drainModel(buildTargetMonster(findTarget('bork'), undefined, 'none', A).monster, A);
    const r = recommendCarriers(m, { partySize: 6, label: 'Bork' });
    expect(r.best?.carriers).toEqual({ elderMaul: 2 });
    expect(r.best!.pFloor).toBeGreaterThanOrEqual(0.95);
    expect(r.previous?.pFloor).toBeLessThan(0.95);
    expect(r.text).toMatch(/^6-man Bork: 1 Elder maul → \d+%, 2 Elder maul → \d+%/);
  });

  test('The Smorks (floor 0): hammers alone never reach it; Tonalztics does', () => {
    const m = drainModel(buildTargetMonster(findTarget('smorks'), undefined, 'none', A).monster, A);
    const r = recommendCarriers(m, { partySize: 6 });
    expect(r.table.find((t) => t.weapon === 'elderMaul')!.p.every((p) => p === 0)).toBe(true);
    expect(r.best).not.toBeNull();
    expect(r.best!.carriers.tonalztics).toBeGreaterThan(0);
  });
});

describe('solo plan (synthetic)', () => {
  const carried = {
    elderMaul: true, dwh: false, bgs: false, tonalztics: false,
  };

  test('labels: 4 attempts needed for ≥ 95% (0.9728) → 200%: team-only at 90 s, solo+lightbearer at 150 s, solo at 300 s', () => {
    const m = model();
    const at = (fightSeconds: number, lightbearer = false) => soloSpecPlan(m, {
      carried, ayakSpecs: 0, lightbearer, fightSeconds,
    });
    expect(at(90).needed).toEqual({ attempts: 4, energy: 200, label: 'team-only' });
    expect(at(150).needed.label).toBe('solo+lightbearer');
    expect(at(300).needed.label).toBe('solo');
    // within budget: 130% → 2 attempts (P 0.64), 160% (Lightbearer) → 3 attempts (P 0.896), 200% → 4
    expect(at(90).attempts).toHaveLength(2);
    expect(at(90).defence.pFloor).toBeCloseTo(0.64, 12);
    expect(at(90, true).attempts).toHaveLength(3);
    expect(at(90, true).defence.pFloor).toBeCloseTo(0.896, 12);
    expect(at(300).attempts).toHaveLength(4);
    expect(at(300).defence.rankedDef).toBe(180);
  });

  test('Ayak gets what the Defence drains leave (or goes first with priority "ayak")', () => {
    const m = model({ magicDef: 100, expectedDamage: { ...all(0), ayak: 20 }, outcomes: { ...model().outcomes, ayak: [{ p: 0.5, hits: 0, damage: 0 }, { p: 0.5, hits: 1, damage: 40 }] } });
    const d = soloSpecPlan(m, {
      carried, ayakSpecs: 2, lightbearer: false, fightSeconds: 300,
    }); // 200%: 4 maul attempts, 0 Ayak
    expect([d.attempts.length, d.ayakAttempts]).toEqual([4, 0]);
    const a = soloSpecPlan(m, {
      carried, ayakSpecs: 2, lightbearer: false, fightSeconds: 300, priority: 'ayak',
    });
    expect([a.attempts.length, a.ayakAttempts]).toEqual([2, 2]);
    expect(a.reductions.ayak).toBe(40);
    expect(a.text).toContain('2× Ayak');
  });

  test('no carried weapon can hit → no Defence drain, team-only', () => {
    const p = soloSpecPlan(model({ canHit: { ...all(true), elderMaul: false } }), {
      carried, ayakSpecs: 0, lightbearer: false, fightSeconds: 90,
    });
    expect(p.attempts).toEqual([]);
    expect(p.defence.rankedDef).toBe(300);
    expect(p.needed.label).toBe('team-only');
    expect(p.text).toContain('Elder maul can\'t hit here');
  });
});

describe('real bosses: states map back to the calculator', () => {
  const withReductions = (m: Monster, r: Monster['inputs']['defenceReductions']): Monster => ({
    ...m, inputs: { ...m.inputs, defenceReductions: r },
  });

  test.each(['bork', 'smorks', 'ocellus-p2', 'ag-flying'])('%s: every first-round state\'s counts reproduce its Defence in upstream applyDefenceReductions', (key) => {
    const monster = buildTargetMonster(findTarget(key), undefined, 'none', A).monster;
    const m = drainModel(monster, A);
    const attempts = inUpstreamOrder(['elderMaul', 'elderMaul', 'tonalztics', 'tonalztics', 'bgs']
      .filter((w) => m.canHit[w as PlannerWeapon]) as ('elderMaul' | 'tonalztics' | 'bgs')[]);
    const states = defenceDistribution(m, attempts);
    expect(states.reduce((a, s) => a + s.p, 0)).toBeCloseTo(1, 10);
    for (const s of states) {
      expect(scaleMonster(withReductions(monster, countsToReductions(s.counts, 0))).skills.def).toBe(s.def);
    }
  });

  test('Team default on Bork: first round 4 maul + 4 Tonalztics + 2 Ayak, floor ≥ 95%, not a no-op', () => {
    const m = drainModel(buildTargetMonster(findTarget('bork'), undefined, 'none', A).monster, A);
    const plan = teamSpecPlan(m, {
      partySize: 6, carriers: carriersFromCounts({ elderMaul: 2, tonalztics: 2, ayak: 1 }), fightSeconds: 90,
    });
    expect(plan.firstRound.attempts.filter((w) => w === 'ayak')).toHaveLength(2);
    expect(plan.firstRound.defence.pFloor).toBeGreaterThan(0.95);
    expect(plan.firstRound.defence.pFloor).toBeLessThan(1);
    expect(plan.reductions.elderMaul + plan.reductions.tonalztic).toBeGreaterThan(0);
    expect(plan.reductions.ayak).toBeGreaterThan(30);
    expect(plan.label).toBe('team-only');
    // carriers beyond the party size don't count
    const small = teamSpecPlan(m, {
      partySize: 2, carriers: carriersFromCounts({ elderMaul: 2, tonalztics: 2 }), fightSeconds: 90,
    });
    expect(small.carriers).toHaveLength(2);
    expect(small.text).toContain('only the first 2 carriers count');
  });
});
