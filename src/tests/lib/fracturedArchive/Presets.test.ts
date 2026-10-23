import { describe, expect, test } from '@jest/globals';
import {
  findEquipment, getTestMonster, getTestPlayer,
} from '@/tests/utils/TestUtils';
import { generateEmptyPlayer } from '@/state';
import PlayerVsNPCCalc from '@/lib/PlayerVsNPCCalc';
import { calculateEquipmentBonusesFromGear } from '@/lib/Equipment';
import { getCombatStylesForCategory } from '@/utils';
import { EquipmentCategory } from '@/enums/EquipmentCategory';
import { Prayer } from '@/enums/Prayer';
import Potion from '@/enums/Potion';
import { maxDrainReductions } from '@/lib/fracturedArchive/drains';
import {
  applyPresetToPlayer,
  BEST_SETUP_TARGETS,
  buildTargetMonster,
  computeBestSetup,
  drainStateFor,
  evaluateLoadout,
  evaluatePreset,
  findTarget,
  presetSpells,
  presetStyles,
  rankResults,
  resolveItem,
  resolvePresetEquipment,
  summaryQueries,
  targetPhases,
} from '@/lib/fracturedArchive/bestSetup';
import {
  BestSetupAssumptions, DEFAULT_ASSUMPTIONS, ItemRef, PRESETS,
} from '@/lib/fracturedArchive/presets';
import { BORK_STUNNED_PHASE, OCELLUS_P3_PHASES } from '@/lib/fracturedArchive/constants';
import { Player } from '@/types/Player';
import { Monster } from '@/types/Monster';

// Phase 8: "Best setup" view. Presets: src/lib/fracturedArchive/presets.ts; computation:
// src/lib/fracturedArchive/bestSetup.ts (also run by the worker). Docs: docs/BEST_SETUP.md.

const A = DEFAULT_ASSUMPTIONS;
const preset = (name: string) => PRESETS.find((p) => p.name === name)!;

/** What the worker's COMPUTE_BASIC handler (= the main calculator) returns for a player. */
const directCalc = (p: Player, m: Monster) => {
  const calc = new PlayerVsNPCCalc(p, m, { loadoutName: '1' });
  return {
    dps: calc.getDps(),
    ttk: calc.getTtk(),
    maxHit: calc.getDistribution().getMax(),
    accuracy: calc.getDisplayHitChance(),
  };
};

