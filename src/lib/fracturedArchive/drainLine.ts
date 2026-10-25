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
  // phase 32: planned specs count attacks (2 per charged spec, each can miss; phase 34: "swings" → "attacks"); landed
  // drains (Max-drain buttons) count hits
  if (weapon === 'tonalztics' && unit === 'spec') what += ` (${extra?.hits !== undefined ? plural(extra.hits, 'landed hit') : plural(count * 2, 'attack')})`;
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

/**
 * Phase 32: "4 specs (2 carriers)" (Team), "4 specs" (Solo). Phase 34 (Tonalztics, one charged spec = 2 attacks): "4 specs
 * (2 carriers) = 8 attacks, 4 must land" (was ", 8 swings"); Elder maul / DWH / BGS: specs only (one attack each).
 */
const specsText = (it: NeedFields, n: number, attacks: boolean): string => {
  const carriers = it.perCarrier ? ` (${plural(Math.ceil(n / it.perCarrier), 'carrier')})` : '';
  let tail = '';
  if (attacks && it.weapon === 'tonalztics') {
    tail = ` = ${n * 2} attacks${typeof it.landed === 'number' && it.landed > 0 ? `, ${it.landed} must land` : ''}`;
  }
  return `${plural(n, 'spec')}${carriers}${tail}`;
};

/**
 * Phase 29: the Team text of an item. Phase 32 (the user: "needed ×4 · team brings ×4 (8 hits)" read as 4 people / 8
 * landed hits): every number carries its unit — "needs 4 landed hits · 4 specs (2 carriers) = 8 attacks, 4 must land · 98%" (phase 34; was ", 8 swings"), then
 * " · team: 6 specs (3 carriers) · 99.8%" when the team brings more than needed (left out when equal). The landed count
 * is this weapon's alone from the start Defence to the ranked Defence (`landedToReach`); the % is P(floor from the first
 * round) with the needed specs / with everything brought ("→ Def 167" when the plan doesn't rank at the floor). Solo
 * (no `perCarrier`, needed = count): "needs 4 landed hits · 4 specs = 8 attacks, 4 must land · 98%".
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
  if (it.weapon === 'tonalztics') parts.push('a charged Tonalztics spec attacks twice and each attack can miss');
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

// --- phase 33: one drain line per encounter -------------------------------------------------------------------------

/** One part of an encounter's start-of-fight line: the first phase (in the encounter's order) that a set of spec weapons lands on. */
export interface EncounterDrainPart {
  /** The phase's key (PhaseTime.key) and label without its share, e.g. "Flying shield", "Grounded", "Bork, armour 8". */
  phaseKey: string;
  label: string;
  /** The phase's own drain line (the numbers of this part). */
  line: DrainLine;
  /** The weapons specced (count > 0), in drain-line order. */
  items: DrainLineItem[];
  /** e.g. "2 Elder maul carriers (4 specs) + 2 Tonalztics carriers (4 specs) → Def 180 · 99.6%". */
  text: string;
}

/**
 * Phase 33: one drain event = the phases between two Defence resets (the start of the fight, then each phase whose
 * `drainReset` is set: Sotetseg after each maze, Bloat's later downs). The team specs once per event. Phase 35b: one
 * event per NPC too (Bork and The Smorks are two NPCs with their own Defence: two events).
 */
export interface EncounterDrainEvent {
  /** The event's first phase, and why the Defence was restored (undefined = the start of the fight). */
  phaseKey: string;
  reset?: string;
  /** Phase 35b: the NPC's name, set when the encounter has specs on more than one NPC ("Bork", "Smorks"). */
  npc?: string;
  /** One part per distinct set of spec weapons in the event (the first phase each set lands on). */
  parts: EncounterDrainPart[];
  /**
   * "Start of fight:" (Team) / "Start:" (Solo) / "After maze 1 (Defence restored), again:"; with `npc`: "Bork:" /
   * "Bork, after maze 1 (Defence restored), again:".
   */
  head: string;
  text: string;
}

export interface EncounterDrainSummary {
  events: EncounterDrainEvent[];
  /** The first event's parts (the start of the fight). */
  parts: EncounterDrainPart[];
  /**
   * One event: "Start of fight: …" (Team) / "Start: …" (Solo); several parts: "Flying shield: … · Grounded: …". Each
   * later event adds " · After maze 1 (Defence restored), again: …". Phase 35b, specs on several NPCs: "Bork: … · Smorks: …".
   */
  text: string;
}

