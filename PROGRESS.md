# Progress log

Newest entry first. One entry per phase (or per notable fix). Keep entries short: what was done, how it was
verified, what's unverified / left for later.

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

## Phase 28 — Final review, round 3 (2026-10-24)

- Fresh pass over phases 23-27 (d5c43798..1d819af3), focused on what changes numbers.
- **Fix: Plan's Solo fight length** (`drainFightSecondsOf`, raidTime.ts; planner.ts Solo matrix): encounter undrained
  time × team-DPS multiplier ÷ party size, clamped 15-600 s — the Search formula since the phase 23 review. FA's ×1 had
  given Plan / the time model a Solo fight as long as you alone would take (6× at party 6, e.g. Bork + Smorks ~220 s vs
  ~37 s). ToA / CoX / ToB defaults and all Team / None numbers (headlines) unchanged. RaidTime test re-pinned (300 → 50 s).
- Camp Lightbearer with Lightbearer on "Items I don't own": notice (planner.ts `ownershipNotices`).
- **Caches** (`Phase28.test.ts`): `getCanonicalItemId` reverse map = upstream's linear scan for every equipment.json id
  and alias id (0 mismatches); memoised `resolveItem` = uncached pick for every item name. `DPS_CACHE` / `SEARCH_CACHE`
  keys listed in BEST_SETUP *Final review, round 3*; Zeal, fragments, ownership and camp Lightbearer each miss, warm =
  cold.
- **Headlines** (slow `CrossRaid`): totals recomputed outside the planner (KitLoadouts + `compareRoutes`) equal the
  planner's; camped ring on every loadout; FA 22:47.9, ToA 14:22.3, CoX 6:40.3, ToB 7:31.7; new pin **FA without
  Obligator + Ascension crossbows 25:24.5** (camps the pinned Lightbearer).
- Clarity (wording only): Search "Exp. TTK (top row only)", "Tries every end-game item in every slot …" (was a file
  name), "search started from: …" (was "seed (start of the ascent)"), Ayak hint in words.
- verifyPhase17 updated for phase 27 (comfort supplies only; supply cells ± a kit potion).
- Docs: UNVERIFIED B10 / D9 / D18 updated, new B17 (computed fight length), D19 (potions from the kit), D20 (ownership
  matching); BEST_SETUP stale Routes-tab / "Team DPS ×" references fixed + *Final review, round 3*; UPSTREAM_MERGE
  round-3 totals; README features; ROADMAP 23-28 done, *Future work (round 4)*.
- Verify scripts: verifyPhase13, 17, 21, 23, 24, 25, 26, 27 all OK (21: FA 22:47.9, ToB 7:31.7 28/28, plans 7-16 s);
  tracked screenshots restored. Also wording: Plan "Drains" column tooltip (Tonalztics as specs), "Rings:" tooltip,
  FA time-model note.
- `yarn test` 1326 (1316 pass / 10 skipped); `RUN_SLOW_TESTS=1` CrossRaid headlines + only-owned + Phase27 ring guard
  pass; lint, tsc clean.

## Phase 27 fixes — review follow-ups (2026-10-24)

- **Ring screen guard** (`planner.ts`): g = best-screened ring's screen − full time; every ring whose screen is within
  `RING_GUARD_FACTOR` (2) × g of the best full time is planned in full (replaces `RING_FINALISTS` / 1 %). Screen-only
  rings show "≥ +X s (estimate)" (X = screen gap − `RING_ESTIMATE_FACTOR` 4 × g) or "not planned in full", never a
  precise delta (`PlanResult.ring.screened[].atLeast`). Slow test (`ringGuard: Infinity`, all six FA rings in full):
  Ultor is the true best; true gaps Lightbearer +29.1, Bellator +31.8, Venator +45.0, Ring of shadows +54.0, Magus +59.5 s.
- **Caches for the worker's lifetime**: `DPS_CACHE` (assumptions / base player / monster tag / group / equipment /
  options) and `SEARCH_CACHE` (picked rows), `clearPlanCaches`; the per-run row cache is gone.
- **Search slowdown**: CPU profile — 62 % in upstream `getCanonicalItemId` (linear alias scan per item per player), not
  the fight length (already cached), the pool or ownership. Reverse map built once (Equipment.ts, listed in
  UPSTREAM_MERGE.md) + memoised `resolveItem`: 16 FA searches 42.4 s → 11.3 s (Jest).
- Timings (FA defaults, camp one ring): Jest first plan 77 s → 19.9 s, re-plan after a supplies change 33 s → 4.0 s;
  browser first plan 68-79 s → 12.5-15.8 s (FA / ToA / CoX; ToB 48.0 s), re-plan 7.7 s (incl. waits). Headlines
  unchanged (FA 22:47.9, ToA 14:22.3, CoX 6:40.3, ToB 7:31.7).
- verifyPhase21: real guard (no two kit loadouts with the same item set; extra Scythe loadouts cost ≥ 1 slot or save
  ≥ 1 s; `data-items` on kit loadouts). verifyPhase27: first-plan / re-plan timings, estimates check.
- Tests: Phase27 + cache test (second plan: 0 searches, < 1/5 of the evaluations, same total as uncached) + slow ring
  guard test. Full run 1310 pass / 9 skipped; slow headlines + ring guard pass; lint, tsc clean; verifyPhase21/23/26/27
  all OK (tracked screenshots restored).

## Phase 27 — Planner: potions from the kit, comfort supplies, ring policy (2026-10-23)

- User requests: "Maybe it should calculate the potions itself based on the gear" and "A lot of people don't bring
  ring switches. They camp one ring like Ultor the whole fight, or camp Lightbearer for constant specs".
- **Potions from the kit** (`planner.ts`: `KIT_POTIONS`, `kitPotions`, `kitSupplies`, `potionSlots`,
  `comfortSupplies`): FA / ToB kits bring one Super combat if they have a melee loadout and one Ranging potion if
  ranged (one slot each, doses irrelevant); magic = the pinned heart (unchanged); ToA / CoX = the raid potion ("Other").
  The potion slots are part of the optimiser's slot cost (`KitProblem.potions`, one per distinct potion of the members:
  3-way kit 2, melee-only 1, magic-only 0). `planAssumptions` keeps melee / ranged boosted; `PlanResult.potions`
  replaces `unusedSupplies` (gone with its "Drop them" warning). Per-raid defaults are comfort supplies only (FA 6 / 4,
  ToB 4 / 3; ToA / CoX unchanged).
- **Ring policy** (`PlanInputs.ringPolicy`, `RingPolicy`, `RING_POLICIES`, `CAMP_RINGS`, `ringAssumptions`; `plan()`
  default `switch`, Plan tab default `DEFAULT_RING_POLICY` = `camp-one`): `plan()` steps 2-7 now run per ring
  (`runRing`); a camped ring replaces every candidate's ring. Camp one ring screens each owned ring (Ultor, Bellator,
  Venator, Magus, Ring of shadows, Lightbearer; presets + search rows, 6 seeds), fully plans the best (+ runner-up
  within 1 %), the fastest exact route wins; `PlanResult.ring` lists every ring's time. Camp Lightbearer (and camping
  Lightbearer) sets the Solo budget's Lightbearer regen (`mySpecs.lightbearer`); a pinned Lightbearer is then worn.
  Full-candidate matrix rows are cached per ring between the screen and the full run.
- **UI** (`PlanView.tsx`): "Comfort supplies (your call)" (brew / restore / food / other), a potions note, a "Rings:"
  one-line summary, "Advanced (plan)" with the ring policy select; results show "Potions (from the kit)" and "Ring: …
  on every loadout · others: …" (`*` = screen only); potions in the inventory grid; kit loadouts carry `data-ring`.
- **Numbers** (defaults, Team, compare all; before → after with camp one ring): FA 23:30.4 → **22:47.9** (Ultor; switch
  22:47.7, camp Lightbearer 23:16.9); ToA 14:20.2 → **14:22.3** (Magus; switch 14:20.2); CoX 6:39.9 → **6:40.3**
  (Ultor; switch 6:39.9); ToB 7:32.4 → **7:31.7** (Ultor; switch 7:32.4). Allow switches with the same potions =
  the phase 26 planner exactly (A/B on the reduced pools of all four raids).
- Tests: new `Phase27.test.ts` (19, ~2 min: kit potions / comfort supplies, potion slots in the optimiser's cost incl. a tight
  case, plan grid + slots, heart unaffected, policies / camp rings / ownership, Lightbearer flag, camp one ring per raid
  (ring everywhere, no ring switch items, fastest of the screens), camp Lightbearer per raid (worn, not carried), a
  pinned Lightbearer reported unused under camp Magus (ToA), allow switches = previous totals per raid); updated
  Heart / Planner / Phase21 / CrossRaid tests; CrossRaid slow headlines re-pinned (camp one ring).
- Playwright: `scripts/verifyPhase27.mjs` (screenshots `docs/screenshots/phase27-*.png`); verifyPhase21 / 23 / 26 pins
  updated (FA 22:47.9, ToA 14:22.3, ToB 7:31.7 28/28, plan time limit 150 s); their tracked screenshots restored.
- Docs: BEST_SETUP.md *Potions from the kit and ring policy (phase 27)*, UNVERIFIED D11 / D14 updated, new D18.

Unverified / open: the ring screen skips partial switches (a ring could be missed when its screen is > 1 % behind);
a whole raid on one potion item; the default plan is slower (six ring screens).

## Phase 26 — "Items I don't own" (2026-10-23)

