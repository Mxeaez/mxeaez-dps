import { spawnSync } from 'child_process';
import { join } from 'path';
import { describe, expect, test } from '@jest/globals';
import { OTHER_RAIDS } from '@/tests/utils/otherRaids';
import {
  bruteForceKits, bruteForceOk, drainOutcome, headlineNames, headlineWithEncounter, RETIME_TOLERANCE, retimeHeadline,
  retimeOk,
} from '@/tests/utils/probes';
import { headline } from '@/tests/utils/headlines';
import { slowTest } from '@/tests/utils/slow';

// Phase 37c: smoke tests of the three review probes (scripts/probes/*.mjs over src/tests/utils/probes.ts) on small cases.

const ROOT = join(__dirname, '..', '..', '..', '..');
const cli = (script: string, args: string[]) => spawnSync(process.execPath, [join(ROOT, 'scripts', 'probes', script), ...args], {
  cwd: ROOT, encoding: 'utf8', timeout: 120000,
});

describe('retime: the headline kits re-timed outside the planner = headlines.json', () => {
  test.each(headlineNames().filter((n) => OTHER_RAIDS || !['toa', 'cox', 'tob'].includes(n)))('%s', (name) => {
    const r = retimeHeadline(name);
    expect(r.pinned).toBe(headline(name).seconds);
    expect(Math.abs(r.gap)).toBeLessThanOrEqual(RETIME_TOLERANCE);
    expect(r.fastest).toBe(r.route);
    expect(r.encounterMismatches).toEqual([]);
    expect(r.encounters.map((e) => e.id)).toEqual(Object.keys(headline(name).encounters));
    expect(retimeOk(r)).toBe(true);
    // the CLI's exit condition: a gap over 0.001 s, another fastest route or an encounter off fails
    expect(retimeOk({ ...r, gap: 0.0011 })).toBe(false);
    expect(retimeOk({ ...r, fastest: 'other' })).toBe(false);
    expect(retimeOk({ ...r, encounterMismatches: ['x'] })).toBe(false);
  }, 60000);

  // phase 38f: the CLI smoke tests and the brute-force smoke are slow (a node process each; 9 s / 19 s); retimeHeadline,
  // drainOutcome and bruteForceKits themselves are called by the fast tests
  slowTest('CLI: one plan, a table, exit 0; an unknown plan exits 2', () => {
    const ok = cli('retime.mjs', ['fa', '--quiet']);
    expect(ok.status).toBe(0);
    expect(ok.stdout).toMatch(/fa\s+\d+:\d\d\.\d\s+[\d.]+\s+[\d.]+\s+0\.00e\+0\s+yes\s+[\d.]+ s\s+OK/);
    expect(ok.stdout).toContain(headline('fa').total);
    expect(cli('retime.mjs', ['nope']).status).toBe(2);
  }, 120000);
});

