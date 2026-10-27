import { describe, expect, test } from '@jest/globals';
import Potion from '@/enums/Potion';
import { generateEmptyPlayer } from '@/state';
import {
  applyPresetToPlayer, buildTargetMonster, evaluateLoadout, findTarget, presetSpells, presetStyles,
} from '@/lib/fracturedArchive/bestSetup';
import {
  compareRoutes, createKitEvaluator, EncounterTime, encounterTime, presetKitLoadout, raidClock, raidTimeAssumptionsFrom,
  routeSurgeDoses, surgeClockSpan, surgeClockStarts,
} from '@/lib/fracturedArchive/raidTime';
import { budgetGroups, encounterWallSeconds } from '@/lib/fracturedArchive/encounterBudget';
import { dosesAllowed, regenTicks } from '@/lib/fracturedArchive/specBudget';
import { BestSetupAssumptions, PresetDef } from '@/lib/fracturedArchive/presets';
import { raidConfig, RAIDS } from '@/lib/raids';
import { visibleTargets } from '@/lib/raids/base';
import { defaultPlanInputs, validatePlanInputs } from '@/lib/raids/settings';
import { RaidId } from '@/lib/raids/types';
import { assumptionsForTarget, NORMAL_POTIONS } from '@/lib/raids/toa/supplies';
import { TOA_BEFORE_SUPPLIES_ENCOUNTERS, TOA_TIME_MODEL } from '@/lib/raids/toa/time';

// Phase 38a: the raid wall clock (typical raid length, non-fight time spread in proportion to fight time) and ToA's
// supplies by room (the raid potion from the 3rd room on). Docs: docs/BEST_SETUP.md *Raid wall clock + ToA supplies by
// room (phase 38a)*; UNVERIFIED D30 / D31.

const A = (id: RaidId): BestSetupAssumptions => raidConfig(id).defaultAssumptions;
const enc = (id: string, seconds: number) => ({ id, seconds } as unknown as EncounterTime);

