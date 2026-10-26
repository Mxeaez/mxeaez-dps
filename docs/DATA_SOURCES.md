# Data sources — The Fractured Archive

All values below were fetched on **2026-10-22** from the OSRS Wiki (page wikitext via `?action=raw`, and the
`infobox_monster` Bucket table through `scripts/generateMonsters.py`). The wiki infobox is the source of truth;
`cdn/json/monsters.json` is generated from Bucket and was checked field-by-field against each page's infobox
(hitpoints, all six skill levels, all offensive and defensive bonuses incl. light/standard/heavy and flat armour,
elemental weakness + percent, size, attack speed, attributes, id). The UI was then checked with
`node scripts/verifyFracturedArchiveMonsters.mjs` (screenshots in `docs/screenshots/phase1-*.png`).

**NPC id reference (from phase 2 fixes on):** RuneLite's cache-derived gameval list,
https://github.com/runelite/runelite/blob/master/runelite-api/src/main/java/net/runelite/api/gameval/NpcID.java
(fetched 2026-10-22). Raid ids: Bork 16640, Smorks 16641, Dagon'hai leader 16643 / unshielded 16644, minion 1 16645 /
16646, minion 2 16647 / 16648, Ezekiel 16652, Guardian 16659 / unshielded 16660, Dreadnoth 16665, Jelly 16666, Moia
16667, Ocellus intro (met) 16673, P1 16674, P2 16675, P2 sword hitbox ("The Blade") 16676, P3 16677, Blade vault-entry
NPC 16683 (cutscene/entry, not a combat target), Xarth 16684.

Fields marked **unverified** are not taken from the wiki or are guesses. Anything not listed as unverified matches
the wiki infobox exactly. **The user-facing checklist of every unverified value, with how to check it in-game, is
[UNVERIFIED.md](UNVERIFIED.md).**

Common sources:

- Raid page: https://oldschool.runescape.wiki/w/The_Fractured_Archive
- Strategy page: https://oldschool.runescape.wiki/w/The_Fractured_Archive/Strategies
- Hotfix news (drain caps), quoted on the boss pages: https://secure.runescape.com/m=news/the-fractured-archive---out-today?oldschool=1

## Raid-wide notes (for phase 2)

- HP scaling: "All bosses' hitpoints scale to the amount of players present in the raid, with the minimum scaling
  being set to two players if the player enters alone." (raid page, *Mechanics/overview*). See
  *Party-size HP scaling (phase 2 research)* below — no formula or per-size numbers exist anywhere we could find,
  so the calculator uses the infobox HP for every party size (**unverified**).
- Defence drain cap of 60% of base defence (21 Oct 2026 hotfix). **Sources disagree on the list:** the raid page
  *Changes* section lists Archive Guardian, Ezekiel, Moia, Xarth, Ocellus; the news quote on every boss page lists
  Archive Guardian, **Bork**, Ezekiel, Moia, Xarth, Ocellus. Bork's own page states his floor (180), so we treat Bork
  as capped.
- **"Maximum defence reduction" table** (Strategies → *Equipment/Inventory* section, wikitable captioned
  "Maximum defence reduction", columns initial / lowest defence / reduction method) gives lowest defence:
  Archive Guardian 156, Ezekiel 78, Bork 180, **The Smorks 0**, Moia 117, **Dreadnoth 0**, Xarth 102,
  Ocellus P1 129, **The Blade (Phase 2) 0**, Ocellus P3 150; Dagon'hai Elder/Monk "-" (not given).
  This is consistent with the 60% cap applying only to the hotfix NPCs and everything else being fully drainable.
- **Conflict — Ocellus P2 floor:** the Ocellus page body says "150 in phases 2 and 3 (`250 × 0.6`)"; the Strategies
  table says The Blade (Phase 2) can be drained to **0** (2 Elder Maul + 4 Tonalztics of Ralos).
  **Recommendation for phase 2: use 0 for P2** (uncapped), marked **unverified**. Reasons: the P2 target is a separate
  NPC (The Blade, `TFA_OCELLUS_P2_SWORD_HITBOX` id 16676 — see Ocellus section), the hotfix/news list names "Ocellus" and not The Blade, the table
  is NPC-specific and lists a concrete drain sequence (looks empirical), while the page-body sentence reads as
  arithmetic applied to the infobox defence of both 250-defence versions. Keep the floor a per-monster constant so
  it is a one-line change if 150 turns out to be right.
  **Resolved (phase 6 review, 2026-10-22): 0 is verified.** The official news post (https://secure.runescape.com/m=news/the-fractured-archive---out-today?oldschool=1,
  hotfix section) says: "The following NPCs should have no cap on their Defence Reduction, meaning their Defence can
  be reduced to 0: Dreadnoth, the Smorks, the Dagon'Hai Trio, The Blade (Ocellus P2)". The Ocellus page's "150 in
  phases 2 and 3" is wrong for P2 (150 applies to P3 only).
- Floors to use: Archive Guardian 156, Ezekiel 78, Bork 180, Moia 117, Xarth 102, Ocellus P1 129 / P3 150;
  The Smorks, Dreadnoth, Jelly and Ocellus P2 0 (no cap; P2 verified by the news post above; Jelly not in the table or
  the news list, assumed uncapped, **unverified**).
- Practice mode lets the boss be started at a chosen phase (raid page) — irrelevant to stats.
- Monster images in `cdn/monsters/` are committed. Production serves them from our own `/cdn` (phase 10,
  `NEXT_PUBLIC_CDN_URL`); `yarn dev` loads them from the deployed copy (`.env.development`), so a new image only shows
  in dev after a deploy.

## Party-size HP scaling (phase 2 research, 2026-10-22)

Result: **no published data**. The calculator keeps the wiki infobox HP for every party size 2–8 (solo counts as 2)
through an identity table `FRACTURED_ARCHIVE_HP_SCALING` in `src/lib/scaling/FracturedArchive.ts`, flagged
**unverified** in code and with an "unverified" marker next to the party size input. When real numbers appear,
only that table changes (factor per size; the infobox HP must stay the value at the size it was recorded for).
**Defence** (and every other stat) is assumed **not** to scale with party size: the wiki mentions hp only (round 2
decision, **unverified**, docs/UNVERIFIED.md A11; CoX scales Defence, ToA scales the NPC defence roll by raid level,
ToB scales hp only).

What was checked:

- **Wiki** (`?action=raw` of The Fractured Archive, The Fractured Archive/Strategies, Archive Guardian, The Smorks,
  Bork, Dreadnoth the Jellied, Xarth, Ocellus, Ezekiel, Moia): only the one sentence quoted above. No HP-by-team-size
  table, no formula. The infoboxes have a single `hitpoints` value with no note on which team size it represents
  (**unverified**). The only scale-specific number is the Archive Guardian *shield* "1490 health shield in 6-scale"
  (Strategies → *Archive Guardian*), which is not the HP bar (infobox 550) and doesn't pin a size or a curve.
