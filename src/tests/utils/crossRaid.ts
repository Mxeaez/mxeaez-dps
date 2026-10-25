import { generateEmptyPlayer } from '@/state';
import { PresetDef } from '@/lib/fracturedArchive/presets';
import {
  DEFAULT_CARRIER_MODE, DEFAULT_RING_POLICY, DEFAULT_SPEC_MODE, plan, PlanInputs, PlanResult, planItemByName, PlanTuning,
} from '@/lib/fracturedArchive/planner';
import { RaidConfig } from '@/lib/raids';

// Phase 37: CrossRaid's plan helpers, shared with the headline test files (CrossRaidHeadlines*.test.ts) so the slow
// headline plans run in parallel Jest workers.

/** The first preset of each style group (every raid's list starts with the Fractured Archive's). */
export const groupPresets = (raid: RaidConfig): PresetDef[] => (['melee', 'ranged', 'magic'] as const)
  .map((g) => raid.presets.find((p) => p.group === g)!)
  .filter(Boolean);

/** A small kit that can clear every encounter: the group presets + the raid's pickaxe preset (CoX Guardians). */
export const kitPresets = (raid: RaidConfig): PresetDef[] => [
  ...groupPresets(raid), ...raid.presets.filter((p) => p.name.includes('pickaxe')),
];

/** The plan inputs of planFor (phase 37b: shared with the headline fixture, src/tests/utils/headlines.ts). */
export const planInputsFor = (raid: RaidConfig, reduced: boolean, notOwned: string[] = []): PlanInputs => ({
  ...(notOwned.length ? { notOwned } : {}),
  // phase 27: the full (headline) plan uses the Plan tab's default ring policy (camp one ring); the reduced one switches
  // phase 29: and the Plan tab's default spec mode (the planner decides: Team = your share of the team's carriers)
  // phase 29 review: and the planner's team carriers (the Plan tab's default)
  ...(reduced ? {} : { ringPolicy: DEFAULT_RING_POLICY, specMode: DEFAULT_SPEC_MODE, carrierMode: DEFAULT_CARRIER_MODE }),
  basePlayer: generateEmptyPlayer(),
  assumptions: raid.defaultAssumptions,
  drain: 'team',
  settings: raid.defaultTimeSettings,
  route: 'all',
  pinned: raid.planDefaults.pinned.map((n) => planItemByName(n).id),
  nonItemSlots: raid.planDefaults.nonItemSlots,
  supplies: raid.defaultSupplies,
});

export const planTuningFor = (raid: RaidConfig, reduced: boolean): PlanTuning => (reduced ? {
  model: raid.time,
  presets: kitPresets(raid),
  search: { weapons: ['Scythe of Vitur', 'Tumeken\'s shadow', 'Twisted bow'], maxPasses: 1 },
  perGroupWeapons: 1,
  perWeapon: 1,
  bases: 1,
  partners: 1,
  seeds: 2,
} : { model: raid.time });

export const planFor = (raid: RaidConfig, reduced: boolean, notOwned: string[] = []): PlanResult => plan(
  planInputsFor(raid, reduced, notOwned),
  planTuningFor(raid, reduced),
);
