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
import { MONSTER_PHASES_BY_ID } from '@/lib/constants';
import {
  DAGONHAI_IDS,
  DAGONHAI_PHASES,
  DAGONHAI_SHIELDED_PHASE,
  DAGONHAI_UNSHIELDED_PHASE,
  EZEKIEL_IDS,
  FRACTURED_ARCHIVE_BOSS_IDS,
  MOIA_IDS,
} from '@/lib/fracturedArchive/constants';
import {
  applyDagonhaiPhase,
  DAGONHAI_SHIELD_GAUGE_DEPLETIONS,
  DAGONHAI_UNSHIELDED_HP,
  dagonhaiEncounterDamage,
} from '@/lib/fracturedArchive/dagonhai';
import { isOutOfMeleeReach } from '@/lib/fracturedArchive/immunities';
import { getFracturedArchiveDemonbaneVulnerability } from '@/lib/fracturedArchive/demonbane';
import { canStyleHit } from '@/lib/fracturedArchive/hittable';
import { maxDrainReductions } from '@/lib/fracturedArchive/drains';
import {
  BEST_SETUP_TARGETS, buildTargetMonster, findTarget, summaryQueries, targetPhases,
} from '@/lib/fracturedArchive/bestSetup';
import { DEFAULT_ASSUMPTIONS } from '@/lib/fracturedArchive/presets';
import { runGearSearch, spellsForMonster } from '@/lib/fracturedArchive/search';
import { generateEmptyPlayer } from '@/state';
import { Prayer } from '@/enums/Prayer';
import { MonsterAttribute } from '@/enums/MonsterAttribute';
import { DetailKey } from '@/lib/CalcDetails';
import Potion from '@/enums/Potion';
import { Monster } from '@/types/Monster';
import { Player } from '@/types/Player';
import { PartialDeep } from 'type-fest';

// Phase 15: Ezekiel, Moia, Dagon'hai Elder + Monks (2026-10-23).
// Sources: https://oldschool.runescape.wiki/w/Ezekiel, https://oldschool.runescape.wiki/w/Moia,
// https://oldschool.runescape.wiki/w/Dagon%27hai_Elder, https://oldschool.runescape.wiki/w/Dagon%27hai_Monk,
// https://oldschool.runescape.wiki/w/The_Fractured_Archive/Strategies (Ezekiel / Moia / Dagon'hai trio sections and the
// "Maximum defence reduction" table). Model notes: docs/DATA_SOURCES.md (phase 15).
//
// Upstream maths used in the derivations below:
//   accuracy: atk > def ? 1 - (def + 2) / (2 * (atk + 1)) : atk / (2 * (def + 1))
//   an accurate 0 is raised to 1, so a uniform 0..max hit is worth acc * (max / 2 + 1 / (max + 1))
//   NPC defence roll: (level + 9) * (bonus + 64); magic uses the NPC's Magic level

const ezekiel = (inputs: PartialDeep<Monster['inputs']> = {}) => scaleMonster(getTestMonster('Ezekiel', '', { inputs }));
const moia = (inputs: PartialDeep<Monster['inputs']> = {}) => scaleMonster(getTestMonster('Moia', '', { inputs }));
const elder = (inputs: PartialDeep<Monster['inputs']> = {}) => scaleMonster(
  getTestMonster('Dagon\'hai Elder', '', { inputs }),
);
const monk = (version: 'Staff' | 'Book', inputs: PartialDeep<Monster['inputs']> = {}) => scaleMonster(
  getTestMonster('Dagon\'hai Monk', version, { inputs }),
);

const hitAcc = (atk: number, def: number) => (atk > def ? 1 - (def + 2) / (2 * (atk + 1)) : atk / (2 * (def + 1)));
const uniformHit = (acc: number, max: number) => acc * (max / 2 + 1 / (max + 1));

