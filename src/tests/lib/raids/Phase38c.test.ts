import { describe, expect, test } from '@jest/globals';
import { generateEmptyPlayer } from '@/state';
import { buildTargetMonster, findTarget, presetStyles } from '@/lib/fracturedArchive/bestSetup';
import {
  compareRoutes, createKitEvaluator, encounterTime, FA_TIME_MODEL, presetKitLoadout, RAID_TIME_DEFAULTS, raidClock,
  raidTimeAssumptionsFrom, RaidKit, routesFor, surgeClockSpan, surgeClockStarts,
} from '@/lib/fracturedArchive/raidTime';
import { drainEventsOf, encounterWallSeconds, rowWallSeconds } from '@/lib/fracturedArchive/encounterBudget';
import { dosesAllowed } from '@/lib/fracturedArchive/specBudget';
import { drainModel } from '@/lib/fracturedArchive/specs';
import { planLoadoutToPlayer } from '@/lib/fracturedArchive/planner';
import { BestSetupAssumptions, PresetDef } from '@/lib/fracturedArchive/presets';
import { raidConfig, RAIDS } from '@/lib/raids';
import { defaultPlanInputs, validatePlanInputs } from '@/lib/raids/settings';
import { RaidId } from '@/lib/raids/types';
import { assumptionsForTarget } from '@/lib/raids/toa/supplies';
import {
  TOA_ADRENALINE_DOSES, TOA_ROUTE_ID, TOA_ROUTES, TOA_TIME_MODEL,
} from '@/lib/raids/toa/time';
import { bruteForceKits, bruteForceOk } from '@/tests/utils/probes';
import { headline } from '@/tests/utils/headlines';

// Phase 38c: Ocellus's three drain events (the Defence resets P1 → P2 → P3) with the Blade in the plan (120 s), ToA's
// pair of paths done before the supplies chosen as a route, the raid clock = fight wall + non-fight time, and the
// displays that still used the salts for the rooms before the supplies. Docs: docs/BEST_SETUP.md *Ocellus events, ToA
// path pair, clock default, displays (phase 38c)*; UNVERIFIED D30 / D31 / D35.

const A = (id: RaidId): BestSetupAssumptions => raidConfig(id).defaultAssumptions;
const one: RaidKit = { best: () => ({ loadout: 'x', style: 'x', dps: 1 }) };

