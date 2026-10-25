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

Agreed 2026-10-24 after the user reviewed round 3 (phases 30–32 added the same day from the user's second look at the
Plan tab: supply icons, ring policy placement, empty defaults, quiver ammo, heart decided by the plan) ("how do I know if I should mark that I'm bringing Ayak specs before
the plan is made? … should the plan decide which spec weapons to bring, based on party size too?"). Same workflow per
phase; phase 29 changes numbers, so it gets the full independent review.

| # | Phase | Done when | Status |
|---|---|---|---|
| 29 | Planner decides spec weapons | **Solo:** spec weapons (Elder maul, DWH, BGS, Tonalztics, Ayak) are planner candidates — each costs a slot and buys the drain it can land on the bosses it can hit; the planner tries the subsets with the kit and reports "Bring: …" with what each saves (or "maul alone is enough: Tonalztics would save 4 s for 1 slot"). **Team (party ≥ 2):** (1) *team carriers* — planner output (review fix): one carrier at a time, the one that saves the most route time with the kit, while it saves ≥ 1 s (party-size cap; Ayak only if someone mages); the Team drain state uses exactly those carriers; shown as a team briefing (carriers, what the last one saves, the bosses it saves on); "Team carriers: Set manually" (Advanced) is the override; (2) *your share* — "assign me" (default: the weapon whose carrier count is hardest to fill, or none if your slots are worth more as gear) or a manual pick; only what you carry costs slots. Ayak gets value only if a magic loadout is in your kit (Solo) or "mages in party" > 0 (Team, new Advanced input). "Specs I bring" stays as a manual override. Plus the four tweaks: drain line shows "needed ×2 (4 hits) · team brings ×4"; remove the duplicate "Drains:" line from the Search header (keep "ranked at Def · Magic def"); rename "My specs" → "Specs I bring"; Lightbearer becomes an "I wear a Lightbearer" ring toggle (set automatically by the Camp Lightbearer policy), not a spec weapon; hint when Ayak is carried but no magic loadout uses it. Tests (subset search finds the hand-computed optimum on a toy; team roles match the carriers table; your-share costing), Playwright, docs. Review fixes: the subset search ranks each subset's seeds under its own drains + a quick-run guard (FA Solo party 1 = the brute-force optimum, Tonalztics 22:10.5), ring and subset chosen together, "vs this plan" wording + "best without …", planner carriers. Review 2: ring guard (best two rings in full, largest gap; 0 misses over the 32 subsets), Eye of Ayak carriers ≤ mages (ToA 14:10.6), sequential "needed", "needed ×3 (86%) · team brings ×4 (8 hits, 98%)", Search / Summary follow the planner's carriers, share tie-break | done (reviewed in phase 32) |
| 30 | Plan tab polish (UI only, no maths change) | Real wiki images for the comfort supplies (Saradomin brew(4), Super restore(4), Cooked anglerfish; added to `cdn/`); ring policy leaves Advanced and sits with the other inputs as a single dropdown; the "Items I always bring" default is empty for every raid (the planner decides styles, so nothing is always brought — the heart moves to phase 31); "Specs I bring" starts empty (phase 29). Headlines re-pinned for the new defaults; Playwright; docs. Also (phase 29 re-check): "needed" reaches the confidence threshold when the team's specs do; the greedy steps re-timed on the returned kit; the Search carrier table labelled "Per boss minimum at 95% (for reference)" | done |
| 31 | Quiver ammo + heart as magic's potion | **Quiver:** when the kit wears a Dizana's quiver (any variant) and carries a second ammo-slot item (e.g. Dragon arrows worn + Ruby dragon bolts (e) for the Zaryte crossbow), that second ammo costs 0 inventory slots (the quiver holds it); the kit view draws it beside the quiver, not in the grid. **Heart:** the Saturated heart stops being a pinned item and becomes magic's entry in the potions-from-the-kit rule (1 slot only when the kit has a magic loadout, exactly like Super combat / Ranging potion for melee / ranged); FA/ToB defaults no longer pin it. Slot costs change, so: tests per rule (toy kits, hand-computed slot counts), brute-force check on a reduced pool, full independent review, headlines re-pinned, docs. Also: the Solo spec-subset search applies the same ≥ 1 s per slot rule as kit switches / your share (`SHARE_MAX_SLOT_SECONDS`) before preferring a larger subset (phase 30 review: Solo brought Elder maul for 0.57 s) | done |
| 32 | Final review (round 4) | Fresh pass; UNVERIFIED updated. Plus the drain-line unit fix (user, 2026-10-24: "needed ×4 · team brings ×4" read as 4 people / 8 landed hits): state the unit on both halves, e.g. "needed 4 specs (2 carriers) · brings 4 specs (2 carriers) · 8 swings, 4 must land · 98%"; Solo lines likewise ("4 specs · 8 swings, 4 must land"). Also (user, 2026-10-24, FA plan party 4 without Obligator): switches charge a slot for Rada's blessing 4 (the melee / magic presets' ammo-slot filler, no DPS effect) — a switch item that changes no phase's DPS must cost 0 slots / be dropped from the switch (bolts / arrows stay in the ammo slot while meleeing); check the Zaryte crossbow + Ruby bolts (e) switch's third slot the same way; re-pin headlines if they move | done (zero-value rule also keeps a loadout's empty ammo slot filled with the kit's ammo; drain line "needs 4 landed hits · 4 specs (2 carriers), 8 swings · 98%"; ToB 7:29.5, FA without Obligator / Ascension 24:34.1) |

