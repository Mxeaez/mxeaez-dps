import { describe, expect, test } from '@jest/globals';
import {
  compareRoutes,
  computeRouteComparison,
  createKitEvaluator,
  encounterTime,
  enumerateRoutes,
  formatDuration,
  KitChoice,
  partyHpFactor,
  PhaseQuery,
  phaseKey,
  presetKitLoadout,
  RAID_TIME_DEFAULTS,
  raidTime,
  RaidKit,
  RaidTimeAssumptions,
  RaidTimeSettings,
  requiredPhaseTargets,
  ROUTE_SLOTS,
  targetHp,
} from '@/lib/fracturedArchive/raidTime';
import {
  BORK_PHASES,
  BORK_STUNNED_PHASE,
  DAGONHAI_SHIELDED_PHASE,
  OCELLUS_P1_PHASES,
  OCELLUS_P1_WALKING_PHASE,
  OCELLUS_P3_DEFLECT_MELEE_PHASE,
  OCELLUS_P3_DEFLECT_RANGED_PHASE,
  OCELLUS_P3_PHASES,
} from '@/lib/fracturedArchive/constants';
import { FRACTURED_ARCHIVE_HP_SCALING } from '@/lib/scaling/FracturedArchive';
import {
  buildTargetMonster, evaluateLoadout, findTarget, presetStyles, resolvePresetEquipment,
} from '@/lib/fracturedArchive/bestSetup';
import { DEFAULT_ASSUMPTIONS, PRESETS } from '@/lib/fracturedArchive/presets';
import { generateEmptyPlayer } from '@/state';
import { SearchRow } from '@/lib/fracturedArchive/search';

// Phase 16: raid time model (src/lib/fracturedArchive/raidTime.ts). Hand-computed seconds with toy kits of known DPS.

const P1 = OCELLUS_P1_PHASES[0];
const P3 = OCELLUS_P3_PHASES[0];

/** DPS per phase key; anything missing = 0 (can't hit). */
const BASE_DPS: Record<string, number> = {
  [phaseKey('ag-flying')]: 8,
  [phaseKey('ag-grounded')]: 11,
  [phaseKey('bork', BORK_PHASES[0])]: 10,
  [phaseKey('bork', BORK_PHASES[1])]: 9,
  [phaseKey('bork', BORK_PHASES[2])]: 8,
  [phaseKey('bork', BORK_PHASES[3])]: 6,
  [phaseKey('bork', BORK_STUNNED_PHASE)]: 15,
  [phaseKey('smorks')]: 12,
  [phaseKey('ezekiel')]: 10,
  [phaseKey('moia')]: 5,
  [phaseKey('dreadnoth')]: 14,
  [phaseKey('xarth')]: 13,
  [phaseKey('dagonhai', DAGONHAI_SHIELDED_PHASE)]: 10,
  [phaseKey('ocellus-p1', P1)]: 10,
  [phaseKey('ocellus-p1', OCELLUS_P1_WALKING_PHASE)]: 4,
  [phaseKey('ocellus-p2')]: 10,
  [phaseKey('ocellus-p3', P3)]: 12,
  [phaseKey('ocellus-p3', OCELLUS_P3_DEFLECT_MELEE_PHASE)]: 7,
  [phaseKey('ocellus-p3', OCELLUS_P3_DEFLECT_RANGED_PHASE)]: 9,
};

interface ToyKit extends RaidKit {
  queries: PhaseQuery[];
}

/** A kit with fixed DPS per phase; `drainBonus` multiplies DPS when a drain state other than None is asked for. */
const toyKit = (dps: Record<string, number> = BASE_DPS, drainBonus = 1): ToyKit => {
  const queries: PhaseQuery[] = [];
  return {
    queries,
    best: (q): KitChoice => {
      queries.push(q);
      const d = (dps[phaseKey(q.targetKey, q.phase)] ?? 0) * (q.drain === 'none' ? 1 : drainBonus);
      return { loadout: 'toy', style: 'toy', dps: d };
    },
  };
};

const assume = (settings: Partial<RaidTimeSettings> = {}, drain: RaidTimeAssumptions['drain'] = 'none', partySize = 6): RaidTimeAssumptions => ({
  partySize, drain, settings: { ...RAID_TIME_DEFAULTS, ...settings }, fallbackFightSeconds: 90,
});

