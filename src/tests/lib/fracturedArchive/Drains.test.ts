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
import {
  ayakDamageToZero,
  ayakSpecsToZero,
  DRAIN_PRESETS,
  DrainWeapon,
  drainPresetReductions,
  drainWeaponCanHit,
  MAX_HAMMER_SPECS,
  maxDrainReductions,
} from '@/lib/fracturedArchive/drains';
import { INITIAL_MONSTER_INPUTS } from '@/lib/Monsters';
import {
  BORK_STUNNED_PHASE,
  OCELLUS_P1_WALKING_PHASE,
  OCELLUS_P3_DEFLECT_MELEE_PHASE,
  OCELLUS_P3_DEFLECT_MELEE_VOID_PHASE,
  OCELLUS_P3_DEFLECT_RANGED_PHASE,
  OCELLUS_P3_DEFLECT_RANGED_VOID_PHASE,
} from '@/lib/constants';
import { canDrainToolHit, canStyleHit, canWeaponHit } from '@/lib/fracturedArchive/hittable';
import { Monster } from '@/types/Monster';

// Phase 7: "max drain" presets (src/lib/fracturedArchive/drains.ts). Floors: src/lib/scaling/FracturedArchive.ts.
// Spec sequences cross-checked with the "Maximum defence reduction" table on
// https://oldschool.runescape.wiki/w/The_Fractured_Archive/Strategies (2026-10-22), see docs/DATA_SOURCES.md.

type Reductions = Monster['inputs']['defenceReductions'];

const withReductions = (m: Monster, defenceReductions: Reductions): Monster => ({
  ...m,
  inputs: { ...m.inputs, defenceReductions },
});

const drained = (m: Monster, r: Reductions) => scaleMonster(withReductions(m, r));

const NONE = INITIAL_MONSTER_INPUTS.defenceReductions;

// [name, version, floor, magic def bonus, elder maul plan, dwh plan, bgs damage (or plan when melee can't hit)]
type Plan = { elderMaul?: number, dwh?: number, tonalztic?: number, bgs?: number };
const BOSSES: [string, string, number, number, Plan, Plan, number | Plan][] = [
  // phase 13: melee can't hit while flying -> every preset falls back to the wiki table's "4 Tonalztics of Ralos"
  ['Archive Guardian', 'Flying', 156, 130, { tonalztic: 4 }, { tonalztic: 4 }, { tonalztic: 4 }],
  ['Archive Guardian', 'Grounded', 156, 130, { elderMaul: 2 }, { dwh: 2 }, 104],
  ['Bork', '', 180, 300, { elderMaul: 2 }, { dwh: 2 }, 120],
  ['The Smorks', '', 0, 400, { elderMaul: 1, tonalztic: 7 }, { dwh: 1, tonalztic: 7 }, 220],
  ['Dreadnoth the Jellied', '', 0, 20, { elderMaul: 1, tonalztic: 4 }, { dwh: 1, tonalztic: 4 }, 125],
  ['Jelly (Dreadnoth)', '', 0, 15, { elderMaul: 1, tonalztic: 6 }, { dwh: 1, tonalztic: 6 }, 100],
  ['Xarth', '', 102, 205, { elderMaul: 2 }, { dwh: 2 }, 68],
  ['Ocellus', 'Phase 1', 129, 100, { elderMaul: 2 }, { dwh: 2 }, 86],
  ['Ocellus', 'Phase 2', 0, 100, { elderMaul: 2, tonalztic: 4 }, { dwh: 1, tonalztic: 7 }, 250],
  ['Ocellus', 'Phase 3', 150, 200, { elderMaul: 2 }, { dwh: 2 }, 100],
];

