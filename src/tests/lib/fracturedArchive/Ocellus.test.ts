import { describe, expect, test } from '@jest/globals';
import {
  calculatePlayerVsNpc,
  findEquipment,
  findEquipmentById,
  findResult,
  getTestMonster,
  getTestPlayer,
} from '@/tests/utils/TestUtils';
import { scaleMonster } from '@/lib/MonsterScaling';
import PlayerVsNPCCalc from '@/lib/PlayerVsNPCCalc';
import {
  MONSTER_PHASES_BY_ID,
  OCELLUS_P1_IDS,
  OCELLUS_P1_PHASES,
  OCELLUS_P1_WALKING_PHASE,
  OCELLUS_P2_IDS,
  OCELLUS_P3_DEFLECT_MELEE_PHASE,
  OCELLUS_P3_DEFLECT_MELEE_VOID_PHASE,
  OCELLUS_P3_DEFLECT_RANGED_PHASE,
  OCELLUS_P3_DEFLECT_RANGED_VOID_PHASE,
  OCELLUS_P3_IDS,
  OCELLUS_P3_PHASES,
  OCELLUS_P3_SOUL_SPLIT_PHASE,
} from '@/lib/constants';
import { getFracturedArchiveDemonbaneVulnerability } from '@/lib/fracturedArchive/demonbane';
import { getFracturedArchiveDefenceFloor } from '@/lib/scaling/FracturedArchive';
import { DetailKey } from '@/lib/CalcDetails';
import { MonsterAttribute } from '@/enums/MonsterAttribute';
import { Prayer } from '@/enums/Prayer';
import Potion from '@/enums/Potion';
import { Monster } from '@/types/Monster';
import { Player } from '@/types/Player';
import { PartialDeep } from 'type-fest';

// Ocellus phases 1-3 (2026-10-22): https://oldschool.runescape.wiki/w/Ocellus,
// https://oldschool.runescape.wiki/w/The_Fractured_Archive/Strategies#Ocellus and
// https://oldschool.runescape.wiki/w/Demon_(attribute) ("Ocellus: 80% effectiveness").
// Model notes: docs/DATA_SOURCES.md (Ocellus, phase 6).
//
// Upstream maths used in the derivations below:
//   demonbane: percent = trunc(weaponPercent * effectiveness / 100); roll/max += trunc(value * percent / 100)
//   accuracy: atk > def ? 1 - (def + 2) / (2 * (atk + 1)) : atk / (2 * (def + 1))
//   an accurate 0 is raised to 1, so a uniform 0..max hit is worth acc * (max / 2 + 1 / (max + 1))
//
// Defence rolls (infobox): P1 def 215 / magic 350, P2 (The Blade) def 250 / magic 220, P3 def 250 / magic 300.
//   slash:  P1 (215 + 9) * (95 + 64) = 35616, P2 (250 + 9) * (120 + 64) = 47656, P3 (250 + 9) * (100 + 64) = 42476
//   magic:  P1 (350 + 9) * (100 + 64) = 58876, P2 (220 + 9) * (100 + 64) = 37556, P3 (300 + 9) * (200 + 64) = 81576
const P1_SLASH_DEF = 35616;
const P2_SLASH_DEF = 47656;
const P3_SLASH_DEF = 42476;

const ocellus = (version: string, inputs: PartialDeep<Monster['inputs']> = {}, id?: number) => scaleMonster(
  getTestMonster('Ocellus', version, { inputs, ...(id ? { id } : {}) }),
);
const p1 = (inputs: PartialDeep<Monster['inputs']> = {}) => ocellus('Phase 1', inputs);
const p2 = (inputs: PartialDeep<Monster['inputs']> = {}) => ocellus('Phase 2', inputs);
const p3 = (inputs: PartialDeep<Monster['inputs']> = {}) => ocellus('Phase 3', inputs);

