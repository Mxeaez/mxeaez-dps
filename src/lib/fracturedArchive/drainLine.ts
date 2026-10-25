import { DefenceReductions } from '@/lib/fracturedArchive/drains';
import { resolveItem } from '@/lib/fracturedArchive/loadout';
import {
  DrainModel, PlannerWeapon, SPEC_WEAPONS, SpecWeapon,
} from '@/lib/fracturedArchive/specs';
import {
  applyOutcome, DefenceDrainWeapon, expectedAttemptsToFloor, inUpstreamOrder, TeamNeed,
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
  /**
   * Phase 32: the landed drains of this weapon alone that reach the ranked state (teamSpecs.ts `landedToReach`; Elder
   * maul / DWH specs, Tonalztics hits, BGS damage, Eye of Ayak magic defence drained), from `landedFrom` to `landedTo` (Def;
   * Ayak: magic def); `perCarrier` (Team) = first-round specs per carrier; Solo lines have none (no carriers).
   */
  landed?: number | null;
  landedFrom?: number;
  landedTo?: number;
  /** Phase 32: `landed` counts from the Defence the other weapons' drains leave, e.g. "1 Elder maul spec lands" (teamSpecs.ts `landedNeed`). */
  landedAfterOthers?: string;
  perCarrier?: number;
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

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

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
  let what: string;
  if (unit === 'dmg') what = `${label} specs dealing ${count} damage in total`;
  else what = plural(count, `${label} spec`);
  // Tonalztics: a charged spec hits twice; the hit count is in the tooltip (review fix: shown as specs)
  // phase 32: planned specs count swings (2 per charged spec, each can miss); landed drains (Max-drain buttons) count hits
  if (weapon === 'tonalztics' && unit === 'spec') what += ` (${extra?.hits !== undefined ? plural(extra.hits, 'landed hit') : plural(count * 2, 'swing')})`;
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

type NeedFields = Pick<DrainLineItem, 'weapon' | 'count' | 'needed' | 'neededResult' | 'bringsResult' | 'landed' | 'landedFrom' | 'landedTo' | 'landedAfterOthers' | 'perCarrier'>;

/** Phase 32: "4 landed hits" (Tonalztics), "2 landed specs" (Elder maul / DWH), "≈ 45 damage" (BGS), "≈ 40 magic defence drained" (Ayak). */
const landedText = (weapon: SpecWeapon, n: number): string => {
  if (weapon === 'tonalztics') return plural(n, 'landed hit');
  if (weapon === 'bgs') return `≈ ${n} damage`;
  if (weapon === 'ayak') return `≈ ${n} magic defence drained`;
  return plural(n, 'landed spec');
};

/** Phase 32: "4 specs (2 carriers), 8 swings" (Team, Tonalztics), "3 specs (2 carriers)", "4 specs, 8 swings" (Solo). */
const specsText = (it: NeedFields, n: number, swings: boolean): string => {
  const carriers = it.perCarrier ? ` (${plural(Math.ceil(n / it.perCarrier), 'carrier')})` : '';
  return `${plural(n, 'spec')}${carriers}${swings && it.weapon === 'tonalztics' ? `, ${n * 2} swings` : ''}`;
};

/**
 * Phase 29: the Team text of an item. Phase 32 (the user: "needed ×4 · team brings ×4 (8 hits)" read as 4 people / 8
 * landed hits): every number carries its unit — "needs 4 landed hits · 4 specs (2 carriers), 8 swings · 98%", then
 * " · team: 6 specs (3 carriers) · 99.8%" when the team brings more than needed (left out when equal). The landed count
 * is this weapon's alone from the start Defence to the ranked Defence (`landedToReach`); the % is P(floor from the first
 * round) with the needed specs / with everything brought ("→ Def 167" when the plan doesn't rank at the floor). Solo
 * (no `perCarrier`, needed = count): "needs 4 landed hits · 4 specs, 8 swings · 98%".
 */
export const neededText = (it: NeedFields): string | undefined => {
  if (it.needed === undefined) return undefined;
  const team = it.perCarrier !== undefined;
  const brings = team ? `team: ${specsText(it, it.count, false)}${it.bringsResult ? ` · ${it.bringsResult}` : ''}` : '';
  const join = (head: string, withTeam: boolean) => [head, withTeam ? brings : ''].filter(Boolean).join(' · ');
  if (it.needed === null) return join(it.weapon === 'ayak' ? 'magic def 0 not reachable' : 'floor not reachable', true);
  // 0 = the other weapons' specs already reach the floor if they all land
  if (it.needed === 0) return join('not needed', true);
  let needs = 'needs';
  if (it.landed === null) needs = 'needs the other drains too';
  else if (it.landed !== undefined) needs = `needs ${landedText(it.weapon, it.landed)}${it.landedAfterOthers ? ` once ${it.landedAfterOthers} (Def ${it.landedFrom})` : ''}`;
  const head = [needs, specsText(it, it.needed, true), it.neededResult ?? ''].filter(Boolean).join(' · ');
  return join(head, team && it.count !== it.needed);
};

/**
 * Phase 32: the tooltip's explanation of a "needs …" line: what a landed hit drains, and what the % means.
 */
export const neededExplanation = (it: NeedFields & Pick<DrainLineItem, 'label'>): string | undefined => {
  if (it.needed === undefined || !it.needed || it.landed === undefined || it.landed === null) return undefined;
  const team = it.perCarrier !== undefined;
  const range = it.weapon === 'ayak' ? `magic def ${it.landedFrom} → ${it.landedTo}` : `Def ${it.landedFrom} → ${it.landedTo}`;
  const parts = [it.landedAfterOthers
    ? `${landedText(it.weapon, it.landed)} of ${it.label} take ${range} once ${it.landedAfterOthers} (Def ${it.landedFrom})`
    : `${landedText(it.weapon, it.landed)} of ${it.label} alone take ${range}`];
  if (it.weapon === 'tonalztics') parts.push('a charged Tonalztics spec swings twice and each swing can miss');
  else parts.push('each spec can miss');
  // review: the % counts every weapon's specs (Bork maul 98% includes the Tonalztics; the maul alone is 86%); no % when
  // the line ranks short of the floor ("→ Def X")
  if (it.neededResult && !it.neededResult.startsWith('→')) {
    parts.push(team
      ? `the % is the chance the ${it.weapon === 'ayak' ? 'magic defence reaches 0' : 'Defence reaches the floor'} in the first round with these specs and the other weapons' specs`
      : `the % is the chance the ${it.weapon === 'ayak' ? 'magic defence reaches 0' : 'Defence reaches the floor'} with your specs`);
  }
  return parts.join('; ');
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
  needed?: Partial<Record<PlannerWeapon, TeamNeed>>,
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
        const withNeeded: DrainLineItem = {
          ...it,
          needed: nd.n,
          neededResult: nd.result,
          bringsResult: nd.brings,
          ...(nd.landed !== undefined ? { landed: nd.landed, landedFrom: nd.from, landedTo: nd.to } : {}),
          ...(nd.afterOthers ? { landedAfterOthers: nd.afterOthers } : {}),
          ...(nd.perCarrier ? { perCarrier: nd.perCarrier } : {}),
        };
        const why = neededExplanation(withNeeded);
        return { ...withNeeded, title: `${neededText(withNeeded)}${why ? ` (${why})` : ''}; ${it.title}` };
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
