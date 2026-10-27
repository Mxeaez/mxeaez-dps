# Progress log

Newest entry first. One entry per phase (or per notable fix). Keep entries short: what was done, how it was
verified, what's unverified / left for later.

## Phase 38b fix — adrenaline window guard (2026-10-27)

- Review finding: a row starting inside Liquid adrenaline's window but running past it priced every damage spec at
  half. Now (specBudget.ts `damageSpecCost`, `ticksBefore`; the DP and `simulateBudget` alike) the specs the energy
  before the close pays for (after the row's drain spends + the dose + regen ticks strictly before `halfCostUntil`)
  cost half, min(n, floor(left ÷ half)) per weapon, the rest full. Drain spends keep the row's start.
- Phase38b: the forced-dose Zebak case is 3 ZCB, not 4 (100 + 4 ticks before 150 s = 140% → 3 × 37.5%; the 4th would
  cost 75%); new test of a 0-200 s row with the window to 100 s: 130% before the close → 5 half-price specs (125%), a
  6th costs 175% in all > 160% → 190 s. Phase36's brute-force simulator prices the same way.
- `pinHeadlines --full --check`: every total, kit, ring and carrier unchanged; phase37/toa.json moved only in
  side figures (the other rings' totals, e.g. Venator 873.54 → 874.02, Lightbearer / Bellator order; a maul
  carrier's "saved" 51.26 → 51.28; the Surge potion note 3.2 → 2.4 s), re-pinned. `retime`: all six gap 0. Phase38b /
  Phase36 green; tsc, lint clean.

## Phase 38b — Death Charge, Liquid adrenaline, damage specs on adds (2026-10-25)

**Numbers moved** (`node scripts/pinHeadlines.mjs --full`, 9 changes): ToA 14:38.2 → **14:30.1**, CoX 7:08.7 →
**7:06.9**; FA 21:05.3, FA Solo 21:56.2, FA without Obligator / Ascension 24:11.9, ToB 7:23.4 unchanged (their phase37
fixtures moved only in the new `deathCharge` plan field, end energies, the comparison hash and FA Solo's rejected
alternatives' deltas). Docs: BEST_SETUP *Death Charge, Liquid adrenaline, damage specs on adds (phase 38b)*,
DATA_SOURCES *Phase 38b* (wiki Death Charge, Liquid adrenaline, Helpful Spirit), UNVERIFIED D32-D34 (D26 / D28 / D31
point to them).

- **Death Charge** (specBudget.ts `deathChargeSchedule`, `BudgetRow.restore`; encounterBudget.ts `rowKills`,
  `withDeathCharge`): wiki "restore 15% ... after they dealt the killing blow to any monster within one minute after
  casting", "once every 60 seconds", upgraded "two targets per cast" (2 per cast: the user). Kills = each NPC's last row
  (Akkha's Shadows: `kills: 4`), minus the wiki exceptions (`noDeathCharge`: Glowing crystal, Olm's hands, the Wardens'
  obelisk); greedy casts, ready at each encounter's start; every bar +15% ÷ party size per covered kill at the row's
  end, after the cap. Arceuus only: new per-raid Plan input "Spellbook" (Advanced (plan), default Arceuus, saved as
  `plan.spellbook`; `RaidBase.spellbook`, `spellbookOf`, `SPELLBOOK_NOTES`: the FA Xarth / ToB Maiden freezer on
  Ancients is noted, not modelled).
- **Liquid adrenaline** (toa/supplies.ts `LIQUID_ADRENALINE_*`, `suppliesAdrenaline`; toa/time.ts
  `TOA_ADRENALINE_DOSES`, `RaidTimeModel.adrenalineDoses`; `AllocationProblem.halfCostUntil`, `costFactorAt`): wiki
  "reduce energy costs for special attacks by half for 150 seconds", no rounding; the Power bundle (implied by the
  salts) gives 2 doses per drop: Akkha 1, Ba-Ba 1, Wardens 2 (300 s), none before the supplies. Spends on rows starting
  in the window cost half (drains and damage specs, every bar); the option caps use the halved cost.
- **Damage specs on adds**: types.ts splits the rule: `noDrains` (adds: "adds: not worth a drain spec") vs the new
  `noDamageSpecs` (none set); `damageLimited` no longer excludes adds. UI: "no drains (adds)" (Plan rows, Summary).
- **Moved totals, explained:** ToA: with adrenaline the Zaryte crossbow costs 37.5%, so it replaces Voidwaker (your
  bar: Akkha 3 ZCB incl. 1 on the Shadows, Ba-Ba 3, Wardens 5; Kephri / Zebak 2 / 1 at 75%), the carriers spec more
  (Elidinis' Warden now 2 maul + 2 Tonalztics): Akkha 143.26 → 141.74, Ba-Ba 92.47 → 90.20, Wardens 344.47 → 340.10,
  Kephri 156.21 → 156.32, Zebak 141.81 → 141.74 = −8.1 s; kit, ring, carriers unchanged. CoX: damage specs on adds
  (2 Burning claws on Vasa's crystals, ZCB + claws on the Mystics, ZCB on the Shamans / small Muttadile / portal,
  claws on the Ice demon, Tekton, Olm's left claw) and Death Charge (2.5% per mid-fight kill) → Zaryte crossbow +
  Burning claws replace Dragon claws; the planner re-chose the kit (8 loadouts: Inquisitor's + Obligator, Twisted bow,
  Scorching bow ... ) and carriers (3 Elder maul + 2 Tonalztics, was + 1 BGS + 1 Tonalztics): Vespula −1.5, Mystics
  −0.9, Shamans −0.9, Muttadiles −0.5, Tekton +0.4, Olm +1.3, ... = −1.8 s. FA / ToB: their mid-fight kills (Bork
  before the Smorks) give 2.5-3.75% that buys no spec.
- Re-pinned with explanations: CrossRaid fast pin ToA Ba-Ba 103.1 → 97.3 (Wardens 349.8); Phase27 ToA switch 930.9 →
  925.0 (r27toa.json re-captured; r27fa / cox / tob changed only in the comparison hash); Phase35 (the adds string),
  Phase35b (Elidinis' Warden now specced), Phase36 (adds: damage-limited now), Phase37b (spellbook in the saved
  plan), Phase37c (retime ToA; drain outcome balances + Death Charge: Xarth 25 / 37.5 / 12.5, Solo AG 25).
- Probes: `drainOutcome` counts Death Charge (`restored`, a new column) and halves spends inside the adrenaline window
  (it reported "OVERSPENT" on ToA rooms 3-5 before); `retime`: all six gap 0.
- **Speed (a cost to flag):** the ToA / CoX headline plans take +31% / +68% CPU (slow suite 235.5 / 527.8 s; adrenaline
  doubles the spec options per ToA event, damage specs on the adds' rows, CoX's bigger kit with 2 damage spec weapons);
  `PHASE37_MEMO` toa / cox re-recorded, the catastrophe budgets raised ToA 180 → 300, CoX 315 → 650 s.
- Tests: new `Phase38b.test.ts` (8, hand-computed: the cast schedule; kills per row and the wiki exceptions; a toy
  encounter with 2 kills → 60% at row c, 2 + 1 maul specs, 80 s vs 90 s, party 2 → 45%, 90 s; Spellbook default /
  share / validation; Bork & Smorks 2 kills covered at party 1; adrenaline doses and the window; Zebak with a forced
  150 s dose: 150% buys 4 ZCB at 37.5% vs 2 at 75%, seconds = s0 × (1 − m × net ÷ damage); Burning claws ×2 on Vasa's
  crystals with their drain event empty, ×2 on the Ice demon). Fast suite: 1624 tests, the 26 failures of the first
  run were the re-pins above (each file re-run green: Phase27, 35, 35b, 36, 37, 37b, 37c, 38a, 38b, CrossRaid);
  `RUN_SLOW_TESTS=1` CrossRaidHeadlines + CrossRaidHeadlinesCox 5 / 5. Verify: `verifyAll 36 38a 35` 3 / 3 OK
  (verifyPhase35's strings updated); new `verifyPhase38b.mjs` OK (defaults, tooltips, saved across a reload;
  screenshot phase38b-spellbook.png). tsc, lint clean.

## Phase 38a — Raid wall clock + ToA supplies by room (2026-10-25)

**Numbers moved** (`node scripts/pinHeadlines.mjs --full`, 7 changes): FA 21:07.7 → **21:05.3**, FA Solo 21:59.0 →
**21:56.2**, ToA 14:07.8 → **14:38.2**; CoX 7:08.7, ToB 7:23.4, FA without Obligator / Ascension 24:11.9 unchanged.
Docs: BEST_SETUP *Raid wall clock + ToA supplies by room (phase 38a)*, DATA_SOURCES *Phase 38a*, UNVERIFIED D30 (the
clock) / D31 (ToA supplies), D29 points to D30.

- **Raid clock** (raidTime.ts `raidClock`, `surgeClockStarts`, `surgeClockSpan`): a per-raid typical raid length
  (`RaidBase.typicalRaidMinutes`: FA 25 min from the user's raid stats, ToA 30, CoX 20, ToB 20 above the wiki's speed
  tasks; `RAID_LENGTH_SOURCES`), `BestSetupAssumptions.raidMinutes` → `RaidTimeAssumptions.raidSeconds`. The non-fight
  time max(0, L − Σ fight walls) goes before each encounter in proportion to its fight time. Surge doses
  (`routeSurgeDoses`) are placed on it (ToB: fight time only, `surgePausesBetweenEncounters`); the planner tries a second
  potion when the clock allows > 4 doses; with `CARRY_SPEC_ENERGY` (off) the bars regenerate in the gaps (+10% per tick,
  cap 100%). Plan tab → Advanced (plan) → "Typical raid length (min)" (0-120, saved as `plan.raidMinutes`).
- **ToA supplies by room** (new src/lib/raids/toa/supplies.ts): Kephri and Zebak (rooms 1-2 of the fixed route) target
  `-before-supplies` copies (`beforeSupplies`, hidden from Search / Summary); `assumptionsForTarget` swaps Smelling salts
  for Super combat / Ranging potion / Saturated heart in the kit evaluator (`KitLoadout.toPlayer`'s new 3rd argument),
  the planner's DPS matrix and damage-spec values, the drain model (`buildTargetMonster`, `specCountsDrainKey`) and the
  gear search. Wiki: supplies "once after completing two paths, and once again ... before" the Wardens.
- **Moved totals, explained:** FA: the clock starts AG at ≈ 179 s, Xarth ≈ 694 s, Ocellus ≈ 1391 s, so 3 doses (AG,
  Xarth, Ocellus; was Ocellus only); with the extra energy the item greedy takes Crimson kisten (4.47 s, on AG grounded)
  instead of Burning claws (was on the Smorks): AG 175.78 → 173.49 (dose + kisten), Xarth 181.62 → 180.61 (dose; ZCB +
  kisten from 100 + 10 + 25), Bork 189.79 → 190.71 (no claws spec), Ocellus 655.17 (dose as before) = −2.38 s; kit,
  ring, route, carriers unchanged. FA Solo: a third dose on Ocellus (679.81 → 677.04). ToA: Kephri 146.63 → 156.21,
  Zebak 121.02 → 141.81 without salts (+26 → +19 / +13 levels), same six loadouts (listed in another order), no surge
  potion. Reduced plans: r27toa 881.2 → 930.9 (Phase27 pin, r27toa.json re-captured); CrossRaid fast pins ToA Kephri
  157 → 185.1, Zebak 120.8 → 137.8; Phase37c drain outcome FA Xarth: your bar 0 → 10 (dose, kisten); PHASE37_MEMO toa
  re-recorded (encounter runs +21%).
- Test re-timers pass the 3rd `toPlayer` argument (crossRaidHeadlines `recomputed`, probes.ts, Phase36's kit brute
  force): one that ignores it times ToA rooms 1-2 with the salts (the retime probe caught it: gap −30.2 s).
- Tests: new `Phase38a.test.ts` (8: defaults; the clock by hand (100/100/200 s in 1200 s → starts 200/500/1000); dose
  placement on a 25-min FA party 6 with hand gains → AG, Moia, Ocellus vs Ocellus on the fight clock / ToB pause; regen
  in the gaps with carry; the Plan input validation; ToA rooms 1-2 copies; boosts by hand +26 / +19 / +13 / +13; Zebak
  seconds = hp ÷ (normal DPS × 6)); ToA / Phase21 / Phase37b / Phase37c / CrossRaid / Phase27 expectations updated.
  `yarn test` (fast) green after the updates; `RUN_SLOW_TESTS=1` CrossRaidHeadlines + CrossRaidHeadlinesCox 5 / 5;
  `node scripts/probes/retime.mjs`: all six gap 0. Verify: new `verifyPhase38a.mjs` OK (defaults per raid, tooltip
  sources, saved across a reload, Reset; screenshot phase38a-raid-length.png); verifyPhase36 OK; verifyPhase37 fails
  only its 60 s CoX time limit (112 s alone; the machine is slow today: `pinHeadlines cox --check` 128 s here vs 129 s
  at HEAD, so not this phase). tsc, lint clean.

## Phase 37c — Reusable review probes (2026-10-25)

**No result changed** (no src/lib file touched; `node scripts/pinHeadlines.mjs --full --check` → no change, 615 s
alongside the fast suite). Docs:
BUILDER (*Running things*, the probes rule, reviewer checklist step 2).

- `scripts/probes/` (CLIs; header = usage; exit 1 on a failed check, 2 on bad arguments) over
  `src/tests/utils/probes.ts` (no Jest import), bundled with esbuild like pinHeadlines (`scripts/probes/bundle.mjs`,
  `__dirname` defined as src/tests/utils so the fixtures resolve; rebuilt each run, so it times the working tree):
  - `retime.mjs [names] [--quiet]`: each headline kit from phase37/<name>.json rebuilt as kit loadouts with the plan's
    ring, carriers / Solo subset, damage specs and surge potions (`finalAssumptions`, generalises crossRaidHeadlines'
    `recomputed` to faSolo / faNotOwned), `compareRoutes` over the raid's routes vs headlines.json. All six: gap 0.0
    (bit-equal totals), the pinned route fastest, every encounter = its 0.01 s pin; ~6 s.
  - `drainOutcome.mjs <encounter> [--plan]`: one encounter of a re-timed headline: events (spec counts), per phase
    the drain model (Def, floor, magic def, hit chance, energy) and outcome (P(floor), E[def], ranked def, Ayak), your
    damage specs, per pool start / end energy, regen ticks, spent, start + regen (+ surge) − spent. Fails if the
    re-time's spec plan differs from the fixture's or a pool overspends; ~1 s. Spot checks by hand: FA Xarth (4 maul +
    6 Tonalztics, Def 170 → 102, pools 20 / 30 / 0), FA Solo Archive Guardian (100 + 6 ticks + 25 dose − 175 = 10 = end).
  - `bruteForceKits.mjs <raid> [--pool small|tiny] [--route] [--max-kit] [--ring] [--candidates]`: a reduced Team plan
    (Phase36 tuning) with `PlanHooks.onKitSpace`, every kit (≤ max(pool size, the planner's kit size)) timed exactly vs
    the planner's. FA small: 336 kits, gap 0.000000 (= Phase36's slow test), 90 s; FA tiny 90 kits 30 s; ToB tiny gap
    0, 65 s.
- Tests: new `Phase37c.test.ts` (11, fast suite, ~45 s: retime of all six + its exit condition, both CLIs run with exit
  codes, drain outcome Xarth / Solo AG with hand-computed pools, brute force FA tiny on one ring run (camp Lightbearer,
  first 3 candidates + the planner's)). `yarn test` 1608 (1584 pass / 24 skipped; 620 s, alongside the pin check);
  tsc, lint clean. No slow suite or
  verify script (tooling only; nothing they reach changed).

## Phase 37b — Remember my settings + workflow speed-ups (2026-10-25)

**No result changed** (the phase 37 full-plan fixtures and the new headline fixture reproduce exactly:
`node scripts/pinHeadlines.mjs --full --check` → no change). Docs: BEST_SETUP *Remember my settings (phase 37b)*,
*Re-pinning the headlines (phase 37b)*, Performance (review nits); new docs/BUILDER.md (linked from CLAUDE.md);
DEPLOY (CI line); README headline table; ROADMAP 37b done.

- **Remember my settings** (`src/lib/raids/settings.ts`, BestSetup.tsx, PlanView.tsx): every best-setup input per raid
  (Assumptions + Advanced incl. raid inputs, carriers + mode, floor, players at your DPS, energy priority, time model;
  Drains; spec mode; the Plan inputs: route, supplies, rune pouch, rings, mages, Items I always bring) and the raid tab
  in localStorage `mxeaez-dps:settings:v1` = `{ version: 1, raid, raids: { <id>: { assumptions, time, drain, specMode,
  plan } } }`, only values that differ from the defaults; restored on load with per-field validation (wrong type / out
  of range → that input's default; other version / corrupt JSON → all defaults); written through on every change; plan
  results never stored. "Reset" now resets every input of the raid (Drains and Plan included) and drops its entry;
  "Reset all saved settings" in the ? help removes the key (Items I don't own kept). Side effects: the Plan inputs
  survive Search ↔ Plan, each raid keeps its Drains / spec mode / time settings across raid tabs. The verify scripts'
  clean-slate reloads also clear the new key (17 reloads in 11 scripts), so they behave as before.
- **verifyAll** (`scripts/verifyAll.mjs`): verify scripts in parallel (`--jobs`, default 3), one OK / FAIL line each,
  logs in a temp folder, tracked screenshots restored (files modified before the run put back as they were). Full set,
  3 jobs: wall 1040 s vs 2984 s summed (2.9×); 15 / 25 OK — the 9 failures (verifyPhase13, 14, 16, 17, 18, 19, 20,
  24, 25) fail identically at HEAD 37 (checked by stashing this phase: stale checks from older defaults, listed in
  BUILDER), and verifyPhase37's 60 s CoX limit read 67 s under the parallel load (43 s alone: OK).
- **Headline fixture** `src/tests/fixtures/headlines.json` (fa, toa, cox, tob, faSolo, faNotOwned: total + seconds,
  route, ring, kit, free slots, carriers, Bring, items, your share, surge doses, encounter seconds), cases and summary in
  `src/tests/utils/headlines.ts`, regenerated by `scripts/pinHeadlines.mjs` (esbuild bundle, child processes; `--full`
  also writes phase37/*.json, `--check`, `--readme`). Read by CrossRaidHeadlines* (whole summary + totals), Phase31
  Solo, Phase34 / 35 / 35b (totals, free slots, carriers), 12 verify scripts (`scripts/headlines.mjs`) and the README
  table (generated; `Phase37b.test.ts` checks it and that the fixture = the phase 37 fixtures' summaries).
- **CI** (`.github/workflows/ci.yml`, coordinator add-on): push / PR to `main-mxeaez`: Node 22.23.4 (.nvmrc), yarn
  install --immutable (cached), lint, tsc, fast Jest suite (`--coverage=false --maxWorkers=2`; 166 s locally). Not run
  yet (needs a push).
- **Phase 37 review nits**: memo counters bound encounter and pass runs separately (`memoCountersWithin`); memo keys tag
  non-finite numbers (`memoKeyJson`); `encodeRingRuns` keeps -0; parallel plans' footer shows the job's searches and
  wall time (`parallelPlanStats`); the rings progress stops at "12 / 12" (`ringProgressDone`).
- Tests: new `Phase37b.test.ts` (17: settings round trip, version / corrupt → defaults, partial + invalid data, Reset,
  diffs only; nits (a)-(e); fixture vs phase 37 fixtures; README). `yarn test` 1597 (1573 pass / 24 skipped);
  `RUN_SLOW_TESTS=1` CrossRaidHeadlines, Phase27, 31, 34, 35, 35b, 37 181 / 181 (279 s); tsc, lint clean. Verify:
  new `verifyPhase37b.mjs` (set party 4, Solo, brews 5, route, Allow switches, ToA level 300; reload: kept; Reset;
  Reset all; screenshot phase37b-settings.png) OK; 21, 23, 26, 27, 29-37 OK.

## Phase 37 — Performance + final review, round 5 (2026-10-25)

**No result changed.** The plans of HEAD 7864dacc (phase 36 fixes) were captured before any change
(`src/tests/lib/raids/phase37/*.json`: FA, ToA, CoX, ToB headlines, FA Solo party 1, FA without Obligator / Ascension
crossbows, the four reduced Phase27 plans) and every one is reproduced field for field (kit, carriers, items, spec plans,
every route / encounter time, inventory, strings; only DPS-evaluation counts and timings differ): FA 21:07.7, ToA
14:07.8, CoX 7:08.7, ToB 7:23.4, FA Solo 21:59.0, FA without Obligator / Ascension 24:11.9, the user's plan 25:15.5,
reduced 1493.8 / 881.2 / 452.7 / 457.3. Docs: BEST_SETUP *Performance (phase 37)*.

- **Profile** (Node `--cpu-prof`, FA headline, 43 s with the profiler): `encounterTime` from the optimiser's replays and
  the carrier / item greedies 65%; inside it `specCountsDrainKey`'s JSON key per query 19%, the DP's model passes per
  (event, option) 23%, the DP 5% (CoX 22%), DPS of new drain states 13%; search 12%; ring screens 31% of the plan; the
  exact re-times each had their own DPS memo.
- **Exact speed-ups**, measured in Node one at a time (FA 29.3 s at HEAD): (1) drain-state lookups memoised by the spec
  counts before the JSON drain key (FA → 26.4 s); (2) exact encounter / pass memos (`traceMemo.ts`, `kitMemo.ts`,
  `RaidKit.memoEncounter` / `memoPass`): a remembered run is reused only by a kit that picks the same member on every
  drain state the run asked about, keyed by the encounter, assumptions, spec plan and options (a pass without the spec
  budget, so carrier / item / surge changes reuse passes); keys interned by identity (FA → 21.6 s, ToB 64.3 → 28.2,
  CoX 122.5 → 77.9 → 63.7 with (3)); (3) the exact re-times share one DPS memo (`kitEvaluatorCache`); (4) the DP's
  state key lists its pools once per row; (5) **parallel camp-one ring runs** in the browser (`parallelRings.ts`,
  `planRingRun`, `PlanHooks.ringRuns`; helpers = cores − 1, at most 8, none below 4 cores): every ring's screen, then
  the best rings' full runs with the screens' search rows; the main plan takes them (a Node test builds the plan from
  helper runs through the worker JSON — `encodeRingRuns` keeps Infinity — and gets the same plan). Tried and dropped:
  starting the full runs with the screens (each searching: slower on the loaded machine). Not applied: a DP memo per
  problem (repeats are 1.1 of CoX's 16.9 s of DP), a lower `MAX_EVENT_OPTIONS`, the one-event DP shortcut (< 1% of the
  time once passes are memoised).
- **Times** (dev machine, 20 threads; it also runs games, so the times vary ±50% with their load). Node, one thread, at
  rest: FA 29.3 → 21.6 s, ToA 64.6 → 35.6, ToB 64.3 → 25.1, CoX 122.5 → 62.5, FA Solo 81.9 → 41.5, FA without
  Obligator / Ascension 140.0 → 61.2 (under the games' load, same minute: FA 55.4 → 34.5). Browser (verifyPhase21, 8
  helpers), quiet: FA 18.4-19.1 s, ToA 16.5, ToB 21.2, CoX 38.3 (phase 36: ~38 / 51 / 72 / 112 s); under load the same
  run read FA 55, ToA 49, ToB 62, CoX 111 s; the last run (some load) FA 22.7, ToA 19.5, ToB 26.4, CoX 46.2 s. verifyPhase21's limit 240 → 150 s, verifyPhase27's re-plan 60 → 20 s
  (16.8 s).
- **Slow suites** (`RUN_SLOW_TESTS=1` CrossRaid + Phase27-37, Jest in parallel, `--coverage=false`): 997 s at HEAD (16.6
  min; CrossRaid the long pole at 991 s) → **726 s** (12.1 min, 321 / 321; the long pole is now
  CrossRaidHeadlinesCox at 720 s). CrossRaid's slow headline tests moved unchanged to `CrossRaidHeadlines.test.ts` (FA,
  ToA, ToB) and `CrossRaidHeadlinesCox.test.ts` (CoX, FA without Obligator / Ascension; shared code in
  src/tests/utils/crossRaid*.ts) so they run in parallel workers; the bit-identity checks of the headline plans sit in
  those tests and Phase31's Solo test (each plan planned once). Two runs in between, with the old file layout and the
  machine busy with games, took 1118 / 1178 s.
- **Specs (damage) box** (user add-on): plain headers with tooltips — Avg damage, Gain over normal hits, Time saved, Cost —
  and a new **Gain per 100% energy** (gain ÷ cost × 100, `gainPerFullBar`), the default order; numbers unchanged
  (Xarth: ZCB 74.9, Kisten 60.6, Dragon claws 55.5, Burning claws 46.4, Voidwaker 41.2).
- **Drain summary fix** (user, FA party 4: Bork got no specs and the briefing showed one unlabelled Smorks line): names
  and lines come from the drainable NPCs (a drain line on a non-`noDrains` target), specced or not — "Bork: no specs ·
  Smorks: Tonalztics 8 hits + BGS 2 specs → Def 48"; a named NPC's event without specs is in the short line too (CoX
  Olm "Right claw, after phase 1: no specs", ToA "Elidinis' Warden: no specs"); adds stay out. Display only
  (`drainSummaryPhases` in briefing.ts passes `noDrains`); Phase35b re-pinned for those two lines.
- **Final review, round 5**: BEST_SETUP (Reading the Plan tab: the phase 36 additions; Specs box table; 35b fix;
  Performance section), UNVERIFIED (D21-D29, B10, E9, F7, G7 all have in-game checks; no new row: the speed-ups
  approximate nothing; D28's check names "Avg damage"), README (headlines = CrossRaid; the Specs box; plan times),
  ROADMAP (37 done, a phase 37 decision; the coordinator's round 6 table and "Future work (round 7)" kept as found),
  UPSTREAM_MERGE round 5 (phases 33-36 touched no upstream file; phase 37 +7 lines in `CalcWorkerTypes.ts`; nothing to
  send upstream; `formatDuration`'s fix is fork-only), DEPLOY unchanged, `git grep -i` for the owner's email empty.
- Tests: new `Phase37.test.ts` (trace memo; memoised = unmemoised kits on FA / ToB / ToA for carriers, items, surge,
  Solo, hp left, members, a fixed plan and a random sequence; shared re-time memo; DP key; Specs box render;
  Bork no-specs toy; parallel helpers = the plan alone (6 helpers; slow: 3 helpers, auto carriers, Solo subset); the
  reduced plans = the fixtures, with memo counters); the headline slow tests (CrossRaidHeadlines*, Phase31 Solo) compare
  their plans with the fixtures, check the memo counters (`stats.memo`, new, deterministic: `memoWithin` ±20%) and a
  catastrophe-only CPU budget (5× each plan's time alone: wall and CPU times were 3-9× a plan alone in the parallel slow
  run, so tight time budgets failed there); Phase35b re-pinned.
  `yarn test` 1580 (1556 pass / 24 skipped); `RUN_SLOW_TESTS=1` CrossRaid + Phase27-37 321 / 321; tsc, lint clean. Verify: new `verifyPhase37.mjs` (Specs box headers / order, CoX plan with "rings in
  parallel", Olm's "no specs" lines; screenshots phase37-*.png), verifyPhase36 re-pinned to the new headers;
  verifyPhase21 / 23 / 26 / 27 / 29-37 all OK (verifyPhase34 found the six-column Specs table 432 px wide at 390 px: it
  now scrolls inside its box; verifyPhase27's re-plan 15.4 s; with the machine busy it read 50 s once); tracked
  screenshots they overwrote restored.

## Phase 36 fixes — review follow-ups (2026-10-25)

The independent review recomputed E[spec], net, ticks and the DP (unpruned brute force) and found them correct; these
fixes change numbers. Docs: BEST_SETUP *Damage specs, surge potion …* (Pools, Clock and regen, Hp left, Review fixes,
headline table), UNVERIFIED D27 / D28 / D29, DATA_SOURCES *Phase 36*.

- **One spec bar per party member** (blocker): Team plans used party + 1 bars (the carriers up to the party plus your
  bar for damage specs / doses: FA 7 in a 6-man, CoX 7, ToB 5). With damage specs or a Surge potion you are not a carrier
  now: `specBudgetFrom` cuts the carriers at party − 1; the item greedy makes room by dropping the carrier whose removal
  costs least (`fitBars`); afterwards the carriers are re-run greedily with party − 1 and the planner keeps the faster of
  "you carry a drain weapon, no items" and "you spec" (a note gives both times; the share text covers surge doses too).
- **Damage specs at the hp left** (`rowHpLeft`, `atHpLeft`, `PhaseQuery.hpLeft`): the ZCB ruby proc was a share of the
  full hp, so the DP put ZCB specs on the AG's last 165 hp and Bork's last armour phase; now each phase's specs are
  valued at the NPC's hp left at its start (its damage still to deal in the drain event, capped at the full hp) and no
  spec's E[damage] exceeds it: FA ZCB specs now on the AG shield (6.28 s), Bork's third phase (6.76 s), Moia, Xarth,
  Ocellus P1 and P3's last quadrant.
- **Regen on the drained clock**: the encounter is re-planned on its own drained phases' clock (up to `CLOCK_ROUNDS` = 2
  re-plans). The AG's Burning claws spec (relying on a regen tick of the 36.7 s undrained clock that the 29.1 s drained
  fight never reaches) is gone: AG 174.8 → 175.8 s.
- Headlines (Team defaults): FA 21:04.9 → **21:07.7** (2 Elder maul + 3 Tonalztics; ZCB + Burning claws + a Surge potion,
  dose at Ocellus; 21:43.8 if you carry), ToA 14:05.5 → **14:07.8** (1 maul + 1 Ayak; Voidwaker), CoX 7:03.6 → **7:08.7**
  (3 maul + 1 BGS + 1 Tonalztics; Dragon claws), ToB 7:21.2 → **7:23.4** (1 maul + 2 Tonalztics; Dragon claws; Sotetseg:
  start maul ×2, after each maze Tonalztics ×2). FA Solo 21:54.8 → 21:59.0; FA without Obligator / Ascension 24:05.1 →
  24:11.9; the user's plan 25:00.0 → 25:15.5 (it had 4 carriers + your bar in a 4-man).
- Docs report the items' **marginal** values in the final FA plan (ZCB 23.9 s, Surge 3.8 s, Burning claws 2.1 s), the
  surge cooldown clock as conservative everywhere (in-room non-DPS time isn't counted), and that a dose can't pay for
  drain specs on the phase it's drunk.
- **Fixed-plan replay vs exact allocation**: a slow test brute-forces every kit of a reduced FA pool (10 candidates, ≤ 4
  loadouts, 336 kits) with each kit's own exact allocation: the planner's kit is the best (gap 0.0000 s). New test hook
  `PlanHooks.onKitSpace`.
- Tests: Phase36 +7 (bars = party; carriers cut at party − 1; rowHpLeft; ZCB on 165 hp ≤ 36; AG drained clock; carry
  vs spec at party 1 / 6 (slow); the kit brute force (slow)); CrossRaid asserts bars ≤ party on every headline plan;
  Phase27 (ToA 881.2, CoX 452.7), 29, 31, 32, 34, 35, 35b and CrossRaid re-pinned; verify scripts re-pinned.

## Phase 36 — Damage specs, surge potion, one spec budget per encounter (2026-10-25)

Numbers move (full independent review next). Docs: docs/BEST_SETUP.md *Damage specs, surge potion and one spec budget
per encounter (phase 36)*; UNVERIFIED B10 / E9 / F7 / G7 updated, D27 (budget), D28 (damage specs), D29 (surge) new;
DATA_SOURCES *Phase 36*.

- **One spec budget per encounter** (`specBudget.ts` pure DP, `encounterBudget.ts` time-model glue; raidTime.ts
  `encounterTime` / `raidTime`): pools = your bar (Solo) or one bar per carrier + yours (Team); 100% at each encounter
  (`CARRY_SPEC_ENERGY = false`, the flag carries the leftover with 0 s of travel); drain events per NPC + Defence resets
  (new: Kephri's final phase, the Warden's enrage, Olm's hand phases — wiki quotes in DATA_SOURCES); regen +10% / 30 s
  (15 s Lightbearer) on the encounter's wall clock; exact DP with dominance pruning, ties → fewer specs, then a top-up
  spending spare energy on drain reliability; never slower than no specs; at most 24 options per event after the
  pruning (`MAX_EVENT_OPTIONS`; only Olm's events have more: CoX 7:03.2 → 7:03.6 for a ~45% faster plan). Couplings (Bloat's first down → later downs)
  attributed to the causing event.
- **Damage specs** (`damageSpecs.ts`): Voidwaker, Dragon / Burning claws, Zaryte crossbow (ruby / diamond (e)), Crimson
  kisten (the roadmap's "Kiston": a Maggot King unique); Keris partisan of breaching and Bone dagger not modelled
  (no upstream spec). E[spec] = upstream `getSpecCalc().getExpectedDamage()`; net = E − DPS × ticks × 0.6; seconds =
  net ÷ (team-DPS multiplier × DPS); only damage-limited phases, never adds.
- **Surge potion**: a 1-slot item (4 doses, pseudo id like the hearts, bundled wiki image); +25% capped, once per
  encounter after your first spec or below 100%; doses placed exactly per route (≥ 300 s apart on the route's DPS clock,
  first at the raid start); a second potion only if > 4 doses fit.
- **Planner**: the optimiser replays a fixed spec plan (`fixedAlloc`) found by the DP on a bootstrap kit; carriers /
  share / items greedy use the DP on the kit; exact re-time allocates per kit. Damage weapons and surge potions brought
  greedily at ≥ 1 s per slot (`pickSpecItem`); Team: with damage specs your share is "your spec energy goes to …".
  Fixes found on the way: the optimiser's times are re-timed after the item greedy (step 7 used stale times), and
  `formatDuration` rounds before splitting minutes (1499.96 s read "24:60.0").
- **UI**: Plan briefing "You: [icon] ×N" damage specs and a surge "dose" marker; Bring line + "Surge dose at: Ocellus"
  (icon); per-phase rows list damage specs; inventory shows the Surge potion; Search "Specs (damage)" box
  (`SpecDamageBox.tsx`, best first: E[dmg], net, s / spec, energy); Search Solo drain box "with a surge dose" line.
- **Headlines** (Team defaults, camp one ring): FA 21:44.4 → **21:04.9** (Bring Zaryte crossbow + Burning claws + Surge
  potion, dose at Ocellus; carriers 2 Elder maul + 4 Tonalztics), ToA 14:12.1 → **14:05.5** (Voidwaker), CoX 7:01.3 →
  **7:03.6** (Dragon claws; Olm re-drained from one budget: slower), ToB 7:29.5 → **7:21.2** (Dragon claws; Sotetseg
  "start: Tonalztics 3 hits → Def 107 · after maze 1 / 2: Elder maul 2 specs + Tonalztics 1 hit → Def 100"). FA Solo
  party 1 22:01.9 → 21:54.8; FA without Obligator / Ascension 24:34.1 → 24:05.1; the user's plan 25:46.3 → 25:00.0.
- Tests: new `src/tests/lib/raids/Phase36.test.ts` (26); re-pinned Phase27 / 29 / 30 / 31 / 32 / 33 / 34 / 35 / 35b /
  CrossRaid. Verify: new `scripts/verifyPhase36.mjs`; verifyPhase21-35b re-pinned (totals, Bork lines).
  `yarn test` 1556 (1534 pass / 22 skipped); `RUN_SLOW_TESTS=1` CrossRaid + Phase27-36 294/294; tsc, lint clean.
  Verify: verifyPhase36 all OK (screenshots phase36-*.png); verifyPhase21 / 23 / 26 / 27 / 29-35b all OK after the re-pins
  (tracked screenshots they overwrote restored). verifyPhase35b's "Obligator not owned" Wear check is skipped when the
  route no longer passes Bork + Smorks (it now takes Ezekiel).
- Not done / left: plans are slower (browser: FA ~40 s, ToA ~50 s, ToB ~70 s, CoX ~112 s, 193 s before the option cap;
  verifyPhase21's limit raised 150 → 240 s, verifyPhase27's re-plan 20 → 60 s); the time between
  encounters (energy carry), mid-event re-drains and two doses in one long encounter are not modelled (D27, D29).

## Phase 35b — Briefing: one drain line per NPC (2026-10-24)

User (FA plan briefing): "It says Bork + Smorks. But they are separate bosses. I can't tell which I should use
elder/ralos on". Phase 33 folded every target of an encounter into the first phase's drain line (The Smorks, Def 220
floor 0, was hidden under Bork's 300 → 180). UI fix, **no number changes** (FA 21:44.4; per-phase strings unchanged).

- **Grouping**: new optional `BestSetupTarget.npc` (types.ts); `phaseNpc(targetKey)` (briefing.ts) = `npc` ?? monster
  `name`. Same-name targets are one NPC with no data (AG, Bork's phases, Ocellus P1–P3, Kephri, Wardens shield / core,
  Nylocas forms, Verzik). `npc` set where one name covers different NPCs or is long: Smorks, Obelisk, Olm Right claw /
  Left claw / Head, Melee / Ranged / Magic vanguard, Small / Large muttadile.
- **Events** (`encounterDrainSummary`, drainLine.ts): one event per NPC (first-appearance order; an NPC coming back joins
  its event), plus the `drainReset` events (Sotetseg, Bloat). Unspecced NPCs (adds) get no line. Several specced NPCs →
  named: "Bork: Elder maul 2 specs + Tonalztics 2 hits → Def 180 · Smorks: Elder maul 4 specs + Tonalztics 2 hits →
  Def 5" (briefing, two lines); tooltip / per-phase details "Bork: 2 Elder maul carriers … → Def 180 · 99.6% · Smorks: …
  → Def 5". `encounterBrief` labels per NPC and never merges two NPCs into "× N". Single-NPC encounters unchanged.
- **Wear** (`wearGroups`; PlanBriefing): one line per NPC ("Bork: [icons]" / "Smorks: [icons]") when the NPCs use
  different loadouts; NPCs with the same loadouts share a line; otherwise the phase 34 cell. Phone: weapon icon only.
- **Other multi-NPC encounters** (defaults, Team): ToA Wardens now Obelisk / Elidinis' Warden (P2 shield, P2 core) /
  Tumeken's Warden lines (the core and P3 lines were folded into the Obelisk's); CoX Olm Right claw / Left claw / Head
  (was the right claw's only); Kephri, Akkha, Vasa, Vespula, Muttadiles keep one spec line (adds unspecced) and get a
  per-NPC Wear; Vanguards Wear per Vanguard; AG, Ocellus, Dagon'hai, ToB unchanged. Full table: docs/BEST_SETUP.md
  *One drain line per NPC (phase 35b)*.
- Tests: new `src/tests/lib/raids/Phase35b.test.ts` (16); Phase34.test re-pinned (Bork + Smorks line, a render test's
  rows carry `wear`). Verify: new `scripts/verifyPhase35b.mjs` (all OK; screenshots phase35b-*.png); verifyPhase33 / 34
  re-pinned to the per-NPC line; verifyPhase29–35 re-run, tracked screenshots they overwrote restored.
  `yarn test` 1530 (1508 pass / 22 skipped); `RUN_SLOW_TESTS=1` CrossRaid + Phase27-35 + 35b 268/268; tsc, lint clean.

## Phase 35 — No specs on adds (2026-10-24)

Rule (user): "you obviously aren't going to Ralos or Elder maul spec the little minions that die in a few hits anyway".
Until now every add was its own drain plan with a fresh 100% spec budget, which overstated the drains' value.

- **Targets** (`noDrains: NO_DRAINS_ADDS` = "adds: not worth a spec", `src/lib/raids/types.ts`): ToA Spitting / Soldier /
  Arcane Scarab, Akkha's Shadow; CoX Skeletal Mystic, Lizardman shaman, Muttadile (small), Glowing crystal, Abyssal
  portal; ToB the six wave nylocas (Search only); FA Jelly (Search only; the roadmap said "FA: none", but the jellies
  are 61 hp summoned adds and the time model ignores them, so no headline moves). The wiki phrase per target is in the
  target's comment and docs/DATA_SOURCES.md *Phase 35*. Existing reasons kept (Vanguards, Bloat after a stomp, Verzik).
  Judgement calls that keep drains: Ice demon, Tekton, Vasa, Vespula, the large Muttadile, Olm hands / head, ToA
  Obelisk, Warden core, Kephri (shielded), Dagon'hai, Ocellus P2, The Smorks.
- **Effect**: the existing `noDrains` path (`buildTargetMonster`) ranks them at full Defence in every drain state, so no
  drains are planned on them (Solo and Team), the planner's team briefing skips them (`perTarget`), and the greedy
  carriers gain nothing on them (route time; an add's seconds are identical with / without carriers). UI: Search drain
  box "No drains: adds: not worth a spec" (it wins over Solo's "no spec weapons" note; no per-boss table for `noDrains`
  targets), Summary "no specs (adds)" (other `noDrains` targets "no specs"; reason in the tooltip), Plan per-phase rows
  "no specs (adds)".
- **Headlines** (defaults, Team, camp one ring): FA **21:44.4** and ToB **7:29.5** unchanged; ToA 14:04.1 → **14:12.1**
  (same kit; Akkha 138.5 → 144.5 s, the shadows 42.8 → 48.8; Kephri 145.8 → 147.8, the scarabs 17.8 → 19.8; carriers
  1 Elder maul + 1 Tonalztics + 1 Eye of Ayak → 1 Elder maul + 1 Eye of Ayak; your share Eye of Ayak → Elder maul); CoX
  6:35.9 → **7:01.3** (Mystics 31.8 → 43.9, Shamans 25.1 → 29.7, Vespula 19.3 → 23.4, Vasa 18.5 → 21.8, Muttadiles
  21.6 → 22.8, Olm 189.6 → 189.7; carriers 2 Elder maul + 2 Tonalztics + 1 BGS + 1 Ayak → one Tonalztics fewer; your
  share Tonalztics → Elder maul). Reduced pools, allow switches (`Phase27`): ToA 872.6 → 879.6, CoX 411.9 → 442.0.
  Re-pinned: CrossRaid (headlines + fast pins), Phase27, verifyPhase23 / 32, README, BEST_SETUP, ROADMAP.
- **Found, not modelled** (UNVERIFIED F10): the Glowing crystal "regenerates any drained defence levels" of Vasa when he
  reaches it, and Mod Ash's CoX stat-regeneration rates (Tekton 1 level / 15 ticks, Vasa 10, Vespula 10, Muttadiles 15,
  ...): CoX drains decay within a room; the model keeps them for the whole room.
- Tests: new `src/tests/lib/raids/Phase35.test.ts` (every add has the reason; `buildTargetMonster` Solo / Team = the
  undrained monster; judgement calls still drain; ToA / CoX encounters: add phases take the drains-None seconds with
  Team and Solo, no drain line; briefing rows; a reduced ToA plan's team briefing / drivers / phases list no add;
  SpecPlanPanel render; slow: ToA 14:12.1, CoX 7:01.3 with their carriers). Presets.test's per-target drain check skips
  `noDrains` targets (the Jelly).
  `yarn test` 1514 (1493 pass / 21 skipped); `RUN_SLOW_TESTS=1` CrossRaid + Phase27-35 252/252;
  lint, tsc clean.
- Playwright: new `scripts/verifyPhase35.mjs` all OK (ToA Search Spitting Scarab Team / Solo: the note, no icons,
  ranked at Def 80; ToA Plan 14:12.1, briefing / Spec plan without scarab or shadow, the 4 add phase rows "no specs
  (adds)", Kephri / Akkha still drain; CoX Summary Skeletal Mystic "no specs (adds)", Tekton drains); screenshots
  `phase35-{search-scarab-team,search-scarab-solo,plan-toa,plan-toa-details,summary-cox}.png`. verifyPhase21 / 23 / 26 /
  27 / 29-34 all OK (23 / 32 re-pinned to ToA 14:12.1); tracked screenshots restored.
- Docs: BEST_SETUP *Targets that never get specs (phase 35)*, DATA_SOURCES *Phase 35*, UNVERIFIED D26 (the adds rule)
  and F10 (CoX drain decay), README, ROADMAP 35 done.

## Phase 34 — Readability, all three tabs (2026-10-24)

UI only: no number changes. Rule (user): "if it doesn't provide useful information we should hide it" — the default view
shows what to wear, what to spec, how many and how long, as icons and bold numbers; the rest is in tooltips or sections
closed by default. Full map of where every old element went: BEST_SETUP *Reading the Plan tab (phase 34)*.

- **Short drain form** (drainLine.ts `briefText` / `briefItems` / `briefResultText`, DrainLineView `DrainBrief`): a
  large weapon icon and one bold number per weapon — Tonalztics **4 hits** (landed hits needed), Elder maul / DWH **2
  specs** (landed), BGS **N specs**, Eye of Ayak **≈ 39 magic def** — then "→ Def 156"; "not needed" weapons left out
  (tooltip keeps them). Search drain box header "[Tonalztics] 4 hits → Def 156 · Magic def 130"; Summary cells; the
  Plan briefing.
- **Plan tab**: a raid briefing at the top of the result (`PlanBriefing.tsx`, `briefing.ts` `briefingRows`): boss
  image, the kit loadouts used as icons (weapon + items, style colour; phone: weapon only), specs at the start (from
  phase 33's drain events; Sotetseg "× 3"; carriers not repeated; the phase 33 line is the tooltip), seconds; then
  "Bring" + your share, the worn / inventory grids. Closed sections: **Why this kit** (kit loadouts, potions, ring +
  others, spec note, rejected / alternatives, stats), **Spec plan** (Solo list / team briefing table, added in order,
  per-boss minimum, notes), **Per-phase details** (phase 33's encounter table with its toggle, routes). Inputs: the
  intro and ring summary are tooltips; Route, the potions note and the raid items moved to Advanced (plan).
- **Search**: drain sentence, hit chances, budget, chance of the floor and the per-boss table under the box's "details";
  ranked-at / best preset / evaluations / can't-hit under "Search details"; "vs best preset", max hit, accuracy, item
  list and "search started from" are tooltips. **Summary**: best preset in a tooltip, "↗" load button, drains as icon +
  number (the sentence and "(fight ≈ 15 s → N specs)" are the tooltip).
- **Assumptions**: potion / Heart pickers are custom icon lists (`IconSelect.tsx`, `potionChoices.ts`: relevant
  choices first, the rest under "more"; the same options as the old selects), Zeal with its prayer icon, Elemental
  fragments → Advanced, the Ayak hint an "ⓘ" tooltip, "from the last plan" / ring-lock notes screen-reader text.
- **Item icons everywhere** (`ItemNames` / `itemImageByName`): "uses: …" badges, Excluded, potions, rings, Worn / Switch
  names, alternatives (`PlanRejection.weapons`, new optional field), spec note, added in order, your share, raid items,
  always-brought warning, "+ heart" buttons.
- **Drain-line wording** (tooltip / per-phase rows): "4 specs (2 carriers), 8 swings" → "4 specs (2 carriers) = 8
  attacks, 4 must land" (Solo "4 specs = 8 attacks, 4 must land"; maul / DWH / BGS specs only); tooltip "attacks twice
  and each attack can miss"; glossary updated. Phase23 / 29 / 32 tests and verifyPhase23 / 29 / 30 / 32 re-pinned to
  the new text only.
- Tests: new `Phase34.test.ts` (briefText per weapon; rewording; briefing rows FA Team / Solo, ToB Sotetseg × 3; potion
  lists = the old options; render-level icon checks on DrainBrief / PlanBriefing / KitLoadoutIcons / ItemNames; slow:
  the FA Team plan 21:44.4, 6 free, briefing, phase 33 encounter lines, "Why this kit" / "Spec plan" strings).
  `yarn test` 1456 (1437 pass / 19 skipped); `RUN_SLOW_TESTS=1` CrossRaid + Phase27-34 193 / 193; lint, tsc clean.
- Playwright: before / after screenshots `phase34-before-{search,plan,summary,plan-phone}.png`,
  `phase34-after-{search,plan,summary,plan-phone,plan-details}.png` (`scripts/phase34Shots.mjs before|after`); new
  `verifyPhase34` all OK (default views have no sentence-form drain text, sections open the old content, icons, no
  overflow at 390 px; the 3 px upstream top bar overflow at 390 px is pre-existing, also on the calculator page); the
  phase 33 page's plan strings were dumped before the change and compared after: identical except the drain rewording
  and "Why this kit" now being the section title. verifyPhase21 / 23 / 26 / 27 / 29 / 30 / 31 / 32 / 33 all OK (verifyPhase32 counts the loadout's item-row icons, not the new weapon icon by its name) (they open the moved sections first:
  `scripts/phase34Sections.mjs`); tracked screenshots restored.
- Docs: BEST_SETUP *Reading the Plan tab (phase 34)* (layout, where each element went, icons), ROADMAP 34 done.

## Phase 33 — Specs follow the plan; one drain line per encounter (2026-10-24)

UI / defaults only; no plan total moves (the Plan tab already defaulted to "Planner decides").

- **"Specs I bring" defaults to none** (`DEFAULT_ASSUMPTIONS.mySpecs`: every weapon off, Ayak 0; ToA / CoX / ToB copy
  it). The row has a mode select ("Planner decides (Plan tab)" / "Set manually") that is the same setting as the Plan
  tab's "Spec weapons" (lifted to the page). Planner decides: the chips are read-only (dashed, disabled) and mirror the
  last plan's "Bring" (Solo: the chosen subset; Team: your share when carried), "(from the last plan; Search / Summary
  use them)", or unlit with "(run a plan to fill these)" before a plan; Search / Summary Solo drains use exactly those
  weapons (`withPlanSpecs` in specChoice.ts → `mySpecsForSubset`: Ayak until magic def 0). A plan with drains "None"
  leaves the last Bring. Set manually: editable chips as before. The Search tab's Solo drain box with no spec weapons:
  "no spec weapons: run a plan or pick Specs I bring"; the Ayak hint only shows with Ayak specs.
- **What moved** (Search, FA party 6, Solo drains, top row; phase 32 default Elder maul + Ayak × 2 → none before a plan
  → the plans' Bring, Tonalztics): Bork 10.327 → 8.945 → 9.235; AG Flying 10.095 → 9.387 → 11.127; AG Grounded 12.855 →
  11.413 → 12.887; Xarth 13.917 → 12.839 → 13.917; Moia 10.931 → 10.084 → 11.386 (Summary Solo column likewise). Tests
  that pinned numbers with the old default keep it as an explicit input (`src/tests/utils/phase32Specs.ts`: Presets,
  Phase23, SpecAccuracy, Ownership, Phase27, Phase29).
- **One drain line per encounter** (`encounterDrainSummary` in drainLine.ts; PlanView `EncounterDrains`): the encounter
  row shows the specs at the start of the fight, from the first phase whose drain line specs a weapon (its own
  numbers); a later phase needing another set of weapons gets its own line. FA Team defaults: Bork + Smorks "Start of
  fight: 2 Elder maul carriers (4 specs) + 2 Tonalztics carriers (4 specs) → Def 180 · 99.6%"; AG "Flying shield: 2
  Tonalztics carriers (4 specs) → Def 156 · 98% · Grounded: 2 Elder maul carriers (4 specs) + 2 Tonalztics carriers (4
  specs) → Def 156 · >99.9%"; Ocellus "P1 at a corner: … → Def 129 · >99.9% · P3 last quadrant, Deflect Melee: 2
  Tonalztics carriers (4 specs) → Def 150 · 84%". Solo party 1 (Bring Tonalztics): "Start: 3 Tonalztics specs → Def 156 ·
  86%" (AG), "Start: 2 Tonalztics specs → Def 129 · 99%" (Ocellus); Bork + Smorks isn't on the Solo route (unit test,
  presets kit: "Start: 3 Tonalztics specs → Def 267").
- **Drain events** (coordinator amendment): `PlannedPhase.drainReset` (→ `PhaseTime`) marks a phase where the Defence is
  restored; the line is grouped per event ("After maze 1 (Defence restored), again: …"). Flagged across the four raids
  (defaults): ToB Sotetseg thirds 2 and 3 (`maze 1`, `maze 2`) and ToB Bloat's later downs (`the stomp`; no drains in the
  model, "no specs"). Not flagged (sources say nothing of a restore / drains carry): Tekton, Vanguards (no drains),
  Wardens P3, Akkha, Olm, Verzik, Xarpus. Maths unchanged: each phase still plans with 100% energy (tooltip: re-draining
  needs spec energy again; phase 36 shares one budget per encounter).
- **Per-phase details**: one "▸ Show per-phase details (N phases)" toggle for the whole table (closed by default; rows
  stay in the DOM, hidden); the phase rows' drain lines are unchanged. Search / Summary keep their per-phase lines.
- Tests: new `Phase33.test.ts` (defaults per raid; withPlanSpecs; reduced plans Solo / Team chips = Bring; toy summaries;
  FA Bork / AG / Ocellus / Xarth / Solo lines = the first phase's; stun-uptime six rows → one line; reset flags across
  every raid = the "Defence restored" labels; Sotetseg 3 events, Bork 1, Bloat 2; slow: full FA Solo party 1 → chips
  Tonalztics, Team → your share). `yarn test` 1434 (1416 pass / 18 skipped); `RUN_SLOW_TESTS=1` CrossRaid + Phase27-33 171 / 171; lint, tsc clean.
- Playwright: new `verifyPhase33` all OK (ToB 7:29.5; Sotetseg "Start of fight: 1 Elder maul carrier (2 specs) + 2
  Tonalztics carriers (4 specs) → Def 100 · 99.7%", then "After maze 1 (Defence restored), again: …" and "After maze 2
  …" with the same numbers) (screenshots phase33-search-solo-nospecs / -plan-collapsed / -plan-expanded /
  -plan-solo / -search-solo-plan / -tob-sotetseg); verifyPhase29 (opens the per-phase details) and 32 ("Set manually"
  before toggling Tonalztics) adapted; verifyPhase21 / 23 / 26 / 27 / 29 / 30 / 31 / 32 all OK (verifyPhase23 ticks the Elder
  maul by hand for its Solo budget check); tracked
  screenshots restored.
- Docs: BEST_SETUP (*Specs follow the plan; one drain line per encounter (phase 33)*, Assumptions, Plan tab layout,
  glossary), ROADMAP 33 done.

## Phase 32 — Final review, round 4 (2026-10-24)

Slot costs change (full independent review next).

- **Zero-value switch items** (user, FA party 4 without Obligator: a slot for Rada's blessing 4 in the melee switch).
  The blessing (prayer only) left `MELEE_FILL` / `ANCESTRAL` (every raid's melee / magic presets) and the melee / ranged
  / magic search pools' `ammo` slot. planner.ts: `isUnusedAmmo` (an ammo-slot item on a weapon that fires no ammo,
  `ammoApplicability` ALLOWED on canonical ids, no melee / magic attack or strength, not Crystal blessing) is dropped
  from every candidate (`withoutUnusedAmmo` in `addCandidate`), never counted (`equipmentItemIds`) and never drawn
  (`inventoryGrid`). **Kept ammo**: a loadout without ammo of its own keeps a kit ammo item in its ammo slot
  (`wornItemCounts`, `wornKeptAmmo`, `SlotUsage.keptAmmo`, `KitProblem.wearsAmmo`, `PlanResult.keptAmmo`) — the bolts
  stay equipped while meleeing — so it holds one inventory item fewer (without it the blessing's slot only moved into
  swap space). Worn grid: the kept ammo in the ammo slot (dashed, "a switch's ammo, worn here too"); free-slots tooltip
  "(… worn in the ammo slot)". UNVERIFIED D25.
- **The user's plan** (FA, party 4, Camp Lightbearer, 6 / 4 / 0 / 2, 1 rune pouch, not owned: Obligator, Zorya's tome,
  Rondache, Inquisitor's helm / hauberk / plateskirt / mace): 25:47.4 → **25:46.3**; the melee switch 10 → 9 items; the
  freed slot buys Onyx ascension bolts (e) for the void Ascension crossbows switch (−1.1 s for 1 slot ≥ 1 s), so still
  0 / 28. The "Zaryte crossbow + Ruby dragon bolts (e) #2" candidate (not in this kit at HEAD inputs; saves 0 s here):
  +3 slots = Zaryte crossbow, Ruby dragon bolts (e), **Twisted buckler** (one-handed crossbow vs the two-handed worn
  Ascension crossbows; +18 ranged attack / +10 ranged str: a DPS item, kept).
- Headlines (Team, camp one ring) phase 31 → 32: FA **21:44.4** (same kit, 6 free, was 5); ToA **14:04.1** and CoX
  **6:35.9** (same kits; the worn melee set keeps the diamond ascension bolts (e): your share now carried in the freed
  slot, ToA Eye of Ayak, CoX Tonalztics); ToB 7:30.0 → **7:29.5** (the Tumeken's shadow partial switch becomes the full
  Shadow (Ancestral) loadout; Nylocas 41.5 → 41.0 s; a 0.5 s-per-slot upgrade (its Imbued Guthix cape): the 1 s rule is per loadout); FA without Obligator / Ascension 24:45.3 → **24:34.1** (the
  Twisted bow partial switch on the Shadow becomes the full Twisted bow (Masori) worn; AG 198.9 → 196.5, Ocellus 775.4 →
  767.3 s); FA Solo party 1 **22:01.9** (6 free). Phase 29 regression {maul, Tonalztics} Solo (phase 29 pinned list)
  1382.50 → 1329.96 s; Phase27 reduced "allow switches" FA 1533.2 → 1493.8, ToA 879.7 → 872.6 s.
- **Drain-line units** (user: "needed ×4 · team brings ×4 (8 hits)" read as 4 people / 8 landed hits): `neededText`
  "needs 4 landed hits · 4 specs (2 carriers), 8 swings · 98%" (+ " · team: 6 specs (3 carriers) · 99.8%" when the team
  brings more; "not needed · team: …"); landed drains of the weapon alone from the start Defence (`landedToReach`:
  Tonalztics hits, maul / DWH specs, BGS "≈ N damage", Ayak "≈ N magic defence drained"), or from the Defence the others leave
  ("needs 2 landed hits once 1 Elder maul spec lands (Def 195)", `landedNeed`), else "needs the other drains too". Solo
  (`soloNeeds`): "needs 3 landed hits · 2 specs, 4 swings · → Def 167". Tooltip: the landed range, "a charged
  Tonalztics spec swings twice and each swing can miss", what the % means. Planned specs' tooltip "(8 swings)"; the
  Max-drain buttons keep "×2 (4 hits)" ("(4 landed hits)"). Glossary "Needs / team". Review: the % is P(the Defence reaches the floor) with these and the other weapons' specs (Bork maul 98% includes the Tonalztics; alone 86.3%), no % sentence when the line reads "→ Def X"; "once 1 Elder maul spec lands (Def 195)"; Ayak "≈ N magic defence drained"; D25 notes a pinned blessing with an all-melee / magic kit is counted as a slot (conservative by one).
- Quiver nits: UNVERIFIED D23 quotes the Dizana's max cape page in full ("when worn" is the max-cape exceptions'; the page
  doesn't say if the slot works from the inventory), same-kind pair (manual swap, not modelled; `quiverSavedSlots` not
  limited: not a one-line change), a quiver only pinned / worn by a non-ranged loadout still frees the slot; QUIVER_NAMES
  comment likewise.
- Round 4 review: UNVERIFIED D21 / D22 got in-game checks, new D24 (Solo 1 s per slot) and D25 (zero-value items, kept
  ammo); ROADMAP 29-32 done, decisions, round 5 (+ finer quiver rule, same-kind ammo swap, prayer bonus); UPSTREAM_MERGE
  round 4: no upstream file changed (+334 / −29), nothing new upstream-worthy; README headline (ToB 7:29.5); DEPLOY
  unchanged; a grep for the owner's email is empty.
- Tests: new `Phase32.test.ts` (data; DPS with no ammo = blessing = every pool ammo on every phase of every raid's melee /
  magic presets; isUnusedAmmo; toy kits; brute force over 8191 FA preset subsets vs an exhaustive count with kept ammo;
  grid; reduced plan; drain wording for AG / Xarth / Bork / Ayak / Solo; slow: the user's plan 25:46.3). Updated: Phase23
  / Phase29 (wording), Planner (comfort supplies), Phase27 (switch totals), Phase31 (exhaustive with kept ammo),
  Phase29 slow (1329.96), CrossRaid (ToB, FA-owned). `yarn test` 1406 (1390 pass / 16 skipped; 13 fewer parametrised preset / pool-item cases without the blessing); `RUN_SLOW_TESTS=1` CrossRaid + Phase27-32 143 / 143; lint, tsc clean.
- Playwright: new `verifyPhase32` all OK (screenshots phase32-drain-ag-flying / -drain-solo / -user-plan /
  -fa-defaults / -kept-ammo); verifyPhase21 / 23 / 26 / 27 / 29 / 30 / 31 re-pinned (ToB 7:29.5, FA-owned 24:34.1,
  drain wording; ToB steps −31.8 / −10.4 / −3.5 s on the new kit): all OK; tracked screenshots restored.

## Phase 31 — Quiver ammo + heart as magic's potion (2026-10-24)

Slot costs change (full independent review next).

- **Quiver** (planner.ts `QUIVER_NAMES`, `isQuiver`, `isQuiverAmmo`, `quiverSpecOf`, `quiverSavedSlots`,
  `quiverHeldAmmo`): a kit carrying any Dizana's quiver (Charged / Uncharged / Locked, Blessed, Dizana's max cape), worn or
  not, and ≥ 2 arrow / bolt types needs 1 slot less (one type per quiver; the Bolt rack, javelins, atlatl darts,
  blessings don't count). Source: wiki Dizana's quiver (https://oldschool.runescape.wiki/w/Dizana%27s_quiver, read
  2026-10-24): "an additional ammunition slot, which can only be filled with arrows or bolts", "only appearing if the
  quiver is in the inventory or equipped" (UNVERIFIED D23). In every count: `optimiseKit` (`KitProblem.quiver`), the
  plan's `usedWith` / `usedOfKit`, `kitSlotUsage` (`SlotUsage.quiverAmmo`), `inventoryGrid` (the held type takes no
  cell). Kit view: the held ammo on the quiver's corner (worn cape slot or the quiver's inventory cell), tooltip "…
  held in the quiver (0 inventory slots)"; free-slots tooltip "− 1 ammo held in the quiver (name)".
- **Heart = magic's kit potion** (`kitHeart`, `kitPotions` → `KitPotion` with type 'heart'): FA / ToB no longer pin it
  (`planDefaults.ts`); a kit with a magic loadout pays one slot (a pinned heart: counted once, no potion slot), magic is
  always boosted (`planAssumptions`: pinned heart, else the Assumptions box's, else Saturated). Inventory: a 'potion' cell
  right after the potions; "Potions (from the kit): … Saturated heart (magic)". ToA / CoX unchanged (raid potion, no
  heart slot). The "+ Saturated / Imbued heart" pin buttons stay (optional).
- **Solo subset search, 1 s per slot** (specChoice.ts `SubsetProblem.slotSeconds`, default `SHARE_MAX_SLOT_SECONDS`,
  `subsetScore`): ranked by time + 1 s × slots, "best without …" too; "adding Elder maul to this plan: −0.6 s (1 slot,
  < 1 s per slot)".
- Headlines (Team, camp one ring) phase 30 → 31: FA 21:44.4 → **21:44.4** (quiver holds the Seeking dragon arrows, and
  the unused pinned heart is gone: 5 free slots, was 3; nothing saves ≥ 1 s per slot); ToA 14:06.0 → **14:04.1** (quiver
  holds the Diamond ascension bolts (e); the slot buys a Keris partisan of breaching loadout, Kephri 147.7 → 145.8 s);
  CoX 6:36.3 → **6:35.9** (quiver holds the Diamond ascension bolts (e); kit re-shuffled: Inquisitor's + Obligator worn,
  Twisted bow + Scorching bow switches, Tekton 16.3 → 14.4 s); ToB **7:30.0** (heart now a kit potion for the Shadow
  switch: same slot); FA without Obligator / Ascension crossbows **24:45.3** (same: the heart for the Shadow loadout).
  Solo party 1: 22:01.3 (Elder maul + Tonalztics) → **22:01.9, Bring: Tonalztics** (Elder maul saved 0.57 s). Phase 29's
  slow regression with the phase 29 pinned list: 21:53.0 → 21:44.4.
- Tests: new `Phase31.test.ts` (toy kits (a)-(d) hand-counted in `kitSlotUsage`, the optimiser and the grid; real items;
  brute force over all 8191 subsets of the 13 FA presets vs an exhaustive per-worn-state count; heart (e)-(h) on reduced
  plans incl. ToB / ToA / CoX; subset rule (i); slow: Solo Bring Tonalztics 22:01.9 + exhaustive count of the plan's
  kit, Team exhaustive count); Heart / Phase21 / Phase27 / Phase30 / Planner / CrossRaid updated for the heart; CrossRaid
  ToA / CoX re-pinned; Phase29 slow 21:44.4. `yarn test` 1391 (1376 pass / 15 skipped); `RUN_SLOW_TESTS=1` CrossRaid +
  Phase27 + 28 + 29 + 30 + 31 115 / 115; lint, tsc clean.
- Playwright: new `verifyPhase31` all OK (FA quiver badge on the worn Dizana's quiver, "Seeking dragon arrow: held in the
  quiver", no cell, pinned list empty; FA owned: heart cell right after the potions; Solo "Bring: Tonalztics" 22:01.9,
  "adding Elder maul … < 1 s per slot"); screenshots phase31-fa-quiver / -fa-heart / -solo. verifyPhase21 / 23 / 26 / 27 /
  29 / 30 re-pinned (pinned lists empty, ToA 14:04.1, Solo Tonalztics 22:01.9): all OK; tracked screenshots restored.
- Docs: BEST_SETUP (*Plan tab → Heart*, *Quiver ammo and the heart (phase 31)*, potions, ToB / Assumptions lines),
  UNVERIFIED D23 (+ D11 / D14 / D19), ROADMAP 31 done + decisions, README headlines.

## Phase 30 — Plan tab polish (2026-10-24)

UI / defaults only; the planner's maths is unchanged.

- **Supply icons**: brew / restore / food show the wiki's inventory images (Saradomin brew(4).png, Super restore(4).png,
  Anglerfish.png — the cooked fish's file; "Cooked anglerfish.png" 404s), downloaded with the generic User-Agent into
  `src/public/img/supplies/` and statically imported like upstream's Ranging / Super combat images (so they show in dev
  without a CDN deploy; not in `cdn/`, so `copyCdn.mjs` is not involved); "Other" keeps the generic flask.
- **Ring policy** left Advanced: a "Rings" dropdown in the supplies row with the one-line summary next to it (the
  explanation is its tooltip); behaviour unchanged.
- **Empty pinned defaults** (all raids; FA / ToB keep the Saturated heart until phase 31). CoX: the Guardians are
  pickaxe-only, and the planner adds the Dragon pickaxe switch itself (it's in the CoX pool / presets): no pin, no raid
  rule needed (`Phase30.test.ts`; CoX planNote updated). Headlines (Team, camp one ring): FA 21:53.0 → **21:44.4** (5
  freed slots: Ascension crossbows + diamond (e) worn beside the Twisted bow switch, AG 190.7 → 182.1 s; 3 slots stay
  free), ToA 14:10.6 → **14:06.0** (Lightbearer + Zaryte crossbow freed: Twisted bow switch, Zebak 126.5 → 121.9 s),
  CoX **6:36.3** and ToB **7:30.0** unchanged (same kits), FA without Obligator / Ascension 24:53.8 → **24:45.3**
  (Tumeken's shadow loadout boosted by the heart that was unused before). Solo party 1: 22:10.5 → **22:01.3**, Bring
  Elder maul + Tonalztics = the brute-force optimum over all 32 sets (1321.34 s, tied by ten other sets).
- **Drain-line wording**: `specsNeeded` (Defence loop, and Eye of Ayak likewise) — when everything brought reaches the
  floor at the threshold, "needed" is the fewest that still do: AG Flying "needed ×4 (98%) · team brings ×4 (8 hits,
  98%)" (was ×3 (86%)); Xarth Tonalztics "needed ×2 (97%) · team brings ×4 (8 hits, >99.9%)" (was ×1 (66%)); Bork maul
  "needed ×3 (98%) · team brings ×4 (99.6%)", Tonalztics "needed ×3 (97%) · team brings ×4 (8 hits, 99.6%)" (was "not
  needed").
- **Greedy steps re-timed on the returned kit** (`retimeSteps`, a prefix re-time per step; negligible cost): ToB
  "Tonalztics −34.3 s, Elder maul −10.4 s, Tonalztics −3.5 s" (was −31.8 / −10.4 / −3.5).
- Search carriers table summary: "Per boss minimum at 95% (for reference): …".
- Tests: Phase30 (icons, ring dropdown placement, empty defaults, CoX pickaxe added, steps on the returned kit);
  Phase29 (AG ×4 98%, Xarth ×2 97%, Bork, never-sub-threshold sweep incl. Ayak; slow block keeps the phase 29 pinned
  list as input); Phase27 / Ownership keep the phase 29 lists as explicit inputs; Phase21 defaults; CrossRaid re-pinned.
  `yarn test` 1371 (1358 pass / 13 skipped); `RUN_SLOW_TESTS=1` CrossRaid + Phase27 + Phase28 + Phase29 87 / 87; lint,
  tsc clean.
- Playwright: new verifyPhase30 all OK (screenshots phase30-*); verifyPhase21 / 23 / 26 / 27 / 29 re-pinned and all OK;
  tracked screenshots restored.

## Phase 29 fixes 2 — ring guard, Ayak cap, drain-line wording (2026-10-24)

- **Ring guard** (blocker; `guardedFullRuns`, every camp-one run): the best two screened rings in full, g = the largest
  screen − full gap among the rings planned in full, every ring within 2 g of the best full time in full, re-checked
  after each run. "Specs I bring" {Elder maul, Tonalztics}, Solo party 1: Lightbearer 1400.17 → **Ultor 1382.50** (slow
  test). Reviewer's brute force re-run (32 subsets, guard vs every ring in full): **0.00 s miss on all 32** (was 17.7-
  27.1 s on 4).
- **Eye of Ayak carriers ≤ mages** (greedy cap; manual counts clamped with a note; more manual carriers than the party:
  only the first N count, noted, briefing capped). ToA **13:19.6 → 14:10.6** (carriers 5 Ayak + 1 maul → 1 maul, 1
  Tonalztics, 1 Ayak; Ultor; steps maul −55.1, Ayak −14.0, Tonalztics −3.5 s); FA / CoX / ToB / FA-owned unchanged.
  UNVERIFIED D22 (gains overstated by party ÷ mages: teammates are copies of you); ROADMAP round 5 item.
- **`specsNeeded` in sequence** (upstream weapon order; the first minimised with the others as brought, then the next
  given it): Xarth maul "not needed", Tonalztics "needed ×1 (66%)" (was both "not needed"); Bork maul ×3 (98%),
  Tonalztics not needed; AG Flying Tonalztics ×3 (86%).
- **Drain-line wording**: "needed ×3 (86%) · team brings ×4 (8 hits, 98%)" (P(floor from the first round); "→ Def X" /
  "→ magic def X" when the plan doesn't rank at the floor; hits only on the team's part).
- **Search / Summary follow the planner's carriers** (`withPlanCarriers`; PlanView `onCarriers`): the disabled
  Advanced counts show the last plan's carriers; before any plan the defaults with "run a plan to fill these".
- **Your share tie-break**: equal carriers → the higher "last carrier saves" (FA: Tonalztics 27.0 s over Elder maul 3.6 s).
- Greedy steps shown from the final kit when the re-run picks the same carriers (ToB −34.3 / −10.4 / −3.5 s).
- Tests: Phase29 (+ ring-guard toy, Ayak-cap toy, effectiveCarriers, tie-break, Xarth sequence, "→ Def" case, AG
  wording, withPlanCarriers; slow: {maul, Tonalztics} → Ultor 1382.50, manual 2 / 2 / 1 → ayak capped, 21:53.0);
  Phase23 regex; CrossRaid ToA 14:10.6.
  `yarn test` 1361 (1348 pass / 13 skipped); `RUN_SLOW_TESTS=1` CrossRaid + Phase27 + Phase28 + Phase29 85 / 85; lint, tsc
  clean.
- Playwright: verifyPhase29 all OK (new wording on AG Flying, share Tonalztics, counts follow the plan, notes before /
  after a plan, Solo Tonalztics 22:10.5); verifyPhase21 / 23 (ToA 14:10.6) / 26 / 27 all OK; tracked screenshots
  restored.

## Phase 29 fixes — review follow-ups (2026-10-24)

- **Blocker: the Solo subset search missed the optimum** (reviewer's brute force over all 32 sets: {Tonalztics}
  22:10.5 = 1330.53 s, not {Elder maul, Ayak} 22:42.7). Cause: the quick runs took `seeds.slice(0, 4)` of a list ranked
  under the all-weapons drain table (favours magic through Ayak) with the group bests appended at the end. Fix:
  `pickSeeds` (the n best singles + every style group's best, always) ranked under each subset's own table; a guard
  (`SUBSET_GUARD_FACTOR` 2: every subset whose quick time is within 2 × the best's quick − full gap of the best full
  time gets the full run). FA Solo party 1 now: **Bring Tonalztics, 22:10.5** (= the brute force).
- **Ring and subset together** (camp one ring): the screens time the first screen's subset; if the best ring's full run
  picks another subset, the rings are screened again with it and the new best ring is planned in full (≤ 2 rounds;
  `specs.solo.screenedWith`, `ringRounds`). FA Solo: one round (fixed point {Tonalztics}, Ultor).
- **Wording**: "dropping X from this plan: +N s (frees 1 slot)", "adding X to this plan: ±N s (1 slot)", and "best
  without X: …, time" (`bestWithout`, `bestWithoutText`). FA Solo: dropping Tonalztics +228.2 s; best without it Elder
  maul + Eye of Ayak 22:42.7; adding Elder maul +52.0, DWH +52.0, Ayak +52.6, BGS +52.9 s.
- **Team carriers are planner output** (the user's decision): `greedyCarriers` adds one carrier at a time (any weapon,
  the one that lowers the kit's route time most) while it saves ≥ 1 s, party-size cap, Ayak only with mages; the kit is
  re-optimised under them (and the greedy re-run once if the kit changed); the Team drain state uses exactly these
  carriers (`PlanInputs.carrierMode`, `DEFAULT_CARRIER_MODE` 'auto'; `plan()` default 'manual'). Advanced "Team carriers:
  Planner decides / Set manually" (counts editable and the party-size warning only when manual; Search / Summary use
  the counts). Briefing: carriers, what the last one saves, the encounters it saves on, the order added; the drain
  line's "needed ×N" = the fewest of that weapon's first-round specs giving the same ranked drain on that boss
  (`specsNeeded`; "not needed" when 0). FA 6-man: **2 Elder maul + 2 Tonalztics** (added: Tonalztics −230.0 s,
  Tonalztics −35.2, Elder maul −13.3, Elder maul −3.6; the next < 1 s); "Set manually" at 2 / 2 / 1 gives the same
  21:53.0.
- Headlines (Team, camp one ring) phase 29 → fixes: FA 21:53.0 → **21:53.0**, ToA 14:10.5 → **13:19.6** (1 maul + 5
  Ayak, Magus), CoX 6:36.3 → **6:36.3** (2 maul, 2 Tonalztics, 1 BGS, 1 Ayak), ToB 7:30.6 → **7:30.0** (2 Tonalztics, 1
  maul); FA without Obligator + Ascension crossbows 24:53.8 → **24:53.8** (2 Tonalztics). Your share: FA Elder maul
  (free slot), ToA none (5.1 s), CoX none (3.4 s), ToB Tonalztics (0.5 s).
- Nits: no team carrier table in the Search drain box at party 1; UNVERIFIED D21 (new criterion), D17.
- Tests: Phase29 (+ guard toy, seed toy, greedy toy, Smorks stall, briefing rows, specsNeeded, carriers = drain-state
  carriers on a reduced plan; slow: FA Solo party 1 → Tonalztics ≤ 22:10.5 + fixed point, FA 6-man carriers and the
  manual 21:53.0); Phase23 drain-line regex; CrossRaid headlines + recompute with the planner's carriers.
  `yarn test` 1355 (1343 pass / 12 skipped); `RUN_SLOW_TESTS=1` CrossRaid + Phase27 + Phase28 + Phase29 79 / 79; lint,
  tsc clean.
- Playwright: `verifyPhase29` all OK (carriers 2 maul + 2 Tonalztics "picked by the planner", the order added, AG
  Flying "needed ×3 (6 hits) · team brings ×4", Solo party 1 Bring Tonalztics 22:10.5 in 20.5 s, "dropping / adding …
  this plan", "best without Tonalztics: Elder maul + Eye of Ayak, 22:42.7", no carrier table at party 1); re-pinned and
  re-ran verifyPhase21 (ToB 7:30.0) / 23 (ToA 13:19.6) / 26 / 27: all OK; tracked screenshots restored.

## Phase 29 — Planner decides spec weapons (2026-10-24)

- New `specChoice.ts` (pure): `searchSpecSubsets` (Solo subset search: one candidate per distinct drain state = the
  cheapest subset, dominance pruning, quick optimiser for all, full for the best 3, per-weapon Δ and the best rejected
  weapon), `teamRoles` (team briefing: per boss / phase `recommendCarriers`' minimum, max per weapon over the planned
  route, the bosses driving it; Eye of Ayak only with mages), `assignMe` (your share: the most-needed weapon only if
  carried anyway / a free slot / its slot worth < 1 s of gear), `mySpecsForSubset` (Ayak until P(magic def 0) ≥ 95%:
  `ayakSpecsToThreshold`, `SoloSpecInput.ayakUntilZero`, `MySpecs.ayakAuto`).
- `planner.ts`: `SpecMode` (`DEFAULT_SPEC_MODE` = 'auto' in the Plan tab; `plan()` default 'manual' = "Specs I bring"),
  `PlanInputs.specMode` / `magesInParty`, `PlanResult.specs` (bring, text, solo per-weapon Δ, team briefing, share,
  notes). Solo: the subset search inside the kit optimiser per ring run (shared DPS columns per distinct drain state —
  the DPS cache key is now the monster's reductions; `SOLO_DRAIN_CACHE` by phase / subset / energy-budget bucket; ring
  screens after the first reuse its subset). Team: briefing on the matrix-fastest route, share, then the briefing on
  the final route. Spec weapons left the pinned defaults (FA / CoX / ToB Elder maul).
- Drain line: Team items read "needed ×2 (4 hits) · team brings ×4" (`neededSpecs`: specs reaching the floor if every
  one lands); Tonalztics shows its hits inline ("×2 (4 hits)"). Search header: the duplicate "Drains:" line is gone
  ("ranked at [Def icon] Def … · [Magic icon] Magic def …").
- UI: "My specs" → "Specs I bring"; "Ring: I wear a Lightbearer" toggle (locked to the Plan's ring policy while the
  Plan tab is open); Plan "Spec weapons: Planner decides / Specs I bring", "Mages in party" (Advanced (plan)), results
  box (Bring, per-weapon Δ, team briefing table, your share, Ayak hint). FA party size 1 allowed (solo = 2-scale hp);
  a party of 1 disables Team (Solo drains).
- Headlines (Team, camp one ring, planner decides) before → after: FA 22:47.9 → **21:53.0** (Tonalztics in a free
  slot), ToA 14:22.3 → **14:10.5** (no spec weapon: slot worth 6.2 s), CoX 6:40.3 → **6:36.3** (none: 3.4 s), ToB
  7:31.7 → **7:30.6** (Tonalztics: slot worth 0.5 s); FA without Obligator + Ascension crossbows 25:24.5 → **24:53.8**.
  "Specs I bring" reproduces the phase 28 FA total (22:47.9).
- Solo (FA defaults, party 1, Ultor): **22:42.7, Bring: Elder maul (saves 104.4 s), Eye of Ayak (69.2 s)**; not
  brought: DWH −7.7 s, BGS −11.1 s, Tonalztics −49.6 s; 22 drain states / 32 sets, 10 dominated, 13 timed; Jest 53 s
  (123 s before the drain cache / pruning / screen reuse), browser 19.9 s (searches cached).
- Playwright `verifyPhase29.mjs` all OK (Bring / briefing / assign me, AG Flying "needed ×2 (4 hits) · team brings ×4",
  Lightbearer toggle follows the ring policy, Search header without the duplicate line, party 1 → Solo);
  screenshots `phase29-search-header`, `-team`, `-camp-lightbearer`, `-solo`.
  Re-ran verifyPhase21 / 23 / 26 / 27 (re-pinned to the phase 29 totals; 23: "Specs I bring" toggles, Team line "needed
  … · team brings ×N", no Search-header drain line): all OK; tracked screenshots restored.
- Tests: `Phase29.test.ts` (21: toy subset search incl. finalists / signatures / dominance, Ayak threshold, team roles =
  carriers table for AG Flying (2 Tonalztics) and Bork (2 Elder maul), mages, assign-me rule, drain line texts, reduced
  plans: modes, Team share, Solo without magic never brings Ayak, magic-only kit values it, Ayak hint); Phase21 / 23 /
  Ownership updated (pinned lists, drain-line title, "Specs I bring"); CrossRaid headlines re-pinned. `yarn test` 1347
  (1337 pass / 10 skipped); `RUN_SLOW_TESTS=1` CrossRaid + Phase27 + Phase28 50 / 50 (headlines recomputed outside the
  planner equal the new totals); lint, tsc clean.
- Docs: BEST_SETUP *Spec weapons (phase 29)*, UNVERIFIED D21 (assign-me rule), D22 (mages in party), D17; ROADMAP 29 in
  review + decisions; README.

---

Older entries (rounds 1-4, phases 0-28) are archived in `docs/archive/PROGRESS-rounds-1-4.md`.
