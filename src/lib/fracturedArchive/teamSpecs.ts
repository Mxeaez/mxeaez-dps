import { INITIAL_MONSTER_INPUTS } from '@/lib/Monsters';
import { DefenceReductions } from '@/lib/fracturedArchive/drains';
import {
  accuracyAt, DrainModel, energyBudget, PlanLabel, planLabel, planLabelText, PlannerWeapon, SpecOutcome, specAttempts,
  tonalzticOutcomes,
} from '@/lib/fracturedArchive/specs';

/**
 * Spec drain planners (phase 14): exact probabilities, no simulation. Pure and React-free (phase 17 reuses them).
 *
 * The state is the boss's Defence level. Each spec attempt has an outcome distribution (`DrainModel.outcomes`, from
 * upstream's spec hit distribution, specs.ts); the Defence distribution after a sequence of attempts is a convolution
 * over those outcomes ({@link defenceDistribution}), with the same rounding and floor as upstream's
 * `applyDefenceReductions`. Attempts are applied in upstream's order (Elder maul, DWH, Tonalztics, BGS), so every
 * state maps back to `defenceReductions` inputs (landed maul / DWH specs, landed Tonalztics hits, BGS damage) that
 * reproduce it exactly in the calculator. Eye of Ayak is a separate state (Magic defence bonus, {@link ayakOutcome}).
 *
 * Phase 38g-2: the drain line's plan ({@link bestDrainPlan}) rolls each spec at the Defence the earlier ones leave
 * ({@link outcomesAt}). Phase 38h-1: so does everything else ({@link defenceOutcome}: the block order of the attempts
 * that lands the floor most often; the drain states, the spec budget, the carriers), and the drains made are the line's
 * plan ({@link kitDrainPlan}); was upstream's order with every spec at the undrained hit chance. {@link defenceDistribution}
 * keeps the old model (a given order, undrained rolls) for the tests and `defenceAtThreshold`.
 *
 * Which Defence the DPS ranking uses ({@link rankedDefence}): the floor if P(floor) ≥ threshold (default 95%), else
 * the reachable Defence nearest to the expected Defence. Same for Ayak: Magic defence 0 if
 * P(0) ≥ threshold, else bonus − expected drain.
 */

export type DefenceDrainWeapon = 'elderMaul' | 'dwh' | 'tonalztics' | 'bgs';
/** Upstream's `applyDefenceReductions` order. */
export const DEFENCE_DRAIN_ORDER: DefenceDrainWeapon[] = ['elderMaul', 'dwh', 'tonalztics', 'bgs'];
export const DEFAULT_FLOOR_THRESHOLD = 0.95;
/** Phase 38g: the most specs {@link neededSpecs} / the drain facts try (4 bars of 50% specs). */
export const MAX_FLOOR_SPECS = 8;

const LABELS: Record<PlannerWeapon, string> = {
  elderMaul: 'Elder maul', dwh: 'DWH', tonalztics: 'Tonalztics', bgs: 'BGS', ayak: 'Ayak',
};

export interface DrainCounts {
  elderMaul: number;
  dwh: number;
  /** Landed Tonalztics hits. */
  tonalztic: number;
  /** BGS damage dealt. */
  bgs: number;
}

const ZERO_COUNTS: DrainCounts = {
  elderMaul: 0, dwh: 0, tonalztic: 0, bgs: 0,
};

/** Defence after one attempt's outcome (upstream rounding: % of current Defence rounded down, floor applied each step). */
export const applyOutcome = (
  model: Pick<DrainModel, 'floor' | 'magicLevel'>,
  weapon: DefenceDrainWeapon,
  def: number,
  o: SpecOutcome,
): number => {
  let d = def;
  switch (weapon) {
    case 'elderMaul':
      for (let i = 0; i < o.hits; i++) d = Math.max(model.floor, d - Math.trunc(d * 35 / 100));
      break;
    case 'dwh':
      for (let i = 0; i < o.hits; i++) d = Math.max(model.floor, d - Math.trunc(d * 3 / 10));
      break;
    case 'tonalztics':
      for (let i = 0; i < o.hits; i++) d = Math.max(model.floor, d - Math.trunc(model.magicLevel / 8));
      break;
    default:
      d = Math.max(model.floor, d - o.damage);
  }
  return d;
};

/** BGS counts the Defence it actually drained (not overflow into Str / Att / Magic), so the inputs reproduce the state. */
const addCounts = (c: DrainCounts, weapon: DefenceDrainWeapon, o: SpecOutcome, defDrop: number): DrainCounts => {
  switch (weapon) {
    case 'elderMaul': return { ...c, elderMaul: c.elderMaul + o.hits };
    case 'dwh': return { ...c, dwh: c.dwh + o.hits };
    case 'tonalztics': return { ...c, tonalztic: c.tonalztic + o.hits };
    default: return { ...c, bgs: c.bgs + defDrop };
  }
};

export interface DefenceState {
  def: number;
  p: number;
  /** Landed drains that reach this Defence (the first combination found; others give the same Defence). */
  counts: DrainCounts;
}

/** Sorts a sequence of attempts into upstream's order (so the states map back to defenceReductions). */
export const inUpstreamOrder = (attempts: DefenceDrainWeapon[]): DefenceDrainWeapon[] => [...attempts]
  .sort((a, b) => DEFENCE_DRAIN_ORDER.indexOf(a) - DEFENCE_DRAIN_ORDER.indexOf(b));

/** Exact Defence distribution after a sequence of spec attempts (applied in the given order). Sorted by Defence. */
export const defenceDistribution = (
  model: Pick<DrainModel, 'def' | 'floor' | 'magicLevel' | 'outcomes'>,
  attempts: DefenceDrainWeapon[],
): DefenceState[] => {
  let states = new Map<number, DefenceState>([[model.def, { def: model.def, p: 1, counts: { ...ZERO_COUNTS } }]]);
  for (const w of attempts) {
    const next = new Map<number, DefenceState>();
    for (const s of states.values()) {
      for (const o of model.outcomes[w]) {
        if (o.p > 0) {
          const def = applyOutcome(model, w, s.def, o);
          const existing = next.get(def);
          if (existing) {
            existing.p += s.p * o.p;
          } else {
            next.set(def, { def, p: s.p * o.p, counts: addCounts(s.counts, w, o, s.def - def) });
          }
        }
      }
    }
    states = next;
  }
  return [...states.values()].sort((a, b) => a.def - b.def);
};

export interface DefenceOutcome {
  /** P(Defence at the floor). */
  pFloor: number;
  expectedDef: number;
  /** Lowest reachable Defence (every attempt landing well). */
  bestCaseDef: number;
  /** Defence the DPS ranking uses (see {@link rankedDefence}) and the landed drains that give it. */
  rankedDef: number;
  rankedCounts: DrainCounts;
  /** Phase 38h-1 ({@link defenceOutcome}): the order the specs are sent in (weapon blocks). */
  steps?: DrainStep[];
}

/**
 * Floor if P(floor) ≥ threshold, else the reachable Defence nearest to the expected Defence (the higher one on a tie).
 * (Rounding *up* to a reachable state was tried: with few states it can jump back to the undrained Defence, e.g. The
 * Smorks after 2 maul attempts: states 93 / 143 / 220, expected 145 → 220.)
 */
export const rankedDefence = (
  states: DefenceState[],
  floor: number,
  threshold = DEFAULT_FLOOR_THRESHOLD,
): DefenceOutcome => {
  const pFloor = states.filter((s) => s.def <= floor).reduce((a, s) => a + s.p, 0);
  const expectedDef = states.reduce((a, s) => a + s.p * s.def, 0);
  const atFloor = states.find((s) => s.def <= floor);
  const ranked = pFloor >= threshold && atFloor
    ? atFloor
    : states.reduce((a, s) => (Math.abs(s.def - expectedDef) <= Math.abs(a.def - expectedDef) + 1e-9 ? s : a), states[0]);
  return {
    pFloor,
    expectedDef,
    bestCaseDef: states[0].def,
    rankedDef: ranked.def,
    rankedCounts: ranked.counts,
  };
};

// --- phase 38h-1: the drain specs roll at the Defence the earlier ones leave, in the line's order -------------------

const outcomesMemo = new WeakMap<object, Map<string, SpecOutcome[]>>();

/**
 * Phase 38g-2: one spec's outcomes at the current Defence `def`: rebuilt from the weapon's accuracy roll
 * (`DrainModel.accuracy`, specs.ts) where it has one: Elder maul / DWH / BGS scale their landing outcomes by
 * accuracy(def) ÷ accuracy(undrained); Tonalztics rolls its two hits (the second against the Defence an accurate first
 * hit leaves). Otherwise (guaranteed hits, hand-built models) the undrained outcomes. Phase 38h-1: memoised per model.
 */
export const outcomesAt = (
  model: Pick<DrainModel, 'def' | 'floor' | 'magicLevel' | 'outcomes' | 'accuracy'>,
  weapon: DefenceDrainWeapon,
  def: number,
): SpecOutcome[] => {
  const a = model.accuracy?.[weapon];
  if (!a || def === model.def) return model.outcomes[weapon];
  let memo = outcomesMemo.get(model);
  if (!memo) {
    memo = new Map();
    outcomesMemo.set(model, memo);
  }
  const key = `${weapon}|${def}`;
  let out = memo.get(key);
  if (!out) {
    if (weapon === 'tonalztics') {
      out = tonalzticOutcomes(a, def, Math.max(model.floor, def - Math.trunc(model.magicLevel / 8)));
    } else {
      const k = accuracyAt(a, def) / a.acc;
      const landing = model.outcomes[weapon].filter((o) => o.hits > 0).map((o) => ({ ...o, p: o.p * k }));
      const miss = 1 - landing.reduce((t, o) => t + o.p, 0);
      out = [{ p: miss, hits: 0, damage: 0 }, ...landing];
    }
    memo.set(key, out);
  }
  return out;
};

/** Phase 38g-2: one block of a drain plan: `count` specs of `weapon` in a row. */
export interface DrainStep {
  weapon: DefenceDrainWeapon;
  count: number;
}

/**
 * Phase 38h-1: the exact Defence distribution after these blocks in this order, each spec rolled at the Defence the
 * earlier ones leave ({@link outcomesAt}). Sorted by Defence; `counts` = the landed drains of the first way found.
 */