/** "Grounded (70% of hp)" → "Grounded"; "P3 last quadrant, Deflect Melee (25%)" → "P3 last quadrant, Deflect Melee". */
export const phaseShortLabel = (label: string): string => label.replace(/\s*\([^()]*\)\s*$/, '');

/** Team: "2 Elder maul carriers (4 specs)"; Solo (no carriers): "2 Elder maul specs". */
export const encounterItemText = (it: Pick<DrainLineItem, 'label' | 'count' | 'perCarrier'>): string => (it.perCarrier
  ? `${plural(Math.ceil(it.count / it.perCarrier), `${it.label} carrier`)} (${plural(it.count, 'spec')})`
  : plural(it.count, `${it.label} spec`));

/**
 * "→ Def 180 · 99.6%": the Defence after the drains (+ "· magic def X" when Eye of Ayak is specced) and the chance of the
 * floor (Team: with everything the carriers bring; Solo: with your specs) of the first Defence-drain weapon; no % when the
 * line ranks short of the floor (its "→ Def X" is the Def shown).
 */
export const encounterResultText = (line: Pick<DrainLine, 'defAfter' | 'magicDefAfter'>, items: DrainLineItem[]): string => {
  const def = items.find((i) => i.weapon !== 'ayak');
  const p = def ? def.bringsResult ?? def.neededResult : undefined;
  const ayak = items.some((i) => i.weapon === 'ayak');
  return `→ Def ${line.defAfter}${ayak ? ` · magic def ${line.magicDefAfter}` : ''}${p && !p.startsWith('→') ? ` · ${p}` : ''}`;
};

/** The parts of one drain event (phases in order): the first phase of each distinct set of spec weapons. */
const eventParts = (phases: { key: string, label: string, drainLine?: DrainLine }[]): EncounterDrainPart[] => {
  const parts: EncounterDrainPart[] = [];
  const seen = new Set<string>();
  for (const p of phases) {
    if (!p.drainLine) continue;
    const items = p.drainLine.items.filter((i) => i.count > 0);
    if (!items.length) continue;
    const signature = items.map((i) => i.weapon).sort().join(',');
    if (seen.has(signature)) continue;
    seen.add(signature);
    parts.push({
      phaseKey: p.key,
      label: phaseShortLabel(p.label),
      line: p.drainLine,
      items,
      text: `${items.map(encounterItemText).join(' + ')} ${encounterResultText(p.drainLine, items)}`,
    });
  }
  return parts;
};

/**
 * Phase 33: an encounter is specced once per drain event, at its start: the line of the first phase (in the encounter's
 * phase order) that the specs land on (a phase whose drain line specs at least one weapon). A later phase of the same
 * event whose set of spec weapons differs (AG grounded vs flying: the Elder maul can't hit the flying Guardian; Ocellus
 * P3's Deflect Melee quadrant) is listed as its own part. A phase with `drainReset` (the Defence is restored: Sotetseg
 * after each maze, Bloat's later downs) starts a new event: "After maze 1 (Defence restored), again: …". Undefined when
 * no phase has a drain line (drains "None").
 *
 * Phase 35b: `npc` (the target's NPC, briefing.ts `phaseNpc`) splits the phases by NPC: each NPC's phases are its own
 * event(s), in the order the NPCs first appear (Bork's armour phases = one event, The Smorks another; Olm's right claw,
 * left claw and head; an NPC coming back after another, like Kephri after the scarabs, joins its first event). When
 * more than one NPC gets specs, every event is named: "Bork: … · Smorks: …". NPCs nobody specs (the adds) are left
 * out; a reset with no specs (Bloat's stomp) is kept. Phases without `npc` are one NPC (phase 33).
 */
