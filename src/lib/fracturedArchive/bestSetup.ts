import { Monster } from '@/types/Monster';
import { Player } from '@/types/Player';
import { PlayerCombatStyle } from '@/types/PlayerCombatStyle';
import { EquipmentCategory } from '@/enums/EquipmentCategory';
import { MonsterAttribute } from '@/enums/MonsterAttribute';
import { getMonsters, INITIAL_MONSTER_INPUTS } from '@/lib/Monsters';
import { scaleMonster } from '@/lib/MonsterScaling';
import PlayerVsNPCCalc from '@/lib/PlayerVsNPCCalc';
import { MONSTER_PHASES_BY_ID } from '@/lib/constants';
import { getCombatStylesForCategory } from '@/utils';
import { DefenceReductions } from '@/lib/fracturedArchive/drains';
import { drainModel, PlanLabel } from '@/lib/fracturedArchive/specs';
import {
  carriersFromCounts, describeAttempts, formatProbability, soloSpecPlan, teamSpecPlan,
} from '@/lib/fracturedArchive/teamSpecs';
import {
  BORK_PHASES, BORK_STUNNED_PHASE, DAGONHAI_PHASES, DAGONHAI_SHIELDED_PHASE, OCELLUS_P1_PHASES, OCELLUS_P3_PHASES,
} from '@/lib/fracturedArchive/constants';
import { isOutOfMeleeReach } from '@/lib/fracturedArchive/immunities';
import {
  BestSetupAssumptions, PRESETS, PresetDef, StyleGroup,
} from '@/lib/fracturedArchive/presets';
import {
  applyLoadoutToPlayer, ITEM_VERSION_PREFERENCE, potionBoosts, resolveItem, resolvePresetEquipment,
} from '@/lib/fracturedArchive/loadout';

/**
 * "Best setup" view (phase 8): evaluates the named presets (presets.ts) against every Fractured Archive boss/phase
 * under three drain states. Pure and React-free: used by the gear search worker (seeds, "vs best preset") and in Jest,
 * and the gear finder (phase 9) can reuse `evaluateLoadout` / `buildTargetMonster` / `applyPresetToPlayer`.
 *
 * The numbers come from the same functions as the main calculator: the player is assembled like the store does it
 * (equipment → calculateEquipmentBonusesFromGear, potions → PotionMap boosts) and evaluated with PlayerVsNPCCalc
 * exactly like the worker's COMPUTE_BASIC handler (getDps / getTtk / getDistribution().getMax() /
 * getDisplayHitChance()).
 */

// --- items (moved to loadout.ts in phase 14, re-exported here) ------------------------------------------------------

export {
  ITEM_VERSION_PREFERENCE, resolveItem, resolvePresetEquipment, potionBoosts, applyLoadoutToPlayer,
};

// --- targets -------------------------------------------------------------------------------------------------------

export interface BestSetupTarget {
  key: string;
  label: string;
  name: string;
  version: string;
  /** Phase dropdown options (MONSTER_PHASES_BY_ID); the first one is the default. */
  phases?: string[];
  /** Phase options that get their own row in the Summary table. */
  summaryPhases?: string[];
  /** Expected TTK isn't meaningful (Ocellus P2: the Blade phase is timed, damage transfers 50% to P3). */
  ttkNotApplicable?: boolean;
  note?: string;
}