export const orderedDistribution = (
  model: Pick<DrainModel, 'def' | 'floor' | 'magicLevel' | 'outcomes' | 'accuracy'>,
  steps: DrainStep[],
): DefenceState[] => {
  let states = new Map<number, DefenceState>([[model.def, { def: model.def, p: 1, counts: { ...ZERO_COUNTS } }]]);
  steps.forEach(({ weapon: w, count }) => {
    for (let i = 0; i < count; i++) {
      const next = new Map<number, DefenceState>();
      states.forEach((s) => outcomesAt(model, w, s.def).forEach((o) => {
        if (o.p > 0) {
          const def = applyOutcome(model, w, s.def, o);
          const existing = next.get(def);
          if (existing) existing.p += s.p * o.p;
          else next.set(def, { def, p: s.p * o.p, counts: addCounts(s.counts, w, o, s.def - def) });
        }
      }));
      states = next;
    }
  });
  return [...states.values()].sort((a, b) => a.def - b.def);
};

/**
 * Phase 38h-1: landed drains that reproduce Defence `def` in upstream's order (`applyDefenceReductions`: maul, DWH,
 * Tonalztics hits, BGS damage). A state reached in another order (Tonalztics before the maul) can leave a higher
 * Defence than its landed drains do in upstream's order (a flat drain before a % drain removes less); then the maul /
 * DWH specs stay and the flat part is re-split: as many of its Tonalztics hits as fit, the rest as BGS damage (a flat
 * Defence drain while the Defence stays above 0). "BGS damage" here stands for any flat Defence drain: it appears in the
 * calculator's reductions even when nobody brings a BGS (review 38h-1).
 */
export const reproducingCounts = (
  model: Pick<DrainModel, 'def' | 'floor' | 'magicLevel'>,
  def: number,
  c: DrainCounts,
): DrainCounts => {
  const hit = { p: 1, hits: 1, damage: 0 };
  let d = model.def;
  for (let i = 0; i < c.elderMaul; i++) d = applyOutcome(model, 'elderMaul', d, hit);
  for (let i = 0; i < c.dwh; i++) d = applyOutcome(model, 'dwh', d, hit);
  const d1 = d;
  for (let i = 0; i < c.tonalztic; i++) d = applyOutcome(model, 'tonalztics', d, hit);
  d = Math.max(model.floor, d - c.bgs);
  // d1 < def is unreachable for FA weapons: d1 >= def whenever a flat drain precedes a % one (review 38h-1)
  if (d === def || d1 < def) return c;
  const flat = d1 - def;
  const k = Math.trunc(model.magicLevel / 8);
  const tonalztic = k > 0 ? Math.min(c.tonalztic, Math.floor(flat / k)) : 0;
  return { ...c, tonalztic, bgs: flat - tonalztic * k };
};

const permutations = <T>(xs: T[]): T[][] => (xs.length <= 1 ? [xs] : xs
  .flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((rest) => [x, ...rest])));

const outcomeMemo = new WeakMap<object, Map<string, DefenceOutcome>>();

/**
 * The Defence after a set of spec attempts and the Defence the ranking uses ({@link rankedDefence}). Phase 38h-1 (was
 * upstream's order with every spec at the undrained Defence): the specs are sent in the drain line's order
 * ({@link bestDrainPlan}: weapon blocks, each spec rolled at the Defence the earlier ones leave), the block order of
 * these attempts with the highest P(floor), then the lowest expected Defence, then the drain order (the weapon removing
 * the most Defence first). `rankedCounts` reproduce the ranked Defence in upstream's order ({@link reproducingCounts}).
 */
export const defenceOutcome = (
  model: Pick<DrainModel, 'def' | 'floor' | 'magicLevel' | 'outcomes' | 'accuracy'>,
  attempts: DefenceDrainWeapon[],
  threshold = DEFAULT_FLOOR_THRESHOLD,
): DefenceOutcome => {
  let memo = outcomeMemo.get(model);
  if (!memo) {
    memo = new Map();
    outcomeMemo.set(model, memo);
  }
  const counts = DEFENCE_DRAIN_ORDER.map((w) => attempts.filter((x) => x === w).length);
  const key = `${counts.join(',')}|${threshold}`;
  const hit = memo.get(key);
  if (hit) return hit;
  // the drain order (teamSpecs `drainOrder` without the can-hit filter): expected Defence removed by one spec, then upstream
  const drop = (w: DefenceDrainWeapon) => model.outcomes[w].reduce((t, o) => t + o.p * (model.def - applyOutcome(model, w, model.def, o)), 0);
  const used = DEFENCE_DRAIN_ORDER.filter((w, i) => counts[i] > 0)
    .sort((a, b) => (drop(b) - drop(a)) || (DEFENCE_DRAIN_ORDER.indexOf(a) - DEFENCE_DRAIN_ORDER.indexOf(b)));
  let best: { states: DefenceState[], steps: DrainStep[], p: number, ed: number } | undefined;
  // phase 38h-2: interleaved orders too (T T T → M M M → T T T), the search of the drain line's plan with exactly these
  // specs (`bestDrainPlan` `exact`); models without hit chances (hand-built toys) keep the block orders
  const full = model as Partial<DrainModel>;
  if (used.length > 1 && full.canHit && full.hitChance && full.energy && used.every((w) => full.canHit![w] && full.hitChance![w] > 0)) {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    const plan = bestDrainPlan(model as DrainModel, {
      weapons: used,
      maxSpecs: attempts.length,
      threshold,
      exact: Object.fromEntries(used.map((w) => [w, counts[DEFENCE_DRAIN_ORDER.indexOf(w)]])),
    });
    if (plan && plan.steps.length) {
      const states = orderedDistribution(model, plan.steps);
      best = {
        states, steps: plan.steps, p: plan.p, ed: plan.expectedDef,
      };
    }
  }
  if (!best) {
    permutations(used).forEach((order) => {
      const steps = order.map((w) => ({ weapon: w, count: counts[DEFENCE_DRAIN_ORDER.indexOf(w)] }));
      const states = orderedDistribution(model, steps);
      const p = states.filter((s) => s.def <= model.floor).reduce((t, s) => t + s.p, 0);
      const ed = states.reduce((t, s) => t + s.p * s.def, 0);
      // permutations of the drain-ordered list come in rank order, so the first of equals is the earlier
      if (!best || p > best.p + 1e-12 || (Math.abs(p - best.p) <= 1e-12 && ed < best.ed - 1e-9)) {
        best = {
          states, steps, p, ed,
        };
      }
    });
  }
  const b = best!;
  const o = rankedDefence(b.states, model.floor, threshold);
  const out: DefenceOutcome = { ...o, rankedCounts: reproducingCounts(model, o.rankedDef, o.rankedCounts), steps: b.steps };
  if (memo.size >= 20000) memo.clear();
  memo.set(key, out);
  return out;
};

/**
 * Expected number of attempts used until the floor is reached, attempting in the given order and stopping at the floor
 * (Σ over k < N of P(not at the floor after k attempts), so it is capped at N = attempts.length), and P(floor within
 * all N).
 */
export const expectedAttemptsToFloor = (
  model: Pick<DrainModel, 'def' | 'floor' | 'magicLevel' | 'outcomes'>,
  attempts: DefenceDrainWeapon[],
): { expected: number, pWithin: number } => {
  let states = new Map<number, number>([[model.def, 1]]);
  let expected = 0;
  const notAtFloor = () => [...states.entries()].filter(([d]) => d > model.floor).reduce((a, [, p]) => a + p, 0);
  for (const w of attempts) {
    expected += notAtFloor();
    const next = new Map<number, number>();
    for (const [def, p] of states) {
      if (def <= model.floor) {
        next.set(def, (next.get(def) || 0) + p);
      } else {
        for (const o of model.outcomes[w]) {
          const d = applyOutcome(model, w, def, o);
          next.set(d, (next.get(d) || 0) + p * o.p);
        }
      }
    }
    states = next;
  }
  return { expected, pWithin: 1 - notAtFloor() };
};

// --- Eye of Ayak ---------------------------------------------------------------------------------------------------

export interface AyakOutcome {
  attempts: number;
  /** P(Magic defence bonus reaches 0). 1 when it already is ≤ 0. */
  pZero: number;
  /** Expected drain = attempts × expected damage per spec, capped at the bonus (the spec's formula). */
  expectedDrain: number;
  /** Drain the DPS ranking uses: the whole bonus if pZero ≥ threshold, else the expected drain rounded down. */
  rankedDrain: number;
  magicDefAfter: number;
}

/** Exact P(Σ Ayak damage ≥ magic defence bonus) over `attempts` specs + the expected / ranked drain. */
const ayakOutcomeOf = (
  model: Pick<DrainModel, 'magicDef' | 'outcomes' | 'expectedDamage'>,
  attempts: number,
  threshold: number,
): AyakOutcome => {
  const target = Math.max(0, model.magicDef);
  if (target === 0) {
    return {
      attempts, pZero: 1, expectedDrain: 0, rankedDrain: 0, magicDefAfter: model.magicDef,
    };
  }
  // dist[s] = P(capped damage sum = s)
  let dist = new Float64Array(target + 1);
  dist[0] = 1;
  for (let i = 0; i < attempts; i++) {
    const next = new Float64Array(target + 1);
    for (let s = 0; s <= target; s++) {
      if (dist[s] > 0) {
        for (const o of model.outcomes.ayak) {
          next[Math.min(target, s + o.damage)] += dist[s] * o.p;
        }
      }
    }
    dist = next;
  }
  const pZero = dist[target];
  const expectedDrain = Math.min(target, Math.max(0, attempts) * model.expectedDamage.ayak);
  const rankedDrain = pZero >= threshold ? target : Math.floor(expectedDrain);
  return {
    attempts, pZero, expectedDrain, rankedDrain, magicDefAfter: model.magicDef - rankedDrain,
  };
};

const ayakMemo = new WeakMap<object, Map<string, AyakOutcome>>();

export const ayakOutcome = (
  model: Pick<DrainModel, 'magicDef' | 'outcomes' | 'expectedDamage'>,
  attempts: number,
  threshold = DEFAULT_FLOOR_THRESHOLD,
): AyakOutcome => {
  // phase 38h-2 (speed): memoised per model
  let memo = ayakMemo.get(model);
  if (!memo) {
    memo = new Map();
    ayakMemo.set(model, memo);
  }
  const mk = `${attempts}|${threshold}`;
  const hit = memo.get(mk);
  if (hit) return hit;
  const out = ayakOutcomeOf(model, attempts, threshold);
  if (memo.size >= 20000) memo.clear();
  memo.set(mk, out);
  return out;
};

// --- reductions / text ---------------------------------------------------------------------------------------------

/** `defenceReductions` inputs for landed drains + an Ayak drain (everything else reset). */
export const countsToReductions = (c: DrainCounts, ayak: number): DefenceReductions => ({
  ...INITIAL_MONSTER_INPUTS.defenceReductions,
  elderMaul: c.elderMaul,
  dwh: c.dwh,
  tonalztic: c.tonalztic,
  bgs: c.bgs,
  ayak,
});

