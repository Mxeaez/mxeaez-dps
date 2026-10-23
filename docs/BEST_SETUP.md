# Best setup view (phase 8; Search tab phase 9; default tab + icons phase 12; search-based Summary phase 13; spec & drain model phase 14; Routes tab phase 16; Plan tab phase 17)

`/best-setup` (dev: http://localhost:3001/osrs-dps/best-setup; "Best setup" button in the top bar, "Calculator" leads
back). Tabs, in order: **Search** (the default, phase 9/12, see the end of this file) searches a pool of end-game items
per slot for setups no preset has and runs automatically; **Plan** (phase 17, see *Plan tab* below) finds the worn set
+ switch items that minimise the route time within 28 inventory slots; **Routes** (phase 16, see *Routes tab* below)
compares the DPS-only clear time of the 8 raid routes for a kit; **Summary** (phase 13) shows the top search result for
every boss/phase. Search, Plan and Routes take the drain state (None / Solo / Team). The page always opens on Search (the last-used tab is deliberately not
remembered).

**Phase 13: "Per boss" removed.** The phase 8 preset ranking tab is gone (UI code, the calc-worker `BEST_SETUP`
request and its handler deleted). The presets stay: they seed the search and give the "vs best preset" column / the
Summary's "best preset" reference; `computeBestSetup` / `evaluatePreset` stay as tested library code
(`Presets.test.ts`).

## Plan tab (phase 17: raid kit planner)

Code: `src/lib/fracturedArchive/planner.ts` (pure, tested in `src/tests/lib/fracturedArchive/Planner.test.ts`); UI
`src/app/components/bestSetup/PlanView.tsx`; runs in the search worker (`WorkerRequestType.RAID_PLAN`, `plan()`),
progress bar + **Cancel** (terminates the worker). Runs on opening the tab and again 500 ms after any input change;
"Run again" re-runs. The per-phase search rows are cached in memory for the session (per assumptions + drain + phase),
so a change of supplies / items / route skips the searches.

