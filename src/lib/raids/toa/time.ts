import { DrainStateId } from '@/lib/fracturedArchive/bestSetup';
import {
  EncounterId,
  KitChoice,
  PhaseQuery,
  PhaseTime,
  phaseKey,
  phaseTime,
  PlannedPhase,
  RaidKit,
  RaidTimeAssumptions,
  RaidTimeModel,
  RouteSlot,
  targetHp,
} from '@/lib/fracturedArchive/raidTime';
import { DEFAULT_TOA_INPUTS, ToaTimeSettings } from '@/lib/raids/types';
import {
  AKKHA_FINAL_STAND_PHASE,
  AKKHA_NO_PRAYER_PHASE,
  AKKHA_PRAYING_MAGIC_PHASE,
  AKKHA_PRAYING_MELEE_PHASE,
  AKKHA_PRAYING_RANGED_PHASE,
  P2_ELIDINIS_INITIAL_PHASE,
  P2_TUMEKEN_INITIAL_PHASE,
} from '@/lib/raids/toa/constants';
import { beforeSuppliesKey, LIQUID_ADRENALINE_DOSES_PER_DROP, TOA_ROOMS_BEFORE_SUPPLIES } from '@/lib/raids/toa/supplies';

/**
 * Phase 18: Tombs of Amascut time model (Encounters tab, planner). Same contract as the Fractured Archive's
 * (raidTime.ts): Σ damage required ÷ DPS per phase, the kit's best loadout + style per phase, DPS time only. HP is
 * upstream's verified scaling (src/lib/scaling/TombsOfAmascut.ts: raid level, path level, party size — checked against
 * in-game hp by upstream's src/tests/lib/scaling/TombsOfAmascut.test.ts), so the seconds are meant to be real for a
 * team in which **every member deals the user's DPS**: time = damage ÷ (team-DPS multiplier × DPS), the multiplier
 * defaulting to the party size (`teamDpsMultiplier`, src/lib/raids/base.ts).
 *
 * ToA has no route choice (the four paths in any order, then the Wardens): one fixed route. Encounter sequences, from
 * https://oldschool.runescape.wiki/w/Tombs_of_Amascut/Strategies and the boss pages (read 2026-10-23, ?action=raw):
 * - Kephri: "After the third shield is cleared ... her fourth and final phase; Kephri's health pool is now able to be
 *   damaged directly" → 3 × the Shielded hp (+ `kephriSwarmLeak` × shield per intermission for leaked swarms), the
 *   overlord scarabs ("The first shield threshold will cause a single Spitting Scarab to spawn, while the second
 *   threshold causes a Soldier and Arcane Scarab"), then the Aggressive (unshielded) hp. Swarms are max hits for
 *   whoever clears them: not counted.
 * - Zebak: his hp (the "Enraged" version below ~25% only attacks faster: same stats).
 * - Akkha: "Akkha will change combat styles after he performs six auto-attacks followed by a special attack" and "he
 *   will always pray against the same style with which he is currently attacking": the rotation is by attack count,
 *   i.e. time, so with `akkhaPrayerRotation` each prayer lasts the same time and his hp is dealt in proportion to the
 *   kit's DPS under each (`akkhaRotation`); at 80/60/40/20% one of four Akkha's Shadows must be dispelled ("Only focus one
 *   shadow at a time ... fully restores all damaged shadows") → 4 × the shadow hp; "Upon having his health depleted,
 *   Akkha will make his final stand, restoring 20% of his maximum health ... with Protect from Magic and Missiles" →
 *   20% of his hp in melee.
 * - Ba-Ba: her hp (boulders during Rolling Stones are max hits: not counted).
 * - Wardens: P1 the obelisk's hp. P2: each "down" = break the shielded Warden (the Active version's hp; the warden
 *   prays Melee + Ranged (Elidinis') or Melee + Magic (Tumeken's), "initially" — kept all fight, unverified), then the
 *   core is exposed for 21 / 29 / 37 ticks (Warden hp ≥ 80% / ≥ 60% / below, Strategies table) and "Damage dealt to the
 *   core deals five times the damage towards the Warden"; downs repeat until the Warden's hp (the Core-ejected
 *   version's hp, which upstream scales with a quarter of the raid-level factor) is gone. P3: "Upon reaching 5% of its
 *   health ... a one-time heal of 20.0% of its maximum health ... Defence ... raised 30 levels to 180" → 95% at the
 *   Damaged version, 25% at the Enraged version; reversed energy siphons take a share (`p3SiphonFraction`, unpublished).
 *   Both wardens have the same stats per phase, so P3 is always modelled on Tumeken's Warden's entries.
 * Not modelled (documented in docs/BEST_SETUP.md): invulnerable periods (Akkha's memory blast, Ba-Ba's rolling stones,
 * Zebak's specials, warden siphon phases), puzzles / paths, the phantoms, healing (Kephri's soldier scarab swarms).
 */

