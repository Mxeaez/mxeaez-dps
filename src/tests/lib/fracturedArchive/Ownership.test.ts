import { describe, expect, test } from '@jest/globals';
import {
  filterPool,
  filterPresets,
  isOwned,
  loadNotOwned,
  loadOnlyOwned,
  loadoutUsesUnowned,
  markUnowned,
  NOT_OWNED_STORAGE_KEY,
  normaliseNotOwned,
  ONLY_OWNED_STORAGE_KEY,
  RAID4_REWARDS,
  saveNotOwned,
  saveOnlyOwned,
  unownedBase,
} from '@/lib/fracturedArchive/ownership';
import { SEARCH_POOL } from '@/lib/fracturedArchive/searchCandidates';
import { DEFAULT_ASSUMPTIONS, PRESETS } from '@/lib/fracturedArchive/presets';
import { runGearSearch, searchCacheKey } from '@/lib/fracturedArchive/search';
import {
  DEFAULT_NON_ITEM_SLOTS,
  DEFAULT_PINNED_NAMES,
  DEFAULT_SUPPLIES,
  equipmentItemIds,
  ownedPinned,
  plan,
  PlanInputs,
  planItemByName,
  PlanTuning,
} from '@/lib/fracturedArchive/planner';
import { RAID_TIME_DEFAULTS } from '@/lib/fracturedArchive/raidTime';
import { resolveItem } from '@/lib/fracturedArchive/loadout';
import { generateEmptyPlayer } from '@/state';

// Phase 26: "Items I don't own" (src/lib/fracturedArchive/ownership.ts; Search marking, planner exclusion).

/** A Map-backed localStorage stand-in. */
const memoryStorage = () => {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => {
      m.set(k, String(v));
    },
    removeItem: (k: string) => {
      m.delete(k);
    },
  };
};

describe('persistence', () => {
  test('round trip through storage; empty list removes the key', () => {
    const s = memoryStorage();
    expect(loadNotOwned(s)).toEqual([]);
    saveNotOwned(['Obligator', 'Ascension crossbows', 'Obligator', ' '], s);
    expect(s.m.get(NOT_OWNED_STORAGE_KEY)).toBe(JSON.stringify(['Obligator', 'Ascension crossbows']));
    expect(loadNotOwned(s)).toEqual(['Obligator', 'Ascension crossbows']);
    saveNotOwned([], s);
    expect(s.m.has(NOT_OWNED_STORAGE_KEY)).toBe(false);
    expect(loadNotOwned(s)).toEqual([]);
  });

  test('garbage, missing or throwing storage = max gear', () => {
    const s = memoryStorage();
    s.setItem(NOT_OWNED_STORAGE_KEY, '{not json');
    expect(loadNotOwned(s)).toEqual([]);
    s.setItem(NOT_OWNED_STORAGE_KEY, JSON.stringify({ a: 1 }));
    expect(loadNotOwned(s)).toEqual([]);
    expect(loadNotOwned(null)).toEqual([]);
    const throwing = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
      removeItem: () => { throw new Error('blocked'); },
    };
    expect(loadNotOwned(throwing)).toEqual([]);
    expect(() => saveNotOwned(['Obligator'], throwing)).not.toThrow();
    expect(normaliseNotOwned([1, 'Rondache', null])).toEqual(['Rondache']);
  });

  test('"Only items I own" flag', () => {
    const s = memoryStorage();
    expect(loadOnlyOwned(s)).toBe(false);
    saveOnlyOwned(true, s);
    expect(s.m.get(ONLY_OWNED_STORAGE_KEY)).toBe('1');
    expect(loadOnlyOwned(s)).toBe(true);
    saveOnlyOwned(false, s);
    expect(loadOnlyOwned(s)).toBe(false);
  });
});

