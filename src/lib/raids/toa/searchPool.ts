import { StyleGroup } from '@/lib/fracturedArchive/presets';
import { SEARCH_POOL, StylePool, WeaponCandidate } from '@/lib/fracturedArchive/searchCandidates';

/**
 * Phase 18: Tombs of Amascut search pool = the Fractured Archive pool (searchCandidates.ts; Osmumten's fang and
 * Tumeken's shadow are already in it) plus ToA-relevant weapons. Upstream models their ToA effects:
 * - Keris partisan of breaching: +33% accuracy and the keris damage bonus against kalphites (Kephri, the scarabs).
 * - Keris partisan of amascut: the keris bonus against kalphites; upstream also gives it a ToA-only bonus.
 * - Blade of Saeldor (c): the Strategies' core weapon (fast slash, melee always max hits on the core).
 * - Eye of Ayak: the Strategies' second magic choice on Akkha and the Wardens.
 */
const EXTRA_WEAPONS: Partial<Record<StyleGroup, WeaponCandidate[]>> = {
  melee: [
    { weapon: 'Keris partisan of breaching', note: 'kalphites: +33% accuracy (Kephri)' },
    { weapon: 'Keris partisan of amascut', note: 'kalphites; ToA bonus (upstream)' },
    { weapon: 'Blade of Saeldor (c)', note: 'Warden core (always max hit with melee)' },
  ],
  magic: [
    { weapon: ['Eye of Ayak', 'Charged'] },
  ],
};

// eslint-disable-next-line import/prefer-default-export
export const TOA_SEARCH_POOL: Record<StyleGroup, StylePool> = Object.fromEntries(
  (Object.keys(SEARCH_POOL) as StyleGroup[]).map((g) => [g, {
    ...SEARCH_POOL[g],
    weapons: [...SEARCH_POOL[g].weapons, ...(EXTRA_WEAPONS[g] || [])],
  }]),
) as Record<StyleGroup, StylePool>;
