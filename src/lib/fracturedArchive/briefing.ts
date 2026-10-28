import { DrainStateId, findTarget } from '@/lib/fracturedArchive/bestSetup';
import {
  BriefGroup, DrainFacts, encounterBrief, encounterDrainSummary, EncounterDrainSummary,
} from '@/lib/fracturedArchive/drainLine';
import { EncounterTime } from '@/lib/fracturedArchive/raidTime';
import type { DamageSpecWeapon } from '@/lib/fracturedArchive/damageSpecs';

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

/** Phase 37: the target's `noDrains` reason (adds and other targets never specced), if any. */
const phaseNoDrains = (targetKey: string): string | undefined => {
  try {
    return findTarget(targetKey).noDrains;
  } catch {
    return undefined;
  }
};

/** Phase 37: an encounter's phases as `encounterDrainSummary` reads them (NPC, Defence resets, adds). */
export const drainSummaryPhases = (phases: EncounterTime['phases']) => phases.map((p) => ({
  key: p.key,
  label: p.label,
  drainLine: p.choice?.drainLine,
  drainReset: p.drainReset,
  npc: phaseNpc(p.targetKey),
  noDrains: phaseNoDrains(p.targetKey),
}));

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
  /** Phase 36: your damage specs in the encounter (all its phases), per weapon, with the seconds they save. */
  damage: { weapon: DamageSpecWeapon, label: string, count: number, saved: number }[];
  /** Phase 36: a surge dose here (right after the first specs). */
  surge: boolean;
  /** Phase 38g: the drain facts per drain event (the same line as Search / Summary), equal ones once; [] for None. */
  facts: { label?: string, facts: DrainFacts }[];
}

/**
 * Phase 38g: an encounter's drain facts (drainLine.ts `drainFacts`), one per drain event that has them; events with the
 * same facts once (Sotetseg's three); labelled ("Bork", "after maze 1") only when more than one is left.
 */
export const encounterFacts = (summary: EncounterDrainSummary | undefined): BriefingRow['facts'] => {
  const out: BriefingRow['facts'] = [];
  const seen = new Set<string>();
  (summary?.events ?? []).forEach((e) => {
    if (!e.facts) return;
    const k = `${e.facts.text}|${e.facts.short ?? ''}`;
    if (seen.has(k)) return;
    seen.add(k);
    const label = [e.npc ?? '', e.reset ? `after ${e.reset}` : ''].filter(Boolean).join(', ');
    out.push({ ...(label ? { label } : {}), facts: e.facts });
  });
  return out.length > 1 ? out : out.map((x) => ({ facts: x.facts }));
};

/** Phase 36: an encounter's damage specs per weapon (phase order of first use), summed over its phases. */
export const encounterDamageSpecs = (e: Pick<EncounterTime, 'phases'>): BriefingRow['damage'] => {
  const out: BriefingRow['damage'] = [];
  e.phases.forEach((p) => (p.damageSpecs ?? []).forEach((d) => {
    const x = out.find((o) => o.weapon === d.weapon);
    if (x) {
      x.count += d.count;
      x.saved += d.count * d.saved;
    } else {
      out.push({
        weapon: d.weapon, label: d.label, count: d.count, saved: d.count * d.saved,
      });
    }
  }));
  return out;
};

/** Phase 36: "Voidwaker ×2" per weapon, joined with " + ". */
export const damageText = (d: BriefingRow['damage']): string => d.map((x) => `${x.label} ×${x.count}`).join(' + ');

export const briefingRows = (encounters: EncounterTime[], drain: DrainStateId, surgeDoses: string[] = []): BriefingRow[] => encounters.map((e) => {
  const loadouts = Array.from(new Set(e.phases.map((p) => p.choice?.loadout).filter((l): l is string => !!l)));
  const summary = drain === 'none' ? undefined : encounterDrainSummary(drainSummaryPhases(e.phases), drain);
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
    damage: encounterDamageSpecs(e),
    surge: surgeDoses.includes(e.id),
    facts: encounterFacts(summary),
  };
});