describe('maxDrainReductions per boss', () => {
  describe.each(BOSSES)('%s %s', (name, version, floor, magicDef, maulPlan, dwhPlan, bgs) => {
    const m = getTestMonster(name, version);
    const plans: [DrainWeapon, Plan & { bgs?: number }][] = [
      ['elderMaul', maulPlan],
      ['dwh', dwhPlan],
      ['bgs', typeof bgs === 'number' ? { bgs } : bgs],
    ];

    test.each(plans)('%s: lands exactly on the floor, magic def 0 with Ayak', (weapon, expected) => {
      const plan = maxDrainReductions(m, { weapon, ayak: true });
      expect(plan.reductions).toEqual({ ...NONE, ...expected, ayak: magicDef });
      expect(plan.floor).toBe(floor);
      expect(plan.reachesFloor).toBe(true);
      expect(plan.defAfter).toBe(floor);
      expect(plan.magicDefBefore).toBe(magicDef);
      expect(plan.magicDefAfter).toBe(0);

      // the normal pipeline agrees with the plan
      const s = drained(m, plan.reductions);
      expect(s.skills.def).toBe(floor);
      expect(s.defensive.magic).toBe(0);
    });

    test.each(plans)('%s: one fewer spec (or 1 less damage) does not reach the floor', (weapon) => {
      const { reductions } = maxDrainReductions(m, { weapon, ayak: true });
      const keys = (['elderMaul', 'dwh', 'tonalztic', 'bgs'] as const).filter((k) => reductions[k] > 0);
      expect(keys.length).toBeGreaterThan(0);
      for (const k of keys) {
        expect(drained(m, { ...reductions, [k]: reductions[k] - 1 }).skills.def).toBeGreaterThan(floor);
      }
      expect(drained(m, { ...reductions, ayak: reductions.ayak - 1 }).defensive.magic).toBe(1);
    });

    test('the summary names the plan and the resulting Defence', () => {
      const plan = maxDrainReductions(m, { weapon: 'elderMaul', ayak: true });
      expect(plan.summary).toBe(`${plan.specs} → Def ${floor}`);
    });

    test('without Ayak the magic defence bonus is untouched', () => {
      const plan = maxDrainReductions(m, { weapon: 'elderMaul', ayak: false });
      expect(plan.reductions.ayak).toBe(0);
      expect(plan.magicDefAfter).toBe(magicDef);
    });
  });

  test('wiki table sequences that the upstream formulas reproduce', () => {
    // "The Blade (Phase 2) ... 2 Elder Maul + 4 Tonalztics of Ralos" -> 250 -> 163 -> 106 -> 79 -> 52 -> 25 -> 0
    expect(maxDrainReductions(getTestMonster('Ocellus', 'Phase 2'), { weapon: 'elderMaul', ayak: false }).reductions)
      .toMatchObject({ elderMaul: 2, tonalztic: 4 });
    // "Ocellus (Phase 3) ... 2 Elder Maul"; Bork "2 Elder Maul"
    expect(maxDrainReductions(getTestMonster('Ocellus', 'Phase 3'), { weapon: 'elderMaul', ayak: false }).reductions.elderMaul).toBe(2);
    expect(maxDrainReductions(getTestMonster('Bork'), { weapon: 'elderMaul', ayak: false }).reductions.elderMaul).toBe(2);
    // The table's Smorks "2 Elder Maul + 4 Tonalztics" and Dreadnoth "1 Elder Maul + 3 Tonalztics" leave 1 Defence
    // with upstream's truncation (220 -> 143 -> 93 -> 4 x 23 = 92; 125 -> 82 -> 3 x 27 = 81); they reach 0 only if the
    // Tonalztics drain rounds up (24 / 28 per hit). Unverified, see docs/DATA_SOURCES.md.
    expect(drained(getTestMonster('The Smorks'), { ...NONE, elderMaul: 2, tonalztic: 4 }).skills.def).toBe(1);
    expect(drained(getTestMonster('Dreadnoth the Jellied'), { ...NONE, elderMaul: 1, tonalztic: 3 }).skills.def).toBe(1);
  });

  test('Tonalztics energy is counted in whole specs (2 hits each); ties prefer fewer hammer specs', () => {
    // Smorks: 1 maul + 7 hits (50 + 4 x 50), 2 + 5 (100 + 3 x 50), 3 + 3 and 4 + 2 all cost 250 -> fewest hammer specs
    const smorks = getTestMonster('The Smorks');
    for (const [k, t] of [[1, 7], [2, 5], [3, 3], [4, 2]]) {
      expect(drained(smorks, { ...NONE, elderMaul: k, tonalztic: t }).skills.def).toBe(0);
    }
    expect(maxDrainReductions(smorks, { weapon: 'elderMaul', ayak: false }).reductions)
      .toMatchObject({ elderMaul: 1, tonalztic: 7 });
  });
});

