import { describe, expect, test } from '@jest/globals';
import { generateEmptyPlayer } from '@/state';
import { scaleMonster } from '@/lib/MonsterScaling';
import {
  AUTO_FIGHT_SECONDS_RANGE, autoFightSeconds, buildTargetMonster, drainStateFor, evaluatePreset, findTarget,
  fightSecondsFrom,
} from '@/lib/fracturedArchive/bestSetup';
import {
  carriersUseLightbearer, DEFAULT_ASSUMPTIONS, PRESETS, withCarrierLightbearer,
} from '@/lib/fracturedArchive/presets';
import {
  drainModel, energyBudget, specAttempts,
} from '@/lib/fracturedArchive/specs';
import { carriersFromCounts, teamSpecPlan } from '@/lib/fracturedArchive/teamSpecs';
import { maxDrainReductions } from '@/lib/fracturedArchive/drains';
import { drainLineFromAttempts, drainLineFromReductions } from '@/lib/fracturedArchive/drainLine';
import { runGearSearch } from '@/lib/fracturedArchive/search';
import { withPhase32Specs } from '@/tests/utils/phase32Specs';

// Phase 23 (UI cleanup): the fight length of the Solo spec-energy budget is computed (no input); the single
// "carriers use Lightbearer" toggle; drain plans as "[icon] ×N" data with hit chances (drainLine.ts).

const A = withPhase32Specs(DEFAULT_ASSUMPTIONS); // phase 33: the pre-phase-33 "Specs I bring" (Elder maul + 2 Ayak)
const undrained = (key: string, phase?: string) => buildTargetMonster(findTarget(key), phase, 'none', A).monster;