describe('Raid time: routes', () => {
  test('8 routes: AG first, Ocellus last, one of each pair in between', () => {
    const routes = enumerateRoutes();
    expect(routes).toHaveLength(8);
    expect(new Set(routes.map((r) => r.id)).size).toBe(8);
    for (const r of routes) {
      expect(r.encounters).toHaveLength(5);
      expect(r.encounters[0]).toBe('archive-guardian');
      expect(['ezekiel', 'bork-smorks']).toContain(r.encounters[1]);
      expect(['moia', 'dreadnoth']).toContain(r.encounters[2]);
      expect(['dagonhai', 'xarth']).toContain(r.encounters[3]);
      expect(r.encounters[4]).toBe('ocellus');
    }
    expect(routes[0].id).toBe('archive-guardian>ezekiel>moia>dagonhai>ocellus');
    expect(routes[7].id).toBe('archive-guardian>bork-smorks>dreadnoth>xarth>ocellus');
    // enumerated from the slot data, not hardcoded
    expect(enumerateRoutes([...ROUTE_SLOTS, { order: 6, options: ['xarth', 'moia'] }])).toHaveLength(16);
  });

  test('infobox hp as the calculator scales it', () => {
    expect(targetHp('ag-flying', undefined, 6)).toBe(550);
    expect(targetHp('bork', BORK_PHASES[0], 6)).toBe(1500);
    expect(targetHp('smorks', undefined, 6)).toBe(600);
    expect(targetHp('dagonhai', DAGONHAI_SHIELDED_PHASE, 6)).toBe(640);
    expect(targetHp('ocellus-p1', P1, 6)).toBe(2500);
    expect(targetHp('ocellus-p3', P3, 6)).toBe(5250);
    expect(partyHpFactor(6)).toBe(1);
  });
});

