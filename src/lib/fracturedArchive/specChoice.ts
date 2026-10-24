import { MySpecs } from '@/lib/fracturedArchive/presets';
import {
  DrainModel, PlannerWeapon, specAttempts,
} from '@/lib/fracturedArchive/specs';
import {
  ayakOutcome, DEFAULT_FLOOR_THRESHOLD, DefenceDrainWeapon, formatProbability, recommendCarriers,
} from '@/lib/fracturedArchive/teamSpecs';

/**
 * Phase 29: the planner decides the spec weapons. Pure and React-free (the planner runs it in the worker; Jest tests it
 * on toys). Docs: docs/BEST_SETUP.md, *Spec weapons (phase 29)*.
 *
 * - Solo ({@link searchSpecSubsets}): every subset of the drain weapons is a candidate; a subset's drain state is the
 *   Solo plan of those weapons within your spec energy, and it costs one inventory slot per weapon not carried anyway.
 *   Subsets with the same drain state on every phase (same `signature`) are one candidate (the one with the fewest
 *   slots). Each candidate is timed with a quick optimiser run, the best few with the full one; the fastest wins
 *   (ties: fewer slots, fewer weapons). Per weapon: the route time it saves (or would save) and its slots.
 * - Team ({@link teamRoles}): per boss / phase the fewest carriers reaching P(floor) ≥ threshold from the first round
 *   (teamSpecs.ts `recommendCarriers`), then per weapon the most any boss needs; Eye of Ayak only with mages in the
 *   party. Your share ({@link assignMe}): the most-needed weapon, carried only if it costs you no route time worth having.
 */

/** Order of the spec candidates (also the tie order of the "most needed" weapon). */
export const SPEC_CANDIDATES: PlannerWeapon[] = ['elderMaul', 'dwh', 'bgs', 'tonalztics', 'ayak'];

/** Tie order for the most-needed weapon (the usual drain weapons first). */
const ROLE_ORDER: PlannerWeapon[] = ['elderMaul', 'tonalztics', 'dwh', 'bgs', 'ayak'];

const WEAPON_LABELS: Record<PlannerWeapon, string> = {
  elderMaul: 'Elder maul', dwh: 'DWH', bgs: 'BGS', tonalztics: 'Tonalztics', ayak: 'Eye of Ayak',
};
export const specWeaponLabel = (w: PlannerWeapon): string => WEAPON_LABELS[w];

/** Most Eye of Ayak specs the planner's Solo plan asks for (it stops at P(magic def 0) ≥ threshold: `ayakAuto`). */
export const AUTO_AYAK_SPECS = 10;

/** "Specs I bring" (`mySpecs`) of a subset (the planner's Solo drain state): Ayak until magic def 0, Defence drains first. */
export const mySpecsForSubset = (subset: PlannerWeapon[], base: Pick<MySpecs, 'lightbearer'>): MySpecs => ({
  elderMaul: subset.includes('elderMaul'),
  dwh: subset.includes('dwh'),
  bgs: subset.includes('bgs'),
  tonalztics: subset.includes('tonalztics'),
  ayak: subset.includes('ayak') ? AUTO_AYAK_SPECS : 0,
  ayakAuto: subset.includes('ayak'),
  lightbearer: base.lightbearer,
  priority: 'defence',
});

/** The weapons of "Specs I bring" (Ayak when its count is > 0). */
export const subsetOfMySpecs = (m: MySpecs): PlannerWeapon[] => SPEC_CANDIDATES
  .filter((w) => (w === 'ayak' ? m.ayak > 0 : m[w as 'elderMaul' | 'dwh' | 'bgs' | 'tonalztics']));

/** Every subset of `weapons` (in candidate order inside each subset), the empty one first. */
export const allSubsets = <W>(weapons: W[]): W[][] => {
  const out: W[][] = [];
  for (let mask = 0; mask < (1 << weapons.length); mask++) {
    out.push(weapons.filter((_, i) => (mask >> i) & 1));
  }
  return out.sort((a, b) => a.length - b.length);
};

// --- Solo: subset search -------------------------------------------------------------------------------------------