- User request: "Most best-in-slot setups have Obligator and Ascension crossbows, but I don't have those yet ... I
  still want Search to show they're the BEST, but when planning my inventory I may not have the BEST."
- **Model** (new pure `src/lib/fracturedArchive/ownership.ts`): a list of `equipment.json` names in localStorage
  `mxeaez-dps:not-owned` (flag `mxeaez-dps:only-owned`), default empty (max gear). Matching: same name (all versions),
  "Name (" variants of a listed base ((max), (or), (f); not the reverse), and upstream alias groups
  (`EquipmentAliases.ts`, symmetric). Helpers `isOwned`, `unownedBase`, `filterPool` / `filterStylePool` (weapons, ammo
  options, darts, slot candidates, extras, sets), `filterPresets`, `loadoutUsesUnowned`, `markUnowned`.
- **UI**: "Items I don't own" row in the Assumptions box's simple view (new `NotOwnedBox.tsx`; global across raid tabs,
  state in `BestSetup.tsx`): chips with ×, the calculator's equipment search, quick-add Obligator / Ascension crossbows /
  Zorya's tome / Rondache, Clear.
- **Search / Summary**: full pool by default; rows / cells using a listed item are greyed with a "uses: …" badge (no
  re-run on a list change). "Only items I own" checkbox (shared, persisted, default off) runs with
  `GearSearchOptions.notOwned` (filtered pool; presets' unowned pieces left out of the seeds); "vs best preset"
  unchanged; `searchCacheKey(q, a, notOwned)` (full-pool keys unchanged).
- **Plan** (`PlanInputs.notOwned`): always filtered pool, presets with a listed item dropped, listed pinned items
  dropped (`droppedPinned`, struck through, notice); a listed My-specs weapon gets a notice. "Excluded: …" line and
  "Best possible with everything: 23:30.4 (yours: …)" from the session cache or the on-demand "compare with max" run.
- Numbers (FA defaults, Team): Xarth Search still tops with Obligator 13.917 (greyed); only owned → **Scythe of Vitur
  12.105** (#2 Inquisitor's mace 10.781). FA plan without Obligator + Ascension crossbows: worn Inquisitor's mace (full
  crush) with a 4-piece Twisted bow (Masori) switch + the Inquisitor's + Scythe (slash) preset, 0 free slots,
  **25:46.8** vs 23:30.4 with everything.
- Tests: new `Ownership.test.ts` (17: storage round trip / garbage / blocked, variant + alias matching,
  `loadoutUsesUnowned`, pool / preset / pinned filtering, Xarth search marking + only-owned + cache key, planner
  excludes items, drops pinned with notices, max plan never slower). `yarn test` 1298 (1290 pass / 8 skipped); lint, tsc
  clean.
- Playwright: new `scripts/verifyPhase26.mjs` all OK (add via quick-add + search box, greyed top row, only-owned,
  plan Excluded + max line, reload persists, Clear); screenshots `docs/screenshots/phase26-*.png`. verifyPhase23 /
  verifyPhase25 re-run OK, tracked screenshots restored.

## Phase 25 — Item data refresh: Maggot King items and the pool audit (2026-10-23)

- User report: "the Amulet of rupture isn't being used ... Seeking dragon arrows either". The item is the **Necklace of
  rupture** (33639, Maggot King's elder venator fang + anguish). Both it and **Seeking dragon arrow** (33595) were in
  `equipment.json` and modelled upstream (rupture: stats only; Seeking: `bow_t60` + accurate hits ≥ 3); only the
  best-setup pool lacked them. Maggot King's other unique, the **Crimson kisten**, is a damage-spec weapon (excluded,
  damage specs not modelled yet).
- **Pool audit** (new `src/lib/fracturedArchive/poolAudit.ts` + `poolAuditSources.ts`; `node scripts/auditPool.mjs
  [--all]`; Jest `PoolAudit.test.ts`): items that beat a frontier pool item on stats (per raid pool / style / slot; fired
  ammo per bow / crossbow) or whose name is checked in `PlayerVsNPCCalc.ts` / `BaseCalc.ts` / `Equipment.ts` (307
  names), minus pool / preset / spec members and `POOL_EXCLUDED` (25 grouped entries with reasons). It found exactly
  three gaps: Necklace of rupture, Seeking dragon arrow, **Elemental amulet** (+2 base max hit on elemental spells).
- Pools (every raid): ranged neck rupture + anguish; Twisted / Venator / Scorching bow fire Seeking dragon arrows or
  dragon arrows; magic neck Occult + Elemental amulet (kept for Harmonised / Kodai / Purging staff, + DHW in CoX).
  Presets: `MASORI_F` wears rupture, Twisted bow (Masori) fires Seeking dragon arrows (better in every case).
- Generator re-run (`generateEquipment.py`): no diff, 0 new images (clean; nothing new on the wiki since phase 7b).
- **`getCdnImage`** maps `%27` → `'` (the deployed site 307-redirects `%27`). Finding: our code never emitted `%27`
  (no encoding anywhere; browsers keep `'` literal in paths) — dev and production both request `Tumeken's%20shadow.png`
  → 200; the change guards pre-encoded names. Test in DeployEnv.test.ts.
- Numbers (defaults): Xarth overall top unchanged (Obligator 12.839 None / 13.917 Solo & Team). Ranged-only top
  10.012 → **10.430** (Ascension + rupture); Twisted bow 9.834 → **10.379** (Seeking + rupture). Magic-only top 6.291 →
  **6.633** (Harmonised + Elemental amulet, Team). All styles: rupture rows 7–9. Plan totals: FA 23:30.4 / ToA 14:20.2
  unchanged; **CoX 6:41.9 → 6:39.9**; **ToB 7:32.2 → 7:32.4**, 1 free slot (was 28/28; heuristic planner, the kit
  carries an Ascension + rupture switch). Re-pinned CrossRaid fast pins + HEADLINES, Search Jelly margin (> 0.3, was
  0.5), verifyPhase21 ToB 7:32.4 with 1 free slot.
- Tests: new `ItemRefresh.test.ts` (stats; Seeking +20 attack, roll 22256 vs 20116 by hand, min hit 3 distribution;
  rupture max hit 29 vs 28 by hand; Elemental amulet Fire Surge 29 vs Occult 28, Ice Barrage no bonus; pools, presets),
  `PoolAudit.test.ts` (6). `yarn test` 1281 (1273 pass / 8 skipped); lint, tsc clean.
- Playwright: new `scripts/verifyPhase25.mjs` all OK (Xarth rows, ranged / magic tops, Tumeken's shadow and '24-carat'
  sword images 200 with a literal `'`, no `%27`, no 307); verifyPhase13 / 23 / 21 re-run OK (21 with the new ToB pin), tracked screenshots
  restored. Screenshots `docs/screenshots/phase25-*.png`.
- Docs: BEST_SETUP *Pool audit*, DATA_SOURCES *Phase 25*, UNVERIFIED B16 (Elemental amulet + fragment stacking),
  UPSTREAM_MERGE (utils hook, new-items bullet), CLAUDE.md apostrophe note.

## Phase 24 — Spec-accuracy audit for ToA / CoX / ToB (2026-10-23)

- User report: "Kephri's Defence is insanely high; I never hit with Elder maul" while the drain line showed a high hit
  chance at raid level 500. **The model was right**: `specProfile()` is upstream's `getSpecCalc()`, which scales the
  monster and calls the same `getNPCDefenceRoll()` as a normal attack, so ToA's raid-level multiplier
  ((250 + level) / 250 on the defence roll), CoX party / CM Defence and ToB's per-mode monsters are all included. No fix
  needed. Table "Spec accuracy by raid" in docs/DATA_SOURCES.md.
- **Kephri (Shielded), 500, party 6, path 0**: Defence 80 / crush +100 (low); roll 14596 × 3 = 43788. Elder maul spec
  roll 59202 → **63.0%** per spec = `specProfile()` = calculator spec Accuracy 63.02%; normal maul attack 53.77%
  (calculator, same loadout); 87.7% at raid level 0, 80.3% at 150. Wiki Kephri page: Defence "can be lowered by a
  maximum of 20 ... minimum of 60, however ... reset for the final phase" → one landed maul reaches the floor (expected
  1.6 attempts; 4 attempts → 98%). Strategies: Elder maul "More consistent against Kephri ... one special attack is
  enough", bone dagger at high raid levels (guaranteed hit); it doesn't call drains a waste.
- Spot checks: CoX Tekton DWH party 6: Def 215 → 56.7%, CM Def 290 → 43.2%. ToB Verzik P2: Hard Mode has the same
  Defence 200 / bonuses as Normal (wiki) → 69.3% both (Entry Mode 88.0%); party size doesn't change it.
- **Drain line note** (new `drainLineNote`, drainLine.ts; `DrainLine.note`, shown under the line in DrainLineView):
  "drains unlikely to land here: 36% per spec" when a planned weapon lands < 40% (rounded), else "1 landed spec
  reaches the floor (Def 60); ≈ 1.6 specs on average, later ones add nothing" when one maul / DWH landing is enough
  (Kephri, Akkha, P3 Wardens). Ranking numbers unchanged (the Plan already uses the same drain states).
- Hit chance per spec verified for ToA / CoX / ToB drain lines, varying with raid level / CM / mode.
- ROADMAP: 24 → in review; future item "Damage specs vs drain value" (Voidwaker, Burning / Dragon claws, bone dagger).
  UNVERIFIED E10.
