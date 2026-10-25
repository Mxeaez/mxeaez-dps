import {
  campRingItems, PlanInputs, RingRun, RingRunResult,
} from '@/lib/fracturedArchive/planner';
import { PlannerWeapon } from '@/lib/fracturedArchive/specs';
import { normaliseNotOwned } from '@/lib/fracturedArchive/ownership';
import { SearchRow } from '@/lib/fracturedArchive/search';
import { WORKER_JSON_REPLACER, WORKER_JSON_REVIVER } from '@/utils';

/**
 * Phase 37 (speed): the camp-one ring runs of a plan made in parallel by helper workers (searchWorkerClient.ts), then
 * handed to the main plan (`PlanHooks.ringRuns`), which takes every run it would have made from them and makes any
 * other itself. Results are unchanged: a ring run is deterministic given the plan inputs, its ring, screen or full, and
 * (Solo, planner decides) the spec subset the first screen picked, which is part of the run's key.
 *
 * Order: every ring's screen (Solo + planner decides: the first ring's screen first, then the others with its subset),
 * then the full runs of the best screened rings (one per helper, at least the two the ring guard always plans in full),
 * with the screens' search rows; the guard may still ask the main plan for more.
 */
export type RingRunner = (
  which: { ring: number | null, screen: boolean, screenSubset?: PlannerWeapon[] | null },
  searchRows?: Record<string, SearchRow[]>,
) => Promise<RingRunResult | null>;

/** Whether a plan has ring runs to spread: camp one ring with more than one owned ring. */
export const parallelRingsApply = (inputs: PlanInputs): boolean => inputs.ringPolicy === 'camp-one'
  && campRingItems(normaliseNotOwned(inputs.notOwned)).length > 1;

/** Runs the jobs it is given, at most `slots` at once, in the order given. */
const limiter = (slots: number) => {
  let active = 0;
  const queue: (() => void)[] = [];
  return <T>(job: () => Promise<T>): Promise<T> => new Promise<T>((resolve, reject) => {
    const go = () => {
      active += 1;
      job().then(resolve, reject).finally(() => {
        active -= 1;
        queue.shift()?.();
      });
    };
    if (active < Math.max(1, slots)) go();
    else queue.push(go);
  });
};

export const parallelRingRuns = async (
  inputs: PlanInputs,
  run: RingRunner,
  slots: number,
  onDone: (done: number, total: number) => void = () => {},
): Promise<{ ringRuns: Record<string, RingRun>, searchRows?: Record<string, SearchRow[]> }> => {
  const rings = campRingItems(normaliseNotOwned(inputs.notOwned));
  const ringRuns: Record<string, RingRun> = {};
  let searchRows: Record<string, SearchRow[]> | undefined;
  let done = 0;
  const total = rings.length * 2;
  const take = (r: RingRunResult | null) => {
    done += 1;
    onDone(done, total);
    if (!r) return null;
    ringRuns[r.key] = r.run;
    if (!searchRows) searchRows = { ...(inputs.searchRows ?? {}), ...r.searchRows };
    return r;
  };
  const limit = limiter(slots);
  const autoSolo = inputs.drain === 'solo' && inputs.specMode === 'auto';
  const screenSeconds = new Map<number, number>();
  let subset: PlannerWeapon[] | null = null;
  let rest = rings;
  // Solo, planner decides: the first ring's screen picks the subset the other screens use
  const first = autoSolo ? limit(() => run({ ring: rings[0].id, screen: true, screenSubset: null })) : null;
  if (first) {
    const f = take(await first);
    if (!f) return { ringRuns, searchRows };
    screenSeconds.set(rings[0].id, f.run.seconds);
    subset = f.run.screenSubset ?? null;
    rest = rings.slice(1);
  }
  const screens = await Promise.all(rest.map((it) => limit(() => run({ ring: it.id, screen: true, screenSubset: subset }, searchRows))));
  screens.forEach((r, i) => {
    if (take(r)) screenSeconds.set(rest[i].id, r!.run.seconds);
  });
  // full runs of the best screened rings (the planner's order: seconds, then the ring's name), one per helper; they
  // reuse the screens' search rows (starting them with the screens, each with its own search, was slower on a loaded
  // machine: more work in all)
  const order = rings.filter((it) => screenSeconds.has(it.id)).map((it) => ({ it, seconds: screenSeconds.get(it.id)! }))
    .sort((a, b) => ((a.seconds === b.seconds ? 0 : a.seconds - b.seconds) || a.it.name.localeCompare(b.it.name)));
  const fulls = order.slice(0, Math.max(2, Math.min(slots, order.length)));
  (await Promise.all(fulls.map((x) => limit(() => run({ ring: x.it.id, screen: false }, searchRows))))).forEach(take);
  onDone(total, total);
  return { ringRuns, searchRows };
};

/**
 * Ring runs between workers: the worker JSON (Maps, Sets) plus non-finite numbers kept (plain JSON turns Infinity into
 * null, and the ring screens compare seconds that can be Infinity).
 */
export const encodeRingRuns = (x: unknown): string => JSON.stringify(x, (k: string, v: unknown) => {
  if (typeof v === 'number' && !Number.isFinite(v)) return { _dataType: 'Number', n: String(v) };
  return WORKER_JSON_REPLACER(k, v as never);
});

export const decodeRingRuns = <T>(s: string): T => JSON.parse(s, (k, v) => {
  if (typeof v === 'object' && v?._dataType === 'Number') return Number(v.n);
  return WORKER_JSON_REVIVER(k, v);
});
