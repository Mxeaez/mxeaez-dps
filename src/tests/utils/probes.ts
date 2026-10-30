import { generateEmptyPlayer } from '@/state';
import {
  compareRoutes, createKitEvaluator, EncounterTime, KitLoadout, RaidTimeAssumptions, raidTimeAssumptionsFrom,
  RouteComparison, routesFor, specBudgetFrom,
} from '@/lib/fracturedArchive/raidTime';
import {
  budgetGroups, rowWallsOn,
} from '@/lib/fracturedArchive/encounterBudget';
import { regenTicks, SPEC_REGEN_STEP, SURGE_DOSE_ENERGY } from '@/lib/fracturedArchive/specBudget';
import {
  comfortSupplies, ownedPinned, plan, PlanCandidate, PlanHooks, PlanResult, planAssumptions,
  RingPolicy, ringAssumptions, switchSavingRequired, toPlayerEquipment,
} from '@/lib/fracturedArchive/planner';
import { mySpecsForSubset } from '@/lib/fracturedArchive/specChoice';
import { applyLoadoutToPlayer } from '@/lib/fracturedArchive/loadout';
import {
  attemptsFromCounts, buildTargetMonster, findTarget,
} from '@/lib/fracturedArchive/bestSetup';
import { drainModel, PLANNER_WEAPONS, PlannerWeapon } from '@/lib/fracturedArchive/specs';
import {
  ayakOutcome, DEFENCE_DRAIN_ORDER, defenceOutcome, inUpstreamOrder,
} from '@/lib/fracturedArchive/teamSpecs';
import { DAMAGE_SPEC_WEAPONS, DamageSpecWeapon } from '@/lib/fracturedArchive/damageSpecs';
import { drainFacts } from '@/lib/fracturedArchive/drainLine';
import { BestSetupAssumptions } from '@/lib/fracturedArchive/presets';
import { raidConfig } from '@/lib/raids';
import { RaidId } from '@/lib/raids/types';
import { phase37Fixture } from '@/tests/utils/phase37';
import {
  headline, headlineCase, HEADLINE_CASES, HeadlineName, round2,
} from '@/tests/utils/headlines';
import { kitPresets, planInputsFor } from '@/tests/utils/crossRaid';

/**
 * Phase 37c: the three reusable review probes (docs/BUILDER.md, *Running things*), shared by their CLIs in
 * scripts/probes/ (bundled with esbuild, as pinHeadlines.mjs does) and their Jest smoke tests (Phase37c.test.ts). No Jest
 * import here. None of them changes a pinned number: they read the fixtures and time kits with the planner's own code.
 *
 * - `retimeHeadline`: a headline plan's kit (phase37/<name>.json) re-timed outside the planner — its loadouts rebuilt,
 *   the plan's ring, carriers / Solo subset, damage specs and surge potions put back on the assumptions, `compareRoutes`
 *   over the raid's routes — vs headlines.json (`recomputed` in crossRaidHeadlines.ts, for every headline).
 * - `drainOutcome`: one encounter of a re-timed headline: its spec plan per drain event (counts), each phase's drain model
 *   (Defence, floor, hit chances, energy per spec) and outcome (P(floor), expected / ranked Defence, Ayak), the pools'
 *   energy and regen ticks on the phases' wall clock.
 * - `bruteForceKits`: a reduced plan's final kit space (`PlanHooks.onKitSpace`, Phase36's kit brute force): every kit of
 *   up to `maxKit` candidates within the slots, timed exactly, vs the planner's kit.
 */

/** The assumptions a headline plan's final re-time uses (the planner's step 6), from its inputs and its result. */
export const finalAssumptions = (name: HeadlineName, r: Pick<PlanResult, 'ring' | 'specs'>): BestSetupAssumptions => {
  const inputs = headlineCase(name).inputs();
  const { kept } = ownedPinned(inputs.pinned, inputs.notOwned);
  const planA = planAssumptions(inputs.assumptions, comfortSupplies(inputs.supplies), kept);
  let a = ringAssumptions(planA, inputs.ringPolicy ?? 'switch', r.ring.ring ? { name: r.ring.ring } : null);
  if (inputs.drain === 'solo' && (inputs.specMode ?? 'manual') === 'auto') {
    a = { ...a, mySpecs: mySpecsForSubset(r.specs.bring, a.mySpecs) };
  }
  if (r.specs.team?.carriers) a = { ...a, team: { ...a.team, carriers: { ...r.specs.team.carriers } } };
  return {
    ...a,
    damageSpecs: r.specs.damage ?? [],
    surgePotions: r.specs.surgePotions ?? 0,
    // phase 38h-3b: the filler (spent from leftover energy only)
    ...(r.specs.filler ? { damageFiller: [r.specs.filler] } : {}),
  };
};

