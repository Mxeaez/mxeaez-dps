import { describe, expect, test } from '@jest/globals';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { BEST_SETUP_TARGETS, resolveItem } from '@/lib/fracturedArchive/bestSetup';
import { ItemRef, PRESETS } from '@/lib/fracturedArchive/presets';
import { CandidateItem, SEARCH_POOL } from '@/lib/fracturedArchive/searchCandidates';
import { getMonsters } from '@/lib/Monsters';
import { getCdnImage } from '@/utils';
import {
  LOADOUT_SLOT_ORDER,
  presetIcons,
  presetWeaponParts,
  searchRowIcons,
  searchRowWeaponParts,
  targetImageUrl,
} from '@/lib/fracturedArchive/loadoutIcons';
import { SearchItem, SearchRow } from '@/lib/fracturedArchive/search';
import { EquipmentPiece } from '@/types/Player';

// Phase 12: item icons in the /best-setup tables.

const item = (name: string, extra: Partial<SearchItem> = {}): SearchItem => {
  const p: EquipmentPiece = resolveItem(name);
  return {
    id: p.id, name: p.name, version: p.version, ...extra,
  };
};

const row = (equipment: SearchRow['equipment'], weaponLabel: string, spell: string | null = null): SearchRow => ({
  group: 'ranged',
  weaponLabel,
  equipment,
  style: {
    name: 'Rapid', type: 'ranged', stance: 'Rapid',
  },
  spell,
  styleLabel: 'Rapid (Rapid)',
  seed: 'test',
  dps: 1,
  ttk: null,
  maxHit: 1,
  accuracy: 1,
});

describe('loadout icons', () => {
  test('slot order is the calculator equipment grid order', () => {
    expect(LOADOUT_SLOT_ORDER).toEqual(['head', 'cape', 'neck', 'ammo', 'weapon', 'body', 'shield', 'legs', 'hands', 'feet', 'ring']);
  });

  test('search row: one icon per equipped slot, in grid order, from the equipment image via getCdnImage', () => {
    const r = row({
      ring: item('Venator ring'),
      weapon: item('Ascension crossbows'),
      ammo: item('Diamond ascension bolts (e)'),
      head: item('Masori mask (f)'),
      body: item('Masori body (f)'),
    }, 'Ascension crossbows + Diamond ascension bolts (e)');
    const icons = searchRowIcons(r);
    expect(icons.map((i) => i.slot)).toEqual(['head', 'ammo', 'weapon', 'body', 'ring']);
    expect(icons.map((i) => i.name)).toEqual([
      'Masori mask (f)', 'Diamond ascension bolts (e)', 'Ascension crossbows', 'Masori body (f)', 'Venator ring',
    ]);
    icons.forEach((ic) => {
      const piece = resolveItem(ic.name);
      expect(piece.image).toBeTruthy();
      expect(ic.imageUrl).toBe(getCdnImage(`equipment/${piece.image}`));
    });
  });

  test('weapon line: weapon + ammo of the variant; a blessing is not ammo of the variant', () => {
    const xbow = row({
      weapon: item('Ascension crossbows'),
      ammo: item('Diamond ascension bolts (e)'),
    }, 'Ascension crossbows + Diamond ascension bolts (e)');
    expect(searchRowWeaponParts(xbow).map((p) => p.name)).toEqual(['Ascension crossbows', 'Diamond ascension bolts (e)']);
    expect(searchRowWeaponParts(xbow).every((p) => p.imageUrl)).toBe(true);

    const kodai = row({ weapon: item('Kodai wand'), ammo: item("Rada's blessing 4") }, 'Kodai wand', 'Fire Surge');
    const parts = searchRowWeaponParts(kodai);
    expect(parts.map((p) => p.name)).toEqual(['Kodai wand', 'Fire Surge']);
    expect(parts[1].imageUrl).toBeNull(); // spells have no icon (upstream hotlinks the wiki for them)
  });

  test('weapon line: blowpipe shows its dart', () => {
    const dart = resolveItem('Dragon dart');
    const bp = row({
      weapon: item('Toxic blowpipe', { itemVars: { blowpipeDartId: dart.id, blowpipeDartName: dart.name } }),
    }, 'Toxic blowpipe + Dragon dart');
    const parts = searchRowWeaponParts(bp);
    expect(parts.map((p) => p.name)).toEqual(['Toxic blowpipe', 'Dragon dart']);
    expect(parts[1].imageUrl).toBe(getCdnImage(`equipment/${dart.image}`));
  });

  test('every preset has an icon for every item and a weapon line starting with its weapon', () => {
    PRESETS.forEach((p) => {
      const icons = presetIcons(p);
      expect(icons.length).toBe(Object.keys(p.equipment).length);
      icons.forEach((ic) => expect(ic.imageUrl).toMatch(/\/equipment\/.+\.png$/));
      const parts = presetWeaponParts(p, null);
      expect(parts[0].name).toBe(resolveItem(p.equipment.weapon!).name);
      if (parts.length > 1) expect(parts[1].name).not.toMatch(/blessing/i);
    });
    const kodai = PRESETS.find((p) => p.name.startsWith('Kodai'))!;
    expect(presetWeaponParts(kodai, 'Fire Surge').map((x) => x.name)).toEqual(['Kodai wand', 'Fire Surge']);
  });

  test('a preset with a bad item name gives no icons instead of throwing', () => {
    const bad = { ...PRESETS[0], equipment: { weapon: 'No such item' } };
    expect(presetIcons(bad)).toEqual([]);
    expect(presetWeaponParts(bad, null)).toEqual([]);
  });

  test('every boss has a monster image', () => {
    BEST_SETUP_TARGETS.forEach((t) => expect(targetImageUrl(t)).toMatch(/\/monsters\/.+/));
  });

  test('every preset/pool item and boss image is in cdn/ and deployable (no % in the name)', () => {
    const refs: ItemRef[] = PRESETS.flatMap((p) => Object.values(p.equipment) as ItemRef[]);
    Object.values(SEARCH_POOL).forEach((pool) => {
      pool.weapons.forEach((w) => refs.push(w.weapon, ...(w.ammo || []), ...(w.dart ? [w.dart] : [])));
      Object.values(pool.slots).forEach((cands) => (cands as CandidateItem[]).forEach((c) => refs.push(c.ref)));
      (pool.weaponExtras || []).forEach((x) => Object.values(x.slots)
        .forEach((cands) => (cands as CandidateItem[]).forEach((c) => refs.push(c.ref))));
      pool.sets.forEach((set) => refs.push(...(Object.values(set.pieces) as ItemRef[])));
    });
    const files = new Set(refs.map((r) => `equipment/${resolveItem(r).image}`));
    BEST_SETUP_TARGETS.forEach((t) => {
      const m = getMonsters().find((x) => x.name === t.name && x.version === t.version)!;
      files.add(`monsters/${m.image}`);
    });
    const missing = Array.from(files).filter((f) => f.includes('%') || !existsSync(join(process.cwd(), 'cdn', f)));
    expect(missing).toEqual([]);
  });
});
