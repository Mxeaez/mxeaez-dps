import { Monster } from '@/types/Monster';
import { EquipmentPiece, Player, PlayerEquipment } from '@/types/Player';
import { PlayerCombatStyle } from '@/types/PlayerCombatStyle';
import { spellByName } from '@/types/Spell';
import { EquipmentCategory } from '@/enums/EquipmentCategory';
import { MonsterAttribute } from '@/enums/MonsterAttribute';
import { availableEquipment } from '@/lib/Equipment';
import { getCombatStylesForCategory } from '@/utils';
import { isImmuneToSpell } from '@/lib/fracturedArchive/immunities';
import {
  applyLoadoutToPlayer,
  buildTargetMonster,
  cantHitReason,
  DrainState,
  DrainStateId,
  evaluateLoadout,
  findTarget,
  LoadoutEvaluation,
  NON_CANDIDATE_STANCES,
  PresetResult,
  rankResults,
  resolveItem,
  safeEvaluatePreset,
  styleLabel,
} from '@/lib/fracturedArchive/bestSetup';
import {
  BestSetupAssumptions, ItemRef, PRESETS, PresetDef, StyleGroup,
} from '@/lib/fracturedArchive/presets';
import {
  CandidateItem, SEARCH_POOL, SEARCH_SLOTS, SearchSlot, StylePool, WeaponCandidate, refName,
} from '@/lib/fracturedArchive/searchCandidates';

/**
 * Full gear search (phase 9, "Search" tab of /best-setup). Pure and React-free: runs in its own web worker
 * (src/worker/searchWorker.ts, WorkerRequestType.BEST_SETUP_SEARCH) and in Jest. Every number comes from
 * `evaluateLoadout` (bestSetup.ts), i.e. the same PlayerVsNPCCalc calls as the main calculator.
 *
 * Algorithm, per style group (melee / ranged / magic) of the pool in searchCandidates.ts:
 * 1. Weapon variants are enumerated fully: weapon × ammo option (× blowpipe dart). Each variant's "style options" are
 *    all its non-defensive combat styles of the group's type, and for autocast styles each applicable spell.
 * 2. Per variant the slot pools are pruned (`prunePool`): an item is dropped when another item of the same slot has
 *    every relevant offensive stat >= (strictly > in one, or equal and listed earlier), unless the item is marked
 *    `keep` (special effect). Relevant stats: the attack bonuses of the variant's melee attack types + strength;
 *    ranged attack + ranged strength (+ melee strength for the Eclipse atlatl); magic attack + magic damage.
 *    Prayer bonus and defensive stats are ignored (no prayer drain or damage taken in the model).
 * 3. Seeds: the pool defaults (first item of each pruned slot), the armour of every Phase 8 preset of the group, and
 *    every full set of the group (`sets`, restricted to their weapons). Two-handed weapons drop the shield; the ammo
 *    slot comes from the variant (fired ammo) or the pool (Rada's blessing).
 * 4. From each seed: pick the best style option, then coordinate ascent — for each slot in SEARCH_SLOTS order, try
 *    every pool candidate with the rest fixed and keep the best, then re-pick the style option; repeat until a pass
 *    brings no improvement (max `maxPasses`, default 3). Evaluations are memoised per variant.
 * 5. Each converged loadout is a candidate; the global top-N distinct loadouts (gear + style + spell) by DPS are
 *    returned. Expected TTK is computed for the winner only (like the Summary in phase 8).
 *
 * Limitation: coordinate ascent changes one slot at a time, so a set effect that needs several pieces (Void,
 * Inquisitor's, Crystal + Bowfa, Virtus + ancients, Blood Moon + macuahuitl) is only found when it is seeded as a full
 * set — a set missing from `sets` would be missed. Likewise only one spell/style is varied at a time.
 * Because the presets are seeds and their weapons/styles/spells are in the pool, the top result is never below the
 * best preset of the searched style groups (tested).
 */

export type StyleFilter = 'all' | StyleGroup;

export const STYLE_FILTERS: { id: StyleFilter, label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'melee', label: 'Melee' },
  { id: 'ranged', label: 'Ranged' },
  { id: 'magic', label: 'Magic' },
];

