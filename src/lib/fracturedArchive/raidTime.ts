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
  presetSpells,
  presetStyles,
  styleLabel,
} from '@/lib/fracturedArchive/bestSetup';
import {
  BestSetupAssumptions, DEFAULT_ASSUMPTIONS, PresetDef, StyleGroup,
} from '@/lib/fracturedArchive/presets';
import { raidBase, teamDpsMultiplier } from '@/lib/raids/base';
import { CoxInputs, TimeSettings, ToaInputs } from '@/lib/raids/types';
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
  // P2 is time-limited (three quadrant cycles, Strategies → Phase 2); its length in seconds is unpublished, so it is
  // ignored by default.
  ocellusP2Seconds: 0,
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
}

/**
 * A kit: anything that returns its best loadout + style (highest DPS) for a phase, or null when it has nothing that
 * applies. The real one is `createKitEvaluator`; tests use toy kits with known DPS.
 */
export interface RaidKit {
  best: (q: PhaseQuery) => KitChoice | null;
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
  raidInputs: Pick<BestSetupAssumptions, 'raid' | 'toa' | 'cox'> = {},
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
}

export interface EncounterTime {
  id: EncounterId;
  label: string;
  phases: PhaseTime[];
  seconds: number;
  /** Time of the first pass without drains (= the fight length given to the drain planner); undefined for None. */
  drainFightSeconds?: number;
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
}

/**
 * Phase 18: a raid's time model. The Fractured Archive's is `FA_TIME_MODEL` below (8 routes); Tombs of Amascut's is
 * src/lib/raids/toa/time.ts (one fixed route). The rest of this file (drain passes, routes, kits) is raid-independent.
 */
export interface RaidTimeModel {
  id: string;
  routeSlots: RouteSlot[];
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
}

