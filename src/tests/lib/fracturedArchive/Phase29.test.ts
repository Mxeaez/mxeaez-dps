import { describe, expect, test } from '@jest/globals';
import { generateEmptyPlayer } from '@/state';
import { buildTargetMonster, drainStateFor, findTarget } from '@/lib/fracturedArchive/bestSetup';
import { countText, neededText } from '@/lib/fracturedArchive/drainLine';
import {
  DEFAULT_SPEC_MODE, plan, planItemByName, PlanInputs, PlanResult, PlanTuning, SPEC_MODES,
} from '@/lib/fracturedArchive/planner';
import { DEFAULT_ASSUMPTIONS, PresetDef } from '@/lib/fracturedArchive/presets';
import {
  allSubsets,
  assignMe,
  AUTO_AYAK_SPECS,
  bringText,
  mostNeededWeapon,
  mySpecsForSubset,
  RoleTarget,
  searchSpecSubsets,
  SHARE_MAX_SLOT_SECONDS,
  subsetOfMySpecs,
  teamRoles,
  weaponDeltaText,
} from '@/lib/fracturedArchive/specChoice';
import { drainModel } from '@/lib/fracturedArchive/specs';
import {
  ayakOutcome, ayakSpecsToThreshold, neededSpecs, recommendCarriers, soloSpecPlan,
} from '@/lib/fracturedArchive/teamSpecs';
import { FRACTURED_ARCHIVE_RAID } from '@/lib/raids';

// Phase 29: the planner decides the spec weapons — Solo subset search, Team roles ("team briefing"), your share
// ("assign me"), Eye of Ayak only with a magic loadout / mages, the Team drain line "needed ×2 (4 hits) · team brings ×4".
// Docs: docs/BEST_SETUP.md, *Spec weapons (phase 29)*.

const A = DEFAULT_ASSUMPTIONS;
const undrained = (key: string, phase?: string) => buildTargetMonster(findTarget(key), phase, 'none', A).monster;
const roleTarget = (key: string): RoleTarget => ({ key, label: findTarget(key).label, model: drainModel(undrained(key), A) });