describe('matching variants', () => {
  test('the quick-add rewards exist in equipment.json', () => {
    RAID4_REWARDS.forEach((n) => expect(() => resolveItem(n)).not.toThrow());
  });

  test('same name: every version (Charged / Uncharged)', () => {
    expect(isOwned('Obligator', ['Obligator'])).toBe(false);
    expect(isOwned('Obligator', [])).toBe(true);
    expect(isOwned('Scythe of Vitur', ['Obligator'])).toBe(true);
  });

  test('"Name (" variants of the base, not the other way round', () => {
    expect(unownedBase('Avernic treads (max)', ['Avernic treads'])).toBe('Avernic treads');
    expect(unownedBase('Necklace of anguish (or)', ['Necklace of anguish'])).toBe('Necklace of anguish');
    expect(unownedBase('Masori body (f)', ['Masori body'])).toBe('Masori body');
    expect(isOwned('Avernic treads', ['Avernic treads (max)'])).toBe(true);
    // a prefix without " (" is a different item
    expect(isOwned('Torva full helm', ['Torva'])).toBe(true);
  });

  test('upstream alias groups (EquipmentAliases.ts) count as one item', () => {
    expect(isOwned('Frozen abyssal whip', ['Abyssal whip'])).toBe(false);
    expect(isOwned('Holy Scythe of Vitur', ['Scythe of Vitur'])).toBe(false);
    // symmetric: listing a cosmetic variant covers the base
    expect(isOwned('Scythe of Vitur', ['Sanguine Scythe of Vitur'])).toBe(false);
    expect(isOwned('Abyssal tentacle', ['Abyssal whip'])).toBe(true);
  });

  test('loadoutUsesUnowned: listed names a loadout uses, unique, for any equipment shape', () => {
    const eq = {
      weapon: { name: 'Obligator' }, neck: { name: 'Amulet of rancour' }, feet: { name: 'Avernic treads (max)' },
    };
    expect(loadoutUsesUnowned(eq, [])).toEqual([]);
    expect(loadoutUsesUnowned(eq, ['Avernic treads', 'Obligator', 'Rondache'])).toEqual(['Obligator', 'Avernic treads']);
    expect(loadoutUsesUnowned({ weapon: ['Obligator', 'Charged'], ammo: "Rada's blessing 4" }, ['Obligator'])).toEqual(['Obligator']);
  });
});

describe('pool and presets', () => {
  const list = ['Obligator', 'Ascension crossbows', 'Necklace of rupture', 'Seeking dragon arrow'];
  const pool = filterPool(SEARCH_POOL, list);

  test('weapons, ammo options, slot candidates and sets lose the unowned items', () => {
    expect(pool.melee.weapons.map((w) => w.weapon)).not.toContain('Obligator');
    expect(pool.ranged.weapons.some((w) => w.weapon === 'Ascension crossbows')).toBe(false);
    const tbow = pool.ranged.weapons.find((w) => w.weapon === 'Twisted bow')!;
    expect(tbow.ammo).toEqual([['Dragon arrow', 'Unpoisoned']]);
    expect(pool.ranged.slots.neck!.map((c) => c.ref)).toEqual(['Necklace of anguish']);
    const noTorva = filterPool(SEARCH_POOL, ['Torva platebody']);
    expect(noTorva.melee.sets.map((s) => s.name)).not.toContain('Torva');
    expect(noTorva.melee.sets.length).toBe(SEARCH_POOL.melee.sets.length - 1);
    // the original is untouched; an empty list returns the same pool
    expect(SEARCH_POOL.melee.weapons.some((w) => w.weapon === 'Obligator')).toBe(true);
    expect(filterPool(SEARCH_POOL, [])).toBe(SEARCH_POOL);
  });

  test('presets that use an unowned item are dropped', () => {
    const kept = filterPresets(PRESETS, ['Necklace of rupture']);
    expect(kept.length).toBeLessThan(PRESETS.length);
    expect(kept.every((p) => p.group !== 'ranged' || p.equipment.neck !== 'Necklace of rupture')).toBe(true);
    expect(filterPresets(PRESETS, [])).toBe(PRESETS);
  });

  test('pinned ids: unowned ones are dropped', () => {
    const ids = DEFAULT_PINNED_NAMES.map((n) => planItemByName(n).id);
    const { kept, dropped } = ownedPinned(ids, ['Lightbearer', 'Saturated heart']);
    expect(dropped).toEqual([planItemByName('Lightbearer').id, ids[ids.length - 1]]);
    expect(kept.length).toBe(ids.length - 2);
  });
});

