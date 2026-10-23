import { Monster } from '@/types/Monster';
import { INITIAL_MONSTER_INPUTS } from '@/lib/Monsters';
import { scaleMonster } from '@/lib/MonsterScaling';
import applyDefenceReductions, { getDefenceFloor } from '@/lib/scaling/DefenceReduction';
import { canDrainToolHit } from '@/lib/fracturedArchive/hittable';

/**
 * "Max drain" presets for The Fractured Archive (phase 7), also used by the gear finder (phase 8/9).
 *
 * Pure, React-free: safe to call from the web worker / calc code. Nothing here mutates a monster; the functions
 * return `monster.inputs.defenceReductions` values that the normal pipeline (`scaleMonster` →
 * `applyDefenceReductions`) applies, so the result can be shown in and tweaked from the Defensive Reductions panel.
 *
 *   maxDrainReductions(m, { weapon: 'elderMaul', ayak: true }) → DrainPlan
 *   drainPresetReductions(m, 'floor-elderMaul+ayak')          → DefenceReductions
 *
 * How the spec counts are chosen (sources and per-boss numbers: docs/DATA_SOURCES.md, "Drain presets"):
 * - Elder maul / DWH: the fewest specs of that weapon that reach `getDefenceFloor(m)`, up to {@link MAX_HAMMER_SPECS}.
 *   A % drain can't reach 0 on its own (it stalls at a few levels), so for uncapped bosses (floor 0) the preset
 *   finishes with Tonalztics of Ralos hits, as in the wiki Strategies "Maximum defence reduction" table
 *   (e.g. The Blade: "2 Elder Maul + 4 Tonalztics of Ralos"; the table's Tonalztics counts are hits, not specs).
 *   Among combinations that reach the floor it picks the least special attack energy (hammer spec 50%; Tonalztics
 *   counted in whole charged specs of 2 hits, 50% each), then the fewest hammer specs, then the fewest actions.
 *   When the named weapon can hit, plans start with at least 1 spec of it.
 * - Phase 13: a plan only uses weapons that can hit the monster in its selected version / phase
 *   (`canDrainToolHit`, which asks upstream's `isImmune`). The Tonalztics finisher is dropped where ranged is blocked
 *   (Ocellus P3 Deflect Ranged). When the named weapon can't hit (melee vs flying Archive Guardian, Ocellus P1
 *   walking / P3 Deflect Melee) the plan is the cheapest one among the weapons that can: Tonalztics hits, optionally
 *   after one Accursed sceptre spec (its Defence part counts, as in phase 3), same ranking as above; e.g. AG Flying
 *   → the wiki table's "4 Tonalztics of Ralos" (2 specs) → Def 156. `DrainPlan.weaponCanHit` / `summary` tell the UI.
 *   The table's Smorks "2 Elder Maul + 4 Tonalztics" and Dreadnoth "1 Elder Maul + 3 Tonalztics" reach exactly 0
 *   only if the Tonalztics drain rounds up (24 / 28 per hit); upstream truncates (23 / 27), leaving 1 Defence. The
 *   Elder maul page says its drain rounds down (75 -> 49), so Tonalztics rounding up is the plausible explanation;
 *   **unverified**, kept as upstream computes it.
 * - BGS: Bandos godsword damage equal to (defence − floor); the BGS drains Defence first, so this lands exactly on
 *   the floor (needs several specs on 300-def Bork — that's what "max" means with only a BGS).
 * - Ayak: Eye of Ayak's Soul Rend lowers the target's Magic Defence *bonus* by the damage dealt, floored at 0
 *   (https://oldschool.runescape.wiki/w/Eye_of_Ayak#Special_attack). Upstream's `ayak` input is that damage, so
 *   "Ayak to 0" sets it to the monster's magic defence bonus; specs needed = ceil(that / average spec damage),
 *   see {@link ayakSpecsToZero}.
 * - Every other reduction (accursed, vulnerability, arclight, ...) is reset, so a preset is a well-defined state.
 */

