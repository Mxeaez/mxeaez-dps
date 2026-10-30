import { describe, expect, test } from '@jest/globals';
import {
  encounterTime, KitChoice, PhaseQuery, RAID_TIME_DEFAULTS, RaidKit, RaidTimeAssumptions, targetHp,
} from '@/lib/fracturedArchive/raidTime';
import {
  TimeVariant, VariantChoice, variantKit, variantRowDps,
} from '@/lib/fracturedArchive/variantBlend';
import {
  freezerSwitch, requiredVariantsFor, timeVariantsFor, variantKeep, variantPieces, withTimeVariants, XARTH_FREEZER,
} from '@/lib/fracturedArchive/variants';
import { variantLines } from '@/lib/fracturedArchive/variantText';
import type { PlanResult, PlanVariant } from '@/lib/fracturedArchive/planner';
import { raidConfig } from '@/lib/raids';
import { validatePlanInputs } from '@/lib/raids/settings';
import { phase37Fixture } from '@/tests/utils/phase37';
import { toPlayerEquipment } from '@/lib/fracturedArchive/planner';
import { headline } from '@/tests/utils/headlines';

/**
 * Phase 40 (ROADMAP 40) + rework: the FA's Xarth freezer. One player of the party switches to a ≥ 75 magic attack
 * switch each corpse wave, Ice Barrages the corpses and swaps back to DPS on Xarth with the kit: on phase 2 (50% of his
 * HP, UNVERIFIED D37) they keep 1 − 3.6 s ÷ 18 s = 80% of their DPS; the time model averages the team's DPS there.
 */

/** A toy kit: the same DPS on every phase. */
const constKit = (dps: number): RaidKit => ({
  best: (): KitChoice => ({ loadout: `kit ${dps}`, style: 'x', dps }),
});

const toyA = (variants?: TimeVariant[]): RaidTimeAssumptions => ({
  partySize: 6,
  drain: 'none',
  settings: RAID_TIME_DEFAULTS,
  fallbackFightSeconds: 90,
  ...(variants ? { variants } : {}),
});

const freezer = (keep: number, partySize = 6): TimeVariant => ({
  id: 'toy', encounter: 'xarth', rowKeys: ['xarth'], share: 0.5, headcount: 1, partySize, keep,
});

describe('variantRowDps (hand-computed)', () => {
  test('d 12, v 6, 6 players, 1 freezer, half the HP: 264 / 23', () => {
    // off the variant: 12; on it: (5 × 12 + 1 × 6) ÷ 6 = 11; harmonic blend 1 ÷ (0.5 ÷ 12 + 0.5 ÷ 11) = 2 × 12 × 11 ÷ 23
    expect(variantRowDps(12, 6, 6, 1, 0.5)).toBeCloseTo(264 / 23, 12);
  });
  test('the variant player at your DPS, nobody else in the party, or no share: your DPS', () => {
    expect(variantRowDps(12, 12, 6, 1, 0.5)).toBeCloseTo(12, 12);
    expect(variantRowDps(12, 0, 1, 1, 0.5)).toBe(12);
    expect(variantRowDps(12, 0, 6, 1, 0)).toBe(12);
  });
});

describe('the freezer\'s DPS (hand-computed)', () => {
  test('keeps 1 − 6 ticks ÷ 30 ticks = 0.8 of their DPS (Ice Barrage 5-tick attack + ~1 tick misalignment, one wave per 18 s)', () => {
    expect(XARTH_FREEZER.castSeconds).toBeCloseTo(3.6, 12);
    expect(XARTH_FREEZER.waveSeconds).toBeCloseTo(18, 12);
    expect(variantKeep(XARTH_FREEZER)).toBeCloseTo(0.8, 12);
    expect(variantKeep({ castSeconds: 20, waveSeconds: 18 })).toBe(0);
  });
});

