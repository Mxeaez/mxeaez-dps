import { describe, expect, test } from '@jest/globals';
import { buildTargetMonster, drainStateFor, findTarget } from '@/lib/fracturedArchive/bestSetup';
import { drainModel, DrainModel } from '@/lib/fracturedArchive/specs';
import { soulflameNote, soulflameSaving } from '@/lib/fracturedArchive/soulflame';
import { assumptionsForTarget } from '@/lib/raids/toa/supplies';
import { raidConfig } from '@/lib/raids';

// Phase 38h-4: Soulflame horn (display only). Entice (OSRS Wiki): 25% per other player, the next melee attack is a
// guaranteed hit. Saving per landed drain = 1/p - 1/p' specs x the weapon's energy, less the horn's 25%.

const A = raidConfig('fractured-archive').defaultAssumptions;
const fake = (p: number, acc?: number): Pick<DrainModel, 'hitChance' | 'energy' | 'canHit' | 'accuracy'> => ({
  hitChance: {
    elderMaul: p, dwh: p, bgs: p, tonalztics: 0.9, ayak: 0.9,
  },
  energy: {
    elderMaul: 50, dwh: 50, bgs: 50, tonalztics: 50, ayak: 50,
  },
  canHit: {
    elderMaul: true, dwh: true, bgs: true, tonalztics: true, ayak: true,
  },
  ...(acc ? { accuracy: { dwh: { acc, atk: 1, perLevel: 1 } } } : {}),
});

describe('soulflameSaving (hand-computed)', () => {
  test('maul 40%: 1/0.4 - 1 = 1.5 specs = 75% energy, net of the horn 50%', () => {
    const s = soulflameSaving(fake(0.4), 'elderMaul')!;
    expect(s.specsSaved).toBeCloseTo(1.5, 10);
    expect(s.energySaved).toBeCloseTo(75, 8);
    expect(s.netEnergy).toBeCloseTo(50, 8);
    expect(s.enticedChance).toBe(1);
  });
  test('DWH 40.2% of 41.8% accurate: guaranteed roll still drains 96.2%', () => {
    const s = soulflameSaving(fake(0.402, 0.418), 'dwh')!;
    expect(s.enticedChance).toBeCloseTo(0.402 / 0.418, 10);
    expect(s.specsSaved).toBeCloseTo(1 / 0.402 - 0.418 / 0.402, 8);
    expect(s.netEnergy).toBeCloseTo(s.specsSaved * 50 - 25, 8);
  });
  test('silent when it frees less than its 25%: maul 80% saves 0.25 specs = 12.5%', () => {
    expect(soulflameSaving(fake(0.8), 'elderMaul')).toBeUndefined();
    expect(soulflameSaving(fake(2 / 3), 'elderMaul')).toBeUndefined();
  });
  test('not for Tonalztics / Ayak, nor a weapon that cannot hit', () => {
    expect(soulflameSaving(fake(0.3), 'tonalztics')).toBeUndefined();
    expect(soulflameSaving({ ...fake(0.3), canHit: { ...fake(0.3).canHit, elderMaul: false } }, 'elderMaul')).toBeUndefined();
    expect(soulflameNote(fake(0.3), ['tonalztics', 'ayak'])).toBeUndefined();
  });
});

describe('FA bosses', () => {
  const model = (key: string) => {
    const t = findTarget(key);
    return { t, m: drainModel(buildTargetMonster(t, undefined, 'none', A).monster, assumptionsForTarget(t, A)) };
  };
  test('Smorks (maul 54.1%): shows, 0.85 specs = 42% energy, 17% net', () => {
    const { m } = model('smorks');
    const s = soulflameSaving(m, 'elderMaul')!;
    expect(s.hitChance).toBeCloseTo(0.541, 3);
    expect(s.specsSaved).toBeCloseTo(1 / 0.541 - 1, 2);
    expect(s.energySaved).toBeCloseTo(42.4, 0);
    expect(s.netEnergy).toBeCloseTo(17.4, 0);
    expect(soulflameNote(m, ['elderMaul'])).toContain('saves ≈ 0.8 specs per landed drain');
  });
  test('Ezekiel (maul 87.7%): silent', () => {
    const { m } = model('ezekiel');
    expect(soulflameNote(m, ['elderMaul', 'dwh', 'bgs'])).toBeUndefined();
  });
  test('the Team drain plan on Smorks uses the maul (the note covers it); on Ezekiel the plan has none', () => {
    const items = (key: string) => drainStateFor(buildTargetMonster(findTarget(key), undefined, 'none', A).monster, 'team', assumptionsForTarget(findTarget(key), A))
      .line!.items.filter((i) => i.count > 0).map((i) => i.weapon);
    expect(soulflameNote(model('smorks').m, items('smorks'))).toContain('Elder maul 54% → 100%');
    expect(soulflameNote(model('ezekiel').m, items('ezekiel'))).toBeUndefined();
  });
});
