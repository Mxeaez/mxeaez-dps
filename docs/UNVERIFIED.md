# Unverified values: a checklist to confirm in-game

Every value or reading in the Fractured Archive model that doesn't come from the wiki's own numbers or isn't confirmed
by an official source. Sources and reasoning are in [DATA_SOURCES.md](DATA_SOURCES.md); the best-setup consequences are in
[BEST_SETUP.md](BEST_SETUP.md). Collected in phase 11 (2026-10-22).

The rows are grouped by how much a wrong assumption would matter:

- **(A)** it could change which setup wins on that boss
- **(B)** it changes the numbers but probably not the ranking
- **(C)** it only changes cosmetic values or the TTK
- **(D)** it changes the phase 16 route times (Routes tab), not any DPS
- **(E)** Tombs of Amascut time-model readings (phase 18)

Some checks need the NPC's current stats. The tips assume a RuneLite plugin that shows an NPC's current Defence or
Magic (search the Plugin Hub for "defence"), or you can count hits. "Max hit" checks need many hits (50 or more) and
use the highest one seen. Put the calculator's numbers next to yours: select the boss and phase in the main calculator
with your own gear, and read Max hit / Accuracy.

Already verified (no action needed): Ocellus P2 (The Blade) defence floor **0**, from the official news post.
The other floors (AG 156, Bork 180, Ezekiel 78, Moia 117, Xarth 102, Ocellus P1 129 / P3 150, Smorks, Dreadnoth and
Dagon'hai 0) match the wiki's Strategies table, the boss pages, the news post and Gearscape.

## (A) Could change which setup wins

| # | What | What we assumed | Used in | If wrong | How to check in-game |
|---|---|---|---|---|---|
| A1 | Obligator **Thrust**: how many accuracy rolls | One accuracy roll, then damage = best of 2–4 damage rolls (`bestOfRollsHitDistribution`) | Every melee target. The Obligator wins almost every melee-able boss | With one accuracy roll per damage roll, misses get rarer and the Obligator does **better** (Bork armour 8: 10.5 → 12.1 DPS), so its wins hold. If the extra rolls are accuracy rolls against stab/slash defence (third reading), the numbers change in a way we haven't measured | Hit one target ~100 times with Thrust and count the 0s. Our model expects about (1 − calculator Accuracy) of hits to be 0. Many fewer 0s means each roll has its own accuracy roll |
| A2 | Obligator size bonus (+20% vs 2x2, +40% vs 3x3+) | Applied to each hit after the best roll is picked; **not** applied to Smash | Thrust vs Smash, and Obligator vs other weapons on all raid bosses (all size 2+) | If Smash also gets +40%, Smash (3-tick) may beat Thrust on some bosses | On Bork (size 3+), compare your highest Smash hit with the calculator's Smash max hit. A hit about 40% above that max means Smash gets the bonus |
| A3 | Ocellus last quadrant: does **magic** get deflected? | No: Deflect Melee blocks melee and Deflect Range blocks ranged; magic always hits (Strategies wording; the Ocellus page body says "+ mage") | P3 "Last quadrant: Deflect …" options, where Shadow wins | If magic is deflected too, magic deals 0 in all four deflect options and ranged or melee wins there | During Deflect Melee, attack with Shadow (or any spell) and see whether the hits are normal or 0 |
| A4 | Strength of Ocellus's Deflect / P1 Protect from Melee | Full block (0 damage), like other NPC protection prayers | P1 "Walking to a corner", P3 deflect options | If it blocks only part of the damage (the old beta Deflect was −90%), the blocked style still does some damage and can rank | During Deflect Melee (or while P1 walks between corners), hit with melee and see whether the hits are all 0 or just small |
| A5 | Diamond / Onyx ascension bolts (e) | Same proc chance and effect as normal diamond / onyx bolts (e) | Ascension crossbows. They win on AG (Flying) and the Jelly | Different procs move the crossbows up or down against the Twisted bow and Shadow | Fire ~200 bolts and count procs (diamond: "armour piercing" graphic; onyx: heal graphic). The model uses the normal bolt rates: diamond 10% and onyx 11% without the Kandarin hard diary, ×1.1 with it. Proc damage: diamond up to max hit +15%, onyx +20% |
| A6 | Bork stunned: no magic resistance, and how long the stun lasts | Stun removes the 2 magic resistance too. Stun length is unknown, so the "Stunned" option shows burst DPS, not an average | Bork "Stunned" option: Obligator / Scythe vs Shadow | If magic keeps −2 while stunned, magic drops a little. Stun uptime decides whether to gear for the stun or for armour 8 | Count the ticks from the stun graphic until Bork moves again. During a stun, cast a spell and compare the hits with the calculator's magic max hit (a max of exactly calc max means no −2) |
| A7 | Bork flat armour steps | 8 / 10 / 12 / 14 when the Smorks are at 100–76 / 75–51 / 50–26 / 25–0% HP; exactly 75% counts as 10 | Bork phase options. Flat armour hurts multi-hit weapons (Scythe) most | Wrong steps change Scythe vs Obligator vs magic on Bork | With one weapon, record your highest hit on Bork with the Smorks above 75% and below 25%. It should be (your max − 8) and (your max − 14) |
| A8 | Demonbane effectiveness: Xarth 80%, Ocellus P1/P3 80%, Dreadnoth 25% | Values from the wiki "Demon (attribute)" list (added 20 Oct "per orion", no in-game source) | Emberlight / Arclight / Scorching bow / Purging staff / Dark Demonbane vs Obligator | At 100% the demonbane weapons gain about 25% on Xarth and Ocellus and could win | Emberlight (or Arclight) on Xarth: compare your highest hit with the calculator's max hit. A hit above it means the effectiveness is higher than 80% |
| A9 | Zorya's tome base max hit | Flat 18 at every Magic level; the spec's empowered follow-up attacks are not modelled | Zorya's tome preset / search rows | If it scales with Magic, a boosted Magic level adds max hit. The spec is undervalued either way | Read the tome's max hit with and without a Magic boost (e.g. a Saturated heart). If it changes, the base scales with Magic |
| A10 | Moia: melee can't reach her (phase 15) | The whole fight: every melee style (halberds included) deals 0, from the Strategies line "A ranged or magic weapon is required as she is too far to reach with melee or halberds" | Moia: Search / Summary rank only ranged and magic; drain plans use Tonalztics (2 hits) | If she comes into melee range at some point (e.g. enrage), melee setups could win that part | Stand next to her during each part of the fight (incl. enrage) and try to attack with a melee weapon and a halberd |

## (B) Changes the numbers, probably not the ranking

| # | What | What we assumed | Used in | If wrong | How to check in-game |
|---|---|---|---|---|---|
| B1 | Tonalztics of Ralos drain rounding | Rounded down (trunc of 1/8 Magic level per hit), as upstream does | Drain presets on uncapped bosses (Smorks, Dreadnoth, The Blade) | The wiki table's "2 Elder Maul + 4 Tonalztics" (Smorks) and "1 Elder Maul + 3 Tonalztics" (Dreadnoth) only reach 0 if it rounds **up**. We leave 1 Defence, a tiny DPS difference | On the Smorks: 2 Elder maul specs, then 4 Tonalztics hits. Read Defence: 0 means rounding up, 1 means rounding down |
| B2 | Void explosion damage reduction | Each hitsplat halved, rounded down (a 1 becomes 0) | P3 "… + void explosions" options | Rounding up would add about 0.5 per hit | During the explosions, hit Ocellus with a weapon that often does 1s or other odd numbers and look for any 1 hitsplat |
| B3 | Archive Guardian: which magic drains are absorbed | All Magic-**level** drains (accursed, seercull, BGS overflow) are absorbed. The accursed spec's Defence drain still applies | Accursed sceptre spec on AG | If the accursed Defence drain is absorbed too, the drain gets a bit weaker | Spec AG with the Accursed sceptre and read Defence and Magic |
| B4 | Jelly (Dreadnoth) defence floor | 0 (not in the wiki table or the news list) | Drain presets on the Jelly | Jellies are barraged and have 61 HP, so it barely matters | DWH a jelly 6 times and read Defence |
| B5 | Bork magic resistance on the Voidwaker spec | −2 applies (upstream treats the spec as magic) | Voidwaker spec on Bork | ±2 damage per spec | Voidwaker spec on Bork: highest hit vs the calculator's spec max |
| B6 | Zorya's tome spec factors | ×2.5 attack roll, ×1.6 max hit applied after magic damage | Zorya spec in the calculator | Small differences in spec max hit | Spec max hit vs the calculator |
| B7 | Archive Guardian last 30% | Same stats as the Flying version (no shield) | AG (Flying) TTK | Small | Read stats or max hits below 30% |
| B8 | Xarth below 50% | Same stats as above 50% (one infobox) | Xarth | Small | Compare max hits above and below 50% |
| B9 | Ocellus P2 (The Blade) attributes | None (infobox blank), so no demonbane | Emberlight / Arclight on the Blade | If it's a demon, demonbane weapons gain on P2 | Emberlight on the Blade: highest hit vs the calculator's max |
| B10 | Spec energy at each boss (phase 14) | Full 100% at the start of every boss; +10% per 30 s (15 s with Lightbearer); fight length 90 s for every boss | Solo / Team drain plans (spec budget, labels) | Solo plans with more / less energy (e.g. 3 specs instead of 2 changes P(floor) a lot) | Note the spec bar when entering each boss room after using specs on the previous one |
| B11 | Elder maul drain on an accurate hit that deals 0 (phase 14) | Counts (wiki says only "successful hit"); matters only under flat armour (Bork 8) | Elder maul hit chance on Bork (76.8%; lower if damage is needed) | Bork maul plans need more specs | Elder maul spec Bork; when the hitsplat is 0 (blue), read his Defence |
| B12 | Dagon'hai shield gauge (phase 15) | The infobox 640 hp is one gauge shared by the Elder and both Monks, depleted 5 times, then the survivors have 7 hp (`dagonhaiEncounterDamage` = 5 × 640 + 7 = 3207); the gauge scales with party size like the other bosses; "Unshielded" changes no stat | Dagon'hai Phase dropdown (hp only), phase 16 route time (Dagon'hai vs Xarth) | DPS is unaffected; the route time of the Dagon'hai option could be far off (e.g. if each NPC had its own 640, or the gauge isn't 640) | Note the gauge's full HP (Opponent Information) at the start and after each restore, and count the restores; hit an unshielded Dagon'hai and compare max hits |
| B13 | Ezekiel's stun and enrage (phase 15) | No stat change when a sword stuns him or when he "imbue[s] himself with magic" at 33.3% (the wiki describes none) | Ezekiel (one stat set for the whole fight) | A Defence change in either state would move every Ezekiel number | Compare your max hit / hit rate on Ezekiel while stunned and in enrage with the calculator |
| B14 | Ezekiel perfect dodges give 3% spec energy each (phase 15) | Not counted in the spec-energy budget | Solo drain plans on Ezekiel | Solo plans could afford one more spec | — (wiki-stated; only the budget model ignores it) |
| B15 | Dagon'hai Defence drains are shared and persist (phase 15) | A Defence drain on one Dagon'hai applies to all three and survives the gauge restores (from "share the same stats and health pool", which may only mean identical stat blocks) | Dagon'hai drain plans (1 Elder maul + 2 Tonalztics → 0) and the Solo / Team drain states | If drains are per NPC or reset on a restore, each target / cycle needs its own drains and drained DPS is overstated | Drain the Elder, then read a Monk's Defence; read the Defence again after a gauge restore |

## (C) Cosmetic / TTK only

| # | What | What we assumed | If wrong |
|---|---|---|---|
| C1 | **Party-size HP scaling** (see below) | Infobox HP at every party size 2–8 | Expected TTK is wrong in absolute terms; DPS and rankings are unaffected |
| C2 | Which party size the infobox HP is for | Unknown | Same as C1 |
| C3 | Ocellus P2 HP 5250 (= P3 pool) | The phase is timed and 50% of damage goes to P3, so TTK is shown as n/a | None for DPS |
| C4 | Archive Guardian shield ("1490 in 6-scale") | Calculator / Search: not modelled (Flying TTK counts the 550 HP bar). Routes tab (phase 16): a setting, see D1 | Shield time not shown in the calculator |
| C5 | Corpses (Xarth), Void adds, Undead binders (Moia) | Bucket data only, not checked field by field | Adds aren't modelled |
| C6 | Obligator (Uncharged) | Same effect as the charged version (by name) | — |
| C7 | Ocellus P3 combat level 1601 (infobox) vs 1603 (prose) | Infobox | Cosmetic |

## (D) Raid time model (phase 16, Routes tab) and planner (phase 17, Plan tab)

These only change route **times** (and which route is fastest), not any DPS. Defaults in `RAID_TIME_DEFAULTS`
(`src/lib/fracturedArchive/raidTime.ts`); D1–D7 are settings in the "Assumptions (time model)" box. HP scaling (C1)
applies to every figure.

| # | What | What we assumed | If wrong | How to check in-game |
|---|---|---|---|---|
| D1 | AG flying shield hp | 1490 at 6 players (wiki community note "1490 health shield in 6-scale"), scaled by the party-size table relative to 6; all of it dealt at Flying DPS (the inert-guardian charges, ~40% of the shield, not counted as free damage) | AG time off by up to ~2 min (the shield is ~75% of the AG time) | Opponent Information on the shield bar at the start of each flying phase, at 2–3 team sizes; note how much a guardian charge removes |
| D2 | AG grounded share | 70% of the 550 hp grounded, 30% flying (it flies permanently below 30%) | Small (Flying vs Grounded DPS differ by ~20%) | Note the AG hp % each time it lands / takes off |
| D3 | Bork + Smorks killed evenly | Bork's 1500 hp in four equal quarters at armour 8 / 10 / 12 / 14; Smorks 600 at their DPS. Stun uptime 0 by default | Kill order and armour steps (A7) move the Bork time; stun uptime (A6) shortens it | Record the time spent at each armour step (Bork max hit − armour) and stun durations per kill |
| D4 | Ocellus P1 walking share | 0 (all P1 damage at a corner) | Melee kits lose time while he walks (Protect from Melee) | Time the walking segments vs P1 length |
| D5 | Ocellus P2 length | 0 s = P2 ignored (no time, no carry-over) | The route time misses P2's fixed length (the same for every route, so the fastest route doesn't change) and the carry-over that shortens P3 | Time P2 (three quadrant cycles) and read P3's hp at its start |
| D6 | Ocellus P2 carry-over | 50% of the Blade damage comes off P3 (wiki: "effectively transferring half") | Only matters with P2 length > 0 | P3 hp at its start vs the damage dealt to the Blade |
| D7 | Ocellus last quadrant | 25% of P3's (remaining) hp, all of it at the Deflect option that blocks the kit's best style (pessimistic; Soul Split / void-explosion parts not modelled). A melee-only kit therefore shows ∞ on Ocellus (it gets Deflect Melee, the worse one for it); in-game you can wait the Deflect out, so read ∞ as "waits, time unknown", not "can't kill" (same for a ranged-only kit and Deflect Ranged) | Ocellus time off by tens of seconds | Note P3 hp when the last quadrant starts and how long each Deflect / Soul Split part lasts |
| D8 | No adds / healing / downtime | Dreadnoth jellies, Moia's binders, Dagon'hai imps, Xarth corpse healing, Ezekiel's sword heals, Ocellus Soul Split and all puzzle / travel / invulnerable time are ignored | Absolute times are too low; routes with more of these (Dreadnoth jellies, Ezekiel heals) are favoured | Compare a real run's per-boss times with the Routes tab |
| D9 | Drains per encounter | Planned with the encounter's undrained time as the fight length (one fixed-point iteration); Defence drains apply per phase target (AG Flying / Grounded and Ocellus P1 / P3 are separate monsters in the calc) | Solo plans slightly generous; drains carried between AG forms / Ocellus phases aren't modelled | — (model choice) |
| D10 | Plan tab: switching | Switching between kit loadouts is free and instant (no lost ticks, no inventory clicks), as in the Routes tab; the plan only limits *what fits* in 28 slots | Kits with many switch items look better than they play | Count ticks lost per switch in a real run |
| D11 | Plan tab: slots and potions | Every item is one slot (no stacking besides what the item data implies); supplies are slot counts entered by the user and never drunk down; a style whose potion has 0 slots is evaluated without its boost (the drain model keeps the potions); Solo drains in the optimiser are planned with each encounter's undrained time with the best single loadout, and the top 5 kits are re-timed exactly (the earlier fixed-90 s approximation is resolved); a two-handed / one-handed + shield change needs the free slot the largest swap requires (counted as "swap space"); spec weapons from "My specs" and the pinned items are always carried | Free-slot count off by a slot or two | — (model choice; check against the in-game inventory) |
| D12 | Plan tab: candidates | Only the per-phase search results (3 weapons × 2 loadouts per style per phase), the presets, and partial switches between the best 2 loadouts per style are considered (caps in `PLAN_DEFAULTS`, docs/BEST_SETUP.md *Plan tab*). Greedy + local search, not exhaustive | A kit outside the pool (e.g. a weapon only the 4th-best on every phase) is never found | Raise the caps in `PLAN_DEFAULTS` and compare |

## (E) Tombs of Amascut (phase 18, Encounters tab / planner)

Monster stats and hp scaling are upstream's (verified in-game); these are the time-model readings on top.

| # | What | Assumed | Impact if wrong | In-game check |
|---|---|---|---|---|
| E1 | P2 shield per down | The Warden's Active-version hp (140 base, scaled) must be dealt to eject the core each down | P2 shield time off proportionally | Note the damage dealt between two core ejections at a known raid level / party size |
| E2 | P2 warden prayers | The initial prayers (Elidinis': Melee + Ranged; Tumeken's: Melee + Magic) for the whole of P2 ("initially") | A kit with only one of magic / ranged may be blocked part of P2 | Note the warden's overheads after each down |
| E3 | Kephri shields | 3 full shields; leaked swarms add 0 by default (setting). **Wiki conflict**: the Kephri page says "After two phases of shields, Kephri will finally be vulnerable", the Strategies page "After the third shield is cleared ... her fourth and final phase" (with two intermissions); we follow Strategies (3 shields) | Kephri time off by one shield (~1/3 of the shield time) if the Kephri page is right; too low by ~10% per leaked swarm | Count the shield bars and intermissions; Opponent Information at the start of each shield |
| E4 | Akkha prayer rotation | Akkha page: "Akkha will change combat styles after he performs six auto-attacks followed by a special attack" and "he will always pray against the same style with which he is currently attacking" — the rotation is by attack count, so **equal time** under each prayer (setting, default on): each lasts hp ÷ Σ (team rate under each prayer) and takes hp in proportion to the kit's DPS under it; a prayer that blocks the kit's only style still costs its time. Ignores the 60 s forced switch, Stay Vigilant's random switches and kiting him in melee form | Single-style kits are judged by the time Akkha spends praying against them | Time each prayer in a few kills |
| E5 | P3 siphons | 0% of the hp (setting); the % per reversed siphon is unpublished | P3 time too high | P3 hp before / after a reversed siphon set |
| E6 | Team DPS | Times assume the team-DPS multiplier's players dealing the user's DPS (time = damage ÷ (multiplier × DPS)); default = party size where hp scales with it (ToA), 1 for the Fractured Archive; editable in the assumptions box | Absolute times only; rankings unchanged | — (model choice) |
| E7 | Downtime | No invulnerable phases (memory blast, rolling stones, Zebak specials, siphons), paths, puzzles, healing | Absolute times too low | Compare a real run's per-boss times |
| E8 | Zebak "Not Just a Head" invocation | Not modelled: with it, Zebak's blood clouds / jugs can "heal for 2x the damage inflicted" (Strategies, Zebak's invocations) | Zebak time too low when the invocation is on and the heal isn't prevented | Note Zebak's hp after a missed heal |
| E9 | Spec drains across phases of one NPC | Each phase target gets its own fresh first round of specs (Solo / Team), e.g. Akkha main vs final stand, P3 vs P3 enraged; drains are never carried over (conservative where the Defence would persist; right where it resets: Kephri's final phase, the enraged P3 Warden's Defence 180) | Drained DPS slightly overstated where a phase would need specs again, understated where drains persist and no new specs are needed | Read the boss's Defence at each phase change |

## HP scaling: how to fill the gap

The wiki only says "hitpoints scale to the amount of players present, minimum 2". Nobody has published numbers yet,
so `FRACTURED_ARCHIVE_HP_SCALING` in `src/lib/scaling/FracturedArchive.ts` is 1/1 for every size.

To record it:

1. Turn on the boss health bar's numbers: RuneLite's built-in **Opponent Information** plugin (HP display: "Both"), or
   the game's own HP bar if it shows numbers.
2. For each boss, write down the **full HP at the start of the fight** for at least **2 or 3 different team sizes**
   (e.g. duo, 4-man, 6-man). Practice mode is fine if it scales the same way. Note the team size and the date.
3. Compare with the infobox HP (AG 550, Bork 1500, Smorks 600, Ezekiel 3000, Dreadnoth 2100, Moia 785, Xarth 2600,
   Dagon'hai 640 per shield gauge, Ocellus P1 2500 / P3 5250). The size whose HP equals the infobox is the reference size.
4. Fill the table as a factor relative to the infobox HP, `[recordedHp, infoboxHp]` per size, e.g. if Xarth has 2600 at
   2 players and 3900 at 4: `2: [1, 1]`, `4: [3, 2]`. Interpolate the sizes you didn't record only if the numbers are
   clearly linear. Then set `FRACTURED_ARCHIVE_HP_SCALING_VERIFIED = true` (this hides the "unverified" marker) and
   update the test in `src/tests/lib/scaling/FracturedArchive.test.ts`.
5. If the bosses don't all scale by the same factor, the table must become per boss (keyed by the `*_IDS` lists in
   `src/lib/fracturedArchive/constants.ts`). That's a small code change.

## Known limitations (modelling choices, not data gaps)

- **Specs aren't simulated.** Drains are counted as successful specs (misses aren't modelled), spec weapons (Burning
  claws, Voidwaker, Elder maul, Dual macuahuitl, ...) are ranked on their normal attacks only, and Zorya's tome's
  empowered follow-up attacks are not modelled.
