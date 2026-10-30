import { EquipmentPiece, Player, PlayerEquipment } from '@/types/Player';
import { ANCESTRAL, BestSetupAssumptions, PresetDef } from '@/lib/fracturedArchive/presets';
import { presetSpells, presetStyles, resolvePresetEquipment } from '@/lib/fracturedArchive/bestSetup';
import { applyLoadoutToPlayer } from '@/lib/fracturedArchive/loadout';
import {
  createKitEvaluator, EncounterId, KitEvaluatorCache, kitEvaluatorCache, KitLoadout, RaidTimeAssumptions,
} from '@/lib/fracturedArchive/raidTime';
import { StyleOption } from '@/lib/fracturedArchive/search';
import { isOwned } from '@/lib/fracturedArchive/ownership';
import { timeVariant, TimeVariant } from '@/lib/fracturedArchive/variantBlend';
import { RaidId, Spellbook } from '@/lib/raids/types';

/**
 * Phase 40 (ROADMAP 40): the variations a raid forces on a few of its players. Everyone runs the planner's kit; a
 * variant adds a switch for `headcount` players and changes their DPS on the rows it covers (variantBlend.ts).
 *
 * The Fractured Archive's: the Xarth freezer. Wiki, The Fractured Archive/Strategies → Xarth → Phase 2 (read
 * 2026-10-30; docs/DATA_SOURCES.md *Phase 40*): "A player freezes the incoming corpses right before they can heal
 * Xarth, allowing designated teammates to attack him and the corpses with a venator bow", "Corpses can be frozen",
 * "A Venator bow will outperform most non-melee setups for overall damage if corpses are frozen adjacent to Xarth".
 * Modelled (UNVERIFIED D37): one player on the Ancient spellbook casts Ice Barrage at Xarth through phase 2 (its splash
 * freezes the corpses beside him), which is `share` 50% of his HP; that player deals the Ice Barrage loadout's DPS
 * there, everyone else the kit's. Corpse HP, healing and the barrage's damage on the corpses are not modelled.
 */
export interface RequiredVariantDef {
  id: string;
  raid: RaidId;
  /** "+ Ancients (Xarth corpses)". */
  label: string;
  headcount: number;
  encounter: EncounterId;
  /** The time model rows (PlannedPhase keys) the variant covers. */
  rowKeys: string[];
  /** Share of those rows' HP dealt while the variant runs. */
  share: number;
  /** Where on the encounter ("phase 2"). */
  where: string;
  spellbook: Spellbook;
  /** The variant loadout (owned pieces only; a camped ring replaces its ring). */
  preset: PresetDef;
  /** What the variant player does (the Plan tab). */
  role: string;
  source: string;
}

export const XARTH_FREEZER: RequiredVariantDef = {
  id: 'xarth-freezer',
  raid: 'fractured-archive',
  label: '+ Ancients (Xarth corpses)',
  headcount: 1,
  encounter: 'xarth',
  rowKeys: ['xarth'],
  share: 0.5,
  where: 'phase 2',
  spellbook: 'ancients',
  preset: {
    name: 'Freezer: Kodai + Ice Barrage (Ancestral)',
    group: 'magic',
    equipment: { ...ANCESTRAL, weapon: 'Kodai wand', shield: "Elidinis' ward (f)" },
    styles: ['Spell'],
    spells: ['Ice Barrage'],
  },
  role: 'Ice Barrage the corpses next to Xarth in phase 2 (Ancient spellbook: no Death Charge for this player, not in the times)',
  source: 'wiki The Fractured Archive/Strategies → Xarth → Phase 2 (read 2026-10-30): "A player freezes the incoming corpses"',
};

export const REQUIRED_VARIANTS: Partial<Record<RaidId, RequiredVariantDef[]>> = {
  'fractured-archive': [XARTH_FREEZER],
};

/** Phase 40: the variants of the assumptions' raid that apply at their party size (someone else must be there). */
export const requiredVariantsFor = (a: Pick<BestSetupAssumptions, 'raid' | 'partySize'>): RequiredVariantDef[] => (
  REQUIRED_VARIANTS[a.raid ?? 'fractured-archive'] ?? []).filter((v) => Math.floor(a.partySize) > v.headcount);

/**
 * Phase 40: the variant loadout's equipment: the preset's owned pieces (an unowned piece leaves its slot empty), the
 * camped ring in place of its ring. Null when the weapon is not owned or doesn't resolve.
 */
