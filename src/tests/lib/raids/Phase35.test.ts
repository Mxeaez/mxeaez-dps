import { describe, expect, test } from '@jest/globals';
import {
  OTHER_RAIDS, otherRaidsDescribe, otherRaidsSlowDescribe, otherRaidsTest,
} from '@/tests/utils/otherRaids';
import React from 'react';
import { TextDecoder, TextEncoder } from 'util';
import { generateEmptyPlayer } from '@/state';
import { buildTargetMonster, findTarget } from '@/lib/fracturedArchive/bestSetup';
import { BestSetupAssumptions, PresetDef } from '@/lib/fracturedArchive/presets';
import {
  computeRouteComparison, createKitEvaluator, encounterTime, EncounterTime, formatDuration, presetKitLoadout, raidTimeAssumptionsFrom,
} from '@/lib/fracturedArchive/raidTime';
import { briefingRows } from '@/lib/fracturedArchive/briefing';
import {
  DEFAULT_CARRIER_MODE, DEFAULT_RING_POLICY, DEFAULT_SPEC_MODE, plan, PlanResult, planItemByName,
} from '@/lib/fracturedArchive/planner';
import { RaidConfig, raidConfig } from '@/lib/raids';
import { NO_DRAINS_ADDS } from '@/lib/raids/types';
import { TOA_ROUTES } from '@/lib/raids/toa/time';
import { INITIAL_MONSTER_INPUTS } from '@/lib/Monsters';
import SpecPlanPanel from '@/app/components/bestSetup/SpecPlanPanel';
import { headline } from '@/tests/utils/headlines';

// Phase 35: adds and short-lived targets get no specs (user, 2026-10-24: "you obviously aren't going to Ralos or Elder
// maul spec the little minions that die in a few hits anyway"). They carry `noDrains: NO_DRAINS_ADDS`, so every drain
// state ranks them at full Defence, the planners plan no drains on them and the team carriers save nothing on them.
// Docs: docs/BEST_SETUP.md *Targets that never get specs (phase 35)*, docs/DATA_SOURCES.md *Phase 35*.

const ADDS_ALL: [string, RaidConfig['id']][] = [
  ['toa-spitting-scarab', 'toa'],
  ['toa-soldier-scarab', 'toa'],
  ['toa-arcane-scarab', 'toa'],
  ['toa-akkha-shadow', 'toa'],
  ['cox-mystic', 'cox'],
  ['cox-shaman', 'cox'],
  ['cox-muttadile-small', 'cox'],
  ['cox-glowing-crystal', 'cox'],
  ['cox-abyssal-portal', 'cox'],
  ['tob-ischyros-small', 'tob'],
  ['tob-ischyros-big', 'tob'],
  ['tob-toxobolos-small', 'tob'],
  ['tob-toxobolos-big', 'tob'],
  ['tob-hagios-small', 'tob'],
  ['tob-hagios-big', 'tob'],
  ['jelly', 'fractured-archive'],
];

/** Judgement calls (bosses, boss phases, room bosses): they keep their drains. */
const KEEP_ALL: [string, RaidConfig['id']][] = [
  ['toa-kephri-shielded', 'toa'],
  ['toa-akkha', 'toa'],
  ['toa-obelisk', 'toa'],
  ['toa-warden-core', 'toa'],
  ['cox-tekton', 'cox'],
  ['cox-vasa', 'cox'],
  ['cox-vespula', 'cox'],
  ['cox-muttadile-large', 'cox'],
  ['cox-ice-demon', 'cox'],
  ['cox-olm-left', 'cox'],
  ['cox-olm-right', 'cox'],
  ['cox-olm-head', 'cox'],
  ['tob-nylo-boss-melee', 'tob'],
  ['dagonhai', 'fractured-archive'],
  ['ocellus-p2', 'fractured-archive'],
  ['smorks', 'fractured-archive'],
];

// phase 38f-2: the other raids' rows only with RUN_OTHER_RAIDS=1
const ADDS = ADDS_ALL.filter(([, raid]) => OTHER_RAIDS || raid === 'fractured-archive');
const KEEP = KEEP_ALL.filter(([, raid]) => OTHER_RAIDS || raid === 'fractured-archive');

const A = (id: RaidConfig['id']): BestSetupAssumptions => raidConfig(id).defaultAssumptions;
const SOLO = (id: RaidConfig['id']): BestSetupAssumptions => ({
  ...A(id),
  mySpecs: {
    ...A(id).mySpecs, elderMaul: true, tonalztics: true, bgs: true, ayak: 2,
  },
});
const ADD_KEYS = new Set(ADDS_ALL.map(([k]) => k));

