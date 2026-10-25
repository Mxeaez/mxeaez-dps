# Deploying to Cloudflare Pages

The site is a fully static Next.js export (`output: 'export'`) served at the root of **https://dps.mxeaez.com**.
Cloudflare Pages builds it from the public GitHub repo `Mxeaez/mxeaez-dps` on every push.

CI (phase 37b): `.github/workflows/ci.yml` runs on every push / PR to `main-mxeaez` — install, lint, `tsc --noEmit` and the fast Jest suite on Node 22.23.4 (no slow suites, no Playwright). It gates nothing: the deploy is still Cloudflare's own build on push.

## What the build produces

`yarn build` = `next build` (static export into `out/`, using `.env.production`) followed by
`node scripts/copyCdn.mjs`, which copies `cdn/` (monster + equipment images and the data JSON) into `out/cdn/`.
Yarn 4 does not run `prebuild`/`postbuild` hooks, so the copy is chained in the `build` script itself.

- `out/` is about 210 MB / ~7,800 files (`cdn/monsters` 185 MB, `cdn/equipment` 13 MB). The largest files are
  `out/cdn/json/equipment.json` (3.2 MB), `out/cdn/json/monsters.json` (2.5 MB) and the largest JS chunk (~2 MB).
  Pages limits ([limits](https://developers.cloudflare.com/pages/platform/limits/)): 20,000 files per deployment,
  25 MiB per file, 20-minute build timeout; we are well inside all three.
- Images are requested from `/cdn/...` on our own domain (`NEXT_PUBLIC_CDN_URL=/cdn`), so new monsters such as the
  Fractured Archive bosses have images without depending on the OSRS Wiki's bucket.
- Routes: `out/index.html` (`/`), `out/best-setup.html` (`/best-setup`), `out/404.html`. Pages serves
  `/best-setup` from `best-setup.html` automatically (and 308-redirects `/best-setup.html` to `/best-setup`);
  no `_redirects` file is needed.

## Environment (`.env.production`, committed)

| Variable | Value | Why |
|---|---|---|
| `NEXT_PUBLIC_BASE_URL` | `https://dps.mxeaez.com` | metadata / canonical URL |
| `NEXT_PUBLIC_BASE_PATH` | *(empty)* | app lives at the domain root |
| `NEXT_PUBLIC_CDN_URL` | `/cdn` | images from our copy of `cdn/` |
| `NEXT_PUBLIC_DISABLE_SHORTLINKS` | `true` | the share-link backend is the OSRS Wiki's; the Share button shows a notice instead |
| `NEXT_PUBLIC_LOCAL_STORE_SHORTLINKS` | `true` | keep saving state locally |
| `NEXT_PUBLIC_SHORTLINK_URL` | `https://dps.mxeaez.com` | unused while shortlinks are disabled |

These are read at build time, so nothing needs to be set in the Pages dashboard for them. `yarn dev` keeps using
`.env.development` (http://localhost:3001/osrs-dps, images from the upstream CDN).

RuneLite (WikiSync) discovery only runs when the RuneLite button is clicked, as upstream, so it is left unchanged.

## Node version

`.node-version` and `.nvmrc` pin **Node 22.23.4** (current 22.x LTS). Pages' v3 build image reads `.node-version`;
the `NODE_VERSION` variable below makes it explicit (it accepts any Node version; see the
[build image docs](https://developers.cloudflare.com/pages/configuration/build-image/)). Verified locally:
`yarn install --immutable && yarn build` passes on Node 22.23.4 with the committed `yarn.lock` (no lockfile
changes). Node 24 also works.

The v3 build image does not read `package.json`'s `packageManager` field, so the build command runs the Yarn
release committed in `.yarn/releases` directly. `.yarnrc.yml`'s `yarnPath` would also hand any global Yarn off to
the vendored 4.9.2, so no `corepack` step is needed.

## One-time setup in the Cloudflare dashboard

Cloudflare now offers two ways to host a static site from a Git repo. Either works; pick whichever the dashboard
shows you first.

### Option 1: Workers (static assets) — what the "Create" flow shows by default

The repo contains `wrangler.jsonc`, which tells Wrangler to serve `./out` as a Workers Static Assets site (no Worker
script). `wrangler` is a dev dependency, so `npx wrangler deploy` uses the committed version.

1. **Compute → Workers & Pages → Create → Import a repository** → authorise GitHub, select `Mxeaez/mxeaez-dps`.
2. **Set up your application**:
   - Project name: `mxeaez-dps`
   - Build command: `node .yarn/releases/yarn-4.9.2.cjs install --immutable && node .yarn/releases/yarn-4.9.2.cjs build`
   - Deploy command: `npx wrangler deploy` (the default)
   - Preview command: leave the default, or clear it
   - Build variables (under *Advanced settings* / *Build variables*): `NODE_VERSION` = `22.23.4`
   - Production branch: `main-mxeaez`
3. **Deploy**. The first build takes ~3–5 min and uploads ~7,800 asset files. The site appears at
   `https://mxeaez-dps.<account>.workers.dev`.
4. Custom domain: in the Worker → **Settings → Domains & Routes → Add → Custom domain** → `dps.mxeaez.com`.
   With `mxeaez.com` on Cloudflare the DNS record and certificate are created automatically.

Verified locally with `npx wrangler deploy --dry-run` (reads 7,842 files from `out/`). Note that the dry run does
not catch server-side manifest validation: the first real deploy failed with "Manifest path must be URI encoded"
because three wiki image names contain a bare `%` (`The Maiden of Sugadinti (30% health).png` etc.).
`scripts/copyCdn.mjs` now skips any file with `%` in its name and lists them; those few images fall back to broken
in the UI, which only affects the ToB Maiden health variants. Clean URLs come from
`html_handling: "auto-trailing-slash"` (`/best-setup` serves `best-setup.html`).

### Option 2: Pages

1. **Workers & Pages → Create → Pages → Connect to Git** → pick GitHub, authorise, select `Mxeaez/mxeaez-dps`.
2. **Set up builds and deployments**:
   - Project name: `mxeaez-dps` (gives `mxeaez-dps.pages.dev`)
   - Production branch: `main-mxeaez` (or whichever branch is pushed as the default)
   - Framework preset: **None** (do not pick "Next.js", that one targets the server runtime)
   - Build command: `node .yarn/releases/yarn-4.9.2.cjs install --immutable && node .yarn/releases/yarn-4.9.2.cjs build`
   - Build output directory: `out`
   - Root directory: *(leave empty)*
   - Environment variables (Production, and Preview if you want previews to build):
     - `NODE_VERSION` = `22.23.4`
     - `SKIP_DEPENDENCY_INSTALL` = `1` (accepts `1` or `true`; the build command installs, so Pages' own
       install step is skipped — see the [build image docs](https://developers.cloudflare.com/pages/configuration/build-image/))
3. **Save and Deploy**, wait for the first build (~3–5 min), open `https://mxeaez-dps.pages.dev`.
4. In the project's **Settings → Build**, confirm **Build system version** is **v3** (new projects default to it;
   switch and redeploy if it shows an older version).

Alternative build command (equivalent, via corepack): `corepack enable && yarn install --immutable && yarn build`.

If the install complains about immutable installs (lockfile out of date), run `yarn install` locally, commit
`yarn.lock`, and push; do not switch `--immutable` off on CI.

## Custom domain `dps.mxeaez.com`

In the Pages project → **Custom domains → Set up a custom domain** → `dps.mxeaez.com`.

**(a) `mxeaez.com` DNS is on Cloudflare:** Pages offers to create the record; accept. It adds a proxied
`CNAME dps → mxeaez-dps.pages.dev`. Active within a few minutes, certificate issued automatically.

**(b) DNS is elsewhere:** at the DNS provider create `CNAME dps → mxeaez-dps.pages.dev` (TTL default, no proxy
settings there). Then add the domain in Pages → Custom domains as above (adding it in Pages is required; a CNAME
alone returns an error). Pages verifies the CNAME and issues the certificate; this can take up to ~24 h depending
on the provider's propagation.

## Redeploying

Push to the production branch; Pages builds and deploys automatically. Other branches get preview URLs
(`<branch>.mxeaez-dps.pages.dev`). Roll back from the project's **Deployments** list ("Rollback to this deployment").

## Running the same build locally

Stop `yarn dev` first and delete `.next` (see CLAUDE.md), then:

```
node .yarn/releases/yarn-4.9.2.cjs install --immutable
node .yarn/releases/yarn-4.9.2.cjs build
npx wrangler pages dev out --port 8788      # serves out/ like Pages does (clean URLs, 404.html); no login needed
node scripts/verifyRootDeploy.mjs http://127.0.0.1:8788/
```

`verifyRootDeploy.mjs` checks the Archive Guardian image comes from `/cdn` with HTTP 200, a DPS renders, the Share
notice, `/best-setup` resolves and a Xarth gear search completes. Screenshots go to the OS temp dir; pass
`--screenshots docs/screenshots` to refresh the committed `phase10-root-*.png`.
