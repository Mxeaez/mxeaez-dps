/**
 * Phase 38i: our side of the Gearscape cross-check. Prints (and writes to the --out JSON) for each FA boss / phase and each
 * of four setups (Twisted bow, Scythe, Obligator, Tumeken's shadow: the planner's presets, default assumptions: 99s,
 * Super combat / Ranging / Saturated heart, Piety / Rigour / Augury, elemental fragments, party of 6, no drains) the
 * best style's max hit, accuracy and DPS (src/lib/fracturedArchive evaluateLoadout). Compare only; changes nothing.
 *
 * Usage: node scripts/probes/gearscapeOurs.mjs [--out file.json] [--drain none|solo|team]   (team = the Team drain state, for the
 * docs/calibration/checklist.md DPS table)
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { root, table, fmt, pct } from './bundle.mjs';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
const dir = path.join(root, 'node_modules', '.cache', 'probes');
mkdirSync(dir, { recursive: true });
const outfile = path.join(dir, 'gsOurs.cjs');
await esbuild.build({
  stdin: {
    contents: `
export { generateEmptyPlayer } from '@/state';
export * from '@/lib/fracturedArchive/bestSetup';
export { PRESETS, DEFAULT_ASSUMPTIONS } from '@/lib/fracturedArchive/presets';
export { resolvePresetEquipment } from '@/lib/fracturedArchive/loadout';
`,
    resolveDir: root,
    loader: 'ts',
  },
  absWorkingDir: root,
  tsconfig: path.join(root, 'tsconfig.json'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  packages: 'external',
  loader: Object.fromEntries(['.png', '.jpg', '.jpeg', '.webp', '.svg', '.css'].map((e) => [e, 'empty'])),
  outfile,
  define: { __dirname: JSON.stringify(path.join(root, 'src', 'tests', 'utils')) },
  logLevel: 'error',
});
const m = require(outfile);

export const SETUPS = ['Twisted bow (Masori)', 'Torva + Scythe (slash)', 'Torva + Obligator', "Tumeken's shadow (Ancestral)"];
// [row label, target key, phase (undefined = the first)]
export const ROWS = [
  ['AG Flying', 'ag-flying'],
  ['AG Grounded', 'ag-grounded'],
  ['Bork armour 8', 'bork', 'Smorks 100-76% HP (armour 8)'],
  ['Bork armour 10', 'bork', 'Smorks 75-51% HP (armour 10)'],
  ['Bork armour 12', 'bork', 'Smorks 50-26% HP (armour 12)'],
  ['Bork armour 14', 'bork', 'Smorks 25-0% HP (armour 14)'],
  ['Bork stunned', 'bork', 'Stunned (armour 0)'],
  ['Smorks', 'smorks'],
  ['Ezekiel', 'ezekiel'],
  ['Xarth', 'xarth'],
  ['Ocellus P1 at a corner', 'ocellus-p1', 'At a corner'],
  ['Ocellus P1 walking (Prot Melee)', 'ocellus-p1', 'Walking to a corner (Protect from Melee)'],
  ['Ocellus P2 (Blade)', 'ocellus-p2'],
  ['Ocellus P3 quadrants 1-3', 'ocellus-p3', 'Quadrants 1-3'],
];
export const evaluate = (drain = 'none') => {
  const out = [];
  for (const [label, key, phase] of ROWS) {
    for (const setup of SETUPS) {
      const preset = m.PRESETS.find((p) => p.name === setup);
      const { monster } = m.buildTargetMonster(m.findTarget(key), phase, drain, m.DEFAULT_ASSUMPTIONS);
      let best = null;
      const spells = m.presetSpells(preset);
      for (const style of m.presetStyles(preset)) {
        for (const spell of spells) {
          const player = m.applyPresetToPlayer(m.generateEmptyPlayer(), preset, style, spell, monster, m.DEFAULT_ASSUMPTIONS);
          const e = m.evaluateLoadout(player, monster, false);
          if (!best || e.dps > best.dps) {
            best = {
              label, key, phase: phase ?? null, setup, style: style.name, stance: style.stance, spell, dps: e.dps, maxHit: e.maxHit, accuracy: e.accuracy, issues: e.issues, monsterId: monster.id, monsterName: monster.name, def: monster.skills.def,
            };
          }
        }
      }
      out.push(best);
    }
  }
  return out;
};

if (path.basename(process.argv[1] ?? '') === 'gearscapeOurs.mjs') {
  const di = process.argv.indexOf('--drain');
  const res = evaluate(di >= 0 ? process.argv[di + 1] : 'none');
  const oi = process.argv.indexOf('--out');
  if (oi >= 0) writeFileSync(process.argv[oi + 1], JSON.stringify(res, null, 1));
  console.log(table(['row', 'setup', 'style', 'max', 'acc', 'DPS', 'monster def'], res.map((r) => [r.label, r.setup, `${r.style}${r.spell ? ` ${r.spell}` : ''}`, r.maxHit, pct(r.accuracy), fmt(r.dps, 3), r.def])));
}