describe('preset data', () => {
  test('preset names are unique', () => {
    expect(new Set(PRESETS.map((p) => p.name)).size).toBe(PRESETS.length);
  });

  test.each(PRESETS.flatMap((p) => Object.entries(p.equipment).map(([slot, ref]) => [p.name, slot, ref] as [string, string, ItemRef])))(
    '%s: %s item exists and fits the slot',
    (_name, slot, ref) => {
      const item = resolveItem(ref);
      const [name, version] = typeof ref === 'string' ? [ref, undefined] : ref;
      expect(item.name).toBe(name);
      if (version !== undefined) expect(item.version).toBe(version);
      expect(item.slot).toBe(slot);
    },
  );

  test('plain versions are picked for multi-version items', () => {
    expect(resolveItem('Scythe of Vitur').version).toBe('Charged');
    expect(resolveItem('Torva full helm').version).toBe('Restored');
    expect(resolveItem(['Dragon arrow', 'Unpoisoned']).version).toBe('Unpoisoned');
    expect(() => resolveItem('Not an item')).toThrow();
  });

  test.each(PRESETS.map((p) => [p.name]))('%s builds a valid player for every candidate style', (name) => {
    const p = preset(name);
    const monster = getTestMonster('Xarth');
    const weapon = resolveItem(p.equipment.weapon!);
    if (weapon.isTwoHanded) expect(p.equipment.shield).toBeUndefined();

    const styles = presetStyles(p);
    expect(styles.length).toBeGreaterThan(0);
    const valid = getCombatStylesForCategory(weapon.category || EquipmentCategory.NONE);
    for (const style of styles) {
      expect(valid).toContainEqual(style);
      for (const spell of presetSpells(p)) {
        const player = applyPresetToPlayer(generateEmptyPlayer(), p, style, spell, monster, A);
        expect(player.equipment.weapon?.name).toBe(weapon.name);
        Object.entries(resolvePresetEquipment(p)).forEach(([slot, item]) => {
          expect(player.equipment[slot as keyof Player['equipment']]?.id).toBe(item!.id);
        });
        expect(player.skills.atk).toBe(99);
        expect(player.prayers).toEqual([{ melee: Prayer.PIETY, ranged: Prayer.RIGOUR, magic: Prayer.AUGURY }[p.group]]);
        expect(player.buffs.potions).toEqual([A.potions[p.group]]);
        // bonuses and attack speed exactly as the store computes them
        const { attackSpeed, ...bonuses } = calculateEquipmentBonusesFromGear(player, monster);
        expect(player).toMatchObject(bonuses);
        expect(player.attackSpeed).toBe(attackSpeed);
        if (spell) expect(player.spell?.name).toBe(spell);
        // no "wrong ammo" / "spell needs a weapon" style warnings
        expect(evaluateLoadout(player, monster, false).issues).toEqual([]);
        expect(evaluateLoadout(player, monster, false).dps).toBeGreaterThan(0);
      }
    }
  });

  test('potion boosts match PotionMap (super combat / ranging / saturated heart at 99)', () => {
    const m = getTestMonster('Xarth');
    const melee = applyPresetToPlayer(generateEmptyPlayer(), PRESETS[0], presetStyles(PRESETS[0])[0], null, m, A);
    expect([melee.boosts.atk, melee.boosts.str, melee.boosts.def]).toEqual([19, 19, 19]);
    const tbow = preset('Twisted bow (Masori)');
    expect(applyPresetToPlayer(generateEmptyPlayer(), tbow, presetStyles(tbow)[0], null, m, A).boosts.ranged).toBe(13);
    const shadow = preset("Tumeken's shadow (Ancestral)");
    expect(applyPresetToPlayer(generateEmptyPlayer(), shadow, presetStyles(shadow)[0], null, m, A).boosts.magic).toBe(13);
  });

  test('Zeal toggle replaces Piety; fragments toggle adds +2 base max hit to the spell preset', () => {
    const m = getTestMonster('Xarth');
    const mace = PRESETS[0];
    const zeal = applyPresetToPlayer(generateEmptyPlayer(), mace, presetStyles(mace)[0], null, m, { ...A, useZeal: true });
    expect(zeal.prayers).toEqual([Prayer.ZEAL]);

    const kodai = preset('Kodai + best Surge (Ancestral)');
    const style = presetStyles(kodai)[0];
    expect(style.stance).toBe('Autocast');
    const withFrag = applyPresetToPlayer(generateEmptyPlayer(), kodai, style, 'Water Surge', m, A);
    const noFrag = applyPresetToPlayer(generateEmptyPlayer(), kodai, style, 'Water Surge', m, { ...A, elementalFragments: false });
    expect(withFrag.buffs.elementalFragments).toEqual({
      air: true, water: true, earth: true, fire: true,
    });
    const base = directCalc(noFrag, m).maxHit;
    expect(directCalc(withFrag, m).maxHit).toBeGreaterThan(base);
  });
});

