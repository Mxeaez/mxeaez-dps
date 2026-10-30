import { MySpecs } from '@/lib/fracturedArchive/presets';
import {
  DrainModel, PlannerWeapon, specAttempts,
} from '@/lib/fracturedArchive/specs';
import {
  ayakOutcome, DEFAULT_FLOOR_THRESHOLD, DefenceDrainWeapon, formatProbability, kitDrainPlan, passingTeams, planCarriers,
  recommendCarriers, teamLinePlan,
} from '@/lib/fracturedArchive/teamSpecs';
import { DRAIN_CLOSE_CALL } from '@/lib/fracturedArchive/specBudget';

/**
 * Phase 29: the planner decides the spec weapons. Pure and React-free (the planner runs it in the worker; Jest tests it
 * on toys). Docs: docs/BEST_SETUP.md, *Spec weapons (phase 29)*.
 *
 * - Solo: phase 38h-3 removed the subset search (`searchSpecSubsets`, route seconds + 1 s a slot); the planner brings
 *   the drain weapons its spec budget's plan (values in boss HP) specs with every owned one (planner.ts).
 * - Team ({@link teamRoles}): per boss / phase the fewest carriers reaching P(floor) ≥ threshold from the first round
 *   (teamSpecs.ts `recommendCarriers`), then per weapon the most any boss needs; Eye of Ayak only with mages in the
 *   party. Your share ({@link assignMe}): the most-needed weapon, carried only if it costs you no route time worth having.
 */

/** Order of the spec candidates (also the tie order of the "most needed" weapon). */
export const SPEC_CANDIDATES: PlannerWeapon[] = ['elderMaul', 'dwh', 'bgs', 'tonalztics', 'ayak'];

/**
 * Phase 29: carrying your share is worth it only if the slot it takes costs you less than this much route time (the
 * same rule as the kit's switches, planner.ts `SWITCH_MIN_SECONDS_PER_SLOT`).
 */
export const SHARE_MAX_SLOT_SECONDS = 1;

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

/**
 * Phase 33: the assumptions Search / Summary use for "Specs I bring". "Set manually" (`manual`): unchanged. "Planner
 * decides": the last plan's "Bring" set (Solo: the chosen subset; Team: your share) as the plan's own Solo drain state
 * (`mySpecsForSubset`: Ayak until magic def 0, Defence drains first; the Lightbearer flag kept); none before a plan has
 * run (the chips read "run a plan to fill these").
 */
export const withPlanSpecs = <A extends { mySpecs: MySpecs }>(a: A, planBring: PlannerWeapon[] | null | undefined, manual: boolean): A => (
  manual ? a : { ...a, mySpecs: mySpecsForSubset(planBring ?? [], a.mySpecs) }
);

/** The weapons of "Specs I bring" (Ayak when its count is > 0). */
export const subsetOfMySpecs = (m: MySpecs): PlannerWeapon[] => SPEC_CANDIDATES
  .filter((w) => (w === 'ayak' ? m.ayak > 0 : m[w as 'elderMaul' | 'dwh' | 'bgs' | 'tonalztics']));

