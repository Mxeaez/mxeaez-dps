import { describe, expect, test } from '@jest/globals';
import React from 'react';
import { TextDecoder, TextEncoder } from 'util';
import { generateEmptyPlayer } from '@/state';
import Potion from '@/enums/Potion';
import {
  BestSetupAssumptions, DEFAULT_ASSUMPTIONS, PRESETS, StyleGroup,
} from '@/lib/fracturedArchive/presets';
import {
  createKitEvaluator, encounterTime, EncounterTime, presetKitLoadout, raidTimeAssumptionsFrom,
} from '@/lib/fracturedArchive/raidTime';
import { briefingRows } from '@/lib/fracturedArchive/briefing';
import { resolvePresetEquipment } from '@/lib/fracturedArchive/bestSetup';
import {
  briefItems, briefResultText, briefText, DrainLineItem, drainLineItem, encounterBrief, encounterDrainSummary, neededText,
} from '@/lib/fracturedArchive/drainLine';
import {
  HEART_POTIONS, POTION_OPTIONS, potionChoices, potionOptions, RELEVANT_POTIONS,
} from '@/lib/fracturedArchive/potionChoices';
import {
  plan, PlanCandidate, planItemByName, PlanInputs,
} from '@/lib/fracturedArchive/planner';
import { withPlanSpecs } from '@/lib/fracturedArchive/specChoice';
import { FRACTURED_ARCHIVE_RAID, raidConfig } from '@/lib/raids';
import PlanBriefing, { KitLoadoutIcons } from '@/app/components/bestSetup/PlanBriefing';
import { DrainBrief } from '@/app/components/bestSetup/DrainLineView';
import { ItemNames } from '@/app/components/bestSetup/ItemIcons';
import { headline } from '@/tests/utils/headlines';

// Phase 34 (readability, UI only): the short drain form (icon + one bold number), the Plan tab's raid briefing, the
// potion pickers with icons, item icons next to item names, and the drain-line rewording ("swings" → "attacks"). No
// number changes: the plan's total and every string that moved into a collapsed section are pinned to their phase 33
// values. Docs: docs/BEST_SETUP.md, *Reading the Plan tab (phase 34)*.

const FA = FRACTURED_ARCHIVE_RAID;
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
const FA_IDS = ['archive-guardian', 'ezekiel', 'bork-smorks', 'moia', 'dreadnoth', 'dagonhai', 'xarth', 'ocellus'];
const faEncounters = (a: BestSetupAssumptions, drain: 'team' | 'solo'): EncounterTime[] => {
  const kit = createKitEvaluator(PRESETS.map((p) => presetKitLoadout(generateEmptyPlayer(), p, a)), a);
  return FA_IDS.map((id) => encounterTime(id, kit, raidTimeAssumptionsFrom(a, drain, FA.defaultTimeSettings, FA.time)));
};

const item = (patch: Partial<DrainLineItem> & Pick<DrainLineItem, 'weapon'>): DrainLineItem => ({
  ...drainLineItem(patch.weapon, patch.count ?? 4, 0.9), ...patch,
});

