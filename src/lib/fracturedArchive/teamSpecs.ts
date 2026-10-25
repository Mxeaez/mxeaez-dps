import { INITIAL_MONSTER_INPUTS } from '@/lib/Monsters';
import { DefenceReductions } from '@/lib/fracturedArchive/drains';
import {
  DrainModel, energyBudget, PlanLabel, planLabel, planLabelText, PlannerWeapon, SpecOutcome, specAttempts,
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
 * Hit chances are taken against the undrained boss (specs.ts), so follow-up specs are modelled a bit less accurate
 * than they are (conservative).
 *
 * Which Defence the DPS ranking uses ({@link rankedDefence}): the floor if P(floor) ≥ threshold (default 95%), else
 * the reachable Defence nearest to the expected Defence. Same for Ayak: Magic defence 0 if
 * P(0) ≥ threshold, else bonus − expected drain.
 */

export type DefenceDrainWeapon = 'elderMaul' | 'dwh' | 'tonalztics' | 'bgs';
/** Upstream's `applyDefenceReductions` order. */
export const DEFENCE_DRAIN_ORDER: DefenceDrainWeapon[] = ['elderMaul', 'dwh', 'tonalztics', 'bgs'];
export const DEFAULT_FLOOR_THRESHOLD = 0.95;

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

export const defenceOutcome = (
  model: Pick<DrainModel, 'def' | 'floor' | 'magicLevel' | 'outcomes'>,
  attempts: DefenceDrainWeapon[],
  threshold = DEFAULT_FLOOR_THRESHOLD,
): DefenceOutcome => rankedDefence(defenceDistribution(model, inUpstreamOrder(attempts)), model.floor, threshold);

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
export const ayakOutcome = (
  model: Pick<DrainModel, 'magicDef' | 'outcomes' | 'expectedDamage'>,
  attempts: number,
  threshold = DEFAULT_FLOOR_THRESHOLD,
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

const describeDefence = (model: Pick<DrainModel, 'def' | 'floor'>, o: DefenceOutcome, hasAttempts: boolean): string => {
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
  const budget = energyBudget({ seconds: input.fightSeconds, lightbearer: input.lightbearer });
  const weapons = DEFENCE_DRAIN_ORDER.filter((w) => input.carried[w] && model.canHit[w]);
  let ayakUsable = model.canHit.ayak && model.magicDef > 0 ? Math.max(0, Math.floor(input.ayakSpecs)) : 0;
  if (input.ayakUntilZero) ayakUsable = ayakSpecsToThreshold(model, ayakUsable, threshold);
  const specCost = Math.max(...DEFENCE_DRAIN_ORDER.map((w) => model.energy[w]), model.energy.ayak);
  const total = specAttempts(budget, specCost);

  // Attempts needed for P(floor) >= threshold (for the label), and the best plan per attempt count.
  const byCount: { attempts: DefenceDrainWeapon[], outcome: DefenceOutcome }[] = [];
  let neededAttempts: number | null = null; // stays null if no carried weapon can hit
  if (weapons.length) {
    for (let n = 1; n <= MAX_SOLO_ATTEMPTS; n++) {
      byCount[n] = bestAttempts(model, weapons, n, threshold);
      if (byCount[n].outcome.pFloor >= threshold) {
        neededAttempts = n;
        break;
      }
    }
  }
  if (model.def <= model.floor) neededAttempts = 0;

  let defenceAttempts: number;
  let ayakAttempts: number;
  if (input.priority === 'ayak') {
    ayakAttempts = Math.min(ayakUsable, total);
    defenceAttempts = weapons.length ? Math.min(total - ayakAttempts, neededAttempts ?? MAX_SOLO_ATTEMPTS) : 0;
  } else {
    defenceAttempts = weapons.length ? Math.min(total, neededAttempts ?? MAX_SOLO_ATTEMPTS) : 0;
    ayakAttempts = Math.min(ayakUsable, total - defenceAttempts);
  }
  if (defenceAttempts > 0 && !byCount[defenceAttempts]) {
    byCount[defenceAttempts] = bestAttempts(model, weapons, defenceAttempts, threshold);
  }
  const chosen = defenceAttempts > 0 ? byCount[defenceAttempts] : bestAttempts(model, [], 0, threshold);
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
    neededText = weapons.length ? `floor needs > ${MAX_SOLO_ATTEMPTS} specs` : 'no carried Defence weapon can hit';
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

// --- specs needed if every one lands (phase 29 drain line) -----------------------------------------------------------

/**
 * Phase 29: the specs of each weapon needed to reach the Defence floor if every spec lands its best case (maul / DWH
 * one landed hit, Tonalztics two damaging hits, BGS its expected damage on a hit), drawn from `available` (e.g. the
 * team's first round): the fewest specs in total (ties: more of the earlier weapon in upstream order). Weapons that
 * can't hit count as unavailable. `defence` is null when even every available spec landing doesn't reach the floor;
 * Eye of Ayak: specs of average damage on a hit to take the magic defence bonus to 0 (null if it can't hit).
 */
export const neededSpecs = (
  model: Pick<DrainModel, 'def' | 'floor' | 'magicLevel' | 'magicDef' | 'canHit' | 'hitChance' | 'expectedDamage'>,
  available: Partial<Record<PlannerWeapon, number>>,
): { defence: Partial<Record<DefenceDrainWeapon, number>> | null, ayak: number | null } => {
  const weapons = DEFENCE_DRAIN_ORDER.filter((w) => (available[w] ?? 0) > 0 && model.canHit[w]);
  const landed = (w: DefenceDrainWeapon): SpecOutcome => {
    if (w === 'tonalztics') return { p: 1, hits: 2, damage: 0 };
    if (w === 'bgs') {
      const onHit = model.hitChance.bgs > 0 ? model.expectedDamage.bgs / model.hitChance.bgs : 0;
      return { p: 1, hits: 1, damage: Math.round(onHit) };
    }
    return { p: 1, hits: 1, damage: 0 };
  };
  let defence: Partial<Record<DefenceDrainWeapon, number>> | null = null;
  if (model.def <= model.floor) {
    defence = {};
  } else {
    let best: { counts: Partial<Record<DefenceDrainWeapon, number>>, total: number, key: number[] } | null = null;
    const walk = (i: number, counts: Partial<Record<DefenceDrainWeapon, number>>) => {
      if (i === weapons.length) {
        let d = model.def;
        weapons.forEach((w) => {
          for (let k = 0; k < (counts[w] ?? 0); k++) d = applyOutcome(model, w, d, landed(w));
        });
        const total = weapons.reduce((t, w) => t + (counts[w] ?? 0), 0);
        const key = weapons.map((w) => -(counts[w] ?? 0));
        const lexLess = (a: number[], b: number[]) => {
          for (let j = 0; j < a.length; j++) if (a[j] !== b[j]) return a[j] < b[j];
          return false;
        };
        if (total > 0 && d <= model.floor && (!best || total < best.total || (total === best.total && lexLess(key, best.key)))) {
          best = { counts: { ...counts }, total, key };
        }
        return;
      }
      for (let k = 0; k <= (available[weapons[i]] ?? 0); k++) walk(i + 1, { ...counts, [weapons[i]]: k });
    };
    walk(0, {});
    defence = best ? (best as { counts: Partial<Record<DefenceDrainWeapon, number>> }).counts : null;
  }
  let ayak: number | null = null;
  if (model.magicDef <= 0) ayak = 0;
  else if (model.canHit.ayak && model.hitChance.ayak > 0 && model.expectedDamage.ayak > 0) {
    ayak = Math.ceil(model.magicDef / (model.expectedDamage.ayak / model.hitChance.ayak));
  }
  return { defence, ayak };
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

  const firstAttempts: PlannerWeapon[] = active.flatMap((c) => Array(first(c)).fill(c.weapon));
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
 * Minimum carriers for P(floor from the first round) ≥ threshold. Candidates: one weapon (Elder maul, DWH,
 * Tonalztics, BGS) or a hammer (maul / DWH) + finisher (Tonalztics / BGS) pair, every split up to `partySize`
 * carriers; the fewest carriers win, then the higher probability.
 */
export const recommendCarriers = (
  model: DrainModel,
  opts: { partySize: number, threshold?: number, firstRoundAttempts?: number, label?: string },
): CarrierRecommendation => {
  const threshold = opts.threshold ?? DEFAULT_FLOOR_THRESHOLD;
  const n = Math.max(1, Math.floor(opts.partySize));
  const usable = DEFENCE_DRAIN_ORDER.filter((w) => model.canHit[w]);
  const memo = new Map<string, number>();
  const p = (carriers: Partial<Record<DefenceDrainWeapon, number>>): number => {
    const key = JSON.stringify(DEFENCE_DRAIN_ORDER.map((w) => carriers[w] || 0));
    if (!memo.has(key)) {
      memo.set(key, model.def <= model.floor ? 1 : defenceOutcome(model, rowAttempts(model, carriers, opts.firstRoundAttempts), threshold).pFloor);
    }
    return memo.get(key)!;
  };

  const table = usable.map((w) => ({ weapon: w, p: Array.from({ length: n }, (_, i) => p({ [w]: i + 1 })) }));
  const ayak = Array.from({ length: n }, (_, i) => ayakOutcome(
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
  let best: CarrierRow | null = null;
  for (const c of candidates) {
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
