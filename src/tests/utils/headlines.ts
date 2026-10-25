import { readFileSync } from 'fs';
import { join } from 'path';
import {
  DEFAULT_RING_POLICY, plan, PlanInputs, PlanResult, PlanTuning,
} from '@/lib/fracturedArchive/planner';
import { formatDuration } from '@/lib/fracturedArchive/raidTime';
import { raidConfig } from '@/lib/raids';
import { RaidId } from '@/lib/raids/types';
import { SPEC_WEAPONS } from '@/lib/fracturedArchive/specs';
import { planInputsFor, planTuningFor } from '@/tests/utils/crossRaid';

/**
 * Phase 37b: the headline plans in one human-readable fixture, `src/tests/fixtures/headlines.json` — per plan its total
 * (text + seconds), route, ring, kit loadouts, carriers, your items, your share and per-encounter seconds. The slow
 * headline tests (CrossRaidHeadlines*, Phase31's Solo, Phase34 / 35 / 35b), the verify scripts that check a headline
 * total (scripts/headlines.mjs) and the README table all read it, so a phase that moves the numbers re-pins once:
 * `node scripts/pinHeadlines.mjs` (docs/BEST_SETUP.md, *Re-pinning the headlines*) plans every case below in Node and
 * rewrites the fixture and the README table (`--full`: and the phase 37 full-plan fixtures). The phase 37 fixtures
 * (src/tests/lib/raids/phase37/*.json) stay the bit-identical guard; this one is what a reviewer reads in the diff.
 * No Jest import here: pinHeadlines.mjs loads this file outside Jest.
 */
export const HEADLINES_FILE = join(__dirname, '..', 'fixtures', 'headlines.json');

/** Phase 28: the FA headline without these items ("Items I don't own"). */
export const FA_NOT_OWNED = ['Obligator', 'Ascension crossbows'];

export type HeadlineName = 'fa' | 'toa' | 'cox' | 'tob' | 'faSolo' | 'faNotOwned';

export interface HeadlineCase {
  name: HeadlineName;
  raid: RaidId;
  /** README row label. */
  label: string;
  inputs: () => PlanInputs;
  tuning: () => PlanTuning;
}

const team = (name: HeadlineName, raid: RaidId, label: string, notOwned: string[] = []): HeadlineCase => ({
  name,
  raid,
  label,
  inputs: () => planInputsFor(raidConfig(raid), false, notOwned),
  tuning: () => planTuningFor(raidConfig(raid), false),
});

/**
 * The headline plans: Team defaults per raid (camp one ring, planner decides the spec weapons and carriers, compare all
 * routes), FA Solo at party 1 (Phase31's inputs) and FA without Obligator / Ascension crossbows.
 */
export const HEADLINE_CASES: HeadlineCase[] = [
  team('fa', 'fractured-archive', 'Fractured Archive (Team defaults)'),
  team('toa', 'toa', 'Tombs of Amascut (Team defaults, invocation 500)'),
  team('cox', 'cox', 'Chambers of Xeric (Team defaults)'),
  team('tob', 'tob', 'Theatre of Blood (Team defaults)'),
  {
    name: 'faSolo',
    raid: 'fractured-archive',
    label: 'Fractured Archive Solo (party 1)',
    inputs: () => {
      const fa = raidConfig('fractured-archive');
      // Phase31's "FA defaults (slow)" Solo test: no carrier mode, nothing pinned
      const { carrierMode, ...rest } = planInputsFor(fa, false);
      return {
        ...rest,
        drain: 'solo',
        assumptions: { ...fa.defaultAssumptions, partySize: 1 },
        pinned: [],
        ringPolicy: DEFAULT_RING_POLICY,
        specMode: 'auto',
      };
    },
    tuning: () => planTuningFor(raidConfig('fractured-archive'), false),
  },
  team('faNotOwned', 'fractured-archive', `Fractured Archive without ${FA_NOT_OWNED.join(' / ')}`, FA_NOT_OWNED),
];

export const headlineCase = (name: HeadlineName): HeadlineCase => HEADLINE_CASES.find((c) => c.name === name)!;

export const planHeadline = (name: HeadlineName): PlanResult => {
  const c = headlineCase(name);
  return plan(c.inputs(), c.tuning());
};