describe('computed fight length (Solo spec-energy budget)', () => {
  test('the default assumptions have no fight length: it is computed', () => {
    expect(A.fightSeconds).toBeUndefined();
    const d = buildTargetMonster(findTarget('xarth'), undefined, 'solo', A).drain;
    expect(d.fightComputed).toBe(true);
    expect(d.fightSeconds).toBe(autoFightSeconds(undrained('xarth'), A));
    expect(d.plan).toContain(`fight ≈ ${d.fightSeconds} s (computed)`);
    expect(d.plan).toContain(`in ${d.fightSeconds} s`);
  });

  test('= hp ÷ (party size × best preset DPS), rounded and clamped; not the team-DPS multiplier', () => {
    for (const key of ['xarth', 'bork', 'ezekiel', 'ocellus-p3']) {
      const m = undrained(key);
      const hp = scaleMonster(m).skills.hp;
      const best = Math.max(...PRESETS.map((p) => evaluatePreset(generateEmptyPlayer(), p, m, A, true, false).dps));
      const expected = Math.min(AUTO_FIGHT_SECONDS_RANGE.max, Math.max(AUTO_FIGHT_SECONDS_RANGE.min, hp / (6 * best)));
      expect(Math.abs(autoFightSeconds(m, A) - expected)).toBeLessThanOrEqual(1);
    }
    const m = undrained('xarth');
    // review fix: FA's team-DPS multiplier 1 doesn't make the 6-player fight last as long as a solo kill
    expect(autoFightSeconds(m, { ...A, teamDpsMultiplier: 4 })).toBe(autoFightSeconds(m, A));
    // a smaller party = a longer fight
    const m2 = buildTargetMonster(findTarget('xarth'), undefined, 'none', { ...A, partySize: 2 }).monster;
    expect(autoFightSeconds(m2, { ...A, partySize: 2 })).toBeGreaterThan(autoFightSeconds(m, A));
  });

  test('clamp bounds: Jelly at the 15 s minimum; the 600 s maximum; 90 s when nothing hits', () => {
    expect(autoFightSeconds(undrained('jelly'), A)).toBe(AUTO_FIGHT_SECONDS_RANGE.min);
    expect(fightSecondsFrom(10000, 1, 1)).toBe(AUTO_FIGHT_SECONDS_RANGE.max);
    expect(fightSecondsFrom(10000, 1, 100)).toBe(100);
    expect(fightSecondsFrom(1, 50, 6)).toBe(AUTO_FIGHT_SECONDS_RANGE.min);
    expect(fightSecondsFrom(1000, 0, 6)).toBe(90);
  });

  test('Bork Solo (6-man, defaults): fight 28 s → 100% energy → 2 Elder maul specs, Def 195 (as with the old 90 s)', () => {
    const d = buildTargetMonster(findTarget('bork'), undefined, 'solo', A).drain;
    expect(d.fightSeconds).toBe(28);
    expect(d.line?.budget).toEqual({ fightSeconds: 28, computed: true, specs: 2 });
    expect(d.line?.items.map((i) => [i.weapon, i.count])).toEqual([['elderMaul', 2], ['ayak', 0]]);
    expect(d.defAfter).toBe(195);
    const r = runGearSearch(generateEmptyPlayer(), { targetKey: 'bork', drain: 'solo', styles: 'all' }, A, {});
    expect(r.rows[0].dps).toBeCloseTo(10.327, 3);
  }, 300000);

  test('an explicit fight length (Plan / time model) still wins', () => {
    const d = drainStateFor(undrained('xarth'), 'solo', { ...A, fightSeconds: 90 });
    expect(d.fightSeconds).toBe(90);
    expect(d.fightComputed).toBe(false);
    expect(d.plan).not.toContain('(computed)');
    expect(d.line?.budget).toEqual({ fightSeconds: 90, computed: false, specs: 2 });
  });

  test('the Solo spec count follows the time to kill', () => {
    // Ayak × 10: the energy is the limit, so the specs done = what the computed fight's budget pays for
    const a = { ...A, mySpecs: { ...A.mySpecs, elderMaul: false, ayak: 10 } };
    const specsAt = (assumptions: typeof a) => {
      const m = buildTargetMonster(findTarget('ocellus-p3'), undefined, 'none', assumptions).monster;
      const d = drainStateFor(m, 'solo', assumptions);
      const fight = autoFightSeconds(m, assumptions);
      const budgetSpecs = specAttempts(energyBudget({ seconds: fight, lightbearer: false }), 50);
      expect(d.line?.budget).toEqual({ fightSeconds: fight, computed: true, specs: budgetSpecs });
      const done = (d.line?.items ?? []).reduce((t, it) => t + it.specs, 0);
      expect(done).toBe(budgetSpecs);
      return done;
    };
    const long = specsAt({ ...a, partySize: 2 }); // a duo: a long fight
    const short = specsAt(a); // 6-man: a short one
    expect(long).toBeGreaterThan(short);
    expect(short).toBe(2); // only the starting 100%
  });

  test('Search uses the computed length for its Solo drains', () => {
    const r = runGearSearch(generateEmptyPlayer(), { targetKey: 'xarth', drain: 'solo', styles: 'melee' }, A, {
      weapons: ['Scythe of vitur'], maxPasses: 1, topN: 1,
    });
    const m = undrained('xarth');
    expect(r.drain.fightSeconds).toBe(autoFightSeconds(m, A));
    expect(r.drain.reductions).toEqual(drainStateFor(m, 'solo', A).reductions);
  });

  test('None has no fight length; Team ranking does not depend on it', () => {
    const m = undrained('bork');
    expect(drainStateFor(m, 'none', A).fightSeconds).toBeUndefined();
    expect(drainStateFor(m, 'team', A).reductions).toEqual(drainStateFor(m, 'team', { ...A, fightSeconds: 90 }).reductions);
  });
});

describe('one "carriers use Lightbearer" toggle', () => {
  test('applies to every carrier weapon', () => {
    const on = withCarrierLightbearer(A.team, true);
    expect(Object.values(on.lightbearer).every(Boolean)).toBe(true);
    expect(on.carriers).toEqual(A.team.carriers);
    expect(carriersUseLightbearer(on)).toBe(true);
    expect(carriersUseLightbearer(A.team)).toBe(false);
    const off = withCarrierLightbearer(on, false);
    expect(Object.values(off.lightbearer).some(Boolean)).toBe(false);
    // a partial (old) state shows the toggle off; ticking it sets all
    const partial = { ...A.team, lightbearer: { ...A.team.lightbearer, elderMaul: true } };
    expect(carriersUseLightbearer(partial)).toBe(false);
    expect(carriersUseLightbearer(withCarrierLightbearer(partial, true))).toBe(true);
  });

  test('every carrier of the Team plan wears it', () => {
    const team = withCarrierLightbearer(A.team, true);
    const carriers = carriersFromCounts(team.carriers, team.lightbearer);
    expect(carriers.length).toBe(5);
    expect(carriers.every((c) => c.lightbearer)).toBe(true);
    const m = undrained('xarth');
    const a = { ...A, team };
    const d = drainStateFor(m, 'team', a);
    const p = teamSpecPlan(drainModel(m, a), {
      partySize: a.partySize, carriers, fightSeconds: d.fightSeconds!, threshold: a.floorThreshold,
    });
    expect(d.plan).toBe(`Team (${a.partySize}): ${p.text}`);
    // the first round (the ranking) is the same with or without Lightbearer
    expect(d.reductions).toEqual(drainStateFor(m, 'team', A).reductions);
  });
});

