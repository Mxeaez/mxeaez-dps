/**
 * Phase 37c review probe: one encounter's drains and spec budget of a headline plan, as tables for hand-checking.
 *
 * Usage: node scripts/probes/drainOutcome.mjs <encounter> [--plan <name>]
 *   encounter  an encounter id of the plan's route, e.g. xarth, archive-guardian, toa-kephri, cox-olm, tob-verzik
 *   --plan     fa toa cox tob faSolo faNotOwned (default: the first headline whose route has the encounter)
 *   no args    lists every headline's encounters
 *
 * The plan is re-timed as scripts/probes/retime.mjs does (src/tests/utils/probes.ts `drainOutcome`), then prints:
 * - events: each drain event's NPC, first row and spec counts (the encounter spec budget's choice);
 * - phases: per phase its drain event, wall clock start / end, Defence and floor, Magic defence bonus, hit chance and
 *   energy per spec of each weapon used, the order they are sent in and P(floor), expected and ranked Defence in that
 *   order (teamSpecs `defenceOutcome`; phase 38h-1: each spec at the Defence the earlier ones leave), the Ayak drain,
 *   your damage specs;
 * - the drain line per phase (phase 38h-1: drainLine.ts `drainFacts`, that phase's own plan);
 * - pools: each spec bar group (a carrier weapon, or "me"), its regen period, start / end energy, regen ticks over the
 *   encounter's wall clock (the reported phases' clock), Death Charge energy (phase 38b), energy spent (Liquid
 *   adrenaline: half on a phase inside its window) and start + regen (+ surge) + Death Charge − spent.
 * Exit 1 when the re-time's spec plan differs from the plan's own (phase37/<name>.json), or a pool spends more than
 * start + regen (+ surge). A few seconds.
 */
import {
  fmt, loadProbes, pct, table,
} from './bundle.mjs';

const args = process.argv.slice(2);
const planAt = args.indexOf('--plan');
const p = await loadProbes();
const list = () => p.headlineNames().forEach((n) => console.log(`  ${n}: ${p.plannedEncounters(n).join(', ')}`));
const encounter = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--plan');
if (!encounter) {
  console.log('Usage: node scripts/probes/drainOutcome.mjs <encounter> [--plan <name>]. Encounters per plan:');
  list();
  process.exit(2);
}
const name = planAt >= 0 ? args[planAt + 1] : p.headlineWithEncounter(encounter);
if (!name || !p.headlineNames().includes(name) || !p.plannedEncounters(name).includes(encounter)) {
  console.error(`no headline plan ${name ? `'${name}' ` : ''}with encounter '${encounter}'. Encounters per plan:`);
  list();
  process.exit(2);
}
const t0 = Date.now();
const d = p.drainOutcome(name, encounter);
console.log(`${name} / ${d.label}: ${fmt(d.seconds, 4)} s (wall ${fmt(d.wall, 2)} s)${d.surge ? ', surge dose here' : ''}`);
console.log('\nevents (the encounter spec budget)');
console.log(table(['#', 'npc', 'reset', 'first row', 'counts'], d.events.map((e, i) => [
  i, e.npc, e.reset ?? '', e.firstRowKey, Object.entries(e.counts).map(([w, n]) => `${w} ${n}`).join(', ') || 'no specs',
])));
console.log('\nphases');
const weapons = (o) => Object.entries(o).map(([w, x]) => `${w} ${x}`).join(', ');
console.log(table(['phase', 'event', 'start', 'end', 'seconds', 'def', 'floor', 'magic def', 'attempts', 'order', 'hit chance', 'energy', 'P(floor)', 'E[def]', 'ranked def', 'ayak drain', 'your damage specs'], d.phases.map((r) => [
  r.key, r.event < 0 ? '-' : r.event, fmt(r.start, 2), fmt(r.end, 2), fmt(r.seconds, 3), r.def, r.floor, r.magicDef,
  r.attempts || '-', r.order || '-', weapons(Object.fromEntries(Object.entries(r.hitChance).map(([w, x]) => [w, pct(x)]))) || '-',
  weapons(r.energy) || '-', pct(r.pFloor), fmt(r.expectedDef, 2), r.rankedDef,
  r.ayakDrain === null ? '-' : `${r.ayakDrain} (magic def ${r.magicDefAfter})`,
  r.damage.map((x) => `${x.count}× ${x.weapon} (${x.energy}%)`).join(', ') || '-',
])));
console.log('\nthe drain line per phase (drainLine.ts drainFacts; phase 38h-1: an event pays its first phase\'s plan, a later phase\'s only when the specs so far don\'t floor it)');
d.phases.filter((r) => r.line).forEach((r) => console.log(`  ${r.key}: ${r.line}`));
console.log('\npools (spec bars)');
console.log(table(['group', 'bars', 'regen every', 'start %', 'end %', 'regen ticks', 'death charge %', 'spent %', 'start + regen + DC - spent', 'check'], d.pools.map((g) => [
  g.group, g.count, `${g.regenSeconds} s`, g.start.join(' / '), g.end.join(' / '), g.ticks, g.restored, g.spent, g.balance,
  g.balance >= -1e-9 ? 'ok' : 'OVERSPENT',
])));
const fails = [];
if (!d.eventsMatch) fails.push('the re-time\'s spec plan differs from the plan\'s (phase37 fixture)');
d.pools.filter((g) => g.balance < -1e-9).forEach((g) => fails.push(`pool ${g.group} spends more than start + regen`));
console.log(`\n${((Date.now() - t0) / 1000).toFixed(1)} s; spec plan = the plan's: ${d.eventsMatch ? 'yes' : 'NO'}`);
if (fails.length) {
  console.error(`FAIL: ${fails.join('; ')}`);
  process.exitCode = 1;
}