export const BEST_SETUP_TARGETS: BestSetupTarget[] = [
  {
    key: 'ag-flying', label: 'Archive Guardian (Flying)', name: 'Archive Guardian', version: 'Flying',
  },
  {
    key: 'ag-grounded', label: 'Archive Guardian (Grounded)', name: 'Archive Guardian', version: 'Grounded',
  },
  {
    key: 'smorks', label: 'The Smorks', name: 'The Smorks', version: '',
  },
  {
    key: 'bork',
    label: 'Bork',
    name: 'Bork',
    version: '',
    phases: BORK_PHASES,
    summaryPhases: [BORK_PHASES[0], BORK_STUNNED_PHASE],
  },
  // Phase 15: Ezekiel is the alternative to Bork and the Smorks (2nd boss); no phase options (no stat changes on the wiki)
  {
    key: 'ezekiel', label: 'Ezekiel', name: 'Ezekiel', version: '',
  },
  {
    key: 'dreadnoth', label: 'Dreadnoth the Jellied', name: 'Dreadnoth the Jellied', version: '',
  },
  {
    key: 'jelly', label: 'Jelly (Dreadnoth)', name: 'Jelly (Dreadnoth)', version: '',
  },
  // Phase 15: Moia is the alternative to Dreadnoth (3rd boss); melee can't reach her
  {
    key: 'moia', label: 'Moia', name: 'Moia', version: '', note: 'Out of melee reach: ranged or magic only.',
  },
  {
    key: 'xarth', label: 'Xarth', name: 'Xarth', version: '',
  },
  // Phase 15: the Dagon'hai trio is the alternative to Xarth (4th boss). Elder and Monks share stats and one health
  // pool, so the Elder stands for all three; "Unshielded" only changes hp (7), so the Summary shows the shielded row.
  {
    key: 'dagonhai',
    label: 'Dagon\'hai Elder + Monks',
    name: 'Dagon\'hai Elder',
    version: '',
    phases: DAGONHAI_PHASES,
    summaryPhases: [DAGONHAI_SHIELDED_PHASE],
    note: 'Elder and Monks share stats and one health pool; the shield gauge is depleted 5 times (unverified).',
  },
  {
    key: 'ocellus-p1',
    label: 'Ocellus P1',
    name: 'Ocellus',
    version: 'Phase 1',
    phases: OCELLUS_P1_PHASES,
    summaryPhases: OCELLUS_P1_PHASES,
  },
  {
    key: 'ocellus-p2',
    label: 'Ocellus P2 (The Blade)',
    name: 'Ocellus',
    version: 'Phase 2',
    ttkNotApplicable: true,
    note: 'DPS = damage to the Blade; 50% transfers to P3. TTK n/a (timed phase).',
  },
  {
    key: 'ocellus-p3',
    label: 'Ocellus P3',
    name: 'Ocellus',
    version: 'Phase 3',
    phases: OCELLUS_P3_PHASES,
    summaryPhases: OCELLUS_P3_PHASES,
    note: 'Last-quadrant options are low-confidence (deflect strength and dodge speed-up unverified).',
  },
];

export const findTarget = (key: string): BestSetupTarget => {
  const t = BEST_SETUP_TARGETS.find((x) => x.key === key);
  if (!t) {
    throw new Error(`Best setup: unknown target '${key}'`);
  }
  return t;
};

const baseMonster = (target: BestSetupTarget): Omit<Monster, 'inputs'> => {
  const m = getMonsters().find((x) => x.name === target.name && x.version === target.version);
  if (!m) {
    throw new Error(`Best setup: monster '${target.name}' (${target.version}) not in monsters.json`);
  }
  return m;
};

/** Phase options of a target (from the main calculator's phase table), or [] when it has none. */
export const targetPhases = (target: BestSetupTarget): string[] => target.phases
  || MONSTER_PHASES_BY_ID[baseMonster(target).id]
  || [];

// --- drain states --------------------------------------------------------------------------------------------------

export type DrainStateId = 'none' | 'solo' | 'team';

export const DRAIN_STATES: { id: DrainStateId, label: string, description: string }[] = [
  { id: 'none', label: 'None', description: 'No defence or magic defence drains' },
  {
    id: 'solo',
    label: 'Solo',
    description: 'My specs within my own spec energy (100% + 10% per 30 s of the fight length, 15 s with Lightbearer), '
      + 'with the weapons ticked under "My specs"; hit chances from the calculator. Ranked at the Defence floor if '
      + 'P(floor) ≥ the threshold, else at the nearest reachable Defence to the expected value; Ayak = specs × expected damage',
  },
  {
    id: 'team',
    label: 'Team',
    description: 'The team\'s carriers each spec twice at the start (first round); ranked at the Defence floor if '
      + 'P(floor from the first round) ≥ the threshold, else at the nearest reachable Defence to the expected value; Ayak: magic def 0 '
      + 'if P(0) ≥ the threshold, else bonus − expected drain',
  },
];