- Tests: new `src/tests/lib/raids/SpecAccuracy.test.ts` (13: Kephri hand computation at 0/150/500, normal vs spec,
  floor 60 and the drain-line note; Tekton CM vs normal and party 1; Verzik HM = NM, EM lower, party-independent;
  spec = normal roll × 1.25 consistency; note rules). `yarn test` 1248 pass / 8 skipped; lint, tsc clean.
- Playwright: new `scripts/verifyPhase24.mjs` all OK (Kephri Team/Solo 63% + floor note at 500, 80% at 150; Ba-Ba
  note; calculator 53.77% / 63.02%, rolls 47362 / 43788 via fixture `scripts/phase24-kephri-loadout.json`);
  screenshots `docs/screenshots/phase24-*.png`.

## Phase 23 fixes — review follow-ups (2026-10-23)

- **Fight length** for the Solo budget = hp ÷ (party size × best preset DPS) (was ÷ team-DPS multiplier: FA's ×1 timed
  a 6-man fight as you alone). `fightSecondsFrom` (bestSetup.ts); still per boss / phase, clamped 15–600 s. With the
  6-man defaults every FA fight is 15-79 s → 2 specs, so **Bork Solo is back to 2 maul specs, Def 195, top 10.327**
  (phase 23 had 168 s → 3 specs, 10.524); Xarth 34 s, top 13.917; a 2-man Ocellus P3 is 237 s → 3 specs.
- **Ayak ×0 (no energy)**: the Solo line keeps Ayak specs asked for that don't fit (greyed, `DrainLineItem.short`);
  the Ayak hint uses the fitted count.
- Wording: glossary "Players assumed at your DPS" (was "Team DPS ×") and "Fight length (computed)"; Advanced "Use the
  Defence floor when its chance is ≥ __%"; Tonalztics shown as specs (×4, "8 hits" in the tooltip); "77% land" under
  each icon (11 px); "team-only" → "needs teammates' specs" (`planLabelText`, display only).
- Calculator Max-drain buttons: every button labelled (Elder maul / DWH / BGS); accursed hit chance from the undrained
  monster. Stale RoutesView comment removed.
- verifyPhase17 / 21: plan-time checks relaxed to ≤ 60 s (shared machine).
- Tests: Phase23.test.ts 15 (party-size formula, multiplier ignored; clamp bounds: Jelly 15 s, 600 s, 90 s; Bork Solo
  28 s / 2 specs / Def 195 / top 10.327; Ayak ×0; Tonalztics as specs); Presets.test label text. `yarn test`, lint, tsc
  green; verifyPhase23 all OK.

## Phase 23 — Best-setup UI cleanup (2026-10-23)

- User feedback: too much on screen; "Fight length", "Floor at P", "Team DPS × 1 at party 6", the "LB" boxes and the
  Encounters tab unclear; drains should read like "[Elder maul icon] ×2, [Tonalztics icon] ×4". ROADMAP: *Round 3*
  (phases 23-28) + *Decisions (round 3)*.
- **Simple view** (BestSetup.tsx): raid scaling inputs, potions / Heart, Zeal + fragments (FA), "My specs" as icon
  toggles (Elder maul, DWH, BGS, Tonalztics, Ayak × N, Lightbearer) — 7 inputs + 5 toggles (was ~29 inputs). Reset and
  a "?" glossary (drains, floor, first round, hit chance, fight length, Team DPS ×, carriers). Every input has a tooltip.
- **Advanced** expander: team carriers (party size shared) with one "carriers use Lightbearer" toggle
  (`withCarrierLightbearer` / `carriersUseLightbearer`, presets.ts) instead of the per-weapon LB boxes; "Count the floor
  as reached when the first round's chance is ≥ 95%"; "Players assumed at your DPS when converting HP to time" (tooltip:
  FA 1 because its HP scaling is unknown, others = party size); "Spec energy goes first to"; the raid's time-model
  settings (new TimeSettingsBox.tsx, now driving the Plan tab).