export interface SubsetProblem<W extends string> {
  weapons: W[];
  /** Same signature = same drain state on every phase (so only the cheapest such subset is timed). */
  signature: (s: W[]) => string;
  /** Inventory slots the subset takes (weapons not carried anyway). */
  slots: (s: W[]) => number;
  /** Route time with the subset (a cheap optimiser run); Infinity allowed. */
  quick: (s: W[]) => number;
  /** Route time with the subset (the full optimiser run). Default: `quick`. */
  full?: (s: W[]) => number;
  /** Candidates (by quick time) timed with `full` at least (default 3). */
  finalists?: number;
  /**
   * Phase 29 review: the quick-run guard. g = the best-by-quick subset's quick − full time (what the full run finds on
   * top of the quick one); every subset whose quick time is within `guard` × g of the best full time gets the full run
   * too (default {@link SUBSET_GUARD_FACTOR}; Infinity = every subset in full).
   */
  guard?: number;
  /**
   * Optional pruning: true when subset `s` can't be faster than `by` (e.g. every DPS of `s` ≤ the same DPS of `by`);
   * only asked for a `by` taking no more slots. A pruned subset is not timed (unless it neighbours the best).
   */
  dominated?: (s: W[], by: W[]) => boolean;
}

export interface SubsetEvaluation<W> {
  weapons: W[];
  seconds: number;
  slots: number;
  full: boolean;
}

export interface WeaponDelta<W> {
  weapon: W;
  chosen: boolean;
  /** Route seconds the weapon saves (chosen: vs the plan without it) or would save (not chosen: vs the plan with it). */
  deltaSeconds: number;
  /** Inventory slots it takes (chosen) or would take (not chosen). */
  deltaSlots: number;
}

/** Phase 29 review: per brought weapon, the fastest set timed that leaves it out. */
export interface BestWithout<W> {
  weapon: W;
  weapons: W[];
  seconds: number;
}

export interface SubsetSearchResult<W> {
  best: W[];
  seconds: number;
  /** Per brought weapon, the fastest set without it (full times). */
  bestWithout: BestWithout<W>[];
  /** Every subset timed (one per signature, plus the neighbours of the best), fastest first. */
  evaluated: SubsetEvaluation<W>[];
  /** Distinct drain states among the 2^n subsets. */
  signatures: number;
  /** Of those, pruned as dominated (not timed). */
  pruned: number;
  perWeapon: WeaponDelta<W>[];
  /** The weapon not brought that would save the most (null if every weapon is brought). */
  bestRejected: WeaponDelta<W> | null;
}

const EPS = 1e-9;

/** Phase 29 review: the subset search's quick-run guard factor (see `SubsetProblem.guard`). */
export const SUBSET_GUARD_FACTOR = 2;

const subsetKey = <W extends string>(weapons: W[], s: W[]) => weapons.filter((w) => s.includes(w)).join('+');

/** Fastest, then fewer slots, then fewer weapons, then the earlier subset (candidate order). */
const betterEval = <W>(a: SubsetEvaluation<W>, b: SubsetEvaluation<W>, order: (s: W[]) => number): boolean => {
  if (Math.abs(a.seconds - b.seconds) > EPS && a.seconds !== b.seconds) return a.seconds < b.seconds;
  if (a.slots !== b.slots) return a.slots < b.slots;
  if (a.weapons.length !== b.weapons.length) return a.weapons.length < b.weapons.length;
  return order(a.weapons) < order(b.weapons);
};

