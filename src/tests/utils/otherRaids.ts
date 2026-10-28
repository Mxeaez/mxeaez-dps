import { describe, test } from '@jest/globals';

/**
 * Phase 38f-2: round 6 is Fractured Archive only. Every test that plans, pins or renders ToA / CoX / ToB runs only with
 * `RUN_OTHER_RAIDS=1` (round 7 turns them back on). Combines with `slow.ts`: a slow other-raid test needs both flags
 * (`otherRaidsSlowTest`). Pure shared-maths unit tests stay on without it.
 */
export const OTHER_RAIDS = !!process.env.RUN_OTHER_RAIDS;
export const otherRaidsDescribe = OTHER_RAIDS ? describe : describe.skip;
export const otherRaidsTest = OTHER_RAIDS ? test : test.skip;

const SLOW = !!process.env.RUN_SLOW_TESTS;
export const otherRaidsSlowDescribe = OTHER_RAIDS && SLOW ? describe : describe.skip;
export const otherRaidsSlowTest = OTHER_RAIDS && SLOW ? test : test.skip;

/** `test.each` rows: the other raids' rows only with `RUN_OTHER_RAIDS=1`. */
export const faRows = <T extends { id: string }>(rows: T[]): T[] => rows.filter((r) => OTHER_RAIDS || r.id === 'fractured-archive');
