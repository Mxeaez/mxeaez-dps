import { Monster } from '@/types/Monster';
import { Player } from '@/types/Player';
import { calculateEquipmentBonusesFromGear } from '@/lib/Equipment';
import {
  applyPresetToPlayer,
  buildTargetMonster,
  DrainState,
  DrainStateId,
  evaluateLoadout,
  findTarget,
  fightSecondsFrom,
  presetSpells,
  presetStyles,
  styleLabel,
  monsterForSpecCounts, specCountsDrainKey,
} from '@/lib/fracturedArchive/bestSetup';
import {
  BestSetupAssumptions, DEFAULT_ASSUMPTIONS, PresetDef, StyleGroup,
} from '@/lib/fracturedArchive/presets';
import { raidBase, spellbookOf, teamDpsMultiplier } from '@/lib/raids/base';
import {
  CoxInputs, DEFAULT_RAID, RaidId, TimeSettings, ToaInputs, TobInputs,
} from '@/lib/raids/types';
import {
  GearSearchProgress, runGearSearch, SearchRow, searchRowToPlayer, StyleOption,
} from '@/lib/fracturedArchive/search';
import {
  BORK_FLAT_ARMOUR_BY_PHASE,
  BORK_STUNNED_PHASE,
  DAGONHAI_SHIELDED_PHASE,
  OCELLUS_P1_PHASES,
  OCELLUS_P1_WALKING_PHASE,
  OCELLUS_P3_DEFLECT_MELEE_PHASE,
  OCELLUS_P3_DEFLECT_RANGED_PHASE,
  OCELLUS_P3_PHASES,
} from '@/lib/fracturedArchive/constants';
import { dagonhaiEncounterDamage } from '@/lib/fracturedArchive/dagonhai';
import { DEFAULT_FIGHT_SECONDS, drainModel, PlannerWeapon } from '@/lib/fracturedArchive/specs';
import { DrainLine } from '@/lib/fracturedArchive/drainLine';
import type { SpecCounts } from '@/lib/fracturedArchive/bestSetup';
import {
  atHpLeft, DAMAGE_SPEC_WEAPON_IDS, DAMAGE_SPEC_WEAPONS, damageSpecItemName, damageSpecProfile, DamageSpecProfile, DamageSpecWeapon,
} from '@/lib/fracturedArchive/damageSpecs';
import { canWeaponHit } from '@/lib/fracturedArchive/hittable';
import { assumptionsForTarget, LIQUID_ADRENALINE_SECONDS, suppliesAdrenaline } from '@/lib/raids/toa/supplies';
import {
  budgetedEncounter, budgetGroups, CARRY_SPEC_ENERGY, EncounterAlloc, encounterWallSeconds, EncounterSpecPlan, fixedEncounter,
  PhaseDamageSpecs, SpecBudgetConfig,
} from '@/lib/fracturedArchive/encounterBudget';
import {
  placeDoses, PoolState, regenTicks, SPEC_MAX_ENERGY, SPEC_REGEN_STEP, SURGE_COOLDOWN_SECONDS, SURGE_DOSES_PER_POTION,
} from '@/lib/fracturedArchive/specBudget';
import {
  FRACTURED_ARCHIVE_HP_SCALING,
  FRACTURED_ARCHIVE_MAX_PARTY_SIZE,
  FRACTURED_ARCHIVE_MIN_PARTY_SIZE,
} from '@/lib/scaling/FracturedArchive';

/**
 * Phase 16: raid time model. Pure and React-free (runs in the search worker and in Jest).
 *
 * Time to clear a route = Σ over its encounters and their phases of (damage required ÷ DPS), where the DPS of a phase
 * is the best loadout + style of the *kit* (a set of loadouts the player can switch between; switching costs nothing)
 * against that phase. DPS time only: no puzzles, travel, boss invulnerability, healing or adds. Every assumption is in
 * `RAID_TIME_DEFAULTS` below; the unverified ones are listed in docs/UNVERIFIED.md (group D) and the model is described
 * in docs/BEST_SETUP.md (*Routes tab*).
 *
 * Sources: https://oldschool.runescape.wiki/w/The_Fractured_Archive (boss table, hp scaling),
 * https://oldschool.runescape.wiki/w/The_Fractured_Archive/Strategies (*Layout*, per boss), the boss pages; the
 * per-encounter hp table is in docs/DATA_SOURCES.md (*Phase 16 inputs*).
 */

// --- settings ------------------------------------------------------------------------------------------------------

/** The Fractured Archive model's settings (phase 18: each time model has its own settings object). */
export type RaidTimeSettings = {
  /** Archive Guardian flying shield hp at the reference party size (`agShieldPartySize`). */
  agShieldHp: number;
  /** Party size the shield hp was quoted for. */
  agShieldPartySize: number;
  /** Share of AG's 550 hp dealt while it is grounded; the rest at the Flying version's DPS. */
  agGroundedFraction: number;
  /** Fraction of Bork's damage dealt while he is stunned (heavy cannonball); 0–1. */
  borkStunUptime: number;
  /** Fraction of Ocellus P1's hp dealt while he walks to a corner (Protect from Melee); 0–1. */
  ocellusWalkingFraction: number;
  /** Length of Ocellus P2 (The Blade) in seconds; 0 = P2 ignored. */
  ocellusP2Seconds: number;
  /** Share of the damage dealt to the Blade in P2 that comes off P3's hp. */
  ocellusP2CarryOver: number;
  /** Fraction of P3's remaining hp dealt in the last quadrant (at the worse Deflect option for the kit); 0–1. */
  ocellusLastQuadrantFraction: number;
};

export const RAID_TIME_DEFAULTS: RaidTimeSettings = {
  // Strategies → Archive Guardian: charging the inert guardians does "596 damage to 1490 health shield in 6-scale"
  // (unverified community note; not in the infobox, scaling unknown). Scaled to the party size by
  // FRACTURED_ARCHIVE_HP_SCALING relative to 6 (identity table today). All of it at the Flying version's DPS (the
  // guardian charges, ~40% of the shield, are not counted as free damage: pessimistic).
  agShieldHp: 1490,
  agShieldPartySize: 6,
  // Strategies: "After reaching 30% health, the Guardian immediately begins flying ... no longer possess a shield", so
  // at most 70% of the 550 hp is dealt while grounded; we assume all of it is, and the last 30% at Flying DPS.
  agGroundedFraction: 0.7,
  // The stun duration is unpublished (UNVERIFIED A6): 0 = no stun time by default.
  borkStunUptime: 0,
  // Strategies: "While walking to a quadrant, he will have Protect from Melee active"; share unknown, 0 by default.
  ocellusWalkingFraction: 0,
  // P2 is time-limited (three quadrant cycles, Strategies → Phase 2); its length is unpublished. Phase 38c: 120 s by
  // default (the user, in-game: "~2 min, little damage lands"; UNVERIFIED D35).
  ocellusP2Seconds: 120,
  // Strategies → Ocellus / Phase 2: "The Blade stores all damage dealt during this phase and releases it at the end of
  // each quadrant, effectively transferring half of all damage dealt to the boss's phase 3 health bar".
  ocellusP2CarryOver: 0.5,
  // Assumption: the last of four quadrants = 25% of P3's hp, all of it during a Deflect.
  ocellusLastQuadrantFraction: 0.25,
};

// --- routes --------------------------------------------------------------------------------------------------------

export type FaEncounterId = 'archive-guardian' | 'ezekiel' | 'bork-smorks' | 'moia' | 'dreadnoth' | 'dagonhai' | 'xarth' | 'ocellus';

/** Phase 18: any raid's encounter id (the Fractured Archive's are `FaEncounterId`; ToA's start with "toa-"). */
export type EncounterId = string;

export const ENCOUNTER_LABELS: Record<FaEncounterId, string> = {
  'archive-guardian': 'Archive Guardian',
  ezekiel: 'Ezekiel',
  'bork-smorks': 'Bork + Smorks',
  moia: 'Moia',
  dreadnoth: 'Dreadnoth',
  dagonhai: 'Dagon\'hai trio',
  xarth: 'Xarth',
  ocellus: 'Ocellus',
};