- **Fight length input removed**: `BestSetupAssumptions.fightSeconds` is optional; undefined = `autoFightSeconds`
  (bestSetup.ts) = hp ÷ (best raid-preset DPS × team-DPS multiplier) on the undrained boss, rounded, clamped 15–600 s
  (90 s if nothing hits). Plan / time model pass their own lengths; the planner's fallback stays 90 s (headlines
  unchanged: FA 23:30.4, ToA 14:20.2 re-checked in the UI). **Solo numbers change** where the fight isn't ~90 s: FA
  Bork 168 s → 3 maul specs, Def 195 → 180, Solo top 10.327 → 10.524; Xarth 203 s (top unchanged 13.917); Ocellus
  P3 474 s → 4 specs; short fights (AG, Smorks, Moia, Dagon'hai) unchanged. Drain line shows "(fight ≈ N s → M specs)".
- **Drain line** (new drainLine.ts + DrainLineView.tsx; `DrainState.line`, `KitChoice.drainLine`): `[icon] ×N` per
  weapon (Tonalztics in hits, specs in the tooltip), hit % per spec under each icon, "→ Def · Magic def", long text as
  tooltip. In the Search plan panel + header, Summary cells, Plan per-phase rows (new Drains column) and the
  calculator's Max-drain buttons (FracturedArchiveDrainPresets.tsx; hit chances from the spec model).
- **Routes / Encounters tab merged into Plan**: Plan results show the route table for the planned kit (FA 8 routes,
  others 1) with per-encounter cells; RoutesView.tsx deleted (library `computeRouteComparison` kept). Tabs: Search ·
  Plan · Summary.
- **Search header**: two lines (drains + best preset; evaluations · time · TTK), "N weapons can't hit (show)" collapsed;
  carrier table collapsed.
- Tests: new `Phase23.test.ts` (11: computed fight length formula / override / Search uses it / Solo spec count
  follows TTK; Lightbearer toggle sets every carrier and the Team plan uses it; drain-line data for Team and Max-drain);
  `Presets.test.ts` updated (Solo plan at the computed length). `yarn test` 1232 pass / 8 skipped; lint, tsc clean.
- Playwright: new `scripts/verifyPhase23.mjs` all OK (7 inputs in the simple view; Advanced; no Fight length; tabs;
  Team line maul ×4 / Tonalztics ×8 / Ayak ×2 with hit %; Solo "fight ≈ 203 s → 3 specs"; Xarth None 12.839; FA Plan
  8 routes 23:30.4, ToA 1 route 14:20.2; Max-drain button icons); screenshots `docs/screenshots/phase23-*.png`.
  Ported to the new layout and re-run OK: verifyPhase13, 14, 16 (route table / settings via Plan + Advanced), 17, 18,
  19, 20 (Encounters via Plan), and the other existing scripts. verifyPhase17 / 21 fail only their "plan ≤ 30 s"
  timing checks (45-65 s today): the machine is slower right now — the slow CrossRaid FA headline takes 76 s on the
  pre-phase-23 code and 75 s with it (documented 25-32 s), so not a regression; all four headline totals still pass
  with `RUN_SLOW_TESTS=1`.
- Docs: BEST_SETUP *Layout and glossary (phase 23)*, assumptions / drain-state / Routes sections updated; README tabs;
  UNVERIFIED B10 (fight length).

## Fix: Saturated heart as pinned item (2026-10-23)

- User correction: "Nobody uses magic potions, they use Saturated heart instead." The magic boost is now a pinned item
  (1 slot for the whole raid, counted once, never worn), not a supply: the "Magic boost" supply type is gone. Hearts are
  pseudo items in the pinned list (`HEART_ITEMS` in planner.ts: Saturated / Imbued heart, ids −9001 / −9002).
- `planAssumptions(a, supplies, pinned)`: FA / ToB boost magic iff a heart is pinned (with that heart); ToA / CoX keep
  the raid potion (salts / Overload) for every style iff "Other" > 0, else only a pinned heart boosts magic.
- Default pinned lists: Saturated heart added for FA and ToB (ToB's 1 heart supply moved there); not for ToA / CoX.
- UI: Assumptions box magic selector reads "Heart" (Saturated / Imbued) in FA / ToB; the Plan's pinned heart follows it;
  "+ Saturated heart / + Imbued heart" when removed. Unused-supplies warning never lists the heart; unused-pinned lists
  it only when the kit has no magic loadout. Search / Summary assume the heart (unchanged).
- New plan headlines: **FA 23:30.4**, 0 free (worn Tumeken's shadow switch +6 on Inquisitor's + Obligator, switch
  Inquisitor's + Obligator; was 23:18.8 unboosted without the heart's slot). **ToB 7:32.2**, 0 free (unchanged).
- Tests: new `Heart.test.ts` (9); Planner / Phase21 / CrossRaid updated (slow FA headline re-pinned, all four pass).
  `scripts/verifyHeartFix.mjs` all OK (screenshots `docs/screenshots/fix-heart-*.png`; plan Shadow 8.374 DPS = the
  calculator after Load worn, Magic 112); verifyPhase17 / 21 updated and OK, tracked screenshots restored.

## Phase 22 — Final review, round 2 (2026-10-23)

- Cross-cutting pass over `src/lib/raids/**`, the planner / time model and the round-2 upstream hooks (ToA prayers,
  CoX Olm melee, ToB nylocas / Dawnbringer, Moia reach): the hooks only fire for their own id lists; shared code has no
  raid branches. Fixes:
  - `plan()` / `computeRouteComparison()` defaulted to the FA time model, so a caller that forgot the model would time
    ToA / CoX / ToB with FA encounters: new `assertTimeModelForRaid` (raidTime.ts) throws on a mismatch.
  - ToA / CoX / ToB default assumptions shared the FA `mySpecs` / `team` objects by reference: now copies.
  - Stale UI tooltips (Team DPS default lists ToB; fight length = Search / Summary budget) and docs (ToA Plan supplies,
    Plan time settings per raid, raid tabs, FA Defence-not-scaling note, dev images, Ayak spec count, spec misses).
- New `src/tests/lib/raids/CrossRaid.test.ts` (22 tests): per-raid defaults and no leaks (FA → ToA → FA round trip),
  monster inputs stay in their raid, model guard; every target of every raid in every phase builds, evaluates a preset
  per style and has a drain model; every raid's plan on a reduced pool; per-encounter times of a fixed preset kit
  pinned per raid (fast); the four headline totals (FA 23:18.8, ToA 14:20.2, CoX 6:41.9, ToB 7:32.2) all reproduced in
  Jest, gated by `RUN_SLOW_TESTS=1` (~2 min).
- Docs: UNVERIFIED.md covers all four raids + the planner (new A11 FA Defence vs party size, D15 no resupply, D16
  team-DPS multiplier, D17 carriers per raid; B10 / C1 widened; *How to record results*); UPSTREAM_MERGE.md round-2
  totals (20 upstream src files, +320 / −26; worker.ts back to upstream), fix claims re-checked, two upstream spell /
  staff typos recorded (not fixed); README features (4 raids, Search / Plan / Routes / Summary, drain states, time
  convention, limitations); ROADMAP 13-22 done + *Future work (round 3)*.
- Verify scripts 13-21 all OK against the dev server (21 re-run after a hot reload mid-run); tracked screenshots
  restored. `yarn test` 1212 pass / 8 skipped; lint, tsc clean.

## Phase 21 fixes — review follow-ups (2026-10-23)

- The plan no longer swaps a loadout for a cheaper one (it raised ToB 7:32.2 → 7:34.1 to free 3 unused slots):
  `optimiseKit`'s prune step only drops (≥ max(1 s, 1 s per slot)); new `lightenKit` runs the swaps once on the chosen kit
  and, when it frees ≥ 1 slot, the plan lists it first under Alternatives as "Lighter kit: … −N slots for +X.X s".
- Prune is skipped for a kit whose time is ∞ (no cutting to one loadout); the raid-weapon switch label says when the
  variant also takes ammo / a shield or drops the shield.
- `verifyPhase20.mjs`: 17 ToB targets in Normal mode (20 in Hard Mode); `verifyPhase21.mjs`: ToB 7:32.2 at 28/28 + the
  lighter-kit alternative.
- Docs: BEST_SETUP effect table (ToB 7:32.2, 28/28; lighter kit −3 slots for +1.9 s), UNVERIFIED D13, G12 (you hold the
  staff; a teammate holding it makes the saving an overstatement).
- Tests: Phase21.test.ts 23 (lighter-kit swap, ∞ guard; Dawnbringer loadout check relaxed to the staff being free).
  `yarn test` 1194 pass / 4 skipped; lint, tsc clean; verifyPhase17–21 all OK.
- Totals (Team, defaults): FA 23:18.8, ToA 14:20.2, CoX 6:41.9, ToB 7:32.2.

## Phase 21 — Planner for ToA / CoX / ToB: per-raid defaults, raid items, dedupe (2026-10-23)

- **Per-raid Plan defaults** (new `src/lib/raids/planDefaults.ts`, `RaidBase.planDefaults`; `DEFAULT_PINNED_NAMES` /
  `DEFAULT_SUPPLIES` in planner.ts are now FA's aliases, `raid.defaultSupplies` = `planDefaults.supplies`): FA unchanged
  (user's kit); ToA Lightbearer + Zaryte crossbow, 6 restore + 2 Other (salts) — Strategies max inventory, Helpful
  Spirit supplies; CoX Dragon pickaxe + Elder maul, 2 brew / 2 restore / 1 Other (Overload) — potions made in the raid;
  ToB Elder maul, 4 brew / 3 restore / 1 ranging / 1 super combat / 1 heart (chests top up; documented, not modelled);
  rune pouch everywhere. PlanView loads them per raid (+ "Raid items (0 slots)" note, per-loadout "+N slots, saves X s").
- **Raid-supplied items** (`planDefaults.raidSupplied`, ToB: Dawnbringer): 0 slots in `kitSlotUsage` / `optimiseKit` /
  `inventoryGrid` (left out of the carried union, still in a loadout's size); the raid weapon is a partner like a
  carried weapon and, weapon only, goes on every full candidate of another style.
- **Single-piece swaps**: base + one piece of another loadout with the same weapon (e.g. Oathplate + Scythe + Salve (ei)).
- **Dedupe rule** (`SWITCH_MIN_SAVING_SECONDS` = 1, `SWITCH_MIN_SECONDS_PER_SLOT` = 1): the optimiser's prune step drops a
  kit loadout saving < max(1 s, 1 s × its slots) and swaps one for a cheaper same-style candidate when its extra slots
  bought < 1 s each; `PlanResult.kitMarginal`; "why" list marks fitting additions that miss the rule.
- **ToB**: Dawnbringer spec count = 2 × the team-DPS multiplier (was × party size), time = specs × 2.4 ÷ the same
  multiplier (default unchanged); Prinkipas targets only in the Search list in Hard Mode (`BestSetupTarget.tobModes`,
  `RaidBase.targetVisible`, `visibleTargets`; a hidden pick falls back to the first target; Summary / time model unchanged).
- Docs: BEST_SETUP *Per-raid defaults, raid items and the dedupe rule* (table with sources, ToB supply chests, effect
  per raid); UPSTREAM_MERGE *Fixes worth sending upstream* (ToB ids, Olm melee mitigation, Moon / Staff of the Dead
  renames, generator UTF-8); UNVERIFIED G2 updated, new D13 (dedupe threshold), D14 (defaults), G12 (Dawnbringer 0 slots).
- Tests: new `src/tests/lib/raids/Phase21.test.ts` (22: defaults per raid resolve / validate / FA aliases; raid items
  0 slots in accounting, grid and optimiser; dedupe 0-slot 0.2 s duplicate dropped, 1-slot 3 s kept, 2 slots for 1.5 s
  dropped / 2.5 s kept, cheaper-variant swap; Prinkipas visibility per mode; Dawnbringer specs at Team DPS × 1/2/3/4/5;
  reduced-pool ToB plan with a Dawnbringer loadout at +0 slots). Previous tests unchanged. `yarn test` 1193 pass /
  4 skipped; lint, tsc clean.
- Playwright: new `scripts/verifyPhase21.mjs` all OK — per-raid defaults in the inputs; plans FA 17.4 s, ToA 19.3,
  CoX 20.6, ToB 18.2 (≤ 30 s), 28 cells; every loadout obeys the rule; ToB one full Scythe set, Dawnbringer (Ancestral)
  at +0 slots, no Dawnbringer cell; Prinkipas only in Hard Mode. Screenshots `docs/screenshots/phase21-*.png`.
- Headlines (Team, defaults): FA **23:18.8** (unchanged); ToA 14:20.0 → **14:20.2** (Torva + Obligator, 0.2 s, dropped;
  4 free); CoX 6:59.9 → **6:41.9** (new supplies / pins; rule changes nothing); ToB 7:35.5 → **7:34.1** (Oathplate +
  Scythe worn; Dawnbringer (Ancestral) +0, Shadow, Oathplate + Salve, Ascension crossbows partial; 3 free; the three
  near-duplicate Scythe sets gone).

## Phase 20 — Theatre of Blood (2026-10-23)

- **Config**: `src/lib/raids/theatreOfBlood.ts` + `src/lib/raids/tob/{constants,targets,presets,searchPool,damage,time}.ts`;
  `THEATRE_OF_BLOOD_BASE` in base.ts (party 1-5, default 4; mode select Normal / Hard Mode / Entry Mode; Team carriers
  2 Elder maul + 2 BGS). Shared code stays raid-agnostic: `ScalingInputDef.kind: 'select'` + `options` (UI + Summary
  label), `RaidBase.resolveTarget` (ToB swaps the monster version per mode; used by `buildTargetMonster`),
  `assumptions.tob` / `RaidTimeAssumptions.tob`.
- **Scaling**: upstream's, hp only (75% at 1-3, 87.5% at 4, 100% at 5 — the wiki's numbers; Entry Mode its own table).
  Upstream missed the ids monsters.json uses for the Nylocas Vasilias (8354 / 10807 / 10786) and the melee Prinkipas
  (10803): added to `TOB_MONSTER_IDS` / `TOB_EM_MONSTER_IDS`, so the boss now scales (2187 hp at 4, was 2500).
- **Mechanics**: upstream already had Verzik P1's cap (min(hit, uniform 0..10 / 0..3)) + the Dawnbringer's exemption,
  Sotetseg floor 100, Verzik no drains. New: nylocas style gating (Vasilias form phase, wave nylocas, Prinkipas),
  Dawnbringer deals 0 off P1 and under the new P1 phase "Shield (Dawnbringer with a teammate)" (one staff), Bloat's
  drain reset (`tob-bloat-restored`, `noDrains`), Verzik `noDrains`; encounter model (Maiden 4 segments + leak heals,
  Bloat first down drained / rest restored, Vasilias equal time per form + HM Prinkipas, Sotetseg thirds re-drained,
  Xarpus 75 → 25% + P3, Verzik Dawnbringer specs + 1 holder / (team − 1) without + P2 + P3 (+30% HM)). Documented only:
  UNVERIFIED G1-G11 (cap model, heals, walks, waves, Matomenos hp conflict, Entry solo 20% vs 25%, …) and F9 (phase 19
  review leftover: Lizardman shaman count, table max 5 vs prose "capped at 4"; code follows the table).
- Tests: new `src/tests/lib/raids/ToB.test.ts` (22: hp at 4 / 5 / 1-3 with derivation, nylocas / Prinkipas vs the
  wiki's scale numbers, id fix, HM / EM versions, inputs, floors, drains, style gating, P1 cap (Scythe 30 = 3 × 10, Tbow
  / Shadow 3, Dawnbringer uncapped, accuracy 1), Dawnbringer off P1, Salve on Bloat, pool / presets, route order,
  plans at 4, HM / EM plans, settings, times with toy kits, required targets, searches on the Vasilias magic form and
  Verzik P1, reduced-pool planner). RaidConfig.test.ts: + 'tob'. `yarn test` 1171 pass / 4 skipped; lint, tsc clean.
- Playwright: new `scripts/verifyPhase20.mjs` all OK (4 raid tabs; party 4 / mode select / team ×4; 20 targets;
  Maiden 3062 → 3500 at 5; Xarpus 4375 / Def 250 → HM 5250 / 200; P1 max hits Scythe 30, Tbow 3, Shadow 3, Dawnbringer
  23; Vasilias magic form: Shadow on top, Scythe / Tbow can't hit; Encounters 6 encounters 7:27.7; Plan 16.3 s, 28
  cells; CoX Tekton 1200 / 215, ToA Zebak 8000, FA Xarth 12.839). `verifyPhase19.mjs` tab check relaxed for the 4th
  tab. Screenshots `docs/screenshots/phase20-*.png`.
- Headline (normal, 4-man, Team drains): Encounters 7:27.7; Plan 7:35.5 (Torva + Scythe worn; Scythe sets, Eye of
  Ayak and Ascension crossbows switches); same kit in Hard Mode 8:33.5 (docs/BEST_SETUP.md).

## Phase 19 — Chambers of Xeric (2026-10-23)

- **Config**: `src/lib/raids/chambersOfXeric.ts` + `src/lib/raids/cox/{constants,targets,presets,searchPool,damage,time}.ts`;
  `CHAMBERS_OF_XERIC_BASE` in base.ts (party 1-15, CM checkbox input, calculator CoX inputs, Overload (+), +1 BGS
  carrier). Shared code stays raid-agnostic: `ScalingInputDef.kind: 'bool'`, `BestSetupTarget.noDrains` (honoured by
  `buildTargetMonster`), `RaidConfig.presetsNote`, `assumptions.cox` / `RaidTimeAssumptions.cox`, Team DPS × max = the
  raid's party max, "—" for an encounter with no phases, Search shows the scaled Defence next to the hp.
- **Scaling**: upstream's (hp and Defence scale with party; CM; verified by upstream tests). No `Chambers_of_Xeric/Scaling`
  wiki page exists (404); cited the raid / Strategies / Challenge Mode pages instead.
- **Mechanics**: upstream already had Tekton ranged-immune / magic ÷5, crystal / portal / Vespula immunities, Olm
  magic / ranged mitigation, Guardians pickaxe-only + mining factor (+ hp), Ice demon ÷3. New: Olm melee ÷3 on the head
  and right claw (wiki "66% mitigation"; +5 lines in `PlayerVsNPCCalc`), Vanguard drains reset, Olm phase rule (3 + 1 per
  8 players), Mystic / shaman counts, encounter model with room checkboxes and heal / enrage settings. Documented only:
  Tekton guaranteed first spec / missed-spec drains, Olm clench / heals, lux grubs, Guardian hp formula disagreement
  (UNVERIFIED F1-F8).
- Tests: new `src/tests/lib/raids/CoX.test.ts` (23: hp / Def at 6 normal vs CM for Tekton, Vasa, Olm with hand
  derivations; every target's Defence scales; CoX inputs; party clamp / CM input; no floors; Guardians can't hit
  without a pickaxe; Olm dragon; Olm melee mitigation; immunities; Vanguard no-drains; pool / presets; Olm phases at
  1-16; room plans; settings; CM; team time; required targets; searches on Tekton / Olm head / Guardians; reduced-pool
  planner). RaidConfig.test.ts generalised for a third raid. `yarn test` 1143 pass / 4 skipped; lint, tsc clean.
- Playwright: new `scripts/verifyPhase19.mjs` all OK (3 raid tabs; CoX inputs; Tekton 1200 hp / Def 215 → CM 1800 /
  290; Guardians pickaxe on top, others can't hit; Encounters 10 encounters, Olm 3 × 2 claws + head, 15.9 s; Plan 20.8
  s, 28 cells; ToA Zebak 8000; FA Xarth 12.839 before / after). `verifyPhase18.mjs` tab check relaxed for the 3rd tab.
  Screenshots `docs/screenshots/phase19-*.png`.
- Headline (normal, 6-man, Team drains, all rooms): Encounters 6:25.6; Plan 6:59.9 (Inquisitor's + Scythe worn;
  Shadow, Dragon pickaxe, Kodai, Ascension crossbows switches); same kit in CM 9:12.5 (docs/BEST_SETUP.md).

## Phase 18 fixes — review follow-ups (2026-10-23)

- No raid branches in shared code: new `src/lib/raids/base.ts` (`RaidBase`: targets, party-size range, `monsterInputs`,
  scaling inputs with their own get / set, default assumptions, presets, pool, `hpScalesWithParty`,
  `boostsNeedSupplies`), looked up by `assumptions.raid` / `target.raid` in bestSetup (party clamp + inputs), search,
  raidTime, planner (`planAssumptions`). `RaidConfig` extends it (time model, own settings object + `timeSettingFields`
  / `timeModelNote`, default supplies, Plan note); RoutesView renders the settings box from the fields (FA field ids
  unchanged), PlanView takes supplies / note from the config. FA targets moved to `fracturedArchive/targets.ts`
  (re-exported). Removed `raids/data.ts`, `RaidTimeSettings.toa` (ToA's settings are their own object),
  `P2_WARDEN_ACTIVE_IDS` (upstream `P2_WARDEN_IDS`), `'toaPath.'` key parsing.
- Team-DPS multiplier (`teamDpsMultiplier`, assumptions box "Team DPS ×", "auto" reset): default party size where hp
  scales with party (ToA), 1 for FA; used by every time model (`RaidTimeAssumptions.dpsMultiplier`; Ocellus P2 keeps
  its wall-clock length) and the Search TTK; Search, Routes / Encounters, Plan headline, Summary and footer carry
  "times assume N players at your DPS" / "your DPS alone".
- Akkha: rotation by time ("six auto-attacks followed by a special attack") — equal time under each prayer, hp in
  proportion to the kit's DPS under each (`akkhaRotation`).
- Summary: scaled hp per row; header lists the raid inputs and the team label.
- Docs: UNVERIFIED E3 (Kephri page "two phases of shields" vs Strategies "third shield"; Strategies followed), E4
  (rotation quote), E6, new E8 (Zebak "Not Just a Head" heal not modelled) and E9 (drains don't carry across phases of
  one NPC); BEST_SETUP / DATA_SOURCES updated.
- Tests: RaidConfig.test.ts +2 (multiplier defaults 1 / party size, override, labels, `dpsMultiplier` in the time
  assumptions; raidBase = config), ToA.test.ts +2 (Akkha equal-time split 60/60/30 → 36.8 s each, 2208/2208/1104, a
  blocked prayer still costs its time; override 3 = twice the 6-player time). `yarn test` 1114 pass / 4 skipped; lint,
  tsc clean. Playwright: verifyPhase18 all OK (+ multiplier 1 / 6 and labels, Summary hp), verifyPhase13 and
  verifyPhase17 OK (FA plan still 23:18.8; their tracked screenshots restored).
- Headline changes: DPS unchanged; Akkha 138.1 → 137.5 s, Encounters 14:02.9 → 14:02.4, Plan 14:22.4 → 14:20.0 (same
  kit); Search TTK now shown for the team (Zebak 125.6 s at 6×, was 753.5 s solo).

## Phase 18 — Raid tabs + Tombs of Amascut (2026-10-23)

- **RaidConfig** (`src/lib/raids/`): `types.ts` (RaidId, BestSetupTarget moved here, ToA inputs / time settings,
  scaling-input defs), `index.ts` (`RaidConfig`: targets, scaling inputs, party range, default assumptions, presets,
  search pool, time model + default settings, routes label, encounter icons; `RAIDS`, `raidConfig`, input get/set),
  `fracturedArchive.ts` (points at the phase 8-17 objects, unchanged), `tombsOfAmascut.ts`, `data.ts` (per-raid
  presets / pool / targets for the pure modules). The raid is `assumptions.raid` (undefined = FA), so caches, worker
  requests and modules follow it. Moved behind the config: `findTarget` (all raids), `buildTargetMonster` (ToA inputs,
  party 1-8), `summaryQueries(targets)`, search presets / pool, `raidTime` (`RaidTimeModel`: route slots, labels,
  `encounterPass`, `requiredPhaseTargets`; `FA_TIME_MODEL`; `routesFor`; exported `phaseTime` with a team-DPS factor;
  `targetHp` takes raid inputs), planner (`tuning.model`, raid presets; ToA supplies keep salts). FA behaviour and
  tests unchanged (1061 → 1061 pass before the new tests).
- **ToA** (`src/lib/raids/toa/`): 15 targets (Kephri Shielded / Unshielded, 3 overlord scarabs, Zebak, Akkha with prayer
  phases, Akkha's Shadow, Ba-Ba, Obelisk, Elidinis' / Tumeken's P2, core, P3, P3 enraged); presets = FA list + fang /
  Keris partisan of breaching / Ghrazi rapier (Torva); pool + Keris partisans of breaching / amascut, Blade of Saeldor
  (c), Eye of Ayak; defaults raid level 500, path 0, party 6, Smelling salts. Upstream already models hp / defence-roll
  scaling, floors, weaknesses, shadow ×4, fang, kerises, P2 damage and always-max core; new: Akkha / P2 Warden
  prayers (`prayers.ts`; phase options registered in `constants.ts` +4, hooks `PlayerVsNPCCalc` +4, `BaseCalc` +4;
  defaults block nothing, so the calculator and upstream's tests are unchanged) and the encounter model (`time.ts`:
  Kephri 3 shields + scarabs + hp; Akkha thirds over his prayers + 4 shadows + 20% final stand in melee; Wardens
  obelisk, P2 downs (shield, then 21/29/37-tick core windows at ×5), P3 95% + 25% enraged; time = damage ÷ (party ×
  DPS)). Mechanic table with wiki quotes: DATA_SOURCES.md *Tombs of Amascut*; UNVERIFIED.md group E.
- **UI**: raid tabs (Fractured Archive / Tombs of Amascut) in the header; each raid keeps its own assumptions; ToA
  "Raid scaling" row (party, raid level, four path levels), Zeal / fragments hidden; boss hp shown next to the boss
  select; routes tab = "Encounters" (one route, breakdown open, ToA time settings box: P2 warden, Akkha prayer rotation,
  Kephri scarabs / swarm leak, P3 siphons); Summary cache per raid; Plan with ToA supplies. Worker passes the raid's
  time model.
- Tests: new `src/tests/lib/raids/RaidConfig.test.ts` (19: targets resolve to monsters with cdn images, unique keys,
  phases, input defaults / clamping, routes 8 / 1, required phase targets belong to the raid, presets / pool items,
  FA config = phase 8-17 objects, ToA defaults and inputs) and `ToA.test.ts` (30: hp at 500 / 6 / 0 for all 15
  targets = upstream scaleMonster, Akkha 400 → 5520 hand derivation, raid level 300 / path 2 / solo, defence-roll
  effect, floors, weaknesses, prayers incl. the warning, encounter sequences, P2 down maths, team-DPS time, ∞ without
  melee on Akkha, Zebak / Kephri searches, reduced-pool planner). `yarn test` 1110 pass / 4 skipped; `yarn lint`,
  `tsc --noEmit` clean.
- Playwright: new `scripts/verifyPhase18.mjs` all OK (raid tabs; FA Xarth None 12.839 before and after; ToA inputs
  500 / 0 / 6, salts, 15 targets; Zebak 8000 hp → search Ascension crossbows + diamond (e) 10.633, TTK 753.5 s; raid
  level 300 → 5870 hp, TTK 491.2 s; Encounters one route 14:02.9 in 13.9 s; Plan 14:22.4 in 19.1 s, 28 cells; Summary
  12 rows / 36 cells in 38 s). Screenshots `docs/screenshots/phase18-*.png`.
- Headline (raid level 500, 6-man, path 0, Team drains): top search per boss — Kephri Keris partisan of breaching
  9.520; Zebak Ascension crossbows + diamond (e) 10.633; Akkha Tumeken's shadow 13.020 (final stand Osmumten's fang
  9.035); Akkha's Shadow Ascension crossbows + onyx (e) 15.262; Ba-Ba Ascension crossbows + diamond (e) 9.441; Obelisk
  Shadow 13.002; P2 Shadow 14.167; core Scythe 31.333; P3 Shadow 12.493. Plan: worn Keris partisan of breaching
  (Torva) + switches Shadow (Ancestral), fang, Scythe, Obligator; 1 free slot; 14:22.4 (docs/BEST_SETUP.md).

## Phase 17 fixes — review follow-ups (2026-10-23)

- Solo drains: the matrix plans each encounter's drains with that encounter's undrained time with the best single
  preset / search loadout (`fixedFightSeconds` per encounter; extra undrained pass); the best 5 optimiser kits are
  re-timed exactly and the fastest wins. Bork + Smorks Solo 210.1 s (= exact; was 225.4 s at a fixed 90 s).
- Supplies → DPS: new Magic boost (Saturated heart) supply (default 0); a style with 0 of its potion is evaluated
  without it (`planAssumptions`, `BestSetupAssumptions.withoutPotion` in `applyLoadoutToPlayer`; spec players keep the
  potion).
- UX: warnings with one-click fixes for unused potion supplies ("Drop them (+N slots)") and always-brought items in no
  loadout ("Remove these to free N slots"); note that spec weapons come from "My specs"; "avg DPS (time-weighted)".
- Tests: Planner.test.ts +3 (Solo matrix DPS within 1% of exact on Bork / Smorks, potion-less styles + unchanged drains,
  unused supplies reported). `yarn test` 1061 pass / 4 skipped; lint, tsc clean. verifyPhase17.mjs all OK (+ label,
  note, one-click remove; 16.1 s first run). Screenshots re-shot, + `phase17-unpinned.png`.
- New default headline (no magic boost by default): worn Ascension crossbows partial switch over Inquisitor's +
  Obligator, switch Inquisitor's + Obligator, 0 free, AG → Bork + Smorks → Moia → Xarth → Ocellus 23:18.8; removing
  the 5 unused pinned items → 21:50.1 with Twisted bow added (docs/BEST_SETUP.md, *Plan tab*).

## Phase 17 — Raid plan tab: kit planner (2026-10-23)

- New `src/lib/fracturedArchive/planner.ts` (pure): phase targets recorded from `compareRoutes`; per-phase searches
  (top 3 weapons × 2 loadouts per style) + presets → full candidates; partial switches (base A + partner B's weapon set +
  its k best pieces, carried pieces first; best 2 bases / 2 partners per style + every carried weapon's best loadout);
  DPS matrix (candidates × phases, drains at the fixed fight length — new `RaidTimeAssumptions.fixedFightSeconds`,
  exact for Team / None); slot accounting `kitSlotUsage` (|loadout items ∪ pinned ∪ spec weapons| − smallest loadout +
  supplies + non-items ≤ 28); `optimiseKit` (20 seeds × ratio / absolute greedy + drop / swap local search,
  deterministic); exact times via `createKitEvaluator` + `compareRoutes`; worn set = loadout of the route's first
  phase; `inventoryGrid` (4×7); why list (additions that don't fit, best kit per other style mix); unused carried items.
  Caps in `PLAN_DEFAULTS` (default plan: 243 candidates = 12 presets + 45 search rows + 186 partials; cap 600 unused).
- Worker: `WorkerRequestType.RAID_PLAN` in the search worker (progress + cancel by terminate), `startRaidPlan` client.
  Upstream edit: `CalcWorkerTypes.ts` +19 (UPSTREAM_MERGE.md updated).
- UI: "Plan" tab, second (Search, Plan, Routes, Summary): drain buttons, "Assumptions (plan)" box (route / compare all,
  supply counts with icons, rune pouch / non-items, pinned items with the calculator's item search), progress + Cancel,
  free-slot badge, worn set in the calculator's grid layout, 4×7 inventory grid (icons, tooltips, style borders), kit
  loadouts, per-encounter table with phase rows, route table, why list, stats; "Load worn set into calculator", "Load
  all loadouts" (new `openLoadoutsInCalculator`). Search rows cached per session.
- Phase 16 leftovers: Routes kit tooltip says the per-phase search kit is an upper bound; UNVERIFIED D7 notes a
  melee-only kit shows ∞ on Ocellus (worse Deflect) though in-game you can wait it out. New D10–D12 (switching free,
  slot model, candidate pool).
- Tests: new `Planner.test.ts` (16): union / pinned / supplies / swap-space accounting, free never negative, grid order
  and count = accounting; partial-switch items (two-handed drops the shield, carried first, k = 0..all); toy 2-phase /
  3-loadout optimum {A, C} = 30 s = brute force (first candidate alone is ∞, so a no-op fails); single loadout wins when
  switches don't fit (= brute force), 3-way when they do; determinism, cancellation (optimiser, before searches,
  during optimise); reduced-pool plan: ≤ 28 slots, 28 cells, worn = first-phase loadout, plan ≤ every single preset,
  inner-loop time = exact time (Team), cached rows → same plan, brews 40 → overfull single loadout.
  `yarn test` 1058 pass / 4 skipped; `yarn lint`, `tsc --noEmit` clean.
- Playwright: new `scripts/verifyPhase17.mjs` all OK (tab order, defaults, worn set + 28-cell grid with icons, free
  slots, 5 encounter rows, 8 routes; brews 6 → 10 re-runs (17 supply cells, switches shrink); "Load worn set" = 9.064 DPS
  in the calculator on the AG shield). First run 16.0 s in the browser (search 10.4, matrix 3.8, optimiser 0.2); re-run
  4.5 s. Screenshots `docs/screenshots/phase17-plan.png`, `-kit.png`, `-brews10.png`, `-loaded.png`.
- Headline (defaults: 6-man, Team, pinned items + supplies): worn Tumeken's shadow (Ancestral), switch Inquisitor's +
  Obligator (8 items), 0 free; AG → Bork + Smorks → Moia → Xarth → Ocellus 22:47.7. Rejected: + Twisted bow −46.0 s /
  +9 slots, + Ascension crossbows −30.8 s / +9; melee + ranged kit +31.1 s. Without the 2 Ranging potions: Twisted bow
  worn + Inquisitor's + Obligator 22:02.4 (docs/BEST_SETUP.md, *Plan tab*).

## Phase 16 — Raid time model + route comparison (2026-10-23)

- New `src/lib/fracturedArchive/raidTime.ts` (pure): `ROUTE_SLOTS` → `enumerateRoutes()` (8 routes), `encounterPlan`
  per encounter, `raidTime(route, kit, assumptions)`, `compareRoutes` (each encounter once; fastest = argmin),
  `RAID_TIME_DEFAULTS` (AG shield 1490 @ 6-scale at Flying DPS, 70% grounded / 30% flying; Bork 4 quarters at armour
  8/10/12/14 + stun uptime 0 + Smorks 600; Ezekiel 3000, Moia 785, Dreadnoth 2100, Xarth 2600, Dagon'hai 3207;
  Ocellus P1 2500 (walking 0), P2 length 0 with 50% carry-over, P3 25% last quadrant at the Deflect that blocks the
  kit's best style). Drains per encounter: a first pass without drains gives the fight length for the drain planner,
  then one drained pass. HP via the calculator's party scaling (`partyHpFactor` hook; AG shield relative to 6).
  Real kit: `createKitEvaluator` (memoised per loadout × style × target × phase × drain reductions) over preset,
  per-phase search-row and calculator-loadout members; `computeRouteComparison` runs the per-phase searches.
- Worker: `WorkerRequestType.RAID_ROUTES` in the search worker (progress + cancel by terminate),
  `startRouteComparison` client. Upstream edit: `CalcWorkerTypes.ts` +21 (UPSTREAM_MERGE.md updated).
- UI: "Routes" tab on `/best-setup` (`RoutesView.tsx`): drain buttons, "Assumptions (time model)" box (7 settings),
  kit = best search result per style (default melee + ranged + magic) / presets / current calculator loadouts; table
  of the 8 routes with total and per-encounter seconds, fastest highlighted, "+" for the per-phase breakdown. Session
  cache of the searches, so a setting change only re-times.
- Tests: new `RaidTime.test.ts` (18): 8 routes with the right members, hp figures, hand-computed seconds for every
  encounter (Bork quarters 375/DPS8 + … + 600/DPS Smorks, stun share, AG split, Dagon'hai 3207, Ocellus P2 carry-over
  5250 − 150, last-quadrant deflect choice), infinite time when nothing hits, drains planned with each encounter's
  first-pass length, route total = Σ encounters and argmin, monotonicity (better DPS never slower; a bigger kit never
  slower; Team never slower than None), party-size hook, real preset kit = direct `evaluateLoadout`, cached search rows
  and calculator loadouts. `yarn test` 1042 pass / 4 skipped; `yarn lint`, `tsc --noEmit` clean.
- Playwright: new `scripts/verifyPhase16.mjs` all OK (8 routes, one fastest = lowest total, per-phase rows on expand,
  Bork stun 30% → Bork + Smorks 195.9 → 178.3 s with AG unchanged; first run 16 searches in ~10 s). Screenshots
  `docs/screenshots/phase16-routes.png`, `-expanded.png`, `-bork-stun.png`.
- Headline (default kit, Team drains, 6-man): fastest AG → Bork + Smorks → Moia → Xarth → Ocellus 21:49.5 (181.2 /
  195.9 / 72.0 / 186.8 / 673.5 s); all 8 between 21:49.5 and 23:43.1 (docs/BEST_SETUP.md, *Routes tab*).
- Unverified: UNVERIFIED.md group D (D1–D9) for every time-model assumption, with in-game checks.

## Phase 15 fixes — review follow-ups (2026-10-23)

- Docs only: Moia drain wording made precise (Max-drain buttons = 2 Tonalztics hits; Solo with the default Elder maul
  can't drain her; Team = 1 Tonalztics carrier, 99%); UNVERIFIED B15 (Dagon'hai drains shared / persist across
  gauge restores); DATA_SOURCES "Phase 16 inputs" HP-per-encounter table and ordering notes.
- `yarn test`, `yarn lint`, `tsc --noEmit` green.

## Phase 15 — Ezekiel, Moia, Dagon'hai Elder + Monks (2026-10-23)

- Wiki re-read (`?action=raw` + rendered, revision history): Ezekiel, Moia, Dagon'hai Elder / Monk, Undead binder,
  raid page, Strategies (*Layout*, *Ezekiel*, *Moia*, *Dagon'hai trio*, drain table), Demon (attribute) (unchanged
  since 20 Oct: Dreadnoth 25 / Xarth 80 / Ocellus 80 stay). Mechanic → model tables and the route structure in
  `docs/DATA_SOURCES.md` (*Phase 15*). All five monsters.json entries match the infoboxes field by field → generator
  not re-run.
- **Moia**: "too far to reach with melee or halberds" → `isOutOfMeleeReach` (`immunities.ts`), hooked into
  `PlayerVsNPCCalc.isImmune` (+3) with a weapon-slot warning in `BaseCalc` (+3) and a `cantHitReason`. Drain plans
  follow via `hittable.ts`: the Max-drain buttons fall back to 2 Tonalztics hits → 117 (= wiki table); the best-setup
  Solo plan with the default specs (Elder maul only) can't drain her (P(floor) 0%, Def 195), Team uses 1 Tonalztics
  carrier (99%). Air 80% via upstream.
- **Dagon'hai**: shared stats and health pool; shield gauge depleted 5×, then 7 hp. New `dagonhai.ts`: Phase dropdown
  on all six ids (`DAGONHAI_PHASES`: *Shielded (shield gauge)* default / *Unshielded (after the cauldron explodes,
  7 hp)*; hp only, no stat change on the wiki), chained last in `applyFracturedArchiveScaling`;
  `DAGONHAI_SHIELD_GAUGE_DEPLETIONS = 5`, `dagonhaiEncounterDamage(gauge)` = 5 × gauge + 7 for phase 16. Floor 0.
- **Ezekiel**: nothing beyond infobox (earth 25%) and floor 78; sword stun / heal, enrage, +3% spec per perfect dodge
  documented only.
- Best setup: targets `ezekiel` (after Bork), `moia` (after the Jelly), `dagonhai` (after Xarth; Elder stands for all
  three, Summary row = Shielded). Summary now 20 rows / 60 searches (SummaryView comment, BEST_SETUP.md,
  verifyBestSetup.mjs counts). Search spells: Earth Surge on Ezekiel, Wind Surge on Moia.
- Upstream edits: `PlayerVsNPCCalc.ts` +4/−1, `BaseCalc.ts` +4/−1, `constants.ts` +4/−2 (UPSTREAM_MERGE.md updated).
- Tests: new `EzekielMoiaDagonhai.test.ts` (28: infobox stats, no demonbane, weaknesses, Moia melee / halberd 0 + drain
  plan, Dagon'hai phases / hp / identical DPS / encounter damage, floors 78 / 117 / 0 via DWH / BGS / Elder maul with
  DPS, Max Melee + Inquisitor's mace and Max Mage + Shadow per boss with derivations, Summary rows, search runs per
  target). With the two modules disabled 6 fail. Presets.test.ts target list updated. `yarn test` 1024 pass / 4
  skipped; `yarn lint`, `tsc --noEmit` clean.
- Playwright: new `scripts/verifyPhase15.mjs` all OK (stat panels = wiki for Ezekiel, Moia, Elder, Monk staff / book;
  mace 58 / 9.802 Ezekiel, 0 Moia (+ warning), 58 / 10.024 Dagon'hai; Shadow 70 / 8.087, 9.479, 8.486 = Jest;
  Dagon'hai default Shielded, Unshielded same DPS). `verifyBestSetup.mjs` OK (20 rows, 60 cells in 55 s).
  Screenshots `docs/screenshots/phase15-*.png`, `phase13-summary.png` re-shot.
- Unverified (UNVERIFIED.md A10, B12–B14): Moia never in melee range; Dagon'hai 640 = one shared gauge × 5 (+ party
  scaling); no stat change on Ezekiel's stun / enrage; perfect-dodge energy not in the budget.

## Phase 14 fixes — review follow-ups (2026-10-23)

- ROADMAP round-2 decision: Solo = budget + carried weapons; Team computed from the carriers (floor when P ≥ 95%, else
  nearest reachable Defence to the expected value); default 6-man carriers maul 2 / Tonalztics 2 / Ayak 1.
- UI wording: "nearest reachable Defence to the expected value" (was "rounded up"). Team plans no longer carry a
  solo / team-only label (it summed all carriers as one player); Solo keeps it.
- Team text: expected attempts to the floor only when the first round reaches it with P ≥ threshold, else the
  whole-fight P(floor) (the capped count read as if the floor were reached).
- Docs: BEST_SETUP notes a single Ayak carrier won't reach 0 on high-magic-def bosses; DATA_SOURCES notes the wiki
  conflict on the Accursed sceptre (table "if damage is dealt" vs item page "regardless"; item page followed).
- `yarn test` 993 pass / 4 skipped, lint and tsc clean; verifyPhase14.mjs all OK.

## Phase 14 — Spec & drain model (2026-10-23)

- New `src/lib/fracturedArchive/specs.ts` (pure): `SPEC_WEAPONS` (Elder maul, DWH, BGS, Tonalztics, Eye of Ayak,
  Accursed sceptre: energy, modifiers, drain, when it lands, wiki URL, unverified notes), `specProfile(monster, weapon,
  player?)` → hit chance / expected damage / per-attempt outcome distribution from upstream's own spec calc
  (`getSpecCalc().getDistribution()`, preset armour of the style, Piety/Rigour/Augury + potions, best style),
  `drainModel`, `energyBudget` (100 + 10% per 30 s, per 15 s with Lightbearer — wiki), `planLabel`
  (solo / solo+lightbearer / team-only), `ayakExpectedDrain`.
- New `teamSpecs.ts` (pure, exact, no simulation): Defence-state convolution in upstream's drain order with upstream's
  rounding / floor; each state maps back to `defenceReductions` that reproduce it; Ayak P(magic def 0);
  `soloSpecPlan` (carried weapons within the user's budget, Defence first or Ayak first, never over budget),
  `teamSpecPlan` (carriers' first round + whole-fight expected attempts), `recommendCarriers` (fewest carriers for
  ≥ 95%, single weapon or hammer + finisher). Ranking rule: floor if P(floor) ≥ threshold, else the reachable Defence
  nearest the expected Defence; Ayak: 0 if P(0) ≥ threshold, else bonus − expected drain.
- `bestSetup.ts`: Solo / Team drain states use the planners (`DrainState.plan / pFloor / label`). Player assembly
  moved to `loadout.ts` (re-exported) to avoid an import cycle. `presets.ts` assumptions: `soloAyakDamage` replaced by
  `mySpecs`, `team`, `fightSeconds` (90), `floorThreshold` (0.95); party size default 2 → 6. Max-drain buttons unchanged.
- UI: Assumptions box "My specs" (weapons, Ayak × N with "≈ X magic def drained on <boss>", Lightbearer, energy
  priority), "Team" (party size, carriers + LB per weapon), fight length, threshold; new `SpecPlanPanel` under the
  selectors (plan text, P(floor), carrier table).
- Examples: 6-man Bork "1 Elder maul → 59%, 2 Elder maul → 96%"; The Smorks Solo (maul) "2× Elder maul → expected Def
  145 (floor 0 not reachable; best case Def 93) → ranked at Def 143", 6-man Smorks "4 Tonalztics → 84%, 5 → 98%".
  Ayak per spec: AG 73.1% × 27.0 = 19.7, Bork 75.9% × 26.5 = 20.1.
- Tests: new `Specs.test.ts` (14: maul / Ayak hand derivations vs AG and Bork incl. Confliction re-roll and Bork magic
  resistance, Tonalztics / BGS / can't-hit, budget, labels, Smorks partial drain, never over budget) and
  `TeamSpecs.test.ts` (20: 0.9728 binomial, Tonalztics 0.72, BGS 3/16, Ayak ¼, expected attempts 2.464, ranking,
  recommendation, states reproduce upstream Defence, party-size cap). Presets / Search tests updated for the new
  drain states. `yarn test` 993 pass / 4 skipped; `yarn lint`, `tsc --noEmit` clean.
- Playwright: new `scripts/verifyPhase14.mjs` all OK (inputs, Smorks Solo partial drain Def 143, Bork Team P 99.5% +
  recommendation, fewer carriers → lower P, Bork Team top row = calculator 10.524 / 50); `verifyPhase13.mjs` updated
  for the new Solo / Team lines; `verifyDrainPresets.mjs` passes unchanged. Screenshots `docs/screenshots/phase14-*.png`.
- Unverified (UNVERIFIED.md B10/B11): spec energy full at each boss, 90 s fight length, Elder maul on an accurate 0
  under Bork's flat armour; Tonalztics rounding (B1) unchanged. Hit chances are against the undrained boss
  (conservative for follow-up specs). BEST_SETUP results snapshot predates phase 14.

## Phase 13 fixes — review follow-ups (2026-10-23)

- Summary: assumption changes are debounced (`ASSUMPTION_DEBOUNCE_MS` = 500 ms) before the 51-search run restarts.
- Wording: SummaryView "51 searches", `styles.ts` no longer mentions Per boss; DATA_SOURCES notes that on Ocellus P3
  Deflect Melee, Accursed + 2 Tonalztics hits ties the 3-hit plan (100% energy, 3 actions), and the 3-hit plan wins
  only because it is checked first.
- Tests pin the plans exactly: P1 walking = 2 hits, P3 Deflect Melee = 3 hits (the accursed + 2 tie is checked too),
  AG Flying = 4 hits.
- Dev images: `.env.development` → `NEXT_PUBLIC_CDN_URL=https://dps.mxeaez.com/cdn`, so raid-4 icons load in dev
  (Search 119/119, Summary 588/588). A dev rewrite proxy was dropped: the deployed site redirects `%27` paths to a
  host-relative URL. Noted in CLAUDE.md.
- ROADMAP.md Round 2 section as rewritten by the orchestrator (phases 13–22), unchanged.
- `yarn test` 959 pass / 4 skipped, lint and `tsc --noEmit` clean; `verifyBestSetup.mjs` (Summary, 51 cells in 47 s)
  and `verifyBestSetupUx.mjs` all OK.

## Phase 13 — Round-2 fixes: drains that can hit, Team Ayak count, DPS column (2026-10-23)

- ROADMAP.md: Round 2 table (phases 13-20) and round-2 decisions.
- New `src/lib/fracturedArchive/hittable.ts`: `canStyleHit(monster, style)`, `canDrainToolHit`, `canWeaponHit`. No
  rules of its own: it runs upstream's `PlayerVsNPCCalc.isImmune` for a minimal 99s player holding the real weapon, so
  `flying`, Ocellus's prayers and the immunity lists apply.
- `drains.ts`: a plan only uses weapons that can hit in the selected version / phase. Tonalztics finisher only where
  ranged hits; when the named weapon can't hit, the cheapest plan among Tonalztics (+ optional Accursed sceptre,
  Defence part counts) is used. New `DrainPlan.weaponCanHit / specs / summary`, `describeDefenceDrains`,
  `drainWeaponCanHit`. AG Flying: 4× Tonalztics hits (2 specs) → Def 156 (= wiki table); Ocellus P1 walking: 2 hits →
  129; P3 Deflect Melee: 3 hits → 150; P3 Deflect Ranged: 2 Elder maul, no Tonalztics. Everything else unchanged.
- Calculator "Max drain" buttons: weapons that can't hit are greyed out / struck through, tooltip + a line naming the
  plan applied ("Melee can't hit here — buttons apply: 4× Tonalztics hits (2 specs) → Def 156").
- Best setup: Solo / Team drain lines use the real plan; Team shows "Ayak to 0 ≈ N specs (X dmg at 40/spec)" (no
  behaviour change; 8 on Bork, 10 on The Smorks). DPS cells in Search / Summary use the accent orange
  (`text-orange-400 dark:text-orange-300`) + semi-bold (`bestSetup/styles.ts`).
- Tests: Drains.test.ts (AG Flying no melee in any plan, 4 hits reach 156 and 3 don't; AG Grounded melee; Ocellus P1
  walking / P3 Deflect Melee no melee; Deflect Ranged no Tonalztics; non-raid unaffected; summaries), Presets.test.ts
  and CrossCutting.test.ts updated; Search.test.ts: summary queries + cache key. `yarn test` 959 pass / 4 skipped;
  `yarn lint`, `tsc --noEmit` clean.
- Playwright: new `scripts/verifyPhase13.mjs` all OK (AG Flying Solo drain line = Tonalztics, no "Elder maul"; AG
  Grounded Solo = Elder maul; Team Ayak count; Search DPS cells orange; no Per boss tab; calculator buttons greyed with
  fallback line). `verifyDrainPresets.mjs` updated (AG Flying inputs 0/0/4/130, DPS unchanged 7.424) and passes.
  Screenshots `docs/screenshots/phase13-*.png`.
- **Per boss tab removed** (user decision): BossView / preset-row UI, the calc-worker `BEST_SETUP` request + handler
  (worker.ts back to upstream) deleted. Presets kept as search seeds and the "vs best preset" reference;
  `computeBestSetup` stays as tested library code.
- **Summary is search-based** (`SummaryView.tsx`): top search result for 17 boss/phase rows × None/Solo/Team = 51
  searches, run sequentially in the search worker on opening the tab, progress bar, Cancel / Continue, in-memory session
  cache keyed by assumptions (`summarySearchQueries`, `searchCacheKey` in `search.ts`, tested). Compact cells: weapon line
  + 16 px loadout icon strip, orange DPS + style, best-preset DPS, load link, drain plan; boss icon per row.
  `ItemIcons` got optional icon sizes.
- Scripts: `verifyBestSetup.mjs` rewritten for the Summary, all OK (17 rows, 51 cells in 51 s, Cancel/Continue, cache kept on tab switch, 467/588 icons loaded in dev — the rest are raid-4 images missing from upstream's dev CDN, AG Flying cells use Tonalztics, Xarth Team cell loaded = 13.917 in the calculator); `verifyBestSetupUx.mjs` and
  `verifyPhase13.mjs` no longer click Per boss.
- Unverified: whether Ocellus's Defence resets between P3 quadrants (plans are per phase).

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
