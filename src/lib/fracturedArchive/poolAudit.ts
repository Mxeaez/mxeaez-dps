import { EquipmentPiece } from '@/types/Player';
import {
  AmmoApplicability, ammoApplicability, availableEquipment, getCanonicalItemId,
} from '@/lib/Equipment';
import { ItemRef, StyleGroup } from '@/lib/fracturedArchive/presets';
import { resolveItem } from '@/lib/fracturedArchive/loadout';
import { SEARCH_SLOTS, StylePool, refName } from '@/lib/fracturedArchive/searchCandidates';
import { RAID_BASES } from '@/lib/raids/base';

/**
 * Phase 25: pool audit. Finds items in cdn/json/equipment.json that the best-setup search should probably know about
 * but that are in no search pool, no preset and no spec loadout of any raid:
 * 1. **Dominates the pool**: in some raid's pool for some style group and slot, the item's offensive stats are >= a
 *    pool item that nothing else in the pool beats (strictly better in at least one). Stats per group: melee
 *    (stab | slash | crush) + strength, one attack type at a time; ranged attack + ranged strength; magic attack +
 *    magic damage. Fired ammo is compared per pool weapon with the ammo that weapon accepts (`ammoApplicability`
 *    INCLUDED). Weapons are not compared by stats (powered staves, bows and specs differ by built-in max hits and
 *    effects the stats don't show; a stat rule flagged ~60 irrelevant weapons) — new weapons are caught by rule 2.
 * 2. **Has an upstream effect**: its exact name appears as a string in the upstream calculator code
 *    (`effectNames`, collected by the caller from PlayerVsNPCCalc.ts / BaseCalc.ts / Equipment.ts — this module does
 *    no file I/O so it stays bundle-safe).
 * Items in `POOL_EXCLUDED` (with a reason) are skipped, and so are items whose canonical id (EquipmentAliases, e.g.
 * "(or)" / locked / Deadman copies) is a pool item's. Used by src/tests/lib/fracturedArchive/PoolAudit.test.ts (must
 * find nothing) and scripts/auditPool.mjs (prints the report).
 */

export interface PoolExclusion {
  /** Exact item name(s), or a pattern over names. */
  match: string | string[] | RegExp;
  reason: string;
}

/**
 * Items deliberately not in any pool. Grouped by reason; edit freely (the audit test lists anything new that is
 * neither here nor in a pool).
 */
