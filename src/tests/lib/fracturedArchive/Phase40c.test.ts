import { describe, expect, test } from '@jest/globals';
import { getTestMonster } from '@/tests/utils/TestUtils';
import { generateEmptyPlayer } from '@/state';
import PlayerVsNPCCalc from '@/lib/PlayerVsNPCCalc';
import { Prayer } from '@/enums/Prayer';
import { Player } from '@/types/Player';
import { Monster } from '@/types/Monster';
import { prayerFor } from '@/lib/fracturedArchive/loadout';
import { applyPresetToPlayer, presetStyles } from '@/lib/fracturedArchive/bestSetup';
import {
  BestSetupAssumptions, DEFAULT_ASSUMPTIONS, MAGIC_PRAYERS, PRESETS, RANGED_PRAYERS,
} from '@/lib/fracturedArchive/presets';
import { specProfile } from '@/lib/fracturedArchive/specs';
import { damageSpecProfile } from '@/lib/fracturedArchive/damageSpecs';
import { searchCacheKey } from '@/lib/fracturedArchive/search';
import { raidConfig, RAIDS } from '@/lib/raids';
import {
  defaultSettings, parseSettings, serialiseSettings, SETTINGS_VERSION,
} from '@/lib/raids/settings';

/**
 * Phase 40c (ROADMAP 40c) and 40c-2: the FA Assumptions box's "Ranged prayer" (Rigour / Deadeye / Eagle Eye) and
 * "Magic prayer" (Augury / Mystic Vigour / Mystic Might), default Rigour / Augury (headlines unchanged). Every
 * preset, Search, Summary, Plan and spec player prays the chosen one.
 */
const A = DEFAULT_ASSUMPTIONS;
const ranged = (p: Prayer): BestSetupAssumptions => ({ ...A, rangedPrayer: p });
const magic = (p: Prayer): BestSetupAssumptions => ({ ...A, magicPrayer: p });
const preset = (name: string) => PRESETS.find((p) => p.name === name)!;
const dps = (p: Player, m: Monster) => new PlayerVsNPCCalc(p, m, { loadoutName: '1' }).getDps();

describe('phase 40c: prayer per style group', () => {
  test('defaults: Piety / Rigour / Augury as before, in every raid', () => {
    expect((['melee', 'ranged', 'magic'] as const).map((g) => prayerFor(g, A)))
      .toEqual([Prayer.PIETY, Prayer.RIGOUR, Prayer.AUGURY]);
    RAIDS.forEach((r) => {
      expect([r.defaultAssumptions.rangedPrayer, r.defaultAssumptions.magicPrayer]).toEqual([Prayer.RIGOUR, Prayer.AUGURY]);
    });
  });

  test('the choices, best first', () => {
    expect(RANGED_PRAYERS).toEqual([Prayer.RIGOUR, Prayer.DEADEYE, Prayer.EAGLE_EYE]);
    expect(MAGIC_PRAYERS).toEqual([Prayer.AUGURY, Prayer.MYSTIC_VIGOUR, Prayer.MYSTIC_MIGHT]);
  });

  test('each group prays its own choice; melee (Piety / Zeal) is unaffected', () => {
    const low = { ...A, rangedPrayer: Prayer.EAGLE_EYE, magicPrayer: Prayer.MYSTIC_VIGOUR };
    expect(prayerFor('ranged', low)).toBe(Prayer.EAGLE_EYE);
    expect(prayerFor('magic', low)).toBe(Prayer.MYSTIC_VIGOUR);
    expect(prayerFor('melee', low)).toBe(Prayer.PIETY);
    expect(prayerFor('melee', { ...low, useZeal: true })).toBe(Prayer.ZEAL);
    expect(prayerFor('magic', ranged(Prayer.DEADEYE))).toBe(Prayer.AUGURY);
  });
});

