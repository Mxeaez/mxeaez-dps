import { Monster } from '@/types/Monster';
import { Player, PlayerEquipment } from '@/types/Player';
import { PlayerCombatStyle } from '@/types/PlayerCombatStyle';
import { EquipmentCategory } from '@/enums/EquipmentCategory';
import { WEAPON_SPEC_COSTS } from '@/lib/Equipment';
import PlayerVsNPCCalc from '@/lib/PlayerVsNPCCalc';
import { getCombatStylesForCategory } from '@/utils';
import { canWeaponHit, minimalPlayer } from '@/lib/fracturedArchive/hittable';
import {
  applyLoadoutToPlayer, prayerFor, resolveItem, resolvePresetEquipment,
} from '@/lib/fracturedArchive/loadout';
import {
  BestSetupAssumptions, DEFAULT_ASSUMPTIONS, ItemRef, PRESETS, StyleGroup,
} from '@/lib/fracturedArchive/presets';
import { SPEC_SHIELD } from '@/lib/fracturedArchive/specs';

/**
 * Phase 36: special attacks that deal damage (not drains). Pure and React-free (the time model, the planner and the
 * Search tab's "Specs" box use it). Docs: docs/BEST_SETUP.md *Damage specs, surge potion and one spec budget per
 * encounter (phase 36)*; sources per weapon: docs/DATA_SOURCES.md *Phase 36*.
 *
 * E[spec damage] is **upstream's own number**: a `PlayerVsNPCCalc` of a 99s player holding the weapon, `getSpecCalc()`
 * (`usingSpecialAttack: true`), `getExpectedDamage()` = the spec distribution's expected hit + its damage over time
 * (Burning claws' burn), the same figure as the calculator's "Spec expected hit". The spec's tick cost is the spec
 * calc's `getExpectedAttackSpeed()` (the weapon's attack speed in that style). The player wears the style's armour
 * preset (melee: the better of Torva and Inquisitor's, `DAMAGE_SPEC_ARMOUR`; ranged: Masori (f); the style's prayer and
 * potion from the assumptions), a one-handed weapon gets the style's spec shield (specs.ts `SPEC_SHIELD`), the Zaryte
 * crossbow fires Ruby or Diamond dragon bolts (e). Every non-defensive style × armour × bolt is a variant; the value of a
 * spec picks the variant with the best net damage at the loadout's DPS ({@link bestDamageVariant}).
 *
 * A spec weapon that can't hit the monster (hittable.ts `canWeaponHit` with the weapon's own style: Voidwaker is a
 * melee weapon whose spec rolls against magic defence, so it needs melee reach: not Moia, not a flying target, not
 * Ocellus P3 Deflect Melee / P1 walking) has expected damage 0.
 *
 * Not modelled (upstream has no spec for them): Keris partisan of breaching (no special attack in upstream's
 * `WEAPON_SPEC_COSTS`), Bone dagger (upstream's `UNIMPLEMENTED_SPECS`). The roadmap's "Kiston" is the Crimson kisten, a
 * Maggot King unique (not a Fractured Archive reward; DATA_SOURCES phase 25): its spec is in upstream.
 */

export type DamageSpecWeapon = 'voidwaker' | 'dragonClaws' | 'burningClaws' | 'zcb' | 'crimsonKisten';

export const DAMAGE_SPEC_WEAPON_IDS: DamageSpecWeapon[] = ['voidwaker', 'dragonClaws', 'burningClaws', 'zcb', 'crimsonKisten'];

export interface DamageSpecDef {
  label: string;
  item: ItemRef;
  group: StyleGroup;
  /** Spec energy (%) from upstream's WEAPON_SPEC_COSTS (= the wiki). */
  energy: number;
  /** Ammo variants (Zaryte crossbow: the bolts its spec procs). */
  ammo?: ItemRef[];
  /** The spec as upstream models it (for the docs and tooltips). */
  spec: string;
  wiki: string;
}

const cost = (name: string): number => WEAPON_SPEC_COSTS[name];