export interface Headline {
  raid: RaidId;
  label: string;
  /** "21:07.7" */
  total: string;
  /** The planned route's seconds (full precision). */
  seconds: number;
  route: string;
  ring: string | null;
  /** Kit loadouts, worn first. */
  kit: string[];
  freeSlots: number | null;
  /** Team: the team's carriers (planner decides); Solo: null. */
  carriers: Record<string, number> | null;
  /** "Bring: ..." (your spec weapons, damage specs, surge potions). */
  bring: string;
  /** Your items the planner added for specs (inventory names). */
  items: string[];
  /** Team: the drain weapon you carry (null: none / you damage-spec). */
  yourShare: string | null;
  surgeAt: string[];
  /** Per-encounter seconds of the planned route (0.01 s). */
  encounters: Record<string, number>;
}

/** The planned route of a plan result or of a phase 37 normalised fixture (`plannedRoute`). */
const plannedOf = (r: PlanResult | Record<string, unknown>): { id: string, seconds: number, encounters: { id: string, seconds: number }[] } => {
  const n = r as { plannedRoute?: { id: string, seconds: number, encounters: { id: string, seconds: number }[] } };
  if (n.plannedRoute) return n.plannedRoute;
  const p = r as PlanResult;
  const route = p.comparison!.routes[p.planned];
  return { id: route.route.id, seconds: route.seconds, encounters: route.encounters.map((e) => ({ id: e.id, seconds: e.seconds })) };
};

export const round2 = (x: number): number => Math.round(x * 100) / 100;

/** The headline summary of a plan (a PlanResult, or a phase 37 normalised fixture of one). */
export const headlineOf = (name: HeadlineName, r: PlanResult | Record<string, unknown>): Headline => {
  const c = headlineCase(name);
  const p = r as PlanResult;
  const route = plannedOf(r);
  return {
    raid: c.raid,
    label: c.label,
    total: formatDuration(route.seconds),
    seconds: route.seconds,
    route: route.id,
    ring: p.ring.ring,
    kit: p.kit.map((k) => k.label),
    freeSlots: p.slots ? p.slots.free : null,
    carriers: p.specs.team?.carriers ? { ...p.specs.team.carriers } : null,
    bring: p.specs.text,
    items: p.specItems.map((x) => x.name),
    yourShare: p.specs.share?.weapon ?? null,
    surgeAt: p.specs.surgeAt ?? [],
    encounters: Object.fromEntries(route.encounters.map((e) => [e.id, round2(e.seconds)])),
  };
};

export interface HeadlineFixture {
  /** How to regenerate it. */
  note: string;
  plans: Record<HeadlineName, Headline>;
}

export const readHeadlines = (): HeadlineFixture => JSON.parse(readFileSync(HEADLINES_FILE, 'utf8'));
export const headline = (name: HeadlineName): Headline => readHeadlines().plans[name];

export const README_START = '<!-- headlines:start (generated by scripts/pinHeadlines.mjs from src/tests/fixtures/headlines.json) -->';
export const README_END = '<!-- headlines:end -->';

/** The README's headline table (between README_START and README_END). */
export const readmeTable = (f: HeadlineFixture): string => {
  const names = HEADLINE_CASES.map((c) => c.name).filter((n) => f.plans[n]);
  const carriers = (h: Headline) => (h.carriers
    ? Object.entries(h.carriers).filter(([, v]) => v > 0)
      .map(([k, v]) => `${v} ${SPEC_WEAPONS[k as keyof typeof SPEC_WEAPONS]?.label ?? k}`).join(' + ') || 'none'
    : 'Solo');
  const rows = names.map((n) => {
    const h = f.plans[n];
    return `| ${h.label} | **${h.total}** | ${h.kit.join(' · ')} | ${h.ring ?? '-'} | ${carriers(h)} | ${h.bring.replace(/^Bring: /, '')} |`;
  });
  return [
    README_START,
    '| Plan | Total | Kit (worn first) | Ring | Carriers | You bring |',
    '|---|---|---|---|---|---|',
    ...rows,
    README_END,
  ].join('\n');
};

/** Replaces the README's headline block (README_START ... README_END) with `table`. */
export const withReadmeTable = (readme: string, table: string): string => {
  const a = readme.indexOf(README_START);
  const b = readme.indexOf(README_END);
  if (a < 0 || b < a) throw new Error('README has no headline block');
  return readme.slice(0, a) + table + readme.slice(b + README_END.length);
};