describe('Ocellus: three drain events, P3 specs on quadrants 1-3, the Blade at 120 s', () => {
  const fa = raidConfig('fractured-archive');

  test('defaults: P2 = 120 s (the user, unverified), carry-over 50%', () => {
    expect(RAID_TIME_DEFAULTS.ocellusP2Seconds).toBe(120);
    expect(RAID_TIME_DEFAULTS.ocellusP2CarryOver).toBe(0.5);
  });

  test('rows and events by hand (DPS 1): P1 | P2 (120 s, 60 carried) | P3 Q1-3 + last quadrant', () => {
    const ta = raidTimeAssumptionsFrom(A('fractured-archive'), 'none', RAID_TIME_DEFAULTS, FA_TIME_MODEL);
    const rows = FA_TIME_MODEL.encounterPass('ocellus', one, ta, 'none', 90);
    expect(rows.map((r) => [r.key, r.drainReset])).toEqual([
      ['ocellus-p1', undefined], ['ocellus-p2', 'P1'], ['ocellus-p3', 'P2'], ['ocellus-p3-last', undefined],
    ]);
    // P2: DPS 1 × 120 s = 120 dealt to the Blade, half of it off P3
    const p2 = rows[1];
    expect(p2.seconds).toBe(120);
    expect(p2.damage).toBe(120);
    const p3Hp = rows[2].damage + rows[3].damage;
    expect(rows[2].damage).toBeCloseTo(0.75 * p3Hp, 9);
    const { events, rowEvent } = drainEventsOf(rows);
    expect(events.map((e) => [e.reset, e.rows])).toEqual([[undefined, [0]], ['P1', [1]], ['P2', [2, 3]]]);
    expect(rowEvent).toEqual([0, 1, 2, 2]);
    // fix round: P2 lasts 120 s on the spec budget's clock (fixedWall), not 120 ÷ party size; the others ÷ party
    const party6 = { dpsMultiplier: 1, partySize: 6 };
    expect(p2.fixedWall).toBe(true);
    expect(rowWallSeconds(p2, party6)).toBe(120);
    expect(rowWallSeconds(rows[0], party6)).toBeCloseTo(rows[0].seconds / 6, 9);
    // all of P3 in the last quadrant: the reset moves to it
    const allLast = FA_TIME_MODEL.encounterPass('ocellus', one, { ...ta, settings: { ...RAID_TIME_DEFAULTS, ocellusLastQuadrantFraction: 1 } }, 'none', 90);
    expect(allLast.map((r) => [r.key, r.drainReset])).toEqual([['ocellus-p1', undefined], ['ocellus-p2', 'P1'], ['ocellus-p3-last', 'P2']]);
  });

  test('the Team spec plan: one event per phase, the P3 specs made on quadrants 1-3', () => {
    const a = A('fractured-archive');
    const presets: PresetDef[] = (['melee', 'ranged', 'magic'] as const).map((g) => fa.presets.find((p) => p.group === g)!);
    const kit = createKitEvaluator(presets.map((p) => presetKitLoadout(generateEmptyPlayer(), p, a)), a);
    const ta = raidTimeAssumptionsFrom(a, 'team', RAID_TIME_DEFAULTS, FA_TIME_MODEL);
    const plan = encounterTime('ocellus', kit, ta).specPlan!;
    expect(plan.events.map((e) => [e.reset, e.firstRowKey])).toEqual([
      [undefined, 'ocellus-p1'], ['P1', 'ocellus-p2'], ['P2', 'ocellus-p3'],
    ]);
    expect(plan.rowEvent['ocellus-p3-last']).toBe(2);
  });
});

describe('ToA: the pair of paths before the supplies is a route choice', () => {
  const raid = raidConfig('toa');
  const ta = raidTimeAssumptionsFrom(A('toa'), 'none', raid.defaultTimeSettings, TOA_TIME_MODEL);

  test('six routes, one per pair; adrenaline only after the supplies', () => {
    const routes = routesFor(ta);
    expect(routes).toHaveLength(6);
    expect(routes[0].id).toBe(TOA_ROUTE_ID);
    expect(routes.map((r) => r.encounters.slice(0, 2).map((e) => e.replace('-before-supplies', '').replace('toa-', '')).join('+')))
      .toEqual(['kephri+zebak', 'kephri+akkha', 'kephri+baba', 'zebak+akkha', 'zebak+baba', 'akkha+baba']);
    TOA_ROUTES.forEach((r) => {
      expect(r.slice(0, 2).every((e) => e.endsWith('-before-supplies'))).toBe(true);
      expect(r.slice(2).some((e) => e.endsWith('-before-supplies'))).toBe(false);
      expect(r[4]).toBe('toa-wardens');
      expect(r.map((e) => TOA_ADRENALINE_DOSES[e])).toEqual([0, 0, 1, 1, 2]);
    });
    // Akkha / Ba-Ba before the supplies query their copies (normal potions)
    const keys = (id: string) => TOA_TIME_MODEL.encounterPass(id, one, ta, 'none', 90).map((p) => p.targetKey);
    expect(keys('toa-akkha-before-supplies').every((k) => k.endsWith('-before-supplies'))).toBe(true);
    expect(keys('toa-baba-before-supplies')).toEqual(['toa-baba-before-supplies']);
    expect(keys('toa-kephri').some((k) => k.endsWith('-before-supplies'))).toBe(false);
    expect(validatePlanInputs(raid, { route: TOA_ROUTES[5].join('>') }, raid.defaultAssumptions).route).toBe(TOA_ROUTES[5].join('>'));
  });

  test('compareRoutes picks the cheapest pair (a kit at half DPS before the supplies: the two shortest rooms first)', () => {
    // DPS 2 after the supplies, 1 before: a room before the supplies takes twice its time, so a route costs
    // Σ rooms (after) + the pair's rooms (after) again, and the cheapest pair is the two shortest rooms
    const kit: RaidKit = { best: (q) => ({ loadout: 'x', style: 'x', dps: q.targetKey.endsWith('-before-supplies') ? 1 : 2 }) };
    const after = Object.fromEntries(['toa-kephri', 'toa-zebak', 'toa-akkha', 'toa-baba', 'toa-wardens']
      .map((id) => [id, encounterTime(id, kit, ta).seconds]));
    const cmp = compareRoutes(kit, ta);
    const all = Object.values(after).reduce((t, x) => t + x, 0);
    cmp.routes.forEach((r) => {
      const [x, y] = r.route.encounters.slice(0, 2).map((e) => e.replace('-before-supplies', ''));
      expect(r.seconds).toBeCloseTo(all + after[x] + after[y], 6);
    });
    const byHand = cmp.routes.map((r) => r.seconds);
    expect(cmp.fastest).toBe(byHand.indexOf(Math.min(...byHand)));
    const shortest = ['toa-kephri', 'toa-zebak', 'toa-akkha', 'toa-baba'].sort((p, q) => after[p] - after[q]).slice(0, 2);
    expect(cmp.routes[cmp.fastest].route.encounters.slice(0, 2).map((e) => e.replace('-before-supplies', '')).sort()).toEqual(shortest.sort());
  });
});

