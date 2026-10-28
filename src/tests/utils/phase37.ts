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
  // phase 38g + fix round (one fixed drain set per event: one model pass per solve instead of one per event option,
  // so far fewer pass hits; carriers by headcount, no carrier greedy): every entry re-measured
  // phase 38c (Ocellus: P2 in the plan, three drain events; ToA: six routes, 9 encounters): r27fa was 1048 / 1126 /
  // 14200 / 175, r27toa 1009 / 1217 / 10261 / 317
  r27fa: {
    encounterRuns: 1221, passRuns: 1212, encounterHits: 18419, passHits: 57,
  },
  r27toa: {
    encounterRuns: 1531, passRuns: 1523, encounterHits: 16802, passHits: 81,
  },
  r27tob: {
    encounterRuns: 1692, passRuns: 1688, encounterHits: 56760, passHits: 40,
  },
  r27cox: {
    encounterRuns: 1574, passRuns: 1548, encounterHits: 40436, passHits: 126,
  },
  // phase 38c (Ocellus: P2 in the plan, three drain events; fix round: P2's wall time): was 10648 / 10445 / 444976 /
  // 9904; phase 38e (the item beam: a kit re-optimised per candidate when no slot is free, the beam's states, swaps):
  // fa was 11075 / 10789 / 444757 / 12739, toa 69292 / 18123 / 1307456 / 56648, tob 25001 / 23772 / 1335979 / 5729,
  // cox 73944 / 35416 / 1961276 / 62818, faNotOwned 26777 / 19128 / 776583 / 19830
  fa: {
    encounterRuns: 10616, passRuns: 9091, encounterHits: 448944, passHits: 2377,
  },
  // phase 38a (rooms 1-2 before the supplies: other drain states and candidates): was 32784 / 10825 / 544791 / 24576;
  // phase 38b (Liquid adrenaline: more spec options per event, damage specs on the adds' rows): was 39715 / 11721 /
  // 728535 / 30660; phase 38c (six routes: every path room before and after the supplies, 9 encounters): was 48604 /
  // 16842 / 915256 / 35030
  toa: {
    encounterRuns: 148925, passRuns: 14881, encounterHits: 1997296, passHits: 134574,
  },
  tob: {
    encounterRuns: 81307, passRuns: 24069, encounterHits: 4006607, passHits: 57518,
  },
  // phase 38b (damage specs on the adds' rows; the plan brings 2 damage spec weapons and keeps 8 loadouts): was 43236 /
  // 39222 / 1122494 / 27158
  cox: {
    encounterRuns: 160802, passRuns: 21682, encounterHits: 4931388, passHits: 139912,
  },
  // phase 38c (Ocellus: P2 in the plan, three drain events): faSolo was 91778 / 38942 / 3464758 / 56722, faNotOwned
  // 58528 / 10474 / 1579384 / 59896
  faSolo: {
    encounterRuns: 84288, passRuns: 39263, encounterHits: 3156808, passHits: 46445,
  },
  // phase 38h-1 (2 Elder maul + 3 Tonalztics carriers cover every boss, so you are no longer a carrier: free slots, the
  // item beam re-optimises kits with damage specs / surge): faNotOwned was 9153 / 9086 / 583727 / 227
  faNotOwned: {
    encounterRuns: 74977, passRuns: 9838, encounterHits: 1854095, passHits: 66172,
  },
};
export const memoCountersWithin = (m: MemoCounters | undefined, want: MemoCounters | undefined): boolean => {
  if (!m || !want) return false;
  return m.encounterRuns <= want.encounterRuns * 1.2 && m.passRuns <= want.passRuns * 1.2
    && m.encounterHits + m.passHits >= (want.encounterHits + want.passHits) * 0.8;
};
export const memoWithin = (r: PlanResult, name: string): boolean => memoCountersWithin(r.stats.memo, PHASE37_MEMO[name]);