export const TOA_TIME_DEFAULTS: ToaTimeSettings = {
  p2Warden: 'elidinis',
  akkhaPrayerRotation: true,
  kephriSwarmLeak: 0,
  kephriOverlords: true,
  p3SiphonFraction: 0,
};

export type ToaEncounterId = 'toa-kephri' | 'toa-zebak' | 'toa-akkha' | 'toa-baba' | 'toa-wardens';

export const TOA_ENCOUNTER_LABELS: Record<ToaEncounterId, string> = {
  'toa-kephri': 'Kephri',
  'toa-zebak': 'Zebak',
  'toa-akkha': 'Akkha',
  'toa-baba': 'Ba-Ba',
  'toa-wardens': 'Wardens',
};

/** The target whose icon stands for each encounter (UI). */
export const TOA_ENCOUNTER_TARGET: Record<ToaEncounterId, string> = {
  'toa-kephri': 'toa-kephri',
  'toa-zebak': 'toa-zebak',
  'toa-akkha': 'toa-akkha',
  'toa-baba': 'toa-baba',
  'toa-wardens': 'toa-warden-p3',
};

/** One fixed route: the four paths (Scabaras, Crondis, Het, Apmeken — any order, times don't depend on it), then the Wardens. */
export const TOA_ROUTE_SLOTS: RouteSlot[] = (Object.keys(TOA_ENCOUNTER_LABELS) as ToaEncounterId[])
  .map((id, i) => ({ order: i + 1, options: [id] }));

export const TOA_ROUTE_ID = TOA_ROUTE_SLOTS.map((s) => s.options[0]).join('>');

/** "Strategies → The Wardens → Phase 2": core exposure in ticks by the Warden's remaining hp. */
export const CORE_EXPOSURE_TICKS: { minFraction: number, ticks: number }[] = [
  { minFraction: 0.8, ticks: 21 },
  { minFraction: 0.6, ticks: 29 },
  { minFraction: 0, ticks: 37 },
];

/** "Damage dealt to the core deals five times the damage towards the Warden". */
export const CORE_DAMAGE_MULTIPLIER = 5;

/** Akkha's final stand restores 20% of his max hp; the P3 Warden enrages at 5% and heals 20%. */
export const AKKHA_FINAL_STAND_FRACTION = 0.2;
export const P3_ENRAGE_AT = 0.05;
export const P3_ENRAGE_HEAL = 0.2;
export const AKKHA_SHADOWS = 4;
export const KEPHRI_SHIELDS = 3;

const MAX_DOWNS = 100;

export const coreExposureSeconds = (remainingFraction: number): number => {
  const row = CORE_EXPOSURE_TICKS.find((r) => remainingFraction >= r.minFraction - 1e-9) ?? CORE_EXPOSURE_TICKS[CORE_EXPOSURE_TICKS.length - 1];
  return row.ticks * 0.6;
};

/** The ToA model's own settings object (missing fields = defaults). */
export const toaSettings = (a: RaidTimeAssumptions): ToaTimeSettings => ({ ...TOA_TIME_DEFAULTS, ...(a.settings as Partial<ToaTimeSettings>) });

