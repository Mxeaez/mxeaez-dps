import { describe, expect, test } from '@jest/globals';
import { otherRaidsDescribe } from '@/tests/utils/otherRaids';
import React from 'react';
import { TextDecoder, TextEncoder } from 'util';
import { generateEmptyPlayer } from '@/state';
import {
  BestSetupAssumptions, DEFAULT_ASSUMPTIONS, PRESETS,
} from '@/lib/fracturedArchive/presets';
import {
  createKitEvaluator, encounterTime, EncounterTime, presetKitLoadout, raidTimeAssumptionsFrom,
} from '@/lib/fracturedArchive/raidTime';
import { briefingRows, phaseNpc, wearGroups } from '@/lib/fracturedArchive/briefing';
import { resolvePresetEquipment } from '@/lib/fracturedArchive/bestSetup';
import {
  DrainLine, drainLineItem, DrainLineItem, encounterBrief, encounterDrainSummary,
} from '@/lib/fracturedArchive/drainLine';
import {
  plan, PlanCandidate, planItemByName, PlanInputs,
} from '@/lib/fracturedArchive/planner';
import { FRACTURED_ARCHIVE_RAID, raidConfig } from '@/lib/raids';
import { RaidId } from '@/lib/raids/types';
import PlanBriefing from '@/app/components/bestSetup/PlanBriefing';
import { headline } from '@/tests/utils/headlines';

// Phase 35b (UI fix, no number changes): the Plan briefing shows one drain line per NPC of an encounter ("Bork: … ·
// Smorks: …"; phase 33 folded The Smorks into Bork's line) and names the loadouts per NPC when the NPCs use different
// ones. NPC = the target's `npc`, else its monster name (briefing.ts `phaseNpc`). Docs: docs/BEST_SETUP.md.

const FA = FRACTURED_ARCHIVE_RAID;
// the FA plan's carriers (phase 29: 2 Elder maul + 2 Tonalztics)
const TEAM: BestSetupAssumptions = {
  ...DEFAULT_ASSUMPTIONS,
  team: {
    ...DEFAULT_ASSUMPTIONS.team,
    carriers: {
      elderMaul: 2, dwh: 0, bgs: 0, tonalztics: 2, ayak: 0,
    },
  },
};

// phase 40b: the FA encounters with the 'evenly' Bork kill order (Bork's armour rows get specs: two named events); the
// default stun-swap leaves stunned Bork without drains (every melee hit lands)
const encountersOf = (raidId: RaidId, ids: string[], a?: BestSetupAssumptions): EncounterTime[] => {
  const R = raidConfig(raidId);
  const as = a ?? R.defaultAssumptions;
  const kit = createKitEvaluator(R.presets.map((p) => presetKitLoadout(generateEmptyPlayer(), p, as)), as);
  const settings = raidId === 'fractured-archive' ? { ...R.defaultTimeSettings, borkKillOrder: 'evenly' } : R.defaultTimeSettings;
  return ids.map((id) => encounterTime(id, kit, raidTimeAssumptionsFrom(as, 'team', settings, R.time)));
};
const summaryOf = (e: EncounterTime) => encounterDrainSummary(e.phases.map((p) => ({
  key: p.key, label: p.label, drainLine: p.choice?.drainLine, drainReset: p.drainReset, npc: phaseNpc(p.targetKey),
})), 'team')!;