describe('adds: noDrains with the adds reason', () => {
  test.each(ADDS)('%s', (key) => {
    expect(findTarget(key).noDrains).toBe(NO_DRAINS_ADDS);
    // phase 38b: drains only (damage specs are allowed on adds)
    expect(NO_DRAINS_ADDS).toBe('adds: not worth a drain spec');
  });

  otherRaidsTest('the existing reasons are kept (Vanguards, Bloat after a stomp, Verzik)', () => {
    expect(findTarget('cox-vanguard-melee').noDrains).toBe('Vanguards restore drained stats in their shell');
    expect(findTarget('tob-bloat-restored').noDrains).toMatch(/regenerate to full when it stomps/);
    expect(findTarget('tob-verzik-p2').noDrains).toMatch(/absorbs the defence reduction/);
  });
});

describe('adds: buildTargetMonster returns the undrained monster for Solo and Team', () => {
  test.each(ADDS)('%s', (key, raid) => {
    const target = findTarget(key);
    const none = buildTargetMonster(target, undefined, 'none', A(raid));
    (['solo', 'team'] as const).forEach((d) => {
      const a = d === 'solo' ? SOLO(raid) : A(raid);
      const built = buildTargetMonster(target, undefined, d, a);
      expect(built.monster.inputs.defenceReductions).toEqual(INITIAL_MONSTER_INPUTS.defenceReductions);
      expect(built.drain.defAfter).toBe(none.drain.defAfter);
      expect(built.drain.magicDefAfter).toBe(none.drain.magicDefAfter);
      expect(built.drain.plan).toBe(`No drains: ${NO_DRAINS_ADDS}`);
      expect(built.drain.line).toBeUndefined();
      expect(built.drain.id).toBe(d);
    });
  });
});

describe('judgement calls keep their drains (bosses, boss phases, room bosses)', () => {
  test.each(KEEP)('%s', (key, raid) => {
    const target = findTarget(key);
    expect(target.noDrains).toBeUndefined();
    const team = buildTargetMonster(target, undefined, 'team', A(raid)).drain;
    expect(team.plan).not.toMatch(/^No drains/);
    expect(team.line).toBeDefined();
  });
});

// react-dom/server needs TextEncoder, which jsdom doesn't provide: set it, then load the renderer (as Phase34.test.ts)
Object.assign(globalThis, { TextEncoder, TextDecoder });
// eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
const { renderToStaticMarkup } = require('react-dom/server') as typeof import('react-dom/server');

const dom = (el: React.ReactElement) => {
  const div = document.createElement('div');
  div.innerHTML = renderToStaticMarkup(el);
  return div;
};

otherRaidsDescribe('Search drain box (SpecPlanPanel)', () => {
  const NO_SPECS = 'no spec weapons: run a plan or pick Specs I bring';
  const panel = (targetKey: string, drain: 'solo' | 'team', noSpecsNote?: string) => dom(React.createElement(SpecPlanPanel, {
    targetKey, phase: undefined, drain, assumptions: A('toa'), noSpecsNote,
  }));

  test.each(['solo', 'team'] as const)('an add, %s: "No drains: adds: not worth a spec", no "no spec weapons" note, no per-boss table', (drain) => {
    const d = panel('toa-spitting-scarab', drain, drain === 'solo' ? NO_SPECS : undefined);
    expect(d.querySelector('[data-testid="drain-no-drains"]')?.textContent).toBe(`No drains: ${NO_DRAINS_ADDS}`);
    expect(d.querySelector('[data-testid="drain-no-specs"]')).toBeNull();
    expect(d.querySelector('[data-testid="drain-brief-item"]')).toBeNull();
    expect(d.querySelector('[data-testid="team-table"]')).toBeNull();
  });

  test('a boss keeps the "no spec weapons" note (Solo) and the per-boss table (Team)', () => {
    const solo = panel('toa-kephri-shielded', 'solo', NO_SPECS);
    expect(solo.querySelector('[data-testid="drain-no-specs"]')?.textContent).toBe(NO_SPECS);
    expect(solo.querySelector('[data-testid="drain-no-drains"]')).toBeNull();
    const team = panel('toa-kephri-shielded', 'team');
    expect(team.querySelector('[data-testid="drain-no-drains"]')).toBeNull();
    expect(team.querySelector('[data-testid="team-table"]')).not.toBeNull();
  });
});