export const encounterDrainSummary = (
  phases: { key: string, label: string, drainLine?: DrainLine, drainReset?: string, npc?: string, noDrains?: string }[],
  drain: 'solo' | 'team',
): EncounterDrainSummary | undefined => {
  if (!phases.length || !phases.some((p) => p.drainLine)) return undefined;
  const groups: { npc: string, reset?: string, phases: typeof phases }[] = [];
  const current = new Map<string, number>();
  phases.forEach((p) => {
    const npc = p.npc ?? '';
    const at = current.get(npc);
    if (at === undefined || p.drainReset) {
      current.set(npc, groups.length);
      groups.push({ npc, reset: at === undefined ? undefined : p.drainReset, phases: [p] });
    } else groups[at].phases.push(p);
  });
  const withParts = groups.map((g) => ({ ...g, parts: eventParts(g.phases) }));
  // phase 37 fix: the NPCs that can be drained (a drain line on a phase without `noDrains`), specced or not — since
  // phase 36 the budget may give one of them nothing (FA party 4: Bork no specs, everything on The Smorks), which must
  // read "Bork: no specs · Smorks: …", not an unlabelled Smorks line; plus any NPC that got specs (inputs without
  // `noDrains`). Adds (`noDrains`) are left out; an event with no specs of a kept NPC stays (Bloat's stomp); nothing
  // drainable: the first NPC's events ("Start of fight: no specs")
  const drainable = new Set(withParts.filter((g) => g.parts.length || g.phases.some((p) => p.drainLine && !p.noDrains)).map((g) => g.npc));
  const named = drainable.size > 1;
  const kept = withParts.filter((g) => (drainable.size ? drainable.has(g.npc) : g.npc === withParts[0].npc));
  const events = kept.map((g): EncounterDrainEvent => {
    const { parts } = g;
    let head = drain === 'team' ? 'Start of fight:' : 'Start:';
    if (g.reset) head = `After ${g.reset} (Defence restored), again:`;
    if (named) head = g.reset ? `${g.npc}, after ${g.reset} (Defence restored), again:` : `${g.npc}:`;
    let text = `${head} no specs`;
    if (parts.length === 1) text = `${head} ${parts[0].text}`;
    else if (parts.length > 1) {
      const list = parts.map((x) => `${x.label}: ${x.text}`).join(' · ');
      text = g.reset || named ? `${head} ${list}` : list;
    }
    return {
      phaseKey: g.phases[0].key, ...(g.reset ? { reset: g.reset } : {}), ...(named ? { npc: g.npc } : {}), parts, head, text,
    };
  });
  return { events, parts: events[0].parts, text: events.map((e) => e.text).join(' · ') };
};

// --- phase 34: the short form (icon + one bold number per weapon) -------------------------------------------------

/**
 * Phase 34: the one number a raider needs per drain weapon, shown bold next to its icon (the full sentence is the
 * tooltip): Tonalztics "4 hits" (the landed hits it needs), Elder maul / DWH "2 specs" (the landed specs it needs), BGS
 * "2 specs" (the specs it needs), Eye of Ayak "≈ 39 magic def" (drained); "not needed" when the other weapons' specs
 * already reach the floor; lines without a "needs" part (None, the Max-drain buttons) fall back to the specs done
 * (Tonalztics: its hits).
 */
export const briefText = (it: Pick<DrainLineItem, 'weapon' | 'count' | 'unit' | 'hits' | 'needed' | 'landed'>): string => {
  if (it.unit === 'dmg') return `${it.count} dmg`;
  if (it.needed === 0) return 'not needed';
  const landed = typeof it.landed === 'number' && it.landed > 0 ? it.landed : undefined;
  const needed = typeof it.needed === 'number' ? it.needed : undefined;
  switch (it.weapon) {
    case 'tonalztics': {
      if (landed !== undefined) return plural(landed, 'hit');
      if (needed !== undefined) return plural(needed, 'spec');
      return it.hits !== undefined ? plural(it.hits, 'hit') : plural(it.count, 'spec');
    }
    case 'ayak': return landed !== undefined ? `≈ ${landed} magic def` : plural(needed ?? it.count, 'spec');
    case 'bgs': return plural(needed ?? it.count, 'spec');
    default: return plural(landed ?? needed ?? it.count, 'spec');
  }
};

/**
 * Phase 34: the items the short line shows: a weapon the other weapons' specs make unnecessary ("not needed": the team
 * brings it, this boss doesn't need it) is left out (it stays in the tooltip), unless nothing else is left.
 */
export const briefItems = <T extends Pick<DrainLineItem, 'weapon' | 'count' | 'unit' | 'hits' | 'needed' | 'landed'>>(items: T[]): T[] => {
  const needed = items.filter((i) => briefText(i) !== 'not needed');
  return needed.length ? needed : items;
};

