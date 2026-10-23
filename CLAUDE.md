# CLAUDE.md

Private fork of the OSRS Wiki DPS calculator adding The Fractured Archive (raid 4) bosses and a best-setup
finder. Read `ROADMAP.md` (phases, decisions, data gaps) and `PROGRESS.md` (what's done) before starting work.

## Commands (Windows, PowerShell)

- Yarn is vendored: `node .yarn/releases/yarn-4.9.2.cjs <cmd>` (no global yarn). Examples below use `yarn` for short.
- `yarn dev` → http://localhost:3001/osrs-dps (port 3000 is occupied on this machine; check the "Local:" line).
- `yarn test` (Jest, ~10 s) and `yarn lint` must both be green before a phase is called done.
- `yarn build` → static export in `out/`. **Stop `yarn dev` first** — a build while the dev server runs corrupts its
  `.next` ("Cannot find module './NNNN.js'"); delete `.next` and restart `yarn dev` after building.
- Playwright: `npx playwright screenshot --browser chromium --wait-for-timeout 4000 <url> <png>` for quick checks, or
  write a script using `@playwright/test`. Use it to verify UI changes: select the monster, set inputs, read the DPS
  numbers on screen, and save a screenshot under `docs/screenshots/`.
- Monster data refresh: `cd scripts; uv run generateMonsters.py` (writes `cdn/json/monsters.json`, downloads images to `cdn/monsters/`).
- Wiki Bucket API (what the generator uses), one monster per query:
  `https://oldschool.runescape.wiki/api.php?action=bucket&format=json&query=bucket('infobox_monster').select('page_name_sub','hitpoints',...).where('page_name','Xarth').run()`
  Send a generic `User-Agent` header such as `mxeaez-dps (private fork of osrs-dps-calc)` — no personal info (no
  email or names). `where(...,'in',{...})` is not supported.

## Where things live

- `src/lib/PlayerVsNPCCalc.ts` — core DPS maths. `src/lib/scaling/*` — per-raid monster transforms applied in
  `src/lib/MonsterScaling.ts` (CoX, ToB, ToA, phases, defence reductions). `src/lib/constants.ts` — monster ID lists.
- `cdn/json/monsters.json` — generated from the wiki; `scripts/manual_monster.json` — hand-added monsters appended by the generator.
- `src/tests/` — Jest tests; copy the existing style (`getTestMonster`, `calculate`, etc.).
- Raid 4 code goes in new files where possible: `src/lib/scaling/FracturedArchive.ts`, `src/lib/fracturedArchive/*`, `docs/`.

## Rules

- Source of truth order: OSRS Wiki page → wiki Bucket data → Gearscape (https://gearscape.net/calculators/dps) → community. Where the wiki is
  missing or contradictory, use the best source, record it in `docs/DATA_SOURCES.md` with the URL/date and mark
  the field **unverified**. Do not stop the run for data gaps.
- Match upstream code style (Airbnb ESLint config, 2-space, single quotes). Minimal edits to upstream files so
  `git merge upstream/main` stays easy. Don't reformat unrelated code.
- Every behavioural change gets a Jest test. Phase-specific rules (weakness, floors, scaling) get a test per boss.
- Commit at the end of each phase with a message `phase N: <summary>`; append an entry to `PROGRESS.md` in the same commit.
- Stop and ask the user only for: Cloudflare login/deploy credentials, or a decision that changes product scope.