### Decisions (round 4)

- Spec weapons are an *output* of the planner, not an input; the manual "Specs I bring" override remains.
- Nothing is "always brought" by default: potions (and from phase 31 the Saturated heart) come from the styles the
  planner keeps; the pinned list is only for the user's own additions.
- A Dizana's quiver holds one extra ammo type at no inventory cost (phase 31).
- Team drains stay computed from carriers (floor when P(floor) ≥ 95%, else the nearest reachable Defence to the expected value).
- Phase 29 review (the user: "the plan runs and sets this automatically, like 2 people need elder, 3 need ralos"): the
  carriers are planner output — the count is time-based (greedy, each carrier must save ≥ 1 s), the 95% rule stays
  inside the drain state; the Advanced counts are a "Set manually" override (and what Search / Summary use). FA 6-man:
  2 Elder maul + 2 Tonalztics. A party of 1 has no carrier table in Search.
- Phase 29 review 2: Eye of Ayak carriers are capped at "Mages in party" (teammates are modelled as copies of you, so
  magic-def drain gains are overstated by party ÷ mages; see round 5); in "Planner decides" mode Search / Summary use the
  last plan's carriers (the defaults before any plan).
- Tonalztics counts are shown in specs (one charged spec = two hits); phase 29 also shows the hits inline ("×2 (4 hits)").
- Phase 29 (builder's decisions): the Plan tab defaults to "Spec weapons: Planner decides" (`plan()` keeps "Specs I
  bring" as its API default, like the ring policy); spec weapons left the pinned defaults (FA / CoX / ToB Elder maul);
  the Team drain state keeps using the configured carriers ("team brings ×4"), the team briefing is the recommendation;
  "assign me" carries the most-needed weapon only if it is free or its slot is worth < 1 s of gear (UNVERIFIED D21);
  Eye of Ayak carriers need "Mages in party" > 0 (default 1 if your kit has a magic loadout; D22); FA allows party size 1
  (solo; hp still scales as 2), and a party of 1 uses Solo drains.
- Phase 30 (builder's decisions): the supply images are bundled (`src/public/img/supplies/`, static imports like
  upstream's potion images, so they show in dev without a CDN deploy) rather than in `cdn/`; the cooked fish is the
  wiki's "Anglerfish.png" (there is no "Cooked anglerfish" item). CoX's Dragon pickaxe is neither pinned nor a raid
  rule: the planner adds it (the Guardians are pickaxe-only, so a kit without it can't finish the route). The
  "needed at the threshold" rule applies to Eye of Ayak (P(magic def 0)) too.
- Phase 31 (builder's decisions): the quiver rule frees a slot only for a **second** arrow / bolt type (as agreed), also
  when the quiver sits in the inventory (wiki: the slot appears "if the quiver is in the inventory or equipped"); the
  one-type case (a smaller loadout without the ammo could also keep it in the quiver) is not modelled (UNVERIFIED D23).
  Blessed Dizana's quiver and Dizana's max cape count as quivers; the Bolt rack doesn't count as bolts. The heart is
  the pinned heart if any, else the Assumptions box's heart, else Saturated; the "+ Saturated heart" pin buttons stay
  (optional). The Solo subset search prices a slot at 1 s (`slotSeconds`, ranking time + 1 s × slots), and "best
  without …" uses the same ranking.
- Phase 32 (builder's decisions): a switch item that changes no DPS costs no slot and isn't shown; for the ammo slot
  that is `isUnusedAmmo` (a weapon that fires no ammo, no melee / magic stat, no effect), and Rada's blessing left every
  preset and the search pool. A loadout without ammo of its own **keeps the kit's ammo in its ammo slot** (the bolts
  stay equipped while meleeing; a melee worn set starts with one of the kit's ammo items): without this the blessing's
  slot only moved into "swap space". The prayer bonus stays unmodelled (D25). The drain line counts the landed drains
  of a weapon alone from the start Defence; when its needed specs can't land that many, from the Defence the other
  weapons leave ("once 1 Elder maul spec lands (Def 195)"), else "needs the other drains too". `quiverSavedSlots` keeps
  counting two bolt types (a same-kind pair needs a manual swap: documented in D23, not a one-line change). The phase 31
  one-type quiver case is covered by the kept ammo when the smaller loadout has no ammo of its own.

## Round 5

Agreed 2026-10-24 after the user reviewed the phase 32 plan ("Specs I bring" still lit while the planner decides; the
Plan tab is a lot of text and hard to read; damage specs like Voidwaker / Zaryte crossbow aren't considered; Bork +
Smorks shows five drain lines when you spec once at the start). Same workflow per phase; phases 35 and 36 change numbers, so
they get the full independent review; 33 and 34 get a UI/consistency check.

| # | Phase | Done when | Status |
|---|---|---|---|
| 33 | Specs follow the plan; one drain line per encounter | **Specs I bring** defaults to none for every raid (`mySpecs` all false / Ayak 0); in "Planner decides" mode the chips are filled from the plan's "Bring" result (read-only, like the team carriers) so Search / Summary Solo drains follow the plan, and read "run a plan to fill these" before one has run; manual mode unchanged. **One drain line per encounter**: the encounter row shows a single start-of-fight line, e.g. "Start of fight: 2 Elder maul carriers (4 specs) + 2 Tonalztics carriers (4 specs) → Def 180 · 99.6%" (Solo: "Start: 2 Elder maul specs + 2 Tonalztics specs → Def 180"), computed on the first phase the specs land on (Bork armour 8, AG flying shield, Ocellus P1 at a corner); the per-phase rows keep their lines but collapsed under a "per-phase details" toggle (closed by default). Where phases need different specs (AG grounded vs flying) the encounter line lists both ("Flying: … · Grounded: …"). **Drain events, not encounters** (user, 2026-10-24: Sotetseg's Defence is restored after each maze, "you WOULD want to redrain"): the unit is the drain event — the encounter start plus every phase where the time model restores Defence (Sotetseg thirds, Bloat later downs; a structured `drainReset` flag on the planned phase replaces the label text); phases without the flag share the previous event's drain state (Bork armour phases, AG shield → flying, Ocellus quadrants). Sotetseg shows "at the start and after each maze" (3 events); each event still starts at 100% energy in this phase (phase 36 shares the budget). Tests (defaults; chips == plan Bring; encounter line == the first phase's line; Bork's five rows collapse to one), Playwright, docs | done |
| 34 | Readability (all three tabs) | Rule (user, 2026-10-24: "if it doesn't provide useful information we should hide it"): the default view shows only what you act on — gear, specs (icon + bold number), how many, time; every explanation, intermediate number and alternative goes behind a "details" toggle (closed by default) or a tooltip; no number or pinned string changes. **Search:** header shows the icon + number drain line and "→ Def · Magic def" only (the sentence form, "N% land", "Chance of the Defence floor" and the "Per boss minimum" table move to details); rows keep weapon, DPS, style, icons and the "uses: …" badge (hide "search started from", evaluation counts / timings, "vs best preset", "Exp. TTK top row only" note); the Solo hint next to the Ayak chip becomes a tooltip. **Summary:** cells keep weapon, icons, DPS, style and icon + number specs (hide "best preset N · load", drain sentences, "(fight ≈ 15 s → N specs)"; "uses: …" badge stays). **Item images everywhere** (user, 2026-10-24: "any mention of items have their image next to it"): every item name on the three tabs shows its icon — the Melee / Ranged potion and Heart dropdowns become custom lists with icons (native selects cannot show images) with the relevant choices first (Super combat, Overload (+), Smelling salts, Ranging potion, Saturated / Imbued heart, Zeal) and the rest under "more"; the "Potions (from the kit)" and Ring lines, loadout names ("Worn: …", "Switch: …"), the alternatives list, the "uses: …" badges, the team briefing weapons, the drain lines and the Items I always bring / don't own chips (already iconed) all use `ItemIcons`. **Plan:** a **raid briefing** at the top of the plan result, one row per encounter: boss image, loadout used (icons), specs at the start (from phase 33), seconds; then the kit (worn / inventory) and the total. Everything else moves under collapsed sections, closed by default: "Why this kit" (loadout list with slots / saves, ring alternatives, lighter kit), "Spec plan" (team briefing table, added-in-order, per-boss minimum, your share), "Per-phase details" (the current encounter table). The Assumptions box keeps only party size, potions, ring policy, comfort supplies, items I don't own and "Items I always bring"; everything else is under Advanced. Drain line in the briefing (user, 2026-10-24: "straight to the point. Big Ralos picture, maybe bold 4 hits. That's really all you need to know; we already know from above that 2 Ralos are needed in the team"): the per-boss start-of-fight line is icons + one bold number each — large weapon icon, **4 hits** (Tonalztics: landed hits; Elder maul / DWH / BGS: **2 specs**; Ayak: **≈ 39 magic def**) and a small "→ Def 156"; carriers are NOT repeated (the team briefing says them); the full sentence moves to the tooltip and the collapsed per-phase rows, reworded there: "swings" → "attacks", "4 specs (2 carriers) = 8 attacks, 4 must land · 98%" (Solo: "4 specs = 8 attacks, 4 must land"); maul / DWH / BGS use "specs" only (one attack each). No number changes: the before/after plan totals and every other string in the collapsed sections must be identical (tests pin them; the drain-line tests / verify scripts are re-pinned to the new wording only); Playwright screenshots of the new layout at desktop and phone width; docs (BEST_SETUP "Reading the Plan tab") | done |
| 35 | No specs on adds | User, 2026-10-24: "you obviously aren't going to Ralos or Elder maul spec the little minions". Targets that are adds or short-lived (ToA: Spitting / Soldier / Arcane Scarab, Akkha's Shadow; CoX: Mystic, Shaman, Muttadile (small), Glowing crystal, Abyssal portal; ToB: Nylocas (non-boss) if present; FA: none) get `noDrains` with the reason "adds: not worth a spec", so no drains (and later no damage specs) are planned on them and they are ranked at full Defence; Search / Summary say so. Rule recorded per target with the wiki phase it comes from. Headlines re-pinned (ToA / CoX move); tests per target; independent review (numbers) | done (ToA 14:04.1 → 14:12.1, CoX 6:35.9 → 7:01.3; FA / ToB unchanged; also ToB wave nylocas and the FA Jelly, Search only) |
| 35b | Briefing: one drain line per NPC | User, 2026-10-24: "It says Bork + Smorks. But they are separate bosses. I can't tell which I should use elder/ralos on". The phase 33 encounter summary folds every target of an encounter into the first phase's line; The Smorks (Def 220, floor 0) was hidden under Bork's (300 → 180). A drain event per distinct NPC (targetKey) within an encounter, each labelled with the NPC name ("Bork: [maul] 2 specs [ralos] 2 hits → Def 180 · Smorks: [ralos] 4 hits → Def 5"); the Wear column labels loadouts per NPC the same way; applies to Dagon'hai trio, ToA / CoX / ToB multi-NPC encounters. Tests (Bork + Smorks → 2 events; AG still 1 NPC with 2 parts; Sotetseg 3 resets), verify, docs. UI fix round, no number changes | done |
| 36 | Damage specs vs drains + surge potion + one spec budget per encounter | Model spec **damage** for Voidwaker (guaranteed magic-roll hit), Burning / Dragon claws, Zaryte crossbow (spec: guaranteed hit + bolt proc), bone dagger / Keris (ToA), and any raid-4 reward with a damage spec (check the wiki for the item the user called "Kiston"; record what it is or that it doesn't exist); each costs a slot like a drain weapon, and spec energy is **one budget per encounter shared across its targets and phases** (today every target / phase / drain event starts at 100%, UNVERIFIED B10 / F7 / G7; with the shared budget adds lose out to the boss naturally, re-draining after a Defence reset (Sotetseg, Bloat) costs the energy regenerated since the last event — e.g. 2 Tonalztics carriers cannot fully re-drain Sotetseg three times without regen / Lightbearer / more carriers — and the surge doses have an encounter to land in): the planner chooses per encounter how the budget splits between drains and damage (damage spec value = expected spec damage − the damage the normal attacks would have done in those ticks, converted to seconds at the encounter's DPS), under the same ≥ 1 s per slot rule. Solo and Team ("your share" can be a damage spec; damage specs help only you, so no carriers model). Also a per-boss view (user, 2026-10-24: "best spec weapon per boss"): the Search tab gets a "Spec" column / box listing the expected damage per spec (and seconds saved per spec) of every damage-spec weapon against that boss at the ranked Defence, so the best spec weapon per boss is visible without running a plan. **Surge potion** (user, 2026-10-24; wiki Surge potion, read 2026-10-24: 25% special attack energy per dose, one dose per 5 minutes, cooldown reset on entering a raid, paused between ToB rooms, NOT paused between ToA rooms): a 1-slot kit candidate (4 doses) that adds 25% to the spec budget of an encounter, doses placed along the route at ≥ 300 s intervals from the raid start using the time model's encounter start times (ToB: the pause between rooms means the gap counts fight time only); a second potion only if the route is long enough for > 4 doses and it clears 1 s/slot; Solo and Team (your own energy); the Plan shows "Surge dose before: Bork, Xarth, Ocellus"; the Search tab's Solo drain box gets a "with a surge dose" variant. Headlines re-pinned; tests per weapon (hand-computed expected spec damage vs the upstream spec calc), brute-force on a toy; full independent review; UNVERIFIED rows; docs | done (FA 21:44.4 → 21:04.9, ToA 14:12.1 → 14:05.5, CoX 7:01.3 → 7:03.6, ToB 7:29.5 → 7:21.2; review fixes (one spec bar per party member, damage specs at the hp left, regen on the drained clock): FA 21:07.7, ToA 14:07.8, CoX 7:08.7, ToB 7:23.4; energy not carried between encounters by default (`CARRY_SPEC_ENERGY`); the wiki's Kephri / Warden / Olm Defence resets are drain events; Keris / Bone dagger not modelled (no upstream spec)) |
| 37 | Performance + final review (round 5) | **Performance first** (phase 36 made plans 3–5× slower: browser FA ~38 s, ToA ~51 s, ToB ~72 s, CoX ~112 s; Node CoX 4–7 min; slow suites 30+ min): profile the planner under the budget model and get every raid's browser plan back under ~25 s (CoX under ~40 s) without changing results — candidates: cache the per-event option tables and the DP per (kit drain state, carriers), memoise `specDamage` per (loadout, phase, hp bucket), skip the DP for encounters with one event and no damage specs, lower `MAX_EVENT_OPTIONS` only where it provably costs 0, run the ring screens and subset quick runs on the replayed spec plan without re-allocating; a test pins every headline before/after (bit-identical) and the plan wall time. Then the fresh final pass: UNVERIFIED updated (D27–D29 + in-game checks), ROADMAP rows 33–37 done, README / BEST_SETUP headlines, UPSTREAM_MERGE round 5 | planned |

### Decisions (round 5)

- Nothing is lit in "Specs I bring" unless the user set it; in planner mode the chips mirror the plan.
- An encounter is specced once, at the start; the per-phase lines are details.
- Damage specs compete with drains for the same spec energy; neither is assumed.
- Adds never get specs; spec energy is per encounter, not per target.
- Phase 36 (builder's decisions): every encounter starts at 100% spec energy (`CARRY_SPEC_ENERGY = false`: the time
  between bosses isn't modelled and usually refills the bar; the flag carries the leftover with 0 s of travel); regen is
  credited on the encounter's wall clock and goes to later events / damage specs, not to the event's own start-of-fight
  drains; ties in the DP go to fewer specs, then a top-up spends spare energy on drain reliability; damage specs are
  your own energy (Team: no drain weapon for you then); one surge dose per encounter at most, doses ≥ 300 s apart on the
  route's DPS clock (travel 0 s); the wiki's Defence resets (Kephri final phase, Warden enrage, Olm phases) became drain
  events; the planner's optimiser replays a fixed spec plan, the exact re-time allocates per kit.
- UI standard from phase 34 on (user, 2026-10-24: "very easy to get the information you are looking for, very user friendly"): a raider finds what to wear, what to spec, how many and how long in seconds without reading a sentence; explanations live in tooltips / details. Phase 34 ships before / after screenshots per tab for the user to judge before phase 35 starts.

### Future work (round 6)

From the user's own ToA / CoX / ToB spec routine (2026-10-25; the model's per-boss numbers agree with the routine where
the model covers it, and miss the rest):

- **Spec energy sources**: Death Charge (15% energy per kill — the ToA adds, Kephri's medics / soldiers, Akkha's
  shadows are energy sources, so "adds get nothing" is wrong for damage specs), Liquid adrenaline (ToA: spec costs
  halved for its duration — makes the Zaryte crossbow 37.5% and the clear ToA pick), the ToA Helpful Spirit / Nectar.
- **Damage specs on adds**: allowed (the no-specs rule stays for drains only): Burning claws on the Ice demon (the only
  positive spec there) and Vasa's crystals; the per-boss Specs box already shows them.
- **Crystal halberd** (and Dragon halberd) as a damage-spec candidate: 30% energy, two hits on large targets; the user
  brings it for Bloat; upstream models the spec.
- **Per-boss spec advice in the briefing**: "Ba-Ba: ZCB · Kephri: Voidwaker · Akkha / Zebak / Wardens: ZCB" when the kit
  carries two damage spec weapons (today the plan picks one weapon for the raid).

Found in or carried past the phase 28 review; larger than a review fix, so not done (the damage-specs item moved to phase 35):

- **Teammates' styles in the team time model** (phase 29 review 2): times are hp ÷ (party × your DPS), so a Magic
  defence drain (Eye of Ayak) speeds up every "copy of you" although only the mages gain; carriers are capped at
  "Mages in party" for now (UNVERIFIED D22). Weight the magic-def drain gain by mages ÷ party, or model the
  teammates' styles.

- **Finer quiver rule**: phase 32's kept ammo covers the one-type case when the smallest loadout wears no ammo; a quiver
  could also hold the only arrow / bolt type while a smaller *ranged* loadout fires something else (javelins, darts),
  and javelins / darts could sit in the ammo slot while two arrow / bolt types share the quiver and the slot (UNVERIFIED
  D23, D25).
- **Same-kind ammo swap**: two bolt (or arrow) types free a slot today, but switching between them means a manual swap
  through a free slot; count that swap (or prefer one arrow + one bolt type) once checked in-game (D23).
- **Prayer bonus** (phase 32): items' prayer bonus isn't modelled (the blessing left the presets as zero-value); model
  prayer drain if supplies ever get drunk down (D15).
- **Resupply** in the Plan tab (ToA Helpful Spirit, CoX potions): plan per raid segment instead of one inventory for the
  whole raid (UNVERIFIED D15, D19).
- **ToB supply chests**: the chests between rooms restock brews / restores (Strategies); the Plan could count fewer
  comfort supplies per segment (part of resupply).
- **Spec energy across encounters** (phase 36 shares one budget per encounter; each encounter still starts at 100%,
  `CARRY_SPEC_ENERGY`): model the time between encounters (puzzles, travel) so the leftover can carry; mid-event
  re-drains when energy regenerates; more than one surge dose in a long encounter (UNVERIFIED D27, D29).
- **FA hp / Defence scaling** once measured in-game (UNVERIFIED C1, A11): fill `FRACTURED_ARCHIVE_HP_SCALING`, then
  revisit FA's team-DPS multiplier of 1 (the fight length already uses the party size, B17).
- **Ring screen**: the "≥ +X s (estimate)" of a screen-only ring isn't a bound; a cheap partial-switch pass per ring
  would make it one (UNVERIFIED D18).
- **Footer wording**: `teamTimeLabel(1)` "times: your DPS alone" reads oddly mid-sentence in the page footer; change it
  together with verifyPhase18 / 21 and RaidConfig.test, which pin the text.
