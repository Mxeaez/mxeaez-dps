import { describe, expect, test } from '@jest/globals';
import { faRows, OTHER_RAIDS, otherRaidsTest } from '@/tests/utils/otherRaids';
import { generateEmptyPlayer } from '@/state';
import { buildTargetMonster, findTarget } from '@/lib/fracturedArchive/bestSetup';
import {
  DrainLine, DrainLineItem, drainLineItem, encounterDrainSummary, encounterItemText, phaseShortLabel,
} from '@/lib/fracturedArchive/drainLine';
import {
  plan, planItemByName, PlanInputs, PlanResult, PlanTuning,
} from '@/lib/fracturedArchive/planner';
import {
  BestSetupAssumptions, DEFAULT_ASSUMPTIONS, PresetDef, PRESETS,
} from '@/lib/fracturedArchive/presets';
import {
  createKitEvaluator, encounterTime, EncounterTime, presetKitLoadout, RaidKit, raidTimeAssumptionsFrom, routesFor,
} from '@/lib/fracturedArchive/raidTime';
import {
  AUTO_AYAK_SPECS, mySpecsForSubset, subsetOfMySpecs, withPlanSpecs,
} from '@/lib/fracturedArchive/specChoice';
import { SPEC_WEAPONS } from '@/lib/fracturedArchive/specs';
import { FRACTURED_ARCHIVE_RAID, RAIDS, raidConfig } from '@/lib/raids';
import { slowDescribe, slowTest } from '@/tests/utils/slow';

// Phase 33: "Specs I bring" defaults to none and follows the plan in "Planner decides" mode (withPlanSpecs); the Plan
// tab's encounter table shows one start-of-fight drain line per encounter (encounterDrainSummary). Docs:
// docs/BEST_SETUP.md, *Specs I bring* and *Plan tab → encounter table*.

const FA = FRACTURED_ARCHIVE_RAID;
const NONE = {
  elderMaul: false, dwh: false, bgs: false, tonalztics: false, ayak: 0, lightbearer: false, priority: 'defence',
};

describe('"Specs I bring" defaults to none', () => {
  test.each(faRows(RAIDS).map((r) => [r.id, r] as const))('%s: every weapon off, Ayak 0 (Lightbearer off, Defence drains first)', (_, raid) => {
    expect(raid.defaultAssumptions.mySpecs).toEqual(NONE);
    expect(subsetOfMySpecs(raid.defaultAssumptions.mySpecs)).toEqual([]);
  });

  test('the shared default too, and a Solo drain with it specs nothing', () => {
    expect(DEFAULT_ASSUMPTIONS.mySpecs).toEqual(NONE);
    const d = buildTargetMonster(findTarget('bork'), undefined, 'solo', DEFAULT_ASSUMPTIONS).drain;
    expect(d.line!.items).toEqual([]);
    expect(d.reductions.elderMaul).toBe(0);
  });
});

describe('withPlanSpecs: the chips (and Search / Summary Solo drains) follow the plan in "Planner decides" mode', () => {
  const manual: BestSetupAssumptions = {
    ...DEFAULT_ASSUMPTIONS,
    mySpecs: {
      ...DEFAULT_ASSUMPTIONS.mySpecs, elderMaul: true, ayak: 3, lightbearer: true, priority: 'ayak',
    },
  };
  test('Set manually: unchanged (whatever the last plan brought)', () => {
    expect(withPlanSpecs(manual, ['tonalztics'], true)).toBe(manual);
    expect(withPlanSpecs(manual, null, true)).toBe(manual);
  });
  test('Planner decides, no plan yet: no spec weapons ("run a plan to fill these"), the Lightbearer flag kept', () => {
    const a = withPlanSpecs(manual, null, false);
    expect(subsetOfMySpecs(a.mySpecs)).toEqual([]);
    expect(a.mySpecs.lightbearer).toBe(true);
  });
  test('Planner decides after a plan: exactly the plan\'s "Bring", as the plan\'s own Solo drain state', () => {
    const a = withPlanSpecs(manual, ['tonalztics', 'ayak'], false);
    expect(a.mySpecs).toEqual(mySpecsForSubset(['tonalztics', 'ayak'], { lightbearer: true }));
    expect(a.mySpecs).toMatchObject({
      elderMaul: false, tonalztics: true, ayak: AUTO_AYAK_SPECS, ayakAuto: true, priority: 'defence',
    });
    expect(subsetOfMySpecs(a.mySpecs)).toEqual(['tonalztics', 'ayak']);
    // everything else is the user's
    expect({ ...a, mySpecs: null }).toEqual({ ...manual, mySpecs: null });
    expect(subsetOfMySpecs(withPlanSpecs(manual, [], false).mySpecs)).toEqual([]);
  });
});

