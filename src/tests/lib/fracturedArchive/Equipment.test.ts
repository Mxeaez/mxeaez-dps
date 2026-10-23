import { describe, expect, test } from '@jest/globals';
import {
  calculatePlayerVsNpc,
  findEquipment,
  findSpell,
  getTestMonster,
  getTestPlayer,
} from '@/tests/utils/TestUtils';
import { Prayer } from '@/enums/Prayer';
import { EquipmentCategory } from '@/enums/EquipmentCategory';
import { FeatureStatus, getCombatStylesForCategory } from '@/utils';
import {
  ammoApplicability,
  AmmoApplicability,
  calculateAttackSpeed,
  calculateEquipmentBonusesFromGear,
  WEAPON_SPEC_COSTS,
} from '@/lib/Equipment';
import {
  bestOfRollsHitDistribution,
  getObligatorDamageRolls,
  getObligatorSizeBonusPercent,
} from '@/lib/fracturedArchive/equipment';
import PlayerVsNPCCalc from '@/lib/PlayerVsNPCCalc';
import { Monster } from '@/types/Monster';
import { Player } from '@/types/Player';
import { PartialDeep } from 'type-fest';

// Phase 7b: Fractured Archive rewards. Item stats and effects from the wiki item pages (2026-10-22), see
// docs/DATA_SOURCES.md ("Equipment"). Logic: src/lib/fracturedArchive/equipment.ts. All players below have 99 in
// every skill, no boosts, and only the listed gear, so the rolls can be derived by hand.

const THRUST_AGGRESSIVE = { name: 'Thrust', type: 'crush', stance: 'Aggressive' } as const;
const SMASH = { name: 'Smash', type: 'crush', stance: 'Aggressive' } as const;

const player = (monster: Monster, overrides: PartialDeep<Player>) => getTestPlayer(monster, overrides);

type StatRow = [string, string, string, boolean, number, string, number[], number[]];

describe('generated item data matches the wiki infoboxes', () => {
  test.each<StatRow>([
    // name, version, slot, 2h, speed, category, [stab, slash, crush, magic, ranged], [str, rstr, mdmg x10, prayer]
    ['Obligator', 'Charged', 'weapon', true, 5, 'Extending Chain Mace', [22, -8, 120, 0, 0], [40, 0, 0, 3]],
    ['Obligator', 'Uncharged', 'weapon', true, 5, 'Extending Chain Mace', [22, -8, 120, 0, 0], [40, 0, 0, 3]],
    ["Zorya's tome", 'Charged', 'weapon', true, 3, 'Powered Staff', [0, 0, 0, 45, 0], [0, 0, 150, 2]],
    ["Zorya's tome", 'Uncharged', 'weapon', true, 3, 'Powered Staff', [0, 0, 0, 45, 0], [0, 0, 150, 2]],
    ['Ascension crossbows', '', 'weapon', true, 3, 'Crossbow', [0, 0, 0, 3, 34], [0, 0, 0, 0]],
    ['Ascension bolts', '', 'ammo', false, 0, '', [0, 0, 0, 0, 0], [0, 53, 0, 0]],
    ['Diamond ascension bolts (e)', '', 'ammo', false, 0, '', [0, 0, 0, 0, 0], [0, 58, 0, 0]],
    ['Onyx ascension bolts (e)', '', 'ammo', false, 0, '', [0, 0, 0, 0, 0], [0, 58, 0, 0]],
    ['Rondache', '', 'shield', false, 0, 'Unarmed', [0, 0, 0, -5, -8], [8, 0, 0, 0]],
  ])('%s %s', (name, version, slot, twoHanded, speed, category, off, bonuses) => {
    const e = findEquipment(name, version);
    expect(e.slot).toBe(slot);
    expect(e.isTwoHanded).toBe(twoHanded);
    expect(e.speed).toBe(speed);
    expect(e.category).toBe(category);
    expect([e.offensive.stab, e.offensive.slash, e.offensive.crush, e.offensive.magic, e.offensive.ranged]).toEqual(off);
    expect([e.bonuses.str, e.bonuses.ranged_str, e.bonuses.magic_str, e.bonuses.prayer]).toEqual(bonuses);
  });

  test('Rondache defensive bonuses', () => {
    expect(findEquipment('Rondache').defensive).toEqual({
      stab: 35, slash: 41, crush: 38, magic: -6, ranged: 55,
    });
  });

  test('names renamed on the wiki are the ones the calc checks for', () => {
    // the 2026-10 regeneration capitalised these page names; BaseCalc / PlayerVsNPCCalc were updated to match
    ['Blood Moon helm', 'Blood Moon chestplate', 'Blood Moon tassets', 'Blue Moon spear', 'Eclipse Moon helm',
      'Toxic Staff of the Dead', 'Staff of the Dead'].forEach((n) => expect(findEquipment(n).name).toBe(n));
  });

  test('Blood Moon set effect still applies after the rename', () => {
    const monster = getTestMonster('Xarth');
    const p = player(monster, {
      equipment: {
        weapon: findEquipment('Dual macuahuitl'),
        head: findEquipment('Blood Moon helm', 'New'),
        body: findEquipment('Blood Moon chestplate', 'New'),
        legs: findEquipment('Blood Moon tassets', 'New'),
      },
    });
    const calc = new PlayerVsNPCCalc(p, monster, { loadoutName: 'test' });
    // the set's extra-attack proc lowers the expected attack interval below the weapon's 4 ticks
    expect(calc.getExpectedAttackSpeed()).toBeLessThan(calc.getAttackSpeed());
  });
});

