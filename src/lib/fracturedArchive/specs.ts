import { Monster } from '@/types/Monster';
import { Player, PlayerEquipment } from '@/types/Player';
import { PlayerCombatStyle } from '@/types/PlayerCombatStyle';
import { EquipmentCategory } from '@/enums/EquipmentCategory';
import { INITIAL_MONSTER_INPUTS } from '@/lib/Monsters';
import { scaleMonster } from '@/lib/MonsterScaling';
import { WEAPON_SPEC_COSTS } from '@/lib/Equipment';
import PlayerVsNPCCalc from '@/lib/PlayerVsNPCCalc';
import { getDefenceFloor } from '@/lib/scaling/DefenceReduction';
import { getCombatStylesForCategory } from '@/utils';
import { canWeaponHit, HitStyle, minimalPlayer } from '@/lib/fracturedArchive/hittable';
import { applyLoadoutToPlayer, resolveItem, resolvePresetEquipment } from '@/lib/fracturedArchive/loadout';
import {
  BestSetupAssumptions, DEFAULT_ASSUMPTIONS, ItemRef, PRESETS, StyleGroup,
} from '@/lib/fracturedArchive/presets';

/**
 * Spec mechanics per drain weapon (phase 14). Pure and React-free (the phase 17 planner reuses it).
 *
 *   specProfile(monster, 'elderMaul')   → energy, hit chance, expected damage, per-attempt outcome distribution, ...
 *   drainModel(monster, assumptions)     → the numbers the planners (teamSpecs.ts) need for every drain weapon
 *   energyBudget({ seconds, lightbearer }) / planLabel(energy, seconds)
 *
 * Hit chance and damage are **upstream's own special-attack numbers**: a `PlayerVsNPCCalc` for a 99s player holding
 * the weapon, `getSpecCalc()` (= `usingSpecialAttack: true`, which applies the spec's accuracy / max-hit modifiers,
 * the BGS slash defence roll, the Tonalztics second hit rolled against the lowered Defence, Ayak's 5-tick spec, ...),
 * then `getDistribution()` — the same distribution the calculator's "Spec expected hit" column comes from. The player
 * wears the Phase 8 preset armour of the weapon's style (Inquisitor's / Masori (f) / Ancestral, see
 * {@link SPEC_ARMOUR_PRESET}), the style's prayer and potion from the best-setup assumptions; one-handed weapons get
 * the style's best shield. Every non-defensive style of the weapon is tried and the one whose drain lands most often is
 * used. Mechanics and wiki sources per weapon: {@link SPEC_WEAPONS} and docs/DATA_SOURCES.md, "Spec mechanics".
 *
 * "Lands on damage" vs "on an accurate roll" only differs under flat armour / damage reduction: upstream raises
 * accurate 0s to 1 (wiki "Successful hit": "0s are pushed up to 1"), then applies e.g. Bork's flat armour.
 *
 * Profiles are computed against the monster as given (callers pass the undrained boss), so later specs in a sequence,
 * which hit a lower Defence, are a little more accurate than modelled: the planners are conservative there.
 */

export type SpecWeapon = 'elderMaul' | 'dwh' | 'bgs' | 'tonalztics' | 'ayak' | 'accursed';

/**
 * What a landed spec drains.
 * - `defencePercent`: current Defence × pct, rounded down (Elder maul 35%, DWH 30%).
 * - `defenceByMagic`: Defence − trunc(Magic level / 8) per landed hit (Tonalztics, 2 hits when charged).
 * - `defenceByDamage`: Defence (then Str, Att, Magic, Ranged) − damage dealt (BGS).
 * - `magicDefByDamage`: Magic defence bonus − damage dealt, not below 0 (Eye of Ayak).
 * - `accursed`: Defence and Magic −15% (doesn't stack).
 */
export type DrainKind = 'defencePercent' | 'defenceByMagic' | 'defenceByDamage' | 'magicDefByDamage' | 'accursed';

export interface SpecWeaponDef {
  label: string;
  item: ItemRef;
  group: StyleGroup;
  /** Spec energy (%) from upstream's WEAPON_SPEC_COSTS (= the wiki). */
  energy: number;
  /** When the drain happens: on a successful (accurate) hit, or only when the hit deals damage. */
  landsOn: 'accurate' | 'damage';
  drain: DrainKind;
  /** Accuracy / damage modifiers of the spec (as upstream applies them), for the docs and the UI. */
  modifiers: string;
  wiki: string;
  /** Set where the wiki is vague; the reading used is documented in DATA_SOURCES.md. */
  unverified?: string;
}

