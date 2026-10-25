/**
 * Phase 36: one spec budget per encounter. Pure and React-free (the time model runs it per encounter; Jest tests it on
 * toys against an exhaustive search). Docs: docs/BEST_SETUP.md *Damage specs, surge potion and one spec budget per
 * encounter (phase 36)*; the readings are UNVERIFIED B10 / D27–D29.
 *
 * Model (all energy in %):
 * - **Pools.** Each player's spec bar is a pool: Solo = yours ("me"); Team = one pool per carrier (grouped by weapon: a
 *   carrier specs only its weapon) + yours for your damage specs. Every pool starts the encounter at 100%
 *   ({@link SPEC_MAX_ENERGY}); with {@link CARRY_SPEC_ENERGY} the time model hands the previous encounter's leftover on
 *   instead (`min(100, leftover + regen)`, travel 0 s).
 * - **Rows and events.** The encounter's phases (rows) in time order, each with its start / end on the clock (wall
 *   seconds; the time model's undrained pass). A drain event is the NPC's first row or a Defence reset (drainLine.ts
 *   `drainEventOf`); its option = spec counts per drain weapon, chosen at its first row; each weapon's specs are spent at
 *   the first row of the event it can hit (AG: Tonalztics on the flying shield, the maul when it lands).
 * - **Order per row**: (1) the drain spends due at this row (each from the fullest pool of its group, `spendFromGroup`);
 *   (2) the surge dose (if any) right after the encounter's first spends (`surge.row`), +25% to your pool, capped at
 *   100% (the potion does nothing at 100%: wiki "Drinking this would have no effect"); (3) regen during the row: +10%
 *   per regen tick of the pool's period (30 s, Lightbearer 15 s; ticks counted on the clock); (4) your damage specs on
 *   the row, paid from your pool after its regen (specs can be done any time during the row, so the row's regen is
 *   usable); (5) every pool capped at 100%.
 * - **Time.** A row's seconds come from its event's option (`rowOutcome`); damage specs take m × net damage off the row
 *   (seconds × (1 − removed ÷ damage), not below 0).
 * - **Choice.** Exact dynamic programme over the rows (state: every pool's energy and the options of the events still
 *   running): the least total seconds; ties (≤ 1e-9 s): fewer specs, then the earlier option / fewer damage specs in
 *   enumeration order. "No specs" is always an option, so the result is never slower than spending nothing, and adding a
 *   pool (a carrier) or energy never makes it slower.
 */

/** Phase 36 decision: false = every encounter starts at 100% (see BEST_SETUP); true = leftover energy carries on. */
export const CARRY_SPEC_ENERGY = false;
export const SPEC_MAX_ENERGY = 100;
export const SPEC_REGEN_STEP = 10;
/** Surge potion (wiki, read 2026-10-24): "restore 25% special attack energy per dose, ... once every five minutes". */
export const SURGE_DOSE_ENERGY = 25;
export const SURGE_COOLDOWN_SECONDS = 300;
export const SURGE_DOSES_PER_POTION = 4;
/** The group of your own pool (Solo drains, damage specs). */
export const MY_POOL = 'me';

const EPS = 1e-9;

export interface PoolGroup {
  id: string;
  /** Pools (players) in the group. */
  count: number;
  /** Seconds per +10% regen tick (30, Lightbearer 15). */
  regenSeconds: number;
}

/** Energy per pool, by group (each list sorted high → low). */
export type PoolState = Record<string, number[]>;

export interface BudgetRow {
  key: string;
  event: number;
  /** Clock seconds (wall) at the row's start and end. */
  start: number;
  end: number;
}

export interface OptionSpend {
  group: string;
  specs: number;
  cost: number;
  /** Row index where the specs are made. */
  row: number;
}

export interface EventOption {
  /** Spec counts per weapon (for the caller; the DP reads `spends`). */
  counts: Record<string, number>;
  spends: OptionSpend[];
}

export interface BudgetEvent {
  firstRow: number;
  /** Index 0 must be the "no specs" option. */
  options: EventOption[];
}

export interface DamageChoice {
  weapon: string;
  /** Energy per spec. */
  cost: number;
  /** Net damage of one spec on this row (> 0; rows list only the useful weapons). */
  net: number;
}

