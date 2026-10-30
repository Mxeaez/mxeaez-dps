import type {
  EncounterId, KitChoice, PhaseQuery, RaidKit,
} from '@/lib/fracturedArchive/raidTime';

/**
 * Phase 40 (ROADMAP 40): a required variant in the time model. `headcount` of the `partySize` players run another
 * loadout on `share` of the HP of the rows `rowKeys` (FA: the Xarth freezer casts Ice Barrage on the corpse half of
 * Xarth's HP). Pure: the variant's own kit (`kit`, non-enumerable so memo keys built from the assumptions' JSON hold only
 * `id`) answers the same queries as the main kit.
 */
export interface TimeVariant {
  /** Unique per variant loadout and assumptions (part of the memo keys through the assumptions' JSON). */
  id: string;
  encounter: EncounterId;
  rowKeys: string[];
  /** Share of the rows' HP dealt while the variant players run the variant (0-1). */
  share: number;
  headcount: number;
  partySize: number;
  /** The variant loadout's kit (non-enumerable; `timeVariant` sets it). */
  kit: RaidKit;
}

/** A TimeVariant whose kit is left out of JSON (memo keys) and structured clones of the fields. */
export const timeVariant = (v: Omit<TimeVariant, 'kit'>, kit: RaidKit): TimeVariant => {
  const out = { ...v } as TimeVariant;
  Object.defineProperty(out, 'kit', { value: kit, enumerable: false });
  return out;
};

/**
 * Phase 40: the team-average DPS on a variant row, in units of "your DPS" (the time model divides the HP by it × the
 * team-DPS multiplier). Off the variant share every player deals `d`; on it `n − h` players deal `d` and `h` deal `v`,
 * so the team averages d2 = d × (1 − h ÷ n) + v × h ÷ n. The row's seconds are (1 − s) × H ÷ d + s × H ÷ d2, i.e. one
 * DPS of 1 ÷ ((1 − s) ÷ d + s ÷ d2) (the harmonic blend). n ≤ h (nobody else) or d ≤ 0: `d` unchanged.
 */
export const variantRowDps = (d: number, v: number, n: number, h: number, s: number): number => {
  if (!(d > 0) || !(n > h) || !(s > 0)) return d;
  const d2 = d * (1 - h / n) + Math.max(0, v) * (h / n);
  if (!(d2 > 0)) return 0;
  return 1 / ((1 - s) / d + s / d2);
};

/** Phase 40: the choice on a variant row (the blended DPS; the parts kept for the display). */
export interface VariantChoice extends KitChoice {
  /** Your loadout's DPS there (before the blend). */
  baseDps?: number;
  /** The variant loadout's DPS there. */
  variantDps?: number;
}

/**
 * Phase 40: `kit` with the variant's rows answered at the blended DPS (`variantRowDps`). Everything that times a row
 * (passes, the spec budget's drain values, damage specs) reads the DPS through `best`, so they all see the team's
 * average. The pass memo is delegated with the inner kit wrapped again (exact: the variant kit is fixed per `v.id`,
 * which is in the assumptions' key).
 */
export const variantKit = (kit: RaidKit, v: TimeVariant): RaidKit => {
  const rows = new Set(v.rowKeys);
  const best = (q: PhaseQuery): KitChoice | null => {
    const c = kit.best(q);
    if (!c || !q.rowKey || !rows.has(q.rowKey)) return c;
    const vd = v.kit.best(q)?.dps ?? 0;
    const out: VariantChoice = {
      ...c, dps: variantRowDps(c.dps, vd, v.partySize, v.headcount, v.share), baseDps: c.dps, variantDps: vd,
    };
    return out;
  };
  // the encounter memo stays the raw kit's (raidTime `encounterTime` wraps its run), so none here
  const rest: RaidKit = { ...kit };
  delete rest.memoEncounter;
  return {
    ...rest,
    best,
    ...(kit.memoPass ? {
      memoPass: (key, a, run) => kit.memoPass!(`v:${v.id}|${key}`, a, (inner) => run(variantKit(inner, v))),
    } : {}),
  };
};

/** Phase 40: `kit` with every variant of `variants` on encounter `id` (unchanged when none applies). */
export const kitWithVariants = (kit: RaidKit, id: EncounterId, variants: TimeVariant[] | undefined): RaidKit => (variants ?? [])
  .filter((v) => v.encounter === id)
  .reduce((k, v) => variantKit(k, v), kit);
