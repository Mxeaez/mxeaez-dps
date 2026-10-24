import { Player } from '@/types/Player';
import { Monster } from '@/types/Monster';
import { NPCVsPlayerCalculatedLoadout, PlayerVsNPCCalculatedLoadout } from '@/types/State';
import { CalcOpts } from '@/lib/BaseCalc';
import {
  CompareResult, CompareXAxis, CompareYAxis,
} from '@/lib/Comparator';
import { BestSetupAssumptions } from '@/lib/fracturedArchive/presets';
import { GearSearchProgress, GearSearchQuery, GearSearchResult } from '@/lib/fracturedArchive/search';
import {
  RouteComparisonProgress, RouteComparisonRequest, RouteComparisonResult,
} from '@/lib/fracturedArchive/raidTime';
import { PlanInputs, PlanProgress, PlanResult } from '@/lib/fracturedArchive/planner';

/**
 * Requests
 */

export enum WorkerRequestType {
  COMPUTE_BASIC,
  COMPUTE_REVERSE,
  COMPUTE_TTK_PARALLEL,
  COMPUTE_TTK,
  COMPARE,
  BEST_SETUP_SEARCH, // Fractured Archive gear search; own worker (src/worker/searchWorker.ts), sends progress messages
  RAID_ROUTES, // Fractured Archive route comparison (phase 16); same worker and protocol as BEST_SETUP_SEARCH
  RAID_PLAN, // Fractured Archive raid planner (phase 17); same worker and protocol as BEST_SETUP_SEARCH
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

export interface BestSetupSearchRequest extends WorkerRequest<WorkerRequestType.BEST_SETUP_SEARCH> {
  data: {
    basePlayer: Player,
    query: GearSearchQuery,
    assumptions: BestSetupAssumptions,
    /** Phase 26: search only owned items (empty / missing = the full pool). */
    notOwned?: string[],
  },
}

export interface RaidRoutesRequest extends WorkerRequest<WorkerRequestType.RAID_ROUTES> {
  data: RouteComparisonRequest,
}

export interface RaidPlanRequest extends WorkerRequest<WorkerRequestType.RAID_PLAN> {
  data: PlanInputs,
}

export type CalcRequestsUnion =
  BestSetupSearchRequest |
  RaidRoutesRequest |
  RaidPlanRequest |
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

export interface BestSetupSearchResponse extends WorkerResponse<WorkerRequestType.BEST_SETUP_SEARCH> {
  payload: GearSearchResult,
}

/** Interim message of a BEST_SETUP_SEARCH (searchWorker.ts posts these before the final response). */
export interface BestSetupSearchProgressMessage {
  type: WorkerRequestType.BEST_SETUP_SEARCH,
  sequenceId: number,
  progress: GearSearchProgress,
}

export interface RaidRoutesResponse extends WorkerResponse<WorkerRequestType.RAID_ROUTES> {
  payload: RouteComparisonResult,
}

/** Interim message of a RAID_ROUTES request. */
export interface RaidRoutesProgressMessage {
  type: WorkerRequestType.RAID_ROUTES,
  sequenceId: number,
  progress: RouteComparisonProgress,
}

export interface RaidPlanResponse extends WorkerResponse<WorkerRequestType.RAID_PLAN> {
  payload: PlanResult,
}

/** Interim message of a RAID_PLAN request. */
export interface RaidPlanProgressMessage {
  type: WorkerRequestType.RAID_PLAN,
  sequenceId: number,
  progress: PlanProgress,
}

export type CalcResponsesUnion =
  BestSetupSearchResponse |
  RaidRoutesResponse |
  RaidPlanResponse |
  ComputeBasicResponse |
  ComputeReverseResponse |
  CompareResponse |
  TtkResponse |
  TtkResponseParallel;
export type CalcResponse<T extends WorkerRequestType> = CalcResponsesUnion & { type: T };

export type Handler<T extends WorkerRequestType> = (data: Extract<CalcRequestsUnion, { type: T }>['data'], rawRequest: CalcRequestsUnion) => Promise<CalcResponse<T>['payload']>;