const pct = (p: number): string => {
  if (p >= 0.9995 && p < 1) return '>99.9%';
  if (p > 0 && p < 0.001) return '<0.1%';
  return `${(p * 100).toFixed(p >= 0.995 || p < 0.1 ? 1 : 0)}%`;
};
export const formatProbability = pct;

const countAttempts = (attempts: PlannerWeapon[]): Partial<Record<PlannerWeapon, number>> => {
  const out: Partial<Record<PlannerWeapon, number>> = {};
  attempts.forEach((w) => { out[w] = (out[w] || 0) + 1; });
  return out;
};

/** e.g. "2× Elder maul + 2× Tonalztics" (attempts, not landed). */
export const describeAttempts = (attempts: PlannerWeapon[]): string => {
  const c = countAttempts(attempts);
  const parts = (['elderMaul', 'dwh', 'tonalztics', 'bgs', 'ayak'] as PlannerWeapon[])
    .filter((w) => c[w])
    .map((w) => `${c[w]}× ${LABELS[w]}`);
  return parts.length ? parts.join(' + ') : 'no specs';
};

export const describeDefence = (model: Pick<DrainModel, 'def' | 'floor'>, o: DefenceOutcome, hasAttempts: boolean): string => {
  if (!hasAttempts) return `Def ${model.def}`;
  const floorText = o.bestCaseDef > model.floor
    ? ` (floor ${model.floor} not reachable; best case Def ${o.bestCaseDef})`
    : `, P(Def ${model.floor}) ${pct(o.pFloor)}`;
  return `expected Def ${o.expectedDef.toFixed(0)}${floorText} → ranked at Def ${o.rankedDef}`;
};

// --- solo ----------------------------------------------------------------------------------------------------------

export interface SoloSpecInput {
  /** Defence drain weapons the player carries. */
  carried: Record<DefenceDrainWeapon, boolean>;
  /** Eye of Ayak specs the player wants to use (0 = no Ayak). */
  ayakSpecs: number;
  lightbearer: boolean;
  fightSeconds: number;
  /** What the energy goes to first when it doesn't cover everything. */
  priority?: 'defence' | 'ayak';
  threshold?: number;
  /**
   * Phase 29 (the planner's spec choice): use only as many of the `ayakSpecs` as reach P(magic def 0) ≥ threshold
   * ({@link ayakSpecsToThreshold}); all of them when none does.
   */
  ayakUntilZero?: boolean;
  /** Phase 36: energy on top of the budget (%), e.g. 25 for a surge dose (the Search tab's "with a surge dose" line). */
  extraEnergy?: number;
}

/**
 * Phase 29: fewest Eye of Ayak specs (≤ `max`) whose P(magic def 0) ≥ threshold; `max` when none does, 0 when the
 * bonus is already ≤ 0 or Ayak can't hit.
 */
export const ayakSpecsToThreshold = (
  model: Pick<DrainModel, 'magicDef' | 'outcomes' | 'expectedDamage' | 'canHit'>,
  max: number,
  threshold = DEFAULT_FLOOR_THRESHOLD,
): number => {
  if (!model.canHit.ayak || model.magicDef <= 0) return 0;
  for (let n = 1; n <= max; n++) {
    if (ayakOutcome(model, n, threshold).pZero >= threshold) return n;
  }
  return Math.max(0, max);
};

export interface SoloSpecPlan {
  /** Energy available (energyBudget) and spent. */
  budget: number;
  energyUsed: number;
  /** Defence drain attempts actually made (upstream order) and Ayak attempts. */
  attempts: DefenceDrainWeapon[];
  ayakAttempts: number;
  defence: DefenceOutcome;
  ayak: AyakOutcome;
  /**
   * Attempts the carried weapons need for P(floor) ≥ threshold (+ the requested Ayak specs), its energy and label;
   * `null` attempts = not reachable within {@link MAX_SOLO_ATTEMPTS}.
   */
  needed: { attempts: number | null, energy: number | null, label: PlanLabel };
  reductions: DefenceReductions;
  /** e.g. "2× Elder maul (130% energy) → expected Def 195, P(Def 180) 59% → ranked at Def 195; Ayak 0 of 2 ..." */
  text: string;
}

/** Most defence-drain attempts the solo search tries (3 bars). */
export const MAX_SOLO_ATTEMPTS = 6;

const compositions = (weapons: DefenceDrainWeapon[], n: number): DefenceDrainWeapon[][] => {
  if (n === 0) return [[]];
  if (!weapons.length) return [];
  const [first, ...rest] = weapons;
  const out: DefenceDrainWeapon[][] = [];
  for (let k = n; k >= 0; k--) {
    for (const tail of compositions(rest, n - k)) {
      out.push([...Array(k).fill(first), ...tail]);
    }
  }
  return out;
};

const better = (a: DefenceOutcome, b: DefenceOutcome | undefined): boolean => !b
  || a.pFloor > b.pFloor + 1e-12
  || (Math.abs(a.pFloor - b.pFloor) <= 1e-12 && a.expectedDef < b.expectedDef - 1e-9);

/** Best combination of exactly `n` attempts of the given weapons (max P(floor), then min expected Defence). */
export const bestAttempts = (
  model: DrainModel,
  weapons: DefenceDrainWeapon[],
  n: number,
  threshold = DEFAULT_FLOOR_THRESHOLD,
): { attempts: DefenceDrainWeapon[], outcome: DefenceOutcome } => {
  let best: { attempts: DefenceDrainWeapon[], outcome: DefenceOutcome } | undefined;
  for (const attempts of compositions(weapons, n)) {
    const outcome = defenceOutcome(model, attempts, threshold);
    if (better(outcome, best?.outcome)) {
      best = { attempts, outcome };
    }
  }
  return best || { attempts: [], outcome: defenceOutcome(model, [], threshold) };
};

/**
 * The drain one player can do with the weapons they carry, within their own spec energy (`energyBudget`). All drain
 * specs cost 50%. Defence first (default): the fewest attempts whose best combination reaches P(floor) ≥ threshold,
 * else every attempt the budget pays for; the remaining energy goes to Ayak (up to `ayakSpecs`). `priority: 'ayak'`
 * does the Ayak specs first. Never spends more than the budget.
 */
export const soloSpecPlan = (model: DrainModel, input: SoloSpecInput): SoloSpecPlan => {
  const threshold = input.threshold ?? DEFAULT_FLOOR_THRESHOLD;
  const budget = energyBudget({ seconds: input.fightSeconds, lightbearer: input.lightbearer }) + Math.max(0, input.extraEnergy ?? 0);
  const weapons = DEFENCE_DRAIN_ORDER.filter((w) => input.carried[w] && model.canHit[w]);
  let ayakUsable = model.canHit.ayak && model.magicDef > 0 ? Math.max(0, Math.floor(input.ayakSpecs)) : 0;
  if (input.ayakUntilZero) ayakUsable = ayakSpecsToThreshold(model, ayakUsable, threshold);
  const specCost = Math.max(...DEFENCE_DRAIN_ORDER.map((w) => model.energy[w]), model.energy.ayak);
  const total = specAttempts(budget, specCost);

  // phase 38h-1: the drain line's Solo plan (`kitDrainPlan`: the fewest specs to the floor at the threshold, else the
  // fewest reaching d*, each spec at the Defence the earlier ones leave); was the best combination per attempt count in
  // upstream's order, up to MAX_SOLO_ATTEMPTS
  const plan = weapons.length && model.def > model.floor
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    ? kitDrainPlan(model, { drain: 'solo', weapons }, threshold) : null;
  let neededAttempts: number | null = plan?.floor ? plan.specs : null; // stays null if no carried weapon can hit
  if (model.def <= model.floor) neededAttempts = 0;
  const wantedAttempts = plan ? plan.specs : 0;

  let defenceAttempts: number;
  let ayakAttempts: number;
  if (input.priority === 'ayak') {
    ayakAttempts = Math.min(ayakUsable, total);
    defenceAttempts = Math.min(total - ayakAttempts, wantedAttempts);
  } else {
    defenceAttempts = Math.min(total, wantedAttempts);
    ayakAttempts = Math.min(ayakUsable, total - defenceAttempts);
  }
  let chosen: { attempts: DefenceDrainWeapon[], outcome: DefenceOutcome };
  if (plan && defenceAttempts === plan.specs && defenceAttempts > 0) {
    const attempts = DEFENCE_DRAIN_ORDER.flatMap((w) => Array(plan.counts[w] ?? 0).fill(w) as DefenceDrainWeapon[]);
    chosen = { attempts, outcome: defenceOutcome(model, attempts, threshold) };
  } else {
    chosen = defenceAttempts > 0 ? bestAttempts(model, weapons, defenceAttempts, threshold) : bestAttempts(model, [], 0, threshold);
  }
  const ayak = ayakOutcome(model, ayakAttempts, threshold);
  const energyUsed = (defenceAttempts + ayakAttempts) * specCost;

  const neededEnergy = neededAttempts === null ? null : (neededAttempts + ayakUsable) * specCost;
  const needed = {
    attempts: neededAttempts,
    energy: neededEnergy,
    label: neededEnergy === null ? 'team-only' as PlanLabel : planLabel(neededEnergy, input.fightSeconds),
  };

  const parts: string[] = [];
  const carriedNoHit = DEFENCE_DRAIN_ORDER.filter((w) => input.carried[w] && !model.canHit[w]);
  if (defenceAttempts > 0) {
    parts.push(`${describeAttempts(chosen.attempts)} → ${describeDefence(model, chosen.outcome, true)}`);
  } else {
    parts.push(`no Defence specs → Def ${model.def}`);
  }
  if (carriedNoHit.length) {
    parts.push(`${carriedNoHit.map((w) => LABELS[w]).join(', ')} can't hit here`);
  }
  if (input.ayakSpecs > 0) {
    if (model.magicDef <= 0) {
      parts.push('Ayak: magic def already ≤ 0');
    } else if (!model.canHit.ayak) {
      parts.push('Ayak can\'t hit here');
    } else {
      const shortfall = ayakAttempts < ayakUsable ? ` (${ayakUsable - ayakAttempts} of ${ayakUsable} don't fit in the energy)` : '';
      parts.push(`${ayakAttempts}× Ayak${shortfall} → ≈ ${ayak.expectedDrain.toFixed(0)} magic def drained (magic def ${ayak.magicDefAfter})`);
    }
  }
  let neededText = `full plan ${(needed.attempts ?? 0) + ayakUsable} specs = ${needed.energy}%`;
  if (needed.attempts === null) {
    neededText = weapons.length ? `floor needs > ${MAX_FLOOR_SPECS} specs` : 'no carried Defence weapon can hit';
  }
  parts.push(`${budget}% energy in ${input.fightSeconds} s${input.lightbearer ? ' (Lightbearer)' : ''}; ${neededText} → ${planLabelText(needed.label)}`);

  return {
    budget,
    energyUsed,
    attempts: inUpstreamOrder(chosen.attempts),
    ayakAttempts,
    defence: chosen.outcome,
    ayak,
    needed,
    reductions: countsToReductions(chosen.outcome.rankedCounts, ayak.rankedDrain),
    text: parts.join('; '),
  };
};

