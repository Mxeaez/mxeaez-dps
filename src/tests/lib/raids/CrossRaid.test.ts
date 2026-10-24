import { describe, expect, test } from '@jest/globals';
import { generateEmptyPlayer } from '@/state';
import Potion from '@/enums/Potion';
import {
  buildTargetMonster, DrainStateId, evaluatePreset, targetPhases,
} from '@/lib/fracturedArchive/bestSetup';
import { BestSetupAssumptions, DEFAULT_ASSUMPTIONS, PresetDef } from '@/lib/fracturedArchive/presets';
import { drainModel } from '@/lib/fracturedArchive/specs';
import {
  computeRouteComparison, formatDuration, raidTimeAssumptionsFrom,
} from '@/lib/fracturedArchive/raidTime';
import {
  DEFAULT_RING_POLICY, plan, PlanResult, planAssumptions, planItemByName,
} from '@/lib/fracturedArchive/planner';
import {
  RaidConfig, RAIDS, raidConfig, raidOf, teamDpsMultiplier, withScalingInput,
} from '@/lib/raids';

// Phase 22: cross-raid checks. Each raid has its own assumptions (the page keeps one object per raid tab); nothing a
// raid sets may leak into another through the shared defaults (potions, Zeal, fragments, party size, team-DPS
// multiplier, carriers). Every target of every raid builds, evaluates and has a drain model; every raid's planner runs.

const snapshot = (a: unknown) => JSON.parse(JSON.stringify(a));
const FA_SNAPSHOT = snapshot(DEFAULT_ASSUMPTIONS);
const SNAPSHOTS = Object.fromEntries(RAIDS.map((r) => [r.id, snapshot(r.defaultAssumptions)]));

/** The page's raid tabs (BestSetup.tsx): one assumptions object per raid, replaced (never mutated) on every change. */
const tabs = () => {
  let by: Record<string, BestSetupAssumptions> = Object.fromEntries(RAIDS.map((r) => [r.id, r.defaultAssumptions]));
  return {
    get: (id: string) => by[id],
    set: (id: string, a: BestSetupAssumptions) => { by = { ...by, [id]: a }; },
  };
};

