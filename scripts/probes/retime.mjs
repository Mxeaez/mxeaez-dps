/**
 * Phase 37c review probe: re-time a headline plan's kit outside the planner and compare it with the pin.
 *
 * Usage: node scripts/probes/retime.mjs [names...] [--quiet]
 *   names   fa toa cox tob faSolo faNotOwned (default: all six)
 *   --quiet only the summary table (no per-encounter rows)
 *
 * For each plan: the kit of src/tests/lib/raids/phase37/<name>.json, rebuilt as kit loadouts with the plan's ring,
 * carriers (Team) / spec subset (Solo), damage specs and surge potions on the assumptions, timed with compareRoutes
 * over the raid's routes (src/tests/utils/probes.ts `retimeHeadline`; the same as `recomputed` in crossRaidHeadlines.ts),
 * vs src/tests/fixtures/headlines.json. Prints the pinned total, the re-time, the gap, the fastest route of the
 * re-time and, per encounter, pinned (0.01 s) vs re-timed seconds.
 * Exit 1 when a total's gap is > 0.001 s, the fastest route is another one, or an encounter rounds differently.
 * No planning: about 2-10 s per plan.
 */
import { fmt, loadProbes, table } from './bundle.mjs';

const args = process.argv.slice(2);
const quiet = args.includes('--quiet');
const p = await loadProbes();
const all = p.headlineNames();
const asked = args.filter((a) => !a.startsWith('--'));
const unknown = asked.filter((n) => !all.includes(n));
if (unknown.length) {
  console.error(`unknown plan(s): ${unknown.join(', ')} (known: ${all.join(', ')})`);
  process.exit(2);
}
const names = asked.length ? asked : all;
const results = [];
for (const name of names) {
  const r = p.retimeHeadline(name);
  results.push(r);
  if (!quiet) {
    console.log(`\n${name}: ${r.label} — route ${r.route}`);
    console.log(table(['encounter', 'pinned s', 'retimed s', 'gap s', 'check'], r.encounters.map((e) => [
      e.id, fmt(e.pinned, 2), fmt(e.retimed, 4), e.pinned === null ? '-' : fmt(e.retimed - e.pinned, 4),
      r.encounterMismatches.includes(e.id) ? 'MISMATCH' : 'ok',
    ])));
  }
}
console.log('');
console.log(table(['plan', 'total', 'pinned s', 'retimed s', 'gap s', 'fastest = pinned route', 'time', 'check'], results.map((r) => [
  r.name, r.total, fmt(r.pinned, 4), fmt(r.retimed, 4), r.gap.toExponential(2), r.fastest === r.route ? 'yes' : `NO (${r.fastest})`,
  `${(r.ms / 1000).toFixed(1)} s`, p.retimeOk(r) ? 'OK' : 'FAIL',
])));
const bad = results.filter((r) => !p.retimeOk(r));
if (bad.length) {
  console.error(`\nFAIL: ${bad.map((r) => r.name).join(', ')} (gap > ${p.RETIME_TOLERANCE} s, another fastest route, or an encounter off)`);
  process.exitCode = 1;
}