describe('Solo subset search (toy)', () => {
  // 3 weapons, 2 encounters (100 s each). Encounter 1: A saves 30 s, B 20 s, both 35 s (overlapping drains);
  // encounter 2: C saves 3 s. One free slot; every spec slot beyond it costs 10 s of gear.
  type W = 'A' | 'B' | 'C';
  const saves = (s: W[]) => {
    const e1 = { A: 30, B: 20, AB: 35 }[(['A', 'B'] as W[]).filter((w) => s.includes(w)).join('')] ?? 0;
    return e1 + (s.includes('C') ? 3 : 0);
  };
  const time = (s: W[]) => 200 - saves(s) + Math.max(0, s.length - 1) * 10;
  // hand-computed: {} 200, {A} 170, {B} 180, {C} 197, {A,B} 175, {A,C} 177, {B,C} 187, {A,B,C} 182 → {A}
  const toy = (extra: Partial<Parameters<typeof searchSpecSubsets<W>>[0]> = {}) => searchSpecSubsets<W>({
    weapons: ['A', 'B', 'C'],
    signature: (s) => s.join('+'),
    slots: (s) => s.length,
    quick: time,
    ...extra,
  });

  test('finds the hand-computed optimum and each weapon\'s Δ', () => {
    expect(allSubsets(['A', 'B', 'C']).length).toBe(8);
    const r = toy();
    expect(r.best).toEqual(['A']);
    expect(r.seconds).toBe(170);
    expect(r.signatures).toBe(8);
    const d = Object.fromEntries(r.perWeapon.map((x) => [x.weapon, x]));
    expect(d.A).toMatchObject({ chosen: true, deltaSeconds: 30, deltaSlots: 1 }); // {} 200 − {A} 170
    expect(d.B).toMatchObject({ chosen: false, deltaSeconds: -5, deltaSlots: 1 }); // {A} 170 − {A,B} 175
    expect(d.C).toMatchObject({ chosen: false, deltaSeconds: -7, deltaSlots: 1 }); // {A} 170 − {A,C} 177
    expect(r.bestRejected?.weapon).toBe('B');
  });

  test('two free slots: A + B (175 → 165) beats A alone (170)', () => {
    const t2 = (s: ('A' | 'B' | 'C')[]) => 200 - saves(s) + Math.max(0, s.length - 2) * 10;
    // {A,B} 165, {A,C} 167, {A,B,C} 172, {A} 170
    const r = searchSpecSubsets<W>({
      weapons: ['A', 'B', 'C'], signature: (s) => s.join('+'), slots: (s) => s.length, quick: t2,
    });
    expect(r.best).toEqual(['A', 'B']);
    expect(r.perWeapon.find((x) => x.weapon === 'B')).toMatchObject({ chosen: true, deltaSeconds: 5 });
    expect(r.bestRejected).toMatchObject({ weapon: 'C', deltaSeconds: -7 }); // {A,B} 165 − {A,B,C} 172
  });

  test('same drain state = one candidate (the one with fewer slots); a useless weapon is never brought', () => {
    // D changes nothing: {X} and {X, D} share a signature
    type W4 = W | 'D';
    const r = searchSpecSubsets<W4>({
      weapons: ['A', 'B', 'C', 'D'],
      signature: (s) => s.filter((w) => w !== 'D').join('+'),
      slots: (s) => s.length,
      quick: (s) => time(s.filter((w) => w !== 'D') as W[]) + (s.includes('D') ? 10 : 0),
    });
    expect(r.signatures).toBe(8);
    expect(r.best).toEqual(['A']);
    expect(r.perWeapon.find((x) => x.weapon === 'D')).toMatchObject({ chosen: false, deltaSeconds: -10 });
  });

  test('quick ranks, full decides among the finalists; dominated subsets are not timed', () => {
    // quick overstates {A} by 8 s: it ranks 3rd ({A,B} 175, {A,C} 177, {A} 178) and still wins on its full time
    const r = toy({ quick: (s) => time(s) + (s.join('') === 'A' ? 8 : 0), full: time, finalists: 3 });
    expect(r.best).toEqual(['A']);
    expect(r.seconds).toBe(170);
    // with one finalist the quick ranking decides
    expect(toy({ quick: (s) => time(s) + (s.join('') === 'A' ? 8 : 0), full: time, finalists: 1 }).best).toEqual(['A', 'B']);
    // dominance: C alone is dominated by A (same slots, never faster)
    const timed: string[] = [];
    toy({
      quick: (s) => { timed.push(s.join('')); return time(s); },
      dominated: (s, by) => s.join('') === 'C' && by.join('') === 'A',
    });
    expect(timed).not.toContain('C');
    expect(timed).toContain('A');
  });

  test('texts', () => {
    expect(bringText(['tonalztics', 'elderMaul'])).toBe('Bring: Elder maul, Tonalztics');
    expect(bringText([])).toBe('Bring: no spec weapons');
    expect(weaponDeltaText({
      weapon: 'tonalztics', chosen: false, deltaSeconds: 4, deltaSlots: 1,
    })).toBe('Tonalztics would save 4.0 s for 1 slot');
    expect(weaponDeltaText({
      weapon: 'elderMaul', chosen: true, deltaSeconds: 35.24, deltaSlots: 1,
    })).toBe('Elder maul saves 35.2 s for 1 slot');
  });

  test('a subset as "Specs I bring": Ayak until magic def 0, Defence drains first, the Lightbearer flag kept', () => {
    const m = mySpecsForSubset(['elderMaul', 'ayak'], { lightbearer: true });
    expect(m).toEqual({
      elderMaul: true, dwh: false, bgs: false, tonalztics: false, ayak: AUTO_AYAK_SPECS, ayakAuto: true, lightbearer: true, priority: 'defence',
    });
    expect(subsetOfMySpecs(m)).toEqual(['elderMaul', 'ayak']);
    expect(subsetOfMySpecs(A.mySpecs)).toEqual(['elderMaul', 'ayak']);
  });
});

describe('Ayak specs until magic def 0', () => {
  test('ayakSpecsToThreshold = the fewest specs with P(0) ≥ threshold; the Solo plan stops there', () => {
    const model = drainModel(undrained('xarth'), A);
    expect(model.magicDef).toBeGreaterThan(0);
    const n = ayakSpecsToThreshold(model, 10, 0.95);
    expect(n).toBeGreaterThan(0);
    if (n < 10) {
      expect(ayakOutcome(model, n, 0.95).pZero).toBeGreaterThanOrEqual(0.95);
      expect(n === 1 || ayakOutcome(model, n - 1, 0.95).pZero < 0.95).toBe(true);
    }
    const base = {
      carried: {
        elderMaul: false, dwh: false, tonalztics: false, bgs: false,
      },
      ayakSpecs: 10,
      lightbearer: true,
      fightSeconds: 600,
      threshold: 0.95,
    };
    expect(soloSpecPlan(model, { ...base, ayakUntilZero: true }).ayakAttempts).toBe(Math.min(n, soloSpecPlan(model, base).ayakAttempts));
  });
});

