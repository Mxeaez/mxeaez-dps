import { PlayerEquipment } from '@/types/Player';
import Potion from '@/enums/Potion';
import {
  CoxInputs, RaidId, ToaInputs, TobInputs,
} from '@/lib/raids/types';

/**
 * Named setups for the "Best setup" view (phase 8, /best-setup). Plain data — edit freely.
 *
 * HOW TO ADD / EDIT A PRESET
 * - Copy an entry below and change `name` (shown in the table; must be unique) and the items.
 * - Items are referenced by their exact name in cdn/json/equipment.json (the name shown in the calculator's item
 *   search). If an item has several versions (e.g. "Charged" / "Uncharged", "Restored", "Unpoisoned"), the plain one is
 *   picked automatically (see `ITEM_VERSION_PREFERENCE` in bestSetup.ts); to force one, write `['Name', 'Version']`.
 *   `src/tests/lib/fracturedArchive/Presets.test.ts` fails if a name doesn't exist, so run `yarn test` after editing.
 * - Leave a slot out to keep it empty. Two-handed weapons must not have a `shield`.
 * - `group` picks the potion and prayer from the assumptions box (melee: Piety or Zeal; ranged: Rigour; magic: Augury).
 * - `styles`: combat style names to try (as in the calculator's style list, e.g. 'Chop', 'Jab', 'Rapid'); every style
 *   with that name is tried and the best one per boss is shown. Leave it out to try every non-defensive style.
 * - `spells`: for autocasting presets, spell names to try (the best one per boss is shown).
 * - `note`: optional short text shown under the name.
 *
 * Substitutions vs the user's list (ROADMAP.md, "Presets for phase 8"), all items checked to exist in the data:
 * - Melee neck: Amulet of rancour (BiS) instead of Amulet of torture; swap the name to use torture.
 * - Plain variants used where a cosmetic/upgraded one exists: "Amulet of torture" not "(or)", "Torva full helm"
 *   (Restored) not Sanguine, "Oathplate chest" not Radiant, "Scythe of Vitur" (Charged) not Holy/Sanguine,
 *   "Dizana's quiver" (Charged) not Blessed, "Elidinis' ward (f)" (the BiS shield for the Kodai preset; "(or)" is
 *   cosmetic). Masori uses the "(f)" pieces (fortified, BiS) as asked.
 * - Shadow / Zorya's tome / Twisted bow / Scythe / Obligator / Ascension crossbows are two-handed → no shield.
 * - Boots: "Avernic treads (max)" in every preset (best in slot for all three styles). Alternatives if you don't have
 *   them: 'Primordial boots' (melee), 'Pegasian boots' (ranged), 'Eternal boots' (magic).
 * - Added "Ancestral + Kodai (best Surge)" so the elemental weaknesses and fragment toggles have a spell to act on.
 * - Phase 25: ranged neck Necklace of rupture (was Necklace of anguish; rupture is the Maggot King upgrade, +5 ranged /
 *   +3 ranged str / +1 prayer, no other effect) and the Twisted bow fires Seeking dragon arrows (were dragon arrows:
 *   +20 ranged attack with bows, minimum hit 3 on an accurate hit). Both are better in every case; swap back to
 *   'Necklace of anguish' / ['Dragon arrow', 'Unpoisoned'] if you don't have them.
 */

export type StyleGroup = 'melee' | 'ranged' | 'magic';

/** Item name, or [name, version] to pick a specific version. */
export type ItemRef = string | [name: string, version: string];

export interface PresetDef {
  name: string;
  group: StyleGroup;
  equipment: Partial<Record<keyof PlayerEquipment, ItemRef>>;
  styles?: string[];
  spells?: string[];
  note?: string;
}

// Shared slot fillers (best in slot per style)
export const MELEE_FILL = {
  cape: 'Infernal cape',
  neck: 'Amulet of rancour',
  hands: 'Ferocious gloves',
  feet: 'Avernic treads (max)',
  ring: 'Ultor ring',
  ammo: "Rada's blessing 4",
};

export const INQUISITOR = {
  head: "Inquisitor's great helm",
  body: "Inquisitor's hauberk",
  legs: "Inquisitor's plateskirt",
};

export const TORVA = {
  head: 'Torva full helm',
  body: 'Torva platebody',
  legs: 'Torva platelegs',
};

export const MASORI_F = {
  head: 'Masori mask (f)',
  body: 'Masori body (f)',
  legs: 'Masori chaps (f)',
  cape: "Dizana's quiver",
  neck: 'Necklace of rupture',
  hands: 'Zaryte vambraces',
  feet: 'Avernic treads (max)',
  ring: 'Venator ring',
};

