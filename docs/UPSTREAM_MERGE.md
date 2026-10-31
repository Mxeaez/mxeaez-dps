# Merging upstream (weirdgloop/osrs-dps-calc)

This fork branched from upstream `89c3e25`. Most raid code is in new files (`src/lib/fracturedArchive/*`,
`src/lib/raids/**` (round 2: ToA, CoX, ToB), `src/lib/scaling/FracturedArchive.ts`, `src/app/components/bestSetup/*`,
`src/app/best-setup/*`, `src/app/components/monster/FracturedArchive*`, `src/worker/searchWorker*.ts`, `docs/`,
`scripts/verify*.mjs`, `scripts/copyCdn.mjs`), which never conflict. Upstream files only get small hooks that call into
those modules.

**Totals (phase 22, `git diff --diff-filter=M 89c3e25 HEAD -- src`)**: 20 upstream source files modified, **+320 / −26**
lines (end of round 1: 21 files, +260 / −26). Round 2 (phases 13-21) added +60 net lines to upstream files:
`PlayerVsNPCCalc.ts` +18 (ToA prayer, CoX Olm, ToB nylocas / Dawnbringer, Moia hooks), `BaseCalc.ts` +11 (three
calculator warnings), `constants.ts` +14 (4 ToB ids, phase registrations), `CalcWorkerTypes.ts` +23 net (`RAID_ROUTES`,
`RAID_PLAN`; `BEST_SETUP` removed), and `worker.ts` is back to upstream's version (phase 13 removed the `BEST_SETUP`
handler). `git diff --stat 89c3e25 HEAD -- src/lib/PlayerVsNPCCalc.ts src/lib/BaseCalc.ts src/lib/Equipment.ts
src/lib/constants.ts src/enums/Prayer.ts src/lib/scaling src/worker src/app` (new files included): 31 files, +2990 / −24.

**Round 3 (phases 23-27, reviewed in phase 28)**: `git diff --diff-filter=M 89c3e25 HEAD -- src` = 20 upstream files,
**+334 / −29** (+11 net in round 3 (+15 / −4), 3 upstream files): `Equipment.ts` +10 / −3 (the `getCanonicalItemId` reverse map,
phase 27 review; listed under *Fixes worth sending upstream*), `utils.ts` +3 / −1 (`getCdnImage` keeps `'` literal,
phase 25), `CalcWorkerTypes.ts` +2 (`notOwned` on the search request, phase 26). Everything else in round 3 is in our
own files (`bestSetup/*`, `fracturedArchive/*`, `raids/*`, `searchWorker.ts`). `git diff --stat 89c3e25 HEAD --
src/lib/PlayerVsNPCCalc.ts src/lib/BaseCalc.ts src/lib/Equipment.ts src/lib/constants.ts src/lib/Prayer.ts
src/lib/EquipmentAliases.ts src/lib/scaling src/worker src/app` (new files included): 32 files, +3332 / −26.

**Round 4 (phases 29-32, reviewed in phase 32)**: no upstream file changed — `git diff --diff-filter=M 89c3e25 -- src`
outside our own folders is still 20 files, **+334 / −29**. Everything is in `fracturedArchive/*` (planner, spec
choice, team specs, drain line), `bestSetup/*` and `raids/*`. Nothing new to send upstream: the ring guard, the spec
subset search, the quiver / kept-ammo slot rules and the drain-line wording are fork-only planner code (upstream has no
planner); the `getCanonicalItemId` reverse map below was round 3. The planner calls upstream's `ammoApplicability`
and `getCanonicalItemId` (phase 32) as they are.

**Round 5 (phases 33-37, reviewed in phase 37)**: phases 33-36 changed no upstream file (still 20 files, +334 / −29 at
7864dacc); phase 37 adds 7 lines to `src/worker/CalcWorkerTypes.ts` (optional `ringRuns` / `ring` on the RAID_PLAN
request and `ringRun` on its response: the parallel ring runs), so **+341 / −29**. Everything else is in our own files
(`fracturedArchive/*` — the new `traceMemo.ts`, `kitMemo.ts`, `parallelRings.ts` —, `bestSetup/*`, `raids/*`,
`searchWorker.ts`, `searchWorkerClient.ts`). Nothing new to send upstream: `formatDuration`'s rounding fix (phase 36,
"24:60.0") is in our raidTime.ts, the spec budget, damage specs, surge potion and the planner's memos / parallel ring
runs are fork-only planner code (upstream has no planner). The Specs box reads upstream's `getSpecCalc()` as it is.

## How to merge

