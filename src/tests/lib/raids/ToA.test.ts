import { expect, test } from '@jest/globals';
import { otherRaidsDescribe } from '@/tests/utils/otherRaids';
import { generateEmptyPlayer } from '@/state';
import { scaleMonster } from '@/lib/MonsterScaling';
import { getDefenceFloor } from '@/lib/scaling/DefenceReduction';
import {
  applyPresetToPlayer, buildTargetMonster, evaluateLoadout, findTarget, presetStyles,
} from '@/lib/fracturedArchive/bestSetup';
import { BestSetupAssumptions, PresetDef } from '@/lib/fracturedArchive/presets';
import { runGearSearch } from '@/lib/fracturedArchive/search';
import {
  encounterTime, PhaseQuery, phaseKey, RaidKit, raidTimeAssumptionsFrom,
} from '@/lib/fracturedArchive/raidTime';
import { DEFAULT_PINNED_NAMES, plan, planItemByName } from '@/lib/fracturedArchive/planner';
import { TimeSettings, TOMBS_OF_AMASCUT_RAID } from '@/lib/raids';
import { TOA_DEFAULT_SUPPLIES } from '@/lib/raids/tombsOfAmascut';
import { TOA_DEFAULT_ASSUMPTIONS, TOA_PRESETS } from '@/lib/raids/toa/presets';
import { TOA_TARGETS } from '@/lib/raids/toa/targets';
import {
  AKKHA_FINAL_STAND_PHASE,
  AKKHA_NO_PRAYER_PHASE,
  AKKHA_PRAYING_MAGIC_PHASE,
  AKKHA_PRAYING_MELEE_PHASE,
  AKKHA_PRAYING_RANGED_PHASE,
  P2_WARDEN_MELEE_MAGIC_PHASE,
  P2_WARDEN_MELEE_RANGED_PHASE,
  P2_WARDEN_NO_PRAYER_PHASE,
} from '@/lib/raids/toa/constants';
import { toaPrayedStyles } from '@/lib/raids/toa/prayers';
import {
  akkhaRotation, coreExposureSeconds, TOA_TIME_DEFAULTS, toaEncounterPlan, wardensP2Time,
} from '@/lib/raids/toa/time';

// Phase 18: Tombs of Amascut. Sources: https://oldschool.runescape.wiki/w/Tombs_of_Amascut (scaling),
// https://oldschool.runescape.wiki/w/Tombs_of_Amascut/Strategies (encounter sequences), the boss pages; notes in
// docs/DATA_SOURCES.md ("Tombs of Amascut").

const A = TOA_DEFAULT_ASSUMPTIONS;
const hpOf = (key: string, a: BestSetupAssumptions = A, phase?: string) => scaleMonster(buildTargetMonster(findTarget(key), phase, 'none', a).monster).skills.hp;
const withToa = (patch: Partial<NonNullable<BestSetupAssumptions['toa']>>, extra: Partial<BestSetupAssumptions> = {}): BestSetupAssumptions => ({
  ...A, ...extra, toa: { ...A.toa!, ...patch },
});
const preset = (name: string): PresetDef => TOA_PRESETS.find((p) => p.name === name)!;
const presetDps = (name: string, key: string, phase?: string, a: BestSetupAssumptions = A) => {
  const { monster } = buildTargetMonster(findTarget(key), phase, 'none', a);
  const p = preset(name);
  return Math.max(...presetStyles(p).map((s) => evaluateLoadout(applyPresetToPlayer(generateEmptyPlayer(), p, s, null, monster, a), monster, false).dps));
};

