import { Monster } from '@/types/Monster';
import { EquipmentPiece, Player } from '@/types/Player';
import { CombatStyleType } from '@/types/PlayerCombatStyle';
import { EquipmentCategory } from '@/enums/EquipmentCategory';
import { availableEquipment } from '@/lib/Equipment';
import PlayerVsNPCCalc from '@/lib/PlayerVsNPCCalc';
import { getCombatStylesForCategory } from '@/utils';

/**
 * Whether a drain weapon can hit a monster in its current version / phase (phase 13).
 *
 * No rules live here: the answer comes from upstream's own `PlayerVsNPCCalc.isImmune`, run on a minimal 99s player
 * holding the weapon in its first combat style of the matching type. So `flying` (melee blocked except halberds /
 * salamanders), the immune-to-style id lists, Ocellus's prayers (P1 "Walking" → Protect from Melee, P3 Deflect Melee /
 * Ranged) and everything else upstream knows about are respected, and stay in sync with the calc. Pure, React-free.
 */

export type HitStyle = 'melee' | 'ranged' | 'magic';

/** Drain tools the max-drain plans use, with the item that performs them and its attack style. */
export const DRAIN_TOOL_WEAPONS = {
  elderMaul: { item: 'Elder maul', style: 'melee' },
  dwh: { item: 'Dragon warhammer', style: 'melee' },
  bgs: { item: 'Bandos godsword', style: 'melee' },
  arclight: { item: 'Arclight', style: 'melee' },
  emberlight: { item: 'Emberlight', style: 'melee' },
  tonalztic: { item: 'Tonalztics of Ralos', style: 'ranged' },
  accursed: { item: 'Accursed sceptre', style: 'magic' },
} as const satisfies Record<string, { item: string, style: HitStyle }>;

export type DrainTool = keyof typeof DRAIN_TOOL_WEAPONS;

/** A representative weapon per style for {@link canStyleHit} (plain weapons, no special-case categories). */
const STYLE_WEAPONS: Record<HitStyle, string> = {
  melee: DRAIN_TOOL_WEAPONS.elderMaul.item,
  ranged: DRAIN_TOOL_WEAPONS.tonalztic.item,
  magic: DRAIN_TOOL_WEAPONS.accursed.item,
};

const STYLE_TYPES: Record<HitStyle, CombatStyleType[]> = {
  melee: ['stab', 'slash', 'crush'],
  ranged: ['ranged'],
  magic: ['magic'],
};

export const minimalPlayer = (weapon: EquipmentPiece | null, style: Player['style']): Player => {
  const zero = {
    atk: 0, def: 0, hp: 0, magic: 0, prayer: 0, ranged: 0, str: 0, mining: 0, herblore: 0,
  };
  const zeroStyles = {
    stab: 0, slash: 0, crush: 0, magic: 0, ranged: 0,
  };
  return {
    name: 'hittable',
    style,
    skills: {
      atk: 99, def: 99, hp: 99, magic: 99, prayer: 99, ranged: 99, str: 99, mining: 99, herblore: 99,
    },
    boosts: zero,
    equipment: {
      ammo: null,
      body: null,
      cape: null,
      feet: null,
      hands: null,
      head: null,
      legs: null,
      neck: null,
      ring: null,
      shield: null,
      weapon,
    },
    attackSpeed: 4,
    prayers: [],
    bonuses: {
      str: 0, ranged_str: 0, magic_str: 0, prayer: 0,
    },
    defensive: zeroStyles,
    offensive: zeroStyles,
    buffs: {
      potions: [],
      onSlayerTask: true,
      inWilderness: false,
      kandarinDiary: true,
      chargeSpell: false,
      markOfDarknessSpell: false,
      forinthrySurge: false,
      soulreaperStacks: 0,
      baAttackerLevel: 0,
      chinchompaDistance: 4,
      usingSunfireRunes: false,
    },
    spell: null,
  } as Player;
};

const cache = new Map<string, boolean>();

/** Whether `itemName` (first equipment entry with that name) can hit `m` with a style of the given type. */
export const canWeaponHit = (m: Monster, itemName: string, style: HitStyle): boolean => {
  const key = `${m.id}|${m.version}|${m.inputs.phase ?? ''}|${m.attributes.join(',')}|${itemName}|${style}`;
  const cached = cache.get(key);
  if (cached !== undefined) {
    return cached;
  }

  const weapon = availableEquipment.find((e) => e.name === itemName) || null;
  const styles = getCombatStylesForCategory(weapon?.category || EquipmentCategory.NONE);
  const combatStyle = styles.find((s) => STYLE_TYPES[style].includes(s.type!));
  if (!combatStyle) {
    throw new Error(`canWeaponHit: ${itemName} has no ${style} style`);
  }
  const calc = new PlayerVsNPCCalc(minimalPlayer(weapon, combatStyle), m);
  const result = !calc.isImmune(combatStyle.type);
  cache.set(key, result);
  return result;
};

/** Whether a plain weapon of this style can hit the monster in its selected version / phase. */
export const canStyleHit = (m: Monster, style: HitStyle): boolean => canWeaponHit(m, STYLE_WEAPONS[style], style);

/** Whether a drain tool (Elder maul, DWH, BGS, Tonalztics, Accursed, ...) can hit the monster. */
export const canDrainToolHit = (m: Monster, tool: DrainTool): boolean => {
  const { item, style } = DRAIN_TOOL_WEAPONS[tool];
  return canWeaponHit(m, item, style);
};
