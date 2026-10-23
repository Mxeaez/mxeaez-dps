import { describe, expect, test } from '@jest/globals';
import PlayerVsNPCCalc from '@/lib/PlayerVsNPCCalc';
import { scaleMonster } from '@/lib/MonsterScaling';
import { getCombatStylesForCategory } from '@/utils';
import { EquipmentCategory } from '@/enums/EquipmentCategory';
import { buildTargetMonster, findTarget, resolveItem } from '@/lib/fracturedArchive/bestSetup';
import { DEFAULT_ASSUMPTIONS } from '@/lib/fracturedArchive/presets';
import {
  ayakExpectedDrain, drainModel, energyBudget, planLabel, SPEC_WEAPONS, SpecWeapon, specAttempts, specPlayer,
  specProfile,
} from '@/lib/fracturedArchive/specs';
import { soloSpecPlan } from '@/lib/fracturedArchive/teamSpecs';
import { BORK_STUNNED_PHASE } from '@/lib/fracturedArchive/constants';

// Phase 14: spec mechanics per drain weapon (src/lib/fracturedArchive/specs.ts). Docs: docs/DATA_SOURCES.md, "Spec
// mechanics"; docs/BEST_SETUP.md.

const A = DEFAULT_ASSUMPTIONS;
const monsterOf = (key: string, phase?: string) => buildTargetMonster(findTarget(key), phase, 'none', A).monster;

/** OSRS / upstream hit chance from the two rolls. */
const hitChance = (atk: number, def: number) => (atk > def ? 1 - (def + 2) / (2 * (atk + 1)) : atk / (2 * (def + 1)));
/** Best of two attack rolls (upstream's fang formula, atk > def case). */
const doubleRollChance = (atk: number, def: number) => 1 - (def + 2) * (2 * def + 3) / (atk + 1) / (atk + 1) / 6;
/**
 * Confliction gauntlets (worn by the magic preset): upstream's steady state of "re-roll accuracy after a miss",
 * p2 / (1 + p2 − p1) (BaseCalc.getConflictionGauntletsAccuracyRoll).
 */
const conflictionChance = (atk: number, def: number) => {
  const p1 = hitChance(atk, def);
  const p2 = doubleRollChance(atk, def);
  return p2 / (1 + p2 - p1);
};

/** The normal (non-spec) calc of the profile's player in the profile's style. */
const normalCalc = (key: string, weapon: SpecWeapon) => {
  const m = monsterOf(key);
  const profile = specProfile(m, weapon);
  const item = resolveItem(SPEC_WEAPONS[weapon].item);
  const style = getCombatStylesForCategory(item.category || EquipmentCategory.NONE)
    .find((s) => `${s.name} (${s.stance})` === profile.style)!;
  const player = specPlayer(m, weapon, style, A);
  return {
    m, profile, calc: new PlayerVsNPCCalc(player, m, { loadoutName: 'n' }), scaled: scaleMonster(m),
  };
};

