import { PlayerEquipment } from '@/types/Player';
import { ItemRef, StyleGroup } from '@/lib/fracturedArchive/presets';

/**
 * Candidate pool for the "Search" tab of /best-setup (phase 9, src/lib/fracturedArchive/search.ts). Plain data — edit
 * freely; `src/tests/lib/fracturedArchive/Search.test.ts` checks that every name resolves, sits in the right slot, and
 * that the two-handed / ammo constraints hold.
 *
 * Names are exact `cdn/json/equipment.json` names (`['Name', 'Version']` forces a version; otherwise the version is
 * picked like presets.ts, see ITEM_VERSION_PREFERENCE in bestSetup.ts). End-game items only.
 *
 * Structure per style group:
 * - `weapons`: every weapon is searched (each with each of its `ammo` options, and each combat style of the group's
 *   type, and each applicable `spells` entry for autocasting weapons). Two-handedness comes from the item data
 *   (`isTwoHanded`): two-handed weapons never get a shield. Ammo: weapons that fire ammo list it in `ammo` (the
 *   test checks the calculator accepts it); weapons without `ammo` use the group's `ammo` slot pool (Rada's blessing)
 *   and the blowpipe takes its darts via `dart`.
 * - `slots`: the per-slot candidates for the coordinate ascent. Before searching, items whose offensive stats for the
 *   weapon are dominated by another item of the same slot are dropped (rule in search.ts, `prunePool`), unless they
 *   are marked `keep` (they have a special effect the stats don't show; `keep: [weapon names]` = only with those).
 * - `sets`: full sets used as extra seeds (a set effect only pays off when all pieces are worn, which a one-slot-at-a-
 *   time ascent can't discover). `weapons` restricts a seed to the weapons it matters for.
 * - `weaponExtras`: extra slot candidates only for particular weapons (the Eclipse atlatl scales with melee strength).
 *
 * Spells: `spells` lists what a weapon may autocast; search.ts keeps, per boss, Fire Surge (highest base) + the surge
 * of the boss's elemental weakness, demonbane spells only against demons, and Ice Barrage unless the boss is immune
 * (Archive Guardian).
 *
 * Phase 25: every item that beats a pool item on stats or has an effect in the upstream code is either here or in
 * POOL_EXCLUDED with a reason (src/lib/fracturedArchive/poolAudit.ts; PoolAudit.test.ts, scripts/auditPool.mjs).
 *
 * Left out on purpose (task brief, phase 9): Dragon hunter lance (no dragons here), Justiciar / Sunfire fanatic
 * (no offensive effect), Lightbearer (spec-only), "Ruby ascension bolts (e)" (doesn't exist in the data — only diamond
 * and onyx), Ava's assembler / Tormented bracelet / Amulet of torture / blood fury / Fire cape / Primordial /
 * Pegasian / Eternal boots are listed but are always pruned as dominated (Avernic treads (max) etc. beat them).
 */

export type SearchSlot = keyof PlayerEquipment;

export interface CandidateItem {
  ref: ItemRef;
  /** Never prune as dominated: the item has an effect beyond its stats (true = always; names = only with these weapons). */
  keep?: true | string[];
  /** Why it is in the pool / what the effect is. */
  note?: string;
}

export interface WeaponCandidate {
  weapon: ItemRef;
  /** Ammo options (each is searched as its own variant). Omit for weapons that don't fire ammo. */
  ammo?: ItemRef[];
  /** Blowpipe dart (stored in the weapon's itemVars like the calculator's dart picker does). */
  dart?: ItemRef;
  /** Spells to try when autocasting (standard / ancient / arceuus names from spells.json). */
  spells?: string[];
  note?: string;
}

export interface ArmourSet {
  name: string;
  pieces: Partial<Record<SearchSlot, ItemRef>>;
  /** Only seed with these weapons (by weapon name). */
  weapons?: string[];
}

export interface StylePool {
  group: StyleGroup;
  weapons: WeaponCandidate[];
  slots: Partial<Record<SearchSlot, CandidateItem[]>>;
  sets: ArmourSet[];
  weaponExtras?: { weapons: string[], slots: Partial<Record<SearchSlot, CandidateItem[]>> }[];
}

/** Slots the ascent iterates over (weapon and ammo are part of the weapon variant; ammo is searched only when free). */
export const SEARCH_SLOTS: SearchSlot[] = ['head', 'body', 'legs', 'cape', 'neck', 'hands', 'feet', 'ring', 'shield', 'ammo'];