const hitAcc = (atk: number, def: number) => (atk > def ? 1 - (def + 2) / (2 * (atk + 1)) : atk / (2 * (def + 1)));
const uniformHit = (acc: number, max: number) => acc * (max / 2 + 1 / (max + 1));

// 99 Attack/Strength, no other gear/prayers/boosts, Slash (aggressive slash): effective str 99 + 3 + 8 = 110,
// effective atk 99 + 8 = 107.
const swordPlayer = (m: Monster, weapon: string, version: string = '') => getTestPlayer(m, {
  equipment: { weapon: findEquipment(weapon, version) },
  style: { name: 'Slash', type: 'slash', stance: 'Aggressive' },
  skills: { atk: 99, str: 99 },
});

const rcbPlayer = (m: Monster) => getTestPlayer(m, {
  equipment: { weapon: findEquipment('Rune crossbow'), ammo: findEquipment('Runite bolts') },
  skills: { ranged: 99 },
});

// Same inputs as scripts/verifyOcellus.mjs. "Max Melee" preset (Torva, Infernal cape, Amulet of rancour, Rada's
// blessing 4, Avernic defender, Ferocious gloves, Avernic treads (max), Ultor ring) + Emberlight, 99s + Super combat
// (118 Attack/Strength), Piety, Slash (aggressive slash).
//   Strength bonus 8 + 8 + 12 + 6 + 8 + 4 + 14 + 6 + 12 + 13 = 91; slash bonus 4 + 25 + 29 + 16 + 5 + 70 = 149.
//   Effective str trunc(118 * 1.23) = 145 + 3 + 8 = 156 -> base max trunc((156 * 155 + 320) / 640) = 38.
//   Effective atk trunc(118 * 1.2) = 141 + 8 = 149 -> base roll 149 * 213 = 31737.
//   80% demon (P1, P3): percent trunc(70 * 80 / 100) = 56 -> max 38 + trunc(38 * 0.56) = 59,
//     roll 31737 + trunc(31737 * 0.56) = 31737 + 17772 = 49509. P2 (no demon attribute): 38 / 31737.
const maxMeleeEmberlight = (m: Monster): Player => getTestPlayer(m, {
  equipment: {
    head: findEquipmentById(26382),
    cape: findEquipmentById(21295),
    neck: findEquipmentById(29801),
    ammo: findEquipmentById(22947),
    body: findEquipmentById(26384),
    shield: findEquipmentById(22322),
    legs: findEquipmentById(26386),
    hands: findEquipmentById(22981),
    feet: findEquipmentById(31097),
    ring: findEquipmentById(28307),
    weapon: findEquipment('Emberlight'),
  },
  style: { name: 'Slash', type: 'slash', stance: 'Aggressive' },
  skills: { atk: 99, str: 99 },
  boosts: { atk: 19, str: 19 },
  prayers: [Prayer.PIETY],
  buffs: { potions: [Potion.SUPER_COMBAT] },
});

// "Max Mage" preset (Ancestral hat/top/bottom, Imbued saradomin cape, Occult necklace, Rada's blessing 4, Confliction
// gauntlets, Avernic treads (max), Magus ring) + Tumeken's shadow (charged, Accurate), 99 Magic + Saturated heart
// (4 + trunc(99 / 10) = +13 -> 112), Augury. Confliction gauntlets' effect doesn't apply to a two-handed weapon.
//   Magic attack 8 + 15 + 12 + 0 + 35 + 26 + 20 + 11 + 15 + 35 = 177, tripled by the shadow = 531.
//   Magic damage 3 + 2 + 5 + 0 + 3 + 3 + 7 + 2 + 2 = 27%, tripled = 81%; + Augury 4% = 85%.
//   Effective magic trunc(112 * 1.25) = 140 + 2 (Accurate) + 9 = 151 -> roll 151 * (531 + 64) = 89845.
//   Max trunc(112 / 3) + 1 = 38 -> 38 + trunc(38 * 850 / 1000) = 38 + 32 = 70. 5-tick staff -> 3.0 s per attack.
const maxMageShadow = (m: Monster): Player => getTestPlayer(m, {
  equipment: {
    head: findEquipmentById(21018),
    cape: findEquipmentById(21791),
    neck: findEquipmentById(12002),
    ammo: findEquipmentById(22947),
    body: findEquipmentById(21021),
    legs: findEquipmentById(21024),
    hands: findEquipmentById(31106),
    feet: findEquipmentById(31097),
    ring: findEquipmentById(28313),
    weapon: findEquipment("Tumeken's shadow", 'Charged'),
  },
  skills: { magic: 99 },
  boosts: { magic: 13 },
  prayers: [Prayer.AUGURY],
  buffs: { potions: [Potion.SATURATED_HEART] },
});
const SHADOW_ROLL = 89845;
const SHADOW_MAX = 70;

