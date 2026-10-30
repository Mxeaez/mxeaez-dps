import { describe, expect, test } from '@jest/globals';
import {
  bankOwns, matchBank, mergeNotOwned, parseBank, poolGearNames, shortDate,
} from '@/lib/fracturedArchive/bankImport';
import {
  getActiveLevels, loadLevels, parseCharacter, saveLevels, setActiveLevels, withActiveLevels,
} from '@/lib/fracturedArchive/levels';
import { generateEmptyPlayer } from '@/state';
import { applyLoadoutToPlayer } from '@/lib/fracturedArchive/loadout';
import { DEFAULT_ASSUMPTIONS } from '@/lib/fracturedArchive/presets';
import { availableEquipment } from '@/lib/Equipment';
import Potion from '@/enums/Potion';

// Phase 39b: the RuneLite character-exporter import. Fixtures are small synthetic files (no real bank or account).

const item = (name: string, id = -1) => ({ id, name });
const storage = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
  };
};

describe('parseBank', () => {
  test('reads names and ids, ignores quantities and extra fields', () => {
    const r = parseBank({
      exported_at: '2026-10-27T10:00:00+00:00',
      kind: 'bank',
      item_count: 2,
      items: [
        {
          slot: 0, id: 4151, quantity: 1, name: 'Abyssal whip',
        },
        {
          slot: 1, id: 1, quantity: 5, name: ' Coins ',
        },
        { bad: true },
      ],
    });
    expect(r).toEqual({ items: [{ id: 4151, name: 'Abyssal whip' }, { id: 1, name: 'Coins' }], exportedAt: '2026-10-27T10:00:00+00:00' });
  });

  test('rejects other files', () => {
    expect(parseBank(null)).toHaveProperty('error');
    expect(parseBank({ items: 3 })).toHaveProperty('error');
    expect(parseBank({ kind: 'inventory', items: [] })).toHaveProperty('error');
  });
});

describe('matching the bank to the pool gear', () => {
  test('exact names, versions of the base item, and ornament kits count as owning', () => {
    const bank = [
      item('Scythe of vitur (uncharged)'), // uncharged
      item('Sanguine torva full helm'), // ornament kit
      item('Holy scythe of vitur'),
      item('Avernic treads (max)'), // max = the base item too
      item('Masori body (f)'),
      item('Necklace of anguish (or)'),
      item('Ultor ring'),
      item('Tumeken\'s shadow (uncharged)'),
    ];
    expect(bankOwns('Scythe of vitur', bank)).toBe(true);
    expect(bankOwns('Torva full helm', bank)).toBe(true);
    expect(bankOwns('Avernic treads', bank)).toBe(true);
    expect(bankOwns('Masori body', bank)).toBe(true);
    expect(bankOwns('Necklace of anguish', bank)).toBe(true);
    expect(bankOwns('Ultor ring', bank)).toBe(true);
    expect(bankOwns('Tumeken\'s shadow', bank)).toBe(true);
    expect(bankOwns('scythe of vitur', bank)).toBe(true); // case is ignored
  });

  test('the upgrade does not come from the base item, and other items do not match', () => {
    const bank = [item('Avernic treads'), item('Masori body'), item('Torva full helm'), item('Abyssal whip')];
    expect(bankOwns('Avernic treads (max)', bank)).toBe(false);
    expect(bankOwns('Masori body (f)', bank)).toBe(false);
    expect(bankOwns('Torva full helm (damaged)', bank)).toBe(false);
    expect(bankOwns('Abyssal bludgeon', bank)).toBe(false);
    expect(bankOwns('Abyssal', bank)).toBe(false); // a prefix of a word is not a version
    expect(bankOwns('Torva full', bank)).toBe(false);
  });

  test('matching by id when the bank name differs from the pool name (alias table / id lookup)', () => {
    const whip = availableEquipment.find((e) => e.name === 'Abyssal whip')!;
    expect(bankOwns('Abyssal whip', [item('something else', whip.id)])).toBe(true);
    expect(bankOwns('Abyssal whip', [item('something else', -1)])).toBe(false);
  });

  test('gear only: no ammo, bolts, arrows, darts, runes, potions or food in the pool list', () => {
    const names = poolGearNames();
    expect(names.length).toBeGreaterThan(50);
    for (const n of ['Scythe of Vitur', 'Tumeken\'s shadow', 'Twisted bow', 'Necklace of anguish', 'Ultor ring']) {
      expect(names).toContain(n);
    }
    for (const n of ['Dragon arrow', 'Ruby dragon bolts (e)', 'Dragon dart', 'Seeking dragon arrow', 'Barbed arrow', 'Saturated heart', 'Super combat potion(4)', 'Shark']) {
      expect(names).not.toContain(n);
    }
    const slotOf = (n: string) => availableEquipment.find((e) => e.name === n)?.slot;
    expect(names.filter((n) => slotOf(n) === 'ammo')).toEqual([]);
    expect(names.filter((n) => /\b(bolts?|arrows?|runes?|darts?|potion|food)\b/i.test(n) && slotOf(n) !== 'weapon')).toEqual([]);
  });

  test('matchBank splits the pool into matched / not found', () => {
    const pool = ['Scythe of vitur', 'Torva full helm', 'Twisted bow'];
    const m = matchBank([item('Holy scythe of vitur'), item('Sanguine torva full helm'), item('Dragon arrow')], pool);
    expect(m.matched).toEqual(['Scythe of vitur', 'Torva full helm']);
    expect(m.missing).toEqual(['Twisted bow']);
    // an empty bank misses everything
    expect(matchBank([], pool).missing).toEqual(pool);
  });

  test('a small synthetic bank against the real pool: owned gear is not listed, ammo is never judged', () => {
    const m = matchBank([item('Twisted bow'), item('Scythe of vitur (uncharged)'), item('Dragon arrow', 892)]);
    expect(m.matched).toEqual(expect.arrayContaining(['Twisted bow', 'Scythe of Vitur']));
    expect(m.missing).not.toContain('Twisted bow');
    expect(m.missing).toContain('Obligator');
    expect(m.missing).not.toContain('Dragon arrow');
    expect(m.matched).not.toContain('Dragon arrow');
  });

  test('mergeNotOwned replaces the pool items it judges and keeps the others', () => {
    const pool = ['Twisted bow', 'Obligator', 'Scythe of vitur'];
    const out = mergeNotOwned(['Twisted bow', 'Scythe of vitur', 'Something typed by hand'], ['Obligator'], pool);
    expect(out).toEqual(['Something typed by hand', 'Obligator']);
    // a re-import replaces, it does not stack
    expect(mergeNotOwned(out, ['Twisted bow'], pool)).toEqual(['Something typed by hand', 'Twisted bow']);
  });
});

