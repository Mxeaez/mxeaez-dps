import type {
  DrainStateId, SpecCounts,
} from '@/lib/fracturedArchive/bestSetup';
import { findTarget } from '@/lib/fracturedArchive/bestSetup';
import type {
  PhaseQuery, PhaseTime, RaidKit, RaidTimeAssumptions,
} from '@/lib/fracturedArchive/raidTime';
import {
  DrainModel, PlannerWeapon, SPEC_WEAPONS, specAttempts,
} from '@/lib/fracturedArchive/specs';
import {
  ayakOutcome, ayakSpecsToThreshold, DEFAULT_FLOOR_THRESHOLD, DEFENCE_DRAIN_ORDER, drainOrder, drainSequence, helpfulSpecs,
  MAX_FLOOR_SPECS, neededSpecs, recommendCarriers,
} from '@/lib/fracturedArchive/teamSpecs';
import {
  bestDamageVariant, DAMAGE_SPEC_WEAPONS, DamageSpecProfile, DamageSpecWeapon, netSpecDamage, specSecondsSaved,
} from '@/lib/fracturedArchive/damageSpecs';
import {
  allocateBudget, AllocationProblem, BudgetEvent, BudgetRow, CARRY_SPEC_ENERGY, DamageChoice,
  DEATH_CHARGE_ENERGY, deathChargeSchedule, drinkRowOf, EventOption, MY_POOL, OptionSpend, PoolGroup, PoolState,
  RowOutcome, rowSecondsAfter, simulateBudget, SPEC_MAX_ENERGY,
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
 * - **Drain specs** of an event (phase 38g: one fixed set, {@link eventWantedCounts}; was a seconds-based option search)
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

/**
 * Phase 38c fix: a row's wall seconds on the spec budget's clock: seconds × multiplier ÷ party size, except a
 * fixed-length phase (`fixedWall`: Ocellus P2), which lasts its seconds whatever the multiplier.
 */
export const rowWallSeconds = (
  r: Pick<PhaseTime, 'seconds' | 'fixedWall'>,
  a: Pick<RaidTimeAssumptions, 'dpsMultiplier' | 'partySize'>,
): number => (r.fixedWall ? Math.max(0, Number.isFinite(r.seconds) ? r.seconds : 0) : wallOf(r.seconds, a));

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
 * one per phase that drains apply to; null = unknown). Per phase:
 * - **Team**: the fewest of the kit's carriers reaching P(floor from the first round) ≥ threshold (teamSpecs.ts
 *   `recommendCarriers` within `cfg.carriers`), each carrier making its first-round specs (2 for a 50% spec); when no team
 *   within them does (phase 38g fix, the user: "cap at what helps"), the fewest of the kit's specs in drain order reaching
 *   d* = the lowest Defence all of them reach at 95% (teamSpecs.ts `helpfulSpecs`), in whole carriers. Eye of Ayak: the fewest of its carriers reaching P(magic def 0)
 *   ≥ threshold, else all of them.
 * - **Solo**: the fewest of your specs reaching the floor at the threshold (teamSpecs.ts `neededSpecs` with your
 *   weapons, at most MAX_FLOOR_SPECS); unreachable: the fewest (in drain order) reaching d* (`helpfulSpecs`). Eye of Ayak: the fewest
 *   (≤ the specs asked for) reaching magic def 0 at the threshold, else all asked for.
 * Per weapon the most any phase of the event wants. A phase already at the floor (magic def ≤ 0) wants none.
 */
const WANTED_MEMO = new WeakMap<DrainModel, Map<string, SpecCounts>>();