const cost = (name: string): number => WEAPON_SPEC_COSTS[name];

export const SPEC_WEAPONS: Record<SpecWeapon, SpecWeaponDef> = {
  elderMaul: {
    label: 'Elder maul',
    item: 'Elder maul',
    group: 'melee',
    energy: cost('Elder maul'),
    landsOn: 'accurate',
    drain: 'defencePercent',
    modifiers: '+25% accuracy, crush defence roll; −35% current Defence on a successful hit',
    wiki: 'https://oldschool.runescape.wiki/w/Elder_maul#Special_attack',
    unverified: 'The wiki says "successful hit" without saying whether a hit that deals no damage counts (it says so '
      + 'for the DWH and Tonalztics); an accurate roll is assumed to be enough. Upstream raises accurate 0s to 1, so this '
      + 'only matters against flat armour (Bork: an accurate hit of ≤ 8 deals 0).',
  },
  dwh: {
    label: 'DWH',
    item: 'Dragon warhammer',
    group: 'melee',
    energy: cost('Dragon warhammer'),
    landsOn: 'damage',
    drain: 'defencePercent',
    modifiers: '+50% damage; −30% current Defence only if the hit deals damage',
    wiki: 'https://oldschool.runescape.wiki/w/Dragon_warhammer#Special_attack',
  },
  bgs: {
    label: 'BGS',
    item: 'Bandos godsword',
    group: 'melee',
    energy: cost('Bandos godsword'),
    landsOn: 'damage',
    drain: 'defenceByDamage',
    modifiers: '×2 accuracy, ×1.1 ×1.1 max hit, slash defence roll; drains Defence (then Str, Prayer, Att, Magic, '
      + 'Ranged) by the damage dealt',
    wiki: 'https://oldschool.runescape.wiki/w/Bandos_godsword#Special_attack',
  },
  tonalztics: {
    label: 'Tonalztics',
    item: 'Tonalztics of Ralos',
    group: 'ranged',
    energy: cost('Tonalztics of Ralos'),
    landsOn: 'damage',
    drain: 'defenceByMagic',
    modifiers: '+50% accuracy; charged: two hits, each one that deals damage lowers Defence by 1/8 of the Magic level; '
      + 'the second hit rolls against the lowered Defence (NPCs)',
    wiki: 'https://oldschool.runescape.wiki/w/Tonalztics_of_Ralos#Special_attack',
    unverified: 'Rounding of 1/8 Magic level: upstream rounds down; the wiki Strategies table only matches rounding up '
      + '(see "Drain presets").',
  },
  ayak: {
    label: 'Eye of Ayak',
    item: 'Eye of Ayak',
    group: 'magic',
    energy: cost('Eye of Ayak'),
    landsOn: 'damage',
    drain: 'magicDefByDamage',
    modifiers: '×2 accuracy, +30% max hit, 5-tick attack; Magic defence bonus − damage dealt (not below 0)',
    wiki: 'https://oldschool.runescape.wiki/w/Eye_of_Ayak#Special_attack',
  },
  accursed: {
    label: 'Accursed sceptre',
    item: 'Accursed sceptre',
    group: 'magic',
    energy: cost('Accursed sceptre'),
    landsOn: 'accurate',
    drain: 'accursed',
    modifiers: '+50% accuracy and max hit; Defence and Magic −15% on a successful hit regardless of damage, no stacking',
    wiki: 'https://oldschool.runescape.wiki/w/Accursed_sceptre#Special_attack',
    unverified: 'Wiki conflict: the Special attacks table says "if damage is dealt", the item page "regardless of the '
      + 'damage" (Mod Ash); the item page is followed. Not used by the planners.',
  },
};

// --- energy --------------------------------------------------------------------------------------------------------

/** Special attack energy regenerates 10% every 30 s, every 15 s with Lightbearer (wiki "Special attacks", "Lightbearer"). */
export const SPEC_REGEN_PERCENT = 10;
export const SPEC_REGEN_SECONDS = 30;
export const LIGHTBEARER_REGEN_SECONDS = 15;
/** Rough fight length per boss until the phase 16 time model exists (a setting in the assumptions box). */
export const DEFAULT_FIGHT_SECONDS = 90;

/**
 * Spec energy one player can spend in a fight of `seconds`: 100% at the start (assumed full at every boss —
 * unverified for the Fractured Archive) + 10% per completed 30 s (15 s with Lightbearer).
 */