/** Phase 34: "→ Def 156" (+ " · Magic def 91" with Eye of Ayak specs, or always with `magic`). */
export const briefResultText = (line: Pick<DrainLine, 'defAfter' | 'magicDefAfter'>, items: Pick<DrainLineItem, 'weapon' | 'count'>[], magic = false): string => {
  const ayak = items.some((i) => i.weapon === 'ayak' && i.count > 0);
  return `→ Def ${line.defAfter}${magic || ayak ? ` · Magic def ${line.magicDefAfter}` : ''}`;
};

/** Phase 34: one group of the Plan briefing's specs cell: label (when an encounter has several), items, result, repeats. */
export interface BriefGroup {
  key: string;
  /** e.g. "Flying shield", "after maze 1", phase 35b "Bork" / "Smorks" (none for a single start-of-fight line). */
  label?: string;
  items: DrainLineItem[];
  result: string;
  /** The same drains this many times (Sotetseg: at the start and after each maze = 3). */
  times: number;
  /** Plain text, e.g. "Tonalztics 4 hits + Elder maul 2 specs → Def 156 × 3". */
  text: string;
}

const groupText = (label: string | undefined, items: DrainLineItem[], result: string, times: number) => `${label ? `${label}: ` : ''}${briefItems(items).map((i) => `${i.label} ${briefText(i)}`).join(' + ')} ${result}${times > 1 ? ` × ${times}` : ''}`;

/**
 * Phase 34: the briefing's compact form of an encounter's drain events (encounterDrainSummary): one group per part;
 * when every event with specs has one part and the same numbers (Sotetseg's three events), one group "× 3". Events with
 * no specs are left out (the tooltip keeps the full text), except a named NPC's (phase 37: "Bork: no specs"). [] when
 * nothing is specced.
 */
export const encounterBrief = (summary: EncounterDrainSummary): BriefGroup[] => {
  const withParts = summary.events.filter((e) => e.parts.length > 0);
  if (!withParts.length) return [];
  // phase 37 fix: a named NPC's event with no specs (the budget gave it none) reads "Bork: no specs" / "Right claw,
  // after phase 1: no specs", as in the full text; an unnamed one (Bloat after the stomp) stays out
  const noSpecs = (e: EncounterDrainEvent): BriefGroup[] => {
    if (e.npc === undefined || e.parts.length) return [];
    const label = [e.npc, e.reset ? `after ${e.reset}` : ''].filter(Boolean).join(', ');
    return [{
      key: e.phaseKey, label, items: [], result: '', times: 1, text: `${label}: no specs`,
    }];
  };
  const sig = (p: EncounterDrainPart) => `${p.items.map((i) => `${i.weapon}:${briefText(i)}`).join('|')}|${briefResultText(p.line, p.items)}`;
  // phase 35b: "× 3" is the same NPC drained again; two NPCs with the same numbers stay two named groups
  const oneNpc = withParts.every((e) => e.npc === undefined);
  if (oneNpc && withParts.length > 1 && withParts.every((e) => e.parts.length === 1 && sig(e.parts[0]) === sig(withParts[0].parts[0]))) {
    const p = withParts[0].parts[0];
    const result = briefResultText(p.line, p.items);
    return [{
      key: p.phaseKey, items: p.items, result, times: withParts.length, text: groupText(undefined, p.items, result, withParts.length),
    }];
  }
  const several = withParts.length > 1 || withParts[0].parts.length > 1;
  return summary.events.flatMap((e) => (!e.parts.length ? noSpecs(e) : e.parts.map((p) => {
    let label: string | undefined;
    if (e.npc !== undefined) {
      // phase 35b: "Bork", "Smorks"; "Elidinis' Warden, P2 core"; "Bork, after the stomp"
      label = [e.npc, e.reset ? `after ${e.reset}` : '', e.parts.length > 1 ? p.label : ''].filter(Boolean).join(', ');
    } else if (several && e.reset) label = `after ${e.reset}${e.parts.length > 1 ? `, ${p.label}` : ''}`;
    else if (several) label = e.parts.length > 1 ? p.label : 'start';
    const result = briefResultText(p.line, p.items);
    return {
      key: p.phaseKey, label, items: p.items, result, times: 1, text: groupText(label, p.items, result, 1),
    };
  })));
};