// --- phase 38g: drain order and specs to the floor at the threshold ---------------------------------------------------

/**
 * Phase 38g: the Defence after `attempts` if every spec lands its best outcome (Elder maul / DWH one hit, Tonalztics its
 * most hits, BGS its highest damage), upstream order: below this no outcome goes, so above the floor means P(floor) 0.
 */
export const bestCaseDef = (
  model: Pick<DrainModel, 'def' | 'floor' | 'magicLevel' | 'outcomes'>,
  attempts: DefenceDrainWeapon[],
): number => inUpstreamOrder(attempts).reduce((d, w) => {
  const top = model.outcomes[w].filter((o) => o.p > 0)
    .reduce((b, o) => ((w === 'bgs' ? o.damage > b.damage : o.hits > b.hits) ? o : b), { p: 0, hits: 0, damage: 0 });
  return applyOutcome(model, w, d, top);
}, model.def);

export interface DrainOrderItem {
  weapon: DefenceDrainWeapon;
  /** P(the spec lands): upstream's hit chance (Tonalztics: at least one damaging hit of a charged spec). */
  hitChance: number;
  /** Expected Defence one spec removes from the undrained Defence (misses included, floor applied). */
  expectedDrop: number;
}

/**
 * Phase 38g: the Defence drain weapons that can hit (of `weapons`, default all four), ordered by the Defence one spec
 * removes on average from the undrained Defence (Σ P(outcome) × the drop; floor applied); ties in upstream order.
 */
export const drainOrder = (
  model: Pick<DrainModel, 'def' | 'floor' | 'magicLevel' | 'outcomes' | 'canHit' | 'hitChance'>,
  weapons: DefenceDrainWeapon[] = DEFENCE_DRAIN_ORDER,
): DrainOrderItem[] => DEFENCE_DRAIN_ORDER
  .filter((w) => weapons.includes(w) && model.canHit[w])
  .map((w) => ({
    weapon: w,
    hitChance: model.hitChance[w],
    expectedDrop: model.outcomes[w].reduce((t, o) => t + o.p * (model.def - applyOutcome(model, w, model.def, o)), 0),
  }))
  .sort((a, b) => (b.expectedDrop - a.expectedDrop) || (DEFENCE_DRAIN_ORDER.indexOf(a.weapon) - DEFENCE_DRAIN_ORDER.indexOf(b.weapon)));

export interface NeededSpecs {
  /**
   * Fewest Defence specs (drawn from `available`) whose best combination reaches the floor with P ≥ threshold (upstream
   * order inside; more of the weapon higher in the {@link drainOrder} on ties); {} = already at the floor; null = not
   * within the available specs (at most {@link MAX_FLOOR_SPECS}).
   */
  defence: Partial<Record<DefenceDrainWeapon, number>> | null;
  /** P(floor) of `defence` (1 at the floor; the best of the most specs tried when null). */
  pFloor: number;
  /** Eye of Ayak: fewest specs (≤ available.ayak) with P(magic def 0) ≥ threshold; 0 = already ≤ 0; null = not reachable. */
  ayak: number | null;
}

const neededMemo = new Map<string, NeededSpecs>();
const NEEDED_MEMO_MAX = 20000;

/**
 * Phase 38g (was phase 29's best case "every spec lands"): the specs needed to reach the Defence floor with P(floor) ≥
 * `threshold` (`defenceOutcome`), drawn from `available` (spec counts per weapon; weapons that can't hit count as
 * unavailable): for n = 1, 2, … the best combination of n specs (max P(floor), then the lowest expected Defence), the
 * first n that reaches the threshold. A low-accuracy boss needs more than the best case (every spec landing). Eye of
 * Ayak the same with `ayakOutcome`'s P(magic def 0).
 */
export const neededSpecs = (
  model: Pick<DrainModel, 'def' | 'floor' | 'magicLevel' | 'magicDef' | 'canHit' | 'hitChance' | 'expectedDamage' | 'outcomes'
  | 'accuracy' | 'energy'>,
  available: Partial<Record<PlannerWeapon, number>>,
  threshold = DEFAULT_FLOOR_THRESHOLD,
  /** Phase 38g fix: the most specs tried (default MAX_FLOOR_SPECS; Team facts: 2 per party member). */
  maxSpecs = MAX_FLOOR_SPECS,
): NeededSpecs => {
  const key = JSON.stringify([model, available, threshold, maxSpecs]);
  const hit = neededMemo.get(key);
  if (hit) return hit;
  const order = drainOrder(model).map((x) => x.weapon).filter((w) => (available[w] ?? 0) > 0);
  let defence: Partial<Record<DefenceDrainWeapon, number>> | null = null;
  let pFloor = 0;
  if (model.def <= model.floor) {
    defence = {};
    pFloor = 1;
  } else if (order.length) {
    // phase 38h-1: the drain line's plan within `available` (each spec at the Defence the earlier ones leave, in the
    // plan's order; was upstream's order at the undrained Defence)
    const most = Math.min(maxSpecs, order.reduce((t, w) => t + (available[w] ?? 0), 0));
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    const plan = bestDrainPlan(model, {
      weapons: order, maxSpecs: most, threshold, available: Object.fromEntries(order.map((w) => [w, available[w] ?? 0])),
    });
    if (plan && plan.floor) {
      defence = plan.counts;
      pFloor = plan.p;
    } else if (plan) {
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      pFloor = planChance(model, plan.steps);
    }
  }
  let ayak: number | null = null;
  if (model.magicDef <= 0) ayak = 0;
  else if (model.canHit.ayak) {
    // the same convolution as `ayakOutcome`, one spec at a time (P(Σ damage ≥ bonus) after n specs)
    const target = model.magicDef;
    const most = Math.min(available.ayak ?? 0, 2 * MAX_FLOOR_SPECS);
    let dist = new Float64Array(target + 1);
    dist[0] = 1;
    for (let n = 1; n <= most; n++) {
      const next = new Float64Array(target + 1);
      for (let s = 0; s <= target; s++) {
        if (dist[s] > 0) {
          for (const o of model.outcomes.ayak) next[Math.min(target, s + o.damage)] += dist[s] * o.p;
        }
      }
      dist = next;
      if (dist[target] >= threshold) {
        ayak = n;
        break;
      }
    }
  }
  const out = { defence, pFloor, ayak };
  if (neededMemo.size >= NEEDED_MEMO_MAX) neededMemo.clear();
  neededMemo.set(key, out);
  return out;
};

/** Phase 38g: the total of a counts record. */
export const countsTotal = (c: Partial<Record<string, number>> | null | undefined): number => Object.values(c ?? {})
  .reduce((t: number, n) => t + (n ?? 0), 0);

/** Phase 38g fix: the lowest Defence reached with P ≥ threshold (the distribution's threshold quantile). */
export const defenceAtThreshold = (
  model: Pick<DrainModel, 'def' | 'floor' | 'magicLevel' | 'outcomes'>,
  attempts: DefenceDrainWeapon[],
  threshold = DEFAULT_FLOOR_THRESHOLD,
): number => {
  let cum = 0;
  for (const s of defenceDistribution(model, inUpstreamOrder(attempts))) {
    cum += s.p;
    if (cum >= threshold - 1e-12) return s.def;
  }
  return model.def;
};

export interface HelpfulSpecs {
  /** The lowest Defence reached at the threshold with every spec of the sequence. */
  dStar: number;
  /** The fewest specs of the sequence (a prefix, in drain order) reaching `dStar` at the threshold, per weapon. */
  counts: Partial<Record<DefenceDrainWeapon, number>>;
  specs: number;
}

const helpfulMemo = new Map<string, HelpfulSpecs>();

/**
 * Phase 38g fix (the user, 2026-10-28: "cap at what helps"): when the floor can't be reached at the threshold, d* = the
 * lowest Defence the available specs (`sequence`, in drain order) reach at the threshold, and only the fewest of them
 * (a prefix of the sequence) that still reach d* at the threshold are spent; the rest stay for later events.
 */
export const helpfulSpecs = (
  model: Pick<DrainModel, 'def' | 'floor' | 'magicLevel' | 'outcomes'>,
  sequence: DefenceDrainWeapon[],
  threshold = DEFAULT_FLOOR_THRESHOLD,
): HelpfulSpecs => {
  const key = JSON.stringify([model, sequence, threshold]);
  const hit = helpfulMemo.get(key);
  if (hit) return hit;
  const dStar = defenceAtThreshold(model, sequence, threshold);
  let n = sequence.length;
  if (dStar >= model.def) n = 0;
  else {
    for (let k = 1; k <= sequence.length; k++) {
      if (defenceAtThreshold(model, sequence.slice(0, k), threshold) <= dStar) {
        n = k;
        break;
      }
    }
  }
  const counts: Partial<Record<DefenceDrainWeapon, number>> = {};
  sequence.slice(0, n).forEach((w) => { counts[w] = (counts[w] ?? 0) + 1; });
  const out = { dStar, counts, specs: n };
  if (helpfulMemo.size >= 20000) helpfulMemo.clear();
  helpfulMemo.set(key, out);
  return out;
};

/** Phase 38g fix: each weapon of `weapons` (in this order) `per` times, at most `max` attempts in all. */
export const drainSequence = (weapons: DefenceDrainWeapon[], per: (w: DefenceDrainWeapon) => number, max = Infinity): DefenceDrainWeapon[] => weapons
  .flatMap((w) => Array(Math.max(0, Math.floor(per(w)))).fill(w) as DefenceDrainWeapon[]).slice(0, max);

// --- phase 38g-2: the drain plan (combination + order) that lands most often --------------------------------------

export interface DrainPlan {
  /** The specs in the order to send them, weapon by weapon (e.g. Elder maul ×1 → Tonalztics ×2). */
  steps: DrainStep[];
  counts: Partial<Record<DefenceDrainWeapon, number>>;
  specs: number;
  /** True: `target` is the floor; false: the floor is out of reach at the threshold and `target` = d*. */
  floor: boolean;
  /** The Defence aimed at: the floor, or d* = the lowest Defence any plan of at most `maxSpecs` reaches at the threshold. */
  target: number;
  /** P(Defence ≤ target) after the plan, each spec at the Defence the previous ones leave ({@link outcomesAt}). */
  p: number;
  expectedDef: number;
}

