import type {
  DrainStateId, SpecCounts,
} from '@/lib/fracturedArchive/bestSetup';
import { findTarget } from '@/lib/fracturedArchive/bestSetup';
import type {
  PhaseQuery, PhaseTime, RaidKit, RaidTimeAssumptions,
} from '@/lib/fracturedArchive/raidTime';
import { PlannerWeapon, SPEC_WEAPONS } from '@/lib/fracturedArchive/specs';
import {
  bestDamageVariant, DAMAGE_SPEC_WEAPONS, DamageSpecProfile, DamageSpecWeapon, netSpecDamage, specSecondsSaved,
} from '@/lib/fracturedArchive/damageSpecs';
import {
  ADRENALINE_COST_FACTOR, allocateBudget, AllocationProblem, BudgetEvent, BudgetRow, CARRY_SPEC_ENERGY, DamageChoice,
  DEATH_CHARGE_ENERGY, deathChargeSchedule, drinkRowOf, EventOption, MY_POOL, OptionSpend, PoolGroup, PoolState,
  prunedOptions, RowOutcome, rowSecondsAfter, simulateBudget, SPEC_MAX_ENERGY, SURGE_DOSE_ENERGY,
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
 * - **Options** of an event = spec counts per drain weapon (Solo: the weapons you carry, Eye of Ayak up to the specs
 *   asked for; Team: the carriers' weapons), each weapon's specs made at the first phase of the event it can hit
 *   (`RaidKit.specHits`). A phase's drains = the event's specs of the weapons that can hit it (bestSetup.ts
 *   `attemptsFromCounts`), so a phase only depends on its own event's option.
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
}

export interface EncounterAllocEvent {
  npc: string;
  reset?: string;
  firstRowKey: string;
  counts: SpecCounts;
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
    if (q.drain === 'none') return q;
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
    });
  });
  return out;
};

const wallOf = (seconds: number, a: Pick<RaidTimeAssumptions, 'dpsMultiplier' | 'partySize'>): number => (Number.isFinite(seconds) && seconds > 0
  ? seconds * (a.dpsMultiplier ?? 1) / Math.max(1, a.partySize)
  : 0);

/** Wall-clock seconds of an encounter (for the surge cooldown and the energy carry). */
export const encounterWallSeconds = (seconds: number, a: Pick<RaidTimeAssumptions, 'dpsMultiplier' | 'partySize'>): number => wallOf(seconds, a);

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

/** Every vector of counts with 0 ≤ counts[w] ≤ max[w] (and Σ cost ≤ joint when given), fewest specs first. */
export const countVectors = (max: [string, number, number][], joint?: number): Record<string, number>[] => {
  let out: { v: Record<string, number>, cost: number }[] = [{ v: {}, cost: 0 }];
  max.forEach(([w, m, c]) => {
    out = out.flatMap((x) => Array.from({ length: Math.max(0, m) + 1 }, (_, n) => ({ v: n ? { ...x.v, [w]: n } : x.v, cost: x.cost + n * c })))
      .filter((y) => joint === undefined || y.cost <= joint + 1e-9);
  });
  const total = (v: Record<string, number>) => Object.values(v).reduce((t, n) => t + n, 0);
  return out.map((x, i) => ({ v: x.v, i })).sort((a, b) => (total(a.v) - total(b.v)) || (a.i - b.i)).map((x) => x.v);
};

const specKeyOf = (c: Record<string, number>) => Object.entries(c).filter(([, n]) => n > 0).sort(([a], [b]) => a.localeCompare(b)).map(([w, n]) => `${w}${n}`)
  .join(',');

/**
 * The most options an event keeps after the exact dominance pruning (speed: Olm's seven events with 4-6 carriers kept
 * 30-70 each). Kept: option 0, the fastest option for every total spec count (so cheap plans stay available for later
 * events), then the fastest of the rest. The DP is exact over the kept options; with fewer options than this (every FA,
 * ToA and ToB encounter at the defaults) it is exact.
 */
export const MAX_EVENT_OPTIONS = 24;