describe('the raid clock: fight wall + non-fight time', () => {
  test('defaults: typical length − the Team headline\'s fight wall (FA 25 min − 210.9 s = 21.5 min, ...)', () => {
    expect(RAIDS.map((r) => [r.id, r.nonFightMinutes])).toEqual([['fractured-archive', 21.5], ['toa', 15.5], ['cox', 12.9], ['tob', 12.6]]);
    const t = raidTimeAssumptionsFrom(A('fractured-archive'), 'team');
    expect(t.nonFightSeconds).toBe(1290);
    expect(t.raidSeconds).toBeUndefined();
    expect(raidTimeAssumptionsFrom({ ...A('fractured-archive'), nonFightMinutes: 10 }, 'team').nonFightSeconds).toBe(600);
    // an explicit raid length is the phase 38a clock
    expect(raidTimeAssumptionsFrom({ ...A('fractured-archive'), raidMinutes: 25 }, 'team')).toMatchObject({ raidSeconds: 1500 });
    expect(raidTimeAssumptionsFrom({ ...A('fractured-archive'), raidMinutes: 25 }, 'team').nonFightSeconds).toBeUndefined();
  });

  test('party 6 vs party 1 (by hand): the same 1290 s of non-fight time, the solo raid is longer', () => {
    // FA encounter seconds 600 / 600 / 1200 (your DPS alone; multiplier 1): wall = seconds ÷ party
    const secs = [600, 600, 1200];
    const walls = (party: number) => secs.map((s) => encounterWallSeconds(s, { dpsMultiplier: 1, partySize: party }));
    expect(walls(6)).toEqual([100, 100, 200]);
    // party 6: 1290 spread 1:1:2 → gaps 322.5, 322.5, 645; starts 322.5, 745, 1490; the raid ends at 1690
    expect(raidClock(walls(6), 0, 1290)).toEqual({ starts: [322.5, 745, 1490], gaps: [322.5, 322.5, 645], fight: 400 });
    // party 1: walls 600, 600, 1200; gaps the same; starts 322.5, 1245, 2490; the raid ends at 3690
    expect(raidClock(walls(1), 0, 1290)).toEqual({ starts: [322.5, 1245, 2490], gaps: [322.5, 322.5, 645], fight: 2400 });
    // phase 38a's fixed 25 min squeezed the solo raid: 2400 s of fight > 1500, no gap at all
    expect(raidClock(walls(1), 1500).gaps).toEqual([0, 0, 0]);
    expect(surgeClockSpan(2400, { nonFightSeconds: 1290 })).toBe(3690);
    expect(surgeClockSpan(400, { nonFightSeconds: 1290 })).toBe(1690);
    // doses: one at the start + one per full 300 s → 3690 s: 13 (> 4: a second potion is tried); 1690 s: 6
    expect(dosesAllowed(3690)).toBe(13);
    expect(dosesAllowed(1690)).toBe(6);
    // ToB: the surge clock stays fight time only
    expect(surgeClockStarts([100, 100, 200], { nonFightSeconds: 1290, surgePausesBetweenEncounters: true })).toEqual([0, 100, 200]);
  });

  test('Plan input "Non-fight time": saved and validated (0-120 min), default per raid', () => {
    const fa = raidConfig('fractured-archive');
    expect(defaultPlanInputs(fa).nonFightMinutes).toBe(21.5);
    expect(defaultPlanInputs(raidConfig('toa')).nonFightMinutes).toBe(15.5);
    expect(validatePlanInputs(fa, { nonFightMinutes: 40 }, fa.defaultAssumptions).nonFightMinutes).toBe(40);
    expect(validatePlanInputs(fa, { nonFightMinutes: -1 }, fa.defaultAssumptions).nonFightMinutes).toBe(21.5);
    // phase 38a's saved raid length is no longer read
    expect(validatePlanInputs(fa, { raidMinutes: 40 }, fa.defaultAssumptions).nonFightMinutes).toBe(21.5);
  });
});