describe('Team roles (team briefing)', () => {
  const ag = roleTarget('ag-flying');
  const bork = roleTarget('bork');
  const roles = teamRoles([ag, bork], { partySize: 6, mages: 0, threshold: 0.95 });

  test('per boss = the carriers table\'s minimum: AG Flying 2 Tonalztics, Bork 2 Elder maul', () => {
    const recAg = recommendCarriers(ag.model, { partySize: 6, threshold: 0.95 });
    const recBork = recommendCarriers(bork.model, { partySize: 6, threshold: 0.95 });
    expect(roles.perTarget[0].carriers).toEqual(recAg.best!.carriers);
    expect(roles.perTarget[1].carriers).toEqual(recBork.best!.carriers);
    expect(recAg.best!.carriers).toEqual({ tonalztics: 2 });
    expect(recBork.best!.carriers).toEqual({ elderMaul: 2 });
  });

  test('per weapon the most any boss needs, with the bosses that drive it; no Ayak without mages', () => {
    expect(roles.rows.map((r) => [r.weapon, r.carriers, r.drivers])).toEqual([
      ['elderMaul', 2, ['Bork']],
      ['tonalztics', 2, ['Archive Guardian (Flying)']],
    ]);
    expect(roles.text).toBe('6-man: 2 Elder maul, 2 Tonalztics');
    expect(roles.rows.some((r) => r.weapon === 'ayak')).toBe(false);
  });

  test('Eye of Ayak carriers only with mages in the party', () => {
    const withMage = teamRoles([ag, bork], { partySize: 6, mages: 1, threshold: 0.95 });
    const ayak = withMage.rows.find((r) => r.weapon === 'ayak');
    expect(ayak).toBeDefined();
    const per = withMage.perTarget.map((n) => n.ayak ?? 0);
    expect(ayak!.carriers).toBe(Math.max(...per));
    // the count reaches P(magic def 0) ≥ 95% from the first round (2 specs each) on the boss that drives it
    const driver = withMage.perTarget.find((n) => n.ayak === ayak!.carriers)!;
    const model = driver.key === 'ag-flying' ? ag.model : bork.model;
    expect(ayakOutcome(model, ayak!.carriers * 2, 0.95).pZero).toBeGreaterThanOrEqual(0.95);
  });

  test('a boss already at its floor needs nobody; a weapon nobody needs gets 0 (not listed)', () => {
    const atFloor: RoleTarget = { ...ag, label: 'drained', model: { ...ag.model, def: ag.model.floor } };
    const r = teamRoles([atFloor], { partySize: 6, mages: 0 });
    expect(r.rows).toEqual([]);
    expect(r.perTarget[0].note).toBe('already at the Defence floor');
    expect(r.text).toBe('6-man: no spec carriers needed');
  });

  test('most-needed weapon: most carriers, ties in the order Elder maul, Tonalztics, DWH, BGS, Ayak', () => {
    expect(mostNeededWeapon(roles)).toBe('elderMaul');
    expect(mostNeededWeapon(roles, (w) => w !== 'elderMaul')).toBe('tonalztics');
    expect(mostNeededWeapon({ ...roles, rows: [] })).toBeNull();
  });
});

describe('your share ("assign me")', () => {
  test('carried anyway, a free slot, or a slot worth < 1 s of gear → carry; else a teammate carries it', () => {
    expect(SHARE_MAX_SLOT_SECONDS).toBe(1);
    expect(assignMe({ weapon: null, carriedAnyway: false, freeSlots: 3 })).toMatchObject({ weapon: null, carry: false });
    expect(assignMe({ weapon: 'elderMaul', carriedAnyway: true, freeSlots: 0 }).carry).toBe(true);
    expect(assignMe({ weapon: 'elderMaul', carriedAnyway: false, freeSlots: 1 }).carry).toBe(true);
    expect(assignMe({
      weapon: 'elderMaul', carriedAnyway: false, freeSlots: 0, slotValueSeconds: 0.4,
    }).carry).toBe(true);
    const no = assignMe({
      weapon: 'tonalztics', carriers: 2, carriedAnyway: false, freeSlots: 0, slotValueSeconds: 3.2,
    });
    expect(no.carry).toBe(false);
    expect(no.reason).toBe('none: your last slot is worth 3.2 s as gear — let a teammate carry Tonalztics (most needed: 2 carriers)');
  });
});