/**
 * The raid's layout (Strategies → *Layout*, docs/DATA_SOURCES.md *Route structure*): the 1st and 5th bosses are
 * fixed; for each of the 2nd–4th the team picks one of two (west / east side). 2 × 2 × 2 = 8 routes.
 */
export interface RouteSlot {
  order: number;
  options: EncounterId[];
}

export const ROUTE_SLOTS: RouteSlot[] = [
  { order: 1, options: ['archive-guardian'] },
  { order: 2, options: ['ezekiel', 'bork-smorks'] },
  { order: 3, options: ['moia', 'dreadnoth'] },
  { order: 4, options: ['dagonhai', 'xarth'] },
  { order: 5, options: ['ocellus'] },
];

export interface Route {
  /** e.g. "archive-guardian>ezekiel>moia>dagonhai>ocellus". */
  id: string;
  label: string;
  encounters: EncounterId[];
}

/** Every route: the cartesian product of ROUTE_SLOTS, in slot order (option A before B). */
export const enumerateRoutes = (
  slots: RouteSlot[] = ROUTE_SLOTS,
  labels: Record<string, string> = ENCOUNTER_LABELS,
): Route[] => slots
  .reduce<EncounterId[][]>((acc, slot) => acc.flatMap((r) => slot.options.map((o) => [...r, o])), [[]])
  .map((encounters) => ({
    id: encounters.join('>'),
    label: encounters.map((e) => labels[e] ?? e).join(' → '),
    encounters,
  }));

// --- kit -----------------------------------------------------------------------------------------------------------

/** One phase the kit is asked about: a best-setup target + phase option, under a drain state. */
export interface PhaseQuery {
  targetKey: string;
  phase?: string;
  drain: DrainStateId;
  /** The encounter's length for the spec-energy budget (Solo drains). */
  fightSeconds: number;
  /** Phase 36: the planned phase (row) this query is for (`PlannedPhase.key`; set by `phaseTime`). */
  rowKey?: string;
  /**
   * Phase 36: the spec counts of the phase's drain event (the encounter's spec budget, encounterBudget.ts): the drain
   * state is these specs (those that can hit this phase), not the drain state's own plan.
   */
  specs?: { counts: SpecCounts };
  /**
   * Phase 36: only the DPS is needed (the spec budget timing an option): the kit may answer with any counts that leave
   * the same drains (`specCountsDrainKey`), so its drain line may name other specs.
   */
  outcomeOnly?: boolean;
  /**
   * Phase 36 review: the NPC's hp left at the start of the row (`encounterBudget.ts rowHpLeft`); damage specs are valued
   * at it (`RaidKit.specDamage`: the monster's current hp, capped at its full hp). Undefined = full hp.
   */
  hpLeft?: number;
}

/** The kit's best answer for a phase. */
export interface KitChoice {
  loadout: string;
  /** e.g. "Thrust (Accurate)". */
  style: string;
  group?: StyleGroup;
  dps: number;
  /** Drain plan used (short form), e.g. "first round 4× Elder maul (P floor 99%)". */
  drain?: string;
  /** Phase 23: the same plan as "[icon] ×N" data (DrainLineView). */
  drainLine?: DrainLine;
}

/**
 * A kit: anything that returns its best loadout + style (highest DPS) for a phase, or null when it has nothing that
 * applies. The real one is `createKitEvaluator`; tests use toy kits with known DPS.
 */
export interface RaidKit {
  best: (q: PhaseQuery) => KitChoice | null;
  /** Phase 36: a damage spec's upstream numbers on the phase under the query's drains (null: unknown). */
  specDamage?: (q: PhaseQuery, weapon: DamageSpecWeapon) => DamageSpecProfile | null;
  /** Phase 36: which drain / damage spec weapons can hit the phase (missing = can). */
  specHits?: (q: PhaseQuery) => Record<string, boolean>;
  /** Phase 36: a key of the drains the query's spec counts leave (equal keys = equal DPS); see `specCountsDrainKey`. */
  drainKey?: (q: PhaseQuery) => string;
  /**
   * Phase 37 (speed): an exact memo of {@link encounterTime} with this kit. `run` times the encounter with the kit it is
   * given (the memo hands it a recording view of itself); the memo must return exactly what `run` would.
   */
  memoEncounter?: (id: EncounterId, a: RaidTimeAssumptions, opts: EncounterBudgetOptions, run: (k: RaidKit) => EncounterTime) => EncounterTime;
  /**
   * Phase 37 (speed): an exact memo of one model pass with this kit (`key`: the encounter, drain state, fight length
   * and how the kit's queries are rewritten); like `memoEncounter`, it must return exactly what `run` would.
   */
  memoPass?: (key: string, a: RaidTimeAssumptions, run: (k: RaidKit) => PhaseTime[]) => PhaseTime[];
}

export const phaseKey = (targetKey: string, phase?: string): string => `${targetKey}|${phase ?? ''}`;

// --- hp ------------------------------------------------------------------------------------------------------------

const clampParty = (n: number) => Math.min(FRACTURED_ARCHIVE_MAX_PARTY_SIZE, Math.max(FRACTURED_ARCHIVE_MIN_PARTY_SIZE, Math.trunc(n)));

/**
 * Party-size hp factor from `FRACTURED_ARCHIVE_HP_SCALING` (identity today, UNVERIFIED C1). The hook for real numbers:
 * fill that table and every hp figure here follows (boss hp through the calculator's own scaling, the AG shield
 * relative to its reference size through this factor).
 */
export const partyHpFactor = (partySize: number): number => {
  const [num, den] = FRACTURED_ARCHIVE_HP_SCALING[clampParty(partySize)];
  return num / den;
};

const hpCache = new Map<string, number>();

/**
 * The party-scaled hp of a best-setup target / phase, as the calculator scales it. Phase 18: `raidInputs` carries the
 * raid's own scaling inputs (ToA raid / path levels; ToA party size 1-8 is applied by buildTargetMonster).
 */
export const targetHp = (
  targetKey: string,
  phase: string | undefined,
  partySize: number,
  raidInputs: Pick<BestSetupAssumptions, 'raid' | 'toa' | 'cox' | 'tob'> = {},
): number => {
  const key = `${phaseKey(targetKey, phase)}|${clampParty(partySize)}|${partyHpFactor(partySize)}|${partySize}|${JSON.stringify(raidInputs)}`;
  let hp = hpCache.get(key);
  if (hp === undefined) {
    const { monster } = buildTargetMonster(findTarget(targetKey), phase, 'none', { ...DEFAULT_ASSUMPTIONS, ...raidInputs, partySize });
    hp = monster.inputs.monsterCurrentHp;
    hpCache.set(key, hp);
  }
  return hp;
};

// --- encounters ----------------------------------------------------------------------------------------------------

/** One row of an encounter's plan: deal `damage` to `targetKey`/`phase`. */
export interface PlannedPhase {
  key: string;
  label: string;
  targetKey: string;
  phase?: string;
  damage: number;
  /**
   * Phase 33: the boss's Defence is restored at the start of this phase, so the team drains again: a new drain event
   * (e.g. 'maze 1', 'the stomp': "After maze 1 (Defence restored)"). Phases without it share the drain event of the phase before (Bork armour 8 → 14).
   */
  drainReset?: string;
  /**
   * Phase 38b (Death Charge): how many NPCs die in this phase when it is their last (default 1; a row standing for
   * several adds says how many, e.g. Akkha's four Shadows).
   */
  kills?: number;
}

const pctText = (f: number): string => `${Math.round(f * 1000) / 10}%`;

const BORK_QUARTERS = BORK_FLAT_ARMOUR_BY_PHASE.filter(([p]) => p !== BORK_STUNNED_PHASE);