describe('Raid time: encounters (toy kit, hand-computed)', () => {
  const kit = toyKit();

  test('single-phase bosses: hp ÷ DPS', () => {
    const a = assume();
    expect(encounterTime('ezekiel', kit, a).seconds).toBeCloseTo(3000 / 10, 9);
    expect(encounterTime('moia', kit, a).seconds).toBeCloseTo(785 / 5, 9);
    expect(encounterTime('dreadnoth', kit, a).seconds).toBeCloseTo(2100 / 14, 9);
    expect(encounterTime('xarth', kit, a).seconds).toBeCloseTo(2600 / 13, 9);
  });

  test('Dagon\'hai: 5 × 640 + 7 = 3207 at Shielded DPS', () => {
    const e = encounterTime('dagonhai', kit, assume());
    expect(e.phases).toHaveLength(1);
    expect(e.phases[0].damage).toBe(3207);
    expect(e.phases[0].phase).toBe(DAGONHAI_SHIELDED_PHASE);
    expect(e.seconds).toBeCloseTo(320.7, 9);
  });

  test('Archive Guardian: shield 1490 + 70% grounded + 30% flying', () => {
    const e = encounterTime('archive-guardian', kit, assume());
    expect(e.phases.map((p) => [p.key, p.damage])).toEqual([
      ['ag-shield', 1490], ['ag-grounded', 385], ['ag-flying', 165],
    ]);
    expect(e.seconds).toBeCloseTo(1490 / 8 + 385 / 11 + 165 / 8, 9);
    // settings move it
    const e2 = encounterTime('archive-guardian', kit, assume({ agShieldHp: 1000, agGroundedFraction: 0.5 }));
    expect(e2.seconds).toBeCloseTo(1000 / 8 + 275 / 11 + 275 / 8, 9);
  });

  test('Bork + Smorks killed evenly: four quarters at armour 8/10/12/14 + Smorks 600', () => {
    const e = encounterTime('bork-smorks', kit, assume());
    expect(e.phases.map((p) => p.damage)).toEqual([375, 375, 375, 375, 600]);
    expect(e.seconds).toBeCloseTo(375 / 10 + 375 / 9 + 375 / 8 + 375 / 6 + 600 / 12, 9);
  });

  test('Bork stun uptime moves that share of Bork\'s damage to the Stunned option', () => {
    const e = encounterTime('bork-smorks', kit, assume({ borkStunUptime: 0.2 }));
    expect(e.phases.map((p) => p.damage)).toEqual([300, 300, 300, 300, 300, 600]);
    expect(e.phases[4].phase).toBe(BORK_STUNNED_PHASE);
    expect(e.seconds).toBeCloseTo(300 / 10 + 300 / 9 + 300 / 8 + 300 / 6 + 300 / 15 + 600 / 12, 9);
  });

  test('Ocellus defaults: P1 2500 at a corner, P3 75% at quadrants 1-3, 25% at the worse Deflect', () => {
    const e = encounterTime('ocellus', kit, assume());
    expect(e.phases.map((p) => p.key)).toEqual(['ocellus-p1', 'ocellus-p3', 'ocellus-p3-last']);
    const last = e.phases[2];
    expect(last.phase).toBe(OCELLUS_P3_DEFLECT_MELEE_PHASE); // 7 < 9: the deflect that hurts this kit most
    expect(e.seconds).toBeCloseTo(2500 / 10 + 3937.5 / 12 + 1312.5 / 7, 9);
    // a kit whose ranged side is worse gets Deflect Ranged
    const kit2 = toyKit({ ...BASE_DPS, [phaseKey('ocellus-p3', OCELLUS_P3_DEFLECT_RANGED_PHASE)]: 5 });
    expect(encounterTime('ocellus', kit2, assume()).phases[2].phase).toBe(OCELLUS_P3_DEFLECT_RANGED_PHASE);
  });

  test('Ocellus P2: fixed duration, 50% of the Blade damage comes off P3; walking fraction', () => {
    const e = encounterTime('ocellus', kit, assume({ ocellusP2Seconds: 30, ocellusWalkingFraction: 0.1 }));
    const p2 = e.phases.find((p) => p.key === 'ocellus-p2')!;
    expect(p2.damage).toBe(300); // 10 DPS × 30 s
    expect(p2.seconds).toBe(30);
    const p3 = 5250 - 150;
    expect(e.phases.find((p) => p.key === 'ocellus-p3')!.damage).toBeCloseTo(p3 * 0.75, 9);
    expect(e.seconds).toBeCloseTo(2250 / 10 + 250 / 4 + 30 + (p3 * 0.75) / 12 + (p3 * 0.25) / 7, 9);
  });

  test('a phase nothing in the kit can hit makes the encounter infinite', () => {
    const noRanged = toyKit({ ...BASE_DPS, [phaseKey('ag-flying')]: 0 });
    expect(encounterTime('archive-guardian', noRanged, assume()).seconds).toBe(Infinity);
    expect(formatDuration(Infinity)).toBe('∞');
    expect(formatDuration(245.3)).toBe('4:05.3');
  });
});

