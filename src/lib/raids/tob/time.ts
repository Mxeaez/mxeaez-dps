import { DrainStateId } from '@/lib/fracturedArchive/bestSetup';
import {
  EncounterId,
  KitChoice,
  phaseKey,
  PhaseQuery,
  phaseTime,
  PhaseTime,
  PlannedPhase,
  RaidKit,
  RaidTimeAssumptions,
  RaidTimeModel,
  RouteSlot,
  targetHp,
  timeOf,
} from '@/lib/fracturedArchive/raidTime';
import {
  DEFAULT_TOB_INPUTS, TobMode, TobTimeSettings,
} from '@/lib/raids/types';
import { akkhaRotation } from '@/lib/raids/toa/time';
import {
  BLOAT_DOWN_SECONDS,
  DAWNBRINGER_SPEC_AVERAGE,
  DAWNBRINGER_SPEC_SECONDS,
  DAWNBRINGER_SPECS_PER_PLAYER,
  MAIDEN_THRESHOLDS,
  PRINKIPAS_COUNT,
  SOTETSEG_MAZES,
  TOB_MAX_PARTY,
  TOB_MIN_PARTY,
  VERZIK_HM_FINAL_HEAL,
  VERZIK_P1_NO_DAWNBRINGER,
  XARPUS_P3_FRACTION,
  XARPUS_P3_FRACTION_ENTRY,
  XARPUS_START_FRACTION,
} from '@/lib/raids/tob/constants';

/**
 * Phase 20: Theatre of Blood time model (Encounters tab, planner). Same contract as the other raids (raidTime.ts):
 * Σ damage required ÷ (team-DPS multiplier × DPS) per phase, the kit's best loadout + style per phase, DPS time only (no
 * walking, mazes, invulnerable or non-damage phases). HP is upstream's ToB scaling (src/lib/scaling/TheatreOfBlood.ts;
 * the wiki: "With a team of three or fewer players the bosses will have 75% of their original hitpoints, with four
 * players the bosses will have 87.5% ... five players will leave the bosses' hitpoints unchanged"), so the team-DPS
 * multiplier defaults to the party size.
 *
 * "The Theatre of Blood is a linear raid ... the bosses will always be encountered in this order" (Strategies): one
 * route. Sequences, from https://oldschool.runescape.wiki/w/Theatre_of_Blood/Strategies, .../Hard_Mode and the boss
 * pages (read 2026-10-23, ?action=raw):
 * - Maiden: her hp in four segments, 100 → 70 → 50 → 30 → 0% (she "will summon a group of Nylocas Matomenos whenever she
 *   first reaches 70%, 50%, and 30% of her health"); leaked Matomenos heal "double the amount of their current
 *   Hitpoints" → `maidenNyloHeal` × hp added after each spawn (0 = all frozen). One version: the "70% / 50% / 30% Health"
 *   versions have the same stats. Blood spawn heals: not counted.
 * - Bloat: only damaged while down ("any damage dealt to the Bloat while active is halved"; teams only attack when it
 *   shuts down); "If its Defence has been reduced, it will regenerate to full when it stomps", so the drain state only
 *   applies to the first down: min(hp, team DPS × `bloatDownSeconds`) at `tob-bloat`, the rest at `tob-bloat-restored`
 *   (no drains). Walks between downs: not DPS time.
 * - Nylocas: the 31 waves are on a fixed spawn schedule (not DPS-limited): not counted. Hard Mode: three Nylocas
 *   Prinkipas ("working similarly to normal mode Vasilias") then the Vasilias. Both change form every 10 ticks and are
 *   "immune to damage of the wrong combat style": with `nyloRotation` each form lasts the same time (hp split by the
 *   kit's best DPS in each form, like Akkha in ToA); off = a third of the hp per form.
 * - Sotetseg: three thirds of his hp; "After clearing the maze, Sotetseg's Defence level is restored, necessitating
 *   further Defence-draining special attacks" — each third is planned with its own drains (the spec roles 1 / 2 / 3).
 *   The mazes are not DPS time.
 * - Xarpus: P1 "starting with 75% of his health" + exhumed heals (`xarpusExhumedHeal`); P2 down to "~25% of his health"
 *   (Entry Mode 22.5%), then P3. P2 and P3 share one infobox (no stat change); P3's stare (attack from the quadrant he
 *   isn't watching) isn't modelled.
 * - Verzik: P1 = Dawnbringer specs (`verzikDawnbringerSpecs` per player × the team-DPS multiplier, 75-150 each → 112.5;
 *   each one is a 4-tick attack of one player's time: specs × 2.4 s ÷ the same multiplier) + the rest of the shield at the kit's capped DPS (the cap is
 *   upstream's: min(hit, a uniform roll 0-10 / 0-3)). There is one Dawnbringer, so one player uses the kit's best on
 *   P1 (which may be the Dawnbringer) and the other (team − 1) the kit's best without it (phase "Shield (Dawnbringer
 *   with a teammate)"); P2 her hp (+ `verzikP2Heal`); P3 her hp (+ `verzikP3Heal`; Hard Mode: + 30%, "a one-time heal ... 30%
 *   of her health"). Webs / yellows (invulnerable) and the P2 → P3 transition are not DPS time.
 */

