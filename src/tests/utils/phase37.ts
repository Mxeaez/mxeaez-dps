import { readFileSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { generateEmptyPlayer } from '@/state';
import {
  PlanInputs, PlanResult, PlanTuning, planItemByName,
} from '@/lib/fracturedArchive/planner';
import { RaidConfig, raidConfig } from '@/lib/raids';
import { RaidId } from '@/lib/raids/types';

/**
 * Phase 37: the plan results captured at HEAD 7864dacc (phase 36 fixes) before any phase 37 change
 * (src/tests/lib/raids/phase37/*.json) and how a plan is compared with them (`normalised`): the result as JSON (infinities
 * as strings) without the run statistics (DPS evaluation counts, timings); the search rows and the route comparison as
 * hashes of their JSON (exact: JSON prints every number exactly) plus the planned route's encounters (readable diffs).
 */
export const PHASE37_FIXTURES = join(__dirname, '..', 'lib', 'raids', 'phase37');

const sha = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex');

export const normalised = (r: PlanResult) => {
  const { stats, ...rest } = r;
  const n = JSON.parse(JSON.stringify({ ...rest, objectiveSeconds: stats.objectiveSeconds, fightSeconds: stats.fightSeconds ?? null }, (k, v) => (typeof v === 'number' && !Number.isFinite(v) ? String(v) : v)));
  const route = n.comparison?.routes?.[n.planned];
  return {
    ...n,
    searchRows: sha(n.searchRows),
    comparison: sha(n.comparison),
    plannedRoute: route ? {
      id: route.route.id,
      seconds: route.seconds,
      surgeDoses: route.surgeDoses ?? null,
      encounters: route.encounters.map((e: { id: string, seconds: number, specPlan?: { events: unknown, damage: unknown, surge: boolean } }) => ({
        id: e.id, seconds: e.seconds, events: e.specPlan?.events ?? null, damage: e.specPlan?.damage ?? null, surge: e.specPlan?.surge ?? null,
      })),
    } : null,
  };
};

export const phase37Fixture = (name: string) => JSON.parse(readFileSync(join(PHASE37_FIXTURES, `${name}.json`), 'utf8'));

const groupPresets = (raid: RaidConfig) => (['melee', 'ranged', 'magic'] as const)
  .map((g) => raid.presets.find((p) => p.group === g)!).filter(Boolean);
export const reducedTuning = (raid: RaidConfig): PlanTuning => ({
  model: raid.time,
  presets: [...groupPresets(raid), ...raid.presets.filter((p) => p.name.includes('pickaxe'))],
  search: { weapons: ['Scythe of Vitur', 'Tumeken\'s shadow', 'Twisted bow'], maxPasses: 1 },
  perGroupWeapons: 1,
  perWeapon: 1,
  bases: 1,
  partners: 1,
  seeds: 2,
});
const PHASE29_PINNED: Record<RaidId, string[]> = {
  'fractured-archive': ['Lightbearer', 'Zaryte crossbow', 'Kodai wand', 'Ancestral robe top', 'Elidinis\' ward (f)', 'Saturated heart'],
  toa: ['Lightbearer', 'Zaryte crossbow'],
  cox: ['Dragon pickaxe'],
  tob: ['Saturated heart'],
};
/** Phase27's reduced "allow switches" plans (with the phase 32 "Specs I bring"). */
export const reducedCase = (id: RaidId): [PlanInputs, PlanTuning] => {
  const raid = raidConfig(id);
  return [{
    basePlayer: generateEmptyPlayer(),
    assumptions: { ...raid.defaultAssumptions, mySpecs: { ...raid.defaultAssumptions.mySpecs, elderMaul: true, ayak: 2 } },
    drain: 'team',
    settings: raid.defaultTimeSettings,
    route: 'all',
    pinned: PHASE29_PINNED[id].map((n) => planItemByName(n).id),
    nonItemSlots: raid.planDefaults.nonItemSlots,
    supplies: raid.defaultSupplies,
    ringPolicy: 'switch',
  }, reducedTuning(raid)];
};

/**
 * Phase 37: the CPU seconds (user + system) this process spent in `f` — a plan's cost that doesn't depend on how many
 * other suites Jest runs at once (their wall times there were 3-9× the plan's alone on the dev machine), for the
 * headline plans' time budgets.
 */
export const cpuSeconds = <T>(f: () => T): { result: T, seconds: number } => {
  const c0 = process.cpuUsage();
  const result = f();
  const c = process.cpuUsage(c0);
  return { result, seconds: (c.user + c.system) / 1e6 };
};

/**
 * Phase 37: the memo counters of each pinned plan's chosen ring run (`stats.memo`, deterministic): runs (encounters and
 * passes actually computed) and hits (remembered results reused). `memoWithin` allows 20% more encounter runs, 20% more
 * pass runs (phase 37b: bounded separately, so a lost pass memo fails even when the encounter memo makes up for it) and
 * 20% fewer hits in all, so a memo that stops working fails whatever the machine's load.
 */
export type MemoCounters = { encounterRuns: number, passRuns: number, encounterHits: number, passHits: number };
export const PHASE37_MEMO: Record<string, MemoCounters> = {
  r27fa: {
    encounterRuns: 1048, passRuns: 1126, encounterHits: 14200, passHits: 175,
  },
  r27toa: {
    encounterRuns: 1009, passRuns: 1217, encounterHits: 10261, passHits: 317,
  },
  r27tob: {
    encounterRuns: 1678, passRuns: 1809, encounterHits: 58898, passHits: 222,
  },
  r27cox: {
    encounterRuns: 1546, passRuns: 3268, encounterHits: 39314, passHits: 3475,
  },
  fa: {
    encounterRuns: 10648, passRuns: 10445, encounterHits: 444976, passHits: 9904,
  },
  toa: {
    encounterRuns: 32784, passRuns: 10825, encounterHits: 544791, passHits: 24576,
  },
  tob: {
    encounterRuns: 25001, passRuns: 23772, encounterHits: 1335979, passHits: 5729,
  },
  cox: {
    encounterRuns: 43236, passRuns: 39222, encounterHits: 1122494, passHits: 27158,
  },
  faSolo: {
    encounterRuns: 91778, passRuns: 38942, encounterHits: 3464758, passHits: 56722,
  },
  faNotOwned: {
    encounterRuns: 58528, passRuns: 10474, encounterHits: 1579384, passHits: 59896,
  },
};
export const memoCountersWithin = (m: MemoCounters | undefined, want: MemoCounters | undefined): boolean => {
  if (!m || !want) return false;
  return m.encounterRuns <= want.encounterRuns * 1.2 && m.passRuns <= want.passRuns * 1.2
    && m.encounterHits + m.passHits >= (want.encounterHits + want.passHits) * 0.8;
};
export const memoWithin = (r: PlanResult, name: string): boolean => memoCountersWithin(r.stats.memo, PHASE37_MEMO[name]);
