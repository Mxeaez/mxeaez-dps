# Progress log

Newest entry first. One entry per phase (or per notable fix). Keep entries short: what was done, how it was
verified, what's unverified / left for later.

## Phase 12 — Best-setup UX: Search as default + item icons (2026-10-22)

- `/best-setup` opens on **Search** (tab order Search / Per boss / Summary; last tab not remembered). The search runs
  automatically on open and on every boss / phase / drain / style / assumption change: 300 ms debounce, the running
  worker or pending start is cancelled first, progress bar + Cancel shown meanwhile; "Run again" re-runs by hand.
- Item icons: new `src/lib/fracturedArchive/loadoutIcons.ts` (pure: slot order = calculator grid, `searchRowIcons`,
  `presetIcons`, weapon lines with ammo / blowpipe dart / spell text, boss image) and
  `src/app/components/bestSetup/ItemIcons.tsx` (lazy `<img>`, alt = name, hides itself on error). Search and Per-boss
  rows show the weapon line + a row of loadout icons; the boss selector shows the monster icon. Same
  `getCdnImage('equipment/…')` as the calculator's slots → `/cdn/` in production. No spell icons (upstream hotlinks the
  wiki for those).
- In dev the raid-4 images (Obligator, Ascension crossbows/bolts, the bosses) aren't on upstream's CDN, so those icons
  are hidden there; the Playwright check confirms they return 200 from https://dps.mxeaez.com/cdn/.
- Tests: new `LoadoutIcons.test.ts` (8: slot order, URLs, weapon lines incl. blowpipe dart and Kodai spell, every preset
  resolves, bad preset → no icons, every boss/pool/preset image exists in `cdn/` without `%`). `yarn test` 940 pass /
  4 skipped; `yarn lint`, `tsc --noEmit` clean.
- Playwright: new `scripts/verifyBestSetupUx.mjs` — Search is default and auto-runs (AG Flying Team top 11.359 with no
  click), Xarth None re-run on change = 12.839, 103/119 search and 134/148 per-boss icons loaded in dev (the rest are the
  raid-4 images, hidden, 200 in production), Load into calculator matches from both tables (12.839 / 58, Jelly 14.053 /
  39). `verifyGearSearch.mjs`, `verifyRootDeploy.mjs`, `verifyBestSetup.mjs` updated for the new default tab/auto-run
  (gear search and best-setup checks pass). Screenshots `docs/screenshots/phase12-*.png`.

## Phase 11 — Final review (2026-10-22)