describe('Team DPS with the freezer (hand-computed)', () => {
  const hp = targetHp('xarth', undefined, 6);
  test('Xarth has 2600 HP at party 6 (infobox; HP scaling is identity, UNVERIFIED C1)', () => {
    expect(hp).toBe(2600);
  });
  test('d 12, freezer keeps 0.8: phase 2 team (5 × 12 + 9.6) ÷ 6 = 11.6 → 1300/12 + 1300/11.6 = 108.333 + 112.069 = 220.402 s (vs 216.667)', () => {
    const plain = encounterTime('xarth', constKit(12), toyA());
    const withV = encounterTime('xarth', constKit(12), toyA([freezer(0.8)]));
    expect(plain.seconds).toBeCloseTo(2600 / 12, 9);
    expect(withV.seconds).toBeCloseTo(1300 / 12 + 1300 / 11.6, 9);
    expect(withV.seconds).toBeCloseTo(220.4023, 4);
    const c = withV.phases[0].choice as VariantChoice;
    expect(c.baseDps).toBe(12);
    expect(c.variantDps).toBeCloseTo(9.6, 12);
    // 1 ÷ (0.5 ÷ 12 + 0.5 ÷ 11.6) = 2 × 12 × 11.6 ÷ 23.6
    expect(c.dps).toBeCloseTo((2 * 12 * 11.6) / 23.6, 12);
  });
  test('keep 0.5 (the old 6-of-12 case): 1300/12 + 1300/11 = 226.515 s', () => {
    expect(encounterTime('xarth', constKit(12), toyA([freezer(0.5)])).seconds).toBeCloseTo(1300 / 12 + 1300 / 11, 9);
  });
  test('the team-DPS multiplier divides both halves: 1300 ÷ 72 + 1300 ÷ 69.6', () => {
    const t = encounterTime('xarth', constKit(12), { ...toyA([freezer(0.8)]), dpsMultiplier: 6 }).seconds;
    expect(t).toBeCloseTo(1300 / 72 + 1300 / 69.6, 9);
  });
  test('other encounters are untouched (Moia)', () => {
    const plain = encounterTime('moia', constKit(12), toyA());
    const withV = encounterTime('moia', constKit(12), toyA([freezer(0.8)]));
    expect(withV.seconds).toBe(plain.seconds);
    expect((withV.phases[0].choice as VariantChoice).baseDps).toBeUndefined();
  });
  test('the wrapper answers only the variant rows', () => {
    const k = variantKit(constKit(12), freezer(0));
    const q: PhaseQuery = {
      targetKey: 'xarth', drain: 'none', fightSeconds: 90, rowKey: 'xarth',
    };
    // keep 0: (5 × 12) ÷ 6 = 10 on half → 1 ÷ (0.5 ÷ 12 + 0.5 ÷ 10) = 120 ÷ 11
    expect(k.best(q)!.dps).toBeCloseTo(120 / 11, 12);
    expect(k.best({ ...q, rowKey: 'moia' })!.dps).toBe(12);
    expect(k.best({ ...q, rowKey: undefined })!.dps).toBe(12);
  });
});

