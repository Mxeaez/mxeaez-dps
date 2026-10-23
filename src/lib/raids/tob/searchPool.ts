import { StyleGroup } from '@/lib/fracturedArchive/presets';
import {
  CandidateItem, SEARCH_POOL, StylePool, WeaponCandidate,
} from '@/lib/fracturedArchive/searchCandidates';

/**
 * Phase 20: Theatre of Blood search pool = the Fractured Archive pool (searchCandidates.ts: Scythe of Vitur, Soulreaper
 * axe, Osmumten's fang, Noxious halberd, Dual macuahuitl, Twisted bow, Toxic blowpipe, Tumeken's shadow, Sanguinesti
 * staff are already in it) plus the Strategies page's other recommended weapons and items:
 * - Blade of Saeldor (c), Abyssal tentacle: "Blade of Saeldor > Abyssal tentacle" (Maiden, Bloat, Sotetseg, Xarpus,
 *   Verzik P1 / P3 lists).
 * - Eye of Ayak: "Sanguinesti staff / Eye of Ayak" on the Vasilias's magic form; "Mages should use an Eye of Ayak" in
 *   the waves.
 * - Dawnbringer: Verzik P1 (exempt from the damage cap; deals nothing elsewhere: src/lib/raids/tob/damage.ts).
 * - Salve amulet(ei) in every style's neck slot (kept, never pruned): Pestilent Bloat is undead.
 */
const EXTRA_WEAPONS: Partial<Record<StyleGroup, WeaponCandidate[]>> = {
  melee: [
    { weapon: 'Blade of Saeldor (c)' },
    { weapon: 'Abyssal tentacle' },
  ],
  magic: [
    { weapon: ['Eye of Ayak', 'Charged'] },
    { weapon: 'Dawnbringer', note: 'Verzik P1 only: no damage cap, always hits' },
  ],
};

const SALVE: CandidateItem = { ref: 'Salve amulet(ei)', keep: true, note: 'undead (Pestilent Bloat)' };

// eslint-disable-next-line import/prefer-default-export
export const TOB_SEARCH_POOL: Record<StyleGroup, StylePool> = Object.fromEntries(
  (Object.keys(SEARCH_POOL) as StyleGroup[]).map((g) => [g, {
    ...SEARCH_POOL[g],
    weapons: [...SEARCH_POOL[g].weapons, ...(EXTRA_WEAPONS[g] || [])],
    slots: { ...SEARCH_POOL[g].slots, neck: [...(SEARCH_POOL[g].slots.neck || []), SALVE] },
  }]),
) as Record<StyleGroup, StylePool>;