const GROUP_ORDER: StyleGroup[] = ['melee', 'ranged', 'magic'];

export const groupsFor = (filter: StyleFilter): StyleGroup[] => (filter === 'all' ? GROUP_ORDER : [filter]);

/** An equipped item as returned to the UI (enough to rebuild the exact piece by id). */
export interface SearchItem {
  id: number;
  name: string;
  version: string;
  itemVars?: EquipmentPiece['itemVars'];
}

export type SearchEquipment = Partial<Record<keyof PlayerEquipment, SearchItem>>;

export interface SearchRow {
  group: StyleGroup;
  /** Weapon + ammo/dart, e.g. "Twisted bow + Dragon arrow". */
  weaponLabel: string;
  equipment: SearchEquipment;
  style: PlayerCombatStyle;
  spell: string | null;
  styleLabel: string;
  /** The seed the ascent started from, e.g. "preset: Twisted bow (Masori)" or "set: Void (melee)". */
  seed: string;
  dps: number;
  /** Expected TTK (winner only); null otherwise / n/a. */
  ttk: number | null;
  maxHit: number;
  accuracy: number;
}

export interface GearSearchQuery {
  targetKey: string;
  phase?: string;
  drain: DrainStateId;
  styles?: StyleFilter;
}

export interface GearSearchProgress {
  evaluations: number;
  /** Estimated total evaluations (re-estimated after every weapon variant). */
  estimate: number;
  variantsDone: number;
  variants: number;
  /** The weapon variant being searched. */
  current: string;
}

export interface GearSearchOptions {
  /** Rows returned (default 10). */
  topN?: number;
  /** Max coordinate-ascent passes per seed (default 3). */
  maxPasses?: number;
  /** Only search these weapons (by name) — a reduced pool for tests. */
  weapons?: string[];
  /** Replace the candidate pool (tests). */
  pool?: Partial<Record<StyleGroup, StylePool>>;
  /** Presets used as seeds and for the "vs best preset" comparison (default PRESETS). */
  presets?: PresetDef[];
  /** Seed with the presets' armour (default true). */
  presetSeeds?: boolean;
  onProgress?: (p: GearSearchProgress) => void;
  /** Report progress every N evaluations (default 25). */
  progressEvery?: number;
  /** Checked before every evaluation; returning true stops the search (partial results, `cancelled: true`). */
  shouldCancel?: () => boolean;
}

export interface GearSearchResult {
  targetKey: string;
  phase?: string;
  drain: DrainState;
  styles: StyleFilter;
  /** Top-N distinct loadouts (gear + style + spell) by DPS; rows[0] has the expected TTK. */
  rows: SearchRow[];
  /** The best loadout of each weapon variant (top-N), for a more varied list. rowsByWeapon[0] === rows[0]. */
  rowsByWeapon: SearchRow[];
  /** Best Phase 8 preset of the searched style groups (same boss/state), for the "vs best preset" column. */
  bestPreset: PresetResult | null;
  /** Weapon variants skipped because no style of them deals damage here, with the reason. */
  cantHit: { weapon: string, reason: string }[];
  evaluations: number;
  variants: number;
  elapsedMs: number;
  cancelled: boolean;
}

// --- items ---------------------------------------------------------------------------------------------------------

const refKey = (ref: ItemRef) => (typeof ref === 'string' ? ref : `${ref[0]}#${ref[1]}`);

const makeResolver = () => {
  const cache = new Map<string, EquipmentPiece>();
  return (ref: ItemRef): EquipmentPiece => {
    const k = refKey(ref);
    let item = cache.get(k);
    if (!item) {
      item = resolveItem(ref);
      cache.set(k, item);
    }
    return item;
  };
};

const toSearchItem = (p: EquipmentPiece): SearchItem => ({
  id: p.id,
  name: p.name,
  version: p.version,
  ...(p.itemVars ? { itemVars: p.itemVars } : {}),
});