describe('which plans get the variant; the switch', () => {
  const fa = raidConfig('fractured-archive').defaultAssumptions;
  test('FA at party 2-8 has the Xarth freezer; party 1 and the other raids none', () => {
    expect(requiredVariantsFor({ ...fa, partySize: 6 }).map((v) => v.id)).toEqual(['xarth-freezer']);
    expect(requiredVariantsFor({ ...fa, partySize: 2 }).map((v) => v.id)).toEqual(['xarth-freezer']);
    expect(requiredVariantsFor({ ...fa, partySize: 1 })).toEqual([]);
    expect(requiredVariantsFor({ ...raidConfig('toa').defaultAssumptions, partySize: 4 })).toEqual([]);
  });
  test('time variants are plain data: party size and keep', () => {
    expect(timeVariantsFor([XARTH_FREEZER], fa)).toEqual([{
      id: 'xarth-freezer', encounter: 'xarth', rowKeys: ['xarth'], share: 0.5, headcount: 1, partySize: 6, keep: 0.8,
    }].map((x) => ({ ...x, keep: variantKeep(XARTH_FREEZER) })));
    expect(withTimeVariants(toyA(), [])).toEqual(toyA());
  });
  test('cheapest switch ≥ 75 magic attack: Kodai (28) + Ancestral top (35) + ward (25) = 88 (no pair reaches 75: 35 + 28 = 63)', () => {
    const sw = freezerSwitch(XARTH_FREEZER, variantPieces(XARTH_FREEZER))!;
    expect(sw.slots).toEqual(['weapon', 'body', 'shield']);
    expect(sw.magic).toBe(88);
  });
  test('scored worn over the fa Xarth loadout (Inquisitor + Obligator): Kodai + top + ward = 64, Kodai + top + gauntlets = 75', () => {
    const fx = phase37Fixture('fa') as PlanResult;
    const inq = fx.kit.find((c) => c.label.startsWith('Inquisitor'))!;
    const base = toPlayerEquipment(inq.equipment);
    // rest of the loadout: cape 1, neck −6, feet 11, head −5, legs −9 (Obligator 0, two-handed: a ward comes with Kodai)
    // Kodai 28 + top 35 + ward 25 + 1 − 6 − 16 (Ferocious gloves) + 11 − 5 − 9 = 64 < 75
    // Kodai 28 + top 35 + gauntlets 20 + 1 − 6 + 11 − 5 − 9 = 75
    const sw = freezerSwitch(XARTH_FREEZER, variantPieces(XARTH_FREEZER), () => false, base)!;
    expect(sw).toEqual({ slots: ['weapon', 'body', 'hands'], magic: 75 });
    const pieces = variantPieces(XARTH_FREEZER);
    expect(freezerSwitch({ ...XARTH_FREEZER, prefer: ['weapon', 'body', 'shield'] }, { weapon: pieces.weapon, body: pieces.body, shield: pieces.shield }, () => false, base)).toBeNull();
  });
  test('without Kodai: top 35 + ward 25 + bottom 26 = 86; without anything, null', () => {
    const sw = freezerSwitch(XARTH_FREEZER, variantPieces(XARTH_FREEZER, ['Kodai wand']))!;
    expect(sw.slots).toEqual(['body', 'shield', 'legs']);
    expect(sw.magic).toBe(86);
    expect(freezerSwitch(XARTH_FREEZER, {})).toBeNull();
  });
  test('items the kit already carries are free: with the ward and bottom in the kit, Kodai + ward + bottom (28 + 25 + 26 = 79, 1 extra) beats Kodai + top + ward (2 extra)', () => {
    const pieces = variantPieces(XARTH_FREEZER);
    const inKit = (id: number) => id === pieces.shield!.id || id === pieces.legs!.id;
    // 1 extra either way with the top instead of Kodai (35 + 25 + 26 = 86); Kodai is preferred (the user's switch)
    expect(freezerSwitch(XARTH_FREEZER, pieces, inKit)).toEqual({ slots: ['weapon', 'shield', 'legs'], magic: 79 });
  });
});

