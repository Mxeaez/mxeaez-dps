# Best setup view (phase 8; Search tab phase 9)

`/best-setup` (dev: http://localhost:3001/osrs-dps/best-setup; "Best setup" button in the top bar, "Calculator" leads
back). Ranks every named preset by DPS against one Fractured Archive boss/phase at a time ("Per boss"), or shows the
best preset for every boss/phase ("Summary"), under three drain states; "Search" (phase 9, see the end of this file)
searches a pool of end-game items per slot for setups no preset has.

## Files

| File | What |
|---|---|
| `src/lib/fracturedArchive/presets.ts` | The presets (plain data) and the default assumptions. **Edit this to change setups.** |
| `src/lib/fracturedArchive/bestSetup.ts` | Pure computation (no React): item lookup, targets, drain states, `applyPresetToPlayer`, `evaluateLoadout`, `evaluatePreset`, `computeBestSetup`. Phase 9 should reuse `evaluateLoadout` / `buildTargetMonster`. |
| `src/app/best-setup/page.tsx`, `src/app/components/bestSetup/BestSetup.tsx` | The page. |
| `src/worker/*` | `WorkerRequestType.BEST_SETUP` runs `computeBestSetup` in the calc web worker (the page has its own worker, like the loadout comparison graph). |
| `src/tests/lib/fracturedArchive/Presets.test.ts` | Item names resolve, players are valid, the view's numbers equal a direct `PlayerVsNPCCalc`, ranking order, drain spec counts. |
| `scripts/verifyBestSetup.mjs` | Playwright check (screenshots `docs/screenshots/phase8-*.png`; loads two rows into the main calculator and compares). |

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
- Party size 2 (HP scaling is an identity table, see caveats).
- Solo Ayak damage 80.

The assumptions are kept in page state only (reset on reload). Change the defaults in `presets.ts`.

## Drain states

| State | Defence | Magic defence bonus |
|---|---|---|
| None | undrained | undrained |
| Solo | floor via Elder maul, `maxDrainReductions(m, { weapon: 'elderMaul' })` — + Tonalztics hits for uncapped bosses (Smorks, Dreadnoth, Jelly, The Blade) | Eye of Ayak damage = "Solo Ayak damage" (80 ≈ 2 specs), capped at the boss's magic defence bonus |
| Team | same as Solo | Eye of Ayak to 0 |

The specs used are shown above the table, e.g. "2× Elder maul, 2× Ayak (80 dmg) → Defence 156, Magic def bonus 50".
Ayak spec counts assume 40 damage per successful spec (as in `docs/DATA_SOURCES.md`, *Drain presets*); misses aren't
modelled. Solo and Team only differ for magic.

## How the numbers are computed

Each preset is turned into a player exactly as the main calculator builds one (equipment →
`calculateEquipmentBonusesFromGear`, attack speed, potion boosts as the store's `recomputeBoosts`), and the monster as
the calculator holds it after selecting the boss/phase, party size and pressing the drain buttons (raw stats + inputs,
current HP = scaled HP). `evaluateLoadout` then calls `PlayerVsNPCCalc` like the worker's `COMPUTE_BASIC` handler:
`getDps`, `getTtk` (expected TTK), `getDistribution().getMax()`, `getDisplayHitChance()`. "Load into calculator" adds the
row's setup as a new loadout (or replaces the selected one if all 6 are used) with the same boss, phase and drains, and
opens the calculator — the numbers there are identical (checked by `scripts/verifyBestSetup.mjs`).

TTK is the expensive part (O(HP × max hit)), so it is computed only for each preset's winning style, and in the
Summary only for the top preset.

A preset that fails to evaluate (e.g. a misspelt item) shows as a 0-DPS "Error: ..." row instead of breaking the
view (`safeEvaluatePreset`).

Rows that deal no damage are greyed with the reason (e.g. melee on Archive Guardian (Flying): "Flying: melee can't
reach it"; Ocellus P1 walking / P3 deflect: "Ocellus is praying against this combat style.").

## Results snapshot (default assumptions, 2026-10-22)

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
- Specs are counted as successful; no fight simulation (spec timing, misses, boss healing) — see ROADMAP decisions.

# Search tab (phase 9)

"Search" (third tab on `/best-setup`) searches over end-game items per slot for the selected boss/phase and drain
state and lists the top loadouts by DPS, so a combination no preset has can still win. Boss, phase and drains are shared
with "Per boss"; the Assumptions box applies too. Pick the styles (All / Melee / Ranged / Magic), press **Run search**;
a progress bar shows evaluations done / estimated and the weapon being searched; **Cancel** stops it. "Best per weapon"
switches the table from the top 10 loadouts overall to the best loadout of each weapon (top 10).

Table: rank, DPS, gain vs the best Phase 8 preset of the searched styles (same boss/drains; the preset is named above
the table), expected TTK (winner only, like the Summary), max hit, accuracy, style, the full loadout, the seed the
ascent started from, and **Load into calculator** (same as in "Per boss": adds the exact items incl. the blowpipe dart,
with the boss, phase and drains). Weapons that can't deal damage at all (melee vs Flying, a style Ocellus prays
against) are listed under the stats line instead of in the table.

## Files

| File | What |
|---|---|
| `src/lib/fracturedArchive/searchCandidates.ts` | The candidate pool (plain data, commented). **Edit this to change what is searched.** |
| `src/lib/fracturedArchive/search.ts` | The search (pure): `runGearSearch`, `prunePool`, `spellsForMonster`, `searchRowToPlayer`. |
| `src/worker/searchWorker.ts`, `searchWorkerClient.ts` | `WorkerRequestType.BEST_SETUP_SEARCH`: own worker per run, progress messages, cancel = terminate. |
| `src/app/components/bestSetup/SearchView.tsx` | The tab. |
| `src/tests/lib/fracturedArchive/Search.test.ts` | Pool data, pruning, spells, search properties (see below). |
| `scripts/verifyGearSearch.mjs` | Playwright check (screenshots `docs/screenshots/phase9-search-*.png`). |

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