describe('targets and drain states', () => {
  test('every in-scope boss/version is listed with the calculator phase options', () => {
    expect(BEST_SETUP_TARGETS.map((t) => t.key)).toEqual([
      'ag-flying', 'ag-grounded', 'smorks', 'bork', 'dreadnoth', 'jelly', 'xarth', 'ocellus-p1', 'ocellus-p2', 'ocellus-p3',
    ]);
    expect(targetPhases(findTarget('bork'))).toHaveLength(5);
    expect(findTarget('bork').summaryPhases).toEqual(['Smorks 100-76% HP (armour 8)', BORK_STUNNED_PHASE]);
    expect(targetPhases(findTarget('ocellus-p1'))).toEqual(['At a corner', 'Walking to a corner (Protect from Melee)']);
    expect(targetPhases(findTarget('ocellus-p3'))).toEqual(OCELLUS_P3_PHASES);
    expect(targetPhases(findTarget('xarth'))).toEqual([]);
    expect(summaryQueries()).toHaveLength(1 + 1 + 1 + 2 + 1 + 1 + 1 + 2 + 1 + 6);
  });

  test('the monster is set up like the main calculator: party size 2, phase, current HP = scaled HP', () => {
    const { monster } = buildTargetMonster(findTarget('bork'), BORK_STUNNED_PHASE, 'none', A);
    expect(monster.inputs.partySize).toBe(2);
    expect(monster.inputs.phase).toBe(BORK_STUNNED_PHASE);
    expect(monster.inputs.monsterCurrentHp).toBe(1500);
    expect(buildTargetMonster(findTarget('bork'), 'nonsense', 'none', A).monster.inputs.phase)
      .toBe('Smorks 100-76% HP (armour 8)');
  });

  // phase 7 table (docs/DATA_SOURCES.md, "Drain presets"): Elder maul specs (+ Tonalztics hits) and Ayak damage to 0
  test.each<[string, number, number, number, number]>([
    // key, elder maul, tonalztic hits, solo ayak, team ayak (= magic def bonus)
    // phase 13: melee can't hit the flying Guardian -> wiki table's "4 Tonalztics of Ralos"
    ['ag-flying', 0, 4, 80, 130],
    ['ag-grounded', 2, 0, 80, 130],
    ['bork', 2, 0, 80, 300],
    ['smorks', 1, 7, 80, 400],
    ['dreadnoth', 1, 4, 20, 20],
    ['jelly', 1, 6, 15, 15],
    ['xarth', 2, 0, 80, 205],
    ['ocellus-p1', 2, 0, 80, 100],
    ['ocellus-p2', 2, 4, 80, 100],
    ['ocellus-p3', 2, 0, 80, 200],
  ])('%s: drain states use the phase 7 spec counts', (key, maul, tonalztic, soloAyak, teamAyak) => {
    const target = findTarget(key);
    const none = buildTargetMonster(target, undefined, 'none', A);
    const solo = buildTargetMonster(target, undefined, 'solo', A);
    const team = buildTargetMonster(target, undefined, 'team', A);
    const plan = maxDrainReductions(none.monster, { weapon: 'elderMaul', ayak: true });

    expect(none.drain.reductions.elderMaul).toBe(0);
    expect(none.drain.specs).toBe('no specs');
    for (const d of [solo.drain, team.drain]) {
      expect(d.reductions.elderMaul).toBe(maul);
      expect(d.reductions.tonalztic).toBe(tonalztic);
      expect(d.defAfter).toBe(plan.defAfter);
    }
    expect(solo.drain.reductions.ayak).toBe(soloAyak);
    expect(team.drain.reductions.ayak).toBe(teamAyak);
    expect(team.drain.magicDefAfter).toBe(0);
    expect(solo.drain.magicDefAfter).toBe(teamAyak - soloAyak);
    if (maul) expect(solo.drain.specs).toContain(`${maul}× Elder maul`);
    else expect(solo.drain.specs).not.toContain('Elder maul');
    expect(solo.drain.specs).toContain(`${Math.ceil(soloAyak / 40)}× Ayak (${soloAyak} dmg)`);
    const n = Math.ceil(teamAyak / 40);
    expect(team.drain.specs).toContain(`Ayak to 0 ≈ ${n} spec${n === 1 ? '' : 's'} (${teamAyak} dmg at 40/spec)`);
    // the drained monster carries the reductions, so the calc applies them
    expect(team.monster.inputs.defenceReductions).toEqual(team.drain.reductions);
  });

  test('AG: Solo = "2× Elder maul, 2× Ayak (80 dmg)" (Grounded) / Tonalztics (Flying), Team = Ayak to 0 ≈ 4 specs', () => {
    const t = findTarget('ag-flying');
    const g = findTarget('ag-grounded');
    expect(buildTargetMonster(g, undefined, 'solo', A).drain.specs).toBe('2× Elder maul, 2× Ayak (80 dmg)');
    expect(buildTargetMonster(g, undefined, 'team', A).drain.specs)
      .toBe('2× Elder maul, Ayak to 0 ≈ 4 specs (130 dmg at 40/spec)');
    // melee can't hit it while flying (phase 13)
    expect(buildTargetMonster(t, undefined, 'solo', A).drain.specs).toBe('4× Tonalztics hits (2 specs), 2× Ayak (80 dmg)');
    expect(buildTargetMonster(t, undefined, 'team', A).drain.specs)
      .toBe('4× Tonalztics hits (2 specs), Ayak to 0 ≈ 4 specs (130 dmg at 40/spec)');
    const custom: BestSetupAssumptions = { ...A, soloAyakDamage: 500 };
    expect(drainStateFor(buildTargetMonster(t, undefined, 'none', A).monster, 'solo', custom).reductions.ayak).toBe(130);
  });
});

