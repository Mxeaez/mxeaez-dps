import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from '@jest/globals';
import { getMonsters } from '@/lib/Monsters';
import { MONSTER_PHASES_BY_ID } from '@/lib/constants';
import {
  ALL_TARGETS, BEST_SETUP_TARGETS, buildTargetMonster, findTarget, summaryQueries, targetPhases,
} from '@/lib/fracturedArchive/bestSetup';
import { DEFAULT_ASSUMPTIONS, PRESETS } from '@/lib/fracturedArchive/presets';
import { refName, SEARCH_POOL } from '@/lib/fracturedArchive/searchCandidates';
import {
  FA_TIME_MODEL, RAID_TIME_DEFAULTS, raidTimeAssumptionsFrom, ROUTE_SLOTS, routesFor,
} from '@/lib/fracturedArchive/raidTime';
import { resolveItem, resolvePresetEquipment } from '@/lib/fracturedArchive/loadout';
import {
  FRACTURED_ARCHIVE_RAID,
  RAIDS,
  raidConfig,
  raidBase,
  teamDpsMultiplier,
  teamTimeLabel,
  TOMBS_OF_AMASCUT_RAID,
  withScalingInput,
} from '@/lib/raids';
import { TOA_ROUTE_ID } from '@/lib/raids/toa/time';

// Phase 18: every raid config is valid — targets resolve to monsters, inputs have defaults, routes enumerate, and the
// Fractured Archive config is exactly the phase 8-17 data (no behaviour change).