// "Max Melee" preset (Torva, Infernal cape, Amulet of rancour, Rada's blessing 4, Avernic defender, Ferocious gloves,
// Avernic treads (max), Ultor ring) + Inquisitor's mace (str +96, crush +102; no Inquisitor pieces worn, so no set
// bonus), 99s + Super combat (118 Attack/Strength), Piety, Pummel (aggressive crush). 4-tick weapon -> 2.4 s.
//   Strength bonus 174, crush bonus 180 (the calculator's gear totals, asserted below).
//   Effective str trunc(118 * 1.23) = 145 + 3 + 8 = 156 -> max trunc((156 * (174 + 64) + 320) / 640) = 58.
//   Effective atk trunc(118 * 1.2) = 141 + 8 = 149 -> roll 149 * (180 + 64) = 36356.
const MACE_MAX = 58;
const MACE_ROLL = 36356;
const maxMeleeMace = (m: Monster): Player => getTestPlayer(m, {
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
    weapon: findEquipment('Inquisitor\'s mace'),
  },
  style: { name: 'Pummel', type: 'crush', stance: 'Aggressive' },
  skills: { atk: 99, str: 99 },
  boosts: { atk: 19, str: 19 },
  prayers: [Prayer.PIETY],
  buffs: { potions: [Potion.SUPER_COMBAT] },
});

// "Max Mage" preset + Tumeken's shadow (charged, Accurate), Saturated heart (112 Magic), Augury — same loadout and
// derivation as Ocellus.test.ts: roll 151 * (531 + 64) = 89845, max 38 + trunc(38 * 850 / 1000) = 70, 3.0 s.
const SHADOW_ROLL = 89845;
const SHADOW_MAX = 70;
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
    weapon: findEquipment('Tumeken\'s shadow', 'Charged'),
  },
  skills: { magic: 99 },
  boosts: { magic: 13 },
  prayers: [Prayer.AUGURY],
  buffs: { potions: [Potion.SATURATED_HEART] },
});

// no weapon, 99 Magic: magic attack roll (99 + 9) * (0 + 64) = 6912; surges have base max 24
const spellPlayer = (m: Monster, spell: string) => getTestPlayer(m, {
  style: { name: 'Autocast', type: 'magic', stance: 'Autocast' },
  spell: findSpell(spell),
  skills: { magic: 99 },
});

describe('ids, stats and attributes (wiki infoboxes, 2026-10-23)', () => {
  test('monsters.json entries use the listed ids and the infobox stats', () => {
    const e = ezekiel();
    expect(EZEKIEL_IDS).toContain(e.id);
    expect(e.skills).toEqual({
      atk: 250, def: 130, hp: 3000, magic: 200, ranged: 80, str: 150,
    });
    expect(e.defensive).toMatchObject({
      stab: 150, slash: 90, crush: 35, magic: 200, light: 445, standard: 370, heavy: 320, flat_armour: 0,
    });
    expect(e.weakness).toEqual({ element: 'earth', severity: 25 });
    expect(e.size).toBe(3);

    const m = moia();
    expect(MOIA_IDS).toContain(m.id);
    expect(m.skills).toEqual({
      atk: 1, def: 195, hp: 785, magic: 350, ranged: 200, str: 1,
    });
    expect(m.defensive).toMatchObject({
      stab: 20, slash: 110, crush: 15, magic: 30, light: 60, standard: 120, heavy: 140, flat_armour: 0,
    });
    expect(m.weakness).toEqual({ element: 'air', severity: 80 });

    // "The elder and monks share the same stats and health pool"
    [elder(), monk('Staff'), monk('Book')].forEach((d) => {
      expect(DAGONHAI_IDS).toContain(d.id);
      expect(d.skills).toEqual({
        atk: 1, def: 100, hp: 640, magic: 290, ranged: 260, str: 1,
      });
      expect(d.defensive).toMatchObject({
        stab: 50, slash: 50, crush: 50, magic: 100, light: 80, standard: 80, heavy: 80, flat_armour: 0,
      });
      expect(d.weakness).toBeNull();
      expect(d.size).toBe(2);
    });
  });

  test('no attributes, so no demonbane / undead / flying effects; all are party-scaled bosses', () => {
    [ezekiel(), moia(), elder(), monk('Staff'), monk('Book')].forEach((m) => {
      expect(m.attributes).toEqual([]);
      expect(getFracturedArchiveDemonbaneVulnerability(m)).toBeUndefined();
      expect(FRACTURED_ARCHIVE_BOSS_IDS).toContain(m.id);
    });
  });

  test('Arclight gets no demonbane bonus on Ezekiel (not a demon)', () => {
    const m = ezekiel();
    const arclight = (mon: Monster) => getTestPlayer(mon, {
      equipment: { weapon: findEquipment('Arclight', 'Charged') },
      style: { name: 'Slash', type: 'slash', stance: 'Aggressive' },
      skills: { atk: 99, str: 99 },
    });
    const r = calculatePlayerVsNpc(m, arclight(m));
    expect(findResult(r.details, DetailKey.PLAYER_DEMONBANE_FACTOR)).toBeUndefined();
    // the same Ezekiel tagged as a demon would get Arclight's +70%
    const demon = { ...m, attributes: [MonsterAttribute.DEMON] };
    const d = calculatePlayerVsNpc(demon, arclight(demon));
    expect(d.maxHit).toBe(r.maxHit + Math.trunc(r.maxHit * 0.7));
  });
});

