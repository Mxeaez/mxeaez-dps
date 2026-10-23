import React from 'react';
import { FRACTURED_ARCHIVE_BOSS_IDS, OCELLUS_P2_IDS } from '@/lib/fracturedArchive/constants';
import { FRACTURED_ARCHIVE_HP_SCALING_VERIFIED } from '@/lib/scaling/FracturedArchive';

const HINT_CLASS = 'align-super underline decoration-dotted cursor-help text-xs text-gray-300';

/**
 * Small "unverified" marker next to the party size input for Fractured Archive bosses,
 * shown while the party-size hitpoints scaling is not known (see docs/DATA_SOURCES.md).
 * For Ocellus phase 2 (The Blade) it also explains why the time-to-kill is not meaningful.
 */
const FracturedArchiveScalingHint: React.FC<{ monsterId: number }> = ({ monsterId }) => {
  if (!FRACTURED_ARCHIVE_BOSS_IDS.includes(monsterId)) {
    return null;
  }

  return (
    <>
      {!FRACTURED_ARCHIVE_HP_SCALING_VERIFIED && (
        <>
          {' '}
          <span
            className={HINT_CLASS}
            data-tooltip-id="tooltip"
            data-tooltip-content="Unverified: the Fractured Archive's party-size HP scaling is not published, so wiki HP is used for every size (2-8; solo counts as 2)."
          >
            unverified
          </span>
        </>
      )}
      {OCELLUS_P2_IDS.includes(monsterId) && (
        <>
          {' '}
          <span
            className={HINT_CLASS}
            data-tooltip-id="tooltip"
            data-tooltip-content="The Blade has no HP of its own: phase 2 ends on a timer, and half of the damage dealt to it carries over to phase 3 (5250 HP). DPS here is damage dealt to the Blade (effective phase 3 damage = DPS / 2); time-to-kill and HP-based effects are not meaningful."
          >
            TTK n/a
          </span>
        </>
      )}
    </>
  );
};

export default FracturedArchiveScalingHint;