/** The kit of a plan as the evaluator's loadouts (the planner's `kitLoadoutsOf`). */
export const kitLoadouts = (kit: Pick<PlanCandidate, 'key' | 'label' | 'group' | 'options' | 'equipment'>[], a: BestSetupAssumptions): KitLoadout[] => {
  const base = generateEmptyPlayer();
  return kit.map((c) => {
    const eq = toPlayerEquipment(c.equipment);
    return {
      id: c.key,
      name: c.label,
      group: c.group,
      options: c.options,
      toPlayer: (m, o, ta) => applyLoadoutToPlayer(base, c.label, c.group, eq, o.style, o.spell, m, ta ?? a),
    };
  });
};

export interface RetimeEncounter {
  id: string;
  /** headlines.json (0.01 s). */
  pinned: number | null;
  retimed: number;
}

export interface Retime {
  name: HeadlineName;
  label: string;
  total: string;
  /** headlines.json's total (full precision). */
  pinned: number;
  /** The pinned route re-timed. */
  retimed: number;
  gap: number;
  route: string;
  /** The fastest route of the re-time (should be `route`). */
  fastest: string;
  encounters: RetimeEncounter[];
  /** Encounters whose re-time rounds to another 0.01 s than the pin. */
  encounterMismatches: string[];
  ms: number;
  /** For drainOutcome. */
  comparison: RouteComparison;
  timeA: RaidTimeAssumptions;
  assumptions: BestSetupAssumptions;
}

export const RETIME_TOLERANCE = 0.001;

/** Re-times a headline plan's kit (from its phase 37 fixture) and compares it with headlines.json. */
export const retimeHeadline = (name: HeadlineName): Retime => {
  const t0 = Date.now();
  const c = headlineCase(name);
  const raid = raidConfig(c.raid);
  const fx = phase37Fixture(name) as PlanResult & { plannedRoute: { id: string } };
  const a = finalAssumptions(name, fx);
  const inputs = c.inputs();
  const timeA = raidTimeAssumptionsFrom(a, inputs.drain, inputs.settings, raid.time);
  const comparison = compareRoutes(createKitEvaluator(kitLoadouts(fx.kit, a), a), timeA, routesFor(timeA));
  const h = headline(name);
  const route = comparison.routes.find((r) => r.route.id === h.route);
  if (!route) throw new Error(`${name}: route ${h.route} not in the raid's routes`);
  const encounters = route.encounters.map((e) => ({ id: e.id, pinned: h.encounters[e.id] ?? null, retimed: e.seconds }));
  return {
    name,
    label: c.label,
    total: h.total,
    pinned: h.seconds,
    retimed: route.seconds,
    gap: route.seconds - h.seconds,
    route: h.route,
    fastest: comparison.fastest >= 0 ? comparison.routes[comparison.fastest].route.id : '(none)',
    encounters,
    encounterMismatches: encounters.filter((e) => e.pinned === null || round2(e.retimed) !== e.pinned).map((e) => e.id),
    ms: Date.now() - t0,
    comparison,
    timeA,
    assumptions: a,
  };
};

export const retimeOk = (r: Retime): boolean => Math.abs(r.gap) <= RETIME_TOLERANCE && r.fastest === r.route
  && r.encounterMismatches.length === 0;

export const headlineNames = (): HeadlineName[] => HEADLINE_CASES.map((c) => c.name);

// --- drain outcome ---------------------------------------------------------------------------------------------------

