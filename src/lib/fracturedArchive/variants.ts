import { EquipmentPiece, PlayerEquipment } from '@/types/Player';
import { ANCESTRAL, BestSetupAssumptions, PresetDef } from '@/lib/fracturedArchive/presets';
import { resolvePresetEquipment } from '@/lib/fracturedArchive/bestSetup';
import { EncounterId, RaidTimeAssumptions } from '@/lib/fracturedArchive/raidTime';
import { isOwned } from '@/lib/fracturedArchive/ownership';
import { TimeVariant } from '@/lib/fracturedArchive/variantBlend';
import { RaidId, Spellbook } from '@/lib/raids/types';

/**
 * Phase 40 (ROADMAP 40): the variations a raid forces on a few of its players. Everyone runs the planner's kit; a
 * variant adds a switch for `headcount` players and costs them some of their DPS on the rows it covers (variantBlend.ts).
 *
 * The Fractured Archive's: the Xarth freezer. Wiki, The Fractured Archive/Strategies → Xarth → Phase 2 and Corpse
 * (Xarth) (read 2026-10-30; docs/DATA_SOURCES.md *Phase 40*): "A player freezes the incoming corpses right before they
 * can heal Xarth", "A magic accuracy of 75 guarantees a freeze", "Water spells and ice spells are 1-tick on unfrozen
 * corpses". Phase 40 rework (the user, 2026-10-30): the freezer switches to a magic switch with ≥ 75 magic attack
 * (theirs: Kodai + Ancestral top + Elidinis' ward (f)), casts Ice Barrage on the corpses, and swaps back to DPS on
 * Xarth with the kit; the barrage does no damage to Xarth. So on phase 2 (`share`, 50% of his HP; the user estimates
 * 50-60%) the freezer deals the kit's DPS × (1 − `castSeconds` ÷ `waveSeconds`). The wave interval is not on the wiki:
 * an estimate (UNVERIFIED D37). The freeze is taken as guaranteed.
 */
export interface RequiredVariantDef {
  id: string;
  raid: RaidId;
  headcount: number;
  encounter: EncounterId;
  /** The time model rows (PlannedPhase keys) the variant covers. */
  rowKeys: string[];
  /** Share of those rows' HP dealt while the variant runs. */
  share: number;
  /** Where on the encounter ("phase 2"). */
  where: string;
  spellbook: Spellbook;
  /** The spell the variant player casts. */
  spell: string;
  /** Seconds of the variant player's DPS lost per wave (switch, cast, switch back). */
  castSeconds: number;
  /** Seconds between waves. */
  waveSeconds: number;
  /** The pieces the switch is taken from (owned only; the cheapest set reaching `minMagicAttack`). */
  preset: PresetDef;
  /** The switch's magic attack bonus needed (the wiki: 75 guarantees a freeze). */
  minMagicAttack: number;
  /** Switch preference (slots, first = preferred on ties): the user's Kodai + Ancestral top + ward first. */
  prefer: (keyof PlayerEquipment)[];
  source: string;
}

/** Ticks of 0.6 s. */
const TICK = 0.6;

export const XARTH_FREEZER: RequiredVariantDef = {
  id: 'xarth-freezer',
  raid: 'fractured-archive',
  headcount: 1,
  encounter: 'xarth',
  rowKeys: ['xarth'],
  share: 0.5,
  where: 'phase 2',
  spellbook: 'ancients',
  spell: 'Ice Barrage',
  // Ice Barrage's 5-tick attack + ~1 tick of timer misalignment (switches are free, D10): 6 ticks (estimate)
  castSeconds: 6 * TICK,
  // one wave every 30 ticks (estimate; not on the wiki)
  waveSeconds: 30 * TICK,
  preset: {
    name: 'Freezer switch',
    group: 'magic',
    equipment: { ...ANCESTRAL, weapon: 'Kodai wand', shield: "Elidinis' ward (f)" },
    styles: ['Spell'],
    spells: ['Ice Barrage'],
  },
  minMagicAttack: 75,
  prefer: ['weapon', 'body', 'shield', 'legs', 'hands', 'cape', 'neck', 'ring', 'head', 'feet'],
  source: 'wiki Strategies → Xarth → Phase 2 and Corpse (Xarth) (read 2026-10-30); the user (2026-10-30): barrage the corpses, swap back',
};

export const REQUIRED_VARIANTS: Partial<Record<RaidId, RequiredVariantDef[]>> = {
  'fractured-archive': [XARTH_FREEZER],
};

/** Phase 40: the share of the variant player's DPS kept on the variant rows (1 − cast ÷ wave, within 0-1). */
export const variantKeep = (def: Pick<RequiredVariantDef, 'castSeconds' | 'waveSeconds'>): number => (def.waveSeconds > 0
  ? Math.min(1, Math.max(0, 1 - def.castSeconds / def.waveSeconds)) : 0);

