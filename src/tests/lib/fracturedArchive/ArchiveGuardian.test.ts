import { describe, expect, test } from '@jest/globals';
import {
  calculatePlayerVsNpc,
  findEquipment,
  findEquipmentById,
  findSpell,
  getTestMonster,
  getTestPlayer,
} from '@/tests/utils/TestUtils';
import { scaleMonster } from '@/lib/MonsterScaling';
import PlayerVsNPCCalc from '@/lib/PlayerVsNPCCalc';
import UserIssueType from '@/enums/UserIssueType';
import { isImmuneToMagicLevelDrains, isImmuneToSpell } from '@/lib/fracturedArchive/immunities';
import { MonsterAttribute } from '@/enums/MonsterAttribute';
import { Monster } from '@/types/Monster';
import { Player } from '@/types/Player';
import { PartialDeep } from 'type-fest';

// Archive Guardian, https://oldschool.runescape.wiki/w/Archive_Guardian (2026-10-22). See docs/DATA_SOURCES.md.
const ag = (version: 'Flying' | 'Grounded', inputs: PartialDeep<Monster['inputs']> = {}) => scaleMonster(
  getTestMonster('Archive Guardian', version, { inputs }),
);

const ancestral: PartialDeep<Player['equipment']> = {
  head: findEquipment('Ancestral hat'),
  body: findEquipment('Ancestral robe top'),
  legs: findEquipment('Ancestral robe bottom'),
};

const spellPlayer = (m: Monster, spell: string, weapon: string = 'Kodai wand') => getTestPlayer(m, {
  equipment: { ...ancestral, weapon: findEquipment(weapon) },
  style: { name: 'Autocast', type: 'magic', stance: 'Autocast' },
  spell: findSpell(spell),
  skills: { magic: 99 },
});

const meleePlayer = (m: Monster, weapon: string, version: string = '') => getTestPlayer(m, {
  equipment: {
    weapon: findEquipment(weapon, version),
    ammo: weapon === 'Black salamander' ? findEquipment('Harralander tar') : null,
  },
  skills: { atk: 99, str: 99 },
});

describe('Archive Guardian versions', () => {
  test('Flying has the flying attribute and 80% fire weakness, Grounded 40% and no attributes', () => {
    const flying = ag('Flying');
    const grounded = ag('Grounded');
    expect(flying.attributes).toEqual([MonsterAttribute.FLYING]);
    expect(flying.weakness).toEqual({ element: 'fire', severity: 80 });
    expect(grounded.attributes).toEqual([]);
    expect(grounded.weakness).toEqual({ element: 'fire', severity: 40 });
    // both versions keep the 550 hp bar (the flying shield is not modelled, see DATA_SOURCES.md)
    expect(flying.skills.hp).toBe(550);
    expect(grounded.skills.hp).toBe(550);
  });

  test('fire spell max hit and accuracy reflect 80% (Flying) vs 40% (Grounded) weakness', () => {
    // Fire Surge at 99 Magic: base max 24. Kodai wand 15% + Ancestral 3 x 3% = 24% magic damage -> trunc(24 * 1.24) = 29.
    // Weakness adds trunc(base * severity): Flying +trunc(24 * 0.8) = 19 -> 48, Grounded +trunc(24 * 0.4) = 9 -> 38.
    // Attack roll: (99 + 9) * (97 + 64) = 17388; weakness adds trunc(17388 * 0.8) = 13910 / trunc(17388 * 0.4) = 6955.
    const flying = ag('Flying');
    const grounded = ag('Grounded');
    const f = calculatePlayerVsNpc(flying, spellPlayer(flying, 'Fire Surge'));
    const g = calculatePlayerVsNpc(grounded, spellPlayer(grounded, 'Fire Surge'));
    expect(f.maxHit).toBe(48);
    expect(g.maxHit).toBe(38);
    expect(f.maxAttackRoll).toBe(31298);
    expect(g.maxAttackRoll).toBe(24343);
    // magic defence roll is the same in both versions: (250 + 9) * (130 + 64)
    expect(f.npcDefRoll).toBe(50246);
    expect(g.npcDefRoll).toBe(50246);
  });

  test('non-fire spells are unaffected by the version', () => {
    const f = calculatePlayerVsNpc(ag('Flying'), spellPlayer(ag('Flying'), 'Water Surge'));
    const g = calculatePlayerVsNpc(ag('Grounded'), spellPlayer(ag('Grounded'), 'Water Surge'));
    expect(f.maxHit).toBe(29);
    expect(f.dps).toBe(g.dps);
  });
});