describe('computation equals the main calculator', () => {
  test("Tumeken's shadow vs Archive Guardian (Flying), Team drain: view == direct PlayerVsNPCCalc", () => {
    const { monster } = buildTargetMonster(findTarget('ag-flying'), undefined, 'team', A);
    const shadow = preset("Tumeken's shadow (Ancestral)");
    const row = evaluatePreset(generateEmptyPlayer(), shadow, monster, A);

    // independent path: TestUtils player (as upstream tests build them) with the same gear and buffs
    const testMonster = getTestMonster('Archive Guardian', 'Flying', {
      inputs: {
        partySize: 2,
        monsterCurrentHp: 550,
        defenceReductions: { elderMaul: 2, ayak: 130 },
      },
    });
    const player = getTestPlayer(testMonster, {
      equipment: resolvePresetEquipment(shadow),
      style: row.style,
      prayers: [Prayer.AUGURY],
      buffs: { potions: [Potion.SATURATED_HEART] },
      boosts: { magic: 13 },
    });
    const direct = directCalc(player, testMonster);

    expect(row.dps).toBe(direct.dps);
    expect(row.ttk).toBe(direct.ttk);
    expect(row.maxHit).toBe(direct.maxHit);
    expect(row.accuracy).toBe(direct.accuracy);
    expect(row.maxHit).toBe(70);
    expect(row.dps).toBeCloseTo(10.595, 3);
  });

  test('computeBestSetup rows equal evaluateLoadout of the rebuilt player (Bork armour 8, Solo)', () => {
    const [res] = computeBestSetup(generateEmptyPlayer(), [{ targetKey: 'bork' }], A);
    const solo = res.drains.find((d) => d.drain.id === 'solo')!;
    const { monster } = buildTargetMonster(findTarget('bork'), undefined, 'solo', A);
    for (const row of solo.rows) {
      const p = applyPresetToPlayer(generateEmptyPlayer(), preset(row.preset), row.style, row.spell, monster, A);
      const ev = evaluateLoadout(p, monster);
      expect(row.dps).toBe(ev.dps);
      expect(row.maxHit).toBe(ev.maxHit);
      expect(row.accuracy).toBe(ev.accuracy);
      expect(row.ttk).toBe(ev.dps > 0 ? ev.ttk : null);
    }
  });

  test('each preset keeps its best style; ranking is sorted by DPS (desc) for every drain state', () => {
    const results = computeBestSetup(generateEmptyPlayer(), [{ targetKey: 'xarth' }, { targetKey: 'ag-flying' }], A, undefined, 'top');
    for (const r of results) {
      for (const d of r.drains) {
        expect(d.rows).toHaveLength(PRESETS.length);
        for (let i = 1; i < d.rows.length; i++) {
          expect(d.rows[i - 1].dps).toBeGreaterThanOrEqual(d.rows[i].dps);
        }
        expect(d.rows[0].ttk).not.toBeNull(); // 'top' computes TTK for the winner
      }
    }

    const { monster } = buildTargetMonster(findTarget('xarth'), undefined, 'none', A);
    const scythe = preset('Torva + Scythe (slash)');
    const row = evaluatePreset(generateEmptyPlayer(), scythe, monster, A);
    for (const style of presetStyles(scythe)) {
      const p = applyPresetToPlayer(generateEmptyPlayer(), scythe, style, null, monster, A);
      expect(row.dps).toBeGreaterThanOrEqual(evaluateLoadout(p, monster, false).dps);
    }
    expect(['Reap', 'Chop']).toContain(row.style.name);
  });

  test('a preset that fails to evaluate becomes an error row; the other presets are still ranked', () => {
    const broken = { ...PRESETS[0], name: 'Broken', equipment: { ...PRESETS[0].equipment, weapon: 'Not an item' } };
    const [res] = computeBestSetup(generateEmptyPlayer(), [{ targetKey: 'xarth' }], A, [broken, PRESETS[1]], 'top');
    for (const d of res.drains) {
      expect(d.rows.map((r) => r.preset)).toEqual([PRESETS[1].name, 'Broken']);
      expect(d.rows[0].dps).toBeGreaterThan(0);
      expect(d.rows[0].error).toBeUndefined();
      const err = d.rows[1];
      expect(err.dps).toBe(0);
      expect(err.ttk).toBeNull();
      expect(err.error).toMatch(/Not an item/);
      expect(err.cantHit).toMatch(/^Error: /);
    }
  });

  test('rankResults keeps the preset order on ties', () => {
    const base = evaluatePreset(generateEmptyPlayer(), PRESETS[0], getTestMonster('Xarth'), A, false, false);
    const rows = [{ ...base, preset: 'a', dps: 1 }, { ...base, preset: 'b', dps: 2 }, { ...base, preset: 'c', dps: 1 }];
    expect(rankResults(rows).map((r) => r.preset)).toEqual(['b', 'a', 'c']);
  });

  test('can\'t-hit rows: melee on Flying AG deals 0 with a reason; Ocellus P2 TTK is n/a', () => {
    const [ag] = computeBestSetup(generateEmptyPlayer(), [{ targetKey: 'ag-flying' }], A, undefined, 'top');
    const melee = ag.drains[0].rows.filter((r) => r.group === 'melee');
    expect(melee.length).toBeGreaterThan(0);
    melee.forEach((r) => {
      expect(r.dps).toBe(0);
      expect(r.ttk).toBeNull();
      expect(r.cantHit).toMatch(/Flying/);
    });

    const { monster } = buildTargetMonster(findTarget('ocellus-p2'), undefined, 'team', A);
    const row = evaluatePreset(generateEmptyPlayer(), preset('Twisted bow (Masori)'), monster, A, true);
    expect(row.dps).toBeGreaterThan(0);
    expect(row.ttk).toBeNull();
  });

  test('Ocellus P1 walking: melee presets are blocked by Protect from Melee', () => {
    const { monster } = buildTargetMonster(findTarget('ocellus-p1'), 'Walking to a corner (Protect from Melee)', 'none', A);
    const row = evaluatePreset(generateEmptyPlayer(), preset('Torva + Scythe (slash)'), monster, A, false, false);
    expect(row.dps).toBe(0);
    expect(row.cantHit).toBe('Ocellus is praying against this combat style.');
  });
});