export interface DrainState {
  id: DrainStateId;
  reductions: DefenceReductions;
  /** Short line for tables, e.g. "2× Elder maul (P floor 59%)". */
  specs: string;
  /** Full plan text (phase 14), e.g. "2× Elder maul → expected Def 191, P(Def 180) 59% → ranked at Def 195; ...". */
  plan: string;
  /** P(Defence floor) of the plan (undefined for None). */
  pFloor?: number;
  /** Energy label of the Solo plan (of the full plan the carried weapons need); undefined for None / Team. */
  label?: PlanLabel;
  defAfter: number;
  magicDefAfter: number;
}

const withInputs = (m: Monster, inputs: Partial<Monster['inputs']>): Monster => ({
  ...m,
  inputs: { ...m.inputs, ...inputs },
});

/**
 * Phase 14: Solo = `soloSpecPlan` (the user's carried weapons within their own energy budget), Team =
 * `teamSpecPlan` (the carriers' first round). Both rank at the floor if P(floor) ≥ `floorThreshold`, else at the
 * nearest reachable Defence to the expected value; see teamSpecs.ts. The calculator's Max-drain buttons (drains.ts)
 * are unchanged.
 */
export const drainStateFor = (m: Monster, id: DrainStateId, assumptions: BestSetupAssumptions): DrainState => {
  let reductions: DefenceReductions = { ...INITIAL_MONSTER_INPUTS.defenceReductions };
  let specs = 'no specs';
  let plan = 'No drains';
  let pFloor: number | undefined;
  let label: PlanLabel | undefined;
  if (id !== 'none') {
    const model = drainModel(m, assumptions);
    const threshold = assumptions.floorThreshold;
    if (id === 'solo') {
      const { mySpecs } = assumptions;
      const p = soloSpecPlan(model, {
        carried: {
          elderMaul: mySpecs.elderMaul, dwh: mySpecs.dwh, tonalztics: mySpecs.tonalztics, bgs: mySpecs.bgs,
        },
        ayakSpecs: mySpecs.ayak,
        lightbearer: mySpecs.lightbearer,
        fightSeconds: assumptions.fightSeconds,
        priority: mySpecs.priority,
        threshold,
      });
      reductions = p.reductions;
      pFloor = p.defence.pFloor;
      label = p.needed.label;
      plan = `Solo: ${p.text}`;
      specs = `${describeAttempts([...p.attempts, ...Array(p.ayakAttempts).fill('ayak')])} (P floor ${formatProbability(pFloor)}, ${label})`;
    } else {
      const p = teamSpecPlan(model, {
        partySize: assumptions.partySize,
        carriers: carriersFromCounts(assumptions.team.carriers, assumptions.team.lightbearer),
        fightSeconds: assumptions.fightSeconds,
        threshold,
      });
      reductions = p.reductions;
      pFloor = p.firstRound.defence.pFloor;
      plan = `Team (${assumptions.partySize}): ${p.text}`;
      specs = `first round ${describeAttempts(p.firstRound.attempts)} (P floor ${formatProbability(pFloor)})`;
    }
  }
  const scaled = scaleMonster(withInputs(m, { defenceReductions: reductions }));
  return {
    id,
    reductions,
    specs,
    plan,
    pFloor,
    label,
    defAfter: scaled.skills.def,
    magicDefAfter: scaled.defensive.magic,
  };
};

/**
 * The monster as the main calculator holds it after selecting the boss, phase and party size and pressing the drain
 * buttons: raw stats + inputs (current HP = scaled HP, like MonsterContainer sets it). The calc scales it itself.
 */
export const buildTargetMonster = (
  target: BestSetupTarget,
  phase: string | undefined,
  drain: DrainStateId,
  assumptions: BestSetupAssumptions,
): { monster: Monster, drain: DrainState } => {
  const phases = targetPhases(target);
  let m: Monster = {
    ...baseMonster(target),
    inputs: {
      ...INITIAL_MONSTER_INPUTS,
      defenceReductions: { ...INITIAL_MONSTER_INPUTS.defenceReductions },
      partySize: Math.min(8, Math.max(2, assumptions.partySize)),
      phase: phase && phases.includes(phase) ? phase : phases[0],
    },
  };
  m = withInputs(m, { monsterCurrentHp: scaleMonster(m).skills.hp });
  const d = drainStateFor(m, drain, assumptions);
  return { monster: withInputs(m, { defenceReductions: d.reductions }), drain: d };
};

// --- players -------------------------------------------------------------------------------------------------------