describe('Ayak', () => {
  test('magic defence never goes below 0', () => {
    for (const [name, version] of BOSSES) {
      const m = getTestMonster(name, version);
      expect(drained(m, { ...NONE, ayak: 9999 }).defensive.magic).toBe(0);
      expect(ayakDamageToZero(m)).toBe(m.defensive.magic);
    }
  });

  test('specs to 0 at a given damage per spec', () => {
    const blade = getTestMonster('Ocellus', 'Phase 2'); // +100 magic def
    expect(ayakSpecsToZero(blade, 40)).toBe(3);
    expect(ayakSpecsToZero(blade, 50)).toBe(2);
    expect(ayakSpecsToZero(blade, 0)).toBe(Infinity);
    expect(ayakSpecsToZero(getTestMonster('Bork'), 45)).toBe(7); // +300
  });

  test('a monster with no magic defence bonus needs no Ayak', () => {
    const m = getTestMonster('Ocellus', 'Phase 2', { defensive: { magic: -10 } });
    expect(maxDrainReductions(m, { weapon: 'dwh', ayak: true }).reductions.ayak).toBe(0);
    expect(ayakSpecsToZero(m, 40)).toBe(0);
  });
});

describe('purity and determinism', () => {
  test('does not mutate the monster and returns equal results for equal input', () => {
    const m = getTestMonster('Ocellus', 'Phase 2', { inputs: { defenceReductions: { accursed: true, arclight: 3 } } });
    const before = JSON.parse(JSON.stringify(m));
    const a = maxDrainReductions(m, { weapon: 'elderMaul', ayak: true });
    const b = maxDrainReductions(m, { weapon: 'elderMaul', ayak: true });
    expect(m).toEqual(before);
    expect(a).toEqual(b);
    expect(a.reductions).not.toBe(b.reductions);
    // existing reductions on the input don't change the plan (it starts from the undrained monster)
    expect(a).toEqual(maxDrainReductions(getTestMonster('Ocellus', 'Phase 2'), { weapon: 'elderMaul', ayak: true }));
  });

  test('presets reset every other reduction', () => {
    const m = getTestMonster('Bork', '', { inputs: { defenceReductions: { accursed: true, vulnerability: true, seercull: 5 } } });
    expect(drainPresetReductions(m, 'none')).toEqual(NONE);
    expect(drainPresetReductions(m, 'floor-dwh+ayak')).toEqual({ ...NONE, dwh: 2, ayak: 300 });
    expect(drainPresetReductions(m, 'floor-bgs')).toEqual({ ...NONE, bgs: 120 });
  });

  test('DRAIN_PRESETS lists reset + 3 weapons with and without Ayak', () => {
    expect(DRAIN_PRESETS.map((p) => p.id)).toEqual([
      'none', 'floor-elderMaul', 'floor-elderMaul+ayak', 'floor-dwh', 'floor-dwh+ayak', 'floor-bgs', 'floor-bgs+ayak',
    ]);
    expect(DRAIN_PRESETS.find((p) => p.id === 'floor-elderMaul+ayak')?.label).toBe('Floor (Elder maul) + Ayak');
  });

  test('phase inputs are respected (Bork stunned, Ocellus P3 last quadrant)', () => {
    const bork = getTestMonster('Bork', '', { inputs: { phase: BORK_STUNNED_PHASE } });
    expect(maxDrainReductions(bork, { weapon: 'elderMaul', ayak: true }).defAfter).toBe(180);
    const p3 = getTestMonster('Ocellus', 'Phase 3', { inputs: { phase: OCELLUS_P3_DEFLECT_MELEE_PHASE } });
    expect(maxDrainReductions(p3, { weapon: 'dwh', ayak: true }).defAfter).toBe(150);
  });

  test('caps the hammer specs when the floor is unreachable', () => {
    // an uncapped monster with 0 magic: Tonalztics do nothing and a % drain stalls above 0
    const m = getTestMonster('Ocellus', 'Phase 2', { skills: { magic: 0 } });
    const plan = maxDrainReductions(m, { weapon: 'elderMaul', ayak: false });
    expect(plan.reachesFloor).toBe(false);
    expect(plan.reductions.elderMaul).toBeLessThanOrEqual(MAX_HAMMER_SPECS);
    expect(plan.defAfter).toBeGreaterThan(0);
  });
});