describe('drain line data', () => {
  test('Team default (2 maul, 2 Tonalztics, 1 Ayak carriers): ×4 maul, ×4 Tonalztics specs (8 hits), ×2 Ayak', () => {
    const m = undrained('xarth');
    const d = drainStateFor(m, 'team', A);
    const model = drainModel(m, A);
    const items = d.line!.items;
    expect(items.map((i) => [i.weapon, i.count, i.unit, i.specs])).toEqual([
      ['elderMaul', 4, 'spec', 4],
      ['tonalztics', 4, 'spec', 4],
      ['ayak', 2, 'spec', 2],
    ]);
    items.forEach((i) => expect(i.hitChance).toBe(model.hitChance[i.weapon as keyof typeof model.hitChance]));
    // phase 29: the Team line starts with "needed ×N (H hits) · team brings ×4"
    // (phase 29 review: "not needed" when the maul specs already give the same ranked Defence on Xarth)
    // (review 2: "needed ×N (P%) · team brings ×4 (8 hits, P%)")
    // (phase 32: "needs N landed hits · N specs (C carriers), 2N swings · P% · team: 4 specs (2 carriers) · P%")
    expect(items[1].title).toMatch(/^(needs \d+ landed hits? · \d+ specs? \(\d+ carriers?\), \d+ swings · [^·(;]+( · team: 4 specs \(2 carriers\) · [^(;]+)?|not needed · team: 4 specs \(2 carriers\) · [^(;]+)( \(.*\))?; 4 Tonalztics specs \(8 swings\); \d+% of specs land at least one damaging hit$/);
    expect(items[1].hits).toBe(8);
    expect(items.every((i) => i.image)).toBe(true);
    expect(d.line!.defAfter).toBe(d.defAfter);
    expect(d.line!.magicDefAfter).toBe(d.magicDefAfter);
    expect(d.line!.text).toBe(d.plan);
  });

  test('None has no line; an empty attempt list is an empty line', () => {
    expect(drainStateFor(undrained('xarth'), 'none', A).line).toBeUndefined();
    expect(drainLineFromAttempts([], {}, { defAfter: 1, magicDefAfter: 2 }, 'x').items).toEqual([]);
  });

  test('Solo: Ayak specs asked for but not covered by the energy stay on the line as ×0', () => {
    const d = buildTargetMonster(findTarget('ag-grounded'), undefined, 'solo', A).drain; // 2 maul specs use the 100%
    const ayak = d.line!.items.find((i) => i.weapon === 'ayak')!;
    expect(ayak).toMatchObject({ count: 0, short: 2 });
    expect(ayak.title).toContain('no spec energy left');
    expect(d.line!.items.find((i) => i.weapon === 'elderMaul')!.short).toBeUndefined();
  });

  test('calculator Max-drain plan: AG flying → Tonalztics ×2 specs (4 hits) → Def 156', () => {
    const m = buildTargetMonster(findTarget('ag-flying'), undefined, 'none', A).monster;
    const plan = maxDrainReductions(m, { weapon: 'elderMaul', ayak: true });
    const line = drainLineFromReductions(plan.reductions, { tonalztics: 0.8 }, plan, plan.summary, 3);
    expect(line.items.map((i) => [i.weapon, i.count, i.unit, i.specs])).toEqual([
      ['tonalztics', 2, 'spec', 2],
      ['ayak', 3, 'spec', 3],
    ]);
    expect(line.items[0].hitChance).toBe(0.8);
    expect(line.items[0].title).toMatch(/^2 Tonalztics specs \(4 landed hits\)/);
    expect(line.defAfter).toBe(156);
    const bgs = drainLineFromReductions(maxDrainReductions(undrained('bork'), { weapon: 'bgs', ayak: false }).reductions, {}, plan, '');
    expect(bgs.items[0]).toMatchObject({ weapon: 'bgs', unit: 'dmg' });
  });
});