**Inputs.** From the boxes above the tabs: party size (default 6), drain state (default Team), spec weapons ("My
specs": Elder maul, DWH, BGS, Tonalztics when ticked, Eye of Ayak when its count > 0 — each takes a slot). In the tab's
"Assumptions (plan)" box: **Route** — one of the 8, or *Compare all* (default: plan for the fastest route; the route
table then shows the other routes' times with the same kit); **Supplies** as slot counts (default Saradomin brew 6,
Super restore 4, Ranging potion 2, Super combat 1, food 0, other 0); **Rune pouch / other non-items** (default 1);
**Items I always bring** (default Lightbearer, Elder maul, Zaryte crossbow, Kodai wand, Ancestral robe top, Elidinis'
ward (f); editable with the calculator's item search; each takes a slot unless a kit loadout wears it, and any loadout
may use them for free). Time-model settings are the Routes tab defaults (`RAID_TIME_DEFAULTS`). DPS always assumes the
potions in the Assumptions box, whatever the supply counts say.

**Algorithm** (`plan(inputs, tuning?, hooks?)`; `PLAN_DEFAULTS` holds the caps):

1. *Phase targets*: the (target, phase) pairs the time model queries for the route(s) (16 for compare-all; recorded by
   running `compareRoutes` with a recording kit). One all-style gear search per phase (`runGearSearch`, top 80 rows),
   keeping per style group the best `perGroupWeapons` = 3 weapons and up to `perWeapon` = 2 distinct loadouts each.
2. *Candidates*: those rows + every preset, merged when items and style group are equal (style options are unioned).
   *Partial switches*: for each base A (the best `bases` = 2 per style by Σ DPS ÷ best DPS over the phases) and partner
   B of another style (the best `partners` = 2 per style, plus the best loadout of every carried weapon, e.g. Kodai):
   A with B's weapon (+ B's ammo; B's shield, or none if two-handed; A's shield otherwise) and B's k best other pieces,
   k = 0..all, pieces ranked by the DPS each adds on B's best phase (where B is closest to the best candidate), carried
   pieces first (they're free). Cap `maxCandidates` = 600 (cheapest switches kept first); the default plan has 243
   candidates (12 presets, 45 search rows, 186 partial switches), so the cap doesn't bite.
3. *DPS matrix*: every candidate × phase target under the drain state, evaluated once (best style option; can't hit or
   an error → 0). Drains are planned at the fixed fight length (`fightSeconds`, 90 s): exact for Team and None (the Team
   plan uses the carriers' first round, which doesn't depend on the length), an approximation for Solo
   (`RaidTimeAssumptions.fixedFightSeconds`, added to raidTime.ts for this).
4. *Slot cost*: inventory = |items of all kit loadouts ∪ pinned ∪ spec weapons| − fewest items of any kit loadout (the
   most the bag ever holds: while wearing the smallest loadout; the difference to the worn set is shown as "swap
   space") + supplies + non-items; must be ≤ 28. Shared items count once. The cost doesn't depend on which loadout is
   worn, so the **worn set is the loadout used on the route's first phase** (the AG shield; saves a switch).
5. *Optimiser* (`optimiseKit`): seeds = the 20 best single loadouts by their own route time (+ the best of each style);
   from each, two greedy passes (add the loadout with the best Δtime ÷ Δslots; add the one with the best Δtime) while
   one fits and helps, then local search (drop a loadout that doesn't help; swap one for any candidate) until stable.
   Best kit: lowest time, then fewest slots, then fewest loadouts. Deterministic. The kit's times are then recomputed
   with `createKitEvaluator` + `compareRoutes` (the Routes tab's code); that's what the tab shows.
6. *Why*: every candidate that would make the route faster if added (none fits, otherwise the optimiser would have
   added it), top 3 by Δtime with their Δslots; and the best kit of every other style mix (optimised over that mix's
   candidates only; a style the optimiser left out is forced in with its best addition).

**Output.** Free-slot badge; worn set (laid out like the calculator's equipment grid); 4×7 inventory (supplies, switch
items grouped by style with a coloured border — melee red, ranged green, magic blue —, spec weapons, pinned items, rune
pouch / other, swap space, free; icons + tooltips; brews / restores / food get a generic potion icon, Ranging / Super
combat upstream's potion images); kit loadouts with icon rows and where each came from; the per-encounter table
(loadouts and styles used, damage ÷ seconds, seconds; phase rows under each); the route table; the why list; run
statistics. "Load worn set into calculator" opens the calculator with the worn set against the route's first phase
(drains as planned; its DPS = the first phase row, checked by `scripts/verifyPhase17.mjs`); "Load all loadouts" adds
one calculator loadout per kit loadout (or replaces the calculator's loadouts if they don't all fit in 6).

**Timings** (default pool and inputs): browser (headless Chromium, dev server) 16.0 s for the first run (16 searches
10.4 s, matrix of 8032 evaluations 3.8 s, optimiser 18 591 kits 0.2 s); a supplies / items / route change ~4.5 s
(cached searches; the matrix is rebuilt). Jest without coverage: 23.6 s. Within the 30 s target, so the caps stayed at
their defaults.

**Limits.** Switching is free and instant; supplies are never drunk down; every item is one slot (UNVERIFIED D10–D12).
Only the candidate pool above is searched (greedy + local search, not exhaustive; exhaustive on the toy cases in the
tests). The kit's DPS per phase is the best of its loadouts, so per-phase cherry-picking is limited to the kit.

**Headline** (defaults: 6-man, Team drains, the pinned items and supplies above, compare all; 2026-10-23,
`scripts/verifyPhase17.mjs`): worn **Tumeken's shadow (Ancestral preset)**; switch **Inquisitor's + Obligator**
(Inquisitor's great helm, hauberk, plateskirt, Obligator, Infernal cape, Amulet of rancour, Ferocious gloves, Ultor
ring; Rada's blessing and Avernic treads shared); **0 free slots** (13 supplies + rune pouch + 8 switch items + Elder
maul, Eye of Ayak, Lightbearer, Zaryte crossbow, Kodai wand, Elidinis' ward (f)); fastest route **AG → Bork + Smorks →
Moia → Xarth → Ocellus, 22:47.7** (AG 212.1 s, Bork + Smorks 195.9, Moia 77.1, Xarth 186.8, Ocellus 695.8). Phase
16's 21:49.5 is the upper bound with a different loadout on every phase. Rejected: adding Twisted bow (Masori) −46.0 s
but +9 slots; Ascension crossbows (diamond) −30.8 s, +9 slots; the best melee + ranged kit (Obligator + an Ascension
crossbows partial switch) +31.1 s at the same slots; magic only +578.7 s; melee only and ranged only can't finish
Ocellus's last quadrant in the model (UNVERIFIED D7). The Kodai wand and the ward are carried but unused. Brews 6 → 10:
the kit becomes two partial switches (Shadow + 5 Ancestral pieces over Torva + Obligator), 25:33.7. Without the 2
Ranging potions (unused by this kit) the planner fits Twisted bow (Masori) worn + Inquisitor's + Obligator: 22:02.4.

## Routes tab (phase 16: raid time model)

Code: `src/lib/fracturedArchive/raidTime.ts` (pure, tested in `src/tests/lib/fracturedArchive/RaidTime.test.ts`); UI
`src/app/components/bestSetup/RoutesView.tsx`; runs in the search worker (`WorkerRequestType.RAID_ROUTES`,
`computeRouteComparison`). It is the objective function for the phase 17 planner.

**API.** `raidTime(route, kit, assumptions, cache?) → RouteTime` and `compareRoutes(kit, assumptions) → { routes,
fastest }`, where a route comes from `enumerateRoutes()` (the cartesian product of `ROUTE_SLOTS`: AG; Ezekiel | Bork +
Smorks; Moia | Dreadnoth; Dagon'hai | Xarth; Ocellus → 8 routes), a kit is anything with `best(phaseQuery) →
{ loadout, style, dps, drain }` (the real one: `createKitEvaluator(loadouts, bestSetupAssumptions)`), and
`assumptions = { partySize, drain, settings, fallbackFightSeconds }` (`raidTimeAssumptionsFrom`). The result is per
route → per encounter → per phase: damage, chosen loadout + style, DPS, seconds; plus totals and the fastest route
(argmin; ties keep the first; −1 when no route is finite).

**Model.** Time = Σ over encounters and phases of damage ÷ DPS, with the kit's best loadout + style per phase (switching
is free). DPS time only: no puzzles, travel, boss invulnerability, healing or adds. A phase that nothing in the kit can
damage is infinite (shown ∞; e.g. a melee-only kit on the AG shield). Settings (`RAID_TIME_DEFAULTS`, editable in the
"Assumptions (time model)" box, all **unverified**, UNVERIFIED.md group D):

| Encounter | Phases (damage → DPS of) |
|---|---|
| Archive Guardian | flying shield `agShieldHp` 1490 (wiki "1490 health shield in 6-scale", scaled by the party-size table relative to 6) → Flying; 550 × `agGroundedFraction` 70% → Grounded; the remaining 30% → Flying (it flies permanently below 30%). The guardian charges that do ~40% of the shield are not counted (pessimistic) |
| Bork + Smorks | killed evenly: Bork's 1500 in four quarters at armour 8 / 10 / 12 / 14 (each × (1 − `borkStunUptime`)), + 1500 × `borkStunUptime` (default 0) at Stunned; Smorks 600 |
| Ezekiel / Moia / Dreadnoth / Xarth | 3000 / 785 / 2100 (jellies ignored) / 2600 |
| Dagon'hai trio | `dagonhaiEncounterDamage(640)` = 3207 at Shielded |
| Ocellus | P1 2500 × (1 − `ocellusWalkingFraction`, default 0) at a corner, the rest at Walking; P2 lasts `ocellusP2Seconds` (default 0 = ignored) and the damage dealt to the Blade in that time × `ocellusP2CarryOver` 50% comes off P3's 5250; P3 remainder × (1 − `ocellusLastQuadrantFraction` 25%) at Quadrants 1-3, the rest at the Deflect option that is worse for the kit (= the one blocking the kit's best style; for a magic-best kit, where magic is never deflected in our model, the lower of the two) |

- **Drains** (None / Solo / Team = the drain buttons above the tab): per encounter, a first pass without drains gives
  the encounter's time; that (rounded) is the fight length for `drainModel` / the Solo spec budget, and the encounter is
  evaluated again with that drain state (one fixed-point iteration). Team plans don't depend on the length (first
  round), Solo ones do (more energy in long fights). The second pass is shorter, so a Solo plan gets slightly more energy
  than the drained fight would give.
- **Party size**: every hp figure is the calculator's party-scaled hp (`FRACTURED_ARCHIVE_HP_SCALING`, identity today);
  the AG shield uses the same factor relative to 6 (`partyHpFactor`). Filling that table (phase 22) updates every time.
- **Kit** (UI): one or more of (a) the **best search result per style** (melee / ranged / magic ticked by default):
  one all-style gear search per phase target the model queries (16 at the default settings), under the selected drain
  state, keeping each style's best row; each row is offered on its own phase only, with its own style (an upper bound:
  a different loadout per phase); (b) **presets** (any of `presets.ts`, each tries its styles / spells per phase);
  (c) **current calculator loadouts** (read from the calculator's saved session; used as they are: own style, spell,
  prayers, potions; equipment bonuses recomputed per monster).
- **Cost**: evaluations are memoised per (loadout, style, target, phase, drain reductions), so the 8 routes share the
  8 encounters; the default kit needs ~90 evaluations after the searches. Searches are cached in memory per
  assumptions + drain + phase, so a time-model setting or kit change only re-times (about a second); the first run
  takes ~10–15 s (16 searches). Changes are debounced (500 ms); **Cancel** stops the run.
- **Table**: the 8 routes with total (m:ss.s) and per-encounter seconds (boss icons), the fastest highlighted with a
  "fastest" badge; "+" expands the per-phase breakdown (damage, loadout · style, DPS, seconds, drain plan, and the fight
  length the drains were planned for).

Headline (default assumptions + kit, Team drains, 6-man, 2026-10-23, `scripts/verifyPhase16.mjs`): fastest **AG → Bork +
Smorks → Moia → Xarth → Ocellus, 21:49.5** (AG 181.2 s, Bork + Smorks 195.9, Moia 72.0, Xarth 186.8, Ocellus 673.5);
slowest AG → Ezekiel → Dreadnoth → Dagon'hai → Ocellus 23:43.1. Per slot: Bork + Smorks beats Ezekiel by 17.6 s, Moia
beats Dreadnoth by 63.0 s, Xarth beats the Dagon'hai by 33.1 s. Absolute seconds are only as good as the hp figures
(party scaling unverified) and the settings.

## Summary tab (phase 13)

One gear search (all styles, `runGearSearch`, same as the Search tab) per Summary row × drain state
(`summarySearchQueries()` in `search.ts`: 20 rows × None / Solo / Team = 60 searches (17 / 51 before phase 15 added Ezekiel, Moia and the Dagon'hai); the rows are `summaryQueries()`:
each boss/version at its default phase, plus Bork stunned, Ocellus P1 walking and the Ocellus P3 last-quadrant
options). They run one after the other in the search worker when the tab is opened, with a progress bar (searches
done / 60 + progress inside the current one) and **Cancel**; **Continue** resumes with the missing ones. Results are
cached in memory for the session (module scope in `SummaryView.tsx`, so switching tabs doesn't re-run), keyed by
`searchCacheKey(query, assumptions)`; changing any assumption clears the cache and re-runs. Each row starts with the
boss icon; each cell shows the top result's weapon line (18 px icons), a 16 px loadout icon strip (names in
tooltips), DPS (orange) + style, the best preset's DPS for reference, a "load" link (Load into calculator) and the
drain plan. Expect roughly 1–3 minutes for all 51 in a browser.

## Item icons (phase 12)

Search rows (and, smaller, Summary cells) show the weapon line with icons — weapon, then its ammo (ranged, not a blessing) or blowpipe
dart, then the autocast spell as text, e.g. "Ascension crossbows · Diamond ascension bolts (e)", "Kodai wand · Fire
Surge" — and the whole loadout as a row of 20 px icons in the calculator's equipment-grid order (head, cape, neck, ammo,
weapon, body, shield, legs, hands, feet, ring) with "name (slot)" tooltips; the boss selector shows the monster's icon.
URLs come from `src/lib/fracturedArchive/loadoutIcons.ts`, which uses the same helper as the calculator's equipment
slots and monster panel: `getCdnImage('equipment/<image>')` / `getCdnImage('monsters/<image>')` with the `image` field
of equipment.json / monsters.json. Production therefore serves them from `/cdn/` on our domain
(`NEXT_PUBLIC_CDN_URL`). Since the phase 13 fixes, dev uses the same deployed copy (`.env.development`), so the raid-4
images (Obligator, Ascension crossbows and bolts, the bosses), which upstream's CDN lacks, load in dev too. An `<img>`
that fails to load hides itself (the name stays as text). Icons are `loading="lazy"`, `alt` = item name. Spell icons are not shown: upstream loads
them from the wiki (`getWikiImage`), which would be hotlinking. `LoadoutIcons.test.ts` checks the slot order, URLs,
weapon lines, and that every preset/pool item and boss image exists in `cdn/` without a `%` in the name (those are
skipped by the deploy).

## Files

| File | What |
|---|---|
| `src/lib/fracturedArchive/presets.ts` | The presets (plain data) and the default assumptions. **Edit this to change setups.** |
| `src/lib/fracturedArchive/bestSetup.ts` | Pure computation (no React): item lookup, targets, drain states, `applyPresetToPlayer`, `evaluateLoadout`, `evaluatePreset`, `computeBestSetup`. Phase 9 should reuse `evaluateLoadout` / `buildTargetMonster`. |
| `src/app/best-setup/page.tsx`, `src/app/components/bestSetup/BestSetup.tsx` | The page (tabs, assumptions, boss / phase / drain selectors). |
| `src/lib/fracturedArchive/specs.ts`, `teamSpecs.ts` | Phase 14: spec mechanics / hit chances per weapon and energy budget; exact solo / team planners and the carrier recommendation (pure). `loadout.ts`: player assembly split out of bestSetup.ts (re-exported). |
| `src/app/components/bestSetup/SpecPlanPanel.tsx` | Phase 14: plan text, P(floor) and carrier table under the selectors. |
| `src/app/components/bestSetup/SummaryView.tsx` | Summary tab (phase 13): sequential searches, session cache, Cancel / Continue. |
| `src/lib/fracturedArchive/raidTime.ts`, `src/app/components/bestSetup/RoutesView.tsx` | Phase 16: raid time model (routes, encounters, kit evaluator, `RAID_TIME_DEFAULTS`) and the Routes tab. |
| `src/lib/fracturedArchive/planner.ts`, `src/app/components/bestSetup/PlanView.tsx` | Phase 17: raid kit planner (candidates, partial switches, DPS matrix, slot accounting, optimiser, inventory grid) and the Plan tab. |
| `src/tests/lib/fracturedArchive/Planner.test.ts`, `scripts/verifyPhase17.mjs` | Phase 17 tests (slot accounting, toy optima vs brute force, partial switches, reduced-pool plans, determinism, cancellation) and the Playwright check (`docs/screenshots/phase17-*.png`). |
| `src/tests/lib/fracturedArchive/RaidTime.test.ts`, `scripts/verifyPhase16.mjs` | Phase 16 tests (hand-computed times with toy kits, drains per encounter, argmin, monotonicity) and the Playwright check (`docs/screenshots/phase16-*.png`). |
| `src/tests/lib/fracturedArchive/Presets.test.ts` | Item names resolve, players are valid, the view's numbers equal a direct `PlayerVsNPCCalc`, ranking order, drain spec counts. |
| `scripts/verifyBestSetup.mjs` | Playwright check of the Summary tab since phase 13 (60 cells since phase 15, Cancel / Continue, cache on tab switch, icons, load a cell; `docs/screenshots/phase13-summary.png`). |

## Editing presets

Open `src/lib/fracturedArchive/presets.ts`; the comment at the top explains the fields. In short: copy an entry, give it
a unique `name`, list items by their exact calculator name per slot (`['Name', 'Version']` to force a version),
optionally restrict `styles` (style names to try) and `spells` (autocast spells to try). Then run `yarn test` — the
Presets test fails if an item name doesn't exist or doesn't fit its slot, or if a two-handed weapon has a shield.

The view tries every listed style (and spell) per preset and shows the one with the highest DPS for that boss/drain.

## Assumptions (the "Assumptions" box; defaults in `DEFAULT_ASSUMPTIONS`)

- All skills 99 (the calculator's default player).
- Potions per style: Super combat / Ranging potion / Saturated heart (selectable; CoX-only overloads/super potions and
  ToA smelling salts are available in the dropdown but don't work in the raid).
- Prayers: Piety / Rigour / Augury; "Zeal instead of Piety" switches melee to the raid prayer.
- Elemental fragments: on for magic presets (all four elements, +2 base max hit to elemental spells). Only the Kodai
  preset casts spells, so only it is affected.
- **Fight length** 90 s (phase 14): the spec-energy budget's fight length for Search / Summary (one rough value for
  every boss). The Routes tab (phase 16) uses each encounter's own undrained time instead (90 s only when it can't kill). **Floor at P ≥** 95%: when a drain plan counts as reaching the floor.
- **My specs** (phase 14, the Solo drain state): `[x] Elder maul [ ] DWH [ ] BGS [ ] Tonalztics`, `Ayak × 2` (with
  "≈ X magic def drained on <boss>" next to it = specs × hit chance × expected damage on a hit, from the calculator),
  `[ ] Lightbearer`, "Energy first to: Defence drains / Ayak".
- **Team** (phase 14, the Team drain state): party size 6 (also the HP-scaling party size, an identity table), carriers
  per weapon (default maul 2, DWH 0, BGS 0, Tonalztics 2, Ayak 1), "LB" = that weapon's carriers wear Lightbearer. Carriers beyond the
  party size are ignored (warned in red).

The assumptions are kept in page state only (reset on reload). Change the defaults in `presets.ts`.

## Drain states (phase 14: spec & drain model)

| State | Defence | Magic defence bonus |
|---|---|---|
| None | undrained | undrained |
| Solo | my ticked weapons within **my** spec energy: `soloSpecPlan` | my Ayak specs that fit in the energy left: specs × expected damage per spec |
| Team | the carriers' **first round** (each specs twice from 100% energy): `teamSpecPlan` | the Ayak carriers' first round |

**Which Defence the DPS ranking uses** (both Solo and Team): the floor if P(floor) ≥ the threshold (95%), otherwise
the reachable Defence nearest to the expected Defence (`rankedDefence` in `teamSpecs.ts`). Magic defence: 0 if
P(magic def 0) ≥ the threshold, otherwise bonus − expected drain (rounded down). The state is written into
`defenceReductions` as landed counts (maul / DWH specs, Tonalztics hits, BGS damage on Defence, Ayak damage) that
reproduce that Defence exactly in the calculator, so "Load into calculator" shows the same numbers. The plan text and
P(floor) are shown under the selectors ("Solo drains: …", "P(Defence floor …) …"), and the Search line keeps the short
form (e.g. "first round 4× Elder maul + 4× Tonalztics + 2× Ayak (P floor 99.5%)").

- **Hit chances** come from upstream's spec calc (`specs.ts`): a 99s player with the weapon, the Phase 8 preset armour of
  its style (Inquisitor's / Masori (f) / Ancestral), prayer + potion from the assumptions, `getSpecCalc()` →
  `getDistribution()`. Against the undrained boss, so follow-up specs are modelled slightly less accurate than they are.
  Mechanics per weapon: `docs/DATA_SOURCES.md`, *Spec mechanics*.
- **Energy budget**: `energyBudget({ seconds, lightbearer })` = 100 + 10 × floor(seconds / 30), or per 15 s with
  Lightbearer (wiki). All drain specs cost 50%, so 90 s = 130% = 2 specs (Lightbearer 160% = 3). 100% at the start of
  every boss is assumed (unverified).
- **Solo** (`soloSpecPlan`): Defence first (default): the fewest attempts whose best combination of the carried
  weapons reaches P(floor) ≥ 95%, else every attempt the budget pays for; leftover energy goes to Ayak (up to the
  count). It never spends more than the budget (tested). The plan's label is that of the *full* plan (attempts for
  95% + Ayak count): `solo` (fits 100% + regen), `solo+lightbearer` or `team-only`. With the defaults (maul + 2 Ayak,
  90 s) every boss is `team-only`: 2 maul attempts use the 130% and the Ayak specs don't fit — the line says so. A floor
  the carried weapons can't reach is shown as a partial drain, e.g. The Smorks: "2× Elder maul → expected Def 145
  (floor 0 not reachable; best case Def 93) → ranked at Def 143".
- **Team** (`teamSpecPlan`): exact P(floor from the first round), expected Defence, Ayak P(0). When the first round
  reaches the floor with P ≥ the threshold, the line adds the expected attempts to the floor; otherwise it shows the
  whole-fight P(floor) (each carrier's later attempts from regen / Lightbearer). (The expected attempt count is capped
  at the attempts available, so it is not shown when the floor is unlikely.) Team plans have no solo / team-only
  label (summing every carrier's energy as one player's would always say team-only); Solo plans keep theirs.
- **Ayak with the default single carrier** (2 specs ≈ 40 damage) won't reach magic defence 0 on high-magic-defence
  bosses (Bork +300, The Smorks +400, Xarth +205, Ocellus P3 +200): the Team state then uses bonus − expected drain.
  The carrier table's Ayak row shows how many carriers 0 needs.
- **Carrier table** (`recommendCarriers`, under the plan): P(floor from the first round) for 1..party-size carriers of
  each weapon, Ayak P(magic def 0), and the fewest carriers (one weapon, or a hammer + Tonalztics/BGS pair) reaching
  95%, e.g. "6-man Bork: 1 Elder maul → 59%, 2 Elder maul → 96%"; "6-man The Smorks: 4 Tonalztics → 84%, 5 Tonalztics
  → 98%" (hammers alone never reach floor 0).

Phase 13 rule kept: weapons that can't hit the boss in the selected version / phase have hit chance 0 (via upstream's
`isImmune`, `hittable.ts`), e.g. Archive Guardian (Flying) Solo with the default specs has no Defence drain ("Elder maul
can't hit here"), Team uses the Tonalztics carriers. The calculator's **Max drain** buttons (`drains.ts`) are unchanged
(all specs landing).

## How the numbers are computed

Each preset is turned into a player exactly as the main calculator builds one (equipment →
`calculateEquipmentBonusesFromGear`, attack speed, potion boosts as the store's `recomputeBoosts`), and the monster as
the calculator holds it after selecting the boss/phase, party size and pressing the drain buttons (raw stats + inputs,
current HP = scaled HP). `evaluateLoadout` then calls `PlayerVsNPCCalc` like the worker's `COMPUTE_BASIC` handler:
`getDps`, `getTtk` (expected TTK), `getDistribution().getMax()`, `getDisplayHitChance()`. "Load into calculator" adds the
row's setup as a new loadout (or replaces the selected one if all 6 are used) with the same boss, phase and drains, and
opens the calculator — the numbers there are identical (checked by `scripts/verifyBestSetup.mjs`).

TTK is the expensive part (O(HP × max hit)), so it is computed only for each preset's winning style.

A preset that fails to evaluate (e.g. a misspelt item) shows as a 0-DPS "Error: ..." row instead of breaking the
view (`safeEvaluatePreset`).

Rows that deal no damage are greyed with the reason (e.g. melee on Archive Guardian (Flying): "Flying: melee can't
reach it"; Ocellus P1 walking / P3 deflect: "Ocellus is praying against this combat style.").

## Results snapshot (default assumptions, 2026-10-22)

**Phase 14 note:** this snapshot and the Search results table below predate the spec model; Solo / Team now use the
spec planners (e.g. Bork Team top = Inquisitor's + Obligator 10.524 at Def 180, The Smorks Solo is ranked at Def 143).
Re-run the Summary tab for current numbers.

Best preset per boss/phase (default option), DPS under None / Solo / Team:

| Boss / phase | None | Solo | Team |
|---|---|---|---|
| Archive Guardian (Flying) | Ascension diamond (e) 8.981 | Ascension diamond (e) 10.905 | Ascension diamond (e) 10.905 |
| Archive Guardian (Grounded) | Inquisitor's + Obligator 11.413 | 13.061 | 13.061 |
| The Smorks | Ascension diamond (e) 7.616 | Inquisitor's + Obligator 14.645 | Inquisitor's + Obligator 14.645 |
| Bork (armour 8) | Inquisitor's + Obligator 8.945 | Inquisitor's + Obligator 10.524 | Tumeken's shadow 10.626 |
| Bork (Stunned) | Inquisitor's + Obligator 15.677 | 15.677 | 15.677 |
| Dreadnoth | Inquisitor's + Obligator 13.932 | 15.559 | 15.559 |
| Jelly | Ascension onyx (e) 13.792 | 14.053 | 14.053 |
| Xarth | Inquisitor's + Obligator 12.839 | 13.917 | 13.917 |
| Ocellus P1 (at a corner) | Inquisitor's + Obligator 10.435 | 12.447 | 12.447 |
| Ocellus P1 (walking) | Ascension diamond (e) 9.813 | 11.404 | 11.404 |
| Ocellus P2 (The Blade) | Inquisitor's + Obligator 12.060 | 15.551 | 15.551 |
| Ocellus P3 (quadrants 1-3) | Inquisitor's + Obligator 11.083 | 12.856 | 12.856 |

## Known caveats

Every unverified reading, with how to check it in-game, is in [UNVERIFIED.md](UNVERIFIED.md); group (A) there lists
the ones that could change a winner.

- **HP scaling is unverified** (identity table, infobox HP at every party size) → expected TTK is only useful to
  compare setups, not as real kill times.
- **Ocellus P2 (The Blade)**: DPS is damage to the Blade (50% transfers to P3); TTK shown as n/a.
- **Ocellus P3 last-quadrant options are low-confidence**: deflect strength (full block assumed), whether magic is
  deflected, void-explosion rounding and the attack speed-up after tick-perfect dodges are unverified.
- **Obligator** (top preset on most melee-able bosses) uses the phase 7b model: best of 2–4 damage rolls behind a
  single accuracy roll, +20/40% vs 2x2/3x3. That is the *conservative* reading: if each damage roll has its own
  accuracy roll (best of N rolls, misses count as 0), the Obligator rows **rise** (review check, Bork armour 8 with the
  earlier Primordial boots: 8.900 → 11.235 undrained, 10.496 → 12.066 at the floor), so its first places are robust.
  A third reading from the wiki's development history — each *extra* roll is an accuracy roll against the target's
  stab/slash defence (the reason stab/slash > crush adds rolls) — is also **unverified** and not modelled.
- **Zorya's tome**: base max hit 18 flat; the spec and its three empowered follow-up attacks are not modelled, so the
  tome is undervalued.
- Ascension (e) bolts use the normal diamond/onyx proc numbers (unverified).
- Phase 14: spec misses are modelled (exact probabilities); there is still no fight simulation (spec timing, boss healing), and the fight length is one rough setting.

# Search tab (phase 9)

"Search" (the default tab on `/best-setup` since phase 12) searches over end-game items per slot for the selected
boss/phase and drain state and lists the top loadouts by DPS, so a combination no preset has can still win. Boss, phase
and drains are chosen above the table; the Assumptions box applies too. Styles: All / Melee / Ranged / Magic.

**Auto-run (phase 12):** the search starts by itself when the tab opens (i.e. when the page loads) and whenever the
boss, phase option, drain state, style filter or an assumption changes. Each change clears the old table, cancels the
running search (its worker is terminated) or a pending start, and schedules a new run after a 300 ms debounce
(`AUTO_RUN_DEBOUNCE_MS` in `SearchView.tsx`), so several quick changes search once. During the debounce and the run the
progress bar shows ("Starting…", then evaluations done / estimated and the weapon being searched); **Cancel** stops
both. **Run again** re-runs by hand (e.g. after a cancel). "Best per weapon"
switches the table from the top 10 loadouts overall to the best loadout of each weapon (top 10).

Table: rank, DPS, gain vs the best Phase 8 preset of the searched styles (same boss/drains; the preset is named above
the table), expected TTK (winner only), max hit, accuracy, style, the full loadout, the seed the
ascent started from, and **Load into calculator** (adds the exact items incl. the blowpipe dart,
with the boss, phase and drains). Weapons that can't deal damage at all (melee vs Flying, a style Ocellus prays
against) are listed under the stats line instead of in the table.

## Files

| File | What |
|---|---|
| `src/lib/fracturedArchive/searchCandidates.ts` | The candidate pool (plain data, commented). **Edit this to change what is searched.** |
| `src/lib/fracturedArchive/search.ts` | The search (pure): `runGearSearch`, `prunePool`, `spellsForMonster`, `searchRowToPlayer`. |
| `src/worker/searchWorker.ts`, `searchWorkerClient.ts` | `WorkerRequestType.BEST_SETUP_SEARCH`: own worker per run, progress messages, cancel = terminate. |
| `src/app/components/bestSetup/SearchView.tsx` | The tab (auto-run). |
| `src/lib/fracturedArchive/loadoutIcons.ts`, `src/app/components/bestSetup/ItemIcons.tsx` | Item / boss icons (phase 12). |
| `src/tests/lib/fracturedArchive/Search.test.ts` | Pool data, pruning, spells, search properties (see below). |
| `scripts/verifyGearSearch.mjs` | Playwright check (screenshots `docs/screenshots/phase9-search-*.png`). |
| `scripts/verifyBestSetupUx.mjs` | Phase 12 Playwright check: default tab, auto-run, re-run on boss change, icons, Load into calculator from both tables (`docs/screenshots/phase12-*.png`). |

## Pool (searchCandidates.ts)

| Style | Weapons (variants) | Slot candidates (before pruning) | Full-set seeds |
|---|---|---|---|
| Melee | 14: Scythe, Obligator, Inquisitor's mace, Soulreaper axe, Osmumten's fang, Emberlight, Arclight, Burning claws, Voidwaker, Abyssal bludgeon, Noxious halberd, Elder maul, Dual macuahuitl, Ghrazi rapier (14 variants) | 31: Torva / Inquisitor's / Oathplate / Bandos / Blood Moon / Void, Neitiznot faceguard, Infernal + Fire cape, rancour / torture / blood fury, Ferocious / Void gloves, Avernic treads (max) / Primordial, Ultor / Bellator, Avernic defender, Rada's blessing 4 | Inquisitor's, Torva, Oathplate, Blood Moon (macuahuitl only), Void (melee) |
| Ranged | 9: Twisted bow, Ascension crossbows (diamond / onyx ascension bolts (e)), Zaryte crossbow (ruby / diamond / onyx dragon bolts (e)), Bow of Faerdhinen (c), Venator bow, Eclipse atlatl (+ atlatl darts), Scorching bow, Toxic blowpipe (dragon darts), Heavy ballista (dragon javelins) (12 variants) | 22 + 4 atlatl-only: Masori (f) / Crystal / Eclipse Moon / Elite void, Dizana's quiver / Ava's, anguish, Zaryte / Void gloves, Avernic treads (max) / Pegasian, Venator ring, Twisted buckler (ZCB), Rada's; the atlatl also gets Infernal cape, rancour, Ferocious gloves, Ultor ring (it scales with melee strength) | Masori (f), Crystal (Bowfa only), Eclipse Moon (atlatl only), Elite void (ranged) |
| Magic | 8: Tumeken's shadow, Zorya's tome, Harmonised Nightmare staff, Kodai wand, Sanguinesti staff, Purging staff, Accursed sceptre, Warped sceptre (8 variants) | 25: Ancestral / Virtus / Blue Moon / Void, Imbued Guthix cape, Occult, Confliction / Tormented / Void gloves, Avernic treads (max) / Eternal, Magus ring, Elidinis' ward (f) / Tome of Fire / Water / Earth (one-handed weapons), Rada's | Ancestral, Virtus (Kodai only), Blue Moon, Elite void (magic) |

34 weapon variants in total. Autocast spells (Kodai, Harmonised, Purging staff): Fire Surge (highest base) + the surge of
the boss's elemental weakness, Dark Demonbane against demons, Ice Barrage (Kodai) unless the boss is immune to ancients
(Archive Guardian). Constraints in the data/code: two-handed weapons (from the item data) never get a shield; weapons
that fire ammo list it per weapon (the test checks the calculator accepts it); others use Rada's blessing in the ammo
slot (the test checks the weapon doesn't require ammo); the blowpipe's dart goes in the weapon's `itemVars` like the
calculator's dart picker.

Left out on purpose: Dragon hunter lance (no dragons), Justiciar / Sunfire fanatic (no offensive effect), Lightbearer
(spec only), "ruby ascension bolts (e)" (don't exist in the data — only diamond and onyx), Blue Moon spear (the
calculator doesn't model the Blue Moon / Eclipse Moon set effects; the Blue Moon armour is still seeded).

## Algorithm (search.ts)

1. **Weapon variants** are enumerated fully: weapon × ammo option, each with all its non-defensive styles of the
   group's type (and each applicable spell for autocast styles).
2. **Pruning** (per variant, before any evaluation): an item is dropped when another item in the same slot has every
   *relevant* offensive stat >= (strictly > in one, or equal and listed earlier), unless it is marked `keep` (special
   effect: Inquisitor's, Void, Crystal with Bowfa, Blood Moon with the macuahuitl, Virtus with Kodai, tomes, Confliction
   gauntlets, Dizana's quiver). Relevant stats: the variant's melee attack types + strength; ranged attack + ranged
   strength (+ melee strength for the atlatl); magic attack + magic damage. Prayer and defensive bonuses are ignored.
   More attack/strength bonus never lowers DPS, so pruning can't lose the pool's optimum. In practice it drops
   torture / blood fury, Fire cape, Primordial / Pegasian / Eternal, Ava's, Tormented bracelet, Neitiznot, Bandos, and
   Bellator for weapons without a slash style.
3. **Seeds**: the pool defaults (first item per slot = best in slot), the armour of every Phase 8 preset of the style,
   and every full set of the style (restricted to its weapons). Duplicates are merged.
4. **Coordinate ascent** from each seed: best style option; then for each slot (head, body, legs, cape, neck, hands,
   feet, ring, shield, ammo) try every candidate with the rest fixed and keep the best; re-pick the style option; repeat
   until a pass brings no improvement (max 3 passes). Evaluations are memoised per variant.
5. Every converged loadout is a candidate; the top 10 distinct loadouts (gear + style + spell) are shown. TTK is
   computed for the winner only. Ties keep the first found (deterministic).

Because the presets are seeds and their weapons/ammo/styles/spells are in the pool, the top result is never below the
best preset (tested on four bosses).

**Limitation:** coordinate ascent changes one slot at a time, so a set effect that needs several pieces at once is only
found if that set is seeded in `sets`; a set missing there would be missed. Mixed partial sets are explored from the
seeds (e.g. Torva helm + Oathplate comes from its preset). Only items in the pool are considered — anything else
(e.g. a slayer helm) is never tried.

## Modelling caveats (search)

- **Soulreaper axe** is evaluated at 0 stacks (the calculator's default), so it is undervalued: on Xarth (Solo) it
  scores ~9.03 DPS vs ~11.04 at 5 stacks (review check).
- **Special-attack weapons** (Burning claws, Voidwaker, Elder maul, Dual macuahuitl, ...) are scored on their normal
  attacks only; specs are not part of the search.
- **Eclipse atlatl** gets the ranged assumptions (Rigour + Ranging potion), i.e. no Strength boost although its max
  hit uses Strength, and its Eclipse Moon set effect isn't modelled upstream, so it is undervalued.
- **Blue Moon / Eclipse Moon set effects** are not modelled by the upstream calculator (it shows a warning); those sets
  only count for their stats.
- The one-slot ascent cannot reach a multi-piece set by itself: in a reduced test pool without set seeds it stopped at
  11.488 vs the brute-force 11.533 (Xarth, Inquisitor's helm + hauberk). With the sets seeded (as in the real pool) the
  search equals brute force (Search.test.ts).

## Timings

~1,200–1,330 evaluations per boss for all three styles (34 variants). In the browser (Chromium on this laptop, dev
server, four Playwright runs): search **0.9–3.9 s** per boss (~0.75–3 ms per evaluation depending on machine load);
click → table 1.3–5.4 s, the slowest being the first run after a dev-server restart (worker chunk compiled on demand).
In Jest without coverage ~3–5 s per boss. Well inside the 15 s budget, so no pruning beyond the dominance rule (and no
reduction of seeds) was needed.

## Search results (default assumptions, Solo drains, default phase, 2026-10-22)

| Boss / phase | Top search result | DPS | Best preset | Gain |
|---|---|---|---|---|
| Archive Guardian (Flying) | Ascension crossbows + diamond (e), Masori (f) | 10.905 | Ascension diamond (e) 10.905 | 0 |
| Archive Guardian (Grounded) | Obligator thrust, Inquisitor's | 13.061 | Inquisitor's + Obligator 13.061 | 0 |
| The Smorks | Obligator thrust, Inquisitor's | 14.645 | same | 0 |
| Bork (armour 8) | Obligator thrust, Inquisitor's | 10.524 | same | 0 |
| Dreadnoth | Obligator thrust, Inquisitor's | 15.559 | same | 0 |
| Jelly (Dreadnoth) | **Ascension crossbows + onyx (e), Elite void (ranged)** + Dizana's quiver, anguish, Avernic treads (max), Venator ring | **14.922** | Ascension onyx (e) (Masori) 14.053 | **+0.869 (+6.2%)** |
| Xarth | Obligator thrust, Inquisitor's | 13.917 | same | 0 |
| Ocellus P1 (at a corner) | Obligator thrust, Inquisitor's | 12.447 | same | 0 |
| Ocellus P2 (The Blade) | Obligator thrust, Inquisitor's | 15.551 | same | 0 |
| Ocellus P3 (quadrants 1-3) | Obligator thrust, Inquisitor's | 12.856 | same | 0 |

All Obligator rows use Ferocious gloves, Avernic treads (max), Infernal cape, rancour, Ultor ring and Rada's blessing 4,
i.e. the search confirms that preset as the pool's optimum. Notable non-winners: on Archive Guardian (Flying),
**Harmonised Nightmare staff + Fire Surge + Tome of Fire** (10.264) beats Tumeken's shadow (9.753) and the Kodai preset;
Elite void also beats Masori for other ranged weapons on low-defence targets. Playwright cases: Xarth None top =
Obligator 12.839 / 58, Ocellus P2 Team = Obligator 15.551 / 58 (both equal to the presets).

Readings these results depend on (unverified; see the caveats above and docs/DATA_SOURCES.md): the Obligator
"one accuracy roll" model (every Obligator win), the ascension (e) bolt procs (Jelly and AG Flying winners), elemental
fragments +2 (the Harmonised Fire Surge result).

## Checks

- `Search.test.ts`: every pool name resolves and fits its slot; weapons have styles of their group; ammo accepted by
  the calculator / blessing allowed; blowpipe dart; pruning rule; spells per boss; search top >= best preset (Xarth,
  AG Flying, Jelly Solo, Ocellus P2 Team; reduced pool Obligator + Ascension crossbows); the Jelly Elite void find;
  top row == direct PlayerVsNPCCalc (DPS, max hit, TTK); no shield with 2h, defender with 1h; can't-hit list;
  determinism; cancellation after 30 evaluations; a toy 2-slot search equals brute force.
- `node scripts/verifyGearSearch.mjs`: full search for Xarth (None) and Ocellus P2 (Team) in the UI, top row equals the
  Jest numbers, wall time ≤ 15 s, the top row loaded into the main calculator shows the same DPS / max hit, Cancel works.