- **Soulreaper axe** is evaluated at 0 stacks, which undervalues it (~9.0 vs ~11.0 DPS at 5 stacks on Xarth).
- **Eclipse atlatl** gets the ranged assumptions (Rigour + Ranging potion, no Strength boost), and the Blue Moon /
  Eclipse Moon set effects aren't modelled upstream. Both are undervalued.
- **Rondache**: its +2 flat armour / magic resistance and the Shield Slam spec are not modelled.
- **Ocellus**: tick-perfect dodge speed-ups (amount unknown), censers (next hit is a max hit), Untether (melee can't
  reach), and his healing from Soul Split are not modelled, so last-quadrant rankings are low-confidence.
- **Healing and adds**: Dreadnoth's slam heals and jelly absorption, Xarth's corpse healing, Ezekiel's heal when a
  sword misses him (and the sword damage / stun when it hits), Moia's undead binders and the Dagon'hai imps ("killing
  an imp buffs your next attack", effect unknown) and elemental-channel interrupts are not modelled.
- **Drain presets** always start with at least one spec of the named weapon, so all-Tonalztics plans (the wiki's
  "4 Tonalztics of Ralos" for AG) aren't offered. Eye of Ayak specs are counted at 40 damage each.
- **Gear search** only tries items in `searchCandidates.ts`. Multi-piece set effects are found only if the set is
  seeded.
- Adds (Corpses, Void adds, Undead binder) aren't in the raid id lists, so they get no drain-preset buttons and no
  party-size input. Void Siphon / Void Vine images failed to download from the wiki.
- In `yarn dev`, raid monster images are broken (dev loads images from the upstream CDN); production serves `/cdn`.