/** Party size used for hp and the team-DPS factor (ToA: 1-8). */
export const toaPartySize = (a: Pick<RaidTimeAssumptions, 'partySize'>): number => Math.min(8, Math.max(1, Math.trunc(a.partySize)));

/** Scaled hp of a ToA target for these assumptions (upstream's scaleMonster through buildTargetMonster). */
export const toaHp = (a: RaidTimeAssumptions, targetKey: string, phase?: string): number => targetHp(
  targetKey,
  phase,
  toaPartySize(a),
  { raid: 'toa', toa: a.toa || DEFAULT_TOA_INPUTS },
);

const pct = (f: number): string => `${Math.round(f * 1000) / 10}%`;

/** The P2 warden target and its prayer phase. */
export const p2WardenTarget = (s: ToaTimeSettings): { targetKey: string, phase: string } => (s.p2Warden === 'tumeken'
  ? { targetKey: 'toa-warden-p2-tumeken', phase: P2_TUMEKEN_INITIAL_PHASE }
  : { targetKey: 'toa-warden-p2', phase: P2_ELIDINIS_INITIAL_PHASE });

/**
 * Phase 38a: the encounters fought before the first supply drop (the first `TOA_ROOMS_BEFORE_SUPPLIES` rooms of the
 * fixed route: Kephri, Zebak). Their rows target the `-before-supplies` copies (normal potions, supplies.ts).
 */
export const TOA_BEFORE_SUPPLIES_ENCOUNTERS: EncounterId[] = TOA_ROUTE_SLOTS.slice(0, TOA_ROOMS_BEFORE_SUPPLIES).map((s) => s.options[0]);

/**
 * Phase 38b: Liquid adrenaline doses per encounter (drunk at its start, back to back): the first supply drop's 2 doses
 * over the two rooms after it (one each: Akkha, Ba-Ba), the second drop's 2 on the Wardens. None before the supplies.
 */
export const TOA_ADRENALINE_DOSES: Partial<Record<EncounterId, number>> = Object.fromEntries(TOA_ROUTE_SLOTS.map((s, i) => {
  const id = s.options[0];
  if (i < TOA_ROOMS_BEFORE_SUPPLIES) return [id, 0];
  if (i === TOA_ROUTE_SLOTS.length - 1) return [id, LIQUID_ADRENALINE_DOSES_PER_DROP];
  return [id, LIQUID_ADRENALINE_DOSES_PER_DROP / (TOA_ROUTE_SLOTS.length - 1 - TOA_ROOMS_BEFORE_SUPPLIES)];
}));

/** A planned phase of a room before the supplies: its target's copy, the label says so. */
const beforeSupplies = (p: PlannedPhase): PlannedPhase => ({
  ...p, targetKey: beforeSuppliesKey(p.targetKey), label: `${p.label} (before supplies: normal potions)`,
});

