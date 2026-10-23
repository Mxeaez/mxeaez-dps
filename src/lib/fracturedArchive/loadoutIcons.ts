import { EquipmentPiece, PlayerEquipment } from '@/types/Player';
import { availableEquipment } from '@/lib/Equipment';
import { getMonsters } from '@/lib/Monsters';
import { getCdnImage } from '@/utils';
import { resolvePresetEquipment, BestSetupTarget } from '@/lib/fracturedArchive/bestSetup';
import { PresetDef } from '@/lib/fracturedArchive/presets';
import { SearchItem, SearchRow } from '@/lib/fracturedArchive/search';

/**
 * Item icons for the /best-setup tables (phase 12). Images come from the same place as the main calculator's
 * equipment slots (EquipmentGridSlot): getCdnImage(`equipment/${image}`), i.e. /cdn/equipment/ on our domain in
 * production (NEXT_PUBLIC_CDN_URL) and upstream's CDN in dev. Spell icons are not shown: upstream loads them from the
 * wiki (getWikiImage), which would be hotlinking.
 */

/** The calculator's equipment-grid order (EquipmentGrid.tsx, row by row). */
export const LOADOUT_SLOT_ORDER: (keyof PlayerEquipment)[] = [
  'head', 'cape', 'neck', 'ammo', 'weapon', 'body', 'shield', 'legs', 'hands', 'feet', 'ring',
];

export interface LoadoutIcon {
  slot: keyof PlayerEquipment;
  name: string;
  /** null when the item has no image in equipment.json. */
  imageUrl: string | null;
}

/** One piece of the weapon line ("Kodai wand · Fire Surge"); spells have no icon. */
export interface WeaponPart {
  name: string;
  imageUrl: string | null;
}

export const equipmentImageUrl = (image: string | undefined | null): string | null => (image ? getCdnImage(`equipment/${image}`) : null);

const byId = new Map<number, EquipmentPiece>();
const itemById = (id: number): EquipmentPiece | undefined => {
  if (byId.size === 0) availableEquipment.forEach((e) => byId.set(e.id, e));
  return byId.get(id);
};

const pieceIcon = (slot: keyof PlayerEquipment, name: string, image: string | undefined): LoadoutIcon => ({
  slot, name, imageUrl: equipmentImageUrl(image),
});

/** Icons of equipped items (any slot that is set), in the calculator's slot order. */
export const loadoutIcons = (eq: Partial<PlayerEquipment>): LoadoutIcon[] => LOADOUT_SLOT_ORDER
  .filter((s) => eq[s])
  .map((s) => pieceIcon(s, eq[s]!.name, eq[s]!.image));

/** Icons of a search row's loadout (items looked up by id). */
export const searchItemIcon = (slot: keyof PlayerEquipment, it: SearchItem): LoadoutIcon => pieceIcon(slot, it.name, itemById(it.id)?.image);

export const searchRowIcons = (row: SearchRow): LoadoutIcon[] => LOADOUT_SLOT_ORDER
  .filter((s) => row.equipment[s])
  .map((s) => searchItemIcon(s, row.equipment[s]!));

/** Icons of a preset; [] if an item doesn't resolve (the row then shows its error instead). */
export const presetIcons = (preset: PresetDef): LoadoutIcon[] => {
  try {
    return loadoutIcons(resolvePresetEquipment(preset));
  } catch {
    return [];
  }
};

const dartPart = (w: SearchItem | EquipmentPiece | undefined): WeaponPart | null => {
  const id = w?.itemVars?.blowpipeDartId;
  const name = w?.itemVars?.blowpipeDartName;
  if (!name) return null;
  const dart = id !== undefined ? itemById(id) : undefined;
  return { name, imageUrl: equipmentImageUrl(dart?.image) };
};

/** Weapon line of a search row: weapon, its ammo or blowpipe dart (when part of the weapon variant), spell. */
export const searchRowWeaponParts = (row: SearchRow): WeaponPart[] => {
  const parts: WeaponPart[] = [];
  const w = row.equipment.weapon;
  if (w) parts.push({ name: w.name, imageUrl: searchItemIcon('weapon', w).imageUrl });
  const ammo = row.equipment.ammo;
  const dart = dartPart(w);
  if (dart) {
    parts.push(dart);
  } else if (ammo && row.weaponLabel.includes(ammo.name)) {
    parts.push({ name: ammo.name, imageUrl: searchItemIcon('ammo', ammo).imageUrl });
  }
  if (row.spell) parts.push({ name: row.spell, imageUrl: null });
  return parts;
};

/** Weapon line of a preset: weapon, ranged ammo (not a blessing) or blowpipe dart, spell. */
export const presetWeaponParts = (preset: PresetDef, spell: string | null): WeaponPart[] => {
  let eq: Partial<PlayerEquipment>;
  try {
    eq = resolvePresetEquipment(preset);
  } catch {
    return [];
  }
  const parts: WeaponPart[] = [];
  if (eq.weapon) parts.push({ name: eq.weapon.name, imageUrl: equipmentImageUrl(eq.weapon.image) });
  const dart = dartPart(eq.weapon ?? undefined);
  if (dart) {
    parts.push(dart);
  } else if (preset.group === 'ranged' && eq.ammo && !/blessing/i.test(eq.ammo.name)) {
    parts.push({ name: eq.ammo.name, imageUrl: equipmentImageUrl(eq.ammo.image) });
  }
  if (spell) parts.push({ name: spell, imageUrl: null });
  return parts;
};

/** The boss's image (same helper as the main calculator's monster panel), or null. */
export const targetImageUrl = (target: BestSetupTarget): string | null => {
  const m = getMonsters().find((x) => x.name === target.name && x.version === target.version);
  return m?.image ? getCdnImage(`monsters/${m.image}`) : null;
};
