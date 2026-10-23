import React from 'react';
import { FRACTURED_ARCHIVE_BOSS_IDS } from '@/lib/fracturedArchive/constants';
import { FRACTURED_ARCHIVE_HP_SCALING_VERIFIED } from '@/lib/scaling/FracturedArchive';

/**
 * Small "unverified" marker next to the party size input for Fractured Archive bosses,
 * shown while the party-size hitpoints scaling is not known (see docs/DATA_SOURCES.md).
 */
const FracturedArchiveScalingHint: React.FC<{ monsterId: number }> = ({ monsterId }) => {
  if (FRACTURED_ARCHIVE_HP_SCALING_VERIFIED || !FRACTURED_ARCHIVE_BOSS_IDS.includes(monsterId)) {
    return null;
  }

  return (
    <>
      {' '}
      <span
        className="align-super underline decoration-dotted cursor-help text-xs text-gray-300"
        data-tooltip-id="tooltip"
        data-tooltip-content="Unverified: the Fractured Archive's party-size HP scaling is not published, so wiki HP is used for every size (2-8; solo counts as 2)."
      >
        unverified
      </span>
    </>
  );
};

export default FracturedArchiveScalingHint;
