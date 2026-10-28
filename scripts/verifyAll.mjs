/**
 * Phase 37b: runs verify scripts in parallel against the running dev server (not part of the Jest run).
 *
 * Usage: node scripts/verifyAll.mjs [scripts...] [--jobs N] [--base URL] [--keep-screenshots] [--other-raids]
 *   scripts            names or paths: verifyPhase37b, scripts/verifyPhase21.mjs, 37b (= verifyPhase37b); default: every
 *                      scripts/verifyPhase*.mjs (scripts/stale/ excluded; --all includes them)
 *   --jobs N           scripts at once (default 3; each launches its own browser — fresh localStorage — and plans in the
 *                      page's helper workers, so time limits inside a script are tighter with more jobs)
 *   --base URL         passed to each script as its base URL (default: each script's own, http://localhost:3001/osrs-dps/)
 *   --other-raids      (phase 38f-2; = RUN_OTHER_RAIDS=1) also run the ToA / CoX / ToB steps and the scripts marked
 *                      `// other-raids-only`; the dev server needs NEXT_PUBLIC_SHOW_OTHER_RAIDS=1 for the tabs. Round 6 is FA only.
 *   --keep-screenshots keep the tracked docs/screenshots/*.png the scripts overwrote (default: restored with
 *                      `git checkout`; files already modified before the run are put back as they were)
 * Prints one line per script (OK / FAIL, seconds, failed checks) and the wall time vs the scripts' summed time; each
 * script's full output goes to a log file (path printed). Exit code 1 when any script fails.
 * The scripts are independent: unique screenshot names, no temp files or ports of their own, one browser each.
 */
import { spawn, execFileSync } from 'node:child_process';
import {
  copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
if (args.includes('--other-raids')) process.env.RUN_OTHER_RAIDS = '1';
const OTHER_RAIDS = !!process.env.RUN_OTHER_RAIDS;
const jobs = Math.max(1, Number(opt('--jobs')) || 3);
const base = opt('--base');
const keep = args.includes('--keep-screenshots');
const asked = args.filter((a, i) => !a.startsWith('--') && !['--jobs', '--base'].includes(args[i - 1]));

const natural = (a, b) => a.localeCompare(b, 'en', { numeric: true });
const resolveScript = (a) => {
  const name = path.basename(a).replace(/\.mjs$/, '');
  const file = /^\d/.test(name) ? `verifyPhase${name}.mjs` : `${name}.mjs`;
  return path.join(root, 'scripts', file);
};
const allScripts = asked.length
  ? asked.map(resolveScript)
  : [...readdirSync(path.join(root, 'scripts')).filter((f) => /^verifyPhase.*\.mjs$/.test(f)).map((f) => path.join(root, 'scripts', f)),
    ...(process.argv.includes('--all') && existsSync(path.join(root, 'scripts', 'stale'))
      ? readdirSync(path.join(root, 'scripts', 'stale')).filter((f) => /^verifyPhase.*\.mjs$/.test(f)).map((f) => path.join(root, 'scripts', 'stale', f)) : [])]
    .sort((a, b) => natural(path.basename(a), path.basename(b)));

// phase 38f-2: scripts about the other raids only are skipped unless RUN_OTHER_RAIDS=1 (their steps in mixed scripts gate themselves)
const otherOnly = (f) => /^\/\/ other-raids-only/m.test(readFileSync(f, 'utf8'));
const scripts = allScripts.filter((f) => OTHER_RAIDS || !otherOnly(f));
const skipped = allScripts.filter((f) => !scripts.includes(f));

const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' });
const modifiedShots = () => git('diff', '--name-only', '--', 'docs/screenshots').split('\n').filter(Boolean);

const main = async () => {
  const logDir = path.join(os.tmpdir(), `verify-all-${Date.now()}`);
  mkdirSync(logDir, { recursive: true });
  // tracked screenshots already modified before the run are backed up and put back afterwards
  const before = modifiedShots();
  const backups = before.map((f) => {
    const to = path.join(logDir, `backup-${f.replace(/[\\/]/g, '_')}`);
    copyFileSync(path.join(root, f), to);
    return [f, to];
  });
  console.log(`${scripts.length} script(s), ${jobs} at once; logs in ${logDir}`);
  if (skipped.length) console.log(`Skipped (other raids, set RUN_OTHER_RAIDS=1 / --other-raids): ${skipped.map((f) => path.basename(f, '.mjs')).join(', ')}`);
  const t0 = Date.now();
  const results = [];
  const queue = [...scripts];
  const runOne = (file) => new Promise((resolve) => {
    const name = path.basename(file, '.mjs');
    const started = Date.now();
    const out = [];
    const p = spawn(process.execPath, [file, ...(base ? [base] : [])], { cwd: root });
    p.stdout.on('data', (d) => out.push(d));
    p.stderr.on('data', (d) => out.push(d));
    p.on('error', (e) => out.push(Buffer.from(String(e))));
    p.on('close', (code) => {
      const text = Buffer.concat(out).toString('utf8');
      const log = path.join(logDir, `${name}.log`);
      writeFileSync(log, text);
      const fails = text.split('\n').filter((l) => /^FAIL\b/.test(l));
      const r = {
        name, ok: code === 0 && !fails.length, seconds: (Date.now() - started) / 1000, fails, log, code,
      };
      results.push(r);
      const detail = r.ok ? '' : `: ${fails.length ? fails.slice(0, 3).map((l) => l.slice(5)).join(' | ') : `exit ${code}`} (log: ${log})`;
      console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${name} (${r.seconds.toFixed(0)} s)${detail}`);
      resolve();
    });
  });
  await Promise.all(Array.from({ length: Math.min(jobs, queue.length) }, async () => {
    while (queue.length) await runOne(queue.shift());
  }));
  const wall = (Date.now() - t0) / 1000;
  const summed = results.reduce((t, r) => t + r.seconds, 0);
  const failed = results.filter((r) => !r.ok);

  if (!keep) {
    const touched = modifiedShots();
    const restore = touched.filter((f) => !before.includes(f));
    if (restore.length) git('checkout', '--', ...restore);
    backups.forEach(([f, from]) => copyFileSync(from, path.join(root, f)));
    console.log(`Restored ${restore.length} tracked screenshot(s)${backups.length ? `; kept ${backups.length} modified before the run as they were` : ''}.`);
  }
  console.log(`${results.length - failed.length} / ${results.length} OK; wall ${wall.toFixed(0)} s (the scripts' own times sum to ${summed.toFixed(0)} s)`);
  if (failed.length) console.log(`Failed: ${failed.map((r) => r.name).join(', ')}`);
  process.exitCode = failed.length ? 1 : 0;
};

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