/** The Solo subset search (see the module comment). Deterministic. */
export const searchSpecSubsets = <W extends string>(p: SubsetProblem<W>): SubsetSearchResult<W> => {
  const subsets = allSubsets(p.weapons);
  const orderIx = new Map(subsets.map((s, i) => [subsetKey(p.weapons, s), i]));
  const order = (s: W[]) => orderIx.get(subsetKey(p.weapons, s)) ?? 0;
  // one representative per signature: the fewest slots, then the fewest weapons, then the earlier subset
  const reps = new Map<string, W[]>();
  subsets.forEach((s) => {
    const sig = p.signature(s);
    const old = reps.get(sig);
    if (!old || p.slots(s) < p.slots(old) || (p.slots(s) === p.slots(old) && s.length < old.length)) reps.set(sig, s);
  });
  const full = p.full ?? p.quick;
  const fullMemo = new Map<string, number>();
  const fullOf = (s: W[]) => {
    const k = subsetKey(p.weapons, s);
    if (!fullMemo.has(k)) fullMemo.set(k, full(s));
    return fullMemo.get(k)!;
  };
  // dominance pruning: cheapest first; a subset is dropped when a kept one with no more slots dominates it
  const sorted = Array.from(reps.values()).sort((a, b) => (p.slots(a) - p.slots(b)) || (a.length - b.length) || (order(a) - order(b)));
  const kept: W[][] = [];
  sorted.forEach((r) => {
    if (p.dominated && kept.some((q) => p.slots(q) <= p.slots(r) && p.dominated!(r, q))) return;
    kept.push(r);
  });
  const quickEvals: SubsetEvaluation<W>[] = kept.map((s) => ({
    weapons: s, seconds: p.quick(s), slots: p.slots(s), full: false,
  }));
  quickEvals.sort((a, b) => (betterEval(a, b, order) ? -1 : Number(betterEval(b, a, order))));
  // full runs: the best `finalists` by quick time, then every subset within the guard (review fix: a subset whose quick
  // run was unlucky can still win)
  const nFinal = Math.max(1, p.finalists ?? 3);
  const asFull = (e: SubsetEvaluation<W>) => ({ ...e, seconds: fullOf(e.weapons), full: true });
  let best = asFull(quickEvals[0]);
  const gap = Number.isFinite(quickEvals[0].seconds) && Number.isFinite(best.seconds) ? Math.max(0, quickEvals[0].seconds - best.seconds) : 0;
  const margin = (p.guard ?? SUBSET_GUARD_FACTOR) * gap;
  quickEvals.slice(1).forEach((e, i) => {
    if (i + 1 >= nFinal && !(p.guard === Infinity) && !(e.seconds <= best.seconds + margin + EPS)) return;
    const f = asFull(e);
    if (betterEval(f, best, order)) best = f;
  });
  // the fastest set without each brought weapon (the best quick one without it gets a full run)
  const bestWithout: BestWithout<W>[] = best.weapons.map((w) => {
    const top = quickEvals.find((e) => !e.weapons.includes(w));
    if (top) fullOf(top.weapons);
    let pick: { weapons: W[], seconds: number } | null = null;
    fullMemo.forEach((seconds, k) => {
      const weapons = (k ? k.split('+') : []) as W[];
      if (weapons.includes(w)) return;
      if (!pick || seconds < pick.seconds - EPS) pick = { weapons, seconds };
    });
    const found = pick as { weapons: W[], seconds: number } | null;
    return { weapon: w, weapons: found?.weapons ?? [], seconds: found?.seconds ?? Infinity };
  });

  // neighbours of the best: each weapon dropped / added (same signature and slots = the same problem)
  const timeOf = (s: W[]): number => {
    if (p.signature(s) === p.signature(best.weapons) && p.slots(s) === best.slots) return best.seconds;
    return fullOf(s);
  };
  const perWeapon: WeaponDelta<W>[] = p.weapons.map((w) => {
    const chosen = best.weapons.includes(w);
    const other = chosen ? best.weapons.filter((x) => x !== w) : p.weapons.filter((x) => x === w || best.weapons.includes(x));
    const t = timeOf(other);
    const dt = chosen ? t - best.seconds : best.seconds - t;
    let deltaSeconds = dt;
    if (!Number.isFinite(dt)) deltaSeconds = chosen ? Infinity : -Infinity;
    return {
      weapon: w,
      chosen,
      deltaSeconds,
      deltaSlots: chosen ? best.slots - p.slots(other) : p.slots(other) - best.slots,
    };
  });
  const rejected = perWeapon.filter((d) => !d.chosen)
    .sort((a, b) => (b.deltaSeconds - a.deltaSeconds) || (a.deltaSlots - b.deltaSlots));

  const evaluated = new Map<string, SubsetEvaluation<W>>();
  quickEvals.forEach((e) => evaluated.set(subsetKey(p.weapons, e.weapons), e));
  fullMemo.forEach((seconds, k) => {
    const weapons = (k ? k.split('+') : []) as W[];
    evaluated.set(k, {
      weapons, seconds, slots: p.slots(weapons), full: true,
    });
  });
  return {
    best: best.weapons,
    seconds: best.seconds,
    bestWithout,
    evaluated: Array.from(evaluated.values()).sort((a, b) => (betterEval(a, b, order) ? -1 : Number(betterEval(b, a, order)))),
    signatures: reps.size,
    pruned: reps.size - kept.length,
    perWeapon,
    bestRejected: rejected[0] ?? null,
  };
};

