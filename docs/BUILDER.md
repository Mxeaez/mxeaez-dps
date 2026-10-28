# Builder / reviewer orientation (phase 37b; probes 37c)

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
| One spec budget per encounter (drain events, DP, regen, surge) | `encounterBudget.ts` (glue: events, `eventWantedCounts` = one fixed drain set per event (38g), `budgetedEncounter`) + `specBudget.ts` (pure DP, `placeDoses`) |
| Damage specs (Voidwaker, claws, ZCB, kisten) | `damageSpecs.ts` (E[spec], net, `damageSpecRanking` for the Specs box) |
| Spec weapons: Solo subset search, team carriers, your share | `specChoice.ts` (`kitCarriers` (38g: by headcount), `assignMe`, `teamRoles`) |
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

**Round 6 is FA only** (user, 2026-10-28; ROADMAP "Round 6"): explain and hand-check only the FA totals (fa, faSolo,
faNotOwned). ToA / CoX / ToB must still plan with sane gear; list their moved totals in PROGRESS without explaining
them. Reviewers recompute FA only.

## Running things

- Fast suite: `node .yarn/releases/yarn-4.9.2.cjs test` (~1600 tests, slow ones skipped). One file: `... test Phase37b`.
- Slow suites (PowerShell): `$env:RUN_SLOW_TESTS=1; node .yarn/releases/yarn-4.9.2.cjs test CrossRaidHeadlines Phase27 Phase37 --coverage=false`
  (all slow: `CrossRaid Phase2 Phase3`, ~12 min; the long pole is CoX).
- Types: `npx tsc --noEmit`. Lint: `node .yarn/releases/yarn-4.9.2.cjs lint` (also lints `src/tests`; `next build` fails on it).
- Verify scripts (dev server on :3001): `node scripts/verifyAll.mjs 37b 21` (the scripts a phase touched; numbers or
  names), `node scripts/verifyAll.mjs` (every `verifyPhase*.mjs`, final reviews), `--jobs N` (default 3), `--keep-screenshots`.
  One line per script, logs in a temp folder, tracked screenshots restored. Scripts with time limits (21, 27, 37) are
  tighter in parallel; re-run a timing failure alone before believing it.
