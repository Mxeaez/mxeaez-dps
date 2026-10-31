import { describe, expect, test } from '@jest/globals';
import {
  BORK_FALLBACK_PHASE, borkStunRows, borkStunWallSeconds, createKitEvaluator, encounterTime, RAID_TIME_DEFAULTS,
  RaidTimeSettings, raidTimeAssumptionsFrom,
} from '@/lib/fracturedArchive/raidTime';
import { BORK_PHASES, BORK_STUNNED_PHASE } from '@/lib/fracturedArchive/constants';
import { FRACTURED_ARCHIVE_RAID } from '@/lib/raids';
import { validateTime } from '@/lib/raids/settings';
import { PlanResult } from '@/lib/fracturedArchive/planner';
import { finalAssumptions, kitLoadouts } from '@/tests/utils/probes';
import { phase37Fixture } from '@/tests/utils/phase37';
import { headline, HeadlineName } from '@/tests/utils/headlines';

// Phase 40b (ROADMAP 40b): Bork + Smorks stun-swap. The team hits Bork only while he is stunned (armour 0, every melee
// hit lands), the Smorks between stuns; Bork's hp the stuns can't cover (stuns × ticks × 0.6 s × party × stunned DPS)
// is fought at armour 14. Docs: docs/BEST_SETUP.md *Bork + Smorks stun-swap*, DATA_SOURCES *Phase 40b*.

const FA = FRACTURED_ARCHIVE_RAID;
const S = (s: Partial<RaidTimeSettings> = {}): RaidTimeSettings => ({ ...RAID_TIME_DEFAULTS, ...s });

describe('defaults and inputs', () => {
  test('stun-swap, 4 stuns × 25 ticks (60 s of stun per kill); armour 14 is the fallback', () => {
    expect([RAID_TIME_DEFAULTS.borkKillOrder, RAID_TIME_DEFAULTS.borkStunsPerKill, RAID_TIME_DEFAULTS.borkStunTicks]).toEqual(['stun-swap', 4, 25]);
    expect(borkStunWallSeconds(S())).toBeCloseTo(60, 9);
    expect(BORK_FALLBACK_PHASE).toBe(BORK_PHASES[3]);
    // phase 40b-2, the user: "around 5 Scythe hits" per stun; the Scythe attacks every 5 ticks, so 5 attacks take
    // 21 ticks (ticks 0, 5, 10, 15, 20) to 25 (5 × 5); the default is the top of the range
    expect([4 * 5 + 1, 5 * 5]).toEqual([21, RAID_TIME_DEFAULTS.borkStunTicks]);
    expect(FA.timeSettingFields.find((f) => f.key === 'borkStunTicks')!.label).toBe('Bork stun length (ticks, ≈ 5 Scythe hits)');
  });

  test('Advanced fields replace "Bork stun uptime"; saved settings are validated', () => {
    const keys = FA.timeSettingFields.map((f) => f.key);
    expect(keys).toEqual(expect.arrayContaining(['borkKillOrder', 'borkStunsPerKill', 'borkStunTicks']));
    expect(keys).not.toContain('borkStunUptime');
    const v = validateTime(FA, {
      borkStunUptime: 0.3, borkKillOrder: 'nonsense', borkStunsPerKill: 3, borkStunTicks: -2,
    });
    expect(v.borkStunUptime).toBeUndefined();
    expect([v.borkKillOrder, v.borkStunsPerKill, v.borkStunTicks]).toEqual(['stun-swap', 3, 25]);
    expect(validateTime(FA, { borkKillOrder: 'evenly' }).borkKillOrder).toBe('evenly');
  });

  test('borkStunRows: the cap, the remainder at armour 14, the labels', () => {
    // 15 DPS, party 6: cap 60 × 6 × 15 = 5400 ≥ 1500
    expect(borkStunRows(1500, 15, S(), 6).map((r) => [r.key, r.phase, r.damage, r.label])).toEqual([
      ['bork-stunned', BORK_STUNNED_PHASE, 1500, 'Bork, stunned (4 × 25 ticks)'],
    ]);
    // party 1: cap 60 × 15 = 900 → 600 at armour 14 (40%)
    const solo = borkStunRows(1500, 15, S(), 1);
    expect(solo.map((r) => [r.key, r.phase])).toEqual([['bork-stunned', BORK_STUNNED_PHASE], ['bork-14', BORK_PHASES[3]]]);
    expect(solo[0].damage).toBeCloseTo(900, 9);
    expect(solo[1].damage).toBeCloseTo(600, 9);
    expect(solo.map((r) => r.label)).toEqual(['Bork, stunned (4 × 25 ticks: 60% of hp)', 'Bork, armour 14 after the stuns (40% of hp)']);
    // the old 7-tick default (an input value): cap 16.8 × 15 = 252 → 1248 at armour 14
    const old = borkStunRows(1500, 15, S({ borkStunTicks: 7 }), 1);
    expect(old[0].damage).toBeCloseTo(252, 9);
    expect(old[1].damage).toBeCloseTo(1248, 9);
    // a kit that can't hit stunned Bork: all of him at armour 14
    expect(borkStunRows(1500, 0, S(), 6).map((r) => r.damage)).toEqual([0, 1500]);
  });
});

