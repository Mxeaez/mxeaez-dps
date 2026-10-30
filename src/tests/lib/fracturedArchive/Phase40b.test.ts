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
  test('stun-swap, 4 stuns × 7 ticks (16.8 s of stun per kill); armour 14 is the fallback', () => {
    expect([RAID_TIME_DEFAULTS.borkKillOrder, RAID_TIME_DEFAULTS.borkStunsPerKill, RAID_TIME_DEFAULTS.borkStunTicks]).toEqual(['stun-swap', 4, 7]);
    expect(borkStunWallSeconds(S())).toBeCloseTo(16.8, 9);
    expect(BORK_FALLBACK_PHASE).toBe(BORK_PHASES[3]);
    // the estimate: 1500 ÷ (4 stuns × 6 players × 15.68 stunned DPS) = 3.99 s → 7 ticks (6.65 rounded up)
    expect(1500 / (4 * 6 * 15.68) / 0.6).toBeCloseTo(6.64, 2);
  });

  test('Advanced fields replace "Bork stun uptime"; saved settings are validated', () => {
    const keys = FA.timeSettingFields.map((f) => f.key);
    expect(keys).toEqual(expect.arrayContaining(['borkKillOrder', 'borkStunsPerKill', 'borkStunTicks']));
    expect(keys).not.toContain('borkStunUptime');
    const v = validateTime(FA, {
      borkStunUptime: 0.3, borkKillOrder: 'nonsense', borkStunsPerKill: 3, borkStunTicks: -2,
    });
    expect(v.borkStunUptime).toBeUndefined();
    expect([v.borkKillOrder, v.borkStunsPerKill, v.borkStunTicks]).toEqual(['stun-swap', 3, 7]);
    expect(validateTime(FA, { borkKillOrder: 'evenly' }).borkKillOrder).toBe('evenly');
  });

  test('borkStunRows: the cap, the remainder at armour 14, the labels', () => {
    // 15 DPS, party 6: cap 16.8 × 6 × 15 = 1512 ≥ 1500
    expect(borkStunRows(1500, 15, S(), 6).map((r) => [r.key, r.phase, r.damage, r.label])).toEqual([
      ['bork-stunned', BORK_STUNNED_PHASE, 1500, 'Bork, stunned (4 × 7 ticks)'],
    ]);
    // party 1: cap 16.8 × 15 = 252 → 1248 at armour 14 (83.2%)
    const solo = borkStunRows(1500, 15, S(), 1);
    expect(solo.map((r) => [r.key, r.phase])).toEqual([['bork-stunned', BORK_STUNNED_PHASE], ['bork-14', BORK_PHASES[3]]]);
    expect(solo[0].damage).toBeCloseTo(252, 9);
    expect(solo[1].damage).toBeCloseTo(1248, 9);
    expect(solo.map((r) => r.label)).toEqual(['Bork, stunned (4 × 7 ticks: 16.8% of hp)', 'Bork, armour 14 after the stuns (83.2% of hp)']);
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

  test('faNotOwned (Torva + Scythe, 14.7115 stunned DPS): 17.1 hp left for armour 14 (5.3178 DPS)', () => {
    const e = undrained('faNotOwned');
    expect(e.phases.map((p) => [p.key, Math.round(p.dps * 1e4) / 1e4, p.choice!.loadout])).toEqual([
      ['bork-stunned', 14.7115, 'Torva + Scythe (slash)'],
      ['bork-14', 5.3178, 'Zaryte crossbow + Ruby dragon bolts (e)'],
      ['smorks', 7.2068, 'Zaryte crossbow + Ruby dragon bolts (e)'],
    ]);
    // cap = 16.8 × 6 × 14.7115 = 1482.92; 1500 − 1482.92 = 17.08 at armour 14
    expect(e.phases[0].damage).toBeCloseTo(16.8 * 6 * e.phases[0].dps, 9);
    expect(e.phases[1].damage).toBeCloseTo(17.08, 1);
    // 1482.92 ÷ 14.7115 + 17.08 ÷ 5.3178 + 600 ÷ 7.2068 = 100.80 + 3.21 + 83.26 = 187.27 s
    expect(e.seconds).toBeCloseTo(100.8 + 17.08 / 5.3178 + 600 / 7.2068, 1);
    expect(Math.round(e.seconds * 100) / 100).toBe(187.27);
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

  test('the pinned headline (with the spec budget): fa Bork + Smorks 128.98 s, faNotOwned 142.46 s', () => {
    expect(headline('fa').encounters['bork-smorks']).toBe(128.98);
    expect(headline('faNotOwned').encounters['bork-smorks']).toBe(142.46);
  });
});