otherRaidsDescribe('ToA hp: upstream scaling at raid level 500, party 6, path 0', () => {
  // scaled hp (upstream scaleMonster through buildTargetMonster)
  const EXPECTED: Record<string, number> = {
    'toa-kephri-shielded': 2070,
    'toa-kephri': 1100,
    'toa-spitting-scarab': 550,
    'toa-soldier-scarab': 550,
    'toa-arcane-scarab': 550,
    'toa-zebak': 8000,
    'toa-akkha': 5520,
    'toa-akkha-shadow': 970,
    'toa-baba': 5240,
    'toa-obelisk': 3590,
    'toa-warden-p2': 1930,
    'toa-warden-p2-tumeken': 1930,
    'toa-warden-core': 31050,
    'toa-warden-p3': 12140,
    'toa-warden-p3-enraged': 12140,
  };

  test('every target equals scaleMonster with the calculator\'s ToA inputs', () => {
    // phase 38a: the copies of rooms 1-2 (`-before-supplies`) are the same monsters
    const copies = Object.fromEntries(TOA_TARGETS.filter((t) => t.beforeSupplies)
      .map((t) => [t.key, EXPECTED[t.key.replace('-before-supplies', '')]]));
    // phase 38c: any path may be done first, so every path room has its copies
    expect(Object.keys(copies).sort()).toEqual(['toa-arcane-scarab', 'toa-kephri', 'toa-kephri-shielded', 'toa-soldier-scarab', 'toa-spitting-scarab', 'toa-zebak',
      'toa-akkha', 'toa-akkha-shadow', 'toa-baba']
      .map((k) => `${k}-before-supplies`).sort());
    Object.assign(EXPECTED, copies);
    expect(Object.keys(EXPECTED).sort()).toEqual(TOA_TARGETS.map((t) => t.key).sort());
    TOA_TARGETS.forEach((t) => {
      const { monster } = buildTargetMonster(t, undefined, 'none', A);
      expect(monster.inputs).toMatchObject({ toaInvocationLevel: 500, toaPathLevel: 0, partySize: 6 });
      // the best-setup monster holds current hp = scaled hp, like the calculator
      expect(monster.inputs.monsterCurrentHp).toBe(scaleMonster(monster).skills.hp);
      expect(scaleMonster(monster).skills.hp).toBe(EXPECTED[t.key]);
    });
  });

  test('hand derivation: Akkha 400 hp → 5520 (wiki: +2% hp per 5 raid levels; 2nd-3rd member +90%, 4th+ +60% each)', () => {
    const base = 400;
    const raidLevel = base + Math.trunc((base * Math.trunc((4 * 500) / 10)) / 100); // +200% at 500 → 1200
    expect(raidLevel).toBe(1200);
    const partyFactor = 10 + 9 * 2 + 6 * (6 - 3); // tenths: 1 + 0.9 × 2 + 0.6 × 3 = 4.6
    const party = Math.trunc((raidLevel * partyFactor) / 10); // 5520
    const rounded = Math.trunc((party + 5) / 10) * 10; // > 300 hp: rounded to 10
    expect(rounded).toBe(5520);
    expect(hpOf('toa-akkha')).toBe(rounded);
  });

  test('raid level, path level and party size change the hp as upstream does', () => {
    // raid level 300: 400 + 120% = 880, × 4.6 = 4048 → 4050
    expect(hpOf('toa-akkha', withToa({ invocationLevel: 300 }))).toBe(4050);
    // Zebak, path level 2: 1740 × (100 + 3 + 5 × 2) / 100 = 1966, × 4.6 = 9043 → 9040; other bosses unaffected
    const path2 = withToa({ pathLevels: { ...A.toa!.pathLevels, zebak: 2 } });
    expect(hpOf('toa-zebak', path2)).toBe(9040);
    expect(hpOf('toa-akkha', path2)).toBe(5520);
    // core: a quarter of the raid-level factor (4500 + 50% at 500), × 4.6
    expect(hpOf('toa-warden-core')).toBe(31050);
    // solo: no party factor
    expect(hpOf('toa-akkha', { ...A, partySize: 1 })).toBe(1200);
  });

  test('the defence roll scales with raid level: lower raid level → more DPS and a shorter TTK (upstream)', () => {
    const at = (lvl: number) => {
      const a = withToa({ invocationLevel: lvl });
      const { monster } = buildTargetMonster(findTarget('toa-zebak'), undefined, 'none', a);
      const p = preset('Tumeken\'s shadow (Ancestral)');
      return evaluateLoadout(applyPresetToPlayer(generateEmptyPlayer(), p, presetStyles(p)[0], null, monster, a), monster);
    };
    const hi = at(500);
    const lo = at(300);
    expect(lo.dps).toBeGreaterThan(hi.dps);
    expect(lo.ttk).toBeLessThan(hi.ttk);
  });
});

