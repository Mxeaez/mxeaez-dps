# Data sources — The Fractured Archive

All values below were fetched on **2026-10-22** from the OSRS Wiki (page wikitext via `?action=raw`, and the
`infobox_monster` Bucket table through `scripts/generateMonsters.py`). The wiki infobox is the source of truth;
`cdn/json/monsters.json` is generated from Bucket and was checked field-by-field against each page's infobox
(hitpoints, all six skill levels, all offensive and defensive bonuses incl. light/standard/heavy and flat armour,
elemental weakness + percent, size, attack speed, attributes, id). The UI was then checked with
`node scripts/verifyFracturedArchiveMonsters.mjs` (screenshots in `docs/screenshots/phase1-*.png`).

Fields marked **unverified** are not taken from the wiki or are guesses. Anything not listed as unverified matches
the wiki infobox exactly.

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
  NPC (The Blade, id 16683 — see Ocellus section), the hotfix/news list names "Ocellus" and not The Blade, the table
  is NPC-specific and lists a concrete drain sequence (looks empirical), while the page-body sentence reads as
  arithmetic applied to the infobox defence of both 250-defence versions. Keep the floor a per-monster constant so
  it is a one-line change if 150 turns out to be right.
- Floors to use: Archive Guardian 156, Ezekiel 78, Bork 180, Moia 117, Xarth 102, Ocellus P1 129 / P3 150;
  The Smorks, Dreadnoth, Jelly and Ocellus P2 0 (no cap; Jelly not in the table, assumed uncapped, **unverified**).
- Practice mode lets the boss be started at a chosen phase (raid page) — irrelevant to stats.
- Monster images in `cdn/monsters/` are committed, but the app loads images from the upstream CDN
  (`getCdnImage` in `src/utils.ts` → `tools.runescape.wiki/osrs-dps/cdn/`), where the raid images don't exist yet, so
  raid monster images show as broken locally. Fix at deploy time (phase 10) if wanted.

## Party-size HP scaling (phase 2 research, 2026-10-22)

Result: **no published data**. The calculator keeps the wiki infobox HP for every party size 2–8 (solo counts as 2)
through an identity table `FRACTURED_ARCHIVE_HP_SCALING` in `src/lib/scaling/FracturedArchive.ts`, flagged
**unverified** in code and with an "unverified" marker next to the party size input. When real numbers appear,
only that table changes (factor per size; the infobox HP must stay the value at the size it was recorded for).

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
- Gearscape lists **16674 as "ocellus (phase 2) (the blade)"**, while the wiki Ocellus infobox gives 16673/16674 as
  phase 1 ids and The Blade page gives 16683 for The Blade (Repaired). Wiki wins: 16674 stays in `OCELLUS_P1_IDS`
  (no effect today — monsters.json only contains 16673 for P1). Phase 6 should re-check (**unverified**).
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
| Mismatch | **flat_armour**: wiki infobox is the text `8-14 (Base), 0 (Stunned), 2 (Magic resistance)`, Bucket has no number, so the generator stores `0` (= the stunned state). Left as generated; phase 4 must model it. |

Mechanics (page body + Strategies → *Bork and the Smorks*):

- Defence floor 180 (`300 × 0.6`) — page body (news quote). Not in the raid page's hotfix list (see raid-wide notes).
- Flat armour 8 at full Smorks HP, +2 per 25% damage dealt to the Smorks, max 14. Magic attacks are reduced by 2
  instead ("2 Magic resistance") — i.e. melee/ranged hits −8…−14, magic hits −2.
- Stunned by a heavy cannonball: damage reduction removed (flat armour 0) **and all melee attacks are successful
  hits** (100% accuracy) for a short time. Recommended gear assumes "Stunned, reduced Defence".
- Immune to cannon; xp bonus 60%.

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
- Demon, but "has low demonbane values" — exact demonbane vulnerability % is not on the wiki (**unverified**; upstream
  has a `demonbaneVulnerability` monster input that phase 5 can set).
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