/** Phase 38h-2: a cap on a drain plan's specs: per weapon (a weapon not listed: no cap) and in all. */
export type DrainCap = Partial<Record<DefenceDrainWeapon, number>> & { total?: number };

export interface DrainPlanOptions {
  /** The Defence drain weapons available (those that can't hit are skipped). */
  weapons: DefenceDrainWeapon[];
  /** The most specs in all. */
  maxSpecs: number;
  threshold?: number;
  /** Team: the most carriers, each making `specAttempts(100, energy)` specs of one weapon (2 for a 50% spec). */
  maxCarriers?: number;
  /** Phase 38h-1: the most specs of each weapon (the kit's carriers × their specs; undefined = no cap but `maxSpecs`). */
  available?: Partial<Record<DefenceDrainWeapon, number>>;
  /**
   * Phase 38h-2: exactly these specs (no threshold search): the order of them that lands the floor most often (then the
   * lowest expected Defence, fewer weapon changes, the drain order); {@link defenceOutcome} uses it.
   */
  exact?: Partial<Record<DefenceDrainWeapon, number>>;
}

const planMemo = new Map<string, DrainPlan | null>();
/**
 * Phase 38h-2: the most weapon blocks an order may have where a weapon comes back (T ×3 → M ×3 → T ×3); orders with
 * every weapon in one block are always tried.
 */
export const MAX_DRAIN_BLOCKS = 3;

/**
 * Phase 38g-2 (the user, 2026-10-28: "just what to do to land it most often"): the combination of the available drain
 * specs and the order to send them that reaches the floor with P ≥ threshold in the fewest specs, and among those the
 * highest P(floor) (then the lowest expected Defence, then fewer weapon changes, then the drain order). Each spec rolls
 * at the Defence the earlier ones leave (`outcomesAt`), so the order matters: a low-accuracy spec lands more often after
 * an Elder maul. Orders are weapon blocks ("Elder maul → Tonalztics ×2"), every order of every combination. When no plan
 * of at most `maxSpecs` reaches the floor at the threshold (the user: "cap at what helps"), d* = the lowest Defence any
 * of them reaches at the threshold, and the plan is the fewest specs reaching d* at the threshold, chosen the same way.
 * null when no weapon can hit; `specs` 0 when the boss is already at the floor or nothing lowers the Defence at the
 * threshold.
 */
export const bestDrainPlan = (
  model: Pick<DrainModel, 'def' | 'floor' | 'magicLevel' | 'outcomes' | 'accuracy' | 'canHit' | 'hitChance' | 'energy'>,
  opts: DrainPlanOptions,
): DrainPlan | null => {
  const key = JSON.stringify([model, opts]);
  if (planMemo.has(key)) return planMemo.get(key)!;
  const threshold = opts.threshold ?? DEFAULT_FLOOR_THRESHOLD;
  const weapons = drainOrder(model, opts.weapons).map((x) => x.weapon).filter((w) => model.hitChance[w] > 0);
  const empty = (target: number): DrainPlan => ({
    steps: [], counts: {}, specs: 0, floor: model.def <= model.floor, target, p: 1, expectedDef: model.def,
  });
  let out: DrainPlan | null;
  if (!weapons.length) out = null;
  else if (model.def <= model.floor) out = empty(model.floor);
  else {
    const per = (w: DefenceDrainWeapon) => Math.max(1, specAttempts(100, model.energy[w]));
    // a node = one block sequence; states[d] = P(Defence d)
    type Node = { steps: DrainStep[], counts: number[], last: number, states: Float64Array };
    const size = model.def + 1;
    // one spec of weapon wi from Defence d, as runs of Defences lo..hi each reached with P p (BGS: one run per equal-P damage range)
    type Run = { lo: number, hi: number, p: number };
    const cache = new Map<number, Run[]>();
    const at = (wi: number, d: number): Run[] => {
      const k = wi * 100000 + d;
      let runs = cache.get(k);
      if (!runs) {
        const byDef = new Map<number, number>();
        outcomesAt(model, weapons[wi], d).forEach((o) => {
          if (o.p > 0) {
            const nd = applyOutcome(model, weapons[wi], d, o);
            byDef.set(nd, (byDef.get(nd) ?? 0) + o.p);
          }
        });
        runs = [];
        [...byDef.entries()].sort((x, y) => x[0] - y[0]).forEach(([nd, q]) => {
          const r = runs![runs!.length - 1];
          if (r && r.hi === nd - 1 && r.p === q) r.hi = nd;
          else runs!.push({ lo: nd, hi: nd, p: q });
        });
        cache.set(k, runs);
      }
      return runs;
    };
    const carriersOk = (c: number[]) => (opts.maxCarriers === undefined
      || c.reduce((t, n, wi) => t + Math.ceil(n / per(weapons[wi])), 0) <= opts.maxCarriers)
      && (!opts.available || c.every((n, wi) => n <= (opts.available![weapons[wi]] ?? 0)))
      && (!opts.exact || c.every((n, wi) => n <= Math.floor(opts.exact![weapons[wi]] ?? 0)));
    const rank = (s: DrainStep[]) => s.flatMap((x) => Array(x.count).fill(weapons.indexOf(x.weapon)) as number[]);
    const earlier = (a: number[], b: number[]) => {
      for (let j = 0; j < Math.min(a.length, b.length); j++) if (a[j] !== b[j]) return a[j] < b[j];
      return false;
    };
    const cdf = (s: Float64Array) => {
      const c = new Float64Array(size);
      let t = 0;
      for (let d = 0; d < size; d++) {
        t += s[d];
        c[d] = t;
      }
      return c;
    };
    // the next layer: every node + one spec (extend the last block, or a block of a weapon not used yet); within nodes
    // with the same counts and last weapon (the same continuations) a node whose Defence is stochastically higher than
    // another's is dropped: every continuation of it reaches each Defence no more often (a lower Defence lands the
    // next spec at least as often and leaves a Defence no higher)
    const expand = (layer: Node[]): Node[] => {
      const groups = new Map<string, Node[]>();
      layer.forEach((node) => {
        // phase 38h-2 (review 38h-1): interleaved orders too (T T T → M M M → T T T): a weapon used before may come
        // back while the order has fewer than MAX_DRAIN_BLOCKS blocks (speed: every interleaving made the dominance
        // groups too large), an unused one always; the groups below (same counts, last weapon and blocks) have the same
        // continuations
        const options = weapons.map((_, wi) => wi)
          .filter((wi) => wi === node.last || !node.counts[wi] || node.steps.length < MAX_DRAIN_BLOCKS);
        options.forEach((wi) => {
          const counts = node.counts.map((n, j) => (j === wi ? n + 1 : n));
          if (!carriersOk(counts)) return;
          const last = node.steps[node.steps.length - 1];
          const w = weapons[wi];
          const steps = wi === node.last
            ? [...node.steps.slice(0, -1), { weapon: w, count: last.count + 1 }]
            : [...node.steps, { weapon: w, count: 1 }];
          // difference array: each run adds P to every Defence lo..hi
          const diff = new Float64Array(size + 1);
          for (let d = model.floor; d < size; d++) {
            const p = node.states[d];
            if (p > 0) {
              at(wi, d).forEach((r) => {
                diff[r.lo] += p * r.p;
                diff[r.hi + 1] -= p * r.p;
              });
            }
          }
          const states = new Float64Array(size);
          let run = 0;
          for (let d = 0; d < size; d++) {
            run += diff[d];
            states[d] = run > 1e-15 ? run : 0; // drops the round-off the differences leave
          }
          const group = `${counts.join(',')}|${wi}|${Math.min(steps.length, MAX_DRAIN_BLOCKS)}`;
          const g = groups.get(group);
          const child = {
            steps, counts, last: wi, states,
          };
          if (g) g.push(child);
          else groups.set(group, [child]);
        });
      });
      const kept: Node[] = [];
      groups.forEach((g) => {
        if (g.length === 1) {
          kept.push(g[0]);
          return;
        }
        const cdfs = g.map((x) => cdf(x.states));
        // a dominates b: P(Def ≤ x) at least b's for every x (equal: the earlier in the drain order is kept)
        const dominates = (a: number, b: number) => {
          let strict = false;
          for (let d = 0; d < size; d++) {
            if (cdfs[a][d] < cdfs[b][d] - 1e-12) return false;
            if (cdfs[a][d] > cdfs[b][d] + 1e-12) strict = true;
          }
          return strict || earlier(rank(g[a].steps), rank(g[b].steps));
        };
        g.forEach((x, i) => {
          if (!g.some((_, j) => j !== i && dominates(j, i))) kept.push(x);
        });
      });
      return kept;
    };
    const best = (nodes: Node[], target: number) => {
      let b: { node: Node, p: number, ed: number } | undefined;
      nodes.forEach((node) => {
        let p = 0;
        let ed = 0;
        for (let d = model.floor; d < size; d++) {
          const q = node.states[d];
          if (d <= target) p += q;
          ed += q * d;
        }
        const wins = !b || p > b.p + 1e-12 || (Math.abs(p - b.p) <= 1e-12 && (ed < b.ed - 1e-9 || (Math.abs(ed - b.ed) <= 1e-9
          && (node.steps.length < b.node.steps.length
            || (node.steps.length === b.node.steps.length && earlier(rank(node.steps), rank(b.node.steps)))))));
        if (wins) b = { node, p, ed };
      });
      return b;
    };
    const quantile = (s: Float64Array) => {
      let cum = 0;
      for (let d = 0; d < size; d++) {
        cum += s[d];
        if (cum >= threshold - 1e-12) return d;
      }
      return model.def;
    };
    const planOf = (b: { node: Node, p: number, ed: number }, floor: boolean, target: number): DrainPlan => {
      const counts: Partial<Record<DefenceDrainWeapon, number>> = {};
      b.node.steps.forEach((s) => { counts[s.weapon] = (counts[s.weapon] ?? 0) + s.count; });
      return {
        steps: b.node.steps, counts, specs: countsTotal(counts), floor, target, p: b.p, expectedDef: b.ed,
      };
    };
    const root = (): Node[] => {
      const states = new Float64Array(size);
      states[model.def] = 1;
      return [{
        steps: [], counts: weapons.map(() => 0), last: -1, states,
      }];
    };
    out = null;
    if (opts.exact) {
      // phase 38h-2: exactly these specs, the order that lands most often
      const n = weapons.reduce((t, w) => t + Math.max(0, Math.floor(opts.exact![w] ?? 0)), 0);
      let layer0 = root();
      for (let k = 0; k < n && layer0.length; k++) layer0 = expand(layer0);
      const b = n > 0 ? best(layer0, model.floor) : undefined;
      out = b ? planOf(b, b.p >= threshold - 1e-12, model.floor) : empty(model.floor);
      if (planMemo.size >= 20000) planMemo.clear();
      planMemo.set(key, out);
      return out;
    }
    // pass 1: the fewest specs reaching the floor at the threshold (and d* on the way)
    let dStar = model.def;
    let layer = root();
    for (let n = 1; n <= opts.maxSpecs && !out && layer.length; n++) {
      layer = expand(layer);
      const b = best(layer, model.floor);
      if (b && b.p >= threshold - 1e-12) out = planOf(b, true, model.floor);
      for (const node of layer) dStar = Math.min(dStar, quantile(node.states));
    }
    if (!out && dStar >= model.def) out = empty(model.def);
    // pass 2 (floor out of reach): the fewest specs reaching d* at the threshold
    layer = out ? [] : root();
    for (let n = 1; n <= opts.maxSpecs && !out && layer.length; n++) {
      layer = expand(layer);
      const b = best(layer, dStar);
      if (b && b.p >= threshold - 1e-12) out = planOf(b, false, dStar);
    }
  }
  if (planMemo.size >= 20000) planMemo.clear();
  planMemo.set(key, out);
  return out;
};