/** Phase 40: the variants of the assumptions' raid that apply at their party size (someone else must be there). */
export const requiredVariantsFor = (a: Pick<BestSetupAssumptions, 'raid' | 'partySize'>): RequiredVariantDef[] => (
  REQUIRED_VARIANTS[a.raid ?? 'fractured-archive'] ?? []).filter((v) => Math.floor(a.partySize) > v.headcount);

/** Phase 40: the preset's owned pieces (an unowned piece is left out). */
export const variantPieces = (
  def: RequiredVariantDef,
  notOwned: string[] = [],
): Partial<Record<keyof PlayerEquipment, EquipmentPiece>> => {
  let eq: Partial<Record<keyof PlayerEquipment, EquipmentPiece | null>>;
  try {
    eq = resolvePresetEquipment(def.preset);
  } catch {
    return {};
  }
  const out: Partial<Record<keyof PlayerEquipment, EquipmentPiece>> = {};
  (Object.keys(eq) as (keyof PlayerEquipment)[]).forEach((slot) => {
    const p = eq[slot];
    if (p && isOwned(p.name, notOwned)) out[slot] = p;
  });
  return out;
};

/**
 * Phase 40: the cheapest switch reaching `minMagicAttack` from these pieces, scored WORN: the loadout the freezer wears
 * on the encounter (`base`, the kit's choice there) with the switch's slots replaced (review: the switch's own bonus
 * overstated it; Inquisitor's + Obligator under Kodai + Ancestral top + ward is only 64). A two-handed weapon drops the
 * shield; a shield under a kept two-handed weapon is not a switch. Order: the fewest items the kit doesn't already carry
 * (`inKit`), then the most preferred slots (`prefer`), then the most magic attack. Null when even all of them fall
 * short. Display only (the freezer's own inventory; not charged to your kit).
 */
export const freezerSwitch = (
  def: Pick<RequiredVariantDef, 'minMagicAttack' | 'prefer'>,
  pieces: Partial<Record<keyof PlayerEquipment, EquipmentPiece>>,
  inKit: (id: number) => boolean = () => false,
  base: Partial<Record<keyof PlayerEquipment, EquipmentPiece | null>> = {},
): { slots: (keyof PlayerEquipment)[], magic: number } | null => {
  const slots = def.prefer.filter((s) => pieces[s]);
  const magicOf = (p: EquipmentPiece | null | undefined) => p?.offensive?.magic ?? 0;
  const baseSlots = Object.keys(base) as (keyof PlayerEquipment)[];
  let best: { slots: (keyof PlayerEquipment)[], magic: number, extra: number, rank: number } | null = null;
  for (let mask = 1; mask < (1 << slots.length); mask++) {
    const set = slots.filter((_, i) => mask & (1 << i));
    const worn: Partial<Record<keyof PlayerEquipment, EquipmentPiece | null | undefined>> = { ...base };
    set.forEach((s) => { worn[s] = pieces[s]; });
    if (worn.weapon?.isTwoHanded) {
      if (set.includes('shield')) continue;
      worn.shield = null;
    }
    const magic = Array.from(new Set([...baseSlots, ...set])).reduce((t, s) => t + magicOf(worn[s]), 0);
    if (magic < def.minMagicAttack) continue;
    const extra = set.filter((s) => !inKit(pieces[s]!.id)).length;
    const rank = set.reduce((t, s) => t + slots.indexOf(s), 0) + 100 * set.length;
    if (!best || extra < best.extra || (extra === best.extra && (rank < best.rank || (rank === best.rank && magic > best.magic)))) {
      best = {
        slots: set, magic, extra, rank,
      };
    }
  }
  return best ? { slots: best.slots, magic: best.magic } : null;
};

/** Phase 40: the time variants of the assumptions (kit-independent: only the party size and the def). */
export const timeVariantsFor = (
  defs: RequiredVariantDef[],
  a: Pick<BestSetupAssumptions, 'partySize'>,
): TimeVariant[] => defs.map((def) => ({
  id: def.id,
  encounter: def.encounter,
  rowKeys: [...def.rowKeys],
  share: def.share,
  headcount: def.headcount,
  partySize: Math.floor(a.partySize),
  keep: variantKeep(def),
}));

/** Phase 40: the time assumptions with these variants (unchanged when there are none). */
export const withTimeVariants = (t: RaidTimeAssumptions, variants: TimeVariant[]): RaidTimeAssumptions => (variants.length
  ? { ...t, variants } : t);

/** Phase 40: the time variants of a plan's result (its `variants`), for re-timing the plan outside the planner. */
export const timeVariantsOfPlan = (
  variants: { id: string }[] | undefined,
  a: Pick<BestSetupAssumptions, 'raid' | 'partySize'>,
): TimeVariant[] => timeVariantsFor((variants ?? []).flatMap((v) => (REQUIRED_VARIANTS[a.raid ?? 'fractured-archive'] ?? [])
  .filter((d) => d.id === v.id)), a);
