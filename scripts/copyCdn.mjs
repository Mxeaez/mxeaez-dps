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

cpSync(src, dest, { recursive: true });

const count = (dir) => readdirSync(dir).reduce((n, f) => {
  const p = join(dir, f);
  return n + (statSync(p).isDirectory() ? count(p) : 1);
}, 0);
console.log(`copyCdn: copied ${count(dest)} files from cdn/ to out/cdn/`);
