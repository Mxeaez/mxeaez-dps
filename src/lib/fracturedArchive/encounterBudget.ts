import type {
  DrainStateId, SpecCounts,
} from '@/lib/fracturedArchive/bestSetup';
import { attemptsFromCounts, findTarget } from '@/lib/fracturedArchive/bestSetup';
import type {
  PhaseQuery, PhaseTime, RaidKit, RaidTimeAssumptions,
} from '@/lib/fracturedArchive/raidTime';
import {
  DrainModel, PlannerWeapon, SPEC_WEAPONS, specAttempts,
} from '@/lib/fracturedArchive/specs';
import {
  ayakOutcome, ayakSpecsToThreshold, DEFAULT_FLOOR_THRESHOLD, DEFENCE_DRAIN_ORDER, DefenceDrainWeapon,
  defenceOutcome, DrainCap, kitDrainPlan, MAX_FLOOR_SPECS, orderedDistribution,
} from '@/lib/fracturedArchive/teamSpecs';
import {
  bestDamageVariant, DAMAGE_SPEC_WEAPONS, DamageSpecProfile, DamageSpecWeapon, netSpecDamage, specSecondsSaved,
} from '@/lib/fracturedArchive/damageSpecs';
import {
  allocateBudget, AllocationProblem, AllocationResult, BudgetRow, CARRY_SPEC_ENERGY, DamageChoice,
  DEATH_CHARGE_ENERGY, deathChargeSchedule, DRAIN_CLOSE_CALL, drinkRowOf, EventOption, MY_POOL, OptionSpend, PoolGroup,
  PoolState, RowOutcome, rowSecondsAfter, simulateBudget, SPEC_MAX_ENERGY,
} from '@/lib/fracturedArchive/specBudget';

/**
 * Phase 36: the time model's spec budget per encounter (raidTime.ts `encounterTime` calls it when the assumptions carry
 * a `specBudget`, i.e. for Solo / Team drains). Builds specBudget.ts's allocation problem from the encounter's phases:
 *
 * - **Rows** = the phases of the encounter's undrained pass, in order, with wall-clock times: the model's seconds ×
 *   team-DPS multiplier ÷ party size (the fight length formula of `drainFightSecondsOf`; = the seconds where the
 *   multiplier is the party size, ToA / CoX / ToB; FA's multiplier 1: the seconds ÷ party). The first plan uses the
 *   undrained times; it is then re-planned on the clock of its own drained phases (review: the drained fight is
 *   shorter, so fewer regen ticks), {@link CLOCK_ROUNDS} times at most.
 * - **Drain events** ({@link drainEventsOf}) = per NPC its first phase and every Defence reset (drainLine.ts
 *   `encounterDrainSummary`'s grouping). Adds and other `noDrains` targets get no drain specs (phase 38b: damage specs
 *   are allowed on adds; a target's `noDamageSpecs` forbids them).
 * - **Drain specs** of an event (phase 38g: one fixed set, {@link eventWantedCounts}; was a seconds-based option search;
 *   phase 38h-1: the drain line's plan within the kit / your weapons)
 *   = spec counts per drain weapon (Solo: the weapons you carry, Eye of Ayak up to the specs asked for; Team: the
 *   carriers' weapons), each weapon's specs made at the first phase of the event it can hit (`RaidKit.specHits`), cut to
 *   what the bars pay there. A phase's drains = the event's specs of the weapons that can hit it (bestSetup.ts
 *   `attemptsFromCounts`).
 * - **Row times** come from the model's own pass (`encounterPass`) run with every query carrying its event's counts
 *   (`PhaseQuery.specs`), so the special phases (Bloat's first down, Ocellus P2 → P3, rotations) are timed as before.
 * - **Damage specs** (your pool) on a row whose seconds are damage ÷ (multiplier × DPS) (a damage-limited phase): one
 *   spec takes its net damage (`netSpecDamage`: E[spec] − DPS × its ticks × 0.6 s, the best variant at the row's DPS)
 *   off the row, i.e. saves net ÷ (multiplier × DPS) seconds (`specSecondsSaved`).
 */

/** The budget the time model spends (raidTimeAssumptionsFrom builds it from the best-setup assumptions). */
export interface SpecBudgetConfig {
  drain: 'solo' | 'team';
  /** Solo: the drain weapons you carry and the most specs of each (Eye of Ayak: the specs asked for). */
  solo?: Partial<Record<PlannerWeapon, number>>;
  /** Team: the carriers that count, per weapon, and whether that weapon's carriers wear Lightbearer. */
  carriers?: Partial<Record<PlannerWeapon, number>>;
  carrierLightbearer?: Partial<Record<PlannerWeapon, boolean>>;
  /** Your Lightbearer (your pool's regen: 15 s per 10%). */
  lightbearer: boolean;
  /** Damage spec weapons you carry (your pool; Team: you are not a carrier then). */
  damage: DamageSpecWeapon[];
  /** Phase 38h-3b: those of `damage` spent only from energy left after the others (the filler; allocateBudget). */
  filler?: DamageSpecWeapon[];
  /** Surge potions you carry (4 doses each). */
  surgePotions: number;
  /** Energy carries from one encounter to the next ({@link CARRY_SPEC_ENERGY}). */
  carry: boolean;
  /**
   * Phase 38b: Death Charge (the Arceuus spellbook): each kill a cast covers restores 15% × `share` to every pool
   * (`share` = 1 ÷ party size: each player is as likely to land the killing blow; Solo party 1 = every kill).
   */
  deathCharge?: { share: number };
  /** Phase 38b: Liquid adrenaline from the raid's supplies (ToA: the Power bundle with the Smelling salts). */
  adrenaline?: boolean;
  /** Phase 38g: P(floor) / P(magic def 0) the drain specs aim for (default DEFAULT_FLOOR_THRESHOLD). */
  threshold?: number;
}

export interface EncounterAllocEvent {
  npc: string;
  reset?: string;
  firstRowKey: string;
  counts: SpecCounts;
  /** Phase 38h-2: the drain's value in boss HP (H × g ÷ (1 + g), `drainHpValue`); undefined = no drain made. */
  hp?: number;
  /**
   * Phase 38h-2: your bar pays this drain (Solo) and the damage specs its energy would buy instead are worth within 10%
   * of it (`DRAIN_CLOSE_CALL`): a close call, the drain is kept.
   */
  closeCall?: boolean;
}

/** An encounter's spec plan (also what the planner's optimiser replays: `RaidTimeAssumptions.fixedAlloc`). */
export interface EncounterAlloc {
  events: EncounterAllocEvent[];
  /** Phase (row) key → event index. */
  rowEvent: Record<string, number>;
  /** Your damage specs per phase key. */
  damage: Record<string, Partial<Record<DamageSpecWeapon, number>>>;
  /** A surge dose right after the encounter's first specs. */
  surge: boolean;
}

/** Phase 38b: Death Charge in an encounter (the plan's last clock round). */
export interface DeathChargePlan {
  /** Kills that can trigger it (the last row of each NPC; a row's `kills`), and those the casts cover. */
  kills: number;
  covered: number;
  /** Energy (%) each pool gets per covered kill (15 × share). */
  perKill: number;
}