- Review probes (`scripts/probes/`, phase 37c; logic in `src/tests/utils/probes.ts`, smoke tests in `Phase37c.test.ts`;
  each exits 1 on a failed check, 2 on bad arguments; usage in each file's header):
  - `node scripts/probes/retime.mjs [fa toa cox tob faSolo faNotOwned] [--quiet]` — each headline kit (phase37/*.json)
    re-timed with `compareRoutes` outside the planner vs headlines.json: total, gap, fastest route, per-encounter
    seconds. Fails on a gap > 0.001 s. All six in ~6 s (no planning: it reads the pins, so after a numbers phase run it
    once `pinHeadlines --full` has re-pinned; it checks the pinned kit, the slow suites check the live plan).
  - `node scripts/probes/drainOutcome.mjs <encounter> [--plan <name>]` (no args: the encounters per plan) — one encounter
    of a re-timed headline: drain events + spec counts, per phase Def / floor / magic def / hit chance / energy /
    P(floor) / E[def] / ranked def / Ayak / your damage specs, per pool start / end energy, regen ticks, spent. Fails
    when the spec plan differs from the fixture or a pool overspends. ~1 s.
  - `node scripts/probes/bruteForceKits.mjs <fa|toa|cox|tob> [--pool small|tiny] [--route <id>|list] [--max-kit N]
    [--ring camp-one|camp-lightbearer|switch] [--candidates N]` — a reduced Team plan's kit space
    (`PlanHooks.onKitSpace`), every kit timed exactly vs the planner's kit. Fails when a kit is faster by > 1e-6 s.
    FA small 90 s (336 kits), FA tiny 30 s, ToB tiny 65 s.

- CI: `.github/workflows/ci.yml` runs the fast suite + lint + tsc on every push / PR to `main-mxeaez` (no slow suites,
  no Playwright); the deploy is still Cloudflare's build on push (docs/DEPLOY.md).
- Stale verify scripts live in `scripts/stale/` (excluded from `verifyAll` unless `--all`). A verify script that fails
  at HEAD is fixed or retired in the phase that broke it, never left. Stale today: verifyPhase13, 14, 16, 17, 18,
  19, 20, 24, 25. `node scripts/verifyAll.mjs` runs them anyway; judge a phase by the scripts it touched and 21-37b.

## Rules (the ones that bite)

- **Lint last**, right before the commit (a late test edit has broken the build before).
- **Never `yarn build` while `yarn dev` runs** (corrupts `.next`); delete `.next` before and after a build.
- **Restore tracked screenshots** the verify scripts overwrite (verifyAll does; by hand: `git checkout -- docs/screenshots/<names>`);
  commit only the screenshots the phase means to change. Leave the user's untracked review screenshots alone.
- **Don't commit one-off probes** (scratch tests, logs, temp scripts); keep them in the scratchpad. The three reusable
  probes (brute-force kits, re-time vs headlines.json, drain outcome table) live in `scripts/probes/` (see *Running things*)
  and are kept working: a phase that breaks one fixes it; use them before writing a new one.
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

## Workflow rules (audit, 2026-10-25)

- **Read less.** Start here, then the ONE ROADMAP row you were given and the top 2 PROGRESS entries. Grep the long docs.
- **Briefs** are at most 15 lines: the ROADMAP row number, 3-5 sentences of scope, the files / tests to touch, what must
  NOT change (e.g. "bit-identical to phase37/*.json"), the agent to use. No rules pasted from CLAUDE.md / this page.
  Fix-round briefs are "file:line - fix" lists.
- **Phase sizing.** A ROADMAP row with more than one independent mechanism, or an expected diff over ~30 files, is split
  before building; the pin re-capture goes in the second half.
- **Slow suite** only for a phase that changes src/lib maths, pools, planner, time model or specs, only the files the
  change can reach (CrossRaidHeadlines* for kit / time changes; Phase27 / Phase37 for planner memo / ring changes), once,
  just before the commit. UI / tooling / docs phases: never. `node scripts/pinHeadlines.mjs --full --check` (~4 min) is
  the proof of a "no result changed" claim.
- **Verify scripts**: only the ones the phase touched (`node scripts/verifyAll.mjs 36 37`); the full set at final reviews.
- **Docs.** Phases that move no number write PROGRESS only. Numbers phases update BEST_SETUP (own section) and
  DATA_SOURCES / UNVERIFIED only if a source or an unverified field changed. README / ROADMAP only via pinHeadlines or at
  the final review. PROGRESS entries older than the previous round move to `docs/archive/`.
- **Fix rounds.** A builder self-check (re-run the named tests + lint, quote the diff in the report) suffices when the
  fix is wording, UI, a doc, a guard that cannot change a pinned number, or `pinHeadlines --full --check` shows no
  change. A diff-scoped re-review is required when any pinned total, spec count, hit chance or kit moved, or the fix adds
  a rule that changes a drain / budget decision.
- **Reviewers** (numbers phases only) never run the slow suite, the full fast suite, lint or verifyAll unless a number
  in their own probe disagrees with the builder's; they read `git show --stat` and the PROGRESS entry for what was run.
  A re-review reads only `git diff <reviewed-commit>..HEAD`, checks each finding is closed, re-runs only the tests of
  changed files, and re-does the numeric protocol only if the diff touches src/lib maths, pools or the time model.
  Reviews under 1200 words; re-reviews under 600.

- **Probes run against a committed tree.** While a builder has uncommitted work in the working tree, any probe or
  review must run against `git archive HEAD` (or a worktree), never the working tree; otherwise two runs of "the same
  code" disagree (2026-10-27).

### Builder checklist
1. Read this page + the one row + top 2 PROGRESS entries; nothing else long.
2. More than one mechanism or ~30+ files? Stop and propose a split.
3. Tests with hand-computed expectations first, for every behaviour change.
4. Numbers phase: change code, `pinHeadlines --full`, read the diff, explain every moved total in PROGRESS.
5. Reachable slow suite files once, then verifyAll for touched scripts, then tsc, lint last.
6. PROGRESS entry (+ BEST_SETUP section if numbers moved); no other docs.
7. Commit `phase N: ...`, never push; report commands run and results in under 600 words.

### Reviewer checklist (numbers phases)
1. Read the PROGRESS entry and `git show --stat`; do not re-run what they list as passing.
2. Run the committed probes: `node scripts/probes/retime.mjs` (all six, gap ≤ 0.001 s), `node scripts/probes/drainOutcome.mjs
   <encounter>` for the encounter you hand-check (its table is the drain / budget half of the recomputation),
   `node scripts/probes/bruteForceKits.mjs fa` (gap 0; another raid when the phase touched its kit or time model); plus
   one hand recomputation of a headline encounter. Write a new probe only for what these cannot show.
3. Check bit-identity claims with `pinHeadlines --full --check`.
4. Look at changed screenshots if UI moved; findings as severity, file:line, exact fix; under 1200 words (600 for a re-review).
