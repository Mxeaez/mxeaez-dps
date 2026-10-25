import { describe, expect, test } from '@jest/globals';
import { generateEmptyPlayer } from '@/state';
import { buildTargetMonster, drainStateFor, findTarget } from '@/lib/fracturedArchive/bestSetup';
import { countText, neededText } from '@/lib/fracturedArchive/drainLine';
import {
  DEFAULT_RING_POLICY, DEFAULT_SPEC_MODE, effectiveCarriers, guardedFullRuns, plan, planItemByName, PlanInputs, PlanResult,
  PlanTuning, SPEC_MODES,
} from '@/lib/fracturedArchive/planner';
import { formatDuration } from '@/lib/fracturedArchive/raidTime';
import { DEFAULT_ASSUMPTIONS, PresetDef, withPlanCarriers } from '@/lib/fracturedArchive/presets';
import {
  allSubsets,
  assignMe,
  AUTO_AYAK_SPECS,
  bestWithoutText,
  bringText,
  CarrierCounts,
  carriersText,
  greedyCarriers,
  mostNeededWeapon,
  NO_CARRIERS,
  pickSeeds,
  rowsFromCarriers,
  mySpecsForSubset,
  RoleTarget,
  searchSpecSubsets,
  SHARE_MAX_SLOT_SECONDS,
  subsetOfMySpecs,
  teamRoles,
  weaponDeltaText,
} from '@/lib/fracturedArchive/specChoice';
import { drainModel } from '@/lib/fracturedArchive/specs';
import {
  ayakOutcome, ayakSpecsToThreshold, defenceOutcome, formatProbability, neededSpecs, recommendCarriers, soloSpecPlan, specsNeeded,
} from '@/lib/fracturedArchive/teamSpecs';
import { FRACTURED_ARCHIVE_RAID } from '@/lib/raids';

// Phase 29: the planner decides the spec weapons — Solo subset search, Team roles ("team briefing"), your share
// ("assign me"), Eye of Ayak only with a magic loadout / mages, the Team drain line "needed ×2 (4 hits) · team brings ×4".
// Docs: docs/BEST_SETUP.md, *Spec weapons (phase 29)*.

const A = DEFAULT_ASSUMPTIONS;
const ELIDINIS_WARD = "Elidinis' ward (f)";
const undrained = (key: string, phase?: string) => buildTargetMonster(findTarget(key), phase, 'none', A).monster;
const roleTarget = (key: string): RoleTarget => ({ key, label: findTarget(key).label, model: drainModel(undrained(key), A) });