// --- the planner's Bring → the chips (reduced pools; the full FA plans are in the slow block) -----------------------

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
  specMode: 'auto',
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
const MELEE_RANGED = reduced([preset('Twisted bow (Masori)'), preset("Inquisitor's mace (full crush)")], ['Twisted bow']);
const chipsOf = (r: PlanResult) => subsetOfMySpecs(withPlanSpecs(FA.defaultAssumptions, r.specs.bring, false).mySpecs);

describe('planner decides: the chips equal the plan\'s "Bring" (reduced pools)', () => {
  // phase 38f: the Solo plan is slow (25 s); withPlanSpecs' own cases above cover the chips = Bring rule fast
  slowTest('Solo: the chosen subset', () => {
    const r = plan(inputs({ drain: 'solo', assumptions: { ...FA.defaultAssumptions, partySize: 2 } }), MELEE_RANGED);
    expect(r.specs.mode).toBe('auto');
    expect(chipsOf(r)).toEqual(r.specs.bring);
    // phase 36: the drain weapons first, then the damage spec weapons / Surge potions the planner added
    expect(r.specItems.slice(0, r.specs.bring.length).map((x) => x.name)).toEqual(r.specs.bring.map((w) => {
      const it = SPEC_WEAPONS[w].item;
      return typeof it === 'string' ? it : it[0];
    }));
  }, 300000);
  test('Team: your share (carried) — or none', () => {
    const r = plan(inputs(), MELEE_RANGED);
    const share = r.specs.share!;
    expect(chipsOf(r)).toEqual(share.carry && share.weapon ? [share.weapon] : r.specs.bring);
    expect(chipsOf(r)).toEqual(r.specs.bring);
  }, 300000);
});

// --- one drain line per encounter ----------------------------------------------------------------------------------

