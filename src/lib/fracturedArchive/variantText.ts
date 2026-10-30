import type { PlanVariant } from '@/lib/fracturedArchive/planner';
import { SPELLBOOKS } from '@/lib/raids/types';

/** Phase 40: the Plan tab's lines for a required variant (pure; VariantsBox.tsx renders them). */
export interface VariantLines {
  /** "1 player: freezes corpses (Ice Barrage, ≥75 magic attack: Kodai wand + …), then back to DPS". */
  head: string;
  /** "Ancient spellbook; one wave every 18.0 s, 3.6 s each (switch, cast, switch back): 80% of their DPS on Xarth phase 2". */
  role: string;
  /** "+3 items (88 magic attack): 4 free slots" / "…, then leave 2 Saradomin brew behind" (the variant player's own). */
  slots: string;
  /** "Xarth phase 2 (50% of the HP): (5 × 13.92 + 1 × 11.14) ÷ 6 = 13.46 DPS per player there; ≈ +2.6 s (same spec plan)". */
  team: string;
  /** The kit of the variant player ("your kit" when ticked). */
  mine: string;
}

const SUPPLY_LABELS: Record<string, string> = {
  brew: 'Saradomin brew', restore: 'Super restore', food: 'Food', other: 'Other',
};

const f2 = (x: number) => (Math.round(x * 100) / 100).toFixed(2);
const f1 = (x: number) => (Math.round(x * 10) / 10).toFixed(1);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

export const variantLines = (v: PlanVariant, partySize: number, encounterLabel: string): VariantLines => {
  const n = Math.floor(partySize);
  const book = SPELLBOOKS.find((b) => b.id === v.spellbook)?.label ?? v.spellbook;
  const extra = v.extraItems.length;
  const fromFree = Math.min(extra, v.freeSlots);
  const left = v.droppedSupplies.map((d) => `${d.count} ${SUPPLY_LABELS[d.type] ?? d.type}`).join(', ');
  let slots = `${extra === 0 ? 'no extra items (the kit has them)' : `+${plural(extra, 'item')}: ${plural(fromFree, 'free slot')}`}`;
  if (left) slots += `, then leave ${left} behind`;
  if (v.overfull) slots += ' (still does not fit 28 slots)';
  slots += ` (${v.magicAttack} magic attack; the freezer's inventory, not yours)`;
  const rest = n - v.headcount;
  const where = `${encounterLabel} ${v.where}`;
  const team = `${where} (${Math.round(v.share * 100)}% of the HP): (${rest} × ${f2(v.baseDps)} + ${v.headcount} × ${f2(v.variantDps)}) ÷ ${n}`
    + ` = ${f2(n > 0 ? (rest * v.baseDps + v.headcount * v.variantDps) / n : 0)} DPS per player there`
    + `; ≈ +${f1(v.seconds)} s (same spec plan)`;
  return {
    head: `${plural(v.headcount, 'player')}: ${v.label}`,
    role: `${book} spellbook; one corpse wave every ${f1(v.waveSeconds)} s, ${f1(v.castSeconds)} s each (switch, ${v.spell}, switch back): ${Math.round(v.keep * 100)}% of their DPS on ${where}.`,
    slots,
    team,
    mine: `The kit above + ${v.switchItems.map((it) => it.name).join(' + ') || 'no switch'} (${book} spellbook)`,
  };
};