describe('Solo subset search (toy)', () => {
  // 3 weapons, 2 encounters (100 s each). Encounter 1: A saves 30 s, B 20 s, both 35 s (overlapping drains);
  // encounter 2: C saves 3 s. One free slot; every spec slot beyond it costs 10 s of gear.
  type W = 'A' | 'B' | 'C';
  const saves = (s: W[]) => {
    const e1 = { A: 30, B: 20, AB: 35 }[(['A', 'B'] as W[]).filter((w) => s.includes(w)).join('')] ?? 0;
    return e1 + (s.includes('C') ? 3 : 0);
  };
  const time = (s: W[]) => 200 - saves(s) + Math.max(0, s.length - 1) * 10;
  // hand-computed: {} 200, {A} 170, {B} 180, {C} 197, {A,B} 175, {A,C} 177, {B,C} 187, {A,B,C} 182 → {A}
  const toy = (extra: Partial<Parameters<typeof searchSpecSubsets<W>>[0]> = {}) => searchSpecSubsets<W>({
    weapons: ['A', 'B', 'C'],
    signature: (s) => s.join('+'),
    slots: (s) => s.length,
    quick: time,
    ...extra,
  });

  test('finds the hand-computed optimum and each weapon\'s Δ', () => {
    expect(allSubsets(['A', 'B', 'C']).length).toBe(8);
    const r = toy();
    expect(r.best).toEqual(['A']);
    expect(r.seconds).toBe(170);
    expect(r.signatures).toBe(8);
    const d = Object.fromEntries(r.perWeapon.map((x) => [x.weapon, x]));
    expect(d.A).toMatchObject({ chosen: true, deltaSeconds: 30, deltaSlots: 1 }); // {} 200 − {A} 170
    expect(d.B).toMatchObject({ chosen: false, deltaSeconds: -5, deltaSlots: 1 }); // {A} 170 − {A,B} 175
    expect(d.C).toMatchObject({ chosen: false, deltaSeconds: -7, deltaSlots: 1 }); // {A} 170 − {A,C} 177
    expect(r.bestRejected?.weapon).toBe('B');
  });

  test('two free slots: A + B (175 → 165) beats A alone (170)', () => {
    const t2 = (s: ('A' | 'B' | 'C')[]) => 200 - saves(s) + Math.max(0, s.length - 2) * 10;
    // {A,B} 165, {A,C} 167, {A,B,C} 172, {A} 170
    const r = searchSpecSubsets<W>({
      weapons: ['A', 'B', 'C'], signature: (s) => s.join('+'), slots: (s) => s.length, quick: t2,
    });
    expect(r.best).toEqual(['A', 'B']);
    expect(r.perWeapon.find((x) => x.weapon === 'B')).toMatchObject({ chosen: true, deltaSeconds: 5 });
    expect(r.bestRejected).toMatchObject({ weapon: 'C', deltaSeconds: -7 }); // {A,B} 165 − {A,B,C} 172
  });

  test('same drain state = one candidate (the one with fewer slots); a useless weapon is never brought', () => {
    // D changes nothing: {X} and {X, D} share a signature
    type W4 = W | 'D';
    const r = searchSpecSubsets<W4>({
      weapons: ['A', 'B', 'C', 'D'],
      signature: (s) => s.filter((w) => w !== 'D').join('+'),
      slots: (s) => s.length,
      quick: (s) => time(s.filter((w) => w !== 'D') as W[]) + (s.includes('D') ? 10 : 0),
    });
    expect(r.signatures).toBe(8);
    expect(r.best).toEqual(['A']);
    expect(r.perWeapon.find((x) => x.weapon === 'D')).toMatchObject({ chosen: false, deltaSeconds: -10 });
  });

  test('quick ranks, full decides among the finalists; dominated subsets are not timed', () => {
    // quick overstates {A} by 8 s: it ranks 3rd ({A,B} 175, {A,C} 177, {A} 178) and still wins on its full time
    const r = toy({ quick: (s) => time(s) + (s.join('') === 'A' ? 8 : 0), full: time, finalists: 3 });
    expect(r.best).toEqual(['A']);
    expect(r.seconds).toBe(170);
    // with one finalist the quick ranking decides
    expect(toy({ quick: (s) => time(s) + (s.join('') === 'A' ? 8 : 0), full: time, finalists: 1 }).best).toEqual(['A', 'B']);
    // dominance: C alone is dominated by A (same slots, never faster)
    const timed: string[] = [];
    toy({
      quick: (s) => { timed.push(s.join('')); return time(s); },
      dominated: (s, by) => s.join('') === 'C' && by.join('') === 'A',
    });
    expect(timed).not.toContain('C');
    expect(timed).toContain('A');
  });

  test('texts', () => {
    expect(bringText(['tonalztics', 'elderMaul'])).toBe('Bring: Elder maul, Tonalztics');
    expect(bringText([])).toBe('Bring: no spec weapons');
    // review fix: one change to this plan, as a route-time change
    expect(weaponDeltaText({
      weapon: 'tonalztics', chosen: false, deltaSeconds: -49.6, deltaSlots: 1,
    })).toBe('adding Tonalztics to this plan: +49.6 s (1 slot)');
    expect(weaponDeltaText({
      weapon: 'tonalztics', chosen: false, deltaSeconds: 4, deltaSlots: 1,
    })).toBe('adding Tonalztics to this plan: −4.0 s (1 slot)');
    expect(weaponDeltaText({
      weapon: 'elderMaul', chosen: true, deltaSeconds: 104.44, deltaSlots: 1,
    })).toBe('dropping Elder maul from this plan: +104.4 s (frees 1 slot)');
    expect(bestWithoutText({ weapon: 'tonalztics', weapons: ['ayak', 'elderMaul'], seconds: 1362.66 }, (x) => `${x.toFixed(1)}`))
      .toBe('best without Tonalztics: Elder maul + Eye of Ayak, 1362.7');
  });

  test('guard: a subset whose quick run was unlucky still gets the full run when within 2 × the best\'s quick − full gap', () => {
    // quick overstates every set by 10 s; {B} (true 180) by 40 s more. Best by quick: {A} (180 → full 170, gap 10).
    // Guard 2 × 10 = 20: {B} quick 230 > 170 + 20 → not timed in full; with a lucky full time it would win
    const quick = (s: W[]) => time(s) + 10 + (s.join('') === 'B' ? 40 : 0);
    const full = (s: W[]) => (s.join('') === 'B' ? 160 : time(s));
    expect(toy({ quick, full, finalists: 1 }).best).toEqual(['A']);
    expect(toy({
      quick, full, finalists: 1, guard: Infinity,
    }).best).toEqual(['B']);
    // {B} not unlucky beyond the gap: quick 190 ≤ 170 + 20 → full run → wins at 160 (it ranks 4th by quick)
    const quick2 = (s: W[]) => time(s) + 10;
    const r = toy({ quick: quick2, full, finalists: 1 });
    expect(r.best).toEqual(['B']);
    expect(r.bestWithout).toEqual([{ weapon: 'B', weapons: ['A'], seconds: 170 }]);
  });

  test('a subset as "Specs I bring": Ayak until magic def 0, Defence drains first, the Lightbearer flag kept', () => {
    const m = mySpecsForSubset(['elderMaul', 'ayak'], { lightbearer: true });
    expect(m).toEqual({
      elderMaul: true, dwh: false, bgs: false, tonalztics: false, ayak: AUTO_AYAK_SPECS, ayakAuto: true, lightbearer: true, priority: 'defence',
    });
    expect(subsetOfMySpecs(m)).toEqual(['elderMaul', 'ayak']);
    expect(subsetOfMySpecs(A.mySpecs)).toEqual(['elderMaul', 'ayak']);
  });
});

