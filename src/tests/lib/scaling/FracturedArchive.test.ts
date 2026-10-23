import {
  afterEach, describe, expect, test,
} from '@jest/globals';
import {
  calculatePlayerVsNpc,
  findEquipmentById,
  findResult,
  getTestMonster,
  getTestMonsterById,
  getTestPlayer,
} from '@/tests/utils/TestUtils';
import { scaleMonster } from '@/lib/MonsterScaling';
import applyFracturedArchiveScaling, {
  FRACTURED_ARCHIVE_HP_SCALING,
  getFracturedArchiveDefenceFloor,
  getFracturedArchivePartySize,
} from '@/lib/scaling/FracturedArchive';
import { getDefenceFloor } from '@/lib/scaling/DefenceReduction';
import {
  FRACTURED_ARCHIVE_BOSS_IDS,
  FRACTURED_ARCHIVE_MONSTER_IDS,
  MONSTER_PHASES_BY_ID,
  OCELLUS_P2_IDS,
  PARTY_SIZE_REQUIRED_MONSTER_IDS,
  TD_IDS,
} from '@/lib/constants';
import { DetailKey } from '@/lib/CalcDetails';
import { Monster } from '@/types/Monster';
import { PartialDeep } from 'type-fest';

const AG = 16659;
const SMORKS = 16641;
const BORK = 16640;
const DREADNOTH = 16665;
const JELLY = 16666;
const XARTH = 16684;
const OCELLUS_P1 = 16673;
const OCELLUS_P2 = 100090;
const OCELLUS_P3 = 16677;
const EZEKIEL = 16652;
const MOIA = 16667;

const withDrains = (id: number, defenceReductions: PartialDeep<Monster['inputs']['defenceReductions']>, partySize: number = 2) => scaleMonster(
  getTestMonsterById(id, { inputs: { partySize, defenceReductions } }),
);

describe('Fractured Archive constants', () => {
  test('every raid monster id is in monsters.json once', () => {
    [AG, SMORKS, BORK, DREADNOTH, JELLY, XARTH, OCELLUS_P1, OCELLUS_P2, OCELLUS_P3, EZEKIEL, MOIA]
      .forEach((id) => {
        expect(FRACTURED_ARCHIVE_MONSTER_IDS).toContain(id);
        expect(getTestMonsterById(id).id).toBe(id);
      });
  });

  test('Ocellus P2 ids are the P2 NPC and The Blade hitbox, not the vault-entry NPC', () => {
    expect(OCELLUS_P2_IDS).toEqual([100090, 16675, 16676]);
    expect(FRACTURED_ARCHIVE_MONSTER_IDS).not.toContain(16683);
    expect(getFracturedArchiveDefenceFloor({ ...getTestMonsterById(AG), id: 16676 })).toBe(0);
    expect(getFracturedArchiveDefenceFloor({ ...getTestMonsterById(AG), id: 16660 })).toBe(156);
  });

  test('party size input is shown for bosses only', () => {
    FRACTURED_ARCHIVE_BOSS_IDS.forEach((id) => expect(PARTY_SIZE_REQUIRED_MONSTER_IDS).toContain(id));
    expect(PARTY_SIZE_REQUIRED_MONSTER_IDS).not.toContain(JELLY);
  });
});

describe('Fractured Archive defence floors', () => {
  // [id, base defence, floor] -- Strategies "Maximum defence reduction" table / boss pages, 2026-10-22
  const floors: [string, number, number, number][] = [
    ['Archive Guardian', AG, 260, 156],
    ['Bork', BORK, 300, 180],
    ['Xarth', XARTH, 170, 102],
    ['Ocellus P1', OCELLUS_P1, 215, 129],
    ['Ocellus P3', OCELLUS_P3, 250, 150],
    ['Ezekiel', EZEKIEL, 130, 78],
    ['Moia', MOIA, 195, 117],
    ['Ocellus P2 (unverified)', OCELLUS_P2, 250, 0],
    ['The Smorks', SMORKS, 220, 0],
    ['Dreadnoth', DREADNOTH, 125, 0],
    ['Jelly (Dreadnoth)', JELLY, 100, 0],
  ];

  test.each(floors)('%s floor', (_, id, baseDef, floor) => {
    const m = getTestMonsterById(id);
    expect(m.skills.def).toBe(baseDef);
    expect(getFracturedArchiveDefenceFloor(m)).toBe(floor);
    expect(getDefenceFloor(m)).toBe(floor);
    // capped bosses are at 60% of base defence (21 Oct 2026 hotfix)
    if (floor > 0) {
      expect(floor).toBe(Math.trunc(baseDef * 6 / 10));
    }
  });

  test.each(floors)('%s: a huge BGS spec drains defence to the floor', (_, id, baseDef, floor) => {
    expect(withDrains(id, { bgs: 5000 }).skills.def).toBe(floor);
  });

  test('4 DWH specs on Archive Guardian land at 156, not lower', () => {
    // 260 -> 182 -> 128 (floored to 156) -> 156 -> 156
    expect(withDrains(AG, { dwh: 1 }).skills.def).toBe(182);
    expect(withDrains(AG, { dwh: 2 }).skills.def).toBe(156);
    expect(withDrains(AG, { dwh: 4 }).skills.def).toBe(156);
    expect(withDrains(AG, { dwh: 4 }, 8).skills.def).toBe(156);
  });

  test('arclight / emberlight on Archive Guardian stop at 156', () => {
    // not a demon: each hit drains trunc(260 / 20) + 1 = 14
    expect(withDrains(AG, { arclight: 3 }).skills.def).toBe(218);
    expect(withDrains(AG, { arclight: 10 }).skills.def).toBe(156);
    expect(withDrains(AG, { emberlight: 10 }).skills.def).toBe(156);
  });

  test('tonalztic specs on Archive Guardian stop at 156', () => {
    // each spec drains trunc(magic 250 / 8) = 31: 260 -> 229 -> 198 -> 167 -> 136 (floored to 156)
    expect(withDrains(AG, { tonalztic: 3 }).skills.def).toBe(167);
    expect(withDrains(AG, { tonalztic: 4 }).skills.def).toBe(156);
    expect(withDrains(AG, { tonalztic: 8 }).skills.def).toBe(156);
  });

  test('accursed sceptre on Archive Guardian respects the 156 floor', () => {
    // 260 * 17/20 = 221, then a DWH spec would take it to 155
    expect(withDrains(AG, { accursed: true }).skills.def).toBe(221);
    expect(withDrains(AG, { accursed: true, dwh: 1 }).skills.def).toBe(156);
  });

  test('The Smorks drain to 0', () => {
    expect(withDrains(SMORKS, { dwh: 4 }).skills.def).toBe(54);
    expect(withDrains(SMORKS, { elderMaul: 2, bgs: 100 }).skills.def).toBe(0);
  });

  test('Xarth and Ocellus P3 respect their floors with elder maul specs', () => {
    expect(withDrains(XARTH, { elderMaul: 3 }).skills.def).toBe(102);
    expect(withDrains(OCELLUS_P3, { elderMaul: 1 }).skills.def).toBe(163);
    expect(withDrains(OCELLUS_P3, { elderMaul: 2 }).skills.def).toBe(150);
  });
});