export const TOB_TIME_DEFAULTS: TobTimeSettings = {
  maidenNyloHeal: 0,
  bloatDownSeconds: BLOAT_DOWN_SECONDS,
  nyloRotation: true,
  xarpusExhumedHeal: 0,
  verzikDawnbringerSpecs: DAWNBRINGER_SPECS_PER_PLAYER,
  verzikP2Heal: 0,
  verzikP3Heal: 0,
};

export type TobEncounterId = 'tob-maiden' | 'tob-bloat' | 'tob-nylocas' | 'tob-sotetseg' | 'tob-xarpus' | 'tob-verzik';

export const TOB_ENCOUNTER_LABELS: Record<TobEncounterId, string> = {
  'tob-maiden': 'The Maiden of Sugadinti',
  'tob-bloat': 'Pestilent Bloat',
  'tob-nylocas': 'Nylocas',
  'tob-sotetseg': 'Sotetseg',
  'tob-xarpus': 'Xarpus',
  'tob-verzik': 'Verzik Vitur',
};

/** The target whose icon stands for each encounter (UI). */
export const TOB_ENCOUNTER_TARGET: Record<TobEncounterId, string> = {
  'tob-maiden': 'tob-maiden',
  'tob-bloat': 'tob-bloat',
  'tob-nylocas': 'tob-nylo-boss-melee',
  'tob-sotetseg': 'tob-sotetseg',
  'tob-xarpus': 'tob-xarpus',
  'tob-verzik': 'tob-verzik-p3',
};

/** One fixed route, in the raid's order. */
export const TOB_ROUTE_SLOTS: RouteSlot[] = (Object.keys(TOB_ENCOUNTER_LABELS) as TobEncounterId[])
  .map((id, i) => ({ order: i + 1, options: [id] }));

export const TOB_NYLO_FORMS = ['melee', 'ranged', 'magic'] as const;

/** The ToB model's own settings object (missing fields = defaults). */
export const tobSettings = (a: Pick<RaidTimeAssumptions, 'settings'>): TobTimeSettings => ({
  ...TOB_TIME_DEFAULTS, ...(a.settings as Partial<TobTimeSettings>),
});

export const tobPartySize = (a: Pick<RaidTimeAssumptions, 'partySize'>): number => Math
  .min(TOB_MAX_PARTY, Math.max(TOB_MIN_PARTY, Math.trunc(a.partySize)));

export const tobMode = (a: Pick<RaidTimeAssumptions, 'tob'>): TobMode => (a.tob || DEFAULT_TOB_INPUTS).mode;

/** Scaled hp of a ToB target for these assumptions (mode and party size; upstream's scaleMonster via buildTargetMonster). */
export const tobHp = (a: RaidTimeAssumptions, targetKey: string): number => targetHp(
  targetKey,
  undefined,
  tobPartySize(a),
  { raid: 'tob', tob: a.tob || DEFAULT_TOB_INPUTS },
);