describe('the fa headline (phase37/fa.json)', () => {
  const fx = phase37Fixture('fa') as PlanResult;
  const v = fx.variants!.find((x) => x.id === 'xarth-freezer')!;
  test('1 player freezes on the Xarth route; the kit is unchanged', () => {
    expect(headline('fa').route).toContain('xarth');
    expect(v.onRoute).toBe(true);
    expect(v.headcount).toBe(1);
    expect(v.label).toBe('freezes corpses (Ice Barrage, ≥75 magic attack: Kodai wand + Ancestral robe top + Confliction gauntlets), then back to DPS');
    expect(headline('fa').kit).toEqual(['Ascension crossbows + diamond (e) (Masori)', 'Twisted bow (Masori)', "Inquisitor's + Obligator"]);
  });
  test('the blend on Xarth is the hand formula of the pinned DPS (freezer at 0.8 × yours, half the HP)', () => {
    expect(v.variantDps).toBeCloseTo(0.8 * v.baseDps, 9);
    expect(v.teamDps).toBeCloseTo(variantRowDps(v.baseDps, v.variantDps, 6, 1, 0.5), 9);
  });
  test('the switch worn over Inquisitor + Obligator (Xarth): 3 items the kit lacks, 75 worn, in its 4 free slots (display only)', () => {
    expect(v.switchItems.map((it) => it.name)).toEqual(['Kodai wand', 'Ancestral robe top', 'Confliction gauntlets']);
    expect(v.magicAttack).toBe(75);
    expect(v.extraItems.length).toBe(3);
    expect(v.freeSlots).toBe(4);
    expect(v.droppedSupplies).toEqual([]);
  });
  test('the Plan tab lines', () => {
    const l = variantLines(v, 6, 'Xarth');
    expect(l.head).toBe('1 player: freezes corpses (Ice Barrage, ≥75 magic attack: Kodai wand + Ancestral robe top + Confliction gauntlets), then back to DPS');
    expect(l.slots).toBe('+3 items: 3 free slots (75 magic attack worn; the freezer\'s inventory, not yours)');
    expect(l.role).toBe('Ancient spellbook; one corpse wave every 18.0 s, 3.6 s each (Ice Barrage + timer misalignment): 80% of their DPS on Xarth phase 2.');
    expect(l.team).toMatch(/^Xarth phase 2 \(50% of the HP\): \(5 × \d+\.\d\d \+ 1 × \d+\.\d\d\) ÷ 6 = \d+\.\d\d DPS per player there; ≈ \+\d+\.\d s \(same spec plan\)$/);
  });
});

describe('variantLines (hand-made variant)', () => {
  const v: PlanVariant = {
    id: 'xarth-freezer',
    label: 'L',
    onRoute: true,
    headcount: 1,
    encounter: 'xarth',
    spellbook: 'ancients',
    spell: 'Ice Barrage',
    share: 0.5,
    where: 'phase 2',
    keep: 0.8,
    castSeconds: 3.6,
    waveSeconds: 18,
    switchItems: [{ id: 1, name: 'Kodai wand' } as never],
    magicAttack: 28,
    minMagicAttack: 75,
    extraItems: [{ id: 1, name: 'Kodai wand' } as never],
    freeSlots: 0,
    droppedSupplies: [{ type: 'brew', count: 1 }],
    overfull: false,
    baseDps: 12,
    variantDps: 9.6,
    teamDps: (2 * 12 * 11.6) / 23.6,
    seconds: 3.7356,
  };
  test('12 and 9.6 at party 6: (5 × 12 + 9.6) ÷ 6 = 11.60', () => {
    const l = variantLines(v, 6, 'Xarth');
    expect(l.team).toBe('Xarth phase 2 (50% of the HP): (5 × 12.00 + 1 × 9.60) ÷ 6 = 11.60 DPS per player there; ≈ +3.7 s (same spec plan)');
    expect(l.slots).toBe('+1 item: 0 free slots, then leave 1 Saradomin brew behind (28 magic attack worn; the freezer\'s inventory, not yours)');
    expect(l.head).toBe('1 player: L');
  });
});

describe('saved setting: "I\'m this player"', () => {
  const raid = raidConfig('fractured-archive');
  const a = raid.defaultAssumptions;
  test('kept when a list of ids, dropped otherwise (missing by default)', () => {
    expect(validatePlanInputs(raid, { variantMe: ['xarth-freezer'] }, a).variantMe).toEqual(['xarth-freezer']);
    expect(validatePlanInputs(raid, { variantMe: [] }, a).variantMe).toBeUndefined();
    expect(validatePlanInputs(raid, { variantMe: [3, 'x', 'x'] }, a).variantMe).toEqual(['x']);
    expect(validatePlanInputs(raid, {}, a).variantMe).toBeUndefined();
  });
});