// Hand-computed encounters on the headline kits, undrained (drain None: no spec budget), so seconds = Σ damage ÷ DPS.
// The kit's DPS per row is the calculator's (pinned to 4 decimals); the encounter arithmetic is by hand.
const undrained = (name: HeadlineName) => {
  const fx = phase37Fixture(name) as PlanResult;
  const a = finalAssumptions(name, fx);
  const kit = createKitEvaluator(kitLoadouts(fx.kit, a), a);
  return encounterTime('bork-smorks', kit, raidTimeAssumptionsFrom(a, 'none', FA.defaultTimeSettings, FA.time));
};

describe('hand-computed Bork + Smorks (headline kits, drains None, party 6)', () => {
  test('fa (Inquisitor\'s + Obligator on stunned Bork, 15.6766 DPS): the stuns cover Bork', () => {
    const e = undrained('fa');
    expect(e.phases.map((p) => [p.key, Math.round(p.dps * 1e4) / 1e4])).toEqual([['bork-stunned', 15.6766], ['smorks', 7.5258]]);
    expect(e.phases[0].choice!.loadout).toBe('Inquisitor\'s + Obligator');
    // cap = 4 × 4.2 s × 6 × 15.6766 = 1580.2 ≥ 1500: 1500 ÷ 15.6766 + 600 ÷ 7.5258 = 95.684 + 79.726 = 175.41 s
    expect(e.phases[0].damage).toBe(1500);
    expect(e.seconds).toBeCloseTo(1500 / 15.6766 + 600 / 7.5258, 2);
    expect(Math.round(e.seconds * 100) / 100).toBe(175.41);
  });

  test('faNotOwned (Scythe of Vitur #2, 14.7115 stunned DPS): the 25-tick stuns cover Bork (phase 40b-2; 40d kit)', () => {
    const e = undrained('faNotOwned');
    expect(e.phases.map((p) => [p.key, Math.round(p.dps * 1e4) / 1e4, p.choice!.loadout])).toEqual([
      ['bork-stunned', 14.7115, 'Scythe of Vitur #2'],
      ['smorks', 6.1317, 'Twisted bow (Masori)'],
    ]);
    // cap = 60 s × 6 × 14.7115 = 5296.1 ≥ 1500 (40b's 7 ticks left 17 hp at armour 14):
    // 1500 ÷ 14.7115 + 600 ÷ 6.1317 = 101.96 + 97.85 = 199.81 s
    expect(e.phases[0].damage).toBe(1500);
    expect(e.seconds).toBeCloseTo(1500 / 14.7115 + 600 / 6.1317, 1);
    expect(Math.round(e.seconds * 100) / 100).toBe(199.81);
  });

  test('faSolo (party 1, 15.6766 stunned DPS): 4 × 25 ticks cover 62.7% of Bork, the rest at armour 14 (phase 40b-2; 40d kit)', () => {
    const e = undrained('faSolo');
    expect(e.phases.map((p) => [p.key, Math.round(p.dps * 1e4) / 1e4, p.choice!.loadout])).toEqual([
      ['bork-stunned', 15.6766, 'Inquisitor\'s + Obligator'],
      ['bork-14', 7.5728, 'Inquisitor\'s + Obligator'],
      ['smorks', 7.5258, 'Ascension crossbows + diamond (e) (Masori)'],
    ]);
    // cap = 4 × 25 × 0.6 s × 1 player × 15.6766 = 940.60 hp (62.7%); 1500 − 940.60 = 559.40 at armour 14
    expect(e.phases[0].damage).toBeCloseTo(940.60, 1);
    expect(e.phases[1].damage).toBeCloseTo(559.40, 1);
    expect(e.phases[0].label).toBe('Bork, stunned (4 × 25 ticks: 62.7% of hp)');
    // 60 s stunned + 559.40 ÷ 7.5728 + 600 ÷ 7.5258 = 60 + 73.87 + 79.73 = 213.60 s
    expect(e.seconds).toBeCloseTo(60 + 559.40 / 7.5728 + 600 / 7.5258, 1);
    expect(Math.round(e.seconds * 100) / 100).toBe(213.6);
  });

  test('killed evenly (the option) is the pre-40b model: fa four quarters at armour 8 / 10 / 12 / 14', () => {
    const fx = phase37Fixture('fa') as PlanResult;
    const a = finalAssumptions('fa', fx);
    const kit = createKitEvaluator(kitLoadouts(fx.kit, a), a);
    const e = encounterTime('bork-smorks', kit, raidTimeAssumptionsFrom(a, 'none', { ...FA.defaultTimeSettings, borkKillOrder: 'evenly' }, FA.time));
    expect(e.phases.map((p) => p.key)).toEqual(['bork-8', 'bork-10', 'bork-12', 'bork-14', 'smorks']);
    // 375 ÷ 8.9455 + 375 ÷ 8.4875 + 375 ÷ 8.0298 + 375 ÷ 7.5728 + 600 ÷ 7.5258
    expect(e.seconds).toBeCloseTo(375 / 8.9455 + 375 / 8.4875 + 375 / 8.0298 + 375 / 7.5728 + 600 / 7.5258, 1);
  });

  test('the pinned headline (with the spec budget): fa Bork + Smorks 128.98 s, faNotOwned 141.23 s, faSolo 177.99 s (40d)', () => {
    expect(headline('fa').encounters['bork-smorks']).toBe(128.98);
    expect(headline('faNotOwned').encounters['bork-smorks']).toBe(141.23);
    expect(headline('faSolo').encounters['bork-smorks']).toBe(177.99);
  });
});