/** The first preset of each style group + the pickaxe preset (CoX Guardians), as CrossRaid's fast pins. */
const kitPresets = (raid: RaidConfig): PresetDef[] => [
  ...(['melee', 'ranged', 'magic'] as const).map((g) => raid.presets.find((p) => p.group === g)!).filter(Boolean),
  ...raid.presets.filter((p) => p.name.includes('pickaxe')),
];
const encounters = (id: RaidConfig['id'], ids: string[], drain: 'none' | 'team' | 'solo'): EncounterTime[] => {
  const raid = raidConfig(id);
  const a = drain === 'solo' ? SOLO(id) : A(id);
  const kit = createKitEvaluator(kitPresets(raid).map((p) => presetKitLoadout(generateEmptyPlayer(), p, a)), a);
  return ids.map((e) => encounterTime(e, kit, raidTimeAssumptionsFrom(a, drain, raid.defaultTimeSettings, raid.time)));
};
const TOA_IDS = ['toa-kephri', 'toa-akkha'];
const COX_IDS = ['cox-vasa', 'cox-vespula', 'cox-mystics', 'cox-shamans', 'cox-muttadiles'];

otherRaidsDescribe('time model: no drains planned on the adds, so the carriers save no time on them', () => {
  test.each([['toa', TOA_IDS], ['cox', COX_IDS]] as [RaidConfig['id'], string[]][])('%s', (id, ids) => {
    const none = encounters(id, ids, 'none');
    (['team', 'solo'] as const).forEach((d) => {
      const drained = encounters(id, ids, d);
      let adds = 0;
      drained.forEach((e, i) => e.phases.forEach((p, j) => {
        if (!ADD_KEYS.has(p.targetKey)) return;
        adds += 1;
        // the same seconds as with drains "None" (no time saved: what the greedy carriers count is the route time)
        expect(p.seconds).toBeCloseTo(none[i].phases[j].seconds, 9);
        expect(p.choice?.drainLine).toBeUndefined();
      }));
      expect(adds).toBeGreaterThan(0);
    });
    // and the boss phases still drain (Team): Kephri shielded / Akkha, Vasa, Vespula, the large muttadile
    const team = encounters(id, ids, 'team');
    expect(team.some((e) => e.phases.some((p) => !ADD_KEYS.has(p.targetKey) && p.choice?.drainLine))).toBe(true);
  });

  test('briefing: the add phases never start a drain part (Kephri: the shield; Akkha: Akkha)', () => {
    const rows = briefingRows(encounters('toa', TOA_IDS, 'team'), 'team');
    const team = encounters('toa', TOA_IDS, 'team');
    rows.forEach((r, i) => {
      const addKeys = team[i].phases.filter((p) => ADD_KEYS.has(p.targetKey)).map((p) => p.key);
      expect(r.specs.every((g) => !addKeys.includes(g.key))).toBe(true);
      expect(r.drainText ?? '').not.toMatch(/Scarab|Shadow/);
    });
  });
});