describe('briefText: one bold number per weapon', () => {
  test('Tonalztics: landed hits; Elder maul / DWH: landed specs; BGS: specs; Eye of Ayak: magic def drained', () => {
    expect(briefText(item({
      weapon: 'tonalztics', count: 4, needed: 4, landed: 4, perCarrier: 2,
    }))).toBe('4 hits');
    expect(briefText(item({
      weapon: 'elderMaul', count: 4, needed: 3, landed: 2, perCarrier: 2,
    }))).toBe('2 specs');
    expect(briefText(item({
      weapon: 'dwh', count: 2, needed: 1, landed: 1,
    }))).toBe('1 spec');
    expect(briefText(item({
      weapon: 'bgs', count: 4, needed: 4, landed: 120,
    }))).toBe('4 specs');
    expect(briefText(item({
      weapon: 'ayak', count: 2, needed: 2, landed: 39,
    }))).toBe('≈ 39 magic def');
  });
  test('not needed, unreachable, lines without a "needs" part (None, Max-drain buttons)', () => {
    expect(briefText(item({ weapon: 'elderMaul', count: 4, needed: 0 }))).toBe('not needed');
    expect(briefText(item({ weapon: 'tonalztics', count: 4, needed: null }))).toBe('8 hits');
    expect(briefText(item({ weapon: 'tonalztics', count: 2 }))).toBe('4 hits');
    expect(briefText(drainLineItem('tonalztics', 2, 0.9, undefined, { hits: 3 }))).toBe('3 hits');
    expect(briefText(drainLineItem('bgs', 1, 0.9, { count: 45, unit: 'dmg' }))).toBe('45 dmg');
    expect(briefText(item({ weapon: 'elderMaul', count: 2 }))).toBe('2 specs');
  });
  test('briefItems drops "not needed" weapons unless nothing else is left; the result text', () => {
    const maul = item({ weapon: 'elderMaul', count: 4, needed: 0 });
    const tona = item({
      weapon: 'tonalztics', count: 4, needed: 2, landed: 2,
    });
    expect(briefItems([maul, tona])).toEqual([tona]);
    expect(briefItems([maul])).toEqual([maul]);
    expect(briefResultText({ defAfter: 156, magicDefAfter: 91 }, [tona])).toBe('→ Def 156');
    expect(briefResultText({ defAfter: 156, magicDefAfter: 91 }, [tona], true)).toBe('→ Def 156 · Magic def 91');
    expect(briefResultText({ defAfter: 156, magicDefAfter: 91 }, [tona, item({ weapon: 'ayak', count: 2 })])).toBe('→ Def 156 · Magic def 91');
  });
});

describe('drain-line wording (tooltip / per-phase rows): "swings" → "attacks"', () => {
  const tona = item({
    weapon: 'tonalztics', count: 4, needed: 4, landed: 4, perCarrier: 2, neededResult: '98%',
  });
  test('Team: "needs 4 landed hits · 4 specs (2 carriers) = 8 attacks, 4 must land · 98%"', () => {
    expect(neededText(tona)).toBe('needs 4 landed hits · 4 specs (2 carriers) = 8 attacks, 4 must land · 98%');
  });
  test('Solo: "4 specs = 8 attacks, 4 must land"; the maul / DWH / BGS read specs only', () => {
    expect(neededText({ ...tona, perCarrier: undefined })).toBe('needs 4 landed hits · 4 specs = 8 attacks, 4 must land · 98%');
    expect(neededText(item({
      weapon: 'elderMaul', count: 4, needed: 3, landed: 2, perCarrier: 2, neededResult: '98%',
    }))).toBe('needs 2 landed specs · 3 specs (2 carriers) · 98% · team: 4 specs (2 carriers)');
    expect(drainLineItem('tonalztics', 4, 0.9).title).toMatch(/^4 Tonalztics specs \(8 attacks\)/);
  });
});