/** {@link MAX_EVENT_OPTIONS}: `kept` (indices, option 0 first) cut to the cap. */
export const capOptions = (kept: number[], seconds: (oi: number) => number, specs: (oi: number) => number, cap = MAX_EVENT_OPTIONS): number[] => {
  if (kept.length <= cap) return kept;
  const out = new Set<number>([kept[0]]);
  const bySpecs = new Map<number, number>();
  kept.forEach((oi) => {
    const k = specs(oi);
    const cur = bySpecs.get(k);
    if (cur === undefined || seconds(oi) < seconds(cur) - 1e-9) bySpecs.set(k, oi);
  });
  Array.from(bySpecs.values()).forEach((oi) => { if (out.size < cap) out.add(oi); });
  kept.filter((oi) => !out.has(oi)).sort((a, b) => (seconds(a) - seconds(b)) || (specs(a) - specs(b)) || (a - b))
    .forEach((oi) => { if (out.size < cap) out.add(oi); });
  return kept.filter((oi) => out.has(oi));
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
  const choices = damageChoices(kit, queryOf(r), r, cfg.damage, hits, mult);
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

/** Review: re-plans of an encounter on the drained clock (`budgetedEncounter`). */
export const CLOCK_ROUNDS = 2;

/** Phase 36: the encounter's best spec plan under the budget (see the module comment) and its phases. */
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
    pass.forEach((r) => {
      const w = wallOf(r.seconds, a);
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
  const hitsOf = rows0.map((r) => (kit.specHits
    ? kit.specHits({
      targetKey: r.targetKey, phase: r.phase, drain: 'none', fightSeconds: ctx.fightSeconds, rowKey: r.key,
    })
    : ALL_TRUE));
  // phase 38b: Liquid adrenaline from the encounter's start; Death Charge on the rows' kills
  const adrenaline = ctx.adrenalineSeconds && ctx.adrenalineSeconds > 0 ? ctx.adrenalineSeconds : 0;
  const costFactor = adrenaline > 0 ? ADRENALINE_COST_FACTOR : 1;
  const halfCost = adrenaline > 0 ? { halfCostUntil: ctx.clock0 + adrenaline } : {};
  const kills = cfg.deathCharge ? rowKills(rows0) : rows0.map(() => 0);
  const drainWeapons: PlannerWeapon[] = (cfg.drain === 'solo'
    ? (Object.keys(cfg.solo ?? {}) as PlannerWeapon[]).filter((w) => (cfg.solo![w] ?? 0) > 0)
    : (Object.keys(cfg.carriers ?? {}) as PlannerWeapon[]).filter((w) => (cfg.carriers![w] ?? 0) > 0))
    .filter((w) => w in SPEC_WEAPONS);
  // options per event
  const events: BudgetEvent[] = evs.map((e) => {
    const none: EventOption = { counts: {}, spends: [] };
    const drained = e.rows.filter((i) => !targetNoDrains(rows0[i].targetKey));
    if (!drained.length || !drainWeapons.length) return { firstRow: e.rows[0], options: [none] };
    const spendRow = new Map<PlannerWeapon, number>();
    drainWeapons.forEach((w) => {
      const r = drained.find((i) => hitsOf[i][w] !== false);
      if (r !== undefined) spendRow.set(w, r);
    });
    // a weapon whose specs (as many as the event can pay, alone) change no phase's drains is left out: it can't hit them,
    // or their Defence / magic defence is already at the floor (drains only lower it towards the floor, so it changes
    // nothing with other weapons either)
    const dkOf = (r: number, counts: SpecCounts) => kit.drainKey!({
      targetKey: rows0[r].targetKey, phase: rows0[r].phase, drain: ctx.drain, fightSeconds: ctx.fightSeconds, rowKey: rows0[r].key, specs: { counts },
    });
    const usable = drainWeapons.filter((w) => spendRow.has(w)).filter((w) => !kit.drainKey
      || drained.some((r) => dkOf(r, { [w]: 8 }) !== dkOf(r, {})));
    if (!usable.length) return { firstRow: e.rows[0], options: [none] };
    const surgeBonus = cfg.surgePotions > 0 || ctx.surge ? SURGE_DOSE_ENERGY : 0;
    const maxes: [PlannerWeapon, number, number][] = usable.map((w) => {
      // phase 38b: with Liquid adrenaline a spend may cost half (the DP checks each row's actual cost)
      const cost = SPEC_WEAPONS[w].energy * costFactor;
      if (cfg.drain === 'solo') {
        // the bar is capped at 100% between rows, so a spend has at most 100% (+ a dose drunk right after one spec)
        const cap = Math.floor((SPEC_MAX_ENERGY + surgeBonus) / cost + 1e-9);
        return [w, Math.min(cap, Math.floor(cfg.solo![w] ?? 0)), cost];
      }
      const per = Math.floor(SPEC_MAX_ENERGY / cost + 1e-9);
      return [w, per * Math.floor(cfg.carriers![w] ?? 0), cost];
    });
    const joint = cfg.drain === 'solo'
      ? SPEC_MAX_ENERGY + surgeBonus * (usable.length ? 1 : 0)
      : undefined;
    const options = countVectors(maxes, joint).map((counts): EventOption => ({
      counts,
      spends: Object.entries(counts).map(([w, n]): OptionSpend => ({
        group: cfg.drain === 'solo' ? MY_POOL : w, specs: n, cost: SPEC_WEAPONS[w as PlannerWeapon].energy, row: spendRow.get(w as PlannerWeapon)!,
      })),
    }));
    return { firstRow: e.rows[0], options };
  });
  // row outcomes: one pass per (event, option), the other events without specs
  const rowEventMap = new Map(rows0.map((r, i) => [r.key, rowEvent[i]]));
  const npcEvent = new Map<string, number>();
  evs.forEach((e, i) => { if (!npcEvent.has(e.npc)) npcEvent.set(e.npc, i); });
  const passMemo = new Map<string, Map<number, RowOutcome>>();
  const outcomesOf = (ei: number, oi: number): Map<number, RowOutcome> => {
    // options with the same specs on every phase of the event (a weapon that can't hit a phase lands nothing there)
    // share one pass
    const counts = events[ei].options[oi].counts;
    const k = `${ei}|${evs[ei].rows.map((r) => (kit.drainKey
      ? kit.drainKey({
        targetKey: rows0[r].targetKey, phase: rows0[r].phase, drain: ctx.drain, fightSeconds: ctx.fightSeconds, rowKey: rows0[r].key, specs: { counts },
      })
      : specKeyOf(Object.fromEntries(Object.entries(counts).filter(([w]) => hitsOf[r][w] !== false))))).join(';')}`;
    const hit = passMemo.get(k);
    if (hit) return hit;
    const assign = events.map((_, j) => (j === ei ? events[ei].options[oi].counts as SpecCounts : {}));
    const kk = assignedKit(kit, rowEventMap, npcEvent, assign, true);
    const rowsP = ctx.pass(kk, ctx.drain, ctx.fightSeconds);
    const hpLeft = rowHpLeft(rowsP);
    const out = new Map<number, RowOutcome>();
    const lastOfEvent = evs[ei].rows[evs[ei].rows.length - 1];
    let others = 0;
    rowsP.forEach((r) => {
      let idx = rows0.findIndex((x) => x.key === r.key);
      const ev = idx >= 0 ? rowEvent[idx] : (rowEventMap.get(r.key) ?? npcEvent.get(targetNpc(r.targetKey)));
      if (ev !== ei) {
        others += r.seconds;
        return;
      }
      let extra = false;
      if (idx < 0) {
        idx = lastOfEvent;
        extra = true;
      }
      const q: PhaseQuery = {
        targetKey: r.targetKey,
        phase: r.phase,
        drain: ctx.drain,
        fightSeconds: ctx.fightSeconds,
        rowKey: r.key,
        specs: { counts: assign[ei] },
        ...(hpLeft.has(r.key) ? { hpLeft: hpLeft.get(r.key) } : {}),
      };
      const prev = out.get(idx);
      const damageSpecs = extra ? [] : damageChoices(kk, q, r, cfg.damage, hitsOf[idx], mult);
      out.set(idx, prev
        ? { seconds: prev.seconds + r.seconds, damage: prev.damage, damageSpecs: prev.damageSpecs }
        : { seconds: r.seconds, damage: r.damage, damageSpecs });
    });
    // a coupling to other events' rows (they are at no specs in this pass): the change vs option 0, on the last row
    if (oi > 0) {
      const base = outcomesOf(ei, 0);
      const baseOthers = (base as Map<number, RowOutcome> & { others?: number }).others ?? 0;
      const delta = others - baseOthers;
      if (Math.abs(delta) > 1e-9 && Number.isFinite(delta)) {
        const last = out.get(lastOfEvent) ?? { seconds: 0, damage: 0, damageSpecs: [] };
        out.set(lastOfEvent, { ...last, extra: (last.extra ?? 0) + delta });
      }
    }
    (out as Map<number, RowOutcome> & { others?: number }).others = others;
    passMemo.set(k, out);
    return out;
  };
  const rawOutcome = (i: number, oi: number): RowOutcome => outcomesOf(rowEvent[i], oi).get(i) ?? { seconds: 0, damage: 0, damageSpecs: [] };
  // options that another one dominates (as fast on every phase, no more energy) are dropped before the DP
  const keep = events.map((e, ei) => (e.options.length < 2 ? e.options.map((_, i) => i) : capOptions(prunedOptions(e.options.map((option, oi) => ({
    option, rows: evs[ei].rows.map((r) => rawOutcome(r, oi)),
  }))), (oi) => evs[ei].rows.reduce((tt, r) => tt + rowSecondsAfter(rawOutcome(r, oi), {}), 0), (oi) => Object.values(e.options[oi].counts).reduce((x, n) => x + n, 0))));
  const pruned: BudgetEvent[] = events.map((e, ei) => ({ ...e, options: keep[ei].map((oi) => e.options[oi]) }));
  const rowOutcome = (i: number, oi: number): RowOutcome => rawOutcome(i, keep[rowEvent[i]][oi]);
  const noSpecSeconds = rows0.reduce((tt, _, i) => tt + rowOutcome(i, 0).seconds, 0);
  const order: string[] = ['elderMaul', 'dwh', 'tonalztics', 'bgs', 'ayak'];
  const sameCounts = (x: Record<string, number>, y: Record<string, number>) => order.every((w) => (x[w] ?? 0) === (y[w] ?? 0));
  const solve = (clockRows: BudgetRow[]) => {
    const dc = cfg.deathCharge ? withDeathCharge(clockRows, kills, cfg.deathCharge.share, ctx.clock0) : { rows: clockRows };
    const { rows } = dc;
    const problem: AllocationProblem = {
      rows, events: pruned, groups, start, damageGroup: MY_POOL, rowOutcome, surge: ctx.surge, keepEnd: cfg.carry, ...halfCost,
    };
    ctx.onProblem?.(problem, {
      rows, events, groups, start, damageGroup: MY_POOL, rowOutcome: rawOutcome, surge: ctx.surge, ...halfCost,
    });
    const result = allocateBudget(problem);
    // top-up: spare energy that changes no seconds still buys reliability — add drain specs (event order, upstream
    // weapon order) while the plan stays feasible and no slower. The ranking rounds a spec plan's Defence (floor at
    // P ≥ 95%, else the nearest reachable Defence), so the fewest specs reaching the same ranked Defence can be far less
    // reliable (Kephri: 1 maul spec ranks at Def 60 at 63%; 4 specs reach it at 98%).
    const full: AllocationProblem = {
      rows, events, groups, start, damageGroup: MY_POOL, rowOutcome: rawOutcome, surge: ctx.surge, ...halfCost,
    };
    const chosen = result.options.map((oi, ei) => keep[ei][oi]);
    const decisions = { options: chosen, damage: result.rows.map((r) => r.damage), drinkRow: drinkRowOf(result) };
    let sim = simulateBudget(full, decisions);
    for (let guard = 0; guard < 200 && sim.feasible; guard++) {
      let moved = false;
      for (let ei = 0; ei < events.length && !moved; ei++) {
        for (const w of order) {
          const want = { ...events[ei].options[chosen[ei]].counts, [w]: (events[ei].options[chosen[ei]].counts[w] ?? 0) + 1 };
          const j = events[ei].options.findIndex((o) => sameCounts(o.counts, want));
          if (j < 0) continue;
          const trial = simulateBudget(full, { ...decisions, options: chosen.map((c, k) => (k === ei ? j : c)) });
          if (trial.feasible && trial.seconds <= sim.seconds + 1e-9) {
            chosen[ei] = j;
            sim = trial;
            moved = true;
            break;
          }
        }
      }
      if (!moved) break;
    }
    const alloc: EncounterAlloc = {
      events: evs.map((e, i) => ({
        npc: e.npc, ...(e.reset ? { reset: e.reset } : {}), firstRowKey: rows0[e.rows[0]].key, counts: events[i].options[chosen[i]].counts as SpecCounts,
      })),
      rowEvent: Object.fromEntries(rows0.map((r, i) => [r.key, rowEvent[i]])),
      damage: Object.fromEntries(result.rows.map((d, i) => [rows0[i].key, d.damage as Partial<Record<DamageSpecWeapon, number>>])
        .filter(([, d]) => Object.values(d as Record<string, number>).some((n) => n > 0))),
      surge: ctx.surge,
    };
    const specsUsed = chosen.reduce((tt, oi, ei) => tt + Object.values(events[ei].options[oi].counts).reduce((x, n) => x + n, 0), 0)
      + result.rows.reduce((tt, r) => tt + Object.values(r.damage).reduce((x, n) => x + n, 0), 0);
    const { rows: finalRows, queryOf } = assignedPass(kit, ctx, alloc);
    const phases = withDamage(kit, finalRows, alloc.damage, cfg, queryOf, mult);
    return {
      phases,
      seconds: sum(phases),
      plan: {
        ...alloc,
        specs: specsUsed,
        noSpecSeconds,
        start,
        end: sim.feasible ? sim.end : result.end,
        ...(dc.plan ? { deathCharge: dc.plan } : {}),
        ...(adrenaline > 0 ? { adrenalineSeconds: adrenaline } : {}),
      },
    };
  };
  // review: regen runs on the clock of the drained fight (shorter than the undrained pass the options were timed on):
  // the first plan on the undrained clock, then re-planned on the clock of the previous plan's phases (drains and damage
  // specs included) until the plan stops changing (at most CLOCK_ROUNDS re-plans)
  const planKey = (r: BudgetedEncounter) => JSON.stringify([r.plan.events.map((e) => e.counts), r.plan.damage, r.plan.surge]);
  let out = solve(clockOf(rows0));
  for (let round = 0; round < CLOCK_ROUNDS; round++) {
    const next = solve(clockOf(out.phases));
    const same = planKey(next) === planKey(out);
    out = next;
    if (same) break;
  }
  return out;
};

export { CARRY_SPEC_ENERGY };
