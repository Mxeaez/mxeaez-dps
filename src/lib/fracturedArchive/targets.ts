import { BestSetupTarget, NO_DRAINS_ADDS } from '@/lib/raids/types';
import {
  BORK_PHASES, BORK_STUNNED_PHASE, DAGONHAI_PHASES, DAGONHAI_SHIELDED_PHASE, OCELLUS_P1_PHASES, OCELLUS_P3_PHASES,
} from '@/lib/fracturedArchive/constants';

/** The Fractured Archive's best-setup targets (phase 8; moved out of bestSetup.ts in phase 18, re-exported there). */
// eslint-disable-next-line import/prefer-default-export
export const BEST_SETUP_TARGETS: BestSetupTarget[] = [
  {
    key: 'ag-flying', label: 'Archive Guardian (Flying)', name: 'Archive Guardian', version: 'Flying',
  },
  {
    key: 'ag-grounded', label: 'Archive Guardian (Grounded)', name: 'Archive Guardian', version: 'Grounded',
  },
  {
    key: 'smorks', label: 'The Smorks', name: 'The Smorks', version: '', npc: 'Smorks',
  },
  {
    key: 'bork',
    label: 'Bork',
    name: 'Bork',
    version: '',
    phases: BORK_PHASES,
    summaryPhases: [BORK_PHASES[0], BORK_STUNNED_PHASE],
  },
  // Phase 15: Ezekiel is the alternative to Bork and the Smorks (2nd boss); no phase options (no stat changes on the wiki)
  {
    key: 'ezekiel', label: 'Ezekiel', name: 'Ezekiel', version: '',
  },
  {
    key: 'dreadnoth', label: 'Dreadnoth the Jellied', name: 'Dreadnoth the Jellied', version: '',
  },
  // Phase 35: an add (no specs; a Search target only, the time model ignores the jellies). Dreadnoth the Jellied (wiki,
  // read 2026-10-24): "He will periodically summon jellies" (Jelly (Dreadnoth): 61 hp).
  {
    key: 'jelly', label: 'Jelly (Dreadnoth)', name: 'Jelly (Dreadnoth)', version: '', noDrains: NO_DRAINS_ADDS,
  },
  // Phase 15: Moia is the alternative to Dreadnoth (3rd boss); melee can't reach her
  {
    key: 'moia', label: 'Moia', name: 'Moia', version: '', note: 'Out of melee reach: ranged or magic only.',
  },
  {
    key: 'xarth', label: 'Xarth', name: 'Xarth', version: '',
  },
  // Phase 15: the Dagon'hai trio is the alternative to Xarth (4th boss). Elder and Monks share stats and one health
  // pool, so the Elder stands for all three; "Unshielded" only changes hp (7), so the Summary shows the shielded row.
  {
    key: 'dagonhai',
    label: 'Dagon\'hai Elder + Monks',
    name: 'Dagon\'hai Elder',
    version: '',
    phases: DAGONHAI_PHASES,
    summaryPhases: [DAGONHAI_SHIELDED_PHASE],
    note: 'Elder and Monks share stats and one health pool; the shield gauge is depleted 5 times (unverified).',
  },
  {
    key: 'ocellus-p1',
    label: 'Ocellus P1',
    name: 'Ocellus',
    version: 'Phase 1',
    phases: OCELLUS_P1_PHASES,
    summaryPhases: OCELLUS_P1_PHASES,
  },
  {
    key: 'ocellus-p2',
    label: 'Ocellus P2 (The Blade)',
    name: 'Ocellus',
    version: 'Phase 2',
    ttkNotApplicable: true,
    note: 'DPS = damage to the Blade; 50% transfers to P3. TTK n/a (timed phase).',
  },
  {
    key: 'ocellus-p3',
    label: 'Ocellus P3',
    name: 'Ocellus',
    version: 'Phase 3',
    phases: OCELLUS_P3_PHASES,
    summaryPhases: OCELLUS_P3_PHASES,
    note: 'Last-quadrant options are low-confidence (deflect strength unverified; void explosions: every attack 2-tick, hits halved: the user, unverified).',
  },
];