describe('the raid clock', () => {
  test('defaults: FA 25 min (the user\'s raid stats), ToA 30, CoX 20, ToB 20 (ToB: surge cooldown paused between rooms)', () => {
    expect(RAIDS.map((r) => [r.id, r.typicalRaidMinutes])).toEqual([['fractured-archive', 25], ['toa', 30], ['cox', 20], ['tob', 20]]);
    // phase 38c: the default clock is the fight wall + the non-fight time (Phase38c.test.ts); an explicit raid length
    // (`raidMinutes`) is this phase's clock
    expect(raidTimeAssumptionsFrom({ ...A('fractured-archive'), raidMinutes: 25 }, 'team').raidSeconds).toBe(1500);
    expect(raidTimeAssumptionsFrom({ ...A('fractured-archive'), raidMinutes: 0 }, 'team').raidSeconds).toBe(0);
    expect(raidTimeAssumptionsFrom(A('tob'), 'team').surgePausesBetweenEncounters).toBe(true);
    expect(raidTimeAssumptionsFrom(A('toa'), 'team').surgePausesBetweenEncounters).toBeUndefined();
  });

  test('non-fight time spread before the encounters in proportion to their fight time (by hand)', () => {
    // fights 100, 100, 200 s in a 1200 s raid: 800 s to spread → 200, 200, 400 before each; starts 200, 500, 1000
    expect(raidClock([100, 100, 200], 1200)).toEqual({ starts: [200, 500, 1000], gaps: [200, 200, 400], fight: 400 });
    // a raid length below the fight time: no gaps; 0 = the phase 36 clock (fight time only)
    expect(raidClock([100, 100, 200], 300).starts).toEqual([0, 100, 200]);
    expect(raidClock([100, 100, 200]).starts).toEqual([0, 100, 200]);
    // ToB: the surge clock is fight time only
    expect(surgeClockStarts([100, 100, 200], { raidSeconds: 1200, surgePausesBetweenEncounters: true })).toEqual([0, 100, 200]);
    expect(surgeClockSpan(400, { raidSeconds: 1200 })).toBe(1200);
    expect(surgeClockSpan(400, { raidSeconds: 1200, surgePausesBetweenEncounters: true })).toBe(400);
    // 25 min: one dose at the start and one per full 5 min → 6 allowed (a second potion is worth trying)
    expect(dosesAllowed(surgeClockSpan(317, { raidSeconds: 1500 }))).toBe(6);
    expect(dosesAllowed(surgeClockSpan(317, {}))).toBe(2);
  });

  test('surge doses on a 25-min FA (party 6, the phase 37 headline encounter seconds): 3 doses, AG, Moia, Ocellus', () => {
    // seconds = your DPS alone; wall = seconds ÷ 6 (multiplier 1): 29.2967, 31.6317, 10.8867, 30.27, 109.195 = 211.28 s.
    // 1500 − 211.28 = 1288.72 s spread ∝ fight: fights start at 178.70 (AG), 400.93 (Bork), 498.97 (Moia),
    // 694.49 (Xarth), 1390.81 (Ocellus). Doses ≥ 300 s apart: AG 179 → Moia 499 (320 s) → Ocellus 1391: at most 3
    // (Bork 401 → Xarth 694 is only 294 s). Gains 2, 1, 3, 1, 10 s: AG + Moia + Ocellus = 15 s is the best.
    const ids = ['archive-guardian', 'bork-smorks', 'moia', 'xarth', 'ocellus'];
    const secs = [175.78, 189.79, 65.32, 181.62, 655.17];
    const gains = [2, 1, 3, 1, 10];
    const plain = ids.map((id, i) => enc(id, secs[i]));
    const dosed = ids.map((id, i) => enc(id, secs[i] - gains[i]));
    const fa = { dpsMultiplier: 1, partySize: 6 };
    const starts = surgeClockStarts(secs.map((s) => s / 6), { raidSeconds: 1500 });
    [178.697, 400.934, 498.970, 694.491, 1390.805].forEach((s, i) => expect(starts[i]).toBeCloseTo(s, 2));
    expect(routeSurgeDoses(plain, dosed, { ...fa, raidSeconds: 1500 }, 1)).toEqual(['archive-guardian', 'moia', 'ocellus']);
    // the phase 36 clock (fight time only, 211 s): one dose, the biggest gain
    expect(routeSurgeDoses(plain, dosed, fa, 1)).toEqual(['ocellus']);
    // ToB's pause: fight time only, whatever the raid length
    expect(routeSurgeDoses(plain, dosed, { ...fa, raidSeconds: 1500, surgePausesBetweenEncounters: true }, 1)).toEqual(['ocellus']);
  });

  test('regen between encounters on the clock (energy carried): your bar + 10% per 30 s tick of the gap, capped at 100%', () => {
    const raid = raidConfig('fractured-archive');
    const a = { ...A('fractured-archive'), partySize: 1 };
    const ta0 = raidTimeAssumptionsFrom(a, 'solo', raid.defaultTimeSettings, raid.time);
    // solo with the presets only takes ~25 min of fight: a 50-min raid leaves gaps to regenerate in
    // phase 38c: an explicit raid length (the default would be the fight wall + the non-fight time)
    const ta = {
      ...ta0, raidSeconds: 3000, nonFightSeconds: undefined, specBudget: { ...ta0.specBudget!, carry: true },
    };
    expect(budgetGroups(ta.specBudget!).find((g) => g.id === 'me')!.regenSeconds).toBe(30);
    const presets = (['melee', 'ranged', 'magic'] as const).map((g) => raid.presets.find((p) => p.group === g)!);
    const kit = createKitEvaluator(presets.map((p) => presetKitLoadout(generateEmptyPlayer(), p, a)), a);
    const route = compareRoutes(kit, ta).routes[0];
    // the gaps come from the full-bar encounter times (each encounter on its own)
    const walls = route.route.encounters.map((id) => encounterWallSeconds(encounterTime(id, kit, ta0).seconds, ta));
    const { gaps } = raidClock(walls, 3000);
    let clock = 0;
    let regenSeen = 0;
    route.encounters.forEach((e, i) => {
      const before = clock;
      clock += gaps[i];
      if (i > 0) {
        const prev = route.encounters[i - 1].specPlan!.end.me[0];
        const ticks = regenTicks(before, clock, 30);
        regenSeen += ticks;
        expect(e.specPlan!.start.me[0]).toBeCloseTo(Math.min(100, prev + 10 * ticks), 9);
      }
      clock += encounterWallSeconds(e.seconds, ta);
    });
    expect(regenSeen).toBeGreaterThan(0);
    // with no gaps (raid length 0) each encounter starts where the last one ended
    const noGap = compareRoutes(kit, { ...ta, raidSeconds: 0 }).routes[0];
    noGap.encounters.slice(1).forEach((e, i) => expect(e.specPlan!.start.me[0]).toBeCloseTo(noGap.encounters[i].specPlan!.end.me[0], 9));
  });

  test('Plan input: saved and validated (0-120 min), default per raid (phase 38c: "Non-fight time")', () => {
    const fa = raidConfig('fractured-archive');
    expect(defaultPlanInputs(fa).nonFightMinutes).toBe(21.5);
    expect(defaultPlanInputs(raidConfig('toa')).nonFightMinutes).toBe(15.5);
    expect(validatePlanInputs(fa, { nonFightMinutes: 40 }, fa.defaultAssumptions).nonFightMinutes).toBe(40);
    expect(validatePlanInputs(fa, { nonFightMinutes: 121 }, fa.defaultAssumptions).nonFightMinutes).toBe(21.5);
    expect(validatePlanInputs(fa, { nonFightMinutes: 'x' }, fa.defaultAssumptions).nonFightMinutes).toBe(21.5);
  });
});