export interface RowOutcome {
  seconds: number;
  /** Damage of the row (damage specs take net damage off it). */
  damage: number;
  damageSpecs: DamageChoice[];
  /**
   * Seconds this option changes on other events' rows (a coupling: Bloat's first down sets how much damage is left for
   * the later downs), added as they are (not scaled by damage specs).
   */
  extra?: number;
}

export interface AllocationProblem {
  rows: BudgetRow[];
  events: BudgetEvent[];
  groups: PoolGroup[];
  start: PoolState;
  /** Group paying for damage specs (and drinking the surge dose); default {@link MY_POOL}. */
  damageGroup?: string;
  rowOutcome: (row: number, option: number) => RowOutcome;
  /**
   * A surge dose this encounter: +25% to your pool (the first of `damageGroup`) right after its first spend (a drain
   * spec or a damage spec; at 100% the potion does nothing), capped at 100%.
   */
  surge?: boolean;
  /**
   * Keep every pool in the DP's state to the end (the encounter's end energy matters: `CARRY_SPEC_ENERGY`); otherwise
   * a carrier group's energy after its last possible spend is ignored (the end state reported for it is then any path's).
   */
  keepEnd?: boolean;
}

export interface RowDecision {
  /** The options chosen for the events starting at this row. */
  started: { event: number, option: number }[];
  /** Damage specs made on this row, per weapon. */
  damage: Record<string, number>;
  seconds: number;
  /** The surge dose was drunk at this row. */
  surge?: boolean;
}

export interface AllocationResult {
  seconds: number;
  specs: number;
  /** Chosen option per event. */
  options: number[];
  rows: RowDecision[];
  end: PoolState;
}