describe('phaseNpc: one NPC per monster, split / renamed where one name covers several NPCs', () => {
  test('same NPC: AG flying / grounded, Bork\'s phases, Ocellus P1–P3, Kephri, Sotetseg; different: Bork / Smorks, Olm', () => {
    expect(phaseNpc('ag-flying')).toBe(phaseNpc('ag-grounded'));
    expect(phaseNpc('bork')).toBe('Bork');
    expect(phaseNpc('smorks')).toBe('Smorks');
    expect(new Set(['ocellus-p1', 'ocellus-p2', 'ocellus-p3'].map(phaseNpc)).size).toBe(1);
    expect(phaseNpc('toa-kephri-shielded')).toBe(phaseNpc('toa-kephri'));
    expect(phaseNpc('toa-warden-p2')).toBe(phaseNpc('toa-warden-core'));
    expect(phaseNpc('toa-obelisk')).toBe('Obelisk');
    expect(['cox-olm-right', 'cox-olm-left', 'cox-olm-head'].map(phaseNpc)).toEqual(['Right claw', 'Left claw', 'Head']);
    expect(['cox-vanguard-melee', 'cox-vanguard-ranged', 'cox-vanguard-magic'].map(phaseNpc)).toEqual(['Melee vanguard', 'Ranged vanguard', 'Magic vanguard']);
    expect(['cox-muttadile-small', 'cox-muttadile-large'].map(phaseNpc)).toEqual(['Small muttadile', 'Large muttadile']);
    expect(phaseNpc('tob-bloat')).toBe(phaseNpc('tob-bloat-restored'));
    expect(phaseNpc('unknown-key')).toBe('unknown-key');
  });
});

