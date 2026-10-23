import { describe, expect, test } from '@jest/globals';
import {
  calculatePlayerVsNpc,
  findEquipment,
  findEquipmentById,
  getTestMonster,
  getTestPlayer,
} from '@/tests/utils/TestUtils';
import { scaleMonster } from '@/lib/MonsterScaling';
import PlayerVsNPCCalc from '@/lib/PlayerVsNPCCalc';
import { BORK_PHASES, BORK_STUNNED_PHASE, MONSTER_PHASES_BY_ID } from '@/lib/constants';
import {
  getMagicResistance, hasGuaranteedMeleeAccuracy,
} from '@/lib/fracturedArchive/bork';
import { Prayer } from '@/enums/Prayer';
import Potion from '@/enums/Potion';
import { Monster } from '@/types/Monster';
import { Player } from '@/types/Player';
import { PartialDeep } from 'type-fest';

// Bork and the Smorks: https://oldschool.runescape.wiki/w/Bork, https://oldschool.runescape.wiki/w/The_Smorks and
// https://oldschool.runescape.wiki/w/The_Fractured_Archive/Strategies#Bork_and_the_Smorks (2026-10-22).
// Model notes: docs/DATA_SOURCES.md (Bork, phase 4).
const BORK = 16640;
const SMORKS = 16641;

const [ARMOUR_8, ARMOUR_10, ARMOUR_12, ARMOUR_14] = BORK_PHASES;

// getTestMonster (not getTestMonsterById, which merges into the shared monsters.json object) so an unset phase stays unset
const bork = (phase?: string, inputs: PartialDeep<Monster['inputs']> = {}) => scaleMonster(
  getTestMonster('Bork', '', { inputs: { ...inputs, phase } }),
);
const smorks = (inputs: PartialDeep<Monster['inputs']> = {}) => scaleMonster(getTestMonster('The Smorks', '', { inputs }));

// sum of (d - armour) over accurate rolls d = 0..max, where an accurate 0 is first raised to 1 (upstream) and
// flat armour then subtracts per hitsplat with a minimum of 0
const accurateDamageSum = (max: number, armour: number): number => {
  let total = 0;
  for (let d = 0; d <= max; d++) {
    total += Math.max(0, Math.max(d, 1) - armour);
  }
  return total;
};
const expectedHit = (acc: number, max: number, armour: number) => acc * accurateDamageSum(max, armour) / (max + 1);

// Abyssal whip, Flick (accurate, slash), 99 attack/strength, no other gear, prayers or boosts.
// Max hit: effective str 99 + 8 = 107 -> trunc((107 * (82 + 64) + 320) / 640) = trunc(15942 / 640) = 24.
// Attack roll: (99 + 3 + 8) * (82 + 64) = 110 * 146 = 16060.
// Bork slash defence roll: (300 + 9) * (130 + 64) = 59946 -> accuracy 16060 / (2 * 59947).
const whipPlayer = (m: Monster) => getTestPlayer(m, {
  equipment: { weapon: findEquipment('Abyssal whip') },
  style: { name: 'Flick', type: 'slash', stance: 'Accurate' },
  skills: { atk: 99, str: 99 },
});
const WHIP_MAX = 24;
const WHIP_ACC = 16060 / (2 * 59947);

const scythePlayer = (m: Monster, extra: PartialDeep<Player> = {}) => getTestPlayer(m, {
  equipment: { weapon: findEquipment('Scythe of Vitur', 'Charged') },
  style: { name: 'Chop', type: 'slash', stance: 'Aggressive' },
  skills: { atk: 99, str: 99 },
  ...extra,
});

const shadowPlayer = (m: Monster) => getTestPlayer(m, {
  equipment: { weapon: findEquipment("Tumeken's shadow", 'Charged') },
  skills: { magic: 99 },
});

const rcbPlayer = (m: Monster) => getTestPlayer(m, {
  equipment: { weapon: findEquipment('Rune crossbow'), ammo: findEquipment('Runite bolts') },
  skills: { ranged: 99 },
});

const calc = (m: Monster, p: Player) => new PlayerVsNPCCalc(p, m, { loadoutName: 'test' });