export const NON_CANDIDATE_STANCES = ['Defensive', 'Defensive Autocast', 'Manual Cast'];

/** The combat styles a preset tries (deduplicated by name + stance). */
export const presetStyles = (preset: PresetDef): PlayerCombatStyle[] => {
  const weapon = preset.equipment.weapon ? resolveItem(preset.equipment.weapon) : undefined;
  const all = getCombatStylesForCategory(weapon?.category || EquipmentCategory.NONE);
  const picked = all.filter((s) => (!preset.styles || preset.styles.includes(s.name))
    && !NON_CANDIDATE_STANCES.includes(s.stance || ''));
  return picked.filter((s, i) => picked.findIndex((o) => o.name === s.name && o.stance === s.stance) === i);
};

export const presetSpells = (preset: PresetDef): (string | null)[] => (preset.spells?.length ? preset.spells : [null]);

/**
 * Applies a preset to a base player (pass `generateEmptyPlayer()` from '@/state'; taken as a parameter so this module
 * stays importable from the worker): 99s, equipment, style, spell, potion, prayer, fragments, then the bonuses and
 * attack speed exactly as the store computes them.
 */
export const applyPresetToPlayer = (
  base: Player,
  preset: PresetDef,
  style: PlayerCombatStyle,
  spellName: string | null,
  monster: Monster,
  assumptions: BestSetupAssumptions,
): Player => applyLoadoutToPlayer(
  base,
  preset.name,
  preset.group,
  resolvePresetEquipment(preset),
  style,
  spellName,
  monster,
  assumptions,
);

// --- evaluation ----------------------------------------------------------------------------------------------------

export interface LoadoutEvaluation {
  dps: number;
  /** Expected time to kill in seconds (upstream getTtk); 0 when no damage is dealt. */
  ttk: number;
  maxHit: number;
  accuracy: number;
  /** Calculator warnings (e.g. "Ocellus is praying against this combat style."). */
  issues: string[];
}

/**
 * One loadout vs one monster, through PlayerVsNPCCalc exactly as the worker's COMPUTE_BASIC does it.
 * `withTtk: false` skips getTtk (ttk = NaN): it is the expensive part (O(hp × max hit)), so callers rank by DPS first.
 */
export const evaluateLoadout = (player: Player, monster: Monster, withTtk = true): LoadoutEvaluation => {
  const calc = new PlayerVsNPCCalc(player, monster, {
    loadoutName: player.name,
    detailedOutput: false,
    disableMonsterScaling: monster.id === -1,
  });
  return {
    dps: calc.getDps(),
    ttk: withTtk ? calc.getTtk() : NaN,
    maxHit: calc.getDistribution().getMax(),
    accuracy: calc.getDisplayHitChance(),
    issues: calc.userIssues.map((i) => i.message),
  };
};

export interface PresetResult {
  preset: string;
  group: StyleGroup;
  note?: string;
  style: PlayerCombatStyle;
  spell: string | null;
  /** e.g. "Chop (Aggressive)" or "Spell (Autocast), Fire Surge". */
  styleLabel: string;
  dps: number;
  /** null = not applicable (Ocellus P2) or no damage. */
  ttk: number | null;
  maxHit: number;
  accuracy: number;
  /** Set when the preset deals no damage. */
  cantHit?: string;
  /** Set when evaluating the preset threw (bad item name, calc error, ...); the row then has 0 DPS. */
  error?: string;
}

export const styleLabel = (style: PlayerCombatStyle, spell: string | null): string => `${style.name} (${style.stance})${spell ? `, ${spell}` : ''}`;

export const cantHitReason = (monster: Monster, style: PlayerCombatStyle, issues: string[]): string => {
  if (issues.length) return issues.join(' ');
  if (monster.attributes.includes(MonsterAttribute.FLYING) && ['stab', 'slash', 'crush'].includes(style.type || '')) {
    return 'Flying: melee can\'t reach it';
  }
  if (isOutOfMeleeReach(monster) && ['stab', 'slash', 'crush'].includes(style.type || '')) {
    return 'Out of melee reach: ranged or magic only';
  }
  return 'Deals no damage (immune or blocked)';
};

/**
 * Best style/spell (highest DPS; the first listed on ties) of one preset against one monster. Expected TTK is
 * computed for the winner only, and only when `withTtk`.
 */
