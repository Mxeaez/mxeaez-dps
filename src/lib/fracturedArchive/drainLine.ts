import { DefenceReductions } from '@/lib/fracturedArchive/drains';
import { resolveItem } from '@/lib/fracturedArchive/loadout';
import {
  DrainModel, PlannerWeapon, SPEC_WEAPONS, SpecWeapon,
} from '@/lib/fracturedArchive/specs';
import {
  applyOutcome, DefenceDrainWeapon, expectedAttemptsToFloor, inUpstreamOrder,
} from '@/lib/fracturedArchive/teamSpecs';

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
  /** Phase 29: Tonalztics hits of `count` charged specs (shown inline: "×2 (4 hits)"). */
  hits?: number;
  /**
   * Phase 29 (Team): the fewest of this weapon's specs giving the same ranked drain on this boss (teamSpecs.ts
   * `specsNeeded`; `count` is what the team brings); null = not reachable; undefined = not a Team line. Review 2:
   * `neededResult` / `bringsResult` = "86%" (P(floor from the first round)) or "→ Def 167" when the plan doesn't rank at
   * the floor: "needed ×3 (86%) · team brings ×4 (8 hits, 98%)".
   */
  needed?: number | null;
  neededResult?: string;
  bringsResult?: string;
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
  /** Phase 24: a plain remark shown under the line (low hit chance, or one landed spec already reaches the floor). */
  note?: string;
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
  const hits = weapon === 'tonalztics' && unit === 'spec' ? extra?.hits ?? count * 2 : undefined;
  return {
    weapon,
    label,
    image: imageOf(weapon),
    count,
    unit,
    specs,
    hitChance,
    title: `${what}${chance}`,
    ...(short ? { short } : {}),
    ...(hits !== undefined ? { hits } : {}),
  };
};

/** Phase 29: "×2 (4 hits)" (Tonalztics) or "×2". */
export const countText = (count: number, hits?: number): string => `×${count}${hits !== undefined ? ` (${hits} hit${hits === 1 ? '' : 's'})` : ''}`;

/**
 * Phase 29: the Team text of an item. Review 2: "needed ×3 (86%) · team brings ×4 (8 hits, 98%)" — the % is P(floor
 * from the first round) ("→ Def 167" when the plan doesn't rank at the floor); hits only on the team's part (the
 * needed count is specs: "×3 (6 hits)" read as six hits required).
 */
export const neededText = (it: Pick<DrainLineItem, 'weapon' | 'count' | 'hits' | 'needed' | 'neededResult' | 'bringsResult'>): string | undefined => {
  if (it.needed === undefined) return undefined;
  const bringsParts = [it.hits !== undefined ? `${it.hits} hit${it.hits === 1 ? '' : 's'}` : '', it.bringsResult ?? ''].filter(Boolean);
  const brings = `team brings ×${it.count}${bringsParts.length ? ` (${bringsParts.join(', ')})` : ''}`;
  if (it.needed === null) return `${it.weapon === 'ayak' ? 'magic def 0 not reachable' : 'floor not reachable'} · ${brings}`;
  // 0 = the other weapons' specs already reach the floor if they all land
  if (it.needed === 0) return `not needed · ${brings}`;
  return `needed ×${it.needed}${it.neededResult ? ` (${it.neededResult})` : ''} · ${brings}`;
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
  needed?: Partial<Record<PlannerWeapon, { n: number, result: string, brings: string }>>,
): DrainLine => {
  const counts = new Map<PlannerWeapon, number>();
  attempts.forEach((w) => counts.set(w, (counts.get(w) || 0) + 1));
  const shown = (w: SpecWeapon) => counts.has(w as PlannerWeapon) || (wanted[w as PlannerWeapon] ?? 0) > 0;
  return {
    items: ORDER.filter(shown)
      .map((w) => {
        const it = drainLineItem(w, counts.get(w as PlannerWeapon) ?? 0, hitChance[w as PlannerWeapon], undefined, {
          wanted: wanted[w as PlannerWeapon],
        });
        if (!needed || !(w in needed)) return it;
        const nd = needed[w as PlannerWeapon]!;
        const withNeeded = {
          ...it, needed: nd.n, neededResult: nd.result, bringsResult: nd.brings,
        };
        return { ...withNeeded, title: `${neededText(withNeeded)}; ${it.title}` };
      }),
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

/** Phase 24: below this per-spec hit chance the drain line warns that drains are unlikely to land. */
export const LOW_SPEC_HIT_CHANCE = 0.4;

/**
 * Phase 24: the drain line's plain remark for a planned attempt sequence.
 * - Any planned weapon landing < {@link LOW_SPEC_HIT_CHANCE} of its specs: "drains unlikely to land here: 31% per spec"
 *   (several weapons: "Elder maul 31%, BGS 22% per spec").
 * - Else, when one landed Elder maul / DWH spec already reaches the Defence floor (ToA's capped drains: Kephri 80 → 60,
 *   Ba-Ba, Zebak): "1 landed spec reaches the floor (Def 60); ≈ 1.6 specs on average, later ones add nothing".
 */
export const drainLineNote = (
  model: Pick<DrainModel, 'def' | 'floor' | 'magicLevel' | 'outcomes' | 'hitChance'>,
  attempts: PlannerWeapon[],
): string | undefined => {
  const used = ORDER.filter((w) => attempts.includes(w as PlannerWeapon)) as PlannerWeapon[];
  // compared as shown (rounded %), so a 39.9% spec isn't flagged as "40%"
  const low = used.filter((w) => Math.round(model.hitChance[w] * 100) < LOW_SPEC_HIT_CHANCE * 100);
  if (low.length) {
    const what = low.length === 1 && used.length === 1
      ? pctText(model.hitChance[low[0]])
      : low.map((w) => `${LABELS[w]} ${pctText(model.hitChance[w])}`).join(', ');
    return `drains unlikely to land here: ${what} per spec`;
  }
  const defAttempts = inUpstreamOrder(attempts.filter((w): w is DefenceDrainWeapon => w !== 'ayak'));
  const first = defAttempts[0];
  if (defAttempts.length < 2 || model.def <= model.floor || (first !== 'elderMaul' && first !== 'dwh')) return undefined;
  if (applyOutcome(model, first, model.def, { p: 1, hits: 1, damage: 0 }) > model.floor) return undefined;
  const { expected } = expectedAttemptsToFloor(model, defAttempts);
  return `1 landed spec reaches the floor (Def ${model.floor}); ≈ ${expected.toFixed(1)} specs on average, later ones add nothing`;
};
