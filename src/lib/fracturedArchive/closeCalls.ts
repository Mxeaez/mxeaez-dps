/**
 * Phase 38j (ROADMAP 38j): the Plan tab compares kits, it doesn't time raids. The score stays Σ HP ÷ DPS over the route
 * ("boss time": your DPS alone, the 38h spec values), but the Plan shows only differences ("3.1% less boss time than
 * …") and labels the total a rough estimate; and it marks the **close calls**: a kit loadout, the kit, the ring, a
 * carrier, your spec bar or a spec weapon within `CLOSE_CALL_MARGIN` (2%) of its runner-up, with the UNVERIFIED (A)
 * assumptions the choice rests on ("close call (depends on A11)"). Pure (no React); the planner's result in, strings out.
 *
 * The (A) tags are static, from docs/UNVERIFIED.md's "Used in" column: every FA choice rests on A11 (Defence doesn't
 * scale: every hit chance and drain); a choice involving these weapons also on their own rows. Whether a choice really
 * flips under an assumption is not computed (it would need a magnitude for each, e.g. how much Defence scales).
 */
import { DAMAGE_SPEC_WEAPONS, DamageSpecWeapon } from '@/lib/fracturedArchive/damageSpecs';
import { specWeaponLabel } from '@/lib/fracturedArchive/specChoice';
import { PlannerWeapon } from '@/lib/fracturedArchive/specs';

const drainLabel = (w: string): string => specWeaponLabel(w as PlannerWeapon) ?? w;
const damageLabel = (w: string): string => DAMAGE_SPEC_WEAPONS[w as DamageSpecWeapon]?.label ?? w;

/** A choice within this fraction of its runner-up is a close call. */
export const CLOSE_CALL_MARGIN = 0.02;

/** UNVERIFIED (A) rows by weapon / item name (substring match). */
const WEAPON_ASSUMPTIONS: [string, string[]][] = [
  ['Obligator', ['A1', 'A2']],
  ['Ascension crossbow', ['A5']],
  ['Emberlight', ['A8']],
  ['Arclight', ['A8']],
  ['Scorching bow', ['A8']],
  ['Purging staff', ['A8']],
  ['Demonbane', ['A8']],
  ['Zorya', ['A9']],
];

/** Every FA choice rests on A11 (Defence doesn't scale with the party). */
export const BASE_ASSUMPTIONS = ['A11'];
/**
 * Review 38j: the choices the spec energy decides (ring, carriers, your bar, the damage spec weapon) also rest on D36 (the
 * measured room times).
 */
export const ENERGY_ASSUMPTIONS = [...BASE_ASSUMPTIONS, 'D36'];

/** The (A) rows a choice between these names rests on (A11 first, then by number). */
export const assumptionsFor = (names: (string | null | undefined)[]): string[] => {
  const out = new Set(BASE_ASSUMPTIONS);
  names.forEach((n) => WEAPON_ASSUMPTIONS.forEach(([k, ids]) => {
    if (n && n.toLowerCase().includes(k.toLowerCase())) ids.forEach((id) => out.add(id));
  }));
  const rest = Array.from(out).filter((id) => !BASE_ASSUMPTIONS.includes(id)).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  return [...BASE_ASSUMPTIONS, ...rest];
};

const pct = (x: number): string => `${(100 * x).toFixed(1)}%`;

/**
 * "3.1% less boss time" (`saved` > 0: seconds the other option saves vs the plan) / "3.1% more boss time" / "the same
 * boss time"; `total` = the plan's boss time. Infinite: "can't finish" / "∞ less".
 */
export const bossTimeDiff = (saved: number, total: number): string => {
  if (!Number.isFinite(saved)) return saved > 0 ? 'infinitely less boss time' : "can't kill every boss";
  if (!(total > 0) || !Number.isFinite(total)) return `${saved > 0 ? '−' : '+'}${Math.abs(saved).toFixed(1)} s boss time`;
  const f = Math.abs(saved) / total;
  if (f < 0.0005) return 'the same boss time';
  return `${pct(f)} ${saved > 0 ? 'less' : 'more'} boss time`;
};

/** "3.1% more boss time than this kit" / "the same boss time as this kit". */
export const bossTimeVs = (saved: number, total: number, what: string): string => {
  const d = bossTimeDiff(saved, total);
  return `${d} ${d === 'the same boss time' ? 'as' : 'than'} ${what}`;
};