/** The fixed-damage phases of an encounter (Ocellus P2 / P3 depend on DPS and are built in `evalEncounter`). */
export const encounterPlan = (id: FaEncounterId, settings: RaidTimeSettings, partySize: number): PlannedPhase[] => {
  const hp = (t: string, p?: string) => targetHp(t, p, partySize);
  switch (id) {
    case 'archive-guardian': {
      const ag = hp('ag-flying');
      const shield = settings.agShieldHp * (partyHpFactor(partySize) / partyHpFactor(settings.agShieldPartySize));
      const grounded = ag * settings.agGroundedFraction;
      return [
        {
          key: 'ag-shield', label: 'Flying shield', targetKey: 'ag-flying', damage: shield,
        },
        {
          key: 'ag-grounded', label: `Grounded (${pctText(settings.agGroundedFraction)} of hp)`, targetKey: 'ag-grounded', damage: grounded,
        },
        {
          key: 'ag-flying', label: `Flying (${pctText(1 - settings.agGroundedFraction)} of hp)`, targetKey: 'ag-flying', damage: ag - grounded,
        },
      ];
    }
    case 'bork-smorks': {
      // Killed evenly: as the Smorks lose hp alongside, Bork's armour steps 8 → 10 → 12 → 14, one quarter of his hp each
      const bork = hp('bork');
      const stun = Math.min(1, Math.max(0, settings.borkStunUptime));
      const rows: PlannedPhase[] = BORK_QUARTERS.map(([phase, armour]) => ({
        key: `bork-${armour}`, label: `Bork, armour ${armour} (¼ of hp${stun ? `, ${pctText(1 - stun)} unstunned` : ''})`, targetKey: 'bork', phase, damage: (bork / 4) * (1 - stun),
      }));
      rows.push({
        key: 'bork-stunned', label: `Bork, stunned (${pctText(stun)} of hp)`, targetKey: 'bork', phase: BORK_STUNNED_PHASE, damage: bork * stun,
      });
      rows.push({
        key: 'smorks', label: 'The Smorks', targetKey: 'smorks', damage: hp('smorks'),
      });
      return rows;
    }
    case 'dagonhai':
      return [{
        key: 'dagonhai',
        label: 'Shield gauge × 5 + 7 hp',
        targetKey: 'dagonhai',
        phase: DAGONHAI_SHIELDED_PHASE,
        damage: dagonhaiEncounterDamage(hp('dagonhai', DAGONHAI_SHIELDED_PHASE)),
      }];
    case 'ocellus': {
      const p1 = hp('ocellus-p1', OCELLUS_P1_PHASES[0]);
      const walk = Math.min(1, Math.max(0, settings.ocellusWalkingFraction));
      return [
        {
          key: 'ocellus-p1', label: `P1 at a corner${walk ? ` (${pctText(1 - walk)})` : ''}`, targetKey: 'ocellus-p1', phase: OCELLUS_P1_PHASES[0], damage: p1 * (1 - walk),
        },
        {
          key: 'ocellus-p1-walking', label: `P1 walking (${pctText(walk)})`, targetKey: 'ocellus-p1', phase: OCELLUS_P1_WALKING_PHASE, damage: p1 * walk,
        },
      ];
    }
    default: {
      const single: Record<string, [string, string]> = {
        ezekiel: ['ezekiel', 'Ezekiel'],
        moia: ['moia', 'Moia'],
        dreadnoth: ['dreadnoth', 'Dreadnoth (jellies ignored)'],
        xarth: ['xarth', 'Xarth'],
      };
      const [targetKey, label] = single[id];
      return [{
        key: id, label, targetKey, damage: hp(targetKey),
      }];
    }
  }
};

export interface PhaseTime {
  key: string;
  label: string;
  targetKey: string;
  phase?: string;
  /** Damage to deal in this phase (P2: damage dealt to the Blade in the fixed time). */
  damage: number;
  /** The kit's choice (null: nothing in the kit applies). */
  choice: KitChoice | null;
  dps: number;
  /** damage ÷ dps; Infinity when damage > 0 and nothing in the kit deals damage; P2: the fixed duration. */
  seconds: number;
  note?: string;
  /** Phase 33: see `PlannedPhase.drainReset`. */
  drainReset?: string;
  /** Phase 36: your damage specs on this phase (the spec budget; `seconds` already counts them). */
  damageSpecs?: PhaseDamageSpecs[];
  /** Phase 36: why damage specs don't apply (a fixed-length phase, the Dawnbringer specs). */
  noDamageSpecs?: string;
  /**
   * Phase 38c fix: `seconds` are real (wall) seconds whatever the team-DPS multiplier (Ocellus P2, a fixed-length
   * phase): the spec budget's clock takes them as they are instead of seconds × multiplier ÷ party size.
   */
  fixedWall?: boolean;
}

export interface EncounterTime {
  id: EncounterId;
  label: string;
  phases: PhaseTime[];
  seconds: number;
  /** Time of the first pass without drains (= the fight length given to the drain planner); undefined for None. */
  drainFightSeconds?: number;
  /** Phase 36: the encounter's spec plan under the spec budget (Solo / Team drains). */
  specPlan?: EncounterSpecPlan;
}

export interface RaidTimeAssumptions {
  /** HP scaling party size (2–8). */
  partySize: number;
  drain: DrainStateId;
  /** The model's own settings (FA: RaidTimeSettings; ToA: ToaTimeSettings). */
  settings: TimeSettings;
  /**
   * Phase 18: damage dealt per second of the user's DPS — the team-DPS multiplier (`teamDpsMultiplier`: players assumed
   * to deal the user's DPS; default 1 = the user alone). Fixed-length phases (Ocellus P2) keep their wall-clock length.
   */
  dpsMultiplier?: number;
  /** Fight length handed to the drain planner when the first pass can't kill (infinite time). */
  fallbackFightSeconds: number;
  /**
   * Phase 17: when set (and drains are on), skip the undrained first pass and plan every encounter's drains with this
   * fight length (a number for every encounter, or per encounter). Exact for Team (the carriers' first round doesn't
   * depend on the length) and None; for Solo the planner passes each encounter's undrained length with the best single
   * loadout. The planner's inner loop uses it; its reported times never do.
   */
  fixedFightSeconds?: number | Partial<Record<EncounterId, number>>;
  /** Phase 18: the raid's time model (undefined = the Fractured Archive's, `FA_TIME_MODEL`). */
  model?: RaidTimeModel;
  /** Phase 18: ToA raid / path levels for the hp of ToA targets. */
  toa?: ToaInputs;
  /** Phase 19: Chambers of Xeric inputs (Challenge Mode) for the hp of CoX targets. */
  cox?: CoxInputs;
  /** Phase 20: Theatre of Blood inputs (mode) for the hp of ToB targets. */
  tob?: TobInputs;
  /**
   * Phase 36: one spec budget per encounter (encounterBudget.ts): set by `raidTimeAssumptionsFrom` for Solo / Team
   * drains; undefined = the phase 14-35 drain states (every phase target its own plan).
   */
  specBudget?: SpecBudgetConfig;
  /** Phase 36 (planner): replay these spec plans instead of allocating (the optimiser's inner loop). */
  fixedAlloc?: Partial<Record<EncounterId, EncounterAlloc>>;
  /**
   * Phase 38a: the typical raid length in wall seconds (the raid clock, `raidClock`): the time beyond the route's fight
   * time is spread before the encounters in proportion to their fight time. Undefined / 0 = fight time only.
   */
  raidSeconds?: number;
  /**
   * Phase 38c: the non-fight wall seconds of the raid (travel, puzzles, mechanics), added to the route's fight wall time
   * and spread the same way (`raidClock`), so a longer fight (a solo raid) lengthens the raid instead of squeezing the
   * non-fight time. Takes precedence over `raidSeconds` when set (`raidTimeAssumptionsFrom`: the default).
   */
  nonFightSeconds?: number;
  /** Phase 38a (ToB): the surge cooldown pauses between encounters (its clock is fight time only). */
  surgePausesBetweenEncounters?: boolean;
}

