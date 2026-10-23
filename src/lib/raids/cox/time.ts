import { DrainStateId } from '@/lib/fracturedArchive/bestSetup';
import {
  EncounterId,
  phaseKey,
  phaseTime,
  PhaseTime,
  PlannedPhase,
  RaidKit,
  RaidTimeAssumptions,
  RaidTimeModel,
  RouteSlot,
  targetHp,
} from '@/lib/fracturedArchive/raidTime';
import {
  CoxRoom, CoxTimeSettings, DEFAULT_COX_INPUTS,
} from '@/lib/raids/types';
import {
  COX_MAX_PARTY,
  COX_MIN_PARTY,
  GUARDIAN_COUNT,
  mysticCount,
  olmStandardPhases,
  shamanCount,
  VESPULA_LANDS_AT,
} from '@/lib/raids/cox/constants';

/**
 * Phase 19: Chambers of Xeric time model (Encounters tab, planner). Same contract as the other raids (raidTime.ts):
 * Σ damage required ÷ (team-DPS multiplier × DPS) per phase, the kit's best loadout + style per phase, DPS time only (no
 * puzzles, travel, prep, invulnerable phases). HP and Defence are upstream's CoX scaling (src/lib/scaling/
 * ChambersOfXeric.ts: party size, Challenge Mode; checked against in-game values by upstream's
 * src/tests/lib/scaling/ChambersOfXeric.test.ts), so like ToA the team-DPS multiplier defaults to the party size.
 *
 * Layouts are random ("A raid layout can have 3 to 5 of these bosses", Strategies), so the rooms are a user-picked set
 * (`room_*` settings; default: every room = an upper bound) plus the Great Olm, always fought. One route.
 * Encounter sequences, from https://oldschool.runescape.wiki/w/Chambers_of_Xeric/Strategies and the room pages (read
 * 2026-10-23, ?action=raw):
 * - Tekton: his hp, `tektonEnragedFraction` of it at the Enraged version ("After up to five sets of sparks, he will stop
 *   repairing himself and enter an enraged state, increasing his melee defensive bonuses ... This will wear off around
 *   ~5 or so attacks"), plus `tektonAnvilHeal` × hp for the anvil repairs ("recovering 1.33% of his maximum health every
 *   few ticks"; 0 by default). "Tekton no longer resets his Defence when healing at the anvil", so drains carry.
 * - Vasa: `vasaCrystals` Glowing crystals (stab only; "if crystal is destroyed before it does, the healing is nulled"),
 *   then his hp (he is invulnerable at a crystal: that time isn't DPS time).
 * - Vanguards: all three ("damage must be spread equally to all three"), each at its own version; drains never apply
 *   ("they will restore all drained stats upon retreating into their shell": the targets' `noDrains`).
 * - Vespula: "The portal must be destroyed to dispel Vespula": 'ground' = 80% of her hp first ("Upon reaching 20% of
 *   her health, she will drop to the ground", the normal method), then the Abyssal portal; 'portal' = only the portal
 *   (the Redemption method). Lux grubs / vespine soldiers (heal her and the portal) aren't counted.
 * - Skeletal Mystics, Lizardman shamans: count by party size (Strategies tables) × hp.
 * - Muttadiles: the small one, then the large one; `muttadileHeal` × hp each for meat-tree eats (0 = chopped / frozen).
 * - Guardians: two statues, pickaxes only (upstream: other weapons deal 0 — "nothing in the kit" without a pickaxe).
 * - Ice demon: its hp after the braziers are lit (kindling / lighting time isn't DPS time).
 * - Great Olm: `olmStandardPhases` hand phases ("three standard phases and a head phase. For every 8 players in the
 *   raid, Olm will gain an additional standard phase"); each = both claws' hp ("In order to clear every phase outside of
 *   the final one, both of Olm's hands must be incapacitated"); then the head ("The head's healing is also lifted,
 *   allowing it to be harmed and defeated to end the encounter"). Upstream's hand / head hp already shares the extra
 *   phases' hp out (`- 3 × trunc(party / 8)`). Not modelled: the left hand's clench / penultimate-phase heal, the head's
 *   life-siphon heal (5× the damage it deals).
 */

export const COX_ROOMS: { id: CoxRoom, encounter: string, label: string }[] = [
  { id: 'tekton', encounter: 'cox-tekton', label: 'Tekton' },
  { id: 'vasa', encounter: 'cox-vasa', label: 'Vasa Nistirio' },
  { id: 'vanguards', encounter: 'cox-vanguards', label: 'Vanguards' },
  { id: 'vespula', encounter: 'cox-vespula', label: 'Vespula' },
  { id: 'mystics', encounter: 'cox-mystics', label: 'Skeletal Mystics' },
  { id: 'shamans', encounter: 'cox-shamans', label: 'Lizardman shamans' },
  { id: 'muttadiles', encounter: 'cox-muttadiles', label: 'Muttadiles' },
  { id: 'guardians', encounter: 'cox-guardians', label: 'Guardians' },
  { id: 'iceDemon', encounter: 'cox-ice-demon', label: 'Ice demon' },
];

