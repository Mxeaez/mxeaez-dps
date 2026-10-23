import { describe, expect, test } from '@jest/globals';
import { generateEmptyPlayer } from '@/state';
import { scaleMonster } from '@/lib/MonsterScaling';
import { getDefenceFloor } from '@/lib/scaling/DefenceReduction';
import { INITIAL_MONSTER_INPUTS } from '@/lib/Monsters';
import { MonsterAttribute } from '@/enums/MonsterAttribute';
import { Monster } from '@/types/Monster';
import {
  applyPresetToPlayer, buildTargetMonster, evaluateLoadout, findTarget, presetStyles,
} from '@/lib/fracturedArchive/bestSetup';
import { BestSetupAssumptions, PresetDef } from '@/lib/fracturedArchive/presets';
import { runGearSearch } from '@/lib/fracturedArchive/search';
import {
  encounterTime, PhaseQuery, phaseKey, RaidKit, raidTimeAssumptionsFrom, routesFor,
} from '@/lib/fracturedArchive/raidTime';
import { DEFAULT_PINNED_NAMES, plan, planItemByName } from '@/lib/fracturedArchive/planner';
import { resolveItem } from '@/lib/fracturedArchive/loadout';
import {
  raidBase, teamDpsMultiplier, THEATRE_OF_BLOOD_RAID, TimeSettings, TobMode, withScalingInput,
} from '@/lib/raids';
import { TOB_DEFAULT_SUPPLIES } from '@/lib/raids/theatreOfBlood';
import { TOB_DEFAULT_ASSUMPTIONS, TOB_PRESETS } from '@/lib/raids/tob/presets';
import { TOB_SEARCH_POOL } from '@/lib/raids/tob/searchPool';
import { TOB_TARGETS } from '@/lib/raids/tob/targets';
import { isBlockedByTobStyle, isDawnbringerWrongTarget, tobRequiredStyle } from '@/lib/raids/tob/damage';
import { TOB_TIME_DEFAULTS, tobEncounterPlan } from '@/lib/raids/tob/time';
import { NYLOCAS_VASILIAS_PHASES, VERZIK_P1_NO_DAWNBRINGER } from '@/lib/raids/tob/constants';
import { MONSTER_PHASES_BY_ID, TOB_MONSTER_IDS } from '@/lib/constants';

// Phase 20: Theatre of Blood. Scaling = upstream src/lib/scaling/TheatreOfBlood.ts: hp × (clamp(party, 3, 5) + 3) / 8,
// truncated (normal and Hard Mode), Entry Mode × [10, 19, 27, 34, 40][party - 1] / 40. The wiki (Theatre of Blood, read
// 2026-10-23): "With a team of three or fewer players the bosses will have 75% of their original hitpoints, with four
// players the bosses will have 87.5% of their original hitpoints and a team of five players will leave the bosses'
// hitpoints unchanged" — 6/8, 7/8, 8/8. Strategies → The Nylocas: small nylocas "11 health (9 in 4-Scale, 8 in trios)",
// large "22 health (19 in 4-Scale, 16 in trios)" — trunc(11 × 7/8) = 9, trunc(11 × 6/8) = 8, trunc(22 × 7/8) = 19.

const A = TOB_DEFAULT_ASSUMPTIONS;
const withMode = (mode: TobMode, a: BestSetupAssumptions = A): BestSetupAssumptions => ({ ...a, tob: { mode } });
const HM = withMode('hard');
const EM = withMode('entry');
const withParty = (n: number, a: BestSetupAssumptions = A): BestSetupAssumptions => ({ ...a, partySize: n });
const target = (key: string, a: BestSetupAssumptions = A) => buildTargetMonster(findTarget(key), undefined, 'none', a).monster;
const scaled = (key: string, a: BestSetupAssumptions = A) => scaleMonster(target(key, a));
const preset = (name: string): PresetDef => TOB_PRESETS.find((p) => p.name === name)!;
const presetEval = (name: string, monster: Monster, a: BestSetupAssumptions = A) => {
  const p = preset(name);
  return presetStyles(p)
    .map((s) => evaluateLoadout(applyPresetToPlayer(generateEmptyPlayer(), p, s, null, monster, a), monster, false))
    .sort((x, y) => y.dps - x.dps)[0];
};
const presetDps = (name: string, key: string, a: BestSetupAssumptions = A) => presetEval(name, target(key, a), a).dps;

