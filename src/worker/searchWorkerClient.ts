import {
  BestSetupSearchProgressMessage,
  BestSetupSearchRequest,
  BestSetupSearchResponse,
  RaidPlanProgressMessage,
  RaidPlanRequest,
  RaidPlanResponse,
  RaidRoutesProgressMessage,
  RaidRoutesRequest,
  RaidRoutesResponse,
  WorkerRequestType,
} from '@/worker/CalcWorkerTypes';
import { WORKER_JSON_REPLACER, WORKER_JSON_REVIVER } from '@/utils';
import { GearSearchProgress, GearSearchResult } from '@/lib/fracturedArchive/search';
import { RouteComparisonProgress, RouteComparisonResult } from '@/lib/fracturedArchive/raidTime';
import { PlanProgress, PlanResult, RingRunResult } from '@/lib/fracturedArchive/planner';
import {
  decodeRingRuns, encodeRingRuns, parallelRingRuns, parallelRingsApply,
} from '@/lib/fracturedArchive/parallelRings';

/** A running gear search (phase 9) in its own worker. `cancel()` terminates the worker. */
export interface SearchJob {
  promise: Promise<GearSearchResult>;
  cancel: () => void;
}

let nextSequenceId = 1;

export const startGearSearch = (
  data: BestSetupSearchRequest['data'],
  onProgress: (p: GearSearchProgress) => void,
): SearchJob => {
  const worker = new Worker(new URL('./searchWorker.ts', import.meta.url));
  const sequenceId = nextSequenceId;
  nextSequenceId += 1;
  let settled = false;
  let rejectFn: (e: Error) => void = () => {};

  const promise = new Promise<GearSearchResult>((resolve, reject) => {
    rejectFn = reject;
    worker.onmessage = (ev: MessageEvent<string>) => {
      const msg = JSON.parse(ev.data, WORKER_JSON_REVIVER) as BestSetupSearchResponse | BestSetupSearchProgressMessage;
      if (msg.sequenceId !== sequenceId) return;
      if ('progress' in msg) {
        onProgress(msg.progress);
        return;
      }
      settled = true;
      worker.terminate();
      if (msg.error) {
        reject(new Error(msg.error));
      } else {
        resolve(msg.payload);
      }
    };
    worker.onerror = (ev: ErrorEvent) => {
      settled = true;
      worker.terminate();
      reject(new Error(ev.message || 'Search worker failed'));
    };
  });

  const req: BestSetupSearchRequest = { type: WorkerRequestType.BEST_SETUP_SEARCH, sequenceId, data };
  worker.postMessage(JSON.stringify(req, WORKER_JSON_REPLACER));

  return {
    promise,
    cancel: () => {
      if (settled) return;
      settled = true;
      worker.terminate();
      rejectFn(new Error('cancelled'));
    },
  };
};

/** A running route comparison (phase 16, the Routes tab) in its own worker. `cancel()` terminates the worker. */
export interface RoutesJob {
  promise: Promise<RouteComparisonResult>;
  cancel: () => void;
}

export const startRouteComparison = (
  data: RaidRoutesRequest['data'],
  onProgress: (p: RouteComparisonProgress) => void,
): RoutesJob => {
  const worker = new Worker(new URL('./searchWorker.ts', import.meta.url));
  const sequenceId = nextSequenceId;
  nextSequenceId += 1;
  let settled = false;
  let rejectFn: (e: Error) => void = () => {};

  const promise = new Promise<RouteComparisonResult>((resolve, reject) => {
    rejectFn = reject;
    worker.onmessage = (ev: MessageEvent<string>) => {
      const msg = JSON.parse(ev.data, WORKER_JSON_REVIVER) as RaidRoutesResponse | RaidRoutesProgressMessage;
      if (msg.sequenceId !== sequenceId) return;
      if ('progress' in msg) {
        onProgress(msg.progress);
        return;
      }
      settled = true;
      worker.terminate();
      if (msg.error) {
        reject(new Error(msg.error));
      } else {
        resolve(msg.payload);
      }
    };
    worker.onerror = (ev: ErrorEvent) => {
      settled = true;
      worker.terminate();
      reject(new Error(ev.message || 'Routes worker failed'));
    };
  });

  const req: RaidRoutesRequest = { type: WorkerRequestType.RAID_ROUTES, sequenceId, data };
  worker.postMessage(JSON.stringify(req, WORKER_JSON_REPLACER));

  return {
    promise,
    cancel: () => {
      if (settled) return;
      settled = true;
      worker.terminate();
      rejectFn(new Error('cancelled'));
    },
  };
};