describe('seeds (review fix)', () => {
  test('the best of every style group is kept however few seeds are asked for; ranked by the given times', () => {
    // under the all-weapons table magic looks best (seeds 0, 1); under a Tonalztics-only table ranged is (seed 3)
    const singles = (t: number[]) => t.map((x, i) => ({
      i, t: x, s: 0, group: ['magic', 'magic', 'melee', 'ranged', 'ranged'][i],
    }));
    const allWeapons = [100, 101, 120, 130, 131];
    expect(pickSeeds(singles(allWeapons), ['melee', 'ranged', 'magic'], 2)).toEqual([0, 1, 2, 3]);
    // the old quick run took the first 2 of the list (0, 1): magic only
    const tonaOnly = [140, 141, 125, 110, 111];
    expect(pickSeeds(singles(tonaOnly), ['melee', 'ranged', 'magic'], 2)).toEqual([3, 4, 2, 0]);
    expect(pickSeeds(singles(tonaOnly), ['melee', 'ranged', 'magic'], 0)).toEqual([2, 3, 0]);
  });
});

describe('team carriers: greedy on route time (review fix)', () => {
  // toy: route 1000 s; 1st Tonalztics carrier −200 s, 2nd −1.5 s, 3rd −0.4 s; 1st maul −20 s, 2nd −0.8 s
  const time = (c: CarrierCounts) => 1000
    - [0, 200, 201.5, 201.9, 201.9, 201.9, 201.9][c.tonalztics]
    - [0, 20, 20.8, 20.8, 20.8, 20.8, 20.8][c.elderMaul];
  test('adds a carrier only while it saves ≥ 1 s (a second Tonalztics: 1.5 s yes; a second maul: 0.8 s no)', () => {
    const g = greedyCarriers({ weapons: ['elderMaul', 'tonalztics'], total: 6, time });
    expect(g.carriers).toEqual({ ...NO_CARRIERS, tonalztics: 2, elderMaul: 1 });
    expect(g.steps.map((x) => [x.weapon, Number(x.saved.toFixed(1))])).toEqual([['tonalztics', 200], ['elderMaul', 20], ['tonalztics', 1.5]]);
    expect(g.seconds).toBeCloseTo(778.5, 6);
    // a 2 s bar stops before the second Tonalztics; the party size caps the total
    expect(greedyCarriers({
      weapons: ['elderMaul', 'tonalztics'], total: 6, time, minSaving: 2,
    }).carriers).toEqual({ ...NO_CARRIERS, tonalztics: 1, elderMaul: 1 });
    expect(greedyCarriers({ weapons: ['elderMaul', 'tonalztics'], total: 1, time }).carriers).toEqual({ ...NO_CARRIERS, tonalztics: 1 });
  });

  test('The Smorks (floor 0): % drains stall above 0, so only Tonalztics reach the floor', () => {
    const smorks = drainModel(undrained('smorks'), A);
    expect(smorks.floor).toBe(0);
    expect(defenceOutcome(smorks, Array(12).fill('elderMaul')).pFloor).toBe(0);
    expect(defenceOutcome(smorks, Array(12).fill('dwh')).pFloor).toBe(0);
    expect(defenceOutcome(smorks, Array(10).fill('tonalztics')).pFloor).toBeGreaterThan(0.95);
  });

  test('Eye of Ayak capped at the mages (review 2: 5 Ayak carriers on ToA → 1 with one mage)', () => {
    // toy shaped like the ToA steps: maul −47.3, then each Ayak carrier saves 13-18 s
    const ayakSaves = [0, 13.25, 24.1, 40.77, 58.57, 74.53, 74.53];
    const t = (c: CarrierCounts) => 900 - (c.elderMaul ? 47.3 : 0) - ayakSaves[c.ayak];
    expect(greedyCarriers({ weapons: ['elderMaul', 'ayak'], total: 6, time: t }).carriers).toMatchObject({ elderMaul: 1, ayak: 5 });
    expect(greedyCarriers({
      weapons: ['elderMaul', 'ayak'], total: 6, time: t, caps: { ayak: 1 },
    }).carriers).toMatchObject({ elderMaul: 1, ayak: 1 });
    // the manual counts: the first `party` in teamSpecPlan's order, Ayak at most the mages
    expect(effectiveCarriers({
      elderMaul: 2, dwh: 0, bgs: 0, tonalztics: 5, ayak: 1,
    }, 6, 1)).toEqual({ ...NO_CARRIERS, elderMaul: 2, tonalztics: 4 });
    expect(effectiveCarriers(A.team.carriers, 6, 0)).toEqual({ ...A.team.carriers, ayak: 0 });
  });

  test('ring guard (review 2): the best two rings in full, g = the largest screen − full gap, re-checked', () => {
    // ring A: screen 100 → full 98 (small error); ring B: screen 130 → full 90 (large error); ring C: 150 → 140; D 300
    const fullOf: Record<string, number> = {
      A: 98, B: 90, C: 140, D: 290,
    };
    const ran: string[] = [];
    const r = guardedFullRuns([{ key: 'A', seconds: 100 }, { key: 'B', seconds: 130 }, { key: 'C', seconds: 150 }, { key: 'D', seconds: 300 }], (k) => {
      ran.push(k);
      return fullOf[k];
    });
    expect(ran).toEqual(['A', 'B', 'C']); // the old guard planned A only (g = 2 → margin 4) and missed B
    expect(r.g).toBe(40);
    expect(Math.min(...Array.from(r.full.values()))).toBe(90);
    expect(guardedFullRuns([{ key: 'A', seconds: 100 }], () => 99).full.size).toBe(1);
  });

  test('Search / Summary use the plan\'s carriers while the planner decides (review 2)', () => {
    const c = {
      elderMaul: 2, dwh: 0, bgs: 0, tonalztics: 2, ayak: 0,
    };
    expect(withPlanCarriers(A, c).team.carriers).toEqual(c);
    expect(withPlanCarriers(A, null)).toBe(A);
    expect(withPlanCarriers({ ...A, team: { ...A.team, manual: true } }, c).team.carriers).toEqual(A.team.carriers);
  });

  test('briefing rows from a carrier set: most carriers first, what the last one saves', () => {
    const rows = rowsFromCarriers({ ...NO_CARRIERS, elderMaul: 2, tonalztics: 2 }, (w) => ({ saved: w === 'elderMaul' ? 3.6 : 27, drivers: [w] }));
    expect(rows.map((r) => [r.weapon, r.carriers, r.lastSaved])).toEqual([['elderMaul', 2, 3.6], ['tonalztics', 2, 27]]);
    expect(carriersText(6, rows)).toBe('6-man: 2 Elder maul, 2 Tonalztics');
  });
});