export type CloseCallKind = 'loadout' | 'kit' | 'ring' | 'carrier' | 'share' | 'damage-spec' | 'drain';

export interface CloseCall {
  kind: CloseCallKind;
  /** e.g. "Twisted bow (Masori) switch: saves 1.2% boss time vs the kit without it". */
  text: string;
  /** The fraction between the choice and its runner-up (boss time or HP). */
  margin: number;
  /** UNVERIFIED (A) ids, A11 first. */
  dependsOn: string[];
}

/** The planner's result, narrowed to what the close calls read (PlanResult fits). */
export interface CloseCallInput {
  /** The plan's boss time (seconds, Σ HP ÷ DPS on the planned route). */
  total: number;
  kit: { label: string, equipment: { weapon?: { name: string } | null } }[];
  /** Per kit loadout: seconds it saves vs the kit without it (Infinity / one loadout: none). */
  kitMarginal: { slots: number, seconds: number }[];
  /** Other kits: `deltaSeconds` = seconds they save vs the plan (negative: slower). */
  alternatives: { label: string, deltaSeconds: number, weapons?: string[] }[];
  ring: { ring: string | null, screened: { ring: string, seconds: number, full: boolean }[] };
  specs: {
    team?: { rows: { weapon: string, carriers: number, lastSaved?: number }[] },
    notes: string[],
    bringRule?: { first: string | null, bring: string[], gains: { gains: Partial<Record<string, number>> }[] },
  };
  /** Solo drains your bar pays that are within 10% of the damage specs they displace (encounterBudget `closeCall`). */
  drainCloseCalls?: { encounter: string, npc: string }[];
}

const closeBy = (saved: number, total: number): number | null => {
  if (!Number.isFinite(saved) || !(total > 0)) return null;
  const f = Math.abs(saved) / total;
  return f <= CLOSE_CALL_MARGIN + 1e-12 ? f : null;
};