describe('switching raids: defaults per raid, no leaks', () => {
  test('each raid\'s defaults: its own raid id, potions, Zeal / fragments only in the Fractured Archive', () => {
    const fa = raidConfig('fractured-archive').defaultAssumptions;
    expect(fa.raid).toBeUndefined();
    expect(fa.potions).toEqual({ melee: Potion.SUPER_COMBAT, ranged: Potion.RANGING, magic: Potion.SATURATED_HEART });
    expect(fa.elementalFragments).toBe(true);
    expect(raidConfig('toa').defaultAssumptions.potions).toEqual({
      melee: Potion.SMELLING_SALTS, ranged: Potion.SMELLING_SALTS, magic: Potion.SMELLING_SALTS,
    });
    expect(raidConfig('cox').defaultAssumptions.potions).toEqual({
      melee: Potion.OVERLOAD_PLUS, ranged: Potion.OVERLOAD_PLUS, magic: Potion.OVERLOAD_PLUS,
    });
    // ToB has no raid boost: the brought potions (same as the Fractured Archive's)
    expect(raidConfig('tob').defaultAssumptions.potions).toEqual(fa.potions);
    RAIDS.filter((r) => r.id !== 'fractured-archive').forEach((r) => {
      const a = r.defaultAssumptions;
      expect(raidOf(a)).toBe(r);
      expect(a.raid).toBe(r.id);
      expect(a.useZeal).toBe(false);
      expect(a.elementalFragments).toBe(false);
      expect(r.raidOnlyAssumptions).toBe(false);
      expect(a.teamDpsMultiplier).toBeUndefined();
      // the shared sub-objects are copies, so one raid's edits can't reach another's defaults
      expect(a.mySpecs).not.toBe(fa.mySpecs);
      expect(a.team).not.toBe(fa.team);
      expect(a.team.carriers).not.toBe(fa.team.carriers);
      expect(a.team.lightbearer).not.toBe(fa.team.lightbearer);
    });
    expect(raidOf(fa).id).toBe('fractured-archive');
    expect(raidConfig('fractured-archive').raidOnlyAssumptions).toBe(true);
  });

  test('team-DPS multiplier default: 1 in the Fractured Archive (identity hp table), the party size elsewhere', () => {
    expect(teamDpsMultiplier(raidConfig('fractured-archive').defaultAssumptions)).toBe(1);
    expect(teamDpsMultiplier(raidConfig('toa').defaultAssumptions)).toBe(6);
    expect(teamDpsMultiplier(raidConfig('cox').defaultAssumptions)).toBe(raidConfig('cox').defaultAssumptions.partySize);
    expect(teamDpsMultiplier(raidConfig('tob').defaultAssumptions)).toBe(4);
  });

  test('FA → ToA → FA round trip: the FA tab equals the FA defaults; editing ToA leaves FA and the defaults alone', () => {
    const t = tabs();
    const toa = raidConfig('toa');
    let a = t.get('toa');
    toa.scalingInputs.forEach((d) => { a = withScalingInput(a, d, d.max); });
    a = {
      ...a,
      potions: { ...a.potions, melee: Potion.SUPER_COMBAT },
      mySpecs: { ...a.mySpecs, bgs: true, ayak: 4 },
      team: { ...a.team, carriers: { ...a.team.carriers, bgs: 3 } },
      teamDpsMultiplier: 2,
    };
    t.set('toa', a);
    // the ToA edits are kept on the ToA tab only
    expect(t.get('toa').partySize).toBe(toa.partySize.max);
    expect(t.get('fractured-archive')).toEqual(FA_SNAPSHOT);
    expect(t.get('fractured-archive')).toBe(raidConfig('fractured-archive').defaultAssumptions);
    // and nothing mutated any raid's defaults
    RAIDS.forEach((r) => expect(snapshot(r.defaultAssumptions)).toEqual(SNAPSHOTS[r.id]));
    expect(snapshot(DEFAULT_ASSUMPTIONS)).toEqual(FA_SNAPSHOT);
    // the plan's potion rule follows the raid (ToA: salts from the raid, FA: brought)
    const none = {
      brew: 0, restore: 0, ranging: 0, superCombat: 0, food: 0, other: 0,
    };
    expect(planAssumptions(t.get('toa'), { ...none, other: 2 }).withoutPotion).toBeUndefined();
    expect(planAssumptions(t.get('toa'), none).withoutPotion).toEqual(['melee', 'ranged', 'magic']);
    // phase 27: FA melee / ranged potions come from the kit (always boosted); magic needs the pinned heart
    expect(planAssumptions(t.get('fractured-archive'), none).withoutPotion).toEqual(['magic']);
  });

  test('a raid\'s monster inputs only reach its own targets', () => {
    // ToA raid level on an FA target, CoX Challenge Mode on a ToA target: no effect
    const fa = RAIDS[0].targets[0];
    const toaA = withScalingInput(raidConfig('toa').defaultAssumptions, raidConfig('toa').scalingInputs[1], 600);
    const faHp = buildTargetMonster(fa, undefined, 'none', DEFAULT_ASSUMPTIONS).monster.inputs.monsterCurrentHp;
    expect(buildTargetMonster(fa, undefined, 'none', { ...toaA, raid: undefined }).monster.inputs.monsterCurrentHp).toBe(faHp);
    const toaTarget = raidConfig('toa').targets[0];
    const toaHp = buildTargetMonster(toaTarget, undefined, 'none', raidConfig('toa').defaultAssumptions).monster.inputs.monsterCurrentHp;
    const withCm = { ...raidConfig('toa').defaultAssumptions, cox: { challengeMode: true } };
    expect(buildTargetMonster(toaTarget, undefined, 'none', withCm).monster.inputs.monsterCurrentHp).toBe(toaHp);
  });

  test('the planner / routes refuse a time model of another raid (an FA default never runs ToA / CoX / ToB)', () => {
    const toa = raidConfig('toa');
    const fa = raidConfig('fractured-archive');
    const req = {
      basePlayer: generateEmptyPlayer(),
      assumptions: toa.defaultAssumptions,
      drain: 'none' as DrainStateId,
      settings: toa.defaultTimeSettings,
      kit: { searchGroups: [], presets: [], players: [] },
      searchBest: {},
    };
    expect(() => computeRouteComparison(req)).toThrow(/time model/);
    expect(() => computeRouteComparison(req, undefined, fa.time)).toThrow(/time model/);
    expect(() => computeRouteComparison({ ...req, assumptions: fa.defaultAssumptions, settings: fa.defaultTimeSettings }, undefined, toa.time))
      .toThrow(/time model/);
    expect(computeRouteComparison(req, undefined, toa.time).routes.length).toBe(1);
  });
});

/** The first preset of each style group (every raid's list starts with the Fractured Archive's). */
const groupPresets = (raid: RaidConfig): PresetDef[] => (['melee', 'ranged', 'magic'] as const)
  .map((g) => raid.presets.find((p) => p.group === g)!)
  .filter(Boolean);

/** A small kit that can clear every encounter: the group presets + the raid's pickaxe preset (CoX Guardians). */
const kitPresets = (raid: RaidConfig): PresetDef[] => [
  ...groupPresets(raid), ...raid.presets.filter((p) => p.name.includes('pickaxe')),
];