export interface EncounterSpecPlan extends EncounterAlloc {
  /** Specs made (drains + damage). */
  specs: number;
  /** Phase 38h-2: the plan's value in boss HP (drains + damage specs; specBudget.ts `AllocationResult.hp`). */
  hp?: number;
  /** The encounter's seconds with no specs at all (every event's option 0, no damage specs). */
  noSpecSeconds: number;
  /** Energy per pool at the start and the end of the encounter. */
  start: PoolState;
  end: PoolState;
  /** Phase 38b: Death Charge (undefined: not on the Arceuus spellbook, or no kill in the encounter). */
  deathCharge?: DeathChargePlan;
  /** Phase 38b: Liquid adrenaline seconds from the encounter's start (spec costs halved). */
  adrenalineSeconds?: number;
}

/** One damage spec weapon's specs on a phase. */
export interface PhaseDamageSpecs {
  weapon: DamageSpecWeapon;
  label: string;
  count: number;
  /** E[damage] per spec (upstream), its ticks, net damage per spec at the phase's DPS, seconds saved per spec. */
  expected: number;
  ticks: number;
  net: number;
  saved: number;
}

const ALL_TRUE: Record<string, boolean> = new Proxy({}, { get: () => true });

/** The NPC a phase target is (briefing.ts `phaseNpc`: the target's `npc`, else its monster name). */
export const targetNpc = (targetKey: string): string => {
  try {
    const t = findTarget(targetKey);
    return t.npc ?? t.name;
  } catch {
    return targetKey;
  }
};

const targetNoDrains = (targetKey: string): string | undefined => {
  try {
    return findTarget(targetKey).noDrains;
  } catch {
    return undefined;
  }
};

/** Phase 38b: why damage specs never apply to a target (not the adds: damage specs are allowed on them). */
const targetNoDamageSpecs = (targetKey: string): string | undefined => {
  try {
    return findTarget(targetKey).noDamageSpecs;
  } catch {
    return undefined;
  }
};

/** Phase 38b: whether killing a target can trigger Death Charge (wiki exceptions: Glowing crystal, Olm's hands, obelisk). */
const triggersDeathCharge = (targetKey: string): boolean => {
  try {
    return !findTarget(targetKey).noDeathCharge;
  } catch {
    return true;
  }
};

/**
 * Phase 38b: the kills of an encounter's rows (Death Charge): an NPC dies at its last row (`targetNpc`), the row's
 * `kills` of them (default 1: a row standing for several adds counts once unless the model says how many). Returns per
 * row the number of kills.
 */
export const rowKills = (rows: { key: string, targetKey: string, kills?: number }[]): number[] => {
  const last = new Map<string, number>();
  rows.forEach((r, i) => last.set(targetNpc(r.targetKey), i));
  return rows.map((r, i) => (last.get(targetNpc(r.targetKey)) === i && triggersDeathCharge(r.targetKey)
    ? Math.max(0, Math.floor(r.kills ?? 1)) : 0));
};

/**
 * Phase 38b: the Death Charge restore of each row (energy per pool at its end): a row's k kills are spread evenly over
 * it (start + j × length ÷ k, j = 1..k), the casts (`deathChargeSchedule`, ready at the encounter's start) cover some,
 * each covered kill gives 15% × share. Returns the rows with `restore` and the summary.
 */
export const withDeathCharge = (rows: BudgetRow[], kills: number[], share: number, clock0: number): { rows: BudgetRow[], plan?: DeathChargePlan } => {
  const times: { row: number, t: number }[] = [];
  kills.forEach((k, i) => {
    for (let j = 1; j <= k; j++) times.push({ row: i, t: rows[i].start + (j / k) * (rows[i].end - rows[i].start) });
  });
  if (!times.length || !(share > 0)) return { rows };
  const covered = deathChargeSchedule(times.map((x) => x.t), clock0);
  const perKill = DEATH_CHARGE_ENERGY * share;
  const restore = rows.map(() => 0);
  covered.forEach((c, j) => { if (c) restore[times[j].row] += perKill; });
  return {
    rows: rows.map((r, i) => (restore[i] > 0 ? { ...r, restore: restore[i] } : r)),
    plan: { kills: times.length, covered: covered.filter((c) => c).length, perKill },
  };
};

/**
 * Drain events of a phase list (drainLine.ts `encounterDrainSummary`'s grouping): per NPC, a new event at its first
 * phase and at every phase with `drainReset`; an NPC coming back joins its current event.
 */
export const drainEventsOf = (rows: { key: string, targetKey: string, drainReset?: string }[]): {
  events: { npc: string, reset?: string, rows: number[] }[],
  rowEvent: number[],
} => {
  const events: { npc: string, reset?: string, rows: number[] }[] = [];
  const current = new Map<string, number>();
  const rowEvent = rows.map((r, i) => {
    const npc = targetNpc(r.targetKey);
    const at = current.get(npc);
    if (at === undefined || r.drainReset) {
      current.set(npc, events.length);
      events.push({ npc, ...(at !== undefined && r.drainReset ? { reset: r.drainReset } : {}), rows: [i] });
      return events.length - 1;
    }
    events[at].rows.push(i);
    return at;
  });
  return { events, rowEvent };
};

/**
 * Phase 36 review: the hp the NPC has left at the START of each row (by key): the damage of its rows in the same drain
 * event from this row on (`drainEventsOf`: a Defence reset — Olm's next phase, Sotetseg's mazes — starts a new count,
 * which under-counts the hp of a boss that keeps its hp across a reset: conservative). The kits cap it at the monster's
 * full hp (the AG shield row: the boss's 550, not the shield's damage). Damage specs are valued at it: the Zaryte
 * crossbow's ruby proc (a share of the target's current hp) and every spec's expected damage (≤ the hp left).
 */
export const rowHpLeft = (rows: { key: string, targetKey: string, drainReset?: string, damage: number }[]): Map<string, number> => {
  const { events, rowEvent } = drainEventsOf(rows);
  const out = new Map<string, number>();
  rows.forEach((r, i) => {
    const ev = events[rowEvent[i]];
    const left = ev.rows.filter((j) => j >= i).reduce((t, j) => t + Math.max(0, rows[j].damage || 0), 0);
    if (left > 0 && !out.has(r.key)) out.set(r.key, left);
  });
  return out;
};

/** Phase 37: short ids of `assignedKit`'s rewritings (memo keys); a cleared id is never reused. */
const REWRITE_IDS = new Map<string, number>();
const REWRITE_IDS_MAX = 200000;
let rewriteCount = 0;

