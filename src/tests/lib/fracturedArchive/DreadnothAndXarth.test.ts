import { describe, expect, test } from '@jest/globals';
import {
  calculatePlayerVsNpc,
  findEquipment,
  findEquipmentById,
  findResult,
  findSpell,
  getTestMonster,
  getTestPlayer,
} from '@/tests/utils/TestUtils';
import { scaleMonster } from '@/lib/MonsterScaling';
import { MONSTER_PHASES_BY_ID, TD_IDS } from '@/lib/constants';
import { getFracturedArchiveDemonbaneVulnerability } from '@/lib/fracturedArchive/demonbane';
import { DetailKey } from '@/lib/CalcDetails';
import { MonsterAttribute } from '@/enums/MonsterAttribute';
import { Prayer } from '@/enums/Prayer';
import Potion from '@/enums/Potion';
import { Monster } from '@/types/Monster';
import { Player } from '@/types/Player';
import { PartialDeep } from 'type-fest';

// Dreadnoth the Jellied, Jelly (Dreadnoth) and Xarth (2026-10-22):
// https://oldschool.runescape.wiki/w/Dreadnoth_the_Jellied, https://oldschool.runescape.wiki/w/Jelly_(Dreadnoth),
// https://oldschool.runescape.wiki/w/Xarth, https://oldschool.runescape.wiki/w/The_Fractured_Archive/Strategies and
// https://oldschool.runescape.wiki/w/Demon_(attribute) (demonbane effectiveness: Dreadnoth 25%, Xarth 80%).
// Model notes: docs/DATA_SOURCES.md (phase 5).
//
// Upstream maths used in the derivations below:
//   demonbane: percent = trunc(weaponPercent * effectiveness / 100); roll/max += trunc(value * percent / 100)
//   accuracy: atk > def ? 1 - (def + 2) / (2 * (atk + 1)) : atk / (2 * (def + 1))
//   an accurate 0 is raised to 1, so a uniform 0..max hit is worth acc * (max / 2 + 1 / (max + 1))
const DREADNOTH = 16665;
const JELLY = 16666;
const XARTH = 16684;

const dreadnoth = (inputs: PartialDeep<Monster['inputs']> = {}) => scaleMonster(
  getTestMonster('Dreadnoth the Jellied', '', { inputs }),
);
const xarth = (inputs: PartialDeep<Monster['inputs']> = {}) => scaleMonster(getTestMonster('Xarth', '', { inputs }));
const jelly = () => scaleMonster(getTestMonster('Jelly (Dreadnoth)'));

const hitAcc = (atk: number, def: number) => (atk > def ? 1 - (def + 2) / (2 * (atk + 1)) : atk / (2 * (def + 1)));
const uniformHit = (acc: number, max: number) => acc * (max / 2 + 1 / (max + 1));

// 99 Attack/Strength, no other gear/prayers/boosts, Slash (aggressive slash): effective str 99 + 3 + 8 = 110,
// effective atk 99 + 8 = 107.
const swordPlayer = (m: Monster, weapon: string, version: string = '') => getTestPlayer(m, {
  equipment: { weapon: findEquipment(weapon, version) },
  style: { name: 'Slash', type: 'slash', stance: 'Aggressive' },
  skills: { atk: 99, str: 99 },
});

// Scorching bow + Dragon arrows, Accurate, 99 Ranged: effective ranged 99 + 3 + 8 = 110.
const bowPlayer = (m: Monster) => getTestPlayer(m, {
  equipment: { weapon: findEquipment('Scorching bow'), ammo: findEquipment('Dragon arrow', 'Unpoisoned') },
  style: { name: 'Accurate', type: 'ranged', stance: 'Accurate' },
  skills: { ranged: 99 },
});

// Purging staff + Dark Demonbane (base max 30) with Mark of Darkness, 99 Magic, autocast.
const purgingPlayer = (m: Monster) => getTestPlayer(m, {
  equipment: { weapon: findEquipment('Purging staff') },
  style: { name: 'Autocast', type: 'magic', stance: 'Autocast' },
  spell: findSpell('Dark Demonbane'),
  buffs: { markOfDarknessSpell: true },
  skills: { magic: 99 },
});