/** Phase 38h-1: specs per carrier of a weapon in the drain plans (`specAttempts(100, energy)`, at least 1). */
export const planPerCarrier = (model: Pick<DrainModel, 'energy'>, w: DefenceDrainWeapon): number => Math.max(1, specAttempts(100, model.energy[w]));

/** Phase 38h-1: a plan's carriers per weapon (each carrier makes {@link planPerCarrier} specs). */
export const planCarriers = (model: Pick<DrainModel, 'energy'>, plan: Pick<DrainPlan, 'steps'>): Partial<Record<DefenceDrainWeapon, number>> => {
  // phase 38h-2: an interleaved plan lists a weapon more than once
  const n: Partial<Record<DefenceDrainWeapon, number>> = {};
  plan.steps.forEach((s) => { n[s.weapon] = (n[s.weapon] ?? 0) + s.count; });
  return Object.fromEntries(Object.entries(n).map(([w, k]) => [w, Math.ceil(k! / planPerCarrier(model, w as DefenceDrainWeapon))]));
};

/**
 * Phase 38h-1: the drain line's Team plan (drainLine.ts `drainFacts`, party > 1): every Defence drain weapon that can
 * hit, at most one carrier per party member, at most max(MAX_FLOOR_SPECS, 2 × party) specs.
 */
export const teamLinePlan = (
  model: Pick<DrainModel, 'def' | 'floor' | 'magicLevel' | 'outcomes' | 'accuracy' | 'canHit' | 'hitChance' | 'energy'>,
  partySize: number,
  threshold = DEFAULT_FLOOR_THRESHOLD,
): DrainPlan | null => {
  const party = Math.max(1, Math.floor(partySize));
  return bestDrainPlan(model, {
    weapons: drainOrder(model).map((x) => x.weapon),
    maxSpecs: Math.max(MAX_FLOOR_SPECS, 2 * party),
    threshold,
    maxCarriers: party,
  });
};

/**
 * Phase 38h-1: the drain line's plan within what a drain has (encounterBudget.ts `eventWantedCounts`, the Team drain
 * state's first round): Team = the carriers per weapon (each weapon at most its carriers × {@link planPerCarrier} specs,
 * at most that many carriers in all); Solo = your weapons, at most MAX_FLOOR_SPECS (drainLine.ts `drainFacts`' Solo plan).
 * null when none of them can hit.
 */
export const kitDrainPlan = (
  model: Pick<DrainModel, 'def' | 'floor' | 'magicLevel' | 'outcomes' | 'accuracy' | 'canHit' | 'hitChance' | 'energy'>,
  kit: { drain: 'team', carriers: Partial<Record<PlannerWeapon, number>> } | { drain: 'solo', weapons: DefenceDrainWeapon[] },
  threshold = DEFAULT_FLOOR_THRESHOLD,
  /**
   * Phase 38h-2: what the bars can still pay: at most this many specs of a weapon (a weapon not listed: no cap) and at
   * most `total` in all; undefined = no cap.
   */
  cap?: DrainCap,
): DrainPlan | null => {
  const capOf = (w: DefenceDrainWeapon, n: number) => (cap && cap[w] !== undefined ? Math.min(n, Math.max(0, Math.floor(cap[w]!))) : n);
  const total = cap?.total !== undefined ? Math.max(0, Math.floor(cap.total)) : Infinity;
  if (kit.drain === 'solo') {
    const weapons = DEFENCE_DRAIN_ORDER.filter((w) => kit.weapons.includes(w) && model.canHit[w] && capOf(w, MAX_FLOOR_SPECS) > 0);
    if (!weapons.length || !(total > 0)) return null;
    const available = cap ? Object.fromEntries(weapons.map((w) => [w, capOf(w, MAX_FLOOR_SPECS)])) : undefined;
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    return bestDrainPlan(model, {
      weapons,
      maxSpecs: Math.min(total, available ? Math.min(MAX_FLOOR_SPECS, Object.values(available).reduce((t, n) => t + n, 0)) : MAX_FLOOR_SPECS),
      threshold,
      ...(available ? { available } : {}),
    });
  }
  const weapons = DEFENCE_DRAIN_ORDER.filter((w) => Math.floor(kit.carriers[w] ?? 0) > 0 && model.canHit[w]
    && capOf(w, Math.floor(kit.carriers[w] ?? 0) * planPerCarrier(model, w)) > 0);
  if (!weapons.length) return null;
  const available = Object.fromEntries(weapons.map((w) => [w, capOf(w, Math.floor(kit.carriers[w] ?? 0) * planPerCarrier(model, w))]));
  if (!(total > 0)) return null;
  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  return bestDrainPlan(model, {
    weapons,
    maxSpecs: Math.min(total, Object.values(available).reduce((t, n) => t + n, 0)),
    threshold,
    maxCarriers: weapons.reduce((t, w) => t + Math.floor(kit.carriers[w] ?? 0), 0),
    available,
  });
};

/** Phase 38g-2: the plan's P(Defence ≤ `target`) for these steps in this order (each spec at the Defence left; {@link outcomesAt}). */
export const planChance = (
  model: Pick<DrainModel, 'def' | 'floor' | 'magicLevel' | 'outcomes' | 'accuracy'>,
  steps: DrainStep[],
  target = model.floor,
): number => {
  let states = new Map<number, number>([[model.def, 1]]);
  steps.forEach(({ weapon, count }) => {
    for (let i = 0; i < count; i++) {
      const next = new Map<number, number>();
      states.forEach((p, d) => outcomesAt(model, weapon, d).forEach((o) => {
        const nd = applyOutcome(model, weapon, d, o);
        next.set(nd, (next.get(nd) ?? 0) + p * o.p);
      }));
      states = next;
    }
  });
  return [...states.entries()].filter(([d]) => d <= target).reduce((t, [, p]) => t + p, 0);
};

/**
 * Phase 29 review 2: one weapon of a Team drain line. Phase 32 wording (drainLine.ts `neededText`): "needs 4 landed
 * hits · 4 specs (2 carriers) = 8 attacks, 4 must land · 98% · team: 6 specs (3 carriers) · 99.8%".
 */
export interface TeamNeed {
  /** Fewest specs of this weapon (earlier weapons at their own needed counts, later ones as brought). */
  n: number;
  /** "86%" = P(floor from the first round) with those specs; "→ Def 167" when the plan doesn't rank at the floor. */
  result: string;
  /** The same for everything the team brings. */
  brings: string;
  /**
   * Phase 32: the fewest landed hits of this weapon alone that take the start Defence `from` to the ranked Defence `to`
   * (`landedToReach`: Elder maul / DWH landed specs, Tonalztics landed hits, BGS damage; Eye of Ayak: magic defence drained
   * from the Magic defence bonus `from` to `to`); null = this weapon alone never gets there.
   */
  landed?: number | null;
  from?: number;
  to?: number;
  /**
   * Phase 32: set when this weapon alone would need more landed drains than its needed specs can land (Bork:
   * Tonalztics backs up the maul): `landed` then counts from `from` = the Defence the other weapons' needed specs
   * leave when they land as much as they can without reaching `to` (`landedNeed`); the text says what landed, e.g.
   * "1 Elder maul spec lands".
   */
  afterOthers?: string;
  /** Phase 32 (Team): first-round specs per carrier of this weapon (2 for a 50% spec), for "(2 carriers)". */
  perCarrier?: number;
}

/**
 * Phase 32: the fewest landed drains of `weapon` alone that take the Defence from `model.def` to `target` or lower:
 * Elder maul / DWH landed specs (−35% / −30% of the current Defence each, rounded down), Tonalztics landed hits
 * (−trunc(Magic / 8) each), BGS damage (Defence − target). 0 when the Defence is already there; null when it never
 * gets there (a drain of 0 per hit).
 */
export const landedToReach = (
  model: Pick<DrainModel, 'def' | 'floor' | 'magicLevel'>,
  weapon: DefenceDrainWeapon,
  target: number,
): number | null => {
  const to = Math.max(target, model.floor);
  if (model.def <= to) return 0;
  if (weapon === 'bgs') return model.def - to;
  let d = model.def;
  for (let k = 1; k <= 500; k++) {
    const next = applyOutcome(model, weapon, d, { p: 1, hits: 1, damage: 0 });
    if (next >= d) return null;
    d = next;
    if (d <= to) return k;
  }
  return null;
};

/** Phase 32: the most landed drains `n` specs of a weapon can give (a charged Tonalztics spec attacks twice). */
const maxLanded = (w: DefenceDrainWeapon, n: number): number => (w === 'tonalztics' ? 2 * n : n);

const LANDED_UNIT: Record<DefenceDrainWeapon, [string, string]> = {
  elderMaul: ['Elder maul', 'spec'], dwh: ['DWH', 'spec'], tonalztics: ['Tonalztics', 'hit'], bgs: ['BGS', 'spec'],
};

/**
 * Phase 32: the "needs N landed hits" of weapon `w` on a drain line, given every weapon's needed specs (`needs`) and
 * the ranked Defence `target`: its landed drains alone from the start Defence (`landedToReach`) when its needed specs
 * can land that many; else counted from the Defence the other weapons' needed specs leave when they land as much as
 * they can while staying above the target (upstream order, one drain at a time; BGS not counted), `afterOthers`; null
 * when neither fits (the drain needs the others' hits as well as all of this weapon's).
 */
