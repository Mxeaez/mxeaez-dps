import {
  BestSetupSearchProgressMessage,
  BestSetupSearchRequest,
  BestSetupSearchResponse,
  RaidRoutesProgressMessage,
  RaidRoutesRequest,
  RaidRoutesResponse,
  WorkerRequestType,
} from '@/worker/CalcWorkerTypes';
import { WORKER_JSON_REPLACER, WORKER_JSON_REVIVER } from '@/utils';
import { GearSearchProgress, GearSearchResult } from '@/lib/fracturedArchive/search';
import { RouteComparisonProgress, RouteComparisonResult } from '@/lib/fracturedArchive/raidTime';

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