describe('Bork phase input', () => {
  test('phase options are registered for Bork only', () => {
    expect(MONSTER_PHASES_BY_ID[BORK]).toEqual([
      'Smorks 100-76% HP (armour 8)',
      'Smorks 75-51% HP (armour 10)',
      'Smorks 50-26% HP (armour 12)',
      'Smorks 25-0% HP (armour 14)',
      'Stunned (armour 0)',
    ]);
    expect(MONSTER_PHASES_BY_ID[SMORKS]).toBeUndefined();
  });

  test.each([
    [ARMOUR_8, 8],
    [ARMOUR_10, 10],
    [ARMOUR_12, 12],
    [ARMOUR_14, 14],
    [BORK_STUNNED_PHASE, 0],
  ])('%s sets flat armour %d', (phase, armour) => {
    expect(bork(phase).defensive.flat_armour).toBe(armour);
  });

  test('no phase selected (e.g. a loadout from before phase 4) = default 8', () => {
    expect(getTestMonster('Bork').defensive.flat_armour).toBe(0); // raw generated data, see DATA_SOURCES.md
    expect(bork(undefined).defensive.flat_armour).toBe(8);
    expect(bork('Something else').defensive.flat_armour).toBe(8);
  });

  test('magic resistance 2 unless stunned; guaranteed melee accuracy only when stunned', () => {
    [ARMOUR_8, ARMOUR_10, ARMOUR_12, ARMOUR_14, undefined].forEach((phase) => {
      expect(getMagicResistance(bork(phase))).toBe(2);
      expect(hasGuaranteedMeleeAccuracy(bork(phase))).toBe(false);
    });
    expect(getMagicResistance(bork(BORK_STUNNED_PHASE))).toBe(0);
    expect(hasGuaranteedMeleeAccuracy(bork(BORK_STUNNED_PHASE))).toBe(true);
    // the Smorks have neither, whatever the phase input says
    expect(getMagicResistance(smorks({ phase: ARMOUR_8 }))).toBe(0);
    expect(hasGuaranteedMeleeAccuracy(smorks({ phase: BORK_STUNNED_PHASE }))).toBe(false);
  });
});

describe('Bork flat armour vs melee', () => {
  test('whip: max hit and accuracy as hand-derived', () => {
    const c = calc(bork(ARMOUR_8), whipPlayer(bork(ARMOUR_8)));
    expect(c.getMinAndMax()).toEqual([0, WHIP_MAX]);
    expect(c.getHitChance()).toBeCloseTo(WHIP_ACC, 10);
  });

  test.each([
    [ARMOUR_8, 8, 136], // sum of 1..16
    [ARMOUR_10, 10, 105], // sum of 1..14
    [ARMOUR_12, 12, 78], // sum of 1..12
    [ARMOUR_14, 14, 55], // sum of 1..10
  ])('whip %s: expected hit = acc * sum(d - %d) / 25', (phase, armour, damageSum) => {
    const m = bork(phase);
    const r = calculatePlayerVsNpc(m, whipPlayer(m));
    expect(accurateDamageSum(WHIP_MAX, armour)).toBe(damageSum);
    expect(r.maxHit).toBe(WHIP_MAX - armour);
    // 4-tick whip -> 2.4 s per attack
    expect(r.dps).toBeCloseTo((WHIP_ACC * damageSum) / 25 / 2.4, 10);
  });

  test('whip stunned: 100% accuracy and no armour', () => {
    const m = bork(BORK_STUNNED_PHASE);
    const r = calculatePlayerVsNpc(m, whipPlayer(m));
    expect(r.accuracy).toBe(1);
    expect(r.maxHit).toBe(WHIP_MAX);
    // accurate 0 -> 1, so sum = 1 + (1 + ... + 24) = 301
    expect(r.dps).toBeCloseTo(301 / 25 / 2.4, 10);
  });

  test('scythe: armour is subtracted from each of the three hitsplats separately', () => {
    // Scythe of Vitur (charged), Chop (aggressive slash), 99s, no other gear: slash +125, str +75.
    // Max: effective str 99 + 3 + 8 = 110 -> trunc((110 * 139 + 320) / 640) = 24; hits 24 / 12 / 6 (Bork is size 4).
    // Attack roll (99 + 8) * (125 + 64) = 20223 vs slash defence roll 59946 -> accuracy 20223 / (2 * 59947).
    // Each hitsplat rolls accuracy and loses the armour on its own (accurate 0 -> 1 first, min 0 after armour):
    //   armour 8:  24 -> sum(1..16) = 136 over 25 rolls, 12 -> sum(1..4) = 10 over 13, 6 -> 0
    //   armour 14: 24 -> sum(1..10) = 55 over 25, 12 and 6 -> 0
    //   stunned:   accuracy 1, no armour: (1 + sum(1..24)) / 25 + (1 + sum(1..12)) / 13 + (1 + sum(1..6)) / 7
    // 5-tick weapon -> 3.0 s per attack. Armour taken once from the summed hit would give acc * (12 + 6 + 3 + ... - 8).
    const acc = 20223 / (2 * 59947);
    const cases: [string, number][] = [
      [ARMOUR_8, acc * (136 / 25 + 10 / 13)],
      [ARMOUR_14, (acc * 55) / 25],
      [BORK_STUNNED_PHASE, 301 / 25 + 79 / 13 + 22 / 7],
    ];
    cases.forEach(([phase, expectedDamage]) => {
      const m = bork(phase);
      const c = calc(m, scythePlayer(m));
      expect(c.getMinAndMax()).toEqual([0, 24]);
      expect(c.getDistribution().dists).toHaveLength(3);
      expect(c.getExpectedDamage()).toBeCloseTo(expectedDamage, 10);
      expect(c.getDps()).toBeCloseTo(expectedDamage / 3, 10);
    });
    // max hit on screen = sum of the three splats after armour: 16 + 4 + 0 (armour 8), 10 + 0 + 0 (armour 14)
    expect(calculatePlayerVsNpc(bork(ARMOUR_8), scythePlayer(bork(ARMOUR_8))).maxHit).toBe(20);
    expect(calculatePlayerVsNpc(bork(ARMOUR_14), scythePlayer(bork(ARMOUR_14))).maxHit).toBe(10);
  });

  test('stun only guarantees melee accuracy: ranged and magic accuracy unchanged', () => {
    const normal = bork(ARMOUR_8);
    const stunned = bork(BORK_STUNNED_PHASE);
    const rN = calculatePlayerVsNpc(normal, rcbPlayer(normal));
    const rS = calculatePlayerVsNpc(stunned, rcbPlayer(stunned));
    expect(rS.accuracy).toBe(rN.accuracy);
    expect(rS.accuracy).toBeLessThan(1);
    const mN = calculatePlayerVsNpc(normal, shadowPlayer(normal));
    const mS = calculatePlayerVsNpc(stunned, shadowPlayer(stunned));
    expect(mS.accuracy).toBe(mN.accuracy);
    expect(mS.accuracy).toBeLessThan(1);
  });
});