describe('Ocellus ids and data', () => {
  test('monsters.json versions use the listed ids; P1/P3 are demons, P2 (The Blade) is not', () => {
    expect(OCELLUS_P1_IDS).toContain(p1().id);
    expect(OCELLUS_P2_IDS).toContain(p2().id);
    expect(OCELLUS_P3_IDS).toContain(p3().id);
    expect(p1().attributes).toContain(MonsterAttribute.DEMON);
    expect(p3().attributes).toContain(MonsterAttribute.DEMON);
    expect(p2().attributes).toEqual([]);
  });

  test('phase options: P1 and P3 (both P1 ids), none for P2', () => {
    OCELLUS_P1_IDS.forEach((id) => expect(MONSTER_PHASES_BY_ID[id]).toEqual([
      'At a corner',
      'Walking to a corner (Protect from Melee)',
    ]));
    OCELLUS_P3_IDS.forEach((id) => expect(MONSTER_PHASES_BY_ID[id]).toEqual([
      'Quadrants 1-3',
      'Last quadrant: Deflect Melee',
      'Last quadrant: Deflect Melee + void explosions',
      'Last quadrant: Soul Split',
      'Last quadrant: Deflect Ranged',
      'Last quadrant: Deflect Ranged + void explosions',
    ]));
    OCELLUS_P2_IDS.forEach((id) => expect(MONSTER_PHASES_BY_ID[id]).toBeUndefined());
  });

  test('P2 hitpoints = P3 pool (unverified, TTK not meaningful)', () => {
    expect(p2().skills.hp).toBe(5250);
    expect(p2().skills.def).toBe(250);
  });
});