export const energyBudget = ({ seconds, lightbearer }: { seconds: number, lightbearer: boolean }): number => 100
  + SPEC_REGEN_PERCENT * Math.floor(Math.max(0, seconds) / (lightbearer ? LIGHTBEARER_REGEN_SECONDS : SPEC_REGEN_SECONDS));

/** Whole spec attempts a budget pays for. */
export const specAttempts = (budget: number, energy: number): number => (energy > 0 ? Math.floor(budget / energy) : 0);

export type PlanLabel = 'solo' | 'solo+lightbearer' | 'team-only';

/** `solo` if one player's budget (no Lightbearer) covers `energy`, `solo+lightbearer` if it does with one, else `team-only`. */
export const planLabel = (energy: number, seconds: number): PlanLabel => {
  if (energy <= energyBudget({ seconds, lightbearer: false })) return 'solo';
  if (energy <= energyBudget({ seconds, lightbearer: true })) return 'solo+lightbearer';
  return 'team-only';
};

// --- profiles ------------------------------------------------------------------------------------------------------

/** One outcome of a spec attempt: landed hits (Tonalztics 0–2, others 0/1) and damage dealt. */
export interface SpecOutcome {
  p: number;
  hits: number;
  damage: number;
}

export interface SpecProfile {
  weapon: SpecWeapon;
  label: string;
  energy: number;
  /** False when the weapon's style can't hit the monster in this version / phase (then hitChance = 0). */
  canHit: boolean;
  /** Combat style used, e.g. "Pound (Accurate)". */
  style: string;
  /** Upstream's spec accuracy (`getHitChance()` of the spec calc). */
  accuracy: number;
  /** P(the drain lands) per attempt: accurate roll (maul, accursed), damage > 0 (DWH, BGS, Ayak), ≥1 damaging hit (Tonalztics). */
  hitChance: number;
  maxHit: number;
  /** Expected damage per attempt, misses included (upstream's spec distribution). */
  expectedDamage: number;
  /** Expected damage given the drain landed (= expectedDamage / hitChance). */
  expectedDamageOnHit: number;
  /** Expected landed hits per attempt (Tonalztics up to 2; others = hitChance). */
  expectedHits: number;
  /** Outcome distribution per attempt (probabilities sum to 1). */
  outcomes: SpecOutcome[];
  /**
   * Drain of one landed spec (one landed *hit* for Tonalztics) at a given current Defence / Magic level: Defence levels
   * for maul / DWH / Tonalztics / BGS / accursed, Magic defence bonus for Ayak (BGS / Ayak: expected damage on a hit).
   */
  drainPerLandedSpec: (state: { def: number, magicLevel: number }) => number;
}

/** Armour for the spec players: the Phase 8 preset of the weapon's style (weapon / shield removed). */
export const SPEC_ARMOUR_PRESET: Record<StyleGroup, string> = {
  melee: "Inquisitor's mace (full crush)",
  ranged: 'Twisted bow (Masori)',
  magic: "Tumeken's shadow (Ancestral)",
};

/** Shield for one-handed spec weapons (DWH, Tonalztics, Ayak, Accursed sceptre). */
export const SPEC_SHIELD: Record<StyleGroup, ItemRef> = {
  melee: ['Avernic defender', 'Normal'],
  ranged: 'Twisted buckler',
  magic: "Elidinis' ward (f)",
};

const HIT_STYLE: Record<StyleGroup, HitStyle> = { melee: 'melee', ranged: 'ranged', magic: 'magic' };
const STYLE_TYPES: Record<StyleGroup, string[]> = {
  melee: ['stab', 'slash', 'crush'], ranged: ['ranged'], magic: ['magic'],
};
const SKIPPED_STANCES = ['Defensive', 'Defensive Autocast', 'Manual Cast'];

const specEquipment = (weapon: SpecWeapon): Partial<PlayerEquipment> => {
  const def = SPEC_WEAPONS[weapon];
  const preset = PRESETS.find((p) => p.name === SPEC_ARMOUR_PRESET[def.group]);
  if (!preset) {
    throw new Error(`specs: armour preset '${SPEC_ARMOUR_PRESET[def.group]}' missing from presets.ts`);
  }
  const item = resolveItem(def.item);
  const eq: Partial<PlayerEquipment> = {
    ...resolvePresetEquipment(preset),
    weapon: item,
    shield: item.isTwoHanded ? null : resolveItem(SPEC_SHIELD[def.group]),
  };
  if (def.group === 'ranged') {
    eq.ammo = null; // thrown weapon: the preset's arrows don't apply
  }
  return eq;
};

