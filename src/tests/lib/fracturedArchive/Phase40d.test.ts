import { describe, expect, test } from '@jest/globals';
import { findEquipment, getTestMonster, getTestPlayer } from '@/tests/utils/TestUtils';
import { scaleMonster } from '@/lib/MonsterScaling';
import PlayerVsNPCCalc from '@/lib/PlayerVsNPCCalc';
import {
  OCELLUS_P3_DEFLECT_MELEE_PHASE,
  OCELLUS_P3_DEFLECT_MELEE_VOID_PHASE,
  OCELLUS_P3_DEFLECT_RANGED_PHASE,
  OCELLUS_P3_DEFLECT_RANGED_VOID_PHASE,
  OCELLUS_P3_PHASES,
  OCELLUS_P3_SOUL_SPLIT_PHASE,
} from '@/lib/constants';
import {
  FA_TIME_MODEL, RAID_TIME_DEFAULTS, raidTimeAssumptionsFrom, RaidKit, RaidTimeSettings, requiredPhaseTargets,
} from '@/lib/fracturedArchive/raidTime';
import { raidConfig } from '@/lib/raids';
import { Monster } from '@/types/Monster';
import { Player } from '@/types/Player';

// Phase 40d: Ocellus's void explosions (the user, 2026-10-30; the wiki calls the speed-up "unconfirmed"): every attack
// is 2-tick and hits are halved (rounded down), the Deflects still apply, about half of the last quadrant's time.
// Docs: docs/BEST_SETUP.md *Phase 40d*; UNVERIFIED B5.

const p3 = (phase: string): Monster => scaleMonster(getTestMonster('Ocellus', 'Phase 3', { inputs: { phase } }));

const rcbPlayer = (m: Monster): Player => getTestPlayer(m, {
  equipment: { weapon: findEquipment('Rune crossbow'), ammo: findEquipment('Runite bolts') },
  skills: { ranged: 99 },
});
const swordPlayer = (m: Monster, weapon: string): Player => getTestPlayer(m, {
  equipment: { weapon: findEquipment(weapon) },
  style: { name: 'Slash', type: 'slash', stance: 'Aggressive' },
  skills: { atk: 99, str: 99 },
});

const calc = (m: Monster, p: (mm: Monster) => Player, spec = false) => new PlayerVsNPCCalc(p(m), m, { usingSpecialAttack: spec });

/** E[hit] for a uniform 0..max hit at accuracy `acc`, each hitsplat halved and rounded down (an accurate 0 → 1 → 0). */
const halvedExpected = (acc: number, max: number): number => {
  let sum = 0;
  for (let h = 0; h <= max; h++) sum += Math.trunc(h / 2);
  return (acc * sum) / (max + 1);
};

describe('the calc: 2-tick attacks during the void explosions', () => {
  test.each([
    ['Rune crossbow', OCELLUS_P3_DEFLECT_MELEE_PHASE, OCELLUS_P3_DEFLECT_MELEE_VOID_PHASE, rcbPlayer],
    ['Abyssal whip', OCELLUS_P3_DEFLECT_RANGED_PHASE, OCELLUS_P3_DEFLECT_RANGED_VOID_PHASE, (m: Monster) => swordPlayer(m, 'Abyssal whip')],
  ] as [string, string, string, (m: Monster) => Player][])('%s: speed 2, DPS = halved E[hit] ÷ 2 ticks (accuracy / max hit as outside the window)', (_, plainPhase, voidPhase, player) => {
    const plain = calc(p3(plainPhase), player);
    const exploding = calc(p3(voidPhase), player);
    expect(plain.getExpectedAttackSpeed()).toBeGreaterThan(2);
    expect(exploding.getExpectedAttackSpeed()).toBe(2);
    expect(exploding.getHitChance()).toBe(plain.getHitChance());
    expect(exploding.getMax()).toBe(Math.trunc(plain.getMax() / 2));
    const expected = halvedExpected(plain.getHitChance(), plain.getMax());
    expect(exploding.getExpectedDamage()).toBeCloseTo(expected, 9);
    expect(exploding.getDps()).toBeCloseTo(expected / 2 / 0.6, 9);
  });

  test('outside the window (Quadrants 1-3, plain Deflect, Soul Split) the weapon keeps its own speed', () => {
    const speed = calc(p3(OCELLUS_P3_PHASES[0]), rcbPlayer).getExpectedAttackSpeed();
    for (const phase of [OCELLUS_P3_DEFLECT_MELEE_PHASE, OCELLUS_P3_SOUL_SPLIT_PHASE]) {
      expect(calc(p3(phase), rcbPlayer).getExpectedAttackSpeed()).toBe(speed);
    }
  });

  test('a blocked style stays 0 in the window; specs keep their own speed', () => {
    expect(calc(p3(OCELLUS_P3_DEFLECT_RANGED_VOID_PHASE), rcbPlayer).getDps()).toBe(0);
    const maul = (m: Monster) => getTestPlayer(m, {
      equipment: { weapon: findEquipment('Elder maul') },
      style: { name: 'Pound', type: 'crush', stance: 'Accurate' },
      skills: { atk: 99, str: 99 },
    });
    expect(calc(p3(OCELLUS_P3_DEFLECT_RANGED_VOID_PHASE), maul, true).getExpectedAttackSpeed())
      .toBe(calc(p3(OCELLUS_P3_DEFLECT_RANGED_PHASE), maul, true).getExpectedAttackSpeed());
  });
});

