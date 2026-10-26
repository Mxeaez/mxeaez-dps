import { spawnSync } from 'child_process';
import { join } from 'path';
import { describe, expect, test } from '@jest/globals';
import {
  bruteForceKits, bruteForceOk, drainOutcome, headlineNames, headlineWithEncounter, RETIME_TOLERANCE, retimeHeadline,
  retimeOk,
} from '@/tests/utils/probes';
import { headline } from '@/tests/utils/headlines';

// Phase 37c: smoke tests of the three review probes (scripts/probes/*.mjs over src/tests/utils/probes.ts) on small cases.

const ROOT = join(__dirname, '..', '..', '..', '..');
const cli = (script: string, args: string[]) => spawnSync(process.execPath, [join(ROOT, 'scripts', 'probes', script), ...args], {
  cwd: ROOT, encoding: 'utf8', timeout: 120000,
});

describe('retime: the headline kits re-timed outside the planner = headlines.json', () => {
  test.each(headlineNames())('%s', (name) => {
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

  test('CLI: one plan, a table, exit 0; an unknown plan exits 2', () => {
    const ok = cli('retime.mjs', ['toa', '--quiet']);
    expect(ok.status).toBe(0);
    expect(ok.stdout).toMatch(/toa\s+14:38\.2\s+878\.2095\s+878\.2095\s+0\.00e\+0\s+yes\s+[\d.]+ s\s+OK/);
    expect(cli('retime.mjs', ['nope']).status).toBe(2);
  }, 120000);
});

describe('drain outcome: one encounter of a headline, for hand-checking', () => {
  test('FA Xarth (Team): 4 Elder maul + 6 Tonalztics, Def 170 → floor 102, the pools balance', () => {
    expect(headlineWithEncounter('xarth')).toBe('fa');
    const d = drainOutcome('fa', 'xarth');
    expect(d.eventsMatch).toBe(true);
    expect(d.events).toEqual([{ npc: 'Xarth', firstRowKey: 'xarth', counts: { elderMaul: 4, tonalztics: 6 } }]);
    const [x] = d.phases;
    // Xarth at party 6 (the r32 review's independent drain probe): Def 170, floor 102, 50% energy per spec
    expect([x.def, x.floor, x.energy]).toEqual([170, 102, { elderMaul: 50, tonalztics: 50 }]);
    expect(x.pFloor!).toBeGreaterThan(0.9999);
    expect(x.rankedDef).toBe(102);
    // wall clock = DPS seconds ÷ party 6; one +10% tick at 30 s
    expect(d.wall).toBeCloseTo(d.seconds / 6, 9);
    expect(d.wall).toBeGreaterThan(30);
    const pool = Object.fromEntries(d.pools.map((g) => [g.group, g]));
    // 2 maul bars: 200 + 2 × 10 − 4 × 50 = 20; 3 Tonalztics bars: 300 + 30 − 300 = 30; yours (phase 38a: a surge dose
    // here on the raid clock, Crimson kisten instead of Burning claws): 100 + 10 + 25 − (ZCB 75 + kisten 50) = 10
    expect([pool.elderMaul.balance, pool.tonalztics.balance, pool.me.balance]).toEqual([20, 30, 10]);
    expect(pool.me.end).toEqual([10]);
  }, 60000);

  test('FA Solo Archive Guardian: 2 Tonalztics + ZCB + the surge dose from one bar', () => {
    const d = drainOutcome('faSolo', 'archive-guardian');
    expect(d.eventsMatch).toBe(true);
    expect(d.surge).toBe(true);
    const [me] = d.pools;
    // party 1: wall = DPS seconds (180.67 s: 6 ticks); 100 + 60 + 25 (dose) − (2 × 50 + 75) = 10 = the bar at the end
    expect([me.group, me.ticks, me.spent, me.balance, me.end]).toEqual(['me', 6, 175, 10, [10]]);
  }, 60000);

  test('CLI: three tables, exit 0; an encounter on no headline route exits 2', () => {
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
  test('FA Team, tiny pool, the headline route', () => {
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
