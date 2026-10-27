import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, test } from '@jest/globals';
import Potion from '@/enums/Potion';
import { raidConfig } from '@/lib/raids';
import {
  clearSettings, defaultRaidSettings, defaultSettings, loadSettings, parseSettings, resetRaidSettings, saveSettings,
  SavedSettings, serialiseSettings, SETTINGS_STORAGE_KEY, SETTINGS_VERSION,
} from '@/lib/raids/settings';

import { memoKeyJson } from '@/lib/fracturedArchive/kitMemo';
import {
  decodeRingRuns, encodeRingRuns, parallelPlanStats, ringProgressDone,
} from '@/lib/fracturedArchive/parallelRings';
import { PlanResult, planItemByName } from '@/lib/fracturedArchive/planner';
import { memoCountersWithin, PHASE37_MEMO, phase37Fixture } from '@/tests/utils/phase37';
import {
  headline, HEADLINE_CASES, headlineOf, readHeadlines, readmeTable, withReadmeTable,
} from '@/tests/utils/headlines';

// Phase 37b: "Remember my settings" (src/lib/raids/settings.ts) and the phase 37 review nits (memo counters bounded
// separately, memo keys with non-finite numbers, -0 between workers, the parallel plan's footer / progress).

const FA = raidConfig('fractured-archive');
const TOA = raidConfig('toa');
const COX = raidConfig('cox');
const TOB = raidConfig('tob');

const memoryStorage = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
    map: m,
  };
};

/** Every kind of input changed: FA (assumptions, Advanced, time model, drains, spec mode, plan inputs), ToA, CoX, ToB. */
const changed = (): SavedSettings => {
  const s = defaultSettings();
  const fa = s.raids['fractured-archive'];
  const faFirstRoute = FA.time.routeSlots.map((slot) => slot.options[0]).join('>');
  const faTimeField = FA.timeSettingFields.find((f) => f.kind === 'number' || f.kind === 'percent')!;
  s.raid = 'toa';
  s.raids['fractured-archive'] = {
    assumptions: {
      ...fa.assumptions,
      partySize: 4,
      potions: { ...fa.assumptions.potions, melee: Potion.SUPER_STRENGTH },
      useZeal: true,
      elementalFragments: false,
      mySpecs: {
        ...fa.assumptions.mySpecs, elderMaul: true, ayak: 3, lightbearer: true, priority: 'ayak',
      },
      team: {
        ...fa.assumptions.team,
        manual: true,
        carriers: { ...fa.assumptions.team.carriers, bgs: 2 },
        lightbearer: { ...fa.assumptions.team.lightbearer, elderMaul: true },
      },
      floorThreshold: 0.9,
      teamDpsMultiplier: 2.5,
    },
    time: { ...fa.time, [faTimeField.key]: faTimeField.kind === 'percent' ? 0.5 : 7 },
    drain: 'solo',
    specMode: 'manual',
    plan: {
      route: faFirstRoute,
      supplies: { ...fa.plan.supplies, brew: 5, food: 2 },
      ringPolicy: 'switch',
      mages: 2,
      nonItem: 2,
      pinned: [planItemByName('Lightbearer').id],
      nonFightMinutes: 30,
      spellbook: 'ancients',
    },
  };
  const toa = s.raids.toa;
  s.raids.toa = {
    ...toa,
    assumptions: { ...toa.assumptions, toa: { ...toa.assumptions.toa!, invocationLevel: 300 } },
    plan: { ...toa.plan, ringPolicy: 'camp-lightbearer' },
  };
  s.raids.cox = { ...s.raids.cox, assumptions: { ...s.raids.cox.assumptions, cox: { challengeMode: true } } };
  s.raids.tob = { ...s.raids.tob, assumptions: { ...s.raids.tob.assumptions, tob: { mode: 'hard' } }, drain: 'none' };
  return s;
};