describe('FA (presets kit, 2 Elder maul + 2 Tonalztics carriers)', () => {
  const enc = encountersOf('fractured-archive', ['bork-smorks', 'archive-guardian', 'dagonhai', 'ocellus'], TEAM);
  const [bork, ag, dagon, ocellus] = enc;
  const rows = briefingRows(enc, 'team');

  test('Bork + Smorks: two events named Bork / Smorks, each with its own NPC\'s numbers (Def 180 / Def 5)', () => {
    const s = summaryOf(bork);
    expect(s.events.map((e) => e.npc)).toEqual(['Bork', 'Smorks']);
    expect(s.events.map((e) => e.phaseKey)).toEqual(['bork-8', 'smorks']);
    expect(s.events[0].parts[0].line).toBe(bork.phases.find((p) => p.key === 'bork-8')!.choice!.drainLine);
    expect(s.events[1].parts[0].line).toBe(bork.phases.find((p) => p.key === 'smorks')!.choice!.drainLine);
    // phase 38h-2 (bars in boss HP, averaged over the outcomes): the 4 maul specs split 2 / 2 between Bork (Def 195) and
    // the Smorks with the Tonalztics (Def 22; was 4 on Bork → Def 180, the Smorks Def 82)
    expect(s.events.map((e) => e.parts[0].line.defAfter)).toEqual([195, 22]);
    expect(s.text).toBe('Bork: 1 Elder maul carrier (2 specs) → Def 195 · Smorks: 1 Elder maul carrier (2 specs) + 2 Tonalztics carriers (4 specs) → Def 22');
    const row = rows[0];
    expect(row.specs.map((g) => g.label)).toEqual(['Bork', 'Smorks']);
    expect(row.specs.map((g) => g.result)).toEqual(['→ Def 195', '→ Def 22']);
    expect(row.specsText).toBe('Bork: Elder maul 1 spec → Def 195 · Smorks: Elder maul 2 specs + Tonalztics 4 hits → Def 22');
  });

  test('Bork + Smorks: the Wear cell names the loadouts per NPC when they differ (default carriers: Shadow on armour 14)', () => {
    // phase 38g: with the default carriers (+ 1 Eye of Ayak) armour 14 uses the Shadow: named groups. Phase 38h-2: with
    // 2 Elder maul + 2 Tonalztics Bork now stays at Def 195 (1 maul spec), so armour 14 takes the Shadow there too
    expect(rows[0].wear.map((w) => w.npc)).toEqual(['Bork', 'Smorks']);
    const [def] = encountersOf('fractured-archive', ['bork-smorks']);
    const borkLoadouts = Array.from(new Set(def.phases.filter((p) => p.targetKey === 'bork').map((p) => p.choice!.loadout)));
    const smorksLoadouts = def.phases.filter((p) => p.targetKey === 'smorks').map((p) => p.choice!.loadout);
    expect(borkLoadouts).toEqual(["Inquisitor's + Obligator", "Tumeken's shadow (Ancestral)"]);
    expect(smorksLoadouts).toEqual(["Inquisitor's + Obligator"]);
    const [row] = briefingRows([def], 'team');
    expect(row.wear).toEqual([{ npc: 'Bork', loadouts: borkLoadouts }, { npc: 'Smorks', loadouts: smorksLoadouts }]);
    expect(row.loadouts).toEqual(borkLoadouts);
  });

  test('AG: one NPC, one event (phase 38g: one part, the Tonalztics on the flying shield also reach the grounded floor)', () => {
    const s = summaryOf(ag);
    expect(s.events).toHaveLength(1);
    expect(s.events[0].npc).toBeUndefined();
    expect(s.events[0].parts.map((p) => p.label)).toEqual(['Flying shield']);
    expect(rows[1].specsText).toBe('Tonalztics 4 hits → Def 156');
    expect(rows[1].wear).toEqual([{ loadouts: rows[1].loadouts }]);
  });

  test('Dagon\'hai trio: one event; Ocellus: one NPC, three events (phase 38c: P1, the Blade, P3 quadrants 1-3)', () => {
    expect(summaryOf(dagon).events).toHaveLength(1);
    // phase 38h-2: the maul specs left after Bork + Smorks go to the trio (surer than Tonalztics ×3)
    expect(rows[2].specsText).toBe('Elder maul 3 specs + Tonalztics 1 hit → Def 0');
    expect(rows[2].wear).toHaveLength(1);
    const s = summaryOf(ocellus);
    expect(s.events.map((ev) => [ev.reset, ev.parts.map((p) => p.label)])).toEqual([
      [undefined, ['P1 at a corner']], ['P1', ['P2 The Blade']], ['P2', ['P3 quadrants 1-3']],
    ]);
    expect(rows[3].wear).toEqual([{ loadouts: rows[3].loadouts }]);
  });

  test('PlanBriefing renders "Bork:" / "Smorks:" spec lines and Wear lines', () => {
    Object.assign(globalThis, { TextEncoder, TextDecoder });
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const { renderToStaticMarkup } = require('react-dom/server') as typeof import('react-dom/server');
    const [defRow] = briefingRows(encountersOf('fractured-archive', ['bork-smorks']), 'team');
    const kit = defRow.loadouts.map((label) => {
      const p = PRESETS.find((x) => x.name === label)!;
      return {
        key: label, label, kind: 'preset', group: p.group, equipment: resolvePresetEquipment(p), options: [], source: 'preset',
      } as unknown as PlanCandidate;
    });
    const div = document.createElement('div');
    div.innerHTML = renderToStaticMarkup(React.createElement(PlanBriefing, { rows: [defRow, rows[1]], kit, imageOf: () => null }));
    const [borkRow, agRow] = Array.from(div.querySelectorAll('[data-testid="plan-briefing-row"]'));
    const wear = Array.from(borkRow.querySelectorAll('[data-testid="briefing-wear-group"]'));
    expect(wear.map((w) => w.getAttribute('data-npc'))).toEqual(['Bork', 'Smorks']);
    expect(wear.map((w) => w.querySelectorAll('[data-testid="briefing-loadout"]').length)).toEqual([2, 1]);
    const groups = Array.from(borkRow.querySelectorAll('[data-testid="plan-briefing-group"]'));
    expect(groups.map((g) => g.textContent!.split(':')[0])).toEqual(['Bork', 'Smorks']);
    expect(groups.map((g) => g.getAttribute('data-text'))).toEqual(defRow.specs.map((g) => g.text));
    // single-NPC rows keep the phase 34 form
    expect(agRow.querySelectorAll('[data-testid="briefing-wear-group"]')).toHaveLength(0);
    expect(agRow.querySelectorAll('[data-testid="plan-briefing-group"]')[0].getAttribute('data-text')).toBe('Tonalztics 4 hits → Def 156');
    // phase 38g: the drain facts under the spec lines, one per NPC (the same line as Search / Summary)
    const facts = Array.from(borkRow.querySelectorAll('[data-testid="drain-facts"]'));
    expect(facts.map((f) => f.getAttribute('data-text'))).toEqual(defRow.facts.map((f) => f.facts.text));
    expect(facts[0].textContent!.startsWith('Bork: Drain: Elder maul ×')).toBe(true); // phase 38g-2: the plan, in send order
  });
});