export const landedNeed = (
  model: Pick<DrainModel, 'def' | 'floor' | 'magicLevel'>,
  needs: Partial<Record<DefenceDrainWeapon, number>>,
  w: DefenceDrainWeapon,
  target: number,
): Pick<TeamNeed, 'landed' | 'from' | 'to' | 'afterOthers'> => {
  const alone = landedToReach(model, w, target);
  const most = maxLanded(w, needs[w] ?? 0);
  if (w === 'bgs' || (alone !== null && alone <= most)) return { landed: alone, from: model.def, to: target };
  const to = Math.max(target, model.floor);
  let d = model.def;
  const landedOthers: string[] = [];
  let landedTotal = 0;
  DEFENCE_DRAIN_ORDER.forEach((x) => {
    if (x === w || x === 'bgs' || !needs[x]) return;
    let n = 0;
    for (let i = 0; i < maxLanded(x, needs[x]!); i++) {
      const next = applyOutcome(model, x, d, { p: 1, hits: 1, damage: 0 });
      if (next <= to) break;
      d = next;
      n += 1;
    }
    if (n) {
      const [label, unit] = LANDED_UNIT[x];
      landedOthers.push(`${n} ${label} ${unit}${n === 1 ? '' : 's'}`);
      landedTotal += n;
    }
  });
  const k = d < model.def ? landedToReach({ ...model, def: d }, w, target) : null;
  if (k !== null && k > 0 && k <= most) {
    return {
      landed: k, from: d, to: target, afterOthers: `${landedOthers.join(' and ')} ${landedTotal === 1 ? 'lands' : 'land'}`,
    };
  }
  return { landed: null, from: model.def, to: target };
};

/**
 * Phase 29 review: per weapon of a first round, the fewest of its specs that give the same ranked Defence (Eye of Ayak:
 * the same ranked Magic defence drain) as all of them: "needed ×N · team brings ×M" on that boss under the plan's
 * carriers. Review 2: in sequence (upstream's weapon order): the first weapon's count is minimised with the others as
 * brought and fixed, then the next given it, so the counts together still give the same drain (on Xarth 4 maul alone or
 * 4 Tonalztics alone each reach the floor: one of them is needed). 0 = its specs change nothing there. Phase 30: when
 * the full set reaches the floor (Ayak: 0 magic def) with P ≥ threshold, "needed" is the fewest that still do (a
 * smaller count ranked at the same Defence but below the threshold no longer counts).
 */
export const specsNeeded = (
  model: Pick<DrainModel, 'def' | 'floor' | 'magicLevel' | 'magicDef' | 'outcomes' | 'expectedDamage'>,
  attempts: PlannerWeapon[],
  threshold = DEFAULT_FLOOR_THRESHOLD,
): Partial<Record<PlannerWeapon, TeamNeed>> => {
  const out: Partial<Record<PlannerWeapon, TeamNeed>> = {};
  const counts: Partial<Record<PlannerWeapon, number>> = {};
  attempts.forEach((w) => { counts[w] = (counts[w] ?? 0) + 1; });
  const seq = (c: Partial<Record<PlannerWeapon, number>>): DefenceDrainWeapon[] => DEFENCE_DRAIN_ORDER
    .flatMap((w) => Array(c[w] ?? 0).fill(w));
  const full = defenceOutcome(model, seq(counts), threshold);
  const atFloor = full.rankedDef <= model.floor;
  const defText = (o: DefenceOutcome) => (atFloor ? pct(o.pFloor) : `→ Def ${o.rankedDef}`);
  const cur = { ...counts };
  DEFENCE_DRAIN_ORDER.filter((w) => counts[w]).forEach((w) => {
    for (let n = 0; n <= counts[w]!; n++) {
      const o = defenceOutcome(model, seq({ ...cur, [w]: n }), threshold);
      // phase 30: when everything brought reaches the floor at the threshold, "needed" must too (not a sub-threshold
      // count that ranks at the same Defence: AG Flying ×3 (86%) → ×4 (98%))
      if (o.rankedDef === full.rankedDef && (full.pFloor < threshold || o.pFloor >= threshold)) {
        cur[w] = n;
        out[w] = {
          n, result: defText(o), brings: defText(full),
        };
        return;
      }
    }
  });
  // phase 32: the landed drains each needed weapon stands for ("needs 4 landed hits"), given the others' needed specs
  const needs = Object.fromEntries(DEFENCE_DRAIN_ORDER.map((w) => [w, out[w]?.n ?? 0])) as Record<DefenceDrainWeapon, number>;
  DEFENCE_DRAIN_ORDER.forEach((w) => {
    if (out[w]?.n) Object.assign(out[w]!, landedNeed(model, needs, w, full.rankedDef));
  });
  if (counts.ayak) {
    const fullAyak = ayakOutcome(model, counts.ayak, threshold);
    const zero = fullAyak.rankedDrain >= Math.max(0, model.magicDef);
    const ayakText = (o: AyakOutcome) => (zero ? pct(o.pZero) : `→ magic def ${o.magicDefAfter}`);
    for (let n = 0; n <= counts.ayak; n++) {
      const o = ayakOutcome(model, n, threshold);
      if (o.rankedDrain === fullAyak.rankedDrain && (fullAyak.pZero < threshold || o.pZero >= threshold)) {
        out.ayak = {
          n, result: ayakText(o), brings: ayakText(fullAyak), landed: fullAyak.rankedDrain, from: model.magicDef, to: fullAyak.magicDefAfter,
        };
        break;
      }
    }
  }
  return out;
};

/**
 * Phase 32: the Solo drain line's "needs …" per weapon: every spec the plan makes (`n` = its attempts of that weapon),
 * the plan's P(floor) (Eye of Ayak: P(magic def 0)) or "→ Def X" when it doesn't rank at the floor, and the landed
 * drains of that weapon alone that reach the ranked state (`landedToReach`). Weapons with no attempt are left out.
 */
export const soloNeeds = (
  model: Pick<DrainModel, 'def' | 'floor' | 'magicLevel' | 'magicDef'>,
  plan: Pick<SoloSpecPlan, 'attempts' | 'ayakAttempts' | 'defence' | 'ayak'>,
): Partial<Record<PlannerWeapon, TeamNeed>> => {
  const out: Partial<Record<PlannerWeapon, TeamNeed>> = {};
  const counts = countAttempts(plan.attempts);
  const atFloor = plan.defence.rankedDef <= model.floor;
  const defText = atFloor ? pct(plan.defence.pFloor) : `→ Def ${plan.defence.rankedDef}`;
  DEFENCE_DRAIN_ORDER.filter((w) => counts[w]).forEach((w) => {
    out[w] = {
      n: counts[w]!, result: defText, brings: defText, ...landedNeed(model, counts, w, plan.defence.rankedDef),
    };
  });
  if (plan.ayakAttempts > 0) {
    const a = plan.ayak;
    const text = a.rankedDrain >= Math.max(0, model.magicDef) ? pct(a.pZero) : `→ magic def ${a.magicDefAfter}`;
    out.ayak = {
      n: plan.ayakAttempts, result: text, brings: text, landed: a.rankedDrain, from: model.magicDef, to: a.magicDefAfter,
    };
  }
  return out;
};

// --- team ----------------------------------------------------------------------------------------------------------

export interface Carrier {
  weapon: PlannerWeapon;
  lightbearer?: boolean;
}

/** Carrier list from counts per weapon; `lightbearer` lists the weapons whose carriers wear one. */
export const carriersFromCounts = (
  counts: Partial<Record<PlannerWeapon, number>>,
  lightbearer: Partial<Record<PlannerWeapon, boolean>> = {},
): Carrier[] => (Object.keys(counts) as PlannerWeapon[]).flatMap((w) => Array.from(
  { length: Math.max(0, Math.floor(counts[w] || 0)) },
  () => ({ weapon: w, lightbearer: !!lightbearer[w] }),
));

export interface TeamSpecInput {
  partySize: number;
  carriers: Carrier[];
  fightSeconds: number;
  /** Attempts each carrier makes at the start (default: what 100% energy pays for = 2 for 50% specs). */
  firstRoundAttempts?: number;
  threshold?: number;
  /**
   * Phase 38h-1: the first round's specs per weapon (the drain line's plan within the carriers, encounterBudget.ts
   * `eventWantedCounts`); undefined = every carrier's `firstRoundAttempts`. Weapons that can't hit make none.
   */
  firstRound?: Partial<Record<PlannerWeapon, number>>;
}

export interface TeamSpecPlan {
  /** Carriers that count (at most partySize; carriers whose weapon can't hit make no attempts). */
  carriers: Carrier[];
  firstRound: { attempts: PlannerWeapon[], defence: DefenceOutcome, ayak: AyakOutcome };
  /** Whole fight: every carrier's budget, first round first. */
  fight: { attempts: number, expectedAttemptsToFloor: number, pFloor: number };
  reductions: DefenceReductions;
  text: string;
}

/**
 * Team spec planner: every carrier specs `firstRoundAttempts` times at the start (2 for 50% specs from 100%);
 * P(floor from the first round), expected Defence, Ayak P(magic def 0) are exact; the ranking uses the first round
 * ({@link rankedDefence}). `fight` adds every carrier's later attempts (regen, Lightbearer) after the first round.
 */
