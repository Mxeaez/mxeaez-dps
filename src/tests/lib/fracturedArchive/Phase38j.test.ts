import { describe, expect, test } from '@jest/globals';
import { generateEmptyPlayer } from '@/state';
import {
  FA_GLOBAL_ROOM_SECONDS, FA_PERSONAL_ROOM_SECONDS, FA_TRAVEL_MINUTES, faRoomSeconds, faRoomSecondsFor, userPaceRatio,
} from '@/lib/fracturedArchive/roomTimes';
import {
  clockWall, createKitEvaluator, encounterTime, EncounterTime, presetKitLoadout, raidClock, raidTimeAssumptionsFrom,
  routeClock, routeSurgeDoses,
} from '@/lib/fracturedArchive/raidTime';
import { rowWallsOn } from '@/lib/fracturedArchive/encounterBudget';
import { BestSetupAssumptions } from '@/lib/fracturedArchive/presets';
import {
  assumptionsFor, bossTimeDiff, bossTimeVs, CLOSE_CALL_MARGIN, CloseCallInput, closeCalls, closeCallTag, planCloseCalls,
} from '@/lib/fracturedArchive/closeCalls';
import { raidConfig } from '@/lib/raids';
import { retimeHeadline } from '@/tests/utils/probes';
import { phase37Fixture } from '@/tests/utils/phase37';

// Phase 38j (ROADMAP 38j, absorbs 41): the FA Plan tab compares kits, it doesn't time raids. (1) The score is unchanged
// (Σ HP ÷ DPS, "boss time"); the Plan shows differences ("3.1% more boss time than this kit") and calls the total a
// rough estimate. (2) The spec energy runs on the user's measured room times (docs/calibration/fa-times-2026-10-25.md):
// each encounter lasts its room time on the spec budget's clock, the travel between rooms is spread evenly. (3) Close
// calls: a choice within 2% of its runner-up, tagged with the UNVERIFIED (A) rows it rests on. Docs: docs/BEST_SETUP.md
// *Plan tab you can trust (phase 38j, FA)*; UNVERIFIED D36.

const FA = raidConfig('fractured-archive');
const A = (patch: Partial<BestSetupAssumptions> = {}): BestSetupAssumptions => ({ ...FA.defaultAssumptions, ...patch });

describe('room times (roomTimes.ts, by hand from the user\'s raid stats)', () => {
  test('personal best where the user has one (Xarth 2:21 at 6 players = 141 s; Ocellus 9:35 at 5 = 575 s)', () => {
    expect(faRoomSeconds('xarth', 6)).toBe(141);
    expect(faRoomSeconds('ocellus', 5)).toBe(575);
    expect(faRoomSeconds('archive-guardian', 2)).toBe(129);
  });

  test('else the global best × the user\'s pace at that party size (mean personal ÷ global over the bosses with both)', () => {
    // 6 players: (140/67 + 154/88 + 127/89 + 141/82 + 700/382) ÷ 5 = 1.763698
    expect(userPaceRatio(6)).toBeCloseTo(1.763698, 6);
    // Moia (no personal time), 6 players: global 1:29 = 89 s × 1.763698 = 156.97 s
    expect(faRoomSeconds('moia', 6)).toBeCloseTo(156.969, 3);
    // 4 players: (128/68 + 146/87 + 145/92 + 117/83 + 630/374) ÷ 5 = 1.646146; the Dagon'hai 1:40 → 164.61 s
    expect(userPaceRatio(4)).toBeCloseTo(1.646146, 6);
    expect(faRoomSeconds('dagonhai', 4)).toBeCloseTo(164.615, 3);
  });

  test('solo, 7 and 8 players (no personal times): the pace over all 24 pairs, 1.819193; 8 uses the 7-player bests', () => {
    expect(userPaceRatio(1)).toBeCloseTo(1.819193, 6);
    expect(userPaceRatio(7)).toBeCloseTo(1.819193, 6);
    expect(faRoomSeconds('archive-guardian', 1)).toBeCloseTo(178 * 1.819193, 3); // 323.82
    expect(faRoomSeconds('bork-smorks', 1)).toBeCloseTo(471.171, 3);
    expect(faRoomSeconds('ocellus', 8)).toBeCloseTo(384 * 1.819193, 3); // 698.57
    // every encounter has a time at every size
    [1, 2, 3, 4, 5, 6, 7, 8].forEach((p) => expect(Object.keys(faRoomSecondsFor(p)).sort()).toEqual(Object.keys(FA_GLOBAL_ROOM_SECONDS).sort()));
    expect(Object.keys(FA_PERSONAL_ROOM_SECONDS)).toHaveLength(5);
  });

  test('travel default: overall best − the five room bests, averaged over 3-6 players = 268.75 s ≈ 4.5 min', () => {
    const route = ['archive-guardian', 'bork-smorks', 'dreadnoth', 'xarth', 'ocellus'];
    const overall: Record<number, number> = {
      3: 1490, 4: 1538, 5: 1321, 6: 1472,
    };
    const gaps = [3, 4, 5, 6].map((p) => overall[p] - route.reduce((t, e) => t + FA_PERSONAL_ROOM_SECONDS[e][p]!, 0));
    expect(gaps).toEqual([223, 372, 270, 210]);
    expect(gaps.reduce((t, x) => t + x, 0) / 4).toBe(268.75);
    expect(FA_TRAVEL_MINUTES).toBe(4.5);
    expect(FA.nonFightMinutes).toBe(4.5);
  });

  test('the FA time assumptions carry the room times; the clock walls are max(room, fight wall)', () => {
    const t = raidTimeAssumptionsFrom(A(), 'team', FA.defaultTimeSettings, FA.time);
    expect(t.roomSeconds!.xarth).toBe(141);
    expect(t.nonFightSeconds).toBe(270);
    expect(clockWall('xarth', 30, t)).toBe(141);
    expect(clockWall('xarth', 200, t)).toBe(200);
    expect(clockWall('nowhere', 30, t)).toBe(30);
  });
});