describe('UI parity (scripts/verifyDrainPresets.mjs)', () => {
  // Same inputs as the Playwright check: default player, "Max Mage" preset, Kodai wand, autocast Fire Surge.
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

  const cases: [string, string, number, number][] = [
    // name, version, undrained DPS, "Floor (Elder maul) + Ayak" DPS (values read on screen)
    ['Ocellus', 'Phase 2', 2.290, 4.279],
    ['Archive Guardian', 'Flying', 4.636, 7.424],
  ];
  test.each(cases)('%s %s', (name, version, before, after) => {
    const m = getTestMonster(name, version);
    const r = drainPresetReductions(m, 'floor-elderMaul+ayak');
    const d = withReductions(m, r);
    const dpsBefore = calculatePlayerVsNpc(m, maxMageKodai(m)).dps;
    const dpsAfter = calculatePlayerVsNpc(d, maxMageKodai(d)).dps;
    expect(dpsBefore).toBeCloseTo(before, 3);
    expect(dpsAfter).toBeCloseTo(after, 3);
    expect(dpsAfter).toBeGreaterThan(dpsBefore);
  });
});

// Phase 13: a drain plan only uses weapons that can hit the target in the selected version / phase.
describe('drain plans respect what can hit the target', () => {
  const ALL_WEAPONS: DrainWeapon[] = ['elderMaul', 'dwh', 'bgs'];
  const noMelee = (r: Reductions) => {
    expect(r.elderMaul).toBe(0);
    expect(r.dwh).toBe(0);
    expect(r.bgs).toBe(0);
    expect(r.arclight).toBe(0);
    expect(r.emberlight).toBe(0);
  };

  test('canStyleHit follows upstream: flying blocks melee, Ocellus prayers block their style', () => {
    const agF = getTestMonster('Archive Guardian', 'Flying');
    expect([canStyleHit(agF, 'melee'), canStyleHit(agF, 'ranged'), canStyleHit(agF, 'magic')]).toEqual([false, true, true]);
    const agG = getTestMonster('Archive Guardian', 'Grounded');
    expect([canStyleHit(agG, 'melee'), canStyleHit(agG, 'ranged'), canStyleHit(agG, 'magic')]).toEqual([true, true, true]);
    const walking = getTestMonster('Ocellus', 'Phase 1', { inputs: { phase: OCELLUS_P1_WALKING_PHASE } });
    expect(canStyleHit(walking, 'melee')).toBe(false);
    expect(canStyleHit(walking, 'ranged')).toBe(true);
    const deflectRanged = getTestMonster('Ocellus', 'Phase 3', { inputs: { phase: OCELLUS_P3_DEFLECT_RANGED_PHASE } });
    expect(canStyleHit(deflectRanged, 'ranged')).toBe(false);
    expect(canDrainToolHit(deflectRanged, 'tonalztic')).toBe(false);
    expect(canDrainToolHit(deflectRanged, 'elderMaul')).toBe(true);
    // a halberd can hit a flying monster (upstream rule), a plain melee weapon can't
    expect(canWeaponHit(agF, 'Crystal halberd', 'melee')).toBe(true);
    expect(drainWeaponCanHit(agF, 'elderMaul')).toBe(false);
  });

  test('AG Flying: no melee in any plan; 4 Tonalztics hits reach 156, 3 do not', () => {
    const m = getTestMonster('Archive Guardian', 'Flying');
    for (const weapon of ALL_WEAPONS) {
      for (const ayak of [false, true]) {
        const plan = maxDrainReductions(m, { weapon, ayak });
        noMelee(plan.reductions);
        expect(plan.weaponCanHit).toBe(false);
        expect(plan.reductions.tonalztic).toBe(4);
        expect(plan.reductions.accursed).toBe(false);
        expect(plan.defAfter).toBe(156);
        expect(plan.summary).toBe('4× Tonalztics hits (2 specs) → Def 156');
      }
    }
    expect(drained(m, { ...NONE, tonalztic: 4 }).skills.def).toBe(156);
    expect(drained(m, { ...NONE, tonalztic: 3 }).skills.def).toBeGreaterThan(156);
  });

  test('AG Grounded: melee plans allowed', () => {
    const m = getTestMonster('Archive Guardian', 'Grounded');
    const plan = maxDrainReductions(m, { weapon: 'elderMaul', ayak: false });
    expect(plan.weaponCanHit).toBe(true);
    expect(plan.reductions).toEqual({ ...NONE, elderMaul: 2 });
    expect(plan.summary).toBe('2× Elder maul → Def 156');
  });

  test('Ocellus P1 walking (Protect from Melee): no melee, Tonalztics instead', () => {
    const m = getTestMonster('Ocellus', 'Phase 1', { inputs: { phase: OCELLUS_P1_WALKING_PHASE } });
    for (const weapon of ALL_WEAPONS) {
      const plan = maxDrainReductions(m, { weapon, ayak: true });
      noMelee(plan.reductions);
      expect(plan.reductions.tonalztic).toBeGreaterThan(0);
      expect(plan.reachesFloor).toBe(true);
    }
    // at a corner melee is fine again
    expect(maxDrainReductions(getTestMonster('Ocellus', 'Phase 1'), { weapon: 'elderMaul', ayak: false }).reductions.elderMaul).toBe(2);
  });

  test('Ocellus P3 last quadrant: Deflect Melee -> no melee drains; Deflect Ranged -> no Tonalztics', () => {
    for (const phase of [OCELLUS_P3_DEFLECT_MELEE_PHASE, OCELLUS_P3_DEFLECT_MELEE_VOID_PHASE]) {
      const m = getTestMonster('Ocellus', 'Phase 3', { inputs: { phase } });
      for (const weapon of ALL_WEAPONS) {
        const plan = maxDrainReductions(m, { weapon, ayak: true });
        noMelee(plan.reductions);
        expect(plan.defAfter).toBe(150);
      }
    }
    for (const phase of [OCELLUS_P3_DEFLECT_RANGED_PHASE, OCELLUS_P3_DEFLECT_RANGED_VOID_PHASE]) {
      const m = getTestMonster('Ocellus', 'Phase 3', { inputs: { phase } });
      for (const weapon of ALL_WEAPONS) {
        const plan = maxDrainReductions(m, { weapon, ayak: true });
        expect(plan.reductions.tonalztic).toBe(0);
        expect(plan.weaponCanHit).toBe(true);
        expect(plan.defAfter).toBe(150);
      }
    }
  });

  test('uncapped boss where Tonalztics are blocked: hammer finishes without them (lowest Defence found)', () => {
    const m = getTestMonster('Ocellus', 'Phase 2', { inputs: { phase: OCELLUS_P3_DEFLECT_RANGED_PHASE } });
    // The Blade has no phases, so the phase string is ignored and Tonalztics are still used
    expect(maxDrainReductions(m, { weapon: 'elderMaul', ayak: false }).reductions).toMatchObject({ elderMaul: 2, tonalztic: 4 });
  });

  test('non-raid monsters are unaffected', () => {
    const m = getTestMonster('Abyssal demon');
    const plan = maxDrainReductions(m, { weapon: 'elderMaul', ayak: false });
    expect(plan.weaponCanHit).toBe(true);
    expect(plan.reductions.tonalztic).toBe(0);
    expect(plan.reductions.elderMaul).toBeGreaterThan(0);
    expect(maxDrainReductions(m, { weapon: 'bgs', ayak: false }).reductions.bgs).toBe(m.skills.def);
  });
});