describe('raid briefing rows (FA, presets kit): the phase 33 encounter lines are unchanged, the short form is new', () => {
  test('Team (2 Elder maul + 2 Tonalztics carriers)', () => {
    const rows = briefingRows(faEncounters(TEAM, 'team'), 'team');
    expect(rows.map((r) => `${r.id} | ${r.specsText}`)).toEqual([
      'archive-guardian | Flying shield: Tonalztics 4 hits → Def 156 · Grounded: Tonalztics 4 hits → Def 156',
      'ezekiel | Elder maul 1 spec + Tonalztics 3 hits → Def 78',
      // phase 35b: one line per NPC (was Bork's line only); phase 36: one spec budget for both NPCs (was 100% each):
      // 1 maul spec on Bork, the rest on the Smorks
      'bork-smorks | Bork: Elder maul 1 spec → Def 195 · Smorks: Elder maul 3 specs + Tonalztics 2 hits → Def 15',
      'moia | Tonalztics 2 hits → Def 117',
      'dreadnoth | Tonalztics 5 hits → Def 0',
      'dagonhai | Tonalztics 3 hits → Def 0',
      'xarth | Tonalztics 2 hits → Def 102',
      // phase 38c: three events (the Defence resets at P2 and P3), P3's specs on quadrants 1-3
      // fix round (P2's 120 s on the budget clock: more regen, so the P1 / P2 split changed)
      'ocellus | start: Tonalztics 2 hits → Def 129 · after P1: Elder maul 3 specs → Def 69 · after P2: Tonalztics 3 hits → Def 150',
    ]);
    // the tooltip is phase 33's line, unchanged (phase 35b: Bork + Smorks one line per NPC)
    expect(rows.find((r) => r.id === 'bork-smorks')!.drainText).toBe('Bork: 1 Elder maul carrier (1 spec) → Def 195 · Smorks: 2 Elder maul carriers (3 specs) + 2 Tonalztics carriers (4 specs) → Def 15');
    expect(rows.find((r) => r.id === 'archive-guardian')!.drainText).toBe('Flying shield: 2 Tonalztics carriers (4 specs) → Def 156 · 98% · Grounded: 2 Elder maul carriers (4 specs) + 2 Tonalztics carriers (4 specs) → Def 156 · >99.9%');
    // phase 38c: three events (the Defence resets at P2 and P3)
    expect(rows.find((r) => r.id === 'ocellus')!.drainText).toBe('Start of fight: 1 Tonalztics carrier (2 specs) → Def 129 · 99% · After P1 (Defence restored), again: 2 Elder maul carriers (4 specs) → Def 69 · After P2 (Defence restored), again: 2 Tonalztics carriers (4 specs) → Def 150 · 84%');
    // carriers are not repeated in the short form
    rows.forEach((r) => expect(r.specsText).not.toMatch(/carrier/));
    expect(rows.find((r) => r.id === 'ocellus')!.loadouts).toEqual(["Inquisitor's + Obligator", 'Twisted bow (Masori)']);
  });
  test('Solo (party 1, Tonalztics)', () => {
    const rows = briefingRows(faEncounters(SOLO, 'solo'), 'solo');
    // phase 36: the start-of-fight specs have 100% (was 100% + the fight's regen: 3 specs)
    expect(rows.find((r) => r.id === 'archive-guardian')!.specsText).toBe('Tonalztics 3 hits → Def 167');
    expect(rows.find((r) => r.id === 'archive-guardian')!.drainText).toBe('Start: 2 Tonalztics specs → Def 167');
    expect(rows.find((r) => r.id === 'moia')!.specsText).toBe('Tonalztics 2 hits → Def 117');
  });
  test('the seconds are the encounter\'s; None has no specs', () => {
    const enc = faEncounters(TEAM, 'team');
    expect(briefingRows(enc, 'team').map((r) => r.seconds)).toEqual(enc.map((e) => e.seconds));
    expect(briefingRows(enc, 'none').every((r) => r.specs.length === 0 && r.specsText === 'no specs' && r.drainText === undefined)).toBe(true);
  });
  test('ToB Sotetseg (phase 36: one spec budget, three different events, no "× 3"); Bloat\'s stomp (no specs) is left out', () => {
    const TOB = raidConfig('tob');
    const a = TOB.defaultAssumptions;
    const kit = createKitEvaluator(TOB.presets.map((p) => presetKitLoadout(generateEmptyPlayer(), p, a)), a);
    const enc = (id: string) => encounterTime(id, kit, raidTimeAssumptionsFrom(a, 'team', TOB.defaultTimeSettings, TOB.time));
    const [sote, bloat] = briefingRows([enc('tob-sotetseg'), enc('tob-bloat')], 'team');
    expect(sote.specs).toHaveLength(3);
    expect(sote.specs.every((g) => g.times === 1)).toBe(true);
    expect(sote.specsText).toBe('start: Elder maul 1 spec → Def 130 · after maze 1: Elder maul 2 specs → Def 100 · after maze 2: BGS 4 specs → Def 111');
    expect(bloat.specsText).toBe('Elder maul 2 specs + BGS 4 specs → Def 0');
    expect(bloat.drainText).toMatch(/After the stomp \(Defence restored\), again: no specs$/);
  });
  test('toy: events with different numbers are listed with their labels', () => {
    const line = (def: number, n: number) => ({
      items: [item({
        weapon: 'tonalztics', count: 4, needed: 4, landed: n, perCarrier: 2,
      })],
      defAfter: def,
      magicDefAfter: 0,
      text: '',
    });
    const s = encounterDrainSummary([
      { key: 'a', label: 'A', drainLine: line(100, 4) },
      {
        key: 'b', label: 'B', drainLine: line(120, 3), drainReset: 'maze 1',
      },
    ], 'team')!;
    expect(encounterBrief(s).map((g) => g.text)).toEqual(['start: Tonalztics 4 hits → Def 100', 'after maze 1: Tonalztics 3 hits → Def 120']);
  });
});