// phase 38f: the fast copy plans one route with ring switches (seconds); the slow copy is the original (camp one ring,
// every route: 635 s on this machine, RUN_SLOW_TESTS=1).
otherRaidsDescribe.each([['ring switches, one route', false], ['camp one ring, every route (slow)', true]] as [string, boolean][])('ToA plan (reduced pool), %s: the spec plan and briefing list no add targets', (_, slow) => {
  const raid = raidConfig('toa');
  const planTest = slow && !process.env.RUN_SLOW_TESTS ? test.skip : test;
  let res: PlanResult;
  const run = () => {
    if (!res) {
      res = plan({
        ringPolicy: slow ? DEFAULT_RING_POLICY : 'switch',
        specMode: slow ? DEFAULT_SPEC_MODE : 'manual',
        carrierMode: slow ? DEFAULT_CARRIER_MODE : 'manual',
        basePlayer: generateEmptyPlayer(),
        assumptions: raid.defaultAssumptions,
        drain: 'team',
        settings: raid.defaultTimeSettings,
        route: slow ? 'all' : TOA_ROUTES[0].join('>'),
        pinned: raid.planDefaults.pinned.map((n) => planItemByName(n).id),
        nonItemSlots: raid.planDefaults.nonItemSlots,
        supplies: raid.defaultSupplies,
      }, {
        model: raid.time,
        presets: kitPresets(raid),
        search: { weapons: ['Scythe of Vitur', 'Tumeken\'s shadow', 'Twisted bow'], maxPasses: 1 },
        perGroupWeapons: 1,
        perWeapon: 1,
        bases: 1,
        partners: 1,
        seeds: 2,
      });
    }
    return res;
  };

  planTest('team briefing per-boss minimum, carriers\' drivers and the raid briefing', () => {
    const r = run();
    const team = r.specs.team!;
    expect(team.perTarget.length).toBeGreaterThan(0);
    team.perTarget.forEach((t) => expect(ADD_KEYS.has(t.key.split('|')[0])).toBe(false));
    team.perTarget.forEach((t) => expect(t.label).not.toMatch(/Scarab|Shadow/));
    team.rows.forEach((row) => row.drivers.forEach((d) => expect(d).not.toMatch(/Scarab|Shadow/)));
    const route = r.comparison!.routes[r.planned];
    const rows = briefingRows(route.encounters, 'team');
    rows.forEach((row) => expect(row.drainText ?? '').not.toMatch(/Scarab|Shadow/));
    route.encounters.forEach((e) => e.phases.forEach((p) => {
      if (ADD_KEYS.has(p.targetKey)) expect(p.choice?.drainLine).toBeUndefined();
    }));
    expect(formatDuration(route.seconds)).toMatch(/^\d+:\d\d\.\d$/);
  }, 300000);

  planTest('the route comparison with the planner\'s carriers: add phases take the undrained seconds', () => {
    const r = run();
    const a = { ...raid.defaultAssumptions, team: { ...raid.defaultAssumptions.team, carriers: r.specs.team!.carriers! } };
    const kit = { searchGroups: [], presets: kitPresets(raid).map((p) => p.name), players: [] };
    const cmp = (drain: 'team' | 'none') => computeRouteComparison({
      basePlayer: generateEmptyPlayer(), assumptions: a, drain, settings: raid.defaultTimeSettings, kit, searchBest: {},
    }, undefined, raid.time).routes[0];
    const team = cmp('team');
    const none = cmp('none');
    team.encounters.forEach((e, i) => e.phases.forEach((p, j) => {
      if (ADD_KEYS.has(p.targetKey)) expect(p.seconds).toBeCloseTo(none.encounters[i].phases[j].seconds, 9);
    }));
  }, 300000);
});

/**
 * The headline plans that move (defaults, Team, camp one ring; CrossRaid pins the same totals): ToA 14:04.1 → 14:12.1
 * (carriers 1 Elder maul + 1 Eye of Ayak, the Tonalztics carrier dropped), CoX 6:35.9 → 7:01.3 (2 Elder maul, 1
 * Tonalztics, 1 BGS, 1 Eye of Ayak). Slow: `RUN_SLOW_TESTS=1`.
 */
otherRaidsSlowDescribe('headlines (slow)', () => {
  test.each([
    // phase 36 (one spec budget per encounter, damage specs, surge): ToA 14:12.1 → 14:05.5, CoX 7:01.3 → 7:03.6
    // phase 36 review (carriers ≤ party − 1 with your damage specs; hp left; drained clock): ToA → 14:07.8, CoX → 7:08.7
    // phase 37b: total, seconds and carriers from src/tests/fixtures/headlines.json (scripts/pinHeadlines.mjs)
    ['toa', headline('toa').total, headline('toa').seconds, headline('toa').carriers!],
    ['cox', headline('cox').total, headline('cox').seconds, headline('cox').carriers!],
  ] as [RaidConfig['id'], string, number, Record<string, number>][])('%s: %s', (id, text, seconds, carriers) => {
    const raid = raidConfig(id);
    const res = plan({
      ringPolicy: DEFAULT_RING_POLICY,
      specMode: DEFAULT_SPEC_MODE,
      carrierMode: DEFAULT_CARRIER_MODE,
      basePlayer: generateEmptyPlayer(),
      assumptions: raid.defaultAssumptions,
      drain: 'team',
      settings: raid.defaultTimeSettings,
      route: 'all',
      pinned: raid.planDefaults.pinned.map((n) => planItemByName(n).id),
      nonItemSlots: raid.planDefaults.nonItemSlots,
      supplies: raid.defaultSupplies,
    }, { model: raid.time });
    const route = res.comparison!.routes[res.planned];
    expect(Math.abs(route.seconds - seconds)).toBeLessThanOrEqual(seconds * 0.01);
    expect(res.specs.team!.carriers).toEqual(carriers);
    res.specs.team!.perTarget.forEach((t) => expect(ADD_KEYS.has(t.key.split('|')[0])).toBe(false));
    route.encounters.forEach((e) => e.phases.forEach((p) => {
      if (ADD_KEYS.has(p.targetKey)) expect(p.choice?.drainLine).toBeUndefined();
    }));
  }, 900000);
});