export const variantEquipment = (
  def: RequiredVariantDef,
  notOwned: string[] = [],
  ring: EquipmentPiece | null = null,
): Partial<Record<keyof PlayerEquipment, EquipmentPiece>> | null => {
  let eq: Partial<Record<keyof PlayerEquipment, EquipmentPiece | null>>;
  try {
    eq = resolvePresetEquipment(def.preset);
  } catch {
    return null;
  }
  const out: Partial<Record<keyof PlayerEquipment, EquipmentPiece>> = {};
  (Object.keys(eq) as (keyof PlayerEquipment)[]).forEach((slot) => {
    const p = eq[slot];
    if (p && isOwned(p.name, notOwned)) out[slot] = p;
  });
  if (!out.weapon) return null;
  if (ring) out.ring = ring;
  return out;
};

/** Phase 40: the variant loadout's style options (the preset's styles × spells). */
export const variantOptions = (def: RequiredVariantDef): StyleOption[] => presetStyles(def.preset)
  .flatMap((style) => presetSpells(def.preset).map((spell) => ({ style, spell })));

/** Phase 40: the variant loadout as a kit loadout (one member: its own kit). */
export const variantKitLoadout = (
  def: RequiredVariantDef,
  base: Player,
  equipment: Partial<PlayerEquipment>,
  assumptions: BestSetupAssumptions,
): KitLoadout => ({
  id: `variant:${def.id}`,
  name: def.preset.name,
  group: def.preset.group,
  options: variantOptions(def),
  toPlayer: (monster, o, a) => applyLoadoutToPlayer(base, def.preset.name, def.preset.group, equipment, o.style, o.spell, monster, a ?? assumptions),
});

const ASSUMPTION_IDS = new Map<string, number>();
const ASSUMPTION_IDS_MAX = 5000;
const CACHES = new Map<string, KitEvaluatorCache>();

/**
 * Phase 40: the time variants of `a` (one per def): each with its own kit evaluator, shared per (def, equipment,
 * assumptions JSON without the spec plan's inputs) so the DPS of a variant loadout on a drain state is computed once.
 * `id` holds all three (memo keys).
 */
export const timeVariantsFor = (
  defs: { def: RequiredVariantDef, equipment: Partial<PlayerEquipment>, key: string }[],
  base: Player,
  a: BestSetupAssumptions,
): TimeVariant[] => {
  if (!defs.length) return [];
  // the spec plan's inputs (carriers, your specs, damage specs, doses) are left out: the time model's passes ask the
  // variant kit with the event's spec counts (or no drains), which fix the monster, and the pass memo is shared across
  // them (`kitMemo` passKey leaves out the spec budget); with them in, fa's pass runs doubled
  const json = JSON.stringify({
    ...a, team: undefined, mySpecs: undefined, damageSpecs: undefined, damageFiller: undefined, surgePotions: undefined,
  });
  if (ASSUMPTION_IDS.size >= ASSUMPTION_IDS_MAX) {
    ASSUMPTION_IDS.clear();
    CACHES.clear();
  }
  let aid = ASSUMPTION_IDS.get(json);
  if (aid === undefined) {
    aid = ASSUMPTION_IDS.size;
    ASSUMPTION_IDS.set(json, aid);
  }
  return defs.map(({ def, equipment, key }) => {
    const id = `${def.id}|${key}|a${aid}`;
    let cache = CACHES.get(id);
    if (!cache) {
      cache = kitEvaluatorCache();
      CACHES.set(id, cache);
    }
    return timeVariant({
      id,
      encounter: def.encounter,
      rowKeys: [...def.rowKeys],
      share: def.share,
      headcount: def.headcount,
      partySize: Math.floor(a.partySize),
    }, createKitEvaluator([variantKitLoadout(def, base, equipment, a)], a, cache));
  });
};

/** Phase 40: the time assumptions with these variants (unchanged when there are none). */
export const withTimeVariants = (t: RaidTimeAssumptions, variants: TimeVariant[]): RaidTimeAssumptions => (variants.length
  ? { ...t, variants } : t);

/**
 * Phase 40: the time variants of a plan's result (its `variants`: the loadouts it timed), for re-timing the plan outside
 * the planner (tests, probes). `toEquipment`: the plan equipment → player equipment (planner.ts `toPlayerEquipment`).
 */
export const timeVariantsOfPlan = (
  variants: { id: string, loadout: { equipment: object } }[] | undefined,
  toEquipment: (eq: never) => Partial<PlayerEquipment>,
  base: Player,
  a: BestSetupAssumptions,
): TimeVariant[] => timeVariantsFor((variants ?? []).flatMap((v) => {
  const def = (REQUIRED_VARIANTS[a.raid ?? 'fractured-archive'] ?? []).find((d) => d.id === v.id);
  if (!def) return [];
  const equipment = toEquipment(v.loadout.equipment as never);
  const key = (['head', 'cape', 'neck', 'ammo', 'weapon', 'body', 'shield', 'legs', 'hands', 'feet', 'ring'] as (keyof PlayerEquipment)[])
    .map((sl) => equipment[sl]?.id ?? 0).join(',');
  return [{ def, equipment, key }];
}), base, a);