export type DefenceReductions = Monster['inputs']['defenceReductions'];
export type DrainWeapon = 'elderMaul' | 'dwh' | 'bgs';

export interface MaxDrainOptions {
  weapon: DrainWeapon;
  ayak: boolean;
}

export interface DrainPlan {
  /** Complete defenceReductions inputs (other reductions reset) to write into `monster.inputs`. */
  reductions: DefenceReductions;
  /** Defence floor from `getDefenceFloor`. */
  floor: number;
  /** Defence level before / after the drains (after raid scaling and phases). */
  defBefore: number;
  defAfter: number;
  /** Magic defence bonus before / after the drains. */
  magicDefBefore: number;
  magicDefAfter: number;
  /** False only when the floor can't be reached within the spec caps (the plan is then the lowest defence found). */
  reachesFloor: boolean;
  /**
   * Whether the requested weapon can hit the monster in its selected version / phase ({@link canDrainToolHit}). When
   * false the plan is the cheapest one among the drain weapons that can (e.g. Tonalztics on a flying Archive Guardian).
   */
  weaponCanHit: boolean;
  /** Defence drain specs, e.g. "4× Tonalztics hits (2 specs)" (Ayak not included), see {@link describeDefenceDrains}. */
  specs: string;
  /** `specs` + resulting Defence, e.g. "4× Tonalztics hits (2 specs) → Def 156". */
  summary: string;
}

/** Most Elder maul / DWH specs a preset will use (3 special attack bars). */
export const MAX_HAMMER_SPECS = 6;
/** Most Tonalztics of Ralos hits a preset will use (4 charged specs = 2 bars). */
export const MAX_TONALZTIC_HITS = 8;

const SPEC_ENERGY_HAMMER = 50;
/** One charged Tonalztics of Ralos spec (50%) hits twice; an odd hit count still costs a whole spec. */
const SPEC_ENERGY_TONALZTIC_SPEC = 50;
const SPEC_ENERGY_ACCURSED = 50;

const withReductions = (m: Monster, reductions: DefenceReductions): Monster => ({
  ...m,
  inputs: {
    ...m.inputs,
    defenceReductions: reductions,
  },
});

const emptyReductions = (): DefenceReductions => ({ ...INITIAL_MONSTER_INPUTS.defenceReductions });

/** The monster as the calc sees it just before defence reductions (raid scaling + phases applied). */
const undrained = (m: Monster): Monster => scaleMonster(withReductions(m, emptyReductions()));

const drain = (base: Monster, reductions: DefenceReductions): Monster => applyDefenceReductions(
  withReductions(base, reductions),
);

const energyOf = (r: DefenceReductions): number => (r.elderMaul + r.dwh) * SPEC_ENERGY_HAMMER
  + (r.accursed ? SPEC_ENERGY_ACCURSED : 0)
  + Math.ceil(r.tonalztic / 2) * SPEC_ENERGY_TONALZTIC_SPEC;

const actionsOf = (r: DefenceReductions): number => r.elderMaul + r.dwh + (r.accursed ? 1 : 0) + r.tonalztic;

interface Scored { r: DefenceReductions, def: number, energy: number, hammer: number, actions: number }

const score = (base: Monster, floor: number, r: DefenceReductions): Scored => ({
  r,
  def: Math.max(floor, drain(base, r).skills.def),
  energy: energyOf(r),
  hammer: r.elderMaul + r.dwh,
  actions: actionsOf(r),
});

/** Lower defence, then less spec energy, then fewer hammer specs, then fewer actions. */
const isBetter = (a: Scored, b: Scored | undefined): boolean => !b
  || a.def < b.def
  || (a.def === b.def && (
    a.energy < b.energy
    || (a.energy === b.energy && a.hammer < b.hammer)
    || (a.energy === b.energy && a.hammer === b.hammer && a.actions < b.actions)));