describe('potion pickers: the custom lists hold exactly the old selects\' options, the relevant ones first', () => {
  const groups: StyleGroup[] = ['melee', 'ranged', 'magic'];
  test.each(groups.flatMap((g) => [[g, false], [g, true]] as [StyleGroup, boolean][]))('%s (heart %s)', (g, heart) => {
    if (heart && g !== 'magic') return;
    [Potion.SUPER_COMBAT, Potion.SATURATED_HEART, Potion.MOONLIGHT].forEach((current) => {
      const old = heart ? POTION_OPTIONS.filter((p) => HEART_POTIONS.includes(p) || p === current) : POTION_OPTIONS;
      const { primary, more } = potionChoices(g, current, heart);
      expect(potionOptions(current, heart)).toEqual(old);
      expect([...primary, ...more].sort((x, y) => x - y)).toEqual([...old].sort((x, y) => x - y));
      expect(new Set([...primary, ...more]).size).toBe(old.length);
      expect(primary).toEqual(RELEVANT_POTIONS[g].filter((p) => old.includes(p)));
    });
  });
  test('the relevant choices', () => {
    expect(potionChoices('melee', Potion.SUPER_COMBAT, false).primary).toEqual([Potion.SUPER_COMBAT, Potion.OVERLOAD_PLUS, Potion.SMELLING_SALTS]);
    expect(potionChoices('ranged', Potion.RANGING, false).primary).toEqual([Potion.RANGING, Potion.OVERLOAD_PLUS, Potion.SMELLING_SALTS]);
    expect(potionChoices('magic', Potion.SATURATED_HEART, true)).toEqual({ primary: [Potion.SATURATED_HEART, Potion.IMBUED_HEART], more: [] });
  });
});

// --- render level: every item name has its icon -------------------------------------------------------------------

// react-dom/server needs TextEncoder, which jsdom doesn't provide: set it, then load the renderer
Object.assign(globalThis, { TextEncoder, TextDecoder });
// eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
const { renderToStaticMarkup } = require('react-dom/server') as typeof import('react-dom/server');

const dom = (el: React.ReactElement) => {
  const div = document.createElement('div');
  div.innerHTML = renderToStaticMarkup(el);
  return div;
};
const kitOf = (labels: string[]): PlanCandidate[] => labels.map((label) => {
  const p = PRESETS.find((x) => x.name === label)!;
  return {
    key: label, label, kind: 'preset', group: p.group, equipment: resolvePresetEquipment(p), options: [], source: 'preset',
  } as unknown as PlanCandidate;
});

describe('render: icons next to every item name', () => {
  test('ItemNames: an icon per name, the text unchanged ("uses: Obligator, Ascension crossbows")', () => {
    const d = dom(React.createElement('span', null, 'uses: ', React.createElement(ItemNames, { names: ['Obligator', 'Ascension crossbows'] })));
    expect(d.textContent).toBe('uses: Obligator, Ascension crossbows');
    expect(Array.from(d.querySelectorAll('img')).map((i) => i.getAttribute('alt'))).toEqual(['Obligator', 'Ascension crossbows']);
  });
  test('DrainBrief: a weapon icon before each bold number; the sentence is the tooltip', () => {
    const items = [item({
      weapon: 'elderMaul', count: 4, needed: 3, landed: 2, perCarrier: 2,
    }), item({
      weapon: 'tonalztics', count: 4, needed: 2, landed: 2, perCarrier: 2,
    })];
    const d = dom(React.createElement(DrainBrief, { items, result: '→ Def 180', title: 'Start of fight: …' }));
    const shown = Array.from(d.querySelectorAll('[data-testid="drain-brief-item"]'));
    expect(shown.map((e) => e.textContent)).toEqual(['2 specs', '2 hits']);
    shown.forEach((e) => expect(e.querySelector('img')).not.toBeNull());
    expect(d.querySelector('[data-testid="drain-brief"]')!.getAttribute('title')).toBe('Start of fight: …');
  });
  test('PlanBriefing: boss image, the loadouts as icons (weapon + items), specs with icons, seconds', () => {
    const kit = kitOf(["Inquisitor's mace (full crush)", 'Twisted bow (Masori)']);
    const rows = briefingRows(faEncounters(TEAM, 'team'), 'team').slice(0, 4).map((r, i) => {
      const loadouts = i % 2 ? [kit[1].label] : [kit[0].label, kit[1].label];
      return { ...r, loadouts, wear: [{ loadouts }] };
    });
    const d = dom(React.createElement(PlanBriefing, { rows, kit, imageOf: () => 'boss.png' }));
    const trs = Array.from(d.querySelectorAll('[data-testid="plan-briefing-row"]'));
    expect(trs).toHaveLength(4);
    trs.forEach((tr, i) => {
      expect(tr.querySelector('td img')!.getAttribute('src')).toBe('boss.png');
      const loadouts = Array.from(tr.querySelectorAll('[data-testid="briefing-loadout"]'));
      expect(loadouts).toHaveLength(i % 2 ? 1 : 2);
      loadouts.forEach((l) => expect(l.querySelectorAll('img').length).toBeGreaterThanOrEqual(5));
      const specItems = Array.from(tr.querySelectorAll('[data-testid="drain-brief-item"]'));
      expect(specItems.length).toBeGreaterThan(0);
      specItems.forEach((s) => expect(s.querySelector('img')).not.toBeNull());
      expect(tr.querySelector('[data-testid="plan-briefing-seconds"]')!.textContent).toBe(`${rows[i].seconds.toFixed(1)} s`);
    });
  });
  test('KitLoadoutIcons: every item of the loadout has its icon (names as alt text)', () => {
    const [k] = kitOf(['Twisted bow (Masori)']);
    const d = dom(React.createElement(KitLoadoutIcons, { kit: k, worn: true }));
    const alts = Array.from(d.querySelectorAll('img')).map((i) => i.getAttribute('alt'));
    const names = Object.values(k.equipment).filter(Boolean).map((x) => (x as { name: string }).name);
    expect(alts.sort()).toEqual(names.sort());
  });
});

