import { Player } from '@/types/Player';
import { Monster } from '@/types/Monster';
import { NPCVsPlayerCalculatedLoadout, PlayerVsNPCCalculatedLoadout } from '@/types/State';
import { CalcOpts } from '@/lib/BaseCalc';
import {
  CompareResult, CompareXAxis, CompareYAxis,
} from '@/lib/Comparator';
import { BestSetupQuery, BestSetupResult } from '@/lib/fracturedArchive/bestSetup';
import { BestSetupAssumptions } from '@/lib/fracturedArchive/presets';
import { GearSearchProgress, GearSearchQuery, GearSearchResult } from '@/lib/fracturedArchive/search';

/**
 * Requests
 */

export enum WorkerRequestType {
  COMPUTE_BASIC,
  COMPUTE_REVERSE,
  COMPUTE_TTK_PARALLEL,
  COMPUTE_TTK,
  COMPARE,
  BEST_SETUP, // Fractured Archive "Best setup" view (src/lib/fracturedArchive/bestSetup.ts)
  BEST_SETUP_SEARCH, // Fractured Archive gear search; own worker (src/worker/searchWorker.ts), sends progress messages
}

export interface WorkerRequest<T extends WorkerRequestType> {
  type: T,
  sequenceId?: number,
}

export interface WorkerCalcOpts {
  hitDistHideMisses?: boolean,
  detailedOutput?: CalcOpts['detailedOutput'],
  disableMonsterScaling?: CalcOpts['disableMonsterScaling'],
}

export interface ComputeBasicRequest extends WorkerRequest<WorkerRequestType.COMPUTE_BASIC> {
  data: {
    loadouts: Player[],
    monster: Monster,
    calcOpts: WorkerCalcOpts,
  }
}

export interface ComputeReverseRequest extends WorkerRequest<WorkerRequestType.COMPUTE_REVERSE> {
  data: {
    loadouts: Player[],
    monster: Monster,
    calcOpts: WorkerCalcOpts,
  }
}

export interface CompareRequest extends WorkerRequest<WorkerRequestType.COMPARE> {
  data: {
    axes: {
      x: CompareXAxis,
      y: CompareYAxis,
    },
    loadouts: Player[],
    monster: Monster,
  },
}

export interface TtkRequest extends WorkerRequest<WorkerRequestType.COMPUTE_TTK> {
  data: {
    loadouts: Player[],
    monster: Monster,
    calcOpts: WorkerCalcOpts,
  },
}

export interface TtkRequestParallel extends WorkerRequest<WorkerRequestType.COMPUTE_TTK_PARALLEL> {
  data: TtkRequest['data']
}

export interface BestSetupRequest extends WorkerRequest<WorkerRequestType.BEST_SETUP> {
  data: {
    basePlayer: Player,
    queries: BestSetupQuery[],
    assumptions: BestSetupAssumptions,
    ttk: 'all' | 'top',
  },
}

export interface BestSetupSearchRequest extends WorkerRequest<WorkerRequestType.BEST_SETUP_SEARCH> {
  data: {
    basePlayer: Player,
    query: GearSearchQuery,
    assumptions: BestSetupAssumptions,
  },
}

export type CalcRequestsUnion =
  BestSetupRequest |
  BestSetupSearchRequest |
  ComputeBasicRequest |
  ComputeReverseRequest |
  CompareRequest |
  TtkRequest |
  TtkRequestParallel;

/**
 * Responses
 */

export interface WorkerResponse<T extends WorkerRequestType> {
  type: T,
  sequenceId: number,
  error?: string,
  payload: unknown,
}

export interface ComputeBasicResponse extends WorkerResponse<WorkerRequestType.COMPUTE_BASIC> {
  payload: Omit<PlayerVsNPCCalculatedLoadout, 'ttkDist'>[],
}

export interface ComputeReverseResponse extends WorkerResponse<WorkerRequestType.COMPUTE_REVERSE> {
  payload: NPCVsPlayerCalculatedLoadout[],
}

export interface CompareResponse extends WorkerResponse<WorkerRequestType.COMPARE> {
  payload: CompareResult,
}

export interface TtkResponse extends WorkerResponse<WorkerRequestType.COMPUTE_TTK> {
  payload: Pick<PlayerVsNPCCalculatedLoadout, 'ttkDist'>[],
}

export interface TtkResponseParallel extends WorkerResponse<WorkerRequestType.COMPUTE_TTK_PARALLEL> {
  payload: TtkResponse['payload'],
}

export interface BestSetupResponse extends WorkerResponse<WorkerRequestType.BEST_SETUP> {
  payload: BestSetupResult[],
}

export interface BestSetupSearchResponse extends WorkerResponse<WorkerRequestType.BEST_SETUP_SEARCH> {
  payload: GearSearchResult,
}

/** Interim message of a BEST_SETUP_SEARCH (searchWorker.ts posts these before the final response). */
export interface BestSetupSearchProgressMessage {
  type: WorkerRequestType.BEST_SETUP_SEARCH,
  sequenceId: number,
  progress: GearSearchProgress,
}

export type CalcResponsesUnion =
  BestSetupResponse |
  BestSetupSearchResponse |
  ComputeBasicResponse |
  ComputeReverseResponse |
  CompareResponse |
  TtkResponse |
  TtkResponseParallel;
export type CalcResponse<T extends WorkerRequestType> = CalcResponsesUnion & { type: T };

export type Handler<T extends WorkerRequestType> = (data: Extract<CalcRequestsUnion, { type: T }>['data'], rawRequest: CalcRequestsUnion) => Promise<CalcResponse<T>['payload']>;
