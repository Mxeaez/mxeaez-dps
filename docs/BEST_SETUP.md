# Best setup view (phase 8)

`/best-setup` (dev: http://localhost:3001/osrs-dps/best-setup; "Best setup" button in the top bar, "Calculator" leads
back). Ranks every named preset by DPS against one Fractured Archive boss/phase at a time ("Per boss"), or shows the
best preset for every boss/phase ("Summary"), under three drain states.

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
