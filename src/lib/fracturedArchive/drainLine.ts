import { DefenceReductions } from '@/lib/fracturedArchive/drains';
import { resolveItem } from '@/lib/fracturedArchive/loadout';
import { PlannerWeapon, SPEC_WEAPONS, SpecWeapon } from '@/lib/fracturedArchive/specs';

/**
 * Phase 23: a drain plan as data for the "[icon] ×N" drain line (DrainLineView.tsx). Pure and React-free: built in the
 * worker (DrainState.line) and in the calculator's Max-drain buttons. The long text stays the tooltip.
 *
 * Counts are what the player does: spec attempts for every weapon (Tonalztics too; its hits, 2 per charged spec, are in
 * the tooltip), except the BGS in the Max-drain buttons, shown as damage.
 */

export interface DrainLineItem {
  weapon: SpecWeapon;
  label: string;
  /** equipment.json image file name of the weapon (undefined when the item has none). */
  image?: string;
  /** Number shown after "×": specs (Tonalztics too; its hits are in the tooltip); BGS damage (unit 'dmg'). */
  count: number;
  unit: 'spec' | 'dmg';
  /** Solo: specs asked for that don't fit in the energy (count 0 = "×0 (no energy)"). */
  short?: number;
  /** Spec attempts behind `count`. */
  specs: number;
  /** P(the drain lands) per spec, from the calculator's spec distribution (undefined when not known). */
  hitChance?: number;
  /** Tooltip, e.g. "2 Tonalztics specs (4 hits); 81% of specs land at least one damaging hit". */
  title: string;
}

export interface DrainLine {
  items: DrainLineItem[];
  /** Defence level / Magic defence bonus the ranking uses after the plan. */
  defAfter: number;
  magicDefAfter: number;
  /** Solo only: the fight length the spec-energy budget used, and the specs it pays for. */
  budget?: { fightSeconds: number, computed: boolean, specs: number };
  /** The full plan text (the old one-line description). */
  text: string;
}

const pctText = (p: number) => `${Math.round(p * 100)}%`;

const imageOf = (w: SpecWeapon): string | undefined => {
  try {
    return resolveItem(SPEC_WEAPONS[w].item).image || undefined;
  } catch {
    return undefined;
  }
};

const LABELS: Record<SpecWeapon, string> = {
  elderMaul: 'Elder maul', dwh: 'DWH', bgs: 'BGS', tonalztics: 'Tonalztics', ayak: 'Eye of Ayak', accursed: 'Accursed sceptre',
};

const ORDER: SpecWeapon[] = ['accursed', 'elderMaul', 'dwh', 'tonalztics', 'bgs', 'ayak'];

export const drainLineItem = (
  weapon: SpecWeapon,
  specs: number,
  hitChance: number | undefined,
  override?: { count: number, unit: DrainLineItem['unit'] },
  extra?: { hits?: number, wanted?: number },
): DrainLineItem => {
  const unit = override?.unit ?? 'spec';
  const count = override?.count ?? specs;
  const label = LABELS[weapon];
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  let what: string;
  if (unit === 'dmg') what = `${label} specs dealing ${count} damage in total`;
  else what = plural(count, `${label} spec`);
  // Tonalztics: a charged spec hits twice; the hit count is in the tooltip (review fix: shown as specs)
  if (weapon === 'tonalztics' && unit === 'spec') what += ` (${plural(extra?.hits ?? count * 2, 'hit')})`;
  const short = extra?.wanted !== undefined && extra.wanted > count ? extra.wanted - count : 0;
  if (short) what += count === 0 ? ` (you asked for ${extra!.wanted}: no spec energy left for them)` : ` (${short} of ${extra!.wanted} don't fit in your spec energy)`;
  const landed = weapon === 'tonalztics' ? 'land at least one damaging hit' : 'land';
  const chance = hitChance === undefined ? '' : `; ${pctText(hitChance)} of specs ${landed}`;
  return {
    weapon, label, image: imageOf(weapon), count, unit, specs, hitChance, title: `${what}${chance}`, ...(short ? { short } : {}),
  };
};

/**
 * Line of a planned attempt sequence (Solo / Team: spec attempts per weapon, Ayak included). `wanted` (Solo): specs
 * the user asked for per weapon; a weapon that got fewer (or none: "×0 (no energy)") is kept with `short` set.
 */
export const drainLineFromAttempts = (
  attempts: PlannerWeapon[],
  hitChance: Partial<Record<PlannerWeapon, number>>,
  after: { defAfter: number, magicDefAfter: number },
  text: string,
  budget?: DrainLine['budget'],
  wanted: Partial<Record<PlannerWeapon, number>> = {},
): DrainLine => {
  const counts = new Map<PlannerWeapon, number>();
  attempts.forEach((w) => counts.set(w, (counts.get(w) || 0) + 1));
  const shown = (w: SpecWeapon) => counts.has(w as PlannerWeapon) || (wanted[w as PlannerWeapon] ?? 0) > 0;
  return {
    items: ORDER.filter(shown)
      .map((w) => drainLineItem(w, counts.get(w as PlannerWeapon) ?? 0, hitChance[w as PlannerWeapon], undefined, {
        wanted: wanted[w as PlannerWeapon],
      })),
    ...after,
    ...(budget ? { budget } : {}),
    text,
  };
};

/**
 * Line of `defenceReductions` inputs (the calculator's Max-drain buttons): landed maul / DWH specs, Tonalztics hits,
 * BGS damage, the accursed spec, Eye of Ayak (damage to the magic defence bonus; `ayakSpecs` when known).
 */
export const drainLineFromReductions = (
  r: DefenceReductions,
  hitChance: Partial<Record<SpecWeapon, number>>,
  after: { defAfter: number, magicDefAfter: number },
  text: string,
  ayakSpecs?: number,
): DrainLine => {
  const items: DrainLineItem[] = [];
  if (r.accursed) items.push(drainLineItem('accursed', 1, hitChance.accursed));
  if (r.elderMaul) items.push(drainLineItem('elderMaul', r.elderMaul, hitChance.elderMaul));
  if (r.dwh) items.push(drainLineItem('dwh', r.dwh, hitChance.dwh));
  if (r.tonalztic) {
    items.push(drainLineItem('tonalztics', Math.ceil(r.tonalztic / 2), hitChance.tonalztics, undefined, { hits: r.tonalztic }));
  }
  if (r.bgs) items.push(drainLineItem('bgs', 1, hitChance.bgs, { count: r.bgs, unit: 'dmg' }));
  if (r.ayak) {
    const specs = ayakSpecs !== undefined && Number.isFinite(ayakSpecs) ? ayakSpecs : 1;
    items.push(drainLineItem('ayak', specs, hitChance.ayak, { count: specs, unit: 'spec' }));
  }
  return { items, ...after, text };
};