describe('Ayak specs until magic def 0', () => {
  test('ayakSpecsToThreshold = the fewest specs with P(0) ≥ threshold; the Solo plan stops there', () => {
    const model = drainModel(undrained('xarth'), A);
    expect(model.magicDef).toBeGreaterThan(0);
    const n = ayakSpecsToThreshold(model, 10, 0.95);
    expect(n).toBeGreaterThan(0);
    if (n < 10) {
      expect(ayakOutcome(model, n, 0.95).pZero).toBeGreaterThanOrEqual(0.95);
      expect(n === 1 || ayakOutcome(model, n - 1, 0.95).pZero < 0.95).toBe(true);
    }
    const base = {
      carried: {
        elderMaul: false, dwh: false, tonalztics: false, bgs: false,
      },
      ayakSpecs: 10,
      lightbearer: true,
      fightSeconds: 600,
      threshold: 0.95,
    };
    expect(soloSpecPlan(model, { ...base, ayakUntilZero: true }).ayakAttempts).toBe(Math.min(n, soloSpecPlan(model, base).ayakAttempts));
  });
});

describe('Team roles (team briefing)', () => {
  const ag = roleTarget('ag-flying');
  const bork = roleTarget('bork');
  const roles = teamRoles([ag, bork], { partySize: 6, mages: 0, threshold: 0.95 });

  test('per boss = the carriers table\'s minimum: AG Flying 2 Tonalztics, Bork 2 Elder maul', () => {
    const recAg = recommendCarriers(ag.model, { partySize: 6, threshold: 0.95 });
    const recBork = recommendCarriers(bork.model, { partySize: 6, threshold: 0.95 });
    expect(roles.perTarget[0].carriers).toEqual(recAg.best!.carriers);
    expect(roles.perTarget[1].carriers).toEqual(recBork.best!.carriers);
    expect(recAg.best!.carriers).toEqual({ tonalztics: 2 });
    expect(recBork.best!.carriers).toEqual({ elderMaul: 2 });
  });

  test('per weapon the most any boss needs, with the bosses that drive it; no Ayak without mages', () => {
    expect(roles.rows.map((r) => [r.weapon, r.carriers, r.drivers])).toEqual([
      ['elderMaul', 2, ['Bork']],
      ['tonalztics', 2, ['Archive Guardian (Flying)']],
    ]);
    expect(roles.text).toBe('6-man: 2 Elder maul, 2 Tonalztics');
    expect(roles.rows.some((r) => r.weapon === 'ayak')).toBe(false);
  });

  test('Eye of Ayak carriers only with mages in the party', () => {
    const withMage = teamRoles([ag, bork], { partySize: 6, mages: 1, threshold: 0.95 });
    const ayak = withMage.rows.find((r) => r.weapon === 'ayak');
    expect(ayak).toBeDefined();
    const per = withMage.perTarget.map((n) => n.ayak ?? 0);
    expect(ayak!.carriers).toBe(Math.max(...per));
    // the count reaches P(magic def 0) ≥ 95% from the first round (2 specs each) on the boss that drives it
    const driver = withMage.perTarget.find((n) => n.ayak === ayak!.carriers)!;
    const model = driver.key === 'ag-flying' ? ag.model : bork.model;
    expect(ayakOutcome(model, ayak!.carriers * 2, 0.95).pZero).toBeGreaterThanOrEqual(0.95);
  });

  test('a boss already at its floor needs nobody; a weapon nobody needs gets 0 (not listed)', () => {
    const atFloor: RoleTarget = { ...ag, label: 'drained', model: { ...ag.model, def: ag.model.floor } };
    const r = teamRoles([atFloor], { partySize: 6, mages: 0 });
    expect(r.rows).toEqual([]);
    expect(r.perTarget[0].note).toBe('already at the Defence floor');
    expect(r.text).toBe('6-man: no spec carriers needed');
  });

  test('most-needed weapon: most carriers; ties to the higher "last carrier saves", then Elder maul, Tonalztics, …', () => {
    expect(mostNeededWeapon(roles)).toBe('elderMaul');
    expect(mostNeededWeapon(roles, (w) => w !== 'elderMaul')).toBe('tonalztics');
    expect(mostNeededWeapon({ ...roles, rows: [] })).toBeNull();
    // review 2 (FA 6-man: 2 Elder maul, last one 3.6 s; 2 Tonalztics, last one 27.0 s) → Tonalztics
    const rows = rowsFromCarriers({ ...NO_CARRIERS, elderMaul: 2, tonalztics: 2 }, (w) => ({ saved: w === 'elderMaul' ? 3.6 : 27, drivers: [] }));
    expect(mostNeededWeapon({ ...roles, rows })).toBe('tonalztics');
    expect(mostNeededWeapon({ ...roles, rows: rows.map((r) => ({ ...r, carriers: r.weapon === 'elderMaul' ? 3 : 2 })) })).toBe('elderMaul');
  });
});