describe('the time model: the last quadrant split by time', () => {
  // stub kit: DPS per phase (Quadrants 1-3 4, Deflect Melee 2 / + void 3, Deflect Ranged 1 / + void 1.25)
  const DPS: Record<string, number> = {
    [OCELLUS_P3_PHASES[0]]: 4,
    [OCELLUS_P3_DEFLECT_MELEE_PHASE]: 2,
    [OCELLUS_P3_DEFLECT_MELEE_VOID_PHASE]: 3,
    [OCELLUS_P3_DEFLECT_RANGED_PHASE]: 1,
    [OCELLUS_P3_DEFLECT_RANGED_VOID_PHASE]: 1.25,
  };
  const kit: RaidKit = { best: (q) => ({ loadout: q.phase ?? 'x', style: 'x', dps: DPS[q.phase ?? ''] ?? 1 }) };
  const a = raidConfig('fractured-archive').defaultAssumptions;
  const rowsAt = (settings: Partial<RaidTimeSettings>) => {
    const ta = raidTimeAssumptionsFrom(a, 'none', { ...RAID_TIME_DEFAULTS, ...settings }, FA_TIME_MODEL);
    return { rows: FA_TIME_MODEL.encounterPass('ocellus', kit, ta, 'none', 90), mult: ta.dpsMultiplier ?? 1 };
  };

  test('default 50%: H at rate 0.5 × 1 + 0.5 × 1.25 = 1.125 (Deflect Ranged: worse than 0.5 × 2 + 0.5 × 3 = 2.5)', () => {
    expect(RAID_TIME_DEFAULTS.ocellusVoidTimeShare).toBe(0.5);
    const { rows, mult } = rowsAt({});
    const last = rows.filter((r) => r.key.startsWith('ocellus-p3-'));
    expect(last.map((r) => [r.key, r.phase])).toEqual([
      ['ocellus-p3-last', OCELLUS_P3_DEFLECT_RANGED_PHASE], ['ocellus-p3-void', OCELLUS_P3_DEFLECT_RANGED_VOID_PHASE],
    ]);
    const H = last[0].damage + last[1].damage;
    const q13 = rows.find((r) => r.key === 'ocellus-p3')!;
    expect(H).toBeCloseTo((q13.damage / 0.75) * 0.25, 9);
    // damage shares 0.5 × 1 ÷ 1.125 = 4/9 and 0.5 × 1.25 ÷ 1.125 = 5/9; each row half of T = H ÷ (1.125 × mult)
    expect(last[0].damage).toBeCloseTo((H * 4) / 9, 9);
    expect(last[1].damage).toBeCloseTo((H * 5) / 9, 9);
    expect(last[0].seconds).toBeCloseTo(H / (1.125 * mult) / 2, 9);
    expect(last[1].seconds).toBeCloseTo(last[0].seconds, 9);
    expect(last[0].noDamageSpecs).toBeUndefined();
    expect(last[1].noDamageSpecs).toMatch(/void explosions/);
    expect(last[1].label).toBe('P3 last quadrant, Deflect Ranged + void explosions (2-tick)');
  });

  test('0%: the pre-40d row (the worse plain Deflect, all of H); 100%: only the void row', () => {
    const { rows: none, mult } = rowsAt({ ocellusVoidTimeShare: 0 });
    const last = none.filter((r) => r.key.startsWith('ocellus-p3-'));
    expect(last.map((r) => [r.key, r.phase, r.noDamageSpecs])).toEqual([['ocellus-p3-last', OCELLUS_P3_DEFLECT_RANGED_PHASE, undefined]]);
    expect(last[0].seconds).toBeCloseTo(last[0].damage / mult, 9);
    const { rows: all } = rowsAt({ ocellusVoidTimeShare: 1 });
    const v = all.filter((r) => r.key.startsWith('ocellus-p3-'));
    expect(v.map((r) => [r.key, r.phase])).toEqual([['ocellus-p3-void', OCELLUS_P3_DEFLECT_RANGED_VOID_PHASE]]);
    expect(v[0].damage).toBeCloseTo(last[0].damage, 9);
    expect(v[0].seconds).toBeCloseTo(last[0].damage / (1.25 * mult), 9);
  });

  test('all of P3 in the last quadrant: the plain row carries the P3 drain reset', () => {
    const { rows } = rowsAt({ ocellusLastQuadrantFraction: 1 });
    expect(rows.map((r) => [r.key, r.drainReset])).toEqual([
      ['ocellus-p1', undefined], ['ocellus-p2', 'P1'], ['ocellus-p3-last', 'P2'], ['ocellus-p3-void', undefined],
    ]);
  });

  test('the planner precomputes the void phases', () => {
    const phases = requiredPhaseTargets(RAID_TIME_DEFAULTS).filter((t) => t.targetKey === 'ocellus-p3').map((t) => t.phase);
    expect(phases).toEqual(expect.arrayContaining([OCELLUS_P3_DEFLECT_MELEE_VOID_PHASE, OCELLUS_P3_DEFLECT_RANGED_VOID_PHASE]));
    expect(requiredPhaseTargets({ ...RAID_TIME_DEFAULTS, ocellusVoidTimeShare: 0 }).map((t) => t.phase))
      .not.toContain(OCELLUS_P3_DEFLECT_MELEE_VOID_PHASE);
  });
});