const pct = (f: number): string => `${Math.round(f * 1000) / 10}%`;
const frac = (f: number, max = 1) => Math.min(max, Math.max(0, Number.isFinite(f) ? f : 0));

/**
 * Total Dawnbringer special-attack damage at Verzik P1 (capped at P1's hp) and the number of specs. Phase 21: the specs
 * come from the same team as every other phase's time, the team-DPS multiplier ("N players at your DPS"; default the
 * party size), not the party size: N players × specs each, done in specs × 2.4 s ÷ N (`tobEncounterPass`), so changing
 * "Team DPS ×" changes the spec count and its time together (each player's share stays specs-per-player × 2.4 s). The
 * multiplier may be fractional (a weaker / stronger team); so may the spec count.
 */
export const dawnbringerSpecs = (a: RaidTimeAssumptions): { specs: number, damage: number } => {
  const perPlayer = Math.max(0, Math.trunc(Number(tobSettings(a).verzikDawnbringerSpecs) || 0));
  const team = Math.max(0, a.dpsMultiplier ?? 1);
  const specs = perPlayer * team;
  return { specs, damage: Math.min(tobHp(a, 'tob-verzik-p1'), specs * DAWNBRINGER_SPEC_AVERAGE) };
};

const nyloFormRows = (prefix: string, label: string, keyOf: (f: string) => string, hp: number): PlannedPhase[] => TOB_NYLO_FORMS
  .map((f) => ({
    key: `${prefix}-${f}`, label: `${label}, ${f} form (⅓ of the hp)`, targetKey: keyOf(f), damage: hp / 3,
  }));

/**
 * The damage to deal per phase of a ToB encounter. Bloat's split between its first down and the rest, the nylocas
 * form rotation and the Dawnbringer specs' time depend on the kit and are done in `tobEncounterPass`; here Bloat is all
 * at `tob-bloat` and each form gets a third of the hp.
 */