describe('demonbane effectiveness', () => {
  test('80% on every P1 and P3 id, none on P2', () => {
    [...OCELLUS_P1_IDS, ...OCELLUS_P3_IDS].forEach((id) => {
      expect(getFracturedArchiveDemonbaneVulnerability(getTestMonster('Ocellus', 'Phase 1', { id }))).toBe(80);
    });
    OCELLUS_P2_IDS.forEach((id) => {
      expect(getFracturedArchiveDemonbaneVulnerability(getTestMonster('Ocellus', 'Phase 2', { id }))).toBeUndefined();
    });
  });

  // Arclight (charged): slash +38, str +8. Base max trunc((110 * 72 + 320) / 640) = 12, base roll 107 * 102 = 10914.
  //   80%: percent trunc(70 * 80 / 100) = 56 -> max 12 + trunc(12 * 0.56) = 18, roll 10914 + 6111 = 17025.
  //   P2: no demon attribute -> no bonus at all, 12 / 10914. 4-tick weapon -> 2.4 s per attack.
  test.each([
    ['P1', p1, 18, 17025, P1_SLASH_DEF],
    ['P1 (id 16674)', () => ocellus('Phase 1', {}, 16674), 18, 17025, P1_SLASH_DEF],
    ['P2', p2, 12, 10914, P2_SLASH_DEF],
    ['P3', p3, 18, 17025, P3_SLASH_DEF],
  ])('Arclight on %s', (_, monster, maxHit, attackRoll, defRoll) => {
    const m = monster();
    const r = calculatePlayerVsNpc(m, swordPlayer(m, 'Arclight', 'Charged'));
    expect(r.maxHit).toBe(maxHit);
    expect(r.maxAttackRoll).toBe(attackRoll);
    expect(r.npcDefRoll).toBe(defRoll);
    expect(r.dps).toBeCloseTo(uniformHit(hitAcc(attackRoll, defRoll), maxHit) / 2.4, 10);
  });

  // Emberlight: slash +70, str +13. Base max trunc((110 * 77 + 320) / 640) = 13, base roll 107 * 134 = 14338.
  //   80%: max 13 + trunc(13 * 0.56) = 20, roll 14338 + trunc(14338 * 0.56) = 14338 + 8029 = 22367. P2: 13 / 14338.
  test.each([
    ['P1', p1, 20, 22367, P1_SLASH_DEF, '70 * 80 / 100 = 56'],
    ['P2', p2, 13, 14338, P2_SLASH_DEF, undefined],
    ['P3', p3, 20, 22367, P3_SLASH_DEF, '70 * 80 / 100 = 56'],
  ])('Emberlight on %s', (_, monster, maxHit, attackRoll, defRoll, factor) => {
    const m = monster();
    const r = calculatePlayerVsNpc(m, swordPlayer(m, 'Emberlight'));
    expect(r.maxHit).toBe(maxHit);
    expect(r.maxAttackRoll).toBe(attackRoll);
    expect(r.npcDefRoll).toBe(defRoll);
    expect(findResult(r.details, DetailKey.PLAYER_DEMONBANE_FACTOR)).toBe(factor === undefined ? undefined : 56);
    expect(r.dps).toBeCloseTo(uniformHit(hitAcc(attackRoll, defRoll), maxHit) / 2.4, 10);
  });
});

describe('defence floors through drains', () => {
  // P2 floor 0 verified: https://secure.runescape.com/m=news/the-fractured-archive---out-today?oldschool=1 "no cap on
  // their Defence Reduction, meaning their Defence can be reduced to 0: ... The Blade (Ocellus P2)"
  test('floor table: P1 129, P2 0 (verified, news post), P3 150', () => {
    expect(getFracturedArchiveDefenceFloor(p1())).toBe(129);
    expect(getFracturedArchiveDefenceFloor(p2())).toBe(0);
    expect(getFracturedArchiveDefenceFloor(p3())).toBe(150);
  });

  test('P1 stops at 129', () => {
    expect(p1({ defenceReductions: { dwh: 1 } }).skills.def).toBe(151); // 215 - trunc(215 * 0.3)
    expect(p1({ defenceReductions: { dwh: 10 } }).skills.def).toBe(129);
    expect(p1({ defenceReductions: { bgs: 5000 } }).skills.def).toBe(129);
    // Arclight vs 129 Defence: slash def roll (129 + 9) * 159 = 21942
    const m = p1({ defenceReductions: { dwh: 10, bgs: 5000 } });
    const r = calculatePlayerVsNpc(m, swordPlayer(m, 'Arclight', 'Charged'));
    expect(r.npcDefRoll).toBe(21942);
    expect(r.dps).toBeCloseTo(uniformHit(17025 / (2 * 21943), 18) / 2.4, 10);
  });

  test('P2 (The Blade) drains to 0', () => {
    expect(p2({ defenceReductions: { dwh: 1 } }).skills.def).toBe(175); // 250 - trunc(250 * 0.3)
    expect(p2({ defenceReductions: { bgs: 5000 } }).skills.def).toBe(0);
    // Arclight vs 0 Defence: slash def roll 9 * 184 = 1656
    const m = p2({ defenceReductions: { bgs: 5000 } });
    const r = calculatePlayerVsNpc(m, swordPlayer(m, 'Arclight', 'Charged'));
    expect(r.npcDefRoll).toBe(1656);
    expect(r.dps).toBeCloseTo(uniformHit(hitAcc(10914, 1656), 12) / 2.4, 10);
  });

  test('P3 stops at 150, in every phase option', () => {
    expect(p3({ defenceReductions: { dwh: 1 } }).skills.def).toBe(175);
    OCELLUS_P3_PHASES.forEach((phase) => {
      expect(p3({ phase, defenceReductions: { dwh: 10 } }).skills.def).toBe(150);
      expect(p3({ phase, defenceReductions: { bgs: 5000 } }).skills.def).toBe(150);
    });
    // Arclight vs 150 Defence: slash def roll (150 + 9) * 164 = 26076
    const m = p3({ defenceReductions: { dwh: 10, bgs: 5000 } });
    const r = calculatePlayerVsNpc(m, swordPlayer(m, 'Arclight', 'Charged'));
    expect(r.npcDefRoll).toBe(26076);
    expect(r.dps).toBeCloseTo(uniformHit(17025 / (2 * 26077), 18) / 2.4, 10);
  });
});

