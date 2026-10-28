import { describe, expect, test } from '@jest/globals';
import { faRows, otherRaidsSlowTest } from '@/tests/utils/otherRaids';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { generateEmptyPlayer } from '@/state';
import {
  COMFORT_SUPPLY_TYPES, DEFAULT_RING_POLICY, plan, PlanInputs, PlanResult, planItemByName, PlanTuning, RING_POLICIES, SUPPLY_TYPES,
} from '@/lib/fracturedArchive/planner';
import { PresetDef } from '@/lib/fracturedArchive/presets';
import {
  CHAMBERS_OF_XERIC_RAID, FRACTURED_ARCHIVE_RAID, RaidConfig, RAIDS,
} from '@/lib/raids';
import { SATURATED_HEART } from '@/lib/raids/planDefaults';
import { slowTest } from '@/tests/utils/slow';

// Phase 30: Plan tab polish (no maths change) — wiki images for the comfort supplies, the ring policy with the inputs,
// empty "Items I always bring" defaults (FA / ToB keep the heart until phase 31), the greedy carrier steps re-timed on
// the returned kit. The drain-line wording ("needed" at the threshold) is in Phase29.test.ts.

const ROOT = join(__dirname, '..', '..', '..', '..');

describe('comfort supply icons', () => {
  test('brew / restore / food use the wiki inventory images (bundled); "Other" keeps the generic flask', () => {
    const img = Object.fromEntries(SUPPLY_TYPES.map((s) => [s.id, s.image]));
    expect(img).toMatchObject({
      brew: 'Saradomin brew(4).png', restore: 'Super restore(4).png', food: 'Anglerfish.png', other: null,
    });
    ['Saradomin brew(4).png', 'Super restore(4).png', 'Anglerfish.png'].forEach((f) => {
      const p = join(ROOT, 'src', 'public', 'img', 'supplies', f);
      expect(existsSync(p)).toBe(true);
      expect(f).not.toMatch(/%/);
      // a PNG (signature), not an error page
      expect(readFileSync(p).subarray(1, 4).toString('latin1')).toBe('PNG');
    });
    // the PlanView imports them (static imports: shown in dev without a CDN deploy)
    const view = readFileSync(join(ROOT, 'src', 'app', 'components', 'bestSetup', 'PlanView.tsx'), 'utf-8');
    ['Saradomin brew(4).png', 'Super restore(4).png', 'Anglerfish.png'].forEach((f) => expect(view).toContain(`@/public/img/supplies/${f}`));
    expect(COMFORT_SUPPLY_TYPES).toEqual(['brew', 'restore', 'food', 'other']);
  });
});

describe('ring policy with the inputs', () => {
  test('the dropdown sits in the supplies row, not under Advanced; the policies and the default are unchanged', () => {
    const view = readFileSync(join(ROOT, 'src', 'app', 'components', 'bestSetup', 'PlanView.tsx'), 'utf-8');
    const supplies = view.indexOf('data-testid="plan-supplies"');
    const ring = view.indexOf('data-testid="plan-ring-policy"');
    const advanced = view.indexOf('data-testid="plan-advanced"');
    expect(supplies).toBeGreaterThan(0);
    expect(ring).toBeGreaterThan(supplies);
    expect(ring).toBeLessThan(advanced);
    expect(RING_POLICIES.map((p) => p.id)).toEqual(['camp-one', 'camp-lightbearer', 'switch']);
    expect(DEFAULT_RING_POLICY).toBe('camp-one');
  });
});

describe('empty pinned defaults', () => {
  // phase 31: the FA / ToB heart left too (magic's kit potion)
  test.each(faRows(RAIDS).map((r) => [r.id, r] as const))('%s: nothing pinned (phase 31: not even the heart)', (_, raid) => {
    expect(raid.planDefaults.pinned).toEqual([]);
    expect(raid.planDefaults.pinned).not.toContain(SATURATED_HEART);
  });

  /** CoX: the Guardians take damage from pickaxes only; with nothing pinned the planner adds the pickaxe itself. */
  const reducedCox = (raid: RaidConfig): PlanTuning => ({
    model: raid.time,
    // the first preset of each style + the pickaxe preset (as CrossRaid's reduced plans)
    presets: [
      ...(['melee', 'ranged', 'magic'] as const).map((g) => raid.presets.find((p) => p.group === g)!),
      raid.presets.find((p) => p.name === 'Dragon pickaxe (Torva)')!,
    ],
    search: { weapons: ['Scythe of Vitur', "Tumeken's shadow", 'Twisted bow'], maxPasses: 1 },
    perGroupWeapons: 1,
    perWeapon: 1,
    bases: 1,
    partners: 1,
    seeds: 2,
  });
  // phase 38f: slow (21 s); CoX.test.ts keeps a reduced CoX plan with a pickaxe for the Guardians
  otherRaidsSlowTest('CoX: the Dragon pickaxe is not pinned, yet every plan carries it (the Guardians need it) and clears the raid', () => {
    const raid = CHAMBERS_OF_XERIC_RAID;
    expect(raid.presets.some((p) => p.name === 'Dragon pickaxe (Torva)')).toBe(true);
    const inputs: PlanInputs = {
      basePlayer: generateEmptyPlayer(),
      assumptions: raid.defaultAssumptions,
      drain: 'team',
      settings: raid.defaultTimeSettings,
      route: 'all',
      pinned: raid.planDefaults.pinned.map((n) => planItemByName(n).id),
      nonItemSlots: raid.planDefaults.nonItemSlots,
      supplies: raid.defaultSupplies,
    };
    const r: PlanResult = plan(inputs, reducedCox(raid));
    const rt = r.comparison!.routes[r.planned];
    expect(Number.isFinite(rt.seconds)).toBe(true);
    const guardians = rt.encounters.find((e) => e.id === 'cox-guardians')!;
    expect(Number.isFinite(guardians.seconds)).toBe(true);
    expect(r.kit.some((c) => c.equipment.weapon?.name === 'Dragon pickaxe')).toBe(true);
    expect(r.pinnedItems).toEqual([]);
  }, 300000);
});

describe('team carrier steps re-timed on the returned kit', () => {
  const FA = FRACTURED_ARCHIVE_RAID;
  const preset = (name: string): PresetDef => FA.presets.find((x) => x.name === name)!;
  // phase 38f: slow (22 s); Phase29 'planner picks the carriers' checks the steps against the briefing fast
  slowTest('each step = the route time of the returned kit with the carriers so far (the last = the kit\'s time)', () => {
    const r = plan({
      basePlayer: generateEmptyPlayer(),
      assumptions: FA.defaultAssumptions,
      drain: 'team',
      settings: FA.defaultTimeSettings,
      route: 'all',
      pinned: FA.planDefaults.pinned.map((n) => planItemByName(n).id),
      nonItemSlots: FA.planDefaults.nonItemSlots,
      supplies: FA.defaultSupplies,
      specMode: 'auto',
      carrierMode: 'auto',
    }, {
      model: FA.time,
      presets: [preset('Twisted bow (Masori)'), preset('Inquisitor\'s mace (full crush)')],
      search: { weapons: ['Twisted bow'], maxPasses: 1 },
      perGroupWeapons: 1,
      perWeapon: 1,
      bases: 1,
      partners: 1,
      seeds: 2,
    });
    // phase 38g: the carriers are taken by headcount, not added one by one on the route time: no steps any more
    expect(r.specs.team!.steps).toBeUndefined();
    expect(r.specs.team!.mode).toBe('auto');
  }, 300000);
});