describe('Fractured Archive party size hp scaling', () => {
  afterEach(() => {
    FRACTURED_ARCHIVE_HP_SCALING[5] = [1, 1];
  });

  test('party size is clamped to 2-8 (solo scales as 2)', () => {
    const size = (partySize: number) => getFracturedArchivePartySize(getTestMonsterById(AG, { inputs: { partySize } }));
    expect(size(0)).toBe(2);
    expect(size(1)).toBe(2);
    expect(size(2)).toBe(2);
    expect(size(5)).toBe(5);
    expect(size(8)).toBe(8);
    expect(size(100)).toBe(8);
  });

  test('scaling table covers every party size', () => {
    for (let i = 2; i <= 8; i++) {
      expect(FRACTURED_ARCHIVE_HP_SCALING[i]).toBeDefined();
    }
  });

  // unverified: no published scaling, so every size keeps the wiki infobox hp
  test.each([
    ['Archive Guardian', AG, 550],
    ['Ocellus P3', OCELLUS_P3, 5250],
    ['Xarth', XARTH, 2600],
  ])('%s keeps infobox hp at sizes 1, 2, 5 and 8', (_, id, hp) => {
    [1, 2, 5, 8].forEach((partySize) => {
      expect(scaleMonster(getTestMonsterById(id, { inputs: { partySize } })).skills.hp).toBe(hp);
    });
  });

  test('scaling applies the table factor for the clamped party size', () => {
    FRACTURED_ARCHIVE_HP_SCALING[5] = [3, 2];
    expect(applyFracturedArchiveScaling(getTestMonsterById(AG, { inputs: { partySize: 5 } })).skills.hp).toBe(825);
    expect(applyFracturedArchiveScaling(getTestMonsterById(OCELLUS_P3, { inputs: { partySize: 5 } })).skills.hp).toBe(7875);
    expect(applyFracturedArchiveScaling(getTestMonsterById(AG, { inputs: { partySize: 4 } })).skills.hp).toBe(550);
    // adds and other monsters are untouched
    expect(applyFracturedArchiveScaling(getTestMonsterById(JELLY, { inputs: { partySize: 5 } })).skills.hp).toBe(61);
    expect(applyFracturedArchiveScaling(getTestMonster('Abyssal demon', '', { inputs: { partySize: 5 } })).skills.hp).toBe(150);
  });
});

describe('Xarth is not a Tormented Demon', () => {
  test('not in the TD id list and has no TD phases', () => {
    expect(TD_IDS).not.toContain(XARTH);
    expect(MONSTER_PHASES_BY_ID[XARTH]).toBeUndefined();
    expect(getTestMonsterById(XARTH).name).not.toBe('Tormented Demon');
  });

  test('demonbane (arclight) works normally, without TD accuracy/damage overrides', () => {
    const xarth = getTestMonsterById(XARTH);
    const player = getTestPlayer(xarth, {
      skills: { atk: 99, str: 99 },
      equipment: { weapon: findEquipmentById(19675) }, // Arclight
      style: { name: 'Slash', type: 'slash', stance: 'Aggressive' },
    });

    const result = calculatePlayerVsNpc(xarth, player);
    expect(findResult(result.details, DetailKey.PLAYER_ACCURACY_DEMONBANE)).toBeDefined();
    expect(findResult(result.details, DetailKey.PLAYER_ACCURACY_TD)).toBeUndefined();
    expect(result.accuracy).toBeLessThan(1);

    // identical to a custom demon with the same stats and Xarth's 80% demonbane effectiveness (phase 5,
    // src/lib/fracturedArchive/demonbane.ts)
    const genericDemon: Monster = {
      ...xarth, id: -1, name: 'Generic demon', inputs: { ...xarth.inputs, demonbaneVulnerability: 80 },
    };
    const generic = calculatePlayerVsNpc(genericDemon, player);
    expect(result.dps).toBe(generic.dps);
    expect(result.maxHit).toBe(generic.maxHit);
  });
});