const SURGES = ['Fire Surge', 'Water Surge', 'Earth Surge', 'Wind Surge'];
const DEMONBANE = ['Dark Demonbane'];
const ANCIENT = ['Ice Barrage'];

const DRAGON_ARROW: ItemRef = ['Dragon arrow', 'Unpoisoned'];
/**
 * Phase 25: "+20 ranged attack bonus over their regular variants, as well as increasing the player's minimum hit from
 * 1 to 3 upon a successful hit" (wiki, Seeking dragon arrow). Upstream models both (bow_t60 ammo list, min-hit 3 on
 * accurate hits in PlayerVsNPCCalc). Dragon arrows stay as a second option (cheaper; never better).
 */
const SEEKING_DRAGON_ARROW: ItemRef = 'Seeking dragon arrow';
const BOW_ARROWS: ItemRef[] = [SEEKING_DRAGON_ARROW, DRAGON_ARROW];

const VOID_BODY: Partial<Record<SearchSlot, ItemRef>> = {
  body: ['Elite void top', 'Normal'],
  legs: ['Elite void robe', 'Normal'],
  hands: ['Void knight gloves', 'Normal'],
};
const VOID_CANDIDATES = {
  body: { ref: ['Elite void top', 'Normal'], keep: true, note: 'Void set effect' } as CandidateItem,
  legs: { ref: ['Elite void robe', 'Normal'], keep: true, note: 'Void set effect' } as CandidateItem,
  hands: { ref: ['Void knight gloves', 'Normal'], keep: true, note: 'Void set effect' } as CandidateItem,
};

const MELEE: StylePool = {
  group: 'melee',
  weapons: [
    { weapon: 'Scythe of Vitur' },
    { weapon: 'Obligator', note: 'Fractured Archive reward; thrust = best of 2-4 damage rolls (phase 7b model)' },
    { weapon: "Inquisitor's mace" },
    { weapon: 'Soulreaper axe' },
    { weapon: "Osmumten's fang" },
    { weapon: 'Emberlight', note: 'demonbane' },
    { weapon: 'Arclight', note: 'demonbane' },
    { weapon: 'Burning claws', note: 'demonbane' },
    { weapon: 'Voidwaker' },
    { weapon: 'Abyssal bludgeon' },
    { weapon: 'Noxious halberd', note: 'halberd: reaches the flying Archive Guardian' },
    { weapon: 'Elder maul' },
    { weapon: 'Dual macuahuitl', note: 'Blood Moon set effect' },
    { weapon: 'Ghrazi rapier', note: 'stab' },
  ],
  slots: {
    head: [
      { ref: 'Torva full helm' },
      { ref: "Inquisitor's great helm", keep: true, note: 'Inquisitor crush bonus' },
      { ref: 'Oathplate helm' },
      { ref: 'Neitiznot faceguard' },
      { ref: 'Blood Moon helm', keep: ['Dual macuahuitl'], note: 'Blood Moon set effect' },
      { ref: ['Void melee helm', 'Normal'], keep: true, note: 'Void set effect' },
    ],
    body: [
      { ref: 'Torva platebody' },
      { ref: "Inquisitor's hauberk", keep: true, note: 'Inquisitor crush bonus' },
      { ref: 'Oathplate chest' },
      { ref: 'Bandos chestplate' },
      { ref: 'Blood Moon chestplate', keep: ['Dual macuahuitl'], note: 'Blood Moon set effect' },
      VOID_CANDIDATES.body,
    ],
    legs: [
      { ref: 'Torva platelegs' },
      { ref: "Inquisitor's plateskirt", keep: true, note: 'Inquisitor crush bonus' },
      { ref: 'Oathplate legs' },
      { ref: 'Bandos tassets' },
      { ref: 'Blood Moon tassets', keep: ['Dual macuahuitl'], note: 'Blood Moon set effect' },
      VOID_CANDIDATES.legs,
    ],
    cape: [{ ref: 'Infernal cape' }, { ref: 'Fire cape' }],
    neck: [{ ref: 'Amulet of rancour' }, { ref: 'Amulet of torture' }, { ref: 'Amulet of blood fury' }],
    hands: [{ ref: 'Ferocious gloves' }, VOID_CANDIDATES.hands],
    feet: [{ ref: 'Avernic treads (max)' }, { ref: 'Primordial boots' }],
    ring: [{ ref: 'Ultor ring' }, { ref: 'Bellator ring' }],
    shield: [{ ref: 'Avernic defender' }],
    ammo: [{ ref: "Rada's blessing 4" }],
  },
  sets: [
    { name: "Inquisitor's", pieces: { head: "Inquisitor's great helm", body: "Inquisitor's hauberk", legs: "Inquisitor's plateskirt" } },
    { name: 'Torva', pieces: { head: 'Torva full helm', body: 'Torva platebody', legs: 'Torva platelegs' } },
    { name: 'Oathplate', pieces: { head: 'Oathplate helm', body: 'Oathplate chest', legs: 'Oathplate legs' } },
    {
      name: 'Blood Moon',
      pieces: { head: 'Blood Moon helm', body: 'Blood Moon chestplate', legs: 'Blood Moon tassets' },
      weapons: ['Dual macuahuitl'],
    },
    { name: 'Void (melee)', pieces: { head: ['Void melee helm', 'Normal'], ...VOID_BODY } },
  ],
};

