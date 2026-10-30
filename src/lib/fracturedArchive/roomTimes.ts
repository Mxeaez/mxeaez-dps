/**
 * Phase 38j (ROADMAP 38j, absorbs 41): the Fractured Archive's measured room times, for the spec budget's clock.
 *
 * Source: the user's in-game raid statistics (docs/calibration/fa-times-2026-10-25.md, read 2026-10-25): per boss and
 * party size the user's personal best and the global best (m:ss → seconds below). The planner's seconds stay "your DPS
 * alone" (Σ HP ÷ DPS, the score kits are compared by); only the spec energy uses these: each encounter lasts its room
 * time on the clock (spec regen +10% per 30 s, Death Charge cooldowns), the rooms follow each other with the travel time
 * (`FA_TRAVEL_MINUTES`) spread evenly before them, and the surge doses sit on that clock. Unverified (UNVERIFIED D36):
 * personal bests are faster than a typical raid (less regen than a typical raid: conservative), and four of the eight
 * encounters have no personal time.
 *
 * Data only (imported by src/lib/raids/base.ts: no import of the time model).
 */

/** Seconds per party size. */
type BySize = Partial<Record<number, number>>;

/** The user's personal best per FA encounter (time model ids) and party size; none for Ezekiel, Moia, the Dagon'hai. */
export const FA_PERSONAL_ROOM_SECONDS: Record<string, BySize> = {
  'archive-guardian': {
    2: 129, 3: 130, 4: 128, 5: 115, 6: 140,
  },
  'bork-smorks': {
    2: 307, 3: 171, 4: 146, 5: 124, 6: 154,
  },
  dreadnoth: {
    2: 302, 3: 155, 4: 145, 5: 119, 6: 127,
  },
  xarth: {
    2: 250, 3: 176, 4: 117, 5: 118, 6: 141,
  },
  ocellus: {
    3: 635, 4: 630, 5: 575, 6: 700,
  },
};

/** The global best per FA encounter and party size (1-7). */
export const FA_GLOBAL_ROOM_SECONDS: Record<string, BySize> = {
  'archive-guardian': {
    1: 178, 2: 68, 3: 80, 4: 68, 5: 67, 6: 67, 7: 66,
  },
  'bork-smorks': {
    1: 259, 2: 91, 3: 91, 4: 87, 5: 85, 6: 88, 7: 90,
  },
  dreadnoth: {
    1: 199, 2: 108, 3: 97, 4: 92, 5: 85, 6: 89, 7: 89,
  },
  xarth: {
    1: 252, 2: 104, 3: 92, 4: 83, 5: 86, 6: 82, 7: 83,
  },
  dagonhai: {
    1: 305, 2: 118, 3: 114, 4: 100, 5: 103, 6: 112, 7: 107,
  },
  ezekiel: {
    1: 205, 2: 107, 3: 104, 4: 109, 5: 104, 6: 106, 7: 107,
  },
  moia: {
    1: 284, 2: 82, 3: 87, 4: 83, 5: 91, 6: 89, 7: 89,
  },
  ocellus: {
    1: 861, 2: 391, 3: 388, 4: 374, 5: 373, 6: 382, 7: 384,
  },
};

/**
 * The travel / puzzle time outside the rooms in minutes (the Plan tab's "Travel time" default for the FA): the user's
 * overall personal best minus the five room personal bests of the user's route (AG, Bork, Dreadnoth, Xarth, Ocellus),
 * averaged over 3-6 players: (1490 − 1267) = 223, (1538 − 1166) = 372, (1321 − 1051) = 270, (1472 − 1262) = 210 s;
 * mean 268.75 s ≈ 4.5 min.
 */
export const FA_TRAVEL_MINUTES = 4.5;

const ratios = (party?: number): number[] => Object.keys(FA_PERSONAL_ROOM_SECONDS).flatMap((enc) => {
  const mine = FA_PERSONAL_ROOM_SECONDS[enc];
  const global = FA_GLOBAL_ROOM_SECONDS[enc] ?? {};
  return Object.keys(mine).map(Number)
    .filter((p) => (party === undefined || p === party) && (global[p] ?? 0) > 0)
    .map((p) => mine[p]! / global[p]!);
});

const mean = (xs: number[]): number => xs.reduce((t, x) => t + x, 0) / xs.length;

/**
 * The user's pace vs the global best at a party size: the mean of personal ÷ global over the encounters with both at that
 * size; at a size without personal times (1, 7, 8) the mean over every encounter and size.
 */
export const userPaceRatio = (party: number): number => {
  const at = ratios(party);
  return mean(at.length ? at : ratios());
};

/**
 * Room seconds of an FA encounter for a party size (8 = 7: no data above 7): the user's personal best; else the global
 * best × `userPaceRatio`; undefined when neither exists (the clock then uses the model's fight time).
 */
export const faRoomSeconds = (encounter: string, partySize: number): number | undefined => {
  const p = Math.min(7, Math.max(1, Math.round(partySize)));
  const mine = FA_PERSONAL_ROOM_SECONDS[encounter]?.[p];
  if (mine !== undefined) return mine;
  const global = FA_GLOBAL_ROOM_SECONDS[encounter]?.[p];
  return global !== undefined ? global * userPaceRatio(p) : undefined;
};

/** Every FA encounter's room seconds for a party size (the encounters without data left out). */
export const faRoomSecondsFor = (partySize: number): Record<string, number> => Object.fromEntries(
  Object.keys(FA_GLOBAL_ROOM_SECONDS)
    .map((e) => [e, faRoomSeconds(e, partySize)] as const)
    .filter((x): x is readonly [string, number] => x[1] !== undefined),
);
