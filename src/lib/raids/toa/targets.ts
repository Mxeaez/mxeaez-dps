import { BestSetupTarget, NO_DRAINS_ADDS } from '@/lib/raids/types';
import {
  AKKHA_FINAL_STAND_PHASE,
  AKKHA_NO_PRAYER_PHASE,
  AKKHA_PHASES,
  P2_ELIDINIS_INITIAL_PHASE,
  P2_TUMEKEN_INITIAL_PHASE,
  P2_WARDEN_PHASES,
} from '@/lib/raids/toa/constants';
import { beforeSuppliesTargets } from '@/lib/raids/toa/supplies';

/**
 * Phase 18: Tombs of Amascut targets of the best-setup view (Search boss list, Summary rows, time-model phases). Every
 * one is an upstream monster (cdn/json/monsters.json, upstream ids in '@/lib/constants'); upstream scales their hp by
 * raid level, path level (path monsters) and party size (src/lib/scaling/TombsOfAmascut.ts) and their defence roll by
 * raid level (PlayerVsNPCCalc). Keys start with "toa-" (unique across raids). Encounter sequence: src/lib/raids/toa/time.ts.
 */
const TOA_ROOM_TARGETS: BestSetupTarget[] = [
  {
    key: 'toa-kephri-shielded',
    label: 'Kephri (Shielded)',
    name: 'Kephri',
    version: 'Shielded',
    raid: 'toa',
    toaPath: 'kephri',
    note: 'The shield is depleted three times (Strategies), then Kephri is attacked directly.',
  },
  {
    key: 'toa-kephri', label: 'Kephri (Unshielded)', name: 'Kephri', version: 'Aggressive', raid: 'toa', toaPath: 'kephri',
  },
  // Phase 35: the overlord scarabs are adds (no specs). ToA Strategies (wiki, read 2026-10-24): "The first shield threshold will
  // cause a single Spitting Scarab to spawn, while the second threshold causes a Soldier and Arcane Scarab"; Spitting /
  // Soldier / Arcane Scarab: "a monster that is summoned by Kephri". docs/DATA_SOURCES.md *Phase 35*.
  {
    key: 'toa-spitting-scarab', label: 'Spitting Scarab', name: 'Spitting Scarab', version: '', raid: 'toa', toaPath: 'kephri', noSummary: true, noDrains: NO_DRAINS_ADDS,
  },
  {
    key: 'toa-soldier-scarab', label: 'Soldier Scarab', name: 'Soldier Scarab', version: '', raid: 'toa', toaPath: 'kephri', noSummary: true, noDrains: NO_DRAINS_ADDS,
  },
  {
    key: 'toa-arcane-scarab', label: 'Arcane Scarab', name: 'Arcane Scarab', version: '', raid: 'toa', toaPath: 'kephri', noSummary: true, noDrains: NO_DRAINS_ADDS,
  },
  {
    key: 'toa-zebak', label: 'Zebak', name: 'Zebak', version: 'Normal', raid: 'toa', toaPath: 'zebak',
  },
  {
    key: 'toa-akkha',
    label: 'Akkha',
    name: 'Akkha',
    version: '',
    raid: 'toa',
    toaPath: 'akkha',
    phases: AKKHA_PHASES,
    summaryPhases: [AKKHA_NO_PRAYER_PHASE, AKKHA_FINAL_STAND_PHASE],
    note: 'Prays against the style he attacks with; final stand: Protect from Magic + Missiles (melee only).',
  },
  // Phase 35: an add (no specs). Akkha's Shadow (wiki, read 2026-10-24): "Akkha's Shadows are summoned by Akkha ...
  // After reaching 80% of his health, he will generate four shadows of himself", one dispelled per 20% threshold.
  {
    key: 'toa-akkha-shadow', label: 'Akkha\'s Shadow', name: 'Akkha\'s Shadow', version: '', raid: 'toa', toaPath: 'akkha', noDrains: NO_DRAINS_ADDS,
  },
  {
    key: 'toa-baba', label: 'Ba-Ba', name: 'Ba-Ba', version: '', raid: 'toa', toaPath: 'baba',
  },
  {
    key: 'toa-obelisk',
    label: 'Obelisk (Wardens P1)',
    name: 'Obelisk (Tombs of Amascut)',
    version: '',
    raid: 'toa',
    npc: 'Obelisk',
    noDeathCharge: 'wiki Death Charge: "The obelisk and Energy Siphons during the fight with the Wardens" will not trigger the effect',
  },
  {
    key: 'toa-warden-p2',
    label: 'Elidinis\' Warden P2',
    name: 'Elidinis\' Warden',
    version: 'Active',
    raid: 'toa',
    phases: [P2_ELIDINIS_INITIAL_PHASE, ...P2_WARDEN_PHASES.filter((p) => p !== P2_ELIDINIS_INITIAL_PHASE)],
    summaryPhases: [P2_ELIDINIS_INITIAL_PHASE],
    note: 'Shielded body: 100% accuracy, damage scaled by accuracy (upstream). Attack until the core is ejected.',
  },
  {
    key: 'toa-warden-p2-tumeken',
    label: 'Tumeken\'s Warden P2',
    name: 'Tumeken\'s Warden',
    version: 'Active',
    raid: 'toa',
    phases: [P2_TUMEKEN_INITIAL_PHASE, ...P2_WARDEN_PHASES.filter((p) => p !== P2_TUMEKEN_INITIAL_PHASE)],
    noSummary: true,
  },
  {
    key: 'toa-warden-core',
    label: 'Warden core (P2)',
    name: 'Elidinis\' Warden',
    version: 'Core-ejected',
    raid: 'toa',
    note: 'Melee always max hits (upstream); each hit deals 5× to the Warden (Strategies).',
  },
  {
    key: 'toa-warden-p3', label: 'Tumeken\'s Warden P3', name: 'Tumeken\'s Warden', version: 'Damaged', raid: 'toa',
  },
  {
    key: 'toa-warden-p3-enraged',
    label: 'Tumeken\'s Warden P3 (enraged)',
    name: 'Tumeken\'s Warden',
    version: 'Enraged',
    raid: 'toa',
    note: 'Below 5%: heals 20% of max hp, Defence 180 (floor 120).',
  },
];

/**
 * Phase 38a: the targets of the rooms fought before the supplies (Kephri's path and Zebak's: the first two rooms of the
 * fixed route, src/lib/raids/toa/supplies.ts).
 */
export const TOA_BEFORE_SUPPLIES_SOURCE_KEYS = ['toa-kephri-shielded', 'toa-kephri', 'toa-spitting-scarab', 'toa-soldier-scarab', 'toa-arcane-scarab', 'toa-zebak',
  // phase 38c: any two paths may come first (the planner picks the pair)
  'toa-akkha', 'toa-akkha-shadow', 'toa-baba'];

/** Every ToA target, then (phase 38a) the copies of the rooms before the supplies (`beforeSupplies`). */
export const TOA_TARGETS: BestSetupTarget[] = [
  ...TOA_ROOM_TARGETS,
  ...beforeSuppliesTargets(TOA_ROOM_TARGETS.filter((t) => TOA_BEFORE_SUPPLIES_SOURCE_KEYS.includes(t.key))),
];