otherRaidsDescribe('ToA / CoX / ToB multi-NPC encounters (default assumptions, presets kit)', () => {
  test('ToB Sotetseg: three reset events of one NPC (phase 36: different specs each); Bloat keeps its stomp event', () => {
    const [sote, bloat] = encountersOf('tob', ['tob-sotetseg', 'tob-bloat']);
    const s = summaryOf(sote);
    expect(s.events).toHaveLength(3);
    expect(s.events.map((e) => e.reset)).toEqual([undefined, 'maze 1', 'maze 2']);
    expect(s.events.every((e) => e.npc === undefined)).toBe(true);
    const [row, bloatRow] = briefingRows([sote, bloat], 'team');
    // phase 36: one spec budget: different events (was the same full specs "× 3"); phase 38g: maze 2 gets no specs (the
    // bars are spent), its drain facts mark it
    expect(row.specs.map((g) => g.label)).toEqual(['start', 'after maze 1']);
    expect(row.facts.map((f) => f.facts.short)).toEqual([undefined, 'needs 4 specs, the team has ~2', 'needs 4 specs, the team has ~0']);
    expect(bloatRow.drainText).toMatch(/ · After the stomp \(Defence restored\), again: no specs$/);
  });

  test('ToA Kephri: the scarabs (no specs) get no line; the Wear names Kephri and the scarabs', () => {
    const [kephri] = encountersOf('toa', ['toa-kephri']);
    const s = summaryOf(kephri);
    // phase 36: "the defence level is reset for the final phase" (wiki): a second event
    expect(s.events.map((e) => e.reset)).toEqual([undefined, 'the final phase']);
    expect(s.events[0].npc).toBeUndefined();
    expect(s.text.startsWith('Start of fight: ')).toBe(true);
    const [row] = briefingRows([kephri], 'team');
    expect(row.wear[0].npc).toBe('Kephri');
    expect(row.wear.length).toBeGreaterThan(1);
  });

  test('ToA Wardens: Obelisk / Elidinis\' Warden / Tumeken\'s Warden lines', () => {
    const [w] = encountersOf('toa', ['toa-wardens']);
    const s = summaryOf(w);
    // phase 36: one spec budget: Elidinis' Warden's P2 got no specs (the energy went to the Obelisk and P3), and the
    // enrage resets the Defence (wiki): a second Tumeken's Warden event
    // Phase 37 fix: Elidinis' Warden is listed even with "no specs" (it was dropped, so it read as not part of the plan)
    // Phase 38b: Liquid adrenaline (two doses, 300 s from the Wardens' start) halves the spec costs: P2 is specced too
    expect(s.events.map((e) => e.npc)).toEqual(['Obelisk', 'Elidinis\' Warden', 'Tumeken\'s Warden', 'Tumeken\'s Warden']);
    expect(s.events[1].text).toBe('Elidinis\' Warden: 1 Elder maul carrier (2 specs) + 1 Tonalztics carrier (2 specs) → Def 0 · 95%');
    const [row] = briefingRows([w], 'team');
    expect(row.specs.map((g) => g.label)).toEqual(['Obelisk', 'Elidinis\' Warden', 'Tumeken\'s Warden', 'Tumeken\'s Warden, after the enrage']);
    expect(row.specs[1].text).toBe('Elidinis\' Warden: Elder maul 2 specs + Tonalztics 2 hits → Def 0');
  });

  test('CoX Olm: right claw, left claw and head are three lines (and three Wear lines); Vanguards: no specs, Wear per Vanguard', () => {
    const [olm, vanguards] = encountersOf('cox', ['cox-olm', 'cox-vanguards']);
    const s = summaryOf(olm);
    // phase 36: "His stats also reset when a new phase starts" (wiki): each claw's later phases are new events
    expect(s.events.map((e) => `${e.npc}${e.reset ? `/${e.reset}` : ''}`)).toEqual(['Right claw', 'Left claw', 'Right claw/phase 1', 'Left claw/phase 1', 'Right claw/phase 2', 'Left claw/phase 2', 'Head']);
    const [row, vRow] = briefingRows([olm, vanguards], 'team');
    // phase 38g: no team reaches the right claw's floor 0, so every carrier specs it and the left claw gets no specs (the
    // bars are spent; its drain facts say "the team has ~0"); phase 37 fix: the short line says so, like the full text
    expect(row.specs.map((g) => g.label).slice(0, 2)).toEqual(['Right claw', 'Left claw']);
    expect(row.specs[1].text).toBe('Left claw: no specs');
    expect(s.text).toContain('Left claw: no specs');
    expect(row.facts.find((f) => f.label === 'Left claw')!.facts.short).toBe('needs 8 specs, the team has ~0');
    // every event of the full text is in the short line (no-spec events included), in the same order
    expect(row.specs.length).toBe(s.events.reduce((t, e) => t + Math.max(1, e.parts.length), 0));
    expect(row.specs.map((g) => g.label)).toContain('Right claw, after phase 1');
    expect(row.specs.map((g) => g.label)).toContain('Head');
    expect(row.wear.map((g) => g.npc)).toEqual(['Right claw', 'Left claw', 'Head']);
    expect(vRow.specsText).toBe('no specs');
    expect(vRow.wear.map((g) => g.npc)).toEqual(['Melee vanguard', 'Ranged vanguard', 'Magic vanguard']);
  });
});

