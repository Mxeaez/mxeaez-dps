/**
 * Phase 25: best-setup pool audit (not part of the Jest run; the same check runs as
 * src/tests/lib/fracturedArchive/PoolAudit.test.ts, which must find nothing).
 *
 * Usage: node scripts/auditPool.mjs [--all]
 * Lists every item in cdn/json/equipment.json that dominates a slot of some raid's search pool (offensive stats) or
 * whose name is checked in the upstream calculator code (PlayerVsNPCCalc.ts, BaseCalc.ts, Equipment.ts), but that is in
 * no pool, preset or spec loadout and not in POOL_EXCLUDED (src/lib/fracturedArchive/poolAudit.ts).
 * --all also prints the excluded items with their reason.
 * Loads the TypeScript modules with jiti (a dev dependency of Next) and the '@' path alias.
 */
import Module, { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
// image imports (utils.ts -> potion icons) load as an empty string, without resolving the file
const IMAGE = /\.(png|jpe?g|webp|svg)$/i;
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolve(request, ...rest) {
  return IMAGE.test(request) ? request : resolveFilename.call(this, request, ...rest);
};
['.png', '.jpg', '.jpeg', '.webp', '.svg'].forEach((ext) => { Module._extensions[ext] = (m) => { m.exports = ''; }; });
const jiti = require('jiti')(fileURLToPath(import.meta.url), {
  alias: { '@': path.join(root, 'src') },
  interopDefault: true,
});

const audit = jiti(path.join(root, 'src/lib/fracturedArchive/poolAudit.ts'));
const { AUDIT_SOURCE_FILES, AUDIT_EXTRA_REFS } = jiti(path.join(root, 'src/lib/fracturedArchive/poolAuditSources.ts'));

const sources = AUDIT_SOURCE_FILES.map((f) => readFileSync(path.join(root, f), 'utf8'));
const effectNames = audit.effectNamesFromSources(sources);
const findings = audit.auditPool(effectNames, AUDIT_EXTRA_REFS);

console.log(`Upstream effect names found: ${effectNames.length}; pool exclusions: ${audit.POOL_EXCLUDED.length}`);
if (!findings.length) {
  console.log('Nothing missing: every dominating / upstream-effect item is in a pool, a preset or POOL_EXCLUDED.');
} else {
  console.log(`${findings.length} item(s) missing from the pools:`);
  for (const f of findings) console.log(`- [${f.slot}] ${f.name}: ${f.reasons.slice(0, 3).join('; ')}${f.reasons.length > 3 ? ` (+${f.reasons.length - 3})` : ''}`);
}

if (process.argv.includes('--all')) {
  const names = new Set(audit.auditPool(effectNames, AUDIT_EXTRA_REFS, []).map((f) => f.name));
  console.log('\nExcluded (name: reason):');
  for (const n of [...names].sort()) {
    const x = audit.isExcluded(n);
    if (x) console.log(`- ${n}: ${x.reason}`);
  }
}
process.exitCode = findings.length ? 1 : 0;