describe('your share ("assign me")', () => {
  test('carried anyway, a free slot, or a slot worth < 1 s of gear → carry; else a teammate carries it', () => {
    expect(SHARE_MAX_SLOT_SECONDS).toBe(1);
    expect(assignMe({ weapon: null, carriedAnyway: false, freeSlots: 3 })).toMatchObject({ weapon: null, carry: false });
    expect(assignMe({ weapon: 'elderMaul', carriedAnyway: true, freeSlots: 0 }).carry).toBe(true);
    expect(assignMe({ weapon: 'elderMaul', carriedAnyway: false, freeSlots: 1 }).carry).toBe(true);
    expect(assignMe({
      weapon: 'elderMaul', carriedAnyway: false, freeSlots: 0, slotValueSeconds: 0.4,
    }).carry).toBe(true);
    const no = assignMe({
      weapon: 'tonalztics', carriers: 2, carriedAnyway: false, freeSlots: 0, slotValueSeconds: 3.2,
    });
    expect(no.carry).toBe(false);
    expect(no.reason).toBe('none: your last slot is worth 3.2 s as gear — let a teammate carry Tonalztics (most needed: 2 carriers)');
  });
});

describe('Team drain line: "needed ×N · team brings ×M"', () => {
  test('needed = the fewest of a weapon\'s first-round specs that give the same ranked drain on this boss', () => {
    const m = undrained('ag-flying');
    const model = drainModel(m, A);
    const d = drainStateFor(m, 'team', A);
    const tona = d.line!.items.find((i) => i.weapon === 'tonalztics')!;
    expect(tona.count).toBe(4);
    expect(tona.hits).toBe(8);
    const n = tona.needed!;
    const ranked = (k: number) => defenceOutcome(model, Array(k).fill('tonalztics')).rankedDef;
    const pFloor = (k: number) => defenceOutcome(model, Array(k).fill('tonalztics')).pFloor;
    expect(ranked(n)).toBe(ranked(4));
    // phase 30: the full set reaches the floor at ≥ 95%, so "needed" is the fewest that still do
    expect(pFloor(4)).toBeGreaterThanOrEqual(0.95);
    expect(pFloor(n)).toBeGreaterThanOrEqual(0.95);
    expect(n === 0 || pFloor(n - 1) < 0.95).toBe(true);
    // review 2: "needed ×3 (86%) · …" — phase 30: 3 specs rank at the floor too, but only at 86% (< 95%): ×4 (98%)
    expect(n).toBe(4);
    const p = (k: number) => formatProbability(pFloor(k));
    expect(p(3)).toBe('86%');
    expect(ranked(3)).toBe(ranked(4));
    expect(p(4)).toBe('98%');
    expect(neededText(tona)).toBe('needed ×4 (98%) · team brings ×4 (8 hits, 98%)');
    expect(neededText({ ...tona, needed: 0 })).toBe('not needed · team brings ×4 (8 hits, 98%)');
    expect(tona.title.startsWith(`${neededText(tona)}; `)).toBe(true);
    // the Max-drain plan's deterministic count ("4 Tonalztics of Ralos" hits = 2 specs → Def 156)
    expect(neededSpecs(model, { tonalztics: 4 }).defence).toEqual({ tonalztics: 2 });
    // specsNeeded directly: a weapon whose specs change nothing on this boss needs 0
    expect(specsNeeded(model, ['tonalztics', 'tonalztics', 'tonalztics', 'tonalztics', 'elderMaul'])).toMatchObject({ elderMaul: { n: 0 }, tonalztics: { n } });
  });

  test('Xarth (review 2): 4 maul or 4 Tonalztics alone each reach the floor, so at most one of them is "not needed"', () => {
    const model = drainModel(undrained('xarth'), A);
    const four = (w: 'elderMaul' | 'tonalztics') => Array(4).fill(w);
    const nd = specsNeeded(model, [...four('elderMaul'), ...four('tonalztics')]);
    expect([nd.elderMaul!.n, nd.tonalztics!.n].filter((x) => x === 0).length).toBeLessThanOrEqual(1);
    // the counts together keep the ranked Defence (the floor, 102)
    const together = defenceOutcome(model, [...Array(nd.elderMaul!.n).fill('elderMaul'), ...Array(nd.tonalztics!.n).fill('tonalztics')]);
    expect(together.rankedDef).toBe(model.floor);
    expect(nd).toMatchObject({ elderMaul: { n: 0 } });
    expect(nd.tonalztics!.n).toBeGreaterThan(0);
    // phase 30: at the threshold, not "×1 (66%)"
    expect(nd.tonalztics).toEqual({ n: 2, result: '97%', brings: '>99.9%' });
  });

  test('phase 30: Bork — Tonalztics is needed after maul ×3 (the pair reaches the floor at the threshold)', () => {
    const model = drainModel(undrained('bork'), A);
    const nd = specsNeeded(model, [...Array(4).fill('elderMaul'), ...Array(4).fill('tonalztics')]);
    expect(nd.elderMaul).toEqual({ n: 3, result: '98%', brings: '99.6%' });
    expect(nd.tonalztics).toEqual({ n: 3, result: '97%', brings: '99.6%' });
  });

  test('phase 30: "needed" never shows a sub-threshold probability when everything brought is above it', () => {
    const weapons = ['elderMaul', 'dwh', 'bgs', 'tonalztics'] as const;
    const keys = ['ag-flying', 'xarth', 'bork', 'smorks', 'moia', 'dagonhai'];
    let checked = 0;
    keys.forEach((key) => {
      const model = drainModel(undrained(key), A);
      [1, 2, 3, 4].forEach((k) => weapons.forEach((w1) => weapons.forEach((w2) => {
        const attempts = [...Array(k).fill(w1), ...Array(k).fill(w2)];
        const full = defenceOutcome(model, attempts);
        const nd = specsNeeded(model, attempts);
        if (full.rankedDef > model.floor || full.pFloor < 0.95) return;
        // the needed counts together still reach the floor at ≥ 95%
        const order = ['elderMaul', 'dwh', 'bgs', 'tonalztics'] as const;
        const needed = order.flatMap((w) => Array(nd[w]?.n ?? 0).fill(w));
        const o = defenceOutcome(model, needed);
        expect(o.rankedDef).toBe(model.floor);
        expect(o.pFloor).toBeGreaterThanOrEqual(0.95);
        // and no line shows a probability under 95%
        Object.values(nd).forEach((x) => {
          const pctNum = x!.result.startsWith('>') ? 100 : parseFloat(x!.result);
          expect(pctNum).toBeGreaterThanOrEqual(95);
        });
        checked += 1;
      })));
    });
    expect(checked).toBeGreaterThan(50);
    // Eye of Ayak: the same rule for P(magic def 0)
    const moia = drainModel(undrained('moia'), A);
    [2, 3, 4, 6, 8].forEach((k) => {
      const full = ayakOutcome(moia, k);
      const nd = specsNeeded(moia, Array(k).fill('ayak'));
      if (full.pZero >= 0.95) expect(ayakOutcome(moia, nd.ayak!.n).pZero).toBeGreaterThanOrEqual(0.95);
    });
  });

  test('no floor target: "needed ×N (→ Def X)"', () => {
    const smorks = drainModel(undrained('smorks'), A);
    const nd = specsNeeded(smorks, Array(2).fill('elderMaul'));
    expect(nd.elderMaul!.result).toMatch(/^→ Def \d+$/);
    expect(nd.elderMaul!.brings).toMatch(/^→ Def \d+$/);
  });

  test('Solo shows Tonalztics as "×2 (4 hits)"', () => {
    expect(countText(2, 4)).toBe('×2 (4 hits)');
    expect(countText(3)).toBe('×3');
    const d = drainStateFor(undrained('ag-flying'), 'solo', {
      ...A,
      mySpecs: {
        ...A.mySpecs, elderMaul: false, tonalztics: true, ayak: 0,
      },
    });
    const tona = d.line!.items.find((i) => i.weapon === 'tonalztics')!;
    expect(tona.hits).toBe(tona.count * 2);
    expect(tona.needed).toBeUndefined();
    expect(neededText(tona)).toBeUndefined();
  });

  test('neededSpecs: fewest specs if every one lands, more of the earlier weapon on ties; null when unreachable', () => {
    const bork = drainModel(undrained('bork'), A);
    const n = neededSpecs(bork, { elderMaul: 4, tonalztics: 4 });
    expect(n.defence).not.toBeNull();
    // every landed combination of fewer specs stays above the floor
    const total = Object.values(n.defence!).reduce((t, v) => t + (v ?? 0), 0);
    expect(total).toBeGreaterThan(0);
    expect(neededSpecs({ ...bork, floor: 0 }, { elderMaul: 1 }).defence).toBeNull();
    expect(neededSpecs({ ...bork, def: bork.floor }, { elderMaul: 4 }).defence).toEqual({});
  });
});