otherRaidsDescribe('ToA Defence floors (upstream getDefenceFloor) and weaknesses (monsters.json)', () => {
  test.each([
    ['toa-akkha', 70], ['toa-baba', 60], ['toa-kephri-shielded', 60], ['toa-kephri', 60], ['toa-zebak', 50],
    ['toa-obelisk', 60], ['toa-warden-p3', 120], ['toa-warden-p3-enraged', 120], ['toa-warden-p2', 0], ['toa-warden-core', 0],
  ])('%s floor %d', (key, floor) => {
    const m = scaleMonster(buildTargetMonster(findTarget(key as string), undefined, 'none', A).monster);
    expect(getDefenceFloor(m)).toBe(floor);
  });

  test('enraged P3 Warden: Defence 180 (wiki), same floor', () => {
    expect(buildTargetMonster(findTarget('toa-warden-p3-enraged'), undefined, 'none', A).monster.skills.def).toBe(180);
    expect(buildTargetMonster(findTarget('toa-warden-p3'), undefined, 'none', A).monster.skills.def).toBe(150);
  });

  test('weaknesses: Kephri fire 40 / 35, shadow air 60, wardens earth 50', () => {
    const w = (key: string) => buildTargetMonster(findTarget(key), undefined, 'none', A).monster.weakness;
    expect(w('toa-kephri-shielded')).toEqual({ element: 'fire', severity: 40 });
    expect(w('toa-kephri')).toEqual({ element: 'fire', severity: 35 });
    expect(w('toa-akkha-shadow')).toEqual({ element: 'air', severity: 60 });
    expect(w('toa-warden-p3')).toEqual({ element: 'earth', severity: 50 });
  });
});

otherRaidsDescribe('ToA prayers (src/lib/raids/toa/prayers.ts)', () => {
  test('Akkha: the default phase blocks nothing; Praying X blocks X; final stand blocks ranged and magic', () => {
    const fang = 'Osmumten\'s fang (Torva)';
    const shadow = 'Tumeken\'s shadow (Ancestral)';
    const tbow = 'Twisted bow (Masori)';
    [fang, shadow, tbow].forEach((p) => expect(presetDps(p, 'toa-akkha', AKKHA_NO_PRAYER_PHASE)).toBeGreaterThan(0));
    expect(presetDps(fang, 'toa-akkha', AKKHA_PRAYING_MELEE_PHASE)).toBe(0);
    expect(presetDps(shadow, 'toa-akkha', AKKHA_PRAYING_MELEE_PHASE)).toBeGreaterThan(0);
    expect(presetDps(tbow, 'toa-akkha', AKKHA_PRAYING_RANGED_PHASE)).toBe(0);
    expect(presetDps(shadow, 'toa-akkha', AKKHA_PRAYING_MAGIC_PHASE)).toBe(0);
    expect(presetDps(fang, 'toa-akkha', AKKHA_FINAL_STAND_PHASE)).toBe(presetDps(fang, 'toa-akkha', AKKHA_NO_PRAYER_PHASE));
    expect(presetDps(shadow, 'toa-akkha', AKKHA_FINAL_STAND_PHASE)).toBe(0);
    expect(presetDps(tbow, 'toa-akkha', AKKHA_FINAL_STAND_PHASE)).toBe(0);
  });

  test('P2 Warden: no block by default (upstream behaviour); Melee + Ranged / Melee + Magic as selected', () => {
    const shadow = 'Tumeken\'s shadow (Ancestral)';
    const tbow = 'Twisted bow (Masori)';
    const scythe = 'Torva + Scythe (slash)';
    expect(presetDps(tbow, 'toa-warden-p2', P2_WARDEN_NO_PRAYER_PHASE)).toBeGreaterThan(0);
    expect(presetDps(scythe, 'toa-warden-p2', P2_WARDEN_NO_PRAYER_PHASE)).toBeGreaterThan(0);
    expect(presetDps(tbow, 'toa-warden-p2', P2_WARDEN_MELEE_RANGED_PHASE)).toBe(0);
    expect(presetDps(scythe, 'toa-warden-p2', P2_WARDEN_MELEE_RANGED_PHASE)).toBe(0);
    expect(presetDps(shadow, 'toa-warden-p2', P2_WARDEN_MELEE_RANGED_PHASE)).toBeGreaterThan(0);
    expect(presetDps(shadow, 'toa-warden-p2-tumeken', P2_WARDEN_MELEE_MAGIC_PHASE)).toBe(0);
    expect(presetDps(tbow, 'toa-warden-p2-tumeken', P2_WARDEN_MELEE_MAGIC_PHASE)).toBeGreaterThan(0);
    // the best-setup targets default to each warden's initial prayers
    expect(findTarget('toa-warden-p2').phases![0]).toBe(P2_WARDEN_MELEE_RANGED_PHASE);
    expect(findTarget('toa-warden-p2-tumeken').phases![0]).toBe(P2_WARDEN_MELEE_MAGIC_PHASE);
  });

  test('no other monster prays (the core, P3, Zebak, non-ToA)', () => {
    ['toa-warden-core', 'toa-warden-p3', 'toa-zebak', 'xarth'].forEach((k) => {
      const { monster } = buildTargetMonster(findTarget(k), undefined, 'none', A);
      expect(toaPrayedStyles(monster)).toEqual([]);
    });
  });

  test('the calculator warns when the boss prays against the style', () => {
    const { monster } = buildTargetMonster(findTarget('toa-akkha'), AKKHA_PRAYING_MELEE_PHASE, 'none', A);
    const p = preset('Osmumten\'s fang (Torva)');
    const ev = evaluateLoadout(applyPresetToPlayer(generateEmptyPlayer(), p, presetStyles(p)[0], null, monster, A), monster, false);
    expect(ev.issues).toContain('This boss is praying against this combat style.');
  });
});