describe('Bork flat armour vs ranged and magic', () => {
  test('ranged is reduced by the full flat armour, and by 0 when stunned', () => {
    // Rune crossbow + runite bolts, Accurate, 99 Ranged: effective 99 + 3 + 8 = 110.
    // Max trunc((110 * (115 + 64) + 320) / 640) = 31; attack roll 110 * (90 + 64) = 16940.
    // Bork heavy defence roll (300 + 9) * (5 + 64) = 21321 -> accuracy 16940 / (2 * 21322) in every option.
    //   armour 8:  sum(d - 8, d = 9..31) = sum(1..23) = 276 over 32 rolls, max 23
    //   armour 12: sum(1..19) = 190 over 32, max 19
    //   stunned:   (1 + sum(1..31)) = 497 over 32, max 31
    // 6-tick crossbow on Accurate -> 3.6 s per attack.
    const acc = 16940 / (2 * 21322);
    const cases: [string, number, number][] = [
      [ARMOUR_8, 23, 276],
      [ARMOUR_12, 19, 190],
      [BORK_STUNNED_PHASE, 31, 497],
    ];
    cases.forEach(([phase, max, damageSum]) => {
      const m = bork(phase);
      const c = calc(m, rcbPlayer(m));
      expect(c.getMinAndMax()).toEqual([0, 31]);
      expect(c.getHitChance()).toBeCloseTo(acc, 10);
      expect(c.getDistribution().getMax()).toBe(max);
      expect(c.getExpectedDamage()).toBeCloseTo((acc * damageSum) / 32, 10);
      expect(c.getDps()).toBeCloseTo((acc * damageSum) / 32 / 3.6, 10);
    });
  });

  test('magic is reduced by 2 in every unstunned phase (not 8-14), by 0 when stunned', () => {
    const results = [ARMOUR_8, ARMOUR_10, ARMOUR_12, ARMOUR_14].map((phase) => {
      const m = bork(phase);
      const c = calc(m, shadowPlayer(m));
      const [, max] = c.getMinAndMax();
      expect(c.getDistribution().getMax()).toBe(max - 2);
      expect(c.getExpectedDamage()).toBeCloseTo(expectedHit(c.getHitChance(), max, 2), 10);
      return c.getDps();
    });
    expect(new Set(results).size).toBe(1);

    const m = bork(BORK_STUNNED_PHASE);
    const c = calc(m, shadowPlayer(m));
    const [, max] = c.getMinAndMax();
    expect(c.getDistribution().getMax()).toBe(max);
    expect(c.getExpectedDamage()).toBeCloseTo(expectedHit(c.getHitChance(), max, 0), 10);
    expect(c.getDps()).toBeGreaterThan(results[0]);
  });
});