export const ANCESTRAL = {
  head: 'Ancestral hat',
  body: 'Ancestral robe top',
  legs: 'Ancestral robe bottom',
  cape: 'Imbued Guthix cape',
  neck: 'Occult necklace',
  hands: 'Confliction gauntlets',
  feet: 'Avernic treads (max)',
  ring: 'Magus ring',
  ammo: "Rada's blessing 4",
};

export const PRESETS: PresetDef[] = [
  // --- melee ---
  {
    name: "Inquisitor's mace (full crush)",
    group: 'melee',
    equipment: {
      ...MELEE_FILL, ...INQUISITOR, weapon: "Inquisitor's mace", shield: 'Avernic defender',
    },
    styles: ['Pound', 'Pummel'],
  },
  {
    name: "Inquisitor's + Scythe (slash)",
    group: 'melee',
    equipment: { ...MELEE_FILL, ...INQUISITOR, weapon: 'Scythe of Vitur' },
    styles: ['Reap', 'Chop'],
  },
  {
    name: "Inquisitor's + Scythe (crush)",
    group: 'melee',
    equipment: { ...MELEE_FILL, ...INQUISITOR, weapon: 'Scythe of Vitur' },
    styles: ['Jab'],
  },
  {
    name: 'Torva + Scythe (slash)',
    group: 'melee',
    equipment: { ...MELEE_FILL, ...TORVA, weapon: 'Scythe of Vitur' },
    styles: ['Reap', 'Chop'],
  },
  {
    name: 'Torva helm + Oathplate + Scythe (slash)',
    group: 'melee',
    equipment: {
      ...MELEE_FILL,
      head: 'Torva full helm',
      body: 'Oathplate chest',
      legs: 'Oathplate legs',
      weapon: 'Scythe of Vitur',
    },
    styles: ['Reap', 'Chop'],
  },
  {
    name: "Inquisitor's + Obligator",
    group: 'melee',
    equipment: { ...MELEE_FILL, ...INQUISITOR, weapon: 'Obligator' },
    styles: ['Thrust', 'Smash'],
  },
  {
    name: 'Torva + Obligator',
    group: 'melee',
    equipment: { ...MELEE_FILL, ...TORVA, weapon: 'Obligator' },
    styles: ['Thrust', 'Smash'],
  },

  // --- ranged ---
  {
    name: 'Twisted bow (Masori)',
    group: 'ranged',
    equipment: { ...MASORI_F, weapon: 'Twisted bow', ammo: 'Seeking dragon arrow' },
    styles: ['Accurate', 'Rapid'],
  },
  {
    name: 'Ascension crossbows + diamond (e) (Masori)',
    group: 'ranged',
    equipment: { ...MASORI_F, weapon: 'Ascension crossbows', ammo: 'Diamond ascension bolts (e)' },
    styles: ['Accurate', 'Rapid'],
  },
  {
    name: 'Ascension crossbows + onyx (e) (Masori)',
    group: 'ranged',
    equipment: { ...MASORI_F, weapon: 'Ascension crossbows', ammo: 'Onyx ascension bolts (e)' },
    styles: ['Accurate', 'Rapid'],
  },

  // --- magic ---
  {
    name: "Tumeken's shadow (Ancestral)",
    group: 'magic',
    equipment: { ...ANCESTRAL, weapon: "Tumeken's shadow" },
  },
  {
    name: "Zorya's tome (Ancestral)",
    group: 'magic',
    equipment: { ...ANCESTRAL, weapon: "Zorya's tome" },
    note: 'Spec and empowered follow-up attacks not modelled',
  },
  {
    name: 'Kodai + best Surge (Ancestral)',
    group: 'magic',
    equipment: { ...ANCESTRAL, weapon: 'Kodai wand', shield: "Elidinis' ward (f)" },
    styles: ['Spell'],
    spells: ['Fire Surge', 'Water Surge', 'Earth Surge', 'Wind Surge'],
  },
];

/**
 * Player assumptions for every preset (editable in the view's "Assumptions" box). All skills are 99.
 * Potions: CoX-only (Overload, super ranging/magic) and ToA-only (Smelling salts) boosts are excluded by default since
 * they don't work in the Fractured Archive.
 */