describe('Archive Guardian flying', () => {
  test('non-halberd melee cannot hit the Flying version but can hit Grounded', () => {
    ['Scythe of Vitur', "Inquisitor's mace", 'Abyssal bludgeon', 'Zamorakian hasta'].forEach((weapon) => {
      const version = weapon === 'Scythe of Vitur' ? 'Charged' : '';
      expect(calculatePlayerVsNpc(ag('Flying'), meleePlayer(ag('Flying'), weapon, version)).dps).toBe(0);
      expect(calculatePlayerVsNpc(ag('Grounded'), meleePlayer(ag('Grounded'), weapon, version)).dps).toBeGreaterThan(0);
    });
  });

  test('halberds (and salamanders, upstream flying rule) can hit the Flying version', () => {
    ['Dragon halberd', 'Noxious halberd', 'Black salamander'].forEach((weapon) => {
      const flying = calculatePlayerVsNpc(ag('Flying'), meleePlayer(ag('Flying'), weapon)).dps;
      expect(flying).toBeGreaterThan(0);
    });
  });
});

describe('Archive Guardian Ancient Magicks immunity', () => {
  test('Ancient spells deal no damage and raise a spell issue, in both versions', () => {
    (['Flying', 'Grounded'] as const).forEach((version) => {
      ['Ice Barrage', 'Blood Barrage', 'Shadow Barrage', 'Smoke Barrage'].forEach((spell) => {
        const m = ag(version);
        const calc = new PlayerVsNPCCalc(spellPlayer(m, spell, 'Ancient sceptre'), m, { loadoutName: 'test' });
        expect(calc.getDps()).toBe(0);
        expect(calc.userIssues.map((i) => i.type)).toContain(UserIssueType.SPELL_WRONG_MONSTER);
      });
    });
  });

  test('standard spells and powered staves are not affected', () => {
    const m = ag('Flying');
    const calc = new PlayerVsNPCCalc(spellPlayer(m, 'Fire Surge'), m, { loadoutName: 'test' });
    expect(calc.getDps()).toBeGreaterThan(0);
    expect(calc.userIssues).toEqual([]);
    expect(isImmuneToSpell(m, null)).toBe(false);
  });

  test('other monsters still take damage from Ancient spells', () => {
    const m = getTestMonster('Abyssal demon');
    expect(isImmuneToSpell(m, findSpell('Ice Barrage'))).toBe(false);
    expect(calculatePlayerVsNpc(m, spellPlayer(m, 'Ice Barrage', 'Ancient sceptre')).dps).toBeGreaterThan(0);
  });
});

describe('Archive Guardian magic level drains', () => {
  test('accursed sceptre spec lowers Defence (to 85%) but not Magic', () => {
    // wiki: "Magic level reducing effects [Accursed sceptre], etc.) seem to be absorbed" -- only magic is absorbed
    const m = ag('Flying', { defenceReductions: { accursed: true } });
    expect(isImmuneToMagicLevelDrains(m)).toBe(true);
    expect(m.skills.magic).toBe(250);
    expect(m.skills.def).toBe(221); // trunc(260 * 17 / 20)
  });

  test('seercull spec does not lower Magic', () => {
    expect(ag('Grounded', { defenceReductions: { seercull: 30 } }).skills.magic).toBe(250);
  });

  test('magic drains still work on other monsters', () => {
    // same stats under a non-raid id
    const other = scaleMonster(getTestMonster('Archive Guardian', 'Flying', {
      id: 999999,
      inputs: { defenceReductions: { accursed: true, seercull: 10 } },
    }));
    expect(isImmuneToMagicLevelDrains(other)).toBe(false);
    expect(other.skills.magic).toBe(202); // trunc(250 * 17 / 20) - 10
  });

  test('drains do not change the Magic defence roll', () => {
    const drained = ag('Flying', { defenceReductions: { accursed: true, seercull: 50 } });
    const p = getTestPlayer(drained, {
      equipment: { ...ancestral, weapon: findEquipment("Tumeken's shadow", 'Charged') },
      skills: { magic: 99 },
    });
    expect(calculatePlayerVsNpc(drained, p).npcDefRoll).toBe(50246);
  });
});