describe('character levels', () => {
  const stats = (over: Record<string, number> = {}) => Object.fromEntries(
    ['Attack', 'Strength', 'Defence', 'Hitpoints', 'Ranged', 'Magic', 'Prayer', 'Mining', 'Herblore', 'Cooking']
      .map((s) => [s, { real_level: over[s] ?? 99, boosted_level: 120, experience: 1 }]),
  );

  test('maps real levels to the calculator skills (not the boosted ones)', () => {
    const r = parseCharacter({
      account_name: 'Synthetic',
      exported_at: '2026-10-27T10:00:00-07:00',
      stats: stats({
        Attack: 80, Strength: 85, Defence: 70, Hitpoints: 88, Ranged: 90, Magic: 92, Prayer: 77, Mining: 61, Herblore: 75,
      }),
    });
    expect(r).toEqual({
      levels: {
        atk: 80, str: 85, def: 70, hp: 88, ranged: 90, magic: 92, prayer: 77, mining: 61, herblore: 75,
      },
      exportedAt: '2026-10-27T10:00:00-07:00',
    });
    // the account name is never part of the result
    expect(JSON.stringify(r)).not.toContain('Synthetic');
  });

  test('errors: no stats, a missing combat skill, a bad level; mining / herblore default to 99', () => {
    expect(parseCharacter({})).toHaveProperty('error');
    const noAtk = stats();
    delete (noAtk as Record<string, unknown>).Attack;
    expect(parseCharacter({ stats: noAtk })).toHaveProperty('error');
    expect(parseCharacter({ stats: stats({ Magic: 0 }) })).toHaveProperty('error');
    const noMine = stats();
    delete (noMine as Record<string, unknown>).Mining;
    expect(parseCharacter({ stats: noMine })).toHaveProperty('levels.mining', 99);
  });

  test('saved levels round-trip through storage; bad storage reads as none', () => {
    const s = storage();
    expect(loadLevels(s)).toBeNull();
    const levels = {
      atk: 80, str: 85, def: 70, hp: 88, ranged: 90, magic: 92, prayer: 77, mining: 61, herblore: 75,
    };
    saveLevels({ levels, exportedAt: null, importedAt: '2026-10-27T00:00:00Z' }, s);
    expect(loadLevels(s)?.levels).toEqual(levels);
    saveLevels(null, s);
    expect(loadLevels(s)).toBeNull();
    s.setItem('mxeaez-dps:levels', '{"levels":{"atk":"x"}}');
    expect(loadLevels(s)).toBeNull();
    s.setItem('mxeaez-dps:levels', 'not json');
    expect(loadLevels(s)).toBeNull();
  });

  test('the base player uses the levels, boosts are recomputed from them', () => {
    expect(withActiveLevels(generateEmptyPlayer()).skills.atk).toBe(99);
    setActiveLevels({
      atk: 80, str: 85, def: 70, hp: 88, ranged: 90, magic: 92, prayer: 77, mining: 61, herblore: 75,
    });
    const base = withActiveLevels(generateEmptyPlayer());
    expect(base.skills).toMatchObject({
      atk: 80, str: 85, ranged: 90, magic: 92,
    });
    const monster = { skills: { def: 100 } } as never;
    const at = (b: typeof base) => applyLoadoutToPlayer(b, 'x', 'ranged', {}, b.style, null, monster, {
      ...DEFAULT_ASSUMPTIONS, potions: { ...DEFAULT_ASSUMPTIONS.potions, ranged: Potion.RANGING },
    });
    // ranging potion: floor(0.1 * level) + 4 -> 13 at 90, 13 at 99
    expect(at(base).boosts.ranged).toBe(Math.floor(90 * 0.1) + 4);
    setActiveLevels({ ...getActiveLevels()!, ranged: 60 });
    expect(at(withActiveLevels(generateEmptyPlayer())).boosts.ranged).toBe(Math.floor(60 * 0.1) + 4);
    setActiveLevels(null);
    expect(withActiveLevels(generateEmptyPlayer()).skills.atk).toBe(99);
  });
});

describe('shortDate', () => {
  test('day and month; empty when unreadable', () => {
    expect(shortDate('2026-10-27T12:00:00Z')).toBe('27 Oct');
    expect(shortDate('nope')).toBe('');
    expect(shortDate(null)).toBe('');
  });
});
