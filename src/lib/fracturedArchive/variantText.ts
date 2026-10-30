import type { PlanVariant } from '@/lib/fracturedArchive/planner';
import { SPELLBOOKS } from '@/lib/raids/types';

/** Phase 40: the Plan tab's lines for a required variant (pure; VariantsBox.tsx renders them). */
export interface VariantLines {
  /** "1 player: + Ancients (Xarth corpses)". */
  head: string;
  role: string;
  /** "+7 items: 4 free slots, then leave 3 Saradomin brew behind" / "+1 item (free slot)". */
  slots: string;
  /** "Xarth phase 2 (50% of the HP): 5 × 14.40 + 1 × 6.10 (Ice Barrage) ÷ 6 = 13.02 DPS per player there; +9.6 s …". */
  team: string;
  /** The kit of the variant player ("your kit" when ticked). */
  mine: string;
}

const SUPPLY_LABELS: Record<string, string> = {
  brew: 'Saradomin brew', restore: 'Super restore', food: 'Food', other: 'Other',
};

const f2 = (x: number) => (Math.round(x * 100) / 100).toFixed(2);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

export const variantLines = (v: PlanVariant, partySize: number, encounterLabel: string): VariantLines => {
  const n = Math.floor(partySize);
  const book = SPELLBOOKS.find((b) => b.id === v.spellbook)?.label ?? v.spellbook;
  const extra = v.extraItems.length;
  const fromFree = Math.min(extra, v.freeSlots);
  const left = v.droppedSupplies.map((d) => `${d.count} ${SUPPLY_LABELS[d.type] ?? d.type}`).join(', ');
  let slots = extra === 0 ? 'no extra items (the kit has them)' : `+${plural(extra, 'item')}: ${plural(fromFree, 'free slot')}`;
  if (left) slots += `, then leave ${left} behind`;
  if (v.overfull) slots += ' (still does not fit 28 slots)';
  const spell = v.loadout.options.find((o) => o.spell)?.spell ?? v.loadout.label;
  const rest = n - v.headcount;
  const team = `${encounterLabel} ${v.where} (${Math.round(v.share * 100)}% of the HP): ${rest} × ${f2(v.baseDps)} + ${v.headcount} × ${f2(v.variantDps)} (${spell}) ÷ ${n}`
    + ` = ${f2(n > 0 ? (rest * v.baseDps + v.headcount * v.variantDps) / n : 0)} DPS per player there`
    + `; +${(Math.round(v.seconds * 10) / 10).toFixed(1)} s on the route (in the times above)`;
  return {
    head: `${plural(v.headcount, 'player')}: ${v.label}`,
    role: `${v.role}.`,
    slots,
    team,
    mine: `The kit above + ${v.loadout.label} (${book} spellbook)`,
  };
};