describe('elemental weaknesses (infobox, upstream spell-element code)', () => {
  test('Ezekiel: earth 25%', () => {
    const m = ezekiel();
    const r = calculatePlayerVsNpc(m, spellPlayer(m, 'Earth Surge'));
    expect(r.maxHit).toBe(30); // 24 + trunc(24 * 25 / 100)
    expect(r.maxAttackRoll).toBe(8640); // 6912 + trunc(6912 * 25 / 100)
    expect(r.npcDefRoll).toBe(55176); // (200 + 9) * (200 + 64)
    const f = calculatePlayerVsNpc(m, spellPlayer(m, 'Fire Surge'));
    expect(f.maxHit).toBe(24);
    expect(f.maxAttackRoll).toBe(6912);
  });

  test('Moia: air 80%', () => {
    const m = moia();
    const r = calculatePlayerVsNpc(m, spellPlayer(m, 'Wind Surge'));
    expect(r.maxHit).toBe(43); // 24 + trunc(24 * 80 / 100) = 24 + 19
    expect(r.maxAttackRoll).toBe(12441); // 6912 + trunc(6912 * 0.8) = 6912 + 5529
    expect(r.npcDefRoll).toBe(33746); // (350 + 9) * (30 + 64)
    expect(r.accuracy).toBeCloseTo(hitAcc(12441, 33746), 10);
  });

  test('Dagon\'hai: no weakness', () => {
    const m = elder();
    const r = calculatePlayerVsNpc(m, spellPlayer(m, 'Fire Surge'));
    expect(r.maxHit).toBe(24);
    expect(r.maxAttackRoll).toBe(6912);
    expect(r.npcDefRoll).toBe(49036); // (290 + 9) * (100 + 64)
  });
});

describe('Moia: out of melee reach ("A ranged or magic weapon is required ... too far to reach with melee or halberds")', () => {
  test('melee deals 0 with an on-screen reason; ranged and magic hit', () => {
    const m = moia();
    expect(isOutOfMeleeReach(m)).toBe(true);
    const r = calculatePlayerVsNpc(m, maxMeleeMace(m));
    expect(r.dps).toBe(0);
    expect(r.maxHit).toBe(0);
    expect(canStyleHit(m, 'melee')).toBe(false);
    expect(canStyleHit(m, 'ranged')).toBe(true);
    expect(canStyleHit(m, 'magic')).toBe(true);
  });

  test('halberds are blocked too (unlike the flying rule)', () => {
    const m = moia();
    const halberd = calculatePlayerVsNpc(m, getTestPlayer(m, {
      equipment: { weapon: findEquipment('Noxious halberd') },
      style: { name: 'Swipe', type: 'slash', stance: 'Aggressive' },
      skills: { atk: 99, str: 99 },
    }));
    expect(halberd.dps).toBe(0);
  });

  test('the melee mace hits Ezekiel and the Dagon\'hai normally (the rule is Moia-only)', () => {
    [ezekiel(), elder()].forEach((m) => {
      expect(isOutOfMeleeReach(m)).toBe(false);
      expect(canStyleHit(m, 'melee')).toBe(true);
      expect(calculatePlayerVsNpc(m, maxMeleeMace(m)).dps).toBeGreaterThan(0);
    });
  });

  test('drain plans skip melee: 2 Tonalztics hits reach 117 (= the wiki table\'s "2 Tonalztics of Ralos")', () => {
    // trunc(350 / 8) = 43 per hit: 195 -> 152 -> 109, capped at 117
    (['elderMaul', 'dwh', 'bgs'] as const).forEach((weapon) => {
      const plan = maxDrainReductions(moia(), { weapon, ayak: false });
      expect(plan.weaponCanHit).toBe(false);
      expect(plan.reductions).toMatchObject({
        elderMaul: 0, dwh: 0, bgs: 0, tonalztic: 2,
      });
      expect(plan.defAfter).toBe(117);
    });
    expect(moia({ defenceReductions: { tonalztic: 1 } }).skills.def).toBe(152);
  });
});