/** The kit with every drained query carrying its drain event's spec counts. */
export const assignedKit = (
  kit: RaidKit,
  rowEvent: Map<string, number>,
  npcEvent: Map<string, number>,
  assign: (SpecCounts | undefined)[],
  outcomeOnly = false,
): RaidKit => {
  const withSpecs = (q: PhaseQuery): PhaseQuery => {
    if (q.drain === 'none' || q.defence) return q;
    let e = q.rowKey !== undefined ? rowEvent.get(q.rowKey) : undefined;
    if (e === undefined) e = npcEvent.get(targetNpc(q.targetKey));
    return { ...q, specs: { counts: (e !== undefined ? assign[e] : undefined) ?? {} }, ...(outcomeOnly ? { outcomeOnly } : {}) };
  };
  // phase 37: a pass with this kit is the inner kit's pass with the same rewriting (part of the memo key)
  let rewrite: string | undefined;
  const rewriteKey = () => {
    if (rewrite === undefined) {
      const full = JSON.stringify([Array.from(rowEvent), Array.from(npcEvent), assign, outcomeOnly]);
      if (REWRITE_IDS.size >= REWRITE_IDS_MAX) REWRITE_IDS.clear();
      let id = REWRITE_IDS.get(full);
      if (id === undefined) {
        rewriteCount += 1;
        id = rewriteCount;
        REWRITE_IDS.set(full, id);
      }
      rewrite = `r${id}`;
    }
    return rewrite;
  };
  return {
    best: (q) => kit.best(withSpecs(q)),
    ...(kit.specDamage ? { specDamage: (q, w) => kit.specDamage!(withSpecs(q), w) } : {}),
    ...(kit.specHits ? { specHits: (q) => kit.specHits!(q) } : {}),
    ...(kit.drainKey ? { drainKey: (q) => kit.drainKey!(withSpecs(q)) } : {}),
    ...(kit.drainModel ? { drainModel: (q) => kit.drainModel!(q) } : {}),
    ...(kit.memoPass ? {
      memoPass: (key, a, run) => kit.memoPass!(`${rewriteKey()}|${key}`, a, (inner) => run(assignedKit(inner, rowEvent, npcEvent, assign, outcomeOnly))),
    } : {}),
  };
};

/** A row's seconds are damage ÷ (multiplier × DPS): damage specs can take damage off it. */
export const damageLimited = (r: Pick<PhaseTime, 'seconds' | 'damage' | 'dps' | 'targetKey' | 'noDamageSpecs'>, mult: number): boolean => {
  if (r.noDamageSpecs || !(r.dps > 0) || !(r.damage > 0) || !Number.isFinite(r.seconds) || !(r.seconds > 0)) return false;
  // phase 38b: adds (`noDrains`) take damage specs; only a target's own `noDamageSpecs` forbids them
  if (targetNoDamageSpecs(r.targetKey)) return false;
  const expect = r.damage / (Math.max(1e-12, mult) * r.dps);
  return Math.abs(expect - r.seconds) <= 1e-6 * Math.max(1, r.seconds);
};

/** Per damage weapon on a row: its best variant's net damage at the row's DPS (only weapons with net > 0). */
const damageChoices = (
  kit: RaidKit,
  q: PhaseQuery,
  r: PhaseTime,
  weapons: DamageSpecWeapon[],
  hits: Record<string, boolean>,
  mult: number,
  filler: DamageSpecWeapon[] = [],
): (DamageChoice & PhaseDamageSpecs)[] => {
  if (!kit.specDamage || !weapons.length || !damageLimited(r, mult)) return [];
  const out: (DamageChoice & PhaseDamageSpecs)[] = [];
  weapons.forEach((w) => {
    if (hits[w] === false) return;
    const p = kit.specDamage!(q, w) as DamageSpecProfile | null;
    if (!p) return;
    const v0 = bestDamageVariant(p, r.dps);
    if (!v0) return;
    // review: a spec can't deal more than the hp left at the row's start
    const v = q.hpLeft !== undefined && v0.expected > q.hpLeft ? { ...v0, expected: Math.max(0, q.hpLeft) } : v0;
    const net = netSpecDamage(v, r.dps);
    if (!(net > 1e-9)) return;
    out.push({
      weapon: w,
      label: DAMAGE_SPEC_WEAPONS[w].label,
      cost: DAMAGE_SPEC_WEAPONS[w].energy,
      net,
      count: 0,
      expected: v.expected,
      ticks: v.ticks,
      saved: specSecondsSaved(net, r.dps, mult),
      ...(filler.includes(w) ? { filler: true } : {}),
    });
  });
  return out;
};

const wallOf = (seconds: number, a: Pick<RaidTimeAssumptions, 'dpsMultiplier' | 'partySize'>): number => (Number.isFinite(seconds) && seconds > 0
  ? seconds * (a.dpsMultiplier ?? 1) / Math.max(1, a.partySize)
  : 0);

/** Wall-clock seconds of an encounter (for the surge cooldown and the energy carry). */
export const encounterWallSeconds = (seconds: number, a: Pick<RaidTimeAssumptions, 'dpsMultiplier' | 'partySize'>): number => wallOf(seconds, a);

/**
 * Phase 38c fix: a row's wall seconds on the spec budget's clock: seconds × multiplier ÷ party size, except a
 * fixed-length phase (`fixedWall`: Ocellus P2), which lasts its seconds whatever the multiplier.
 */
export const rowWallSeconds = (
  r: Pick<PhaseTime, 'seconds' | 'fixedWall'>,
  a: Pick<RaidTimeAssumptions, 'dpsMultiplier' | 'partySize'>,
): number => (r.fixedWall ? Math.max(0, Number.isFinite(r.seconds) ? r.seconds : 0) : wallOf(r.seconds, a));

/**
 * Phase 38j: the wall seconds of a pass's rows on the spec budget's clock (`rowWallSeconds`), stretched to the
 * encounter's measured room time when that is longer (`roomSeconds`; RaidTimeAssumptions.roomSeconds): every row that
 * isn't fixed-length × (room − fixed) ÷ (Σ walls − fixed), so the rows keep their shares and the encounter lasts its
 * room time. No room time, or one no longer than the walls: the walls as they are.
 */
export const rowWallsOn = (
  rows: Pick<PhaseTime, 'seconds' | 'fixedWall'>[],
  a: Pick<RaidTimeAssumptions, 'dpsMultiplier' | 'partySize'>,
  roomSeconds?: number,
): number[] => {
  const walls = rows.map((r) => rowWallSeconds(r, a));
  if (roomSeconds === undefined || !Number.isFinite(roomSeconds)) return walls;
  const total = walls.reduce((t, w) => t + w, 0);
  const fixed = rows.reduce((t, r, i) => t + (r.fixedWall ? walls[i] : 0), 0);
  if (!(roomSeconds > total) || !(total - fixed > 0)) return walls;
  const f = (roomSeconds - fixed) / (total - fixed);
  return walls.map((w, i) => (rows[i].fixedWall ? w : w * f));
};

/** Every pool at 100%. */
export const fullPools = (groups: PoolGroup[]): PoolState => Object.fromEntries(groups.map((g) => [g.id, Array(g.count).fill(SPEC_MAX_ENERGY)]));

/** The pools of a budget: Solo = yours; Team = one per carrier (by weapon) + yours when you carry damage specs. */
export const budgetGroups = (cfg: SpecBudgetConfig): PoolGroup[] => {
  const mine: PoolGroup = { id: MY_POOL, count: 1, regenSeconds: cfg.lightbearer ? 15 : 30 };
  if (cfg.drain === 'solo') return [mine];
  const groups: PoolGroup[] = (Object.keys(cfg.carriers ?? {}) as PlannerWeapon[])
    .filter((w) => (cfg.carriers![w] ?? 0) > 0)
    .map((w) => ({ id: w, count: Math.floor(cfg.carriers![w]!), regenSeconds: cfg.carrierLightbearer?.[w] ? 15 : 30 }));
  return cfg.damage.length || cfg.surgePotions > 0 ? [...groups, mine] : groups;
};