/** A 99s player with the spec weapon, its style's preset armour, prayer and potion, in the given combat style. */
export const specPlayer = (
  monster: Monster,
  weapon: SpecWeapon,
  style: PlayerCombatStyle,
  assumptions: BestSetupAssumptions = DEFAULT_ASSUMPTIONS,
): Player => applyLoadoutToPlayer(
  minimalPlayer(null, style),
  `spec: ${SPEC_WEAPONS[weapon].label}`,
  SPEC_WEAPONS[weapon].group,
  specEquipment(weapon),
  style,
  null,
  monster,
  assumptions,
);

const specStyles = (weapon: SpecWeapon): PlayerCombatStyle[] => {
  const def = SPEC_WEAPONS[weapon];
  const item = resolveItem(def.item);
  return getCombatStylesForCategory(item.category || EquipmentCategory.NONE)
    .filter((s) => STYLE_TYPES[def.group].includes(s.type || '') && !SKIPPED_STANCES.includes(s.stance || ''));
};

const drainFn = (weapon: SpecWeapon, expectedDamageOnHit: number): SpecProfile['drainPerLandedSpec'] => {
  switch (SPEC_WEAPONS[weapon].drain) {
    case 'defencePercent': {
      const pct = weapon === 'elderMaul' ? 35 : 30;
      return ({ def }) => Math.trunc(def * pct / 100);
    }
    case 'defenceByMagic':
      return ({ magicLevel }) => Math.trunc(magicLevel / 8);
    case 'accursed':
      return ({ def }) => def - Math.trunc(def * 17 / 20);
    case 'defenceByDamage':
      return ({ def }) => Math.min(def, expectedDamageOnHit);
    default:
      return () => expectedDamageOnHit;
  }
};

/** Profile from upstream's spec distribution of one player vs one monster. */
const profileFromCalc = (weapon: SpecWeapon, player: Player, monster: Monster): Omit<SpecProfile, 'canHit' | 'style'> => {
  const def = SPEC_WEAPONS[weapon];
  const calc = new PlayerVsNPCCalc(player, monster, { loadoutName: player.name, detailedOutput: false });
  const spec = calc.getSpecCalc();
  if (!spec) {
    throw new Error(`specs: upstream has no special attack for ${def.item}`);
  }
  const outcomes = new Map<string, SpecOutcome>();
  let expectedDamage = 0;
  for (const wh of spec.getDistribution().zipped.hits) {
    const damage = wh.hitsplats.reduce((s, h) => s + h.damage, 0);
    let hits: number;
    if (weapon === 'tonalztics') {
      hits = wh.hitsplats.filter((h) => h.damage > 0).length;
    } else if (def.landsOn === 'accurate') {
      hits = wh.hitsplats.some((h) => h.accurate) ? 1 : 0;
    } else {
      hits = damage > 0 ? 1 : 0;
    }
    // Only BGS and Ayak drains depend on the damage; the others keep one outcome per hit count.
    const keepDamage = def.drain === 'defenceByDamage' || def.drain === 'magicDefByDamage';
    const d = keepDamage ? damage : 0;
    const key = `${hits}|${d}`;
    const o = outcomes.get(key) || { p: 0, hits, damage: d };
    o.p += wh.probability;
    outcomes.set(key, o);
    expectedDamage += wh.probability * damage;
  }
  const list = [...outcomes.values()].sort((a, b) => a.hits - b.hits || a.damage - b.damage);
  const hitChance = list.filter((o) => o.hits > 0).reduce((s, o) => s + o.p, 0);
  const expectedHits = list.reduce((s, o) => s + o.p * o.hits, 0);
  const expectedDamageOnHit = hitChance > 0 ? expectedDamage / hitChance : 0;
  return {
    weapon,
    label: def.label,
    energy: def.energy,
    accuracy: spec.getHitChance(),
    hitChance,
    maxHit: spec.getDistribution().getMax(),
    expectedDamage,
    expectedDamageOnHit,
    expectedHits,
    outcomes: list,
    drainPerLandedSpec: drainFn(weapon, expectedDamageOnHit),
  };
};

const NO_HIT: SpecOutcome[] = [{ p: 1, hits: 0, damage: 0 }];

const profileCache = new Map<string, SpecProfile>();

/**
 * Spec hit chance / expected damage / outcome distribution of a drain weapon against a monster (as the calculator
 * holds it: raw stats + inputs; pass it undrained for planning). `player` overrides the default spec player (its
 * weapon must be the spec weapon); otherwise every non-defensive style is tried and the most reliable one is kept.
 */