// --- the planner (reduced pools) ------------------------------------------------------------------------------------

const FA = FRACTURED_ARCHIVE_RAID;
const preset = (name: string): PresetDef => {
  const p = FA.presets.find((x) => x.name === name);
  if (!p) throw new Error(`no preset ${name}`);
  return p;
};
const inputs = (patch: Partial<PlanInputs> = {}): PlanInputs => ({
  basePlayer: generateEmptyPlayer(),
  assumptions: FA.defaultAssumptions,
  drain: 'team',
  settings: FA.defaultTimeSettings,
  route: 'all',
  pinned: FA.planDefaults.pinned.map((n) => planItemByName(n).id),
  nonItemSlots: FA.planDefaults.nonItemSlots,
  supplies: FA.defaultSupplies,
  ...patch,
});
const reduced = (presets: PresetDef[], weapons: string[]): PlanTuning => ({
  model: FA.time,
  presets,
  search: { weapons, maxPasses: 1 },
  perGroupWeapons: 1,
  perWeapon: 1,
  bases: 1,
  partners: 1,
  seeds: 2,
});
const total = (r: PlanResult) => r.comparison!.routes[r.planned].seconds;
const MELEE_RANGED = reduced([preset('Twisted bow (Masori)'), preset("Inquisitor's mace (full crush)")], ['Twisted bow']);
const MAGIC = reduced([preset("Tumeken's shadow (Ancestral)")], ['Tumeken\'s shadow']);