describe('displays use the before-supplies assumptions for the rooms before the supplies', () => {
  const raid = raidConfig('toa');
  const a = A('toa');
  const early = findTarget('toa-zebak-before-supplies');

  test('Load into calculator: the normal potion (+19 strength at 99) on a room before the supplies, the salts (+26) after', () => {
    const preset = raid.presets.find((p) => p.group === 'melee')!;
    const m = buildTargetMonster(early, undefined, 'none', a).monster;
    const c = {
      key: 'x', label: 'x', kind: 'preset' as const, group: 'melee' as const, equipment: {}, options: [{ style: presetStyles(preset)[0], spell: null }], source: '',
    };
    expect(planLoadoutToPlayer(generateEmptyPlayer(), c, m, a, early).boosts.str).toBe(19);
    expect(planLoadoutToPlayer(generateEmptyPlayer(), c, m, a, findTarget('toa-zebak')).boosts.str).toBe(26);
    expect(planLoadoutToPlayer(generateEmptyPlayer(), c, m, a).boosts.str).toBe(26);
  });

  test('the per-boss 95% table\'s drain model: the copy\'s potions (the spec hit chances use the normal potion)', () => {
    const m = buildTargetMonster(early, undefined, 'none', a).monster;
    const withCopy = drainModel(m, assumptionsForTarget(early, a))!;
    const withSalts = drainModel(m, a)!;
    expect(withCopy).not.toEqual(withSalts);
    expect(drainModel(m, assumptionsForTarget(findTarget('toa-zebak'), a))).toEqual(withSalts);
  });

  test('the Search / Summary note says the salts are used there', () => {
    expect(raid.hpNote).toContain('Search / Summary use the Smelling salts');
  });
});

// fix round: the reviewer's `bruteForceKits.mjs toa --pool tiny` on the Kephri + Ba-Ba route found Twisted bow + Shadow +
// Scythe #3 3.08 s faster than the planner's Shadow + Scythe #3; the Twisted bow takes 7 more slots and the planner's
// dedupe rule (optimiseKit `prune`) asks 1 s per slot, so that kit is not a plan. The probe now keeps only kits that pass
// the rule (`bestAny` = the fastest of all, for reference). Slow (a full camp-one reduced plan, ~4 min).
(process.env.RUN_SLOW_TESTS ? describe : describe.skip)('brute force, ToA tiny pool, Kephri + Ba-Ba (slow)', () => {
  test('gap 0 under the dedupe rule; the faster kit it rejects breaks the rule', () => {
    const b = bruteForceKits('toa', { pool: 'tiny' });
    expect(b.route).toBe(headline('toa').route);
    expect(b.gap).toBeLessThanOrEqual(1e-6);
    expect(bruteForceOk(b)).toBe(true);
    expect(b.pruned).toBeGreaterThan(0);
    expect(b.bestAny).toBeLessThanOrEqual(b.best);
  }, 900000);
});
