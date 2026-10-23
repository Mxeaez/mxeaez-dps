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
  table says 0 — see the conflict note under *Raid-wide notes* (recommendation: 0). 21 Oct hotfix: "Ocellus will
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
