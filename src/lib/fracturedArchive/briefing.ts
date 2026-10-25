import { DrainStateId } from '@/lib/fracturedArchive/bestSetup';
import {
  BriefGroup, encounterBrief, encounterDrainSummary,
} from '@/lib/fracturedArchive/drainLine';
import { EncounterTime } from '@/lib/fracturedArchive/raidTime';

/**
 * Phase 34: the Plan tab's raid briefing, one row per encounter of the planned route: the loadouts used (kit loadout
 * labels, in phase order), the specs at the start of each drain event in short form (drainLine.ts `encounterBrief`) and
 * the seconds. The sentence form (`drainText`, phase 33's `encounterDrainSummary` text) is the tooltip. Pure.
 */
export interface BriefingRow {
  id: string;
  label: string;
  /** Kit loadout labels used by the encounter's phases (phase order, distinct). */
  loadouts: string[];
  /** Short drain groups; [] when nothing is specced (or drains "None"). */
  specs: BriefGroup[];
  /** Phase 33's encounter line (tooltip); undefined for drains "None". */
  drainText?: string;
  seconds: number;
  /** "Tonalztics 4 hits → Def 117" per group, joined with " · " ("no specs" when none): for tests / copy. */
  specsText: string;
}

export const briefingRows = (encounters: EncounterTime[], drain: DrainStateId): BriefingRow[] => encounters.map((e) => {
  const loadouts = Array.from(new Set(e.phases.map((p) => p.choice?.loadout).filter((l): l is string => !!l)));
  const summary = drain === 'none' ? undefined : encounterDrainSummary(e.phases.map((p) => ({
    key: p.key, label: p.label, drainLine: p.choice?.drainLine, drainReset: p.drainReset,
  })), drain);
  const specs = summary ? encounterBrief(summary) : [];
  return {
    id: e.id,
    label: e.label,
    loadouts,
    specs,
    ...(summary ? { drainText: summary.text } : {}),
    seconds: e.seconds,
    specsText: specs.length ? specs.map((g) => g.text).join(' · ') : 'no specs',
  };
});
