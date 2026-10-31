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
 *   (seconds × (1 − removed ÷ damage), not below 0). Reported only: phase 38h-2, no choice rests on seconds.
 * - **Choice** (phase 38h-2: in boss HP, was the least total seconds). Exact dynamic programme over the rows (state:
 *   every pool's energy and the options of the events still running): the most HP, where an event's option is worth its
 *   drain value (`EventOption.value`, HP: H × g ÷ (1 + g), encounterBudget.ts) × (1 + {@link DRAIN_CLOSE_CALL}) (within
 *   10% of a damage spec the drain is kept) and a damage spec its net damage (`DamageChoice.net`, HP); ties (≤ 1e-9 HP):
 *   the earlier options (Σ option indices; the caller lists its preferred options first), then fewer specs, then fewer
 *   damage specs in enumeration order. "No specs" is always an option (value 0), so adding a pool (a carrier) or energy
 *   never lowers the HP.
 * - **Phase 38b, Death Charge** (`BudgetRow.restore`): energy every pool gets at the row's end (the kills of the row,
 *   {@link deathChargeSchedule}), after the row's damage specs and the cap, capped again. **Liquid adrenaline**
 *   (`AllocationProblem.halfCostUntil`): every spend (drain or damage spec) on a row starting before that clock time
 *   costs half (wiki: "reduce energy costs for special attacks by half for 150 seconds", no rounding).
 */

/** Phase 36 decision: false = every encounter starts at 100% (see BEST_SETUP); true = leftover energy carries on. */
export const CARRY_SPEC_ENERGY = false;
export const SPEC_MAX_ENERGY = 100;
export const SPEC_REGEN_STEP = 10;
/** Surge potion (wiki, read 2026-10-24): "restore 25% special attack energy per dose, ... once every five minutes". */
export const SURGE_DOSE_ENERGY = 25;
export const SURGE_COOLDOWN_SECONDS = 300;
export const SURGE_DOSES_PER_POTION = 4;
/**
 * Phase 38b, Death Charge (wiki, read 2026-10-25): "restore 15% of the player's special attack energy after they dealt the
 * killing blow to any monster within one minute after casting the spell", "can only be cast once every 60 seconds";
 * upgraded by the rite of vile transference: "15% special attack energy from two targets per cast (while still retaining
 * the one minute expiration timer)". Two kills per cast: the user ("the next 2 kills after the cast"; UNVERIFIED D32).
 */
export const DEATH_CHARGE_ENERGY = 15;
export const DEATH_CHARGE_WINDOW_SECONDS = 60;
export const DEATH_CHARGE_COOLDOWN_SECONDS = 60;
export const DEATH_CHARGE_KILLS_PER_CAST = 2;
/** Phase 38b, Liquid adrenaline (wiki): spec costs halved "for 150 seconds". */
export const ADRENALINE_COST_FACTOR = 0.5;
/** The group of your own pool (Solo drains, damage specs). */
export const MY_POOL = 'me';
/**
 * Phase 38h-2 (ROADMAP 38h): a drain is kept over damage specs unless they are worth more than (1 + this) × its value;
 * within 10% the line calls it a close call.
 */
export const DRAIN_CLOSE_CALL = 0.1;

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
  /** Phase 38b: energy (%) every pool gets at the row's end (Death Charge on the row's kills); undefined = 0. */
  restore?: number;
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
  /** Phase 38h-2: the drain's value in boss HP (H × g ÷ (1 + g)); undefined = 0. */
  value?: number;
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
  /** Net damage of one spec on this row (> 0; rows list only the useful weapons): its value in HP (phase 38h-2). */
  net: number;
  /**
   * Phase 38h-3b: a filler weapon, spent only from energy nothing else uses (the DP maximises the HP of the drains and
   * the other damage specs first, then the filler's HP; `hp` counts both).
   */
  filler?: boolean;
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
  /**
   * Phase 40d review: seconds saved per net damage of a damage spec when it is not seconds ÷ damage (a row of a
   * time-split phase: 1 ÷ (multiplier × the blended rate), `PhaseTime.blendDps`).
   */
  secondsPerDamage?: number;
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
  /**
   * Phase 38b (Liquid adrenaline): spends on a row whose start (clock) is before this time cost
   * {@link ADRENALINE_COST_FACTOR} of their energy. Undefined = full cost everywhere.
   */
  halfCostUntil?: number;
}