/**
 * Phase 38g: the drain specs a drain event wants (no seconds involved), from the drain models of its phases (`models`:
 * one per phase that drains apply to, in the event's order; null = unknown). Phase 38h-1: per phase the drain line's plan
 * (teamSpecs.ts `bestDrainPlan`: the fewest specs reaching the floor at the threshold, then the highest P(floor), each
 * spec rolled at the Defence the earlier ones leave, in the plan's order) within what the event has:
 * - **Team**: the kit's carriers (`cfg.carriers`): each weapon at most its carriers × their specs (2 for a 50% spec), at
 *   most that many carriers in all; exactly the plan's specs (a carrier may make fewer than 2). Floor out of reach at
 *   the threshold (the user: "cap at what helps"): the plan's fewest specs reaching d* = the lowest Defence the kit
 *   reaches at the threshold. Eye of Ayak: the fewest of its carriers reaching P(magic def 0) ≥ threshold, else all of them.
 * - **Solo**: your weapons, at most MAX_FLOOR_SPECS (the drain line's Solo plan). Eye of Ayak: the fewest (≤ the specs
 *   asked for) reaching magic def 0 at the threshold, else all asked for.
 * A phase already at the floor (magic def ≤ 0) wants none. A later phase of the event that the specs wanted so far (the
 * weapons that can hit it) already take to the floor at the threshold (`defenceOutcome`) adds none (AG: the shield's
 * Tonalztics ×4 also floor the Grounded phase); otherwise per weapon the most of the two.
 */
const WANTED_MEMO = new WeakMap<DrainModel, Map<string, SpecCounts>>();

export const eventWantedCounts = (
  cfg: Pick<SpecBudgetConfig, 'drain' | 'solo' | 'carriers'>,
  models: (DrainModel | null)[],
  threshold = DEFAULT_FLOOR_THRESHOLD,
  /** Phase 38h-2: at most this many specs (teamSpecs.ts `DrainCap`; the plans within less; undefined = no cap). */
  cap?: DrainCap,
): SpecCounts => {
  const out: SpecCounts = {};
  const more = (w: PlannerWeapon, n: number) => { if (n > (out[w] ?? 0)) out[w] = n; };
  const key = JSON.stringify([cfg.drain, cfg.drain === 'solo' ? cfg.solo : cfg.carriers, threshold, cap ?? null]);
  models.forEach((m) => {
    if (!m) return;
    let memo = WANTED_MEMO.get(m);
    if (!memo) {
      memo = new Map();
      WANTED_MEMO.set(m, memo);
    }
    let one = memo.get(key);
    if (!one) {
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      one = phaseWantedCounts(cfg, m, threshold, cap);
      memo.set(key, one);
    }
    // phase 38h-1: the specs so far already floor this phase (Defence; Eye of Ayak counted on its own)
    const defSoFar = attemptsFromCounts(m, out).filter((w): w is DefenceDrainWeapon => w !== 'ayak');
    const floored = m.def <= m.floor || (defSoFar.length > 0 && defenceOutcome(m, defSoFar, threshold).pFloor >= threshold);
    (Object.keys(one) as PlannerWeapon[]).forEach((w) => {
      if (w !== 'ayak' && floored) return;
      more(w, one![w] ?? 0);
    });
  });
  return out;
};

/** {@link eventWantedCounts} of one phase (memoised per drain model object: the kits cache them). */

const phaseWantedCounts = (
  cfg: Pick<SpecBudgetConfig, 'drain' | 'solo' | 'carriers'>,
  m: DrainModel,
  threshold: number,
  cap?: DrainCap,
): SpecCounts => {
  const out: SpecCounts = {};
  const more = (w: PlannerWeapon, n: number) => { if (n > (out[w] ?? 0)) out[w] = n; };
  const kit = cfg.drain === 'team' ? (cfg.carriers ?? {}) : {};
  const perCarrier = (w: PlannerWeapon) => specAttempts(SPEC_MAX_ENERGY, SPEC_WEAPONS[w].energy);
  if (m.def > m.floor) {
    const plan = kitDrainPlan(m, cfg.drain === 'team'
      ? { drain: 'team', carriers: kit }
      : { drain: 'solo', weapons: DEFENCE_DRAIN_ORDER.filter((w) => (cfg.solo?.[w] ?? 0) > 0) }, threshold, cap);
    if (plan) DEFENCE_DRAIN_ORDER.forEach((w) => more(w, plan.counts[w] ?? 0));
  }
  if (cfg.drain === 'team') {
    const ayakKit = Math.floor(kit.ayak ?? 0);
    if (ayakKit > 0 && m.canHit.ayak && m.magicDef > 0) {
      let n = ayakKit;
      for (let k = 1; k <= ayakKit; k++) {
        if (ayakOutcome(m, k * perCarrier('ayak'), threshold).pZero >= threshold) {
          n = k;
          break;
        }
      }
      more('ayak', n * perCarrier('ayak'));
    }
  } else {
    const asked = Math.floor(cfg.solo?.ayak ?? 0);
    if (asked > 0 && m.canHit.ayak && m.magicDef > 0) more('ayak', ayakSpecsToThreshold(m, asked, threshold));
  }
  return out;
};

/** Phase 38h-2: total specs of a count set. */
const countsSum = (c: SpecCounts | undefined): number => Object.values(c ?? {}).reduce((t: number, n) => t + (n ?? 0), 0);

/**
 * Phase 38h-2 (review): the outcomes of a drain on one phase: each Defence the specs can leave (sent in the order that
 * lands most often, each at the Defence the earlier ones leave: teamSpecs.ts `orderedDistribution`) with its chance, and
 * the Eye of Ayak drain (its ranked drain: magic def 0 at the threshold, else the expected drain). No specs: the
 * undrained Defence. Review 38h-2 (N2): Eye of Ayak is not averaged over its outcomes: its drain is a sum of damage rolls
 * with up to magic-defence + 1 values (Ocellus P3: 201), so the outcomes would multiply the DPS evaluations per option by
 * that much; its value is at the ranked drain (the expected one below the threshold), unverified as an approximation.
 */
export const drainOutcomeStates = (m: DrainModel, counts: SpecCounts, threshold = DEFAULT_FLOOR_THRESHOLD): { p: number, def: number, ayak: number }[] => {
  const att = attemptsFromCounts(m, counts);
  const def = att.filter((w): w is DefenceDrainWeapon => w !== 'ayak');
  const n = att.length - def.length;
  const ayak = n > 0 && m.canHit.ayak && m.magicDef > 0 ? ayakOutcome(m, n, threshold).rankedDrain : 0;
  if (!def.length || m.def <= m.floor) return [{ p: 1, def: m.def, ayak }];
  const steps = defenceOutcome(m, def, threshold).steps ?? [];
  return orderedDistribution(m, steps).filter((x) => x.p > 0).map((x) => ({ p: x.p, def: x.def, ayak }));
};

const OPTIONS_MEMO_MAX = 20000;
/** Phase 38h-2: ids of drain models by content (the option memo's key; kits build equal models as new objects). */
const MODEL_IDS = new WeakMap<DrainModel, number>();
const MODEL_TEXT_IDS = new Map<string, number>();
let modelCount = 0;
const modelId = (m: DrainModel | null): number => {
  if (!m) return 0;
  let id = MODEL_IDS.get(m);
  if (id === undefined) {
    const text = JSON.stringify(m);
    id = MODEL_TEXT_IDS.get(text);
    if (id === undefined) {
      if (MODEL_TEXT_IDS.size >= OPTIONS_MEMO_MAX) MODEL_TEXT_IDS.clear();
      modelCount += 1;
      id = modelCount;
      MODEL_TEXT_IDS.set(text, id);
    }
    MODEL_IDS.set(m, id);
  }
  return id;
};
const OPTIONS_MEMO = new Map<string, SpecCounts[]>();
const countsKey = (c: SpecCounts) => JSON.stringify(Object.keys(c).sort().map((w) => [w, c[w as PlannerWeapon]]));

