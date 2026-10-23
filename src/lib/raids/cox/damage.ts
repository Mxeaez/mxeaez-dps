import { Monster } from '@/types/Monster';
import { OLM_HEAD_IDS, OLM_MAGE_HAND_IDS } from '@/lib/constants';

/**
 * Phase 19: Great Olm damage mitigation that upstream doesn't apply. Wiki (https://oldschool.runescape.wiki/w/Great_Olm,
 * "Damage Mitigation", read 2026-10-23): "The head has 66% damage mitigation from all non-range attacks ... Olm's right
 * hand (also called mage hand) has 66% damage mitigation from all non-mage attacks. Olm's left hand (also called melee
 * hand) has 66% damage mitigation from non-melee attacks." Upstream divides by 3 for magic on the head / left claw and
 * ranged on both claws (PlayerVsNPCCalc, `divisionTransformer(3)`), but not melee on the head or the right claw; this
 * adds those two, with the same ÷3. Hooked into `PlayerVsNPCCalc.applyNpcTransforms` (one line, next to Ocellus's).
 */
// eslint-disable-next-line import/prefer-default-export
export const getCoxMeleeDamageDivisor = (m: Monster, isMelee: boolean): number => (isMelee
  && (OLM_HEAD_IDS.includes(m.id) || OLM_MAGE_HAND_IDS.includes(m.id)) ? 3 : 1);