describe('remember my settings (phase 37b)', () => {
  test('defaults: nothing is stored; no key → the defaults', () => {
    expect(serialiseSettings(defaultSettings())).toBeNull();
    expect(parseSettings(null)).toEqual(defaultSettings());
    const st = memoryStorage();
    saveSettings(defaultSettings(), st);
    expect(st.map.size).toBe(0);
    expect(loadSettings(st)).toEqual(defaultSettings());
  });

  test('round trip: every input of every raid and the raid tab come back as set', () => {
    const s = changed();
    const st = memoryStorage();
    saveSettings(s, st);
    expect(st.map.has(SETTINGS_STORAGE_KEY)).toBe(true);
    expect(loadSettings(st)).toEqual(s);
    // only the differences from the defaults are stored
    const stored = JSON.parse(st.map.get(SETTINGS_STORAGE_KEY)!);
    expect(stored.version).toBe(SETTINGS_VERSION);
    expect(stored.raid).toBe('toa');
    expect(stored.raids.toa).toEqual({ assumptions: { toa: { invocationLevel: 300 } }, plan: { ringPolicy: 'camp-lightbearer' } });
    expect(stored.raids.cox).toEqual({ assumptions: { cox: { challengeMode: true } } });
    expect(stored.raids.tob).toEqual({ assumptions: { tob: { mode: 'hard' } }, drain: 'none' });
    expect(stored.raids['fractured-archive'].plan.supplies).toEqual({ brew: 5, food: 2 });
    expect(stored.raids['fractured-archive'].assumptions.partySize).toBe(4);
    // plan results / planner-only fields are never stored
    const withPlannerFields = changed();
    withPlannerFields.raids['fractured-archive'].assumptions = {
      ...withPlannerFields.raids['fractured-archive'].assumptions, fightSeconds: 99, damageSpecs: ['zcb'], surgePotions: 1,
    };
    expect(serialiseSettings(withPlannerFields)).toBe(serialiseSettings(s));
  });

  test('a version mismatch, no version or corrupt JSON → the defaults', () => {
    const text = serialiseSettings(changed())!;
    expect(parseSettings(text.replace(`"version":${SETTINGS_VERSION}`, '"version":2'))).toEqual(defaultSettings());
    expect(parseSettings(text.replace(`"version":${SETTINGS_VERSION},`, ''))).toEqual(defaultSettings());
    expect(parseSettings(text.slice(0, text.length / 2))).toEqual(defaultSettings());
    expect(parseSettings('[]')).toEqual(defaultSettings());
    expect(parseSettings('null')).toEqual(defaultSettings());
    const st = memoryStorage();
    st.setItem(SETTINGS_STORAGE_KEY, '{not json');
    expect(loadSettings(st)).toEqual(defaultSettings());
    // blocked storage
    expect(loadSettings({ getItem: () => { throw new Error('blocked'); }, setItem: () => {}, removeItem: () => {} })).toEqual(defaultSettings());
    expect(loadSettings(null)).toEqual(defaultSettings());
  });

  test('partial / invalid data: the valid parts are kept, everything else is the default', () => {
    const fa = defaultRaidSettings(FA);
    const got = parseSettings(JSON.stringify({
      version: SETTINGS_VERSION,
      raid: 'nowhere',
      raids: {
        'fractured-archive': {
          assumptions: {
            partySize: 99, // out of range
            potions: { melee: 'super', ranged: Potion.SUPER_RANGING, magic: 999 },
            useZeal: 'yes',
            elementalFragments: false,
            mySpecs: { ayak: -1, bgs: true, priority: 'everything' },
            team: { carriers: { elderMaul: 3, tonalztics: 1.5 }, manual: 'no' },
            floorThreshold: 5,
            teamDpsMultiplier: 0,
            fightSeconds: 30, // not an input
            raid: 'toa', // can't move the raid's settings to another raid
          },
          time: { nope: 1 },
          drain: 'sometimes',
          specMode: 'manual',
          plan: {
            route: 'archive-guardian>nowhere',
            supplies: { brew: 5, restore: 40, ranging: 3 },
            ringPolicy: 'camp-two',
            mages: 99,
            nonItem: -1,
            pinned: [planItemByName('Lightbearer').id, 'x', -5, planItemByName('Lightbearer').id],
          },
          unknown: { x: 1 },
        },
        tob: { assumptions: { tob: { mode: 'impossible' } }, plan: 'no' },
        nowhere: { drain: 'solo' },
      },
    }));
    expect(got.raid).toBe('fractured-archive');
    const a = got.raids['fractured-archive'].assumptions;
    expect(a).toEqual({
      ...fa.assumptions,
      potions: { ...fa.assumptions.potions, ranged: Potion.SUPER_RANGING },
      elementalFragments: false,
      mySpecs: { ...fa.assumptions.mySpecs, bgs: true },
      team: { ...fa.assumptions.team, carriers: { ...fa.assumptions.team.carriers, elderMaul: 3 } },
    });
    expect(got.raids['fractured-archive'].time).toEqual(fa.time);
    expect(got.raids['fractured-archive'].drain).toBe('team');
    expect(got.raids['fractured-archive'].specMode).toBe('manual');
    expect(got.raids['fractured-archive'].plan).toEqual({
      ...fa.plan, supplies: { ...fa.plan.supplies, brew: 5 }, pinned: [planItemByName('Lightbearer').id],
    });
    expect(got.raids.tob).toEqual(defaultRaidSettings(TOB));
    expect(got.raids.toa).toEqual(defaultRaidSettings(TOA));
    expect(got.raids.cox).toEqual(defaultRaidSettings(COX));
  });

  test('Reset clears that raid\'s saved values (the others stay); Reset all removes the key', () => {
    const st = memoryStorage();
    const s = changed();
    saveSettings(resetRaidSettings(s, 'fractured-archive'), st);
    const stored = JSON.parse(st.map.get(SETTINGS_STORAGE_KEY)!);
    expect(stored.raids['fractured-archive']).toBeUndefined();
    expect(Object.keys(stored.raids).sort()).toEqual(['cox', 'toa', 'tob']);
    expect(loadSettings(st).raids['fractured-archive']).toEqual(defaultRaidSettings(FA));
    expect(loadSettings(st).raids.toa).toEqual(s.raids.toa);
    clearSettings(st);
    expect(st.map.size).toBe(0);
    expect(loadSettings(st)).toEqual(defaultSettings());
    // every raid reset on the default tab → nothing stored
    const all = (['fractured-archive', 'toa', 'cox', 'tob'] as const).reduce<SavedSettings>((x, id) => resetRaidSettings(x, id), { ...s, raid: 'fractured-archive' });
    saveSettings(all, st);
    expect(st.map.size).toBe(0);
  });

  test('a default changed later still reaches the inputs the user didn\'t touch (only differences are stored)', () => {
    const s = defaultSettings();
    s.raids['fractured-archive'] = { ...s.raids['fractured-archive'], drain: 'solo' };
    const stored = JSON.parse(serialiseSettings(s)!);
    expect(stored.raids['fractured-archive']).toEqual({ drain: 'solo' });
  });
});

