import { Monster } from '@/types/Monster';
import { BORK_FLAT_ARMOUR_BY_PHASE, BORK_IDS, BORK_STUNNED_PHASE } from '@/lib/fracturedArchive/constants';

// Bork's damage reduction. Sources (2026-10-22): https://oldschool.runescape.wiki/w/Bork (infobox "flatarmour = 8-14
// (Base), 0 (Stunned), 2 (Magic resistance)"), https://oldschool.runescape.wiki/w/The_Fractured_Archive/Strategies
// (Bork and the Smorks), https://oldschool.runescape.wiki/w/Magic_resistance. Model notes: docs/DATA_SOURCES.md.

/**
 * "2 Magic resistance, meaning that ... magic attacks [are reduced] by 2". Upstream's flat armour never applies to
 * magic, so this is applied separately in PlayerVsNPCCalc. Removed while stunned ("removing his damage reduction";
 * the wiki doesn't say explicitly that this includes magic resistance, unverified).
 */
const BORK_MAGIC_RESISTANCE = 2;

const isBorkStunned = (m: Monster): boolean => BORK_IDS.includes(m.id) && m.inputs.phase === BORK_STUNNED_PHASE;

/** Sets Bork's flat armour (melee and ranged) from the selected phase; no phase selected = the default 8. */
export const applyBorkFlatArmour = (m: Monster): Monster => {
  if (!BORK_IDS.includes(m.id)) {
    return m;
  }

  const flatArmour = BORK_FLAT_ARMOUR_BY_PHASE.find(([phase]) => phase === m.inputs.phase)?.[1]
    ?? BORK_FLAT_ARMOUR_BY_PHASE[0][1];
  return {
    ...m,
    defensive: {
      ...m.defensive,
      flat_armour: flatArmour,
    },
  };
};

/** Flat reduction of successful magic hits (upstream's flat armour ignores magic). */
export const getMagicResistance = (m: Monster): number => {
  if (BORK_IDS.includes(m.id) && !isBorkStunned(m)) {
    return BORK_MAGIC_RESISTANCE;
  }
  return 0;
};

/** Melee attacks skip the accuracy roll ("all melee attacks on him are dealt as successful hits"). */
export const hasGuaranteedMeleeAccuracy = (m: Monster): boolean => isBorkStunned(m);