/**
 * Fewest specs of the named weapon that reach the floor; if it can't on its own (floor 0), the cheapest
 * hammer + Tonalztic finisher combination (only if Tonalztics can hit); if nothing reaches the floor within the caps,
 * the lowest defence found.
 */
const hammerPlan = (
  base: Monster,
  weapon: 'elderMaul' | 'dwh',
  floor: number,
  allowTonalztic: boolean,
): DefenceReductions => {
  for (let hammer = 1; hammer <= MAX_HAMMER_SPECS; hammer++) {
    const r = { ...emptyReductions(), [weapon]: hammer };
    if (drain(base, r).skills.def <= floor) {
      return r;
    }
  }

  let best: Scored | undefined;
  for (let hammer = 1; hammer <= MAX_HAMMER_SPECS; hammer++) {
    for (let tonalztic = 0; tonalztic <= (allowTonalztic ? MAX_TONALZTIC_HITS : 0); tonalztic++) {
      const s = score(base, floor, { ...emptyReductions(), [weapon]: hammer, tonalztic });
      if (isBetter(s, best)) {
        best = s;
      }
      if (s.def <= floor) {
        break; // more Tonalztic hits only cost more
      }
    }
  }

  return best!.r;
};

/**
 * Plan without melee (phase 13): Tonalztics of Ralos hits (if ranged can hit), optionally after one Accursed sceptre
 * spec (if magic can hit; its Defence part applies everywhere, its Magic-level part is absorbed on Archive Guardian,
 * see docs/DATA_SOURCES.md). Undefined if neither can hit.
 */
const nonMeleePlan = (
  base: Monster,
  floor: number,
  allowTonalztic: boolean,
  allowAccursed: boolean,
): Scored | undefined => {
  let best: Scored | undefined;
  for (let accursed = 0; accursed <= (allowAccursed ? 1 : 0); accursed++) {
    for (let tonalztic = 0; tonalztic <= (allowTonalztic ? MAX_TONALZTIC_HITS : 0); tonalztic++) {
      if (accursed + tonalztic > 0) {
        const s = score(base, floor, { ...emptyReductions(), accursed: accursed === 1, tonalztic });
        if (isBetter(s, best)) {
          best = s;
        }
        if (s.def <= floor) {
          break;
        }
      }
    }
  }
  return best;
};

/** Eye of Ayak damage needed to bring the monster's magic defence bonus to 0 (0 if it's already ≤ 0). */
export const ayakDamageToZero = (m: Monster): number => Math.max(0, undrained(m).defensive.magic);

/** Eye of Ayak specs needed to bring magic defence to 0 at a given average damage per (successful) spec. */
export const ayakSpecsToZero = (m: Monster, damagePerSpec: number): number => {
  const dmg = ayakDamageToZero(m);
  if (dmg === 0) {
    return 0;
  }
  return damagePerSpec > 0 ? Math.ceil(dmg / damagePerSpec) : Infinity;
};

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Defence drain specs in a reductions object, e.g. "1× Elder maul + 7× Tonalztics hits (4 specs)". Ayak excluded. */
export const describeDefenceDrains = (r: DefenceReductions): string => {
  const parts: string[] = [];
  if (r.accursed) parts.push('1× Accursed sceptre');
  if (r.elderMaul) parts.push(`${r.elderMaul}× Elder maul`);
  if (r.dwh) parts.push(`${r.dwh}× DWH`);
  if (r.tonalztic) {
    parts.push(`${r.tonalztic}× Tonalztics hit${r.tonalztic === 1 ? '' : 's'} (${plural(Math.ceil(r.tonalztic / 2), 'spec')})`);
  }
  if (r.bgs) parts.push(`BGS ${r.bgs} dmg`);
  return parts.length ? parts.join(' + ') : 'no defence drains';
};