/** e.g. "Bring: Elder maul, Tonalztics" / "Bring: no spec weapons". */
export const bringText = (weapons: PlannerWeapon[]): string => (weapons.length
  ? `Bring: ${SPEC_CANDIDATES.filter((w) => weapons.includes(w)).map(specWeaponLabel).join(', ')}`
  : 'Bring: no spec weapons');

const fmtSeconds = (s: number) => (Number.isFinite(s) ? `${Math.abs(s).toFixed(1)} s` : '∞');

const signed = (s: number) => {
  if (!Number.isFinite(s)) return s > 0 ? '+∞' : '−∞';
  if (Math.abs(s) < 0.05) return '±0.0 s';
  return `${s > 0 ? '+' : '−'}${fmtSeconds(s)}`;
};

/**
 * One weapon's line, relative to this plan (review fix: the deltas are one-weapon changes of the chosen set, not what
 * the weapon is worth on its own): "dropping Elder maul from this plan: +104.4 s (frees 1 slot)" / "adding Tonalztics to
 * this plan: +49.6 s (1 slot)".
 */
export const weaponDeltaText = (d: WeaponDelta<PlannerWeapon>): string => {
  const slots = `${d.deltaSlots} slot${d.deltaSlots === 1 ? '' : 's'}`;
  const label = specWeaponLabel(d.weapon);
  // deltaSeconds = seconds saved by having the weapon; the route-time change of the move is its negative (or itself)
  if (d.chosen) return `dropping ${label} from this plan: ${signed(d.deltaSeconds)} (frees ${slots})`;
  return `adding ${label} to this plan: ${signed(-d.deltaSeconds)} (${slots})`;
};

/** "best without Elder maul: Tonalztics, 22:10.5" (`fmt` formats the route time). */
export const bestWithoutText = (b: BestWithout<PlannerWeapon>, fmt: (s: number) => string): string => (
  `best without ${specWeaponLabel(b.weapon)}: ${b.weapons.length ? SPEC_CANDIDATES.filter((w) => b.weapons.includes(w)).map(specWeaponLabel).join(' + ') : 'no spec weapons'}, ${fmt(b.seconds)}`
);

// --- seeds (phase 29 review) ---------------------------------------------------------------------------------------

export interface SeedSingle {
  /** Candidate index. */
  i: number;
  /** Its route time alone (Infinity allowed). */
  t: number;
  /** Tie-break score (higher first). */
  s: number;
  group: string;
}

/**
 * Optimiser seeds: the `n` fastest single loadouts plus the fastest of every style group (always kept, also when `n`
 * is small: review fix — a quick run used to take the first `n` of a list whose group bests were appended at the end).
 * Rank the singles under the drain state being optimised (each spec subset / carrier set its own).
 */
export const pickSeeds = (singles: SeedSingle[], groups: string[], n: number): number[] => {
  const sorted = [...singles].sort((a, b) => ((a.t === b.t ? 0 : a.t - b.t) || (b.s - a.s) || (a.i - b.i)));
  const out = sorted.slice(0, Math.max(0, n)).map((x) => x.i);
  groups.forEach((g) => {
    const top = sorted.find((x) => x.group === g);
    if (top && !out.includes(top.i)) out.push(top.i);
  });
  return out;
};

// --- Team: carriers as planner output (phase 29 review) ------------------------------------------------------------

export type CarrierCounts = Record<PlannerWeapon, number>;

export const NO_CARRIERS: CarrierCounts = {
  elderMaul: 0, dwh: 0, bgs: 0, tonalztics: 0, ayak: 0,
};

