import { describe, expect, test } from '@jest/globals';
import { generateEmptyPlayer } from '@/state';
import PlayerVsNPCCalc from '@/lib/PlayerVsNPCCalc';
import { AmmoApplicability, ammoApplicability } from '@/lib/Equipment';
import { getCombatStylesForCategory } from '@/utils';
import { EquipmentCategory } from '@/enums/EquipmentCategory';
import {
  applyLoadoutToPlayer,
  buildTargetMonster,
  evaluateLoadout,
  findTarget,
  resolveItem,
  summaryQueries,
} from '@/lib/fracturedArchive/bestSetup';
import { DEFAULT_ASSUMPTIONS, ItemRef, StyleGroup } from '@/lib/fracturedArchive/presets';
import {
  CandidateItem, refName, SEARCH_POOL, StylePool,
} from '@/lib/fracturedArchive/searchCandidates';
import {
  GearSearchOptions, prunePool, runGearSearch, searchCacheKey, searchRowToPlayer, spellsForMonster, styleOptionsFor,
  summarySearchQueries,
} from '@/lib/fracturedArchive/search';

// Phase 9: full gear search ("Search" tab of /best-setup). Pool: src/lib/fracturedArchive/searchCandidates.ts;
// algorithm: src/lib/fracturedArchive/search.ts. Docs: docs/BEST_SETUP.md.

const A = DEFAULT_ASSUMPTIONS;
const GROUPS: StyleGroup[] = ['melee', 'ranged', 'magic'];
const base = () => generateEmptyPlayer();
const search = (targetKey: string, drain: 'none' | 'solo' | 'team', opts: GearSearchOptions = {}, styles: StyleGroup | 'all' = 'all') => runGearSearch(
  base(),
  {
    targetKey, drain, styles,
  },
  A,
  opts,
);

describe('candidate pool data', () => {
  const slotItems = GROUPS.flatMap((g) => {
    const pool = SEARCH_POOL[g];
    const fromSlots = Object.entries(pool.slots).flatMap(([slot, cands]) => (cands as CandidateItem[]).map((c) => [g, slot, c.ref] as [string, string, ItemRef]));
    const fromExtras = (pool.weaponExtras || []).flatMap((x) => Object.entries(x.slots)
      .flatMap(([slot, cands]) => (cands as CandidateItem[]).map((c) => [g, slot, c.ref] as [string, string, ItemRef])));
    const fromSets = pool.sets.flatMap((s) => Object.entries(s.pieces).map(([slot, ref]) => [g, slot, ref] as [string, string, ItemRef]));
    return [...fromSlots, ...fromExtras, ...fromSets];
  });

  test.each(slotItems)('%s %s: %s resolves and fits the slot', (_g, slot, ref) => {
    expect(resolveItem(ref).slot).toBe(slot);
  });

  const weapons = GROUPS.flatMap((g) => SEARCH_POOL[g].weapons.map((w) => [g, w] as const));

  test.each(weapons.map(([g, w]) => [g, refName(w.weapon), w] as const))('%s weapon %s: resolves, has styles of its group, valid ammo', (g, _name, w) => {
    const weapon = resolveItem(w.weapon);
    expect(weapon.slot).toBe('weapon');
    const styles = getCombatStylesForCategory(weapon.category || EquipmentCategory.NONE);
    const types = g === 'melee' ? ['stab', 'slash', 'crush'] : [g];
    expect(styles.some((s) => types.includes(s.type || ''))).toBe(true);
    if (w.ammo) {
      for (const ammo of w.ammo) {
        const a = resolveItem(ammo);
        expect(a.slot).toBe('ammo');
        expect(ammoApplicability(weapon.id, a.id)).toBe(AmmoApplicability.INCLUDED);
      }
    } else {
      // the ammo slot holds the group's blessing: the weapon must not require ammo
      for (const c of SEARCH_POOL[g].slots.ammo || []) {
        expect(ammoApplicability(weapon.id, resolveItem(c.ref).id)).toBe(AmmoApplicability.ALLOWED);
      }
    }
    if (w.dart) {
      expect(weapon.name).toBe('Toxic blowpipe');
      expect(resolveItem(w.dart).category).toBe(EquipmentCategory.THROWN);
    }
    for (const spell of w.spells || []) {
      expect(() => spellsForMonster([spell], buildTargetMonster(findTarget('xarth'), undefined, 'none', A).monster)).not.toThrow();
    }
  });

  test('the brief\'s must-have weapons are in the pool', () => {
    const names = weapons.map(([, w]) => refName(w.weapon));
    expect(names).toEqual(expect.arrayContaining([
      'Scythe of Vitur', 'Obligator', "Inquisitor's mace", 'Soulreaper axe', "Osmumten's fang", 'Emberlight', 'Arclight',
      'Burning claws', 'Voidwaker', 'Abyssal bludgeon', 'Noxious halberd', 'Elder maul', 'Dual macuahuitl', 'Ghrazi rapier',
      'Twisted bow', 'Ascension crossbows', 'Zaryte crossbow', 'Bow of Faerdhinen (c)', 'Venator bow', 'Eclipse atlatl',
      'Scorching bow', 'Toxic blowpipe', 'Heavy ballista', "Tumeken's shadow", "Zorya's tome", 'Harmonised Nightmare staff',
      'Kodai wand', 'Sanguinesti staff', 'Purging staff', 'Accursed sceptre', 'Warped sceptre',
    ]));
  });

  test('keep-lists and set weapon restrictions name weapons of the pool', () => {
    for (const g of GROUPS) {
      const pool = SEARCH_POOL[g];
      const names = pool.weapons.map((w) => refName(w.weapon));
      const restricted = [
        ...Object.values(pool.slots).flatMap((c) => (c as CandidateItem[]).flatMap((x) => (Array.isArray(x.keep) ? x.keep : []))),
        ...pool.sets.flatMap((s) => s.weapons || []),
        ...(pool.weaponExtras || []).flatMap((x) => x.weapons),
      ];
      for (const r of restricted) expect(names).toContain(r);
    }
  });

  test('sets have no weapon, ammo or shield pieces', () => {
    for (const g of GROUPS) {
      for (const s of SEARCH_POOL[g].sets) {
        expect(Object.keys(s.pieces)).not.toEqual(expect.arrayContaining(['weapon']));
        expect(Object.keys(s.pieces)).not.toContain('ammo');
        expect(Object.keys(s.pieces)).not.toContain('shield');
      }
    }
  });
});