/** Regen ticks of period `p` between clock times `a` < `b` (a tick exactly at `a` belongs to the row before). */
export const regenTicks = (a: number, b: number, p: number): number => {
  if (!(p > 0) || !Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  return Math.floor((b + EPS) / p) - Math.floor((a + EPS) / p);
};

/**
 * Spends `specs` × `cost` from a group: each spec from the pool with the most energy that can pay (keeps the pools
 * below the 100% cap, so less regen is wasted). Null when it can't pay.
 */
export const spendFromGroup = (pools: number[], specs: number, cost: number): number[] | null => {
  const out = [...pools];
  for (let k = 0; k < specs; k++) {
    let best = -1;
    out.forEach((e, i) => {
      if (e + EPS >= cost && (best < 0 || e > out[best])) best = i;
    });
    if (best < 0) return null;
    out[best] -= cost;
  }
  return out.sort((x, y) => y - x);
};

/** Every way to spend from one pool on a row's damage specs (counts per weapon, total cost ≤ energy), zero first. */
export const damageCombos = (choices: DamageChoice[], energy: number): Record<string, number>[] => {
  const out: Record<string, number>[] = [];
  const walk = (i: number, left: number, cur: Record<string, number>) => {
    if (i === choices.length) {
      out.push({ ...cur });
      return;
    }
    const c = choices[i];
    for (let m = 0; m * c.cost <= left + EPS; m++) {
      walk(i + 1, left - m * c.cost, m ? { ...cur, [c.weapon]: m } : cur);
      if (c.cost <= 0) break;
    }
  };
  walk(0, energy, {});
  return out;
};

/** Seconds of a row after damage specs: seconds × (1 − removed ÷ damage), not below 0. */
export const rowSecondsAfter = (o: RowOutcome, counts: Record<string, number>): number => {
  const extra = o.extra ?? 0;
  if (!(o.damage > 0) || !Number.isFinite(o.seconds)) return o.seconds + extra;
  const removed = o.damageSpecs.reduce((t, c) => t + (counts[c.weapon] ?? 0) * c.net, 0);
  if (removed <= 0) return o.seconds + extra;
  return o.seconds * Math.max(0, 1 - removed / o.damage) + extra;
};

const countSpecs = (counts: Record<string, number>) => Object.values(counts).reduce((t, v) => t + v, 0);

/** The DP (see the module comment). */
export const allocateBudget = (p: AllocationProblem): AllocationResult => {
  const dmgGroup = p.damageGroup ?? MY_POOL;
  const groups = new Map(p.groups.map((g) => [g.id, g]));
  const lastRow = p.events.map((e, ei) => {
    let last = e.firstRow;
    p.rows.forEach((r, i) => {
      if (r.event === ei) last = Math.max(last, i);
    });
    e.options.forEach((o) => o.spends.forEach((s) => { last = Math.max(last, s.row); }));
    return last;
  });
  // speed: the regen of every row and pool group, and the last row each drain group can still spend at (after it, its
  // pools change nothing ahead, so states that differ only there are merged; your pool always counts)
  const regenAt = p.rows.map((row) => Object.fromEntries(p.groups.map((g) => [g.id, regenTicks(row.start, row.end, g.regenSeconds) * SPEC_REGEN_STEP])));
  const lastSpend = new Map<string, number>();
  p.events.forEach((e) => e.options.forEach((o) => o.spends.forEach((s) => {
    if (s.specs > 0) lastSpend.set(s.group, Math.max(lastSpend.get(s.group) ?? -1, s.row));
  })));
  const keyAt = (i: number, s: PoolState) => Object.keys(s).sort()
    .filter((g) => p.keepEnd || g === dmgGroup || (lastSpend.get(g) ?? -1) >= i)
    .map((g) => `${g}:${s[g].map((e) => Math.round(e * 1000) / 1000).join(',')}`)
    .join(';');
  const eventAt = new Map<number, number[]>();
  p.events.forEach((e, ei) => eventAt.set(e.firstRow, [...(eventAt.get(e.firstRow) ?? []), ei]));
  const outcomeMemo = new Map<string, RowOutcome>();
  const outcome = (row: number, opt: number) => {
    const k = `${row}|${opt}`;
    if (!outcomeMemo.has(k)) outcomeMemo.set(k, p.rowOutcome(row, opt));
    return outcomeMemo.get(k)!;
  };
  type Val = { seconds: number, specs: number, decision: RowDecision, after: PoolState, next: string | null };
  const memo = new Map<string, Val>();
  const better = (a: { seconds: number, specs: number }, b: { seconds: number, specs: number } | null) => !b
    || a.seconds < b.seconds - EPS || (Math.abs(a.seconds - b.seconds) <= EPS && a.specs < b.specs);

  const solve = (i: number, state: PoolState, chosen: number[], pending: boolean): { key: string, v: Val } | null => {
    if (i >= p.rows.length) return null;
    const live = chosen.map((c, ei) => (lastRow[ei] >= i && p.events[ei].firstRow < i ? c : -1));
    const key = `${i}|${keyAt(i, state)}|${live.join(',')}|${pending ? 1 : 0}`;
    const hit = memo.get(key);
    if (hit) return { key, v: hit };
    const starting = eventAt.get(i) ?? [];
    // every combination of options of the events starting at this row
    let combos: number[][] = [[]];
    starting.forEach((ei) => {
      combos = combos.flatMap((c) => p.events[ei].options.map((_, oi) => [...c, oi]));
    });
    let best: Val | null = null;
    for (const combo of combos) {
      const ch = [...chosen];
      starting.forEach((ei, j) => { ch[ei] = combo[j]; });
      // (1) spends due at this row
      let s: PoolState | null = { ...state };
      let mineSpent = false;
      for (let ei = 0; ei < p.events.length && s; ei++) {
        if (ch[ei] === undefined || ch[ei] < 0) continue;
        for (const sp of p.events[ei].options[ch[ei]].spends) {
          if (sp.row !== i || sp.specs <= 0) continue;
          const g: number[] | undefined = s[sp.group];
          const paid: number[] | null = g ? spendFromGroup(g, sp.specs, sp.cost) : null;
          if (!paid) {
            s = null;
            break;
          }
          s = { ...s, [sp.group]: paid };
          if (sp.group === dmgGroup) mineSpent = true;
        }
      }
      if (!s) continue;
      // (2) the surge dose, right after your pool's first spend (the potion does nothing at 100%)
      let dose = pending;
      if (dose && mineSpent && s[dmgGroup]?.length) {
        const g = [...s[dmgGroup]];
        g[0] = Math.min(SPEC_MAX_ENERGY, g[0] + SURGE_DOSE_ENERGY);
        s = { ...s, [dmgGroup]: g.sort((x, y) => y - x) };
        dose = false;
      }
      // (3) regen during the row
      const row = p.rows[i];
      const regen: PoolState = {};
      const paidState = s;
      Object.keys(paidState).forEach((gid) => {
        const t = regenAt[i][gid] ?? regenTicks(row.start, row.end, groups.get(gid)?.regenSeconds ?? 30) * SPEC_REGEN_STEP;
        regen[gid] = paidState[gid].map((e) => e + t);
      });
      // (4) damage specs on the row, (5) cap
      const ev = row.event;
      const o = outcome(i, ch[ev] !== undefined && ch[ev] >= 0 ? ch[ev] : 0);
      const mine = regen[dmgGroup]?.[0] ?? 0;
      // with a pending dose, the row's specs may use it (drunk below 100%, or right after the first spec)
      const combosD = o.damageSpecs.length && regen[dmgGroup]?.length
        ? damageCombos(o.damageSpecs, mine + (dose ? SURGE_DOSE_ENERGY : 0)) : [{}];
      const drainSpecs = starting.reduce((t, ei, j) => t + countSpecs(p.events[ei].options[combo[j]].counts), 0);
      for (const d of combosD) {
        const spent = o.damageSpecs.reduce((t, c) => t + (d[c.weapon] ?? 0) * c.cost, 0);
        // a pending dose may be drunk now (if the bar is below 100% or a spec is made: the potion does nothing at
        // 100%) or kept for a later row
        for (const drink of dose ? [false, true] : [false]) {
          if (drink && !(spent > 0 || mine < SPEC_MAX_ENERGY - EPS)) continue;
          if (spent > mine + (drink ? SURGE_DOSE_ENERGY : 0) + EPS) continue;
          const after: PoolState = {};
          Object.keys(regen).forEach((gid) => {
            const list = regen[gid].map((e, k) => (gid === dmgGroup && k === 0 ? e - spent + (drink ? SURGE_DOSE_ENERGY : 0) : e));
            after[gid] = list.map((e) => Math.min(SPEC_MAX_ENERGY, e)).sort((x, y) => y - x);
          });
          const secs = rowSecondsAfter(o, d);
          const nxt = solve(i + 1, after, ch, dose && !drink);
          const cand: Val = {
            seconds: secs + (nxt?.v.seconds ?? 0),
            specs: drainSpecs + countSpecs(d) + (nxt?.v.specs ?? 0),
            decision: {
              started: starting.map((ei, j) => ({ event: ei, option: combo[j] })), damage: d, seconds: secs, ...(drink || (pending && !dose) ? { surge: true } : {}),
            },
            after,
            next: nxt?.key ?? null,
          };
          if (better(cand, best)) best = cand;
        }
      }
    }
    // no affordable decision: a spend an earlier option scheduled for this row can't be paid (a dead path; the root
    // always has one: every option 0)
    if (!best) {
      best = {
        seconds: Infinity, specs: Infinity, decision: { started: [], damage: {}, seconds: Infinity }, after: state, next: null,
      };
    }
    memo.set(key, best);
    return { key, v: best };
  };

  if (!p.rows.length) {
    return {
      seconds: 0, specs: 0, options: p.events.map(() => 0), rows: [], end: p.start,
    };
  }
  const root = solve(0, p.start, p.events.map(() => -1), !!p.surge)!;
  const rows: RowDecision[] = [];
  const options = p.events.map(() => 0);
  let cur: Val | null = root.v;
  let last: Val = root.v;
  while (cur) {
    rows.push(cur.decision);
    cur.decision.started.forEach((x) => { options[x.event] = x.option; });
    last = cur;
    cur = cur.next ? memo.get(cur.next)! : null;
  }
  return {
    seconds: root.v.seconds,
    specs: root.v.specs,
    options,
    rows,
    end: last.after,
  };
};

// --- surge doses along a route --------------------------------------------------------------------------------------

export interface DoseCandidate {
  id: string;
  /** Clock seconds (wall) when the dose would be drunk (the encounter's start). */
  at: number;
  /** Route seconds the dose saves there. */
  gain: number;
}

/**
 * The doses that save the most route time: at most `maxDoses`, consecutive doses ≥ `cooldown` s apart (the potion's
 * 5-minute cooldown; the first may be at the raid start, the cooldown is reset on entering a raid). Exact (dynamic
 * programme over the encounters in route order); only doses saving > 0 are taken; ties: fewer doses, then earlier ones.
 */
export const placeDoses = (items: DoseCandidate[], maxDoses: number, cooldown = SURGE_COOLDOWN_SECONDS): string[] => {
  const n = items.length;
  const k = Math.max(0, Math.floor(maxDoses));
  if (!n || !k) return [];
  // best[i][d] = best total gain using doses among items[i..] with the first chosen at index ≥ i, d doses left
  const memo = new Map<string, { gain: number, count: number, pick: number[] }>();
  const solve = (i: number, d: number): { gain: number, count: number, pick: number[] } => {
    if (i >= n || d <= 0) return { gain: 0, count: 0, pick: [] };
    const key = `${i}|${d}`;
    const hit = memo.get(key);
    if (hit) return hit;
    // skip item i
    let best = solve(i + 1, d);
    if (items[i].gain > EPS) {
      let j = i + 1;
      while (j < n && items[j].at - items[i].at < cooldown - EPS) j += 1;
      const rest = solve(j, d - 1);
      const take = { gain: items[i].gain + rest.gain, count: rest.count + 1, pick: [i, ...rest.pick] };
      // ties: fewer doses, then the earlier dose (take beats skip only if strictly better or equal gain with ≤ doses)
      if (take.gain > best.gain + EPS || (Math.abs(take.gain - best.gain) <= EPS && take.count < best.count)
        || (Math.abs(take.gain - best.gain) <= EPS && take.count === best.count)) best = take;
    }
    memo.set(key, best);
    return best;
  };
  return solve(0, k).pick.map((i) => items[i].id);
};

/** Doses the route's clock allows: one at the start and one per full cooldown after (the cooldown resets on entry). */
export const dosesAllowed = (routeSeconds: number, cooldown = SURGE_COOLDOWN_SECONDS): number => (Number.isFinite(routeSeconds) && routeSeconds >= 0
  ? Math.floor(routeSeconds / cooldown + EPS) + 1
  : 0);

// --- option pruning -------------------------------------------------------------------------------------------------

/** Energy an option spends per (group, row). */
const spendVector = (o: EventOption): Map<string, number> => {
  const v = new Map<string, number>();
  o.spends.forEach((s) => {
    if (s.specs > 0) v.set(`${s.group}|${s.row}`, (v.get(`${s.group}|${s.row}`) ?? 0) + s.specs * s.cost);
  });
  return v;
};

/**
 * Whether option `b` makes option `a` useless: on every row of the event `b` is at least as fast and every damage spec
 * saves at least as much per spec (seconds × net ÷ damage), and `b` spends no more energy from any pool at any row (so
 * whatever `a` allows later, `b` allows too). Exact, so pruning keeps the DP's optimum.
 */
export const optionDominates = (
  b: { option: EventOption, rows: RowOutcome[] },
  a: { option: EventOption, rows: RowOutcome[] },
): boolean => {
  const vb = spendVector(b.option);
  const va = spendVector(a.option);
  for (const [k, e] of vb) if (e > (va.get(k) ?? 0) + EPS) return false;
  const per = (o: RowOutcome, c: DamageChoice) => (o.damage > 0 && Number.isFinite(o.seconds) ? (o.seconds * c.net) / o.damage : 0);
  return b.rows.every((rb, i) => {
    const ra = a.rows[i];
    // the seconds of the row and of any coupling (`extra`, not touched by damage specs)
    if (!(rb.seconds <= ra.seconds + EPS) || !((rb.extra ?? 0) <= (ra.extra ?? 0) + EPS)) return false;
    return ra.damageSpecs.every((ca) => {
      const cb = rb.damageSpecs.find((x) => x.weapon === ca.weapon);
      return !!cb && cb.cost <= ca.cost + EPS && per(rb, cb) >= per(ra, ca) - EPS;
    });
  });
};

/**
 * The options of an event worth keeping (indices, in order; option 0 is always kept): an option dominated by another
 * ({@link optionDominates}; on ties the earlier one is kept) can never be part of a better plan.
 */
export const prunedOptions = (options: { option: EventOption, rows: RowOutcome[] }[]): number[] => options
  .map((_, i) => i)
  .filter((i) => i === 0 || !options.some((o, j) => j !== i && optionDominates(o, options[i])
    && (j < i || !optionDominates(options[i], o))));

// --- a fixed plan replayed (the top-up and the tests) ---------------------------------------------------------------

export interface BudgetDecisions {
  /** Option per event. */
  options: number[];
  /** Damage specs per row. */
  damage: Record<string, number>[];
  /** The row whose spends the surge dose follows (−1: none). */
  drinkRow: number;
}

/**
 * Replays a fixed plan under the module's rules (spends, the dose — right after your pool's drain spends at
 * `drinkRow`, else after its damage specs there — regen, damage specs, the 100% cap). `feasible` false when a spend
 * can't be paid (or the dose is drunk at 100% with nothing spent).
 */
export const simulateBudget = (p: AllocationProblem, d: BudgetDecisions): { feasible: boolean, seconds: number, end: PoolState } => {
  const dmgGroup = p.damageGroup ?? MY_POOL;
  let s: PoolState = Object.fromEntries(Object.entries(p.start).map(([g, v]) => [g, [...v]]));
  let total = 0;
  let pending = !!p.surge && d.drinkRow >= 0;
  for (let i = 0; i < p.rows.length; i++) {
    let mineSpent = false;
    for (let ei = 0; ei < p.events.length; ei++) {
      for (const sp of p.events[ei].options[d.options[ei]].spends) {
        if (sp.row !== i || sp.specs <= 0) continue;
        const paid = s[sp.group] ? spendFromGroup(s[sp.group], sp.specs, sp.cost) : null;
        if (!paid) return { feasible: false, seconds: Infinity, end: s };
        s = { ...s, [sp.group]: paid };
        if (sp.group === dmgGroup) mineSpent = true;
      }
    }
    if (pending && i === d.drinkRow && mineSpent && s[dmgGroup]?.length) {
      s[dmgGroup] = [Math.min(SPEC_MAX_ENERGY, s[dmgGroup][0] + SURGE_DOSE_ENERGY), ...s[dmgGroup].slice(1)].sort((x, y) => y - x);
      pending = false;
    }
    const row = p.rows[i];
    for (const gid of Object.keys(s)) {
      const t = regenTicks(row.start, row.end, p.groups.find((g) => g.id === gid)?.regenSeconds ?? 30) * SPEC_REGEN_STEP;
      s[gid] = s[gid].map((e) => e + t);
    }
    const o = p.rowOutcome(i, d.options[row.event]);
    const counts = d.damage[i] ?? {};
    const spent = o.damageSpecs.reduce((t, c) => t + (counts[c.weapon] ?? 0) * c.cost, 0);
    const mine = s[dmgGroup]?.[0] ?? 0;
    const drink = pending && i === d.drinkRow;
    if (drink && !(spent > 0 || mine < SPEC_MAX_ENERGY - EPS)) return { feasible: false, seconds: Infinity, end: s };
    if (spent > mine + (drink ? SURGE_DOSE_ENERGY : 0) + EPS) return { feasible: false, seconds: Infinity, end: s };
    if (drink) pending = false;
    if (s[dmgGroup]?.length) s[dmgGroup] = [mine - spent + (drink ? SURGE_DOSE_ENERGY : 0), ...s[dmgGroup].slice(1)];
    for (const gid of Object.keys(s)) s[gid] = s[gid].map((e) => Math.min(SPEC_MAX_ENERGY, e)).sort((x, y) => y - x);
    total += rowSecondsAfter(o, counts);
  }
  return { feasible: true, seconds: total, end: s };
};

/** The drink row of a DP result (the row flagged `surge`), −1 when no dose was drunk. */
export const drinkRowOf = (r: Pick<AllocationResult, 'rows'>): number => r.rows.findIndex((x) => x.surge);