const RANGED: StylePool = {
  group: 'ranged',
  weapons: [
    { weapon: 'Twisted bow', ammo: BOW_ARROWS },
    {
      weapon: 'Ascension crossbows',
      ammo: ['Diamond ascension bolts (e)', 'Onyx ascension bolts (e)'],
      note: 'Fractured Archive reward',
    },
    { weapon: 'Zaryte crossbow', ammo: ['Ruby dragon bolts (e)', 'Diamond dragon bolts (e)', 'Onyx dragon bolts (e)'] },
    { weapon: 'Bow of Faerdhinen (c)', note: 'crystal armour set effect' },
    { weapon: ['Venator bow', 'Charged'], ammo: BOW_ARROWS },
    { weapon: 'Eclipse atlatl', ammo: ['Atlatl dart'], note: 'scales with melee strength' },
    { weapon: 'Scorching bow', ammo: BOW_ARROWS, note: 'demonbane' },
    { weapon: ['Toxic blowpipe', 'Charged'], dart: ['Dragon dart', 'Unpoisoned'] },
    { weapon: 'Heavy ballista', ammo: [['Dragon javelin', 'Unpoisoned']] },
  ],
  slots: {
    head: [
      { ref: 'Masori mask (f)' },
      { ref: ['Crystal helm', 'Active'], keep: ['Bow of Faerdhinen (c)'], note: 'crystal + Bowfa' },
      { ref: 'Eclipse Moon helm' },
      { ref: ['Void ranger helm', 'Normal'], keep: true, note: 'Void set effect' },
    ],
    body: [
      { ref: 'Masori body (f)' },
      { ref: ['Crystal body', 'Active'], keep: ['Bow of Faerdhinen (c)'], note: 'crystal + Bowfa' },
      { ref: 'Eclipse Moon chestplate' },
      VOID_CANDIDATES.body,
    ],
    legs: [
      { ref: 'Masori chaps (f)' },
      { ref: ['Crystal legs', 'Active'], keep: ['Bow of Faerdhinen (c)'], note: 'crystal + Bowfa' },
      { ref: 'Eclipse Moon tassets' },
      VOID_CANDIDATES.legs,
    ],
    cape: [{ ref: "Dizana's quiver", keep: true, note: '+10 ranged / +1 ranged str with fired ammo' }, { ref: "Ava's assembler" }],
    // phase 25: Necklace of rupture (Maggot King upgrade of anguish: +5 ranged, +3 ranged str); anguish kept
    neck: [{ ref: 'Necklace of rupture' }, { ref: 'Necklace of anguish' }],
    hands: [{ ref: 'Zaryte vambraces' }, VOID_CANDIDATES.hands],
    feet: [{ ref: 'Avernic treads (max)' }, { ref: 'Pegasian boots' }],
    ring: [{ ref: 'Venator ring' }],
    shield: [{ ref: 'Twisted buckler' }],
    ammo: [{ ref: "Rada's blessing 4" }],
  },
  weaponExtras: [
    {
      // the atlatl uses Strength and the melee strength bonus for its max hit (PlayerVsNPCCalc)
      weapons: ['Eclipse atlatl'],
      slots: {
        cape: [{ ref: 'Infernal cape' }],
        neck: [{ ref: 'Amulet of rancour' }],
        hands: [{ ref: 'Ferocious gloves' }],
        ring: [{ ref: 'Ultor ring' }],
      },
    },
  ],
  sets: [
    { name: 'Masori (f)', pieces: { head: 'Masori mask (f)', body: 'Masori body (f)', legs: 'Masori chaps (f)' } },
    {
      name: 'Crystal',
      pieces: { head: ['Crystal helm', 'Active'], body: ['Crystal body', 'Active'], legs: ['Crystal legs', 'Active'] },
      weapons: ['Bow of Faerdhinen (c)'],
    },
    {
      name: 'Eclipse Moon',
      pieces: { head: 'Eclipse Moon helm', body: 'Eclipse Moon chestplate', legs: 'Eclipse Moon tassets' },
      weapons: ['Eclipse atlatl'],
    },
    { name: 'Elite void (ranged)', pieces: { head: ['Void ranger helm', 'Normal'], ...VOID_BODY } },
  ],
};