describe('Obligator', () => {
  test('combat styles and attack speed (thrust 5 ticks, smash 3)', () => {
    expect(getCombatStylesForCategory(EquipmentCategory.EXTENDING_CHAIN_MACE)).toEqual([
      { name: 'Thrust', type: 'crush', stance: 'Accurate' },
      { name: 'Thrust', type: 'crush', stance: 'Aggressive' },
      { name: 'Smash', type: 'crush', stance: 'Aggressive' },
      { name: 'Spell', type: 'magic', stance: 'Manual Cast' },
    ]);
    const monster = getTestMonster('Xarth');
    const weapon = findEquipment('Obligator', 'Charged');
    expect(calculateAttackSpeed(player(monster, { equipment: { weapon }, style: THRUST_AGGRESSIVE }), monster)).toBe(5);
    expect(calculateAttackSpeed(player(monster, { equipment: { weapon }, style: SMASH }), monster)).toBe(3);
  });

  test('damage rolls: 2 + one per stab/slash defence above crush', () => {
    // Xarth stab 115, slash 105 > crush 20 -> 4 ("Phosani's ... would get four damage rolls")
    expect(getObligatorDamageRolls(getTestMonster('Xarth'))).toBe(4);
    expect(getObligatorDamageRolls(getTestMonster("Phosani's Nightmare"))).toBe(4);
    // General Graardor: all 90 -> 2 ("would only get two rolls")
    expect(getObligatorDamageRolls(getTestMonster('General Graardor'))).toBe(2);
    // Ocellus P2: stab 150 > crush 10, slash 120 > 10 -> 4; synthetic one-sided case -> 3
    expect(getObligatorDamageRolls(getTestMonster('Xarth', '', { defensive: { stab: 10, slash: 105, crush: 20 } }))).toBe(3);
  });

  test('size bonus: 20% at 2x2, 40% at 3x3 and bigger', () => {
    expect([1, 2, 3, 5].map(getObligatorSizeBonusPercent)).toEqual([0, 20, 40, 40]);
  });

  test('best-of-N damage distribution', () => {
    // max 3, two rolls, always accurate: P(d) = ((d+1)^2 - d^2) / 16 -> 1/16, 3/16, 5/16, 7/16
    const d = bestOfRollsHitDistribution(1, 0, 3, 2);
    const p = (dmg: number) => d.hits.filter((h) => h.hitsplats[0].damage === dmg && h.hitsplats[0].accurate)
      .reduce((a, h) => a + h.probability, 0);
    expect([0, 1, 2, 3].map(p)).toEqual([1 / 16, 3 / 16, 5 / 16, 7 / 16].map((x) => expect.closeTo(x, 12)));
    // E = (0 + 3 + 10 + 21) / 16 = 2.125 (a single roll would be 1.5)
    expect(d.expectedHit()).toBeCloseTo(2.125, 12);
  });

  test('thrust vs Xarth (4 rolls, +40%) and smash (1 roll, no bonus)', () => {
    const monster = getTestMonster('Xarth');
    const weapon = findEquipment('Obligator', 'Charged');
    // Aggressive: effective str 99 + 8 + 3 = 110; str bonus 40 -> max = (110 * 104 + 320) / 640 = 18
    // effective atk 99 + 8 = 107; crush 120 -> roll 107 * 184 = 19688
    // Xarth crush def: (170 + 9) * (20 + 64) = 15036 -> acc = 1 - 15038 / (2 * 19689) = 0.618112
    const smash = calculatePlayerVsNpc(monster, player(monster, { equipment: { weapon }, style: SMASH }));
    expect(smash.maxAttackRoll).toBe(19688);
    expect(smash.npcDefRoll).toBe(15036);
    expect(smash.accuracy).toBeCloseTo(0.618112, 5);
    expect(smash.maxHit).toBe(18);
    // smash: uniform 0..18, accurate 0 raised to 1: E = 171/19 + 1/19 = 9.052632; dps = acc * E / 1.8 s
    expect(smash.dps).toBeCloseTo(0.618112 * 9.052632 / 1.8, 4);

    const thrust = calculatePlayerVsNpc(monster, player(monster, { equipment: { weapon }, style: THRUST_AGGRESSIVE }));
    expect(thrust.maxAttackRoll).toBe(19688);
    // max = trunc(18 * 1.4) = 25
    expect(thrust.maxHit).toBe(25);
    // E = sum_{d=0}^{18} max(1, trunc(1.4 d)) * ((d+1)^4 - d^4) / 19^4 = 20.155746 (computed by hand/script);
    // dps = 0.618112 * 20.155746 / 3.0 s = 4.152834
    expect(thrust.dist.getExpectedDamage()).toBeCloseTo(0.618112 * 20.155746, 4);
    expect(thrust.dps).toBeCloseTo(4.152834, 4);
  });

  test('a 1x1 target gets no size bonus', () => {
    const monster = getTestMonster('Xarth', '', { size: 1 });
    const weapon = findEquipment('Obligator', 'Charged');
    const thrust = calculatePlayerVsNpc(monster, player(monster, { equipment: { weapon }, style: THRUST_AGGRESSIVE }));
    expect(thrust.maxHit).toBe(18);
  });
});