describe('the spec budget\'s clock on the room time (rowWallsOn, by hand)', () => {
  const party6 = { dpsMultiplier: 1, partySize: 6 };
  test('rows 600 s + 300 s at party 6 = walls 100 + 50; a 300 s room stretches them × 2', () => {
    const rows = [{ seconds: 600 }, { seconds: 300 }];
    expect(rowWallsOn(rows, party6)).toEqual([100, 50]);
    expect(rowWallsOn(rows, party6, 300)).toEqual([200, 100]);
    // a room no longer than the walls: unchanged
    expect(rowWallsOn(rows, party6, 120)).toEqual([100, 50]);
  });

  test('a fixed-length phase keeps its seconds; the others share the rest: (420 − 120) ÷ (150) = × 2', () => {
    const rows = [{ seconds: 600 }, { seconds: 120, fixedWall: true }, { seconds: 300 }];
    expect(rowWallsOn(rows, party6, 420)).toEqual([200, 120, 100]);
  });

  test('Xarth, Team party 6, ZCB: 141 s = 4 regen ticks: 100 + 40 + Death Charge − 75 (fight-wall clock: 1 tick)', () => {
    const a = A({ damageSpecs: ['zcb'] });
    const kit = createKitEvaluator(FA.presets.map((p) => presetKitLoadout(generateEmptyPlayer(), p, a)), a);
    const ta = raidTimeAssumptionsFrom(a, 'team', FA.defaultTimeSettings, FA.time);
    const spent = (e: EncounterTime) => Object.values(e.specPlan!.damage ?? {})
      .reduce((t, d) => t + 75 * (d?.zcb ?? 0), 0);
    const dc = (e: EncounterTime) => (e.specPlan!.deathCharge ? e.specPlan!.deathCharge.covered * e.specPlan!.deathCharge.perKill : 0);
    const room = encounterTime('xarth', kit, ta);
    // 15% per kill ÷ party 6 = 2.5
    expect(dc(room)).toBe(2.5);
    expect(spent(room)).toBe(75);
    expect(room.specPlan!.end.me[0]).toBeCloseTo(100 + 4 * 10 + 2.5 - 75, 9);
    // the phase 38c clock (no room time): Xarth's wall = seconds ÷ 6, one tick at 30 s
    const wall = encounterTime('xarth', kit, { ...ta, roomSeconds: undefined });
    const w = wall.seconds / 6;
    expect(Math.floor(w / 30)).toBe(1);
    expect(wall.specPlan!.end.me[0]).toBeCloseTo(100 + 10 + 2.5 - 75, 9);
    // the boss time is the same pass (Σ HP ÷ DPS): only the energy moved
    expect(room.seconds).toBeCloseTo(wall.seconds, 9);
  }, 60000);
});

