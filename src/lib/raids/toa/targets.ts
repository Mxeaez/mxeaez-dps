import { BestSetupTarget } from '@/lib/raids/types';
import {
  AKKHA_FINAL_STAND_PHASE,
  AKKHA_NO_PRAYER_PHASE,
  AKKHA_PHASES,
  P2_ELIDINIS_INITIAL_PHASE,
  P2_TUMEKEN_INITIAL_PHASE,
  P2_WARDEN_PHASES,
} from '@/lib/raids/toa/constants';

/**
 * Phase 18: Tombs of Amascut targets of the best-setup view (Search boss list, Summary rows, time-model phases). Every
 * one is an upstream monster (cdn/json/monsters.json, upstream ids in '@/lib/constants'); upstream scales their hp by
 * raid level, path level (path monsters) and party size (src/lib/scaling/TombsOfAmascut.ts) and their defence roll by
 * raid level (PlayerVsNPCCalc). Keys start with "toa-" (unique across raids). Encounter sequence: src/lib/raids/toa/time.ts.
 */
// eslint-disable-next-line import/prefer-default-export
export const TOA_TARGETS: BestSetupTarget[] = [
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
  {
    key: 'toa-spitting-scarab', label: 'Spitting Scarab', name: 'Spitting Scarab', version: '', raid: 'toa', toaPath: 'kephri', noSummary: true,
  },
  {
    key: 'toa-soldier-scarab', label: 'Soldier Scarab', name: 'Soldier Scarab', version: '', raid: 'toa', toaPath: 'kephri', noSummary: true,
  },
  {
    key: 'toa-arcane-scarab', label: 'Arcane Scarab', name: 'Arcane Scarab', version: '', raid: 'toa', toaPath: 'kephri', noSummary: true,
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
  {
    key: 'toa-akkha-shadow', label: 'Akkha\'s Shadow', name: 'Akkha\'s Shadow', version: '', raid: 'toa', toaPath: 'akkha',
  },
  {
    key: 'toa-baba', label: 'Ba-Ba', name: 'Ba-Ba', version: '', raid: 'toa', toaPath: 'baba',
  },
  {
    key: 'toa-obelisk', label: 'Obelisk (Wardens P1)', name: 'Obelisk (Tombs of Amascut)', version: '', raid: 'toa',
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
