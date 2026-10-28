import { describe, test } from '@jest/globals';

/**
 * Phase 38f: the slow gate. Full-plan tests (a reduced or default plan per raid, minutes in all) run only with
 * `RUN_SLOW_TESTS=1`; the fast suite keeps one cheap plan per rule plus the unit cases. Exact gear is asserted in both,
 * times only within `withinPct` (headlines.json is the exact-time record).
 */
export const SLOW = !!process.env.RUN_SLOW_TESTS;
export const slowDescribe = SLOW ? describe : describe.skip;
export const slowTest = SLOW ? test : test.skip;

/** Rows for a `test.each` over raids: the fast suite keeps the listed raids, the slow suite all. */
export const rowsFor = <T extends { id: string }>(rows: T[], fastIds: string[]): T[] => rows.filter((r) => SLOW || fastIds.includes(r.id));

/** `|actual - expected| <= pct% of expected` (the time tolerance: 2 per encounter, 1 per raid). */
export const withinPct = (actual: number, expected: number, pct: number): boolean => Math.abs(actual - expected) <= (Math.abs(expected) * pct) / 100;