const toaRoomPlan = (id: EncounterId, a: RaidTimeAssumptions): PlannedPhase[] => {
  const s = toaSettings(a);
  const hp = (t: string, p?: string) => toaHp(a, t, p);
  switch (id) {
    case 'toa-kephri': {
      const shield = hp('toa-kephri-shielded');
      const leak = Math.min(1, Math.max(0, s.kephriSwarmLeak));
      const rows: PlannedPhase[] = [{
        key: 'kephri-shield',
        label: `Shield × ${KEPHRI_SHIELDS}${leak ? ` (+ ${pct(leak)} leaked swarms × ${KEPHRI_SHIELDS - 1})` : ''}`,
        targetKey: 'toa-kephri-shielded',
        damage: shield * (KEPHRI_SHIELDS + (KEPHRI_SHIELDS - 1) * leak),
      }];
      if (s.kephriOverlords) {
        rows.push(
          {
            key: 'kephri-spitting', label: 'Spitting Scarab (intermission 1)', targetKey: 'toa-spitting-scarab', damage: hp('toa-spitting-scarab'),
          },
          {
            key: 'kephri-soldier', label: 'Soldier Scarab (intermission 2)', targetKey: 'toa-soldier-scarab', damage: hp('toa-soldier-scarab'),
          },
          {
            key: 'kephri-arcane', label: 'Arcane Scarab (intermission 2)', targetKey: 'toa-arcane-scarab', damage: hp('toa-arcane-scarab'),
          },
        );
      }
      // phase 36: "the defence level is reset for the final phase" (Kephri, wiki): a new drain event
      rows.push({
        key: 'kephri-final', label: 'Unshielded (final phase)', targetKey: 'toa-kephri', damage: hp('toa-kephri'), drainReset: 'the final phase',
      });
      return rows;
    }
    case 'toa-zebak':
      return [{
        key: 'zebak', label: 'Zebak', targetKey: 'toa-zebak', damage: hp('toa-zebak'),
      }];
    case 'toa-akkha': {
      const akkha = hp('toa-akkha', AKKHA_NO_PRAYER_PHASE);
      // with the prayer rotation, his main hp depends on the kit's DPS under each prayer: built in toaEncounterPass
      const rows: PlannedPhase[] = s.akkhaPrayerRotation ? [] : [{
        key: 'akkha', label: 'Akkha (an unprotected style)', targetKey: 'toa-akkha', phase: AKKHA_NO_PRAYER_PHASE, damage: akkha,
      }];
      rows.push(
        {
          key: 'akkha-shadows',
          label: `Akkha's Shadow × ${AKKHA_SHADOWS} (one per 20% threshold)`,
          targetKey: 'toa-akkha-shadow',
          damage: AKKHA_SHADOWS * hp('toa-akkha-shadow'),
          // phase 38b: four kills (Death Charge)
          kills: AKKHA_SHADOWS,
        },
        {
          key: 'akkha-final', label: `Final stand (${pct(AKKHA_FINAL_STAND_FRACTION)} of hp, melee only)`, targetKey: 'toa-akkha', phase: AKKHA_FINAL_STAND_PHASE, damage: akkha * AKKHA_FINAL_STAND_FRACTION,
        },
      );
      return rows;
    }
    case 'toa-baba':
      return [{
        key: 'baba', label: 'Ba-Ba', targetKey: 'toa-baba', damage: hp('toa-baba'),
      }];
    case 'toa-wardens': {
      const p3 = hp('toa-warden-p3');
      const siphon = Math.min(1 - P3_ENRAGE_AT, Math.max(0, s.p3SiphonFraction));
      return [
        {
          key: 'wardens-p1', label: 'P1 obelisk', targetKey: 'toa-obelisk', damage: hp('toa-obelisk'),
        },
        {
          key: 'wardens-p3',
          label: `P3 (${pct(1 - P3_ENRAGE_AT)} of hp${siphon ? `, ${pct(siphon)} by siphons` : ''})`,
          targetKey: 'toa-warden-p3',
          damage: p3 * (1 - P3_ENRAGE_AT - siphon),
        },
        {
          key: 'wardens-p3-enraged',
          label: `P3 enraged (last ${pct(P3_ENRAGE_AT)} + ${pct(P3_ENRAGE_HEAL)} heal)`,
          targetKey: 'toa-warden-p3-enraged',
          damage: p3 * (P3_ENRAGE_AT + P3_ENRAGE_HEAL),
          // phase 36: "When entering the enraged state, the Warden's base defence level is reset to 180" (Tumeken's
          // Warden, wiki): a new drain event
          drainReset: 'the enrage',
        },
      ];
    }
    default:
      throw new Error(`ToA time model: unknown encounter '${id}'`);
  }
};

/** The fixed-damage phases of an encounter (the Wardens' P2 depends on DPS and is built in `toaEncounterPass`). */
export const toaEncounterPlan = (id: EncounterId, a: RaidTimeAssumptions): PlannedPhase[] => {
  const rows = toaRoomPlan(id, a);
  return TOA_BEFORE_SUPPLIES_ENCOUNTERS.includes(id) ? rows.map(beforeSupplies) : rows;
};