describe('pruning and spells', () => {
  const piece = (ref: ItemRef, keep?: CandidateItem['keep']) => ({ item: resolveItem(ref), cand: { ref, keep } });
  const meleeStats = (types: ('stab' | 'slash' | 'crush')[]) => [
    ...types.map((t) => (p: ReturnType<typeof resolveItem>) => p.offensive[t]),
    (p: ReturnType<typeof resolveItem>) => p.bonuses.str,
  ];

  test('dominated items are dropped, keep items stay', () => {
    const necks = [piece('Amulet of torture'), piece('Amulet of rancour'), piece('Amulet of blood fury')];
    expect(prunePool(necks, meleeStats(['crush']), 'Abyssal bludgeon').map((p) => p.name)).toEqual(['Amulet of rancour']);
    // Bellator's +20 slash only matters to slash weapons
    const rings = [piece('Ultor ring'), piece('Bellator ring')];
    expect(prunePool(rings, meleeStats(['crush']), 'Abyssal bludgeon').map((p) => p.name)).toEqual(['Ultor ring']);
    expect(prunePool(rings, meleeStats(['slash', 'crush']), 'Scythe of Vitur').map((p) => p.name)).toEqual(['Ultor ring', 'Bellator ring']);
    // a keep item survives although dominated; weapon-restricted keep only for that weapon
    const heads = [piece('Torva full helm'), piece('Blood Moon helm', ['Dual macuahuitl'])];
    expect(prunePool(heads, meleeStats(['slash']), 'Scythe of Vitur').map((p) => p.name)).toEqual(['Torva full helm']);
    expect(prunePool(heads, meleeStats(['slash']), 'Dual macuahuitl').map((p) => p.name)).toEqual(['Torva full helm', 'Blood Moon helm']);
  });

  test('spells per boss: Fire Surge + weakness surge, demonbane on demons, no ancients on Archive Guardian', () => {
    const kodai = SEARCH_POOL.magic.weapons.find((w) => w.weapon === 'Kodai wand')!.spells!;
    const xarth = buildTargetMonster(findTarget('xarth'), undefined, 'none', A).monster; // water weakness, demon
    expect(spellsForMonster(kodai, xarth)).toEqual(['Fire Surge', 'Water Surge', 'Ice Barrage', 'Dark Demonbane']);
    const ag = buildTargetMonster(findTarget('ag-flying'), undefined, 'none', A).monster; // fire weakness, ancient-immune
    expect(spellsForMonster(kodai, ag)).toEqual(['Fire Surge']);
    const smorks = buildTargetMonster(findTarget('smorks'), undefined, 'none', A).monster; // earth weakness
    expect(spellsForMonster(kodai, smorks)).toEqual(['Fire Surge', 'Earth Surge', 'Ice Barrage']);
  });
});