/** A running raid plan (phase 17, the Plan tab) in its own worker. `cancel()` terminates the worker. */
export interface PlanJob {
  promise: Promise<PlanResult>;
  cancel: () => void;
}

/** One RAID_PLAN request in its own worker (terminated when it answers or on `stop`). */
const planWorker = (
  req: Omit<RaidPlanRequest, 'sequenceId'>,
  onProgress: (p: PlanProgress) => void,
  workers: Set<Worker>,
): Promise<RaidPlanResponse> => {
  const worker = new Worker(new URL('./searchWorker.ts', import.meta.url));
  workers.add(worker);
  const sequenceId = nextSequenceId;
  nextSequenceId += 1;
  return new Promise<RaidPlanResponse>((resolve, reject) => {
    const done = () => {
      worker.terminate();
      workers.delete(worker);
    };
    worker.onmessage = (ev: MessageEvent<string>) => {
      const msg = JSON.parse(ev.data, WORKER_JSON_REVIVER) as RaidPlanResponse | RaidPlanProgressMessage;
      if (msg.sequenceId !== sequenceId) return;
      if ('progress' in msg) {
        onProgress(msg.progress);
        return;
      }
      done();
      if (msg.error) reject(new Error(msg.error));
      else resolve(msg);
    };
    worker.onerror = (ev: ErrorEvent) => {
      done();
      reject(new Error(ev.message || 'Plan worker failed'));
    };
    worker.postMessage(JSON.stringify({ ...req, sequenceId }, WORKER_JSON_REPLACER));
  });
};

/** Phase 37: helper workers for the camp-one ring runs (one per spare core; none below 4 cores). */
const helperSlots = (): number => {
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 0 : 0;
  return cores >= 4 ? Math.min(8, cores - 1) : 0;
};

/**
 * A running raid plan (phase 17, the Plan tab). Phase 37: with camp one ring and enough cores, the ring screens and
 * the best rings' full runs run in parallel helper workers first (parallelRings.ts); the main plan takes them (same
 * result as planning alone, faster). `cancel()` terminates every worker.
 */
export const startRaidPlan = (
  data: RaidPlanRequest['data'],
  onProgress: (p: PlanProgress) => void,
): PlanJob => {
  const workers = new Set<Worker>();
  let settled = false;
  let rejectFn: (e: Error) => void = () => {};
  const stopAll = () => {
    workers.forEach((w) => w.terminate());
    workers.clear();
  };
  const promise = new Promise<PlanResult>((resolve, reject) => {
    rejectFn = reject;
    (async () => {
      let inputs = data;
      let ringRuns: string | undefined;
      const slots = helperSlots();
      if (slots >= 2 && parallelRingsApply(data)) {
        const t0 = Date.now();
        const runs = await parallelRingRuns(data, async (which, searchRows) => {
          const res = await planWorker({
            type: WorkerRequestType.RAID_PLAN, data: searchRows ? { ...data, searchRows } : data, ring: which,
          }, () => {}, workers);
          return res.ringRun ? decodeRingRuns<RingRunResult | null>(res.ringRun) : null;
        }, slots, (done, total) => {
          if (!settled) {
            onProgress({
              stage: 'rings', done, total, label: `rings in parallel (${slots} workers, ${((Date.now() - t0) / 1000).toFixed(0)} s)`,
            });
          }
        });
        if (settled) return;
        if (runs.searchRows) inputs = { ...data, searchRows: runs.searchRows };
        ringRuns = encodeRingRuns(runs.ringRuns);
      }
      const res = await planWorker({
        type: WorkerRequestType.RAID_PLAN, data: inputs, ...(ringRuns ? { ringRuns } : {}),
      }, (p) => { if (!settled) onProgress(p); }, workers);
      if (settled) return;
      settled = true;
      resolve(res.payload);
    })().catch((e: Error) => {
      if (settled) return;
      settled = true;
      stopAll();
      reject(e);
    });
  });

  return {
    promise,
    cancel: () => {
      if (settled) return;
      settled = true;
      stopAll();
      rejectFn(new Error('cancelled'));
    },
  };
};