export const COX_OLM_ENCOUNTER = 'cox-olm';

export const COX_TIME_DEFAULTS: CoxTimeSettings = {
  room_tekton: true,
  room_vasa: true,
  room_vanguards: true,
  room_vespula: true,
  room_mystics: true,
  room_shamans: true,
  room_muttadiles: true,
  room_guardians: true,
  room_iceDemon: true,
  tektonEnragedFraction: 0.2,
  tektonAnvilHeal: 0,
  vasaCrystals: 1,
  vespulaMethod: 'ground',
  muttadileHeal: 0,
};

export const COX_ENCOUNTER_LABELS: Record<string, string> = {
  ...Object.fromEntries(COX_ROOMS.map((r) => [r.encounter, r.label])),
  [COX_OLM_ENCOUNTER]: 'Great Olm',
};

/** The target whose icon stands for each encounter (UI). */
export const COX_ENCOUNTER_TARGET: Record<string, string> = {
  'cox-tekton': 'cox-tekton',
  'cox-vasa': 'cox-vasa',
  'cox-vanguards': 'cox-vanguard-melee',
  'cox-vespula': 'cox-vespula',
  'cox-mystics': 'cox-mystic',
  'cox-shamans': 'cox-shaman',
  'cox-muttadiles': 'cox-muttadile-large',
  'cox-guardians': 'cox-guardian',
  'cox-ice-demon': 'cox-ice-demon',
  [COX_OLM_ENCOUNTER]: 'cox-olm-head',
};

/** One fixed route: the rooms in list order (times don't depend on it), then the Great Olm. */
export const COX_ROUTE_SLOTS: RouteSlot[] = [...COX_ROOMS.map((r) => r.encounter), COX_OLM_ENCOUNTER]
  .map((id, i) => ({ order: i + 1, options: [id] }));

/** The CoX model's own settings object (missing fields = defaults). */
export const coxSettings = (a: Pick<RaidTimeAssumptions, 'settings'>): CoxTimeSettings => ({
  ...COX_TIME_DEFAULTS, ...(a.settings as Partial<CoxTimeSettings>),
});

/** Party size used for hp, room counts and Olm's phases (the tab's range, 1-15). */
export const coxPartySize = (a: Pick<RaidTimeAssumptions, 'partySize'>): number => Math
  .min(COX_MAX_PARTY, Math.max(COX_MIN_PARTY, Math.trunc(a.partySize)));

/** Scaled hp of a CoX target for these assumptions (upstream's scaleMonster through buildTargetMonster). */
export const coxHp = (a: RaidTimeAssumptions, targetKey: string): number => targetHp(
  targetKey,
  undefined,
  coxPartySize(a),
  { raid: 'cox', cox: a.cox || DEFAULT_COX_INPUTS },
);

const pct = (f: number): string => `${Math.round(f * 1000) / 10}%`;
const frac = (f: number, max = 1) => Math.min(max, Math.max(0, Number.isFinite(f) ? f : 0));

/** Whether an encounter is in the layout (the Great Olm always is). */
export const coxEncounterIncluded = (id: EncounterId, s: CoxTimeSettings): boolean => {
  if (id === COX_OLM_ENCOUNTER) return true;
  const room = COX_ROOMS.find((r) => r.encounter === id);
  return !!room && s[`room_${room.id}`] === true;
};

const olmPlan = (a: RaidTimeAssumptions, party: number): PlannedPhase[] => {
  const n = olmStandardPhases(party);
  const left = coxHp(a, 'cox-olm-left');
  const right = coxHp(a, 'cox-olm-right');
  const rows: PlannedPhase[] = [];
  for (let i = 1; i <= n; i++) {
    const penultimate = i === n ? ', penultimate' : '';
    rows.push(
      {
        key: `olm-p${i}-right`, label: `Phase ${i} of ${n}${penultimate}: right claw (mage hand)`, targetKey: 'cox-olm-right', damage: right,
      },
      {
        key: `olm-p${i}-left`, label: `Phase ${i} of ${n}${penultimate}: left claw (melee hand)`, targetKey: 'cox-olm-left', damage: left,
      },
    );
  }
  rows.push({
    key: 'olm-head', label: 'Final phase: head', targetKey: 'cox-olm-head', damage: coxHp(a, 'cox-olm-head'),
  });
  return rows;
};

