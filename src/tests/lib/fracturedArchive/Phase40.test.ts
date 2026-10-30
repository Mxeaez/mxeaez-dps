import { describe, expect, test } from '@jest/globals';
import { generateEmptyPlayer } from '@/state';
import {
  encounterTime, KitChoice, PhaseQuery, RAID_TIME_DEFAULTS, RaidKit, RaidTimeAssumptions, targetHp,
} from '@/lib/fracturedArchive/raidTime';
import {
  timeVariant, TimeVariant, VariantChoice, variantKit, variantRowDps,
} from '@/lib/fracturedArchive/variantBlend';
import {
  requiredVariantsFor, timeVariantsFor, variantEquipment, withTimeVariants, XARTH_FREEZER,
} from '@/lib/fracturedArchive/variants';
import { variantLines } from '@/lib/fracturedArchive/variantText';
import type { PlanResult, PlanVariant } from '@/lib/fracturedArchive/planner';
import { raidConfig } from '@/lib/raids';
import { validatePlanInputs } from '@/lib/raids/settings';
import { phase37Fixture } from '@/tests/utils/phase37';
import { headline } from '@/tests/utils/headlines';

/**
 * Phase 40 (ROADMAP 40): required variants (the FA's Xarth freezer). One player of the party casts Ice Barrage through
 * Xarth's phase 2 (50% of his HP, UNVERIFIED D37); the time model averages the team's DPS there.
 */

/** A toy kit: the same DPS on every phase (its loadout named after it). */
const constKit = (dps: number, name = `kit ${dps}`): RaidKit => ({
  best: (): KitChoice => ({ loadout: name, style: 'x', dps }),
});

const toyA = (variants?: TimeVariant[]): RaidTimeAssumptions => ({
  partySize: 6,
  drain: 'none',
  settings: RAID_TIME_DEFAULTS,
  fallbackFightSeconds: 90,
  ...(variants ? { variants } : {}),
});

const freezer = (v: number, partySize = 6): TimeVariant => timeVariant({
  id: `toy|${v}|${partySize}`, encounter: 'xarth', rowKeys: ['xarth'], share: 0.5, headcount: 1, partySize,
}, constKit(v, 'freezer'));

describe('variantRowDps (hand-computed)', () => {
  test('d 12, v 6, 6 players, 1 freezer, half the HP: 264 / 23', () => {
    // off the variant: 12; on it: (5 × 12 + 1 × 6) ÷ 6 = 11; harmonic blend 1 ÷ (0.5 ÷ 12 + 0.5 ÷ 11) = 2 × 12 × 11 ÷ 23
    expect(variantRowDps(12, 6, 6, 1, 0.5)).toBeCloseTo(264 / 23, 12);
    expect(264 / 23).toBeCloseTo(11.47826087, 8);
  });
  test('the variant player at your DPS, nobody else in the party, or no share: your DPS', () => {
    expect(variantRowDps(12, 12, 6, 1, 0.5)).toBeCloseTo(12, 12);
    expect(variantRowDps(12, 0, 1, 1, 0.5)).toBe(12);
    expect(variantRowDps(12, 0, 6, 1, 0)).toBe(12);
  });
  test('whole share, v = 0, party 2: half the team is idle', () => {
    expect(variantRowDps(10, 0, 2, 1, 1)).toBeCloseTo(5, 12);
  });
});