/** Rebuilds the equipment of a search row (exact items by id, incl. the blowpipe dart). */
export const searchEquipmentToPlayerEquipment = (eq: SearchEquipment): Partial<PlayerEquipment> => Object.fromEntries(
  Object.entries(eq).map(([slot, it]) => {
    const piece = availableEquipment.find((e) => e.id === it!.id);
    if (!piece) {
      throw new Error(`Gear search: no item with id ${it!.id} (${it!.name})`);
    }
    return [slot, it!.itemVars ? { ...piece, itemVars: it!.itemVars } : piece];
  }),
);

/** The player of a search row, as the main calculator would hold it (used by "Load into calculator" and tests). */
export const searchRowToPlayer = (
  base: Player,
  row: SearchRow,
  monster: Monster,
  assumptions: BestSetupAssumptions,
): Player => applyLoadoutToPlayer(
  base,
  row.weaponLabel,
  row.group,
  searchEquipmentToPlayerEquipment(row.equipment),
  row.style,
  row.spell,
  monster,
  assumptions,
);

const SLOT_SHORT_ORDER: (keyof PlayerEquipment)[] = ['head', 'body', 'legs', 'hands', 'feet', 'cape', 'neck', 'ring', 'shield', 'ammo'];

/** Compact loadout text for the table: everything except the weapon (and its ammo, shown in the weapon label). */
export const loadoutSummary = (row: SearchRow): string => SLOT_SHORT_ORDER
  .filter((s) => row.equipment[s] && !(s === 'ammo' && row.weaponLabel.includes(row.equipment[s]!.name)))
  .map((s) => row.equipment[s]!.name)
  .join(' · ');

// --- styles and spells ---------------------------------------------------------------------------------------------

export interface StyleOption {
  style: PlayerCombatStyle;
  spell: string | null;
}

const MELEE_TYPES = ['stab', 'slash', 'crush'];

const styleMatchesGroup = (s: PlayerCombatStyle, group: StyleGroup) => (group === 'melee'
  ? MELEE_TYPES.includes(s.type || '')
  : s.type === group);

/** Spells worth trying against this monster (see searchCandidates.ts). */
export const spellsForMonster = (names: string[], monster: Monster): string[] => names.filter((name) => {
  const spell = spellByName(name);
  if (!spell) {
    throw new Error(`Gear search: no spell named '${name}'`);
  }
  if (name.includes('Demonbane')) {
    return monster.attributes.includes(MonsterAttribute.DEMON);
  }
  if (name.endsWith(' Surge')) {
    return spell.element === 'fire' || spell.element === monster.weakness?.element;
  }
  return !isImmuneToSpell(monster, spell);
});

export const styleOptionsFor = (weapon: EquipmentPiece, cand: WeaponCandidate, group: StyleGroup, monster: Monster): StyleOption[] => {
  const all = getCombatStylesForCategory(weapon.category || EquipmentCategory.NONE)
    .filter((s) => styleMatchesGroup(s, group) && !NON_CANDIDATE_STANCES.includes(s.stance || ''));
  const styles = all.filter((s, i) => all.findIndex((o) => o.name === s.name && o.stance === s.stance) === i);
  return styles.flatMap((style): StyleOption[] => {
    if (style.stance === 'Autocast') {
      return spellsForMonster(cand.spells || [], monster).map((spell) => ({ style, spell }));
    }
    return [{ style, spell: null }];
  });
};

// --- pools ---------------------------------------------------------------------------------------------------------

type Stat = (p: EquipmentPiece) => number;

const relevantStats = (group: StyleGroup, weapon: EquipmentPiece, options: StyleOption[]): Stat[] => {
  if (group === 'melee') {
    const types = Array.from(new Set(options.map((o) => o.style.type))) as ('stab' | 'slash' | 'crush')[];
    return [...types.map((t): Stat => (p) => p.offensive[t]), (p) => p.bonuses.str];
  }
  if (group === 'ranged') {
    const stats: Stat[] = [(p) => p.offensive.ranged, (p) => p.bonuses.ranged_str];
    if (weapon.name === 'Eclipse atlatl') stats.push((p) => p.bonuses.str);
    return stats;
  }
  return [(p) => p.offensive.magic, (p) => p.bonuses.magic_str];
};