export const teamSpecPlan = (model: DrainModel, input: TeamSpecInput): TeamSpecPlan => {
  const threshold = input.threshold ?? DEFAULT_FLOOR_THRESHOLD;
  const carriers = input.carriers.slice(0, Math.max(0, input.partySize));
  const active = carriers.filter((c) => model.canHit[c.weapon]);
  const first = (c: Carrier) => input.firstRoundAttempts ?? specAttempts(100, model.energy[c.weapon]);
  const budgetAttempts = (c: Carrier) => specAttempts(
    energyBudget({ seconds: input.fightSeconds, lightbearer: !!c.lightbearer }),
    model.energy[c.weapon],
  );

  const firstAttempts: PlannerWeapon[] = input.firstRound
    ? ([...DEFENCE_DRAIN_ORDER, 'ayak'] as PlannerWeapon[])
      .flatMap((w) => (model.canHit[w] ? Array(Math.max(0, Math.floor(input.firstRound![w] ?? 0))).fill(w) : []))
    : active.flatMap((c) => Array(first(c)).fill(c.weapon));
  const defAttempts = inUpstreamOrder(firstAttempts.filter((w): w is DefenceDrainWeapon => w !== 'ayak'));
  const ayakAttempts = firstAttempts.filter((w) => w === 'ayak').length;
  const defence = defenceOutcome(model, defAttempts, threshold);
  const ayak = ayakOutcome(model, ayakAttempts, threshold);

  const later = inUpstreamOrder(active
    .filter((c) => c.weapon !== 'ayak')
    .flatMap((c) => Array(Math.max(0, budgetAttempts(c) - first(c))).fill(c.weapon)));
  const fightSeq = [...defAttempts, ...later];
  const fight = expectedAttemptsToFloor(model, fightSeq);

  const noHit = carriers.filter((c) => !model.canHit[c.weapon]).map((c) => LABELS[c.weapon]);
  const parts = [
    `first round ${describeAttempts(firstAttempts)} → ${describeDefence(model, defence, defAttempts.length > 0)}`,
  ];
  if (ayakAttempts > 0) {
    parts.push(model.magicDef <= 0
      ? 'Ayak: magic def already ≤ 0'
      : `Ayak P(magic def 0) ${pct(ayak.pZero)}, ≈ ${ayak.expectedDrain.toFixed(0)} drained → magic def ${ayak.magicDefAfter}`);
  }
  // The expected attempt count is capped at the attempts available, so it is only shown when the first round already
  // reaches the floor reliably; otherwise the whole-fight P(floor) is shown instead.
  if (defAttempts.length && defence.bestCaseDef <= model.floor) {
    parts.push(defence.pFloor >= threshold
      ? `expected attempts to the floor: ${fight.expected.toFixed(1)}`
      : `whole fight (${fightSeq.length} attempts incl. regen): P(floor) ${pct(fight.pWithin)}`);
  }
  if (noHit.length) parts.push(`${[...new Set(noHit)].join(', ')} can't hit here`);
  if (input.carriers.length > input.partySize) parts.push(`only the first ${input.partySize} carriers count (party size)`);

  return {
    carriers,
    firstRound: { attempts: firstAttempts, defence, ayak },
    fight: { attempts: fightSeq.length, expectedAttemptsToFloor: fight.expected, pFloor: fight.pWithin },
    reductions: countsToReductions(defence.rankedCounts, ayak.rankedDrain),
    text: parts.join('; '),
  };
};

// --- recommendation ------------------------------------------------------------------------------------------------

export interface CarrierRow {
  /** Carriers per weapon. */
  carriers: Partial<Record<DefenceDrainWeapon, number>>;
  /** P(floor) from the first round. */
  pFloor: number;
}

export interface CarrierRecommendation {
  partySize: number;
  threshold: number;
  /** Single-weapon teams: P(floor from the first round) for 1..partySize carriers of each weapon that can hit. */
  table: { weapon: DefenceDrainWeapon, p: number[] }[];
  /** Eye of Ayak carriers 1..partySize → P(magic def 0) from the first round. */
  ayak: number[];
  /** Fewest carriers (one weapon or a hammer + finisher pair) reaching the threshold; null if none within partySize. */
  best: CarrierRow | null;
  /** The same weapons with one carrier fewer (to show the step), if any. */
  previous: CarrierRow | null;
  /** e.g. "6-man: 1 Elder maul → 59%, 2 Elder maul → 97%". */
  text: string;
}

const describeRow = (r: CarrierRow): string => DEFENCE_DRAIN_ORDER
  .filter((w) => r.carriers[w])
  .map((w) => `${r.carriers[w]} ${LABELS[w]}`)
  .join(' + ');

const rowAttempts = (model: DrainModel, carriers: Partial<Record<DefenceDrainWeapon, number>>, perCarrier?: number) => (
  DEFENCE_DRAIN_ORDER.flatMap((w) => Array((carriers[w] || 0) * (perCarrier ?? specAttempts(100, model.energy[w]))).fill(w))
);

/**
 * Phase 38g: every team {@link recommendCarriers} considers (one weapon, or a hammer + finisher pair, at most
 * `partySize` carriers) that reaches P(floor from the first round) ≥ threshold, fewest carriers first; [] when none
 * does, [{}] when the boss is already at its floor.
 */
export const passingTeams = (
  model: DrainModel,
  opts: { partySize: number, threshold?: number },
): CarrierRow[] => {
  const threshold = opts.threshold ?? DEFAULT_FLOOR_THRESHOLD;
  if (model.def <= model.floor) return [{ carriers: {}, pFloor: 1 }];
  const n = Math.max(1, Math.floor(opts.partySize));
  const usable = DEFENCE_DRAIN_ORDER.filter((w) => model.canHit[w]);
  const candidates: Partial<Record<DefenceDrainWeapon, number>>[] = [];
  usable.forEach((w) => { for (let k = 1; k <= n; k++) candidates.push({ [w]: k }); });
  usable.filter((w) => w === 'elderMaul' || w === 'dwh').forEach((h) => usable.filter((w) => w === 'tonalztics' || w === 'bgs').forEach((f) => {
    for (let a = 1; a < n; a++) {
      for (let b = 1; a + b <= n; b++) candidates.push({ [h]: a, [f]: b });
    }
  }));
  const out: CarrierRow[] = [];
  candidates.forEach((c) => {
    const attempts = rowAttempts(model, c);
    if (bestCaseDef(model, attempts) > model.floor) return;
    const p = defenceOutcome(model, attempts, threshold).pFloor;
    if (p >= threshold) out.push({ carriers: c, pFloor: p });
  });
  const total = (c: Partial<Record<DefenceDrainWeapon, number>>) => Object.values(c).reduce((a, v) => a + (v || 0), 0);
  return out.map((r, i) => ({ r, i })).sort((x, y) => (total(x.r.carriers) - total(y.r.carriers)) || (x.i - y.i)).map((x) => x.r);
};

/**
 * Minimum carriers for P(floor from the first round) ≥ threshold. Candidates: one weapon (Elder maul, DWH,
 * Tonalztics, BGS) or a hammer (maul / DWH) + finisher (Tonalztics / BGS) pair, every split up to `partySize`
 * carriers; the fewest carriers win, then the higher probability.
 */
export const recommendCarriers = (
  model: DrainModel,
  opts: {
    partySize: number, threshold?: number, firstRoundAttempts?: number, label?: string,
    /** Phase 38g: the carriers the team has per weapon (the kit's): only teams within them are candidates for `best`. */
    available?: Partial<Record<PlannerWeapon, number>>,
    /** Phase 38g (speed): only `best` / `previous` (`table` and `ayak` left empty). */
    bestOnly?: boolean,
  },
): CarrierRecommendation => {
  const threshold = opts.threshold ?? DEFAULT_FLOOR_THRESHOLD;
  const n = Math.max(1, Math.floor(opts.partySize));
  const usable = DEFENCE_DRAIN_ORDER.filter((w) => model.canHit[w]);
  const memo = new Map<string, number>();
  const p = (carriers: Partial<Record<DefenceDrainWeapon, number>>): number => {
    const key = JSON.stringify(DEFENCE_DRAIN_ORDER.map((w) => carriers[w] || 0));
    if (!memo.has(key)) {
      const attempts = rowAttempts(model, carriers, opts.firstRoundAttempts);
      let v = 1;
      // phase 38g (speed): a team whose best case stays above the floor has P(floor) 0
      if (model.def > model.floor) v = bestCaseDef(model, attempts) > model.floor ? 0 : defenceOutcome(model, attempts, threshold).pFloor;
      memo.set(key, v);
    }
    return memo.get(key)!;
  };

  const table = opts.bestOnly ? [] : usable.map((w) => ({ weapon: w, p: Array.from({ length: n }, (_, i) => p({ [w]: i + 1 })) }));
  const ayak = opts.bestOnly ? [] : Array.from({ length: n }, (_, i) => ayakOutcome(
    model,
    (i + 1) * (opts.firstRoundAttempts ?? specAttempts(100, model.energy.ayak)),
    threshold,
  ).pZero);

  const candidates: Partial<Record<DefenceDrainWeapon, number>>[] = [];
  usable.forEach((w) => { for (let k = 1; k <= n; k++) candidates.push({ [w]: k }); });
  const hammers = usable.filter((w) => w === 'elderMaul' || w === 'dwh');
  const finishers = usable.filter((w) => w === 'tonalztics' || w === 'bgs');
  hammers.forEach((h) => finishers.forEach((f) => {
    for (let a = 1; a < n; a++) {
      for (let b = 1; a + b <= n; b++) candidates.push({ [h]: a, [f]: b });
    }
  }));
  const total = (c: Partial<Record<DefenceDrainWeapon, number>>) => Object.values(c).reduce((a, v) => a + (v || 0), 0);
  const fits = (c: Partial<Record<DefenceDrainWeapon, number>>) => !opts.available
    || DEFENCE_DRAIN_ORDER.every((w) => (c[w] ?? 0) <= (opts.available![w] ?? 0));
  let best: CarrierRow | null = null;
  // phase 38g (speed): fewest carriers first (a stable sort keeps the order within a total), larger teams skipped once
  // one reaches the threshold
  const ordered = candidates.filter(fits).map((c, i) => ({ c, i })).sort((x, y) => (total(x.c) - total(y.c)) || (x.i - y.i)).map((x) => x.c);
  for (const c of ordered) {
    if (best && total(c) > total(best.carriers)) break;
    const pc = p(c);
    if (pc >= threshold && (!best || total(c) < total(best.carriers)
      || (total(c) === total(best.carriers) && pc > best.pFloor + 1e-12))) {
      best = { carriers: c, pFloor: pc };
    }
  }

  let previous: CarrierRow | null = null;
  if (best) {
    // One carrier fewer of the weapon with the most carriers (the hammer on ties).
    const ws = DEFENCE_DRAIN_ORDER.filter((w) => best!.carriers[w]);
    const drop = ws.reduce((a, w) => ((best!.carriers[w] || 0) > (best!.carriers[a] || 0) ? w : a), ws[0]);
    const fewer = { ...best.carriers, [drop]: (best.carriers[drop] || 0) - 1 };
    if (total(fewer) > 0) {
      const cleaned = Object.fromEntries(Object.entries(fewer).filter(([, v]) => v)) as Partial<Record<DefenceDrainWeapon, number>>;
      previous = { carriers: cleaned, pFloor: p(cleaned) };
    }
  }

  const who = `${opts.label ? `${n}-man ${opts.label}` : `${n}-man`}`;
  let text: string;
  if (model.def <= model.floor) {
    text = `${who}: already at the Defence floor`;
  } else if (best) {
    text = `${who}: ${previous ? `${describeRow(previous)} → ${pct(previous.pFloor)}, ` : ''}${describeRow(best)} → ${pct(best.pFloor)} (≥ ${pct(threshold)} from the first round)`;
  } else {
    const top = table.map((t) => ({ w: t.weapon, p: t.p[n - 1] })).sort((a, b) => b.p - a.p)[0];
    text = top
      ? `${who}: no team of ≤ ${n} carriers reaches ${pct(threshold)} from the first round (best single weapon: ${n} ${LABELS[top.w]} → ${pct(top.p)})`
      : `${who}: no drain weapon can hit here`;
  }

  return {
    partySize: n, threshold, table, ayak, best, previous, text,
  };
};
