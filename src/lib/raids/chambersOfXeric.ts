import type { SupplyCounts } from '@/lib/fracturedArchive/planner';
import {
  COX_ENCOUNTER_TARGET, COX_ROOMS, COX_TIME_DEFAULTS, COX_TIME_MODEL,
} from '@/lib/raids/cox/time';
import { CHAMBERS_OF_XERIC_BASE } from '@/lib/raids/base';
import type { RaidConfig } from '@/lib/raids/index';
import type { TimeSettingField } from '@/lib/raids/types';

/**
 * Phase 19: Chambers of Xeric supplies. Overloads, brews (Xeric's aid) and restores (Revitalisation / Prayer enhance)
 * are made in the raid; they still take slots, entered as "Other" (default 8). The boost is always Overload (+)
 * (`boostsNeedSupplies: false`), so the potion supply types default to 0.
 */
export const COX_DEFAULT_SUPPLIES: SupplyCounts = {
  brew: 0, restore: 0, ranging: 0, superCombat: 0, magic: 0, food: 0, other: 8,
};

const ROOM_FIELDS: TimeSettingField[] = COX_ROOMS.map((r) => ({
  key: `room_${r.id}`,
  label: r.label,
  kind: 'bool',
  title: `${r.label} is in this raid's layout (layouts are random: untick the rooms you don't get)`,
}));

/**
 * Phase 19: Chambers of Xeric. Monsters, hp / offence / Defence scaling (party size, Challenge Mode), immunities and
 * the CoX damage rules (Tekton ranged-immune and magic ÷5, Olm's hand / head mitigation, Guardians pickaxe-only, Ice
 * demon ÷3 unless fire / demonbane, Glowing crystal) are upstream's; this config adds the targets, presets, pool, the
 * Olm melee mitigation upstream misses (src/lib/raids/cox/damage.ts), Vanguards' drain reset (`noDrains`) and the
 * encounter model (src/lib/raids/cox/time.ts). CoX has no Defence floors (upstream's `getDefenceFloor` has none).
 */
export const CHAMBERS_OF_XERIC_RAID: RaidConfig = {
  ...CHAMBERS_OF_XERIC_BASE,
  name: 'Chambers of Xeric',
  shortName: 'Chambers of Xeric',
  raidOnlyAssumptions: false,
  presetsNote: 'Presets: the Fractured Archive list + src/lib/raids/cox/presets.ts (Dragon hunter lance / crossbow, Dragon pickaxe).',
  time: COX_TIME_MODEL,
  defaultTimeSettings: COX_TIME_DEFAULTS,
  timeModelNote: 'Time = Σ damage ÷ (team-DPS multiplier × your DPS) per phase, with the kit\'s best loadout + style per '
    + 'phase (switching is free); DPS time only (no puzzles, prep, travel, invulnerable phases or healing unless set). HP: '
    + 'upstream\'s CoX scaling (party size, Challenge Mode; verified in-game). Rooms: tick the ones in your layout (default: '
    + 'all, an upper bound); the Great Olm is always fought: 3 hand phases (+1 per 8 players) of both claws, then the head. '
    + 'Vasa: crystals then Vasa; Vanguards: all three, no drains; Vespula: to 20% then the portal; Mystics / shamans: '
    + 'count by party size; Guardians: ×2, pickaxe only.',
  timeSettingFields: [
    ...ROOM_FIELDS,
    {
      key: 'tektonEnragedFraction', label: 'Tekton enraged', kind: 'percent', title: 'Share of Tekton\'s hp dealt while he is enraged after the anvil (higher melee defence bonuses; unpublished)',
    },
    {
      key: 'tektonAnvilHeal', label: 'Tekton anvil heal', kind: 'percent', title: 'Tekton\'s anvil repairs as a share of his hp, added to the damage needed (Strategies: 1.33% every few ticks, up to five sets of sparks; 0 = not counted)',
    },
    {
      key: 'vasaCrystals', label: 'Vasa crystals', kind: 'number', unit: '', title: 'Glowing crystals destroyed during Vasa (stab only; each heals him if left)', max: 10,
    },
    {
      key: 'vespulaMethod',
      label: 'Vespula',
      kind: 'select',
      title: 'Normal method: take Vespula to 20% so she lands, then destroy the portal. Redemption method: only the portal',
      options: [{ value: 'ground', label: 'to 20%, then portal' }, { value: 'portal', label: 'portal only' }],
    },
    {
      key: 'muttadileHeal', label: 'Muttadile heals', kind: 'percent', title: 'Meat-tree eats as a share of each muttadile\'s hp, added to the damage needed (0 = tree chopped / ZGS freeze)',
    },
  ],
  routesLabel: 'Encounters',
  encounterTarget: COX_ENCOUNTER_TARGET,
  hpNote: 'HP and Defence scaled by party size and Challenge Mode (upstream, verified in-game).',
  defaultSupplies: COX_DEFAULT_SUPPLIES,
  planNote: 'CoX: overloads, brews and restores are made in the raid — enter their slots under "Other"; every style keeps the Overload (+) boost. Bring a pickaxe if the layout has Guardians.',
};
