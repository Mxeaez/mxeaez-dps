import { BestSetupTarget, NO_DRAINS_ADDS, TobMode } from '@/lib/raids/types';
import {
  NYLO_MAGIC_FORM, NYLO_MELEE_FORM, NYLO_RANGED_FORM,
} from '@/lib/raids/tob/constants';

/**
 * Phase 20: Theatre of Blood targets of the best-setup view (Search boss list, Summary rows, time-model phases). Every
 * one is an upstream monster (cdn/json/monsters.json); upstream scales their hp by party size (normal / Hard Mode: 75%
 * at 1-3, 87.5% at 4, 100% at 5; Entry Mode its own table: src/lib/scaling/TheatreOfBlood.ts), caps damage on Verzik's
 * first phase (10 melee / 3 otherwise, the Dawnbringer exempt and always accurate), and has Defence floors for Sotetseg
 * (100) and Verzik (her own Defence: no drains). Phase 20 adds the nylocas style gating, the Dawnbringer-only-on-P1 rule
 * (src/lib/raids/tob/damage.ts) and the missing Nylocas Vasilias / Prinkipas ids. Keys start with "tob-".
 *
 * The listed `version` is the normal-mode monster; the mode input swaps in that mode's version (`TOB_VERSIONS`,
 * applied by `THEATRE_OF_BLOOD_BASE.resolveTarget`). Every ToB boss has a separate monster per mode in monsters.json
 * (Hard Mode: Bloat 2400 hp, Xarpus 6000 hp / Defence 200; the rest the same stats as normal; Entry Mode: lower stats).
 * The Maiden's "70% / 50% / 30% Health" versions have her normal stats with the remaining hp (and no image), so the
 * thresholds are encounter phases of the normal target. Encounter sequence: src/lib/raids/tob/time.ts.
 */

type VersionByMode = Partial<Record<TobMode, string>>;

const modes = (normal: string, hard: string, entry: string): VersionByMode => ({ normal, hard, entry });

/** Each target's monster version per mode (a target missing from here, or a mode missing from its entry, keeps `version`). */
export const TOB_VERSIONS: Record<string, VersionByMode> = {
  'tob-maiden': modes('Normal', 'Hard Mode', 'Entry Mode'),
  'tob-bloat': modes('Normal', 'Hard', 'Entry'),
  'tob-bloat-restored': modes('Normal', 'Hard', 'Entry'),
  'tob-nylo-boss-melee': modes('Normal', 'Hard', 'Entry'),
  'tob-nylo-boss-ranged': modes('Normal', 'Hard', 'Entry'),
  'tob-nylo-boss-magic': modes('Normal', 'Hard', 'Entry'),
  // Hard Mode's wave nylocas are the normal monsters in the data (separate ids, same stats); Entry Mode has its own
  'tob-ischyros-small': { entry: 'Small (Entry Mode)' },
  'tob-ischyros-big': { entry: 'Big (Entry Mode)' },
  'tob-toxobolos-small': { entry: 'Small (Entry Mode)' },
  'tob-toxobolos-big': { entry: 'Big (Entry Mode)' },
  'tob-hagios-small': { entry: 'Small (Entry Mode)' },
  'tob-hagios-big': { entry: 'Big (Entry Mode)' },
  'tob-sotetseg': modes('Normal', 'Hard', 'Entry'),
  'tob-xarpus': modes('Normal mode', 'Hard mode', 'Entry mode'),
  'tob-verzik-p1': modes('Normal mode, Phase 1', 'Hard mode, Phase 1', 'Entry mode, Phase 1'),
  'tob-verzik-p2': modes('Normal mode, Phase 2', 'Hard mode, Phase 2', 'Entry mode, Phase 2'),
  'tob-verzik-p3': modes('Normal mode, Phase 3', 'Hard mode, Phase 3', 'Entry mode, Phase 3'),
};

const NO_VERZIK_DRAINS = 'Verzik\'s Defence cannot be lowered ("Verzik Vitur absorbs the defence reduction!")';

// Phase 35: the wave nylocas are adds (no specs; they are Search targets only, not in the time model). Nylocas Ischyros
// (wiki, read 2026-10-24): "part of the wave prior to the Nylocas Vasilias encounter ... They spawn alongside Nylocas
// Toxobolos and Nylocas Hagios as they attempt to destroy the pillars".
const waveNylo = (key: string, name: string, size: 'Small' | 'Big', style: string): BestSetupTarget => ({
  key,
  label: `${name} (${size.toLowerCase()}, ${style} only)`,
  name,
  version: size,
  raid: 'tob',
  noSummary: true,
  noDrains: NO_DRAINS_ADDS,
  note: `Nylocas waves: immune to every style but ${style} (Strategies).`,
});