describe('the raid clock with room times: rooms + travel spread evenly', () => {
  test('3 rooms 141 / 154 / 157 s, 270 s of travel: 90 s before each; starts 90, 321, 565', () => {
    expect(raidClock([141, 154, 157], 0, 270, true)).toEqual({ starts: [90, 321, 565], gaps: [90, 90, 90], fight: 452 });
    const a = { nonFightSeconds: 270, roomSeconds: { a: 141, b: 154, c: 157 } };
    // fight walls 30 / 40 / 200: the third is longer than its room, so it counts 200
    expect(routeClock(['a', 'b', 'c'], [30, 40, 200], a)).toEqual({ starts: [90, 321, 565], gaps: [90, 90, 90], fight: 495 });
  });

  test('surge doses ≥ 300 s apart on that clock: AG 90, Bork 320, Moia 564, Xarth 811 → AG + Xarth', () => {
    const ids = ['archive-guardian', 'bork-smorks', 'moia', 'xarth'];
    const roomSeconds = {
      'archive-guardian': 140, 'bork-smorks': 154, moia: 157, xarth: 141,
    };
    const a = {
      dpsMultiplier: 1, partySize: 6, nonFightSeconds: 360, roomSeconds,
    };
    // travel 360 ÷ 4 = 90 before each: starts 90, 320, 564, 811
    expect(routeClock(ids, [1, 1, 1, 1], a).starts).toEqual([90, 320, 564, 811]);
    const enc = (id: string, s: number): EncounterTime => ({
      id, label: id, phases: [], seconds: s,
    });
    // gains 3, 1, 1, 4; ≥ 300 s apart: AG + Moia = 4, Bork + Xarth = 5, AG + Xarth = 7 (Moia → Xarth is 247 s)
    const plain = ids.map((id) => enc(id, 60));
    const dosed = [57, 59, 59, 56].map((s, i) => enc(ids[i], s));
    expect(routeSurgeDoses(plain, dosed, a, 1)).toEqual(['archive-guardian', 'xarth']);
  });
});

describe('kits compared, not timed: the differences (closeCalls.ts)', () => {
  test('bossTimeDiff / bossTimeVs', () => {
    expect(bossTimeDiff(-31, 1000)).toBe('3.1% more boss time');
    expect(bossTimeDiff(12, 1000)).toBe('1.2% less boss time');
    expect(bossTimeDiff(0.2, 1000)).toBe('the same boss time');
    expect(bossTimeDiff(-Infinity, 1000)).toBe('can\'t kill every boss');
    expect(bossTimeVs(-31, 1000, 'this kit')).toBe('3.1% more boss time than this kit');
    expect(bossTimeVs(0, 1000, 'this kit')).toBe('the same boss time as this kit');
  });
});