export const specProfile = (
  monster: Monster,
  weapon: SpecWeapon,
  player?: Player,
  assumptions: BestSetupAssumptions = DEFAULT_ASSUMPTIONS,
): SpecProfile => {
  const def = SPEC_WEAPONS[weapon];
  const key = player ? undefined : JSON.stringify([
    monster.id, monster.version, monster.attributes, monster.inputs, weapon,
    assumptions.potions[def.group], def.group === 'melee' && assumptions.useZeal,
  ]);
  const cached = key ? profileCache.get(key) : undefined;
  if (cached) {
    return cached;
  }

  const itemName = typeof def.item === 'string' ? def.item : def.item[0];
  const canHit = canWeaponHit(monster, itemName, HIT_STYLE[def.group]);
  let best: SpecProfile | undefined;
  if (player) {
    best = { ...profileFromCalc(weapon, player, monster), canHit, style: `${player.style.name} (${player.style.stance})` };
  } else {
    for (const style of specStyles(weapon)) {
      const p = profileFromCalc(weapon, specPlayer(monster, weapon, style, assumptions), monster);
      if (!best || p.hitChance > best.hitChance) {
        best = { ...p, canHit, style: `${style.name} (${style.stance})` };
      }
    }
  }
  if (!best) {
    throw new Error(`specs: ${def.item} has no ${def.group} style`);
  }
  if (!canHit) {
    best = {
      ...best, hitChance: 0, expectedDamage: 0, expectedDamageOnHit: 0, expectedHits: 0, outcomes: NO_HIT,
    };
  }
  if (key) {
    profileCache.set(key, best);
  }
  return best;
};

/** Eye of Ayak: expected magic defence bonus drained by `count` specs (count × expected damage per spec), capped. */
export const ayakExpectedDrain = (profile: SpecProfile, count: number, magicDef: number): number => Math.max(
  0,
  Math.min(Math.max(0, magicDef), Math.max(0, count) * profile.expectedDamage),
);

// --- planner input -------------------------------------------------------------------------------------------------

/** Weapons the planners use (the accursed sceptre stays a phase 13 fallback in drains.ts). */
export type PlannerWeapon = 'elderMaul' | 'dwh' | 'tonalztics' | 'bgs' | 'ayak';
export const PLANNER_WEAPONS: PlannerWeapon[] = ['elderMaul', 'dwh', 'tonalztics', 'bgs', 'ayak'];

/** Everything the planners (teamSpecs.ts) need about one boss / phase; plain numbers so the maths is testable alone. */
export interface DrainModel {
  /** Defence level, floor, Magic level and Magic defence bonus before any drain (raid scaling / phase applied). */
  def: number;
  floor: number;
  magicLevel: number;
  magicDef: number;
  energy: Record<PlannerWeapon, number>;
  canHit: Record<PlannerWeapon, boolean>;
  hitChance: Record<PlannerWeapon, number>;
  /** Expected damage per attempt (misses included). */
  expectedDamage: Record<PlannerWeapon, number>;
  outcomes: Record<PlannerWeapon, SpecOutcome[]>;
}

const undrainedMonster = (m: Monster): Monster => ({
  ...m,
  inputs: { ...m.inputs, defenceReductions: { ...INITIAL_MONSTER_INPUTS.defenceReductions } },
});

/** The {@link DrainModel} of a monster (its drains are reset first). */
export const drainModel = (monster: Monster, assumptions: BestSetupAssumptions = DEFAULT_ASSUMPTIONS): DrainModel => {
  const m = undrainedMonster(monster);
  const scaled = scaleMonster(m);
  const profiles = Object.fromEntries(PLANNER_WEAPONS.map((w) => [w, specProfile(m, w, undefined, assumptions)])) as
    Record<PlannerWeapon, SpecProfile>;
  const pick = <T>(f: (p: SpecProfile) => T): Record<PlannerWeapon, T> => Object.fromEntries(
    PLANNER_WEAPONS.map((w) => [w, f(profiles[w])]),
  ) as Record<PlannerWeapon, T>;
  return {
    def: scaled.skills.def,
    floor: getDefenceFloor(scaled),
    magicLevel: scaled.skills.magic,
    magicDef: scaled.defensive.magic,
    energy: pick((p) => p.energy),
    canHit: pick((p) => p.canHit),
    hitChance: pick((p) => p.hitChance),
    expectedDamage: pick((p) => p.expectedDamage),
    outcomes: pick((p) => p.outcomes),
  };
};