export interface DrainPhaseRow {
  key: string;
  label: string;
  /** Index of the drain event (encounter spec plan) this phase belongs to; -1: none. */
  event: number;
  /** Wall-clock seconds of the phase's start / end (the reported phases, in order). */
  start: number;
  end: number;
  seconds: number;
  def: number | null;
  floor: number | null;
  magicDef: number | null;
  hitChance: Partial<Record<PlannerWeapon, number>>;
  energy: Partial<Record<PlannerWeapon, number>>;
  /** Under the event's counts (attempts the target can take). */
  attempts: string;
  /** Phase 38h-1: the order those attempts are sent in (teamSpecs `defenceOutcome`'s steps), e.g. "tonalztics → elderMaul ×2". */
  order: string;
  /** Phase 38h-1: this phase's own drain line plan (drainLine.ts `drainFacts`), e.g. "Tonalztics → Elder maul ×2 (floor 96%)". */
  line: string;
  pFloor: number | null;
  expectedDef: number | null;
  rankedDef: number | null;
  ayakDrain: number | null;
  magicDefAfter: number | null;
  /** Your damage specs on the phase (weapon × count, energy each). */
  damage: { weapon: string, count: number, energy: number }[];
}

export interface DrainPool {
  group: string;
  count: number;
  regenSeconds: number;
  start: number[];
  end: number[];
  /** Regen ticks over the encounter's wall clock (per pool). */
  ticks: number;
  /** Energy spent: drain specs (group = weapon) or damage specs (yours). */
  spent: number;
  /** Phase 38b: Death Charge energy restored per bar (covered kills × 15% × share). */
  restored: number;
  /**
   * start + 10 × ticks (+ 25 with the surge dose, yours) + Death Charge − spent; ≥ end when nothing was capped at 100%.
   * Spends on a phase starting inside Liquid adrenaline's window (phase 38b) count half.
   */
  balance: number;
}

export interface DrainOutcome {
  name: HeadlineName;
  encounter: string;
  label: string;
  seconds: number;
  wall: number;
  surge: boolean;
  events: { npc: string, reset?: string, firstRowKey: string, counts: Record<string, number> }[];
  /** The fixture's events for this encounter (the plan's own); `eventsMatch` = the re-time's are the same. */
  eventsMatch: boolean;
  phases: DrainPhaseRow[];
  pools: DrainPool[];
}

const encounterOf = (r: Retime, id: string): EncounterTime | undefined => r.comparison.routes
  .find((x) => x.route.id === r.route)?.encounters.find((e) => e.id === id);

/** The encounters of a headline's planned route (from the fixture; no re-time). */
export const plannedEncounters = (name: HeadlineName): string[] => Object.keys(headline(name).encounters);

/** The first headline (in HEADLINE_CASES order) whose planned route has the encounter. */
export const headlineWithEncounter = (encounter: string): HeadlineName | null => headlineNames()
  .find((n) => plannedEncounters(n).includes(encounter)) ?? null;