describe('planner: spec modes', () => {
  test('the Plan tab defaults to "Planner decides"; plan() defaults to "Specs I bring"', () => {
    expect(DEFAULT_SPEC_MODE).toBe('auto');
    expect(SPEC_MODES.map((m) => m.label)).toEqual(['Planner decides', 'Specs I bring']);
    const r = plan(inputs(), MELEE_RANGED);
    expect(r.specs.mode).toBe('manual');
    expect(r.specs.bring).toEqual(['elderMaul', 'ayak']); // the default "Specs I bring"
    expect(r.specItems.map((x) => x.name)).toEqual(['Elder maul', 'Eye of Ayak']);
    expect(r.specs.share).toMatchObject({ manual: true, carry: false });
  }, 300000);

  test('Team, planner decides: the briefing on the planned route and your share', () => {
    const r = plan(inputs({ specMode: 'auto' }), MELEE_RANGED);
    const roles = r.specs.team!;
    expect(roles.partySize).toBe(6);
    expect(roles.mages).toBe(0); // no magic loadout in the kit (auto)
    expect(roles.rows.length).toBeGreaterThan(0);
    const share = r.specs.share!;
    expect(share.manual).toBe(false);
    expect(share.weapon).toBe(mostNeededWeapon(roles));
    expect(r.specs.bring).toEqual(share.carry ? [share.weapon] : []);
    expect(r.specItems.length).toBe(r.specs.bring.length);
    if (share.carry) expect(r.inventory.some((c) => c.kind === 'spec')).toBe(true);
    expect(r.slots!.used).toBeLessThanOrEqual(28);
    // manual carriers (plan()'s default): the briefing = the Advanced counts (2 maul, 2 Tonalztics, 1 Ayak)
    expect(roles.mode).toBe('manual');
    expect(roles.carriers).toEqual({ ...A.team.carriers, ayak: 0 }); // review 2: Ayak capped at the mages (0)
    // mages in party > 0 makes Eye of Ayak a candidate; it is only added if it saves ≥ 1 s (no magic kit: never)
    const m = plan(inputs({ specMode: 'auto', carrierMode: 'auto', magesInParty: 2 }), MELEE_RANGED);
    expect(m.specs.team!.mages).toBe(2);
    expect(m.specs.team!.rows.some((x) => x.weapon === 'ayak')).toBe(false);
  }, 300000);

  test('Team, planner picks the carriers: the drain state uses exactly the briefing\'s carriers', () => {
    const r = plan(inputs({ specMode: 'auto', carrierMode: 'auto' }), MELEE_RANGED);
    const team = r.specs.team!;
    expect(team.mode).toBe('auto');
    expect(Object.values(team.carriers!).reduce((a, v) => a + v, 0)).toBeLessThanOrEqual(6);
    expect(team.rows.map((x) => [x.weapon, x.carriers]).sort()).toEqual(
      (Object.entries(team.carriers!) as [string, number][]).filter(([, v]) => v > 0).sort(),
    );
    expect(team.steps!.every((x) => x.saved >= 1 - 1e-9)).toBe(true);
    expect(team.steps!.length).toBe(Object.values(team.carriers!).reduce((a, v) => a + v, 0));
    // every phase's Team line brings 2 specs per carrier of each weapon it shows (weapons that can hit)
    const phases = r.comparison!.routes[r.planned].encounters.flatMap((e) => e.phases);
    phases.forEach((ph) => (ph.choice?.drainLine?.items ?? []).forEach((it) => {
      expect(it.count).toBe(2 * team.carriers![it.weapon as keyof CarrierCounts]);
    }));
    expect(team.rows.every((x) => typeof x.lastSaved === 'number')).toBe(true);
    // review 2: what Search / Summary get after this plan = the briefing's carriers
    expect(withPlanCarriers(A, team.carriers!).team.carriers).toEqual(team.carriers);
  }, 300000);

  test('Solo, planner decides: no magic loadout → Eye of Ayak is never brought (it costs a slot for nothing)', () => {
    const a = { ...FA.defaultAssumptions, partySize: 2 };
    const r = plan(inputs({ drain: 'solo', specMode: 'auto', assumptions: a }), MELEE_RANGED);
    expect(r.kit.some((c) => c.group === 'magic')).toBe(false);
    expect(r.specs.bring).not.toContain('ayak');
    const ayak = r.specs.solo!.perWeapon.find((d) => d.weapon === 'ayak')!;
    expect(ayak.chosen).toBe(false);
    expect(ayak.deltaSeconds).toBeLessThanOrEqual(1e-9);
    // the chosen weapons each save time
    r.specs.solo!.perWeapon.filter((d) => d.chosen).forEach((d) => expect(d.deltaSeconds).toBeGreaterThan(0));
    expect(r.specItems.map((x) => x.name).length).toBe(r.specs.bring.length);
    expect(r.specs.text).toBe(bringText(r.specs.bring));
  }, 600000);

  test('Solo, planner decides: a magic-only kit values Eye of Ayak (its drain only helps magic)', () => {
    const a = { ...FA.defaultAssumptions, partySize: 2 };
    const r = plan(inputs({ drain: 'solo', specMode: 'auto', assumptions: a }), MAGIC);
    expect(r.kit.every((c) => c.group === 'magic')).toBe(true);
    expect(r.specs.bring).toContain('ayak');
    expect(r.specs.solo!.perWeapon.find((d) => d.weapon === 'ayak')!.deltaSeconds).toBeGreaterThan(0);
    // and the planner's choice is at least as fast as bringing every weapon by hand
    const all = plan(inputs({
      drain: 'solo',
      specMode: 'manual',
      assumptions: {
        ...a,
        mySpecs: {
          ...a.mySpecs, elderMaul: true, dwh: true, bgs: true, tonalztics: true, ayak: 2,
        },
      },
    }), MAGIC);
    expect(total(r)).toBeLessThanOrEqual(total(all) + 1e-6);
  }, 600000);

  test('Ayak hint: carried (Specs I bring) with no magic loadout in the kit', () => {
    const r = plan(inputs({ drain: 'solo', specMode: 'manual', assumptions: { ...FA.defaultAssumptions, partySize: 2 } }), MELEE_RANGED);
    expect(r.specs.bring).toContain('ayak');
    expect(r.specs.notes.some((n) => n.startsWith('Eye of Ayak is carried but no magic loadout'))).toBe(true);
  }, 300000);
});

