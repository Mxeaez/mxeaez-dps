import { StyleGroup } from '@/lib/fracturedArchive/presets';
import {
  CandidateItem, SEARCH_POOL, StylePool, WeaponCandidate,
} from '@/lib/fracturedArchive/searchCandidates';

/**
 * Phase 19: Chambers of Xeric search pool = the Fractured Archive pool (searchCandidates.ts; Twisted bow, Scythe,
 * blowpipe, Zaryte crossbow, Shadow, Harmonised staff / Kodai with Fire Surge and the demonbane weapons are already in
 * it) plus:
 * - Dragon hunter lance / crossbow / wand: the Great Olm is a dragon (upstream applies the dragonbane bonuses).
 * - Dragon pickaxe, Crystal pickaxe: the only weapons that damage the Guardians (crystal = dragon, upstream).
 * - Salve amulet(ei) in every style's neck slot (kept, never pruned): the Skeletal Mystics are undead (Strategies: "A
 *   Salve amulet(ei) will help when using ranged or magic").
 */
const SURGES = ['Fire Surge', 'Water Surge', 'Earth Surge', 'Wind Surge'];

const EXTRA_WEAPONS: Partial<Record<StyleGroup, WeaponCandidate[]>> = {
  melee: [
    { weapon: 'Dragon hunter lance', note: 'dragonbane (Great Olm)' },
    { weapon: 'Dragon pickaxe', note: 'Guardians (pickaxes only)' },
    { weapon: ['Crystal pickaxe', 'Active'], note: 'Guardians (= dragon pickaxe)' },
  ],
  ranged: [
    { weapon: 'Dragon hunter crossbow', ammo: ['Ruby dragon bolts (e)', 'Diamond dragon bolts (e)'], note: 'dragonbane (Great Olm)' },
  ],
  magic: [
    { weapon: 'Dragon hunter wand', spells: SURGES, note: 'dragonbane (Great Olm)' },
  ],
};

const SALVE: CandidateItem = { ref: 'Salve amulet(ei)', keep: true, note: 'undead (Skeletal Mystics)' };

// eslint-disable-next-line import/prefer-default-export
export const COX_SEARCH_POOL: Record<StyleGroup, StylePool> = Object.fromEntries(
  (Object.keys(SEARCH_POOL) as StyleGroup[]).map((g) => [g, {
    ...SEARCH_POOL[g],
    weapons: [...SEARCH_POOL[g].weapons, ...(EXTRA_WEAPONS[g] || [])],
    slots: { ...SEARCH_POOL[g].slots, neck: [...(SEARCH_POOL[g].slots.neck || []), SALVE] },
  }]),
) as Record<StyleGroup, StylePool>;