export const eventWantedCounts = (
  cfg: Pick<SpecBudgetConfig, 'drain' | 'solo' | 'carriers'>,
  models: (DrainModel | null)[],
  threshold = DEFAULT_FLOOR_THRESHOLD,
): SpecCounts => {
  const out: SpecCounts = {};
  const more = (w: PlannerWeapon, n: number) => { if (n > (out[w] ?? 0)) out[w] = n; };
  const key = JSON.stringify([cfg.drain, cfg.drain === 'solo' ? cfg.solo : cfg.carriers, threshold]);
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
      one = phaseWantedCounts(cfg, m, threshold);
      memo.set(key, one);
    }
    (Object.keys(one) as PlannerWeapon[]).forEach((w) => more(w, one![w] ?? 0));
  });
  return out;
};

/** {@link eventWantedCounts} of one phase (memoised per drain model object: the kits cache them). */

const phaseWantedCounts = (
  cfg: Pick<SpecBudgetConfig, 'drain' | 'solo' | 'carriers'>,
  m: DrainModel,
  threshold: number,
): SpecCounts => {
  const out: SpecCounts = {};
  const more = (w: PlannerWeapon, n: number) => { if (n > (out[w] ?? 0)) out[w] = n; };
  const kit = cfg.drain === 'team' ? (cfg.carriers ?? {}) : {};
  const perCarrier = (w: PlannerWeapon) => specAttempts(SPEC_MAX_ENERGY, SPEC_WEAPONS[w].energy);
  const yours = cfg.drain === 'solo'
    ? DEFENCE_DRAIN_ORDER.filter((w) => (cfg.solo?.[w] ?? 0) > 0)
    : [];
  if (cfg.drain === 'team') {
    if (m.def > m.floor) {
      const total = Object.values(kit).reduce((t: number, n) => t + (n ?? 0), 0);
      const rec = recommendCarriers(m, {
        partySize: Math.max(1, total), threshold, available: kit, bestOnly: true,
      });
      if (rec.best) {
        const carriers = rec.best.carriers;
        DEFENCE_DRAIN_ORDER.forEach((w) => more(w, (carriers[w] ?? 0) * perCarrier(w)));
      } else {
        // phase 38g fix (the user, 2026-10-28): no team within the kit reaches the floor at 95%: the fewest of the kit's
        // specs (in drain order) reaching d* = the lowest Defence all of them reach at 95%, in whole carriers
        const seq = drainSequence(drainOrder(m).map((x) => x.weapon), (w) => Math.floor(kit[w] ?? 0) * perCarrier(w));
        const h = helpfulSpecs(m, seq, threshold);
        DEFENCE_DRAIN_ORDER.forEach((w) => more(w, Math.ceil((h.counts[w] ?? 0) / perCarrier(w)) * perCarrier(w)));
      }
    }
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
    const weapons = yours.filter((w) => m.canHit[w]);
    if (weapons.length && m.def > m.floor) {
      const nd = neededSpecs(m, Object.fromEntries(weapons.map((w) => [w, MAX_FLOOR_SPECS])), threshold);
      // phase 38g fix: unreachable at 95%: the fewest specs (in drain order) reaching d* (helpfulSpecs)
      const got = nd.defence ?? helpfulSpecs(m, drainSequence(drainOrder(m, weapons).map((x) => x.weapon), () => MAX_FLOOR_SPECS, MAX_FLOOR_SPECS), threshold).counts;
      DEFENCE_DRAIN_ORDER.forEach((w) => more(w, got[w] ?? 0));
    }
    const asked = Math.floor(cfg.solo?.ayak ?? 0);
    if (asked > 0 && m.canHit.ayak && m.magicDef > 0) more('ayak', ayakSpecsToThreshold(m, asked, threshold));
  }
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

/**
 * Phase 36, phase 38g: the encounter under the budget (see the module comment) and its phases. Each drain event makes
 * ONE fixed set of drain specs ({@link eventWantedCounts}: carriers / specs to the floor at the threshold, no seconds
 * involved), cut to what the bars pay at the event's spend rows: events in order; Team per carrier group (weapon) the
 * most specs ≤ wanted its pools pay; Solo your pool pays the event's drains first (Eye of Ayak dropped first, then the
 * weapon last in the drain order). The Defence those specs reach applies from the event on (`attemptsFromCounts`). The
 * DP (specBudget.ts `allocateBudget`) only places your damage specs and the surge dose around them.
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
    pass.forEach((r) => {
      const w = rowWallSeconds(r, a);
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
  // per event: the row each weapon spends at (the first drained row it can hit) and the wanted counts
  const plans = evs.map((e) => {
    const drained = e.rows.filter((i) => !targetNoDrains(rows0[i].targetKey));
    const spendRow = new Map<PlannerWeapon, number>();
    drainWeapons.forEach((w) => {
      const r = drained.find((i) => hitsOf[i][w] !== false);
      if (r !== undefined) spendRow.set(w, r);
    });
    let wanted: SpecCounts = {};
    if (drained.length && spendRow.size) {
      if (kit.drainModel) {
        wanted = eventWantedCounts(cfg, drained.map((i) => kit.drainModel!(noneQuery(rows0[i]))), threshold);
      } else {
        // a kit without drain models (toys): Team every carrier's first-round specs, Solo as many as the bar pays
        drainWeapons.forEach((w) => {
          wanted[w] = cfg.drain === 'team'
            ? Math.floor(cfg.carriers![w] ?? 0) * specAttempts(SPEC_MAX_ENERGY, SPEC_WEAPONS[w].energy)
            : Math.min(Math.floor(cfg.solo![w] ?? 0), MAX_FLOOR_SPECS);
        });
      }
      wanted = Object.fromEntries(Object.entries(wanted).filter(([w, n]) => (n ?? 0) > 0 && spendRow.has(w as PlannerWeapon)));
    }
    // Solo: the specs dropped first when the bar can't pay (Eye of Ayak, then from the last weapon in the drain order)
    const firstModel = cfg.drain === 'solo' && kit.drainModel && drained.length ? kit.drainModel(noneQuery(rows0[drained[0]])) : null;
    const ranked: PlannerWeapon[] = firstModel ? drainOrder(firstModel).map((x) => x.weapon) : [];
    const dropOrder: PlannerWeapon[] = ['ayak', ...DEFENCE_DRAIN_ORDER.filter((w) => !ranked.includes(w)).reverse(), ...[...ranked].reverse()];
    return { spendRow, wanted, dropOrder };
  });
  const optionOf = (ei: number, counts: SpecCounts): EventOption => ({
    counts: counts as Record<string, number>,
    spends: Object.entries(counts).filter(([, n]) => (n ?? 0) > 0).map(([w, n]): OptionSpend => ({
      group: cfg.drain === 'solo' ? MY_POOL : w, specs: n!, cost: SPEC_WEAPONS[w as PlannerWeapon].energy, row: plans[ei].spendRow.get(w as PlannerWeapon)!,
    })),
  });
  const zeroOutcome = (): RowOutcome => ({ seconds: 0, damage: 0, damageSpecs: [] });
  // what the bars pay: events in order, each cut until the drains alone (no damage specs; your dose right after your
  // first drain spends) are payable on this clock
  const paidCounts = (rows: BudgetRow[]): SpecCounts[] => {
    const paid: SpecCounts[] = evs.map(() => ({}));
    const feasible = () => {
      const events: BudgetEvent[] = evs.map((e, ei) => ({ firstRow: e.rows[0], options: [optionOf(ei, paid[ei])] }));
      const mine = events.flatMap((e) => e.options[0].spends).filter((sp) => sp.group === MY_POOL && sp.specs > 0).map((sp) => sp.row);
      return simulateBudget({
        rows, events, groups, start, damageGroup: MY_POOL, rowOutcome: zeroOutcome, surge: ctx.surge, ...halfCost,
      }, { options: evs.map(() => 0), damage: [], drinkRow: mine.length ? Math.min(...mine) : -1 }).feasible;
    };
    evs.forEach((_, ei) => {
      const { wanted, dropOrder } = plans[ei];
      if (cfg.drain === 'team') {
        (Object.keys(wanted) as PlannerWeapon[]).forEach((w) => {
          for (let n = wanted[w]!; n >= 0; n--) {
            paid[ei] = { ...paid[ei], [w]: n };
            if (n === 0 || feasible()) break;
          }
        });
      } else {
        paid[ei] = { ...wanted };
        for (let guard = 0; guard < 64 && !feasible(); guard++) {
          const w = dropOrder.find((x) => (paid[ei][x] ?? 0) > 0);
          if (!w) break;
          paid[ei] = { ...paid[ei], [w]: paid[ei][w]! - 1 };
        }
      }
      paid[ei] = Object.fromEntries(Object.entries(paid[ei]).filter(([, n]) => (n ?? 0) > 0));
    });
    return paid;
  };
  const rowEventMap = new Map(rows0.map((r, i) => [r.key, rowEvent[i]]));
  const npcEvent = new Map<string, number>();
  evs.forEach((e, i) => { if (!npcEvent.has(e.npc)) npcEvent.set(e.npc, i); });
  const solve = (clockRows: BudgetRow[]): BudgetedEncounter => {
    const dc = cfg.deathCharge ? withDeathCharge(clockRows, kills, cfg.deathCharge.share, ctx.clock0) : { rows: clockRows };
    const { rows } = dc;
    const counts = paidCounts(rows);
    const fixed: Pick<EncounterAlloc, 'events' | 'rowEvent'> = {
      events: evs.map((e, i) => ({
        npc: e.npc, ...(e.reset ? { reset: e.reset } : {}), firstRowKey: rows0[e.rows[0]].key, counts: counts[i],
      })),
      rowEvent: Object.fromEntries(rows0.map((r, i) => [r.key, rowEvent[i]])),
    };
    // the row outcomes of the pass with every event at its counts (a phase of the pass that isn't a row: on the last
    // row of its event)
    const { rows: passRows, queryOf } = assignedPass(kit, ctx, fixed);
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
      const prev = outcomes.get(idx);
      const damageSpecs = extra ? [] : damageChoices(kit, queryOf(r), r, cfg.damage, hitsOf[idx], mult);
      outcomes.set(idx, prev
        ? { seconds: prev.seconds + r.seconds, damage: prev.damage, damageSpecs: prev.damageSpecs }
        : { seconds: r.seconds, damage: r.damage, damageSpecs });
    });
    const problem: AllocationProblem = {
      rows,
      events: evs.map((e, ei) => ({ firstRow: e.rows[0], options: [optionOf(ei, counts[ei])] })),
      groups,
      start,
      damageGroup: MY_POOL,
      rowOutcome: (i) => outcomes.get(i) ?? zeroOutcome(),
      surge: ctx.surge,
      keepEnd: cfg.carry,
      ...halfCost,
    };
    ctx.onProblem?.(problem, problem);
    const result = allocateBudget(problem);
    const alloc: EncounterAlloc = {
      ...fixed,
      damage: Object.fromEntries(result.rows.map((d, i) => [rows0[i].key, d.damage as Partial<Record<DamageSpecWeapon, number>>])
        .filter(([, d]) => Object.values(d as Record<string, number>).some((n) => n > 0))),
      surge: ctx.surge,
    };
    const sim = simulateBudget(problem, { options: evs.map(() => 0), damage: result.rows.map((r) => r.damage), drinkRow: drinkRowOf(result) });
    const specsUsed = counts.reduce((tt, c) => tt + Object.values(c).reduce((x: number, n) => x + (n ?? 0), 0), 0)
      + result.rows.reduce((tt, r) => tt + Object.values(r.damage).reduce((x, n) => x + n, 0), 0);
    const phases = withDamage(kit, passRows, alloc.damage, cfg, queryOf, mult);
    return {
      phases,
      seconds: sum(phases),
      plan: {
        ...alloc,
        specs: specsUsed,
        noSpecSeconds: sum(rows0),
        start,
        end: sim.feasible ? sim.end : result.end,
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
  return out;
};

export { CARRY_SPEC_ENERGY };