- Cross-cutting pass over `src/lib/fracturedArchive/*`, `src/lib/scaling/FracturedArchive.ts` and every upstream hook.
  Checked: Obligator best-of-N × stunned Bork (accuracy 1, armour 0) and × Bork armour phases; Ocellus void explosions
  × Obligator; drain plans × phase options (no phase changes Defence); AG ancient immunity × search spell list (uses
  `isImmuneToSpell`); demonbane table × TD logic (Xarth not a TD); every id list built from the `*_IDS` constants
  (P1 16673/16674, P2 100090/16675/16676, AG 16660, Dagon'hai unshielded); every hook gated by id. No code defects
  found. New `src/tests/lib/fracturedArchive/CrossCutting.test.ts` (5 tests) pins these interactions, including "no
  raid hook fires for a non-raid monster that has a raid phase string or party size".
- Stale docs fixed: DATA_SOURCES Ocellus P2 floor line (now "0, verified") and the CDN-images note (fixed in phase 10
  for production).
- New `docs/UNVERIFIED.md`: every unverified value with the assumption, where it's used, the impact if wrong and an
  in-game check, grouped (A) could change the winner / (B) numbers only / (C) TTK or cosmetic. Also covers how to
  record HP at 2–3 team sizes for `FRACTURED_ARCHIVE_HP_SCALING`, and known limitations.
- New `docs/UPSTREAM_MERGE.md`: merge steps, regenerating monsters/equipment, upstream files touched with line counts
  and conflict risk (highest: `PlayerVsNPCCalc.ts` ~9 small hunks; `Prayer.ts` Zeal = 21 if upstream adds a prayer).
  No consolidation (hooks are already minimal).
- ROADMAP: phase status column, "Known data gaps" now points to UNVERIFIED.md, "Future work" section. README,
  DATA_SOURCES and BEST_SETUP link to UNVERIFIED.md. `git grep` for personal info: none.
- `yarn test` 932 pass / 4 skipped; `yarn lint`, `tsc --noEmit` clean.

## Phase 10 fixes — review follow-ups (2026-10-22)

- DEPLOY.md: correct largest-file sizes (equipment.json 3.2 MB, monsters.json 2.5 MB, JS chunk ~2 MB); primary build
  command runs the vendored Yarn directly (corepack variant kept as alternative); step to confirm build system v3;
  links to Cloudflare's build-image and limits docs.
- Jest `src/tests/lib/DeployEnv.test.ts`: `getCdnImage` with/without `NEXT_PUBLIC_CDN_URL`, `SHORTLINKS_DISABLED`.
- `verifyRootDeploy.mjs` writes screenshots to the OS temp dir unless `--screenshots <dir>` is passed.
- `yarn test` 927 pass / 4 skipped; lint and tsc clean.

## Phase 10 — Deploy preparation for Cloudflare Pages (2026-10-22)

- `.env.production` targets https://dps.mxeaez.com at the root (empty base path), `NEXT_PUBLIC_CDN_URL=/cdn`,
  `NEXT_PUBLIC_DISABLE_SHORTLINKS=true` (new flag: the shortlink API is the wiki's; the Share modal shows a notice),
  `NEXT_PUBLIC_LOCAL_STORE_SHORTLINKS=true`. `.env.development` unchanged (dev still at localhost:3001/osrs-dps).
- `getCdnImage` reads `NEXT_PUBLIC_CDN_URL` (default: upstream bucket). `yarn build` now runs
  `next build && node scripts/copyCdn.mjs` (Yarn 4 skips post-hooks), copying `cdn/` (202 MB, 7,507 files) to
  `out/cdn/`; out/ is ~210 MB / 7,827 files, largest file < 1 MiB (Pages: 20k files, 25 MiB each).
- Empty base path fixes: canonical URL and the post-shortlink `replaceState` fall back to `''`/`/`. The
  `redirects` warning with `output: export` is pre-existing and harmless (left).
- Node pinned to 22.23.4 (`.node-version`, `.nvmrc`); `corepack enable && yarn install --immutable && yarn build`
  verified on Node 22.23.4 with no lockfile change.
- Branding: title "mxeaez DPS - …", new description; footer line "Fork of the OSRS Wiki DPS calculator · source on
  GitHub" (upstream credit kept), commit hash links to Mxeaez/mxeaez-dps. README rewritten for the fork, `NOTICE`
  added (GPL-3.0, modifications), `docs/DEPLOY.md` (Pages settings, custom domain with/without Cloudflare DNS).
- Verified with `npx wrangler pages dev out` + `node scripts/verifyRootDeploy.mjs`: Archive Guardian image from
  `/cdn` HTTP 200, equipment images 200, DPS renders (Tbow + dragon arrows 1.725), Share notice, `/best-setup` clean
  URL 200 (`/best-setup.html` 308 → `/best-setup`), Xarth search completes (top 12.839, matches phase 9), no failed
  requests. Screenshots `docs/screenshots/phase10-root-*.png`. Dev server restarted and serving.
- `yarn test` 924 pass / 4 skipped; `yarn lint` clean; `tsc --noEmit` clean.

Left for the user: create the Pages project and custom domain in the dashboard (docs/DEPLOY.md).

## Phase 9 — Full gear search (2026-10-22)

- "Search" tab on `/best-setup` (shares boss/phase/drains and assumptions with "Per boss"): style filter, Run, progress
  bar (evaluations / estimate, current weapon), Cancel, top-10 table (DPS, gain vs best preset, TTK for the winner, max
  hit, accuracy, style, full loadout, seed, Load into calculator), "Best per weapon" toggle, can't-hit weapons listed.
- Pool `src/lib/fracturedArchive/searchCandidates.ts`: melee 14 weapons / 31 slot items / 5 set seeds; ranged 9 weapons
  (12 ammo variants) / 22 + 4 atlatl-only items / 4 sets; magic 8 weapons (+ spells per boss) / 25 items / 4 sets.
  2h → no shield (from item data); ammo per weapon (checked against `ammoApplicability`); blowpipe dart in itemVars.
- Search `src/lib/fracturedArchive/search.ts` (pure): weapon × ammo × style/spell enumerated; per-slot dominance
  pruning (relevant offensive stats, `keep` for effect items); coordinate ascent from pool defaults + every preset's
  armour + every full set, max 3 passes, memoised; top-N distinct loadouts. `bestSetup.ts`: `applyLoadoutToPlayer`
  extracted from `applyPresetToPlayer`; `styleLabel` / `cantHitReason` / `NON_CANDIDATE_STANCES` exported.
- Worker: `WorkerRequestType.BEST_SETUP_SEARCH` (CalcWorkerTypes +23), own worker per run (`src/worker/searchWorker.ts`
  + `searchWorkerClient.ts`) streaming progress; cancel = terminate. Page: BestSetup.tsx (+tab, shared selectors,
  "load into calculator" moved to `loadIntoCalculator.ts`), new `SearchView.tsx`.
- Results (Solo, default phase): the search confirms the best preset everywhere except **Jelly**: Ascension crossbows +
  onyx (e) with **Elite void** 14.922 vs the Masori preset 14.053 (+6.2%). Notable: AG Flying Harmonised staff + Fire
  Surge + Tome of Fire 10.264 > Shadow 9.753. Table in docs/BEST_SETUP.md "Search results".
- Timing: ~1,200–1,330 evaluations per boss, all styles; browser 0.9–3.9 s (budget 15 s), Jest ~3–5 s.
- Tests: `src/tests/lib/fracturedArchive/Search.test.ts` (171: names/slots/ammo/2h, pruning, spells, top >= best preset
  on Xarth / AG Flying / Jelly / P2, Jelly void find, calculator parity, determinism, cancellation, toy brute force).
  `yarn test` 926 (922 pass / 4 skipped), `yarn lint`, `tsc --noEmit`, `yarn build` clean.
- UI: `node scripts/verifyGearSearch.mjs` — Xarth None top Obligator 12.839 / 58, Ocellus P2 Team 15.551 / 58 (= Jest),
  loaded into the calculator: identical; Cancel OK; wall 1.3–5.4 s. Screenshots `docs/screenshots/phase9-search-*.png`.
- CLAUDE.md: delete `.next` before `yarn build` too (a dev `.next` fails the build with PageNotFoundError /_document).

Unverified / open: results inherit the Obligator one-accuracy-roll model and ascension (e) bolt procs; coordinate ascent
only finds set effects that are seeded; only pool items are considered.

## Phase 8 fixes — review follow-ups (2026-10-22)

- Boots: every preset now uses "Avernic treads (max)" (BiS for all styles; Primordial/Pegasian/Eternal documented as
  alternatives in presets.ts). Numbers moved slightly; one winner changed: Bork (armour 8) Team is now Tumeken's shadow
  10.626 (Inquisitor's + Obligator 10.524); P3 last-quadrant Deflect Melee Solo is now Shadow 7.978. Shadow vs AG Flying
  Team: 10.595 / 70 (was 10.427 / 69). Full table: docs/BEST_SETUP.md "Results snapshot".
- docs/BEST_SETUP.md: Obligator caveat corrected (the per-roll-accuracy reading raises the Obligator rows, so the
  ranking is robust; the development-history reading is noted as unverified).
- `safeEvaluatePreset`: a preset that throws becomes a 0-DPS error row instead of failing the worker request; test.
- CLAUDE.md: stop `yarn dev` before `yarn build` (a build corrupts the dev server's `.next`), restart it after.
- `yarn test` 755 (751 pass / 4 skipped), `yarn lint`, `tsc --noEmit`, `yarn build` clean; `node scripts/verifyBestSetup.mjs`
  OK (Shadow AG Flying Team 10.595 / 70 = Jest; loaded into the calculator: Bork Team Shadow 10.626 / 68, AG Flying Solo
  Twisted bow 10.089 / 81 — identical); screenshots re-shot.

## Phase 8 — Best setup view (2026-10-22)

- New route `/best-setup` (static export → `out/best-setup.html`), "Best setup" button in the top bar (TopBar +12).
  "Per boss" table: every preset ranked by DPS with best style, expected TTK, max hit, accuracy, DPS under the other
  drain states, greyed "can't hit" rows with the reason, "Load into calculator" (adds a loadout with the boss, phase and
  drains and opens the calculator). "Summary": best preset per boss/phase (17 rows incl. Bork armour 8 + Stunned,
  P1 both options, all P3 options) × None / Solo / Team. Assumptions box: potions per style, Zeal, elemental
  fragments, party size, solo Ayak damage.
- Presets: `src/lib/fracturedArchive/presets.ts` (13: Inquisitor's mace, Inquisitor's/Torva/Torva+Oathplate Scythe,
  Inquisitor's Scythe crush, Obligator ×2, Twisted bow, Ascension crossbows diamond/onyx (e), Shadow, Zorya's tome,
  Kodai + best Surge). Computation: `src/lib/fracturedArchive/bestSetup.ts` (pure; `evaluateLoadout` = the worker's
  COMPUTE_BASIC calls), run in the calc worker via new `WorkerRequestType.BEST_SETUP` (CalcWorkerTypes +18,
  worker.ts +6). Drain states: None; Solo = Elder maul floor + Ayak 80 (capped); Team = floor + Ayak to 0.
- 7b leftovers: Maggot King "Melee Punish" no longer replaces Obligator thrust with a plain roll (best-of rolls kept,
  then ×1.5; PlayerVsNPCCalc +4/−1); alias script uses "Holy/Sanguine Scythe of Vitur".
- Tests: `src/tests/lib/fracturedArchive/Presets.test.ts` (item names/slots, valid players per style, boosts, Zeal and
  fragments, targets/phases, phase 7 spec counts per boss, Shadow vs AG Flying Team == direct PlayerVsNPCCalc (69 /
  10.427), computeBestSetup == evaluateLoadout, sorted ranking, can't-hit reasons, P2 TTK n/a, Maggot King punish).
  `yarn test` 754 (750 pass / 4 skipped), `yarn lint`, `tsc --noEmit`, `yarn build` clean.
- UI: `node scripts/verifyBestSetup.mjs` — Shadow AG Flying Team 10.427 / 69 (= Jest), 7 melee rows greyed, Bork Team
  drains "2× Elder maul, 8× Ayak (300 dmg)", P2 TTK n/a, Summary 17 rows; "Load into calculator" for Bork Team
  (Inquisitor's + Obligator 10.496 / 50) and AG Flying Solo (Twisted bow 10.055 / 81) shows the same numbers in the main
  calculator. Screenshots `docs/screenshots/phase8-bork.png`, `-ocellus-p2.png`, `-summary.png`, `-loaded-*.png`.
- Docs: `docs/BEST_SETUP.md` (editing presets, assumptions, drain states, caveats).

Unverified / open: TTK uses unscaled HP (relative only); last-quadrant rankings low-confidence; Obligator "one accuracy
roll" reading drives most melee wins; Zorya's tome spec/follow-ups not modelled (undervalued).

## Phase 7b — Equipment refresh: Fractured Archive rewards (2026-10-22)

- Re-ran `scripts/generateEquipment.py` (minimal Windows UTF-8 fix). equipment.json 5436 → 5463: 27 new entries
  (Obligator ×2, Zorya's tome ×2, Ascension crossbows, Ascension/Diamond/Onyx ascension bolts (+ (e)), Rondache,
  Living record tiers 1–5, Imbued ancient cape/max cape/hood variants, Corrupted Scythe of Vitur ×2, Dizana's quiver
  locked ×2); 44 entries renamed by the wiki (capitalisation, e.g. "Blood Moon helm", "Toxic Staff of the Dead") →
  name checks in `BaseCalc.ts` / `PlayerVsNPCCalc.ts` updated (Blood/Blue/Eclipse Moon sets were silently broken);
  image renames fixed in the git index (Windows is case-insensitive). 26 new images.
- Stats of every raid item checked against the wiki infoboxes: all match. No manual entries needed.
- Effects (`src/lib/fracturedArchive/equipment.ts`, small hooks upstream): Obligator new "Extending Chain Mace"
  category (Thrust ×2 / Smash), thrust = best of 2–4 damage rolls + 20/40% vs 2x2/3x3, smash 3 ticks; Zorya's tome
  base max hit 18, spec ×2.5 accuracy ×1.6 damage (partially implemented: empowered follow-ups not modelled);
  Ascension crossbows ammo list + diamond/onyx ascension bolt (e) effects; elemental fragments as a per-element player
  toggle (+2 base max hit, before magic damage/weakness); Zeal prayer (25/28/25%). Rondache stats only.
- Tests: `src/tests/lib/fracturedArchive/Equipment.test.ts` (29: stats vs wiki, rename regression, each effect with
  hand-derived rolls, DPS vs Xarth / Dreadnoth / Archive Guardian). `yarn test` 585 (581 pass / 4 skipped),
  `yarn lint` clean, `tsc --noEmit` clean.
- UI: `node scripts/verifyFracturedArchiveEquipment.mjs` — on-screen max hit / DPS equal Jest for Obligator (thrust,
  Xarth 25 / 4.153), Zorya's tome (Dreadnoth 20 / 1.740), Ascension crossbows (AG flying 20 / 1.431), diamond/onyx
  (e) max hits 23 / 24; Zeal button present. Screenshots `docs/screenshots/phase7b-*.png`.

Unverified / open: Obligator "damage rolls" = one accuracy roll, size bonus per hit and thrust-only; Zorya's tome flat
18 (no formula on the wiki), spec factor ordering, follow-up attacks not modelled; ascension (e) bolts assumed to use
the normal proc numbers. Details: docs/DATA_SOURCES.md "Equipment".

## Phase 7 fixes — review follow-ups (2026-10-22)

- `drains.ts`: Tonalztics energy now counted in whole charged specs (ceil(hits / 2) × 50%), tie-break fewest hammer
  specs, then fewest actions. Changed plans: Smorks 1 maul + 7 Tonalztics hits (was 3 + 3; 1+7 / 2+5 / 3+3 / 4+2 all
  cost 250%), DWH 1 + 7; Dreadnoth 1 + 4 (both weapons); Jelly 1 + 6; Blade DWH 1 + 7 (Elder maul still 2 + 4 = wiki).
- Documented (drains.ts + DATA_SOURCES.md): presets always use ≥1 hammer spec (no all-Tonalztics plans such as AG's
  "4 Tonalztics"); the wiki table's Tonalztics counts are hits; Smorks/Dreadnoth wiki sequences reach 0 only if the
  Tonalztics drain rounds up (unverified, 1 Defence).
- Tests updated + energy/tie-break test; Playwright `verifyDrainPresets.mjs` re-run (Blade / AG unchanged).

## Phase 7 — Debuff toggles / max drain (2026-10-22)

- New `src/lib/fracturedArchive/drains.ts` (pure, no React, for the phase 8/9 gear finder): `maxDrainReductions(m,
  { weapon: 'elderMaul' | 'dwh' | 'bgs', ayak })` returns complete `defenceReductions` inputs + before/after def and
  magic def; `DRAIN_PRESETS` (`none`, `floor-elderMaul|dwh|bgs`, each `+ayak`), `drainPresetReductions`,
  `ayakDamageToZero`, `ayakSpecsToZero`. Starts from the undrained monster (`scaleMonster` with no reductions, so
  phases/raid scaling count) and checks candidates with upstream's `applyDefenceReductions`. Hammer presets use the
  fewest specs of that weapon; uncapped bosses get a Tonalztics finisher (wiki Strategies drain table pattern). Ayak
  input = damage = magic defence bonus. Per-boss counts and rules: `docs/DATA_SOURCES.md` (*Drain presets*).
- UI: new `FracturedArchiveDrainPresets.tsx` — "Max drain" buttons (Floor: Elder maul / DWH / BGS, + Ayak: same, Reset)
  at the top of the Defensive Reductions panel for Fractured Archive monsters; writes counts into the normal inputs.
  Upstream edit: `DefensiveReductions.tsx` +2.
- Tests: `src/tests/lib/fracturedArchive/Drains.test.ts` (81): every boss/version × weapon lands exactly on the floor
  with magic def 0, one fewer spec / 1 less damage does not; wiki sequences (Blade 2 maul + 4 Tonalztic); Ayak never
  below 0; purity/determinism; presets reset other reductions; phase inputs; caps; UI parity.
  `yarn test` 551 pass / 4 skipped; `yarn lint`, `tsc --noEmit` clean.
- UI: `node scripts/verifyDrainPresets.mjs` — Max Mage + Kodai + Fire Surge, "Floor (Elder maul) + Ayak": The Blade
  def 0 / magic def 0, inputs 2 maul + 4 Tonalztic + 100 Ayak, DPS 2.290 → 4.279; AG def 156 / magic def 0, DPS
  4.636 → 7.424 (= Jest); Reset restores both. `docs/screenshots/phase7-blade-maxdrain.png`, `phase7-ag-maxdrain.png`.

Unverified / open: wiki table's Smorks (2 maul + 4 Tonalztic) and Dreadnoth (1 + 3) leave 1 def with upstream
rounding (presets use 3 + 3 / 2 + 2); Ayak spec counts depend on spec damage (only damage is modelled); misses not modelled.

## Phase 6 fixes — review follow-ups (2026-10-22)

- P2 (The Blade) floor 0 now **verified** by the news post's hotfix list ("no cap on their Defence Reduction ...
  The Blade (Ocellus P2)"); the Ocellus page's 150 is wrong for P2. Docs, code comment and test title updated.
- P3 "Protect from Melee" hotfix = a P1 → P3 carry-over bug per the same post; correctly unmodelled.
- DATA_SOURCES: tick-perfect dodge speed-up ("unconfirmed amount") makes last-quadrant rankings low-confidence;
  magic-deflect resolution (Strategies over page body, still unverified).
- On-screen warning "Ocellus is praying against this combat style." for a blocked style (BaseCalc, +4 lines; test).
- `yarn test` 470 pass / 4 skipped; `yarn lint`, `tsc --noEmit` clean.

## Phase 6 — Ocellus P1/P2/P3 (2026-10-22)

- Wiki re-read (Ocellus page, Strategies *Ocellus* incl. "Phase 4", The Blade, Demon (attribute), Dampen Melee,
  Soul Split, censers); mechanic → model table per phase in `docs/DATA_SOURCES.md`.
- Demonbane 80% for P1 (16673, 16674) and P3 (16677) in `src/lib/fracturedArchive/demonbane.ts`; P2 (The Blade) has
  no demon attribute → no bonus.
- New `src/lib/fracturedArchive/ocellus.ts` + Phase dropdowns (`OCELLUS_P1_PHASES`, `OCELLUS_P3_PHASES`):
  P1 *At a corner* (default) / *Walking to a corner (Protect from Melee)* → melee 0; P3 *Quadrants 1-3* (default),
  *Last quadrant: Deflect Melee*, *… + void explosions*, *Soul Split*, *Deflect Ranged*, *… + void explosions*.
  Deflect = that style deals 0 (**unverified** strength), void explosions = each hit halved (rounded down).
  Hooks: one line each in `PlayerVsNPCCalc` `isImmune` and the NPC damage transformer.
- P2 HP decision: hp stays 5250; DPS = damage dealt to the Blade (ranks gear correctly), effective P3 damage = DPS / 2.
  "TTK n/a" tooltip next to Party size on P2 (in `FracturedArchiveScalingHint.tsx`).
- Not modelled (documented): P3 Protect from Melee hotfix (when unclear), Untether, censer max hits, faster attacks
  after tick-perfect dodges, Soul Split healing.
- Tests `src/tests/lib/fracturedArchive/Ocellus.test.ts` (31): ids/phase lists, Arclight/Emberlight 80% on P1/P3 and
  none on P2 (hand-derived), floors 129 / 0 / 150 through DWH/BGS, every phase option, Max Melee + Emberlight and
  Max Mage + Tumeken's shadow per phase.
- UI: `node scripts/verifyOcellus.mjs` — two loadouts (Emberlight + Super combat + Piety; shadow + Saturated heart +
  Augury), all three phases and four phase options match Jest; demonbane factor and P2 hint checked.
  Screenshots `docs/screenshots/phase6-ocellus-p1.png`, `-p2.png`, `-p3.png`, `-p3-void.png`.
- Phase 5 nit: shortened the long header comment line in `scripts/verifySmorksAndBork.mjs`.
- `yarn test` 470 pass / 4 skipped; `yarn lint`, `tsc --noEmit` clean.

Unverified / open: Deflect block strength (full block assumed) and whether magic is also deflected (page body vs
Strategies); void explosion rounding; P2 hp and attributes; tick-perfect dodge attack speed (last quadrant).

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