describe('spec weapon table', () => {
  test('energy from upstream (= wiki): every drain weapon costs 50%', () => {
    for (const w of Object.keys(SPEC_WEAPONS) as SpecWeapon[]) {
      expect(SPEC_WEAPONS[w].energy).toBe(50);
      expect(SPEC_WEAPONS[w].wiki).toMatch(/^https:\/\/oldschool\.runescape\.wiki\/w\//);
    }
    expect(SPEC_WEAPONS.dwh.landsOn).toBe('damage'); // Mod Ash: DWH needs damage
    expect(SPEC_WEAPONS.tonalztics.landsOn).toBe('damage'); // wiki: "If damage is dealt"
    expect(SPEC_WEAPONS.accursed.landsOn).toBe('accurate'); // "regardless of the damage inflicted"
  });
});

describe('Elder maul (hand-derived from upstream formulas)', () => {
  test.each([
    ['ag-grounded', 260, 0.7978],
    ['bork', 300, 0.7678],
  ] as [string, number, number][])('%s: spec roll = trunc(normal × 5/4) vs crush defence roll; lands on an accurate roll', (key, def, rounded) => {
    const {
      profile, calc, scaled,
    } = normalCalc(key, 'elderMaul');
    expect(scaled.skills.def).toBe(def);
    const atk = Math.trunc(calc.getMaxAttackRoll() * 5 / 4);
    const defRoll = (scaled.skills.def + 9) * (scaled.defensive.crush + 64);
    expect(profile.style).toBe('Pound (Accurate)');
    expect(profile.accuracy).toBeCloseTo(hitChance(atk, defRoll), 12);
    expect(profile.hitChance).toBeCloseTo(profile.accuracy, 12); // landsOn: accurate
    expect(profile.hitChance).toBeCloseTo(rounded, 4);
    // no damage modifier: the spec max hit is the normal max hit (minus Bork's flat armour 8 on both)
    expect(profile.maxHit).toBe(calc.getDistribution().getMax());
    // drain of a landed spec = 35% of the current Defence, rounded down
    expect(profile.drainPerLandedSpec({ def, magicLevel: 0 })).toBe(Math.trunc(def * 35 / 100));
    expect(profile.outcomes.map((o) => o.hits)).toEqual([0, 1]);
  });
});

describe('Eye of Ayak (hand-derived)', () => {
  test('Archive Guardian: roll ×2 vs (Magic level + 9) × (magic def + 64), Confliction re-roll; E[damage] ≈ accuracy × max / 2', () => {
    const { profile, calc, scaled } = normalCalc('ag-grounded', 'ayak');
    const atk = calc.getMaxAttackRoll() * 2;
    const defRoll = (scaled.skills.magic + 9) * (scaled.defensive.magic + 64);
    expect(atk).toBeGreaterThan(defRoll);
    expect(profile.accuracy).toBeCloseTo(conflictionChance(atk, defRoll), 12);
    // damage 0..max uniform on an accurate roll, accurate 0s raised to 1 (upstream, = wiki "Successful hit"), so every
    // accurate spec drains: E = acc × (1 + 1 + 2 + ... + max) / (max + 1)
    const max = profile.maxHit;
    expect(profile.expectedDamage).toBeCloseTo(profile.accuracy * (1 + max * (max + 1) / 2) / (max + 1), 10);
    expect(profile.hitChance).toBeCloseTo(profile.accuracy, 12);
    expect(profile.maxHit).toBe(54);
    expect(profile.expectedDamage).toBeCloseTo(19.74, 2);
    // 2 specs ≈ 39 of AG's 130 magic defence
    expect(ayakExpectedDrain(profile, 2, 130)).toBeCloseTo(2 * profile.expectedDamage, 10);
    expect(ayakExpectedDrain(profile, 10, 130)).toBe(130);
  });

  test('Bork: magic resistance 2 → damage max(0, max(1, d) − 2) for d in 0..54', () => {
    const { profile, calc, scaled } = normalCalc('bork', 'ayak');
    const atk = calc.getMaxAttackRoll() * 2;
    const defRoll = (scaled.skills.magic + 9) * (scaled.defensive.magic + 64);
    expect(atk).toBeGreaterThan(defRoll);
    expect(profile.accuracy).toBeCloseTo(conflictionChance(atk, defRoll), 12);
    const base = 54;
    expect(profile.maxHit).toBe(base - 2);
    const sum = Array.from({ length: base + 1 }, (_, d) => Math.max(0, d - 2)).reduce((a, b) => a + b, 0);
    expect(profile.expectedDamage).toBeCloseTo(profile.accuracy * sum / (base + 1), 10);
    expect(profile.hitChance).toBeCloseTo(profile.accuracy * (base - 2) / (base + 1), 10);
    expect(profile.expectedDamage).toBeCloseTo(20.11, 2);
  });
});

describe('other weapons', () => {
  test('Tonalztics: two hits, 0–2 landed per spec, drain trunc(Magic / 8) per landed hit', () => {
    const p = specProfile(monsterOf('smorks'), 'tonalztics');
    expect(p.outcomes.map((o) => o.hits)).toEqual([0, 1, 2]);
    expect(p.outcomes.reduce((a, o) => a + o.p, 0)).toBeCloseTo(1, 12);
    expect(p.expectedHits).toBeGreaterThan(1);
    expect(p.expectedHits).toBeLessThan(2);
    expect(p.drainPerLandedSpec({ def: 220, magicLevel: 185 })).toBe(23);
  });

  test('BGS: damage distribution (drain = damage), slash defence roll; DWH lands only on damage', () => {
    const m = monsterOf('bork');
    const bgs = specProfile(m, 'bgs');
    expect(bgs.outcomes.length).toBeGreaterThan(20);
    expect(bgs.expectedDamage).toBeCloseTo(bgs.outcomes.reduce((a, o) => a + o.p * o.damage, 0), 10);
    // Bork flat armour 8: an accurate hit of ≤ 8 deals 0 → no drain
    const dwh = specProfile(m, 'dwh');
    expect(dwh.hitChance).toBeLessThan(dwh.accuracy);
  });

  test('a weapon that can\'t hit (melee vs flying Archive Guardian) has hit chance 0', () => {
    const p = specProfile(monsterOf('ag-flying'), 'elderMaul');
    expect(p.canHit).toBe(false);
    expect(p.hitChance).toBe(0);
    expect(p.outcomes).toEqual([{ p: 1, hits: 0, damage: 0 }]);
    expect(specProfile(monsterOf('ag-flying'), 'tonalztics').hitChance).toBeGreaterThan(0.9);
  });

  test('stunned Bork: melee always accurate → Elder maul lands every time', () => {
    expect(specProfile(monsterOf('bork', BORK_STUNNED_PHASE), 'elderMaul').hitChance).toBeCloseTo(1, 12);
  });

  test('drainModel: undrained numbers + per-weapon hit chances (not a no-op)', () => {
    const model = drainModel(buildTargetMonster(findTarget('bork'), undefined, 'team', A).monster, A); // drains reset
    expect(model).toMatchObject({
      def: 300, floor: 180, magicLevel: 90, magicDef: 300,
    });
    for (const w of ['elderMaul', 'dwh', 'tonalztics', 'bgs', 'ayak'] as const) {
      expect(model.hitChance[w]).toBeGreaterThan(0.3);
      expect(model.hitChance[w]).toBeLessThan(1);
    }
  });
});

describe('energy budget', () => {
  test('100% + 10% per 30 s; Lightbearer 10% per 15 s (wiki)', () => {
    expect(energyBudget({ seconds: 0, lightbearer: false })).toBe(100);
    expect(energyBudget({ seconds: 29, lightbearer: false })).toBe(100);
    expect(energyBudget({ seconds: 30, lightbearer: false })).toBe(110);
    expect(energyBudget({ seconds: 90, lightbearer: false })).toBe(130);
    expect(energyBudget({ seconds: 90, lightbearer: true })).toBe(160);
    expect(energyBudget({ seconds: 15, lightbearer: true })).toBe(110);
    expect(energyBudget({ seconds: 300, lightbearer: false })).toBe(200);
    expect(specAttempts(130, 50)).toBe(2);
    expect(specAttempts(160, 50)).toBe(3);
  });

  test('labels: solo / solo+lightbearer / team-only', () => {
    expect(planLabel(100, 0)).toBe('solo');
    expect(planLabel(130, 90)).toBe('solo');
    expect(planLabel(150, 90)).toBe('solo+lightbearer');
    expect(planLabel(160, 90)).toBe('solo+lightbearer');
    expect(planLabel(200, 90)).toBe('team-only');
  });
});

describe('Solo plan on real bosses', () => {
  const carried = (w: Partial<Record<'elderMaul' | 'dwh' | 'bgs' | 'tonalztics', boolean>>) => ({
    elderMaul: false, dwh: false, bgs: false, tonalztics: false, ...w,
  });

  test('The Smorks (floor 0), maul only: partial drain, floor not reachable solo', () => {
    const model = drainModel(monsterOf('smorks'), A);
    const p = soloSpecPlan(model, {
      carried: carried({ elderMaul: true }), ayakSpecs: 0, lightbearer: false, fightSeconds: 90,
    });
    expect(p.attempts).toEqual(['elderMaul', 'elderMaul']);
    expect(p.defence.bestCaseDef).toBe(93); // 220 → 143 → 93
    expect(p.defence.pFloor).toBe(0);
    expect(p.defence.rankedDef).toBeGreaterThan(93);
    expect(p.defence.rankedDef).toBeLessThan(220);
    expect(p.text).toContain('floor 0 not reachable; best case Def 93');
    expect(p.needed.label).toBe('team-only');
  });

  test('never spends more than the budget (all bosses × settings)', () => {
    for (const key of ['ag-grounded', 'ag-flying', 'bork', 'smorks', 'dreadnoth', 'xarth', 'ocellus-p2']) {
      const model = drainModel(monsterOf(key), A);
      for (const fightSeconds of [0, 30, 90, 300]) {
        for (const lightbearer of [false, true]) {
          for (const priority of ['defence', 'ayak'] as const) {
            for (const ayakSpecs of [0, 2, 5]) {
              const p = soloSpecPlan(model, {
                carried: carried({ elderMaul: true, tonalztics: true, bgs: key === 'smorks' }),
                ayakSpecs,
                lightbearer,
                fightSeconds,
                priority,
              });
              expect(p.energyUsed).toBeLessThanOrEqual(energyBudget({ seconds: fightSeconds, lightbearer }));
              expect(p.energyUsed).toBe((p.attempts.length + p.ayakAttempts) * 50);
              expect(p.ayakAttempts).toBeLessThanOrEqual(ayakSpecs);
            }
          }
        }
      }
    }
  });
});