```
git fetch upstream
git switch main-mxeaez
git merge upstream/main
# resolve conflicts (see below), then:
cd scripts; uv run generateMonsters.py; uv run generateEquipment.py; cd ..
node .yarn/releases/yarn-4.9.2.cjs install
node .yarn/releases/yarn-4.9.2.cjs test
node .yarn/releases/yarn-4.9.2.cjs lint
npx tsc --noEmit
```

Then, with `yarn dev` running, check the raid bosses in the UI (`node scripts/verifyFracturedArchiveMonsters.mjs`,
`verifyBestSetup.mjs`) and
compare the best-setup numbers with the snapshot in `docs/BEST_SETUP.md`. Round 2: `src/tests/lib/raids/*` pin the
ToA / CoX / ToB hp and Defence scaling (upstream's), so an upstream scaling change fails there; `CrossRaid.test.ts` pins
per-encounter times, and `$env:RUN_SLOW_TESTS=1; node .yarn/releases/yarn-4.9.2.cjs test CrossRaid` the four headline
plan totals (`scripts/verifyPhase21.mjs` checks them in the browser).

## Generated data: regenerate, don't hand-merge

`cdn/json/monsters.json` and `cdn/json/equipment.json` are generated from the wiki. On a conflict, take either side
(`git checkout --theirs cdn/json/monsters.json cdn/json/equipment.json`) and **re-run the generators** (above). Our
hand-added data lives elsewhere and survives a regeneration:

- `scripts/manual_monster.json`: Ocellus Phase 2 (The Blade), manual id 100090. If the wiki ever adds a row for
  P2 (ids 16675 / 16676), delete the manual entry so the monster doesn't appear twice. `OCELLUS_P2_IDS` already lists
  both ids.
- Image folders `cdn/monsters/`, `cdn/equipment/`: the generators download what's missing.

After regenerating, run the tests. They cover the raid mechanics and every preset / search item name. Also re-run
`node scripts/verifyFracturedArchiveMonsters.mjs` (dev server running), which compares the raid monsters' stats in the UI with the wiki
values (Bork's flat armour comes from the phase input, so the generated 0 is expected).

## Upstream files we touched (vs `89c3e25`, lines added / removed)

| File | +/− | What | Conflict risk |
|---|---|---|---|
| `src/lib/PlayerVsNPCCalc.ts` | 77 / 6 | imports; Zorya's tome accuracy, max hit and spec; fragment max-hit bonus; stunned-Bork accuracy; Obligator thrust distribution (+ Maggot King exclusion); ascension (e) bolts added to the diamond/onyx `wearing` lists; Bork magic resistance and Ocellus void-explosion transforms; Ocellus void-explosion 2-tick speed in `getExpectedAttackSpeed`, `getWeaponDelayProvider` and `getTtkDistribution` (phase 40d: +6); `isImmune` checks (incl. Moia out of melee reach, phase 15; ToA prayers, phase 18: +4); CoX Olm melee divisor (phase 19: +5); ToB nylocas style / Dawnbringer `isImmune` check (phase 20: +5); 3 capitalisation fixes in `UNIMPLEMENTED_SPECS` | **Medium–high**: about 9 separate places in upstream's busiest file. Each hunk is 2–6 lines next to an upstream anchor (Eye of Ayak spec, elemental amulet, Eclipse Moon clone, scythe dist, flat armour, `isImmune`), so conflicts are local and easy to redo by hand |
| `src/lib/BaseCalc.ts` | 28 / 7 | imports; demonbane hook (`?? 100`); spell-immunity, Ocellus-prayer, ToA-prayer (phase 18), ToB nylocas-style (phase 20) and melee-reach (Moia) issues; Blood/Blue/Eclipse Moon and Staff of the Dead name fixes | Medium: the name fixes will conflict if upstream fixes them too. Take upstream's version of those lines |
| `src/lib/constants.ts` | 27 / 0 | re-export of the raid constants; party-size list; phase dropdowns for Bork / Ocellus / Dagon'hai; Akkha and P2 Warden prayer phases (phase 18, phase names from `src/lib/raids/toa/constants.ts`, upstream's `AKKHA_IDS` / `P2_WARDEN_IDS`); phase 20: 4 missing ToB ids in `TOB_MONSTER_IDS` / `TOB_EM_MONSTER_IDS` (Vasilias 8354 / 10807 / 10786, Prinkipas 10803 — the ids monsters.json uses) and the Vasilias form / Verzik P1 phases (names from `src/lib/raids/tob/constants.ts`) | Low (additions next to the Mad Angel phases and the party-size list) |
| `src/lib/Equipment.ts` | 21 / 3 | ascension ammo; Obligator Smash speed; Zorya spec cost; `getCanonicalItemId` reverse map (phase 27 review) | Low |
| `src/lib/scaling/DefenceReduction.ts` | 9 / 1 | raid floors in `getDefenceFloor`; AG magic-level drain floor | Low–medium (the `floors` line replaces upstream's `const floor = ...` line) |
| `src/lib/MonsterScaling.ts` | 2 / 0 | `applyFracturedArchiveScaling` after ToA | Low |
| `src/lib/CalcDetails.ts` | 1 / 0 | `MAX_HIT_ELEMENTAL_FRAGMENT` | Low |
| `src/enums/Prayer.ts` | 16 / 1 | **Zeal = 21** | **High if upstream adds a prayer**: it will likely take id 21 too. Renumber Zeal to the next free id. Saved loadouts that stored 21 then need a one-time fix (only Zeal users) |
| `src/enums/EquipmentCategory.ts`, `src/utils.ts` | 1 + 20 / 1 | Extending Chain Mace category + styles; CDN URL and shortlink env flags; phase 25: `getCdnImage` turns `%27` into a literal `'` (the deployed site 307-redirects `%27`) | Medium if upstream adds the Obligator itself. Then drop ours and keep `getObligatorAttackSpeed` / thrust logic only if upstream lacks it |
| `src/types/Player.ts` | 6 / 1 | `buffs.elementalFragments` | Low |
| `src/worker/CalcWorkerTypes.ts` | 73 / 0 | `BEST_SETUP_SEARCH`, `RAID_ROUTES` (phase 16), `RAID_PLAN` (phase 17) request types (they run in our own `searchWorker.ts`); phase 26: `notOwned`; phase 37: the RAID_PLAN ring-run fields; phase 13 removed `BEST_SETUP` and its handler, so `worker.ts` is unchanged from upstream | Low–medium (enum additions at the end) |
| `src/app/components/monster/MonsterContainer.tsx` | 12 / 2 | party size 2–8 + hint for raid bosses | Low |
| `DefensiveReductions.tsx`, `player/Combat.tsx`, `TopBar.tsx` | 2, 2, 12 | drain-preset buttons, fragment toggle, "Best setup" button | Low |
| `Footer.tsx`, `ShareModal.tsx`, `InitialLoad.tsx`, `layout.tsx` | 11, 17, 1, 3 | fork branding, shortlinks off | Low–medium (branding text; keep ours) |
| `package.json`, `yarn.lock` | 4 / 2, 935 / 3 | build runs `copyCdn.mjs`; `@playwright/test`, `wrangler` (deploy) | Medium for `yarn.lock`: resolve by taking upstream's and re-running `yarn install` |
| `scripts/generate*.py` | 2 / 2 each | UTF-8 file encoding (Windows); alias names | Low |
| `README.md`, `.env.production`, `.nvmrc`, `.gitignore` | — | fork-specific | Keep ours |

No consolidation was done in phase 11. The hooks are already as small as they can be without refactoring upstream
code, and moving them would not make the merge easier.

## Fixes worth sending upstream

Bugs in upstream's own code or data handling that we fixed locally (phase 21 list, each claim re-checked in phase 22
against `89c3e25` and the current data); each is small and independent of the raid-4 work, so it could go upstream as
its own PR.

- **`getCanonicalItemId` scans every alias group per call** (`src/lib/Equipment.ts`): it runs for every item of every
  player the calculator builds; in a best-setup gear search it was 62 % of the time. A reverse map built once (same
  first-match result) made the 16 Fractured Archive plan searches 42.4 s → 11.3 s (phase 27 review). Phase 28: a test
  compares it with the linear scan for every id in `equipment.json` and every alias id (`Phase28.test.ts`, no
  mismatches); it doesn't depend on any fork code, so it applies to upstream as is.
- **`TOB_MONSTER_IDS` misses 8354 / 10807 / 10786 / 10803** (`src/lib/constants.ts`): monsters.json uses these ids for
  the Nylocas Vasilias (normal / Hard / Entry) and the melee Prinkipas, so upstream doesn't scale them: Vasilias 2500 hp
  at 4 players instead of trunc(2500 × 7/8) = 2187 (`src/tests/lib/raids/ToB.test.ts`, "id fix"; infobox "scaledhp = Yes").
- **Olm melee mitigation on the head and right claw** (`PlayerVsNPCCalc.applyNpcTransforms`, ours in
  `src/lib/raids/cox/damage.ts`): Chambers_of_Xeric/Strategies "The head has 66% damage mitigation from all non-ranged
  attacks ... The right hand ... from all non-mage attacks"; upstream divides magic / ranged but not melee
  (`src/tests/lib/raids/CoX.test.ts`, Olm melee mitigation).
- **Moon sets / Staff of the Dead renames** (`BaseCalc.ts`, `PlayerVsNPCCalc.ts`): the wiki renamed "Blood moon helm /
  chestplate / tassets" → "Blood Moon …" (Blue / Eclipse Moon and "Blue Moon spear" too) and "Staff of the dead" / "Toxic
  staff of the dead" → "Staff of the Dead" / "Toxic Staff of the Dead" (upstream's two spell checks already disagree on
  the casing). After an equipment refresh upstream's `wearing` checks silently stop matching: the Moon set effects and
  the Magic Dart staff check break (phase 7b, 44 renamed entries; `src/tests/lib/fracturedArchive/Equipment.test.ts`,
  rename regression). The Flames of Zamorak staff check never fired anyway (spell-name typo, below).
