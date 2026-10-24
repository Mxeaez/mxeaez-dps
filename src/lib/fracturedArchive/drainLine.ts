import { DefenceReductions } from '@/lib/fracturedArchive/drains';
import { resolveItem } from '@/lib/fracturedArchive/loadout';
import { PlannerWeapon, SPEC_WEAPONS, SpecWeapon } from '@/lib/fracturedArchive/specs';

/**
 * Phase 23: a drain plan as data for the "[icon] ×N" drain line (DrainLineView.tsx). Pure and React-free: built in the
 * worker (DrainState.line) and in the calculator's Max-drain buttons. The long text stays the tooltip.
 *
 * Counts are what the player does: spec attempts for every weapon, except Tonalztics, shown as *hits* (a charged spec
 * hits twice; the number of specs is in the tooltip), and the BGS in the Max-drain buttons, shown as damage.
 */

export interface DrainLineItem {
  weapon: SpecWeapon;
  label: string;
  /** equipment.json image file name of the weapon (undefined when the item has none). */
  image?: string;
  /** Number shown after "×": specs; Tonalztics hits; BGS damage (unit 'dmg'). */
  count: number;
  unit: 'spec' | 'hit' | 'dmg';
  /** Spec attempts behind `count`. */
  specs: number;
  /** P(the drain lands) per spec, from the calculator's spec distribution (undefined when not known). */
  hitChance?: number;
  /** Tooltip, e.g. "4 Tonalztics hits (2 specs), 81% chance per spec to land a damaging hit". */
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
): DrainLineItem => {
  const unit = override?.unit ?? (weapon === 'tonalztics' ? 'hit' : 'spec');
  const count = override?.count ?? (weapon === 'tonalztics' ? specs * 2 : specs);
  const label = LABELS[weapon];
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  let what: string;
  if (unit === 'hit') what = `${plural(count, `${label} hit`)} (${plural(specs, 'spec')})`;
  else if (unit === 'dmg') what = `${label} specs dealing ${count} damage in total`;
  else what = `${plural(count, `${label} spec`)}`;
  const landed = weapon === 'tonalztics' ? 'to land at least one damaging hit' : 'to land';
  const chance = hitChance === undefined ? '' : `, ${pctText(hitChance)} chance per spec ${landed}`;
  return {
    weapon, label, image: imageOf(weapon), count, unit, specs, hitChance, title: `${what}${chance}`,
  };
};

/** Line of a planned attempt sequence (Solo / Team: spec attempts per weapon, Ayak included). */
export const drainLineFromAttempts = (
  attempts: PlannerWeapon[],
  hitChance: Partial<Record<PlannerWeapon, number>>,
  after: { defAfter: number, magicDefAfter: number },
  text: string,
  budget?: DrainLine['budget'],
): DrainLine => {
  const counts = new Map<PlannerWeapon, number>();
  attempts.forEach((w) => counts.set(w, (counts.get(w) || 0) + 1));
  return {
    items: ORDER.filter((w) => counts.has(w as PlannerWeapon))
      .map((w) => drainLineItem(w, counts.get(w as PlannerWeapon)!, hitChance[w as PlannerWeapon])),
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
    items.push(drainLineItem('tonalztics', Math.ceil(r.tonalztic / 2), hitChance.tonalztics, { count: r.tonalztic, unit: 'hit' }));
  }
  if (r.bgs) items.push(drainLineItem('bgs', 1, hitChance.bgs, { count: r.bgs, unit: 'dmg' }));
  if (r.ayak) {
    const specs = ayakSpecs !== undefined && Number.isFinite(ayakSpecs) ? ayakSpecs : 1;
    items.push(drainLineItem('ayak', specs, hitChance.ayak, { count: specs, unit: 'spec' }));
  }
  return { items, ...after, text };
};