const MAGIC: StylePool = {
  group: 'magic',
  weapons: [
    { weapon: "Tumeken's shadow" },
    { weapon: "Zorya's tome", note: 'Fractured Archive reward; spec/follow-ups not modelled' },
    { weapon: 'Harmonised Nightmare staff', spells: [...SURGES, ...DEMONBANE] },
    { weapon: 'Kodai wand', spells: [...SURGES, ...ANCIENT, ...DEMONBANE] },
    { weapon: 'Sanguinesti staff' },
    { weapon: 'Purging staff', spells: [...SURGES, ...DEMONBANE], note: 'doubles demonbane spell bonus' },
    { weapon: 'Accursed sceptre' },
    { weapon: 'Warped sceptre' },
  ],
  slots: {
    head: [
      { ref: 'Ancestral hat' },
      { ref: 'Virtus mask', keep: ['Kodai wand'], note: '+3% with ancient spells' },
      { ref: 'Blue Moon helm' },
      { ref: ['Void mage helm', 'Normal'], keep: true, note: 'Void set effect' },
    ],
    body: [
      { ref: 'Ancestral robe top' },
      { ref: 'Virtus robe top', keep: ['Kodai wand'], note: '+3% with ancient spells' },
      { ref: 'Blue Moon chestplate' },
      VOID_CANDIDATES.body,
    ],
    legs: [
      { ref: 'Ancestral robe bottom' },
      { ref: 'Virtus robe bottom', keep: ['Kodai wand'], note: '+3% with ancient spells' },
      { ref: 'Blue Moon tassets' },
      VOID_CANDIDATES.legs,
    ],
    cape: [{ ref: 'Imbued Guthix cape' }],
    neck: [
      { ref: 'Occult necklace' },
      {
        ref: 'Elemental amulet',
        keep: ['Harmonised Nightmare staff', 'Kodai wand', 'Purging staff'],
        note: 'phase 25: +2 base max hit for elemental spells (upstream; before magic damage)',
      },
    ],
    hands: [
      { ref: 'Confliction gauntlets', keep: true, note: 'second accuracy roll with one-handed magic weapons' },
      { ref: 'Tormented bracelet' },
      VOID_CANDIDATES.hands,
    ],
    feet: [{ ref: 'Avernic treads (max)' }, { ref: 'Eternal boots' }],
    ring: [{ ref: 'Magus ring' }],
    shield: [
      { ref: "Elidinis' ward (f)" },
      { ref: ['Tome of Fire', 'Charged'], keep: true, note: '+10% fire spell damage' },
      { ref: ['Tome of Water', 'Charged'], keep: true, note: '+10% water spell damage' },
      { ref: ['Tome of Earth', 'Charged'], keep: true, note: '+10% earth spell damage' },
    ],
    ammo: [{ ref: "Rada's blessing 4" }],
  },
  sets: [
    { name: 'Ancestral', pieces: { head: 'Ancestral hat', body: 'Ancestral robe top', legs: 'Ancestral robe bottom' } },
    {
      name: 'Virtus',
      pieces: { head: 'Virtus mask', body: 'Virtus robe top', legs: 'Virtus robe bottom' },
      weapons: ['Kodai wand'],
    },
    // The calculator does not model the Blue Moon set effect (it needs the Blue Moon spear); seeded anyway.
    { name: 'Blue Moon', pieces: { head: 'Blue Moon helm', body: 'Blue Moon chestplate', legs: 'Blue Moon tassets' } },
    { name: 'Elite void (magic)', pieces: { head: ['Void mage helm', 'Normal'], ...VOID_BODY } },
  ],
};

export const SEARCH_POOL: Record<StyleGroup, StylePool> = {
  melee: MELEE,
  ranged: RANGED,
  magic: MAGIC,
};

export const refName = (ref: ItemRef): string => (typeof ref === 'string' ? ref : ref[0]);