- **Generators on Windows: UTF-8** (`scripts/generateMonsters.py`, `generateEquipment.py`): `open()` without an
  encoding uses the platform's (cp1252 on Windows), so reading `manual_*.json` / writing `monsters.json` /
  `equipment.json` fails on non-ASCII text; `encoding='utf-8'` on the four `open` calls fixes it (2 lines per script;
  phase 1 / 7b re-runs on Windows).

Found in phase 22, **not fixed locally** (upstream code outside the raid work; worth reporting upstream):

- **`BaseCalc.ts` spell / staff checks**: `spellName === 'Flames of Zamarok'` (typo; the spell is "Flames of Zamorak"
  in spells.json), so casting it without a Zamorak staff is never flagged; and Claws of Guthix lists `'Staff of
  balance'`, but the item is "Staff of Balance", so Claws of Guthix with the Staff of Balance is wrongly flagged
  "needs a specific weapon" and the spell is dropped (0 DPS).

## Things upstream might add that overlap with ours

- **New items / item effects** (phase 25): after a merge or a data refresh, `PoolAudit.test.ts` fails for any item
  that beats a best-setup pool item on stats or whose name upstream starts checking in `PlayerVsNPCCalc.ts` /
  `BaseCalc.ts` / `Equipment.ts`. Add it to a pool (`searchCandidates.ts`, `src/lib/raids/*/searchPool.ts`) or to
  `POOL_EXCLUDED` (`src/lib/fracturedArchive/poolAudit.ts`) with a reason; `node scripts/auditPool.mjs` prints the list.
