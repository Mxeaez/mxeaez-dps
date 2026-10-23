// mxeaez fork: copy the monster/equipment images (and data JSON) from cdn/ into the static export at out/cdn/, so
// production serves them from our own domain (NEXT_PUBLIC_CDN_URL=/cdn). Runs after `next build` (see package.json;
// Yarn 4 does not run `postbuild` hooks automatically). Plain Node, no symlinks, works on Windows and Linux.
import { cpSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const src = join(root, 'cdn');
const dest = join(root, 'out', 'cdn');

if (!existsSync(join(root, 'out'))) {
  console.error('copyCdn: out/ does not exist; run `next build` first.');
  process.exit(1);
}

// Cloudflare's asset upload rejects the whole deploy if any path contains a bare '%' ("Manifest path must be URI
// encoded"). Only a few wiki image names do (e.g. "The Maiden of Sugadinti (30% health).png"); skip those.
const skipped = [];
cpSync(src, dest, {
  recursive: true,
  filter: (p) => {
    if (p.includes('%')) {
      skipped.push(p.slice(src.length + 1));
      return false;
    }
    return true;
  },
});

const count = (dir) => readdirSync(dir).reduce((n, f) => {
  const p = join(dir, f);
  return n + (statSync(p).isDirectory() ? count(p) : 1);
}, 0);
console.log(`copyCdn: copied ${count(dest)} files from cdn/ to out/cdn/`);
if (skipped.length) {
  console.log(`copyCdn: skipped ${skipped.length} file(s) with '%' in the name (not deployable as Cloudflare assets):`);
  skipped.forEach((f) => console.log(`  ${f}`));
}
