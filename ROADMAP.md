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

Out of scope: Ezekiel, Moia, Dagon'hai Elder/Monks (add later if wanted; they come for free from the data refresh).

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
- Ezekiel, Moia and the Dagon'hai trio (stats come from the data refresh; their mechanics aren't modelled).