describe('Dagon\'hai shield gauge / unshielded phase', () => {
  test('every Dagon\'hai id has the Phase dropdown, shielded first (default)', () => {
    DAGONHAI_IDS.forEach((id) => expect(MONSTER_PHASES_BY_ID[id]).toEqual(DAGONHAI_PHASES));
    expect(DAGONHAI_PHASES[0]).toBe(DAGONHAI_SHIELDED_PHASE);
    expect(MONSTER_PHASES_BY_ID[EZEKIEL_IDS[0]]).toBeUndefined();
    expect(MONSTER_PHASES_BY_ID[MOIA_IDS[0]]).toBeUndefined();
  });

  test('shielded / no phase = infobox 640 at every party size; unshielded = 7 hp, not party-scaled', () => {
    expect(elder().skills.hp).toBe(640);
    expect(elder({ phase: DAGONHAI_SHIELDED_PHASE, partySize: 8 }).skills.hp).toBe(640);
    expect(elder({ phase: DAGONHAI_UNSHIELDED_PHASE }).skills.hp).toBe(DAGONHAI_UNSHIELDED_HP);
    expect(elder({ phase: DAGONHAI_UNSHIELDED_PHASE, partySize: 8 }).skills.hp).toBe(7);
    expect(monk('Book', { phase: DAGONHAI_UNSHIELDED_PHASE }).skills.hp).toBe(7);
    expect(monk('Staff', { phase: DAGONHAI_UNSHIELDED_PHASE }).skills.hp).toBe(7);
  });

  test('the phase changes hp only (no stat or DPS change), and only for Dagon\'hai ids', () => {
    const shielded = elder();
    const unshielded = elder({ phase: DAGONHAI_UNSHIELDED_PHASE });
    expect({ ...unshielded.skills, hp: 640 }).toEqual(shielded.skills);
    expect(unshielded.defensive).toEqual(shielded.defensive);
    expect(calculatePlayerVsNpc(unshielded, maxMeleeMace(unshielded)).dps)
      .toBe(calculatePlayerVsNpc(shielded, maxMeleeMace(shielded)).dps);
    // a stale phase string on another monster does nothing
    const e = ezekiel();
    expect(applyDagonhaiPhase({ ...e, inputs: { ...e.inputs, phase: DAGONHAI_UNSHIELDED_PHASE } }).skills.hp).toBe(3000);
  });

  test('encounter damage = 5 shared gauges + the 7-hp remainder', () => {
    expect(DAGONHAI_SHIELD_GAUGE_DEPLETIONS).toBe(5);
    expect(dagonhaiEncounterDamage(640)).toBe(3207);
  });

  test('Elder and both Monks take identical damage (shared stats)', () => {
    const e = elder();
    const dps = calculatePlayerVsNpc(e, maxMageShadow(e)).dps;
    [monk('Staff'), monk('Book')].forEach((m) => expect(calculatePlayerVsNpc(m, maxMageShadow(m)).dps).toBe(dps));
  });
});