export interface CarrierStep {
  weapon: PlannerWeapon;
  /** Route seconds this carrier saved (vs the carriers before it). */
  saved: number;
  /** Route time after it. */
  seconds: number;
}

/**
 * The team's carriers, greedy: from no carriers, repeatedly add the one carrier (of any weapon) that lowers the route
 * time most, while that saves ≥ `minSaving` (default {@link SHARE_MAX_SLOT_SECONDS}); at most `perWeapon` of a weapon
 * and `total` in all (the party size). Deterministic (ties: the order of `weapons`).
 */
export const greedyCarriers = (p: {
  weapons: PlannerWeapon[],
  total: number,
  perWeapon?: number,
  /** Review 2: per-weapon caps on top of `perWeapon` (Eye of Ayak: the mages in the party). */
  caps?: Partial<CarrierCounts>,
  time: (c: CarrierCounts) => number,
  minSaving?: number,
  start?: CarrierCounts,
}): { carriers: CarrierCounts, steps: CarrierStep[], seconds: number } => {
  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  const minSaving = p.minSaving ?? SHARE_MAX_SLOT_SECONDS;
  let cur: CarrierCounts = { ...NO_CARRIERS, ...(p.start || {}) };
  let t = p.time(cur);
  const steps: CarrierStep[] = [];
  const count = (c: CarrierCounts) => Object.values(c).reduce((a, v) => a + v, 0);
  for (;;) {
    if (count(cur) >= p.total) break;
    let pick: { w: PlannerWeapon, c: CarrierCounts, t: number } | null = null;
    for (const w of p.weapons) {
      if (cur[w] >= Math.min(p.perWeapon ?? p.total, p.caps?.[w] ?? Infinity)) continue;
      const c = { ...cur, [w]: cur[w] + 1 };
      const tc = p.time(c);
      if (!pick || tc < pick.t - EPS) pick = { w, c, t: tc };
    }
    if (!pick) break;
    const saved = pick.t === t ? 0 : t - pick.t;
    if (!(saved >= minSaving - EPS)) break;
    cur = pick.c;
    t = pick.t;
    steps.push({ weapon: pick.w, saved, seconds: t });
  }
  return { carriers: cur, steps, seconds: t };
};

// --- Team: roles and your share ------------------------------------------------------------------------------------

export interface RoleTarget {
  key: string;
  /** e.g. "Archive Guardian (Flying)". */
  label: string;
  /** The boss without its phase (e.g. "Archive Guardian"): a boss whose every phase drives a count is named once. */
  group?: string;
  model: DrainModel;
}

export interface RoleTargetNeed {
  key: string;
  label: string;
  group: string;
  /** Fewest carriers reaching the threshold from the first round (null = none within the party, or no drain needed). */
  carriers: Partial<Record<DefenceDrainWeapon, number>> | null;
  pFloor: number;
  /** Eye of Ayak carriers for P(magic def 0) ≥ threshold (0 = not needed / no mages; null = none within the party). */
  ayak: number | null;
  /** e.g. "already at the floor", "no team of ≤ 6 reaches 95%". */
  note?: string;
}

export interface TeamRoleRow {
  weapon: PlannerWeapon;
  carriers: number;
  /** The bosses / phases that need this many (the ones driving the count). */
  drivers: string[];
  /** Phase 29 review (planner carriers): route seconds the last carrier of this weapon saves (vs one fewer). */
  lastSaved?: number;
}

export interface TeamRoles {
  partySize: number;
  mages: number;
  threshold: number;
  /** Weapons the team needs (carriers > 0), most carriers first (ties: ROLE_ORDER). */
  rows: TeamRoleRow[];
  perTarget: RoleTargetNeed[];
  /** e.g. "6-man: 2 Elder maul, 2 Tonalztics, 1 Eye of Ayak". */
  text: string;
  /**
   * Phase 29 review: the carriers the Team drain state uses (rows = these): 'auto' = picked by the planner
   * (`greedyCarriers`, `steps` = what each carrier saved in the order added), 'manual' = Advanced's counts.
   */
  carriers?: CarrierCounts;
  mode?: 'auto' | 'manual';
  steps?: CarrierStep[];
}