describe('Raid time: drains and routes', () => {
  test('drains are planned per encounter with the first pass\'s length', () => {
    const kit = toyKit(BASE_DPS, 2);
    const e = encounterTime('ezekiel', kit, assume({}, 'team'));
    expect(e.drainFightSeconds).toBe(300); // undrained 3000 / 10
    expect(e.seconds).toBeCloseTo(150, 9); // drained DPS doubled
    const drained = kit.queries.filter((q) => q.drain === 'team');
    expect(drained).toHaveLength(1);
    expect(drained[0].fightSeconds).toBe(300);
    // a different encounter gets its own length
    const x = encounterTime('xarth', kit, assume({}, 'team'));
    expect(x.drainFightSeconds).toBe(200);
    // None: one pass, no fight length
    expect(encounterTime('ezekiel', kit, assume({}, 'none')).drainFightSeconds).toBeUndefined();
  });

  test('route total = Σ encounters; fastest = argmin', () => {
    const kit = toyKit();
    const a = assume();
    const cmp = compareRoutes(kit, a);
    expect(cmp.routes).toHaveLength(8);
    for (const r of cmp.routes) {
      const sum = r.route.encounters.reduce((t, id) => t + encounterTime(id, kit, a).seconds, 0);
      expect(r.seconds).toBeCloseTo(sum, 9);
      expect(r.seconds).toBeGreaterThan(0);
    }
    const min = Math.min(...cmp.routes.map((r) => r.seconds));
    expect(cmp.routes[cmp.fastest].seconds).toBe(min);
    // with this kit: Bork+Smorks 238.2 < Ezekiel 300, Dreadnoth 150 < Moia 157, Xarth 200 < Dagon'hai 320.7
    expect(cmp.routes[cmp.fastest].route.encounters).toEqual(['archive-guardian', 'bork-smorks', 'dreadnoth', 'xarth', 'ocellus']);
    // raidTime for one route = the same number
    expect(raidTime(cmp.routes[3].route, kit, a).seconds).toBeCloseTo(cmp.routes[3].seconds, 9);
  });

  test('monotonic: a strictly better loadout never increases any route time', () => {
    const a = assume({ borkStunUptime: 0.3, ocellusP2Seconds: 20, ocellusWalkingFraction: 0.1 });
    const base = compareRoutes(toyKit(), a);
    for (const key of Object.keys(BASE_DPS)) {
      const better = compareRoutes(toyKit({ ...BASE_DPS, [key]: BASE_DPS[key] * 1.5 }), a);
      better.routes.forEach((r, i) => expect(r.seconds).toBeLessThanOrEqual(base.routes[i].seconds + 1e-9));
      // and it strictly helps some route (P2 is a fixed duration but carries more to P3); Deflect Ranged is not the
      // binding deflect for this kit (7 < 9), so improving it changes nothing
      if (key !== phaseKey('ocellus-p3', OCELLUS_P3_DEFLECT_RANGED_PHASE)) expect(better.routes.some((r, i) => r.seconds < base.routes[i].seconds - 1e-9)).toBe(true);
    }
  });

  test('party-size hook: the hp table scales every figure, the AG shield relative to 6', () => {
    const saved = FRACTURED_ARCHIVE_HP_SCALING[7];
    try {
      FRACTURED_ARCHIVE_HP_SCALING[7] = [3, 2];
      const kit = toyKit();
      expect(encounterTime('xarth', kit, assume({}, 'none', 7)).seconds).toBeCloseTo(3900 / 13, 9);
      const ag = encounterTime('archive-guardian', kit, assume({}, 'none', 7));
      expect(ag.phases[0].damage).toBeCloseTo(1490 * 1.5, 9);
      expect(encounterTime('dagonhai', kit, assume({}, 'none', 7)).phases[0].damage).toBe(5 * 960 + 7);
    } finally {
      FRACTURED_ARCHIVE_HP_SCALING[7] = saved;
    }
  });

  test('required phase targets follow the settings', () => {
    const keys = (s: Partial<RaidTimeSettings>) => requiredPhaseTargets({ ...RAID_TIME_DEFAULTS, ...s }).map((t) => phaseKey(t.targetKey, t.phase));
    const d = keys({});
    expect(d).toContain(phaseKey('ag-flying'));
    expect(d).toContain(phaseKey('ocellus-p3', OCELLUS_P3_DEFLECT_RANGED_PHASE));
    expect(d).not.toContain(phaseKey('bork', BORK_STUNNED_PHASE));
    expect(d).not.toContain(phaseKey('ocellus-p2'));
    expect(keys({ borkStunUptime: 0.1, ocellusP2Seconds: 10 })).toEqual(expect.arrayContaining([
      phaseKey('bork', BORK_STUNNED_PHASE), phaseKey('ocellus-p2'),
    ]));
  });
});

