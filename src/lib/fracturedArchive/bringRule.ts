import { Monster } from '@/types/Monster';
import {
  bestDamageVariant, DAMAGE_SPEC_WEAPON_IDS, DAMAGE_SPEC_WEAPONS, DamageSpecProfile, damageSpecRanking, DamageSpecWeapon,
  gainPerFullBar, netSpecDamage,
} from '@/lib/fracturedArchive/damageSpecs';
import { BestSetupAssumptions } from '@/lib/fracturedArchive/presets';
import { DrainStateId, findTarget } from '@/lib/fracturedArchive/bestSetup';
import type {
  EncounterTime, PhaseQuery, PhaseTime, RaidKit,
} from '@/lib/fracturedArchive/raidTime';

/**
 * Phase 38h-3: which damage spec weapons you bring (the bring rule) and the per-boss "Then:" order. Pure, no seconds:
 * a weapon's value on a boss / phase is its gain over your normal hits per full bar (`gainPerFullBar`: net damage per
 * spec ÷ its energy × 100, HP of boss damage), at the Defence the plan's drains leave and your DPS there.
 *
 * - **First**: the weapon ranked first (most HP per bar) on the most bosses / phases (ties: the most HP per bar summed
 *   over every boss / phase, then the weapon order).
 * - **Second**: only on the bosses / phases where the first can't hit (no gain) or another weapon deals at least
 *   {@link BRING_SECOND_FACTOR} × the first's HP per bar; there, the best other weapon is a candidate; the candidate of
 *   the most such bosses / phases is brought (same ties). At most two weapons.
 *
 * Docs: docs/BEST_SETUP.md *Bring rule, no seconds in spec choices (phase 38h-3, FA)*.
 */

export const BRING_SECOND_FACTOR = 1.2;

/** One boss / phase: HP per full bar of each damage spec weapon (≤ 0 or missing: it can't hit / gains nothing). */
export interface PhaseSpecGains {
  key: string;
  label: string;
  gains: Partial<Record<DamageSpecWeapon, number>>;
}

export interface BringDecision {
  first: DamageSpecWeapon | null;
  second: DamageSpecWeapon | null;
  /** [first, second?] (the weapons to bring). */
  bring: DamageSpecWeapon[];
  /** Boss / phase keys where the first ranks first. */
  firstOn: string[];
  /** Boss / phase keys where the second is brought for (the first can't hit or the second deals ≥ 1.2× per bar). */
  secondOn: string[];
  /** The bosses / phases the rule read (HP per full bar of each owned weapon). */
  gains: PhaseSpecGains[];
}

const orderOf = (w: DamageSpecWeapon) => DAMAGE_SPEC_WEAPON_IDS.indexOf(w);
const gainOf = (p: PhaseSpecGains, w: DamageSpecWeapon): number => Math.max(0, p.gains[w] ?? 0);

/** The weapons (of `weapons`) that gain anything on this boss / phase, most HP per bar first (ties: weapon order). */
export const rankedAt = (p: PhaseSpecGains, weapons: DamageSpecWeapon[]): DamageSpecWeapon[] => weapons
  .filter((w) => gainOf(p, w) > 1e-9)
  .sort((a, b) => (gainOf(p, b) - gainOf(p, a)) || (orderOf(a) - orderOf(b)));

/** The weapon with the most votes (ties: Σ HP per bar over every phase, then the weapon order). */
const mostVoted = (votes: Map<DamageSpecWeapon, number>, phases: PhaseSpecGains[]): DamageSpecWeapon | null => {
  let best: DamageSpecWeapon | null = null;
  const total = (w: DamageSpecWeapon) => phases.reduce((t, p) => t + gainOf(p, w), 0);
  votes.forEach((n, w) => {
    if (best === null) {
      best = w;
      return;
    }
    const nb = votes.get(best)!;
    if (n > nb || (n === nb && (total(w) > total(best) + 1e-9
      || (Math.abs(total(w) - total(best)) <= 1e-9 && orderOf(w) < orderOf(best))))) best = w;
  });
  return best;
};

export const bringRule = (phases: PhaseSpecGains[], owned: DamageSpecWeapon[]): BringDecision => {
  const votes = new Map<DamageSpecWeapon, number>();
  phases.forEach((p) => {
    const top = rankedAt(p, owned)[0];
    if (top) votes.set(top, (votes.get(top) ?? 0) + 1);
  });
  const first = mostVoted(votes, phases);
  if (!first) {
    return {
      first: null, second: null, bring: [], firstOn: [], secondOn: [], gains: phases,
    };
  }
  const firstOn = phases.filter((p) => rankedAt(p, owned)[0] === first).map((p) => p.key);
  const others = owned.filter((w) => w !== first);
  const votes2 = new Map<DamageSpecWeapon, number>();
  const candOf = new Map<string, DamageSpecWeapon>();
  phases.forEach((p) => {
    const c = rankedAt(p, others)[0];
    if (!c) return;
    const f = gainOf(p, first);
    if (f > 1e-9 && gainOf(p, c) < BRING_SECOND_FACTOR * f - 1e-9) return;
    candOf.set(p.key, c);
    votes2.set(c, (votes2.get(c) ?? 0) + 1);
  });
  const second = mostVoted(votes2, phases);
  return {
    first,
    second,
    bring: second ? [first, second] : [first],
    firstOn,
    secondOn: second ? phases.filter((p) => candOf.get(p.key) === second).map((p) => p.key) : [],
    gains: phases,
  };
};

