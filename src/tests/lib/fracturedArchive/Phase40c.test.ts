import { describe, expect, test } from '@jest/globals';
import { getTestMonster } from '@/tests/utils/TestUtils';
import { generateEmptyPlayer } from '@/state';
import PlayerVsNPCCalc from '@/lib/PlayerVsNPCCalc';
import { Prayer } from '@/enums/Prayer';
import { Player } from '@/types/Player';
import { Monster } from '@/types/Monster';
import { prayerFor } from '@/lib/fracturedArchive/loadout';
import { applyPresetToPlayer, presetStyles } from '@/lib/fracturedArchive/bestSetup';
import { BestSetupAssumptions, DEFAULT_ASSUMPTIONS, PRESETS } from '@/lib/fracturedArchive/presets';
import { specProfile } from '@/lib/fracturedArchive/specs';
import { damageSpecProfile } from '@/lib/fracturedArchive/damageSpecs';
import { searchCacheKey } from '@/lib/fracturedArchive/search';
import { raidConfig, RAIDS } from '@/lib/raids';
import {
  defaultSettings, parseSettings, serialiseSettings, SETTINGS_VERSION,
} from '@/lib/raids/settings';

/**
 * Phase 40c (ROADMAP 40c): "Rigour unlocked" / "Augury unlocked" (default ticked, headlines unchanged). Unticked,
 * ranged setups pray Eagle Eye and magic setups Mystic Might (Search / Plan / Summary, presets, specs).
 */
const A = DEFAULT_ASSUMPTIONS;
const NO_RIGOUR: BestSetupAssumptions = { ...A, rigourUnlocked: false };
const NO_AUGURY: BestSetupAssumptions = { ...A, auguryUnlocked: false };
const preset = (name: string) => PRESETS.find((p) => p.name === name)!;
const dps = (p: Player, m: Monster) => new PlayerVsNPCCalc(p, m, { loadoutName: '1' }).getDps();

describe('phase 40c: prayer per style group', () => {
  test('defaults: both unlocked, so Piety / Rigour / Augury as before', () => {
    expect([A.rigourUnlocked, A.auguryUnlocked]).toEqual([true, true]);
    expect((['melee', 'ranged', 'magic'] as const).map((g) => prayerFor(g, A)))
      .toEqual([Prayer.PIETY, Prayer.RIGOUR, Prayer.AUGURY]);
  });

  test('unticked: Eagle Eye / Mystic Might; melee (Piety / Zeal) is unaffected', () => {
    const none = { ...A, rigourUnlocked: false, auguryUnlocked: false };
    expect(prayerFor('ranged', none)).toBe(Prayer.EAGLE_EYE);
    expect(prayerFor('magic', none)).toBe(Prayer.MYSTIC_MIGHT);
    expect(prayerFor('melee', none)).toBe(Prayer.PIETY);
    expect(prayerFor('melee', { ...none, useZeal: true })).toBe(Prayer.ZEAL);
    expect(prayerFor('magic', NO_RIGOUR)).toBe(Prayer.AUGURY);
    expect(prayerFor('ranged', NO_AUGURY)).toBe(Prayer.RIGOUR);
  });

  test('every raid defaults to both unlocked', () => {
    RAIDS.forEach((r) => {
      expect([r.defaultAssumptions.rigourUnlocked, r.defaultAssumptions.auguryUnlocked]).toEqual([true, true]);
    });
  });
});

describe('phase 40c: presets and specs follow the boxes', () => {
  const m = getTestMonster('Xarth');

  test('Twisted bow preset prays Eagle Eye without Rigour, and hits less', () => {
    const tbow = preset('Twisted bow (Masori)');
    const style = presetStyles(tbow)[0];
    const withRigour = applyPresetToPlayer(generateEmptyPlayer(), tbow, style, null, m, A);
    const without = applyPresetToPlayer(generateEmptyPlayer(), tbow, style, null, m, NO_RIGOUR);
    expect(withRigour.prayers).toEqual([Prayer.RIGOUR]);
    expect(without.prayers).toEqual([Prayer.EAGLE_EYE]);
    expect(dps(without, m)).toBeLessThan(dps(withRigour, m));
  });

  test("Tumeken's shadow preset prays Mystic Might without Augury, and hits less", () => {
    const shadow = preset("Tumeken's shadow (Ancestral)");
    const style = presetStyles(shadow)[0];
    const withAugury = applyPresetToPlayer(generateEmptyPlayer(), shadow, style, null, m, A);
    const without = applyPresetToPlayer(generateEmptyPlayer(), shadow, style, null, m, NO_AUGURY);
    expect(withAugury.prayers).toEqual([Prayer.AUGURY]);
    expect(without.prayers).toEqual([Prayer.MYSTIC_MIGHT]);
    expect(dps(without, m)).toBeLessThan(dps(withAugury, m));
  });

  test('Ayak drain spec (magic) is less accurate without Augury; melee drain spec unchanged', () => {
    expect(specProfile(m, 'ayak', undefined, NO_AUGURY).attackRoll)
      .toBeLessThan(specProfile(m, 'ayak', undefined, A).attackRoll);
    expect(specProfile(m, 'elderMaul', undefined, NO_AUGURY).attackRoll)
      .toBe(specProfile(m, 'elderMaul', undefined, A).attackRoll);
  });

  test('ZCB damage spec (ranged) deals less without Rigour', () => {
    const best = (a: BestSetupAssumptions) => Math.max(...damageSpecProfile(m, 'zcb', a).variants.map((v) => v.expected));
    expect(best(NO_RIGOUR)).toBeLessThan(best(A));
  });

  test('a changed box is a different Search cache key', () => {
    const q = { targetKey: 'xarth', drain: 'none' } as Parameters<typeof searchCacheKey>[0];
    const k = searchCacheKey(q, A);
    expect(searchCacheKey(q, NO_RIGOUR)).not.toBe(k);
    expect(searchCacheKey(q, NO_AUGURY)).not.toBe(k);
  });
});

describe('phase 40c: saved settings', () => {
  const FA = raidConfig('fractured-archive');

  test('both boxes round-trip through the saved settings', () => {
    const s = defaultSettings();
    const fa = s.raids[FA.id];
    s.raids[FA.id] = { ...fa, assumptions: { ...fa.assumptions, rigourUnlocked: false, auguryUnlocked: false } };
    const back = parseSettings(serialiseSettings(s)!).raids[FA.id].assumptions;
    expect([back.rigourUnlocked, back.auguryUnlocked]).toEqual([false, false]);
  });

  test('settings saved before 40c (no fields) or with a wrong type keep both unlocked', () => {
    const got = parseSettings(JSON.stringify({
      version: SETTINGS_VERSION,
      raids: { [FA.id]: { assumptions: { useZeal: true, rigourUnlocked: 'no' } } },
    })).raids[FA.id].assumptions;
    expect(got.useZeal).toBe(true);
    expect([got.rigourUnlocked, got.auguryUnlocked]).toEqual([true, true]);
  });
});
