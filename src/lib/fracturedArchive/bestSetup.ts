import { Monster } from '@/types/Monster';
import {
  EquipmentPiece, Player, PlayerEquipment, PlayerSkills,
} from '@/types/Player';
import { PlayerCombatStyle } from '@/types/PlayerCombatStyle';
import { Spellement, spells } from '@/types/Spell';
import { Prayer } from '@/enums/Prayer';
import { EquipmentCategory } from '@/enums/EquipmentCategory';
import { MonsterAttribute } from '@/enums/MonsterAttribute';
import { getMonsters, INITIAL_MONSTER_INPUTS } from '@/lib/Monsters';
import { availableEquipment, calculateEquipmentBonusesFromGear } from '@/lib/Equipment';
import { scaleMonster } from '@/lib/MonsterScaling';
import PlayerVsNPCCalc from '@/lib/PlayerVsNPCCalc';
import { MONSTER_PHASES_BY_ID } from '@/lib/constants';
import { getCombatStylesForCategory, PotionMap } from '@/utils';
import { DefenceReductions, describeDefenceDrains, maxDrainReductions } from '@/lib/fracturedArchive/drains';
import {
  BORK_PHASES, BORK_STUNNED_PHASE, OCELLUS_P1_PHASES, OCELLUS_P3_PHASES,
} from '@/lib/fracturedArchive/constants';
import {
  BestSetupAssumptions, ItemRef, PRESETS, PresetDef, StyleGroup,
} from '@/lib/fracturedArchive/presets';

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

// --- items ---------------------------------------------------------------------------------------------------------

/** When an item name has several versions, the first of these that exists is used (else the first entry). */
export const ITEM_VERSION_PREFERENCE = ['', 'Charged', 'Normal', 'Restored', 'Undamaged', 'Unpoisoned', 'New'];

export const resolveItem = (ref: ItemRef): EquipmentPiece => {
  const [name, version] = typeof ref === 'string' ? [ref, undefined] : ref;
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
  return item;
};

export const resolvePresetEquipment = (preset: PresetDef): Partial<PlayerEquipment> => Object.fromEntries(
  Object.entries(preset.equipment).map(([slot, ref]) => [slot, resolveItem(ref as ItemRef)]),
);

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
  {
    key: 'dreadnoth', label: 'Dreadnoth the Jellied', name: 'Dreadnoth the Jellied', version: '',
  },
  {
    key: 'jelly', label: 'Jelly (Dreadnoth)', name: 'Jelly (Dreadnoth)', version: '',
  },
  {
    key: 'xarth', label: 'Xarth', name: 'Xarth', version: '',
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
    description: 'Defence to the floor with Elder maul (+ Tonalztics hits on uncapped bosses; Tonalztics / Accursed '
      + 'sceptre only where melee cannot hit, e.g. flying Archive Guardian), Eye of Ayak damage as set in the '
      + 'assumptions (default 80 ≈ 2 specs), capped at the magic defence bonus',
  },
  {
    id: 'team',
    label: 'Team',
    description: 'Defence as in Solo, Eye of Ayak to 0 magic defence however many specs that takes (the drain line '
      + 'shows the count at 40 damage per spec, e.g. 8 on Bork); assumes the team has the specs to spare',
  },
];

/** Average Eye of Ayak damage per successful spec used for the spec counts shown (as in docs/DATA_SOURCES.md). */
export const AYAK_DAMAGE_PER_SPEC = 40;

export interface DrainState {
  id: DrainStateId;
  reductions: DefenceReductions;
  /** e.g. "2× Elder maul, 2× Ayak (80 dmg)". */
  specs: string;
  defAfter: number;
  magicDefAfter: number;
}

const withInputs = (m: Monster, inputs: Partial<Monster['inputs']>): Monster => ({
  ...m,
  inputs: { ...m.inputs, ...inputs },
});

/**
 * e.g. "2× Elder maul, 2× Ayak (80 dmg)" (Solo) or "4× Tonalztics hits (2 specs), Ayak to 0 ≈ 4 specs (130 dmg at
 * 40/spec)" (Team: the Ayak spec count is shown so a big one, 8 on Bork / 10 on The Smorks, is visible).
 */
const describeSpecs = (r: DefenceReductions, ayakToZero: boolean): string => {
  const parts: string[] = [];
  const hasDefenceDrains = r.accursed || r.elderMaul || r.dwh || r.tonalztic || r.bgs;
  if (hasDefenceDrains) parts.push(describeDefenceDrains(r));
  if (r.ayak) {
    const n = Math.ceil(r.ayak / AYAK_DAMAGE_PER_SPEC);
    parts.push(ayakToZero
      ? `Ayak to 0 ≈ ${n} spec${n === 1 ? '' : 's'} (${r.ayak} dmg at ${AYAK_DAMAGE_PER_SPEC}/spec)`
      : `${n}× Ayak (${r.ayak} dmg)`);
  }
  return parts.length ? parts.join(', ') : 'no specs';
};

export const drainStateFor = (m: Monster, id: DrainStateId, assumptions: BestSetupAssumptions): DrainState => {
  let reductions: DefenceReductions = { ...INITIAL_MONSTER_INPUTS.defenceReductions };
  if (id !== 'none') {
    const plan = maxDrainReductions(m, { weapon: 'elderMaul', ayak: true });
    reductions = plan.reductions;
    if (id === 'solo') {
      reductions.ayak = Math.min(Math.max(0, assumptions.soloAyakDamage), plan.magicDefBefore);
    }
  }
  const scaled = scaleMonster(withInputs(m, { defenceReductions: reductions }));
  return {
    id,
    reductions,
    specs: describeSpecs(reductions, id === 'team'),
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

const PRAYERS: Record<StyleGroup, Prayer> = {
  melee: Prayer.PIETY,
  ranged: Prayer.RIGOUR,
  magic: Prayer.AUGURY,
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
 * {@link applyPresetToPlayer} with already-resolved equipment (used by the gear search, phase 9, which resolves its
 * pool once). `equipment` is merged over the base player's equipment.
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
  const prayer = group === 'melee' && assumptions.useZeal ? Prayer.ZEAL : PRAYERS[group];
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
      potions: [potion],
      elementalFragments: group === 'magic' && assumptions.elementalFragments
        ? Object.fromEntries(ALL_ELEMENTS.map((e) => [e, true]))
        : {},
    },
  };
  player.boosts = { ...player.boosts, ...potionBoosts(player.skills, player.buffs.potions) };
  return { ...player, ...calculateEquipmentBonusesFromGear(player, monster) };
};

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