describe('Zeal', () => {
  test('25% attack, 28% strength (vs Piety 20% / 23%)', () => {
    const monster = getTestMonster('Xarth');
    const weapon = findEquipment('Obligator', 'Charged');
    const zeal = calculatePlayerVsNpc(monster, player(monster, { equipment: { weapon }, style: SMASH, prayers: [Prayer.ZEAL] }));
    const piety = calculatePlayerVsNpc(monster, player(monster, { equipment: { weapon }, style: SMASH, prayers: [Prayer.PIETY] }));
    // Zeal: atk trunc(99 * 1.25) + 8 = 131 -> 131 * 184 = 24104; str trunc(99 * 1.28) + 11 = 137 -> (137 * 104 + 320) / 640 = 22
    expect(zeal.maxAttackRoll).toBe(24104);
    expect(zeal.maxHit).toBe(22);
    // Piety: atk 118 + 8 = 126 -> 23184; str 121 + 11 = 132 -> (132 * 104 + 320) / 640 = 21
    expect(piety.maxAttackRoll).toBe(23184);
    expect(piety.maxHit).toBe(21);
  });
});

describe("Zorya's tome", () => {
  const monster = getTestMonster('Dreadnoth the Jellied');
  const weapon = findEquipment("Zorya's tome", 'Charged');
  const p = () => player(monster, { equipment: { weapon } });

  test('powered staff, 3 ticks, 50% spec, spec only partially modelled', () => {
    expect(p().style).toEqual({ name: 'Accurate', type: 'magic', stance: 'Accurate' });
    expect(calculateAttackSpeed(p(), monster)).toBe(3);
    expect(WEAPON_SPEC_COSTS["Zorya's tome"]).toBe(50);
    expect(new PlayerVsNPCCalc(p(), monster, { loadoutName: 'test' }).isSpecSupported()).toBe(FeatureStatus.PARTIALLY_IMPLEMENTED);
  });

  test('base max hit 18, +15% magic damage', () => {
    // Accurate: effective magic 99 + 2 + 9 = 110; magic +45 -> roll 110 * 109 = 11990
    // max 18 * 1.15 = 20.7 -> 20
    // Dreadnoth magic def: (220 + 9) * (20 + 64) = 19236 -> acc = 11990 / (2 * 19237) = 0.311639
    const r = calculatePlayerVsNpc(monster, p());
    expect(r.maxAttackRoll).toBe(11990);
    expect(r.npcDefRoll).toBe(19236);
    expect(r.maxHit).toBe(20);
    expect(r.accuracy).toBeCloseTo(0.311639, 5);
    // E = (210 + 1) / 21; dps = acc * E / 1.8 s
    expect(r.dps).toBeCloseTo(0.311639 * (211 / 21) / 1.8, 4);
  });

  test("Zorya's flow: +150% accuracy, +60% damage", () => {
    // roll 11990 * 5 / 2 = 29975; max trunc(20 * 8 / 5) = 32
    // acc = 1 - 19238 / (2 * 29976) = 0.679110
    const r = calculatePlayerVsNpc(monster, p(), { usingSpecialAttack: true });
    expect(r.maxAttackRoll).toBe(29975);
    expect(r.maxHit).toBe(32);
    expect(r.accuracy).toBeCloseTo(0.679110, 5);
  });

  test('stats include the weapon (no shield slot: two-handed)', () => {
    const b = calculateEquipmentBonusesFromGear(p(), monster);
    expect(b.offensive.magic).toBe(45);
    expect(b.bonuses.magic_str).toBe(150);
  });
});