/**
 * Phase 29 review: the briefing rows of a carrier set: per weapon its carriers, what the last one saves and the
 * encounters it saves the most on (`marginal`: weapon → { saved, drivers }), most carriers first (ties: ROLE_ORDER).
 */
export const rowsFromCarriers = (
  carriers: CarrierCounts,
  marginal: (w: PlannerWeapon) => { saved: number, drivers: string[] },
): TeamRoleRow[] => ROLE_ORDER.filter((w) => carriers[w] > 0).map((w) => {
  const m = marginal(w);
  return {
    weapon: w, carriers: carriers[w], drivers: m.drivers, lastSaved: m.saved,
  };
}).sort((a, b) => (b.carriers - a.carriers) || (ROLE_ORDER.indexOf(a.weapon) - ROLE_ORDER.indexOf(b.weapon)));

/** "6-man: 2 Elder maul, 2 Tonalztics" / "6-man: no spec carriers". */
export const carriersText = (partySize: number, rows: TeamRoleRow[]): string => (rows.length
  ? `${partySize}-man: ${rows.map((r) => `${r.carriers} ${specWeaponLabel(r.weapon)}`).join(', ')}`
  : `${partySize}-man: no spec carriers`);

/** Eye of Ayak carriers (2 specs each from 100%) for P(magic def 0) ≥ threshold; null if none within the party. */
const ayakCarriers = (model: DrainModel, partySize: number, threshold: number): number | null => {
  if (!model.canHit.ayak || model.magicDef <= 0) return 0;
  const per = specAttempts(100, model.energy.ayak);
  for (let n = 1; n <= partySize; n++) {
    if (ayakOutcome(model, n * per, threshold).pZero >= threshold) return n;
  }
  return null;
};

/** The bosses driving a count: a boss once when all its phases do, else each driving phase. */
const driversOf = (needs: RoleTargetNeed[], drives: (n: RoleTargetNeed) => boolean): string[] => {
  const out: string[] = [];
  Array.from(new Set(needs.map((n) => n.group))).forEach((g) => {
    const phases = needs.filter((n) => n.group === g);
    const driving = phases.filter(drives);
    if (!driving.length) return;
    if (driving.length === phases.length) out.push(g);
    else out.push(...driving.map((n) => n.label));
  });
  return out;
};

/**
 * The team briefing: per boss / phase the fewest carriers (recommendCarriers: one weapon or a hammer + finisher pair),
 * then per weapon the most any boss needs. Weapons no boss needs get 0 (not listed); Eye of Ayak only when
 * `mages` > 0.
 */
export const teamRoles = (
  targets: RoleTarget[],
  opts: { partySize: number, mages: number, threshold?: number },
): TeamRoles => {
  const threshold = opts.threshold ?? DEFAULT_FLOOR_THRESHOLD;
  const partySize = Math.max(1, Math.floor(opts.partySize));
  const perTarget: RoleTargetNeed[] = targets.map((t0) => {
    const t = { ...t0, group: t0.group ?? t0.label };
    const rec = recommendCarriers(t.model, { partySize, threshold });
    const ayak = opts.mages > 0 ? ayakCarriers(t.model, partySize, threshold) : 0;
    if (t.model.def <= t.model.floor) {
      return {
        key: t.key, label: t.label, group: t.group, carriers: null, pFloor: 1, ayak, note: 'already at the Defence floor',
      };
    }
    if (!rec.best) {
      return {
        key: t.key, label: t.label, group: t.group, carriers: null, pFloor: 0, ayak, note: rec.text.replace(/^[^:]*: /, ''),
      };
    }
    return {
      key: t.key, label: t.label, group: t.group, carriers: rec.best.carriers, pFloor: rec.best.pFloor, ayak,
    };
  });
  const need = (n: RoleTargetNeed, w: PlannerWeapon) => (w === 'ayak' ? n.ayak ?? 0 : n.carriers?.[w as DefenceDrainWeapon] ?? 0);
  const rows: TeamRoleRow[] = ROLE_ORDER.map((w) => {
    const carriers = Math.max(0, ...perTarget.map((n) => need(n, w)));
    return {
      weapon: w,
      carriers,
      drivers: carriers > 0 ? driversOf(perTarget, (n) => need(n, w) === carriers) : [],
    };
  }).filter((r) => r.carriers > 0)
    .sort((a, b) => (b.carriers - a.carriers) || (ROLE_ORDER.indexOf(a.weapon) - ROLE_ORDER.indexOf(b.weapon)));
  const text = rows.length
    ? `${partySize}-man: ${rows.map((r) => `${r.carriers} ${specWeaponLabel(r.weapon)}`).join(', ')}`
    : `${partySize}-man: no spec carriers needed`;
  return {
    partySize, mages: opts.mages, threshold, rows, perTarget, text,
  };
};