export const tobEncounterPlan = (id: EncounterId, a: RaidTimeAssumptions): PlannedPhase[] => {
  const s = tobSettings(a);
  const mode = tobMode(a);
  const hp = (t: string) => tobHp(a, t);
  switch (id) {
    case 'tob-maiden': {
      const maiden = hp('tob-maiden');
      const heal = frac(s.maidenNyloHeal);
      const marks = [1, ...MAIDEN_THRESHOLDS, 0];
      return marks.slice(1).map((to, i) => {
        const from = marks[i];
        const extra = i > 0 ? heal : 0;
        return {
          key: `maiden-${Math.round(from * 100)}`,
          label: `${pct(from)} → ${pct(to)}${i > 0 ? ` (after the ${pct(from)} nylocas${extra ? `, + ${pct(extra)} leaked` : ''})` : ''}`,
          targetKey: 'tob-maiden',
          damage: maiden * (from - to + extra),
        };
      });
    }
    case 'tob-bloat':
      return [{
        key: 'bloat', label: 'Pestilent Bloat (while down)', targetKey: 'tob-bloat', damage: hp('tob-bloat'),
      }];
    case 'tob-nylocas': {
      const rows: PlannedPhase[] = [];
      if (mode === 'hard') {
        for (let i = 1; i <= PRINKIPAS_COUNT; i++) {
          rows.push(...nyloFormRows(`prinkipas${i}`, `Nylocas Prinkipas ${i} of ${PRINKIPAS_COUNT}`, (f) => `tob-prinkipas-${f}`, hp('tob-prinkipas-melee')));
        }
      }
      rows.push(...nyloFormRows('vasilias', 'Nylocas Vasilias', (f) => `tob-nylo-boss-${f}`, hp('tob-nylo-boss-melee')));
      return rows;
    }
    case 'tob-sotetseg': {
      const sote = hp('tob-sotetseg');
      const n = SOTETSEG_MAZES + 1;
      return Array.from({ length: n }, (_, i) => ({
        key: `sotetseg-${i + 1}`,
        label: `${i + 1}/${n} of his hp${i > 0 ? ` (after maze ${i}: Defence restored)` : ''}`,
        targetKey: 'tob-sotetseg',
        damage: sote / n,
        // phase 33: a new drain event (the team specs again after each maze)
        ...(i > 0 ? { drainReset: `maze ${i}` } : {}),
      }));
    }
    case 'tob-xarpus': {
      const xarpus = hp('tob-xarpus');
      const p3 = mode === 'entry' ? XARPUS_P3_FRACTION_ENTRY : XARPUS_P3_FRACTION;
      const heal = frac(s.xarpusExhumedHeal, 1 - XARPUS_START_FRACTION);
      const start = XARPUS_START_FRACTION + heal;
      return [
        {
          key: 'xarpus-p2', label: `P2 ${pct(start)} → ${pct(p3)}${heal ? ` (+ ${pct(heal)} exhumed heals)` : ''}`, targetKey: 'tob-xarpus', damage: xarpus * Math.max(0, start - p3),
        },
        {
          key: 'xarpus-p3', label: `P3 ${pct(p3)} → 0 (same stats)`, targetKey: 'tob-xarpus', damage: xarpus * p3,
        },
      ];
    }
    case 'tob-verzik': {
      const p1 = hp('tob-verzik-p1');
      const spec = dawnbringerSpecs(a);
      const h2 = frac(s.verzikP2Heal, 5);
      const h3 = frac(s.verzikP3Heal, 5) + (mode === 'hard' ? VERZIK_HM_FINAL_HEAL : 0);
      return [
        {
          key: 'verzik-p1-dawnbringer', label: `P1: Dawnbringer specs × ${Math.round(spec.specs * 10) / 10} (75-150)`, targetKey: 'tob-verzik-p1', damage: spec.damage,
        },
        {
          key: 'verzik-p1', label: 'P1: rest of the shield (damage capped)', targetKey: 'tob-verzik-p1', damage: Math.max(0, p1 - spec.damage),
        },
        {
          key: 'verzik-p2', label: `P2${h2 ? ` (+ ${pct(h2)} heals)` : ''}`, targetKey: 'tob-verzik-p2', damage: hp('tob-verzik-p2') * (1 + h2),
        },
        {
          key: 'verzik-p3', label: `P3${h3 ? ` (+ ${pct(h3)} heals${mode === 'hard' ? ', incl. the Hard Mode 30% heal' : ''})` : ''}`, targetKey: 'tob-verzik-p3', damage: hp('tob-verzik-p3') * (1 + h3),
        },
      ];
    }
    default:
      throw new Error(`ToB time model: unknown encounter '${id}'`);
  }
};

const teamNote = (n: number) => (n !== 1 ? `team of ${n} at your DPS` : undefined);

/** The Dawnbringer special attacks as a phase: one 4-tick attack of one player's time each (the team's time ÷ the team). */
const dawnbringerChoice: KitChoice = {
  loadout: 'Dawnbringer (raid item)', style: 'Pulsate (special attack)', group: 'magic', dps: DAWNBRINGER_SPEC_AVERAGE / DAWNBRINGER_SPEC_SECONDS,
};