// no weapon, 99 Magic: magic attack roll (99 + 9) * (0 + 64) = 6912
const spellPlayer = (m: Monster, spell: string) => getTestPlayer(m, {
  style: { name: 'Autocast', type: 'magic', stance: 'Autocast' },
  spell: findSpell(spell),
  skills: { magic: 99 },
});

describe('demonbane effectiveness table', () => {
  test('Dreadnoth 25%, Xarth 80%, Jelly not listed (100%)', () => {
    expect(getFracturedArchiveDemonbaneVulnerability(dreadnoth())).toBe(25);
    expect(getFracturedArchiveDemonbaneVulnerability(xarth())).toBe(80);
    expect(getFracturedArchiveDemonbaneVulnerability(jelly())).toBeUndefined();
    expect(getFracturedArchiveDemonbaneVulnerability(getTestMonster('Abyssal demon'))).toBeUndefined();
  });

  test('all three are demons (ids per the wiki infoboxes)', () => {
    expect([dreadnoth().id, jelly().id, xarth().id]).toEqual([DREADNOTH, JELLY, XARTH]);
    [dreadnoth(), xarth(), jelly()].forEach((m) => expect(m.attributes).toContain(MonsterAttribute.DEMON));
  });
});

describe('Arclight (charged): +70% scaled by effectiveness', () => {
  // Arclight: slash +38, str +8. Base max trunc((110 * 72 + 320) / 640) = 12, base roll 107 * (38 + 64) = 10914.
  //   Dreadnoth 25%: percent trunc(70 * 25 / 100) = 17 -> max 12 + trunc(12 * 0.17) = 14, roll 10914 + 1855 = 12769
  //   Xarth 80%:     percent 56                       -> max 12 + trunc(12 * 0.56) = 18, roll 10914 + 6111 = 17025
  //   Jelly 100%:    percent 70                       -> max 12 + trunc(12 * 0.70) = 20, roll 10914 + 7639 = 18553
  // Slash defence rolls: Dreadnoth (125 + 9) * (20 + 64) = 11256, Xarth (170 + 9) * (105 + 64) = 30251.
  // 4-tick weapon -> 2.4 s per attack.
  test('Dreadnoth', () => {
    const m = dreadnoth();
    const r = calculatePlayerVsNpc(m, swordPlayer(m, 'Arclight', 'Charged'));
    expect(r.maxHit).toBe(14);
    expect(r.maxAttackRoll).toBe(12769);
    expect(r.npcDefRoll).toBe(11256);
    expect(findResult(r.details, DetailKey.PLAYER_DEMONBANE_FACTOR)).toBe(17);
    expect(r.dps).toBeCloseTo(uniformHit(hitAcc(12769, 11256), 14) / 2.4, 10);
  });

  test('Xarth', () => {
    const m = xarth();
    const r = calculatePlayerVsNpc(m, swordPlayer(m, 'Arclight', 'Charged'));
    expect(r.maxHit).toBe(18);
    expect(r.maxAttackRoll).toBe(17025);
    expect(r.npcDefRoll).toBe(30251);
    expect(r.dps).toBeCloseTo(uniformHit(17025 / (2 * 30252), 18) / 2.4, 10);
  });

  test('Jelly keeps the full bonus', () => {
    const m = jelly();
    const r = calculatePlayerVsNpc(m, swordPlayer(m, 'Arclight', 'Charged'));
    expect(r.maxHit).toBe(20);
    expect(r.maxAttackRoll).toBe(18553);
  });
});