describe('ToB scaling (upstream TheatreOfBlood.ts vs the wiki) and the mode input', () => {
  test('party 4 vs 5 (normal): 87.5% vs 100% of the infobox hp, truncated', () => {
    // Maiden 3500 → trunc(3500 × 7 / 8) = 3062 at 4; Bloat 2000 → 1750; Vasilias 2500 → 2187; Sotetseg 4000 → 3500;
    // Xarpus 5000 → 4375; Verzik 2000 / 3500 / 3500 → 1750 / 3062 / 3062
    const at = (n: number) => ['tob-maiden', 'tob-bloat', 'tob-nylo-boss-melee', 'tob-sotetseg', 'tob-xarpus', 'tob-verzik-p1', 'tob-verzik-p2', 'tob-verzik-p3']
      .map((k) => scaled(k, withParty(n)).skills.hp);
    expect(at(4)).toEqual([3062, 1750, 2187, 3500, 4375, 1750, 3062, 3062]);
    expect(at(5)).toEqual([3500, 2000, 2500, 4000, 5000, 2000, 3500, 3500]);
    // 1-3 players: 75%
    expect([1, 2, 3].map((n) => scaled('tob-maiden', withParty(n)).skills.hp)).toEqual([2625, 2625, 2625]);
    // only hp scales ("tob only scales hp and nothing else")
    expect(scaled('tob-xarpus', withParty(4)).skills.def).toBe(250);
  });

  test('wave nylocas match the Strategies page (9 / 8 small, 19 / 16 large) and Prinkipas the Hard Mode page (300 / 350 / 400)', () => {
    expect([3, 4, 5].map((n) => scaled('tob-ischyros-small', withParty(n)).skills.hp)).toEqual([8, 9, 11]);
    expect([3, 4, 5].map((n) => scaled('tob-hagios-big', withParty(n)).skills.hp)).toEqual([16, 19, 22]);
    // "Prinkipas has fairly low health (300/350/400 health)" = trio / 4 / 5; needs the phase 20 id fix for the melee form
    ['melee', 'ranged', 'magic'].forEach((f) => expect([3, 4, 5].map((n) => scaled(`tob-prinkipas-${f}`, withParty(n)).skills.hp)).toEqual([300, 350, 400]));
  });

  test('Nylocas Vasilias scales (upstream missed the ids monsters.json uses: 8354 / 10807 / 10786)', () => {
    [8354, 10807, 10803].forEach((id) => expect(TOB_MONSTER_IDS).toContain(id));
    expect(scaled('tob-nylo-boss-magic', withParty(3)).skills.hp).toBe(1875);
    expect(scaled('tob-nylo-boss-melee', withParty(4, EM)).skills.hp).toBe(Math.trunc((1440 * 34) / 40));
  });

  test('mode input: Hard Mode swaps versions (Bloat 2400, Xarpus 6000 / Defence 200), Entry Mode its own table', () => {
    expect(scaled('tob-bloat', HM).skills.hp).toBe(2100); // trunc(2400 × 7/8)
    const x = scaled('tob-xarpus', HM);
    expect([x.skills.hp, x.skills.def]).toEqual([5250, 200]);
    expect(target('tob-maiden', HM).version).toBe('Hard Mode');
    expect(target('tob-verzik-p3', HM).version).toBe('Hard mode, Phase 3');
    // Entry Mode: 2000 × 34/40 = 1700 at 4, × 10/40 = 500 solo
    expect(scaled('tob-maiden', EM).skills.hp).toBe(1700);
    expect(scaled('tob-maiden', withParty(1, EM)).skills.hp).toBe(500);
    expect(target('tob-hagios-small', EM).version).toBe('Small (Entry Mode)');
    // targets without a mode entry keep their version
    expect(target('tob-prinkipas-melee', EM).version).toBe('Melee');
  });

  test('inputs: party 1-5 (default 4), mode is a select (0 normal, 1 hard, 2 entry); team multiplier = party', () => {
    const base = raidBase('tob');
    expect(base.partySize).toEqual({ min: 1, max: 5 });
    const [party, mode] = base.scalingInputs;
    expect(party.default).toBe(4);
    expect(A.partySize).toBe(4);
    expect(withScalingInput(A, party, 8).partySize).toBe(5);
    expect(mode.kind).toBe('select');
    expect(mode.options!.map((o) => o.label)).toEqual(['Normal', 'Hard Mode', 'Entry Mode']);
    expect(mode.get(A)).toBe(0);
    expect(withScalingInput(A, mode, 1).tob!.mode).toBe('hard');
    expect(withScalingInput(A, mode, 9).tob!.mode).toBe('entry');
    expect(teamDpsMultiplier(A)).toBe(4);
    expect(teamDpsMultiplier(withParty(5))).toBe(5);
  });

  test('Defence floors (upstream): Sotetseg 100, Verzik her own Defence (drains do nothing); none on the others', () => {
    expect(getDefenceFloor(scaled('tob-sotetseg'))).toBe(100);
    ['tob-verzik-p1', 'tob-verzik-p2', 'tob-verzik-p3'].forEach((k) => expect(getDefenceFloor(scaled(k))).toBe(scaled(k).skills.def));
    ['tob-maiden', 'tob-bloat', 'tob-nylo-boss-melee', 'tob-xarpus'].forEach((k) => expect(getDefenceFloor(scaled(k))).toBe(0));
  });

  test('drains: Team drains lower Maiden / Xarpus / Sotetseg (to ≥ 100); Verzik and Bloat after a stomp stay undrained', () => {
    const def = (k: string) => scaleMonster(buildTargetMonster(findTarget(k), undefined, 'team', A).monster).skills.def;
    expect(def('tob-maiden')).toBeLessThan(200);
    expect(def('tob-xarpus')).toBeLessThan(250);
    expect(def('tob-sotetseg')).toBeGreaterThanOrEqual(100);
    expect(def('tob-sotetseg')).toBeLessThan(200);
    expect(def('tob-bloat')).toBeLessThan(100);
    const restored = buildTargetMonster(findTarget('tob-bloat-restored'), undefined, 'team', A);
    expect(restored.monster.inputs.defenceReductions).toEqual(INITIAL_MONSTER_INPUTS.defenceReductions);
    expect(restored.drain.plan).toMatch(/^No drains/);
    expect(buildTargetMonster(findTarget('tob-verzik-p2'), undefined, 'team', A).drain.plan).toMatch(/^No drains/);
  });
});

