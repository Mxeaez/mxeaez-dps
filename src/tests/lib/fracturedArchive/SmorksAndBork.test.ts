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
    [ARMOUR_8, ARMOUR_14, BORK_STUNNED_PHASE].forEach((phase) => {
      const m = bork(phase);
      const c = calc(m, scythePlayer(m));
      const [, max] = c.getMinAndMax();
      const acc = c.getHitChance();
      const armour = m.defensive.flat_armour;
      // Bork is size 4 -> 3 hits at max, max/2, max/4; each hit rolls accuracy on its own
      const splatMaxes = [max, Math.trunc(max / 2), Math.trunc(max / 4)];
      const expected = splatMaxes.reduce((s, splatMax) => s + expectedHit(acc, splatMax, armour), 0);
      expect(c.getDistribution().dists).toHaveLength(3);
      expect(c.getExpectedDamage()).toBeCloseTo(expected, 10);
      // and not the armour subtracted once from the summed hit
      if (armour > 0) {
        expect(c.getExpectedDamage()).toBeLessThan(splatMaxes
          .reduce((s, splatMax) => s + expectedHit(acc, splatMax, 0), 0) - acc * armour);
      }
    });
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
    [ARMOUR_8, ARMOUR_12, BORK_STUNNED_PHASE].forEach((phase) => {
      const m = bork(phase);
      const c = calc(m, rcbPlayer(m));
      const [, max] = c.getMinAndMax();
      expect(c.getDistribution().getMax()).toBe(max - m.defensive.flat_armour);
      expect(c.getExpectedDamage()).toBeCloseTo(expectedHit(c.getHitChance(), max, m.defensive.flat_armour), 10);
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
  // Same inputs as the Playwright check: default player (99s, no prayers/boosts), "Max Melee" equipment preset
  // (src/app/components/player/equipment/EquipmentPresets.tsx) + Scythe of Vitur (charged, replaces the defender),
  // first style Reap (accurate slash).
  // Strength bonus 145, effective str 99 + 8 = 107 -> max trunc((107 * 209 + 320) / 640) = 35; hits 35 / 17 / 8.
  // Slash bonus 175, attack roll (99 + 3 + 8) * 239 = 26290; Bork defence roll 59946 -> acc 26290 / (2 * 59947).
  // "Max hit" on screen is the sum of the three hitsplats after armour, e.g. armour 8: 27 + 9 + 0 = 36.
  // Armour 8 DPS: acc * (sum(1..27) / 36 + sum(1..9) / 18 + 0) / 3 = acc * 13 / 3 = 0.9502.
  // Stunned: acc 1, (1 + sum(1..35)) / 36 + (1 + sum(1..17)) / 18 + (1 + sum(1..8)) / 9 = 30.194 / 3 = 10.065.
  // Smorks: flat armour 2, slash defence roll (220 + 9) * (170 + 64) = 53586.
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
  });

  const cases: [string, string | undefined, number, number][] = [
    ['Bork', ARMOUR_8, 36, 0.950],
    ['Bork', ARMOUR_10, 32, 0.774],
    ['Bork', ARMOUR_12, 28, 0.621],
    ['Bork', ARMOUR_14, 24, 0.493],
    ['Bork', BORK_STUNNED_PHASE, 60, 10.065],
    ['The Smorks', undefined, 54, 2.010],
  ];
  test.each(cases)('%s %s: max hit %d, DPS %d (values read on screen)', (name, phase, maxHit, dps) => {
    const m = name === 'Bork' ? bork(phase) : smorks();
    const r = calculatePlayerVsNpc(m, maxMeleeScythe(m));
    expect(r.maxHit).toBe(maxHit);
    expect(r.dps).toBeCloseTo(dps, 3);
  });

  test('armour 8 and stunned DPS match the hand derivation', () => {
    const acc = 26290 / (2 * 59947);
    expect(calculatePlayerVsNpc(bork(ARMOUR_8), maxMeleeScythe(bork(ARMOUR_8))).dps)
      .toBeCloseTo((acc * 13) / 3, 10);
    expect(calculatePlayerVsNpc(bork(BORK_STUNNED_PHASE), maxMeleeScythe(bork(BORK_STUNNED_PHASE))).dps)
      .toBeCloseTo((631 / 36 + 154 / 18 + 37 / 9) / 3, 10);
  });
});