export interface BestSetupAssumptions {
  potions: Record<StyleGroup, Potion>;
  /** Melee presets use Zeal (Fractured Archive prayer) instead of Piety. */
  useZeal: boolean;
  /** Magic presets have all four elemental fragments unlocked (+2 base max hit for elemental spells). */
  elementalFragments: boolean;
  /**
   * Party size (2-8): the team spec planner's party (phase 14; default 6) and the HP scaling (currently an identity
   * table, unverified, so it doesn't change HP yet).
   */
  partySize: number;
  /** Phase 14: the user's own drain specs (the "Solo" drain state; specs.ts / teamSpecs.ts). */
  mySpecs: MySpecs;
  /** Phase 14: the team's spec carriers (the "Team" drain state). */
  team: TeamSpecAssumptions;
  /**
   * Fight length in seconds for the spec-energy budget. Phase 23: undefined (the default) = computed per boss / phase
   * from its undrained time to kill (`autoFightSeconds` in bestSetup.ts); Plan / the time model set it per encounter.
   */
  fightSeconds?: number;
  /** P(floor) at or above which a drain plan counts as reaching the floor (default 0.95). */
  floorThreshold: number;
  /**
   * Phase 17 (Plan tab): style groups whose potion isn't brought (0 in the supplies), evaluated without a potion boost.
   * Not used by the spec / drain model. Undefined everywhere else.
   */
  withoutPotion?: StyleGroup[];
  /**
   * Phase 18: the raid these assumptions are for (undefined = the Fractured Archive). Selects the presets, search pool
   * and time model (src/lib/raids); part of every cache key since it is in the assumptions.
   */
  raid?: RaidId;
  /** Phase 18: Tombs of Amascut raid / path levels (ToA targets only; party size is `partySize`). */
  toa?: ToaInputs;
  /** Phase 19: Chambers of Xeric inputs (Challenge Mode; party size is `partySize`). */
  cox?: CoxInputs;
  /** Phase 20: Theatre of Blood inputs (mode; party size is `partySize`). */
  tob?: TobInputs;
  /**
   * Phase 18: players assumed to deal the user's DPS in every time display (Search TTK, Routes / Encounters, Plan,
   * Summary). Undefined = the raid's default (`teamDpsMultiplier` in src/lib/raids/base.ts: the party size where boss hp
   * scales with it, else 1). Ocellus P2 stays a fixed wall-clock length.
   */
  teamDpsMultiplier?: number;
}

/** Drain weapons the user carries (phase 14). */
export interface MySpecs {
  elderMaul: boolean;
  dwh: boolean;
  bgs: boolean;
  tonalztics: boolean;
  /** Eye of Ayak specs (0 = none). */
  ayak: number;
  lightbearer: boolean;
  /** What the spec energy goes to first when it doesn't cover everything. */
  priority: 'defence' | 'ayak';
  /**
   * Phase 29 (the Plan's spec choice): only as many of the `ayak` specs as reach P(magic def 0) ≥ the threshold, per
   * boss (teamSpecs.ts `ayakSpecsToThreshold`). Undefined everywhere else.
   */
  ayakAuto?: boolean;
}

/** Team spec carriers (phase 14): carriers per weapon, and whether that weapon's carriers wear Lightbearer. */
export interface TeamSpecAssumptions {
  carriers: { elderMaul: number, dwh: number, bgs: number, tonalztics: number, ayak: number };
  /**
   * Phase 29 review: true = "Team carriers: Set manually" (the Plan tab's Team drains use `carriers`); false / undefined
   * = the Plan tab's planner picks the carriers. Search / Summary always use `carriers`.
   */
  manual?: boolean;
  lightbearer: { elderMaul: boolean, dwh: boolean, bgs: boolean, tonalztics: boolean, ayak: boolean };
}

export const DEFAULT_ASSUMPTIONS: BestSetupAssumptions = {
  potions: {
    melee: Potion.SUPER_COMBAT,
    ranged: Potion.RANGING,
    magic: Potion.SATURATED_HEART,
  },
  useZeal: false,
  elementalFragments: true,
  partySize: 6,
  mySpecs: {
    elderMaul: true, dwh: false, bgs: false, tonalztics: false, ayak: 2, lightbearer: false, priority: 'defence',
  },
  team: {
    carriers: {
      elderMaul: 2, dwh: 0, bgs: 0, tonalztics: 2, ayak: 1,
    },
    lightbearer: {
      elderMaul: false, dwh: false, bgs: false, tonalztics: false, ayak: false,
    },
  },
  floorThreshold: 0.95,
};

/**
 * Phase 23: the single "carriers use Lightbearer" toggle of the Advanced box — sets every carrier weapon's Lightbearer
 * flag at once (the per-weapon flags stay in the data, for the planners and old saved assumptions).
 */
export const withCarrierLightbearer = (team: TeamSpecAssumptions, on: boolean): TeamSpecAssumptions => ({
  ...team,
  lightbearer: Object.fromEntries(Object.keys(team.lightbearer).map((k) => [k, on])) as TeamSpecAssumptions['lightbearer'],
});

/** Phase 23: whether every carrier wears Lightbearer (the Advanced box's toggle is ticked only then). */
export const carriersUseLightbearer = (team: TeamSpecAssumptions): boolean => Object.values(team.lightbearer).every(Boolean);
