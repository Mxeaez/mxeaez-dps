import { Monster } from '@/types/Monster';
import {
  EquipmentPiece, Player, PlayerEquipment, PlayerSkills,
} from '@/types/Player';
import { PlayerCombatStyle } from '@/types/PlayerCombatStyle';
import { Spellement, spells } from '@/types/Spell';
import { Prayer } from '@/enums/Prayer';
import { availableEquipment, calculateEquipmentBonusesFromGear } from '@/lib/Equipment';
import { PotionMap } from '@/utils';
import {
  BestSetupAssumptions, ItemRef, PresetDef, StyleGroup,
} from '@/lib/fracturedArchive/presets';

/**
 * Player assembly shared by the best-setup view (bestSetup.ts, re-exported there) and the spec model (specs.ts,
 * phase 14). Split out of bestSetup.ts in phase 14 so specs.ts can build players without an import cycle.
 * Pure and React-free.
 */

/** When an item name has several versions, the first of these that exists is used (else the first entry). */
export const ITEM_VERSION_PREFERENCE = ['', 'Charged', 'Normal', 'Restored', 'Undamaged', 'Unpoisoned', 'New'];

// phase 27 review: memoised (a filter over equipment.json per call was ~10% of a gear search after the alias fix)
const resolvedItems = new Map<string, EquipmentPiece>();

export const resolveItem = (ref: ItemRef): EquipmentPiece => {
  const [name, version] = typeof ref === 'string' ? [ref, undefined] : ref;
  const cacheKey = version === undefined ? name : `${name}|${version}`;
  const hit = resolvedItems.get(cacheKey);
  if (hit) return hit;
  const matches = availableEquipment.filter((e) => e.name === name);
  let item: EquipmentPiece | undefined;
  if (version !== undefined) {
    item = matches.find((e) => e.version === version);
  } else {
    item = ITEM_VERSION_PREFERENCE.map((v) => matches.find((e) => e.version === v)).find((e) => e) || matches[0];
  }
  if (!item) {
    throw new Error(`Best setup: no item named '${name}'${version !== undefined ? ` (version '${version}')` : ''} in equipment.json`);
  }
  resolvedItems.set(cacheKey, item);
  return item;
};

export const resolvePresetEquipment = (preset: PresetDef): Partial<PlayerEquipment> => Object.fromEntries(
  Object.entries(preset.equipment).map(([slot, ref]) => [slot, resolveItem(ref as ItemRef)]),
);

/** The prayer a style group prays: Zeal instead of Piety, and (phase 40c-2) the Ranged / Magic prayer choice. */
export const prayerFor = (group: StyleGroup, assumptions: BestSetupAssumptions): Prayer => {
  if (group === 'melee') return assumptions.useZeal ? Prayer.ZEAL : Prayer.PIETY;
  if (group === 'ranged') return assumptions.rangedPrayer ?? Prayer.RIGOUR;
  return assumptions.magicPrayer ?? Prayer.AUGURY;
};

const ALL_ELEMENTS: Spellement[] = ['air', 'water', 'earth', 'fire'];

/** Same as the store's recomputeBoosts: for each skill, the highest boost of the active potions. */
export const potionBoosts = (skills: PlayerSkills, potions: Player['buffs']['potions']): Partial<PlayerSkills> => {
  const boosts: Partial<PlayerSkills> = {
    atk: 0, def: 0, magic: 0, prayer: 0, ranged: 0, str: 0, mining: 0, herblore: 0,
  };
  for (const p of potions) {
    const result = PotionMap[p].calculateFn(skills);
    for (const [k, v] of Object.entries(result)) {
      if ((v as number) > (boosts[k as keyof PlayerSkills] ?? 0)) {
        boosts[k as keyof PlayerSkills] = v as number;
      }
    }
  }
  return boosts;
};

/**
 * Applies resolved equipment to a base player (99s): `equipment` is merged over the base player's equipment, then
 * style, spell, potion, prayer, fragments, and the bonuses and attack speed exactly as the store computes them.
 */
export const applyLoadoutToPlayer = (
  base: Player,
  name: string,
  group: StyleGroup,
  equipment: Partial<PlayerEquipment>,
  style: PlayerCombatStyle,
  spellName: string | null,
  monster: Monster,
  assumptions: BestSetupAssumptions,
): Player => {
  const potion = assumptions.potions[group];
  const prayer = prayerFor(group, assumptions);
  const spell = spellName ? spells.find((s) => s.name === spellName) : null;
  if (spellName && !spell) {
    throw new Error(`Best setup: no spell named '${spellName}'`);
  }

  const player: Player = {
    ...base,
    name,
    equipment: { ...base.equipment, ...equipment },
    style,
    spell: spell || null,
    prayers: [prayer],
    buffs: {
      ...base.buffs,
      potions: assumptions.withoutPotion?.includes(group) ? [] : [potion],
      elementalFragments: group === 'magic' && assumptions.elementalFragments
        ? Object.fromEntries(ALL_ELEMENTS.map((e) => [e, true]))
        : {},
    },
  };
  player.boosts = { ...player.boosts, ...potionBoosts(player.skills, player.buffs.potions) };
  return { ...player, ...calculateEquipmentBonusesFromGear(player, monster) };
};