describe('phase options', () => {
  const dps = (m: Monster, player: (_: Monster) => Player) => calculatePlayerVsNpc(m, player(m)).dps;
  const meleeDps = (m: Monster) => dps(m, (x) => swordPlayer(x, 'Emberlight'));

  test('P1 walking to a corner: Protect from Melee blocks melee only', () => {
    const [corner, walking] = OCELLUS_P1_PHASES;
    expect(meleeDps(p1({ phase: corner }))).toBeGreaterThan(0);
    expect(meleeDps(p1({ phase: corner }))).toBe(meleeDps(p1()));
    expect(meleeDps(p1({ phase: walking }))).toBe(0);
    const walkingMonster = p1({ phase: walking });
    const blockedIssues = new PlayerVsNPCCalc(swordPlayer(walkingMonster, 'Emberlight'), walkingMonster).userIssues;
    expect(blockedIssues.map((i) => i.message)).toContain('Ocellus is praying against this combat style.');
    const cornerIssues = new PlayerVsNPCCalc(swordPlayer(p1(), 'Emberlight'), p1()).userIssues;
    expect(cornerIssues.map((i) => i.message)).not.toContain('Ocellus is praying against this combat style.');
    expect(meleeDps(ocellus('Phase 1', { phase: OCELLUS_P1_WALKING_PHASE }, 16674))).toBe(0);
    expect(dps(p1({ phase: walking }), rcbPlayer)).toBe(dps(p1(), rcbPlayer));
    expect(dps(p1({ phase: walking }), maxMageShadow)).toBe(dps(p1(), maxMageShadow));
  });

  test('P3 Soul Split = quadrants = no phase selected', () => {
    [meleeDps, (m: Monster) => dps(m, rcbPlayer), (m: Monster) => dps(m, maxMageShadow)].forEach((f) => {
      expect(f(p3({ phase: OCELLUS_P3_SOUL_SPLIT_PHASE }))).toBe(f(p3()));
      expect(f(p3({ phase: OCELLUS_P3_PHASES[0] }))).toBe(f(p3()));
      expect(f(p3())).toBeGreaterThan(0);
    });
  });

  test.each([
    [OCELLUS_P3_DEFLECT_MELEE_PHASE, 'melee'],
    [OCELLUS_P3_DEFLECT_MELEE_VOID_PHASE, 'melee'],
    [OCELLUS_P3_DEFLECT_RANGED_PHASE, 'ranged'],
    [OCELLUS_P3_DEFLECT_RANGED_VOID_PHASE, 'ranged'],
  ])('%s blocks %s', (phase, blocked) => {
    const m = p3({ phase });
    expect(meleeDps(m) === 0).toBe(blocked === 'melee');
    expect(dps(m, rcbPlayer) === 0).toBe(blocked === 'ranged');
    expect(dps(m, maxMageShadow)).toBeGreaterThan(0);
  });

  test('deflect without void explosions leaves the other styles unchanged', () => {
    expect(meleeDps(p3({ phase: OCELLUS_P3_DEFLECT_RANGED_PHASE }))).toBe(meleeDps(p3()));
    expect(dps(p3({ phase: OCELLUS_P3_DEFLECT_MELEE_PHASE }), rcbPlayer)).toBe(dps(p3(), rcbPlayer));
    expect(dps(p3({ phase: OCELLUS_P3_DEFLECT_MELEE_PHASE }), maxMageShadow)).toBe(dps(p3(), maxMageShadow));
  });

  test.each([OCELLUS_P3_DEFLECT_MELEE_VOID_PHASE, OCELLUS_P3_DEFLECT_RANGED_VOID_PHASE])(
    '%s: every hit halved (rounded down)',
    (phase) => {
      // Shadow vs P3: roll 89845, magic def roll 81576, max 70; each roll d = 0..70 (accurate 0 -> 1) becomes
      // trunc(d / 2): sum = 0 + 0 + (1 + 1) + ... + (34 + 34) + 35 = 2 * 595 + 35 = 1225.
      // Phase 40d: every attack is 2-tick in the explosions (the user; was the Shadow's 5 ticks = 3 s): 1.2 s.
      const m = p3({ phase });
      const r = calculatePlayerVsNpc(m, maxMageShadow(m));
      expect(r.maxHit).toBe(35);
      expect(r.dps).toBeCloseTo((hitAcc(SHADOW_ROLL, 81576) * 1225) / 71 / 1.2, 10);
    },
  );

  test('phase inputs do nothing on P2', () => {
    [OCELLUS_P1_WALKING_PHASE, OCELLUS_P3_DEFLECT_MELEE_VOID_PHASE].forEach((phase) => {
      expect(meleeDps(p2({ phase }))).toBe(meleeDps(p2()));
      expect(dps(p2({ phase }), maxMageShadow)).toBe(dps(p2(), maxMageShadow));
    });
  });
});