describe('encounterDrainSummary (toy lines)', () => {
  const item = (weapon: DrainLineItem['weapon'], count: number, extra: Partial<DrainLineItem> = {}): DrainLineItem => ({
    ...drainLineItem(weapon, count, 0.8), ...extra,
  });
  const line = (items: DrainLineItem[], defAfter = 150, magicDefAfter = 50): DrainLine => ({
    items, defAfter, magicDefAfter, text: 'plan',
  });
  const team = (w: DrainLineItem['weapon'], count: number, brings = '98%') => item(w, count, { perCarrier: 2, bringsResult: brings, neededResult: '95%' });

  test('item text: "2 Elder maul carriers (4 specs)" (Team, 2 specs per carrier), "1 Tonalztics spec" (Solo)', () => {
    expect(encounterItemText(team('elderMaul', 4))).toBe('2 Elder maul carriers (4 specs)');
    expect(encounterItemText(team('ayak', 2))).toBe('1 Eye of Ayak carrier (2 specs)');
    expect(encounterItemText(team('tonalztics', 3))).toBe('2 Tonalztics carriers (3 specs)');
    expect(encounterItemText(item('tonalztics', 1))).toBe('1 Tonalztics spec');
    expect(encounterItemText(item('elderMaul', 2))).toBe('2 Elder maul specs');
  });

  test('short labels drop the share: "Grounded (70% of hp)" → "Grounded"', () => {
    expect(phaseShortLabel('Grounded (70% of hp)')).toBe('Grounded');
    expect(phaseShortLabel('Bork, armour 8 (¼ of hp, 80% unstunned)')).toBe('Bork, armour 8');
    expect(phaseShortLabel('P3 last quadrant, Deflect Melee (25%)')).toBe('P3 last quadrant, Deflect Melee');
    expect(phaseShortLabel('Flying shield')).toBe('Flying shield');
  });

  test('the first phase with specs gives the line; later phases with the same weapons collapse into it', () => {
    const s = encounterDrainSummary([
      { key: 'a', label: 'A (10%)', drainLine: line([]) },
      { key: 'b', label: 'B (50%)', drainLine: line([team('elderMaul', 4, '99.6%'), team('tonalztics', 4, '99.6%')], 180) },
      { key: 'c', label: 'C', drainLine: line([team('elderMaul', 4, '99%'), team('tonalztics', 4, '99%')], 181) },
      { key: 'd', label: 'D', drainLine: line([team('tonalztics', 4, '→ Def 5'), team('elderMaul', 4, '→ Def 5')], 5) },
    ], 'team')!;
    expect(s.parts.map((p) => p.phaseKey)).toEqual(['b']);
    expect(s.text).toBe('Start of fight: 2 Elder maul carriers (4 specs) + 2 Tonalztics carriers (4 specs) → Def 180 · 99.6%');
  });

  test('phases needing other weapons are listed: "Flying shield: … · Grounded: …"; no % when the line ranks short of the floor', () => {
    const s = encounterDrainSummary([
      { key: 'f', label: 'Flying shield', drainLine: line([team('tonalztics', 4)], 156) },
      { key: 'g', label: 'Grounded (70% of hp)', drainLine: line([team('elderMaul', 4, '>99.9%'), team('tonalztics', 4, '>99.9%')], 156) },
      { key: 'h', label: 'Flying (30% of hp)', drainLine: line([team('tonalztics', 4)], 156) },
    ], 'team')!;
    expect(s.parts.map((p) => p.label)).toEqual(['Flying shield', 'Grounded']);
    expect(s.text).toBe('Flying shield: 2 Tonalztics carriers (4 specs) → Def 156 · 98% · Grounded: 2 Elder maul carriers (4 specs) + 2 Tonalztics carriers (4 specs) → Def 156 · >99.9%');
    const solo = encounterDrainSummary([{ key: 'x', label: 'X', drainLine: line([item('tonalztics', 3, { neededResult: '→ Def 267' })], 267) }], 'solo')!;
    expect(solo.text).toBe('Start: 3 Tonalztics specs → Def 267');
  });

  test('Eye of Ayak adds the magic defence (its % is not the floor\'s); specs that don\'t fit (×0) are left out; no specs / no drains', () => {
    const s = encounterDrainSummary([{
      key: 'x',
      label: 'X',
      drainLine: line([item('elderMaul', 2, { neededResult: '91%' }), item('ayak', 0, { short: 2 }), item('tonalztics', 0)], 180, 30),
    }], 'solo')!;
    expect(s.text).toBe('Start: 2 Elder maul specs → Def 180 · 91%');
    const ayak = encounterDrainSummary([{ key: 'x', label: 'X', drainLine: line([item('ayak', 3, { neededResult: '97%' })], 200, 0) }], 'solo')!;
    expect(ayak.text).toBe('Start: 3 Eye of Ayak specs → Def 200 · magic def 0');
    expect(encounterDrainSummary([{ key: 'x', label: 'X', drainLine: line([]) }], 'team')!.text).toBe('Start of fight: no specs');
    expect(encounterDrainSummary([{ key: 'x', label: 'X' }], 'team')).toBeUndefined();
  });
});