export const DAMAGE_SPEC_WEAPONS: Record<DamageSpecWeapon, DamageSpecDef> = {
  voidwaker: {
    label: 'Voidwaker',
    item: 'Voidwaker',
    group: 'melee',
    energy: cost('Voidwaker'),
    spec: 'Disrupt: a guaranteed hit (rolled as magic) of 50-150% of the max hit',
    wiki: 'https://oldschool.runescape.wiki/w/Voidwaker#Special_attack',
  },
  dragonClaws: {
    label: 'Dragon claws',
    item: 'Dragon claws',
    group: 'melee',
    energy: cost('Dragon claws'),
    spec: 'Slice and Dice: four hits in one attack, the cascade of upstream\'s `dClawDist`',
    wiki: 'https://oldschool.runescape.wiki/w/Dragon_claws#Special_attack',
  },
  burningClaws: {
    label: 'Burning claws',
    item: 'Burning claws',
    group: 'melee',
    energy: cost('Burning claws'),
    spec: 'Searing Cleave: three hits (upstream\'s `burningClawSpec`) and a burn (upstream\'s `burningClawDoT`)',
    wiki: 'https://oldschool.runescape.wiki/w/Burning_claws#Special_attack',
  },
  zcb: {
    label: 'Zaryte crossbow',
    item: 'Zaryte crossbow',
    group: 'ranged',
    energy: cost('Zaryte crossbow'),
    ammo: ['Ruby dragon bolts (e)', 'Diamond dragon bolts (e)'],
    spec: 'Evoke: ×2 accuracy, the enchanted bolt effect activates on every hit (ruby: 22% of current hp, max 110)',
    wiki: 'https://oldschool.runescape.wiki/w/Zaryte_crossbow#Special_attack',
  },
  crimsonKisten: {
    label: 'Crimson kisten',
    item: 'Crimson kisten',
    group: 'melee',
    energy: cost('Crimson kisten'),
    spec: 'Brutal Swing: four accuracy rolls in one hit; any success deals 70-110% of the max hit, +20% per extra success',
    wiki: 'https://oldschool.runescape.wiki/w/Crimson_kisten#Special_attack',
  },
};

export const damageSpecLabel = (w: DamageSpecWeapon): string => DAMAGE_SPEC_WEAPONS[w].label;

/** Item name of a damage spec weapon (for ownership and slot accounting). */
export const damageSpecItemName = (w: DamageSpecWeapon): string => {
  const it = DAMAGE_SPEC_WEAPONS[w].item;
  return typeof it === 'string' ? it : it[0];
};

/** Melee armour presets the damage-spec player tries (the better one per style is kept). */
export const DAMAGE_SPEC_ARMOUR: Record<StyleGroup, { preset: string, label: string }[]> = {
  melee: [{ preset: 'Torva + Scythe (slash)', label: 'Torva' }, { preset: "Inquisitor's mace (full crush)", label: "Inquisitor's" }],
  ranged: [{ preset: 'Twisted bow (Masori)', label: 'Masori (f)' }],
  magic: [{ preset: "Tumeken's shadow (Ancestral)", label: 'Ancestral' }],
};

const STYLE_TYPES: Record<StyleGroup, string[]> = {
  melee: ['stab', 'slash', 'crush'], ranged: ['ranged'], magic: ['magic'],
};
const SKIPPED_STANCES = ['Defensive', 'Defensive Autocast', 'Manual Cast'];

/** One way to do the spec: style, armour, ammo, and upstream's numbers for it. */
export interface DamageSpecVariant {
  /** e.g. "Slash (Aggressive), Torva". */
  label: string;
  /** Expected damage per spec, misses included (upstream `getExpectedDamage()` of the spec calc; 0 if it can't hit). */
  expected: number;
  /** Ticks the spec takes (upstream `getExpectedAttackSpeed()` of the spec calc). */
  ticks: number;
  maxHit: number;
  accuracy: number;
}

export interface DamageSpecProfile {
  weapon: DamageSpecWeapon;
  label: string;
  energy: number;
  canHit: boolean;
  variants: DamageSpecVariant[];
}

const armourOf = (presetName: string): Partial<PlayerEquipment> => {
  const preset = PRESETS.find((p) => p.name === presetName);
  if (!preset) throw new Error(`damageSpecs: armour preset '${presetName}' missing from presets.ts`);
  const eq = { ...resolvePresetEquipment(preset) };
  delete eq.weapon;
  delete eq.shield;
  delete eq.ammo;
  return eq;
};