export const raidTimeAssumptionsFrom = (
  best: BestSetupAssumptions,
  drain: DrainStateId,
  settings: TimeSettings = RAID_TIME_DEFAULTS,
  model?: RaidTimeModel,
): RaidTimeAssumptions => ({
  partySize: best.partySize,
  drain,
  settings,
  fallbackFightSeconds: best.fightSeconds,
  dpsMultiplier: teamDpsMultiplier(best),
  ...(model ? { model } : {}),
  ...(best.toa ? { toa: best.toa } : {}),
  ...(best.cox ? { cox: best.cox } : {}),
});

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
    targetKey: p.targetKey, phase: p.phase, drain, fightSeconds,
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
      targetKey: 'ocellus-p2', drain, fightSeconds,
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
    });
  }
  const p3Total = Math.max(0, targetHp('ocellus-p3', OCELLUS_P3_PHASES[0], a.partySize) - carried);
  const last = Math.min(1, Math.max(0, settings.ocellusLastQuadrantFraction));
  const q13: PlannedPhase = {
    key: 'ocellus-p3', label: `P3 quadrants 1-3${last ? ` (${pctText(1 - last)})` : ''}`, targetKey: 'ocellus-p3', phase: OCELLUS_P3_PHASES[0], damage: p3Total * (1 - last),
  };
  if (q13.damage > 0) rows.push(phaseTime(q13, kit, drain, fightSeconds, mult));
  if (p3Total * last > 0) {
    // Pessimistic: the Deflect that hurts the kit most (= the one blocking the kit's best style; magic is never
    // deflected in our model, so a magic-best kit gets the lower of the two)
    const options = [OCELLUS_P3_DEFLECT_MELEE_PHASE, OCELLUS_P3_DEFLECT_RANGED_PHASE].map((phase) => phaseTime({
      key: 'ocellus-p3-last', label: `P3 last quadrant, ${phase.replace('Last quadrant: ', '')} (${pctText(last)})`, targetKey: 'ocellus-p3', phase, damage: p3Total * last,
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
 * Time of one encounter. Drains (Solo / Team) are planned with the encounter's own length: a first pass without drains
 * gives that length, then the encounter is evaluated once more with the drain state planned for it (one fixed-point
 * iteration; the drained pass is shorter, which would only give a Solo plan less energy, so the plan is a little
 * generous).
 */
export const encounterTime = (id: EncounterId, kit: RaidKit, a: RaidTimeAssumptions): EncounterTime => {
  const model = modelOf(a);
  const label = model.labels[id] ?? id;
  const fixed = typeof a.fixedFightSeconds === 'number' ? a.fixedFightSeconds : a.fixedFightSeconds?.[id];
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
  const fight = Number.isFinite(firstSeconds) && firstSeconds > 0 ? Math.round(firstSeconds) : a.fallbackFightSeconds;
  const phases = model.encounterPass(id, kit, a, a.drain, fight);
  return {
    id, label, phases, seconds: sumSeconds(phases), drainFightSeconds: fight,
  };
};

export interface RouteTime {
  route: Route;
  encounters: EncounterTime[];
  /** Total DPS time in seconds (Infinity when some phase can't be damaged by the kit). */
  seconds: number;
}

/** DPS-only time of one route with a kit. `cache` shares encounter results between routes. */
export const raidTime = (
  route: Route,
  kit: RaidKit,
  assumptions: RaidTimeAssumptions,
  cache: Map<EncounterId, EncounterTime> = new Map(),
): RouteTime => {
  const encounters = route.encounters.map((id) => {
    let e = cache.get(id);
    if (!e) {
      e = encounterTime(id, kit, assumptions);
      cache.set(id, e);
    }
    return e;
  });
  return { route, encounters, seconds: encounters.reduce((t, e) => t + e.seconds, 0) };
};

export interface RouteComparison {
  routes: RouteTime[];
  /** Index into `routes` of the fastest (lowest total; the first on ties); -1 if no route is finite. */
  fastest: number;
}

/** The routes of the assumptions' raid (the Fractured Archive's 8 by default). */
export const routesFor = (a: Pick<RaidTimeAssumptions, 'model'>): Route[] => {
  const m = a.model ?? FA_TIME_MODEL;
  return enumerateRoutes(m.routeSlots, m.labels);
};

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
  toPlayer: (monster: Monster, option: StyleOption) => Player;
}

export const presetKitLoadout = (base: Player, preset: PresetDef, assumptions: BestSetupAssumptions): KitLoadout => ({
  id: `preset:${preset.name}`,
  name: preset.name,
  group: preset.group,
  options: presetStyles(preset).flatMap((style) => presetSpells(preset).map((spell) => ({ style, spell }))),
  toPlayer: (monster, o) => applyPresetToPlayer(base, preset, o.style, o.spell, monster, assumptions),
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
  toPlayer: (monster) => searchRowToPlayer(base, row, monster, assumptions),
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
export const createKitEvaluator = (loadouts: KitLoadout[], assumptions: BestSetupAssumptions): KitEvaluator => {
  const monsters = new Map<string, { monster: Monster, drain: DrainState }>();
  const evals = new Map<string, number>();
  let count = 0;
  const monsterFor = (q: PhaseQuery) => {
    const key = `${phaseKey(q.targetKey, q.phase)}|${q.drain}|${q.drain === 'none' ? 0 : q.fightSeconds}`;
    let m = monsters.get(key);
    if (!m) {
      m = buildTargetMonster(findTarget(q.targetKey), q.phase, q.drain, { ...assumptions, fightSeconds: q.fightSeconds });
      monsters.set(key, m);
    }
    return m;
  };
  return {
    evaluations: () => count,
    best: (q) => {
      const pk = phaseKey(q.targetKey, q.phase);
      const { monster, drain } = monsterFor(q);
      const monsterKey = `${pk}|${JSON.stringify(monster.inputs.defenceReductions)}`;
      let best: KitChoice | null = null;
      for (const l of loadouts) {
        if (l.phaseKey !== undefined && l.phaseKey !== pk) continue;
        for (const o of l.options) {
          const key = `${l.id}|${o.style.name}|${o.style.stance}|${o.spell ?? ''}|${monsterKey}`;
          let dps = evals.get(key);
          if (dps === undefined) {
            try {
              dps = evaluateLoadout(l.toPlayer(monster, o), monster, false).dps;
            } catch (e) {
              dps = 0; // a broken loadout (e.g. a stale calculator item) must not break the comparison
            }
            evals.set(key, dps);
            count += 1;
          }
          if (!best || dps > best.dps) {
            best = {
              loadout: l.name, style: styleLabel(o.style, o.spell), group: l.group, dps, drain: q.drain === 'none' ? undefined : drain.specs,
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
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return `${m}:${rest < 10 ? '0' : ''}${rest.toFixed(1)}`;
};