otherRaidsDescribe('ToA encounter damage sequences (src/lib/raids/toa/time.ts)', () => {
  const settings: TimeSettings = TOMBS_OF_AMASCUT_RAID.defaultTimeSettings;
  const timeA = (drain: 'none' | 'team' = 'none', s: TimeSettings = settings, best: BestSetupAssumptions = A) => raidTimeAssumptionsFrom(best, drain, s, TOMBS_OF_AMASCUT_RAID.time);
  const plan1 = (id: string, s = settings) => toaEncounterPlan(id, timeA('none', s)).map((p) => [p.targetKey, p.phase ?? '', Math.round(p.damage * 10) / 10]);

  test('Kephri: 3 shields + overlords + her hp; leaks add per intermission', () => {
    // phase 38a: a room before the supplies targets the copies (normal potions); phase 38c: its own encounter id
    expect(plan1('toa-kephri').map((r) => r[0])).toEqual(['toa-kephri-shielded', 'toa-spitting-scarab', 'toa-soldier-scarab', 'toa-arcane-scarab', 'toa-kephri']);
    expect(plan1('toa-kephri-before-supplies')).toEqual([
      ['toa-kephri-shielded-before-supplies', '', 3 * 2070],
      ['toa-spitting-scarab-before-supplies', '', 550],
      ['toa-soldier-scarab-before-supplies', '', 550],
      ['toa-arcane-scarab-before-supplies', '', 550],
      ['toa-kephri-before-supplies', '', 1100],
    ]);
    const leaky = { ...TOA_TIME_DEFAULTS, kephriSwarmLeak: 0.1, kephriOverlords: false };
    expect(plan1('toa-kephri-before-supplies', leaky)).toEqual([['toa-kephri-shielded-before-supplies', '', 2070 * 3.2], ['toa-kephri-before-supplies', '', 1100]]);
  });

  test('Akkha: fixed rows = 4 shadows + 20% final stand in melee (his main hp depends on the kit, see below)', () => {
    expect(plan1('toa-akkha')).toEqual([
      ['toa-akkha-shadow', '', 4 * 970],
      ['toa-akkha', AKKHA_FINAL_STAND_PHASE, 1104],
    ]);
    const noRot = { ...TOA_TIME_DEFAULTS, akkhaPrayerRotation: false };
    expect(plan1('toa-akkha', noRot)[0]).toEqual(['toa-akkha', AKKHA_NO_PRAYER_PHASE, 5520]);
  });

  test('Zebak, Ba-Ba: their hp; Wardens: obelisk, P3 95% + 25% enraged (siphons optional)', () => {
    expect(plan1('toa-zebak-before-supplies')).toEqual([['toa-zebak-before-supplies', '', 8000]]);
    expect(plan1('toa-zebak')).toEqual([['toa-zebak', '', 8000]]);
    expect(plan1('toa-baba')).toEqual([['toa-baba', '', 5240]]);
    expect(plan1('toa-baba-before-supplies')).toEqual([['toa-baba-before-supplies', '', 5240]]);
    expect(plan1('toa-wardens')).toEqual([
      ['toa-obelisk', '', 3590],
      ['toa-warden-p3', '', 11533],
      ['toa-warden-p3-enraged', '', 3035],
    ]);
    const siphons = { ...TOA_TIME_DEFAULTS, p3SiphonFraction: 0.2 };
    expect(plan1('toa-wardens', siphons)[1]).toEqual(['toa-warden-p3', '', 9105]);
  });

  test('P2: core exposure 21 / 29 / 37 ticks by the Warden\'s hp; downs until it is gone, core damage × 5', () => {
    expect(coreExposureSeconds(1)).toBeCloseTo(12.6);
    expect(coreExposureSeconds(0.8)).toBeCloseTo(12.6);
    expect(coreExposureSeconds(0.79)).toBeCloseTo(17.4);
    expect(coreExposureSeconds(0.6)).toBeCloseTo(17.4);
    expect(coreExposureSeconds(0.25)).toBeCloseTo(22.2);
    // 1000 Warden hp, 100 shield, team 10 dps on the shield, 5 dps on the core (= 25 Warden hp/s):
    // down 1: 10 s shield, 12.6 s core → 315 (68.5% left); down 2: 10 s, 17.4 s → 435 (25% left);
    // down 3: 10 s, 250 / 25 = 10 s → dead
    const r = wardensP2Time(1000, 100, 10, 5);
    expect(r.downs).toBe(3);
    expect(r.shieldSeconds).toBeCloseTo(30);
    expect(r.coreSeconds).toBeCloseTo(12.6 + 17.4 + 10);
    expect(wardensP2Time(1000, 100, 0, 5).shieldSeconds).toBe(Infinity);
    expect(wardensP2Time(1000, 100, 10, 0).coreSeconds).toBe(Infinity);
  });

  // toy kit: DPS per target key (anything missing deals 0)
  const toyKit = (dps: Record<string, number>): RaidKit => ({
    best: (q: PhaseQuery) => {
      // phase 38a: a copy before the supplies answers as its target
      const key = q.targetKey.replace('-before-supplies', '');
      const d = dps[phaseKey(key, q.phase)] ?? dps[key] ?? 0;
      return d > 0 ? { loadout: 'toy', style: 'x', dps: d } : null;
    },
  });

  test('time = damage ÷ (party × DPS); the Wardens include P2 between P1 and P3', () => {
    const kit = toyKit({
      'toa-zebak': 10,
      'toa-obelisk': 10,
      'toa-warden-p2': 5,
      'toa-warden-core': 20,
      'toa-warden-p3': 10,
      'toa-warden-p3-enraged': 8,
    });
    const z = encounterTime('toa-zebak', kit, timeA());
    expect(z.seconds).toBeCloseTo(8000 / (6 * 10));
    const w = encounterTime('toa-wardens', kit, timeA());
    expect(w.phases.map((p) => p.key)).toEqual(['wardens-p1', 'wardens-p2-shield', 'wardens-p2-core', 'wardens-p3', 'wardens-p3-enraged']);
    const p2 = wardensP2Time(31050, 1930, 5 * 6, 20 * 6);
    expect(w.phases[1].seconds).toBeCloseTo(p2.shieldSeconds);
    expect(w.phases[2].seconds).toBeCloseTo(p2.coreSeconds);
    expect(w.seconds).toBeCloseTo(3590 / 60 + p2.shieldSeconds + p2.coreSeconds + (12140 * 0.95) / 60 + (12140 * 0.25) / 48);
    // Tumeken's Warden in P2 is queried with its own prayers
    const tum = encounterTime('toa-wardens', toyKit({ 'toa-warden-p2-tumeken': 5 }), timeA('none', { ...TOA_TIME_DEFAULTS, p2Warden: 'tumeken' }));
    expect(tum.phases[1].targetKey).toBe('toa-warden-p2-tumeken');
    expect(tum.phases[1].phase).toBe(P2_WARDEN_MELEE_MAGIC_PHASE);
  });

  test('a kit that can\'t melee can\'t finish Akkha (final stand): infinite time', () => {
    const kit = toyKit({
      [phaseKey('toa-akkha', AKKHA_PRAYING_MELEE_PHASE)]: 10,
      [phaseKey('toa-akkha', AKKHA_PRAYING_RANGED_PHASE)]: 10,
      [phaseKey('toa-akkha', AKKHA_PRAYING_MAGIC_PHASE)]: 10,
      'toa-akkha-shadow': 10,
    });
    expect(encounterTime('toa-akkha', kit, timeA()).seconds).toBe(Infinity);
    const withMelee = toyKit({
      [phaseKey('toa-akkha', AKKHA_PRAYING_MELEE_PHASE)]: 10,
      [phaseKey('toa-akkha', AKKHA_PRAYING_RANGED_PHASE)]: 10,
      [phaseKey('toa-akkha', AKKHA_PRAYING_MAGIC_PHASE)]: 10,
      'toa-akkha-shadow': 10,
      [phaseKey('toa-akkha', AKKHA_FINAL_STAND_PHASE)]: 5,
    });
    expect(encounterTime('toa-akkha', withMelee, timeA()).seconds).toBeCloseTo((5520 + 3880) / 60 + 1104 / 30);
  });

  test('Akkha rotation is by time (six autos + a special per style): equal time under each prayer, hp in proportion to DPS', () => {
    // pure split: rates 60 / 60 / 30 → t = 5520 / 150 = 36.8 s each; damage 2208 / 2208 / 1104
    const split = akkhaRotation(5520, [60, 60, 30]);
    split.forEach((x) => expect(x.seconds).toBeCloseTo(36.8));
    expect(split.map((x) => x.damage)).toEqual([2208, 2208, 1104]);
    // a style blocked under one prayer still costs that prayer's time
    const blocked = akkhaRotation(5520, [0, 60, 60]);
    blocked.forEach((x) => expect(x.seconds).toBeCloseTo(46));
    expect(blocked[0].damage).toBe(0);
    expect(akkhaRotation(5520, [0, 0, 0])[0].seconds).toBe(Infinity);
    // through the encounter (team of 6 by default): melee 10, ranged 10, magic 5 under the three prayers
    const kit = toyKit({
      [phaseKey('toa-akkha', AKKHA_PRAYING_MELEE_PHASE)]: 10,
      [phaseKey('toa-akkha', AKKHA_PRAYING_RANGED_PHASE)]: 10,
      [phaseKey('toa-akkha', AKKHA_PRAYING_MAGIC_PHASE)]: 5,
      'toa-akkha-shadow': 10,
      [phaseKey('toa-akkha', AKKHA_FINAL_STAND_PHASE)]: 5,
    });
    const e = encounterTime('toa-akkha', kit, timeA());
    expect(e.phases.slice(0, 3).map((p) => Math.round(p.damage))).toEqual([2208, 2208, 1104]);
    e.phases.slice(0, 3).forEach((p) => expect(p.seconds).toBeCloseTo(36.8));
    expect(e.seconds).toBeCloseTo(3 * 36.8 + 3880 / 60 + 1104 / 30);
  });

  test('team-DPS multiplier: an override replaces the party size (3 players → twice the 6-player time)', () => {
    const kit = toyKit({ 'toa-zebak': 10 });
    const six = encounterTime('toa-zebak', kit, timeA()).seconds;
    const three = encounterTime('toa-zebak', kit, timeA('none', settings, { ...A, teamDpsMultiplier: 3 })).seconds;
    expect(six).toBeCloseTo(8000 / 60);
    expect(three).toBeCloseTo(2 * six);
  });

  test('raid level 300 shortens every encounter (less hp)', () => {
    const kit = toyKit(Object.fromEntries(TOA_TARGETS.map((t) => [t.key, 10])));
    const at = (lvl: number) => encounterTime('toa-zebak', kit, timeA('none', settings, withToa({ invocationLevel: lvl }))).seconds;
    expect(at(300)).toBeLessThan(at(500));
  });
});