const isKept = (c: CandidateItem, weaponName: string) => c.keep === true
  || (Array.isArray(c.keep) && c.keep.includes(weaponName));

/**
 * Drops items whose relevant offensive stats are all <= another item's in the same slot (strictly lower in one, or
 * identical and listed later), unless they're `keep` items. Returns the surviving pieces in pool order.
 */
export const prunePool = (
  candidates: { item: EquipmentPiece, cand: CandidateItem }[],
  stats: Stat[],
  weaponName: string,
): EquipmentPiece[] => candidates.filter(({ item, cand }, i) => {
  if (isKept(cand, weaponName)) return true;
  return !candidates.some(({ item: other }, j) => {
    if (j === i || other.id === item.id) return false;
    const ge = stats.every((s) => s(other) >= s(item));
    const gt = stats.some((s) => s(other) > s(item));
    return ge && (gt || j < i);
  });
}).map(({ item }) => item);

type State = Partial<Record<SearchSlot, EquipmentPiece | null>>;

interface Variant {
  group: StyleGroup;
  key: string;
  label: string;
  weapon: EquipmentPiece;
  options: StyleOption[];
  pools: Partial<Record<SearchSlot, EquipmentPiece[]>>;
  seeds: { name: string, state: State }[];
}

const stateKey = (s: State) => SEARCH_SLOTS.map((slot) => s[slot]?.id ?? 0).join(',');

const buildVariants = (
  poolDef: StylePool,
  monster: Monster,
  resolve: (r: ItemRef) => EquipmentPiece,
  presets: PresetDef[],
  options: GearSearchOptions,
): Variant[] => {
  const { group } = poolDef;
  const variants: Variant[] = [];
  for (const cand of poolDef.weapons) {
    const weaponName = refName(cand.weapon);
    if (options.weapons && !options.weapons.includes(weaponName)) continue;
    let weapon = resolve(cand.weapon);
    let dartLabel = '';
    if (cand.dart) {
      const dart = resolve(cand.dart);
      weapon = { ...weapon, itemVars: { blowpipeDartId: dart.id, blowpipeDartName: dart.name } };
      dartLabel = ` + ${dart.name}`;
    }
    const styleOpts = styleOptionsFor(weapon, cand, group, monster);
    if (!styleOpts.length) continue;
    const stats = relevantStats(group, weapon, styleOpts);
    const extras = (poolDef.weaponExtras || []).filter((x) => x.weapons.includes(weaponName));

    const ammoOptions: (EquipmentPiece | null)[] = cand.ammo ? cand.ammo.map(resolve) : [null];
    for (const fixedAmmo of ammoOptions) {
      const pools: Partial<Record<SearchSlot, EquipmentPiece[]>> = {};
      for (const slot of SEARCH_SLOTS) {
        if (slot === 'shield' && weapon.isTwoHanded) {
          pools[slot] = [];
        } else if (slot === 'ammo' && fixedAmmo) {
          pools[slot] = [fixedAmmo];
        } else {
          const cands = [...(poolDef.slots[slot] || []), ...extras.flatMap((x) => x.slots[slot] || [])]
            .map((c) => ({ item: resolve(c.ref), cand: c }));
          pools[slot] = prunePool(cands, stats, weaponName);
        }
      }

      const fill: State = Object.fromEntries(SEARCH_SLOTS.map((s) => [s, pools[s]?.[0] ?? null]));
      const overlay = (pieces: Partial<Record<keyof PlayerEquipment, ItemRef>>): State => {
        const st: State = { ...fill };
        for (const [slot, ref] of Object.entries(pieces) as [keyof PlayerEquipment, ItemRef][]) {
          if (slot === 'weapon' || slot === 'ammo') continue; // weapon-bound: from the variant / pool
          if (slot === 'shield' && weapon.isTwoHanded) continue;
          st[slot] = resolve(ref);
        }
        return st;
      };
      const seeds: { name: string, state: State }[] = [{ name: 'pool defaults', state: fill }];
      if (options.presetSeeds !== false) {
        for (const p of presets.filter((x) => x.group === group)) {
          seeds.push({ name: `preset: ${p.name}`, state: overlay(p.equipment) });
        }
      }
      for (const set of poolDef.sets) {
        if (set.weapons && !set.weapons.includes(weaponName)) continue;
        seeds.push({ name: `set: ${set.name}`, state: overlay(set.pieces) });
      }
      const uniqueSeeds = seeds.filter((s, i) => seeds.findIndex((o) => stateKey(o.state) === stateKey(s.state)) === i);

      const label = `${weaponName}${fixedAmmo ? ` + ${fixedAmmo.name}` : ''}${dartLabel}`;
      variants.push({
        group,
        key: `${group}|${weapon.id}|${fixedAmmo?.id ?? 0}`,
        label,
        weapon,
        options: styleOpts,
        pools,
        seeds: uniqueSeeds,
      });
    }
  }
  return variants;
};