/** The spec player's equipment for one variant (armour preset + weapon + shield / ammo). */
export const damageSpecEquipment = (w: DamageSpecWeapon, armour: string, ammo?: ItemRef): Partial<PlayerEquipment> => {
  const def = DAMAGE_SPEC_WEAPONS[w];
  const weapon = resolveItem(def.item);
  return {
    ...armourOf(armour),
    weapon,
    shield: weapon.isTwoHanded ? null : resolveItem(SPEC_SHIELD[def.group]),
    ammo: ammo ? resolveItem(ammo) : null,
  };
};

const stylesOf = (w: DamageSpecWeapon): PlayerCombatStyle[] => {
  const def = DAMAGE_SPEC_WEAPONS[w];
  const item = resolveItem(def.item);
  return getCombatStylesForCategory(item.category || EquipmentCategory.NONE)
    .filter((s) => STYLE_TYPES[def.group].includes(s.type || '') && !SKIPPED_STANCES.includes(s.stance || ''));
};

/** A 99s player doing the spec (style's prayer and potion from the assumptions). */
export const damageSpecPlayer = (
  monster: Monster,
  w: DamageSpecWeapon,
  style: PlayerCombatStyle,
  armour: string,
  ammo: ItemRef | undefined,
  assumptions: BestSetupAssumptions = DEFAULT_ASSUMPTIONS,
): Player => applyLoadoutToPlayer(
  minimalPlayer(null, style),
  `spec: ${DAMAGE_SPEC_WEAPONS[w].label}`,
  DAMAGE_SPEC_WEAPONS[w].group,
  damageSpecEquipment(w, armour, ammo),
  style,
  null,
  monster,
  { ...assumptions, withoutPotion: undefined },
);

/** Upstream's spec numbers for one player vs one monster. */
export const specCalcNumbers = (player: Player, monster: Monster): Omit<DamageSpecVariant, 'label'> => {
  const calc = new PlayerVsNPCCalc(player, monster, { loadoutName: player.name, detailedOutput: false });
  const spec = calc.getSpecCalc();
  if (!spec) throw new Error(`damageSpecs: upstream has no special attack for ${player.equipment.weapon?.name}`);
  return {
    expected: spec.getExpectedDamage(),
    ticks: spec.getExpectedAttackSpeed(),
    maxHit: spec.getDistribution().getMax(),
    accuracy: spec.getHitChance(),
  };
};

/**
 * Phase 36 review: the monster with its current hp at most `hpLeft` (rounded up; the hp left at a row's start), for
 * the Zaryte crossbow's ruby proc (a share of the current hp). Undefined = unchanged (full hp).
 */
export const atHpLeft = (monster: Monster, hpLeft?: number): Monster => {
  if (hpLeft === undefined || !Number.isFinite(hpLeft)) return monster;
  const cur = monster.inputs.monsterCurrentHp;
  const left = Math.max(1, Math.ceil(hpLeft - 1e-9));
  if (!(left < cur)) return monster;
  return { ...monster, inputs: { ...monster.inputs, monsterCurrentHp: left } };
};

const profileCache = new Map<string, DamageSpecProfile>();
const PROFILE_CACHE_MAX = 20000;

/**
 * Every variant of a damage spec against a monster as the calculator holds it (raw stats + inputs, drains included:
 * pass the drained monster of the phase). Cached per monster state, weapon and the assumptions that change the player.
 */
export const damageSpecProfile = (
  monster: Monster,
  w: DamageSpecWeapon,
  assumptions: BestSetupAssumptions = DEFAULT_ASSUMPTIONS,
): DamageSpecProfile => {
  const def = DAMAGE_SPEC_WEAPONS[w];
  const key = JSON.stringify([
    monster.id, monster.version, monster.name, monster.attributes, monster.inputs, w,
    assumptions.potions[def.group], prayerFor(def.group, assumptions),
  ]);
  const hit = profileCache.get(key);
  if (hit) return hit;
  const itemName = damageSpecItemName(w);
  const canHit = canWeaponHit(monster, itemName, def.group);
  const variants: DamageSpecVariant[] = [];
  for (const armour of DAMAGE_SPEC_ARMOUR[def.group]) {
    for (const ammo of def.ammo ?? [undefined]) {
      for (const style of stylesOf(w)) {
        const n = specCalcNumbers(damageSpecPlayer(monster, w, style, armour.preset, ammo, assumptions), monster);
        variants.push({
          label: `${style.name} (${style.stance}), ${armour.label}${ammo ? `, ${typeof ammo === 'string' ? ammo : ammo[0]}` : ''}`,
          ...n,
          expected: canHit ? n.expected : 0,
          accuracy: canHit ? n.accuracy : 0,
        });
      }
    }
  }
  const out: DamageSpecProfile = {
    weapon: w, label: def.label, energy: def.energy, canHit, variants,
  };
  if (profileCache.size >= PROFILE_CACHE_MAX) profileCache.clear();
  profileCache.set(key, out);
  return out;
};