describe('search', () => {
  // reduced pool: the weapons of the best presets (Obligator for most bosses, Ascension crossbows for the rest)
  const REDUCED: GearSearchOptions = { weapons: ['Obligator', 'Ascension crossbows'] };

  test.each([
    ['xarth', 'solo'],
    ['ag-flying', 'team'], // phase 14: Solo has no Defence drain there (maul can't hit), Shadow (not in REDUCED) wins
    ['jelly', 'solo'],
    ['ocellus-p2', 'team'],
  ] as [string, 'solo' | 'team'][])('%s (%s): top result >= best preset of the same boss/state', (targetKey, drain) => {
    const r = search(targetKey, drain, REDUCED);
    expect(r.cancelled).toBe(false);
    expect(r.bestPreset).not.toBeNull();
    expect(r.rows[0].dps).toBeGreaterThanOrEqual(r.bestPreset!.dps - 1e-9);
    // sorted, distinct
    for (let i = 1; i < r.rows.length; i++) expect(r.rows[i].dps).toBeLessThanOrEqual(r.rows[i - 1].dps);
    expect(new Set(r.rows.map((x) => JSON.stringify([x.equipment, x.styleLabel]))).size).toBe(r.rows.length);
  });

  test('Jelly: Elite void beats the Masori Ascension preset (a combination no preset has)', () => {
    const r = search('jelly', 'solo', { weapons: ['Ascension crossbows'] }, 'ranged');
    expect(r.bestPreset!.preset).toBe('Ascension crossbows + onyx (e) (Masori)');
    expect(r.rows[0].equipment.head?.name).toBe('Void ranger helm');
    expect(r.rows[0].dps).toBeGreaterThan(r.bestPreset!.dps + 0.5);
  });

  test('top row = the main calculator for the same player (Load into calculator parity)', () => {
    const r = search('xarth', 'none', { weapons: ['Obligator'] }, 'melee');
    const { monster } = buildTargetMonster(findTarget('xarth'), undefined, 'none', A);
    const player = searchRowToPlayer(base(), r.rows[0], monster, A);
    const calc = new PlayerVsNPCCalc(player, monster, { loadoutName: '1' });
    expect(calc.getDps()).toBeCloseTo(r.rows[0].dps, 10);
    expect(calc.getDistribution().getMax()).toBe(r.rows[0].maxHit);
    expect(calc.getTtk()).toBeCloseTo(r.rows[0].ttk!, 6);
  });

  test('two-handed weapons never get a shield, one-handed ones do', () => {
    const r = search('xarth', 'solo', { weapons: ['Scythe of Vitur', "Inquisitor's mace"], topN: 50 }, 'melee');
    const scythe = r.rows.filter((x) => x.equipment.weapon!.name === 'Scythe of Vitur');
    const mace = r.rows.filter((x) => x.equipment.weapon!.name === "Inquisitor's mace");
    expect(scythe.length).toBeGreaterThan(0);
    expect(mace.length).toBeGreaterThan(0);
    expect(scythe.every((x) => !x.equipment.shield)).toBe(true);
    expect(mace.every((x) => x.equipment.shield?.name === 'Avernic defender')).toBe(true);
  });

  test('blowpipe carries its dart; can\'t-hit weapons are listed separately', () => {
    const r = search('ag-flying', 'solo', { weapons: ['Toxic blowpipe', 'Scythe of Vitur', 'Noxious halberd'] });
    const bp = r.rows.find((x) => x.equipment.weapon!.name === 'Toxic blowpipe')!;
    expect(bp.equipment.weapon!.itemVars?.blowpipeDartName).toBe('Dragon dart');
    expect(bp.weaponLabel).toBe('Toxic blowpipe + Dragon dart');
    // flying: only the halberd reaches it with melee
    expect(r.cantHit.map((c) => c.weapon)).toEqual(['Scythe of Vitur']);
    expect(r.rows.some((x) => x.equipment.weapon!.name === 'Noxious halberd')).toBe(true);
  });

  test('deterministic', () => {
    const strip = (x: ReturnType<typeof search>) => ({ ...x, elapsedMs: 0 });
    const opts = { weapons: ['Obligator', 'Twisted bow'] };
    expect(strip(search('smorks', 'solo', opts))).toEqual(strip(search('smorks', 'solo', opts)));
  });

  test('cancellation stops early with partial results', () => {
    const full = search('smorks', 'solo', { weapons: ['Obligator', 'Twisted bow'] });
    let calls = 0;
    const progress: number[] = [];
    const r = search('smorks', 'solo', {
      weapons: ['Obligator', 'Twisted bow'],
      shouldCancel: () => {
        calls += 1;
        return calls > 30;
      },
      onProgress: (p) => progress.push(p.evaluations),
      progressEvery: 10,
    });
    expect(r.cancelled).toBe(true);
    expect(r.evaluations).toBe(30);
    expect(full.evaluations).toBeGreaterThan(30);
    expect(progress).toEqual(expect.arrayContaining([10, 20, 30]));
    expect(r.rows[0]?.ttk ?? null).toBeNull();
  });

  // Reduced pools (2 weapons x 3 helms x 3 bodies x 2 gloves, other slots fixed, no preset seeds): the search must reach
  // the exhaustive optimum over the same pool and all style options. The multi-piece sets are seeded like in the real
  // pool — without them the one-slot ascent misses Inquisitor's/Void (the documented limitation; Xarth 11.488 vs 11.533).
  const bruteForcePools: [string, StylePool, Partial<Record<string, ItemRef>>][] = [
    ['xarth', {
      group: 'melee',
      weapons: [{ weapon: 'Scythe of Vitur' }, { weapon: 'Obligator' }],
      slots: {
        head: [{ ref: 'Torva full helm' }, { ref: "Inquisitor's great helm", keep: true }, { ref: ['Void melee helm', 'Normal'], keep: true }],
        body: [{ ref: 'Torva platebody' }, { ref: "Inquisitor's hauberk", keep: true }, { ref: ['Elite void top', 'Normal'], keep: true }],
        hands: [{ ref: 'Ferocious gloves' }, { ref: ['Void knight gloves', 'Normal'], keep: true }],
        legs: [{ ref: "Inquisitor's plateskirt" }],
        neck: [{ ref: 'Amulet of rancour' }],
        ring: [{ ref: 'Ultor ring' }],
      },
      sets: [
        { name: "Inquisitor's", pieces: { head: "Inquisitor's great helm", body: "Inquisitor's hauberk" } },
        { name: 'Void', pieces: { head: ['Void melee helm', 'Normal'], body: ['Elite void top', 'Normal'], hands: ['Void knight gloves', 'Normal'] } },
      ],
    }, { legs: "Inquisitor's plateskirt", neck: 'Amulet of rancour', ring: 'Ultor ring' }],
    ['jelly', {
      group: 'ranged',
      weapons: [{ weapon: 'Twisted bow', ammo: [['Dragon arrow', 'Unpoisoned']] }, { weapon: 'Ascension crossbows', ammo: ['Onyx ascension bolts (e)'] }],
      slots: {
        head: [{ ref: 'Masori mask (f)' }, { ref: ['Crystal helm', 'Active'], keep: true }, { ref: ['Void ranger helm', 'Normal'], keep: true }],
        body: [{ ref: 'Masori body (f)' }, { ref: ['Crystal body', 'Active'], keep: true }, { ref: ['Elite void top', 'Normal'], keep: true }],
        hands: [{ ref: 'Zaryte vambraces' }, { ref: ['Void knight gloves', 'Normal'], keep: true }],
        legs: [{ ref: ['Elite void robe', 'Normal'] }],
        neck: [{ ref: 'Necklace of anguish' }],
        cape: [{ ref: "Dizana's quiver" }],
      },
      sets: [
        { name: 'Void', pieces: { head: ['Void ranger helm', 'Normal'], body: ['Elite void top', 'Normal'], hands: ['Void knight gloves', 'Normal'] } },
      ],
    }, { legs: ['Elite void robe', 'Normal'], neck: 'Necklace of anguish', cape: "Dizana's quiver" }],
  ];

  test.each(bruteForcePools)('%s: reduced-pool search = exhaustive brute force', (targetKey, pool, fixed) => {
    const r = search(targetKey, 'none', { pool: { [pool.group]: pool }, presetSeeds: false }, pool.group);
    const { monster } = buildTargetMonster(findTarget(targetKey), undefined, 'none', A);
    const fixedItems = Object.fromEntries(Object.entries(fixed).map(([slot, ref]) => [slot, resolveItem(ref!)]));
    let best = -1;
    let count = 0;
    for (const w of pool.weapons) {
      const weapon = resolveItem(w.weapon);
      const ammo = w.ammo ? resolveItem(w.ammo[0]) : null;
      const options = styleOptionsFor(weapon, w, pool.group, monster);
      for (const head of pool.slots.head!) {
        for (const body of pool.slots.body!) {
          for (const hands of pool.slots.hands!) {
            for (const o of options) {
              const p = applyLoadoutToPlayer(base(), 'bf', pool.group, {
                ...fixedItems, weapon, ammo, head: resolveItem(head.ref), body: resolveItem(body.ref), hands: resolveItem(hands.ref),
              }, o.style, o.spell, monster, A);
              best = Math.max(best, evaluateLoadout(p, monster, false).dps);
              count += 1;
            }
          }
        }
      }
    }
    expect(count).toBeGreaterThanOrEqual(2 * 18);
    expect(r.rows[0].dps).toBeCloseTo(best, 12);
    expect(r.evaluations).toBeLessThanOrEqual(count);
  });

  test('toy 2-slot search finds the brute-force optimum', () => {
    // one weapon, two searched slots with two items each (all `keep`, so nothing is pruned); the seed (pool defaults)
    // is the worst combination, so the ascent has to move both slots
    const pool: StylePool = {
      group: 'melee',
      weapons: [{ weapon: 'Abyssal bludgeon' }],
      slots: {
        neck: [{ ref: 'Amulet of torture', keep: true }, { ref: 'Amulet of rancour', keep: true }],
        ring: [{ ref: 'Bellator ring', keep: true }, { ref: 'Ultor ring', keep: true }],
      },
      sets: [],
    };
    const r = search('xarth', 'none', { pool: { melee: pool }, presetSeeds: false }, 'melee');
    expect(r.rows[0].seed).toBe('pool defaults');

    const { monster } = buildTargetMonster(findTarget('xarth'), undefined, 'none', A);
    const weapon = resolveItem('Abyssal bludgeon');
    const styles = getCombatStylesForCategory(weapon.category).filter((s) => s.stance !== 'Defensive');
    let best = { dps: -1, label: '' };
    for (const neck of ['Amulet of torture', 'Amulet of rancour']) {
      for (const ring of ['Bellator ring', 'Ultor ring']) {
        for (const style of styles) {
          const p = applyLoadoutToPlayer(base(), 'toy', 'melee', {
            weapon, neck: resolveItem(neck), ring: resolveItem(ring),
          }, style, null, monster, A);
          const { dps } = evaluateLoadout(p, monster, false);
          if (dps > best.dps) best = { dps, label: `${neck}|${ring}|${style.name}` };
        }
      }
    }
    expect(best.label).toMatch(/^Amulet of rancour\|Ultor ring\|/);
    expect(r.rows[0].dps).toBeCloseTo(best.dps, 12);
    expect(`${r.rows[0].equipment.neck!.name}|${r.rows[0].equipment.ring!.name}|${r.rows[0].style.name}`).toBe(best.label);
    expect(r.evaluations).toBeLessThan(4 * styles.length + 1); // memoised: never more than brute force
  });
});