describe('ToB damage rules', () => {
  test('Nylocas Vasilias: only the form\'s style hits (melee can\'t hit the magic form, etc.); default = melee form', () => {
    expect(MONSTER_PHASES_BY_ID[8354]).toEqual(NYLOCAS_VASILIAS_PHASES);
    const melee = target('tob-nylo-boss-melee');
    const ranged = target('tob-nylo-boss-ranged');
    const magic = target('tob-nylo-boss-magic');
    expect([melee, ranged, magic].map((m) => m.inputs.phase)).toEqual(['Melee form', 'Ranged form', 'Magic form']);
    expect(tobRequiredStyle({ ...melee, inputs: { ...melee.inputs, phase: undefined } })).toBe('melee');
    expect(isBlockedByTobStyle(magic, 'slash', true)).toBe(true);
    expect(isBlockedByTobStyle(magic, 'ranged', false)).toBe(true);
    expect(isBlockedByTobStyle(magic, 'magic', false)).toBe(false);
    // the hook is live in the calculator
    expect(presetDps('Torva + Scythe (slash)', 'tob-nylo-boss-magic')).toBe(0);
    expect(presetDps('Twisted bow (Masori)', 'tob-nylo-boss-magic')).toBe(0);
    expect(presetDps('Tumeken\'s shadow (Ancestral)', 'tob-nylo-boss-magic')).toBeGreaterThan(5);
    expect(presetDps('Torva + Scythe (slash)', 'tob-nylo-boss-melee')).toBeGreaterThan(5);
    expect(presetDps('Tumeken\'s shadow (Ancestral)', 'tob-nylo-boss-melee')).toBe(0);
    expect(presetDps('Twisted bow (Masori)', 'tob-nylo-boss-ranged')).toBeGreaterThan(5);
    expect(presetEval('Torva + Scythe (slash)', magic).issues.join(' ')).toMatch(/current form/);
  });

  test('wave nylocas and Prinkipas are gated by style; Verzik\'s nylocas are not', () => {
    expect(presetDps('Twisted bow (Masori)', 'tob-ischyros-big')).toBe(0);
    expect(presetDps('Torva + Scythe (slash)', 'tob-ischyros-big')).toBeGreaterThan(0);
    expect(presetDps('Torva + Scythe (slash)', 'tob-toxobolos-small')).toBe(0);
    expect(presetDps('Tumeken\'s shadow (Ancestral)', 'tob-hagios-small')).toBeGreaterThan(0);
    expect(presetDps('Tumeken\'s shadow (Ancestral)', 'tob-prinkipas-ranged')).toBe(0);
    expect(presetDps('Twisted bow (Masori)', 'tob-prinkipas-ranged')).toBeGreaterThan(0);
    const verzikNylo = target('tob-hagios-small');
    expect(tobRequiredStyle({ ...verzikNylo, version: 'Verzik' })).toBeNull();
  });

  test('Verzik P1 cap (upstream): max hit 10 melee, 3 ranged / magic; the Dawnbringer is exempt and always hits', () => {
    const p1 = target('tob-verzik-p1');
    const scythe = presetEval('Torva + Scythe (slash)', p1);
    const tbow = presetEval('Twisted bow (Masori)', p1);
    const shadow = presetEval('Tumeken\'s shadow (Ancestral)', p1);
    const dawn = presetEval('Dawnbringer (Ancestral)', p1);
    // the scythe's three hitsplats are each capped at 10
    expect(scythe.maxHit).toBe(30);
    expect(tbow.maxHit).toBe(3);
    expect(shadow.maxHit).toBe(3);
    // Dawnbringer: max = trunc(trunc(magic / 3 - 2) × gear bonus / 2) — far above 3; accuracy 100%
    expect(dawn.maxHit).toBeGreaterThan(15);
    expect(dawn.accuracy).toBe(1);
    // no cap on P2
    expect(presetEval('Twisted bow (Masori)', target('tob-verzik-p2')).maxHit).toBeGreaterThan(40);
    // upstream's cap is min(hit, a uniform roll 0..cap) (linearMinTransformer), so even the scythe's three hits average
    // under 5 per hit and the uncapped, always-accurate Dawnbringer autos out-damage it
    expect(scythe.dps).toBeLessThan(5);
    expect(dawn.dps).toBeGreaterThan(scythe.dps);
    // with the staff held by a teammate (phase "Shield (Dawnbringer with a teammate)") the Dawnbringer deals nothing
    const held = { ...p1, inputs: { ...p1.inputs, phase: VERZIK_P1_NO_DAWNBRINGER } };
    expect(presetEval('Dawnbringer (Ancestral)', held).dps).toBe(0);
    expect(presetEval('Torva + Scythe (slash)', held).dps).toBeCloseTo(scythe.dps);
  });

  test('the Dawnbringer deals nothing outside Verzik P1', () => {
    expect(isDawnbringerWrongTarget(target('tob-verzik-p2'), true)).toBe(true);
    expect(isDawnbringerWrongTarget(target('tob-verzik-p1'), true)).toBe(false);
    expect(isDawnbringerWrongTarget(target('tob-verzik-p2'), false)).toBe(false);
    expect(presetDps('Dawnbringer (Ancestral)', 'tob-verzik-p3')).toBe(0);
    expect(presetDps('Dawnbringer (Ancestral)', 'tob-maiden')).toBe(0);
    expect(presetDps('Dawnbringer (Ancestral)', 'tob-verzik-p1')).toBeGreaterThan(2);
  });

  test('Bloat is undead: the Salve (ei) preset beats the same Scythe with the Amulet of rancour', () => {
    expect(target('tob-bloat').attributes).toContain(MonsterAttribute.UNDEAD);
    expect(presetDps('Torva + Salve (ei) + Scythe (slash)', 'tob-bloat')).toBeGreaterThan(presetDps('Torva + Scythe (slash)', 'tob-bloat'));
  });

  test('presets and pool: every item resolves; Dawnbringer, Eye of Ayak, Saeldor and the Salve (ei) are in the pool', () => {
    TOB_PRESETS.forEach((p) => Object.values(p.equipment).forEach((ref) => expect(resolveItem(ref!)).toBeTruthy()));
    const weapons = Object.values(TOB_SEARCH_POOL).flatMap((g) => g.weapons.map((w) => (Array.isArray(w.weapon) ? w.weapon[0] : w.weapon)));
    ['Dawnbringer', 'Eye of Ayak', 'Blade of Saeldor (c)', 'Sanguinesti staff', 'Scythe of Vitur', 'Twisted bow'].forEach((n) => expect(weapons).toContain(n));
    Object.values(TOB_SEARCH_POOL).forEach((g) => expect(g.slots.neck!.map((c) => c.ref)).toContain('Salve amulet(ei)'));
    expect(TOB_TARGETS.every((t) => t.key.startsWith('tob-') && t.raid === 'tob')).toBe(true);
  });
});