/**
 * Phase 38h-2: the drain plans a drain event may make (without option 0, "none"), from the drain models of its phases
 * (`models`, in order) and the weapons that can spend on it (`weapons`): the drain line's plan within the kit / your
 * weapons ({@link eventWantedCounts}) and that plan cut short after each spec in its send order (a partial drain, worth
 * its ranked Defence); the line's plan within every cap (what is left when the bars can't pay the plan: re-planned over
 * every weapon left, not cut; review 38h-1), the caps being per weapon in Team (each weapon its carriers' bars, up to
 * their first round) and in all in Solo (one bar, up to the line's 8); Eye of Ayak every count up to the line's (partial
 * counts count). Dropped (exact): an option leaving every phase where none does, or where another one with no more of
 * any weapon does (the same Defence / magic defence: the same DPS and value). Not offered: a partial drain ranked at the
 * floor without reaching it at the threshold (1 Tonalztics spec on Ocellus P1: 73%, ranked at the floor as the reachable
 * Defence nearest to the expected) — it would be worth a full drain. Order: the line's plan, then more specs first (on
 * equal HP the DP keeps the earlier option, the surer drain). Memoised (drain models by content).
 */
export const eventOptions = (
  cfg: Pick<SpecBudgetConfig, 'drain' | 'solo' | 'carriers'>,
  models: (DrainModel | null)[],
  weapons: PlannerWeapon[],
  threshold = DEFAULT_FLOOR_THRESHOLD,
): SpecCounts[] => {
  const memoKey = JSON.stringify([models.map(modelId), cfg.drain, cfg.drain === 'solo' ? cfg.solo : cfg.carriers, [...weapons].sort(), threshold]);
  const hit = OPTIONS_MEMO.get(memoKey);
  if (hit) return hit;
  const can = new Set(weapons);
  const clean = (c: SpecCounts): SpecCounts => Object.fromEntries(Object.entries(c)
    .filter(([w, n]) => (n ?? 0) > 0 && can.has(w as PlannerWeapon))) as SpecCounts;
  const perCarrier = (w: PlannerWeapon) => specAttempts(SPEC_MAX_ENERGY, SPEC_WEAPONS[w].energy);
  const wanted = clean(eventWantedCounts(cfg, models, threshold));
  const capOf = (w: PlannerWeapon) => (cfg.drain === 'team'
    ? Math.floor(cfg.carriers?.[w] ?? 0) * perCarrier(w)
    : Math.min(MAX_FLOOR_SPECS, Math.floor(cfg.solo?.[w] ?? 0)));
  // Team: per weapon (each weapon its own carriers' bars); Solo: in all (one bar pays every weapon)
  let caps: DrainCap[] = [{}];
  if (cfg.drain === 'solo') caps = Array.from({ length: MAX_FLOOR_SPECS + 1 }, (_, n) => ({ total: n }));
  else {
    DEFENCE_DRAIN_ORDER.filter((w) => can.has(w) && capOf(w) > 0).forEach((w) => {
      caps = caps.flatMap((c) => Array.from({ length: capOf(w) + 1 }, (_, n) => ({ ...c, [w]: n })));
    });
  }
  // the drain's outcomes on every phase (Defence distribution, magic defence drained): equal = the same value
  const live = models.filter((m): m is DrainModel => !!m);
  const stateOf = (c: SpecCounts) => live.map((m) => drainOutcomeStates(m, c, threshold)
    .map((x) => `${x.def}:${x.ayak}:${x.p.toFixed(12)}`).join(',')).join('#');
  const ayakMax = wanted.ayak ?? 0;
  const byState = new Map<string, SpecCounts[]>();
  const seen = new Set<string>();
  // the plans: the line's within the kit and within every cap; each plan cut short in its send order (a partial drain)
  const plansSeen = new Map<string, SpecCounts>();
  [wanted, ...caps.map((c) => clean(eventWantedCounts(cfg, models, threshold, c)))].forEach((d0) => {
    const d = { ...d0 };
    delete d.ayak;
    plansSeen.set(countsKey(d), d);
  });
  const candidates = new Map<string, SpecCounts>();
  const lineKey = (() => {
    const d = { ...wanted };
    delete d.ayak;
    return countsKey(d);
  })();
  plansSeen.forEach((d) => {
    const isLine = countsKey(d) === lineKey;
    const m = live.find((x) => x.def > x.floor && attemptsFromCounts(x, d).some((w) => w !== 'ayak'));
    const att = m ? attemptsFromCounts(m, d).filter((w): w is DefenceDrainWeapon => w !== 'ayak') : [];
    const steps = m && att.length ? defenceOutcome(m, att, threshold).steps ?? [] : [];
    const seq = steps.flatMap((st) => Array(st.count).fill(st.weapon) as DefenceDrainWeapon[]);
    // weapons the order doesn't list (they can't hit the phase the order is for: AG's maul on the shield) come last
    (Object.keys(d) as PlannerWeapon[]).forEach((w) => {
      const extra = (d[w] ?? 0) - seq.filter((x) => x === w).length;
      for (let k = 0; k < extra; k++) seq.push(w as DefenceDrainWeapon);
    });
    // speed: only the line's plan is cut short (the re-plans count whole)
    const cur: SpecCounts = {};
    seq.forEach((w, i) => {
      cur[w] = (cur[w] ?? 0) + 1;
      if (isLine || i === seq.length - 1) candidates.set(countsKey(cur), { ...cur });
    });
  });
  candidates.forEach((x) => {
    for (let n = 0; n <= ayakMax; n++) {
      const y = n ? { ...x, ayak: n } : x;
      const k = countsKey(y);
      if (seen.has(k)) continue;
      seen.add(k);
      const s = stateOf(y);
      byState.set(s, [...(byState.get(s) ?? []), y]);
    }
  });
  const none = stateOf({});
  const fewer = (a: SpecCounts, b: SpecCounts) => (Object.keys({ ...a, ...b }) as PlannerWeapon[])
    .every((w) => (a[w] ?? 0) <= (b[w] ?? 0));
  const rest: SpecCounts[] = [];
  byState.forEach((xs, s) => {
    if (s === none) return;
    xs.forEach((c, i) => {
      if (!xs.some((o, j) => j !== i && fewer(o, c) && (countsKey(o) !== countsKey(c)))) rest.push(c);
    });
  });
  const wk = countsKey(wanted);
  const out = [wanted, ...rest.filter((c) => countsKey(c) !== wk)
    .sort((x, y) => (countsSum(y) - countsSum(x)) || countsKey(x).localeCompare(countsKey(y)))]
    .filter((c) => countsSum(c) > 0);
  if (OPTIONS_MEMO.size >= OPTIONS_MEMO_MAX) OPTIONS_MEMO.clear();
  OPTIONS_MEMO.set(memoKey, out);
  return out;
};