describe('real loadout sanity check / UI parity (scripts/verifyOcellus.mjs)', () => {
  test.each([
    ['P1', p1, 59, 49509, P1_SLASH_DEF, 7.875],
    ['P2', p2, 38, 31737, P2_SLASH_DEF, 2.640],
    ['P3', p3, 59, 49509, P3_SLASH_DEF, 7.023],
  ])('Max Melee + Emberlight on %s', (_, monster, maxHit, attackRoll, defRoll, roundedDps) => {
    const m = monster();
    const r = calculatePlayerVsNpc(m, maxMeleeEmberlight(m));
    expect(r.maxHit).toBe(maxHit);
    expect(r.maxAttackRoll).toBe(attackRoll);
    expect(r.npcDefRoll).toBe(defRoll);
    expect(r.dps).toBeCloseTo(uniformHit(hitAcc(attackRoll, defRoll), maxHit) / 2.4, 10);
    expect(r.dps).toBeCloseTo(roundedDps, 3);
  });

  test.each([
    ['P1', p1, 58876, 7.847],
    ['P2', p2, 37556, 9.232],
    ['P3', p3, 81576, 6.373],
  ])('Max Mage + Tumeken\'s shadow on %s', (_, monster, defRoll, roundedDps) => {
    const m = monster();
    const r = calculatePlayerVsNpc(m, maxMageShadow(m));
    expect(r.maxHit).toBe(SHADOW_MAX);
    expect(r.maxAttackRoll).toBe(SHADOW_ROLL);
    expect(r.npcDefRoll).toBe(defRoll);
    expect(r.dps).toBeCloseTo(uniformHit(hitAcc(SHADOW_ROLL, defRoll), SHADOW_MAX) / 3, 10);
    expect(r.dps).toBeCloseTo(roundedDps, 3);
  });
});