describe('The Smorks', () => {
  test('stats: 600 hp, flat armour 2, 400 magic defence, 85% earth weakness', () => {
    const m = smorks();
    expect(m.skills.hp).toBe(600);
    expect(m.defensive.flat_armour).toBe(2);
    expect(m.defensive.magic).toBe(400);
    expect(m.weakness).toEqual({ element: 'earth', severity: 85 });
  });

  test('flat armour 2 applies to melee per hit but not to magic; no magic resistance', () => {
    const m = smorks();
    const c = calc(m, whipPlayer(m));
    expect(c.getExpectedDamage()).toBeCloseTo(expectedHit(c.getHitChance(), 24, 2), 10);
    const mc = calc(m, shadowPlayer(m));
    const [, max] = mc.getMinAndMax();
    expect(mc.getExpectedDamage()).toBeCloseTo(expectedHit(mc.getHitChance(), max, 0), 10);
  });
});

describe('defence floors still hold', () => {
  test('Bork floors at 180 and the Smorks drain to 0, in every phase', () => {
    [ARMOUR_8, BORK_STUNNED_PHASE].forEach((phase) => {
      expect(bork(phase, { defenceReductions: { dwh: 10 } }).skills.def).toBe(180);
      expect(bork(phase, { defenceReductions: { bgs: 5000 } }).skills.def).toBe(180);
    });
    expect(smorks({ defenceReductions: { bgs: 5000 } }).skills.def).toBe(0);
  });
});

describe('real loadout sanity check', () => {
  // Max melee scythe: Scythe of Vitur (charged), Torva helm/body/legs, Amulet of rancour, Infernal cape, Ferocious
  // gloves, Primordial boots, Ultor ring; 118 attack/strength (super combat), Piety, Chop (aggressive slash).
  //   Strength bonus 75 + 8 + 6 + 4 + 12 + 8 + 14 + 5 + 12 = 144.
  //   Effective str trunc(118 * 1.23) = 145, +3 aggressive +8 = 156 -> max trunc((156 * 208 + 320) / 640) = 51.
  //   Slash bonus 125 + 25 + 4 + 16 + 2 = 172; effective atk trunc(118 * 1.2) = 141, +8 = 149 -> roll 149 * 236 = 35164.
  //   Bork slash defence roll 59946 -> accuracy 35164 / (2 * 59947).
  //   Hits 51 / 25 / 12. With armour 8 each accurate hit is worth sum(d - 8 for d > 8) / (max + 1):
  //   946 / 52 + 153 / 26 + 10 / 13. Stunned: accuracy 1, (1 + 51*52/2) / 52 + (1 + 325) / 26 + (1 + 78) / 13.
  //   5-tick weapon -> 3.0 s per attack.
  const gear = {
    weapon: findEquipment('Scythe of Vitur', 'Charged'),
    head: findEquipmentById(26382),
    body: findEquipmentById(26384),
    legs: findEquipmentById(26386),
    neck: findEquipment('Amulet of rancour'),
    cape: findEquipmentById(21295),
    hands: findEquipment('Ferocious gloves'),
    feet: findEquipment('Primordial boots'),
    ring: findEquipment('Ultor ring'),
  };
  const maxScythe = (m: Monster) => scythePlayer(m, {
    equipment: gear,
    skills: { atk: 118, str: 118 },
    prayers: [Prayer.PIETY],
  });

  test('default phase (Smorks full HP, armour 8)', () => {
    const m = bork(ARMOUR_8);
    const r = calculatePlayerVsNpc(m, maxScythe(m));
    expect(r.maxAttackRoll).toBe(35164);
    expect(r.npcDefRoll).toBe(59946);
    const acc = 35164 / (2 * 59947);
    expect(r.dps).toBeCloseTo((acc * (946 / 52 + 153 / 26 + 10 / 13)) / 3, 10);
    expect(r.dps).toBeCloseTo(2.429, 3);
  });

  test('stunned', () => {
    const m = bork(BORK_STUNNED_PHASE);
    const r = calculatePlayerVsNpc(m, maxScythe(m));
    expect(r.dps).toBeCloseTo((1327 / 52 + 326 / 26 + 79 / 13) / 3, 10);
    expect(r.dps).toBeCloseTo(14.7115, 4);
  });
});