describe('Archive Guardian sanity DPS', () => {
  test("Tumeken's shadow + Ancestral, 99 Magic, no prayers/boosts", () => {
    // Shadow (Accurate, 5 ticks): magic attack (35 + 8 + 35 + 26) * 3 = 312, effective level 99 + 2 + 9 = 110
    //   -> attack roll 110 * (312 + 64) = 41360. Defence roll (250 + 9) * (130 + 64) = 50246 (same in both versions).
    //   accuracy = 41360 / (2 * 50247) = 0.411567...
    // Max hit: trunc(99 / 3) + 1 = 34, magic damage 3 x 3% Ancestral, tripled by the shadow = 27% -> trunc(34 * 1.27) = 43.
    // Shadow has no element, so the fire weakness doesn't apply and Flying = Grounded.
    // Upstream counts an accurate 0 roll as 1: mean accurate hit = (1 + 1 + ... + 43) / 44 = 947 / 44.
    // DPS = 0.411567 * 947 / 44 / 3 s = 2.95268...
    const expected = (41360 / (2 * 50247)) * (947 / 44) / 3;
    (['Flying', 'Grounded'] as const).forEach((version) => {
      const m = ag(version);
      const p = getTestPlayer(m, {
        equipment: { ...ancestral, weapon: findEquipment("Tumeken's shadow", 'Charged') },
        skills: { magic: 99 },
      });
      const r = calculatePlayerVsNpc(m, p);
      expect(r.maxHit).toBe(43);
      expect(r.maxAttackRoll).toBe(41360);
      expect(r.dps).toBeCloseTo(expected, 6);
    });
  });

  test('Kodai + Fire Surge + Ancestral on Flying (80% fire weakness)', () => {
    // max 48, attack roll 31298 (see above); accuracy = 31298 / (2 * 50247); mean accurate hit = (1 + 1 + ... + 48) / 49
    // = 1177 / 49; 5-tick autocast -> DPS = acc * 1177 / 49 / 3 = 2.49365...
    const m = ag('Flying');
    const expected = (31298 / (2 * 50247)) * (1177 / 49) / 3;
    expect(calculatePlayerVsNpc(m, spellPlayer(m, 'Fire Surge')).dps).toBeCloseTo(expected, 6);
  });
});

describe('Archive Guardian UI parity (scripts/verifyArchiveGuardian.mjs)', () => {
  // Same inputs as the Playwright check: default player (99s, no prayers/boosts), "Max Mage" equipment preset
  // (src/app/components/player/equipment/EquipmentPresets.tsx), Kodai wand, autocast Fire Surge.
  // Max hit: 42% gear magic damage -> 24 + trunc(24 * 420 / 1000) = 34; + trunc(24 * 0.8) = 19 -> 53 (Flying),
  // + trunc(24 * 0.4) = 9 -> 43 (Grounded). DPS also includes the confliction gauntlets' accuracy effect.
  // Attack roll (99 + 9) * (170 + 64) = 25272, + trunc(25272 * 0.8) = 45489 (Flying) / + trunc(25272 * 0.4) = 35380
  // (Grounded); defence roll 50246. Confliction gauntlets (one-handed Kodai): acc = fang / (1 + fang - single)
  // (BaseCalc.getConflictionGauntletsAccuracyRoll) = 0.52441 / 0.42011. Mean accurate hit (0 -> 1): (1 + 53 * 54 / 2) / 54
  // and (1 + 43 * 44 / 2) / 44; 5-tick autocast = 3 s -> 0.52441 * 1432 / 54 / 3 = 4.636, 0.42011 * 947 / 44 / 3 = 3.014.
  const maxMageKodai = (m: Monster) => getTestPlayer(m, {
    equipment: {
      head: findEquipmentById(21018), // Ancestral hat
      cape: findEquipmentById(21791), // Imbued saradomin cape
      neck: findEquipmentById(12002), // Occult necklace
      ammo: findEquipmentById(22947), // Rada's blessing 4
      body: findEquipmentById(21021), // Ancestral robe top
      legs: findEquipmentById(21024), // Ancestral robe bottom
      hands: findEquipmentById(31106), // Confliction gauntlets
      feet: findEquipmentById(31097), // Avernic treads (max)
      ring: findEquipmentById(28313), // Magus ring
      weapon: findEquipment('Kodai wand'),
    },
    style: { name: 'Spell', type: 'magic', stance: 'Autocast' },
    spell: findSpell('Fire Surge'),
  });

  const cases: ['Flying' | 'Grounded', number, number][] = [
    ['Flying', 53, 4.636],
    ['Grounded', 43, 3.014],
  ];
  test.each(cases)('%s: max hit %d, DPS %d (values read on screen)', (version, maxHit, dps) => {
    const m = ag(version);
    const r = calculatePlayerVsNpc(m, maxMageKodai(m));
    expect(r.maxHit).toBe(maxHit);
    expect(r.dps).toBeCloseTo(dps, 3);
  });
});