describe('Search (Xarth, reduced pool)', () => {
  const opts = { weapons: ['Obligator', 'Scythe of Vitur'], maxPasses: 1 };
  const full = runGearSearch(generateEmptyPlayer(), { targetKey: 'xarth', drain: 'team', styles: 'melee' }, DEFAULT_ASSUMPTIONS, opts);

  test('full pool: the Obligator is still the best, and its rows are marked', () => {
    expect(full.rows[0].weaponLabel).toBe('Obligator');
    const marked = markUnowned(full.rows, ['Obligator']);
    expect(marked[0].unowned).toEqual(['Obligator']);
    expect(marked.filter((r) => r.weaponLabel === 'Scythe of Vitur').every((r) => r.unowned.length === 0)).toBe(true);
  });

  test('"Only items I own": no unowned item in any row; vs best preset unchanged', () => {
    const owned = runGearSearch(generateEmptyPlayer(), { targetKey: 'xarth', drain: 'team', styles: 'melee' }, DEFAULT_ASSUMPTIONS, {
      ...opts, notOwned: ['Obligator', 'Amulet of rancour'],
    });
    expect(owned.rows.length).toBeGreaterThan(0);
    expect(owned.rows.every((r) => loadoutUsesUnowned(r.equipment, ['Obligator', 'Amulet of rancour']).length === 0)).toBe(true);
    expect(owned.rows[0].weaponLabel).toBe('Scythe of Vitur');
    expect(owned.rows[0].dps).toBeLessThan(full.rows[0].dps);
    expect(owned.bestPreset).toEqual(full.bestPreset);
  });

  test('cache key: a full-pool search keeps the old key, a filtered one differs', () => {
    const q = { targetKey: 'xarth', drain: 'team' as const };
    expect(searchCacheKey(q, DEFAULT_ASSUMPTIONS, [])).toBe(searchCacheKey(q, DEFAULT_ASSUMPTIONS));
    expect(searchCacheKey(q, DEFAULT_ASSUMPTIONS, ['b', 'a'])).toBe(searchCacheKey(q, DEFAULT_ASSUMPTIONS, ['a', 'b']));
    expect(searchCacheKey(q, DEFAULT_ASSUMPTIONS, ['a'])).not.toBe(searchCacheKey(q, DEFAULT_ASSUMPTIONS));
  });
});

describe('planner honours the list', () => {
  const ROUTE = 'archive-guardian>bork-smorks>moia>xarth>ocellus';
  const SMALL: PlanTuning = {
    search: { weapons: ['Obligator', 'Scythe of Vitur', 'Twisted bow', 'Ascension crossbows'], maxPasses: 1 },
    presets: PRESETS.filter((p) => ['Torva + Scythe (slash)', 'Twisted bow (Masori)'].includes(p.name)
      || p.equipment.weapon === 'Obligator' || p.equipment.weapon === 'Ascension crossbows'),
    perGroupWeapons: 2,
    perWeapon: 1,
    bases: 1,
    partners: 1,
    seeds: 4,
  };
  const inputs = (patch: Partial<PlanInputs> = {}): PlanInputs => ({
    basePlayer: generateEmptyPlayer(),
    assumptions: DEFAULT_ASSUMPTIONS,
    drain: 'team',
    settings: RAID_TIME_DEFAULTS,
    route: ROUTE,
    pinned: DEFAULT_PINNED_NAMES.map((n) => planItemByName(n).id),
    nonItemSlots: DEFAULT_NON_ITEM_SLOTS,
    supplies: DEFAULT_SUPPLIES,
    ...patch,
  });
  const list = ['Obligator', 'Ascension crossbows', 'Lightbearer', 'Elder maul'];
  const r = plan(inputs({ notOwned: list }), SMALL);
  const allIds = () => r.kit.flatMap((c) => equipmentItemIds(c.equipment));

  test('no kit loadout uses an unowned item; the list is reported', () => {
    expect(r.cancelled).toBe(false);
    expect(r.kit.length).toBeGreaterThan(0);
    expect(r.kit.every((c) => loadoutUsesUnowned(c.equipment, list).length === 0)).toBe(true);
    expect(allIds()).not.toContain(planItemByName('Obligator').id);
    expect(r.excluded).toEqual(list);
    Object.values(r.searchRows).flat().forEach((row) => expect(loadoutUsesUnowned(row.equipment, list)).toEqual([]));
  });

  test('unowned pinned defaults are dropped with a notice; unowned spec weapons get a notice', () => {
    expect(r.droppedPinned.map((x) => x.name).sort()).toEqual(['Lightbearer']); // phase 29: Elder maul isn't pinned any more
    expect(r.pinnedItems.map((x) => x.name)).not.toContain('Lightbearer');
    expect(r.inventory.some((c) => c.kind === 'pinned' && c.label === 'Lightbearer')).toBe(false);
    expect(r.ownershipNotices.some((n) => n.includes('Dropped Lightbearer'))).toBe(true);
    expect(r.ownershipNotices.some((n) => n.startsWith('Elder maul is in "Specs I bring"'))).toBe(true);
  });

  test('without a list the max plan may use them and is never slower', () => {
    const max = plan(inputs(), SMALL);
    expect(max.excluded).toEqual([]);
    expect(max.droppedPinned).toEqual([]);
    expect(max.ownershipNotices).toEqual([]);
    const t = (x: typeof r) => x.comparison!.routes[x.planned].seconds;
    expect(t(max)).toBeLessThanOrEqual(t(r) + 1e-6);
  });
});
