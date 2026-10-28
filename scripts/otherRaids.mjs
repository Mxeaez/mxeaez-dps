/**
 * Phase 38f-2: round 6 is Fractured Archive only. The ToA / CoX / ToB steps of the verify scripts (and the scripts that
 * are only about them) run with `RUN_OTHER_RAIDS=1`, against a dev server started with `NEXT_PUBLIC_SHOW_OTHER_RAIDS=1`
 * (the tabs are hidden otherwise: src/lib/raids/index.ts `SHOW_OTHER_RAIDS`). Round 7 turns both back on.
 */
export const OTHER_RAIDS = !!process.env.RUN_OTHER_RAIDS;
/** The raid ids with a tab in this run. */
export const raidIds = (ids) => ids.filter((id) => OTHER_RAIDS || id === 'fractured-archive');