describe('Team drain line: "needed ×2 (4 hits) · team brings ×4"', () => {
  test('AG Flying (2 Elder maul + 2 Tonalztics + 1 Ayak carriers; melee can\'t hit): Tonalztics needed 2 specs, team brings 4', () => {
    const d = drainStateFor(undrained('ag-flying'), 'team', A);
    const tona = d.line!.items.find((i) => i.weapon === 'tonalztics')!;
    expect(tona.count).toBe(4);
    expect(tona.hits).toBe(8);
    expect(tona.needed).toBe(2);
    expect(neededText(tona)).toBe('needed ×2 (4 hits) · team brings ×4');
    expect(neededText({ ...tona, needed: 0 })).toBe('not needed · team brings ×4');
    expect(neededText({ ...tona, needed: null })).toBe('floor not reachable · team brings ×4');
    expect(tona.title.startsWith('needed ×2 (4 hits) · team brings ×4; ')).toBe(true);
    // the same as the deterministic Max-drain plan ("4 Tonalztics of Ralos" hits = 2 specs → Def 156)
    expect(neededSpecs(drainModel(undrained('ag-flying'), A), { tonalztics: 4 }).defence).toEqual({ tonalztics: 2 });
  });

  test('Solo shows Tonalztics as "×2 (4 hits)"', () => {
    expect(countText(2, 4)).toBe('×2 (4 hits)');
    expect(countText(3)).toBe('×3');
    const d = drainStateFor(undrained('ag-flying'), 'solo', {
      ...A,
      mySpecs: {
        ...A.mySpecs, elderMaul: false, tonalztics: true, ayak: 0,
      },
    });
    const tona = d.line!.items.find((i) => i.weapon === 'tonalztics')!;
    expect(tona.hits).toBe(tona.count * 2);
    expect(tona.needed).toBeUndefined();
    expect(neededText(tona)).toBeUndefined();
  });

  test('neededSpecs: fewest specs if every one lands, more of the earlier weapon on ties; null when unreachable', () => {
    const bork = drainModel(undrained('bork'), A);
    const n = neededSpecs(bork, { elderMaul: 4, tonalztics: 4 });
    expect(n.defence).not.toBeNull();
    // every landed combination of fewer specs stays above the floor
    const total = Object.values(n.defence!).reduce((t, v) => t + (v ?? 0), 0);
    expect(total).toBeGreaterThan(0);
    expect(neededSpecs({ ...bork, floor: 0 }, { elderMaul: 1 }).defence).toBeNull();
    expect(neededSpecs({ ...bork, def: bork.floor }, { elderMaul: 4 }).defence).toEqual({});
  });
});

// --- the planner (reduced pools) ------------------------------------------------------------------------------------

const FA = FRACTURED_ARCHIVE_RAID;
const preset = (name: string): PresetDef => {
  const p = FA.presets.find((x) => x.name === name);
  if (!p) throw new Error(`no preset ${name}`);
  return p;
};
const inputs = (patch: Partial<PlanInputs> = {}): PlanInputs => ({
  basePlayer: generateEmptyPlayer(),
  assumptions: FA.defaultAssumptions,
  drain: 'team',
  settings: FA.defaultTimeSettings,
  route: 'all',
  pinned: FA.planDefaults.pinned.map((n) => planItemByName(n).id),
  nonItemSlots: FA.planDefaults.nonItemSlots,
  supplies: FA.defaultSupplies,
  ...patch,
});
const reduced = (presets: PresetDef[], weapons: string[]): PlanTuning => ({
  model: FA.time,
  presets,
  search: { weapons, maxPasses: 1 },
  perGroupWeapons: 1,
  perWeapon: 1,
  bases: 1,
  partners: 1,
  seeds: 2,
});
const total = (r: PlanResult) => r.comparison!.routes[r.planned].seconds;
const MELEE_RANGED = reduced([preset('Twisted bow (Masori)'), preset("Inquisitor's mace (full crush)")], ['Twisted bow']);
const MAGIC = reduced([preset("Tumeken's shadow (Ancestral)")], ['Tumeken\'s shadow']);