describe('Ascension crossbows', () => {
  const monster = getTestMonster('Archive Guardian', 'Flying');
  const weapon = findEquipment('Ascension crossbows');
  const rapid = { name: 'Rapid', type: 'ranged', stance: 'Rapid' } as const;
  const withAmmo = (ammo: string) => player(monster, { equipment: { weapon, ammo: findEquipment(ammo) }, style: rapid });

  test('only ascension bolts are valid ammo', () => {
    ['Ascension bolts', 'Diamond ascension bolts', 'Diamond ascension bolts (e)', 'Onyx ascension bolts',
      'Onyx ascension bolts (e)'].forEach((a) => {
      expect(ammoApplicability(weapon.id, findEquipment(a).id)).toBe(AmmoApplicability.INCLUDED);
    });
    expect(ammoApplicability(weapon.id, findEquipment('Dragon bolts').id)).toBe(AmmoApplicability.INVALID);
    expect(ammoApplicability(findEquipment('Armadyl crossbow').id, findEquipment('Ascension bolts').id))
      .toBe(AmmoApplicability.INVALID);
  });

  test('rapid: 2 ticks; plain bolts vs Archive Guardian (flying)', () => {
    const p = withAmmo('Ascension bolts');
    expect(p.attackSpeed).toBe(2);
    // rapid: effective ranged 99 + 8 = 107; ranged +34 -> roll 107 * 98 = 10486
    // ranged str 53 -> max (107 * 117 + 320) / 640 = 20
    // AG heavy def 50: (260 + 9) * 114 = 30666 -> acc = 10486 / (2 * 30667) = 0.170965
    const r = calculatePlayerVsNpc(monster, p);
    expect(r.maxAttackRoll).toBe(10486);
    expect(r.npcDefRoll).toBe(30666);
    expect(r.maxHit).toBe(20);
    // E = 211 / 21; dps = acc * E / 1.2 s
    expect(r.dps).toBeCloseTo(0.170965 * (211 / 21) / 1.2, 4);
  });

  test('diamond and onyx ascension bolts (e) use the regular bolt effects', () => {
    // ranged str 58 -> max (107 * 122 + 320) / 640 = 20; diamond effect max trunc(20 * 1.15) = 23,
    // onyx effect max trunc(20 * 1.2) = 24. The unenchanted bolts keep 20.
    expect(calculatePlayerVsNpc(monster, withAmmo('Diamond ascension bolts')).maxHit).toBe(20);
    expect(calculatePlayerVsNpc(monster, withAmmo('Diamond ascension bolts (e)')).maxHit).toBe(23);
    expect(calculatePlayerVsNpc(monster, withAmmo('Onyx ascension bolts')).maxHit).toBe(20);
    expect(calculatePlayerVsNpc(monster, withAmmo('Onyx ascension bolts (e)')).maxHit).toBe(24);
  });
});

describe('Rondache', () => {
  test('stats only: +8 strength in the shield slot', () => {
    const monster = getTestMonster('Xarth');
    const p = player(monster, { equipment: { shield: findEquipment('Rondache') } });
    expect(calculateEquipmentBonusesFromGear(p, monster).bonuses.str).toBe(8);
  });
});

describe('elemental fragments', () => {
  const surge = (monster: Monster, spell: string, fragments: Player['buffs']['elementalFragments']) => calculatePlayerVsNpc(
    monster,
    player(monster, {
      spell: findSpell(spell),
      style: { name: 'Spell', type: 'magic', stance: 'Manual Cast' },
      buffs: { elementalFragments: fragments },
    }),
  );

  test('+2 base max hit for the matching element only', () => {
    const monster = getTestMonster('General Graardor'); // earth weakness 40%
    // Fire Surge base 24, no magic damage: 24 -> 26 with the fire fragment
    expect(surge(monster, 'Fire Surge', {}).maxHit).toBe(24);
    expect(surge(monster, 'Fire Surge', { fire: true }).maxHit).toBe(26);
    expect(surge(monster, 'Fire Surge', { water: true, air: true, earth: true }).maxHit).toBe(24);
  });

  test('added before elemental weakness (Dreadnoth, fire 85%)', () => {
    const monster = getTestMonster('Dreadnoth the Jellied');
    // without: 24 + trunc(24 * 0.85) = 24 + 20 = 44; with: 26 + trunc(26 * 0.85) = 26 + 22 = 48
    expect(surge(monster, 'Fire Surge', {}).maxHit).toBe(44);
    expect(surge(monster, 'Fire Surge', { fire: true }).maxHit).toBe(48);
  });
});