describe('ToB encounter sequences (src/lib/raids/tob/time.ts)', () => {
  const settings: TimeSettings = THEATRE_OF_BLOOD_RAID.defaultTimeSettings;
  const timeA = (s: TimeSettings = settings, best: BestSetupAssumptions = A, drain: 'none' | 'team' = 'none') => raidTimeAssumptionsFrom(best, drain, s, THEATRE_OF_BLOOD_RAID.time);
  const plan1 = (id: string, s = settings, best = A) => tobEncounterPlan(id, timeA(s, best)).map((p) => [p.targetKey, Math.round(p.damage * 10) / 10]);
  const toyKit = (dps: Record<string, number>): RaidKit => ({
    best: (q: PhaseQuery) => {
      const d = dps[phaseKey(q.targetKey, q.phase)] ?? dps[q.targetKey] ?? 0;
      return d > 0 ? { loadout: 'toy', style: 'x', dps: d } : null;
    },
  });

  test('one route in the raid\'s order', () => {
    const routes = routesFor(timeA());
    expect(routes.length).toBe(1);
    expect(routes[0].encounters).toEqual(['tob-maiden', 'tob-bloat', 'tob-nylocas', 'tob-sotetseg', 'tob-xarpus', 'tob-verzik']);
  });

  test('plans at party 4 (normal): Maiden 30/20/20/30%, Sotetseg thirds, Xarpus 50% + 25%, Verzik P1 specs + rest', () => {
    expect(plan1('tob-maiden')).toEqual([['tob-maiden', 918.6], ['tob-maiden', 612.4], ['tob-maiden', 612.4], ['tob-maiden', 918.6]]);
    expect(plan1('tob-sotetseg')).toEqual([['tob-sotetseg', 1166.7], ['tob-sotetseg', 1166.7], ['tob-sotetseg', 1166.7]]);
    expect(plan1('tob-xarpus')).toEqual([['tob-xarpus', 2187.5], ['tob-xarpus', 1093.8]]);
    // 2 specs × 4 players × 112.5 = 900 of P1's 1750
    expect(plan1('tob-verzik')).toEqual([['tob-verzik-p1', 900], ['tob-verzik-p1', 850], ['tob-verzik-p2', 3062], ['tob-verzik-p3', 3062]]);
    expect(plan1('tob-nylocas').map((r) => r[0])).toEqual(['tob-nylo-boss-melee', 'tob-nylo-boss-ranged', 'tob-nylo-boss-magic']);
  });

  test('Hard Mode: 3 Prinkipas before the Vasilias, Verzik P3 + 30%; Entry Mode: Xarpus P3 at 22.5%', () => {
    const nylo = plan1('tob-nylocas', settings, HM);
    expect(nylo.length).toBe(12);
    expect(nylo.slice(0, 9).reduce((t, r) => t + (r[1] as number), 0)).toBeCloseTo(3 * 350, 0);
    expect(plan1('tob-verzik', settings, HM)[3]).toEqual(['tob-verzik-p3', Math.round(3062 * 1.3 * 10) / 10]);
    const ex = scaled('tob-xarpus', EM).skills.hp;
    expect(plan1('tob-xarpus', settings, EM)[1][1]).toBeCloseTo(Math.round(ex * 0.225 * 10) / 10);
  });

  test('settings: Maiden leaks, Xarpus exhumed heals (≤ 25%), Verzik heals and spec count add damage', () => {
    expect(plan1('tob-maiden', { ...TOB_TIME_DEFAULTS, maidenNyloHeal: 0.1 }).map((r) => r[1])).toEqual([918.6, 918.6, 918.6, 1224.8]);
    expect(plan1('tob-xarpus', { ...TOB_TIME_DEFAULTS, xarpusExhumedHeal: 0.5 })[0][1]).toBe(3281.3); // capped: 100% → 25%
    expect(plan1('tob-verzik', { ...TOB_TIME_DEFAULTS, verzikDawnbringerSpecs: 0 })[0][1]).toBe(0);
    expect(plan1('tob-verzik', { ...TOB_TIME_DEFAULTS, verzikDawnbringerSpecs: 3 })[0][1]).toBe(1350);
    expect(plan1('tob-verzik', { ...TOB_TIME_DEFAULTS, verzikP2Heal: 0.2 })[2][1]).toBeCloseTo(3674.4);
  });

  test('times: damage ÷ (party × DPS); Bloat drains for the first down only; nylo forms in equal time', () => {
    const kit = toyKit({
      'tob-bloat': 20, 'tob-bloat-restored': 10, 'tob-nylo-boss-melee': 12, 'tob-nylo-boss-ranged': 6, 'tob-nylo-boss-magic': 6, 'tob-verzik-p1': 8, 'tob-verzik-p2': 9, 'tob-verzik-p3': 10,
    });
    // Bloat: first down 18 s × 4 × 20 = 1440, the rest (310) at 4 × 10
    const bloat = encounterTime('tob-bloat', kit, timeA());
    expect(bloat.phases.map((p) => Math.round(p.damage))).toEqual([1440, 310]);
    expect(bloat.seconds).toBeCloseTo(18 + 310 / 40);
    // Vasilias: rates 48 / 24 / 24 → t = 2187 / 96 each, damage 1093.5 / 546.75 / 546.75
    const nylo = encounterTime('tob-nylocas', kit, timeA());
    expect(nylo.phases.map((p) => p.seconds)).toEqual([2187 / 96, 2187 / 96, 2187 / 96]);
    expect(nylo.phases[0].damage).toBeCloseTo(1093.5);
    // rotation off: thirds of the hp
    const thirds = encounterTime('tob-nylocas', kit, timeA({ ...TOB_TIME_DEFAULTS, nyloRotation: false }));
    expect(thirds.seconds).toBeCloseTo(729 / 48 + 729 / 24 + 729 / 24);
    // Verzik: 8 specs × 2.4 s ÷ 4 + 850 / 32 + 3062 / 36 + 3062 / 40
    const verzik = encounterTime('tob-verzik', kit, timeA());
    expect(verzik.phases[0].choice!.loadout).toBe('Dawnbringer (raid item)');
    expect(verzik.seconds).toBeCloseTo((8 * 2.4) / 4 + 850 / 32 + 3062 / 36 + 3062 / 40);
    // a form the kit can't hit still costs its third of the time (like Akkha's prayers in ToA); none at all: infinite
    expect(encounterTime('tob-nylocas', toyKit({ 'tob-nylo-boss-melee': 12 }), timeA()).seconds).toBeCloseTo((3 * 2187) / 48);
    expect(encounterTime('tob-nylocas', toyKit({}), timeA()).seconds).toBe(Infinity);
    // Verzik P1 rest with one Dawnbringer: 1 holder at the kit's best (5) + 3 without it (4) → 850 / 17
    const held = encounterTime('tob-verzik', toyKit({ 'tob-verzik-p1': 5, [phaseKey('tob-verzik-p1', VERZIK_P1_NO_DAWNBRINGER)]: 4 }), timeA());
    expect(held.phases[1].seconds).toBeCloseTo(850 / 17);
    expect(held.phases[1].phase).toBe(VERZIK_P1_NO_DAWNBRINGER);
  });

  test('required phase targets include every queried target (+ Prinkipas in Hard Mode)', () => {
    const req = THEATRE_OF_BLOOD_RAID.time.requiredPhaseTargets(timeA()).map((q) => q.targetKey);
    ['tob-maiden', 'tob-bloat', 'tob-bloat-restored', 'tob-nylo-boss-magic', 'tob-sotetseg', 'tob-xarpus', 'tob-verzik-p1', 'tob-verzik-p3'].forEach((k) => expect(req).toContain(k));
    expect(req).not.toContain('tob-prinkipas-melee');
    expect(THEATRE_OF_BLOOD_RAID.time.requiredPhaseTargets(timeA(settings, HM)).map((q) => q.targetKey)).toContain('tob-prinkipas-melee');
  });
});