export const POOL_EXCLUDED: PoolExclusion[] = [
  // --- not available / not usable in the raids
  {
    match: /\((bh|Deadman Mode|deadman|Deadman|Last Man Standing)\)/,
    reason: 'Bounty Hunter / Deadman / LMS copies (not usable in raids)',
  },
  {
    match: ['Crystal blessing', 'Echo boots', "V's helm"],
    reason: 'Leagues-only items (Demonic Pacts League echo / relic items)',
  },
  {
    match: ['Wilderness champion amulet', 'Amulet of avarice', "Craw's bow", "Viggora's chainmace", 'Ursine chainmace',
      "Thammaron's sceptre (a)", 'Accursed sceptre (a)', 'Bracelet of ethereum'],
    reason: 'wilderness-only effects or items (revenant / wilderness bonuses do not apply in raids); the Accursed '
      + 'sceptre (a) only differs on its spec (the Accursed sceptre is in the pool and in the spec model)',
  },
  {
    match: ['Barbed arrow', 'Blunt arrow', 'Bullet arrow', 'Field arrow'],
    reason: 'Barbarian Assault ammunition (only usable in the minigame)',
  },
  { match: 'Castle wars bracelet', reason: 'Castle Wars only' },
  // --- effects that no raid boss triggers
  {
    match: ['Slayer helmet', 'Slayer helmet (i)', 'Black mask', 'Black mask (i)', 'Earmuffs', 'Facemask', 'Nose peg',
      'Reinforced goggles', 'Bracelet of slaughter', 'Expeditious bracelet', 'Bug lantern', 'Inoculation bracelet',
      'Leaf-bladed battleaxe', 'Leaf-bladed spear', 'Leaf-bladed sword', 'Broad arrows', 'Broad bolts',
      'Amethyst broad bolts', 'Seeking broad arrows', "Slayer's staff", "Slayer's staff (e)", 'Rod of Ivandis',
      'Black salamander', 'Orange salamander', 'Red salamander', 'Swamp lizard', 'Tecu salamander', 'Holy water'],
    reason: 'slayer-task / specific-monster items (slayer helm bonus on task only; leaf-bladed and broad ammo for '
      + 'turoths / kurasks; salamanders, Holy water, Rod of Ivandis): no raid boss qualifies',
  },
  {
    match: ['Blisterwood flail', 'Blisterwood sickle', 'Blisterwood stake', 'Ivandis flail', 'Silver sickle',
      'Silver sickle (b)', 'Emerald sickle (b)', 'Enchanted emerald sickle (b)', 'Ruby sickle (b)',
      'Enchanted ruby sickle (b)', 'Hallowed flail', 'Sunspear', "Efaritay's aid"],
    reason: 'vampyre weapons / ring (effects only against vampyres; no raid boss is one)',
  },
  {
    match: ['Silverlight', 'Darklight', 'Wolfbane', 'Barronite mace', 'Keris', 'Bone dagger', 'Bone mace',
      'Bone shortbow', 'Bone staff', 'Barrelchest anchor', 'Gadderhammer', 'Colossal blade', 'Excalibur'],
    reason: 'mid-tier weapons with niche effects (demonbane / werewolves / golems / kalphites / shades / size) that '
      + "the pool's weapons beat (Emberlight, Arclight, the keris partisans, ...)",
  },
  {
    match: ['Toktz-mej-tal', 'Toktz-xil-ak', 'Toktz-xil-ek', 'Tzhaar-ket-em', 'Tzhaar-ket-om', 'Tzhaar-ket-om (t)',
      'Obsidian helmet', 'Obsidian platebody', 'Obsidian platelegs', 'Berserker necklace', 'Berserker necklace (or)'],
    reason: 'obsidian set / berserker necklace: only with Tzhaar weapons, far below the end-game melee pool',
  },
  {
    match: /^((Ahrim|Dharok|Karil|Torag|Verac)'s |Amulet of the Damned$)/,
    reason: 'Barrows sets (set effects need the full set + weapon; below the end-game pool)',
  },
  // --- covered by a better / equivalent pool item
  {
    match: ['Void knight top', 'Void knight top (or)', 'Void knight robe', 'Void knight robe (or)', 'Void knight mace',
      'Justiciar faceguard', 'Justiciar chestguard', 'Justiciar legguards'],
    reason: 'regular Void (Elite void in the pool has the same set effect and better bonuses); Justiciar has no '
      + 'offensive effect',
  },
  {
    match: ['Salve amulet', 'Salve amulet (e)', 'Salve amulet(i)'],
    reason: 'lower Salve versions: Salve amulet(ei) is in the CoX / ToB pools (undead targets)',
  },
  {
    match: ["Blessed Dizana's quiver", "Dizana's max cape"],
    reason: "same bonuses and effect as Dizana's quiver (Charged), which is in the pool",
  },
  {
    match: /^((Guthix|Saradomin|Zamorak) (max )?cape|Imbued (Saradomin|Zamorak) cape|Imbued (Guthix|Saradomin|Zamorak|ancient) max cape|(Guthix|Saradomin|Zamorak) staff|Staff of Balance)$/,
    reason: 'god capes / max capes have the Imbued Guthix cape (in the pool) stats; their effect is on the god spells '
      + '(not in the spell lists)',
  },
  {
    match: ['Amulet of air', 'Amulet of water', 'Amulet of earth', 'Amulet of fire'],
    reason: 'single-element amulets: the Elemental amulet (in the magic pool) has the same stats and covers all four',
  },
  {
    match: 'Brimstone ring',
    reason: "25% chance of ignoring 10% magic Defence (about +2.5% accuracy) is worth less than the Magus ring's "
      + '+15 magic / +2% damage (in the pool)',
  },
  {
    match: ['Ring of recoil', 'Ring of suffering', 'Ring of suffering (i)', 'Phoenix necklace'],
    reason: 'recoil / heal effects (the calculator does not count recoil damage)',
  },
  {
    match: ['Chaos gauntlets', 'Twinflame staff', "Iban's staff", "Iban's staff (u)", 'Smoke battlestaff',
      'Mystic smoke staff', 'Starter staff', 'Staff of Light', 'Staff of the Dead', 'Toxic Staff of the Dead'],
    reason: 'bolt / blast / wave or standard-spell staves: Surges with the Harmonised staff / Kodai beat them',
  },
  {
    match: /^(Bronze|Iron|Steel|Black|Mithril|Adamant|Rune|Gilded) pickaxe$/,
    reason: 'pickaxes only matter on the CoX Guardians; the Dragon / Crystal pickaxe are in the CoX pool',
  },
  {
    match: ['Dragon claws', 'Rune claws', 'Armadyl godsword', 'Saradomin godsword', 'Zamorak godsword', 'Ancient godsword',
      'Dragon dagger', 'Dragon knife', 'Dragon longsword', 'Dragon mace', 'Dragon scimitar', 'Dragon sword',
      'Dragon 2h sword', 'Dragon halberd', 'Dragon spear', 'Dragon hasta', 'Zamorakian spear', 'Zamorakian hasta',
      'Dragon thrownaxe', 'Ancient mace', 'Granite hammer', 'Granite maul', 'Abyssal dagger', 'Abyssal whip',
      'Saradomin sword', "Saradomin's blessed sword", 'Brine sabre', 'Crystal halberd', 'Dark bow', 'Dragon crossbow',
      'Armadyl crossbow', 'Light ballista', 'Magic shortbow', 'Magic shortbow (i)', 'Magic longbow', 'Magic comp bow',
      'Seercull', 'Ogre bow', 'Comp ogre bow', 'Dorgeshuun crossbow', 'Rosewood blowpipe', 'Blessed axe',
      'Eldritch Nightmare staff', 'Volatile Nightmare staff', 'Crimson kisten', "Dinh's bulwark",
      "Dinh's blazing bulwark", 'Earthbound tecpatl', 'Glacial temotli', 'Sulphur blades', "Hunter's spear",
      'Blue Moon spear', 'Keris partisan of the sun'],
    reason: "special-attack (damage spec) or mid-tier weapons: their normal attacks are below the pool's weapons and "
      + 'the best-setup model has no damage specs yet (ROADMAP "Damage specs vs drain value"; e.g. the Crimson '
      + "kisten's Brutal Swing, Dragon claws). Keris partisan of the sun: +25% accuracy only below 25% hp in ToA (the "
      + 'search evaluates full hp)',
  },
  {
    match: /^(Corrupted|Crystal) (staff|bow) \((basic|attuned|perfected)\)$|^Crystal bow$/,
    reason: 'the Gauntlet weapons (only usable inside the Gauntlet) and the old crystal bow (the Bow of Faerdhinen (c) '
      + 'in the pool replaces it)',
  },
  {
    match: 'Bow of Faerdhinen',
    reason: 'same stats and effect as the Bow of Faerdhinen (c) in the pool (the coloured variant is not an alias in '
      + 'EquipmentAliases)',
  },
  {
    match: ['Trident of the Seas', 'Trident of the Seas (e)', 'Trident of the Swamp', 'Trident of the Swamp (e)',
      "Thammaron's sceptre", 'Webweaver bow', 'Arkan blade'],
    reason: 'mid-tier powered staves (the Sanguinesti staff / Shadow / Warped / Accursed sceptre in the pool beat them), '
      + "the wilderness Webweaver bow / Thammaron's sceptre, and the Arkan blade (mid-tier spec weapon)",
  },
  {
    match: 'Ice arrows',
    reason: 'rune-tier arrows (+0 accuracy, ranged str below dragon arrows); upstream checks the name for the freeze',
  },
  {
    match: ['Ruby bolts (e)', 'Diamond bolts (e)', 'Onyx bolts (e)', 'Opal bolts (e)', 'Opal dragon bolts (e)',
      'Pearl bolts (e)', 'Pearl dragon bolts (e)', 'Dragonstone bolts (e)', 'Dragonstone dragon bolts (e)'],
    reason: 'non-dragon gem bolts have the same effect as the dragon bolts (e) in the pool with lower ranged str; '
      + 'opal / pearl / dragonstone procs are weaker than ruby / diamond / onyx against raid bosses',
  },
];

export interface AuditFinding {
  name: string;
  slot: string;
  reasons: string[];
}

export interface PoolMembers {
  names: Set<string>;
  canonicalIds: Set<number>;
}

type Stat = (p: EquipmentPiece) => number;
const STAT: Record<string, Stat> = {
  stab: (p) => p.offensive.stab,
  slash: (p) => p.offensive.slash,
  crush: (p) => p.offensive.crush,
  str: (p) => p.bonuses.str,
  ranged: (p) => p.offensive.ranged,
  rangedStr: (p) => p.bonuses.ranged_str,
  magic: (p) => p.offensive.magic,
  magicStr: (p) => p.bonuses.magic_str,
};
const STAT_SETS: Record<StyleGroup, Stat[][]> = {
  melee: [[STAT.stab, STAT.str], [STAT.slash, STAT.str], [STAT.crush, STAT.str]],
  ranged: [[STAT.ranged, STAT.rangedStr]],
  magic: [[STAT.magic, STAT.magicStr]],
};

const dominates = (x: EquipmentPiece, y: EquipmentPiece, stats: Stat[]): boolean => stats.every((s) => s(x) >= s(y))
  && stats.some((s) => s(x) > s(y));

/** Items no other item of the list dominates (under `stats`). */
const frontier = (items: EquipmentPiece[], stats: Stat[]): EquipmentPiece[] => items
  .filter((it) => !items.some((o) => o.id !== it.id && dominates(o, it, stats)));

const piecesByName = (name: string): EquipmentPiece[] => availableEquipment.filter((e) => e.name === name);

const poolRefs = (pool: StylePool): ItemRef[] => [
  ...pool.weapons.flatMap((w) => [w.weapon, ...(w.ammo || []), ...(w.dart ? [w.dart] : [])]),
  ...Object.values(pool.slots).flatMap((cands) => (cands || []).map((c) => c.ref)),
  ...pool.sets.flatMap((s) => Object.values(s.pieces) as ItemRef[]),
  ...(pool.weaponExtras || []).flatMap((x) => Object.values(x.slots).flatMap((cands) => (cands || []).map((c) => c.ref))),
];

/** Every item name referenced by a raid pool, preset or the given extra refs (spec weapons / shields). */
export const collectPoolMembers = (extraRefs: ItemRef[] = []): PoolMembers => {
  const refs: ItemRef[] = [...extraRefs];
  for (const base of RAID_BASES) {
    for (const pool of Object.values(base.searchPool)) refs.push(...poolRefs(pool));
    for (const preset of base.presets) refs.push(...(Object.values(preset.equipment) as ItemRef[]));
  }
  const names = new Set(refs.map(refName));
  const canonicalIds = new Set<number>();
  for (const name of names) {
    for (const p of piecesByName(name)) canonicalIds.add(getCanonicalItemId(p.id));
  }
  return { names, canonicalIds };
};

export const isExcluded = (name: string, exclusions: PoolExclusion[] = POOL_EXCLUDED): PoolExclusion | undefined => exclusions
  .find((x) => {
    if (typeof x.match === 'string') return x.match === name;
    if (Array.isArray(x.match)) return x.match.includes(name);
    return x.match.test(name);
  });

const resolveAll = (refs: ItemRef[]): EquipmentPiece[] => refs.map(resolveItem);

/** Reasons (per item id) that the stat rule flags, over every raid pool. */
const dominanceFindings = (): Map<number, Set<string>> => {
  const out = new Map<number, Set<string>>();
  const flag = (item: EquipmentPiece, why: string) => {
    if (!out.has(item.id)) out.set(item.id, new Set());
    out.get(item.id)!.add(why);
  };
  for (const base of RAID_BASES) {
    for (const [group, pool] of Object.entries(base.searchPool) as [StyleGroup, StylePool][]) {
      // slot items (the free ammo slot only for melee / magic: ranged weapons without fired ammo ignore ammo stats)
      for (const slot of SEARCH_SLOTS) {
        if (slot === 'ammo' && group === 'ranged') continue;
        const poolItems = resolveAll((pool.slots[slot] || []).map((c) => c.ref));
        if (!poolItems.length) continue;
        const others = availableEquipment.filter((e) => e.slot === slot);
        for (const stats of STAT_SETS[group]) {
          for (const best of frontier(poolItems, stats)) {
            for (const x of others) {
              if (dominates(x, best, stats)) flag(x, `${base.id} ${group} ${slot}: beats ${best.name}`);
            }
          }
        }
      }
      for (const cand of pool.weapons) {
        const w = resolveItem(cand.weapon);
        if (cand.ammo?.length) {
          const ammo = resolveAll(cand.ammo);
          const fits = availableEquipment.filter((e) => e.slot === 'ammo'
            && ammoApplicability(w.id, e.id) === AmmoApplicability.INCLUDED);
          for (const best of frontier(ammo, STAT_SETS.ranged[0])) {
            for (const x of fits) {
              if (dominates(x, best, STAT_SETS.ranged[0])) flag(x, `${base.id} ${w.name} ammo: beats ${best.name}`);
            }
          }
        }
      }
    }
  }
  return out;
};

/**
 * The audit: every item that dominates a pool slot or has an upstream effect, minus pool members (by name or
 * canonical id) and `POOL_EXCLUDED`. One finding per item name.
 */
export const auditPool = (
  effectNames: Iterable<string>,
  extraRefs: ItemRef[] = [],
  exclusions: PoolExclusion[] = POOL_EXCLUDED,
): AuditFinding[] => {
  const members = collectPoolMembers(extraRefs);
  const findings = new Map<string, AuditFinding>();
  const add = (item: EquipmentPiece, reasons: Iterable<string>) => {
    if (members.names.has(item.name) || members.canonicalIds.has(getCanonicalItemId(item.id))) return;
    if (isExcluded(item.name, exclusions)) return;
    const f = findings.get(item.name) ?? { name: item.name, slot: item.slot, reasons: [] };
    for (const r of reasons) if (!f.reasons.includes(r)) f.reasons.push(r);
    findings.set(item.name, f);
  };
  for (const [id, reasons] of dominanceFindings()) {
    const item = availableEquipment.find((e) => e.id === id);
    if (item) add(item, reasons);
  }
  const effects = new Set(effectNames);
  for (const item of availableEquipment) {
    if (effects.has(item.name)) add(item, ['upstream effect (name checked in the calculator code)']);
  }
  return Array.from(findings.values()).sort((a, b) => a.slot.localeCompare(b.slot) || a.name.localeCompare(b.name));
};

/** Item names that appear as string literals in the given source texts (upstream effect checks). */
export const effectNamesFromSources = (sources: string[]): string[] => {
  const names = new Set(availableEquipment.map((e) => e.name));
  const found = new Set<string>();
  for (const src of sources) {
    for (const m of src.matchAll(/'((?:[^'\\\n]|\\.)*)'|"([^"\n]*)"/g)) {
      const s = (m[1] ?? m[2]).replace(/\\'/g, "'");
      if (names.has(s)) found.add(s);
    }
  }
  return Array.from(found).sort();
};