describe.each(RAIDS.map((r) => [r.name, r] as const))('%s: every target', (_, raid) => {
  test('builds a monster in every phase, evaluates a preset per style without throwing, has a drain model', () => {
    const a = raid.defaultAssumptions;
    const presets = groupPresets(raid);
    expect(presets.length).toBe(3);
    raid.targets.forEach((t) => {
      const phases = targetPhases(t);
      (phases.length ? phases : [undefined]).forEach((phase) => {
        const { monster, drain } = buildTargetMonster(t, phase, 'team', a);
        expect(monster.inputs.monsterCurrentHp).toBeGreaterThan(0);
        expect(Number.isFinite(drain.defAfter)).toBe(true);
        let anyDamage = false;
        presets.forEach((p) => {
          const r = evaluatePreset(generateEmptyPlayer(), p, monster, a, false, false);
          expect(Number.isFinite(r.dps)).toBe(true);
          expect(r.dps).toBeGreaterThanOrEqual(0);
          if (r.dps > 0) anyDamage = true;
        });
        // some style always deals damage, except where a raid-specific weapon is required (CoX Guardians: pickaxes)
        if (!t.key.includes('guardian')) expect(anyDamage).toBe(true);
        const model = drainModel(monster, a);
        expect(model.def).toBeGreaterThanOrEqual(model.floor);
        expect(model.floor).toBeGreaterThanOrEqual(0);
        // (a sum of outcome probabilities: may exceed 1 by a rounding error)
        expect(Object.values(model.hitChance).every((h) => h >= 0 && h <= 1 + 1e-9)).toBe(true);
      });
    });
  }, 120000);
});

const planFor = (raid: RaidConfig, reduced: boolean): PlanResult => plan({
  // phase 27: the full (headline) plan uses the Plan tab's default ring policy (camp one ring); the reduced one switches
  ...(reduced ? {} : { ringPolicy: DEFAULT_RING_POLICY }),
  basePlayer: generateEmptyPlayer(),
  assumptions: raid.defaultAssumptions,
  drain: 'team',
  settings: raid.defaultTimeSettings,
  route: 'all',
  pinned: raid.planDefaults.pinned.map((n) => planItemByName(n).id),
  nonItemSlots: raid.planDefaults.nonItemSlots,
  supplies: raid.defaultSupplies,
}, reduced ? {
  model: raid.time,
  presets: kitPresets(raid),
  search: { weapons: ['Scythe of Vitur', 'Tumeken\'s shadow', 'Twisted bow'], maxPasses: 1 },
  perGroupWeapons: 1,
  perWeapon: 1,
  bases: 1,
  partners: 1,
  seeds: 2,
} : { model: raid.time });

describe('every raid\'s plan runs (reduced pool)', () => {
  test.each(RAIDS.map((r) => [r.id, r] as const))('%s', (_, raid) => {
    const res = planFor(raid, true);
    expect(res.cancelled).toBe(false);
    expect(res.kit.length).toBeGreaterThan(0);
    expect(res.slots!.used).toBeLessThanOrEqual(28);
    expect(res.inventory.length).toBe(28);
    const total = res.comparison!.routes[res.planned].seconds;
    expect(Number.isFinite(total)).toBe(true);
    expect(total).toBeGreaterThan(0);
  }, 300000);
});

/**
 * The four headline plan totals (default assumptions and Plan inputs, camp one ring, Team drains, compare all;
 * docs/BEST_SETUP.md, *Plan tab*; scripts/verifyPhase21.mjs reads the same numbers in the browser). A full default plan
 * per raid takes 1-2 min here (camp one ring screens six rings), so this block only runs with `RUN_SLOW_TESTS=1`
 * (`$env:RUN_SLOW_TESTS=1; node .yarn/releases/yarn-4.9.2.cjs test CrossRaid`); the fast pins below run always.
 */
// phase 25 (rupture / Seeking dragon arrows / Elemental amulet in the pool): CoX 6:41.9 → 6:39.9, ToB 7:32.2 → 7:32.4.
// Phase 27 (potions from the kit, camp one ring by default): FA 23:30.4 → 22:47.9 (camp Ultor ring; 1 Super combat +
// 1 Ranging potion instead of 2 ranging + 1 super combat frees a slot; allow switches would be 22:47.7); ToA 14:20.2 →
// 14:22.3 (camp Magus ring; switches 14:20.2); CoX 6:39.9 → 6:40.3 (camp Ultor ring; switches 6:39.9); ToB 7:32.4 →
// 7:31.7 (camp Ultor ring: no ring switch items, the freed slots buy a better kit; switches 7:32.4).
const HEADLINES: [string, string, number][] = [
  ['fractured-archive', '22:47.9', 1367.9],
  ['toa', '14:22.3', 862.3],
  ['cox', '6:40.3', 400.3],
  ['tob', '7:31.7', 451.7],
];

