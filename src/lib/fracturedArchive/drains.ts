import { Monster } from '@/types/Monster';
import { INITIAL_MONSTER_INPUTS } from '@/lib/Monsters';
import { scaleMonster } from '@/lib/MonsterScaling';
import applyDefenceReductions, { getDefenceFloor } from '@/lib/scaling/DefenceReduction';

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
 *   Plans always start with at least 1 spec of the named weapon, so all-Tonalztics plans (e.g. the table's
 *   "4 Tonalztics of Ralos" for Archive Guardian) are not offered by these presets.
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
}

/** Most Elder maul / DWH specs a preset will use (3 special attack bars). */
export const MAX_HAMMER_SPECS = 6;
/** Most Tonalztics of Ralos hits a preset will use (4 charged specs = 2 bars). */
export const MAX_TONALZTIC_HITS = 8;

const SPEC_ENERGY_HAMMER = 50;
/** One charged Tonalztics of Ralos spec (50%) hits twice; an odd hit count still costs a whole spec. */
const SPEC_ENERGY_TONALZTIC_SPEC = 50;

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

/**
 * Fewest specs of the named weapon that reach the floor; if it can't on its own (floor 0), the cheapest
 * hammer + Tonalztic finisher combination; if nothing reaches the floor within the caps, the lowest defence found.
 */
const hammerPlan = (base: Monster, weapon: 'elderMaul' | 'dwh', floor: number): DefenceReductions => {
  for (let hammer = 1; hammer <= MAX_HAMMER_SPECS; hammer++) {
    const r = { ...emptyReductions(), [weapon]: hammer };
    if (drain(base, r).skills.def <= floor) {
      return r;
    }
  }

  let best: { r: DefenceReductions, def: number, energy: number, actions: number, hammer: number } | undefined;
  for (let hammer = 1; hammer <= MAX_HAMMER_SPECS; hammer++) {
    for (let tonalztic = 1; tonalztic <= MAX_TONALZTIC_HITS; tonalztic++) {
      const r = { ...emptyReductions(), [weapon]: hammer, tonalztic };
      const def = Math.max(floor, drain(base, r).skills.def);
      const energy = hammer * SPEC_ENERGY_HAMMER + Math.ceil(tonalztic / 2) * SPEC_ENERGY_TONALZTIC_SPEC;
      const actions = hammer + tonalztic;
      const better = !best
        || def < best.def
        || (def === best.def && (
          energy < best.energy
          || (energy === best.energy && hammer < best.hammer)
          || (energy === best.energy && hammer === best.hammer && actions < best.actions)));
      if (better) {
        best = {
          r, def, energy, actions, hammer,
        };
      }
      if (def <= floor) {
        break; // more Tonalztic hits only cost more
      }
    }
  }

  return best!.r;
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

export const maxDrainReductions = (m: Monster, opts: MaxDrainOptions): DrainPlan => {
  const base = undrained(m);
  const floor = getDefenceFloor(base);

  let reductions: DefenceReductions;
  if (opts.weapon === 'bgs') {
    reductions = { ...emptyReductions(), bgs: Math.max(0, base.skills.def - floor) };
  } else {
    reductions = hammerPlan(base, opts.weapon, floor);
  }
  if (opts.ayak) {
    reductions.ayak = Math.max(0, base.defensive.magic);
  }

  const drained = drain(base, reductions);
  return {
    reductions,
    floor,
    defBefore: base.skills.def,
    defAfter: drained.skills.def,
    magicDefBefore: base.defensive.magic,
    magicDefAfter: drained.defensive.magic,
    reachesFloor: drained.skills.def <= floor,
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