otherRaidsDescribe('ToA search and planner', () => {
  test('Search on Zebak (Team drains) returns a sensible top row: ≥ the best preset, ranged or magic, with a TTK', () => {
    const r = runGearSearch(generateEmptyPlayer(), { targetKey: 'toa-zebak', drain: 'team' }, A, { topN: 5 });
    expect(r.cancelled).toBe(false);
    expect(r.rows.length).toBeGreaterThan(0);
    const top = r.rows[0];
    expect(top.dps).toBeGreaterThanOrEqual(r.bestPreset!.dps);
    expect(top.dps).toBeGreaterThan(5);
    expect(top.dps).toBeLessThan(25);
    expect(['ranged', 'magic']).toContain(top.group);
    expect(top.ttk).toBeGreaterThan(0);
    // drains reach Zebak's floor (50) with the default carriers
    expect(r.drain.defAfter).toBe(50);
    // salts, not super combat: the search uses the ToA presets
    expect(r.bestPreset).not.toBeNull();
  }, 60000);

  test('Search on Kephri (Shielded) finds a stab weapon (kalphite: keris / fang)', () => {
    const r = runGearSearch(generateEmptyPlayer(), { targetKey: 'toa-kephri-shielded', drain: 'none' }, A, { topN: 3 });
    expect(r.rows[0].style.type).toBe('stab');
    expect(r.rows[0].weaponLabel).toMatch(/Keris|fang/);
  }, 60000);

  test('planner on ToA with a reduced pool: six routes (phase 38c), fits in 28 slots, melee for the final stand, magic for P2', () => {
    const res = plan({
      basePlayer: generateEmptyPlayer(),
      assumptions: A,
      drain: 'team',
      settings: TOMBS_OF_AMASCUT_RAID.defaultTimeSettings,
      route: 'all',
      pinned: DEFAULT_PINNED_NAMES.map((n) => planItemByName(n).id),
      nonItemSlots: 1,
      supplies: TOA_DEFAULT_SUPPLIES,
    }, {
      model: TOMBS_OF_AMASCUT_RAID.time,
      presets: TOA_PRESETS.filter((p) => ['Osmumten\'s fang (Torva)', 'Tumeken\'s shadow (Ancestral)', 'Twisted bow (Masori)'].includes(p.name)),
      search: { weapons: ['Osmumten\'s fang', 'Tumeken\'s shadow', 'Twisted bow'], maxPasses: 1 },
      perGroupWeapons: 1,
      perWeapon: 1,
      seeds: 4,
    });
    expect(res.cancelled).toBe(false);
    expect(res.comparison!.routes.length).toBe(6);
    const route = res.comparison!.routes[res.planned];
    expect(Number.isFinite(route.seconds)).toBe(true);
    expect(res.slots!.used).toBeLessThanOrEqual(28);
    expect(res.inventory.length).toBe(28);
    const akkha = route.encounters.find((e) => e.id.startsWith('toa-akkha'))!;
    const final = akkha.phases.find((p) => p.phase === AKKHA_FINAL_STAND_PHASE)!;
    expect(final.choice?.group).toBe('melee');
    const wardens = route.encounters.find((e) => e.id === 'toa-wardens')!;
    expect(wardens.phases.find((p) => p.key === 'wardens-p2-shield')!.choice?.group).toBe('magic');
    expect(route.seconds).toBeCloseTo(route.encounters.reduce((t, e) => t + e.seconds, 0));
  }, 300000);
});
