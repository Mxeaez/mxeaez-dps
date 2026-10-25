/**
 * Phase 37c: loads src/tests/utils/probes.ts outside Jest for the probe CLIs in this folder (retime.mjs,
 * drainOutcome.mjs, bruteForceKits.mjs). Bundled with esbuild as scripts/pinHeadlines.mjs does (the '@' paths from
 * tsconfig.json; images / CSS load empty; packages stay external), into node_modules/.cache/probes so its package
 * imports resolve. Rebuilt on every run (about a second), so a probe always times the working tree's code.
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);

export const loadProbes = async () => {
  const esbuild = require('esbuild');
  const dir = path.join(root, 'node_modules', '.cache', 'probes');
  const outfile = path.join(dir, 'probes.cjs');
  mkdirSync(dir, { recursive: true });
  await esbuild.build({
    stdin: { contents: "export * from './src/tests/utils/probes';", resolveDir: root, loader: 'ts' },
    absWorkingDir: root,
    tsconfig: path.join(root, 'tsconfig.json'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    packages: 'external',
    loader: Object.fromEntries(['.png', '.jpg', '.jpeg', '.webp', '.svg', '.css'].map((e) => [e, 'empty'])),
    outfile,
    // the fixtures are found from src/tests/utils (headlines.ts, phase37.ts: the only __dirname users in src)
    define: { __dirname: JSON.stringify(path.join(root, 'src', 'tests', 'utils')) },
    logLevel: 'error',
  });
  delete require.cache[outfile];
  return require(outfile);
};

/** A plain text table (columns padded; numbers right-aligned). */
export const table = (head, rows) => {
  const cells = [head, ...rows].map((r) => r.map((c) => (c === null || c === undefined ? '-' : String(c))));
  const w = head.map((_, i) => Math.max(...cells.map((r) => (r[i] ?? '').length)));
  const num = (s) => /^[-+]?[\d.]+( s|%)?$/.test(s);
  const line = (r) => r.map((c, i) => (num(c) ? c.padStart(w[i]) : c.padEnd(w[i]))).join('  ').trimEnd();
  return [line(cells[0]), w.map((x) => '-'.repeat(x)).join('  '), ...cells.slice(1).map(line)].join('\n');
};

export const fmt = (x, d = 3) => (x === null || x === undefined ? '-' : Number.isFinite(x) ? x.toFixed(d) : String(x));
export const pct = (p) => (p === null || p === undefined ? '-' : `${(100 * p).toFixed(2)}%`);
