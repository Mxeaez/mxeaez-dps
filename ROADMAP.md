# mxeaez-dps roadmap

Private fork of [weirdgloop/osrs-dps-calc](https://github.com/weirdgloop/osrs-dps-calc) (GPL-3.0) that adds
the bosses from OSRS raid 4, **The Fractured Archive**, and a "best setup" finder. Used by one raid group;
hosted at dps.mxeaez.com on Cloudflare Pages.

## Bosses in scope

| Boss | Wiki page(s) | Bucket rows found 2026-10-22 |
|---|---|---|
| Archive Guardian | `Archive Guardian` | `#Flying` (fire 80%), `#Grounded` (fire 40%); id 16659 |
| The Smorks + Bork | `The Smorks`, `Bork` | Smorks id 16641 (600 hp, earth 85%); Bork id 16640 (1500 hp, earth 40%) |
| Dreadnoth the Jellied | `Dreadnoth the Jellied`, `Jelly (Dreadnoth)` | Dreadnoth id 16665 (2100 hp, fire 85%); Jelly id 16666 |
| Xarth | `Xarth` | id 16684 (2600 hp, water 85%) |
| Ocellus | `Ocellus` | `#Phase 1` ids 16673/16674; `#Phase 2` has **no hp/id** on wiki; `#Phase 3` id 16677 (5250 hp) |
| Ezekiel (phase 15) | `Ezekiel` | id 16652 (3000 hp, earth 25%); alternative to Bork + Smorks |
| Moia (phase 15) | `Moia` | id 16667 (785 hp, air 80%); out of melee reach; alternative to Dreadnoth |
| Dagon'hai Elder + Monks (phase 15) | `Dagon'hai Elder`, `Dagon'hai Monk` | ids 16643-16648 (640 hp shared gauge, ×5); alternative to Xarth |

Ezekiel, Moia and the Dagon'hai trio were out of scope in round 1 and were added in phase 15. Route: Archive Guardian →
(Ezekiel | Bork + Smorks) → (Moia | Dreadnoth) → (Dagon'hai | Xarth) → Ocellus.

## Known data gaps

All unverified values, what we assumed, and how to check each one in-game are in
[`docs/UNVERIFIED.md`](docs/UNVERIFIED.md) (grouped by whether they could change which setup wins). The biggest
gap is party-size HP scaling: nothing is published, so the calculator uses the infobox HP at every size. The same
file explains how to record HP at 2–3 team sizes. Sources and reasoning are in `docs/DATA_SOURCES.md`.

## Phases

Each phase: builder agent implements + tests → reviewer agent checks against wiki & upstream formulas →
fix → `yarn test` + `yarn lint` green → Playwright check where UI changed → commit → entry in PROGRESS.md.

| # | Phase | Done when | Status |
|---|---|---|---|
| 0 | Setup | Fork cloned (remote `upstream`), deps installed, Playwright installed, baseline tests green, docs + CLAUDE.md written, first commit. | Done |
| 1 | Data refresh | `scripts/generateMonsters.py` re-run; all in-scope monsters present in `cdn/json/monsters.json` and selectable in the UI with correct stats vs wiki; Ocellus P2 resolved (manual entry or documented skip); `docs/DATA_SOURCES.md` lists every raid monster with source URL, date, and unverified fields. | Done |
| 2 | Raid mechanics | `src/lib/scaling/FracturedArchive.ts`: party size (2–8) HP scaling; defence floors (60% of base) for AG, Xarth, Ocellus (+ Ezekiel, Moia); immunities respected; UI exposes party size for these monsters; unit tests. | Done |
| 3 | Archive Guardian | Flying/Grounded both correct (weakness, defence bonuses); defence floor 156; any phase-specific rules from the wiki page; tests + Playwright screenshot. | Done |
| 4 | The Smorks + Bork | Both monsters correct; encounter rules documented (what must die first, any damage caps/shields) and modelled where they affect DPS; tests. | Done |
| 5 | Dreadnoth + Xarth | Dreadnoth, Jelly, Xarth correct; special mechanics modelled; tests. | Done |
| 6 | Ocellus P1/P2/P3 | Three selectable phases with correct stats; floors; tests. | Done |
| 7 | Debuff toggles | Existing defence-reduction inputs (DWH, Elder maul, BGS, Eye of Ayak, …) verified against raid floors; a "max drain" quick preset; tests. | Done |
| 7b | Equipment refresh | `generateEquipment.py` re-run; Fractured Archive rewards (Obligator, Zorya's tome, Ascension crossbows + bolts, Rondache, elemental fragments, Zeal) in the data with wiki-checked stats and their DPS effects modelled in `src/lib/fracturedArchive/equipment.ts`; tests + Playwright check. | Done |
| 8 | Preset comparison | New "Best setup" view: user's named presets (see below) ranked by DPS and expected TTK per boss/phase, with party size and drains applied; Playwright-verified. | Done |
| 9 | Full gear search | Search over end-game items per slot (per style) and report best setup per boss/phase; runs in the web worker; results reproducible by tests. | Done |
| 10 | Deploy | `.env.production` for dps.mxeaez.com (base path `/`), static export builds, Cloudflare Pages project + custom domain. **Needs user's Cloudflare login.** | Build ready; Pages project + domain left to the user (`docs/DEPLOY.md`) |
| 11 | Final review | Fresh reviewer pass over all raid code; checklist of unverified values for the user to check (`docs/UNVERIFIED.md`); merge notes (`docs/UPSTREAM_MERGE.md`). | Done |

## Presets for phase 8 (user-supplied)

- Full crush: Inquisitor's set, Inquisitor's mace, Avernic defender, Echo/Ultor etc. — best-in-slot crush
- Max ranged: Twisted bow setup (Masori etc.)
- Inquisitor's armour + Scythe of vitur (slash)
- Inquisitor's armour + Scythe of vitur (crush)
- Full Torva + Scythe (slash)
- Torva helm + Oathplate chest & legs + Scythe (slash)
- Full Ancestral + Tumeken's shadow (with Eye of Ayak magic-defence drain toggle)

Extra candidates from phase 7b (raid rewards):

- Obligator crush setup (thrust style; e.g. Inquisitor's armour + Zeal)
- Zorya's tome + Shadow/other staff (tome is two-handed and a 3-tick powered staff; its spec is a swap)
- Ascension crossbows setup (rapid, 2 ticks; diamond/onyx ascension bolts (e))

## Decisions already made (don't re-ask)

- Host: Cloudflare Pages, static export.
- Specs (Ayak, Elder maul, DWH, BGS): modelled as debuff toggles / drain counts, not a fight simulation.
- Missing wiki data: use best source (Gearscape, community), mark unverified, continue.
- Keep upstream-mergeable: new behaviour in new files where possible, minimal edits to upstream files, upstream code style.

## Future work (not scheduled)

- Fill `FRACTURED_ARCHIVE_HP_SCALING` once boss HP at 2–3 team sizes is recorded (`docs/UNVERIFIED.md`, "HP scaling").
- Zorya's tome: model the spec's three empowered 2-tick follow-up attacks, and Magic-level scaling of the base max hit
  if it's confirmed in-game.
- Soulreaper axe stacks in the best-setup view / search (currently 0 stacks, so it's undervalued).
- Eclipse atlatl: give it a Strength potion in the best-setup assumptions; Blue Moon / Eclipse Moon set effects
  (upstream doesn't model them).
- Special attacks in the rankings (spec weapons are only scored on their normal attacks now).
- Archive Guardian shield (TTK of the flying phases) once its HP and scaling are known.
- Rondache's Shield Slam spec and its defensive bonuses.

## Round 2

Requested after the site went live (2026-10-23). Same workflow per phase as above.

| # | Phase | Done when | Status |
|---|---|---|---|
| 13 | Round-2 fixes | Drain plans only use weapons that can hit the target in that phase; DPS column highlighted; Per-boss tab removed; Summary search-based with icons; tests | Done |
| 14 | Spec & drain model | Per drain weapon (Elder maul, DWH, BGS, Tonalztics, Ayak, Accursed): spec hit chance and expected damage from the calc per boss/phase; Ayak input = spec count, drain = count × expected damage; spec-energy budget per player (100% start, +10%/30 s, Lightbearer doubles) labels plans solo / solo+Lightbearer / team-only, Solo state shows the partial drain actually reachable; team spec planner: party size + carriers per weapon → P(floor reached from the first round of specs) and a carrier recommendation; tests | Done |
| 15 | Remaining bosses | Ezekiel, Moia, Dagon'hai Elder + Monks modelled from the wiki (stats already in data; floors 78/117 done) with the same build/review loop, so every route can be compared | Done |
| 16 | Raid time model | Pure `raidTime(route, kit)` = Σ HP ÷ DPS over the route's bosses/phases, DPS time only (no puzzle/travel); Bork + Smorks killed evenly (Bork damage spread across the 4 armour tiers, Smorks 600 hp on top); Ocellus P2 at 50% carry-over; AG flying/grounded split with shield hp as a setting (unverified); party-size hp table (unverified); route enumeration + comparison; tests | Done |
| 17 | Raid plan tab | Inputs: party size (default 6), route or compare-all, items always carried (default from the user's kit), spec weapons carried, supply slot counts (default 6 brew / 4 restore / 2 ranging / 1 super combat); optimiser builds partial switches from search results within the free slots to minimise route time; output: worn gear, 4×7 inventory grid with icons, free-slot count, per-boss style/DPS table, load into calculator; brute-force check on small cases | Done |
| 18 | Raid tabs + ToA | Per-raid config (bosses, phases, scaling inputs) so Search/Summary/Plan work for any raid; ToA with invocation level (default 500), party size, path levels; Akkha, Ba-Ba, Kephri, Zebak, Wardens; presets | Done |
| 19 | CoX | Normal / CM, team size (Defence scales); Tekton, Vasa, Vanguards, Vespula, Muttadiles, Mystics, Shamans, Guardians, Ice demon, Olm | Done |
| 20 | ToB | Normal / HM (+ Entry), team size 1-5; Maiden, Bloat, Nylocas, Sotetseg, Xarpus, Verzik P1–P3 | Done |
| 21 | Planner for ToA/CoX/ToB | Fixed routes; time model from upstream's verified hp scaling; per-raid Plan defaults (pinned items, supplies) from the Strategies pages; raid-supplied items at 0 slots (ToB Dawnbringer); dedupe rule (≥ 1 s saved, ≥ 1 s per extra slot); Prinkipas only in Hard Mode; Dawnbringer specs follow the team-DPS multiplier | Done |
| 22 | Final review (round 2) | Fresh pass; UNVERIFIED.md updated for new raids and planner (incl. "does FA Defence scale with players?" with an in-game check); cross-raid tests; merge notes | Done |

### Decisions (round 2)

- Raids are added in the order ToA → CoX → ToB, as tabs on one page.
- Planner objective = total raid time: Σ HP ÷ DPS over the route's bosses / phases, DPS time only.
- The planner optimises the user's own kit for the user's DPS; the team matters only for drains.
- The user picks which spec weapons they carry; Solo drains are limited by the user's spec-energy budget and carried weapons; Team drains are computed from the carriers (floor when P(floor) ≥ 95%, otherwise the nearest reachable Defence to the expected value). Default carriers for a 6-man: Elder maul 2, Tonalztics 2, Ayak 1 (phase 14).
- Supplies are entered as slot counts by type; the planner shows free slots.
- Routes are compared (Guardian and Ocellus fixed; the middle bosses vary), so Ezekiel, Moia and Dagon'hai must be modelled.
- Bork and the Smorks are killed evenly, not Bork first.
- Fractured Archive Defence is assumed not to scale with party size (wiki mentions hp only) — unverified.
- Plan (phase 21): a kit loadout must save ≥ 1 s and ≥ 1 s per extra inventory slot (`SWITCH_MIN_*` in planner.ts);
  raid-handed items (ToB Dawnbringer) cost no slot; per-raid default pins / supplies follow the wiki Strategies inventories.
- CoX (phase 19): party size 1-15 in the tab (the raid allows 1-100); rooms are a user-picked set (default: all, an
  upper bound) + the Great Olm; team-DPS multiplier defaults to the party size; Team carriers = FA's + 1 BGS.

### Future work (round 3)

Found in the phase 22 review; larger than a review fix, so not done:

- **Slow headline test in CI**: `src/tests/lib/raids/CrossRaid.test.ts` pins the four headline plan totals (FA 23:30.4 since the heart fix,
  ToA 14:20.2, CoX 6:41.9, ToB 7:32.2) only with `RUN_SLOW_TESTS=1` (a full default plan per raid is too slow for the
  default Jest run); the fast run pins each raid's per-encounter times for a fixed kit instead. Run the slow block
  before a release.
- **Spec carriers per raid**: ToA inherits the Fractured Archive's carriers (Tonalztics, Ayak); a raid-specific default
  from the Strategies pages (ToA: BGS / Elder maul on Akkha, Ba-Ba, Kephri) would make the Team drain state closer to
  real teams (UNVERIFIED D17).
- **Resupply in the Plan tab** (ToB chests, ToA Helpful Spirit, CoX potions): plan per raid segment instead of one
  inventory for the whole raid (UNVERIFIED D15).
- **Spec energy across a raid**: every boss / Olm target / Sotetseg third starts at 100% (UNVERIFIED B10, F7, G7);
  carry the energy between encounters in the time model.
- **Upstream PRs**: the fixes listed in docs/UPSTREAM_MERGE.md (*Fixes worth sending upstream*), plus the two
  spell / staff typos in `BaseCalc.ts` found in phase 22.
- **FA hp / Defence scaling** once recorded in-game (UNVERIFIED C1, A11).
- **Damage specs vs drain value** (from phase 24, Kephri): model Voidwaker (guaranteed magic-roll hit), Burning claws,
  Dragon claws and the bone dagger (guaranteed first hit, ToA Strategies) as spec *damage*, and compare a player's
  spec energy spent on damage with the same energy spent on drains (e.g. at Kephri one landed maul reaches the floor,
  so the remaining specs are better spent on Voidwaker). Not implemented; the drain line only says when drains are
  unlikely to land or when one landed spec is enough.

## Round 3

Requested after round 2 (2026-10-23): the best-setup page had too much on screen ("Not sure what Fight length means",
"What is Floor at P?", "What is Team DPS × 1 when party size is 6?", "What do the LB checkboxes do?", "Drain per boss
should be clearly marked like [Elder maul icon] ×2", "What is the Encounters tab for?"). Same workflow per phase.

| # | Phase | Done when | Status |
|---|---|---|---|
| 23 | UI cleanup | Simple/Advanced split; drain line as icons ×N with hit chances; fight-length input removed (computed); one Lightbearer toggle for carriers; Encounters/Routes merged into Plan results; tooltips/glossary; no behaviour change to the numbers | Done |
| 24 | Spec-accuracy audit | ToA/CoX/ToB spec hit chances include invocation/CM/party multipliers on the defence roll; Kephri maul case explained; hit chance shown per spec in the drain line; tests | Done |
| 25 | Item data refresh | Amulet of rupture, Seeking dragon arrows and every item added since the pool was written (audit equipment.json vs pool/presets); effects modelled or documented | Done |
| 26 | "I don't own" list | Cross off items (persisted in the browser); Plan excludes them; Search marks rows that use them but still shows them | Done |
| 27 | Planner supplies & rings | Potions chosen from the kit (super combat / ranging / heart by style present); comfort supplies (brews/restores/food) per raid, editable; ring policy: camp one ring / camp Lightbearer / allow switches | Done |
| 28 | Final review (round 3) | Fresh pass; UNVERIFIED updated | Done |

### Decisions (round 3)

- Fewer visible inputs: a simple view by default, everything else behind an **Advanced** expander.
- Drain plans are displayed as item icons × count, with the per-spec hit chance under each icon (long text in a tooltip).
- The Encounters / Routes tab is merged into the Plan tab's results (tabs: Search · Plan · Summary).
- The Saturated heart is a pinned item, not a supply (done in the fix commit d5c4379).
- Phase 27: the combat potions come from the kit (one Super combat / Ranging potion per style present, part of the kit's
  slot cost); comfort supplies (brew / restore / food / other) stay user-entered; ring policy default **Camp one ring**
  (the user: "a lot of people don't bring ring switches"), with Camp Lightbearer and Allow ring switches under Advanced.
- Phase 28: the Plan's Solo fight length uses the same formula as Search (hp ÷ (party size × your DPS)), not the
  team-DPS multiplier (FA ×1 made Plan's Solo fights 6× too long at party 6).

## Round 4

Agreed 2026-10-24 after the user reviewed round 3 ("how do I know if I should mark that I'm bringing Ayak specs before
the plan is made? … should the plan decide which spec weapons to bring, based on party size too?"). Same workflow per
phase; phase 29 changes numbers, so it gets the full independent review.

| # | Phase | Done when | Status |
|---|---|---|---|
| 29 | Planner decides spec weapons | **Solo:** spec weapons (Elder maul, DWH, BGS, Tonalztics, Ayak) are planner candidates — each costs a slot and buys the drain it can land on the bosses it can hit; the planner tries the subsets with the kit and reports "Bring: …" with what each saves (or "maul alone is enough: Tonalztics would save 4 s for 1 slot"). **Team (party ≥ 2):** (1) *team roles* — for the chosen kit and party size, the minimum carriers per weapon per boss to reach the floor from the first round at ≥ 95% (e.g. "6-man: 2 Elder maul, 2 Tonalztics (Guardian flying, Moia), 1 Ayak only if someone mages"), shown as a team briefing; (2) *your share* — "assign me" (default: the weapon whose carrier count is hardest to fill, or none if your slots are worth more as gear) or a manual pick; only what you carry costs slots. Ayak gets value only if a magic loadout is in your kit (Solo) or "mages in party" > 0 (Team, new Advanced input). "Specs I bring" stays as a manual override. Plus the four tweaks: drain line shows "needed ×2 (4 hits) · team brings ×4"; remove the duplicate "Drains:" line from the Search header (keep "ranked at Def · Magic def"); rename "My specs" → "Specs I bring"; Lightbearer becomes an "I wear a Lightbearer" ring toggle (set automatically by the Camp Lightbearer policy), not a spec weapon; hint when Ayak is carried but no magic loadout uses it. Tests (subset search finds the hand-computed optimum on a toy; team roles match the carriers table; your-share costing), Playwright, docs | in review |
| 30 | Final review (round 4) | Fresh pass; UNVERIFIED updated | planned |

### Decisions (round 4)

- Spec weapons are an *output* of the planner, not an input; the manual "Specs I bring" override remains.
- Team drains stay computed from carriers (floor when P(floor) ≥ 95%, else the nearest reachable Defence to the expected value).
- Tonalztics counts are shown in specs (one charged spec = two hits); phase 29 also shows the hits inline ("×2 (4 hits)").
- Phase 29 (builder's decisions): the Plan tab defaults to "Spec weapons: Planner decides" (`plan()` keeps "Specs I
  bring" as its API default, like the ring policy); spec weapons left the pinned defaults (FA / CoX / ToB Elder maul);
  the Team drain state keeps using the configured carriers ("team brings ×4"), the team briefing is the recommendation;
  "assign me" carries the most-needed weapon only if it is free or its slot is worth < 1 s of gear (UNVERIFIED D21);
  Eye of Ayak carriers need "Mages in party" > 0 (default 1 if your kit has a magic loadout; D22); FA allows party size 1
  (solo; hp still scales as 2), and a party of 1 uses Solo drains.

### Future work (round 5)

Found in or carried past the phase 28 review; larger than a review fix, so not done:

- **Damage specs vs drains**: model Voidwaker (guaranteed magic-roll hit), Burning / Dragon claws and the bone dagger
  (guaranteed first hit, ToA Strategies) as spec *damage*, and compare a player's spec energy spent on damage with the
  same energy spent on drains (e.g. Kephri: one landed maul reaches the floor; the rest is better spent on Voidwaker).
- **Resupply** in the Plan tab (ToA Helpful Spirit, CoX potions): plan per raid segment instead of one inventory for the
  whole raid (UNVERIFIED D15, D19).
- **ToB supply chests**: the chests between rooms restock brews / restores (Strategies); the Plan could count fewer
  comfort supplies per segment (part of resupply).
- **Spec energy across encounters**: every boss / Olm target / Sotetseg third starts at 100% today (B10, F7, G7); carry
  the energy and its regen between encounters in the time model.
- **FA hp / Defence scaling** once measured in-game (UNVERIFIED C1, A11): fill `FRACTURED_ARCHIVE_HP_SCALING`, then
  revisit FA's team-DPS multiplier of 1 (the fight length already uses the party size, B17).
- **Ring screen**: the "≥ +X s (estimate)" of a screen-only ring isn't a bound; a cheap partial-switch pass per ring
  would make it one (UNVERIFIED D18).
- **Footer wording**: `teamTimeLabel(1)` "times: your DPS alone" reads oddly mid-sentence in the page footer; change it
  together with verifyPhase18 / 21 and RaidConfig.test, which pin the text.
