# Progress log

Newest entry first. One entry per phase (or per notable fix). Keep entries short: what was done, how it was
verified, what's unverified / left for later.

## Phase 3 — Archive Guardian (2026-10-22)

- Re-read the wiki page and Strategies section; mechanic → model table in `docs/DATA_SOURCES.md` (AG, *Phase 3*).
- Versions: Flying/Grounded unchanged from the wiki; confirmed upstream flying rule (only halberds/salamanders hit
  with melee) and fire weakness 80%/40% via the spell-element code. HP stays 550 in both; the flying shield
  (1490 at 6-scale, **unverified**) is not modelled. Below 30% HP → use Flying (no separate stats, **unverified**).
- Ancient Magicks immunity + magic-drain absorption: new `src/lib/fracturedArchive/immunities.ts`; hooks in
  `PlayerVsNPCCalc.isImmune` (+4 lines), `BaseCalc` spell issue (+5), `DefenceReduction` magic floor (+4/-1).
  Accursed still lowers Defence (to the 156 floor), not Magic.
- Tests: `src/tests/lib/fracturedArchive/ArchiveGuardian.test.ts` (16): fire surge 48/38 max hit, flying melee,
  ancients 0 DPS + issue, accursed/seercull/magic def roll, hand-computed Shadow and Fire Surge DPS, UI parity.
  `yarn test` 388 pass / 4 skipped; `yarn lint`, `tsc --noEmit` clean.
- UI: `node scripts/verifyArchiveGuardian.mjs` — Max Mage preset + Kodai + Fire Surge: Flying 53 / 4.636 DPS,
  Grounded 43 / 3.014 (same as the Jest parity test), Ice Barrage 0 DPS with spell warning;
  `docs/screenshots/phase3-ag-flying.png`, `-grounded.png`, `-ancients.png`.

Unverified / open: shield HP and its scaling; last-30% stats = Flying; whether every magic drain is absorbed.
Noticed: the party size input shows 1 (red) by default for AG; the calc clamps to 2 (phase 2 behaviour, left as is).

## Phase 2 fixes — review follow-ups (2026-10-22)

- NPC ids checked against RuneLite gameval `NpcID.java` (now the id reference, cited in DATA_SOURCES.md):
  `OCELLUS_P2_IDS` = 100090, 16675 (P2), 16676 (The Blade hitbox); dropped 16683 (vault-entry NPC). Added AG 16660
  (unshielded) and Dagon'hai unshielded 16644/16646/16648; commented 16673 (intro/met form) vs 16674 (P1).
  16674 = Ocellus P1 (wiki right, Gearscape wrong).
- Tests: arclight/emberlight, tonalztic and accursed (+DWH) on Archive Guardian hold the 156 floor; P2 id list.
- Party size input limited to 2–8 for Fractured Archive bosses (min/max props only).
- `yarn test` 372 pass / 4 skipped; `yarn lint`, `tsc --noEmit` clean; party-size Playwright check re-run OK.

## Phase 2 — Raid mechanics (2026-10-22)

- IDs: new `src/lib/fracturedArchive/constants.ts` (per-boss lists incl. Ocellus P1 16673/16674, P2 100090/16683,
  Ezekiel, Moia, Dagon'hai; `FRACTURED_ARCHIVE_BOSS_IDS`, `FRACTURED_ARCHIVE_MONSTER_IDS`), re-exported from
  `src/lib/constants.ts`; bosses added to `PARTY_SIZE_REQUIRED_MONSTER_IDS` so the party size input shows.
- Defence floors: data-driven table in new `src/lib/scaling/FracturedArchive.ts`, `getDefenceFloor` delegates to it
  (AG 156, Bork 180, Xarth 102, Ocellus P1 129 / P3 150, Ezekiel 78, Moia 117; Smorks, Dreadnoth, Jelly, Ocellus P2,
  Dagon'hai 0). Gearscape's `defence_floor` values match all of them (incl. P2 = 0).
- Party-size HP scaling: researched wiki pages, Gearscape (Playwright + its API/bundle) and the web — no formula or
  per-size numbers exist; Gearscape has no FA party scaling at all. `applyFracturedArchiveScaling` (registered after
  ToA in `ORDER_OF_OPERATIONS`, before phases/defence reductions) clamps party size to 2–8 and applies
  `FRACTURED_ARCHIVE_HP_SCALING`, currently 1/1 for every size (**unverified**, infobox HP everywhere). UI shows an
  "unverified" tooltip marker next to Party size (new `FracturedArchiveScalingHint.tsx`). `scaleMonsterHpOnly` unchanged
  (it handles current-HP effects only; FA scaling doesn't depend on current HP).
- Tests: `src/tests/lib/scaling/FracturedArchive.test.ts` (floors per boss via BGS/DWH/elder maul, 4 DWH on AG = 156,
  Smorks to 0, HP at sizes 1/2/5/8 for AG/Ocellus P3/Xarth, table factor applied via clamped size, Xarth not a TD:
  not in `TD_IDS`, no TD phases, arclight demonbane identical to a generic demon). `yarn test` 368 pass / 4 skipped;
  `yarn lint` clean; `tsc --noEmit` clean.
- UI: `node scripts/verifyFracturedArchivePartySize.mjs` — party size input + hint shown for AG, HP 550 at party 2
  and 8 (as implemented); `docs/screenshots/phase2-ag-party2.png`, `-party8.png`.

Unverified / open: the HP scaling curve and which size the infobox HP is; Ocellus P2 floor (0 vs 150); Jelly floor
(assumed 0).

## Phase 1 fixes — review follow-ups (2026-10-22)

- DATA_SOURCES.md: added the Strategies "Maximum defence reduction" table (Smorks 0, Dreadnoth 0, The Blade/P2 0);
  recorded the P2 floor conflict (Ocellus page 150 vs table 0) and recommend 0 for phase 2 (**unverified**).
- Ocellus P2: noted NPC The Blade (Repaired) id 16683; kept synthetic id 100090 (reason in DATA_SOURCES.md);
  P2 is time-limited so HP-dependent effects are unreliable.
- Ocellus P3: Untether (out of melee range) and the unclear "Protect from Melee overhead" hotfix documented.
- Xarth "stats unchanged in phase 2" marked as inference; flying note mentions salamanders.
- CLAUDE.md: generic User-Agent, no personal info.

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