/**
 * Phase 18: a raid's time model. The Fractured Archive's is `FA_TIME_MODEL` below (8 routes); Tombs of Amascut's is
 * src/lib/raids/toa/time.ts (one fixed route). The rest of this file (drain passes, routes, kits) is raid-independent.
 */
export interface RaidTimeModel {
  id: string;
  routeSlots: RouteSlot[];
  /**
   * Phase 38c: the routes, when they are not the cartesian product of `routeSlots` (ToA: one per pair of paths done
   * before the supplies); `routeSlots` then only names the positions.
   */
  routes?: EncounterId[][];
  labels: Record<string, string>;
  /** One pass over an encounter at a drain state / fight length; phases with no damage are left out. */
  encounterPass: (
    id: EncounterId,
    kit: RaidKit,
    a: RaidTimeAssumptions,
    drain: DrainStateId,
    fightSeconds: number,
  ) => PhaseTime[];
  /** The target / phase options the model may query (for precomputing per-phase search results). */
  requiredPhaseTargets: (a: RaidTimeAssumptions) => { targetKey: string, phase?: string }[];
  /**
   * Phase 38b (ToA): Liquid adrenaline doses drunk at each encounter's start (150 s each, back to back), when the
   * supplies carry it (`SpecBudgetConfig.adrenaline`). Undefined = none.
   */
  adrenalineDoses?: Partial<Record<EncounterId, number>>;
}

/**
 * Phase 36: the spec budget of the best-setup assumptions: Solo = "Specs I bring" (Eye of Ayak up to its spec count),
 * Team = the carriers that count (the first party-size of them, in `teamSpecPlan`'s order; party − 1 when you bring damage
 * specs or Surge potions: your bar is yours then) with their Lightbearer flags;
 * your damage spec weapons and Surge potions (Plan: the planner's choice; elsewhere none).
 */
export const specBudgetFrom = (best: BestSetupAssumptions, drain: DrainStateId): SpecBudgetConfig | undefined => {
  if (drain === 'none') return undefined;
  const m = best.mySpecs;
  const common = {
    lightbearer: !!m.lightbearer,
    damage: (best.damageSpecs ?? []).filter((w) => DAMAGE_SPEC_WEAPON_IDS.includes(w)),
    surgePotions: Math.max(0, Math.floor(best.surgePotions ?? 0)),
    carry: CARRY_SPEC_ENERGY,
    // phase 38b: Death Charge on the Arceuus spellbook (each player as likely to land a kill), Liquid adrenaline (ToA)
    ...(spellbookOf(best) === 'arceuus' ? { deathCharge: { share: 1 / Math.max(1, Math.floor(best.partySize)) } } : {}),
    ...(suppliesAdrenaline(best) ? { adrenaline: true } : {}),
  };
  if (drain === 'solo') {
    const many = 99;
    const solo: Partial<Record<PlannerWeapon, number>> = {};
    if (m.elderMaul) solo.elderMaul = many;
    if (m.dwh) solo.dwh = many;
    if (m.tonalztics) solo.tonalztics = many;
    if (m.bgs) solo.bgs = many;
    if (m.ayak > 0) solo.ayak = Math.floor(m.ayak);
    return { drain, solo, ...common };
  }
  const carriers: Partial<Record<PlannerWeapon, number>> = {};
  // review: with damage specs / surge doses your bar is yours (budgetGroups adds it), so you are not a carrier: the
  // party's other members carry (one bar per party member in all)
  const mine = common.damage.length > 0 || common.surgePotions > 0;
  let left = Math.max(0, Math.floor(best.partySize) - (mine ? 1 : 0));
  (Object.keys(best.team.carriers) as PlannerWeapon[]).forEach((w) => {
    const k = Math.min(Math.max(0, Math.floor(best.team.carriers[w] ?? 0)), left);
    if (k > 0) carriers[w] = k;
    left -= k;
  });
  return {
    drain, carriers, carrierLightbearer: { ...best.team.lightbearer }, ...common,
  };
};

export const raidTimeAssumptionsFrom = (
  best: BestSetupAssumptions,
  drain: DrainStateId,
  settings: TimeSettings = RAID_TIME_DEFAULTS,
  model?: RaidTimeModel,
): RaidTimeAssumptions => {
  const budget = specBudgetFrom(best, drain);
  return {
    partySize: best.partySize,
    drain,
    settings,
    fallbackFightSeconds: best.fightSeconds ?? DEFAULT_FIGHT_SECONDS,
    dpsMultiplier: teamDpsMultiplier(best),
    ...(model ? { model } : {}),
    ...(best.toa ? { toa: best.toa } : {}),
    ...(best.cox ? { cox: best.cox } : {}),
    ...(best.tob ? { tob: best.tob } : {}),
    ...(budget ? { specBudget: budget } : {}),
    // phase 38c: the non-fight time (default) is added to the fight wall; an explicit raid length (`raidMinutes`) is
    // the phase 38a clock
    ...(best.raidMinutes !== undefined
      ? { raidSeconds: 60 * Math.max(0, best.raidMinutes) }
      : { nonFightSeconds: 60 * Math.max(0, best.nonFightMinutes ?? raidBase(best.raid).nonFightMinutes) }),
    ...(raidBase(best.raid).surgePausesBetweenEncounters ? { surgePausesBetweenEncounters: true } : {}),
  };
};

export const timeOf = (damage: number, dps: number): number => {
  if (damage <= 0) return 0;
  return dps > 0 ? damage / dps : Infinity;
};

/**
 * Time of one planned phase with the kit's best choice. `dpsFactor` (phase 18): the damage dealt per second of the
 * user's DPS (ToA: the party size — every member is assumed to deal the user's DPS; the Fractured Archive: 1).
 */
export const phaseTime = (
  p: PlannedPhase,
  kit: RaidKit,
  drain: DrainStateId,
  fightSeconds: number,
  dpsFactor = 1,
): PhaseTime => {
  const choice = kit.best({
    targetKey: p.targetKey, phase: p.phase, drain, fightSeconds, rowKey: p.key,
  });
  const dps = choice?.dps ?? 0;
  return {
    ...p, choice, dps, seconds: timeOf(p.damage, dps * dpsFactor),
  };
};

/** One pass over an encounter at a given drain state / fight length. Phases with no damage are skipped. */
const evalEncounterPass = (
  id: EncounterId,
  kit: RaidKit,
  a: RaidTimeAssumptions,
  drain: DrainStateId,
  fightSeconds: number,
): PhaseTime[] => {
  const settings = a.settings as RaidTimeSettings;
  const mult = a.dpsMultiplier ?? 1;
  const rows = encounterPlan(id as FaEncounterId, settings, a.partySize)
    .filter((p) => p.damage > 0)
    .map((p) => phaseTime(p, kit, drain, fightSeconds, mult));
  if (id !== 'ocellus') return rows;

  // P2 (The Blade): a fixed duration; the damage dealt in it × carry-over comes off P3's hp
  let carried = 0;
  if (settings.ocellusP2Seconds > 0) {
    const choice = kit.best({
      targetKey: 'ocellus-p2', drain, fightSeconds, rowKey: 'ocellus-p2',
    });
    const dps = choice?.dps ?? 0;
    const dealt = dps * mult * settings.ocellusP2Seconds;
    carried = dealt * settings.ocellusP2CarryOver;
    rows.push({
      key: 'ocellus-p2',
      label: `P2 The Blade (${settings.ocellusP2Seconds} s)`,
      targetKey: 'ocellus-p2',
      damage: dealt,
      choice,
      dps,
      seconds: settings.ocellusP2Seconds,
      note: `${Math.round(carried)} carried to P3 (${pctText(settings.ocellusP2CarryOver)})`,
      noDamageSpecs: 'a fixed-length phase',
      fixedWall: true,
      // phase 38c: the Defence resets P1 → P2 (the user, in-game): a new drain event ("After P1 (Defence restored)")
      drainReset: 'P1',
    });
  }
  const p3Total = Math.max(0, targetHp('ocellus-p3', OCELLUS_P3_PHASES[0], a.partySize) - carried);
  const last = Math.min(1, Math.max(0, settings.ocellusLastQuadrantFraction));
  // phase 38c: the Defence resets again P2 → P3 (the user, in-game): P3's first row starts a new drain event, so its
  // specs are made on quadrants 1-3 (or on the last quadrant when it is all of P3)
  const p3Reset = { drainReset: 'P2' };
  const q13: PlannedPhase = {
    key: 'ocellus-p3', label: `P3 quadrants 1-3${last ? ` (${pctText(1 - last)})` : ''}`, targetKey: 'ocellus-p3', phase: OCELLUS_P3_PHASES[0], damage: p3Total * (1 - last), ...p3Reset,
  };
  if (q13.damage > 0) rows.push(phaseTime(q13, kit, drain, fightSeconds, mult));
  if (p3Total * last > 0) {
    // Pessimistic: the Deflect that hurts the kit most (= the one blocking the kit's best style; magic is never
    // deflected in our model, so a magic-best kit gets the lower of the two)
    const options = [OCELLUS_P3_DEFLECT_MELEE_PHASE, OCELLUS_P3_DEFLECT_RANGED_PHASE].map((phase) => phaseTime({
      key: 'ocellus-p3-last', label: `P3 last quadrant, ${phase.replace('Last quadrant: ', '')} (${pctText(last)})`, targetKey: 'ocellus-p3', phase, damage: p3Total * last, ...(q13.damage > 0 ? {} : p3Reset),
    }, kit, drain, fightSeconds, mult));
    rows.push(options[1].dps < options[0].dps ? options[1] : options[0]);
  }
  return rows;
};

