# Progress log

Newest entry first. One entry per phase (or per notable fix). Keep entries short: what was done, how it was
verified, what's unverified / left for later.

## Phase 1 — Data refresh (2026-10-22)

- Re-ran `scripts/generateMonsters.py` (minimal Windows fix: open JSON files as UTF-8). monsters.json 2860 → 2918
  entries: 65 added (all Fractured Archive monsters + unrelated wiki additions), 8 removed (renames, e.g. ToB
  "Entry mode" → "Entry Mode", no code references them), 16 unrelated entries changed. 45 new images, 2 obsolete removed;
  `Void Siphon.png` / `Void Vine.png` failed to download from the wiki.
- Verified every in-scope monster/version against the wiki infobox wikitext: all match except **Bork flat armour**
  (wiki text "8-14 (Base), 0 (Stunned)…" → generated 0; left for phase 4).
- Ocellus Phase 2 is attackable (Strategies: damage on the Blade transfers 50% to the P3 HP bar) → manual entry in
  `scripts/manual_monster.json`, id 100090, hp 5250 (= P3 pool, **unverified**), attributes none (**unverified**).
- Ocellus P1 has ids 16673/16674; generator keeps 16673. Phase 6 constants must list both (upstream `*_IDS` pattern).
- UI check: `node scripts/verifyFracturedArchiveMonsters.mjs` selects all 10 monster/versions and compares the stat
  panel with wiki values — all OK; screenshots `docs/screenshots/phase1-*.png`. Raid images appear broken in the app
  because images load from the upstream CDN (deploy concern, phase 10).
- Wrote `docs/DATA_SOURCES.md` (sources, ids, unverified fields, per-boss mechanics for phases 2–6).
- `yarn test` 333 pass / 4 skipped; `yarn lint` clean.

Unverified / open: party HP scaling formula; which party size infobox HP represents; Ocellus P2 hp/attributes;
drain caps for Smorks/Dreadnoth; Dreadnoth demonbane %; AG shield HP.

## Phase 0 — Setup (2026-10-22)

- Cloned `weirdgloop/osrs-dps-calc` at `89c3e25` as a blobless clone (`--filter=blob:none`); remote renamed to `upstream`.
- `yarn install` (vendored Yarn 4.9.2, run as `node .yarn/releases/yarn-4.9.2.cjs`) OK on Node 24.19 (repo's `.nvmrc` says 18; no issues seen).
- Baseline `yarn test`: 27 suites / 333 tests pass, 4 skipped.
- `yarn dev` serves `http://localhost:3001/osrs-dps` (port 3000 is taken by something else on this machine).
- Added `@playwright/test` (1.64.1) + Chromium; smoke screenshot of the running app OK.
- Confirmed via the wiki Bucket API that all in-scope bosses have `infobox_monster` rows (see ROADMAP.md table), except Ocellus Phase 2 which lacks hp/id.
- Wrote ROADMAP.md, PROGRESS.md, CLAUDE.md.

Unverified / open: party-size HP formula; Ocellus P2 data; drain caps on Smorks/Bork/Dreadnoth.