// --- toys ------------------------------------------------------------------------------------------------------------

const line = (items: DrainLineItem[], defAfter: number): DrainLine => ({
  items, defAfter, magicDefAfter: 0, text: '',
});
const maul = (count: number, landed: number) => ({
  ...drainLineItem('elderMaul', count, 0.9), needed: count, landed, perCarrier: 2, neededResult: '99%',
});

describe('toy: two NPCs and a reset', () => {
  const phases = [
    {
      key: 'a1', label: 'A first', drainLine: line([maul(4, 2)], 100), npc: 'A',
    },
    {
      key: 'b1', label: 'B', drainLine: line([maul(4, 2)], 100), npc: 'B',
    },
    {
      key: 'c', label: 'Add', npc: 'C',
    },
    {
      key: 'a2', label: 'A again', drainLine: line([maul(4, 2)], 100), drainReset: 'the stomp', npc: 'A',
    },
    {
      key: 'b2', label: 'B later', drainLine: line([maul(4, 3)], 50), npc: 'B',
    },
  ];
  test('events per NPC (first appearance order), the reset starts a new event of its NPC; the add is left out', () => {
    const s = encounterDrainSummary(phases, 'team')!;
    expect(s.events.map((e) => [e.npc, e.phaseKey, e.reset])).toEqual([['A', 'a1', undefined], ['B', 'b1', undefined], ['A', 'a2', 'the stomp']]);
    expect(s.events.map((e) => e.head)).toEqual(['A:', 'B:', 'A, after the stomp (Defence restored), again:']);
    expect(s.text).toBe('A: 2 Elder maul carriers (4 specs) → Def 100 · 99% · B: 2 Elder maul carriers (4 specs) → Def 100 · 99% · A, after the stomp (Defence restored), again: 2 Elder maul carriers (4 specs) → Def 100 · 99%');
  });
  test('the brief keeps NPCs with the same numbers apart (no "× 3"); labels name the NPC', () => {
    const groups = encounterBrief(encounterDrainSummary(phases, 'team')!);
    expect(groups.map((g) => [g.label, g.times])).toEqual([['A', 1], ['B', 1], ['A, after the stomp', 1]]);
    expect(groups.map((g) => g.text)).toEqual(['A: Elder maul 2 specs → Def 100', 'B: Elder maul 2 specs → Def 100', 'A, after the stomp: Elder maul 2 specs → Def 100']);
  });
  test('one NPC (phases without npc, or all the same): phase 33\'s form', () => {
    const one = phases.map((p) => ({ ...p, npc: undefined }));
    const s = encounterDrainSummary(one, 'team')!;
    expect(s.events.map((e) => e.npc)).toEqual([undefined, undefined]);
    expect(s.text.startsWith('Start of fight: 2 Elder maul carriers (4 specs) → Def 100 · 99% · After the stomp')).toBe(true);
    expect(encounterDrainSummary(phases.map((p) => ({ ...p, npc: 'A' })), 'team')!.text).toBe(s.text);
  });
  test('only adds unspecced, no NPC specced: the first NPC\'s "no specs"', () => {
    const s = encounterDrainSummary([
      {
        key: 'x', label: 'X', drainLine: line([], 105), npc: 'X',
      },
      { key: 'y', label: 'Y', npc: 'Y' },
    ], 'team')!;
    expect(s.text).toBe('Start of fight: no specs');
  });
  test('wearGroups: same loadouts on every NPC → one unnamed group; NPCs sharing a loadout list share a group', () => {
    const ph = (targetKey: string, loadout: string) => ({ targetKey, choice: { loadout } });
    expect(wearGroups([ph('bork', 'L1'), ph('smorks', 'L1')])).toEqual([{ loadouts: ['L1'] }]);
    expect(wearGroups([ph('toa-kephri-shielded', 'K'), ph('toa-spitting-scarab', 'T'), ph('toa-soldier-scarab', 'T'), ph('toa-kephri', 'K')]))
      .toEqual([{ npc: 'Kephri', loadouts: ['K'] }, { npc: 'Spitting Scarab, Soldier Scarab', loadouts: ['T'] }]);
  });
});