// Phase 13: the Summary tab runs one search per Summary row x drain state and caches them per assumptions.
describe('summary searches', () => {
  test('every Summary boss / phase row x None / Solo / Team, row by row, all styles', () => {
    const qs = summarySearchQueries();
    const rows = summaryQueries();
    expect(qs).toHaveLength(rows.length * 3);
    expect(qs.length).toBeGreaterThanOrEqual(45);
    rows.forEach((r, i) => {
      expect(qs.slice(i * 3, i * 3 + 3)).toEqual(['none', 'solo', 'team'].map((drain) => ({
        targetKey: r.targetKey, phase: r.phase, drain, styles: 'all',
      })));
    });
  });

  test('cache key changes with the query and with every assumption', () => {
    const [q] = summarySearchQueries();
    const k = searchCacheKey(q, DEFAULT_ASSUMPTIONS);
    expect(searchCacheKey({ ...q }, { ...DEFAULT_ASSUMPTIONS })).toBe(k);
    expect(searchCacheKey({ ...q, drain: 'team' }, DEFAULT_ASSUMPTIONS)).not.toBe(k);
    expect(searchCacheKey(q, { ...DEFAULT_ASSUMPTIONS, partySize: 5 })).not.toBe(k);
    expect(searchCacheKey(q, { ...DEFAULT_ASSUMPTIONS, mySpecs: { ...DEFAULT_ASSUMPTIONS.mySpecs, ayak: 1 } })).not.toBe(k);
    expect(searchCacheKey(q, { ...DEFAULT_ASSUMPTIONS, useZeal: !DEFAULT_ASSUMPTIONS.useZeal })).not.toBe(k);
  });
});