/** The weapon whose carrier count is hardest to fill (most carriers; ties: ROLE_ORDER), among `allowed`. */
export const mostNeededWeapon = (roles: TeamRoles, allowed: (w: PlannerWeapon) => boolean = () => true): PlannerWeapon | null => {
  const rows = roles.rows.filter((r) => allowed(r.weapon));
  if (!rows.length) return null;
  // review 2: ties on the carrier count go to the weapon whose last carrier saves the most (then ROLE_ORDER)
  const most = Math.max(...rows.map((r) => r.carriers));
  return rows.filter((r) => r.carriers === most)
    .sort((a, b) => ((b.lastSaved ?? 0) - (a.lastSaved ?? 0)) || (ROLE_ORDER.indexOf(a.weapon) - ROLE_ORDER.indexOf(b.weapon)))[0].weapon;
};

/** Phase 29: carrying your share is worth it only if the slot it takes costs you less than this much route time. */
export const SHARE_MAX_SLOT_SECONDS = 1;

export interface ShareDecision {
  weapon: PlannerWeapon | null;
  carry: boolean;
  reason: string;
}

/**
 * The "assign me" rule. The Team drain state counts every carrier whoever it is, so carrying a weapon gains *you*
 * nothing; you carry the most-needed weapon only when it costs you nothing worth having: it is carried anyway (pinned),
 * the kit has a free slot, or the slot it takes is worth < {@link SHARE_MAX_SLOT_SECONDS} of route time as gear.
 */
export const assignMe = (opts: {
  weapon: PlannerWeapon | null,
  carriers?: number,
  carriedAnyway: boolean,
  freeSlots: number,
  /** Route time the kit loses with one slot fewer (undefined when not computed: a free slot or carried anyway). */
  slotValueSeconds?: number,
}): ShareDecision => {
  const { weapon } = opts;
  if (!weapon) return { weapon: null, carry: false, reason: 'the team needs no spec weapons on this route' };
  const label = specWeaponLabel(weapon);
  const need = opts.carriers ? ` (most needed: ${opts.carriers} carrier${opts.carriers === 1 ? '' : 's'})` : '';
  if (opts.carriedAnyway) return { weapon, carry: true, reason: `${label}${need}: already in your inventory, no extra slot` };
  if (opts.freeSlots >= 1) return { weapon, carry: true, reason: `${label}${need}: fits in a free slot` };
  const v = opts.slotValueSeconds ?? Infinity;
  if (v < SHARE_MAX_SLOT_SECONDS) {
    return { weapon, carry: true, reason: `${label}${need}: its slot was worth only ${v.toFixed(1)} s of gear` };
  }
  return {
    weapon,
    carry: false,
    reason: `none: your last slot is worth ${Number.isFinite(v) ? `${v.toFixed(1)} s` : 'more than the route'} as gear — let a teammate carry ${label}${need}`,
  };
};

/** e.g. "2 Tonalztics → 97%" for one boss. */
export const describeNeed = (n: RoleTargetNeed): string => {
  if (!n.carriers) return n.note ?? '—';
  const parts = (['elderMaul', 'dwh', 'tonalztics', 'bgs'] as DefenceDrainWeapon[])
    .filter((w) => n.carriers![w]).map((w) => `${n.carriers![w]} ${specWeaponLabel(w)}`);
  return `${parts.join(' + ')} → ${formatProbability(n.pFloor)}`;
};