export interface WardensP2Result {
  downs: number;
  shieldSeconds: number;
  coreSeconds: number;
  /** Warden hp (Core-ejected version) and the shield hp per down (Active version). */
  wardenHp: number;
  shieldHp: number;
}

/**
 * Wardens P2 (see the file comment): downs until the Warden's hp is gone; each down = shield hp at `shieldRate`, then
 * one core exposure at `coreRate` (damage to the core per second; × 5 to the Warden), capped by the remaining hp.
 * Rates are team rates (team-DPS multiplier × DPS). Infinite when a rate is 0 or more than 100 downs are needed.
 */
export const wardensP2Time = (wardenHp: number, shieldHp: number, shieldRate: number, coreRate: number): WardensP2Result => {
  let remaining = wardenHp;
  let downs = 0;
  let shieldSeconds = 0;
  let coreSeconds = 0;
  if (wardenHp <= 0) {
    return {
      downs: 0, shieldSeconds: 0, coreSeconds: 0, wardenHp, shieldHp,
    };
  }
  if (shieldRate <= 0 || coreRate <= 0) {
    return {
      downs: Infinity, shieldSeconds: shieldRate <= 0 ? Infinity : 0, coreSeconds: coreRate <= 0 ? Infinity : 0, wardenHp, shieldHp,
    };
  }
  while (remaining > 1e-9 && downs < MAX_DOWNS) {
    downs += 1;
    shieldSeconds += shieldHp / shieldRate;
    const window = coreExposureSeconds(remaining / wardenHp);
    const dealt = Math.min(remaining, coreRate * CORE_DAMAGE_MULTIPLIER * window);
    coreSeconds += dealt / (coreRate * CORE_DAMAGE_MULTIPLIER);
    remaining -= dealt;
  }
  if (remaining > 1e-9) {
    return {
      downs: Infinity, shieldSeconds: Infinity, coreSeconds: Infinity, wardenHp, shieldHp,
    };
  }
  return {
    downs, shieldSeconds, coreSeconds, wardenHp, shieldHp,
  };
};

const teamNote = (n: number) => (n !== 1 ? `team of ${n} at your DPS` : undefined);

export const AKKHA_PRAYER_PHASES = [AKKHA_PRAYING_MELEE_PHASE, AKKHA_PRAYING_RANGED_PHASE, AKKHA_PRAYING_MAGIC_PHASE];

/**
 * Akkha's prayer rotation: equal time under each prayer. With team rates r_i (multiplier × the kit's best DPS under
 * prayer i), each prayer lasts t = hp ÷ Σ r_i and takes hp × r_i ÷ Σ r_i; a prayer under which the kit deals nothing
 * still costs its t. Infinite when the kit deals nothing under every prayer.
 */
export const akkhaRotation = (hp: number, rates: number[]): { seconds: number, damage: number }[] => {
  const sum = rates.reduce((t, r) => t + Math.max(0, r), 0);
  if (hp <= 0) return rates.map(() => ({ seconds: 0, damage: 0 }));
  if (sum <= 0) return rates.map(() => ({ seconds: Infinity, damage: hp / rates.length }));
  const t = hp / sum;
  return rates.map((r) => ({ seconds: t, damage: (hp * Math.max(0, r)) / sum }));
};