const sumSeconds = (rows: PhaseTime[]) => rows.reduce((t, r) => t + r.seconds, 0);

/** The target / phase options the model may query for these settings (for precomputing per-phase search results). */
export const requiredPhaseTargets = (settings: RaidTimeSettings, partySize = 6): { targetKey: string, phase?: string }[] => {
  const ids = Array.from(new Set(ROUTE_SLOTS.flatMap((s) => s.options))) as FaEncounterId[];
  const out = ids.flatMap((id) => encounterPlan(id, settings, partySize).filter((p) => p.damage > 0)
    .map((p) => ({ targetKey: p.targetKey, phase: p.phase })));
  if (settings.ocellusP2Seconds > 0) out.push({ targetKey: 'ocellus-p2', phase: undefined });
  if (settings.ocellusLastQuadrantFraction < 1) out.push({ targetKey: 'ocellus-p3', phase: OCELLUS_P3_PHASES[0] });
  if (settings.ocellusLastQuadrantFraction > 0) {
    out.push({ targetKey: 'ocellus-p3', phase: OCELLUS_P3_DEFLECT_MELEE_PHASE });
    out.push({ targetKey: 'ocellus-p3', phase: OCELLUS_P3_DEFLECT_RANGED_PHASE });
  }
  const seen = new Set<string>();
  return out.filter((t) => {
    const k = phaseKey(t.targetKey, t.phase);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

/** The Fractured Archive's time model (phase 16): 8 routes, the encounters above. */
export const FA_TIME_MODEL: RaidTimeModel = {
  id: 'fractured-archive',
  routeSlots: ROUTE_SLOTS,
  labels: ENCOUNTER_LABELS,
  encounterPass: evalEncounterPass,
  requiredPhaseTargets: (a) => requiredPhaseTargets(a.settings as RaidTimeSettings, a.partySize),
};

const modelOf = (a: RaidTimeAssumptions): RaidTimeModel => a.model ?? FA_TIME_MODEL;

/**
 * Phase 22: the time model must be the assumptions' raid's (model ids = raid ids). Both entry points
 * (`computeRouteComparison`, the planner) default to the Fractured Archive's model, so a caller that forgets to pass the
 * raid's model would otherwise time ToA / CoX / ToB targets with the FA encounters; this makes that an error.
 */
export const assertTimeModelForRaid = (model: RaidTimeModel, a: { raid?: RaidId }): void => {
  const raid = a.raid ?? DEFAULT_RAID;
  if (model.id !== raid) {
    throw new Error(`Raid time model '${model.id}' doesn't match the assumptions' raid '${raid}': pass that raid's time model (raidConfig(raid).time)`);
  }
};

/**
 * Phase 28: the fight length the drain planner gets from an encounter's undrained time. The time model's seconds are
 * hp ÷ (your DPS × team-DPS multiplier); the fight itself lasts hp ÷ (party size × your DPS), the same formula as the
 * Search / Summary fight length (`autoFightSeconds`, phase 23 fix) and the same 15-600 s clamp. Equal to the encounter
 * time when the multiplier is the party size (ToA / CoX / ToB defaults); the Fractured Archive's ×1 used to give the
 * Solo budget a fight as long as you alone would take (6× at party 6). `fallbackFightSeconds` when it can't be killed.
 */
export const drainFightSecondsOf = (
  encounterSeconds: number,
  a: Pick<RaidTimeAssumptions, 'partySize' | 'dpsMultiplier' | 'fallbackFightSeconds'>,
): number => (Number.isFinite(encounterSeconds) && encounterSeconds > 0
  ? fightSecondsFrom(encounterSeconds * (a.dpsMultiplier ?? 1), 1, a.partySize)
  : a.fallbackFightSeconds);

/**
 * Time of one encounter. Drains (Solo / Team) are planned with the encounter's own length: a first pass without drains
 * gives that length, then the encounter is evaluated once more with the drain state planned for it (one fixed-point
 * iteration; the drained pass is shorter, which would only give a Solo plan less energy, so the plan is a little
 * generous).
 */
/** Phase 36: where an encounter sits in the route (energy carry, surge dose). */
export interface EncounterBudgetOptions {
  /** A surge dose right after the first specs. */
  surge?: boolean;
  /** Clock (wall s) at the start (carry: the raid clock). */
  clock0?: number;
  /** Energy per pool at the start (carry); undefined = full. */
  startState?: PoolState;
}

const encounterTimeOf = (id: EncounterId, kit: RaidKit, a: RaidTimeAssumptions, opts: EncounterBudgetOptions): EncounterTime => {
  const model = modelOf(a);
  const label = model.labels[id] ?? id;
  const fixed = typeof a.fixedFightSeconds === 'number' ? a.fixedFightSeconds : a.fixedFightSeconds?.[id];
  // phase 36: one spec budget per encounter (Solo / Team)
  const budget = a.drain !== 'none' ? a.specBudget : undefined;
  if (budget) {
    const pass = (k: RaidKit, d: DrainStateId, f: number) => (k.memoPass
      ? k.memoPass(`${id}|${d}|${f}`, a, (kk) => model.encounterPass(id, kk, a, d, f))
      : model.encounterPass(id, k, a, d, f));
    const alloc = a.fixedAlloc?.[id];
    if (alloc) {
      const fight = fixed ?? a.fallbackFightSeconds;
      const r = fixedEncounter(kit, a, budget, alloc, { pass, drain: a.drain, fightSeconds: fight });
      return {
        id, label, phases: r.phases, seconds: r.seconds, drainFightSeconds: fight,
      };
    }
    const first = pass(kit, 'none', a.fallbackFightSeconds);
    const fight = fixed ?? drainFightSecondsOf(sumSeconds(first), a);
    // phase 38b: Liquid adrenaline doses at the encounter's start
    const adrenalineSeconds = budget.adrenaline ? (model.adrenalineDoses?.[id] ?? 0) * LIQUID_ADRENALINE_SECONDS : 0;
    const r = budgetedEncounter(kit, a, budget, {
      drain: a.drain,
      pass,
      first,
      fightSeconds: fight,
      clock0: opts.clock0 ?? 0,
      startState: opts.startState,
      surge: !!opts.surge,
      ...(adrenalineSeconds > 0 ? { adrenalineSeconds } : {}),
    });
    return {
      id, label, phases: r.phases, seconds: r.seconds, drainFightSeconds: fight, specPlan: r.plan,
    };
  }
  if (a.drain !== 'none' && fixed !== undefined) {
    const phases = model.encounterPass(id, kit, a, a.drain, fixed);
    return {
      id, label, phases, seconds: sumSeconds(phases), drainFightSeconds: fixed,
    };
  }
  const first = model.encounterPass(id, kit, a, 'none', a.fallbackFightSeconds);
  const firstSeconds = sumSeconds(first);
  if (a.drain === 'none') {
    return {
      id, label, phases: first, seconds: firstSeconds,
    };
  }
  const fight = drainFightSecondsOf(firstSeconds, a);
  const phases = model.encounterPass(id, kit, a, a.drain, fight);
  return {
    id, label, phases, seconds: sumSeconds(phases), drainFightSeconds: fight,
  };
};

export const encounterTime = (id: EncounterId, kit: RaidKit, a: RaidTimeAssumptions, opts: EncounterBudgetOptions = {}): EncounterTime => (kit.memoEncounter
  ? kit.memoEncounter(id, a, opts, (k) => encounterTimeOf(id, k, a, opts))
  : encounterTimeOf(id, kit, a, opts));

export interface RouteTime {
  route: Route;
  encounters: EncounterTime[];
  /** Total DPS time in seconds (Infinity when some phase can't be damaged by the kit). */
  seconds: number;
  /** Phase 36: the encounters that get a surge dose (right after their first specs), in route order. */
  surgeDoses?: EncounterId[];
}

/** Phase 38a: a route on the raid's wall clock. */
export interface RaidClock {
  /** Wall seconds when each encounter's fight starts. */
  starts: number[];
  /** Non-fight wall seconds just before each encounter (travel, puzzles, mechanics). */
  gaps: number[];
  /** Fight wall seconds of the route. */
  fight: number;
}

/**
 * Phase 38a: the raid wall clock of a route. `walls` = each encounter's fight wall seconds; the non-fight time
 * max(0, raidSeconds − Σ walls) is spread before the encounters in proportion to their fight time (an encounter with
 * 30% of the fight time gets 30% of the travel / puzzles / mechanics), so the last fight ends at `raidSeconds` (or at
 * the fight total when that is longer). Phase 38c: with `nonFightSeconds` that much non-fight time is spread instead
 * (the raid lasts Σ walls + nonFightSeconds). Non-finite walls count 0. Phase 41 replaces the proportional spread with
 * measured room times.
 */
export const raidClock = (walls: number[], raidSeconds = 0, nonFightSeconds?: number): RaidClock => {
  const w = walls.map((x) => (Number.isFinite(x) && x > 0 ? x : 0));
  const fight = w.reduce((t, x) => t + x, 0);
  let extra = Number.isFinite(raidSeconds) ? Math.max(0, raidSeconds - fight) : 0;
  if (nonFightSeconds !== undefined) extra = Number.isFinite(nonFightSeconds) ? Math.max(0, nonFightSeconds) : 0;
  const gaps = w.map((x) => (fight > 0 ? (extra * x) / fight : 0));
  const starts: number[] = [];
  let t = 0;
  w.forEach((x, i) => {
    t += gaps[i];
    starts.push(t);
    t += x;
  });
  return { starts, gaps, fight };
};

/**
 * Phase 38a: when each encounter starts on the surge cooldown's clock: the raid clock, or fight time only where the
 * cooldown pauses between encounters (ToB).
 */
export const surgeClockStarts = (
  walls: number[],
  a: Pick<RaidTimeAssumptions, 'raidSeconds' | 'nonFightSeconds' | 'surgePausesBetweenEncounters'>,
): number[] => (a.surgePausesBetweenEncounters ? raidClock(walls) : raidClock(walls, a.raidSeconds ?? 0, a.nonFightSeconds)).starts;

/** Phase 38a: the span of the surge cooldown's clock for a route with this fight wall time (the doses it allows). */
export const surgeClockSpan = (
  fightWall: number,
  a: Pick<RaidTimeAssumptions, 'raidSeconds' | 'nonFightSeconds' | 'surgePausesBetweenEncounters'>,
): number => {
  if (a.surgePausesBetweenEncounters) return fightWall;
  if (a.nonFightSeconds !== undefined) return fightWall + Math.max(0, a.nonFightSeconds);
  return Math.max(fightWall, a.raidSeconds ?? 0);
};

/**
 * Phase 36: the surge doses of a route: the encounters' start times on the route's clock (phase 38a: the surge clock,
 * `surgeClockStarts`, from the encounters' wall seconds without doses: the raid clock, or fight time only where the
 * cooldown pauses between encounters, ToB), and `placeDoses` (≥ 300 s apart, at most 4 per potion, the most route
 * time saved).
 */
export const routeSurgeDoses = (
  plain: EncounterTime[],
  dosed: EncounterTime[],
  a: Pick<RaidTimeAssumptions, 'dpsMultiplier' | 'partySize' | 'raidSeconds' | 'nonFightSeconds' | 'surgePausesBetweenEncounters'>,
  potions: number,
): EncounterId[] => {
  const starts = surgeClockStarts(plain.map((e) => encounterWallSeconds(e.seconds, a)), a);
  const items = plain.map((e, i) => ({ id: e.id, at: starts[i], gain: e.seconds - dosed[i].seconds }));
  return placeDoses(items, SURGE_DOSES_PER_POTION * Math.max(0, Math.floor(potions)), SURGE_COOLDOWN_SECONDS);
};

/** DPS-only time of one route with a kit. `cache` shares encounter results between routes. */
export const raidTime = (
  route: Route,
  kit: RaidKit,
  assumptions: RaidTimeAssumptions,
  cache: Map<EncounterId, EncounterTime> = new Map(),
): RouteTime => {
  const budget = assumptions.drain !== 'none' ? assumptions.specBudget : undefined;
  const cached = (id: EncounterId, surge: boolean) => {
    const k = surge ? `${id}|surge` : id;
    let e = cache.get(k);
    if (!e) {
      e = encounterTime(id, kit, assumptions, { surge });
      cache.set(k, e);
    }
    return e;
  };
  const total = (es: EncounterTime[]) => es.reduce((t, e) => t + e.seconds, 0);
  if (budget && !assumptions.fixedAlloc && budget.carry) {
    // phase 36, energy carried (CARRY_SPEC_ENERGY): sequential, each encounter starts with the previous one's leftover
    // on the raid clock; a dose is taken where it saves time and the cooldown allows (greedy, in order). Phase 38a: the
    // non-fight time before each encounter (`raidClock` of the full-bar encounter times) regenerates every pool (+10%
    // per tick of its period on the clock, capped at 100%) and counts for the surge cooldown (not in ToB).
    const groups = new Map(budgetGroups(budget).map((g) => [g.id, g.regenSeconds]));
    const { gaps } = raidClock(route.encounters.map((id) => encounterWallSeconds(cached(id, false).seconds, assumptions)), assumptions.raidSeconds ?? 0, assumptions.nonFightSeconds);
    let clock = 0;
    let surgeClock = 0;
    let state: PoolState | undefined;
    let lastDose = -Infinity;
    let doses = SURGE_DOSES_PER_POTION * budget.surgePotions;
    const surgeDoses: EncounterId[] = [];
    const encounters = route.encounters.map((id, i) => {
      const gap = gaps[i];
      if (gap > 0 && state) {
        const s = state;
        state = Object.fromEntries(Object.entries(s).map(([g, pools]) => {
          const tick = regenTicks(clock, clock + gap, groups.get(g) ?? 30) * SPEC_REGEN_STEP;
          return [g, pools.map((x) => Math.min(SPEC_MAX_ENERGY, x + tick)).sort((x, y) => y - x)];
        }));
      }
      clock += gap;
      if (!assumptions.surgePausesBetweenEncounters) surgeClock += gap;
      const plain = encounterTime(id, kit, assumptions, { clock0: clock, startState: state });
      let e = plain;
      if (doses > 0 && surgeClock - lastDose >= SURGE_COOLDOWN_SECONDS - 1e-9) {
        const dosed = encounterTime(id, kit, assumptions, { clock0: clock, startState: state, surge: true });
        if (dosed.seconds < plain.seconds - 1e-9) {
          e = dosed;
          doses -= 1;
          lastDose = surgeClock;
          surgeDoses.push(id);
        }
      }
      state = e.specPlan?.end;
      const wall = encounterWallSeconds(e.seconds, assumptions);
      clock += wall;
      surgeClock += wall;
      return e;
    });
    return {
      route, encounters, seconds: total(encounters), ...(surgeDoses.length ? { surgeDoses } : {}),
    };
  }
  if (budget && !assumptions.fixedAlloc && budget.surgePotions > 0) {
    const plain = route.encounters.map((id) => cached(id, false));
    const dosed = route.encounters.map((id) => cached(id, true));
    const doses = new Set(routeSurgeDoses(plain, dosed, assumptions, budget.surgePotions));
    const encounters = route.encounters.map((id, i) => (doses.has(id) ? dosed[i] : plain[i]));
    return {
      route, encounters, seconds: total(encounters), ...(doses.size ? { surgeDoses: route.encounters.filter((id) => doses.has(id)) } : {}),
    };
  }
  const encounters = route.encounters.map((id) => cached(id, false));
  const fixedDoses = assumptions.fixedAlloc ? route.encounters.filter((id) => assumptions.fixedAlloc?.[id]?.surge) : [];
  return {
    route, encounters, seconds: total(encounters), ...(fixedDoses.length ? { surgeDoses: fixedDoses } : {}),
  };
};

export interface RouteComparison {
  routes: RouteTime[];
  /** Index into `routes` of the fastest (lowest total; the first on ties); -1 if no route is finite. */
  fastest: number;
}

/** Phase 38c: a time model's routes (its own list, else the cartesian product of its slots). */
export const modelRoutes = (m: Pick<RaidTimeModel, 'routeSlots' | 'routes' | 'labels'>): Route[] => (m.routes
  ? m.routes.map((encounters) => ({ id: encounters.join('>'), label: encounters.map((e) => m.labels[e] ?? e).join(' → '), encounters }))
  : enumerateRoutes(m.routeSlots, m.labels));

/** The routes of the assumptions' raid (the Fractured Archive's 8 by default). */
export const routesFor = (a: Pick<RaidTimeAssumptions, 'model'>): Route[] => modelRoutes(a.model ?? FA_TIME_MODEL);

/** All routes (each encounter evaluated once). */
export const compareRoutes = (kit: RaidKit, assumptions: RaidTimeAssumptions, routes = routesFor(assumptions)): RouteComparison => {
  const cache = new Map<EncounterId, EncounterTime>();
  const times = routes.map((r) => raidTime(r, kit, assumptions, cache));
  let fastest = -1;
  times.forEach((t, i) => {
    if (Number.isFinite(t.seconds) && (fastest < 0 || t.seconds < times[fastest].seconds)) fastest = i;
  });
  return { routes: times, fastest };
};

// --- the real kit --------------------------------------------------------------------------------------------------

/** A loadout of the kit, with the style options to try and how to build the player against a monster. */
export interface KitLoadout {
  /** Unique within the kit (memo key). */
  id: string;
  name: string;
  group?: StyleGroup;
  /** Only offered on this phase (search results are per phase); undefined = every phase. */
  phaseKey?: string;
  options: StyleOption[];
  /**
   * `a` (phase 38a): the target's assumptions when they differ from the kit's (`assumptionsForTarget`: a ToA room before
   * the supplies, normal potions); undefined = the loadout's own. Every loadout built from the best-setup assumptions
   * must use it (a re-timer that ignores it times rooms 1-2 of ToA with the salts); a calculator loadout keeps its own
   * potions.
   */
  toPlayer: (monster: Monster, option: StyleOption, a?: BestSetupAssumptions) => Player;
}

export const presetKitLoadout = (base: Player, preset: PresetDef, assumptions: BestSetupAssumptions): KitLoadout => ({
  id: `preset:${preset.name}`,
  name: preset.name,
  group: preset.group,
  options: presetStyles(preset).flatMap((style) => presetSpells(preset).map((spell) => ({ style, spell }))),
  toPlayer: (monster, o, a) => applyPresetToPlayer(base, preset, o.style, o.spell, monster, a ?? assumptions),
});

/** A search result (the best loadout of a style on one phase), offered on that phase only, with its own style. */
export const searchRowKitLoadout = (
  base: Player,
  row: SearchRow,
  targetKey: string,
  phase: string | undefined,
  assumptions: BestSetupAssumptions,
): KitLoadout => ({
  id: `search:${row.group}:${phaseKey(targetKey, phase)}`,
  name: `Best ${row.group} (search): ${row.weaponLabel}`,
  group: row.group,
  phaseKey: phaseKey(targetKey, phase),
  options: [{ style: row.style, spell: row.spell }],
  toPlayer: (monster, _o, a) => searchRowToPlayer(base, row, monster, a ?? assumptions),
});

/**
 * A main-calculator loadout as the user left it (its own style, spell, prayers, potions and boosts); only the
 * equipment bonuses are recomputed against each monster, as the calculator does on a monster change.
 */
export const playerKitLoadout = (player: Player, index: number): KitLoadout => ({
  id: `calc:${index}`,
  name: player.name || `Loadout ${index + 1}`,
  options: [{ style: player.style, spell: player.spell?.name ?? null }],
  toPlayer: (monster) => ({ ...player, ...calculateEquipmentBonusesFromGear(player, monster) }),
});

/** Phase 36: a stable key of spec counts (weapons sorted, zeros dropped). */
export const specCountsKey = (c: SpecCounts | undefined): string => Object.entries(c ?? {})
  .filter(([, n]) => (n ?? 0) > 0).sort(([a], [b]) => a.localeCompare(b)).map(([w, n]) => `${w}${n}`)
  .join(',');

/** Phase 36: which drain weapons (drainModel's canHit) and damage spec weapons (canWeaponHit) can hit a monster. */
export const specHitsOf = (m: Monster, assumptions: BestSetupAssumptions): Record<string, boolean> => {
  const model = drainModel(m, assumptions);
  const out: Record<string, boolean> = { ...model.canHit };
  DAMAGE_SPEC_WEAPON_IDS.forEach((w) => {
    out[w] = canWeaponHit(m, damageSpecItemName(w), DAMAGE_SPEC_WEAPONS[w].group);
  });
  return out;
};

export interface KitEvaluator extends RaidKit {
  /** evaluateLoadout calls so far (memo misses). */
  evaluations: () => number;
}

/**
 * The real kit: for each phase query, builds the monster as the best-setup view does (drain state planned with the
 * query's fight length) and returns the loadout + style option with the highest DPS (the first on ties). Memoised per
 * (loadout, style option, target, phase, drain reductions), so routes sharing encounters, and two passes that end up
 * with the same drains, cost nothing extra.
 */
/**
 * Phase 37: the memo of kit evaluators that share it (the planner's exact re-times of one run). Valid only for evaluators
 * with the same assumptions object and loadouts whose `id` means the same loadout (the DPS is per id).
 */
export interface KitEvaluatorCache {
  monsters: Map<string, { monster: Monster, drain: DrainState }>;
  evals: Map<string, number>;
}

export const kitEvaluatorCache = (): KitEvaluatorCache => ({ monsters: new Map(), evals: new Map() });

export const createKitEvaluator = (loadouts: KitLoadout[], assumptions: BestSetupAssumptions, cache?: KitEvaluatorCache): KitEvaluator => {
  const { monsters, evals } = cache ?? kitEvaluatorCache();
  let count = 0;
  const monsterFor = (q: PhaseQuery) => {
    // phase 36: a query with the encounter budget's spec counts gets exactly those specs
    let specs = q.drain !== 'none' && q.specs ? specCountsKey(q.specs.counts) : '';
    if (specs && q.outcomeOnly) specs = `dk:${specCountsDrainKey(findTarget(q.targetKey), q.phase, q.drain, assumptions, q.specs!.counts)}`;
    const key = `${phaseKey(q.targetKey, q.phase)}|${q.drain}|${q.drain === 'none' || q.specs ? 0 : q.fightSeconds}|${specs}`;
    let m = monsters.get(key);
    if (!m) {
      m = specs && q.outcomeOnly
        ? {
          monster: monsterForSpecCounts(findTarget(q.targetKey), q.phase, q.drain, assumptions, q.specs!.counts),
          drain: { id: q.drain } as DrainState,
        }
        : buildTargetMonster(findTarget(q.targetKey), q.phase, q.drain, { ...assumptions, fightSeconds: q.fightSeconds }, q.drain !== 'none' ? q.specs?.counts : undefined);
      monsters.set(key, m);
    }
    return m;
  };
  // phase 38a: a ToA room before the supplies uses the normal potions (same object for every other target)
  const targetA = (q: PhaseQuery) => assumptionsForTarget(findTarget(q.targetKey), assumptions);
  return {
    specDamage: (q, w) => damageSpecProfile(atHpLeft(monsterFor(q).monster, q.hpLeft), w, targetA(q)),
    specHits: (q) => specHitsOf(monsterFor({ ...q, drain: 'none', specs: undefined }).monster, assumptions),
    drainKey: (q) => specCountsDrainKey(findTarget(q.targetKey), q.phase, q.drain, assumptions, q.specs?.counts ?? {}),
    evaluations: () => count,
    best: (q) => {
      const pk = phaseKey(q.targetKey, q.phase);
      const { monster, drain } = monsterFor(q);
      const monsterKey = `${pk}|${JSON.stringify(monster.inputs.defenceReductions)}`;
      const ta = targetA(q);
      const override = ta !== assumptions ? ta : undefined;
      let best: KitChoice | null = null;
      for (const l of loadouts) {
        if (l.phaseKey !== undefined && l.phaseKey !== pk) continue;
        for (const o of l.options) {
          const key = `${l.id}|${o.style.name}|${o.style.stance}|${o.spell ?? ''}|${monsterKey}`;
          let dps = evals.get(key);
          if (dps === undefined) {
            try {
              dps = evaluateLoadout(l.toPlayer(monster, o, override), monster, false).dps;
            } catch (e) {
              dps = 0; // a broken loadout (e.g. a stale calculator item) must not break the comparison
            }
            evals.set(key, dps);
            count += 1;
          }
          if (!best || dps > best.dps) {
            best = {
              loadout: l.name,
              style: styleLabel(o.style, o.spell),
              group: l.group,
              dps,
              drain: q.drain === 'none' ? undefined : drain.specs,
              drainLine: q.drain === 'none' ? undefined : drain.line,
            };
          }
        }
      }
      return best;
    },
  };
};

/** Best search row of each style group (highest DPS, damage > 0), from a search's rows. */
export const bestRowPerGroup = (rows: SearchRow[]): Partial<Record<StyleGroup, SearchRow>> => {
  const out: Partial<Record<StyleGroup, SearchRow>> = {};
  for (const r of rows) {
    if (r.dps > 0 && (!out[r.group] || r.dps > out[r.group]!.dps)) out[r.group] = r;
  }
  return out;
};

// --- the Routes tab's computation (runs in the search worker) -------------------------------------------------------

/** What the kit is made of (serialisable: sent to the worker). */
export interface RaidKitSpec {
  /** The best search result of each of these styles, per phase (searched under the selected drain state). */
  searchGroups: StyleGroup[];
  /** Preset names (presets.ts). */
  presets: string[];
  /** Main-calculator loadouts. */
  players: Player[];
}

/** Best search row per style group, per phase key. */
export type PhaseSearchBest = Record<string, Partial<Record<StyleGroup, SearchRow>>>;

export interface RouteComparisonRequest {
  basePlayer: Player;
  assumptions: BestSetupAssumptions;
  drain: DrainStateId;
  settings: TimeSettings;
  kit: RaidKitSpec;
  /** Search results already known (the UI's session cache), by phase key; missing ones are searched. */
  searchBest: PhaseSearchBest;
}

export interface RouteComparisonProgress {
  stage: 'search' | 'time';
  /** Searches done / needed. */
  done: number;
  total: number;
  /** The phase being searched. */
  label: string;
  search?: GearSearchProgress;
}

export interface RouteComparisonResult extends RouteComparison {
  /** Every per-phase search result used (for the UI cache). */
  searchBest: PhaseSearchBest;
  evaluations: number;
  searches: number;
  elapsedMs: number;
}

/** Rows kept per search: enough for every weapon variant, so each style's best is among them. */
const SEARCH_TOP_N = 64;

/**
 * The Routes tab: runs the gear searches the kit needs (one all-style search per phase target that the model queries,
 * unless cached), builds the kit and compares the 8 routes. Phase 18: `model` = the raid's time model (the worker
 * passes the one of `req.assumptions.raid`; ToA has one fixed route, shown as "Encounters").
 */
export const computeRouteComparison = (
  req: RouteComparisonRequest,
  onProgress?: (p: RouteComparisonProgress) => void,
  model: RaidTimeModel = FA_TIME_MODEL,
): RouteComparisonResult => {
  const start = Date.now();
  const { assumptions, drain, settings } = req;
  assertTimeModelForRaid(model, assumptions);
  const searchBest: PhaseSearchBest = { ...req.searchBest };
  const timeA = raidTimeAssumptionsFrom(assumptions, drain, settings, model);
  const targets = req.kit.searchGroups.length ? model.requiredPhaseTargets(timeA) : [];
  const missing = targets.filter((t) => !searchBest[phaseKey(t.targetKey, t.phase)]);
  missing.forEach((t, i) => {
    const label = `${findTarget(t.targetKey).label}${t.phase ? ` (${t.phase})` : ''}`;
    onProgress?.({
      stage: 'search', done: i, total: missing.length, label,
    });
    const r = runGearSearch(req.basePlayer, {
      targetKey: t.targetKey, phase: t.phase, drain, styles: 'all',
    }, assumptions, {
      topN: SEARCH_TOP_N,
      onProgress: (search) => onProgress?.({
        stage: 'search', done: i, total: missing.length, label, search,
      }),
    });
    searchBest[phaseKey(t.targetKey, t.phase)] = bestRowPerGroup(r.rowsByWeapon);
  });
  onProgress?.({
    stage: 'time', done: missing.length, total: missing.length, label: 'route times',
  });

  const loadouts: KitLoadout[] = [];
  for (const t of targets) {
    const best = searchBest[phaseKey(t.targetKey, t.phase)];
    for (const g of req.kit.searchGroups) {
      const row = best?.[g];
      if (row) loadouts.push(searchRowKitLoadout(req.basePlayer, row, t.targetKey, t.phase, assumptions));
    }
  }
  const presets = raidBase(assumptions.raid).presets;
  for (const name of req.kit.presets) {
    const preset = presets.find((p) => p.name === name);
    if (preset) loadouts.push(presetKitLoadout(req.basePlayer, preset, assumptions));
  }
  req.kit.players.forEach((p, i) => loadouts.push(playerKitLoadout(p, i)));

  const kit = createKitEvaluator(loadouts, assumptions);
  const cmp = compareRoutes(kit, timeA);
  return {
    ...cmp, searchBest, evaluations: kit.evaluations(), searches: missing.length, elapsedMs: Date.now() - start,
  };
};

// --- formatting ----------------------------------------------------------------------------------------------------

/** "4:05.3" (m:ss.s), "∞" for an infinite time. */
export const formatDuration = (s: number): string => {
  if (!Number.isFinite(s)) return '∞';
  // phase 36 fix: round to the tenth first (1499.96 s read "24:60.0")
  const r = Math.round(s * 10) / 10;
  const m = Math.floor(r / 60);
  const rest = r - m * 60;
  return `${m}:${rest < 10 ? '0' : ''}${rest.toFixed(1)}`;
};