export interface BudgetContext {
  drain: DrainStateId;
  /** The model's pass over the encounter (`encounterPass` with these assumptions). */
  pass: (kit: RaidKit, drain: DrainStateId, fightSeconds: number) => PhaseTime[];
  /** The undrained pass (rows, times). */
  first: PhaseTime[];
  fightSeconds: number;
  /** Clock (wall seconds) at the encounter's start: 0, or the raid clock when energy carries. */
  clock0: number;
  /** Energy at the start (carry); undefined = every pool at 100%. */
  startState?: PoolState;
  /** Phase 38j: the encounter's measured room seconds (`rowWallsOn`); undefined = the fight wall. */
  roomSeconds?: number;
  /** A surge dose right after the encounter's first specs. */
  surge: boolean;
  /** Phase 38b: Liquid adrenaline seconds from the encounter's start (spec costs halved); undefined / 0 = none. */
  adrenalineSeconds?: number;
  /** Tests: the allocation problem the DP solves (pruned options) and the unpruned one. */
  onProblem?: (pruned: AllocationProblem, full: AllocationProblem) => void;
}

export interface BudgetedEncounter {
  phases: PhaseTime[];
  seconds: number;
  plan: EncounterSpecPlan;
}

const sum = (rows: PhaseTime[]) => rows.reduce((t, r) => t + r.seconds, 0);

/** Applies an alloc's damage specs to a pass's rows (net damage at each row's DPS). */
const withDamage = (
  kit: RaidKit,
  rows: PhaseTime[],
  damage: EncounterAlloc['damage'],
  cfg: SpecBudgetConfig,
  queryOf: (r: PhaseTime) => PhaseQuery,
  mult: number,
): PhaseTime[] => rows.map((r) => {
  const counts = damage[r.key];
  if (!counts || !Object.values(counts).some((n) => (n ?? 0) > 0)) return r;
  const hits = kit.specHits ? kit.specHits(queryOf(r)) : ALL_TRUE;
  const choices = damageChoices(kit, queryOf(r), r, cfg.damage, hits, mult, cfg.filler);
  const used = choices.filter((c) => (counts[c.weapon] ?? 0) > 0).map((c) => ({ ...c, count: counts[c.weapon]! }));
  if (!used.length) return r;
  const o: RowOutcome = { seconds: r.seconds, damage: r.damage, damageSpecs: used };
  const seconds = rowSecondsAfter(o, Object.fromEntries(used.map((c) => [c.weapon, c.count])));
  return {
    ...r,
    seconds,
    damageSpecs: used.map(({
      weapon, label, count, expected, ticks, net, saved,
    }) => ({
      weapon, label, count, expected, ticks, net, saved,
    })),
  };
});

/** The rows of a pass with every event at its counts (the fixed path and the final pass of the allocation). */
const assignedPass = (
  kit: RaidKit,
  ctx: Pick<BudgetContext, 'pass' | 'drain' | 'fightSeconds'>,
  alloc: Pick<EncounterAlloc, 'events' | 'rowEvent'>,
): { rows: PhaseTime[], queryOf: (r: PhaseTime) => PhaseQuery } => {
  const rowEvent = new Map(Object.entries(alloc.rowEvent));
  const npcEvent = new Map<string, number>();
  alloc.events.forEach((e, i) => { if (!npcEvent.has(e.npc)) npcEvent.set(e.npc, i); });
  const assign = alloc.events.map((e) => e.counts);
  const k = assignedKit(kit, rowEvent, npcEvent, assign);
  const rows = ctx.pass(k, ctx.drain, ctx.fightSeconds);
  const hpLeft = rowHpLeft(rows);
  const queryOf = (r: PhaseTime): PhaseQuery => {
    let e = rowEvent.get(r.key);
    if (e === undefined) e = npcEvent.get(targetNpc(r.targetKey));
    return {
      targetKey: r.targetKey,
      phase: r.phase,
      drain: ctx.drain,
      fightSeconds: ctx.fightSeconds,
      rowKey: r.key,
      specs: { counts: (e !== undefined ? assign[e] : undefined) ?? {} },
      ...(hpLeft.has(r.key) ? { hpLeft: hpLeft.get(r.key) } : {}),
    };
  };
  return { rows, queryOf };
};

/** Phase 36: an encounter replayed with a fixed spec plan (the planner's optimiser: `RaidTimeAssumptions.fixedAlloc`). */
export const fixedEncounter = (
  kit: RaidKit,
  a: RaidTimeAssumptions,
  cfg: SpecBudgetConfig,
  alloc: EncounterAlloc,
  ctx: Pick<BudgetContext, 'pass' | 'drain' | 'fightSeconds'>,
): { phases: PhaseTime[], seconds: number } => {
  const { rows, queryOf } = assignedPass(kit, ctx, alloc);
  const phases = withDamage(kit, rows, alloc.damage, cfg, queryOf, a.dpsMultiplier ?? 1);
  return { phases, seconds: sum(phases) };
};

/**
 * Phase 38h-2 (ROADMAP 38h): a drain's value in boss HP, from a pass without it (`before`) and with it (`after`), rows
 * matched by key: a row's damage × (1 − DPS before ÷ DPS after) = H × g ÷ (1 + g) (H = the damage of the row, g = the
 * DPS gain at the drained Defence; the fight length cancels), plus the damage a row no longer has to deal (Ocellus P3
 * after the extra damage P2 carries over). Fixed-length rows (`fixedWall`: Ocellus P2) count only through the rows they
 * shorten. A row with no DPS before counts its whole damage once the drain gives it some.
 */
export const drainHpValue = (before: PhaseTime[], after: PhaseTime[]): number => {
  const by = new Map(after.map((r) => [r.key, r]));
  return before.reduce((t, r0) => {
    const r1 = by.get(r0.key);
    if (!r1 || r0.fixedWall || !(r0.damage > 0) || !(r1.dps > 0)) return t;
    if (!(r0.dps > 0)) return t + r0.damage;
    return t + r0.damage - r1.damage * (r0.dps / r1.dps);
  }, 0);
};

/** Review: re-plans of an encounter on the drained clock (`budgetedEncounter`). */
export const CLOCK_ROUNDS = 2;

/**
 * Phase 36, phase 38g, phase 38h-2: the encounter under the budget (see the module comment) and its phases. Each drain
 * event offers its drain plans ({@link eventOptions}: the line's plan, re-plans within less, partial drains), each worth
 * its HP ({@link drainHpValue}: the pass with it vs without it, the other events at their line plans); the DP
 * (specBudget.ts `allocateBudget`, in HP, drains kept within 10% of damage specs) picks per event the plan and places
 * your damage specs and the surge dose (Team: the drains first over the carriers' bars, then your bar). The Defence the
 * chosen specs reach applies from the event on (`attemptsFromCounts`). No choice rests on seconds.
 */