describe('encounter line = the first phase\'s line (FA, presets kit)', () => {
  // the FA plan's carriers (phase 29: 2 Elder maul + 2 Tonalztics); Solo: party 1, Bring Tonalztics (phase 31)
  const TEAM: BestSetupAssumptions = {
    ...DEFAULT_ASSUMPTIONS,
    team: {
      ...DEFAULT_ASSUMPTIONS.team,
      carriers: {
        elderMaul: 2, dwh: 0, bgs: 0, tonalztics: 2, ayak: 0,
      },
    },
  };
  const SOLO: BestSetupAssumptions = withPlanSpecs({ ...DEFAULT_ASSUMPTIONS, partySize: 1 }, ['tonalztics'], false);
  const encounter = (a: BestSetupAssumptions, drain: 'team' | 'solo', id: string): EncounterTime => {
    const kit = createKitEvaluator(PRESETS.map((p) => presetKitLoadout(generateEmptyPlayer(), p, a)), a);
    return encounterTime(id, kit, raidTimeAssumptionsFrom(a, drain, FA.defaultTimeSettings, FA.time));
  };
  const summary = (e: EncounterTime, drain: 'team' | 'solo') => encounterDrainSummary(
    e.phases.map((p) => ({
      key: p.key, label: p.label, drainLine: p.choice?.drainLine, drainReset: p.drainReset,
    })),
    drain,
  )!;

  test('Bork + Smorks (Team): the five rows (armour 8 / 10 / 12 / 14, the Smorks): armour 8 starts Bork\'s line, the Smorks have their own (phase 36)', () => {
    const e = encounter(TEAM, 'team', 'bork-smorks');
    // stun uptime 0 by default: the stunned row has no damage and is left out
    expect(e.phases.map((p) => p.key)).toEqual(['bork-8', 'bork-10', 'bork-12', 'bork-14', 'smorks']);
    const s = summary(e, 'team');
    // phase 36: one spec budget for Bork and the Smorks: different specs on each (without NPC names: two parts)
    expect(s.parts.map((x) => x.phaseKey)).toEqual(['bork-8', 'smorks']);
    expect(s.parts[0].line).toBe(e.phases[0].choice!.drainLine);
    // phase 38h-2 (bars in boss HP): 1 maul spec on Bork, 3 on the Smorks with the Tonalztics, where they are worth more
    // (was Bork's 2 Elder maul carriers → Def 180, the Smorks the Tonalztics only → Def 82)
    expect(s.parts[0].line.defAfter).toBe(195);
    expect(s.text).toBe('Bork, armour 8: 1 Elder maul carrier (1 spec) → Def 195 · The Smorks: 2 Elder maul carriers (3 specs) + 2 Tonalztics carriers (4 specs) → Def 9');
  });

  test('with a stun uptime the stunned row joins Bork\'s line (six rows)', () => {
    const kit = createKitEvaluator(PRESETS.map((p) => presetKitLoadout(generateEmptyPlayer(), p, TEAM)), TEAM);
    const e = encounterTime('bork-smorks', kit, raidTimeAssumptionsFrom(TEAM, 'team', { ...FA.defaultTimeSettings, borkStunUptime: 0.2 }, FA.time));
    expect(e.phases.map((p) => p.key)).toEqual(['bork-8', 'bork-10', 'bork-12', 'bork-14', 'bork-stunned', 'smorks']);
    const s = summary(e, 'team');
    expect(s.parts.map((p) => p.phaseKey)).toEqual(['bork-8', 'smorks']);
  });

  test('Archive Guardian (Team): the flying shield first (Tonalztics only); phase 38g: grounded needs no maul (4 Tonalztics specs reach its floor at 99%)', () => {
    const e = encounter(TEAM, 'team', 'archive-guardian');
    const s = summary(e, 'team');
    expect(s.parts.map((p) => p.phaseKey)).toEqual(['ag-shield']);
    expect(s.parts[0].line).toBe(e.phases.find((p) => p.key === 'ag-shield')!.choice!.drainLine);
    expect(s.text).toBe('Start of fight: 2 Tonalztics carriers (4 specs) → Def 156 · 99%');
  });

  test('Ocellus (Team): phase 38c: three events (the Defence resets at P2 and P3), P3\'s specs on quadrants 1-3', () => {
    const e = encounter(TEAM, 'team', 'ocellus');
    const s = summary(e, 'team');
    expect(s.parts[0].phaseKey).toBe('ocellus-p1');
    expect(s.parts[0].line).toBe(e.phases[0].choice!.drainLine);
    expect(s.events!.map((ev) => [ev.reset, ev.phaseKey, ev.parts.map((p) => p.label)])).toEqual([
      [undefined, 'ocellus-p1', ['P1 at a corner']],
      ['P1', 'ocellus-p2', ['P2 The Blade']],
      ['P2', 'ocellus-p3', ['P3 quadrants 1-3', 'P3 last quadrant, Deflect Melee']],
    ]);
    // phase 38g: each event its fewest carriers at 95% within the kit (P1 1 Tonalztics; P2 no team reaches the floor 0, so every carrier: the
    // Tonalztics bars pay 2 more specs; P3 2 Elder maul, but their bars are spent in P2: the Tonalztics left)
    // phase 38h-1: each spec at the Defence the earlier ones leave (Bork 96% → 97%, AG 98% → 99%, Xarth 97% → 98%); Ocellus P2 pays the
    // line's Elder maul ×4 → Tonalztics ×2 (was 3 mauls + 2 Tonalztics hits → Def 15)
    // phase 38h-2 (bars in boss HP): P2 and P3 split the maul and Tonalztics bars (2 + 2 specs each) where they are worth
    // most; P3's quadrants 1-3 take the mauls, the last quadrant (Deflect Melee) only the Tonalztics: its own part
    expect(s.text).toBe('Start of fight: 1 Tonalztics carrier (2 specs) → Def 129 · 99% · After P1 (Defence restored), again: 1 Elder maul carrier (2 specs) + 1 Tonalztics carrier (2 specs) → Def 25 · After P2 (Defence restored), again: P3 quadrants 1-3: 1 Elder maul carrier (2 specs) + 1 Tonalztics carrier (2 specs) → Def 150 · 97% · P3 last quadrant, Deflect Melee: 1 Tonalztics carrier (2 specs) → Def 176');
  });

  test('single-phase encounters: the line is that phase\'s (Xarth)', () => {
    const e = encounter(TEAM, 'team', 'xarth');
    expect(summary(e, 'team').text).toBe('Start of fight: 1 Tonalztics carrier (2 specs) → Def 102 · 98%');
  });

  test('Solo (party 1, Tonalztics): "Start: 3 Tonalztics specs → Def 267" on Bork, the AG flying shield\'s 86%', () => {
    const bork = encounter(SOLO, 'solo', 'bork-smorks');
    const s = summary(bork, 'solo');
    expect(s.parts).toHaveLength(1);
    expect(s.parts[0].line).toBe(bork.phases[0].choice!.drainLine);
    // phase 38g: your bar pays the drains first: 2 specs on Bork (100%), the Smorks get what regen pays
    // phase 38h-2 (bars in boss HP): 1 spec on Bork; the bar's energy is worth more on the Smorks / as damage specs
    expect(s.text).toBe(`Start: 1 Tonalztics spec → Def ${bork.phases[0].choice!.drainLine!.defAfter}`);
    const ag = encounter(SOLO, 'solo', 'archive-guardian');
    const sa = summary(ag, 'solo');
    expect(sa.parts).toHaveLength(1); // the same weapon on every phase
    expect(sa.parts[0].phaseKey).toBe('ag-shield');
    expect(sa.text).toMatch(/^Start: \d Tonalztics specs → Def \d+( · \d+%)?$/);
  });
});