describe('Raid time: real kit (presets)', () => {
  const base = generateEmptyPlayer();
  const presetKit = (names: string[]) => createKitEvaluator(
    PRESETS.filter((p) => names.includes(p.name)).map((p) => presetKitLoadout(base, p, DEFAULT_ASSUMPTIONS)),
    DEFAULT_ASSUMPTIONS,
  );

  test('DPS per phase = the calculator\'s for the best style; time = hp ÷ that', () => {
    const kit = presetKit(['Inquisitor\'s + Obligator']);
    const e = encounterTime('xarth', kit, assume());
    const { monster } = buildTargetMonster(findTarget('xarth'), undefined, 'none', DEFAULT_ASSUMPTIONS);
    const preset = PRESETS.find((p) => p.name === 'Inquisitor\'s + Obligator')!;
    const loadout = presetKitLoadout(base, preset, DEFAULT_ASSUMPTIONS);
    const best = Math.max(...loadout.options.map((o) => evaluateLoadout(loadout.toPlayer(monster, o), monster, false).dps));
    expect(e.phases[0].dps).toBeCloseTo(best, 9);
    expect(e.seconds).toBeCloseTo(2600 / best, 6);
    // melee can't hit AG while flying: infinite with a melee-only kit
    expect(encounterTime('archive-guardian', kit, assume()).seconds).toBe(Infinity);
  });

  test('adding loadouts never increases a route time; Team drains never slower than None', () => {
    const small = presetKit(['Inquisitor\'s + Obligator', 'Twisted bow (Masori)']);
    const big = presetKit(['Inquisitor\'s + Obligator', 'Twisted bow (Masori)', 'Tumeken\'s shadow (Ancestral)']);
    const a = assume();
    const s = compareRoutes(small, a);
    const b = compareRoutes(big, a);
    s.routes.forEach((r, i) => {
      expect(Number.isFinite(r.seconds)).toBe(true);
      expect(b.routes[i].seconds).toBeLessThanOrEqual(r.seconds + 1e-9);
    });
    const team = compareRoutes(big, assume({}, 'team'));
    team.routes.forEach((r, i) => expect(r.seconds).toBeLessThan(b.routes[i].seconds));
    // the AG shield is shot with ranged or magic, never melee
    expect(team.routes[0].encounters[0].phases[0].choice!.group).not.toBe('melee');
    expect(team.routes[0].encounters[0].phases[0].choice!.drain).toMatch(/first round/);
    expect(big.evaluations()).toBeGreaterThan(0);
  });
});

describe('Raid time: Routes tab computation', () => {
  const base = generateEmptyPlayer();
  const obligator = PRESETS.find((p) => p.name === 'Inquisitor\'s + Obligator')!;
  const row: SearchRow = {
    group: 'melee',
    weaponLabel: 'Obligator',
    equipment: Object.fromEntries(Object.entries(resolvePresetEquipment(obligator))
      .map(([slot, p]) => [slot, { id: p!.id, name: p!.name, version: p!.version }])),
    style: presetStyles(obligator)[0],
    spell: null,
    styleLabel: 'Thrust',
    seed: 'test',
    dps: 1,
    ttk: null,
    maxHit: 0,
    accuracy: 0,
  };

  test('cached per-phase search rows are used (no search), presets join the kit', () => {
    const searchBest = Object.fromEntries(requiredPhaseTargets(RAID_TIME_DEFAULTS)
      .map((t) => [phaseKey(t.targetKey, t.phase), { melee: row }]));
    const req = {
      basePlayer: base,
      assumptions: DEFAULT_ASSUMPTIONS,
      drain: 'none' as const,
      settings: RAID_TIME_DEFAULTS,
      kit: { searchGroups: ['melee' as const], presets: [], players: [] },
      searchBest,
    };
    const melee = computeRouteComparison(req);
    expect(melee.searches).toBe(0);
    expect(melee.fastest).toBe(-1); // melee can't hit AG while flying
    const ag = melee.routes[0].encounters[0];
    expect(ag.phases.find((p) => p.key === 'ag-grounded')!.choice!.loadout).toBe('Best melee (search): Obligator');
    expect(ag.phases.find((p) => p.key === 'ag-shield')!.seconds).toBe(Infinity);

    const withBow = computeRouteComparison({ ...req, kit: { ...req.kit, presets: ['Twisted bow (Masori)'] } });
    expect(withBow.fastest).toBeGreaterThanOrEqual(0);
    expect(withBow.routes[0].encounters[0].phases[0].choice!.loadout).toBe('Twisted bow (Masori)');
    // a calculator loadout (the Obligator player itself) gives the same times as the search row
    const calcPlayer = { ...base, name: 'Calc Obligator', ...{ equipment: { ...base.equipment, ...resolvePresetEquipment(obligator) }, style: row.style } };
    const calc = computeRouteComparison({ ...req, kit: { searchGroups: [], presets: [], players: [calcPlayer] } });
    expect(calc.routes[1].encounters[1].phases[0].choice!.loadout).toBe('Calc Obligator');
    expect(calc.routes[1].encounters[1].seconds).toBeGreaterThan(melee.routes[1].encounters[1].seconds); // no potion / prayer
  });
});
