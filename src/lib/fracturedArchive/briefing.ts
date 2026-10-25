import { DrainStateId, findTarget } from '@/lib/fracturedArchive/bestSetup';
import {
  BriefGroup, encounterBrief, encounterDrainSummary,
} from '@/lib/fracturedArchive/drainLine';
import { EncounterTime } from '@/lib/fracturedArchive/raidTime';

/**
 * Phase 34: the Plan tab's raid briefing, one row per encounter of the planned route: the loadouts used (kit loadout
 * labels, in phase order), the specs at the start of each drain event in short form (drainLine.ts `encounterBrief`) and
 * the seconds. The sentence form (`drainText`, phase 33's `encounterDrainSummary` text) is the tooltip. Pure.
 * Phase 35b: one drain line per NPC (Bork / Smorks), and the loadouts named per NPC when the NPCs use different ones.
 */

/**
 * Phase 35b: the NPC a planned phase is fought on, as the briefing names it: the target's `npc`, else its monster name
 * (AG flying / grounded, Bork's armour phases and Ocellus P1–P3 are one NPC each; Bork and The Smorks are two).
 */
export const phaseNpc = (targetKey: string): string => {
  try {
    const t = findTarget(targetKey);
    return t.npc ?? t.name;
  } catch {
    return targetKey;
  }
};

/** Phase 35b: the Wear cell's loadouts of one or more NPCs (`npc` undefined: the encounter's only group). */
export interface WearGroup {
  /** e.g. "Bork", "Spitting Scarab, Soldier Scarab". */
  npc?: string;
  loadouts: string[];
}

/**
 * Phase 35b: the loadouts per NPC (NPCs in the order they first appear, loadouts in phase order) when the NPCs don't all
 * use the same ones; NPCs using the same loadouts share a group. One group without a name otherwise (phase 34).
 */
export const wearGroups = (phases: { targetKey: string, choice: { loadout: string } | null }[]): WearGroup[] => {
  const all = Array.from(new Set(phases.map((p) => p.choice?.loadout).filter((l): l is string => !!l)));
  const byNpc = new Map<string, string[]>();
  phases.forEach((p) => {
    const npc = phaseNpc(p.targetKey);
    if (!byNpc.has(npc)) byNpc.set(npc, []);
    const l = p.choice?.loadout;
    if (l && !byNpc.get(npc)!.includes(l)) byNpc.get(npc)!.push(l);
  });
  const lists = Array.from(byNpc.entries()).filter(([, l]) => l.length);
  const distinct = new Map<string, { npcs: string[], loadouts: string[] }>();
  lists.forEach(([npc, l]) => {
    const k = JSON.stringify(l);
    if (!distinct.has(k)) distinct.set(k, { npcs: [], loadouts: l });
    distinct.get(k)!.npcs.push(npc);
  });
  if (distinct.size <= 1) return [{ loadouts: all }];
  return Array.from(distinct.values()).map((g) => ({ npc: g.npcs.join(', '), loadouts: g.loadouts }));
};

export interface BriefingRow {
  id: string;
  label: string;
  /** Kit loadout labels used by the encounter's phases (phase order, distinct). */
  loadouts: string[];
  /** Phase 35b: the same loadouts per NPC (one unnamed group when every NPC uses the same ones). */
  wear: WearGroup[];
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
    key: p.key, label: p.label, drainLine: p.choice?.drainLine, drainReset: p.drainReset, npc: phaseNpc(p.targetKey),
  })), drain);
  const specs = summary ? encounterBrief(summary) : [];
  return {
    id: e.id,
    label: e.label,
    loadouts,
    wear: wearGroups(e.phases),
    specs,
    ...(summary ? { drainText: summary.text } : {}),
    seconds: e.seconds,
    specsText: specs.length ? specs.map((g) => g.text).join(' · ') : 'no specs',
  };
});
