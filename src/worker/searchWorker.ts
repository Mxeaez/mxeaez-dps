/* eslint-disable no-restricted-globals */
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
import { runGearSearch } from '@/lib/fracturedArchive/search';
import { computeRouteComparison } from '@/lib/fracturedArchive/raidTime';
import { plan } from '@/lib/fracturedArchive/planner';

/**
 * Dedicated worker for the Fractured Archive gear search (WorkerRequestType.BEST_SETUP_SEARCH, phase 9). It is
 * separate from worker.ts because it streams progress messages before the final response (CalcWorker resolves one
 * response per request) and because the page cancels a search by terminating this worker (the search is one
 * synchronous loop, so a "cancel" message could not be read until it finished). Client: searchWorkerClient.ts.
 * Phase 16: also WorkerRequestType.RAID_ROUTES (the Routes tab: per-phase searches + route times), same protocol.
 * Phase 17: WorkerRequestType.RAID_PLAN (the Plan tab: searches, DPS matrix, kit optimiser), same protocol.
 */
self.onmessage = (evt: MessageEvent<string>) => {
  const parsed = JSON.parse(evt.data, WORKER_JSON_REVIVER) as BestSetupSearchRequest | RaidRoutesRequest | RaidPlanRequest;
  if (parsed.type === WorkerRequestType.RAID_PLAN) {
    const sequenceId = parsed.sequenceId || 0;
    const res = { type: WorkerRequestType.RAID_PLAN, sequenceId } as RaidPlanResponse;
    try {
      res.payload = plan(parsed.data, {}, {
        onProgress: (progress) => {
          const msg: RaidPlanProgressMessage = { type: WorkerRequestType.RAID_PLAN, sequenceId, progress };
          self.postMessage(JSON.stringify(msg, WORKER_JSON_REPLACER));
        },
      });
    } catch (e: unknown) {
      console.error(e);
      res.error = e instanceof Error ? e.message : `Unknown error type: ${e}`;
    }
    self.postMessage(JSON.stringify(res, WORKER_JSON_REPLACER));
    return;
  }
  if (parsed.type === WorkerRequestType.RAID_ROUTES) {
    const sequenceId = parsed.sequenceId || 0;
    const res = { type: WorkerRequestType.RAID_ROUTES, sequenceId } as RaidRoutesResponse;
    try {
      res.payload = computeRouteComparison(parsed.data, (progress) => {
        const msg: RaidRoutesProgressMessage = { type: WorkerRequestType.RAID_ROUTES, sequenceId, progress };
        self.postMessage(JSON.stringify(msg, WORKER_JSON_REPLACER));
      });
    } catch (e: unknown) {
      console.error(e);
      res.error = e instanceof Error ? e.message : `Unknown error type: ${e}`;
    }
    self.postMessage(JSON.stringify(res, WORKER_JSON_REPLACER));
    return;
  }
  const req = parsed;
  const sequenceId = req.sequenceId || 0;
  const res = { type: WorkerRequestType.BEST_SETUP_SEARCH, sequenceId } as BestSetupSearchResponse;
  try {
    if (req.type !== WorkerRequestType.BEST_SETUP_SEARCH) {
      throw new Error(`Unsupported request type ${req.type}`);
    }
    const { basePlayer, query, assumptions } = req.data;
    res.payload = runGearSearch(basePlayer, query, assumptions, {
      onProgress: (progress) => {
        const msg: BestSetupSearchProgressMessage = { type: WorkerRequestType.BEST_SETUP_SEARCH, sequenceId, progress };
        self.postMessage(JSON.stringify(msg, WORKER_JSON_REPLACER));
      },
    });
  } catch (e: unknown) {
    console.error(e);
    res.error = e instanceof Error ? e.message : `Unknown error type: ${e}`;
  }
  self.postMessage(JSON.stringify(res, WORKER_JSON_REPLACER));
};

export {};