export const budgetedEncounter = (
  kit: RaidKit,
  a: RaidTimeAssumptions,
  cfg: SpecBudgetConfig,
  ctx: BudgetContext,
): BudgetedEncounter => {
  const mult = a.dpsMultiplier ?? 1;
  const rows0 = ctx.first;
  const { events: evs, rowEvent } = drainEventsOf(rows0);
  // clock: the wall-clock start / end of each row, from a pass's phases in order (a phase of the pass that isn't one of
  // the rows, e.g. a DPS-dependent one, still takes time; a row missing from the pass takes none)
  const clockOf = (pass: PhaseTime[]): BudgetRow[] => {
    const at = new Map<string, { start: number, end: number }>();
    let t = ctx.clock0;
    const walls = rowWallsOn(pass, a, ctx.roomSeconds);
    pass.forEach((r, i) => {
      const w = walls[i];
      const cur = at.get(r.key);
      at.set(r.key, { start: cur ? cur.start : t, end: t + w });
      t += w;
    });
    let last = ctx.clock0;
    return rows0.map((r, i) => {
      const x = at.get(r.key) ?? { start: last, end: last };
      last = x.end;
      return {
        key: r.key, event: rowEvent[i], start: x.start, end: x.end,
      };
    });
  };
  const groups = budgetGroups(cfg);
  const start = ctx.startState ?? fullPools(groups);
  const noneQuery = (r: PhaseTime): PhaseQuery => ({
    targetKey: r.targetKey, phase: r.phase, drain: 'none', fightSeconds: ctx.fightSeconds, rowKey: r.key,
  });
  const hitsOf = rows0.map((r) => (kit.specHits ? kit.specHits(noneQuery(r)) : ALL_TRUE));
  // phase 38b: Liquid adrenaline from the encounter's start; Death Charge on the rows' kills
  const adrenaline = ctx.adrenalineSeconds && ctx.adrenalineSeconds > 0 ? ctx.adrenalineSeconds : 0;
  const halfCost = adrenaline > 0 ? { halfCostUntil: ctx.clock0 + adrenaline } : {};
  const kills = cfg.deathCharge ? rowKills(rows0) : rows0.map(() => 0);
  const drainWeapons: PlannerWeapon[] = (cfg.drain === 'solo'
    ? (Object.keys(cfg.solo ?? {}) as PlannerWeapon[]).filter((w) => (cfg.solo![w] ?? 0) > 0)
    : (Object.keys(cfg.carriers ?? {}) as PlannerWeapon[]).filter((w) => (cfg.carriers![w] ?? 0) > 0))
    .filter((w) => w in SPEC_WEAPONS);
  const threshold = cfg.threshold ?? DEFAULT_FLOOR_THRESHOLD;
  const perCarrier = (w: PlannerWeapon) => specAttempts(SPEC_MAX_ENERGY, SPEC_WEAPONS[w].energy);
  // phase 38h-2: per event the drain plans it may make (option 0 = none, then the line's plan within the kit, then the
  // plans within less: what is left when the bars can't pay it, partial Eye of Ayak counts), each worth its HP value
  const plans = evs.map((e) => {
    const drained = e.rows.filter((i) => !targetNoDrains(rows0[i].targetKey));
    const spendRow = new Map<PlannerWeapon, number>();
    drainWeapons.forEach((w) => {
      const r = drained.find((i) => hitsOf[i][w] !== false);
      if (r !== undefined) spendRow.set(w, r);
    });
    const options: SpecCounts[] = [{}];
    if (drained.length && spendRow.size) {
      if (kit.drainModel) {
        options.push(...eventOptions(cfg, drained.map((i) => kit.drainModel!(noneQuery(rows0[i]))), Array.from(spendRow.keys()), threshold));
      } else {
        // a kit without drain models (toys): Team every carrier's first-round specs, Solo as many as the bar pays, and
        // every smaller count (more specs first)
        let grid: SpecCounts[] = [{}];
        drainWeapons.filter((w) => spendRow.has(w)).forEach((w) => {
          const n0 = cfg.drain === 'team'
            ? Math.floor(cfg.carriers![w] ?? 0) * perCarrier(w)
            : Math.min(Math.floor(cfg.solo![w] ?? 0), MAX_FLOOR_SPECS);
          grid = grid.flatMap((c) => Array.from({ length: n0 + 1 }, (_, n) => (n ? { ...c, [w]: n0 - n + 1 } : c)));
        });
        options.push(...grid.filter((c) => countsSum(c) > 0).sort((x, y) => countsSum(y) - countsSum(x)));
      }
    }
    return { spendRow, options };
  });
  const optionOf = (ei: number, counts: SpecCounts, value = 0): EventOption => ({
    counts: counts as Record<string, number>,
    spends: Object.entries(counts).filter(([, n]) => (n ?? 0) > 0).map(([w, n]): OptionSpend => ({
      group: cfg.drain === 'solo' ? MY_POOL : w, specs: n!, cost: SPEC_WEAPONS[w as PlannerWeapon].energy, row: plans[ei].spendRow.get(w as PlannerWeapon)!,
    })),
    value,
  });
  const zeroOutcome = (): RowOutcome => ({ seconds: 0, damage: 0, damageSpecs: [] });
  const rowEventMap = new Map(rows0.map((r, i) => [r.key, rowEvent[i]]));
  const npcEvent = new Map<string, number>();
  evs.forEach((e, i) => { if (!npcEvent.has(e.npc)) npcEvent.set(e.npc, i); });
  const allocOf = (counts: SpecCounts[]): Pick<EncounterAlloc, 'events' | 'rowEvent'> => ({
    events: evs.map((e, i) => ({
      npc: e.npc, ...(e.reset ? { reset: e.reset } : {}), firstRowKey: rows0[e.rows[0]].key, counts: counts[i],
    })),
    rowEvent: Object.fromEntries(rows0.map((r, i) => [r.key, rowEvent[i]])),
  });
  // the row outcomes of a pass for the rows of event `only` (a phase of the pass that isn't a row: on the last row of
  // its event)
  const outcomesOf = (passRows: PhaseTime[], queryOf: (r: PhaseTime) => PhaseQuery, only: number): Map<number, RowOutcome> => {
    const outcomes = new Map<number, RowOutcome>();
    passRows.forEach((r) => {
      let idx = rows0.findIndex((x) => x.key === r.key);
      let extra = false;
      if (idx < 0) {
        const ev = rowEventMap.get(r.key) ?? npcEvent.get(targetNpc(r.targetKey));
        if (ev === undefined) return;
        idx = evs[ev].rows[evs[ev].rows.length - 1];
        extra = true;
      }
      if (rowEvent[idx] !== only) return;
      const prev = outcomes.get(idx);
      const damageSpecs = extra ? [] : damageChoices(kit, queryOf(r), r, cfg.damage, hitsOf[idx], mult, cfg.filler);
      outcomes.set(idx, prev
        ? { seconds: prev.seconds + r.seconds, damage: prev.damage, damageSpecs: prev.damageSpecs }
        : { seconds: r.seconds, damage: r.damage, damageSpecs });
    });
    return outcomes;
  };
  // phase 38h-2 (review): an option's HP value averaged over the drain's outcomes (`drainOutcomeStates`): per row of the
  // event, Σ P(Defence) × damage × (1 − DPS without ÷ DPS at that Defence) (= H × g ÷ (1 + g) per outcome); a fixed-length
  // row (Ocellus P2) the extra damage it deals at the expected DPS × its carry-over (what comes off P3)
  const expectedValue = (noneRows: PhaseTime[], ei: number, c: SpecCounts): number => noneRows.reduce((t, r0) => {
    const ev = rowEventMap.get(r0.key) ?? npcEvent.get(targetNpc(r0.targetKey));
    if (ev !== ei || targetNoDrains(r0.targetKey) || !(r0.damage > 0) || !(r0.dps > 0)) return t;
    const m = kit.drainModel!({ ...noneQuery(r0) });
    if (!m) return t;
    let dps = 0;
    let gain = 0;
    drainOutcomeStates(m, c, threshold).forEach((x) => {
      const d = x.def >= m.def && !(x.ayak > 0) ? r0.dps : (kit.best({
        ...noneQuery(r0), drain: ctx.drain, defence: { undrainedDef: m.def, def: x.def, ayak: x.ayak },
      })?.dps ?? 0);
      dps += x.p * d;
      if (d > 0) gain += x.p * (1 - r0.dps / d);
    });
    if (r0.fixedWall) return t + (dps / r0.dps - 1) * r0.damage * (r0.carryOver ?? 0);
    return t + r0.damage * gain;
  }, 0);
  // phase 38h-2: each option's HP value (`drainHpValue`: the pass with the event at the option vs at none, the other
  // events at their line plans) and its rows (seconds, damage specs at the option's Defence); no clock involved
  const base = plans.map((pl) => pl.options[1] ?? {});
  const values: { value: number, rows: Map<number, RowOutcome> }[][] = plans.map((pl, ei) => {
    const at = (c: SpecCounts) => assignedPass(kit, ctx, allocOf(base.map((b, j) => (j === ei ? c : b))));
    const none = at({});
    return pl.options.map((c, oi) => {
      const pass = oi === 0 ? none : at(c);
      let value = 0;
      if (oi > 0) value = kit.drainModel ? expectedValue(none.rows, ei, c) : drainHpValue(none.rows, pass.rows);
      return { value, rows: outcomesOf(pass.rows, pass.queryOf, ei) };
    });
  });
  // phase 38h-2: no option pruning (`prunedOptions`): an option's HP grows with its specs, so dominance almost never
  // drops one and the pairwise check cost more than the DP it saved; the DP is exact over every option
  const kept = plans.map((pl) => pl.options.map((_, oi) => oi));
  const solve = (clockRows: BudgetRow[]): BudgetedEncounter & { problem: AllocationProblem, result: AllocationResult } => {
    const dc = cfg.deathCharge ? withDeathCharge(clockRows, kills, cfg.deathCharge.share, ctx.clock0) : { rows: clockRows };
    const { rows } = dc;
    const full: AllocationProblem = {
      rows,
      events: evs.map((e, ei) => ({ firstRow: e.rows[0], options: plans[ei].options.map((c, oi) => optionOf(ei, c, values[ei][oi].value)) })),
      groups,
      start,
      damageGroup: MY_POOL,
      rowOutcome: (i, o) => values[rowEvent[i]][o]?.rows.get(i) ?? zeroOutcome(),
      surge: ctx.surge,
      keepEnd: cfg.carry,
      ...halfCost,
    };
    const problem: AllocationProblem = {
      ...full,
      events: full.events.map((e, ei) => ({ ...e, options: kept[ei].map((oi) => e.options[oi]) })),
      rowOutcome: (i, o) => values[rowEvent[i]][kept[rowEvent[i]][o]]?.rows.get(i) ?? zeroOutcome(),
    };
    ctx.onProblem?.(problem, full);
    let result: AllocationResult;
    if (cfg.drain === 'team') {
      // Team (speed): the carriers' bars pay only drains and yours only damage specs, so the drains are chosen first
      // (their HP; every carrier bar), then your damage specs and the dose at the chosen drains' Defence (a damage
      // spec's net changes a little with the drain's DPS: not weighed in the drain choice)
      const drains = allocateBudget({ ...problem, rowOutcome: (i, o) => ({ ...problem.rowOutcome(i, o), damageSpecs: [] }), surge: false });
      const one = allocateBudget({
        ...problem,
        events: problem.events.map((e, ei) => ({ ...e, options: [e.options[drains.options[ei]]] })),
        rowOutcome: (i) => problem.rowOutcome(i, drains.options[rowEvent[i]]),
      });
      result = { ...one, options: drains.options, hp: one.hp };
    } else result = allocateBudget(problem);
    const counts = evs.map((_, ei) => plans[ei].options[kept[ei][result.options[ei]]]);
    const fixed = allocOf(counts);
    const { rows: passRows, queryOf } = assignedPass(kit, ctx, fixed);
    const alloc: EncounterAlloc = {
      ...fixed,
      damage: Object.fromEntries(result.rows.map((d, i) => [rows0[i].key, d.damage as Partial<Record<DamageSpecWeapon, number>>])
        .filter(([, d]) => Object.values(d as Record<string, number>).some((n) => n > 0))),
      surge: ctx.surge,
    };
    const sim = simulateBudget(problem, { options: result.options, damage: result.rows.map((r) => r.damage), drinkRow: drinkRowOf(result) });
    const specsUsed = counts.reduce((tt, c) => tt + countsSum(c), 0)
      + result.rows.reduce((tt, r) => tt + Object.values(r.damage).reduce((x, n) => x + n, 0), 0);
    const phases = withDamage(kit, passRows, alloc.damage, cfg, queryOf, mult);
    return {
      phases,
      seconds: sum(phases),
      problem,
      result,
      plan: {
        ...alloc,
        specs: specsUsed,
        noSpecSeconds: sum(rows0),
        start,
        end: sim.feasible ? sim.end : result.end,
        hp: result.hp,
        ...(dc.plan ? { deathCharge: dc.plan } : {}),
        ...(adrenaline > 0 ? { adrenalineSeconds: adrenaline } : {}),
      },
    };
  };
  // review: regen runs on the clock of the drained fight (shorter than the undrained pass): the first plan on the
  // undrained clock, then re-planned on the clock of the previous plan's phases (drains and damage specs included) until
  // the plan stops changing (at most CLOCK_ROUNDS re-plans)
  const planKey = (r: BudgetedEncounter) => JSON.stringify([r.plan.events.map((e) => e.counts), r.plan.damage, r.plan.surge]);
  let out = solve(clockOf(rows0));
  for (let round = 0; round < CLOCK_ROUNDS; round++) {
    const next = solve(clockOf(out.phases));
    const same = planKey(next) === planKey(out);
    out = next;
    if (same) break;
  }
  // phase 38h-2: per event its drain's HP value; a drain your bar pays (Solo) is a close call when the damage specs its
  // energy would buy instead are worth at least (1 − DRAIN_CLOSE_CALL) × its value (the drain is kept up to 1 + that)
  const { problem, result } = out;
  const events = out.plan.events.map((ev, ei) => {
    const oi = result.options[ei];
    const option = problem.events[ei].options[oi];
    const value = option?.value ?? 0;
    if (!oi || !(value > 0)) return ev;
    let closeCall = false;
    if (option.spends.some((sp) => sp.group === MY_POOL && sp.specs > 0)) {
      const alt = allocateBudget({
        ...problem, events: problem.events.map((e, j) => (j === ei ? { ...e, options: [e.options[0]] } : e)),
      });
      const instead = alt.hp - (result.hp - value);
      closeCall = Number.isFinite(instead) && instead >= (1 - DRAIN_CLOSE_CALL) * value - 1e-9;
    }
    return { ...ev, hp: value, ...(closeCall ? { closeCall: true } : {}) };
  });
  return { phases: out.phases, seconds: out.seconds, plan: { ...out.plan, events } };
};

export { CARRY_SPEC_ENERGY };
