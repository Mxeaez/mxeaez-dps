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
  being set to two players if the player enters alone." (raid page, *Mechanics/overview*). Formula **not on the
  wiki** — still a data gap. `monsters.json` HP values are the wiki infobox values; the wiki does not state which
  party size they correspond to (**unverified** — the Archive Guardian strategy note mentions a "1490 health shield in
  6-scale", which suggests infobox HP is not the 6-player value).
- Defence drain cap of 60% of base defence (21 Oct 2026 hotfix). **Sources disagree on the list:** the raid page
  *Changes* section lists Archive Guardian, Ezekiel, Moia, Xarth, Ocellus; the news quote on every boss page lists
  Archive Guardian, **Bork**, Ezekiel, Moia, Xarth, Ocellus. Bork's own page states his floor (180), so we treat Bork
  as capped. The Smorks, Dreadnoth, Jelly, Dagon'hai: no cap mentioned (assume uncapped, **unverified**).
- Floors stated on the wiki: Archive Guardian 156, Bork 180, Xarth 102, Ocellus 129 (P1) / 150 (P2, P3).
- Practice mode lets the boss be started at a chosen phase (raid page) — irrelevant to stats.
- Monster images in `cdn/monsters/` are committed, but the app loads images from the upstream CDN
  (`getCdnImage` in `src/utils.ts` → `tools.runescape.wiki/osrs-dps/cdn/`), where the raid images don't exist yet, so
  raid monster images show as broken locally. Fix at deploy time (phase 10) if wanted.

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
  the `flying` attribute already makes upstream block non-halberd melee. Grounded after the shield bar is depleted.
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

- No drain cap mentioned (assume uncapped, **unverified**).
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

- No drain cap mentioned (**unverified**).
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
  that heal him for their remaining HP if they reach him; fire spells make him summon more corpses. Stats don't change.

## Ocellus

| Field | Value |
|---|---|
| Source | https://oldschool.runescape.wiki/w/Ocellus |
| Fetched | 2026-10-22 |
| NPC id(s) | Phase 1: **16673, 16674** (generator stores only the first, 16673); Phase 2: none on wiki → manual id **100090**; Phase 3: 16677. Hooded Figure (pre-fight NPC) 16672. |
| Verification | P1 and P3 match infobox; P2 matches the infobox values that exist; UI matches (`phase1-ocellus-p1/p2/p3.png`) |

Ocellus Phase 2 — decision: **attackable, added as a manual entry** in `scripts/manual_monster.json`.
Strategies → *Ocellus / Phase 2*: "Players attack the charging sword during phase 2 … The Blade stores all damage
dealt during this phase and releases it at the end of each quadrant, effectively transferring half of all damage dealt
to the boss's phase 3 health bar." So P2 is attackable with its own defence (wiki infobox version 2: def 250, magic 220,
stab 150 / slash 120 / crush 10 / magic 100 / light 100 / standard 110 / heavy 80) but has no HP pool of its own.

| Ocellus P2 field | Value | Status |
|---|---|---|
| id | 100090 | **non-wiki** (manual id, same 1000xx scheme as upstream's Yama entries) |
| hitpoints | 5250 | **unverified** — no P2 HP exists; set to the P3 pool its damage feeds (at 50%) |
| level (combat) | 0 | **unverified** — blank on wiki; not used by the calculator |
| attributes | none | **unverified** — wiki lists `demon` only for versions 1 and 3; version 2 is blank (the target is the Blade/sword, so plausibly not a demon) |
| offensive bonuses | 0 | wiki blank for version 2; P2 doesn't attack (attack speed 0) |
| speed 0, size 3, skills atk 1 / str 1 / def 250 / magic 220 / ranged 1, all defensive bonuses, image `Ocellus_(phase_2).png` | — | wiki |

Mechanics (page body + Strategies → *Ocellus*):

- Defence floor 129 in P1 (`215 × 0.6`), 150 in P2 and P3 (`250 × 0.6`) — page body. 21 Oct hotfix: "Ocellus will
  no longer restore his Defence when moving to a new quadrant during phase 3" (page *Changes*) — drains persist
  through P3/P4.
- Multi-id: P1 uses ids 16673 and 16674; any `OCELLUS_IDS` constant in phase 6 should list 16673, 16674, 16677 and
  the manual 100090 (upstream pattern: e.g. `VARDORVIS_IDS`, `TD_IDS` list every NPC id and test `includes(monster.id)`).
- P1: the Strategies page calls the P1 bar "shield durability" (presumably the infobox P1 hitpoints, 2500 — **unverified**); Protect from Melee while walking between corners (Strategies →
  *Phase 1*). Demon (scorching bow can root).
- P2: only 50% of damage carries over to P3 HP (see above) — DPS vs P2 should be halved for TTK purposes.
- P3: melee tank phase, Protect from Melee overhead (page *Changes*). Censers: Bandosian = next melee hit is a max
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