describe('phase 7b leftover: Obligator thrust on Maggot King "Melee Punish"', () => {
  const obligatorPlayer = (m: Monster) => getTestPlayer(m, {
    equipment: { weapon: findEquipment('Obligator', 'Charged') },
    style: { name: 'Thrust', type: 'crush', stance: 'Aggressive' },
  });

  test('keeps the best-of-rolls distribution (and size bonus), then the punish ×1.5', () => {
    const standard = getTestMonster('Maggot King', 'Far', { inputs: { phase: 'Standard' } });
    const punish = getTestMonster('Maggot King', 'Far', { inputs: { phase: 'Melee Punish' } });
    const std = new PlayerVsNPCCalc(obligatorPlayer(standard), standard, { loadoutName: 'std' });
    const pun = new PlayerVsNPCCalc(obligatorPlayer(punish), punish, { loadoutName: 'pun' });

    // conditional on a hit, damage = the standard thrust distribution scaled by 150% (rounded down per hit); the
    // punish accuracy (crush vs 15% defence roll) is only reported by getDisplayHitChance
    const stdDist = std.getDistribution().scaleDamage(150, 100);
    expect(pun.getDistribution().getMax()).toBe(stdDist.getMax());
    expect(pun.getDistribution().getMax()).toBe(Math.trunc(std.getDistribution().getMax() * 1.5));
    expect(pun.getDistribution().getExpectedDamage() / pun.getDisplayHitChance())
      .toBeCloseTo(stdDist.getExpectedDamage() / std.getHitChance(), 9);

    // a plain single roll (the old behaviour) has a lower average than best-of-N
    const plainExpected = pun.getDisplayHitChance() * (Math.trunc(Math.trunc(std.getDistribution().getMax() / 1.4) * 1.5) / 2);
    expect(pun.getDistribution().getExpectedDamage()).toBeGreaterThan(plainExpected);
  });
});
