import { Monster } from '@/types/Monster';
import { DAGONHAI_IDS, DAGONHAI_UNSHIELDED_PHASE } from '@/lib/fracturedArchive/constants';

// The Dagon'hai trio (Elder + two Monks). Sources (2026-10-23): https://oldschool.runescape.wiki/w/Dagon%27hai_Elder,
// https://oldschool.runescape.wiki/w/Dagon%27hai_Monk and
// https://oldschool.runescape.wiki/w/The_Fractured_Archive/Strategies#Dagon'hai_trio. Model notes: docs/DATA_SOURCES.md.
//
// "The elder and monks share the same stats and health pool, so there is no advantage in focusing one of them down."
// "Once the health bar of the three enemies are fully depleted, the Dagon'hai will ... restore their shield gauge to
// full" ... "After depleting the mages' shield gauge the fifth time, the ritual will finally become unstable and the
// cauldron will explode, killing one of the monks instantly, while the elder and the remaining monk will be stunned.
// The elder will quickly recover, however the remaining enemies only have 7 hitpoints and are easily killed."
//
// The wiki describes no defensive change between the shielded and unshielded states (the infobox lists one set of
// stats for both ids, 16643 / 16644 etc.), so the shield is a damage gauge, not a damage reduction: the phase input
// only changes the hitpoints (TTK). Reading the 640 infobox hitpoints as one shared gauge that is depleted five times
// is **unverified** (docs/UNVERIFIED.md).

/** Times the shared shield gauge (infobox hitpoints) is depleted before the cauldron explodes. */
export const DAGONHAI_SHIELD_GAUGE_DEPLETIONS = 5;

/** Hitpoints of the remaining Dagon'hai after the cauldron explodes. */
export const DAGONHAI_UNSHIELDED_HP = 7;

/**
 * Damage needed for the whole encounter: the shared gauge (party-scaled infobox hitpoints) five times, then the
 * 7-hp remainder (one target; the other survivor dies to the same few hits and is ignored).
 */
export const dagonhaiEncounterDamage = (gaugeHp: number): number => DAGONHAI_SHIELD_GAUGE_DEPLETIONS * gaugeHp
  + DAGONHAI_UNSHIELDED_HP;

/** Sets the hitpoints of the "Unshielded" phase; the shielded default keeps the (party-scaled) gauge. */
export const applyDagonhaiPhase = (m: Monster): Monster => {
  if (!DAGONHAI_IDS.includes(m.id) || m.inputs.phase !== DAGONHAI_UNSHIELDED_PHASE) {
    return m;
  }
  return {
    ...m,
    skills: {
      ...m.skills,
      hp: DAGONHAI_UNSHIELDED_HP,
    },
  };
};