// --- slow: the full FA plans ---------------------------------------------------------------------------------------

slowDescribe('planner decides, full FA plans (slow)', () => {
  const full = (patch: Partial<PlanInputs>) => plan(inputs({ ringPolicy: 'camp-one', ...patch }));
  test('Solo party 1: Bring Tonalztics → the chips are Tonalztics only; the Search Solo drain uses it', () => {
    const r = full({ drain: 'solo', assumptions: { ...FA.defaultAssumptions, partySize: 1 } });
    expect(r.specs.bring).toEqual(['tonalztics']);
    expect(chipsOf(r)).toEqual(['tonalztics']);
    const a = withPlanSpecs({ ...FA.defaultAssumptions, partySize: 1 }, r.specs.bring, false);
    const d = buildTargetMonster(findTarget('ag-flying'), undefined, 'solo', a).drain;
    expect(d.line!.items.map((i) => i.weapon)).toEqual(['tonalztics']);
  }, 1800000);
  test('Team (party 6): the chips are your share', () => {
    const r = full({ drain: 'team' });
    const share = r.specs.share!;
    expect(share.manual).toBe(false);
    expect(chipsOf(r)).toEqual(share.weapon && r.specs.bring.includes(share.weapon) ? [share.weapon] : []);
    expect(chipsOf(r)).toEqual(r.specs.bring);
  }, 1800000);
});