/** Rough evaluation count of a variant (for the progress bar). */
const estimateVariant = (v: Variant) => {
  const slotWork = SEARCH_SLOTS.reduce((acc, s) => acc + Math.max(0, (v.pools[s]?.length ?? 0) - 1), 0);
  return v.seeds.length * (v.options.length + 1.3 * slotWork) + v.options.length;
};

// --- search --------------------------------------------------------------------------------------------------------

class SearchCancelled extends Error {}

interface Candidate {
  variant: Variant;
  state: State;
  option: StyleOption;
  ev: LoadoutEvaluation;
  seed: string;
}

export const runGearSearch = (
  basePlayer: Player,
  query: GearSearchQuery,
  assumptions: BestSetupAssumptions,
  options: GearSearchOptions = {},
): GearSearchResult => {
  const start = Date.now();
  const target = findTarget(query.targetKey);
  const styles = query.styles || 'all';
  const groups = groupsFor(styles);
  const presets = options.presets || PRESETS;
  const topN = options.topN ?? 10;
  const maxPasses = options.maxPasses ?? 3;
  const progressEvery = options.progressEvery ?? 25;
  const { monster, drain } = buildTargetMonster(target, query.phase, query.drain, assumptions);
  const resolve = makeResolver();

  // best Phase 8 preset of the searched groups
  const presetRows = rankResults(presets
    .filter((p) => groups.includes(p.group))
    .map((p) => safeEvaluatePreset(basePlayer, p, monster, assumptions, target.ttkNotApplicable, false)));
  const bestPreset = presetRows[0] ?? null;

  const variants = groups.flatMap((g) => {
    const poolDef = options.pool ? options.pool[g] : SEARCH_POOL[g];
    return poolDef ? buildVariants(poolDef, monster, resolve, presets, options) : [];
  });

  const progress = {
    evaluations: 0,
    estimate: variants.reduce((acc, v) => acc + estimateVariant(v), 0),
    variantsDone: 0,
    current: '',
  };
  const report = () => options.onProgress?.({
    ...progress, estimate: Math.max(progress.estimate, progress.evaluations), variants: variants.length,
  });

  const found: Candidate[] = [];
  const cantHit: GearSearchResult['cantHit'] = [];
  let cancelled = false;

  try {
    for (const variant of variants) {
      progress.current = variant.label;
      report();
      const memo = new Map<string, LoadoutEvaluation>();
      const evaluate = (state: State, option: StyleOption): LoadoutEvaluation => {
        const key = `${stateKey(state)}|${option.style.name}|${option.style.stance}|${option.spell ?? ''}`;
        const hit = memo.get(key);
        if (hit) return hit;
        if (options.shouldCancel?.()) throw new SearchCancelled();
        const player = applyLoadoutToPlayer(
          basePlayer,
          variant.label,
          variant.group,
          { ...state, weapon: variant.weapon },
          option.style,
          option.spell,
          monster,
          assumptions,
        );
        const ev = evaluateLoadout(player, monster, false);
        memo.set(key, ev);
        progress.evaluations += 1;
        if (progress.evaluations % progressEvery === 0) report();
        return ev;
      };
      const bestOption = (state: State, from?: { option: StyleOption, ev: LoadoutEvaluation }) => {
        let best = from;
        for (const option of variant.options) {
          const ev = evaluate(state, option);
          if (!best || ev.dps > best.ev.dps) best = { option, ev };
        }
        return best!;
      };

      const before = progress.evaluations;
      for (const [seedIx, seed] of variant.seeds.entries()) {
        let state: State = { ...seed.state };
        let { option, ev } = bestOption(state);
        if (seedIx === 0 && ev.dps <= 0) {
          // no style of this weapon deals damage (flying, praying against it, immune): armour can't change that
          cantHit.push({ weapon: variant.label, reason: cantHitReason(monster, option.style, ev.issues) });
          break;
        }
        for (let pass = 0; pass < maxPasses; pass++) {
          let improved = false;
          for (const slot of SEARCH_SLOTS) {
            const pool = variant.pools[slot] || [];
            if (!pool.length || (pool.length === 1 && state[slot]?.id === pool[0].id)) continue;
            let bestPiece = state[slot];
            for (const piece of pool) {
              if (piece.id === state[slot]?.id) continue;
              const tryEv = evaluate({ ...state, [slot]: piece }, option);
              if (tryEv.dps > ev.dps) {
                ev = tryEv;
                bestPiece = piece;
                improved = true;
              }
            }
            state = { ...state, [slot]: bestPiece };
          }
          const o = bestOption(state, { option, ev });
          if (o.option !== option) improved = true;
          ({ option, ev } = o);
          if (!improved) break;
        }
        found.push({
          variant, state, option, ev, seed: seed.name,
        });
      }
      progress.variantsDone += 1;
      // re-estimate: actual work so far + the estimate for the remaining variants
      progress.estimate = progress.evaluations
        + variants.slice(progress.variantsDone).reduce((acc, v) => acc + estimateVariant(v), 0);
      if (progress.evaluations === before) report();
    }
  } catch (e) {
    if (!(e instanceof SearchCancelled)) throw e;
    cancelled = true;
  }
  report();

  // global top-N distinct loadouts (stable: first found wins ties)
  const sorted = found
    .map((c, i) => [c, i] as const)
    .sort(([a, ia], [b, ib]) => (b.ev.dps - a.ev.dps) || (ia - ib))
    .map(([c]) => c);
  const distinct = (keyOf: (c: Candidate) => string) => {
    const seen = new Set<string>();
    return sorted.filter((c) => {
      const k = keyOf(c);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).slice(0, topN);
  };

  const toRow = (c: Candidate): SearchRow => {
    const equipment: SearchEquipment = { weapon: toSearchItem(c.variant.weapon) };
    for (const slot of SEARCH_SLOTS) {
      const piece = c.state[slot];
      if (piece) equipment[slot] = toSearchItem(piece);
    }
    return {
      group: c.variant.group,
      weaponLabel: c.variant.label,
      equipment,
      style: c.option.style,
      spell: c.option.spell,
      styleLabel: styleLabel(c.option.style, c.option.spell),
      seed: c.seed,
      dps: c.ev.dps,
      ttk: null,
      maxHit: c.ev.maxHit,
      accuracy: c.ev.accuracy,
    };
  };
  const rows = distinct((c) => `${c.variant.key}|${stateKey(c.state)}|${c.option.style.name}|${c.option.style.stance}|${c.option.spell ?? ''}`)
    .map(toRow);
  const rowsByWeapon = distinct((c) => c.variant.key).map(toRow);

  if (rows.length && rows[0].dps > 0 && !target.ttkNotApplicable && !cancelled) {
    rows[0].ttk = evaluateLoadout(searchRowToPlayer(basePlayer, rows[0], monster, assumptions), monster).ttk;
    rowsByWeapon[0].ttk = rows[0].ttk;
  }

  return {
    targetKey: query.targetKey,
    phase: monster.inputs.phase,
    drain,
    styles,
    rows,
    rowsByWeapon,
    bestPreset,
    cantHit,
    evaluations: progress.evaluations,
    variants: variants.length,
    elapsedMs: Date.now() - start,
    cancelled,
  };
};