/** The damage to deal per phase of a CoX encounter ([] for a room that isn't in the layout). */
export const coxEncounterPlan = (id: EncounterId, a: RaidTimeAssumptions): PlannedPhase[] => {
  const s = coxSettings(a);
  if (!coxEncounterIncluded(id, s)) return [];
  const party = coxPartySize(a);
  const hp = (t: string) => coxHp(a, t);
  switch (id) {
    case 'cox-tekton': {
      const heal = frac(s.tektonAnvilHeal, 10);
      const total = hp('cox-tekton') * (1 + heal);
      const enraged = frac(s.tektonEnragedFraction);
      return [
        {
          key: 'tekton',
          label: `Tekton (${pct(1 - enraged)}${heal ? `, + ${pct(heal)} anvil repairs` : ''})`,
          targetKey: 'cox-tekton',
          damage: total * (1 - enraged),
        },
        {
          key: 'tekton-enraged', label: `Tekton enraged (${pct(enraged)})`, targetKey: 'cox-tekton-enraged', damage: total * enraged,
        },
      ];
    }
    case 'cox-vasa': {
      const crystals = Math.max(0, Math.trunc(s.vasaCrystals));
      return [
        {
          key: 'vasa-crystals', label: `Glowing crystal × ${crystals} (stab)`, targetKey: 'cox-glowing-crystal', damage: crystals * hp('cox-glowing-crystal'),
        },
        {
          key: 'vasa', label: 'Vasa Nistirio', targetKey: 'cox-vasa', damage: hp('cox-vasa'),
        },
      ];
    }
    case 'cox-vanguards':
      return (['melee', 'ranged', 'magic'] as const).map((v) => ({
        key: `vanguard-${v}`, label: `Vanguard (${v}), no drains`, targetKey: `cox-vanguard-${v}`, damage: hp(`cox-vanguard-${v}`),
      }));
    case 'cox-vespula': {
      const rows: PlannedPhase[] = [];
      if (s.vespulaMethod !== 'portal') {
        rows.push({
          key: 'vespula', label: `Vespula down to ${pct(VESPULA_LANDS_AT)} (she lands)`, targetKey: 'cox-vespula', damage: hp('cox-vespula') * (1 - VESPULA_LANDS_AT),
        });
      }
      rows.push({
        key: 'vespula-portal', label: 'Abyssal portal', targetKey: 'cox-abyssal-portal', damage: hp('cox-abyssal-portal'),
      });
      return rows;
    }
    case 'cox-mystics': {
      const n = mysticCount(party);
      return [{
        key: 'mystics', label: `Skeletal Mystic × ${n}`, targetKey: 'cox-mystic', damage: n * hp('cox-mystic'),
      }];
    }
    case 'cox-shamans': {
      const n = shamanCount(party);
      return [{
        key: 'shamans', label: `Lizardman shaman × ${n}`, targetKey: 'cox-shaman', damage: n * hp('cox-shaman'),
      }];
    }
    case 'cox-muttadiles': {
      const heal = frac(s.muttadileHeal, 3);
      const healText = heal ? ` (+ ${pct(heal)} meat tree)` : '';
      return [
        {
          key: 'muttadile-small', label: `Small muttadile${healText}`, targetKey: 'cox-muttadile-small', damage: (1 + heal) * hp('cox-muttadile-small'),
        },
        {
          key: 'muttadile-large', label: `Large muttadile${healText}`, targetKey: 'cox-muttadile-large', damage: (1 + heal) * hp('cox-muttadile-large'),
        },
      ];
    }
    case 'cox-guardians':
      return [{
        key: 'guardians', label: `Guardian × ${GUARDIAN_COUNT} (pickaxe only)`, targetKey: 'cox-guardian', damage: GUARDIAN_COUNT * hp('cox-guardian'),
      }];
    case 'cox-ice-demon':
      return [{
        key: 'ice-demon', label: 'Ice demon', targetKey: 'cox-ice-demon', damage: hp('cox-ice-demon'),
      }];
    case COX_OLM_ENCOUNTER:
      return olmPlan(a, party);
    default:
      throw new Error(`CoX time model: unknown encounter '${id}'`);
  }
};

const teamNote = (n: number) => (n !== 1 ? `team of ${n} at your DPS` : undefined);

/** One pass over a CoX encounter (the model's `encounterPass`). */
export const coxEncounterPass = (
  id: EncounterId,
  kit: RaidKit,
  a: RaidTimeAssumptions,
  drain: DrainStateId,
  fightSeconds: number,
): PhaseTime[] => {
  const mult = a.dpsMultiplier ?? 1;
  const note = teamNote(mult);
  return coxEncounterPlan(id, a)
    .filter((p) => p.damage > 0)
    .map((p) => ({ ...phaseTime(p, kit, drain, fightSeconds, mult), ...(note ? { note } : {}) }));
};

/** Every target the model may query for these settings. */
export const coxRequiredPhaseTargets = (a: RaidTimeAssumptions): { targetKey: string, phase?: string }[] => {
  const seen = new Map<string, { targetKey: string, phase?: string }>();
  COX_ROUTE_SLOTS.forEach((slot) => coxEncounterPlan(slot.options[0], a)
    .filter((p) => p.damage > 0)
    .forEach((p) => {
      const k = phaseKey(p.targetKey, p.phase);
      if (!seen.has(k)) seen.set(k, { targetKey: p.targetKey, phase: p.phase });
    }));
  return Array.from(seen.values());
};

export const COX_TIME_MODEL: RaidTimeModel = {
  id: 'cox',
  routeSlots: COX_ROUTE_SLOTS,
  labels: COX_ENCOUNTER_LABELS,
  encounterPass: coxEncounterPass,
  requiredPhaseTargets: coxRequiredPhaseTargets,
};