describe('Team DPS with the variant player (hand-computed)', () => {
  const hp = targetHp('xarth', undefined, 6);
  test('Xarth has 2600 HP at party 6 (infobox; HP scaling is identity, UNVERIFIED C1)', () => {
    expect(hp).toBe(2600);
  });
  test('Xarth: 1300 HP at 12 + 1300 HP at (5 × 12 + 6) ÷ 6 = 11 → 108.333 + 118.182 = 226.515 s (vs 216.667 s)', () => {
    const plain = encounterTime('xarth', constKit(12), toyA());
    const withV = encounterTime('xarth', constKit(12), toyA([freezer(6)]));
    expect(plain.seconds).toBeCloseTo(2600 / 12, 9);
    expect(withV.seconds).toBeCloseTo(1300 / 12 + 1300 / 11, 9);
    expect(withV.seconds).toBeCloseTo(226.5151515, 6);
    const c = withV.phases[0].choice as VariantChoice;
    expect(c.baseDps).toBe(12);
    expect(c.variantDps).toBe(6);
    expect(c.dps).toBeCloseTo(264 / 23, 12);
  });
  test('the team-DPS multiplier (6 players at your DPS) divides both halves: 226.515 ÷ 6 = 37.753 s', () => {
    const t = encounterTime('xarth', constKit(12), { ...toyA([freezer(6)]), dpsMultiplier: 6 }).seconds;
    // 1300 ÷ (6 × 12) + 1300 ÷ (6 × 11) = 18.0556 + 19.6970
    expect(t).toBeCloseTo(1300 / 72 + 1300 / 66, 9);
  });
  test('other encounters and routes without Xarth are untouched (Moia: 1 row, same seconds)', () => {
    const plain = encounterTime('moia', constKit(12), toyA());
    const withV = encounterTime('moia', constKit(12), toyA([freezer(6)]));
    expect(withV.seconds).toBe(plain.seconds);
    expect((withV.phases[0].choice as VariantChoice).baseDps).toBeUndefined();
  });
  test('the wrapper answers only the variant rows', () => {
    const k = variantKit(constKit(12), freezer(0));
    const q: PhaseQuery = {
      targetKey: 'xarth', drain: 'none', fightSeconds: 90, rowKey: 'xarth',
    };
    // v = 0: (5 × 12) ÷ 6 = 10 on half → 1 ÷ (0.5 ÷ 12 + 0.5 ÷ 10) = 120 ÷ 11
    expect(k.best(q)!.dps).toBeCloseTo(120 / 11, 12);
    expect(k.best({ ...q, rowKey: 'moia' })!.dps).toBe(12);
    expect(k.best({ ...q, rowKey: undefined })!.dps).toBe(12);
  });
  test('the variant kit is left out of JSON (memo keys hold its id only)', () => {
    const json = JSON.stringify(toyA([freezer(6)]));
    expect(json).toContain('"id":"toy|6|6"');
    expect(json).not.toContain('freezer"');
  });
});

describe('which plans get the variant', () => {
  const fa = raidConfig('fractured-archive').defaultAssumptions;
  test('FA at party 2-8 has the Xarth freezer; party 1 (nobody else to freeze) and the other raids none', () => {
    expect(requiredVariantsFor({ ...fa, partySize: 6 }).map((v) => v.id)).toEqual(['xarth-freezer']);
    expect(requiredVariantsFor({ ...fa, partySize: 2 }).map((v) => v.id)).toEqual(['xarth-freezer']);
    expect(requiredVariantsFor({ ...fa, partySize: 1 })).toEqual([]);
    expect(requiredVariantsFor({ ...raidConfig('toa').defaultAssumptions, partySize: 4 })).toEqual([]);
  });
  test('the freezer loadout: Kodai wand + Ancestral, Ice Barrage; unowned pieces leave their slot empty; no Kodai, no variant', () => {
    expect(XARTH_FREEZER.preset.spells).toEqual(['Ice Barrage']);
    expect(XARTH_FREEZER.spellbook).toBe('ancients');
    const eq = variantEquipment(XARTH_FREEZER)!;
    expect(eq.weapon!.name).toBe('Kodai wand');
    expect(eq.body!.name).toBe('Ancestral robe top');
    expect(variantEquipment(XARTH_FREEZER, ['Ancestral robe top'])!.body).toBeUndefined();
    expect(variantEquipment(XARTH_FREEZER, ['Kodai wand'])).toBeNull();
  });
  test('time variants: one per def with the party size, and only when there is one', () => {
    const eq = variantEquipment(XARTH_FREEZER)!;
    const vs = timeVariantsFor([{ def: XARTH_FREEZER, equipment: eq, key: 'k' }], generateEmptyPlayer(), fa);
    expect(vs.map((v) => [v.encounter, v.rowKeys, v.share, v.headcount, v.partySize])).toEqual([['xarth', ['xarth'], 0.5, 1, 6]]);
    expect(withTimeVariants(toyA(), [])).toEqual(toyA());
  });
});