// --- slow: no number changes ---------------------------------------------------------------------------------------

(process.env.RUN_SLOW_TESTS ? describe : describe.skip)('FA default Team plan: total unchanged (slow)', () => {
  test(`${headline('fa').total} (the headline fixture; phase 36 review: 21:07.7); Bork + Smorks briefing per NPC`, () => {
    const r = plan({
      basePlayer: generateEmptyPlayer(),
      assumptions: FA.defaultAssumptions,
      drain: 'team',
      settings: FA.defaultTimeSettings,
      route: 'all',
      pinned: FA.planDefaults.pinned.map((n) => planItemByName(n).id),
      nonItemSlots: FA.planDefaults.nonItemSlots,
      supplies: FA.defaultSupplies,
      ringPolicy: 'camp-one',
      specMode: 'auto',
      carrierMode: 'auto',
    } as PlanInputs);
    const planned = r.comparison!.routes[r.planned];
    expect(Math.abs(planned.seconds - headline('fa').seconds)).toBeLessThanOrEqual(headline('fa').seconds * 0.01); // phase 37b: the fixture (phase 36 review: 21:07.7)
    const row = briefingRows(planned.encounters, 'team').find((x) => x.id === 'bork-smorks')!;
    // phase 38g: Bork its 2 Elder maul carriers at 95%; the Smorks (no team reaches floor 0) what the bars still pay
    // phase 38h-1: the Smorks' 6 specs at the Defence the earlier ones leave (ranked Def 36 → 13)
    // phase 38h-2 review fixes: the Smorks also get the third maul spec (Tonalztics ×6 + Elder maul, Def 7)
    // phase 40b (stun-swap): stunned Bork takes no drain (every melee hit lands); the Smorks get both maul specs
    expect(row.specsText).toBe('Bork: no specs · Smorks: Elder maul 2 specs + Tonalztics 10 hits → Def 0');
  });
});