/** HP per full bar of one damage spec profile at a DPS (the best variant's net damage per 100% energy; 0: can't hit). */
export const profileGain = (p: DamageSpecProfile, dps: number, hpLeft?: number): number => {
  const v0 = bestDamageVariant(p, dps);
  if (!v0) return 0;
  // as the spec budget values it: a spec deals at most the hp left at the row's start
  const v = hpLeft !== undefined && v0.expected > hpLeft ? { ...v0, expected: Math.max(0, hpLeft) } : v0;
  return gainPerFullBar({ net: netSpecDamage(v, dps), energy: p.energy, canHit: p.canHit });
};

/** Several rows of one boss / phase in one: each weapon's HP per bar weighted by the rows' damage. */
export const mergeGains = (key: string, label: string, rows: { damage: number, gains: PhaseSpecGains['gains'] }[]): PhaseSpecGains => {
  const total = rows.reduce((t, r) => t + Math.max(0, r.damage), 0);
  const gains: PhaseSpecGains['gains'] = {};
  DAMAGE_SPEC_WEAPON_IDS.forEach((w) => {
    if (!rows.some((r) => r.gains[w] !== undefined)) return;
    gains[w] = total > 0
      ? rows.reduce((t, r) => t + Math.max(0, r.damage) * (r.gains[w] ?? 0), 0) / total
      : Math.max(...rows.map((r) => r.gains[w] ?? 0));
  });
  return { key, label, gains };
};

/** "Then: 1. Voidwaker 2. Zaryte crossbow (per bar)": the weapons of `weapons` that gain here, best first; null: none. */
export const thenText = (p: Pick<PhaseSpecGains, 'gains'>, weapons: DamageSpecWeapon[], max = 2): string | null => {
  const ranked = rankedAt({ key: '', label: '', gains: p.gains }, weapons).slice(0, Math.max(1, max));
  if (!ranked.length) return null;
  return `Then: ${ranked.map((w, i) => `${i + 1}. ${DAMAGE_SPEC_WEAPONS[w].label}`).join(' ')} (per bar)`;
};

const noDamageSpecsOf = (targetKey: string): boolean => {
  try {
    return !!findTarget(targetKey).noDamageSpecs;
  } catch {
    return false;
  }
};

/** A row damage specs can take damage off (not a fixed-length phase, not a target without damage specs). */
export const damageSpecRow = (r: Pick<PhaseTime, 'damage' | 'dps' | 'seconds' | 'targetKey' | 'noDamageSpecs' | 'fixedWall'>): boolean => !r.noDamageSpecs
  && !r.fixedWall && r.dps > 0 && r.damage > 0 && Number.isFinite(r.seconds) && !noDamageSpecsOf(r.targetKey);

/**
 * The HP per bar of each weapon on the bosses / phases of a planned route: per row (damage specs allowed), the kit's
 * spec profile at the Defence of the row's drain event (the encounter's spec plan) and the row's DPS; rows of one
 * boss / phase merged by their damage. `byEncounter`: the same over each encounter's rows (the Plan briefing's "Then").
 */
export const routeSpecGains = (
  kit: Pick<RaidKit, 'specDamage'>,
  encounters: Pick<EncounterTime, 'id' | 'phases' | 'specPlan'>[],
  weapons: DamageSpecWeapon[],
  query: { drain: DrainStateId, fightSeconds: number },
): { phases: PhaseSpecGains[], byEncounter: Record<string, PhaseSpecGains> } => {
  const byKey = new Map<string, { label: string, rows: { damage: number, gains: PhaseSpecGains['gains'] }[] }>();
  const byEncounter: Record<string, PhaseSpecGains> = {};
  encounters.forEach((e) => {
    const rows: { damage: number, gains: PhaseSpecGains['gains'] }[] = [];
    e.phases.forEach((r) => {
      if (!damageSpecRow(r) || !kit.specDamage) return;
      const ev = e.specPlan ? e.specPlan.events[e.specPlan.rowEvent[r.key]] : undefined;
      const q: PhaseQuery = {
        targetKey: r.targetKey,
        phase: r.phase,
        drain: query.drain,
        fightSeconds: query.fightSeconds,
        rowKey: r.key,
        ...(ev ? { specs: { counts: ev.counts } } : {}),
      };
      const gains: PhaseSpecGains['gains'] = {};
      weapons.forEach((w) => {
        const p = kit.specDamage!(q, w);
        gains[w] = p ? profileGain(p, r.dps) : 0;
      });
      const k = `${r.targetKey}|${r.phase ?? ''}`;
      if (!byKey.has(k)) byKey.set(k, { label: r.label, rows: [] });
      byKey.get(k)!.rows.push({ damage: r.damage, gains });
      rows.push({ damage: r.damage, gains });
    });
    if (rows.length) byEncounter[e.id] = mergeGains(e.id, e.id, rows);
  });
  return {
    phases: Array.from(byKey.entries()).map(([k, v]) => mergeGains(k, v.label, v.rows)),
    byEncounter,
  };
};