/** One pass over a ToB encounter (the model's `encounterPass`). */
export const tobEncounterPass = (
  id: EncounterId,
  kit: RaidKit,
  a: RaidTimeAssumptions,
  drain: DrainStateId,
  fightSeconds: number,
): PhaseTime[] => {
  const mult = a.dpsMultiplier ?? 1;
  const note = teamNote(mult);
  const withNote = (p: PhaseTime): PhaseTime => (note ? { ...p, note } : p);
  const best = (q: Omit<PhaseQuery, 'drain' | 'fightSeconds'>): KitChoice | null => kit.best({ ...q, drain, fightSeconds });
  const s = tobSettings(a);
  const plan = tobEncounterPlan(id, a);

  if (id === 'tob-bloat') {
    const hp = plan[0].damage;
    const first = best({ targetKey: 'tob-bloat' });
    const down = Math.max(0, Number(s.bloatDownSeconds) || 0);
    const firstDamage = Math.min(hp, (first?.dps ?? 0) * mult * down);
    return [
      {
        key: 'bloat-first', label: `First down (${down} s, drains apply)`, targetKey: 'tob-bloat', damage: firstDamage,
      },
      {
        key: 'bloat-rest', label: 'Later downs (Defence restored by the stomp)', targetKey: 'tob-bloat-restored', damage: hp - firstDamage, drainReset: 'the stomp',
      },
    ].filter((p) => p.damage > 0).map((p) => withNote(phaseTime(p, kit, drain, fightSeconds, mult)));
  }

  if (id === 'tob-nylocas' && s.nyloRotation) {
    // each monster's three form rows (in plan order) become one equal-time rotation
    const rows: PhaseTime[] = [];
    for (let i = 0; i < plan.length; i += 3) {
      const forms = plan.slice(i, i + 3);
      const hp = forms.reduce((t, p) => t + p.damage, 0);
      const choices = forms.map((p) => best({ targetKey: p.targetKey }));
      const split = akkhaRotation(hp, choices.map((c) => (c?.dps ?? 0) * mult));
      forms.forEach((p, j) => rows.push(withNote({
        ...p,
        label: p.label.replace('(⅓ of the hp)', '(⅓ of the time)'),
        damage: split[j].damage,
        choice: choices[j],
        dps: choices[j]?.dps ?? 0,
        seconds: split[j].seconds,
      })));
    }
    return rows;
  }

  return plan.filter((p) => p.damage > 0).map((p) => {
    if (p.key === 'verzik-p1' && mult > 1) {
      // one staff: its holder at the kit's best, the rest of the team without the Dawnbringer
      const holder = best({ targetKey: p.targetKey });
      const others = best({ targetKey: p.targetKey, phase: VERZIK_P1_NO_DAWNBRINGER });
      const rate = (holder?.dps ?? 0) + (mult - 1) * (others?.dps ?? 0);
      const split = holder && others && holder.loadout !== others.loadout;
      return {
        ...p,
        phase: VERZIK_P1_NO_DAWNBRINGER,
        choice: others ?? holder,
        dps: others?.dps ?? holder?.dps ?? 0,
        seconds: timeOf(p.damage, rate),
        note: split
          ? `${mult - 1} at this loadout + 1 with ${holder.loadout} (${holder.dps.toFixed(2)} DPS)`
          : `team of ${mult} at your DPS`,
      };
    }
    if (p.key === 'verzik-p1-dawnbringer') {
      const { specs } = dawnbringerSpecs(a);
      return withNote({
        ...p,
        choice: dawnbringerChoice,
        dps: dawnbringerChoice.dps,
        // the same team as the spec count (dawnbringerSpecs): each player's specs × 2.4 s
        seconds: mult > 0 ? (specs * DAWNBRINGER_SPEC_SECONDS) / mult : 0,
        // phase 36: these are special attacks already (the staff's), not a damage-limited phase
        noDamageSpecs: 'the Dawnbringer specs',
      });
    }
    return withNote(phaseTime(p, kit, drain, fightSeconds, mult));
  });
};

/** Every target the model may query for these settings. */
export const tobRequiredPhaseTargets = (a: RaidTimeAssumptions): { targetKey: string, phase?: string }[] => {
  const seen = new Map<string, { targetKey: string, phase?: string }>();
  const add = (targetKey: string) => {
    const k = phaseKey(targetKey);
    if (!seen.has(k)) seen.set(k, { targetKey });
  };
  TOB_ROUTE_SLOTS.forEach((slot) => tobEncounterPlan(slot.options[0], a)
    .filter((p) => p.damage > 0)
    .forEach((p) => add(p.targetKey)));
  add('tob-bloat-restored');
  const k = phaseKey('tob-verzik-p1', VERZIK_P1_NO_DAWNBRINGER);
  if (!seen.has(k)) seen.set(k, { targetKey: 'tob-verzik-p1', phase: VERZIK_P1_NO_DAWNBRINGER });
  return Array.from(seen.values());
};

export const TOB_TIME_MODEL: RaidTimeModel = {
  id: 'tob',
  routeSlots: TOB_ROUTE_SLOTS,
  labels: TOB_ENCOUNTER_LABELS,
  encounterPass: tobEncounterPass,
  requiredPhaseTargets: tobRequiredPhaseTargets,
};