describe('defence floors (60% hotfix: Ezekiel 78, Moia 117; Dagon\'hai uncapped)', () => {
  test('Ezekiel stops at 78 (130 * 0.6)', () => {
    expect(ezekiel({ defenceReductions: { dwh: 1 } }).skills.def).toBe(91); // 130 - trunc(130 * 0.3)
    expect(ezekiel({ defenceReductions: { dwh: 10 } }).skills.def).toBe(78);
    expect(ezekiel({ defenceReductions: { bgs: 5000 } }).skills.def).toBe(78);
    expect(ezekiel({ defenceReductions: { elderMaul: 5, bgs: 5000 } }).skills.def).toBe(78);
    // the wiki table's "2 Elder Maul": 130 -> 85 -> 56, capped at 78
    expect(maxDrainReductions(ezekiel(), { weapon: 'elderMaul', ayak: false }).reductions.elderMaul).toBe(2);
    // mace vs 78 Defence: crush def roll (78 + 9) * (35 + 64) = 8613
    const m = ezekiel({ defenceReductions: { dwh: 10, bgs: 5000 } });
    const r = calculatePlayerVsNpc(m, maxMeleeMace(m));
    expect(r.npcDefRoll).toBe(8613);
    expect(r.dps).toBeCloseTo(uniformHit(hitAcc(MACE_ROLL, 8613), MACE_MAX) / 2.4, 10);
  });

  test('Moia stops at 117 (195 * 0.6)', () => {
    expect(moia({ defenceReductions: { dwh: 1 } }).skills.def).toBe(137); // 195 - trunc(195 * 0.3)
    expect(moia({ defenceReductions: { dwh: 10 } }).skills.def).toBe(117);
    expect(moia({ defenceReductions: { bgs: 5000 } }).skills.def).toBe(117);
    expect(moia({ defenceReductions: { tonalztic: 8 } }).skills.def).toBe(117);
    // shadow vs 117 Defence: magic def roll uses the Magic level, so Defence drains don't change magic accuracy
    const m = moia({ defenceReductions: { bgs: 5000 } });
    expect(calculatePlayerVsNpc(m, maxMageShadow(m)).npcDefRoll).toBe(33746);
  });

  test('Dagon\'hai drain to 0 (the news post: "no cap ... the Dagon\'Hai Trio")', () => {
    expect(elder({ defenceReductions: { dwh: 1 } }).skills.def).toBe(70); // 100 - trunc(100 * 0.3)
    expect(elder({ defenceReductions: { bgs: 5000 } }).skills.def).toBe(0);
    expect(monk('Book', { defenceReductions: { bgs: 5000 } }).skills.def).toBe(0);
    // 1 Elder maul (100 -> 65) + 2 Tonalztics hits (2 * trunc(290 / 8) = 72) -> 0
    const plan = maxDrainReductions(elder(), { weapon: 'elderMaul', ayak: false });
    expect(plan.reductions).toMatchObject({ elderMaul: 1, tonalztic: 2 });
    expect(plan.defAfter).toBe(0);
    // mace vs 0 Defence: crush def roll 9 * (50 + 64) = 1026
    const m = elder({ defenceReductions: { bgs: 5000 } });
    const r = calculatePlayerVsNpc(m, maxMeleeMace(m));
    expect(r.npcDefRoll).toBe(1026);
    expect(r.dps).toBeCloseTo(uniformHit(hitAcc(MACE_ROLL, 1026), MACE_MAX) / 2.4, 10);
  });
});

describe('real loadout sanity check / UI parity (scripts/verifyPhase15.mjs)', () => {
  test('melee loadout totals', () => {
    const m = ezekiel();
    const p = maxMeleeMace(m);
    expect(p.bonuses.str).toBe(174);
    expect(p.offensive.crush).toBe(180);
  });

  // [name, monster, crush def roll, melee dps (rounded as the UI shows), magic def roll, magic dps]
  // crush def rolls: Ezekiel (130 + 9) * (35 + 64) = 13761, Dagon'hai (100 + 9) * (50 + 64) = 12426
  // magic def rolls: Ezekiel 209 * 264 = 55176, Moia 359 * 94 = 33746, Dagon'hai 299 * 164 = 49036
  const cases: [string, () => Monster, number | null, number, number, number][] = [
    ['Ezekiel', ezekiel, 13761, 9.802, 55176, 8.087],
    ['Moia', moia, null, 0, 33746, 9.479],
    ['Dagon\'hai Elder', elder, 12426, 10.024, 49036, 8.486],
  ];
  test.each(cases)('%s', (_, monster, meleeDef, meleeDps, magicDef, magicDps) => {
    const m = monster();
    const melee = calculatePlayerVsNpc(m, maxMeleeMace(m));
    if (meleeDef === null) {
      expect(melee.dps).toBe(0);
    } else {
      expect(melee.maxHit).toBe(MACE_MAX);
      expect(melee.maxAttackRoll).toBe(MACE_ROLL);
      expect(melee.npcDefRoll).toBe(meleeDef);
      expect(melee.dps).toBeCloseTo(uniformHit(hitAcc(MACE_ROLL, meleeDef), MACE_MAX) / 2.4, 10);
      expect(melee.dps).toBeCloseTo(meleeDps, 3);
    }
    const mage = calculatePlayerVsNpc(m, maxMageShadow(m));
    expect(mage.maxHit).toBe(SHADOW_MAX);
    expect(mage.maxAttackRoll).toBe(SHADOW_ROLL);
    expect(mage.npcDefRoll).toBe(magicDef);
    expect(mage.dps).toBeCloseTo(uniformHit(hitAcc(SHADOW_ROLL, magicDef), SHADOW_MAX) / 3, 10);
    expect(mage.dps).toBeCloseTo(magicDps, 3);
  });
});