export const SECONDS_PER_TICK = 0.6;

/**
 * Net damage of one spec: E[spec damage] − the damage the loadout's normal attacks deal in the spec's ticks
 * (`dps` × ticks × 0.6 s). Can be negative (then the spec is worse than attacking normally).
 */
export const netSpecDamage = (v: Pick<DamageSpecVariant, 'expected' | 'ticks'>, dps: number): number => v.expected
  - Math.max(0, dps) * v.ticks * SECONDS_PER_TICK;

/** The variant with the most net damage at this DPS (ties: the first; null when there are none). */
export const bestDamageVariant = (p: Pick<DamageSpecProfile, 'variants'>, dps: number): DamageSpecVariant | null => {
  let best: DamageSpecVariant | null = null;
  p.variants.forEach((v) => {
    if (!best || netSpecDamage(v, dps) > netSpecDamage(best, dps) + 1e-12) best = v;
  });
  return best;
};

/**
 * Seconds of the time model one spec saves on a phase: the net damage taken off the phase's damage, at the phase's
 * damage rate (time = damage ÷ (team-DPS multiplier × your DPS), raidTime.ts): net ÷ (multiplier × DPS). 0 when the
 * net damage is ≤ 0 or nothing deals damage. With the multiplier = the party size (ToA / CoX / ToB) a damage spec is
 * worth less in a big team (one player's spec, the whole team's damage rate); the Fractured Archive's multiplier is 1.
 */
export const specSecondsSaved = (net: number, dps: number, mult: number): number => (net > 0 && dps > 0 && mult > 0
  ? net / (mult * dps)
  : 0);

export interface DamageSpecRow {
  weapon: DamageSpecWeapon;
  label: string;
  energy: number;
  canHit: boolean;
  /** The best variant at this DPS (style, armour, bolts). */
  variant: string;
  expected: number;
  ticks: number;
  net: number;
  /** Seconds one spec saves at the team-DPS multiplier ({@link specSecondsSaved}). */
  saved: number;
}

/**
 * Phase 36 (the Search tab's "Specs" box): every damage spec weapon on a monster (drains included) for a loadout of
 * `dps`, the most seconds saved per spec first (ties: more net damage, then the weapon order); weapons that can't hit
 * last.
 */
/** Phase 37: a spec's gain over normal hits per 100% spec energy (net ÷ cost × 100; 0 if it can't hit or costs nothing). */
export const gainPerFullBar = (r: Pick<DamageSpecRow, 'net' | 'energy' | 'canHit'>): number => (r.canHit && r.energy > 0
  ? (r.net / r.energy) * 100
  : 0);

export const damageSpecRanking = (
  monster: Monster,
  assumptions: BestSetupAssumptions,
  dps: number,
  mult: number,
): DamageSpecRow[] => DAMAGE_SPEC_WEAPON_IDS.map((w, i) => {
  const p = damageSpecProfile(monster, w, assumptions);
  const v = bestDamageVariant(p, dps);
  const net = v ? netSpecDamage(v, dps) : 0;
  return {
    row: {
      weapon: w,
      label: p.label,
      energy: p.energy,
      canHit: p.canHit,
      variant: v?.label ?? '',
      expected: v?.expected ?? 0,
      ticks: v?.ticks ?? 0,
      net,
      saved: specSecondsSaved(net, dps, mult),
    },
    i,
  };
}).sort((a, b) => (Number(b.row.canHit) - Number(a.row.canHit)) || (b.row.saved - a.row.saved) || (b.row.net - a.row.net) || (a.i - b.i))
  .map((x) => x.row);
