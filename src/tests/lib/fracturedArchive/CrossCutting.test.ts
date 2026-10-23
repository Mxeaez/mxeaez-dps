import { describe, expect, test } from '@jest/globals';
import {
  calculatePlayerVsNpc,
  findEquipment,
  findSpell,
  getTestMonster,
  getTestPlayer,
} from '@/tests/utils/TestUtils';
import { scaleMonster } from '@/lib/MonsterScaling';
import { getMonsters } from '@/lib/Monsters';
import {
  BORK_PHASES,
  BORK_STUNNED_PHASE,
  FRACTURED_ARCHIVE_BOSS_IDS,
  FRACTURED_ARCHIVE_MONSTER_IDS,
  OCELLUS_P1_WALKING_PHASE,
  OCELLUS_P3_DEFLECT_RANGED_PHASE,
  OCELLUS_P3_DEFLECT_RANGED_VOID_PHASE,
  OCELLUS_P3_PHASES,
  OCELLUS_P3_SOUL_SPLIT_PHASE,
} from '@/lib/constants';
import { getMagicResistance, hasGuaranteedMeleeAccuracy } from '@/lib/fracturedArchive/bork';
import { getOcellusDamageDivisor, isBlockedByOcellusPrayer } from '@/lib/fracturedArchive/ocellus';
import { isImmuneToMagicLevelDrains, isImmuneToSpell } from '@/lib/fracturedArchive/immunities';
import { DEMONBANE_EFFECTIVENESS, getFracturedArchiveDemonbaneVulnerability } from '@/lib/fracturedArchive/demonbane';
import { maxDrainReductions } from '@/lib/fracturedArchive/drains';
import { getFracturedArchiveDefenceFloor } from '@/lib/scaling/FracturedArchive';
import { Monster } from '@/types/Monster';
import { PartialDeep } from 'type-fest';

// Phase 11: interactions between the Fractured Archive modules, and that no hook fires for other monsters.

const obligatorPlayer = (m: Monster) => getTestPlayer(m, {
  equipment: { weapon: findEquipment('Obligator', 'Charged') },
  style: { name: 'Thrust', type: 'crush', stance: 'Aggressive' },
  skills: { atk: 99, str: 99 },
});

const expectedHit = (m: Monster) => calculatePlayerVsNpc(m, obligatorPlayer(m)).dist.getExpectedDamage();

describe('Fractured Archive cross-cutting', () => {
  test('Obligator best-of-N on stunned Bork: melee always hits, armour 0; armour phases lower the expected hit', () => {
    const bork = (phase: string) => scaleMonster(getTestMonster('Bork', '', { inputs: { phase } }));
    const stunned = bork(BORK_STUNNED_PHASE);
    expect(calculatePlayerVsNpc(stunned, obligatorPlayer(stunned)).accuracy).toBe(1);

    const hits = [...BORK_PHASES.filter((p) => p !== BORK_STUNNED_PHASE), BORK_STUNNED_PHASE].map((p) => expectedHit(bork(p)));
    // armour 8 > 10 > 12 > 14 in expected damage, stunned highest
    for (let i = 1; i < 4; i++) {
      expect(hits[i]).toBeLessThan(hits[i - 1]);
    }
    expect(hits[4]).toBeGreaterThan(hits[0]);
  });

  test('Ocellus void explosions halve each Obligator hitsplat (rounded down)', () => {
    const p3 = (phase: string) => scaleMonster(getTestMonster('Ocellus', 'Phase 3', { inputs: { phase } }));
    const full = expectedHit(p3(OCELLUS_P3_SOUL_SPLIT_PHASE));
    const halved = expectedHit(p3(OCELLUS_P3_DEFLECT_RANGED_VOID_PHASE));
    expect(halved).toBeLessThanOrEqual(full / 2);
    expect(halved).toBeGreaterThan(full / 2 - 0.5);
    // Deflect Ranged without explosions doesn't touch melee
    expect(expectedHit(p3(OCELLUS_P3_DEFLECT_RANGED_PHASE))).toBeCloseTo(full, 10);
  });

  test('drain plans are the same in every phase option (no phase changes Defence)', () => {
    const plan = (name: string, version: string, phase: string) => maxDrainReductions(
      getTestMonster(name, version, { inputs: { phase } }),
      { weapon: 'elderMaul', ayak: true },
    );
    const borkPlans = BORK_PHASES.map((p) => plan('Bork', '', p));
    borkPlans.forEach((p) => expect(p).toEqual(borkPlans[0]));
    const p3Plans = OCELLUS_P3_PHASES.map((p) => plan('Ocellus', 'Phase 3', p));
    p3Plans.forEach((p) => expect(p).toEqual(p3Plans[0]));
  });

  test('every Fractured Archive monster in monsters.json has a defence floor; every table id is a raid id', () => {
    const raid = getMonsters().filter((m) => FRACTURED_ARCHIVE_MONSTER_IDS.includes(m.id));
    expect(raid.length).toBeGreaterThan(10);
    raid.forEach((m) => expect([m.name, getFracturedArchiveDefenceFloor(m as Monster)]).not.toEqual([m.name, undefined]));
    FRACTURED_ARCHIVE_BOSS_IDS.forEach((id) => expect(
      getFracturedArchiveDefenceFloor({ id } as Monster),
    ).toBeDefined());
    DEMONBANE_EFFECTIVENESS.flatMap(([ids]) => ids).forEach((id) => expect(FRACTURED_ARCHIVE_MONSTER_IDS).toContain(id));
  });

  test('no raid hook fires for a non-raid monster with a raid phase string', () => {
    const phases = [BORK_STUNNED_PHASE, OCELLUS_P1_WALKING_PHASE, OCELLUS_P3_DEFLECT_RANGED_VOID_PHASE];
    phases.forEach((phase) => {
      const inputs: PartialDeep<Monster['inputs']> = { phase, partySize: 5 };
      const raw = getTestMonster('Abyssal demon', '', { inputs });
      const m = scaleMonster(raw);
      expect(m.skills.hp).toBe(raw.skills.hp);
      expect(m.defensive.flat_armour).toBe(raw.defensive.flat_armour);
      expect(getMagicResistance(m)).toBe(0);
      expect(hasGuaranteedMeleeAccuracy(m)).toBe(false);
      expect(getOcellusDamageDivisor(m)).toBe(1);
      expect(isBlockedByOcellusPrayer(m, 'crush', true)).toBe(false);
      expect(isBlockedByOcellusPrayer(m, 'ranged', false)).toBe(false);
      expect(isImmuneToSpell(m, findSpell('Ice Barrage'))).toBe(false);
      expect(isImmuneToMagicLevelDrains(m)).toBe(false);
      expect(getFracturedArchiveDemonbaneVulnerability(m)).toBeUndefined();
      expect(getFracturedArchiveDefenceFloor(m)).toBeUndefined();
    });
  });
});