describe('the fa headline (phase37/fa.json)', () => {
  const fx = phase37Fixture('fa') as PlanResult & { plannedRoute: { encounters: { id: string, seconds: number }[] } };
  const v = fx.variants!.find((x) => x.id === 'xarth-freezer')!;
  test('1 player: + Ancients (Xarth corpses) on the Xarth route; the kit is unchanged', () => {
    expect(headline('fa').route).toContain('xarth');
    expect(v.onRoute).toBe(true);
    expect(v.headcount).toBe(1);
    expect(v.label).toBe('+ Ancients (Xarth corpses)');
    expect(headline('fa').kit).toEqual(['Ascension crossbows + diamond (e) (Masori)', 'Twisted bow (Masori)', "Inquisitor's + Obligator"]);
  });
  test('the blend on Xarth is the hand formula of the pinned DPS (5 × your DPS + 1 × the freezer\'s, half the HP)', () => {
    expect(v.teamDps).toBeCloseTo(variantRowDps(v.baseDps, v.variantDps, 6, 1, 0.5), 9);
    // the freezer's Ice Barrage barely hurts Xarth (Magic 350): under 2 DPS against ~13.9
    expect(v.variantDps).toBeGreaterThan(1);
    expect(v.variantDps).toBeLessThan(2);
    expect(v.baseDps).toBeGreaterThan(13);
  });
  test('the switch fits 28 slots: +9 items (8 freezer pieces not in the kit + the heart), 4 free, 5 brews left behind', () => {
    expect(v.extraItems.map((it) => it.name)).toContain('Kodai wand');
    expect(v.extraItems.map((it) => it.name)).toContain('Saturated heart');
    expect(v.extraItems.length).toBe(9);
    expect(v.freeSlots).toBe(4);
    expect(v.droppedSupplies).toEqual([{ type: 'brew', count: 5 }]);
    expect(v.overfull).toBe(false);
  });
  test('the Plan tab lines', () => {
    const l = variantLines(v, 6, 'Xarth');
    expect(l.head).toBe('1 player: + Ancients (Xarth corpses)');
    expect(l.slots).toBe('+9 items: 4 free slots, then leave 5 Saradomin brew behind');
    expect(l.team).toMatch(/^Xarth phase 2 \(50% of the HP\): 5 × 13\.\d\d \+ 1 × 1\.\d\d \(Ice Barrage\) ÷ 6 = 11\.\d\d DPS per player there; \+\d+\.\d s on the route \(in the times above\)$/);
    expect(l.mine).toBe('The kit above + Freezer: Kodai + Ice Barrage (Ancestral) (Ancient spellbook)');
  });
});

describe('variantLines (hand-made variant)', () => {
  const v: PlanVariant = {
    id: 'xarth-freezer',
    label: '+ Ancients (Xarth corpses)',
    onRoute: true,
    headcount: 1,
    encounter: 'xarth',
    spellbook: 'ancients',
    role: 'r',
    share: 0.5,
    where: 'phase 2',
    loadout: {
      key: 'k', label: 'L', kind: 'preset', group: 'magic', equipment: {}, options: [{ style: { name: 'Spell', type: 'magic', stance: 'Autocast' } as never, spell: 'Ice Barrage' }], source: 's',
    },
    extraItems: [{ id: 1, name: 'Kodai wand' } as never],
    freeSlots: 3,
    droppedSupplies: [],
    overfull: false,
    baseDps: 12,
    variantDps: 6,
    teamDps: 264 / 23,
    seconds: 9.8484848,
  };
  test('12 and 6 at party 6: (5 × 12 + 6) ÷ 6 = 11.00', () => {
    const l = variantLines(v, 6, 'Xarth');
    expect(l.team).toBe('Xarth phase 2 (50% of the HP): 5 × 12.00 + 1 × 6.00 (Ice Barrage) ÷ 6 = 11.00 DPS per player there; +9.8 s on the route (in the times above)');
    expect(l.slots).toBe('+1 item: 1 free slot');
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