/** Phase 38h-3b: "Then: 1. Zaryte crossbow (per bar) · leftover: Crimson kisten" (`then` null: "Then: leftover: …"). */
export const withLeftover = (then: string | null, filler: DamageSpecWeapon | null | undefined): string | null => {
  if (!filler) return then;
  const tail = `leftover: ${DAMAGE_SPEC_WEAPONS[filler].label}`;
  return then ? `${then} · ${tail}` : `Then: ${tail}`;
};

/**
 * Phase 38h-3b (Search / Summary, no plan): the filler for the energy the first-ranked weapon leaves, the best of the
 * others (most HP per bar) that costs less than the first (energy too little for another of its specs); null: none.
 */
export const leftoverWeapon = (p: Pick<PhaseSpecGains, 'gains'>, weapons: DamageSpecWeapon[]): DamageSpecWeapon | null => {
  const ranked = rankedAt({ key: '', label: '', gains: p.gains }, weapons);
  if (!ranked.length) return null;
  const firstCost = DAMAGE_SPEC_WEAPONS[ranked[0]].energy;
  return ranked.slice(1).find((w) => DAMAGE_SPEC_WEAPONS[w].energy < firstCost) ?? null;
};

/**
 * Phase 38h-3b: the Search / Summary "Then": the top two (per bar) and the leftover weapon ({@link leftoverWeapon});
 * when the leftover weapon is the second, "Then: 1. A (per bar) · leftover: B".
 */
export const thenWithLeftover = (p: Pick<PhaseSpecGains, 'gains'>, weapons: DamageSpecWeapon[]): string | null => {
  const filler = leftoverWeapon(p, weapons);
  if (!filler) return thenText(p, weapons, 2);
  const second = rankedAt({ key: '', label: '', gains: p.gains }, weapons)[1];
  return withLeftover(thenText(p, weapons, second === filler ? 1 : 2), filler);
};

/**
 * Search / Summary: "Then: …" on a monster as the calculator holds it (drains included) for a loadout of `dps`, every
 * damage spec weapon (`damageSpecRanking`, HP per full bar); null when none gains.
 */
export const damageThenText = (monster: Monster, assumptions: BestSetupAssumptions, dps: number, max = 2): string | null => {
  const gains: PhaseSpecGains['gains'] = {};
  damageSpecRanking(monster, assumptions, dps, 1).forEach((r) => { gains[r.weapon] = gainPerFullBar(r); });
  // phase 38h-3b: with the leftover weapon (max 2 only)
  return max === 2 ? thenWithLeftover({ gains }, DAMAGE_SPEC_WEAPON_IDS) : thenText({ gains }, DAMAGE_SPEC_WEAPON_IDS, max);
};

/**
 * Phase 38h-3 (review): the HP a kit change costs on a route, no seconds. Per row of the old kit's pass (by key), its
 * damage H × (1 − the new kit's DPS ÷ the old's), the drain value's form (H × (1 − DPS without ÷ DPS with)); a
 * fixed-length row (Ocellus P2) that × its carry-over (the share that comes off a later phase). Negative where the new
 * kit is faster; rows missing from the new pass, or without damage / DPS in the old, count 0.
 */
export const kitHpCostOf = (
  oldRows: Pick<PhaseTime, 'key' | 'damage' | 'dps' | 'fixedWall' | 'carryOver'>[],
  newRows: Pick<PhaseTime, 'key' | 'dps'>[],
): number => {
  const after = new Map(newRows.map((r) => [r.key, r]));
  return oldRows.reduce((t, r) => {
    const n = after.get(r.key);
    if (!n || !(r.dps > 0) || !(r.damage > 0)) return t;
    const loss = r.damage * (1 - n.dps / r.dps);
    return t + (r.fixedWall ? loss * (r.carryOver ?? 0) : loss);
  }, 0);
};