describe('ToB search and planner', () => {
  test('Search on the Vasilias magic form: magic on top, melee and ranged listed as can\'t hit', () => {
    const r = runGearSearch(generateEmptyPlayer(), { targetKey: 'tob-nylo-boss-magic', drain: 'none' }, A, { topN: 3 });
    expect(r.cancelled).toBe(false);
    expect(r.rows[0].group).toBe('magic');
    const cant = r.cantHit.map((c) => c.weapon);
    expect(cant).toContain('Scythe of Vitur');
    expect(cant).toContain('Twisted bow + Dragon arrow');
  }, 120000);

  test('Search on Verzik P1: the Dawnbringer on top (uncapped); with a teammate holding it, melee on top', () => {
    const r = runGearSearch(generateEmptyPlayer(), { targetKey: 'tob-verzik-p1', drain: 'team' }, A, { topN: 5 });
    expect(r.rows[0].weaponLabel).toMatch(/Dawnbringer/);
    expect(r.drain.plan).toMatch(/^No drains/);
    const held = runGearSearch(generateEmptyPlayer(), { targetKey: 'tob-verzik-p1', phase: VERZIK_P1_NO_DAWNBRINGER, drain: 'none' }, A, { topN: 3 });
    expect(held.rows[0].group).toBe('melee');
    expect(held.cantHit.map((c) => c.weapon)).toContain('Dawnbringer');
  }, 120000);

  test('planner on ToB with a reduced pool: one route, ≤ 28 slots, every encounter finite', () => {
    const res = plan({
      basePlayer: generateEmptyPlayer(),
      assumptions: A,
      drain: 'team',
      settings: THEATRE_OF_BLOOD_RAID.defaultTimeSettings,
      route: 'all',
      pinned: DEFAULT_PINNED_NAMES.map((n) => planItemByName(n).id),
      nonItemSlots: 1,
      supplies: TOB_DEFAULT_SUPPLIES,
    }, {
      model: THEATRE_OF_BLOOD_RAID.time,
      presets: TOB_PRESETS.filter((p) => ['Torva + Scythe (slash)', 'Twisted bow (Masori)', 'Tumeken\'s shadow (Ancestral)'].includes(p.name)),
      search: { weapons: ['Scythe of Vitur', 'Twisted bow', 'Tumeken\'s shadow'], maxPasses: 1 },
      perGroupWeapons: 2,
      perWeapon: 1,
      seeds: 4,
    });
    expect(res.cancelled).toBe(false);
    expect(res.comparison!.routes.length).toBe(1);
    const route = res.comparison!.routes[res.planned];
    expect(Number.isFinite(route.seconds)).toBe(true);
    expect(res.slots!.used).toBeLessThanOrEqual(28);
    const nylo = route.encounters.find((e) => e.id === 'tob-nylocas')!;
    expect(nylo.phases.map((p) => p.choice?.group)).toEqual(['melee', 'ranged', 'magic']);
    expect(route.encounters.map((e) => e.id)).toEqual(['tob-maiden', 'tob-bloat', 'tob-nylocas', 'tob-sotetseg', 'tob-xarpus', 'tob-verzik']);
    expect(route.seconds).toBeCloseTo(route.encounters.reduce((t, e) => t + e.seconds, 0));
  }, 300000);
});