describe('Emberlight: +70% scaled by effectiveness', () => {
  // Emberlight: slash +70, str +13. Base max trunc((110 * 77 + 320) / 640) = 13, base roll 107 * 134 = 14338.
  //   Dreadnoth: max 13 + trunc(13 * 0.17) = 15, roll 14338 + trunc(14338 * 0.17) = 14338 + 2437 = 16775
  //   Xarth:     max 13 + trunc(13 * 0.56) = 20, roll 14338 + trunc(14338 * 0.56) = 14338 + 8029 = 22367
  test.each([
    ['Dreadnoth', dreadnoth, 15, 16775, 11256],
    ['Xarth', xarth, 20, 22367, 30251],
  ])('%s', (_, monster, maxHit, attackRoll, defRoll) => {
    const m = monster();
    const r = calculatePlayerVsNpc(m, swordPlayer(m, 'Emberlight'));
    expect(r.maxHit).toBe(maxHit);
    expect(r.maxAttackRoll).toBe(attackRoll);
    expect(r.npcDefRoll).toBe(defRoll);
    expect(r.dps).toBeCloseTo(uniformHit(hitAcc(attackRoll, defRoll), maxHit) / 2.4, 10);
  });
});

describe('Scorching bow: +30% scaled by effectiveness', () => {
  // Scorching bow ranged +124, str +40; Dragon arrows str +60.
  // Base max trunc((110 * (40 + 60 + 64) + 320) / 640) = trunc(18360 / 640) = 28, base roll 110 * (124 + 64) = 20680.
  //   Dreadnoth: percent trunc(30 * 25 / 100) = 7  -> max 28 + trunc(28 * 0.07) = 29, roll 20680 + 1447 = 22127
  //   Xarth:     percent trunc(30 * 80 / 100) = 24 -> max 28 + trunc(28 * 0.24) = 34, roll 20680 + 4963 = 25643
  // Standard ranged defence rolls: Dreadnoth 134 * (80 + 64) = 19296, Xarth 179 * (230 + 64) = 52626.
  // 5-tick bow on Accurate -> 3.0 s per attack.
  test.each([
    ['Dreadnoth', dreadnoth, 29, 22127, 19296],
    ['Xarth', xarth, 34, 25643, 52626],
  ])('%s', (_, monster, maxHit, attackRoll, defRoll) => {
    const m = monster();
    const r = calculatePlayerVsNpc(m, bowPlayer(m));
    expect(r.maxHit).toBe(maxHit);
    expect(r.maxAttackRoll).toBe(attackRoll);
    expect(r.npcDefRoll).toBe(defRoll);
    expect(r.dps).toBeCloseTo(uniformHit(hitAcc(attackRoll, defRoll), maxHit) / 3, 10);
  });
});

describe('Purging staff + Dark Demonbane + Mark of Darkness', () => {
  // Accuracy bonus: Mark of Darkness 40%, doubled by the purging staff = 80% ->
  //   Dreadnoth trunc(80 * 25 / 100) = 20%, Xarth trunc(80 * 80 / 100) = 64%.
  //   Base roll (99 + 9) * (37 + 64) = 10908 -> Dreadnoth 10908 + 2181 = 13089, Xarth 10908 + 6981 = 17889.
  // Damage: base 30, staff +10% magic damage -> trunc(30 * 1.1) = 33; Mark of Darkness with the purging staff adds
  //   trunc(trunc(hit * 50 / 100) * effectiveness / 100) per hit: max 33 + trunc(16 * 0.25) = 37 (Dreadnoth),
  //   33 + trunc(16 * 0.8) = 45 (Xarth); a 100% demon would get 33 + 16 = 49.
  // Magic defence rolls: Dreadnoth (220 + 9) * (20 + 64) = 19236, Xarth (350 + 9) * (205 + 64) = 96571.
  test.each([
    ['Dreadnoth', dreadnoth, 37, 13089, 19236, 25],
    ['Xarth', xarth, 45, 17889, 96571, 80],
  ])('%s', (_, monster, maxHit, attackRoll, defRoll, effectiveness) => {
    const m = monster();
    const r = calculatePlayerVsNpc(m, purgingPlayer(m));
    expect(r.maxHit).toBe(maxHit);
    expect(r.maxAttackRoll).toBe(attackRoll);
    expect(r.npcDefRoll).toBe(defRoll);
    // expected hit: each roll d = 0..33 (accurate 0 -> 1) becomes d + trunc(trunc(d / 2) * effectiveness / 100);
    // 5-tick staff -> 3.0 s per attack
    let sum = 0;
    for (let d = 0; d <= 33; d++) {
      const hit = Math.max(d, 1);
      sum += hit + Math.trunc(Math.trunc(hit * 50 / 100) * effectiveness / 100);
    }
    expect(r.dps).toBeCloseTo((hitAcc(attackRoll, defRoll) * sum) / 34 / 3, 10);
  });
});

