/**
 * Phase 37b: re-pins the headline plans (not part of the Jest run). Plans every case of src/tests/utils/headlines.ts in
 * Node (each in its own child process, a few at once) and writes:
 * - src/tests/fixtures/headlines.json (per plan: total, seconds, route, ring, kit, carriers, items, your share,
 *   per-encounter seconds) — the human-readable pin the slow tests, the verify scripts (scripts/headlines.mjs) and the
 *   README read;
 * - the README's headline table (between the `headlines:start` / `headlines:end` markers);
 * - with --full, also the phase 37 full-plan fixtures (src/tests/lib/raids/phase37/<name>.json, the bit-identical guard).
 *
 * Usage: node scripts/pinHeadlines.mjs [names...] [--full] [--check] [--jobs N] | --readme
 *   names   fa toa cox tob faSolo faNotOwned (default: all; the others keep their entries)
 *   --check write nothing; exit 1 when a fixture (or the README table) would change
 *   --jobs  plans at once (default 3; each plan is single-threaded, ~20-60 s alone, CoX the longest)
 *   --readme only rewrite the README table from the fixture (no planning)
 * After a numbers phase: run it, review `git diff src/tests/fixtures/headlines.json README.md`, then the slow suites.
 * The TypeScript modules are bundled with esbuild first (a dev dependency; jiti can't parse the TSX that @/state pulls in).
 */
import { createRequire } from 'node:module';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const self = fileURLToPath(import.meta.url);

const BUNDLE_DIR = path.join(root, 'node_modules', '.cache', 'pin-headlines');
const BUNDLE = path.join(BUNDLE_DIR, 'headlines.cjs');
const HEADLINES_FILE = path.join(root, 'src', 'tests', 'fixtures', 'headlines.json');
const PHASE37_DIR = path.join(root, 'src', 'tests', 'lib', 'raids', 'phase37');

/**
 * The TypeScript modules (src/tests/utils/headlines.ts + phase37.ts's `normalised`) bundled with esbuild (the '@' paths
 * come from tsconfig.json; images / CSS load empty; packages stay external). The bundle sits under node_modules/.cache
 * so its package imports resolve; the parent builds it once, the children require it.
 */
const buildBundle = async () => {
  const esbuild = createRequire(import.meta.url)('esbuild');
  mkdirSync(BUNDLE_DIR, { recursive: true });
  await esbuild.build({
    stdin: {
      contents: [
        "export * from './src/tests/utils/headlines';",
        "export { normalised } from './src/tests/utils/phase37';",
      ].join('\n'),
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
    outfile: BUNDLE,
    logLevel: 'error',
  });
};
const loadTs = () => createRequire(import.meta.url)(BUNDLE);

const fixtureText = (x) => `${JSON.stringify(x, null, 1)}\n`;
// git may check files out with CRLF (core.autocrlf): compare without line endings, write in the file's own style
const lf = (t) => t.replace(/\r\n/g, '\n');
const readLf = (p) => (existsSync(p) ? lf(readFileSync(p, 'utf8')) : null);
const writeLike = (p, text) => {
  const crlf = existsSync(p) && readFileSync(p, 'utf8').includes('\r\n');
  writeFileSync(p, crlf ? text.replace(/\n/g, '\r\n') : text);
};

// --- child: one plan --------------------------------------------------------------------------------------------------
const child = (name, outDir) => {
  const ts = loadTs();
  const t0 = Date.now();
  const r = ts.planHeadline(name);
  const out = { name, ms: Date.now() - t0, headline: ts.headlineOf(name, r), full: ts.normalised(r) };
  writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(out));
};

// --- parent -------------------------------------------------------------------------------------------------------------
const main = async () => {
  const args = process.argv.slice(2);
  const full = args.includes('--full');
  const checkOnly = args.includes('--check');
  const jobsAt = args.indexOf('--jobs');
  const jobs = jobsAt >= 0 ? Math.max(1, Number(args[jobsAt + 1]) || 3) : 3;
  await buildBundle();
  const headlines = loadTs();
  const readmePath = path.join(root, 'README.md');
  if (args.includes('--readme')) {
    const fixture = JSON.parse(readFileSync(HEADLINES_FILE, 'utf8'));
    writeLike(readmePath, headlines.withReadmeTable(lf(readFileSync(readmePath, 'utf8')), headlines.readmeTable(fixture)));
    console.log('README headline table rewritten from the fixture.');
    return;
  }
  const all = headlines.HEADLINE_CASES.map((c) => c.name);
  const asked = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--jobs');
  const unknown = asked.filter((n) => !all.includes(n));
  if (unknown.length) throw new Error(`unknown plan(s): ${unknown.join(', ')} (known: ${all.join(', ')})`);
  const names = asked.length ? asked : all;
  const outDir = mkdtempSync(path.join(os.tmpdir(), 'pin-headlines-'));
  const t0 = Date.now();
  console.log(`Planning ${names.join(', ')} (${jobs} at once)…`);
  try {
    const queue = [...names];
    const runOne = (name) => new Promise((resolve, reject) => {
      const p = spawn(process.execPath, [self, '--child', name, outDir], { stdio: ['ignore', 'inherit', 'inherit'] });
      p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${name}: exit ${code}`))));
    });
    await Promise.all(Array.from({ length: Math.min(jobs, queue.length) }, async () => {
      while (queue.length) {
        const name = queue.shift();
        await runOne(name);
        const { ms, headline: h } = JSON.parse(readFileSync(path.join(outDir, `${name}.json`), 'utf8'));
        console.log(`  ${name}: ${h.total} (${(ms / 1000).toFixed(1)} s)`);
      }
    }));
    const file = HEADLINES_FILE;
    const old = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { plans: {} };
    const plans = { ...old.plans };
    let changed = 0;
    for (const name of names) {
      const { headline: h, full: f } = JSON.parse(readFileSync(path.join(outDir, `${name}.json`), 'utf8'));
      const before = old.plans[name];
      if (JSON.stringify(before) !== JSON.stringify(h)) {
        changed += 1;
        console.log(`  CHANGED ${name}: ${before ? `${before.total} → ` : ''}${h.total}`);
      }
      plans[name] = h;
      if (full) {
        const fp = path.join(PHASE37_DIR, `${name}.json`);
        const text = fixtureText(f);
        if (readLf(fp) !== text) {
          changed += 1;
          console.log(`  CHANGED phase37/${name}.json`);
          if (!checkOnly) writeLike(fp, text);
        }
      }
    }
    const ordered = Object.fromEntries(all.filter((n) => plans[n]).map((n) => [n, plans[n]]));
    const fixture = {
      note: 'Generated by scripts/pinHeadlines.mjs (src/tests/utils/headlines.ts); re-pin after a numbers phase, review the diff. Seconds: full precision for the total, 0.01 s per encounter.',
      plans: ordered,
    };
    const readme = lf(readFileSync(readmePath, 'utf8'));
    const newReadme = headlines.withReadmeTable(readme, headlines.readmeTable(fixture));
    if (newReadme !== readme) {
      changed += 1;
      console.log('  CHANGED README headline table');
    }
    if (!checkOnly) {
      writeLike(file, fixtureText(fixture));
      writeLike(readmePath, newReadme);
    }
    console.log(`${checkOnly ? 'Checked' : 'Wrote'} in ${((Date.now() - t0) / 1000).toFixed(0)} s: ${changed ? `${changed} change(s)` : 'no change'}`);
    if (checkOnly && changed) process.exitCode = 1;
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
};

if (process.argv[2] === '--child') {
  child(process.argv[3], process.argv[4]);
} else {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