describe('phase 40c: presets and specs follow the choice', () => {
  const m = getTestMonster('Xarth');

  test('Twisted bow preset: Rigour > Deadeye > Eagle Eye', () => {
    const tbow = preset('Twisted bow (Masori)');
    const style = presetStyles(tbow)[0];
    const players = RANGED_PRAYERS.map((p) => applyPresetToPlayer(generateEmptyPlayer(), tbow, style, null, m, ranged(p)));
    expect(players.map((p) => p.prayers)).toEqual(RANGED_PRAYERS.map((p) => [p]));
    const [rigour, deadeye, eagle] = players.map((p) => dps(p, m));
    expect(deadeye).toBeLessThan(rigour);
    expect(eagle).toBeLessThan(deadeye);
  });

  test("Tumeken's shadow preset: Augury > Mystic Vigour > Mystic Might", () => {
    const shadow = preset("Tumeken's shadow (Ancestral)");
    const style = presetStyles(shadow)[0];
    const players = MAGIC_PRAYERS.map((p) => applyPresetToPlayer(generateEmptyPlayer(), shadow, style, null, m, magic(p)));
    expect(players.map((p) => p.prayers)).toEqual(MAGIC_PRAYERS.map((p) => [p]));
    const [augury, vigour, might] = players.map((p) => dps(p, m));
    expect(vigour).toBeLessThan(augury);
    expect(might).toBeLessThan(vigour);
  });

  test('Ayak drain spec (magic) is less accurate with Mystic Might; melee drain spec unchanged', () => {
    const low = magic(Prayer.MYSTIC_MIGHT);
    expect(specProfile(m, 'ayak', undefined, low).attackRoll).toBeLessThan(specProfile(m, 'ayak', undefined, A).attackRoll);
    expect(specProfile(m, 'elderMaul', undefined, low).attackRoll).toBe(specProfile(m, 'elderMaul', undefined, A).attackRoll);
  });

  test('ZCB damage spec (ranged) deals less with Eagle Eye', () => {
    const best = (a: BestSetupAssumptions) => Math.max(...damageSpecProfile(m, 'zcb', a).variants.map((v) => v.expected));
    expect(best(ranged(Prayer.EAGLE_EYE))).toBeLessThan(best(A));
  });

  test('a changed prayer is a different Search cache key', () => {
    const q = { targetKey: 'xarth', drain: 'none' } as Parameters<typeof searchCacheKey>[0];
    const k = searchCacheKey(q, A);
    expect(searchCacheKey(q, ranged(Prayer.DEADEYE))).not.toBe(k);
    expect(searchCacheKey(q, magic(Prayer.MYSTIC_VIGOUR))).not.toBe(k);
  });
});

describe('phase 40c: saved settings', () => {
  const FA = raidConfig('fractured-archive');
  const parsed = (assumptions: object) => parseSettings(JSON.stringify({
    version: SETTINGS_VERSION, raids: { [FA.id]: { assumptions } },
  })).raids[FA.id].assumptions;

  test('both choices round-trip through the saved settings', () => {
    const s = defaultSettings();
    const fa = s.raids[FA.id];
    s.raids[FA.id] = { ...fa, assumptions: { ...fa.assumptions, rangedPrayer: Prayer.DEADEYE, magicPrayer: Prayer.MYSTIC_MIGHT } };
    const back = parseSettings(serialiseSettings(s)!).raids[FA.id].assumptions;
    expect([back.rangedPrayer, back.magicPrayer]).toEqual([Prayer.DEADEYE, Prayer.MYSTIC_MIGHT]);
  });

  test('settings without the fields keep Rigour / Augury; a prayer of the wrong style falls back', () => {
    const got = parsed({ useZeal: true });
    expect(got.useZeal).toBe(true);
    expect([got.rangedPrayer, got.magicPrayer]).toEqual([Prayer.RIGOUR, Prayer.AUGURY]);
    const wrong = parsed({ rangedPrayer: Prayer.AUGURY, magicPrayer: 'deadeye' });
    expect([wrong.rangedPrayer, wrong.magicPrayer]).toEqual([Prayer.RIGOUR, Prayer.AUGURY]);
  });

  test('40c settings ("Rigour / Augury unlocked" unticked) become Eagle Eye / Mystic Might', () => {
    const old = parsed({ rigourUnlocked: false, auguryUnlocked: false });
    expect([old.rangedPrayer, old.magicPrayer]).toEqual([Prayer.EAGLE_EYE, Prayer.MYSTIC_MIGHT]);
    const ticked = parsed({ rigourUnlocked: true, auguryUnlocked: true });
    expect([ticked.rangedPrayer, ticked.magicPrayer]).toEqual([Prayer.RIGOUR, Prayer.AUGURY]);
  });
});