## Ocellus

| Field | Value |
|---|---|
| Source | https://oldschool.runescape.wiki/w/Ocellus |
| Fetched | 2026-10-22 |
| NPC id(s) | Phase 1: **16673, 16674** (generator stores only the first, 16673); Phase 2: none on wiki → manual id **100090**; Phase 3: 16677. Hooded Figure (pre-fight NPC) 16672. |
| Verification | P1 and P3 match infobox; P2 matches the infobox values that exist; UI matches (`phase1-ocellus-p1/p2/p3.png`) |

Ocellus Phase 2 — decision: **attackable, added as a manual entry** in `scripts/manual_monster.json`.

The thing being hit is most likely the NPC **The Blade (Repaired)**, id **16683**
(https://oldschool.runescape.wiki/w/The_Blade, *Repaired* tab — Infobox NPC, no combat stats); the Strategies drain
table also calls the P2 row "The Blade (Phase 2)". The manual entry nevertheless keeps the synthetic id **100090**:
the stat block comes from Ocellus's infobox version 2, not from The Blade's page, so tying it to 16683 is an
inference; and if the wiki later adds an `infobox_monster` row for The Blade, the generator would emit a real 16683
entry next to ours and the duplicate id would make id lookups ambiguous. Phase 6 should include **16683** (and
100090) in the Ocellus id list.

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
  table says 0 — see the conflict note under *Raid-wide notes* (recommendation: 0). 21 Oct hotfix: "Ocellus will
  no longer restore his Defence when moving to a new quadrant during phase 3" (page *Changes*) — drains persist
  through P3/P4.
- Multi-id: P1 uses ids 16673 and 16674; any `OCELLUS_IDS` constant in phase 6 should list 16673, 16674, 16677 and
  the manual 100090 (upstream pattern: e.g. `VARDORVIS_IDS`, `TD_IDS` list every NPC id and test `includes(monster.id)`).
- P1: the Strategies page calls the P1 bar "shield durability" (presumably the infobox P1 hitpoints, 2500 — **unverified**); Protect from Melee while walking between corners (Strategies →
  *Phase 1*). Demon (scorching bow can root).
- P2: only 50% of damage carries over to P3 HP (see above) — DPS vs P2 should be halved for TTK purposes.
- P3: "Ocellus's Protect from Melee overhead icon will now properly appear in phase 3" (page *Changes*, 21 Oct
  hotfix) refers to **Ocellus's own prayer**, i.e. he prays against melee in P3, which would make melee loadouts
  deal 0 (or reduced) damage against him. The wiki is unclear: the same phase is described as a melee-tank phase with
  melee attacks being "flicked" (Strategies → *Phase 3*, "The correct timing for flicking melee attacks"), which may
  mean the player flicks Protect from Melee against his attacks, or that he only prays melee at times. Phase 6 should
  treat "Ocellus praying melee in P3" as a toggle/unknown and not assume melee is always blocked or never blocked
  (**unverified**).
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

## Other raid monsters (came with the refresh, not checked field-by-field)

| Monster | NPC id(s) | Source |
|---|---|---|
| Ezekiel | 16652 | https://oldschool.runescape.wiki/w/Ezekiel (Bucket only) |
| Moia | 16667 | https://oldschool.runescape.wiki/w/Moia (Bucket only) |
| Undead binder (Moia add) | 16670 | Bucket only |
| Dagon'hai Elder | 16643 | https://oldschool.runescape.wiki/w/Dagon%27hai_Elder (Bucket only) |
| Dagon'hai Monk (Book / Staff) | 16647 / 16645 | https://oldschool.runescape.wiki/w/Dagon%27hai_Monk (Bucket only) |
| Corpse (Xarth) (Normal / Doused) | 16687 / 16688 | Bucket only |
| Void Rift / Siphon / Augmenter / Vine | 16678 / 16679 / 16680 / 16681 | Bucket only |