describe('RaidConfig: every raid', () => {
  test('raid ids are unique; FA is the default tab', () => {
    expect(RAIDS.map((r) => r.id)).toEqual(['fractured-archive', 'toa', 'cox', 'tob']);
    expect(raidConfig('tob').name).toBe('Theatre of Blood');
    expect(raidConfig(undefined)).toBe(FRACTURED_ARCHIVE_RAID);
    expect(raidConfig('toa')).toBe(TOMBS_OF_AMASCUT_RAID);
    expect(raidConfig('cox').name).toBe('Chambers of Xeric');
  });

  test('target keys are unique across raids and findTarget finds every one', () => {
    const keys = RAIDS.flatMap((r) => r.targets.map((t) => t.key));
    expect(new Set(keys).size).toBe(keys.length);
    expect(ALL_TARGETS.map((t) => t.key).sort()).toEqual([...keys].sort());
    keys.forEach((k) => expect(findTarget(k).key).toBe(k));
  });

  RAIDS.forEach((raid) => {
    describe(raid.name, () => {
      test('every target resolves to exactly one monster with an image in cdn/', () => {
        raid.targets.forEach((t) => {
          const ms = getMonsters().filter((m) => m.name === t.name && m.version === t.version);
          expect(ms.length).toBeGreaterThanOrEqual(1);
          const { monster } = buildTargetMonster(t, undefined, 'none', raid.defaultAssumptions);
          expect(monster.name).toBe(t.name);
          expect(monster.inputs.monsterCurrentHp).toBeGreaterThan(0);
          expect(monster.image).toBeTruthy();
          expect(monster.image!.includes('%')).toBe(false);
          expect(existsSync(join(process.cwd(), 'cdn', 'monsters', monster.image!))).toBe(true);
          expect(raid.id).toBe(t.raid ?? 'fractured-archive');
        });
      });

      test('phase options: the target\'s own list or the calculator\'s, and every summary phase is one of them', () => {
        raid.targets.forEach((t) => {
          const phases = targetPhases(t);
          const { monster } = buildTargetMonster(t, undefined, 'none', raid.defaultAssumptions);
          const calc = MONSTER_PHASES_BY_ID[monster.id] || [];
          phases.forEach((p) => expect(calc.length ? calc : phases).toContain(p));
          (t.summaryPhases || []).forEach((p) => expect(phases).toContain(p));
        });
        expect(summaryQueries(raid.targets).length).toBeGreaterThan(0);
      });

      test('scaling inputs have defaults within their range that match the default assumptions', () => {
        expect(raid.scalingInputs.length).toBeGreaterThan(0);
        expect(raid.scalingInputs[0].key).toBe('partySize');
        raid.scalingInputs.forEach((d) => {
          expect(d.default).toBeGreaterThanOrEqual(d.min);
          expect(d.default).toBeLessThanOrEqual(d.max);
          expect(d.get(raid.defaultAssumptions)).toBe(d.default);
          // setters clamp and round trip
          expect(d.get(withScalingInput(raid.defaultAssumptions, d, d.max + 100))).toBe(d.max);
          expect(d.get(withScalingInput(raid.defaultAssumptions, d, d.min - 100))).toBe(d.min);
        });
        expect(raid.partySize.min).toBe(raid.scalingInputs[0].min);
        expect(raid.partySize.max).toBe(raid.scalingInputs[0].max);
      });

      test('routes enumerate; every phase the time model queries is a target of this raid', () => {
        const a = raidTimeAssumptionsFrom(raid.defaultAssumptions, 'none', raid.defaultTimeSettings, raid.time);
        const routes = routesFor(a);
        expect(routes.length).toBe(raid.id === 'fractured-archive' ? 8 : 1);
        routes.forEach((r) => r.encounters.forEach((e) => {
          expect(raid.time.labels[e]).toBeTruthy();
          expect(raid.targets.map((t) => t.key)).toContain(raid.encounterTarget[e]);
        }));
        const own = new Set(raid.targets.map((t) => t.key));
        const required = raid.time.requiredPhaseTargets(a);
        expect(required.length).toBeGreaterThan(0);
        required.forEach((q) => {
          expect(own.has(q.targetKey)).toBe(true);
          if (q.phase) expect(targetPhases(findTarget(q.targetKey))).toContain(q.phase);
        });
      });

      test('presets and pool weapons resolve to items with images in cdn/', () => {
        raid.presets.forEach((p) => {
          const eq = resolvePresetEquipment(p);
          Object.values(eq).forEach((it) => expect(existsSync(join(process.cwd(), 'cdn', 'equipment', it!.image))).toBe(true));
        });
        expect(new Set(raid.presets.map((p) => p.name)).size).toBe(raid.presets.length);
        Object.values(raid.searchPool).forEach((pool) => pool.weapons.forEach((w) => {
          const it = resolveItem(w.weapon);
          expect(it.name).toBe(refName(w.weapon));
          expect(existsSync(join(process.cwd(), 'cdn', 'equipment', it.image))).toBe(true);
        }));
      });

      test('the pure modules\' raid rules (raidBase) are the config\'s; settings fields exist in the defaults', () => {
        const id = raid.id === 'fractured-archive' ? undefined : raid.id;
        const base = raidBase(id);
        expect(base.targets).toBe(raid.targets);
        expect(base.presets).toBe(raid.presets);
        expect(base.searchPool).toBe(raid.searchPool);
        expect(base.monsterInputs).toBe(raid.monsterInputs);
        raid.timeSettingFields.forEach((f) => expect(raid.defaultTimeSettings[f.key]).toBeDefined());
        expect(Object.values(raid.defaultSupplies).every((n) => n >= 0)).toBe(true);
      });
    });
  });
});

describe('Team-DPS multiplier (times assume N players at your DPS)', () => {
  test('defaults: 1 for the Fractured Archive (identity hp table), the party size for ToA (hp scales with party)', () => {
    expect(teamDpsMultiplier(DEFAULT_ASSUMPTIONS)).toBe(1);
    expect(teamDpsMultiplier({ ...DEFAULT_ASSUMPTIONS, partySize: 4 })).toBe(1);
    expect(teamDpsMultiplier(TOMBS_OF_AMASCUT_RAID.defaultAssumptions)).toBe(6);
    expect(teamDpsMultiplier({ ...TOMBS_OF_AMASCUT_RAID.defaultAssumptions, partySize: 3 })).toBe(3);
    expect(teamDpsMultiplier({ ...TOMBS_OF_AMASCUT_RAID.defaultAssumptions, teamDpsMultiplier: 2 })).toBe(2);
    expect(teamDpsMultiplier({ ...DEFAULT_ASSUMPTIONS, teamDpsMultiplier: 5 })).toBe(5);
  });

  test('the time model gets it; labels', () => {
    expect(raidTimeAssumptionsFrom(DEFAULT_ASSUMPTIONS, 'none').dpsMultiplier).toBe(1);
    expect(raidTimeAssumptionsFrom(TOMBS_OF_AMASCUT_RAID.defaultAssumptions, 'none').dpsMultiplier).toBe(6);
    expect(teamTimeLabel(1)).toBe('times: your DPS alone');
    expect(teamTimeLabel(6)).toBe('times assume 6 players at your DPS');
  });
});

