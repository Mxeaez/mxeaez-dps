# Builder / reviewer orientation (phase 37b)

Read this first, then `CLAUDE.md` (commands, rules), `ROADMAP.md` (the phase you are on, decisions) and the top entries
of `PROGRESS.md`. `docs/BEST_SETUP.md` is the long reference (one section per phase); this page is the map.

## Module map

**Calculator (upstream, edit minimally):** `src/lib/PlayerVsNPCCalc.ts` (DPS maths), `src/lib/MonsterScaling.ts` +
`src/lib/scaling/*` (raid scaling; ours: `FracturedArchive.ts`), `cdn/json/*.json` (generated data).

**Raids** (`src/lib/raids/`): `base.ts` (`RaidBase`: targets, party range, scaling inputs, defaults, presets, pool),
`index.ts` (`RaidConfig` = base + time model + UI bits; `RAIDS`, `raidConfig`), `planDefaults.ts` (Plan-tab defaults),
`settings.ts` (phase 37b: the saved inputs), `toa/ cox/ tob/` (targets, presets, pools, time models).

**Best-setup engine** (`src/lib/fracturedArchive/`, pure, no React):

| Stage | Where |
|---|---|
| Targets, drain states, one loadout's DPS | `bestSetup.ts` (`buildTargetMonster`, `evaluateLoadout`), `loadout.ts`, `targets.ts` |
| Search (Search / Summary tabs, planner step 1) | `search.ts`, pool `searchCandidates.ts` (+ `poolAudit.ts`) |
| Drain specs (hit chances, floors, Solo / Team plans) | `specs.ts`, `teamSpecs.ts`, `drains.ts`, `drainLine.ts` |
| Time model: routes, encounters, phases, kit evaluator | `raidTime.ts` (`compareRoutes`, `encounterTime`, `createKitEvaluator`, `specBudgetFrom`) |
| One spec budget per encounter (drain events, DP, regen, surge) | `encounterBudget.ts` (glue: events, `budgetedEncounter`, `MAX_EVENT_OPTIONS`) + `specBudget.ts` (pure DP, `placeDoses`) |
| Damage specs (Voidwaker, claws, ZCB, kisten) | `damageSpecs.ts` (E[spec], net, `damageSpecRanking` for the Specs box) |
| Spec weapons: Solo subset search, team carriers, your share | `specChoice.ts` (`greedyCarriers`, `assignMe`, `teamRoles`) |
| Planner | `planner.ts` `plan()`: 1. phase targets + searches → 2. full candidates (presets + search rows) → 3. DPS matrix → 4. partial switches → 5. optimise (`optimiseKit`; carrier greedy, item greedy for damage specs / surge, `fitBars`) → 6. exact re-times of the best `RETIME_TOP` kits (`createKitEvaluator`) → 7. "why" (rejected / alternatives). Around it: the ring policy (camp one ring: every ring screened, guarded full runs, `guardedFullRuns`) |
| Speed (exact memos) | `kitMemo.ts` + `traceMemo.ts` (encounter / pass memos), `parallelRings.ts` (ring runs in helper workers, `planRingRun`) |
| Briefing / display strings | `briefing.ts` (`briefingRows`, drain summaries), `potionChoices.ts`, `loadoutIcons.ts` |
| Items I don't own | `ownership.ts` |

**UI** (`src/app/components/bestSetup/`): `BestSetup.tsx` (raid tabs, Assumptions box, saved settings), `SearchView`,
`SpecPlanPanel`, `SpecDamageBox`, `SummaryView`, `PlanView` (Plan tab; runs `startRaidPlan` in
`src/worker/searchWorkerClient.ts`), `PlanBriefing`, `NotOwnedBox`, `TimeSettingsBox`.

## Where the pins live

| Pin | File | Re-pin |
|---|---|---|
| Headline plans, human-readable (total, kit, ring, carriers, items, your share, encounters) | `src/tests/fixtures/headlines.json` | `node scripts/pinHeadlines.mjs` (all six plans in Node, ~2 min with `--jobs 6`) |
| Headline plans, bit-identical (every field but run stats) | `src/tests/lib/raids/phase37/{fa,toa,cox,tob,faSolo,faNotOwned}.json` | `node scripts/pinHeadlines.mjs --full` |
| Reduced plans (bit-identical) | `phase37/r27*.json` | by hand (Phase37.test.ts `reducedCase`) |
| Memo counters | `src/tests/utils/phase37.ts` `PHASE37_MEMO` (±20%, runs bounded per kind) | from `stats.memo` of the plan |
| Slow headline tests | `CrossRaidHeadlines*.test.ts`, Phase31 (Solo), Phase34 / 35 / 35b — read the fixture | automatic |
| Verify scripts' headline totals | `scripts/headlines.mjs` (reads the fixture) | automatic |
| README headline table | between `headlines:start` / `headlines:end` in `README.md` | written by pinHeadlines.mjs; `Phase37b.test.ts` checks it |
| Per-phase strings (briefing lines, drain lines, Specs box numbers) | the phase's own test / verify script | by hand, explained in PROGRESS |

