import { Monster } from '@/types/Monster';
import {
  ARCHIVE_GUARDIAN_IDS,
  BORK_IDS,
  DAGONHAI_IDS,
  DREADNOTH_IDS,
  DREADNOTH_JELLY_IDS,
  EZEKIEL_IDS,
  FRACTURED_ARCHIVE_BOSS_IDS,
  MOIA_IDS,
  OCELLUS_P1_IDS,
  OCELLUS_P2_IDS,
  OCELLUS_P3_IDS,
  THE_SMORKS_IDS,
  XARTH_IDS,
} from '@/lib/fracturedArchive/constants';
import { Factor } from '@/lib/Math';
import { applyBorkFlatArmour } from '@/lib/fracturedArchive/bork';
import { applyDagonhaiPhase } from '@/lib/fracturedArchive/dagonhai';

export const FRACTURED_ARCHIVE_MIN_PARTY_SIZE = 2;
export const FRACTURED_ARCHIVE_MAX_PARTY_SIZE = 8;

/**
 * Lowest defence level reachable by drains (21 Oct 2026 hotfix: drains capped at 60% of base defence on some bosses).
 * Values from the "Maximum defence reduction" table on
 * https://oldschool.runescape.wiki/w/The_Fractured_Archive/Strategies and the boss pages (2026-10-22);
 * they equal Gearscape's defence_floor for every boss. 0 means fully drainable.
 */
const DEFENCE_FLOORS: [ids: number[], floor: number][] = [
  [ARCHIVE_GUARDIAN_IDS, 156], // 260 * 0.6
  [BORK_IDS, 180], // 300 * 0.6
  [XARTH_IDS, 102], // 170 * 0.6
  [OCELLUS_P1_IDS, 129], // 215 * 0.6
  [OCELLUS_P3_IDS, 150], // 250 * 0.6
  [EZEKIEL_IDS, 78], // 130 * 0.6
  [MOIA_IDS, 117], // 195 * 0.6
  // "no cap on their Defence Reduction ... The Blade (Ocellus P2)" (news post, see docs/DATA_SOURCES.md); the Ocellus
  // page's "150 in phases 2 and 3" is wrong for P2
  [OCELLUS_P2_IDS, 0],
  [THE_SMORKS_IDS, 0],
  [DREADNOTH_IDS, 0],
  [DREADNOTH_JELLY_IDS, 0], // unverified: not in the table, assumed uncapped
  [DAGONHAI_IDS, 0], // "-" in the table
];

export const getFracturedArchiveDefenceFloor = (m: Monster): number | undefined => DEFENCE_FLOORS
  .find(([ids]) => ids.includes(m.id))?.[1];

/**
 * Hitpoints multiplier by party size. **Unverified**: the wiki only says "All bosses' hitpoints scale to the amount
 * of players present in the raid, with the minimum scaling being set to two players if the player enters alone"
 * (https://oldschool.runescape.wiki/w/The_Fractured_Archive). No formula, per-size table or statement of which party
 * size the infobox hitpoints represent has been published (wiki, Gearscape and community checked 2026-10-22, see
 * docs/DATA_SOURCES.md), so every size uses the infobox value until real numbers exist. Replace the factors here
 * when they do; the infobox hitpoints must stay the value at the size they were recorded for.
 */
export const FRACTURED_ARCHIVE_HP_SCALING: { [partySize: number]: Factor } = {
  2: [1, 1],
  3: [1, 1],
  4: [1, 1],
  5: [1, 1],
  6: [1, 1],
  7: [1, 1],
  8: [1, 1],
};

export const FRACTURED_ARCHIVE_HP_SCALING_VERIFIED = false;

export const getFracturedArchivePartySize = (m: Monster): number => Math.min(
  FRACTURED_ARCHIVE_MAX_PARTY_SIZE,
  Math.max(FRACTURED_ARCHIVE_MIN_PARTY_SIZE, Math.trunc(m.inputs.partySize || 0)),
);

const applyPartySizeScaling = (m: Monster): Monster => {
  if (!FRACTURED_ARCHIVE_BOSS_IDS.includes(m.id)) {
    return m;
  }

  const [num, den] = FRACTURED_ARCHIVE_HP_SCALING[getFracturedArchivePartySize(m)];
  return {
    ...m,
    skills: {
      ...m.skills,
      hp: Math.trunc(m.skills.hp * num / den),
    },
  };
};

// Dagon'hai last: the unshielded remainder has a fixed 7 hp, not a party-scaled value
const applyFracturedArchiveScaling = (m: Monster): Monster => applyDagonhaiPhase(
  applyBorkFlatArmour(applyPartySizeScaling(m)),
);

export default applyFracturedArchiveScaling;