/** Phase 38b: the cost factor of spends on a row (Liquid adrenaline active at its start: 0.5, else 1). */
export const costFactorAt = (p: Pick<AllocationProblem, 'halfCostUntil'>, row: Pick<BudgetRow, 'start'>): number => (
  p.halfCostUntil !== undefined && row.start < p.halfCostUntil - EPS ? ADRENALINE_COST_FACTOR : 1);

/**
 * Phase 38b: the energy a row's damage specs cost: full, or {@link ADRENALINE_COST_FACTOR} of it on a row starting while
 * Liquid adrenaline is active (`costFactorAt`). Phase 38h-2: the window guard (a row running past the window paid full
 * cost for the specs only its later regen funds) is gone with the seconds objective: a row's specs cost what its start
 * says.
 */
export const damageSpecCost = (
  p: Pick<AllocationProblem, 'halfCostUntil'>,
  row: Pick<BudgetRow, 'start'>,
  choices: Pick<DamageChoice, 'weapon' | 'cost'>[],
  counts: Record<string, number>,
): number => costFactorAt(p, row) * choices.reduce((t, c) => t + (counts[c.weapon] ?? 0) * c.cost, 0);

/** Phase 38b: a pool's energy after the row's cap and its Death Charge restore (capped again). */
const restored = (e: number, row: Pick<BudgetRow, 'restore'>): number => Math.min(SPEC_MAX_ENERGY, Math.min(SPEC_MAX_ENERGY, e) + (row.restore ?? 0));

/**
 * Phase 38b: Death Charge casts over an encounter's kills (clock times, any order): which kills restore energy. Greedy:
 * a cast just before the first kill no cast covers, when the cooldown allows (ready at `readyAt`, the encounter's start:
 * the raid's gaps between encounters exceed the 60 s cooldown); it covers the next kills within its window, at most
 * `perCast`. Returns a flag per kill (input order).
 */
