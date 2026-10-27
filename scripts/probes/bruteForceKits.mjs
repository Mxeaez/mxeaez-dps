/**
 * Phase 37c review probe: brute force over a reduced plan's kits vs the planner's pick.
 *
 * Usage: node scripts/probes/bruteForceKits.mjs <raid> [--pool small|tiny] [--route <id>] [--max-kit N] [--ring <policy>] [--candidates N]
 *   raid       fractured-archive (or fa) | toa | cox | tob
 *   --pool     small (default): Phase36's reduced pool (10 candidates for FA), kits of ≤ 4 loadouts; tiny: 8 for FA, ≤ 3
 *   --route    a route id (default: the raid's Team headline route in headlines.json); `--route list` lists them
 *   --max-kit  the largest kit tried (default: the pool's; never below the planner's kit size)
 *   --ring     camp-one (default, the headlines' policy) | camp-lightbearer (one ring run: faster) | switch
 *   --candidates N  only kits of the first N candidates + the planner's (quicker, weaker; the Jest smoke test)
 *
 * Plans the raid's Team defaults (planner decides specs and carriers) on the reduced pool (presets: one per style + the
 * pickaxe; search: Scythe / Shadow / Twisted bow, one pass) with `PlanHooks.onKitSpace` (Phase36's kit brute force;
 * src/tests/utils/probes.ts `bruteForceKits`), then times every kit of the chosen ring's candidates (up to --max-kit
 * loadouts, within the slots with the plan's carried items) exactly — createKitEvaluator + compareRoutes under the plan's
 * final carriers, damage specs and surge potions, each kit with its own spec budget — and prints the five fastest, the
 * planner's kit and the gap. Phase 38c fix: only kits that pass the planner's dedupe rule count (every loadout saves at
 * least `switchSavingRequired` of its slots: 1 s per slot); the fastest kit of all is printed for reference.
 * Exit 1 when a kit is faster than the planner's by > 1e-6 s (or the planner's own kit re-times differently).
 * Runtime (dev machine): FA small 90 s (336 kits, = Phase36's slow test), FA tiny 30 s (90 kits), ToB tiny 65 s.
 */
import { fmt, loadProbes, table } from './bundle.mjs';

const args = process.argv.slice(2);
const opt = (k) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : undefined;
};
const ALIAS = { fa: 'fractured-archive' };
const raidArg = args.find((a, i) => !a.startsWith('--') && !['--pool', '--route', '--max-kit', '--ring', '--candidates'].includes(args[i - 1]));
const raid = ALIAS[raidArg] ?? raidArg;
const RAIDS = ['fractured-archive', 'toa', 'cox', 'tob'];
if (!RAIDS.includes(raid)) {
  console.error(`Usage: node scripts/probes/bruteForceKits.mjs <${RAIDS.join(' | ')}> [--pool small|tiny] [--route <id>] [--max-kit N] [--ring camp-one|camp-lightbearer|switch]`);
  process.exit(2);
}
const p = await loadProbes();
if (opt('--route') === 'list') {
  p.raidRoutes(raid).forEach((r) => console.log(r));
  process.exit(0);
}
const pool = opt('--pool') ?? 'small';
if (!p.BRUTE_POOLS[pool]) {
  console.error(`unknown pool ${pool} (${Object.keys(p.BRUTE_POOLS).join(', ')})`);
  process.exit(2);
}
const maxKit = opt('--max-kit') ? Number(opt('--max-kit')) : undefined;
const ringPolicy = opt('--ring');
if (ringPolicy && !['camp-one', 'camp-lightbearer', 'switch'].includes(ringPolicy)) {
  console.error(`unknown ring policy ${ringPolicy}`);
  process.exit(2);
}
const b = p.bruteForceKits(raid, {
  pool, route: opt('--route'), maxKit, ringPolicy, candidates: opt('--candidates') ? Number(opt('--candidates')) : undefined,
});
console.log(`${raid}, pool ${pool}, route ${b.route}, ring ${b.ring ?? '(as searched)'}`);
console.log(`candidates (${b.candidates.length}): ${b.candidates.map((c, i) => `[${i}] ${c}`).join('; ')}`);
console.log(`\n${b.kits} kits of up to ${b.maxKit} loadouts (from ${b.tried} candidates) timed, ${b.pruned} dropped by the dedupe rule; the fastest kept:`);
console.log(table(['#', 'seconds', 'kit'], b.top.map((t, i) => [i + 1, fmt(t.seconds, 4), t.kit.join(' + ')])));
console.log('');
console.log(table(['', 'seconds', 'kit'], [
  ['planner', fmt(b.planned, 4), b.plannedKit.join(' + ')],
  ['planner (kit space re-time)', fmt(b.plannedInSpace, 4), ''],
  ['brute force', fmt(b.best, 4), b.bestKit.join(' + ')],
  ['(any kit, no dedupe rule)', fmt(b.bestAny, 4), b.bestAnyKit.join(' + ')],
]));
const ok = p.bruteForceOk(b);
console.log(`\ngap (planner − brute force): ${b.gap.toFixed(6)} s; ${(b.ms / 1000).toFixed(1)} s (plan ${(b.planMs / 1000).toFixed(1)} s); ${ok ? 'OK' : 'FAIL'}`);
if (!ok) process.exitCode = 1;