// eslint-disable-next-line import/prefer-default-export
export const TOB_TARGETS: BestSetupTarget[] = [
  {
    key: 'tob-maiden',
    label: 'The Maiden of Sugadinti',
    name: 'The Maiden of Sugadinti',
    version: 'Normal',
    raid: 'tob',
    note: 'Defence 200, no floor (Strategies: two Elder maul specs then BGS to 0). High Magic level: Twisted bow.',
  },
  {
    key: 'tob-bloat',
    label: 'Pestilent Bloat',
    name: 'Pestilent Bloat',
    version: 'Normal',
    raid: 'tob',
    note: 'Undead (Salve amulet). Only damaged while down; drained Defence regenerates at the stomp.',
  },
  {
    key: 'tob-bloat-restored',
    label: 'Pestilent Bloat (after a stomp: Defence restored)',
    name: 'Pestilent Bloat',
    version: 'Normal',
    raid: 'tob',
    noSummary: true,
    noDrains: 'Bloat\'s Defence "will regenerate to full when it stomps"',
  },
  {
    key: 'tob-nylo-boss-melee',
    label: 'Nylocas Vasilias (melee form)',
    name: 'Nylocas Vasilias',
    version: 'Normal',
    raid: 'tob',
    phases: [NYLO_MELEE_FORM],
    note: 'Only melee damages this form (ranged / magic can\'t hit). Changes form every 10 ticks.',
  },
  {
    key: 'tob-nylo-boss-ranged',
    label: 'Nylocas Vasilias (ranged form)',
    name: 'Nylocas Vasilias',
    version: 'Normal',
    raid: 'tob',
    phases: [NYLO_RANGED_FORM],
    note: 'Only ranged damages this form.',
  },
  {
    key: 'tob-nylo-boss-magic',
    label: 'Nylocas Vasilias (magic form)',
    name: 'Nylocas Vasilias',
    version: 'Normal',
    raid: 'tob',
    phases: [NYLO_MAGIC_FORM],
    note: 'Only magic damages this form.',
  },
  waveNylo('tob-ischyros-small', 'Nylocas Ischyros', 'Small', 'melee'),
  waveNylo('tob-ischyros-big', 'Nylocas Ischyros', 'Big', 'melee'),
  waveNylo('tob-toxobolos-small', 'Nylocas Toxobolos', 'Small', 'ranged'),
  waveNylo('tob-toxobolos-big', 'Nylocas Toxobolos', 'Big', 'ranged'),
  waveNylo('tob-hagios-small', 'Nylocas Hagios', 'Small', 'magic'),
  waveNylo('tob-hagios-big', 'Nylocas Hagios', 'Big', 'magic'),
  {
    key: 'tob-prinkipas-melee',
    label: 'Nylocas Prinkipas (Hard Mode, melee form)',
    name: 'Nylocas Prinkipas',
    version: 'Melee',
    raid: 'tob',
    noSummary: true,
    tobModes: ['hard'],
    note: 'Hard Mode only: three spawn during the waves; changes form like the Vasilias.',
  },
  {
    key: 'tob-prinkipas-ranged',
    label: 'Nylocas Prinkipas (Hard Mode, ranged form)',
    name: 'Nylocas Prinkipas',
    version: 'Ranged',
    raid: 'tob',
    noSummary: true,
    tobModes: ['hard'],
  },
  {
    key: 'tob-prinkipas-magic',
    label: 'Nylocas Prinkipas (Hard Mode, magic form)',
    name: 'Nylocas Prinkipas',
    version: 'Magic',
    raid: 'tob',
    noSummary: true,
    tobModes: ['hard'],
  },
  {
    key: 'tob-sotetseg',
    label: 'Sotetseg',
    name: 'Sotetseg',
    version: 'Normal',
    raid: 'tob',
    note: 'Defence floor 100 (upstream); Defence restored after each maze (66.6% / 33.3%).',
  },
  {
    key: 'tob-xarpus',
    label: 'Xarpus',
    name: 'Xarpus',
    version: 'Normal mode',
    raid: 'tob',
    note: 'Defence 250 (Hard Mode 200), +160 ranged defence, none against melee; weak to air spells. P2 and P3 share stats.',
  },
  {
    key: 'tob-verzik-p1',
    label: 'Verzik Vitur P1 (shield)',
    name: 'Verzik Vitur',
    version: 'Normal mode, Phase 1',
    raid: 'tob',
    noDrains: NO_VERZIK_DRAINS,
    note: 'Damage capped at 10 melee / 3 ranged and magic per hitsplat, except the Dawnbringer (always hits; upstream).',
  },
  {
    key: 'tob-verzik-p2',
    label: 'Verzik Vitur P2',
    name: 'Verzik Vitur',
    version: 'Normal mode, Phase 2',
    raid: 'tob',
    noDrains: NO_VERZIK_DRAINS,
  },
  {
    key: 'tob-verzik-p3',
    label: 'Verzik Vitur P3',
    name: 'Verzik Vitur',
    version: 'Normal mode, Phase 3',
    raid: 'tob',
    noDrains: NO_VERZIK_DRAINS,
  },
];