describe('phase 37 review nits', () => {
  test('(c) the memo counters bound encounter runs and pass runs separately', () => {
    const want = PHASE37_MEMO.r27fa;
    expect(memoCountersWithin(want, want)).toBe(true);
    // a lost pass memo (2× the pass runs) fails even when fewer encounter runs keep the sum within 1.2×
    const lostPass = {
      ...want, encounterRuns: Math.round(want.encounterRuns * 0.5), passRuns: Math.round(want.passRuns * 1.6),
    };
    expect(lostPass.encounterRuns + lostPass.passRuns).toBeLessThanOrEqual((want.encounterRuns + want.passRuns) * 1.2);
    expect(memoCountersWithin(lostPass, want)).toBe(false);
    expect(memoCountersWithin({ ...want, encounterRuns: want.encounterRuns * 1.3 }, want)).toBe(false);
    expect(memoCountersWithin({ ...want, encounterHits: 0, passHits: 0 }, want)).toBe(false);
    expect(memoCountersWithin(undefined, want)).toBe(false);
  });

  test('(d) memo keys tell Infinity, -Infinity, NaN and null apart', () => {
    const keys = [Infinity, -Infinity, NaN, null, 0].map((x) => memoKeyJson([{ a: x }]));
    expect(new Set(keys).size).toBe(keys.length);
    expect(memoKeyJson({ a: 1, b: 'x' })).toBe(JSON.stringify({ a: 1, b: 'x' }));
  });

  test('(e) ring runs keep -0 (and the non-finite numbers) between workers', () => {
    const back = decodeRingRuns<{ x: number[] }>(encodeRingRuns({ x: [-0, 0, Infinity, -Infinity, 1.5] })).x;
    expect(Object.is(back[0], -0)).toBe(true);
    expect(Object.is(back[1], 0)).toBe(true);
    expect(back.slice(2)).toEqual([Infinity, -Infinity, 1.5]);
    expect(Number.isNaN(decodeRingRuns<{ x: number }>(encodeRingRuns({ x: NaN })).x)).toBe(true);
  });

  test('(a, b) parallel plans: the footer shows the job\'s searches and wall time; the progress never passes the total', () => {
    const stats = {
      searches: 0,
      ms: {
        search: 100, matrix: 200, optimise: 300, total: 900,
      },
    } as unknown as PlanResult['stats'];
    const s = parallelPlanStats(stats, 3, 25, 18000);
    expect(s.searches).toBe(22);
    expect(s.ms).toEqual({
      search: 100, matrix: 200, optimise: 300, total: 18000,
    });
    expect(ringProgressDone(12, 12)).toBe(11);
    expect(ringProgressDone(13, 12)).toBe(11);
    expect(ringProgressDone(4, 12)).toBe(4);
  });
});

describe('the headline fixture (src/tests/fixtures/headlines.json)', () => {
  test.each(HEADLINE_CASES.map((c) => c.name))('%s = the phase 37 full-plan fixture\'s summary', (name) => {
    expect(headlineOf(name, phase37Fixture(name))).toEqual(headline(name));
  });

  test('the README table is the fixture\'s', () => {
    const readme = readFileSync(join(__dirname, '..', '..', '..', '..', 'README.md'), 'utf8').replace(/\r\n/g, '\n');
    const table = readmeTable(readHeadlines());
    expect(readme).toContain(table);
    expect(withReadmeTable(readme, table)).toBe(readme);
    expect(table).toContain(`**${headline('fa').total}**`);
  });
});