describe('elemental weakness', () => {
  // base max: Fire Surge and Water Surge 24; weakness adds trunc(24 * 85 / 100) = 20 to the max hit and
  // trunc(6912 * 85 / 100) = 5875 to the attack roll (6912 -> 12787)
  test('fire spell on Dreadnoth reflects 85%', () => {
    const m = dreadnoth();
    const r = calculatePlayerVsNpc(m, spellPlayer(m, 'Fire Surge'));
    expect(r.maxHit).toBe(44); // 24 + 20
    expect(r.maxAttackRoll).toBe(12787);
    const w = calculatePlayerVsNpc(m, spellPlayer(m, 'Water Surge'));
    expect(w.maxHit).toBe(24);
    expect(w.maxAttackRoll).toBe(6912);
  });

  test('water spell on Xarth reflects 85%', () => {
    const m = xarth();
    const r = calculatePlayerVsNpc(m, spellPlayer(m, 'Water Surge'));
    expect(r.maxHit).toBe(44); // 24 + 20
    expect(r.maxAttackRoll).toBe(12787);
    const f = calculatePlayerVsNpc(m, spellPlayer(m, 'Fire Surge'));
    expect(f.maxHit).toBe(24);
    expect(f.maxAttackRoll).toBe(6912);
  });

  test('fire spell on the Jelly reflects 60%', () => {
    const m = jelly();
    const r = calculatePlayerVsNpc(m, spellPlayer(m, 'Fire Surge'));
    expect(r.maxHit).toBe(38); // 24 + trunc(24 * 0.6)
    expect(r.maxAttackRoll).toBe(11059); // 6912 + trunc(6912 * 0.6)
  });
});

describe('Xarth is not a Tormented Demon (no shield)', () => {
  test('no TD ids, phases or name', () => {
    expect(TD_IDS).not.toContain(XARTH);
    expect(MONSTER_PHASES_BY_ID[XARTH]).toBeUndefined();
    expect(xarth().name).toBe('Xarth');
  });

  test('non-demonbane melee is not reduced by the TD 20% shield and has normal accuracy', () => {
    // Abyssal whip, Flick (accurate), 99s: max trunc((107 * 146 + 320) / 640) = 24, roll 110 * 146 = 16060.
    // Xarth slash defence roll 30251. A shielded TD would multiply each hit by 4/5.
    const m = xarth();
    const r = calculatePlayerVsNpc(m, getTestPlayer(m, {
      equipment: { weapon: findEquipment('Abyssal whip') },
      style: { name: 'Flick', type: 'slash', stance: 'Accurate' },
      skills: { atk: 99, str: 99 },
    }));
    expect(r.maxHit).toBe(24);
    expect(r.accuracy).toBeCloseTo(16060 / (2 * 30252), 10);
    expect(findResult(r.details, DetailKey.PLAYER_ACCURACY_TD)).toBeUndefined();
    expect(r.dps).toBeCloseTo(uniformHit(16060 / (2 * 30252), 24) / 2.4, 10);
  });

  test('a phase input (e.g. a stale TD "Unshielded") changes nothing', () => {
    const m = xarth();
    const shieldless = xarth({ phase: 'Unshielded' });
    const p = swordPlayer(m, 'Arclight', 'Charged');
    expect(calculatePlayerVsNpc(shieldless, p).dps).toBe(calculatePlayerVsNpc(m, p).dps);
  });
});

