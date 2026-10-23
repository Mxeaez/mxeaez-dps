/* eslint-disable no-restricted-globals */
import {
  BestSetupSearchProgressMessage,
  BestSetupSearchRequest,
  BestSetupSearchResponse,
  WorkerRequestType,
} from '@/worker/CalcWorkerTypes';
import { WORKER_JSON_REPLACER, WORKER_JSON_REVIVER } from '@/utils';
import { runGearSearch } from '@/lib/fracturedArchive/search';

/**
 * Dedicated worker for the Fractured Archive gear search (WorkerRequestType.BEST_SETUP_SEARCH, phase 9). It is
 * separate from worker.ts because it streams progress messages before the final response (CalcWorker resolves one
 * response per request) and because the page cancels a search by terminating this worker (the search is one
 * synchronous loop, so a "cancel" message could not be read until it finished). Client: searchWorkerClient.ts.
 */
self.onmessage = (evt: MessageEvent<string>) => {
  const req = JSON.parse(evt.data, WORKER_JSON_REVIVER) as BestSetupSearchRequest;
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