describe('close calls (by hand)', () => {
  const input: CloseCallInput = {
    total: 1000,
    kit: [
      { label: 'Twisted bow (Masori)', equipment: { weapon: { name: 'Twisted bow' } } },
      { label: 'Inquisitor\'s + Obligator', equipment: { weapon: { name: 'Obligator' } } },
      { label: 'Tumeken\'s shadow (Ancestral)', equipment: { weapon: { name: 'Tumeken\'s shadow' } } },
    ],
    // the worn bow saves 40 s (4%); the Obligator 15 s (1.5%: close); the shadow 20 s (2.0%: close, the edge)
    kitMarginal: [{ slots: 0, seconds: 40 }, { slots: 1, seconds: 15 }, { slots: 1, seconds: 20 }],
    // a kit 19 s slower (1.9%: close), one 25 s slower (2.5%: not)
    alternatives: [
      { label: 'melee + ranged: Ascension crossbows / Obligator', deltaSeconds: -19, weapons: ['Ascension crossbow', 'Obligator'] },
      { label: 'magic: Tumeken\'s shadow', deltaSeconds: -25 },
    ],
    // Bellator 10 s slower in full (1%: close); Venator 30 s (3%: not); Magus screen only (not planned in full: ignored)
    ring: {
      ring: 'Ultor ring',
      screened: [
        { ring: 'Ultor ring', seconds: 1000, full: true }, { ring: 'Bellator ring', seconds: 1010, full: true },
        { ring: 'Venator ring', seconds: 1030, full: true }, { ring: 'Magus ring', seconds: 1001, full: false },
      ],
    },
    specs: {
      // the 3rd Tonalztics carrier saves 8 s (0.8%: close); the 2nd Elder maul 21 s (2.1%: not)
      team: { rows: [{ weapon: 'tonalztics', carriers: 3, lastSaved: 8 }, { weapon: 'elderMaul', carriers: 2, lastSaved: 21 }] },
      // your bar: 3350 vs 3300 HP = 50 ÷ 3350 = 1.49%: close
      notes: ['Your spec bar goes to Zaryte crossbow: 5 carriers (party − 1); the bars pay 3350 HP on the route vs 3300 HP if you carry a drain weapon instead.'],
      // ZCB 60 + 40 = 100 HP per bar over the route vs kisten 59 + 40 = 99: 1%: close
      bringRule: { first: 'zcb', bring: ['zcb'], gains: [{ gains: { zcb: 60, crimsonKisten: 59 } }, { gains: { zcb: 40, crimsonKisten: 40 } }] },
    },
    drainCloseCalls: [{ encounter: 'Xarth', npc: 'Xarth' }],
  };

  test('each kind within 2% of its runner-up, with its margin and the (A) rows', () => {
    const cs = closeCalls(input);
    expect(CLOSE_CALL_MARGIN).toBe(0.02);
    expect(cs.map((c) => [c.kind, Math.round(c.margin * 10000) / 10000, c.dependsOn.join(',')])).toEqual([
      ['kit', 0.019, 'A11,A1,A2,A5'],
      ['loadout', 0.015, 'A11,A1,A2'],
      ['loadout', 0.02, 'A11'],
      // review 38j: the energy choices also rest on D36 (the measured room times)
      ['ring', 0.01, 'A11,D36'],
      ['carrier', 0.008, 'A11,D36'],
      ['share', 0.0149, 'A11,D36'],
      ['damage-spec', 0.01, 'A11,D36'],
      ['drain', 0.1, 'A11'],
    ]);
    expect(cs.map((c) => c.text)).toEqual([
      'melee + ranged: Ascension crossbows / Obligator: 1.9% more boss time than this kit',
      'Inquisitor\'s + Obligator (switch): 1.5% less boss time than the kit without it',
      'Tumeken\'s shadow (Ancestral) (switch): 2.0% less boss time than the kit without it',
      'Bellator ring instead of Ultor ring: 1.0% more boss time',
      '3 Tonalztics carriers vs 2: the last saves 0.8% boss time',
      'your spec bar: 3350 HP with your damage specs vs 3300 HP if you carry a drain weapon (1.5% apart)',
      'Zaryte crossbow vs Crimson kisten: 1.0% apart in HP per bar over the route',
      'Xarth: the drain on Xarth vs the damage specs its energy would buy (within 10%; the drain is kept)',
    ]);
    expect(closeCallTag(cs[1])).toBe('close call (depends on A11, A1, A2)');
    expect(closeCallTag(cs[4])).toBe('close call (depends on A11, D36)');
  });

  test("review 38j: an alternative that is the plan's kit plus loadouts at the same time is no runner-up", () => {
    const superset = {
      label: "melee + ranged + magic: Twisted bow (Masori) / Inquisitor's + Obligator / Tumeken's shadow (Ancestral) / Kodai wand",
      deltaSeconds: 0,
    };
    expect(closeCalls({ ...input, alternatives: [superset] }).filter((c) => c.kind === 'kit')).toEqual([]);
    // slower by 1.0%: still a close call
    expect(closeCalls({ ...input, alternatives: [{ ...superset, deltaSeconds: -10 }] }).filter((c) => c.kind === 'kit')).toHaveLength(1);
  });

  test('nothing within 2%: no close calls', () => {
    expect(closeCalls({
      ...input,
      kitMarginal: [{ slots: 0, seconds: 40 }, { slots: 1, seconds: 30 }, { slots: 1, seconds: Infinity }],
      alternatives: [{ label: 'x', deltaSeconds: -25 }],
      ring: { ring: 'Ultor ring', screened: [{ ring: 'Ultor ring', seconds: 1000, full: true }, { ring: 'Venator ring', seconds: 1030, full: true }] },
      specs: { notes: [] },
      drainCloseCalls: [],
    })).toEqual([]);
  });

  test('assumptionsFor: A11 always, then the rows of the weapons named', () => {
    expect(assumptionsFor(['Twisted bow'])).toEqual(['A11']);
    expect(assumptionsFor(['Emberlight', 'Zorya\'s tome', 'Obligator'])).toEqual(['A11', 'A1', 'A2', 'A8', 'A9']);
  });

  test('the fa headline: the worn Ascension crossbows (0.6%) and both carriers (review 38j: no superset kit)', () => {
    const fx = phase37Fixture('fa');
    const r = retimeHeadline('fa');
    const planned = r.comparison.routes.findIndex((x) => x.route.id === r.route);
    const cs = planCloseCalls({ ...fx, comparison: r.comparison, planned });
    expect(cs.map((c) => c.kind)).toEqual(['loadout', 'carrier', 'carrier']);
    expect(cs[0].text).toBe('Ascension crossbows + diamond (e) (Masori) (worn): 0.6% less boss time than the kit without it');
    expect(cs[0].dependsOn).toEqual(['A11', 'A5']);
    expect(cs[1].dependsOn).toEqual(['A11', 'D36']);
  }, 120000);
});