A numbers phase: change the code → `node scripts/pinHeadlines.mjs --full` → review
`git diff src/tests/fixtures/headlines.json README.md` (every moved total explained in PROGRESS) → slow suites → the
per-phase strings that moved.

## Running things

- Fast suite: `node .yarn/releases/yarn-4.9.2.cjs test` (~1600 tests, slow ones skipped). One file: `... test Phase37b`.
- Slow suites (PowerShell): `$env:RUN_SLOW_TESTS=1; node .yarn/releases/yarn-4.9.2.cjs test CrossRaidHeadlines Phase27 Phase37 --coverage=false`
  (all slow: `CrossRaid Phase2 Phase3`, ~12 min; the long pole is CoX).
- Types: `npx tsc --noEmit`. Lint: `node .yarn/releases/yarn-4.9.2.cjs lint` (also lints `src/tests`; `next build` fails on it).
- Verify scripts (dev server on :3001): `node scripts/verifyAll.mjs 37b 21` (the scripts a phase touched; numbers or
  names), `node scripts/verifyAll.mjs` (every `verifyPhase*.mjs`, final reviews), `--jobs N` (default 3), `--keep-screenshots`.
  One line per script, logs in a temp folder, tracked screenshots restored. Scripts with time limits (21, 27, 37) are
  tighter in parallel; re-run a timing failure alone before believing it.

- CI: `.github/workflows/ci.yml` runs the fast suite + lint + tsc on every push / PR to `main-mxeaez` (no slow suites,
  no Playwright); the deploy is still Cloudflare's build on push (docs/DEPLOY.md).
- Known stale verify scripts (fail at HEAD 37 too, checks written for older defaults): verifyPhase13, 14, 16, 17, 18,
  19, 20, 24, 25. `node scripts/verifyAll.mjs` runs them anyway; judge a phase by the scripts it touched and 21-37b.

## Rules (the ones that bite)

- **Lint last**, right before the commit (a late test edit has broken the build before).
- **Never `yarn build` while `yarn dev` runs** (corrupts `.next`); delete `.next` before and after a build.
- **Restore tracked screenshots** the verify scripts overwrite (verifyAll does; by hand: `git checkout -- docs/screenshots/<names>`);
  commit only the screenshots the phase means to change. Leave the user's untracked review screenshots alone.
- **Don't commit probes** (scratch tests, logs, temp scripts); keep them in the scratchpad.
- **Generic User-Agent** for the wiki (`mxeaez-dps (private fork of osrs-dps-calc)`), never personal info.
- Minimal upstream edits (`docs/UPSTREAM_MERGE.md` lists them); new code in fork files.
- Small phases (UI / tooling) write a PROGRESS line and the docs they touch; the full docs sweep is the final review's
  job (ROADMAP decision, round 6). Numbers phases get the full independent review.
- Settings persistence: the page restores saved inputs (`mxeaez-dps:settings:v1`); verify scripts start from a fresh
  browser (empty storage) so they see defaults — a script that reloads mid-way keeps what it changed.

## Review protocol (numbers phases)

1. Recompute by hand: pick an encounter of a headline plan and redo DPS → seconds, the drain (spec counts, hit chances,
   floor), the budget (energy, regen ticks, which specs fit) from the formulas in BEST_SETUP, not from the code.
2. Brute force on reduced pools: a few candidates / loadouts, every kit (and every allocation) timed exactly — the
   planner's kit must be the best (Phase36's kit brute force, `PlanHooks.onKitSpace`, is the pattern).
3. Re-time independently: rebuild the kit's loadouts and run `compareRoutes` outside the planner
   (`recomputed` in `src/tests/utils/crossRaidHeadlines.ts`); it must equal the plan's total.
4. Bit-identity: a phase that claims "no result changed" must leave `phase37/*.json` and `headlines.json` untouched.
5. UI: the verify scripts the phase touched (verifyAll), screenshots looked at, not just "OK" lines.