/**
 * Review regressions on the full FA defaults (slow: `RUN_SLOW_TESTS=1`). The reviewer's brute force (each of the 32
 * subsets planned with "Specs I bring", re-timed with compareRoutes) found {Tonalztics} at 22:10.5 (1330.53 s) the
 * fastest Solo set at party 1; the phase 29 search picked {Elder maul, Eye of Ayak} (22:42.7) because the quick runs'
 * seeds came from the all-weapons table.
 */
(process.env.RUN_SLOW_TESTS ? describe : describe.skip)('FA defaults (slow)', () => {
  // phase 30: the default pinned list is just the heart now; these regressions (and the reviewer's brute force) were
  // measured with the phase 29 list, which they keep as an explicit input (CrossRaid pins the new defaults' headline)
  const phase29Pinned = ['Lightbearer', 'Zaryte crossbow', 'Kodai wand', 'Ancestral robe top', ELIDINIS_WARD, 'Saturated heart']
    .map((n) => planItemByName(n).id);
  const full = (patch: Partial<PlanInputs>) => plan(inputs({
    ringPolicy: DEFAULT_RING_POLICY, specMode: 'auto', pinned: phase29Pinned, ...patch,
  }), { model: FA.time });

  test('Solo, party 1, planner decides: Bring Tonalztics, ≤ 22:10.5; the ring and the subset are a fixed point', () => {
    const r = full({ drain: 'solo', assumptions: { ...FA.defaultAssumptions, partySize: 1 } });
    expect(r.specs.bring).toEqual(['tonalztics']);
    expect(total(r)).toBeLessThanOrEqual(1330.53 + 0.05);
    expect(r.ring.ring).toBe('Ultor ring');
    // the ring screens timed the chosen subset (no second round needed here, or it converged)
    expect(r.specs.solo!.screenedWith).toEqual(r.specs.bring);
    // the per-weapon deltas are one-change moves from the optimum: none of them is faster
    r.specs.solo!.perWeapon.forEach((d) => expect(d.chosen ? d.deltaSeconds : -d.deltaSeconds).toBeGreaterThan(0));
    expect(r.specs.solo!.bestWithout[0]).toMatchObject({ weapon: 'tonalztics' });
    expect(r.specs.solo!.bestWithout[0].seconds).toBeGreaterThan(total(r));
  }, 900000);

  test('Specs I bring {Elder maul, Tonalztics}, Solo party 1: ends on Ultor at 1382.50 (review 2: the guard used to stop at Lightbearer, 1400.17)', () => {
    const a = {
      ...FA.defaultAssumptions,
      partySize: 1,
      mySpecs: {
        ...FA.defaultAssumptions.mySpecs, elderMaul: true, tonalztics: true, ayak: 0, ayakAuto: true,
      },
    };
    const r = full({ drain: 'solo', specMode: 'manual', assumptions: { ...a, mySpecs: mySpecsForSubset(['elderMaul', 'tonalztics'], { lightbearer: false }) } });
    expect(r.ring.ring).toBe('Ultor ring');
    expect(Math.abs(total(r) - 1382.50)).toBeLessThanOrEqual(0.01);
  }, 900000);

  test('Team, 6-man: the planner picks 2 Elder maul + 2 Tonalztics; the Advanced 2 / 2 / 1 by hand gives the same total (phase 31: 21:44.4)', () => {
    const auto = full({ carrierMode: 'auto' });
    expect(auto.specs.team!.carriers).toEqual({
      elderMaul: 2, dwh: 0, bgs: 0, tonalztics: 2, ayak: 0,
    });
    expect(auto.specs.team!.steps!.map((x) => x.weapon)).toEqual(['tonalztics', 'tonalztics', 'elderMaul', 'elderMaul']);
    const manual = full({ carrierMode: 'manual' });
    // review 2: the Ayak carrier is capped at the mages (the kit has no magic loadout → 0), with a note
    expect(manual.specs.team!.carriers).toEqual({ ...A.team.carriers, ayak: 0 });
    expect(manual.specs.notes.some((x) => x.startsWith('Eye of Ayak carriers capped at the mages'))).toBe(true);
    // phase 31: 21:53.0 → 21:44.4 with this (phase 29) pinned list: the quiver holds the Seeking dragon arrows, and the
    // freed slot buys the phase 30 kit (Ascension crossbows + diamond (e) worn, Inquisitor's + Obligator, Twisted bow)
    expect(formatDuration(total(manual))).toBe('21:44.4');
    expect(formatDuration(total(auto))).toBe('21:44.4');
  }, 900000);
});