describe('planner: spec modes', () => {
  test('the Plan tab defaults to "Planner decides"; plan() defaults to "Specs I bring"', () => {
    expect(DEFAULT_SPEC_MODE).toBe('auto');
    expect(SPEC_MODES.map((m) => m.label)).toEqual(['Planner decides', 'Specs I bring']);
    const r = plan(inputs(), MELEE_RANGED);
    expect(r.specs.mode).toBe('manual');
    expect(r.specs.bring).toEqual(['elderMaul', 'ayak']); // the default "Specs I bring"
    expect(r.specItems.map((x) => x.name)).toEqual(['Elder maul', 'Eye of Ayak']);
    expect(r.specs.share).toMatchObject({ manual: true, carry: false });
  }, 300000);

  test('Team, planner decides: the briefing on the planned route and your share', () => {
    const r = plan(inputs({ specMode: 'auto' }), MELEE_RANGED);
    const roles = r.specs.team!;
    expect(roles.partySize).toBe(6);
    expect(roles.mages).toBe(0); // no magic loadout in the kit (auto)
    expect(roles.rows.some((x) => x.weapon === 'ayak')).toBe(false);
    expect(roles.rows.length).toBeGreaterThan(0);
    const share = r.specs.share!;
    expect(share.manual).toBe(false);
    expect(share.weapon).toBe(roles.rows[0].weapon);
    expect(r.specs.bring).toEqual(share.carry ? [share.weapon] : []);
    expect(r.specItems.length).toBe(r.specs.bring.length);
    if (share.carry) expect(r.inventory.some((c) => c.kind === 'spec')).toBe(true);
    expect(r.slots!.used).toBeLessThanOrEqual(28);
    // mages in party > 0 adds the Ayak carriers to the briefing
    const m = plan(inputs({ specMode: 'auto', magesInParty: 2 }), MELEE_RANGED);
    expect(m.specs.team!.mages).toBe(2);
    expect(m.specs.team!.rows.some((x) => x.weapon === 'ayak')).toBe(true);
  }, 300000);

  test('Solo, planner decides: no magic loadout → Eye of Ayak is never brought (it costs a slot for nothing)', () => {
    const a = { ...FA.defaultAssumptions, partySize: 2 };
    const r = plan(inputs({ drain: 'solo', specMode: 'auto', assumptions: a }), MELEE_RANGED);
    expect(r.kit.some((c) => c.group === 'magic')).toBe(false);
    expect(r.specs.bring).not.toContain('ayak');
    const ayak = r.specs.solo!.perWeapon.find((d) => d.weapon === 'ayak')!;
    expect(ayak.chosen).toBe(false);
    expect(ayak.deltaSeconds).toBeLessThanOrEqual(1e-9);
    // the chosen weapons each save time
    r.specs.solo!.perWeapon.filter((d) => d.chosen).forEach((d) => expect(d.deltaSeconds).toBeGreaterThan(0));
    expect(r.specItems.map((x) => x.name).length).toBe(r.specs.bring.length);
    expect(r.specs.text).toBe(bringText(r.specs.bring));
  }, 600000);

  test('Solo, planner decides: a magic-only kit values Eye of Ayak (its drain only helps magic)', () => {
    const a = { ...FA.defaultAssumptions, partySize: 2 };
    const r = plan(inputs({ drain: 'solo', specMode: 'auto', assumptions: a }), MAGIC);
    expect(r.kit.every((c) => c.group === 'magic')).toBe(true);
    expect(r.specs.bring).toContain('ayak');
    expect(r.specs.solo!.perWeapon.find((d) => d.weapon === 'ayak')!.deltaSeconds).toBeGreaterThan(0);
    // and the planner's choice is at least as fast as bringing every weapon by hand
    const all = plan(inputs({
      drain: 'solo',
      specMode: 'manual',
      assumptions: {
        ...a,
        mySpecs: {
          ...a.mySpecs, elderMaul: true, dwh: true, bgs: true, tonalztics: true, ayak: 2,
        },
      },
    }), MAGIC);
    expect(total(r)).toBeLessThanOrEqual(total(all) + 1e-6);
  }, 600000);

  test('Ayak hint: carried (Specs I bring) with no magic loadout in the kit', () => {
    const r = plan(inputs({ drain: 'solo', specMode: 'manual', assumptions: { ...FA.defaultAssumptions, partySize: 2 } }), MELEE_RANGED);
    expect(r.specs.bring).toContain('ayak');
    expect(r.specs.notes.some((n) => n.startsWith('Eye of Ayak is carried but no magic loadout'))).toBe(true);
  }, 300000);
});