/** e.g. "Bring: Elder maul, Tonalztics" / "Bring: no spec weapons". */
export const bringText = (weapons: PlannerWeapon[]): string => (weapons.length
  ? `Bring: ${SPEC_CANDIDATES.filter((w) => weapons.includes(w)).map(specWeaponLabel).join(', ')}`
  : 'Bring: no spec weapons');

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
   * (phase 38g: by headcount, `kitCarriers`; `steps` unused since), 'manual' = Advanced's counts.
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
    const ayak = opts.mages > 0 ? ayakCarriers(t.model, partySize, threshold) : 0;
    if (t.model.def <= t.model.floor) {
      return {
        key: t.key, label: t.label, group: t.group, carriers: null, pFloor: 1, ayak, note: 'already at the Defence floor',
      };
    }
    // phase 38h-1: the drain line's plan (teamSpecs.ts `teamLinePlan`: the fewest specs to the floor at the threshold,
    // in the order that lands most often), its carriers (was `recommendCarriers`: whole carriers, upstream's order)
    const plan = teamLinePlan(t.model, partySize, threshold);
    if (!plan || !plan.floor) {
      const rec = recommendCarriers(t.model, { partySize, threshold });
      return {
        key: t.key, label: t.label, group: t.group, carriers: null, pFloor: 0, ayak, note: rec.text.replace(/^[^:]*: /, ''),
      };
    }
    return {
      key: t.key, label: t.label, group: t.group, carriers: planCarriers(t.model, plan), pFloor: plan.p, ayak,
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

/**
 * Phase 38h-2: the carrier set worth the most HP (ties: more carriers, then the earlier in the list), except that a set
 * leaving you out (fewer carriers than `party`) wins unless the other is worth more than (1 + DRAIN_CLOSE_CALL) × it.
 */
export const pickCarriersByHp = <T extends { hp: number, total: number }>(xs: T[], party: number): T | null => {
  const leavesYou = (total: number) => party > 1 && total < party;
  const top = (ys: T[]) => ys.reduce<T | null>((b, x) => (!b || x.hp > b.hp + 1e-9
    || (Math.abs(x.hp - b.hp) <= 1e-9 && x.total > b.total) ? x : b), null);
  const all = top(xs);
  const free = top(xs.filter((x) => leavesYou(x.total)));
  return all && free && !leavesYou(all.total) && !(all.hp > (1 + DRAIN_CLOSE_CALL) * free.hp + 1e-9) ? free : all;
};

/**
 * Phase 38g: the kit's carriers by headcount, no seconds: per weapon the most any boss / phase needs (`teamRoles`: each
 * boss's fewest carriers at the threshold, `recommendCarriers`; Eye of Ayak: the fewest Ayak carriers to magic def 0,
 * capped at the mages). When those add up to more than the bars (`partySize`: the party, or the party − 1 when your bar
 * is yours), or they make you a carrier, every kit within the bars (each weapon at most that maximum; fix round, the user
 * 2026-10-28: Eye of Ayak competes in the same walk, not reserved first) is scored by: the needs it covers (a boss's
 * Defence: one of its 95% teams fits, `passingTeams`; its magic defence: its Ayak carriers fit); then (the user: carriers
 * must not crowd out your items) a kit that leaves you out (fewer carriers than `party`, the real party size); then the
 * worst covered boss's best P(floor) within it (higher); only then more carriers (spare slots filled); then more of the
 * weapon first in ROLE_ORDER. `uncovered` = the needs left without a team.
 *
 * Phase 38h-2 (with `value`, the planner): no reachable-floor count and no P(floor) tie-break: each kit within the bars
 * is worth the HP its drains are worth (`value` of every boss / phase at the drain line's plan within the kit,
 * `kitDrainPlan`, + its Eye of Ayak specs: the fewest of its Ayak carriers to magic def 0 at the threshold, else all);
 * the most HP wins (ties: more carriers, then more of the weapon first in ROLE_ORDER), except that a kit leaving you out
 * wins over one making you a carrier unless that one is worth more than (1 + DRAIN_CLOSE_CALL) × it (your slot is yours
 * on a close call; the user: carriers must not crowd out your items).
 */
export const kitCarriers = (
  targets: RoleTarget[],
  opts: {
    partySize: number, mages: number, threshold?: number,
    /** The real party size (default `partySize`): a kit of this many carriers makes you one. */
    party?: number,
    /**
     * Phase 38h-2: a boss / phase's drain value in boss HP (H × g ÷ (1 + g)) with these specs (`key` = the target's key);
     * undefined = the phase 38g scoring (coverage, P(floor)).
     */
    value?: (key: string, counts: Partial<Record<PlannerWeapon, number>>) => number,
    /**
     * Review 38h-2: receives every kit within the bars the walk considered (each weapon at most what its line needs; the
     * one kit when everything fits), for the planner's final choice by the HP the bars really pay.
     */
    onCandidates?: (kits: CarrierCounts[]) => void,
  },
): { carriers: CarrierCounts, uncovered: string[] } => {
  const threshold = opts.threshold ?? DEFAULT_FLOOR_THRESHOLD;
  const party = Math.max(1, Math.floor(opts.partySize));
  const realParty = Math.max(1, Math.floor(opts.party ?? opts.partySize));
  const leavesYou = (total: number) => (realParty > 1 && total < realParty ? 1 : 0);
  const mages = Math.max(0, Math.floor(opts.mages));
  const roles = teamRoles(targets, { partySize: party, mages, threshold });
  const max: CarrierCounts = { ...NO_CARRIERS };
  roles.rows.forEach((r) => { max[r.weapon] = r.weapon === 'ayak' ? Math.min(r.carriers, mages) : r.carriers; });
  const sum = (c: Partial<CarrierCounts>) => Object.values(c).reduce((t: number, v) => t + (v ?? 0), 0);
  if (sum(max) <= party && (leavesYou(sum(max)) || realParty <= 1)) {
    opts.onCandidates?.([{ ...max }]);
    return { carriers: max, uncovered: [] };
  }
  const weapons: PlannerWeapon[] = ['elderMaul', 'tonalztics', 'dwh', 'bgs', 'ayak'];
  const defence: DefenceDrainWeapon[] = ['elderMaul', 'tonalztics', 'dwh', 'bgs'];
  // phase 38h-1: the drain line's team first (its carriers, its chance), then every other 95% team
  const needs = targets.filter((t) => t.model.def > t.model.floor)
    .map((t) => {
      const line = roles.perTarget.find((n) => n.key === t.key);
      const first = line?.carriers ? [{ carriers: line.carriers, pFloor: line.pFloor }] : [];
      return { label: t.label, teams: [...first, ...passingTeams(t.model, { partySize: party, threshold })] };
    })
    .filter((b) => b.teams.length);
  const ayakNeeds = roles.perTarget.filter((n) => (n.ayak ?? 0) > 0 && (n.ayak ?? 0) <= mages)
    .map((n) => ({ label: `${n.label} (Eye of Ayak)`, ayak: n.ayak as number }));
  const fits = (c: Partial<Record<DefenceDrainWeapon, number>>, k: Partial<CarrierCounts>) => defence.every((w) => (c[w] ?? 0) <= (k[w] ?? 0));
  type Best = { k: Partial<CarrierCounts>, covered: number, free: number, worst: number, total: number };
  let best: Best | null = null;
  const score = (k: Partial<CarrierCounts>, total: number) => {
    let covered = 0;
    let worst = 1;
    needs.forEach((b) => {
      const within = b.teams.filter((c) => fits(c.carriers, k));
      if (within.length) {
        covered += 1;
        worst = Math.min(worst, Math.max(...within.map((c) => c.pFloor)));
      }
    });
    ayakNeeds.forEach((a) => { if ((k.ayak ?? 0) >= a.ayak) covered += 1; });
    const free = leavesYou(total);
    const b = best as Best | null;
    const better = !b || covered > b.covered || (covered === b.covered && (free > b.free || (free === b.free
      && (worst > b.worst + 1e-12 || (Math.abs(worst - b.worst) <= 1e-12 && total > b.total)))));
    if (better) {
      best = {
        k: { ...k }, covered, free, worst, total,
      };
    }
  };
  // phase 38h-2: the kits' HP values
  type Valued = { k: Partial<CarrierCounts>, hp: number, total: number };
  const valued: Valued[] = [];
  const hpOf = (k: Partial<CarrierCounts>): number => targets.reduce((t, x) => {
    const m = x.model;
    const counts: Partial<Record<PlannerWeapon, number>> = {};
    if (m.def > m.floor) Object.assign(counts, kitDrainPlan(m, { drain: 'team', carriers: k }, threshold)?.counts ?? {});
    const ak = Math.floor(k.ayak ?? 0);
    if (ak > 0 && m.canHit.ayak && m.magicDef > 0) {
      const per = specAttempts(100, m.energy.ayak);
      let n = ak;
      for (let j = 1; j <= ak; j++) {
        if (ayakOutcome(m, j * per, threshold).pZero >= threshold) {
          n = j;
          break;
        }
      }
      counts.ayak = n * per;
    }
    return Object.keys(counts).length ? t + opts.value!(x.key, counts) : t;
  }, 0);
  const walk = (i: number, k: Partial<CarrierCounts>, total: number) => {
    if (i === weapons.length) {
      if (opts.value) valued.push({ k: { ...k }, hp: hpOf(k), total });
      else score(k, total);
      return;
    }
    const w = weapons[i];
    // more of the earlier weapon first, so that ties keep it
    for (let n = Math.min(max[w], party - total); n >= 0; n--) walk(i + 1, { ...k, [w]: n }, total + n);
  };
  walk(0, {}, 0);
  if (opts.onCandidates) opts.onCandidates(valued.length ? valued.map((x) => ({ ...NO_CARRIERS, ...x.k })) : []);
  let k = (best as Best | null)?.k ?? {};
  if (opts.value) k = pickCarriersByHp(valued, realParty)?.k ?? {};
  return {
    carriers: { ...NO_CARRIERS, ...k },
    uncovered: [
      ...needs.filter((b) => !b.teams.some((c) => fits(c.carriers, k))).map((b) => b.label),
      ...ayakNeeds.filter((a) => (k.ayak ?? 0) < a.ayak).map((a) => a.label),
    ],
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