export const drainOutcome = (name: HeadlineName, encounter: string, retimed?: Retime): DrainOutcome => {
  const r = retimed ?? retimeHeadline(name);
  const e = encounterOf(r, encounter);
  if (!e) throw new Error(`${name}: encounter ${encounter} not on the planned route (${plannedEncounters(name).join(', ')})`);
  const a = r.assumptions;
  const drain = r.timeA.drain;
  const sp = e.specPlan;
  const fx = phase37Fixture(name) as { plannedRoute: { encounters: { id: string, events: unknown }[] } };
  const fxEvents = fx.plannedRoute.encounters.find((x) => x.id === encounter)?.events ?? null;
  const events = (sp?.events ?? []).map((ev) => ({
    npc: ev.npc, ...(ev.reset ? { reset: ev.reset } : {}), firstRowKey: ev.firstRowKey, counts: { ...ev.counts } as Record<string, number>,
  }));
  let clock = 0;
  // phase 38c fix: a fixed-length phase (Ocellus P2) lasts its seconds; phase 38j: stretched to the room time (rowWallsOn,
  // as the spec budget)
  const walls = rowWallsOn(e.phases, r.timeA, r.timeA.roomSeconds?.[encounter]);
  const phases: DrainPhaseRow[] = e.phases.map((p, pi) => {
    const start = clock;
    clock += walls[pi];
    const event = sp?.rowEvent[p.key] ?? -1;
    const counts = event >= 0 ? sp!.events[event].counts : {};
    const target = findTarget(p.targetKey);
    const row: DrainPhaseRow = {
      key: p.key,
      label: p.label,
      event,
      start,
      end: clock,
      seconds: p.seconds,
      def: null,
      floor: null,
      magicDef: null,
      hitChance: {},
      energy: {},
      attempts: '',
      order: '',
      line: '',
      pFloor: null,
      expectedDef: null,
      rankedDef: null,
      ayakDrain: null,
      magicDefAfter: null,
      damage: (p.damageSpecs ?? []).map((d) => ({ weapon: d.label, count: d.count, energy: DAMAGE_SPEC_WEAPONS[d.weapon as DamageSpecWeapon]?.energy ?? NaN })),
    };
    if (drain === 'none' || target.noDrains) return row;
    const model = drainModel(buildTargetMonster(target, p.phase, 'none', a).monster, a);
    const attempts = attemptsFromCounts(model, counts);
    const def = inUpstreamOrder(attempts.filter((w): w is Exclude<PlannerWeapon, 'ayak'> => w !== 'ayak'));
    const nAyak = attempts.length - def.length;
    const o = defenceOutcome(model, def, a.floorThreshold);
    const ay = ayakOutcome(model, nAyak, a.floorThreshold);
    const used = PLANNER_WEAPONS.filter((w) => (counts[w] ?? 0) > 0);
    return {
      ...row,
      def: model.def,
      floor: model.floor,
      magicDef: model.magicDef,
      hitChance: Object.fromEntries(used.map((w) => [w, model.canHit[w] ? model.hitChance[w] : 0])),
      energy: Object.fromEntries(used.map((w) => [w, model.energy[w]])),
      attempts: used.map((w) => `${counts[w]} ${w}${model.canHit[w] ? '' : ' (can\'t hit)'}`).join(', '),
      order: (o.steps ?? []).map((x) => `${x.weapon}${x.count > 1 ? ` ×${x.count}` : ''}`).join(' → '),
      line: drainFacts(model, {
        drain,
        partySize: a.partySize,
        threshold: a.floorThreshold,
        ...(drain === 'solo' ? { weapons: DEFENCE_DRAIN_ORDER.filter((w) => a.mySpecs[w]) } : {}),
      }).text.replace(/^Drain: /, '').replace(/; Eye of Ayak .*$/, ''),
      pFloor: o.pFloor,
      expectedDef: o.expectedDef,
      rankedDef: o.rankedDef,
      ayakDrain: nAyak > 0 ? ay.rankedDrain : null,
      magicDefAfter: nAyak > 0 ? ay.magicDefAfter : null,
    };
  });
  const wall = clock;
  const cfg = specBudgetFrom(a, drain);
  // phase 38b: Liquid adrenaline halves a phase's spends; Death Charge restores energy on kills
  const factorOf = (row?: DrainPhaseRow) => (row && sp?.adrenalineSeconds && row.start < sp.adrenalineSeconds - 1e-9 ? 0.5 : 1);
  const restoredPerBar = sp?.deathCharge ? sp.deathCharge.covered * sp.deathCharge.perKill : 0;
  const pools: DrainPool[] = (cfg ? budgetGroups(cfg) : []).map((g) => {
    const ticks = regenTicks(0, wall, g.regenSeconds);
    // drain specs are paid by the weapon's carriers (Team) or by you (Solo, group 'me'); damage specs by you
    let spent = 0;
    events.forEach((ev) => {
      Object.entries(ev.counts).forEach(([w, n]) => {
        if (g.id === w || (drain === 'solo' && g.id === 'me')) {
          const row = phases.find((p) => p.key === ev.firstRowKey);
          spent += n * (row?.energy[w as PlannerWeapon] ?? 50) * factorOf(row);
        }
      });
    });
    if (g.id === 'me') phases.forEach((p) => p.damage.forEach((d) => { spent += d.count * d.energy * factorOf(p); }));
    const start = sp?.start[g.id] ?? [];
    const sum = (xs: number[]) => xs.reduce((t, x) => t + x, 0);
    return {
      group: g.id,
      count: g.count,
      regenSeconds: g.regenSeconds,
      start,
      end: sp?.end[g.id] ?? [],
      ticks,
      spent,
      restored: g.count * restoredPerBar,
      balance: sum(start) + g.count * (ticks * SPEC_REGEN_STEP + restoredPerBar) + (g.id === 'me' && sp?.surge ? SURGE_DOSE_ENERGY : 0) - spent,
    };
  });
  return {
    name,
    encounter,
    label: e.label,
    seconds: e.seconds,
    wall,
    surge: !!sp?.surge,
    events,
    eventsMatch: JSON.stringify(sp?.events ?? null) === JSON.stringify(fxEvents),
    phases,
    pools,
  };
};

