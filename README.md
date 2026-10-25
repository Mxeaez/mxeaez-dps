# mxeaez-dps

A fork of the [OSRS Wiki DPS calculator](https://github.com/weirdgloop/osrs-dps-calc) (by Weird Gloop, GPL-3.0),
live at **https://dps.mxeaez.com**.

What this fork adds on top of upstream:

* **The Fractured Archive (raid 4) bosses**: Archive Guardian, The Smorks + Bork, Ezekiel, Dreadnoth the Jellied,
  Moia, Xarth, the Dagon'hai Elder + Monks and Ocellus (all phases), with party size, defence floors and boss-specific
  rules, plus the raid's reward items (Obligator, Zorya's tome, Ascension crossbows, Zeal, elemental fragments).
* **Best setup** (`/best-setup`) with four raid tabs — **Fractured Archive, Tombs of Amascut, Chambers of Xeric,
  Theatre of Blood** — each with the same three tabs, run in a web worker:
  * **Search**: a gear search per boss / phase over a pool of end-game items (the presets seed it);
  * **Plan**: the worn set + switch items that minimise the raid's DPS time within 28 inventory slots (items always
    brought, comfort supplies; the combat potions are chosen from the kit; one camped ring by default, or camp
    Lightbearer / allow ring switches), with its per-encounter times and the route comparison (Fractured Archive: 8
    routes; the old Routes / Encounters tab was merged into it in phase 23);
  * **Summary**: the top search result for every boss / phase.
* **Items I don't own**: cross off items you don't have (kept in your browser). Search still shows the true best and
  greys rows that use them (or "Only items I own"); Plan never uses them.
* A simple view with the rarely changed inputs under **Advanced**, a "?" glossary, and drains shown as weapon icons ×
  count with each spec's chance to land.
* **Drain states** None / Solo / Team: Solo = your own spec weapons within your spec energy, Team = the carriers' first
  round of specs; both rank at the Defence floor when P(floor) ≥ 95%, else at the expected Defence.
* **The planner picks the spec weapons** (Plan tab): Solo tries every set of Elder maul / DWH / BGS / Tonalztics / Eye
  of Ayak with the kit ("Bring: …", with what dropping / adding each changes); Team picks the team's carriers (each must
  save ≥ 1 s of route time; FA 6-man: 2 Elder maul + 2 Tonalztics) and your share ("assign me"). Headline plans
  (defaults, Team; phase 31: nothing pinned by default, the Saturated heart is magic's kit potion, Dizana's quiver holds a
  second arrow / bolt type for free; phase 32: no zero-value switch items, a loadout without ammo keeps the kit's ammo
  in its slot; phase 35: adds such as Kephri's scarabs or the CoX Mystics get no specs; phase 36: one spec budget per
  encounter, damage specs and the surge potion; its review: one spec bar per party member): FA 21:07.7, ToA 14:07.8, CoX
  7:08.7, ToB 7:23.4.
* **Damage specs and the surge potion** (phase 36): Voidwaker, Dragon / Burning claws, Zaryte crossbow and Crimson
  kisten specs compete with the drains for one spec budget per encounter (100% at each boss, regen on the fight's
  clock); the planner brings a damage spec weapon or a Surge potion when it saves ≥ 1 s per slot and says where to drink
  the doses; the Search tab lists every damage spec's value on the selected boss ("Specs (damage)": average damage, gain
  over normal hits, time saved, cost, best gain per 100% energy first).
* **Plans in under a minute** (phase 37): exact memos of the planner's encounter times and passes, and the camp-one ring
  runs spread over parallel workers (FA ~19 s, ToA ~17 s, ToB ~21 s, CoX ~38 s on a 20-thread machine), same results.
* **Times assume N players at your DPS** (the "Players assumed at your DPS" input under Advanced; the page says "times assume N players at your DPS"):
  N defaults to the party size in ToA / CoX / ToB, where upstream scales boss hp with it, and to 1 in the Fractured
  Archive, whose hp scaling is unknown.
* Images served from this repo's `cdn/` folder, so new monsters have images.

**Known limitations** — no fight simulation (no healing, adds, downtime or switch ticks), unverified Fractured Archive
hp / Defence scaling, and the per-raid readings: [docs/UNVERIFIED.md](docs/UNVERIFIED.md) (checklist with in-game
checks, *Known limitations* at the end) and [docs/BEST_SETUP.md](docs/BEST_SETUP.md) (how each tab works). Data sources:
[docs/DATA_SOURCES.md](docs/DATA_SOURCES.md). Merging upstream: [docs/UPSTREAM_MERGE.md](docs/UPSTREAM_MERGE.md).
The work is logged in
[ROADMAP.md](ROADMAP.md) and [PROGRESS.md](PROGRESS.md). See [NOTICE](NOTICE) for license and modification notes,
and [docs/DEPLOY.md](docs/DEPLOY.md) for the Cloudflare Pages setup.

## Local development

Yarn 4 is vendored in `.yarn/releases` (Node 22 LTS, see `.node-version`):

```
node .yarn/releases/yarn-4.9.2.cjs install
node .yarn/releases/yarn-4.9.2.cjs dev     # http://localhost:3001/osrs-dps (or the port Next prints)
node .yarn/releases/yarn-4.9.2.cjs test
node .yarn/releases/yarn-4.9.2.cjs lint
node .yarn/releases/yarn-4.9.2.cjs build   # static export in out/ (stop dev and delete .next first)
```

## Upstream

Web-based DPS calculator for Old School RuneScape, created for the [OSRS Wiki](https://oldschool.runescape.wiki).
The original is at https://tools.runescape.wiki/osrs-dps; please report issues with the base calculator
[upstream](https://github.com/weirdgloop/osrs-dps-calc) ([contributing info](CONTRIBUTING.md)).

## Acknowledgements
* Bitterkoekje's [spreadsheet](https://docs.google.com/spreadsheets/d/1wzy1VxNWEAAc0FQyDAdpiFggAfn5U6RGPp2CisAHZW8/edit?pli=1#gid=158500257) for a lot of initial math, formulas, and more
* Many [OSRS Wiki](https://oldschool.runescape.wiki) contributors for information on items, monsters, spells, and more
* ...and all of the [contributors](https://github.com/weirdgloop/osrs-dps-calc/graphs/contributors) to this project!