// --- slow: the full FA Team plan, before / after ------------------------------------------------------------------

// Phase 36 re-pin: one spec budget per encounter, damage specs (Zaryte crossbow, Burning claws) and a Surge potion move
// the numbers (21:44.4 → 21:04.9, 6 → 4 free, carriers 2 Elder maul + 4 Tonalztics); the layout is unchanged.
(process.env.RUN_SLOW_TESTS ? describe : describe.skip)('FA default Team plan: totals and collapsed strings (slow)', () => {
  test(`${headline('fa').total}; the briefing; the encounter lines, "Why this kit" and "Spec plan" strings`, () => {
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
      carrierMode: 'auto', // as the Plan tab sends it (Team carriers: Planner decides)
    } as PlanInputs);
    const planned = r.comparison!.routes[r.planned];
    // phase 36 review: 5 carriers (2 Elder maul + 3 Tonalztics) with your damage specs; Smorks gets a maul spec
    // phase 37b: total and free slots from src/tests/fixtures/headlines.json (phase 36 review: 21:07.7, 4 free)
    expect(Math.abs(planned.seconds - headline('fa').seconds)).toBeLessThanOrEqual(headline('fa').seconds * 0.01);
    expect(r.slots!.free).toBe(headline('fa').freeSlots);
    const rows = briefingRows(planned.encounters, 'team');
    // phase 38f: the gear and the spec text exactly, the seconds within 2% of the headline fixture's encounters
    rows.forEach((x) => expect(Math.abs(x.seconds - headline('fa').encounters[x.id]) <= headline('fa').encounters[x.id] * 0.02).toBe(true));
    expect(rows.map((x) => `${x.label} | ${x.specsText}`)).toEqual([
      'Archive Guardian | Flying shield: Tonalztics 4 hits → Def 156 · Grounded: Tonalztics 4 hits → Def 156',
      'Bork + Smorks | Bork: Elder maul 2 specs + Tonalztics 1 hit → Def 184 · Smorks: Tonalztics 9 hits → Def 13',
      'Moia | Tonalztics 2 hits → Def 117',
      'Xarth | Tonalztics 2 hits → Def 102',
      'Ocellus | start: Tonalztics 2 hits → Def 129 · after P1: Elder maul 2 specs + Tonalztics 4 hits → Def 1 · after P2: Tonalztics 3 hits → Def 150',
    ]);
    // "Per-phase details": phase 33's encounter lines (before the phase 34 layout)
    expect(rows.map((x) => x.drainText)).toEqual([
      'Flying shield: 4 Tonalztics carriers (8 specs) → Def 156 · >99.9% · Grounded: 1 Elder maul carrier (2 specs) + 4 Tonalztics carriers (8 specs) → Def 156 · >99.9%',
      'Bork: 1 Elder maul carrier (2 specs) + 1 Tonalztics carrier (1 spec) → Def 184 · Smorks: 4 Tonalztics carriers (7 specs) → Def 13',
      'Start of fight: 4 Tonalztics carriers (8 specs) → Def 117 · >99.9%',
      'Start of fight: 1 Elder maul carrier (2 specs) + 4 Tonalztics carriers (8 specs) → Def 102 · >99.9%',
      'Start of fight: 2 Tonalztics carriers (4 specs) → Def 129 · >99.9% · After P1 (Defence restored), again: 1 Elder maul carrier (2 specs) + 2 Tonalztics carriers (4 specs) → Def 1 · After P2 (Defence restored), again: 2 Tonalztics carriers (4 specs) → Def 150 · 84%',
    ]);
    expect(rows.map((x) => x.loadouts)).toEqual([
      ['Ascension crossbows + diamond (e) (Masori)', "Inquisitor's + Obligator"],
      ["Inquisitor's + Obligator"],
      ['Twisted bow (Masori)'],
      ["Inquisitor's + Obligator"],
      ["Inquisitor's + Obligator", 'Twisted bow (Masori)'],
    ]);
    // "Why this kit" (the strings as read from the phase 33 page, docs/screenshots/phase34-before-plan.png)
    expect(r.kit.map((c) => `${c.label} · ${c.group} · ${c.source}`)).toEqual([
      'Ascension crossbows + diamond (e) (Masori) · ranged · preset',
      'Twisted bow (Masori) · ranged · preset',
      "Inquisitor's + Obligator · melee · preset",
    ]);
    expect(r.kitMarginal.map((m) => `+${m.slots}, ${Number.isFinite(m.seconds) ? 'finite' : '∞'}`)).toEqual(['+1, finite', '+1, finite', '+8, ∞']);
    expect(r.potions.map((p) => `${p.label} (${p.group})`)).toEqual(['Super combat (melee)', 'Ranging potion (ranged)']);
    expect([r.ring.policy, r.ring.ring]).toEqual(['camp-one', 'Ultor ring']);
    expect(r.rejected).toEqual([]);
    expect(r.alternatives.map((x) => `${x.label}: ${x.deltaSlots} — ${x.reason.replace(/[0-9.]+ s slower/, 'N s slower')}`)).toEqual([
      "melee + ranged + magic: Tumeken's shadow (Ancestral) / Inquisitor's + Obligator / Harmonised Nightmare staff / Harmonised Nightmare staff #4 / Twisted bow (Masori): 11 — does not fit (36 of 28 slots)",
      "melee + magic: Tumeken's shadow (Ancestral) / Inquisitor's + Obligator / Harmonised Nightmare staff / Harmonised Nightmare staff #4: 3 — N s slower",
      "ranged + magic: Tumeken's shadow (Ancestral) / Twisted bow (Masori) / Ascension crossbows + diamond (e) (Masori) / Ascension crossbows + onyx (e) (Masori): 1 — N s slower",
      "magic: Tumeken's shadow (Ancestral) / Harmonised Nightmare staff / Harmonised Nightmare staff #4: -5 — N s slower",
      "melee: Inquisitor's + Obligator: -9 — cannot clear the route",
      'ranged: Ascension crossbows + diamond (e) (Masori): -9 — cannot clear the route',
    ]);
    // phase 34: the alternatives carry their loadouts' weapons (icons)
    r.alternatives.forEach((x) => expect(x.weapons!.length).toBe(x.label.split(': ')[1].split(' / ').length));
    // "Spec plan" / the briefing's Bring and your share
    expect(r.specs.text).toBe('Bring: Zaryte crossbow, Burning claws, Crimson kisten, Surge potion');
    expect(r.specs.share!.reason).toMatch(/^your spec energy goes to your Zaryte crossbow specs .* — let a teammate carry Tonalztics \(most needed: [0-9] carriers\)$/);
    expect(r.specs.team!.steps!.map((st) => st.weapon).sort()).toEqual(['elderMaul', 'tonalztics', 'tonalztics', 'tonalztics', 'tonalztics']);
  }, 1800000);
});