describe('RaidConfig: the Fractured Archive is the phase 8-17 data, unchanged', () => {
  test('same targets, presets, pool, assumptions and time model', () => {
    expect(FRACTURED_ARCHIVE_RAID.targets).toBe(BEST_SETUP_TARGETS);
    expect(FRACTURED_ARCHIVE_RAID.presets).toBe(PRESETS);
    expect(FRACTURED_ARCHIVE_RAID.searchPool).toBe(SEARCH_POOL);
    expect(FRACTURED_ARCHIVE_RAID.defaultAssumptions).toBe(DEFAULT_ASSUMPTIONS);
    expect(FRACTURED_ARCHIVE_RAID.defaultAssumptions.raid).toBeUndefined();
    expect(FRACTURED_ARCHIVE_RAID.time).toBe(FA_TIME_MODEL);
    expect(FRACTURED_ARCHIVE_RAID.time.routeSlots).toBe(ROUTE_SLOTS);
    expect(FRACTURED_ARCHIVE_RAID.defaultTimeSettings).toBe(RAID_TIME_DEFAULTS);
    expect(FRACTURED_ARCHIVE_RAID.routesLabel).toBe('Routes');
  });

  test('FA assumptions without a raid build the same monsters as before (no ToA inputs)', () => {
    const { monster } = buildTargetMonster(findTarget('xarth'), undefined, 'none', DEFAULT_ASSUMPTIONS);
    expect(monster.inputs.toaInvocationLevel).toBe(0);
    expect(monster.inputs.toaPathLevel).toBe(0);
    expect(monster.inputs.partySize).toBe(6);
  });
});

describe('RaidConfig: Tombs of Amascut', () => {
  test('one fixed route, shown as Encounters', () => {
    const a = raidTimeAssumptionsFrom(TOMBS_OF_AMASCUT_RAID.defaultAssumptions, 'none', TOMBS_OF_AMASCUT_RAID.defaultTimeSettings, TOMBS_OF_AMASCUT_RAID.time);
    const [route] = routesFor(a);
    expect(route.id).toBe(TOA_ROUTE_ID);
    expect(route.encounters).toEqual(['toa-kephri', 'toa-zebak', 'toa-akkha', 'toa-baba', 'toa-wardens']);
    expect(TOMBS_OF_AMASCUT_RAID.routesLabel).toBe('Encounters');
  });

  test('defaults: raid level 500, path levels 0, party 6, salts, no FA-only boosts', () => {
    const a = TOMBS_OF_AMASCUT_RAID.defaultAssumptions;
    expect(a.raid).toBe('toa');
    expect(a.toa).toEqual({
      invocationLevel: 500,
      pathLevels: {
        akkha: 0, baba: 0, kephri: 0, zebak: 0,
      },
    });
    expect(a.partySize).toBe(6);
    expect(a.useZeal).toBe(false);
    expect(a.elementalFragments).toBe(false);
    expect(TOMBS_OF_AMASCUT_RAID.raidOnlyAssumptions).toBe(false);
  });

  test('ToA targets get the calculator\'s ToA inputs; party size 1 is allowed', () => {
    const solo = { ...TOMBS_OF_AMASCUT_RAID.defaultAssumptions, partySize: 1 };
    const { monster } = buildTargetMonster(findTarget('toa-zebak'), undefined, 'none', solo);
    expect(monster.inputs.toaInvocationLevel).toBe(500);
    expect(monster.inputs.partySize).toBe(1);
    const path = withScalingInput(solo, TOMBS_OF_AMASCUT_RAID.scalingInputs.find((d) => d.key === 'toaPath-zebak')!, 3);
    expect(buildTargetMonster(findTarget('toa-zebak'), undefined, 'none', path).monster.inputs.toaPathLevel).toBe(3);
    // the other paths' levels don't apply to Zebak, and non-path monsters never get one
    expect(buildTargetMonster(findTarget('toa-akkha'), undefined, 'none', path).monster.inputs.toaPathLevel).toBe(0);
    expect(buildTargetMonster(findTarget('toa-warden-p3'), undefined, 'none', path).monster.inputs.toaPathLevel).toBe(0);
  });
});