// --- brute-force kits ------------------------------------------------------------------------------------------------

export type BrutePool = 'tiny' | 'small';

/** The reduced pools: small = Phase36's kit brute force (10 candidates, ≤ 4 loadouts); tiny = the smoke test's. */
export const BRUTE_POOLS: Record<BrutePool, { maxCandidates: number, seeds: number, maxKit: number }> = {
  small: { maxCandidates: 10, seeds: 4, maxKit: 4 },
  tiny: { maxCandidates: 4, seeds: 2, maxKit: 3 },
};

export interface BruteForce {
  raid: RaidId;
  route: string;
  pool: BrutePool;
  ring: string | null;
  candidates: string[];
  /** Candidates the kits were built from (all, or `opts.candidates` + the planner's). */
  tried: number;
  kits: number;
  planned: number;
  plannedKit: string[];
  /** The kit space's own time of the planner's members (= planned). */
  plannedInSpace: number;
  best: number;
  bestKit: string[];
  /** planned − best (> 1e-6: the planner missed a faster kit). */
  gap: number;
  /**
   * Phase 38c fix: the fastest kit of all, ignoring the planner's dedupe rule (`best` keeps only kits where every
   * loadout saves at least `switchSavingRequired` of the slots it takes: a kit the planner would prune is no answer).
   */
  bestAny: number;
  bestAnyKit: string[];
  /** Kits dropped by the dedupe rule. */
  pruned: number;
  /** Largest kit tried (≥ the planner's). */
  maxKit: number;
  /** The five fastest kits. */
  top: { seconds: number, kit: string[] }[];
  /** The reduced plan's time; `ms` = plan + kits. */
  planMs: number;
  ms: number;
  /** Phase 38j review: the plan's largest (borrowed − own) ÷ borrowed among the kits re-timed with their own plan. */
  ownPlanSlack: number;
}

export const BRUTE_TOLERANCE = 1e-6;