export const evaluatePreset = (
  basePlayer: Player,
  preset: PresetDef,
  monster: Monster,
  assumptions: BestSetupAssumptions,
  ttkNotApplicable = false,
  withTtk = true,
): PresetResult => {
  let best: PresetResult | undefined;
  for (const style of presetStyles(preset)) {
    for (const spell of presetSpells(preset)) {
      const player = applyPresetToPlayer(basePlayer, preset, style, spell, monster, assumptions);
      const ev = evaluateLoadout(player, monster, false);
      if (!best || ev.dps > best.dps) {
        best = {
          preset: preset.name,
          group: preset.group,
          note: preset.note,
          style,
          spell,
          styleLabel: styleLabel(style, spell),
          dps: ev.dps,
          ttk: null,
          maxHit: ev.maxHit,
          accuracy: ev.accuracy,
          cantHit: ev.dps <= 0 ? cantHitReason(monster, style, ev.issues) : undefined,
        };
      }
    }
  }
  if (!best) {
    throw new Error(`Best setup: preset '${preset.name}' has no combat styles to try`);
  }
  if (withTtk && !ttkNotApplicable && best.dps > 0) {
    const player = applyPresetToPlayer(basePlayer, preset, best.style, best.spell, monster, assumptions);
    best.ttk = evaluateLoadout(player, monster).ttk;
  }
  return best;
};

/**
 * {@link evaluatePreset}, but a preset that throws becomes a 0-DPS error row instead of failing the whole request
 * (one broken preset must not blank the view).
 */
export const safeEvaluatePreset = (...args: Parameters<typeof evaluatePreset>): PresetResult => {
  try {
    return evaluatePreset(...args);
  } catch (e) {
    const preset = args[1];
    const message = e instanceof Error ? e.message : String(e);
    return {
      preset: preset.name,
      group: preset.group,
      note: preset.note,
      style: { name: '-', type: null, stance: null },
      spell: null,
      styleLabel: '-',
      dps: 0,
      ttk: null,
      maxHit: 0,
      accuracy: 0,
      cantHit: `Error: ${message}`,
      error: message,
    };
  }
};

/** Highest DPS first; ties keep the presets.ts order. */
export const rankResults = (rows: PresetResult[]): PresetResult[] => rows
  .map((r, i) => [r, i] as const)
  .sort(([a, ia], [b, ib]) => (b.dps - a.dps) || (ia - ib))
  .map(([r]) => r);

export interface BestSetupQuery {
  targetKey: string;
  phase?: string;
}

export interface BestSetupResult {
  targetKey: string;
  phase?: string;
  drains: {
    drain: DrainState;
    rows: PresetResult[];
  }[];
}

/**
 * Every preset ranked for each query × drain state. `ttk: 'top'` computes the expected TTK of the best preset only
 * (the Summary table; TTK is the slow part).
 */
export const computeBestSetup = (
  basePlayer: Player,
  queries: BestSetupQuery[],
  assumptions: BestSetupAssumptions,
  presets: PresetDef[] = PRESETS,
  ttk: 'all' | 'top' = 'all',
): BestSetupResult[] => queries.map(({ targetKey, phase }) => {
  const target = findTarget(targetKey);
  const drains = DRAIN_STATES.map(({ id }) => {
    const { monster, drain } = buildTargetMonster(target, phase, id, assumptions);
    const rows = rankResults(presets.map((p) => safeEvaluatePreset(
      basePlayer,
      p,
      monster,
      assumptions,
      target.ttkNotApplicable,
      ttk === 'all',
    )));
    if (ttk === 'top' && rows.length && !rows[0].error) {
      const preset = presets.find((p) => p.name === rows[0].preset)!;
      rows[0] = safeEvaluatePreset(basePlayer, preset, monster, assumptions, target.ttkNotApplicable, true);
    }
    return { drain, rows };
  });
  return { targetKey, phase: buildTargetMonster(target, phase, 'none', assumptions).monster.inputs.phase, drains };
});

/** Summary queries: every target × its summary phases (or the default phase). */
export const summaryQueries = (): BestSetupQuery[] => BEST_SETUP_TARGETS.flatMap((t) => {
  const phases = t.summaryPhases || [targetPhases(t)[0]];
  return phases.map((phase) => ({ targetKey: t.key, phase }));
});