describe('ToA supplies by room: the raid potion from the 3rd room on', () => {
  const a = A('toa');
  const raid = raidConfig('toa');
  const ta = raidTimeAssumptionsFrom(a, 'none', raid.defaultTimeSettings, TOA_TIME_MODEL);

  test('Kephri and Zebak (rooms 1-2) use the normal potions; Akkha, Ba-Ba and the Wardens keep the salts', () => {
    // phase 38c: every path room has a before-supplies encounter; the routes put two of them first (Phase38c.test.ts)
    expect(TOA_BEFORE_SUPPLIES_ENCOUNTERS).toEqual(['toa-kephri-before-supplies', 'toa-zebak-before-supplies', 'toa-akkha-before-supplies', 'toa-baba-before-supplies']);
    expect(a.potions).toEqual({ melee: Potion.SMELLING_SALTS, ranged: Potion.SMELLING_SALTS, magic: Potion.SMELLING_SALTS });
    expect(NORMAL_POTIONS).toEqual({ melee: Potion.SUPER_COMBAT, ranged: Potion.RANGING, magic: Potion.SATURATED_HEART });
    expect(assumptionsForTarget(findTarget('toa-zebak-before-supplies'), a).potions).toEqual(NORMAL_POTIONS);
    expect(assumptionsForTarget(findTarget('toa-akkha'), a)).toBe(a);
    // a style without its boost stays without (the Plan's "Other" = 0)
    const without = { ...a, withoutPotion: ['melee' as const] };
    expect(assumptionsForTarget(findTarget('toa-zebak-before-supplies'), without).withoutPotion).toEqual(['melee']);
    const keys = (id: string) => TOA_TIME_MODEL.encounterPass(id, { best: () => ({ loadout: 'x', style: 'x', dps: 1 }) }, ta, 'none', 90)
      .map((p) => p.targetKey);
    expect(keys('toa-zebak-before-supplies')).toEqual(['toa-zebak-before-supplies']);
    expect(keys('toa-kephri-before-supplies').length).toBeGreaterThan(1);
    expect(keys('toa-kephri-before-supplies').every((k) => k.endsWith('-before-supplies'))).toBe(true);
    ['toa-akkha', 'toa-baba', 'toa-wardens'].forEach((id) => expect(keys(id).some((k) => k.endsWith('-before-supplies'))).toBe(false));
    // the copies are the time model's: not in the Search list
    expect(visibleTargets(raid, a).some((t) => t.beforeSupplies)).toBe(false);
  });

  test('levels by hand at 99: salts +26 (11 + 16%), Super combat +19 (5 + 15%), Ranging +13 (4 + 10%), heart +13', () => {
    const m = buildTargetMonster(findTarget('toa-zebak-before-supplies'), undefined, 'none', a).monster;
    const boosts = (group: 'melee' | 'ranged' | 'magic', aa: BestSetupAssumptions) => {
      const preset = raid.presets.find((p) => p.group === group)!;
      return applyPresetToPlayer(generateEmptyPlayer(), preset, presetStyles(preset)[0], null, m, aa).boosts;
    };
    const early = assumptionsForTarget(findTarget('toa-zebak-before-supplies'), a);
    expect(boosts('melee', a).str).toBe(26);
    expect(boosts('melee', early).str).toBe(19);
    expect(boosts('melee', early).atk).toBe(19);
    expect(boosts('ranged', a).ranged).toBe(26);
    expect(boosts('ranged', early).ranged).toBe(13);
    expect(boosts('magic', a).magic).toBe(26);
    expect(boosts('magic', early).magic).toBe(13);
  });

  test('Zebak (room 2) is slower without the salts by the DPS ratio; Ba-Ba (room 4) is unchanged', () => {
    const presets: PresetDef[] = (['melee', 'ranged', 'magic'] as const).map((g) => raid.presets.find((p) => p.group === g)!);
    const kit = createKitEvaluator(presets.map((p) => presetKitLoadout(generateEmptyPlayer(), p, a)), a);
    const q = (targetKey: string) => kit.best({ targetKey, drain: 'none', fightSeconds: 90 })!;
    const early = q('toa-zebak-before-supplies');
    const salts = q('toa-zebak');
    // the kit's DPS on the copy = the best preset with the normal potions, evaluated by hand
    const m = buildTargetMonster(findTarget('toa-zebak'), undefined, 'none', a).monster;
    const normal = assumptionsForTarget(findTarget('toa-zebak-before-supplies'), a);
    const byHand = Math.max(...presets.flatMap((p) => presetStyles(p).flatMap((s) => presetSpells(p).map((sp) => evaluateLoadout(applyPresetToPlayer(generateEmptyPlayer(), p, s, sp, m, normal), m, false).dps))));
    expect(early.dps).toBeCloseTo(byHand, 9);
    expect(early.dps).toBeLessThan(salts.dps);
    const zebak = encounterTime('toa-zebak-before-supplies', kit, ta);
    const hp = zebak.phases[0].damage;
    const mult = ta.dpsMultiplier!;
    expect(zebak.seconds).toBeCloseTo(hp / (early.dps * mult), 9);
    // the cost of rooms 1-2 without salts here: hp ÷ (normal DPS) − hp ÷ (salts DPS)
    expect(zebak.seconds - hp / (salts.dps * mult)).toBeGreaterThan(0);
    const baba = encounterTime('toa-baba', kit, ta);
    expect(baba.phases[0].targetKey).toBe('toa-baba');
    expect(baba.seconds).toBeCloseTo(baba.phases[0].damage / (q('toa-baba').dps * mult), 9);
  });
});