describe('defence floors through drains', () => {
  test('Dreadnoth drains to 0', () => {
    expect(dreadnoth({ defenceReductions: { dwh: 1 } }).skills.def).toBe(88); // 125 - trunc(125 * 0.3)
    expect(dreadnoth({ defenceReductions: { bgs: 5000 } }).skills.def).toBe(0);
    // Arclight vs 0 Defence: def roll 9 * 84 = 756
    const m = dreadnoth({ defenceReductions: { bgs: 5000 } });
    const r = calculatePlayerVsNpc(m, swordPlayer(m, 'Arclight', 'Charged'));
    expect(r.npcDefRoll).toBe(756);
    expect(r.dps).toBeCloseTo(uniformHit(hitAcc(12769, 756), 14) / 2.4, 10);
  });

  test('Xarth stops at 102', () => {
    expect(xarth({ defenceReductions: { dwh: 1 } }).skills.def).toBe(119); // 170 - trunc(170 * 0.3)
    expect(xarth({ defenceReductions: { dwh: 10 } }).skills.def).toBe(102);
    expect(xarth({ defenceReductions: { bgs: 5000 } }).skills.def).toBe(102);
    // Arclight vs 102 Defence: def roll (102 + 9) * 169 = 18759
    const m = xarth({ defenceReductions: { dwh: 10, bgs: 5000 } });
    const r = calculatePlayerVsNpc(m, swordPlayer(m, 'Arclight', 'Charged'));
    expect(r.npcDefRoll).toBe(18759);
    expect(r.dps).toBeCloseTo(uniformHit(17025 / (2 * 18760), 18) / 2.4, 10);
  });
});

describe('real loadout sanity check / UI parity (scripts/verifyDreadnothAndXarth.mjs)', () => {
  // Same inputs as the Playwright check: "Max Melee" preset (Torva, Infernal cape, Amulet of rancour, Rada's blessing 4,
  // Avernic defender, Ferocious gloves, Avernic treads (max), Ultor ring) + Emberlight, 99s + Super combat (118
  // Attack/Strength), Piety, Slash (aggressive slash).
  //   Strength bonus 8 + 8 + 12 + 6 + 8 + 4 + 14 + 6 + 12 + 13 = 91; slash bonus 4 + 25 + 29 + 16 + 5 + 70 = 149.
  //   Effective str trunc(118 * 1.23) = 145 + 3 + 8 = 156 -> base max trunc((156 * 155 + 320) / 640) = 38.
  //   Effective atk trunc(118 * 1.2) = 141 + 8 = 149 -> base roll 149 * 213 = 31737.
  //   Dreadnoth: max 38 + trunc(38 * 0.17) = 44, roll 31737 + trunc(31737 * 0.17) = 31737 + 5395 = 37132.
  //   Xarth:     max 38 + trunc(38 * 0.56) = 59, roll 31737 + trunc(31737 * 0.56) = 31737 + 17772 = 49509.
  //   Jelly:     max 38 + trunc(38 * 0.70) = 64, roll 31737 + 22215 = 53952; slash def roll (100 + 9) * (5 + 64) = 7521.
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

  const cases: [string, () => Monster, number, number, number, number][] = [
    ['Dreadnoth', dreadnoth, 44, 37132, 11256, 7.785],
    ['Xarth', xarth, 59, 49509, 30251, 8.541],
    ['Jelly', jelly, 64, 53952, 7521, 12.410],
  ];
  test.each(cases)('%s', (_, monster, maxHit, attackRoll, defRoll, roundedDps) => {
    const m = monster();
    const r = calculatePlayerVsNpc(m, maxMeleeEmberlight(m));
    expect(r.maxHit).toBe(maxHit);
    expect(r.maxAttackRoll).toBe(attackRoll);
    expect(r.npcDefRoll).toBe(defRoll);
    expect(r.dps).toBeCloseTo(uniformHit(hitAcc(attackRoll, defRoll), maxHit) / 2.4, 10);
    expect(r.dps).toBeCloseTo(roundedDps, 3);
  });
});