/** The close calls of a plan (see the module comment), in this order: kit, loadouts, ring, carriers, your bar, specs. */
export const closeCalls = (r: CloseCallInput): CloseCall[] => {
  const out: CloseCall[] = [];
  const kitNames = r.kit.flatMap((c) => [c.label, c.equipment.weapon?.name]);
  // the kit vs the best other kit (alternatives are slower or equal); review 38j: not the plan's kit plus extra loadouts
  // at the same time (a superset the dedupe rule would drop, not a runner-up)
  const kitLabels = r.kit.map((c) => c.label);
  r.alternatives.forEach((x) => {
    const loadouts = x.label.slice(x.label.indexOf(': ') + 2).split(' / ');
    if (x.deltaSeconds >= -1e-9 && kitLabels.every((l) => loadouts.includes(l)) && loadouts.length > kitLabels.length) return;
    const m = x.deltaSeconds <= 1e-9 ? closeBy(x.deltaSeconds, r.total) : null;
    if (m === null) return;
    out.push({
      kind: 'kit',
      text: `${x.label}: ${bossTimeVs(x.deltaSeconds, r.total, 'this kit')}`,
      margin: m,
      dependsOn: assumptionsFor([...kitNames, x.label, ...(x.weapons ?? [])]),
    });
  });
  // each switch vs the kit without it
  if (r.kit.length > 1) {
    r.kit.forEach((c, i) => {
      const s = r.kitMarginal[i]?.seconds;
      const m = s !== undefined && s >= 0 ? closeBy(s, r.total) : null;
      if (m === null) return;
      out.push({
        kind: 'loadout',
        text: `${c.label} (${i === 0 ? 'worn' : 'switch'}): ${bossTimeVs(s, r.total, 'the kit without it')}`,
        margin: m,
        dependsOn: assumptionsFor([c.label, c.equipment.weapon?.name]),
      });
    });
  }
  // the camped ring vs the others planned in full
  if (r.ring.ring) {
    const chosen = r.ring.screened.find((x) => x.ring === r.ring.ring);
    r.ring.screened.filter((x) => x.full && x.ring !== r.ring.ring).forEach((x) => {
      const base = chosen?.seconds ?? r.total;
      const m = closeBy(x.seconds - base, r.total);
      if (m === null) return;
      out.push({
        kind: 'ring',
        text: `${x.ring} instead of ${r.ring.ring}: ${bossTimeDiff(base - x.seconds, r.total)}`,
        margin: m,
        dependsOn: [...ENERGY_ASSUMPTIONS],
      });
    });
  }
  // the last carrier of each drain weapon vs one fewer
  (r.specs.team?.rows ?? []).forEach((row) => {
    const s = row.lastSaved;
    const m = s !== undefined && s >= 0 ? closeBy(s, r.total) : null;
    if (m === null) return;
    const w = drainLabel(row.weapon);
    out.push({
      kind: 'carrier',
      text: `${row.carriers} ${w} carrier${row.carriers === 1 ? '' : 's'} vs ${row.carriers - 1}: the last saves ${bossTimeDiff(s!, r.total).replace(' less', '')}`,
      margin: m,
      dependsOn: [...ENERGY_ASSUMPTIONS],
    });
  });
  // your spec bar (Team): "the bars pay X HP on the route vs Y HP if you carry"
  r.specs.notes.forEach((n) => {
    const hit = /the bars pay (\d+(?:\.\d+)?) HP on the route vs (\d+(?:\.\d+)?) HP if you carry/.exec(n);
    if (!hit) return;
    const [x, y] = [Number(hit[1]), Number(hit[2])];
    const m = Math.max(x, y) > 0 ? Math.abs(x - y) / Math.max(x, y) : 0;
    if (m > CLOSE_CALL_MARGIN + 1e-12) return;
    out.push({
      kind: 'share',
      text: `your spec bar: ${x.toFixed(0)} HP with your damage specs vs ${y.toFixed(0)} HP if you carry a drain weapon (${pct(m)} apart)`,
      margin: m,
      dependsOn: [...ENERGY_ASSUMPTIONS],
    });
  });
  // the damage spec weapon brought first vs the runner-up (HP per full bar over the route's bosses / phases)
  const br = r.specs.bringRule;
  if (br?.first) {
    const sum = (w: string) => br.gains.reduce((t, p) => t + Math.max(0, p.gains[w] ?? 0), 0);
    const first = sum(br.first);
    const others = Array.from(new Set(br.gains.flatMap((p) => Object.keys(p.gains)))).filter((w) => w !== br.first && !br.bring.includes(w));
    const runner = others.sort((a, b) => sum(b) - sum(a))[0];
    if (runner && first > 0) {
      const m = (first - sum(runner)) / first;
      if (m <= CLOSE_CALL_MARGIN + 1e-12) {
        out.push({
          kind: 'damage-spec',
          text: `${damageLabel(br.first)} vs ${damageLabel(runner)}: ${pct(Math.abs(m))} apart in HP per bar over the route`,
          margin: Math.abs(m),
          dependsOn: [...ENERGY_ASSUMPTIONS],
        });
      }
    }
  }
  // Solo drains kept within 10% of the damage specs they displace (the 38h-2 rule's own margin)
  (r.drainCloseCalls ?? []).forEach((d) => out.push({
    kind: 'drain',
    text: `${d.encounter}: the drain on ${d.npc} vs the damage specs its energy would buy (within 10%; the drain is kept)`,
    margin: 0.1,
    dependsOn: [...BASE_ASSUMPTIONS],
  }));
  return out;
};

/** "close call (depends on A11, A1)". */
export const closeCallTag = (c: Pick<CloseCall, 'dependsOn'>): string => `close call (depends on ${c.dependsOn.join(', ')})`;

/** The close calls of a planner result (the planned route's boss time and Solo drain flags). */
export const planCloseCalls = (
  r: Omit<CloseCallInput, 'total' | 'drainCloseCalls'> & {
    comparison: { routes: { seconds: number, encounters: { label: string, specPlan?: { events: { npc: string, closeCall?: boolean }[] } }[] }[] } | null,
    planned: number,
  },
): CloseCall[] => {
  const route = r.comparison?.routes[r.planned];
  if (!route) return [];
  const drainCloseCalls = route.encounters.flatMap((e) => (e.specPlan?.events ?? [])
    .filter((ev) => ev.closeCall).map((ev) => ({ encounter: e.label, npc: ev.npc })));
  return closeCalls({ ...r, total: route.seconds, drainCloseCalls });
};