describe('best setup: Summary rows and search', () => {
  test('the three encounters are targets in route order, with their default phase in the Summary', () => {
    const keys = BEST_SETUP_TARGETS.map((t) => t.key);
    expect(keys.indexOf('ezekiel')).toBe(keys.indexOf('bork') + 1);
    expect(keys.indexOf('moia')).toBe(keys.indexOf('jelly') + 1);
    expect(keys.indexOf('dagonhai')).toBe(keys.indexOf('xarth') + 1);
    const rows = summaryQueries();
    expect(rows.filter((r) => r.targetKey === 'ezekiel')).toEqual([{ targetKey: 'ezekiel', phase: undefined }]);
    expect(rows.filter((r) => r.targetKey === 'moia')).toEqual([{ targetKey: 'moia', phase: undefined }]);
    expect(rows.filter((r) => r.targetKey === 'dagonhai'))
      .toEqual([{ targetKey: 'dagonhai', phase: DAGONHAI_SHIELDED_PHASE }]);
    expect(targetPhases(findTarget('dagonhai'))).toEqual(DAGONHAI_PHASES);
    expect(targetPhases(findTarget('ezekiel'))).toEqual([]);
  });

  test('targets build the calculator monster (phase, party size)', () => {
    const { monster } = buildTargetMonster(findTarget('dagonhai'), DAGONHAI_UNSHIELDED_PHASE, 'none', DEFAULT_ASSUMPTIONS);
    expect(monster.inputs.phase).toBe(DAGONHAI_UNSHIELDED_PHASE);
    expect(buildTargetMonster(findTarget('moia'), undefined, 'none', DEFAULT_ASSUMPTIONS).monster.id).toBe(MOIA_IDS[0]);
  });

  test('search spell list follows the weakness (Earth Surge on Ezekiel, Wind Surge on Moia)', () => {
    const surges = ['Fire Surge', 'Water Surge', 'Earth Surge', 'Wind Surge'];
    expect(spellsForMonster(surges, ezekiel())).toEqual(['Fire Surge', 'Earth Surge']);
    expect(spellsForMonster(surges, moia())).toEqual(['Fire Surge', 'Wind Surge']);
    expect(spellsForMonster(surges, elder())).toEqual(['Fire Surge']);
  });

  const WEAPONS = ['Scythe of Vitur', 'Noxious halberd', 'Twisted bow', 'Harmonised Nightmare staff'];
  test.each(['ezekiel', 'moia', 'dagonhai'])('%s: the search runs and returns rows', (key) => {
    const r = runGearSearch(generateEmptyPlayer(), { targetKey: key, drain: 'none', styles: 'all' }, DEFAULT_ASSUMPTIONS, {
      weapons: WEAPONS, topN: 5,
    });
    expect(r.cancelled).toBe(false);
    expect(r.rows.length).toBeGreaterThan(0);
    expect(r.rows[0].dps).toBeGreaterThan(0);
    if (key === 'moia') {
      expect(r.rows.every((row) => row.group !== 'melee')).toBe(true);
      expect(r.cantHit.map((c) => c.weapon)).toEqual(expect.arrayContaining(['Scythe of Vitur', 'Noxious halberd']));
      expect(r.cantHit.find((c) => c.weapon === 'Scythe of Vitur')!.reason).toMatch(/reach/i);
    } else {
      expect(r.cantHit).toEqual([]);
    }
  });
});