describe('Bork / Smorks UI parity (scripts/verifySmorksAndBork.mjs)', () => {
  // Same inputs as the Playwright check: "Max Melee" equipment preset
  // (src/app/components/player/equipment/EquipmentPresets.tsx) + Scythe of Vitur (charged, replaces the defender),
  // 99s + Super combat (118 Attack/Strength), Piety, Chop (aggressive slash).
  // Strength bonus 145: effective str trunc(118 * 1.23) = 145 + 3 + 8 = 156 -> max trunc((156 * 209 + 320) / 640) = 51;
  // hits 51 / 25 / 12. Slash bonus 175: effective atk trunc(118 * 1.2) = 141 + 8 = 149 -> roll 149 * 239 = 35611.
  // Bork slash defence roll 59946 -> acc 35611 / (2 * 59947); the Smorks (220 + 9) * (170 + 64) = 53586.
  // Per accurate roll each splat is worth sum(d - armour for d > armour) / (max + 1); 5-tick weapon -> 3.0 s:
  //   armour 8:  acc * (sum(1..43) / 52 + sum(1..17) / 26 + sum(1..4) / 13) / 3 = acc * (946/52 + 153/26 + 10/13) / 3
  //   armour 10: acc * (861/52 + 120/26 + 3/13) / 3;  armour 12: acc * (780/52 + 91/26) / 3
  //   armour 14: acc * (703/52 + 66/26) / 3
  //   stunned:   accuracy 1, no armour, accurate 0 -> 1: (1327/52 + 326/26 + 79/13) / 3
  //   Smorks (armour 2): accS * (sum(1..49) / 52 + sum(1..23) / 26 + sum(1..10) / 13) / 3
  // "Max hit" on screen is the sum of the three hitsplats after armour, e.g. armour 8: 43 + 17 + 4 = 64.
  const maxMeleeScythe = (m: Monster) => getTestPlayer(m, {
    equipment: {
      head: findEquipmentById(26382), // Torva full helm
      cape: findEquipmentById(21295), // Infernal cape
      neck: findEquipmentById(29801), // Amulet of rancour
      ammo: findEquipmentById(22947), // Rada's blessing 4
      body: findEquipmentById(26384), // Torva platebody
      legs: findEquipmentById(26386), // Torva platelegs
      hands: findEquipmentById(22981), // Ferocious gloves
      feet: findEquipmentById(31097), // Avernic treads (max)
      ring: findEquipmentById(28307), // Ultor ring
      weapon: findEquipment('Scythe of Vitur', 'Charged'),
    },
    style: { name: 'Chop', type: 'slash', stance: 'Aggressive' },
    skills: { atk: 99, str: 99 },
    boosts: { atk: 19, str: 19 },
    prayers: [Prayer.PIETY],
    buffs: { potions: [Potion.SUPER_COMBAT] },
  });

  const acc = 35611 / (2 * 59947);
  const accS = 35611 / (2 * 53587);
  const cases: [string, string | undefined, number, number, number][] = [
    ['Bork', ARMOUR_8, 64, acc * (946 / 52 + 153 / 26 + 10 / 13) / 3, 2.460],
    ['Bork', ARMOUR_10, 58, acc * (861 / 52 + 120 / 26 + 3 / 13) / 3, 2.119],
    ['Bork', ARMOUR_12, 52, acc * (780 / 52 + 91 / 26) / 3, 1.832],
    ['Bork', ARMOUR_14, 48, acc * (703 / 52 + 66 / 26) / 3, 1.590],
    ['Bork', BORK_STUNNED_PHASE, 88, (1327 / 52 + 326 / 26 + 79 / 13) / 3, 14.712],
    ['The Smorks', undefined, 82, accS * (1225 / 52 + 276 / 26 + 55 / 13) / 3, 4.254],
  ];
  test.each(cases)('%s %s: max hit %d', (name, phase, maxHit, dps, shownDps) => {
    const m = name === 'Bork' ? bork(phase) : smorks();
    const r = calculatePlayerVsNpc(m, maxMeleeScythe(m));
    expect(r.maxAttackRoll).toBe(35611);
    expect(r.maxHit).toBe(maxHit);
    expect(r.dps).toBeCloseTo(dps, 10);
    expect(r.dps).toBeCloseTo(shownDps, 3); // value read on screen
  });
});