/** Whether a preset weapon can hit the monster in its selected version / phase (for greying out buttons). */
export const drainWeaponCanHit = (m: Monster, weapon: DrainWeapon): boolean => canDrainToolHit(m, weapon);

export const maxDrainReductions = (m: Monster, opts: MaxDrainOptions): DrainPlan => {
  const base = undrained(m);
  const floor = getDefenceFloor(base);
  const canHit = {
    elderMaul: canDrainToolHit(m, 'elderMaul'),
    dwh: canDrainToolHit(m, 'dwh'),
    bgs: canDrainToolHit(m, 'bgs'),
    tonalztic: canDrainToolHit(m, 'tonalztic'),
    accursed: canDrainToolHit(m, 'accursed'),
  };
  const bgsPlan = (): DefenceReductions => ({ ...emptyReductions(), bgs: Math.max(0, base.skills.def - floor) });

  let reductions: DefenceReductions;
  if (canHit[opts.weapon]) {
    reductions = opts.weapon === 'bgs' ? bgsPlan() : hammerPlan(base, opts.weapon, floor, canHit.tonalztic);
  } else {
    // Fallback: cheapest plan among the drain weapons that can hit (BGS only if nothing else can).
    let best = nonMeleePlan(base, floor, canHit.tonalztic, canHit.accursed);
    (['elderMaul', 'dwh'] as const).filter((w) => canHit[w]).forEach((w) => {
      const s = score(base, floor, hammerPlan(base, w, floor, canHit.tonalztic));
      if (isBetter(s, best)) {
        best = s;
      }
    });
    if (best) {
      reductions = best.r;
    } else {
      reductions = canHit.bgs ? bgsPlan() : emptyReductions();
    }
  }
  if (opts.ayak) {
    reductions.ayak = Math.max(0, base.defensive.magic);
  }

  const drained = drain(base, reductions);
  const specs = describeDefenceDrains(reductions);
  return {
    reductions,
    floor,
    defBefore: base.skills.def,
    defAfter: drained.skills.def,
    magicDefBefore: base.defensive.magic,
    magicDefAfter: drained.defensive.magic,
    reachesFloor: drained.skills.def <= floor,
    weaponCanHit: canHit[opts.weapon],
    specs,
    summary: `${specs} → Def ${drained.skills.def}`,
  };
};

export type DrainPresetId =
  | 'none'
  | 'floor-elderMaul' | 'floor-elderMaul+ayak'
  | 'floor-dwh' | 'floor-dwh+ayak'
  | 'floor-bgs' | 'floor-bgs+ayak';

export interface DrainPreset {
  id: DrainPresetId;
  label: string;
  /** null = no drains (reset). */
  options: MaxDrainOptions | null;
}

const WEAPON_LABELS: { [k in DrainWeapon]: string } = {
  elderMaul: 'Elder maul',
  dwh: 'DWH',
  bgs: 'BGS',
};

export const DRAIN_PRESETS: DrainPreset[] = [
  { id: 'none', label: 'Reset', options: null },
  ...(['elderMaul', 'dwh', 'bgs'] as DrainWeapon[]).flatMap((weapon): DrainPreset[] => [
    { id: `floor-${weapon}` as DrainPresetId, label: `Floor (${WEAPON_LABELS[weapon]})`, options: { weapon, ayak: false } },
    { id: `floor-${weapon}+ayak` as DrainPresetId, label: `Floor (${WEAPON_LABELS[weapon]}) + Ayak`, options: { weapon, ayak: true } },
  ]),
];

/** The defenceReductions inputs for a named preset ('none' = all reductions cleared). */
export const drainPresetReductions = (m: Monster, id: DrainPresetId): DefenceReductions => {
  const preset = DRAIN_PRESETS.find((p) => p.id === id);
  if (!preset?.options) {
    return emptyReductions();
  }
  return maxDrainReductions(m, preset.options).reductions;
};