/** One pass over a ToA encounter (the model's `encounterPass`). */
export const toaEncounterPass = (
  id: EncounterId,
  kit: RaidKit,
  a: RaidTimeAssumptions,
  drain: DrainStateId,
  fightSeconds: number,
): PhaseTime[] => {
  const mult = a.dpsMultiplier ?? 1;
  const note = teamNote(mult);
  const rows = toaEncounterPlan(id, a)
    .filter((p) => p.damage > 0)
    .map((p) => ({ ...phaseTime(p, kit, drain, fightSeconds, mult), ...(note ? { note } : {}) }));
  const best = (q: Omit<PhaseQuery, 'drain' | 'fightSeconds'>): KitChoice | null => kit.best({ ...q, drain, fightSeconds });
  if (id === 'toa-akkha' && toaSettings(a).akkhaPrayerRotation) {
    const hp = toaHp(a, 'toa-akkha', AKKHA_NO_PRAYER_PHASE);
    const choices = AKKHA_PRAYER_PHASES.map((phase) => best({ targetKey: 'toa-akkha', phase }));
    const split = akkhaRotation(hp, choices.map((c) => (c?.dps ?? 0) * mult));
    const rotation: PhaseTime[] = AKKHA_PRAYER_PHASES.map((phase, i) => ({
      key: `akkha-${phase}`,
      label: `Akkha, ${phase} (⅓ of the time)`,
      targetKey: 'toa-akkha',
      phase,
      damage: split[i].damage,
      choice: choices[i],
      dps: choices[i]?.dps ?? 0,
      seconds: split[i].seconds,
      ...(note ? { note } : {}),
    }));
    return [...rotation, ...rows];
  }
  if (id !== 'toa-wardens') return rows;

  // P2, between P1 and P3
  const s = toaSettings(a);
  const warden = p2WardenTarget(s);
  const shieldHp = toaHp(a, warden.targetKey, warden.phase);
  const wardenHp = toaHp(a, 'toa-warden-core');
  const shieldChoice = best(warden);
  const coreChoice = best({ targetKey: 'toa-warden-core' });
  const shieldDps = shieldChoice?.dps ?? 0;
  const coreDps = coreChoice?.dps ?? 0;
  const p2 = wardensP2Time(wardenHp, shieldHp, shieldDps * mult, coreDps * mult);
  const downs = Number.isFinite(p2.downs) ? p2.downs : 0;
  const p2Rows: PhaseTime[] = [
    {
      key: 'wardens-p2-shield',
      label: `P2 shield (${Number.isFinite(p2.downs) ? `${p2.downs} downs` : 'can\'t finish'} × ${Math.round(shieldHp)}, ${warden.phase})`,
      targetKey: warden.targetKey,
      phase: warden.phase,
      damage: downs * shieldHp,
      choice: shieldChoice,
      dps: shieldDps,
      seconds: p2.shieldSeconds,
      ...(note ? { note } : {}),
    },
    {
      key: 'wardens-p2-core',
      label: `P2 core (${Math.round(wardenHp)} Warden hp ÷ ${CORE_DAMAGE_MULTIPLIER}; exposures ${CORE_EXPOSURE_TICKS.map((r) => r.ticks).join('/')} ticks)`,
      targetKey: 'toa-warden-core',
      damage: wardenHp / CORE_DAMAGE_MULTIPLIER,
      choice: coreChoice,
      dps: coreDps,
      seconds: p2.coreSeconds,
      ...(note ? { note } : {}),
    },
  ];
  return [rows[0], ...p2Rows, ...rows.slice(1)];
};

/** Every target / phase the model may query (recorded by running each encounter with a recorder kit). */
export const toaRequiredPhaseTargets = (a: RaidTimeAssumptions): { targetKey: string, phase?: string }[] => {
  const seen = new Map<string, { targetKey: string, phase?: string }>();
  const recorder: RaidKit = {
    best: (q) => {
      const k = phaseKey(q.targetKey, q.phase);
      if (!seen.has(k)) seen.set(k, { targetKey: q.targetKey, phase: q.phase });
      return { loadout: 'x', style: 'x', dps: 1 };
    },
  };
  (Object.keys(TOA_ENCOUNTER_LABELS) as ToaEncounterId[]).forEach((id) => toaEncounterPass(id, recorder, a, 'none', a.fallbackFightSeconds));
  return Array.from(seen.values());
};

export const TOA_TIME_MODEL: RaidTimeModel = {
  id: 'toa',
  routeSlots: TOA_ROUTE_SLOTS,
  labels: TOA_ENCOUNTER_LABELS,
  encounterPass: toaEncounterPass,
  requiredPhaseTargets: toaRequiredPhaseTargets,
  adrenalineDoses: TOA_ADRENALINE_DOSES,
};
