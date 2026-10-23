# Progress log

Newest entry first. One entry per phase (or per notable fix). Keep entries short: what was done, how it was
verified, what's unverified / left for later.

## Phase 5 — Dreadnoth the Jellied, Jelly, Xarth (2026-10-22)

- Re-read the three pages, Corpse (Xarth), the Strategies sections, the demonbane item pages and `Demon (attribute)`;
  mechanic → model table in `docs/DATA_SOURCES.md` (*Phase 5*).
- Demonbane effectiveness from https://oldschool.runescape.wiki/w/Demon_(attribute): **Dreadnoth 25%, Xarth 80%**
  (Jelly 100%). New `src/lib/fracturedArchive/demonbane.ts` (table), read by upstream's
  `BaseCalc.demonbaneVulnerability()` (+2/−1), so every upstream demonbane effect scales (Arclight/Emberlight +17% /
  +56%, scorching bow +7% / +24%, purging staff + Mark of Darkness, claws, holy water). Xarth is *not* full-factor
  (the brief assumed it was; the wiki wins). Phase 2's Xarth test now compares against a custom demon at 80%.
- Xarth: no TD shield logic (regression tests); no P2 option — the wiki shows no stat change (**unverified**). Jelly:
  selectable, no special code. No immunities or caps that affect the calc.
- Tests: `src/tests/lib/fracturedArchive/DreadnothAndXarth.test.ts` (22): hand-derived max hit / attack roll / DPS for
  Arclight, Emberlight, scorching bow, purging staff + Dark Demonbane + MoD on both bosses, Jelly full factor, fire 85% /
  water 85% / Jelly fire 60%, Xarth whip without TD reduction, floors 0 / 102 via DWH/BGS with DPS, Max Melee +
  Emberlight + Piety + super combat sanity/UI parity (Dreadnoth 44 / 7.785, Xarth 59 / 8.541, Jelly 64 / 12.410).
  With the module disabled 12 of them fail.
- Phase 4 leftovers: the Bork scythe and ranged-armour tests now assert hand-derived values (they fail if
  `applyBorkFlatArmour` is a no-op); `scripts/verifySmorksAndBork.mjs` uses Piety + super combat + Chop (aggressive):
  Bork 2.460 / 2.119 / 1.832 / 1.590 / 14.712, Smorks 4.254 (= Jest); `phase4-bork-*.png`, `phase4-smorks.png` re-shot.
- UI: `node scripts/verifyDreadnothAndXarth.mjs` — on-screen max hit, DPS and "Demonbane factor" (70 × 25/100 = 17,
  × 80/100 = 56, × 100/100 = 70) equal Jest; `docs/screenshots/phase5-dreadnoth.png`, `-xarth.png`, `-jelly.png`.
- `yarn test` 439 pass / 4 skipped; `yarn lint`, `tsc --noEmit` clean.

Unverified / open: the 25% / 80% values (wiki edit "per orion", uncited); truncation of the scaled percent (17.5 → 17);
Xarth P2 stats; healing (jelly absorb, slam, corpses) not modelled. Ocellus 80% demonbane noted for phase 6.

## Phase 4 — The Smorks + Bork (2026-10-22)

- Encounter (Strategies): both attackable, separate HP; kill Bork first (recommended) → Bork's armour is usually 8;
  heavy cannonball stuns Bork "for a short time" (duration unpublished). Mechanic → model table in
  `docs/DATA_SOURCES.md` (Bork, *Phase 4*).
- Bork Phase dropdown (`BORK_FLAT_ARMOUR_BY_PHASE` in `src/lib/fracturedArchive/constants.ts`, registered in
  `MONSTER_PHASES_BY_ID`): Smorks 100-76% HP (armour 8, **default**), 75-51% (10), 50-26% (12), 25-0% (14), Stunned (0).
  New `src/lib/fracturedArchive/bork.ts`: `applyBorkFlatArmour` (chained in `applyFracturedArchiveScaling`), magic
  resistance 2 (0 when stunned) via a hook after upstream's flat armour in `PlayerVsNPCCalc.applyNpcTransforms`, and
  100% melee accuracy when stunned in `getHitChance`. Upstream edits: `PlayerVsNPCCalc.ts` +11, `constants.ts` +4/−1,
  `FracturedArchive.ts` +4/−1, `MonsterContainer.tsx` +7.
- Smorks: infobox stats suffice (flat armour 2, magic def 400, earth 85%, floor 0); nothing else on the wiki changes
  damage taken.
- Leftovers: AG UI-parity test has the 4.636 / 3.014 derivation; party size input now defaults to 2 for raid bosses.
- Tests: `src/tests/lib/fracturedArchive/SmorksAndBork.test.ts` (30): armour per option, hand-derived whip
  distribution, Scythe per-hitsplat armour, ranged full armour, magic −2 in all unstunned options, stunned melee
  100% / ranged + magic unchanged, floors 180 / 0, max-scythe sanity DPS (2.429 / 14.712), UI parity.
  `yarn test` 418 pass / 4 skipped; `yarn lint`, `tsc --noEmit` clean.
- UI: `node scripts/verifySmorksAndBork.mjs` — Max Melee preset + Scythe: Bork 0.950 / 0.774 / 0.621 / 0.493 / 10.065
  DPS for the five options, Smorks 2.010, party size 2, default phase armour 8 — all equal to Jest;
  `docs/screenshots/phase4-bork-armour8/10/12/14/stunned.png`, `phase4-smorks.png`.

Unverified / open: stun duration (no uptime-weighted option); magic resistance removed while stunned; exact 25%
thresholds; Voidwaker spec vs magic resistance.

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
Noticed: the party size input shows 1 (red) by default for AG; the calc clamps to 2 (fixed in phase 4).

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