describe('drain outcome: one encounter of a headline, for hand-checking', () => {
  test('FA Xarth (Team): 1 Tonalztics carrier (2 specs, 97%), Def 170 → floor 102, the pools balance', () => {
    expect(headlineWithEncounter('xarth')).toBe('fa');
    const d = drainOutcome('fa', 'xarth');
    expect(d.eventsMatch).toBe(true);
    // phase 38g: the fewest carriers at 95% within the kit's (2 Elder maul + 3 Tonalztics): 1 Tonalztics carrier, 2 specs
    // phase 38h-2 (HP averaged over the outcomes): Elder maul ×2 → Tonalztics (99%) is worth a little more than the
    // line's Tonalztics ×2 (98%); the carriers' bars have no other use
    expect(d.events).toEqual([{ npc: 'Xarth', firstRowKey: 'xarth', counts: { elderMaul: 2, tonalztics: 1 } }]);
    const [x] = d.phases;
    // Xarth at party 6 (the r32 review's independent drain probe): Def 170, floor 102, 50% energy per spec
    expect([x.def, x.floor, x.energy]).toEqual([170, 102, { elderMaul: 50, tonalztics: 50 }]);
    expect(x.pFloor!).toBeGreaterThanOrEqual(0.95);
    expect(x.pFloor!).toBeLessThan(0.995);
    expect(x.rankedDef).toBe(102);
    // wall clock = DPS seconds ÷ party 6; one +10% tick at 30 s
    expect(d.wall).toBeCloseTo(d.seconds / 6, 9);
    expect(d.wall).toBeGreaterThan(30);
    const pool = Object.fromEntries(d.pools.map((g) => [g.group, g]));
    // phase 38g: 2 maul bars: 200 + 2 × 10 − 0 = 220; 3 Tonalztics bars: 300 + 3 × 10 − 2 × 50 = 230; yours (a surge dose
    // here, Crimson kisten): 100 + 10 + 25 − (ZCB 75 + kisten 50) = 10; Xarth's death (Death Charge, party 6) adds
    // 15 ÷ 6 = 2.5% per bar at the end: 225, 237.5, 12.5. Phase 38h-2: Elder maul ×2 + Tonalztics ×1: 220 − 100 + 5 = 125,
    // 330 − 50 + 7.5 = 287.5. Phase 38h-3 (bring rule: Zaryte crossbow only, no surge potion): yours 100 + 10 − 75 + 2.5 = 37.5
    expect([pool.elderMaul.balance, pool.tonalztics.balance, pool.me.balance]).toEqual([125, 287.5, 37.5]);
    expect(pool.me.end).toEqual([37.5]);
  }, 60000);

  test('FA Solo Archive Guardian: 2 Tonalztics + ZCB + the surge dose from one bar', () => {
    const d = drainOutcome('faSolo', 'archive-guardian');
    expect(d.eventsMatch).toBe(true);
    expect(d.surge).toBe(true);
    const [me] = d.pools;
    // party 1: wall = DPS seconds (180.67 s: 6 ticks); 100 + 60 + 25 (dose) − (2 × 50 + 75) = 10; phase 38b: the
    // Guardian's death (Death Charge, party 1) +15% = 25 = the bar at the end
    expect([me.group, me.ticks, me.spent, me.restored, me.balance, me.end]).toEqual(['me', 6, 175, 15, 25, [25]]);
  }, 60000);

  slowTest('CLI: three tables, exit 0; an encounter on no headline route exits 2', () => {
    const ok = cli('drainOutcome.mjs', ['moia']);
    expect(ok.status).toBe(0);
    expect(ok.stdout).toMatch(/^fa \/ Moia: /);
    ['events (the encounter spec budget)', 'phases', 'pools (spec bars)', 'spec plan = the plan\'s: yes'].forEach((s) => expect(ok.stdout).toContain(s));
    expect(cli('drainOutcome.mjs', ['nowhere']).status).toBe(2);
  }, 120000);
});

describe('brute-force kits: the planner\'s kit = the best of every kit (tiny pool)', () => {
  // the smoke case: one ring run (camp Lightbearer), kits of the first 3 candidates + the planner's; the full check is
  // the CLI (`node scripts/probes/bruteForceKits.mjs fa`: Phase36's 336 kits, gap 0)
  slowTest('FA Team, tiny pool, the headline route', () => {
    const b = bruteForceKits('fractured-archive', { pool: 'tiny', ringPolicy: 'camp-lightbearer', candidates: 3 });
    expect(b.route).toBe(headline('fa').route);
    expect(b.ring).toBe('Lightbearer');
    expect(b.tried).toBeGreaterThanOrEqual(3);
    expect(b.kits).toBeGreaterThan(b.tried);
    expect(b.maxKit).toBeGreaterThanOrEqual(b.plannedKit.length);
    expect(b.plannedInSpace).toBeCloseTo(b.planned, 6);
    expect(b.gap).toBeLessThanOrEqual(1e-6);
    expect(b.gap).toBeGreaterThanOrEqual(-1e-6);
    expect(bruteForceOk(b)).toBe(true);
    // the CLI's exit condition: a kit faster than the planner's, or the planner's kit re-timing differently, fails
    expect(bruteForceOk({ ...b, gap: 2e-6 })).toBe(false);
    expect(bruteForceOk({ ...b, plannedInSpace: b.planned + 1e-3 })).toBe(false);
  }, 300000);
});