export const deathChargeSchedule = (
  kills: number[],
  readyAt = 0,
  perCast = DEATH_CHARGE_KILLS_PER_CAST,
  window = DEATH_CHARGE_WINDOW_SECONDS,
  cooldown = DEATH_CHARGE_COOLDOWN_SECONDS,
): boolean[] => {
  const order = kills.map((t, i) => ({ t, i })).sort((a, b) => (a.t - b.t) || (a.i - b.i));
  const out = kills.map(() => false);
  let cast = -Infinity;
  let used = 0;
  let ready = readyAt;
  order.forEach(({ t, i }) => {
    if (!Number.isFinite(t)) return;
    if (t <= cast + window + EPS && used < perCast) {
      used += 1;
      out[i] = true;
    } else if (t + EPS >= ready) {
      cast = t;
      used = 1;
      ready = t + cooldown;
      out[i] = true;
    }
  });
  return out;
};

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
  /** Phase 38h-2: the plan's value in boss HP (drains + damage specs, without the close-call weight). */
  hp: number;
  /** The rows' seconds under the plan (reported, not chosen on). */
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
  if (o.secondsPerDamage !== undefined) return Math.max(0, o.seconds - Math.min(o.damage, removed) * o.secondsPerDamage) + extra;
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
  // phase 37 (speed): every state has the start's pools (spends and regen only replace them), so the pools in a row's
  // key are fixed per row
  const poolIds = Object.keys(p.start).sort();
  const keyGroups = p.rows.map((_, i) => poolIds.filter((g) => p.keepEnd || g === dmgGroup || (lastSpend.get(g) ?? -1) >= i));
  const keyAt = (i: number, s: PoolState) => keyGroups[i]
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
  // phase 38h-2: the objective is boss HP (`w` = drains × (1 + DRAIN_CLOSE_CALL) + damage specs' net), then (phase
  // 38h-3b) the filler weapons' net (`fw`: energy left after the rest), then the earlier options (`pref`), then fewer
  // specs; `hp` (unweighted, filler included) and `seconds` are reported along
  type Val = {
    w: number, fw: number, hp: number, pref: number, seconds: number, specs: number, decision: RowDecision, after: PoolState, next: string | null,
  };
  const memo = new Map<string, Val>();
  const better = (a: Val, b: Val | null) => !b
    || a.w > b.w + EPS || (Math.abs(a.w - b.w) <= EPS && (a.fw > b.fw + EPS || (Math.abs(a.fw - b.fw) <= EPS
      && (a.pref < b.pref || (a.pref === b.pref && a.specs < b.specs)))));
  const keep = 1 + DRAIN_CLOSE_CALL;

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
      const factor = costFactorAt(p, p.rows[i]);
      for (let ei = 0; ei < p.events.length && s; ei++) {
        if (ch[ei] === undefined || ch[ei] < 0) continue;
        for (const sp of p.events[ei].options[ch[ei]].spends) {
          if (sp.row !== i || sp.specs <= 0) continue;
          const g: number[] | undefined = s[sp.group];
          const paid: number[] | null = g ? spendFromGroup(g, sp.specs, sp.cost * factor) : null;
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
      // phase 38b: Liquid adrenaline halves the damage specs' cost on a row starting inside its window
      const cheap = factor === 1 ? o.damageSpecs : o.damageSpecs.map((c) => ({ ...c, cost: c.cost * factor }));
      const mine = regen[dmgGroup]?.[0] ?? 0;
      // with a pending dose, the row's specs may use it (drunk below 100%, or right after the first spec)
      const combosD = o.damageSpecs.length && regen[dmgGroup]?.length
        ? damageCombos(cheap, mine + (dose ? SURGE_DOSE_ENERGY : 0)) : [{}];
      const drainSpecs = starting.reduce((t, ei, j) => t + countSpecs(p.events[ei].options[combo[j]].counts), 0);
      const drainValue = starting.reduce((t, ei, j) => t + Math.max(0, p.events[ei].options[combo[j]].value ?? 0), 0);
      const pref = combo.reduce((t, oi) => t + oi, 0);
      for (const d of combosD) {
        // a pending dose may be drunk now (if the bar is below 100% or a spec is made: the potion does nothing at
        // 100%) or kept for a later row
        for (const drink of dose ? [false, true] : [false]) {
          const spent = damageSpecCost(p, row, o.damageSpecs, d);
          if (drink && !(spent > 0 || mine < SPEC_MAX_ENERGY - EPS)) continue;
          if (spent > mine + (drink ? SURGE_DOSE_ENERGY : 0) + EPS) continue;
          const after: PoolState = {};
          Object.keys(regen).forEach((gid) => {
            const list = regen[gid].map((e, k) => (gid === dmgGroup && k === 0 ? e - spent + (drink ? SURGE_DOSE_ENERGY : 0) : e));
            after[gid] = list.map((e) => restored(e, row)).sort((x, y) => y - x);
          });
          const secs = rowSecondsAfter(o, d);
          // review 38h-2: damage specs can't take more than the row's damage off it (38h-3b: the filler's share is
          // what it adds above the other weapons')
          const sumOf = (filler: boolean) => o.damageSpecs.reduce((t, c) => (!!c.filler === filler ? t + (d[c.weapon] ?? 0) * c.net : t), 0);
          const cap = (x: number) => (o.damage > 0 ? Math.min(o.damage, x) : x);
          const mainSum = sumOf(false);
          const mainHp = cap(mainSum);
          const fillHp = cap(mainSum + sumOf(true)) - mainHp;
          const nxt = solve(i + 1, after, ch, dose && !drink);
          const cand: Val = {
            w: drainValue * keep + mainHp + (nxt?.v.w ?? 0),
            fw: fillHp + (nxt?.v.fw ?? 0),
            hp: drainValue + mainHp + fillHp + (nxt?.v.hp ?? 0),
            pref: pref + (nxt?.v.pref ?? 0),
            seconds: secs + (nxt?.v.seconds ?? 0),
            specs: drainSpecs + countSpecs(d) + (nxt?.v.specs ?? 0),
            decision: {
              started: starting.map((ei, j) => ({ event: ei, option: combo[j] })), damage: d, seconds: secs, ...(drink || (pending && !dose) ? { surge: true } : {}),
            },
            after,
            next: nxt?.key ?? null,
          };
          if (!Number.isFinite(cand.w)) continue;
          if (better(cand, best)) best = cand;
        }
      }
    }
    // no affordable decision: a spend an earlier option scheduled for this row can't be paid (a dead path; the root
    // always has one: every option 0)
    if (!best) {
      best = {
        w: -Infinity, fw: -Infinity, hp: -Infinity, pref: Infinity, seconds: Infinity, specs: Infinity, decision: { started: [], damage: {}, seconds: Infinity }, after: state, next: null,
      };
    }
    memo.set(key, best);
    return { key, v: best };
  };

  if (!p.rows.length) {
    return {
      hp: 0, seconds: 0, specs: 0, options: p.events.map(() => 0), rows: [], end: p.start,
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
    hp: root.v.hp,
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
 * Whether option `b` (at index `bi`) makes option `a` (at `ai`) useless (phase 38h-2: in boss HP): `b` spends no more
 * energy from any pool at any row (so whatever `a` allows later, `b` allows too), every damage spec on the event's rows
 * is worth at least as much (net HP, no dearer), and `b` is worth more, or as much and listed earlier (the DP's tie-break).
 * Exact, so pruning keeps the DP's optimum.
 */
export const optionDominates = (
  b: { option: EventOption, rows: RowOutcome[] },
  a: { option: EventOption, rows: RowOutcome[] },
  bi = 0,
  ai = 1,
): boolean => {
  const vb = spendVector(b.option);
  const va = spendVector(a.option);
  for (const [k, e] of vb) if (e > (va.get(k) ?? 0) + EPS) return false;
  const xb = b.option.value ?? 0;
  const xa = a.option.value ?? 0;
  if (!(xb > xa + EPS || (Math.abs(xb - xa) <= EPS && bi < ai))) return false;
  return b.rows.every((rb, i) => a.rows[i].damageSpecs.every((ca) => {
    const cb = rb.damageSpecs.find((x) => x.weapon === ca.weapon);
    return !!cb && cb.cost <= ca.cost + EPS && cb.net >= ca.net - EPS;
  }));
};

/**
 * The options of an event worth keeping (indices, in order; option 0 is always kept): an option dominated by another
 * ({@link optionDominates}) can never be part of a better plan.
 */
export const prunedOptions = (options: { option: EventOption, rows: RowOutcome[] }[]): number[] => options
  .map((_, i) => i)
  .filter((i) => i === 0 || !options.some((o, j) => j !== i && optionDominates(o, options[i], j, i)));

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
    const factor = costFactorAt(p, p.rows[i]);
    for (let ei = 0; ei < p.events.length; ei++) {
      for (const sp of p.events[ei].options[d.options[ei]].spends) {
        if (sp.row !== i || sp.specs <= 0) continue;
        const paid = s[sp.group] ? spendFromGroup(s[sp.group], sp.specs, sp.cost * factor) : null;
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
    const mine = s[dmgGroup]?.[0] ?? 0;
    const drink = pending && i === d.drinkRow;
    const spent = damageSpecCost(p, row, o.damageSpecs, counts);
    if (drink && !(spent > 0 || mine < SPEC_MAX_ENERGY - EPS)) return { feasible: false, seconds: Infinity, end: s };
    if (spent > mine + (drink ? SURGE_DOSE_ENERGY : 0) + EPS) return { feasible: false, seconds: Infinity, end: s };
    if (drink) pending = false;
    if (s[dmgGroup]?.length) s[dmgGroup] = [mine - spent + (drink ? SURGE_DOSE_ENERGY : 0), ...s[dmgGroup].slice(1)];
    for (const gid of Object.keys(s)) s[gid] = s[gid].map((e) => restored(e, row)).sort((x, y) => y - x);
    total += rowSecondsAfter(o, counts);
  }
  return { feasible: true, seconds: total, end: s };
};

/** The drink row of a DP result (the row flagged `surge`), −1 when no dose was drunk. */
export const drinkRowOf = (r: Pick<AllocationResult, 'rows'>): number => r.rows.findIndex((x) => x.surge);