// --- drain events: a Defence reset mid-fight means draining again (coordinator amendment, 2026-10-24) ---------------

describe('drain events (Defence restored mid-fight)', () => {
  const TOY_KIT: RaidKit = { best: () => ({ loadout: 'toy', style: 'toy', dps: 10 }) };
  const flagged = faRows(RAIDS).flatMap((raid) => {
    const a = raidTimeAssumptionsFrom(raid.defaultAssumptions, 'none', raid.defaultTimeSettings, raid.time);
    const ids = Array.from(new Set(routesFor(a).flatMap((r) => r.encounters)));
    return ids.flatMap((id) => encounterTime(id, TOY_KIT, a).phases.map((p) => ({
      raid: raid.id, encounter: id, key: p.key, label: p.label, reset: p.drainReset,
    })));
  });

  test('the flag is set on exactly the phases whose label says the Defence is restored (every raid, defaults)', () => {
    expect(flagged.length).toBeGreaterThan(OTHER_RAIDS ? 50 : 10);
    // phase 36: the wiki's other resets (Kephri's final phase, the Warden's enrage, Olm's phases) are flagged too; their
    // labels predate the flag
    expect(flagged.filter((p) => p.reset && p.raid === 'tob').map((p) => p.key)).toEqual(flagged.filter((p) => /Defence restored/.test(p.label)).map((p) => p.key));
    // phase 38c: Ocellus P2 / P3 (the user, in-game); Kephri twice (before / after the supplies)
    expect(flagged.filter((p) => p.reset).map((p) => `${p.raid}/${p.key}: ${p.reset}`)).toEqual([
      'fractured-archive/ocellus-p2: P1',
      'fractured-archive/ocellus-p3: P2',
      'toa/kephri-final: the final phase',
      'toa/wardens-p3-enraged: the enrage',
      'toa/kephri-final: the final phase',
      'cox/olm-p2-right: phase 1',
      'cox/olm-p2-left: phase 1',
      'cox/olm-p3-right: phase 2',
      'cox/olm-p3-left: phase 2',
      'tob/bloat-rest: the stomp',
      'tob/sotetseg-2: maze 1',
      'tob/sotetseg-3: maze 2',
    ].filter((s) => OTHER_RAIDS || s.startsWith('fractured-archive/')));
  });

  const TOB = raidConfig('tob');
  const tobEncounter = (id: string) => {
    const a = TOB.defaultAssumptions;
    const kit = createKitEvaluator(TOB.presets.map((p) => presetKitLoadout(generateEmptyPlayer(), p, a)), a);
    const e = encounterTime(id, kit, raidTimeAssumptionsFrom(a, 'team', TOB.defaultTimeSettings, TOB.time));
    return {
      e,
      s: encounterDrainSummary(e.phases.map((p) => ({
        key: p.key, label: p.label, drainLine: p.choice?.drainLine, drainReset: p.drainReset,
      })), 'team')!,
    };
  };

  otherRaidsTest('Sotetseg: three drain events (the start, after maze 1, after maze 2), each with its own third\'s line', () => {
    const { e, s } = tobEncounter('tob-sotetseg');
    expect(s.events.map((ev) => ev.reset)).toEqual([undefined, 'maze 1', 'maze 2']);
    s.events.forEach((ev, i) => {
      expect(ev.phaseKey).toBe(`sotetseg-${i + 1}`);
      // phase 38g: maze 2 gets no specs (the carriers' bars are spent; the drain line marks it: "the team has ~0")
      if (i < 2) expect(ev.parts[0].line).toBe(e.phases[i].choice!.drainLine);
      else expect(ev.parts).toEqual([]);
    });
    expect(s.events[2].text).toBe('After maze 2 (Defence restored), again: no specs');
    expect(s.events[2].facts?.short).toBe('needs 4 specs, the team has ~0');
    expect(s.events[0].text).toMatch(/^Start of fight: .+ → Def \d+/);
    expect(s.events[1].text).toMatch(/^After maze 1 \(Defence restored\), again: .+ → Def \d+/);
    expect(s.text).toBe(s.events.map((ev) => ev.text).join(' · '));
  });

  test('Bork + Smorks: one drain event', () => {
    const TEAM = {
      ...DEFAULT_ASSUMPTIONS,
      team: {
        ...DEFAULT_ASSUMPTIONS.team,
        carriers: {
          elderMaul: 2, dwh: 0, bgs: 0, tonalztics: 2, ayak: 0,
        },
      },
    };
    const kit = createKitEvaluator(PRESETS.map((p) => presetKitLoadout(generateEmptyPlayer(), p, TEAM)), TEAM);
    const e = encounterTime('bork-smorks', kit, raidTimeAssumptionsFrom(TEAM, 'team', FA.defaultTimeSettings, FA.time));
    const s = encounterDrainSummary(e.phases.map((p) => ({
      key: p.key, label: p.label, drainLine: p.choice?.drainLine, drainReset: p.drainReset,
    })), 'team')!;
    expect(s.events).toHaveLength(1);
    expect(s.events[0].reset).toBeUndefined();
  });

  otherRaidsTest('Bloat: the later downs are a new event with no specs (the restored Bloat takes no drains in the model)', () => {
    const { s } = tobEncounter('tob-bloat');
    expect(s.events.map((ev) => ev.reset)).toEqual([undefined, 'the stomp']);
    expect(s.events[1].text).toBe('After the stomp (Defence restored), again: no specs');
  });

  test('toy: a reset event lists its parts after the head; a first phase with a reset flag is still the start', () => {
    const line = (w: DrainLineItem['weapon'], def: number): DrainLine => ({
      items: [{ ...drainLineItem(w, 4, 0.8), perCarrier: 2, bringsResult: '98%' }], defAfter: def, magicDefAfter: 0, text: 'plan',
    });
    const s = encounterDrainSummary([
      {
        key: 'a', label: 'A', drainLine: line('elderMaul', 100), drainReset: 'ignored',
      },
      { key: 'b', label: 'B', drainLine: line('elderMaul', 101) },
      {
        key: 'c', label: 'C (50%)', drainLine: line('elderMaul', 102), drainReset: 'the wave',
      },
      { key: 'd', label: 'D', drainLine: line('tonalztics', 103) },
    ], 'team')!;
    expect(s.events.map((ev) => [ev.phaseKey, ev.reset])).toEqual([['a', undefined], ['c', 'the wave']]);
    expect(s.text).toBe('Start of fight: 2 Elder maul carriers (4 specs) → Def 100 · 98% · After the wave (Defence restored), again: C: 2 Elder maul carriers (4 specs) → Def 102 · 98% · D: 2 Tonalztics carriers (4 specs) → Def 103 · 98%');
  });
});