- **ToB** (phase 20): if upstream fixes the Vasilias / Prinkipas ids in `TOB_MONSTER_IDS` itself, drop our four
  added ids (duplicates are harmless). If upstream gates the nylocas by style or blocks the Dawnbringer off P1, drop
  `src/lib/raids/tob/damage.ts` and its two hooks and point `tob/targets.ts` / `time.ts` at upstream's phase names
  (`NYLOCAS_VASILIAS_PHASES`, `VERZIK_P1_PHASES`). If upstream changes the Verzik P1 cap model (`linearMinTransformer`),
  P1 times and the P1 Search ranking change (UNVERIFIED G1); `src/tests/lib/raids/ToB.test.ts` pins the hp at 4 / 5
  and the capped max hits.
- **CoX Olm melee mitigation** (phase 19): if upstream divides melee on the Olm head / right claw itself, drop
  `src/lib/raids/cox/damage.ts` and its hook in `PlayerVsNPCCalc.applyNpcTransforms` (+5 lines). The CoX scaling,
  immunities and Guardian / Ice demon rules are upstream's; `src/tests/lib/raids/CoX.test.ts` pins the hp / Defence at
  party 6, so an upstream scaling change shows up there.
- **Tombs of Amascut prayers** (phase 18): if upstream models Akkha's or the P2 Wardens' protection prayers, drop
  `src/lib/raids/toa/prayers.ts`, its two hooks and the phase registrations, and point `src/lib/raids/toa/targets.ts` /
  `time.ts` at upstream's phase names. The ToA hp / defence-roll scaling, floors and item effects are upstream's
  already; `src/tests/lib/raids/ToA.test.ts` pins the hp table, so an upstream scaling change shows up there.
- **Fractured Archive support upstream** (bosses, Obligator, Zorya's tome, ascension crossbows, Zeal): prefer
  upstream's version of each, then delete ours and re-run the raid tests (`src/tests/lib/fracturedArchive/*`,
  `src/tests/lib/scaling/FracturedArchive.test.ts`). Expect differences wherever `docs/UNVERIFIED.md` lists an
  assumption.
- **Defence floors**: if upstream adds raid floors to `getDefenceFloor`, keep one source (ours is
  `DEFENCE_FLOORS` in `src/lib/scaling/FracturedArchive.ts`).
- **Party size / HP scaling**: if upstream adds Fractured Archive scaling to `MonsterScaling.ts`, remove
  `applyPartySizeScaling` but keep `applyBorkFlatArmour` (or move it to `Phases.ts`).
