import type { SupplyCounts } from '@/lib/fracturedArchive/planner';
import { TOB_ENCOUNTER_TARGET, TOB_TIME_DEFAULTS, TOB_TIME_MODEL } from '@/lib/raids/tob/time';
import { THEATRE_OF_BLOOD_BASE } from '@/lib/raids/base';
import type { RaidConfig } from '@/lib/raids/index';

/**
 * Phase 20: Theatre of Blood supplies. The potions are brought (no raid boost: `boostsNeedSupplies`), one of each by
 * default; brews and restores are also sold by the supply chests after Bloat and Sotetseg.
 */
export const TOB_DEFAULT_SUPPLIES: SupplyCounts = {
  brew: 4, restore: 3, ranging: 1, superCombat: 1, magic: 1, food: 0, other: 0,
};

/**
 * Phase 20: Theatre of Blood. Monsters, hp scaling by party size (normal / Hard Mode / Entry Mode), Verzik P1's damage
 * cap and the Dawnbringer's exemption, Sotetseg's (100) and Verzik's (no drains) Defence floors and weaknesses are
 * upstream's; this config adds the mode input (monster versions), targets, presets, pool, the nylocas style gating and
 * Dawnbringer-only-on-P1 rule (src/lib/raids/tob/damage.ts), the missing Vasilias / Prinkipas scaling ids, Bloat's drain
 * reset and the encounter model (src/lib/raids/tob/time.ts).
 */
export const THEATRE_OF_BLOOD_RAID: RaidConfig = {
  ...THEATRE_OF_BLOOD_BASE,
  name: 'Theatre of Blood',
  shortName: 'Theatre of Blood',
  raidOnlyAssumptions: false,
  presetsNote: 'Presets: the Fractured Archive list + src/lib/raids/tob/presets.ts (Scythe + Salve (ei), Dawnbringer).',
  time: TOB_TIME_MODEL,
  defaultTimeSettings: TOB_TIME_DEFAULTS,
  timeModelNote: 'Time = Σ damage ÷ (team-DPS multiplier × your DPS) per phase, with the kit\'s best loadout + style per '
    + 'phase (switching is free); DPS time only (no walks, mazes, waves, webs or invulnerable phases). HP: upstream\'s ToB '
    + 'scaling (75% at 1-3 players, 87.5% at 4, 100% at 5; Entry Mode its own table). Maiden 100 → 70 → 50 → 30 → 0%; '
    + 'Bloat only while down, drains for the first down only (the stomp restores Defence); Nylocas: the Vasilias (and '
    + 'Hard Mode\'s 3 Prinkipas) in equal time per form, only the matching style hits; Sotetseg in thirds, drains redone '
    + 'after each maze; Xarpus P2 75% → 25%, then P3; Verzik P1 Dawnbringer specs + capped hits, P2, P3 (Hard Mode +30%).',
  timeSettingFields: [
    {
      key: 'maidenNyloHeal', label: 'Maiden nylo leaks', kind: 'percent', title: 'Maiden hp healed by leaked Nylocas Matomenos at each spawn (70% / 50% / 30%), as a share of her hp ("healed by double the amount of their current Hitpoints"; 0 = all frozen)',
    },
    {
      key: 'bloatDownSeconds', label: 'Bloat down', kind: 'number', unit: 's', title: 'Seconds of damage in Bloat\'s first down (Strategies: "roughly 18 seconds"); drains only apply then, the stomp restores his Defence', max: 60,
    },
    {
      key: 'nyloRotation', label: 'Nylo form rotation', kind: 'bool', title: 'The Vasilias (and Hard Mode Prinkipas) change form every 10 ticks: equal time in each form (hp split by the kit\'s DPS in each form). Off: a third of the hp per form',
    },
    {
      key: 'xarpusExhumedHeal', label: 'Xarpus exhumed heals', kind: 'percent', title: 'Hp Xarpus heals from exhumeds in P1 on top of the 75% he starts with (0 = all intercepted; max 25%)',
    },
    {
      key: 'verzikDawnbringerSpecs', label: 'Dawnbringer specs / player', kind: 'number', unit: '', title: 'Dawnbringer specials per player at Verzik P1 (35% energy each, 75-150 damage, avg 112.5; energy is full after Xarpus). Each costs one 4-tick attack', max: 3,
    },
    {
      key: 'verzikP2Heal', label: 'Verzik P2 heals', kind: 'percent', title: 'Verzik P2 healing (Nylocas Athanatos, P2.5 blood spells) as a share of her hp (0 = not counted)',
    },
    {
      key: 'verzikP3Heal', label: 'Verzik P3 heals', kind: 'percent', title: 'Verzik P3 healing (enrage tornadoes: 3× the damage they deal) as a share of her hp (0 = not counted). Hard Mode\'s 30% heal at 5% is always added',
    },
  ],
  routesLabel: 'Encounters',
  encounterTarget: TOB_ENCOUNTER_TARGET,
  hpNote: 'HP scaled by party size (upstream; wiki: 75% at 1-3, 87.5% at 4, 100% at 5) for the chosen mode.',
  defaultSupplies: TOB_DEFAULT_SUPPLIES,
  planNote: 'ToB: the Dawnbringer is picked up at Verzik (not an inventory item here); the supply chests after Bloat and Sotetseg sell brews and restores.',
};