/** A reduced Team-defaults plan of the raid (Phase36's tuning) and every kit of its final kit space timed exactly. */
export const bruteForceKits = (raid: RaidId, opts: {
  pool?: BrutePool, route?: string, maxKit?: number, ringPolicy?: RingPolicy,
  /** Only kits of the first N candidates and the planner's (a quicker, weaker check; the smoke test). */
  candidates?: number,
} = {}): BruteForce => {
  const t0 = Date.now();
  const pool = opts.pool ?? 'small';
  const cfg = BRUTE_POOLS[pool];
  const maxKit0 = opts.maxKit ?? cfg.maxKit;
  const rc = raidConfig(raid);
  const inputs = planInputsFor(rc, false);
  const routes = routesFor(raidTimeAssumptionsFrom(inputs.assumptions, inputs.drain, inputs.settings, rc.time));
  // default: the raid's Team headline route (FA: Phase36's brute-force route)
  const route = opts.route ?? headline(HEADLINE_CASES.find((c) => c.raid === raid)!.name).route;
  if (!routes.some((r) => r.id === route)) throw new Error(`${raid}: unknown route ${route}`);
  type Space = Parameters<NonNullable<PlanHooks['onKitSpace']>>[0];
  const spaces: Space[] = [];
  const res = plan({ ...inputs, route, ringPolicy: opts.ringPolicy ?? inputs.ringPolicy }, {
    model: rc.time,
    presets: kitPresets(rc),
    search: { weapons: ['Scythe of Vitur', 'Tumeken\'s shadow', 'Twisted bow'], maxPasses: 1 },
    perGroupWeapons: 1,
    perWeapon: 1,
    bases: 1,
    partners: 1,
    seeds: cfg.seeds,
    maxCandidates: cfg.maxCandidates,
  }, { onKitSpace: (x) => { spaces.push(x); } });
  const s = spaces.find((x) => x.ring === res.ring.ring);
  if (!s) throw new Error(`${raid}: no kit space for the chosen ring ${res.ring.ring}`);
  const planMs = Date.now() - t0;
  const planned = res.comparison!.routes[res.planned].seconds;
  // every kit up to the larger of the pool's size and the planner's kit (so the planner's kit is in the space)
  const maxKit = Math.max(maxKit0, s.members.length);
  const names = (m: number[]) => m.map((i) => s.candidates[i].label);
  const timed: { seconds: number, members: number[] }[] = [];
  const pickable = s.candidates.map((_, i) => i)
    .filter((i) => opts.candidates === undefined || i < opts.candidates || s.members.includes(i));
  const walk = (from: number, m: number[]) => {
    if (m.length && s.used(m) <= s.total) timed.push({ seconds: s.exactSeconds(m), members: [...m] });
    if (m.length >= maxKit) return;
    for (let j = from; j < pickable.length; j++) walk(j + 1, [...m, pickable[j]]);
  };
  walk(0, []);
  // phase 38c fix: the planner's dedupe rule (optimiseKit `prune`): a loadout must save switchSavingRequired(the slots
  // it adds); a kit breaking it for any member is not a plan the planner may return (every subset is in `timed`)
  const keyOf = (m: number[]) => [...m].sort((a, b) => a - b).join(',');
  const secondsOf = new Map(timed.map((t) => [keyOf(t.members), t.seconds]));
  const dedupeOk = (t: { seconds: number, members: number[] }) => !Number.isFinite(t.seconds) || t.members.length < 2
    || t.members.every((_, j) => {
      const fewer = t.members.filter((__, k) => k !== j);
      const loss = (secondsOf.get(keyOf(fewer)) ?? s.exactSeconds(fewer)) - t.seconds;
      return loss >= switchSavingRequired(s.used(t.members) - s.used(fewer)) - BRUTE_TOLERANCE;
    });
  // fastest first; ties: enumeration order (the first found wins, as in Phase36's test)
  const sortedAll = timed.map((t, i) => ({ ...t, i }))
    .sort((x, y) => (x.seconds < y.seconds ? -1 : Number(x.seconds > y.seconds)) || x.i - y.i);
  const sorted = sortedAll.filter(dedupeOk);
  const best = sorted.length ? sorted[0] : { seconds: Infinity, members: [] as number[] };
  const bestAny = sortedAll.length ? sortedAll[0] : { seconds: Infinity, members: [] as number[] };
  return {
    raid,
    route,
    pool,
    ring: res.ring.ring,
    candidates: s.candidates.map((c) => c.label),
    tried: pickable.length,
    kits: timed.length,
    planned,
    plannedKit: names(s.members),
    plannedInSpace: s.exactSeconds(s.members),
    best: best.seconds,
    bestKit: names(best.members),
    gap: planned - best.seconds,
    bestAny: bestAny.seconds,
    bestAnyKit: names(bestAny.members),
    pruned: sortedAll.length - sorted.length,
    maxKit,
    top: sorted.slice(0, 5).map((t) => ({ seconds: t.seconds, kit: names(t.members) })),
    planMs,
    ms: Date.now() - t0,
    ownPlanSlack: res.stats.ownPlanSlack ?? 0,
  };
};

export const bruteForceOk = (b: BruteForce): boolean => b.gap <= BRUTE_TOLERANCE
  && Math.abs(b.plannedInSpace - b.planned) <= BRUTE_TOLERANCE && b.kits > 0;

/** Route ids of a raid (for the CLI's help). */
export const raidRoutes = (raid: RaidId): string[] => {
  const rc = raidConfig(raid);
  const inputs = planInputsFor(rc, false);
  return routesFor(raidTimeAssumptionsFrom(inputs.assumptions, inputs.drain, inputs.settings, rc.time)).map((r) => r.id);
};