(process.env.RUN_SLOW_TESTS ? describe : describe.skip)('headline plan totals (slow)', () => {
  test.each(HEADLINES)('%s: %s', (id, text, seconds) => {
    const res = planFor(raidConfig(id as RaidConfig['id']), false);
    const total = res.comparison!.routes[res.planned].seconds;
    expect(Math.abs(total - seconds)).toBeLessThanOrEqual(0.5);
    expect(formatDuration(total)).toBe(text);
  }, 600000);
});

/**
 * Fast pins of the same model: each raid's per-encounter times (default assumptions and time settings, Team drains)
 * for a fixed kit of the raid's first melee / ranged / magic preset (no search, so it runs in seconds). Hp scaling,
 * drains, the team-DPS multiplier and every encounter model feed these numbers, so a change that moves a headline
 * total almost always moves one of them. Re-pin (and re-check docs/BEST_SETUP.md) when a change is intended.
 */
const PINNED_ENCOUNTER_SECONDS: Record<string, Record<string, number>> = {
  // phase 22 (2026-10-23); the FA kit's fastest route is AG → Bork + Smorks → Moia → Dagon'hai → Ocellus.
  // Phase 25: re-pinned — the kit's Twisted bow preset now has Seeking dragon arrows + Necklace of rupture (was dragon
  // arrows + anguish): FA AG 201.8 → 191.8, Moia 72 → 68.9, Dagon'hai 240.1 → 233.8, Ocellus 800.5 → 776.5; ToA Zebak
  // 126.9 → 120.8; ToB Maiden 57 → 55.5, Sotetseg 80.4 → 77, Xarpus 66.1 → 64.2; CoX Olm 204.5 → 204.4 (the other
  // CoX encounters are not won by the Twisted bow preset in this kit).
  'fractured-archive': {
    'archive-guardian': 191.8, 'bork-smorks': 220.8, moia: 68.9, dagonhai: 233.8, ocellus: 776.5,
  },
  toa: {
    'toa-kephri': 153.8, 'toa-zebak': 120.8, 'toa-akkha': 160.9, 'toa-baba': 103.1, 'toa-wardens': 349.9,
  },
  cox: {
    'cox-tekton': 18.6,
    'cox-vasa': 20.1,
    'cox-vanguards': 36.8,
    'cox-vespula': 23.3,
    'cox-mystics': 44.8,
    'cox-shamans': 32.1,
    'cox-muttadiles': 23.9,
    'cox-guardians': 36.4,
    'cox-ice-demon': 17.2,
    'cox-olm': 204.4,
  },
  tob: {
    'tob-maiden': 55.5, 'tob-bloat': 39.2, 'tob-nylocas': 44.5, 'tob-sotetseg': 77, 'tob-xarpus': 64.2, 'tob-verzik': 271.5,
  },
};

describe('per-encounter times for a fixed preset kit (fast pins)', () => {
  test('time-model assumptions per raid', () => {
    RAIDS.forEach((r) => {
      const a = raidTimeAssumptionsFrom(r.defaultAssumptions, 'team', r.defaultTimeSettings, r.time);
      expect(a.dpsMultiplier).toBe(teamDpsMultiplier(r.defaultAssumptions));
      expect(a.model).toBe(r.time);
    });
  });

  test.each(RAIDS.map((r) => [r.id, r] as const))('%s', (id, raid) => {
    const res = computeRouteComparison({
      basePlayer: generateEmptyPlayer(),
      assumptions: raid.defaultAssumptions,
      drain: 'team',
      settings: raid.defaultTimeSettings,
      kit: { searchGroups: [], presets: kitPresets(raid).map((p) => p.name), players: [] },
      searchBest: {},
    }, undefined, raid.time);
    const fastest = res.routes[Math.max(0, res.fastest)];
    // -1 = the kit can't clear the encounter (e.g. CoX Guardians without a pickaxe)
    const got = Object.fromEntries(fastest.encounters.map((e) => [e.id, Number.isFinite(e.seconds) ? Math.round(e.seconds * 10) / 10 : -1]));
    const pinned = PINNED_ENCOUNTER_SECONDS[id];
    // eslint-disable-next-line no-console
    if (process.env.PRINT_PINS) console.log(id, fastest.route.id, JSON.stringify(got));
    expect(Object.keys(got).sort()).toEqual(Object.keys(pinned).sort());
    Object.entries(pinned).forEach(([enc, s]) => expect(Math.abs(got[enc] - s)).toBeLessThanOrEqual(0.5));
  }, 120000);
});
