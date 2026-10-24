import { describe, expect, test } from '@jest/globals';
import { generateEmptyPlayer } from '@/state';
import { scaleMonster } from '@/lib/MonsterScaling';
import {
  AUTO_FIGHT_SECONDS_RANGE, autoFightSeconds, buildTargetMonster, drainStateFor, evaluatePreset, findTarget,
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

// Phase 23 (UI cleanup): the fight length of the Solo spec-energy budget is computed (no input); the single
// "carriers use Lightbearer" toggle; drain plans as "[icon] ×N" data with hit chances (drainLine.ts).

const A = DEFAULT_ASSUMPTIONS;
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

  test('= hp ÷ (best preset DPS × team-DPS multiplier), rounded and clamped', () => {
    for (const key of ['xarth', 'bork', 'ezekiel', 'ocellus-p3']) {
      const m = undrained(key);
      const hp = scaleMonster(m).skills.hp;
      const best = Math.max(...PRESETS.map((p) => evaluatePreset(generateEmptyPlayer(), p, m, A, true, false).dps));
      const expected = Math.min(AUTO_FIGHT_SECONDS_RANGE.max, Math.max(AUTO_FIGHT_SECONDS_RANGE.min, hp / best));
      expect(Math.abs(autoFightSeconds(m, A) - expected)).toBeLessThanOrEqual(1);
    }
    // more players at your DPS = a shorter fight
    const m = undrained('xarth');
    expect(autoFightSeconds(m, { ...A, teamDpsMultiplier: 4 })).toBeLessThan(autoFightSeconds(m, A));
    expect(autoFightSeconds(m, { ...A, teamDpsMultiplier: 4 })).toBeGreaterThanOrEqual(AUTO_FIGHT_SECONDS_RANGE.min);
  });

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
    const m = undrained('xarth');
    const specsAt = (assumptions: typeof a) => {
      const d = drainStateFor(m, 'solo', assumptions);
      const fight = autoFightSeconds(m, assumptions);
      const budgetSpecs = specAttempts(energyBudget({ seconds: fight, lightbearer: false }), 50);
      expect(d.line?.budget).toEqual({ fightSeconds: fight, computed: true, specs: budgetSpecs });
      const done = (d.line?.items ?? []).reduce((t, it) => t + it.specs, 0);
      expect(done).toBe(budgetSpecs);
      return done;
    };
    const long = specsAt(a); // you alone: a long fight
    const short = specsAt({ ...a, teamDpsMultiplier: 8 }); // 8 players at your DPS: a short one
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
  test('Team default (2 maul, 2 Tonalztics, 1 Ayak carriers): ×4 maul specs, ×8 Tonalztics hits (4 specs), ×2 Ayak', () => {
    const m = undrained('xarth');
    const d = drainStateFor(m, 'team', A);
    const model = drainModel(m, A);
    const items = d.line!.items;
    expect(items.map((i) => [i.weapon, i.count, i.unit, i.specs])).toEqual([
      ['elderMaul', 4, 'spec', 4],
      ['tonalztics', 8, 'hit', 4],
      ['ayak', 2, 'spec', 2],
    ]);
    items.forEach((i) => expect(i.hitChance).toBe(model.hitChance[i.weapon as keyof typeof model.hitChance]));
    expect(items[1].title).toMatch(/^8 Tonalztics hits \(4 specs\), \d+% chance per spec/);
    expect(items.every((i) => i.image)).toBe(true);
    expect(d.line!.defAfter).toBe(d.defAfter);
    expect(d.line!.magicDefAfter).toBe(d.magicDefAfter);
    expect(d.line!.text).toBe(d.plan);
  });

  test('None has no line; an empty attempt list is an empty line', () => {
    expect(drainStateFor(undrained('xarth'), 'none', A).line).toBeUndefined();
    expect(drainLineFromAttempts([], {}, { defAfter: 1, magicDefAfter: 2 }, 'x').items).toEqual([]);
  });

  test('calculator Max-drain plan: AG flying → Tonalztics ×4 hits (2 specs) → Def 156', () => {
    const m = buildTargetMonster(findTarget('ag-flying'), undefined, 'none', A).monster;
    const plan = maxDrainReductions(m, { weapon: 'elderMaul', ayak: true });
    const line = drainLineFromReductions(plan.reductions, { tonalztics: 0.8 }, plan, plan.summary, 3);
    expect(line.items.map((i) => [i.weapon, i.count, i.unit, i.specs])).toEqual([
      ['tonalztics', 4, 'hit', 2],
      ['ayak', 3, 'spec', 3],
    ]);
    expect(line.items[0].hitChance).toBe(0.8);
    expect(line.defAfter).toBe(156);
    const bgs = drainLineFromReductions(maxDrainReductions(undrained('bork'), { weapon: 'bgs', ayak: false }).reductions, {}, plan, '');
    expect(bgs.items[0]).toMatchObject({ weapon: 'bgs', unit: 'dmg' });
  });
});