- **Gearscape** (https://gearscape.net/calculators/dps, driven with Playwright 2026-10-22): Fractured Archive
  monsters have a `fractured` attribute and a `defence_floor` field but **no party/team size control and no HP
  scaling** — the monster settings panel has no inputs, and the client bundle only has `partySize` inputs for CoX,
  ToB and ToA. HP shown is the infobox HP (AG 550, Bork 1500, Smorks 600, Dreadnoth 2100, Xarth 2600, Ocellus
  P1 2500 / P3 5250, Ezekiel 3000, Moia 785; The Blade 0). So there is no Gearscape HP-by-size table to record.
- Gearscape's `defence_floor` values (api.gearscape.net `/api/monster/id/<id>`) match our agreed floors exactly:
  AG 156, Bork 180, Xarth 102, Ocellus P1 129, P3 150, Ezekiel 78, Moia 117, Smorks 0, Dreadnoth 0, Jelly 0,
  **The Blade (P2) 0** — independent support for P2 = 0.
- Gearscape lists **16674 as "ocellus (phase 2) (the blade)"** — wrong: RuneLite gameval has 16674 =
  `TFA_OCELLUS_P1` (the wiki is right). Gearscape's 16642 "bork (stunned)" is `TFA_BORK_SMORK_HP_UI_HANDLER`, not a
  Bork form, so the stunned state stays a phase-4 modelling question.
- Web search (2026-10-22) for per-player HP numbers: only launch guides repeating "2–8 players, solo = 2-scale".

## Archive Guardian

| Field | Value |
|---|---|
| Source | https://oldschool.runescape.wiki/w/Archive_Guardian |
| Fetched | 2026-10-22 |
| NPC id(s) | 16659 (both versions) |
| Versions | `Flying` (fire 80%, attribute flying), `Grounded` (fire 40%, no attributes) |
| Verification | All fields match infobox; UI matches (`phase1-archive-guardian-flying.png`, `phase1-archive-guardian-grounded.png`) |
| Unverified fields | none |

Mechanics for later phases:

- Defence floor 156 (`260 × 0.6`) — page body, citing the 21 Oct news.
- Immune to Ancient Magicks (page body). The calculator has no immunity field for this — phase 3 must block/flag it.
- "Magic level reducing effects (Accursed sceptre, etc.) seem to be absorbed" (page body) — magic drains don't work.
- Flying vs Grounded: while flying only ranged, magic and halberds can hit it (Strategies → *Archive Guardian*);
  the `flying` attribute already makes upstream block melee except halberds and salamanders (`PlayerVsNPCCalc.ts`, `MonsterAttribute.FLYING` check). Grounded after the shield bar is depleted.
- Fire weakness 80% flying → 40% grounded (page body + infobox).
- Shield bar: damage while flying goes to a shield, not HP; charging the inert guardians does ~40% of the shield
  ("596 damage to 1490 health shield in 6-scale") (Strategies → *Archive Guardian*). Shield HP is not in the infobox
  (**unverified**, community note).
- Below 30% HP it flies permanently with no shield (Strategies) → use the Flying version for the last 30%.
- Strategy box lists "Weak to Heavy Ranged, 80% fire weakness, 20 Crush Defence".

### Phase 3 — how each mechanic is modelled (re-read 2026-10-22: page `?action=raw` + Strategies → *Archive Guardian*)

| Mechanic (wiki wording) | Calculator |
|---|---|
| Two infobox versions. Flying: `flying`, fire 80%, slash 110 / light 75 / standard 120. Grounded: no attributes, fire 40%, slash 90 / light 50 / standard 115. Other stats shared. | Two monster versions from the wiki, unchanged. Weakness % goes through upstream's spell-element code (max hit `+ trunc(base × %)`, accuracy `+ trunc(roll × %)`); only fire spells benefit, powered staves (no element) don't. |
| "ranged, magic and halberds can damage it in this state" (flying) | Upstream `MonsterAttribute.FLYING` rule in `isImmune`: melee deals 0 unless the weapon is a polearm (halberds) or a salamander. Salamanders aren't named by the wiki but are upstream's generic flying rule — kept. Spears/hastas, scythes etc. deal 0 while flying. |
| "It is immune to Ancient Magicks." | New `src/lib/fracturedArchive/immunities.ts` (`SPELLBOOK_IMMUNITIES`): any `ancient` spellbook spell → `isImmune` returns true (0 damage, same as upstream's Fareed spell immunity) and a spell warning ("The selected monster is immune to this spell.") shows next to the spell in the UI. Applies to both versions (one NPC). |
| "Magic level reducing effects [Accursed sceptre], etc.) seem to be absorbed." | Same module, `MAGIC_DRAIN_IMMUNE_IDS`: in `DefenceReduction.ts` the Magic level can't go below its undrained value for AG, so accursed (magic part), seercull and BGS overflow don't lower Magic. The **Defence part of the accursed spec still applies** (wording only covers magic level effects; floor 156 still applies). "seem to be" = community observation (**unverified** whether truly all magic drains). |
| Shield bar while flying ("1490 health shield in 6-scale", charging inert guardians ≈ 596) | **Not modelled.** Both versions keep the infobox 550 HP, so TTK on Flying = time to remove 550 HP (the final flying phase), not the shield. Reasons: shield HP is a single community note at one party size with no scaling curve (**unverified**), and the HP-bar phases are what TTK should measure. If shield TTK is wanted later, add it as a phase-8 helper, not as monster HP. |
| "After reaching 30% health, the Guardian immediately begins flying … no longer possess a shield" | No new version: the wiki gives no separate stats, so use the **Flying** version for the last 30% (flying rule + 80% fire weakness) — **unverified** that stats equal the shielded flying form. RuneLite id 16660 `TFA_GUARDIAN_UNSHIELDED` is probably this form (already in `ARCHIVE_GUARDIAN_IDS`). |
| "During the downed phase the fire weakness goes from 80% down to 40%" | = Grounded version. |
| Defence floor 156 | Phase 2 (`FracturedArchive.ts`). |
| Mushrooms/weary (slower attack speed), tendrils, laser, vengeance | Player-side or positional; not modelled (no effect on the calc's per-attack DPS; weary would reduce attack speed but no amount is published). |

## The Smorks

| Field | Value |
|---|---|
| Source | https://oldschool.runescape.wiki/w/The_Smorks |
| Fetched | 2026-10-22 |
| NPC id(s) | 16641 |
| Verification | All fields match infobox (flat armour 2, earth 85%); UI matches (`phase1-the-smorks.png`) |
| Unverified fields | none |

Mechanics (Strategies → *Bork and the Smorks*):

- Not in the hotfix cap list; Strategies "Maximum defence reduction" table: 220 → **0** (fully drainable).
- Immune to cannon; not burn immune.
- If Bork dies first, the Smorks enrage (faster, stronger attacks — doesn't change defensive stats).
- Every 25% damage taken by the Smorks adds +2 flat armour to Bork (see Bork).

## Bork

| Field | Value |
|---|---|
| Source | https://oldschool.runescape.wiki/w/Bork |
| Fetched | 2026-10-22 |
| NPC id(s) | 16640 |
| Verification | All numeric stats match; UI matches (`phase1-bork.png`) |
| Mismatch | **flat_armour**: wiki infobox is the text `8-14 (Base), 0 (Stunned), 2 (Magic resistance)`, Bucket has no number, so the generator stores `0`. monsters.json is left as generated; since phase 4 the calculator sets it from the Phase input (see below). |

Mechanics (page body + Strategies → *Bork and the Smorks*):

- Defence floor 180 (`300 × 0.6`) — page body (news quote). Not in the raid page's hotfix list (see raid-wide notes).
- Flat armour 8 at full Smorks HP, +2 per 25% damage dealt to the Smorks, max 14. Magic attacks are reduced by 2
  instead ("2 Magic resistance") — i.e. melee/ranged hits −8…−14, magic hits −2.
- Stunned by a heavy cannonball: damage reduction removed (flat armour 0) **and all melee attacks are successful
  hits** (100% accuracy) for a short time. Recommended gear assumes "Stunned, reduced Defence".
- Immune to cannon; xp bonus 60%.

### Phase 4 — Bork and the Smorks, how each mechanic is modelled (re-read 2026-10-22)

Sources: `Bork?action=raw`, `The_Smorks?action=raw`, Strategies → *Bork and the Smorks*, `Flat_armour`,
`Magic_resistance`, `Successful_hit` (all `?action=raw`, 2026-10-22).

**Encounter flow (wiki):** a duo fight "similar to that of the Royal Titans". Both NPCs are attackable from the start
and have separate HP bars (Bork 1500, Smorks 600; no shared HP). Bork chases and melees his target; the Smorks sit in the
centre on a cart, attack everyone else with ranged/magic, and fire incendiary and heavy cannonballs. A heavy cannonball
that lands on Bork dazes him "for a short time" (no duration given). When one dies the other enrages: Bork dead → the
Smorks attack faster, hit everyone, hit harder; Smorks dead → Bork's stomps cover the arena. "It is highly recommended
to kill Bork first." So the number that matters for gear is DPS on Bork with the Smorks near full HP (armour 8), plus
melee burst during stuns; Smorks DPS matters second (they're killed after Bork, with Bork's armour irrelevant by then).
The wiki's recommended Bork gear is labelled "Stunned, reduced Defence" with the footnote that Soulreaper/Scythe are
"Significantly worse when not stunned" (flat armour per hitsplat).

| Mechanic (wiki wording) | Calculator |
|---|---|
| "starting at 8 flat armour at 100% health, and adding 2 flat armour every 25% damage the Smorks take", "up to a maximum of 14" | Bork Phase input (`BORK_FLAT_ARMOUR_BY_PHASE`, `src/lib/fracturedArchive/constants.ts`): `Smorks 100-76% HP (armour 8)` (**default**), `75-51% (10)`, `50-26% (12)`, `25-0% HP (14)`, `Stunned (armour 0)`. `applyBorkFlatArmour` (`src/lib/fracturedArchive/bork.ts`, run inside `applyFracturedArchiveScaling`) sets `defensive.flat_armour`; no/unknown phase = 8. Boundaries (exactly 75% HP → 10) and "Smorks dead = 14" are read from "every 25% damage … max 14" (**unverified** at the exact thresholds). |
| Flat armour: "all melee and ranged attacks are reduced by 8" | Upstream applies `flat_armour` in `applyNpcTransforms` per hitsplat, only to accurate hits, minimum 0, never to magic (matches the `Flat_armour` wiki page). Upstream raises accurate 0s to 1 before that, so an accurate roll ≤ armour deals 0. Multi-hit weapons (Scythe 3 splats on size 4, claws, dual macuahuitl …) lose the armour on every splat. |
| "2 Magic resistance, meaning that … magic attacks [are reduced] by 2" | New `getMagicResistance` (2 for Bork unless stunned) + a 5-line hook after upstream's flat armour block in `PlayerVsNPCCalc.applyNpcTransforms`: −2 per accurate magic hitsplat, min 0. Applies equally in all four unstunned options. Upstream treats the Voidwaker spec as magic, so it also gets −2 (**unverified**; the wiki says the Voidwaker spec ignores *flat armour*, nothing about magic resistance). |
| Stunned: "temporarily removing his damage reduction and all melee attacks on him are dealt as successful hits for a short time" | `Stunned (armour 0)`: flat armour 0, magic resistance 0 ("removing his damage reduction"; that this includes the magic resistance is **unverified**), and `hasGuaranteedMeleeAccuracy` → `getHitChance` returns 1.0 for melee styles only (3-line hook next to upstream's Eclipse Moon clone rule). Ranged and magic accuracy unchanged. Stun duration/uptime is not published (**unverified**) — the option shows burst DPS during a stun, not an average. |
| Defence floor 180 | Phase 2; holds in every Phase option (test). |
| Incendiary cannonballs hitting Bork ("moderate damage"), burn, thralls, drum attack speed, enrage | Not modelled: external damage or enemy offence only. |
| Smorks: flat armour 2, magic defence 400, earth 85%, 600 hp, drainable to 0, cannon immune | Infobox stats unchanged; upstream flat armour 2 applies to melee/ranged per hit, not magic. No other damage-changing mechanic on the wiki (no shield/immunity; "If Bork dies first" only changes their attacks). Nothing else needed. |

Party size: the input now shows 2 (not 1) when a Fractured Archive boss is selected (`MonsterContainer` effect,
same pattern as the phase reset); the calc already clamped to 2.

## Dreadnoth the Jellied

| Field | Value |
|---|---|
| Source | https://oldschool.runescape.wiki/w/Dreadnoth_the_Jellied |
| Fetched | 2026-10-22 |
| NPC id(s) | 16665 |
| Verification | All fields match infobox (demon, fire 85%); UI matches (`phase1-dreadnoth.png`) |
| Unverified fields | none (attack style blank on wiki → `style: null`) |

Mechanics (Strategies → *Dreadnoth the Jellied*):

- Not in the hotfix cap list; Strategies "Maximum defence reduction" table: 125 → **0** (fully drainable).
- Demon, but "has low demonbane values" (Strategies). The number is on
  https://oldschool.runescape.wiki/w/Demon_(attribute) → *List of monsters*: **25% effectiveness** (phase 5; see
  below).
- Freeze resistance 40%; scorching bow spec can root him (demon).
- At 85/65/45% HP: slam + spawns jellies. At 25% HP: jump-slams that heal ~30–40 if not avoided; absorbs live jellies
  to heal. On death spawns ~10 jellies that must be killed to end the encounter.

## Jelly (Dreadnoth)

| Field | Value |
|---|---|
| Source | https://oldschool.runescape.wiki/w/Jelly_(Dreadnoth) |
| Fetched | 2026-10-22 |
| NPC id(s) | 16666 |
| Verification | All fields match infobox (61 hp, demon, fire 60%, negative light/heavy defence); UI matches (`phase1-jelly-dreadnoth.png`) |
| Unverified fields | none |

Mechanics: add during Dreadnoth; drain prayer on every attack; typically barraged (Strategies). Freeze resistance 20%.

## Xarth

| Field | Value |
|---|---|
| Source | https://oldschool.runescape.wiki/w/Xarth |
| Fetched | 2026-10-22 |
| NPC id(s) | 16684 |
| Verification | All fields match infobox (demon, water 85%, attack speed "4 tick" → 4); UI matches (`phase1-xarth.png`) |
| Unverified fields | none |

Mechanics (page body + Strategies → *Xarth*):

- Defence floor 102 (`170 × 0.6`) — page body.
- Demon; "susceptible to demonbane" (page body). He is a Tormented Demon but **has no shield** (Strategies →
  *Phase 1*), so upstream's TD shield logic (`TD_IDS` in `src/lib/constants.ts`) must **not** be applied to 16684.
- Phase 2 at 50% HP: summons Corpses (`Corpse (Xarth)` ids 16687 Normal / 16688 Doused, 20 hp, now in monsters.json)
  that heal him for their remaining HP if they reach him; fire spells make him summon more corpses. That his stats don't change in phase 2 is the builder's inference (the wiki has a single infobox and says nothing either way) — **unverified**.

## Phase 5 — Dreadnoth, Jelly and Xarth: how each mechanic is modelled (re-read 2026-10-22)

Sources (all `?action=raw`, 2026-10-22): `Dreadnoth_the_Jellied`, `Jelly_(Dreadnoth)`, `Xarth`, `Corpse_(Xarth)`,
Strategies → *Dreadnoth the Jellied* / *Xarth* (+ the Equipment section and the "Maximum defence reduction" table),
`Demon_(attribute)`, `Demonbane_weapons`, `Arclight`, `Emberlight`, `Scorching_bow`, `Purging_staff`, `Burning_claws`,
`Duke_Sucellus`; Gearscape `api.gearscape.net/api/monster/id/<id>` for 16665/16666/16684 (no demonbane field).

**Demonbane effectiveness.** https://oldschool.runescape.wiki/w/Demon_(attribute), *List of monsters*: "Unless stated
below, all demons have 100% demonbane effectiveness … Dreadnoth the Jellied: 25% effectiveness … Ocellus: 80%
effectiveness … Xarth: 80% effectiveness". Added on 2026-10-20 (edit summary "per orion", no in-game citation), so
the values are wiki-sourced but **unverified**. None of the boss pages, the item pages or Gearscape give a number;
the Arclight/Emberlight pages only give the Duke example (70% → 49%). Note: the phase 5 brief expected Xarth to take
the full demon factor; the wiki says 80%, and the wiki wins.

| Mechanic (wiki wording) | Calculator |
|---|---|
| Dreadnoth "is considered a demon, however he has low demonbane values" → 25% effectiveness | New `src/lib/fracturedArchive/demonbane.ts` (`DEMONBANE_EFFECTIVENESS`), read by upstream's `BaseCalc.demonbaneVulnerability()` (the same switch that gives Duke Sucellus 70, Yama 120, Ice demon 115) — 2-line edit. Every demonbane effect upstream models scales: percent = `trunc(weapon% × 25 / 100)` → Arclight/Emberlight +17% (not +70), Silverlight/Darklight +15%, scorching bow +7%, burning/bone claws +1%, demonbane spells 20/40/80% → 5/10/20%, holy water 60 → 15, Mark of Darkness damage (25%, 50% with the purging staff) → `trunc(trunc(hit × 50/100) × 25/100)`. Truncating the scaled percent (17.5 → 17) is upstream's rounding (**unverified** in-game). |
| Xarth "susceptible to demonbane" → 80% effectiveness | Same table: Arclight/Emberlight +56%, scorching bow +24%, purging staff + MoD accuracy +64%, damage `trunc(trunc(hit/2) × 0.8)`. |
| Jelly (Dreadnoth): demon, not listed | 100% (default). |
| Dreadnoth fire 85%, Jelly fire 60%, Xarth water 85% | Infobox weakness through upstream's spell-element code (tests: Fire Surge 44 on Dreadnoth, Water Surge 44 on Xarth, Fire Surge 38 on a Jelly). |
| Dreadnoth defence 125 → 0, Xarth 170 → 102 (drain table, Xarth page) | Phase 2 floors; tests with DWH/BGS incl. DPS at the floor. Jelly 0 (assumed). |
| Immunities: Dreadnoth/Xarth `poisonresistance = 100`, `immunecannon = Yes`, `immuneburn = No`; Jelly cannon-immune; freeze resistance 40 / 20 / blank | Nothing to model: the calculator has no poison/venom or cannon damage, burn (burning claws / scorching bow specs) is allowed by default, freeze resistance doesn't change damage. Neither page has damage caps, prayers, weakness changes or flying/size quirks. |
| Dreadnoth heals ~30–40 from an un-dodged slam below 25%, absorbs live jellies; "On death, the boss will spawn around ten jellies. Once these jellies are killed, the encounter ends." | Not modelled (healing/adds are encounter time, not per-attack DPS). Jellies (61 hp, negative light/heavy ranged defence) are selectable; the wiki recommends Ice/Blood Barrage or the Venator bow (AoE) for them, which the calculator rates per target only. |
| Xarth P1 magic only, "does not have a shield" (unlike other Tormented Demons), attacks faster | Upstream's TD rules are keyed on `name === 'Tormented Demon'` / `TD_IDS`; Xarth matches neither (regression tests: no 20% shield reduction on a whip, no TD accuracy override, a stale "Unshielded" phase input changes nothing). |
| Xarth P2 (below 50%): ranged + melee, static in the centre; corpses heal him for their remaining HP (200 healed → AoE); fire spells summon more corpses | No phase option: one infobox and no stat change described, so P2 uses the same stats (**unverified**). Corpse healing not modelled; corpses (16687/16688) are selectable. Fire spells on Xarth do normal damage but cost corpses in P2. |
| Strategies advice: Dreadnoth "it is recommended to range or mage him from afar" (his melee hits everyone around him); Xarth "particularly vulnerable to crush" (crush def 20) | Advice only; relevant to phases 8/9. |

## Ocellus

| Field | Value |
|---|---|
| Source | https://oldschool.runescape.wiki/w/Ocellus |
| Fetched | 2026-10-22 |
| NPC id(s) | Phase 1: **16673** (`TFA_OCELLUS_INTRO_MET`, pre-fight form; the id the wiki infobox and monsters.json use) and **16674** (`TFA_OCELLUS_P1`); Phase 2: **16675** (`TFA_OCELLUS_P2`) and **16676** (`TFA_OCELLUS_P2_SWORD_HITBOX`, The Blade), not on the wiki infobox → manual id **100090**; Phase 3: 16677. Hooded Figure (pre-fight NPC) 16672. Ids per RuneLite gameval NpcID. |
| Verification | P1 and P3 match infobox; P2 matches the infobox values that exist; UI matches (`phase1-ocellus-p1/p2/p3.png`) |

Ocellus Phase 2 — decision: **attackable, added as a manual entry** in `scripts/manual_monster.json`.

The thing being hit is the sword hitbox NPC **16676** (`TFA_OCELLUS_P2_SWORD_HITBOX`, "The Blade"); the phase-2 Ocellus
NPC is 16675 (`TFA_OCELLUS_P2`) (RuneLite gameval NpcID). The Strategies drain table calls the P2 row "The Blade
(Phase 2)". *Correction (phase 2 fixes):* phase 1 named The Blade (Repaired), id 16683, as the target — 16683 is
`TFA_BLADE_NPC_VAULT_ENTRY`, an entry/cutscene NPC, and is not used. The manual entry keeps the synthetic id
**100090** (its stat block comes from Ocellus's infobox version 2, and a later wiki row for 16675/16676 would otherwise
duplicate an id); `OCELLUS_P2_IDS` lists 100090, 16675 and 16676.

P2 is limited by time (three quadrant cycles, Strategies → *Phase 2*), not by HP, so HP-dependent effects (ruby bolt
procs scaling with current HP, TTK, overkill, any "% of HP" effect) are unreliable for this entry.
Strategies → *Ocellus / Phase 2*: "Players attack the charging sword during phase 2 … The Blade stores all damage
dealt during this phase and releases it at the end of each quadrant, effectively transferring half of all damage dealt
to the boss's phase 3 health bar." So P2 is attackable with its own defence (wiki infobox version 2: def 250, magic 220,
stab 150 / slash 120 / crush 10 / magic 100 / light 100 / standard 110 / heavy 80) but has no HP pool of its own.

| Ocellus P2 field | Value | Status |
|---|---|---|
| id | 100090 | **non-wiki** (manual id, same 1000xx scheme as upstream's Yama entries) |
| hitpoints | 5250 | **unverified** — no P2 HP exists (phase is time-limited); set to the P3 pool its damage feeds (at 50%) |
| level (combat) | 0 | **unverified** — blank on wiki; not used by the calculator |
| attributes | none | **unverified** — wiki lists `demon` only for versions 1 and 3; version 2 is blank (the target is the Blade/sword, so plausibly not a demon) |
| offensive bonuses | 0 | wiki blank for version 2; P2 doesn't attack (attack speed 0) |
| speed 0, size 3, skills atk 1 / str 1 / def 250 / magic 220 / ranged 1, all defensive bonuses, image `Ocellus_(phase_2).png` | — | wiki |

Mechanics (page body + Strategies → *Ocellus*):

- Defence floor 129 in P1 (`215 × 0.6`), 150 in P3 (`250 × 0.6`) — page body. P2: page body says 150, Strategies
  table says 0 — resolved: **0, verified** by the news post (see *Raid-wide notes*). 21 Oct hotfix: "Ocellus will
  no longer restore his Defence when moving to a new quadrant during phase 3" (page *Changes*) — drains persist
  through P3/P4.
- Multi-id: P1 uses ids 16673 and 16674; any `OCELLUS_IDS` constant in phase 6 should list 16673, 16674, 16677 and
  the manual 100090 (upstream pattern: e.g. `VARDORVIS_IDS`, `TD_IDS` list every NPC id and test `includes(monster.id)`).
- P1: the Strategies page calls the P1 bar "shield durability" (presumably the infobox P1 hitpoints, 2500 — **unverified**); Protect from Melee while walking between corners (Strategies →
  *Phase 1*). Demon (scorching bow can root).
- P2: only 50% of damage carries over to P3 HP (see above) — DPS vs P2 should be halved for TTK purposes. *Phase 6:* hp kept at 5250, UI hint instead (table below).
- P3: "Ocellus's Protect from Melee overhead icon will now properly appear in phase 3" (page *Changes*, 21 Oct
  hotfix). *Resolved (phase 6 review):* the news post (https://secure.runescape.com/m=news/the-fractured-archive---out-today?oldschool=1) lists it as a bug: "The boss'
  Protect from Melee can carry over from phase 1 into phase 3, but the overhead icon is not visible, leading to some
  players suggesting there might be an accuracy bug." So it is a P1 → P3 carry-over bug that was hotfixed, not a P3
  mechanic; P3 is correctly left without a Protect from Melee option.
- P3 "Untether...": after a number of special attacks Ocellus floats in the air and "is unable to be reached by melee
  attacks" until he slams down (Strategies → *Phase 3*) — melee uptime in P3 is below 100%.
- P3 other: Censers: Bandosian = next melee hit is a max
  hit, Armadylean = next ranged hit is a max hit, Zarosian = 50% spec restore (Strategies → *Phase 3*).
- "P4" (last quadrant, Strategies → *Phase 4*; same NPC/stats as P3 on the wiki): alternates **Deflect Melee**
  (+Magic per page body) and **Deflect Range** (+Magic), and Soul Split; during the six void explosions Ocellus takes
  **50% reduced damage**; tick-perfect dodges speed up the player's next attack (amount unconfirmed). Void crystals in
  this phase are always max-hit by standard ranged attacks.
- Adds: Void Rift (16678), Void Augmenter (16680), Void Siphon (16679), Void Vine (16681) — 44 hp each, now in
  monsters.json (Void Siphon/Void Vine images failed to download from the wiki).
- Prose says combat level 1,603 in P3; infobox says 1601 (cosmetic, not used).
- Demonbane: https://oldschool.runescape.wiki/w/Demon_(attribute) lists **Ocellus: 80% effectiveness** — implemented
  in phase 6 for the demon versions (P1 ids 16673/16674, P3 16677); P2's attributes are blank, so it gets no demonbane
  bonus at all (same 2026-10-20 "per orion" edit as Xarth/Dreadnoth, **unverified**).

### Ocellus — phase 6 model (2026-10-22)

Re-read on 2026-10-22: `Ocellus?action=raw` (infobox, *Mechanics*, *Changes*), `The_Fractured_Archive/Strategies`
(*Ocellus* → Phase 1–4), `The_Blade` (lore + NPC 16683 only, no combat data), `Demon_(attribute)`, `Dampen_Melee`
(redirect target of the Strategies "Deflect Melee" link), `Soul_Split`, `Protect_from_Melee`, `Ruinous_Powers`,
`Bandosian_Censer`, `Armadylean_Censer`. Code: `src/lib/fracturedArchive/ocellus.ts`, phase lists in
`src/lib/fracturedArchive/constants.ts`, demonbane in `demonbane.ts`, floors in `src/lib/scaling/FracturedArchive.ts`,
tests `src/tests/lib/fracturedArchive/Ocellus.test.ts`, UI check `scripts/verifyOcellus.mjs`.

| Phase | Mechanic (source) | Model |
|---|---|---|
| all | ids P1 16673/16674, P2 100090/16675/16676, P3 16677 | `OCELLUS_P1/P2/P3_IDS` drive floors, demonbane, phase dropdowns, party size and the P2 hint |
| P1 | demon, 80% demonbane (Demon (attribute)) | `DEMONBANE_EFFECTIVENESS` 80 (both P1 ids; 16673 is the id the wiki/monsters.json use) |
| P1 | floor 129 (page, 60% hotfix) | unchanged from phase 2 |
| P1 | "While walking to a quadrant, he will have Protect from Melee active" (Strategies) | Phase option **Walking to a corner (Protect from Melee)**: melee deals 0. Default **At a corner** = no prayer |
| P1 | scorching bow spec roots him (demon); "shield durability" bar | not DPS — not modelled |
| P2 | The Blade: def 250 / magic 220, stab 150 / slash 120 / crush 10, magic 100, ranged 100/110/80 (infobox v2) | manual entry 100090 (phase 1) |
| P2 | no attributes (infobox v2 blank) → no demonbane | no table entry; Emberlight/Arclight get no bonus (test) |
| P2 | floor 0: news post "no cap on their Defence Reduction ... The Blade (Ocellus P2)" (Strategies table and Gearscape agree; the Ocellus page's 150 is wrong for P2) | **0**, verified |
| P2 | timed (3 quadrant cycles), "half of all damage dealt" goes to P3's bar (Strategies) | **HP decision:** keep hp 5250 (option A). DPS shown is damage dealt to the Blade at its own defence, which is what ranks gear; effective P3 damage is DPS / 2. An "effective HP" of 10500 (option B) would only change TTK, which is meaningless on a timed phase either way. UI: "TTK n/a" tooltip next to Party size on P2 |
| P3 | demon, 80% demonbane; floor 150; drains persist across quadrants (21 Oct hotfix) | demonbane 80; floor 150 (all phase options) |
| P3 | "Protect from Melee overhead icon will now properly appear in phase 3" (hotfix); news post: "The boss' Protect from Melee can carry over from phase 1 into phase 3, but the overhead icon is not visible" | a hotfixed P1 → P3 carry-over bug, not a P3 mechanic — correctly not modelled |
| P3 | Untether: floats, "unable to be reached by melee attacks" | positional — not modelled (melee uptime < 100%) |
| P3 | Censers: Bandosian/Armadylean "appears to make the next melee/ranged attack max hit" | single-hit buff, upstream has no "next hit is max" option (only per-monster `ALWAYS_MAX_HIT_MONSTERS`) — not modelled |
| P3 last quadrant ("Phase 4") | cycle Deflect Melee (floating) → Soul Split (landed) → Deflect Range → Soul Split (Strategies) | Phase options **Last quadrant: Deflect Melee**, **… Deflect Ranged** (that style deals 0), **… Soul Split** (no reduction; his healing from it is not modelled). Default **Quadrants 1-3** = no prayer |
| P3 last quadrant | "While the explosions are occurring the boss takes 50% less damage" (Strategies + page body) | Phase options **… Deflect Melee + void explosions**, **… Deflect Ranged + void explosions**: each hitsplat `trunc(hit / 2)` (rounding **unverified**). Explosions happen during the deflect states (Strategies steps 1–3, 6–7) |
| P3 last quadrant | tick-perfect dodges speed up the player's next attack by an "unconfirmed amount" (Strategies + page body) | not modelled (amount unknown); last-quadrant DPS and rankings are therefore low-confidence, faster weapons may gain more than shown |
| P3 last quadrant | void crystals always max-hit by standard ranged | adds, not Ocellus — not modelled |

Unverified in the phase 6 model:

- **Deflect strength.** Neither page says how much of a player's damage Ocellus's Deflect prayers block. The player
  prayer (Dampen Melee, formerly Deflect Melee) blocks "100% of incoming melee damage dealt by NPCs (40% for other
  players)", and the Ruinous Powers table lists the old beta Deflect as "reduces damage ... by 90%". We model a
  **full block** (0 damage), like other NPC protection prayers; P1's Protect from Melee likewise.
- **Magic during deflects.** The Ocellus page body says he prays "reflect melee + mage" and "reflect range + mage";
  the Strategies page says he "will begin to use the [[Deflect Melee]] prayer" / "the [[Deflect Range]] prayer" with no
  magic. Resolution (phase 6 review): the Strategies wording (rev 15377829, revised by several editors) is better
  supported than the page-body sentence (a single edit, rev 15379023, in a *Mechanics* section flagged "Please move
  information to The Fractured Archive/Strategies"), so magic is never blocked in the model. Still **unverified**; if
  the page body is right, magic would deal 0 in all four deflect options.
- Void explosion rounding (rounded down) and whether 1-damage hits become 0 (they do in the model).
- P2 hp 5250 / no attributes (unchanged from phases 1–2). The P2 floor 0 is now verified (news post).

## Phase 15 — Ezekiel, Moia, Dagon'hai Elder + Monks (re-read 2026-10-23)

Sources (all `?action=raw` + rendered, 2026-10-23): https://oldschool.runescape.wiki/w/Ezekiel,
https://oldschool.runescape.wiki/w/Moia, https://oldschool.runescape.wiki/w/Dagon%27hai_Elder,
https://oldschool.runescape.wiki/w/Dagon%27hai_Monk, https://oldschool.runescape.wiki/w/Undead_binder,
https://oldschool.runescape.wiki/w/The_Fractured_Archive (boss table, *Changes*),
https://oldschool.runescape.wiki/w/The_Fractured_Archive/Strategies (*Layout*, *Ezekiel*, *Moia*, *Dagon'hai trio*,
"Maximum defence reduction" table), https://oldschool.runescape.wiki/w/Demon_(attribute), Talk:Moia (stat-block
screenshots only). `Imp_(Dagon'hai_Trio)` has no page yet. Revision history checked: the boss pages were last edited
21–22 Oct (typo / strategy header), Demon (attribute) on 20 Oct ("per orion") — **no change** since phase 5, so
Dreadnoth 25% / Xarth 80% / Ocellus 80% stay as they are.

**Stats verified** field by field (hitpoints, six levels, all offensive and defensive bonuses incl. light / standard /
heavy, flat armour, weakness + percent, size, attack speed, attributes, ids) against the infoboxes: `monsters.json`
matches for all five entries, so the generator was **not** re-run. Notes: the Dagon'hai Elder infobox has
`attack style = 6` and a blank attack speed (an editor slip; generated as style "6", speed 0 — cosmetic, the calculator
doesn't use NPC attack speed for player DPS). Poison / venom resistance 100 and cannon immunity (Dagon'hai) aren't
modelled by the calculator (no effect on player DPS). No infobox lists any attribute (no demon, undead, dragon,
flying), freeze resistance or burn immunity for the three encounters.

### Route structure (Strategies → *Layout*, raid page boss table)

Five bosses; the 1st and 5th are fixed, and for each of the 2nd–4th the team picks one of two:

| Order | Option A (west side) | Option B (east side) |
|---|---|---|
| 1st | Archive Guardian | — |
| 2nd | **Ezekiel** | Bork and the Smorks |
| 3rd | **Moia** | Dreadnoth the Jellied |
| (Quartermaster arrives after the 3rd boss) | | |
| 4th | **Dagon'hai trio** (Elder + 2 Monks) | Xarth |
| 5th | Ocellus (P1 → P2 → P3) | — |

So 2 × 2 × 2 = 8 routes. Best-setup targets are listed in this order (Ezekiel after Bork, Moia after the Jelly,
Dagon'hai after Xarth).

### Ezekiel (id 16652)

| Mechanic (wiki wording) | Calculator |
|---|---|
| Stats: 3000 hp, Defence 130, crush def 35 (stab 150, slash 90), magic def 200 (Magic 200), ranged 445 / 370 / 320, earth 25% | Infobox, unchanged. Earth 25% through upstream's spell-element code (Earth Surge 24 → 30, roll ×1.25). |
| Defence floor 78 (`130 × 0.6`, page body + news hotfix + Strategies table "2 Elder Maul / 1 Elder + 7 Bandos Godsword Damage") | Phase 2 floor; drain plan 2 Elder maul (130 → 85 → 56, capped 78) = the wiki's sequence. Tests via DWH / BGS / Elder maul. |
| Flying Swords: "If Ezekiel is completely hit by a sword ... he will take damage and be stunned for a few seconds. Otherwise, he will heal for a significant amount of HP." Hitting a sword empowers it ("resistant to ranged and very weak to air magic"), raising its damage to Ezekiel and to players | Not modelled: no stat or defence change is described for the stun, and the heal / sword damage are encounter time (phase 16 territory), not per-attack DPS. Sword damage amounts and heal size are unpublished. |
| Enrage at 33.3%: repositions, players are forced into the middle 3×3, he "imbue[s] himself with magic"; lightning pattern ×3 | No stat change described → no phase option (**unverified** that "imbue himself with magic" changes nothing). Strategies recommend high-cost melee specs in enrage (Crimson kisten, Dragon / Burning claws, Abyssal bludgeon), so melee still reaches him. |
| Perfect dodges (swords, lightning) "gives you 3% special attack energy each time" | Not modelled (the phase 14 energy budget only counts regeneration and Lightbearer). Noted for the planner. |
| Tank: the first player in is the tank; cleave; lightning if he can't melee the tank | Defensive only. |

No module: nothing on the wiki changes the damage a player deals beyond the infobox and the floor.

### Moia (id 16667)

| Mechanic (wiki wording) | Calculator |
|---|---|
| Stats: 785 hp, Defence 195, crush 15 / stab 20 / slash 110, magic def 30 (Magic 350), ranged 60 / 120 / 140, air 80% | Infobox, unchanged. Air 80% through upstream's spell-element code (Wind Surge 24 → 43, roll ×1.8). |
| "Moia begins the fight outside of her arena ... A ranged or magic weapon is required as she is too far to reach with melee or halberds." | **Modelled**: `isOutOfMeleeReach` in `src/lib/fracturedArchive/immunities.ts` (list `OUT_OF_MELEE_REACH_IDS`), hooked into `PlayerVsNPCCalc.isImmune` → every melee style (halberds included) deals 0; `BaseCalc` adds the weapon-slot warning "Melee can't reach this monster: use ranged or magic."; `cantHitReason` "Out of melee reach: ranged or magic only". `hittable.ts` picks it up, so the melee hammers can't drain her. The calculator's **Max-drain buttons** fall back to **2 Tonalztics hits** (195 → 152 → 109, capped 117) = the wiki table's "2 Tonalztics of Ralos". The best-setup **Solo** plan uses only the weapons ticked under "My specs": with the default (Elder maul only) it can't drain Moia at all (P(floor) 0%, ranked at Def 195); the **Team** plan uses the default Tonalztics carrier (1 carrier → 99% to 117). The whole fight is treated as unreachable (**unverified**: the wiki never says she comes into melee range, enrage included). |
| Defence floor 117 (`195 × 0.6`) | Phase 2 floor. |
| Undead binders (adds, id 16670, 95 hp, Defence 225, magic def −20) shuffle around; enrage at 33%: binders in a diamond, all must die before her charge completes or the team takes massive damage; "A venator bow is highly recommended" | Not modelled (adds / encounter time). Undead binder is selectable from the generated data. |
| Magic attack, cough (poison-like DoT), ranged auto | Defensive only. |
| Talk page "Does salve work?" (unanswered); no undead attribute in the infobox | No salve / undead bonus. |

### Dagon'hai Elder + Monks (ids 16643/16644 Elder, 16645/16646 Monk staff, 16647/16648 Monk book)

| Mechanic (wiki wording) | Calculator |
|---|---|
| Stats: 640 hp, Defence 100, stab / slash / crush 50, magic def 100 (Magic 290), ranged 80 / 80 / 80, no weakness; Elder and both Monk versions identical | Infobox, unchanged (test: identical DPS). |
| "The elder and monks share the same stats and health pool, so there is no advantage in focusing one of them down." | One best-setup target ("Dagon'hai Elder + Monks", the Elder entry) stands for all three. |
| Shield gauge: "Once the health bar of the three enemies are fully depleted, the Dagon'hai will channel Zamorak's energy ... and restore their shield gauge to full ... After depleting the mages' shield gauge the fifth time ... the cauldron will explode, killing one of the monks instantly ... the remaining enemies only have 7 hitpoints" | **Modelled** as a Phase dropdown on every Dagon'hai id (`DAGONHAI_PHASES`, new `src/lib/fracturedArchive/dagonhai.ts`): **Shielded (shield gauge)** (default) = infobox, **Unshielded (after the cauldron explodes, 7 hp)** = hp 7 (not party-scaled). The shield changes **no** defensive stat (the infobox lists one stat set for both ids of each NPC; the editor's note: "there are also unshielded versions of both NPCs but not sure what differs if anything"), so DPS is identical; only hp / TTK differ. For phase 16: `DAGONHAI_SHIELD_GAUGE_DEPLETIONS = 5`, `dagonhaiEncounterDamage(gauge) = 5 × gauge + 7` (3207 at infobox hp). **Unverified**: that the infobox 640 is the shared gauge per cycle, that it is party-scaled like the other bosses, and that the unshielded ids are only the 7-hp remainder. |
| Defence floor: Strategies table "-"; news hotfix "no cap on their Defence Reduction ... the Dagon'Hai Trio" | 0 (phase 2). Drain plan 1 Elder maul + 2 Tonalztics hits (100 → 65 → 29 → 0). |
| Elemental Channel: "cast the corresponding elemental spell on them ... Players can splash if their magic accuracy is not high enough"; Tome Empowerment (block projectiles); imps from portals ("Players will always land successful and maximum hits on imps. Killing an imp buffs your next attack, although it is not clear how") | Not modelled (utility casts / adds; the imp buff is unknown). Imps have no infobox. |
| Elder attacks with ranged + surge spells; full ritual = wipe | Defensive only. |

### Phase 16 inputs: HP per encounter (infobox, party-size scaling unverified, C1)

Implemented in phase 16 (`src/lib/fracturedArchive/raidTime.ts`, `encounterPlan`; model and settings in
docs/BEST_SETUP.md, *Routes tab*; assumptions in UNVERIFIED.md group D).

| Encounter | HP to deal | Not modelled |
|---|---|---|
| Archive Guardian | 550 | flying shield ("1490 in 6-scale", UNVERIFIED C4) |
| Bork + the Smorks | 1500 + 600 | incendiary cannonball damage to Bork |
| Ezekiel | 3000 | heals when a sword misses him; sword damage when one hits |
| Dreadnoth | 2100 | slam heals, jelly absorption; the ~10 death jellies (61 hp each) |
| Moia | 785 | undead binders (95 hp) that must die in enrage |
| Xarth | 2600 | corpse healing |
| Dagon'hai trio | 3207 = `dagonhaiEncounterDamage(640)` (5 shared gauges + 7) | each gauge restore spawns 6 imps (2 portals × 3) |
| Ocellus | P1 2500; P2 timed (damage to the Blade carries 50% to P3); P3 5250 | Soul Split healing, tick-perfect speed-ups |

The wiki states no ordering rules beyond the 8-route layout above (1st and 5th fixed, one of two for each of the 2nd–4th) and the Quartermaster after the 3rd boss. Ezekiel's perfect dodges give +3% spec energy each (not in the spec budget).

Best setup: targets `ezekiel`, `moia` (note "Out of melee reach"), `dagonhai` (phases Shielded / Unshielded; Summary
row = Shielded only, as Unshielded has the same DPS). Summary: 20 rows × None / Solo / Team = 60 searches. Search spell
list: Fire Surge + the weakness surge (Earth on Ezekiel, Wind on Moia; Fire only on the Dagon'hai).

## Tombs of Amascut (phase 18, read 2026-10-23)

Pages read with `?action=raw`: https://oldschool.runescape.wiki/w/Tombs_of_Amascut,
https://oldschool.runescape.wiki/w/Tombs_of_Amascut/Strategies, https://oldschool.runescape.wiki/w/Akkha,
https://oldschool.runescape.wiki/w/Akkha%27s_Shadow, https://oldschool.runescape.wiki/w/Ba-Ba,
https://oldschool.runescape.wiki/w/Kephri, https://oldschool.runescape.wiki/w/Zebak,
https://oldschool.runescape.wiki/w/Elidinis%27_Warden, https://oldschool.runescape.wiki/w/Tumeken%27s_Warden,
https://oldschool.runescape.wiki/w/Obelisk_(Tombs_of_Amascut). Monster stats: upstream's monsters.json (unchanged).

**Scaling** (upstream `src/lib/scaling/TombsOfAmascut.ts`, verified in-game by upstream's test data): raid page —
"for every 5 raid levels, an NPC's hitpoints, defence, accuracy, and damage are increased by 2% additively"; "the
2nd-3rd member will add 90% of the base health of bosses each, while the 4th and beyond will add 60% each"; "The first
path level will modify most enemy hitpoints and damage by +8%, with every additional level modifying these stats by
+5%". Core: "The health scaling of the core has been reduced by 75%" (Balance Changes Revisited). Worked example
(tested): Akkha 400 → +200% at 500 = 1200 → × 4.6 (6 players) = 5520.

| Mechanic (source) | Upstream | Phase 18 |
|---|---|---|
| Akkha "will always pray against the same style with which he is currently attacking"; "Akkha will change combat styles after he performs six auto-attacks followed by a special attack" (Akkha) | no | phase options + `isImmune` (prayers.ts); time model: equal time under each prayer, hp in proportion to the kit's DPS under each (setting; UNVERIFIED E4) |
| Akkha's shadows: "After reaching 80% ... four shadows ... Once one of these four shadows are dispelled ... repeated at 60%, 40% and 20%"; "fully restores all damaged shadows" (Strategies) | monster only | 4 × shadow hp in the time model |
| Akkha's final stand: "restoring 20% of his maximum health ... with Protect from Magic and Missiles simultaneously active" | no | phase option (melee only) + 20% of hp in the time model |
| Akkha: "he will remain in one quadrant until three successful hits are made" (final stand) | — | documented only (movement, not DPS) |
| Akkha: Defence floor 70; "restores drained levels significantly faster" | floor yes | floor; faster restore not modelled |
| Ba-Ba: floor 60; Rolling Stones at 66% / 33% (boulders take max hits) | floor yes | documented only |
| Kephri: "After the third shield is cleared ... fourth and final phase"; Defence "restored when she enters final phase" (Strategies). The Kephri page says "After two phases of shields" — conflict, Strategies followed (UNVERIFIED E3) | monsters, floor | 3 × Shielded hp + Aggressive hp; drains planned per phase target |
| Zebak "Not Just a Head" invocation: heals "for 2x the damage inflicted" (Strategies, Zebak's invocations) | no | not modelled (UNVERIFIED E8) |
| Kephri: swarms "recover Kephri's shields, usually ~10% or lower ... per swarm"; "capped to roughly ~15% over her max capacity" | no | *Kephri swarm leak* setting (default 0, unverified) |
| ToA Strategies (not the Kephri page): "first shield threshold ... Spitting Scarab ..., the second ... a Soldier and Arcane Scarab" | monsters (no def-roll scaling) | included (setting, default on) |
| Kephri / scarabs kalphite: keris +33% accuracy (breaching), damage bonus | yes | — |
| Zebak: floor 50; "Upon reaching ~25% of his health, Zebak will become enraged, significantly increasing his attack speed" | floor yes | same stats: one target |
| Obelisk: "lowered by a maximum of 40 levels, reducing ... to a minimum of 60" | floor yes | P1 = obelisk hp |
| P2 Warden: "100% accuracy regardless of equipment; however, the damage dealt corresponds to the player's accuracy bonuses" | yes (damage modifier, double Tbow scaling) | — |
| P2 Warden prayers: "Protect from Melee being always active; however Tumeken's Warden will always initially pray against magic, while Elidinis' will always initially pray against ranged" | no | phase options + `isImmune`; time model uses the initial prayers all fight (unverified) |
| P2 core: "Damage dealt to the core deals five times the damage towards the Warden"; "Players will always deal their max hit when using melee against the Warden's core" | always-max melee yes; ×5 no | ×5 in the time model |
| P2 core exposure 21 / 29 / 37 ticks at Warden hp 100-80% / 79.9-60% / 59.9-0% (Strategies table) | no | `CORE_EXPOSURE_TICKS` |
| P2 shield per down = the Active entry's hp (140 base) | — | **unverified** reading (infobox hp of the Active version) |
| P3: floor 120; "Upon reaching 5% of its health ... a one-time heal of 20.0% of its maximum health ... Defence ... raised 30 levels to 180" | floor, Enraged entry (def 180) | 95% at Damaged + 25% at Enraged |
| P3 energy siphons: reversed siphons deal "damage that scales to a percentage of their maximum health" | no | *P3 siphons* setting (default 0; % unpublished) |
| Tumeken's shadow ×4 / fang double accuracy roll / Keris partisan of the sun / Keris partisan of amascut (ToA-only stats) | yes | — |

Invocations other than raid / path level (e.g. Overclocked, Stay Vigilant, Blood Thinners) change attack speeds and
mechanics, not the player's DPS against the bosses, and aren't modelled.

## Chambers of Xeric (phase 19, read 2026-10-23)

Pages read with `?action=raw`: https://oldschool.runescape.wiki/w/Chambers_of_Xeric,
https://oldschool.runescape.wiki/w/Chambers_of_Xeric/Strategies, https://oldschool.runescape.wiki/w/Chambers_of_Xeric/Challenge_Mode,
https://oldschool.runescape.wiki/w/Great_Olm and the pages Tekton, Vasa_Nistirio, Glowing_crystal, Vanguard, Vespula,
Abyssal_portal, Muttadile, Skeletal_Mystic, Lizardman_shaman_(Chambers_of_Xeric), Guardian_(Chambers_of_Xeric),
Ice_demon. There is **no `Chambers_of_Xeric/Scaling` page** (HTTP 404 on 2026-10-23). Monster stats: upstream's
monsters.json (unchanged; the generator skips the CM rows, "handled by the calculator UI").

**Scaling** — upstream `src/lib/scaling/ChambersOfXeric.ts`, pinned to in-game Monster Examine values by upstream's
`src/tests/lib/scaling/ChambersOfXeric.test.ts`. Hp, offence **and Defence** scale with party size: hp × (1 +
trunc(party / 2)); Defence × (100 + iSqrt(party − 1) + trunc(7 (party − 1) / 10))%; offence × (100 + 7 iSqrt(party − 1)
+ party − 1)%; the best player's combat / hp levels (all 99s here: no reduction). CM: +50% offence, hp and Defence; Olm
hp not raised; Glowing crystal not raised; Tekton Defence +20% (< 4 players) / +35%. Wiki support: "The stats of the
enemies in the raid will likewise scale accordingly to the team size" (Chambers of Xeric); "In all rooms, their stats
will scale accordingly" (Strategies); "Apart from the Great Olm's health, all of the enemies' combat stats (including
health) are increased by 50%" (Challenge Mode); changelog "Tekton's defence will scale less harshly for challenge raids
consisting of smaller numbers of players". Worked examples (tested): Tekton 300 hp / Def 205 → 1200 / 215 at 6, CM
1800 / 290; Vasa 1200 / 183, CM 1800 / 274; Olm head 800 + 400 × 5 = 2800 / Def 157 (CM 2800 / 235), claws 600 + 300 ×
5 = 2100. Inputs the tab sets: `isFromCoxCm`, `partySize` (1-15), `partyMaxCombatLevel` 126, `partyMaxHpLevel` 99,
`partySumMiningLevel` 99 × party.

**Olm phase rule**: "In a team size of 1-7, Olm has four phases in total, three standard phases and a head phase. For
every 8 players in the raid, Olm will gain an additional standard phase" (Strategies → Great Olm; Great Olm page: "Olm
has at least four phases, with an additional phase for every 8 players in the raid") → `olmStandardPhases = 3 +
trunc(party / 8)`; upstream's hand / head hp factor `min(party − 1, 50) − 3 trunc(min(party, 50) / 8)` spreads the same
total over the extra phase (claw hp total at 8 = at 7).

| Mechanic (source) | Upstream | Phase 19 |
|---|---|---|
| Tekton "immune to Range and takes 80% reduced Magic damage" | yes (immune, ÷5) | — |
| Tekton enraged after the anvil: "increasing his melee defensive bonuses" (Strategies) | Enraged entry | *Tekton enraged* share (default 20%, UNVERIFIED F1) |
| Tekton anvil: "recovering 1.33% of his maximum health every few ticks"; "no longer resets his Defence when healing at the anvil" | — | *Tekton anvil heal* (default 0); drains carry |
| Tekton: first Elder maul / DWH spec always lands; missed maul / DWH drain 5%, missed BGS 10 levels | no | documented only (F2) |
| Vasa invulnerable at a crystal; crystals "immune to ranged attacks and take 66% less damage from magic", "highly resistant to slash and crush" | crystal immunity / ÷3 | *Vasa crystals* (default 1) × crystal hp, then Vasa |
| Vanguards: "damage must be spread equally to all three"; "they will restore all drained stats upon retreating into their shell" | monsters | 3 × hp; targets `noDrains` (drain state forced to None) |
| Vespula flying (melee-immune); "Upon reaching 20% of her health ... drop to the ground"; "The portal must be destroyed" | melee immunity (Vespula, portal) | 80% of Vespula + the portal (setting: portal only) |
| Mystics 1-2 → 3, 3-5 → 4, 6-8 → 5 … 27+ → 12; shamans 1-4 → 2, 5-9 → 3, 10-14 → 4, 15+ → 5 (Strategies tables) | — | `mysticCount`, `shamanCount` |
| Mystics are undead (Salve) | attribute | Salve amulet(ei) in every style's pool |
| Muttadiles eat at ~50%, "up to 50% of their health", at most three times | — | *Muttadile heals* (default 0 = tree chopped / frozen) |
| Guardians "can only be harmed through pickaxes"; damage × (50 + Mining + pick level) / 150 | yes | 2 × hp; Dragon / Crystal pickaxe in presets / pool |
| Guardian hp: wiki H = 151 (1 + ⌊T/2⌋) + ⌊avg M⌋ T (1198 at 6) vs upstream (151 + avg M)(1 + ⌊T/2⌋) (1000 at 6) | upstream formula | upstream kept (F5) |
| Ice demon −67% unless fire spells / demonbane; magic defence from Defence | yes | kindling / braziers not counted |
| Great Olm is a dragon ("vulnerable to dragonbane weapons") — Dragon hunter weapons **do** apply | attribute | DHL / DHCB in presets, + DH wand in the pool |
| Olm "head has 66% damage mitigation from all non-range attacks ... right hand ... non-mage ... left hand ... non-melee" | magic on head / left claw, ranged on both claws | **+ melee on the head and right claw ÷3** (`cox/damage.ts`, hook in `applyNpcTransforms`) |
| Olm: both claws per hand phase; the head only killable in the final phase; "His stats also reset when a new phase starts" | — | per-phase rows; every target drained independently (F7) |
| Olm left-hand clench / penultimate heal; head life-siphon heal (5×) | — | documented only (F6) |
| Defence floors | none in `getDefenceFloor` | none (drains can reach 0) |

## Theatre of Blood (phase 20, read 2026-10-23)

Pages read with `?action=raw`: https://oldschool.runescape.wiki/w/Theatre_of_Blood,
https://oldschool.runescape.wiki/w/Theatre_of_Blood/Strategies, https://oldschool.runescape.wiki/w/Theatre_of_Blood/Hard_Mode,
https://oldschool.runescape.wiki/w/Theatre_of_Blood/Entry_Mode, https://oldschool.runescape.wiki/w/Dawnbringer and the
pages The_Maiden_of_Sugadinti, Pestilent_Bloat, Nylocas, Nylocas_Vasilias, Nylocas_Ischyros, Nylocas_Prinkipas,
Sotetseg, Xarpus, Verzik_Vitur. Monster stats: upstream's monsters.json (unchanged): every boss has a Normal, Hard
and Entry version (Bloat HM 2400 hp; Xarpus HM 6000 hp / Defence 200; the others' HM stats equal normal; Entry lower).

**Scaling** — upstream `src/lib/scaling/TheatreOfBlood.ts`, hp only ("tob only scales hp and nothing else"):
normal / Hard Mode `trunc(hp × (clamp(party, 3, 5) + 3) / 8)`; Entry Mode `trunc(hp × [10, 19, 27, 34, 40][party − 1]
/ 40)`. Wiki (Theatre of Blood): "With a team of three or fewer players the bosses will have 75% of their original
hitpoints, with four players the bosses will have 87.5% of their original hitpoints and a team of five players will
leave the bosses' hitpoints unchanged" (Strategies: "lowered to 87.5% in 4-man encounters and 75.0% in trio and lower
scales") — matches 6/8, 7/8, 8/8. Cross-checks (tested): wave nylocas "11 health (9 in 4-Scale, 8 in trios)", "22
health (19 in 4-Scale, 16 in trios)"; Prinkipas "300/350/400 health" (Hard Mode page; = 400 × 6/8, 7/8, 8/8). Worked
examples at 4: Maiden 3500 → 3062, Bloat 2000 → 1750 (HM 2400 → 2100), Vasilias 2500 → 2187, Sotetseg 4000 → 3500,
Xarpus 5000 → 4375 (HM 6000 → 5250), Verzik 2000 / 3500 / 3500 → 1750 / 3062 / 3062; Entry Maiden 2000 → 1700 (solo
500). **Upstream id gap**: the Vasilias infobox has "scaledhp = Yes" and ids 8354-8357 / 10807-10810 / 10786-10789, and
the Prinkipas 10803-10806, but upstream's lists start at 8355 / 10808 / 10787 / 10804 — monsters.json uses the first
id, so the boss and the melee Prinkipas weren't scaled. Phase 20 adds 8354, 10807, 10786, 10803.

| Mechanic (source) | Upstream | Phase 20 |
|---|---|---|
| Maiden Defence 200, no floor; "two Elder maul special attacks ... and then 85 damage with the Bandos godsword" (Strategies) | no floor | Team carriers 2 Elder maul + 2 BGS (4-scale plan) |
| Maiden spawns Matomenos "whenever she first reaches 70%, 50%, and 30%"; leaked ones heal "double the amount of their current Hitpoints" | 70/50/30% versions (same stats, hp = remaining; images skipped by copyCdn) | 4 segments; *Maiden nylo leaks* × hp per spawn (default 0) |
| Matomenos hp: Strategies "200 Hitpoints (175 in 4-man and 150 in trios)" vs infobox / monsters.json 100 | 100 | not a target (frozen and barraged); conflict in UNVERIFIED G8 |
| Blood spawns (heal her via trails; HM invulnerable) | monster | not counted |
| Bloat: "any damage dealt to the Bloat while active is halved"; down 32 ticks, "roughly 18 seconds to deal damage"; "If its Defence has been reduced, it will regenerate to full when it stomps" | — | damage only while down; drains for the first down only (`tob-bloat` / `tob-bloat-restored`, *Bloat down* 18 s) |
| Bloat undead, weak to slash, "highly resistant to magic and ranged" | attribute, bonuses | Salve (ei) preset + pool |
| Nylocas: "Each spider is immune to damage outside of their combat style"; Vasilias "immune to damage of the wrong combat style", "always spawn in its melee form", "change forms every 10 ticks (6 seconds) to another form" | — | **style gating** (`tob/damage.ts`): Vasilias form = calculator phase, wave nylocas by name, Prinkipas by version; equal time per form (*Nylo form rotation*) |
| Vasilias wrong style: "the player taking damage they would have dealt to it, and healing it for the same amount" | — | treated as can't hit (the heal isn't modelled) |
| Waves: 31 waves on a fixed schedule; Hard Mode "Three Nylocas Prinkipas ... on the tenth, twentieth and thirtieth wave" | monsters | waves not counted (not DPS-limited); HM: 3 Prinkipas rotations before the Vasilias |
| Sotetseg: Defence floor 100; mazes "At 66.6% and 33.3% health"; "After clearing the maze, Sotetseg's Defence level is restored" | floor 100 (normal / HM ids; not the Entry ids) | thirds, each drained again |
| Xarpus: P1 "starting with 75% of his health", heals from exhumeds; P3 "Upon reaching ~25%" (Entry "below 22.5%"); one infobox for "Phase 2 & 3"; HM "Defence is lowered from 250 to 200" | HM version | P2 75% → 25% (+ *exhumed heals*, default 0), P3 25%; no P3 stat change (the task's "P3 stat change" doesn't exist) |
| Verzik P1 cap: "capping damage dealt to her with melee at 10, with ranged and magic at 3" (Mod Ash); "The Dawnbringer is the lone exception, which also ignores accuracy rolls" | `linearMinTransformer(10 / 3)` = min(hit, uniform 0..cap); Dawnbringer exempt, accuracy 1, max ÷ 2 | kept; **one Dawnbringer**: P1 phase "Shield (Dawnbringer with a teammate)" (Dawnbringer deals 0) for the other team members |
| Dawnbringer spec: "75-150 hitpoints of damage ... consuming 35% of the wielder's special attack energy"; energy restored on each boss kill | spec = 75-150 | *Dawnbringer specs / player* (default 2) × 112.5, 4 ticks each |
| Dawnbringer elsewhere: "After her shield is destroyed, the Dawnbringer will crumble to dust"; upstream warns "This weapon cannot be used against the select monster" | warning only | **deals 0** outside P1 |
| Verzik: "Her defence cannot be lowered" / "absorbs the defence reduction!" | floor = her Defence | targets `noDrains` (plan text) |
| Verzik P2: Athanatos heals 9-10 every few ticks; P2.5 "heals for 50% of the damage dealt"; lightning hits her 15-20 | — | *Verzik P2 heals* (default 0) |
| Verzik P3: webs / yellows invulnerable; enrage tornado heals "triple the damage dealt"; HM "heal 30% of her health" at 5% | — | not DPS time; *Verzik P3 heals* (default 0); HM + 30% always |
| Entry Mode: "Bloat / the Maiden can scale down to 20% of its original Hitpoints when done in a solo party" | 10/40 = 25% solo | upstream kept (UNVERIFIED G9) |

## Other raid monsters (came with the refresh, not checked field-by-field)

Ezekiel, Moia and the Dagon'hai were checked in phase 15 (section above).

| Monster | NPC id(s) | Source |
|---|---|---|
| Undead binder (Moia add) | 16670 | Bucket only (infobox read in phase 15: 95 hp, Defence 225) |
| Corpse (Xarth) (Normal / Doused) | 16687 / 16688 | Bucket only |
| Void Rift / Siphon / Augmenter / Vine | 16678 / 16679 / 16680 / 16681 | Bucket only |

## Drain presets (phase 7, 2026-10-22)

Code: `src/lib/fracturedArchive/drains.ts` (pure, no React — callable from the worker / gear finder):
`maxDrainReductions(monster, { weapon: 'elderMaul' | 'dwh' | 'bgs', ayak })` → `{ reductions, floor, defBefore,
defAfter, magicDefBefore, magicDefAfter, reachesFloor }`; `drainPresetReductions(monster, presetId)`;
`DRAIN_PRESETS` (`none`, `floor-elderMaul`, `floor-dwh`, `floor-bgs`, each also `+ayak`); `ayakDamageToZero`,
`ayakSpecsToZero(monster, damagePerSpec)`. It returns `monster.inputs.defenceReductions` values (all other reductions
reset) that upstream's `applyDefenceReductions` applies; nothing is mutated. UI: "Max drain" buttons at the top of the
Defensive Reductions panel for Fractured Archive monsters (`FracturedArchiveDrainPresets.tsx`).

Sources:
- Strategies "Maximum defence reduction" table (https://oldschool.runescape.wiki/w/The_Fractured_Archive/Strategies,
  *Equipment/Inventory*): realistic sequences, e.g. Bork "2 Elder Maul / 1 Elder + 15 Bandos Godsword Damage",
  The Blade "2 Elder Maul + 4 Tonalztics of Ralos", Ocellus P3 "2 Elder Maul", AG "4 Tonalztics of Ralos".
- Elder maul −35% / DWH −30% of *current* Defence per successful spec (wiki item pages); Tonalztics of Ralos −1/8 of the
  target's Magic level per successful hit, two hits per charged spec (https://oldschool.runescape.wiki/w/Tonalztics_of_Ralos).
- Eye of Ayak *Soul Rend*: "reduces the target's Magic Defence by an amount equal to the damage dealt", not below 0
  (https://oldschool.runescape.wiki/w/Eye_of_Ayak). Upstream's `ayak` input is that damage, so "Ayak to 0" = damage
  equal to the magic defence bonus. It is a bonus, not the Magic level, so AG's magic-*level*-drain absorption
  (phase 3) doesn't apply to it.

Rules: Elder maul / DWH → fewest specs of that weapon that reach the floor (cap 6). A % drain can't reach 0, so for
uncapped bosses the preset adds Tonalztics hits as a finisher (as the wiki table does), choosing the least spec energy
(hammer spec 50%; Tonalztics counted in whole charged specs = 2 hits, 50% each), then the fewest hammer specs, then
the fewest actions (Tonalztic cap 8 hits). When the named weapon can hit, plans start with at least 1 spec of it;
when it can't (phase 13, below), the cheapest plan with weapons that can is used instead. The wiki table's Tonalztics counts are **hits**, not specs (The Blade: 250 → 163 → 106, then
4 × 27 = 108 → 0). BGS → damage
= Defence − floor (drains Defence first, so it stops exactly at the floor; on 300-def Bork that is 120 damage, i.e.
several specs — "max" with only a BGS). All counts are *successful* specs; misses aren't modelled.

| Boss | Def → floor | Elder maul | DWH | BGS dmg | Magic def bonus = Ayak dmg to 0 | Ayak specs at 40 dmg (illustrative) |
|---|---|---|---|---|---|---|
| Archive Guardian (Grounded) | 260 → 156 | 2 | 2 | 104 | 130 | 4 |
| Archive Guardian (Flying), melee can't hit | 260 → 156 | 4 Tonalztic hits (= wiki) | 4 hits | 4 hits | 130 | 4 |
| Bork | 300 → 180 | 2 | 2 | 120 | 300 | 8 |
| The Smorks | 220 → 0 | 1 + 7 Tonalztic hits | 1 + 7 | 220 | 400 | 10 |
| Dreadnoth | 125 → 0 | 1 + 4 Tonalztic hits | 1 + 4 | 125 | 20 | 1 |
| Jelly (Dreadnoth) | 100 → 0 | 1 + 6 | 1 + 6 | 100 | 15 | 1 |
| Xarth | 170 → 102 | 2 | 2 | 68 | 205 | 6 |
| Ocellus P1 | 215 → 129 | 2 | 2 | 86 | 100 | 3 |
| Ocellus P2 (The Blade) | 250 → 0 | 2 + 4 Tonalztic hits (= wiki) | 1 + 7 | 250 | 100 | 3 |
| Ocellus P3 | 250 → 150 | 2 | 2 | 100 | 200 | 5 |
| Ezekiel | 130 → 78 | 2 (= wiki) | 2 | 52 | 200 | 5 |
| Moia, melee can't reach (phase 15) | 195 → 117 | 2 Tonalztic hits (= wiki) | 2 hits | 2 hits | 30 | 1 |
| Dagon'hai Elder / Monks (phase 15) | 100 → 0 | 1 + 2 Tonalztic hits | 1 + 2 | 100 | 100 | 3 |

**Unverified / differences from the wiki table:** the table's Smorks "2 Elder Maul + 4 Tonalztics" and Dreadnoth
"1 Elder Maul + 3 Tonalztics" leave **1** Defence with upstream's truncation (220 → 143 → 93, 4 × trunc(185/8) = 92;
125 → 82, 3 × trunc(220/8) = 81). They reach exactly 0 only if the Tonalztics drain **rounds up** (24 / 28 per hit).
The Elder maul page says its drain rounds down (75 → 49 example), so Tonalztics rounding up is the plausible
explanation — unverified, 1 Defence difference, kept as upstream computes it. Smorks ties at 250% energy between
1 + 7, 2 + 5, 3 + 3 and 4 + 2; the fewest-hammer-specs tie-break picks 1 + 7 (phase 7 review). The Ayak
"specs" column is only damage / 40 — the real count depends on the player's spec damage (use `ayakSpecsToZero`).

### Drain plans per version / phase (phase 13, 2026-10-23)

A plan only uses a drain weapon whose style can hit the monster in the selected version / phase:
`src/lib/fracturedArchive/hittable.ts` (`canStyleHit`, `canDrainToolHit`) runs upstream's own
`PlayerVsNPCCalc.isImmune` for a 99s player holding the actual weapon (Elder maul / Dragon warhammer / Bandos godsword
= melee, Tonalztics of Ralos = ranged, Accursed sceptre = magic), so the `flying` attribute (melee only with
halberds / salamanders), Ocellus's prayers (`ocellus.ts`) and upstream's immunity lists all apply without a copy of the
rules. If the named weapon can't hit, the plan is the cheapest among the tools that can: Tonalztics hits, optionally
after one Accursed sceptre spec (50% energy). The accursed spec's **Defence part counts** (phase 3 reading: AG's
absorption covers Magic-level effects only), so on AG it is a valid tool, but never cheaper there (accursed + 3 hits
= 150% vs 4 hits = 100%). On Ocellus P3 Deflect Melee, accursed + 2 hits (250 → 212 → 150; 100% energy, 3 actions)
**ties** the 3-hit plan (250 → 150; 100%, 3 actions); the 3-hit plan wins only because plans without accursed are
checked first and a tie doesn't replace the earlier plan. Arclight / Emberlight are melee and not used by presets. Ranking as
above (lowest Defence, then energy, then fewest hammer specs, then fewest actions). The Tonalztics finisher is only
added when ranged can hit. The calculator's "Max drain" buttons grey out (strikethrough) a weapon that can't hit, with
a tooltip and a line naming the plan actually applied.

| Boss / phase | Can hit (melee / ranged / magic) | Every preset (Elder maul, DWH, BGS) | Def |
|---|---|---|---|
| Archive Guardian (Flying) | no / yes / yes | 4× Tonalztics hits (2 specs), as the wiki table's "4 Tonalztics of Ralos" | 156 |
| Archive Guardian (Grounded) | yes / yes / yes | unchanged (2 Elder maul / 2 DWH / BGS 104) | 156 |
| Ocellus P1, walking (Protect from Melee) | no / yes / yes | 2× Tonalztics hits (1 spec) | 129 |
| Ocellus P1, at a corner | yes / yes / yes | unchanged | 129 |
| Ocellus P3 last quadrant: Deflect Melee (with or without void) | no / yes / yes | 3× Tonalztics hits (2 specs) | 150 |
| Ocellus P3 last quadrant: Deflect Ranged (with or without void) | yes / no / yes | unchanged (floor 150, no Tonalztics needed) | 150 |
| Moia (phase 15: out of melee reach) | no / yes / yes | 2× Tonalztics hits (1 spec), as the wiki table's "2 Tonalztics of Ralos" | 117 |
| Ocellus P3 quadrants 1-3 / Soul Split, every other boss | yes / yes / yes | unchanged | - |

Model note: each phase is planned on its own, as if all drains were done in that phase. In the fight Defence drained
earlier in Phase 3 carries into the last quadrant, so the "Deflect Melee" plan is only needed if nothing was drained
before; **unverified** whether Ocellus's Defence resets between quadrants.

## Spec mechanics (phase 14, 2026-10-23)

Code: `src/lib/fracturedArchive/specs.ts` (`SPEC_WEAPONS`, `specProfile`, `drainModel`, `energyBudget`, `planLabel`) and
`teamSpecs.ts` (exact planners). Wiki pages read with `?action=raw` on 2026-10-23. Hit chance, max hit and the damage
distribution are **upstream's spec calc** (`PlayerVsNPCCalc.getSpecCalc()` → `getDistribution()`, the numbers behind
the calculator's "Spec expected hit"), for a 99s player in the Phase 8 preset armour of the weapon's style
(Inquisitor's / Masori (f) / Ancestral incl. Confliction gauntlets), Piety / Rigour / Augury, Super combat / Ranging /
Saturated heart, best non-defensive style; one-handed weapons get Avernic defender / Twisted buckler / Elidinis' ward (f).

| Weapon | Energy | Accuracy / damage (as upstream applies them) | Drain | Lands when | Source |
|---|---|---|---|---|---|
| Elder maul | 50% | +25% attack roll, crush roll; no damage modifier | current Defence −35% (rounded down), stacks | successful (accurate) hit — **unverified** whether a hit dealing 0 counts | [Elder maul](https://oldschool.runescape.wiki/w/Elder_maul#Special_attack), [Special attacks](https://oldschool.runescape.wiki/w/Special_attacks) table |
| Dragon warhammer | 50% | +50% max hit, no accuracy bonus | current Defence −30%, stacks | the hit must deal damage (Mod Ash, cited on the page) | [Dragon warhammer](https://oldschool.runescape.wiki/w/Dragon_warhammer#Special_attack) |
| Bandos godsword | 50% | ×2 accuracy, slash defence roll; max hit ×1.1 ×1.1 | Defence, then Str, Prayer, Att, Magic, Ranged by the damage dealt | damage > 0 (the drain is the damage) | [Bandos godsword](https://oldschool.runescape.wiki/w/Bandos_godsword#Special_attack) |
| Tonalztics of Ralos (charged) | 50% | +50% accuracy; two hits of 75% max hit; on NPCs the 2nd hit rolls against the Defence lowered by the 1st (upstream models this) | Defence − Magic level / 8 **per hit that deals damage** (0, 1 or 2 per spec) | "If damage is dealt", per hit | [Tonalztics of Ralos](https://oldschool.runescape.wiki/w/Tonalztics_of_Ralos#Special_attack), [Successful hit](https://oldschool.runescape.wiki/w/Successful_hit) |
| Eye of Ayak | 50% | ×2 accuracy, +30% max hit, 5-tick attack | Magic defence **bonus** − damage dealt, not below 0, not restored | "If the attack deals damage" | [Eye of Ayak](https://oldschool.runescape.wiki/w/Eye_of_Ayak#Special_attack) |
| Accursed sceptre | 50% | +50% accuracy and max hit | Defence and Magic −15%, doesn't stack (phase 13 fallback only; not in the planners) | successful hit "regardless of the damage" (Mod Ash) | [Accursed sceptre](https://oldschool.runescape.wiki/w/Accursed_sceptre#Special_attack) |

- **Accurate 0s**: upstream raises an accurate 0 to 1 ([Successful hit](https://oldschool.runescape.wiki/w/Successful_hit):
  "If the roll is from a player, then 0s are pushed up to 1"), so "lands on damage" only differs from "lands on an
  accurate roll" under a flat damage reduction applied afterwards — Bork's flat armour 8 (melee / ranged) and magic
  resistance 2. E.g. Bork DWH: accuracy 69.7%, drain lands 62.1%.
- **Accursed sceptre, wiki-internal conflict**: the Special attacks table says "If damage is dealt, the target's
  Defence and Magic are reduced by up to 15%", the item page says "upon a successful hit ... regardless of the damage
  inflicted" (citing Mod Ash). The code follows the item page (`landsOn: 'accurate'`); the planners don't use the
  accursed sceptre (only the phase 13 fallback in drains.ts, which assumes it lands). **Unverified.**
- **Tonalztics rounding**: upstream rounds 1/8 Magic down; the wiki Strategies table matches rounding up (see *Drain
  presets*) — still **unverified**.
- **Energy**: 10% per 30 s ([Special attacks](https://oldschool.runescape.wiki/w/Special_attacks): "regenerates at a
  default rate of 10% every 30 seconds"); **Lightbearer** "twice as fast at 15 seconds per 10%"
  ([Lightbearer](https://oldschool.runescape.wiki/w/Lightbearer)); upstream's `getSpecDps` uses the same 50 / 25 ticks.
  Budget = 100 + 10 × floor(s / 30) (or / 15). **Unverified**: that spec energy is full at the start of every
  Fractured Archive boss (no restore mechanic checked) and the 90 s default fight length.
- Profiles use the **undrained** boss: specs after the first drains are really a little more accurate (conservative).

Hit chances and Ayak drain (default assumptions, 6-man, 2026-10-23):

| Boss | Elder maul | DWH | Tonalztics (≥1 hit / hits per spec) | BGS | Ayak hit / expected damage per spec |
|---|---|---|---|---|---|
| Archive Guardian (Grounded) | 79.8% | 73.6% | 96.1% / 1.62 | 72.3% | 73.1% / 19.7 (max 54) |
| Archive Guardian (Flying) | can't hit | can't hit | 94.1% / 1.54 | can't hit | 73.1% / 19.7 |
| Bork (armour 8) | 76.8% | 62.1% | 72.6% / 0.95 | 52.7% | 75.9% / 20.1 (max 52 after magic resistance) |
| The Smorks | 54.1% | 40.2% | 91.1% / 1.41 | 61.6% | 50.9% / 13.8 |
| Ocellus P2 (The Blade) | 82.9% | 77.6% | 92.4% / 1.47 | 68.1% | 79.5% / 21.5 |

Hand checks in `Specs.test.ts`: Elder maul spec roll = trunc(normal roll × 5/4) against (Def + 9) × (crush + 64), hit
chance from the standard formula (AG 0.7978, Bork 0.7678); Ayak roll ×2 against (Magic + 9) × (magic def + 64) with
the Confliction gauntlets re-roll, E[damage] = acc × (1 + 1 + … + 54) / 55 on AG, and acc × Σ max(0, max(1, d) − 2) / 55
on Bork. Planner maths (exact binomial / convolution): `TeamSpecs.test.ts`.

## Spec accuracy by raid (phase 24, 2026-10-23)

User report: "Kephri's Defence is insanely high; I never hit with Elder maul" while the drain line showed a high hit
chance at raid level 500. Audit result: **the spec hit chances already include every raid's Defence scaling** — the
spec profile (`specProfile`, specs.ts) is upstream's `getSpecCalc()`, which builds a new `PlayerVsNPCCalc` with the same
monster (the constructor runs `scaleMonster`) and the same `getNPCDefenceRoll()` as a normal attack (only the defence
*style* changes for slash / stab / crush / magic specs). No fix was needed. Tests: `src/tests/lib/raids/SpecAccuracy.test.ts`.

| Raid | What scales the NPC's Defence | Where upstream applies it | In the spec hit chance? |
|---|---|---|---|
| ToA | Raid level: defence **roll** × (250 + level) / 250 (wiki: "+2% per 5 raid levels ... +200% defence at 500"); not the Defence level. Path level and party size: hp only. Kephri's overlords are excluded | `PlayerVsNPCCalc.getNPCDefenceRoll()` (`NPC_DEFENCE_ROLL_TOA`) | yes (same function; Kephri 500: roll 43788 in both the normal and the spec calc) |
| CoX | Party size and Challenge Mode scale the Defence **level** (Tekton 205 → 215 at party 6, 290 in CM) | `scaleMonster` → `ChambersOfXeric.ts`, run by the calc's constructor | yes (the spec calc is built from the unscaled monster and scales it again; DWH on Tekton party 6: 56.7%, CM 43.2%) |
| ToB | Party size: hp only (`TheatreOfBlood.ts`: "tob only scales hp"). Mode: separate monsters (Hard Mode / Entry Mode versions, `TOB_VERSIONS`) | monsters.json versions | yes; Verzik P2 Hard Mode has the **same** Defence 200 and bonuses as Normal (wiki infobox), so the same 69.3% Elder maul hit chance; Entry Mode (Def 120) 88.0%. Verzik's Defence can't be drained (upstream floor = Defence), so no Verzik drain line |
| Fractured Archive | none known (UNVERIFIED A11) | — | — |

**Kephri, raid level 500, party 6, path 0** (hand computation = `specProfile()` = calculator, `verifyPhase24.mjs`):

- Kephri's own Defence is low: level 80, crush +100 (infobox, both versions). Defence roll (80 + 9) × (100 + 64) =
  14596; × 750 / 250 at raid level 500 = **43788** (×3). It is the raid level, not her stats, that makes her hard to hit.
- Spec player (Elder maul, Inquisitor's, Piety, Smelling salts, Pound/Accurate): 99 + 26 = 125 → ×1.2 = 150 → +11 =
  161 → × (223 + 64) = 46207 → Inquisitor's +2.5% = 47362 (normal attack) → spec +25% = 59202.
- Hit chance 1 − 43790 / (2 × 59203) = **63.0% per spec** (normal attack 53.8%). Raid level 0: 87.7%; 150: 80.3%; 300: 72.9%.
- Kephri page (`Kephri?action=raw`, Mechanics): "Her base defence level can be lowered by a maximum of 20 damage,
  reducing her base defence level down to a minimum of 60, however the defence level is reset for the final phase."
  So **one** landed maul (or DWH) spec reaches the floor (80 − 28 → 60); further specs add nothing. Upstream's floor is
  60 (`getDefenceFloor`). With 4 maul attempts P(floor) = 1 − 0.37⁴ = 98% (Team plan "P floor 99.9%" with Tonalztics);
  expected attempts to the floor ≈ 1.6. The Team line's "×4" is everyone's first round, not "4 needed": since phase 24
  the line says "1 landed spec reaches the floor (Def 60); ≈ 1.6 specs on average, later ones add nothing".
- ToA Strategies (Recommended equipment, melee, special attacks): "Voidwaker and Bandos godsword / Elder maul" with the
  note on the Elder maul: "More consistent against Kephri, P1 Warden Obelisk, and P3 Warden/Enrage Warden. Especially
  useful when combined with Soulflame horn, as one special attack is enough to reduce the defence of Ba-ba, Kephri, and
  Zebak fully. Without horn, using a hammer is worse than a bone dagger in Expert+." and on the bone dagger: "Taken in
  high invocation raids with Overly Draining on over BGS, due to the bone dagger special attack having a guaranteed
  hit". General: "Most bosses can have their defence drained by flat amount, so a Bandos godsword or sometimes the
  Bone dagger are preferable to other defence draining weapons." The wiki does **not** call drains a waste on Kephri;
  it recommends one landed hammer/maul spec (the floor is 20 levels away) or a guaranteed-hit bone dagger at high
  raid levels. Bone dagger, Soulflame horn and Voidwaker damage specs are not modelled (ROADMAP future item).
- Verdict: the model was right; 63% means about 1 in 3 maul specs miss at 500, and at 500 a normal maul attack misses
  46% of the time, so streaks of misses are common. The planner ranks Kephri at Def 60 because one landing is enough.

**Drain line note** (phase 24, `drainLineNote` in drainLine.ts): a planned weapon landing < 40% of its specs (as
shown, rounded) → "drains unlikely to land here: 39% per spec" (several: "Elder maul 39%, BGS 36% per spec"); otherwise,
when one landed Elder maul / DWH spec already reaches the floor → "1 landed spec reaches the floor (Def N); ≈ x specs on
average". The numbers (ranked Defence, P(floor)) are unchanged. At the defaults the low-chance note shows for ToA Zebak
(maul 39%) and Ba-Ba (36%) at 500, CoX Tekton (enraged, CM) / Shaman / Olm right hand, and Vasa's Ayak (27%); the
floor-in-one note for Kephri, Akkha and the P3 Wardens.

## Equipment (phase 7b, 2026-10-22)

Sources (all fetched 2026-10-22, wikitext via `?action=raw`): item pages
https://oldschool.runescape.wiki/w/Obligator, /Zorya's_tome, /Ascension_crossbows, /Ascension_bolts,
/Diamond_ascension_bolts_(e), /Onyx_ascension_bolts_(e), /Rondache, /Fragment_of_burning_fire (and the other three
fragments), /Horn_of_Bran, /Zeal; the raid page's *Rewards* section; /Module:CombatStyles (Extending Chain Mace styles);
news pages Update:The Fractured Archive - Rewards Poll Blog and - Out Today. Gearscape's API has none of these items yet
(`/api/equipment/id/34725` etc. → not found). Code: `src/lib/fracturedArchive/equipment.ts`; tests:
`src/tests/lib/fracturedArchive/Equipment.test.ts`.

**Data refresh.** `scripts/generateEquipment.py` re-run (same minimal Windows UTF-8 fix as the monsters script).
`cdn/json/equipment.json` 5436 → 5463 entries. New: Obligator (Charged 34715 / Uncharged 34717), Zorya's tome (Charged
34725 / Uncharged 34727), Ascension crossbows 34681, Ascension bolts 34684, Diamond ascension bolts 34690 / (e) 34696,
Onyx ascension bolts 34702 / (e) 34708, Rondache 34719, Living record (tier 1–5) capes (no stats), Imbued ancient cape
(Normal/Broken/Locked + Deadman) and Imbued ancient max cape/hood, Corrupted Scythe of Vitur (Charged/Uncharged),
Dizana's quiver (Locked + Charged/Uncharged) — 27 new entries. 44 entries (43 image files) were **renamed** by the wiki (capitalisation: "Blood Moon
helm", "Blue Moon spear", "Eclipse Moon tassets", "Holy/Sanguine Scythe of Vitur", "Toxic Staff of the Dead", "... of
Ruin", "Cape of Legends", "Robin Hood hat", "Necklace of Fangs", "Seal of Passage"); the name checks in `BaseCalc.ts`
/ `PlayerVsNPCCalc.ts` were updated (Blood Moon set, Blue/Eclipse Moon sets, staff-of-the-dead spell checks;
"Staff of the Dead" was already wrong upstream). 74 cosmetic items changed `category` "Unarmed" → "" (no effect).
`generateEquipmentAliases.py` was not run: its header says it only bootstraps `EquipmentAliases.ts`. Not in the
data: Archivist's folio (teleport, skipped), Horn of Bran (unlock item), elemental fragments (not equippable).
`scripts/manual_equipment.json` unchanged (every raid item was in the Bucket data).

| Item | Stats vs wiki infobox | Effect → model | Unverified |
|---|---|---|---|
| Obligator | match (2h, speed 5, crush +120, str +40, prayer +3; category "Extending Chain Mace" → new styles Thrust/Accurate, Thrust/Aggressive, Smash/Aggressive) | Thrust: one accuracy roll, damage = best of 2 rolls + 1 per stab/slash defence bonus above crush (max 4); then +20% (2x2) / +40% (3x3+) per hit. Smash: 3-tick attacks, single roll, no bonus. | "damage rolls" read as one accuracy roll; size bonus per hit (not max hit) and not on Smash (`OBLIGATOR_SIZE_BONUS_PERCENT`). Uncharged version gets the same effect (upstream convention: name-based). |
| Zorya's tome | match (2h powered staff, speed 3, magic +45, 15% magic dmg, prayer +2) | Built-in spell base max hit 18 (`ZORYAS_TOME_BASE_MAX_HIT`). Spec *Zorya's flow* (50%): ×2.5 attack roll, ×1.6 max hit. Marked partially implemented: the 3 (or 5) empowered follow-up attacks at 2 ticks are not modelled (constants exported for the gear finder). No element (elemental weakness/fragments don't apply). Not a shield-slot tome: it is the weapon, so it can't be combined with Tome of fire/water/earth or a staff. | Flat 18 at every Magic level (wiki gives no formula); spec factors' order (accuracy on the final roll, damage after magic damage). |
| Ascension crossbows | match (2h crossbow, speed 3 → rapid 2, ranged +34, magic +3) | Heavy ranged; ammo restricted to ascension bolts (and only they; other crossbows can't use them). Dual-wield is cosmetic (one attack per cycle). No spec. | — |
| Ascension bolts / diamond / onyx (e) | match (ranged str 53 / 58 / 58) | Diamond (e) / Onyx (e) use the regular diamond (armour piercing) / onyx (life leech) bolt effects (rewards blog wording). | Proc chances and multipliers assumed equal to the normal (e) bolts (`DIAMOND_ASCENSION_BOLTS_E`, `ONYX_ASCENSION_BOLTS_E`). |
| Rondache | match (shield, str +8, def 35/41/38/-6/55) | Stats only. +2 flat armour / magic resistance (defensive) and the energy-free *Shield Slam* (x + x% damage from charges) are not modelled. | — |
| Elemental fragments | n/a (not equipped) | Player unlock per element (`buffs.elementalFragments`, toggle under the spell selector): +2 base max hit for that element's spells, added before magic damage and elemental weakness (as the wiki states). | — |
| Zeal (Horn of Bran) | n/a | New prayer: attack ×1.25, strength ×1.28, defence ×1.25; same drain as Piety; replaces Piety in-game (separate button here, mutually exclusive like other offensive prayers). | — |

### Phase 25 — item refresh for the best-setup pool (2026-10-23)

Sources (fetched 2026-10-23, `?action=raw`): https://oldschool.runescape.wiki/w/Necklace_of_rupture,
/Seeking_dragon_arrow, /Seeking_broad_arrows, /Arrows (section *Seeking arrows*), /Maggot_King (drops, *Loot
mechanics*), /Crimson_kisten, /Elemental_amulet, /The_Blood_Moon_Rises, /Crystal_blessing.

**Generator re-run.** `scripts/generateEquipment.py` (2026-10-23): 5463 entries, **no diff** to `cdn/json/equipment.json`
(nothing added to the wiki since phase 7b), 0 new images. The Maggot King / Blood Moon Rises items (30 June 2026) were
already in the baseline data: Necklace of rupture 33639, Seeking bronze … dragon arrows 33553–33595, Seeking broad
arrows 33601, Crimson kisten 33631; also Elemental amulet 34428 and the single-element amulets 34407–34425
(2 September 2026).

| Item | Stats vs wiki infobox | Wiki effect (quote) | Upstream model | Pool / verdict |
|---|---|---|---|---|
| Necklace of rupture | match (ranged +20, ranged str +8, prayer +3) | "an upgraded variant of the necklace of anguish ... boasting an additional +5 ranged attack, +3 ranged strength, and +1 prayer bonus over the necklace of anguish"; no passive | stats only | ranged neck (BiS); in every Masori preset |
| Seeking dragon arrow | match (ranged +20, ranged str +60) | "+20 ranged attack bonus over their regular variants, as well as increasing the player's minimum hit from 1 to 3 upon a successful hit"; change 8 July 2026: "Seeking arrows now only provide a +20 ranged attack bonus when using bows"; Arrows page: "If an attack would deal 1 or 2 damage, it instead deals 3 ... They can still miss" | `bow_t60` lists 33595 (Twisted / Venator / Scorching bow, Dark bow, ...): bonuses INCLUDED; `PlayerVsNPCCalc`: ranged + "Seeking" ammo INCLUDED → accurate hits `max(dmg, 3)` (an accurate 0 becomes 3, misses stay 0) | ammo for the three pool bows; Twisted bow preset. "Only with bows" holds automatically: arrows can't be fired from crossbows / thrown weapons (INVALID) |
| Seeking broad arrows | match (ranged +20, str +28) | broad-arrow variant (turoths / kurasks) | in upstream's `isWearingLeafBladedWeapon` list (commit 89c3e25 "Add Seeking broad arrows to isWearingLeafBladedWeapon") | excluded (no raid boss is a turoth / kurask) |
| Crimson kisten | match (2h crush +80, str +56, speed 4) | Maggot King unique; spec *Brutal Swing* (50%): "four separate accuracy rolls in a single hit. If at least one roll succeeds, the attack deals 70-110% of the player's maximum hit, with additional successful rolls increasing the attack's minimum and maximum hit by 20%" | spec modelled (`PlayerVsNPCCalc`, spec cost 50) | excluded: normal attacks are below Inquisitor's mace (crush +102 / str +96); damage specs aren't in the best-setup model (ROADMAP future item) |
| Elemental amulet | match (magic +10) | "adding a +2 max hit to elemental spells, which is added before magic damage and elemental weakness modifiers are applied, and therefore scales with both" | `hasMatchingElementalAmulet` → +2 base max hit | magic neck, kept for autocasting weapons (stats alone are dominated by Occult). **Unverified**: stacks with the FA elemental fragment's +2 (both "before magic damage"; modelled additively, UNVERIFIED B16) |

Maggot King's other notable drop is the pet (Maggot marquess); no other equipment. The audit
(`src/lib/fracturedArchive/poolAudit.ts`, docs/BEST_SETUP.md *Pool audit*) found no other missing item; every
upstream-effect / stat-dominating item not in a pool is in `POOL_EXCLUDED` with a reason (e.g. Crystal blessing / Echo
boots / V's helm = Demonic Pacts League items; Barbed / Blunt / Bullet / Field arrows = Barbarian Assault only).

### Phase 35 — adds and short-lived targets: no specs (2026-10-24)

Rule (user, 2026-10-24: "you obviously aren't going to Ralos or Elder maul spec the little minions that die in a few
hits anyway"): these targets carry `noDrains: NO_DRAINS_ADDS` ("adds: not worth a spec", `src/lib/raids/types.ts`), so
every drain state ranks them at full Defence and no drains are planned on them. The wiki phrase that makes each one an
add or short-lived (all read 2026-10-24, `?action=raw`, generic User-Agent):

| Target (key) | Raid | Source | Phrase |
|---|---|---|---|
| Spitting Scarab (`toa-spitting-scarab`) | ToA | https://oldschool.runescape.wiki/w/Tombs_of_Amascut/Strategies, /Spitting_Scarab | ToA Strategies: "The first shield threshold will cause a single Spitting Scarab to spawn"; Spitting Scarab: "a monster that is summoned by Kephri" |
| Soldier Scarab (`toa-soldier-scarab`) | ToA | /Kephri, /Soldier_Scarab | "the second threshold causes a Soldier and Arcane Scarab"; "a monster that is summoned by Kephri" |
| Arcane Scarab (`toa-arcane-scarab`) | ToA | /Kephri, /Arcane_Scarab | as above; "a monster that is summoned by Kephri" |
| Akkha's Shadow (`toa-akkha-shadow`) | ToA | /Akkha%27s_Shadow | "Akkha's Shadows are summoned by Akkha ... After reaching 80% of his health, he will generate four shadows of himself" (one dispelled per 20%) |
| Skeletal Mystic (`cox-mystic`) | CoX | /Chambers_of_Xeric/Strategies, /Skeletal_Mystic | "A sacrifical chamber filled with at least three Skeletal Mystics (dependent on party size)"; they "regenerate their stats at a rate of 1 per 25 ticks" |
| Lizardman shaman (`cox-shaman`) | CoX | /Chambers_of_Xeric/Strategies | "A small room filled with at least two lizardman shamans (dependent on party size, although capped at 4)" |
| Muttadile (small) (`cox-muttadile-small`) | CoX | /Muttadile | "a small one is on the ground and the large one is lurking in the water ... When the smaller muttadile dies, the larger one emerges" (the large one is the room's boss: keeps drains) |
| Glowing crystal (`cox-glowing-crystal`) | CoX | /Glowing_crystal | "Four crystal clusters are found within the room ... Vasa will move towards a crystal ... it is important that players neutralise each one as quickly as possible" |
| Abyssal portal (`cox-abyssal-portal`) | CoX | /Abyssal_portal | "The portal must be destroyed in order to dispel Vespula and her offspring" (the room's last target, after Vespula lands) |
| Nylocas Ischyros / Toxobolos / Hagios, small / big (`tob-ischyros-*` etc.) | ToB | /Nylocas_Ischyros | "part of the wave prior to the Nylocas Vasilias encounter ... They spawn alongside Nylocas Toxobolos and Nylocas Hagios" (Search targets only; not in the time model) |
| Jelly (Dreadnoth) (`jelly`) | FA | /Dreadnoth_the_Jellied | "He will periodically summon jellies" (61 hp each; Search target only; the time model ignores the jellies) |

Judgement calls (keep their drains): Ice demon (CoX: the room's only target), Tekton, Vasa, Vespula, the large
Muttadile, the Olm hands and head (phases of the boss), ToA Obelisk (Wardens P1), the Warden core, Kephri (shielded),
FA Dagon'hai trio (the encounter's bosses: one health pool), Ocellus P2 (the Blade: a boss phase), The Smorks (fought
with Bork, 1000+ hp). **Unverified** that nobody specs these adds in practice (community habit, not a wiki rule):
UNVERIFIED D26.

Found while reading (not modelled; UNVERIFIED F10): the Glowing crystal "heals Vasa and regenerates any drained defence
levels once he reaches it", and Mod Ash (Discord, 9 July 2026, quoted on /Skeletal_Mystic) gives CoX stat-regeneration
rates in ticks per level: "Stone guardians - 8 Muttadiles - 15 Vasa Nistirio - 10 Vasa's crystal - 9 Tekton - 15
LizardShamans - 20 Skeletal mystics - 25 ... Vespula - 10 Vespula's portal - 45 ... Otherwise default should be 100".

### Phase 36 — damage specs, the surge potion, Defence resets (2026-10-25)

Sources (fetched 2026-10-24/25, `?action=raw`, generic User-Agent): https://oldschool.runescape.wiki/w/Surge_potion,
/Voidwaker, /Dragon_claws, /Burning_claws, /Zaryte_crossbow, /Crimson_kisten, /Tumeken%27s_Warden, /Kephri.

**Surge potion** (`src/lib/fracturedArchive/specBudget.ts`): "Surge potions restore 25% special attack energy per dose,
but can only be drunk once every five minutes"; "The cooldown timer will pause in the following situations: … Between
rooms in the Theatre of Blood"; "The cooldown timer can be removed in the following situations: … Entering and exiting a
raid"; "The cooldown timer will not pause or be removed during these situations: … Between rooms in the Tombs of
Amascut"; "Attempting to drink the potion with 100% special attack energy will produce the message Drinking this would
have no effect." Four doses (Surge potion(1)–(4)); the inventory image `src/public/img/supplies/Surge potion(4).png` is
the wiki's File:Surge_potion(4).png. Model: +25% (capped at 100%) at most once per encounter, right after your first spec
there or whenever the bar is below 100%; doses ≥ 300 s apart on the route's clock (the encounters' wall time; travel 0
s; conservative everywhere: in-room time that isn't DPS time, e.g. Sotetseg's mazes, isn't counted), the first may be at the raid start; **unverified** (UNVERIFIED D29).

**Damage specs** (`src/lib/fracturedArchive/damageSpecs.ts`): the numbers are upstream's (`getSpecCalc()`,
`getExpectedDamage()`, `getExpectedAttackSpeed()`), which follow the wiki:

| Weapon | Energy | Wiki (quote) | Upstream |
|---|---|---|---|
| Voidwaker | 50% | "deals guaranteed Magic damage between 50-150% of the wielder's maximum melee hit" | accuracy 1, min = max ÷ 2, max + min; rolled as magic (Bork's magic resistance −2 applies, B5) |
| Dragon claws | 50% | "hits an enemy four times in succession … rolls against the opponent's slash defence" | `dClawDist` (the four-roll cascade) |
| Burning claws | 35% | "Burning barrage … hits an enemy three times in succession"; "Each of the three hits also has a chance to inflict a burn … One spec can inflict 0, 10, 19, 20, or 29 burn damage" | `burningClawSpec` + `burningClawDoT` (the burn's expected damage counts) |
| Zaryte crossbow | 75% | "Evoke … provides doubled accuracy for the attack, and guarantees the special effect of any enchanted bolts used, provided that the player lands a successful hit"; ruby bolts "can guarantee that up to 110 damage is dealt" | ×2 accuracy; the bolt effect on every accurate hit (ruby (e): 22% of the monster's **current** hp, max 110 — phase 36 review: the planner uses the NPC's hp left at the phase's start, its damage still to deal in the
drain event; **unverified**, D28) |
| Crimson kisten | 50% | "four separate accuracy rolls in a single hit. If at least one roll succeeds, the attack deals 70-110% of the player's maximum hit, with additional successful rolls increasing the attack's minimum and maximum hit by 20%" | modelled (phase 25 note). The roadmap's "Kiston" is this item: a **Maggot King** unique, not a Fractured Archive reward |

Not modelled (upstream has no spec): Keris partisan of breaching (no entry in `WEAPON_SPEC_COSTS`), Bone dagger
(`UNIMPLEMENTED_SPECS`). The spec player wears the style's armour preset (melee: Torva or Inquisitor's, whichever gives
the spec more; ranged: Masori (f) with Ruby or Diamond dragon bolts (e)), not your kit's loadout (**unverified** choice,
D28).

**Defence resets** now drain events (one spec budget per encounter needs them): Tumeken's Warden: "When entering the
enraged state, the Warden's base defence level is reset to 180"; Kephri: "the defence level is reset for the final phase";
CoX Olm: "His stats also reset when a new phase starts" (phase 19's quote, F7). Sotetseg's mazes and Bloat's stomp were
already resets (phase 33).

### Phase 38a — raid wall clock, ToA supplies by room (2026-10-25)

**Typical raid length** (`RaidBase.typicalRaidMinutes`, `RAID_LENGTH_SOURCES` in src/lib/raids/base.ts; **unverified**,
UNVERIFIED D30). The wiki publishes no "typical" completion time, only time limits and speed tasks (fetched 2026-10-25,
`?action=raw`, generic User-Agent), so the ToA / CoX / ToB defaults sit above the speed tasks:
- Fractured Archive **25 min**: the user's in-game raid stats, docs/calibration/fa-times-2026-10-25.md (personal bests
  24:50 at 3, 25:38 at 4, 22:01 at 5, 24:32 at 6; the user, 2026-10-25: "≈ 25 min").
- Tombs of Amascut **30 min**: https://oldschool.runescape.wiki/w/Tombs_of_Amascut (time-limit invocations: "Players
  have 40 / 35 / 30 / 25 minutes to complete the raid"; 30 = Run for It), https://oldschool.runescape.wiki/w/Tombs_Speed_Runner_II
  ("Complete the Tombs of Amascut (expert) within 20 mins at any group size", Grandmaster).
- Chambers of Xeric **20 min**: https://oldschool.runescape.wiki/w/Chambers_of_Xeric_(5-Scale)_Speed-Chaser ("in less
  than 15 minutes", Master), /Chambers_of_Xeric_(Trio)_Speed-Chaser ("less than 16 minutes and 30 seconds").
- Theatre of Blood **20 min**: https://oldschool.runescape.wiki/w/Theatre_(4-Scale)_Speed-Chaser ("in less than 17
  minutes", Master), /Theatre_(5-Scale)_Speed-Chaser ("less than 16 minutes"). The surge cooldown pauses between ToB
  rooms (Surge potion, phase 36 quote above), so ToB's surge clock stays fight time only.

**ToA supplies by room** (src/lib/raids/toa/supplies.ts; **unverified** slot accounting, UNVERIFIED D31): the user,
2026-10-25: "supplies come after any 2 rooms, then after all 4 before the warden", confirmed by
https://oldschool.runescape.wiki/w/Tombs_of_Amascut (*Consumables*): "Consumable items are received from supplies given
by the Helpful Spirit in the Nexus ... They can be claimed from the spirit once after completing two paths, and once
again after completing the remaining two paths and before proceeding to" the Wardens. Boosts:
Smelling salts 11 + 16%, Super combat 5 + 15%, Ranging potion and Saturated heart 4 + 10% (upstream `src/utils.ts`).
