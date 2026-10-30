# Progress log

Newest entry first. One entry per phase (or per notable fix). Keep entries short: what was done, how it was
verified, what's unverified / left for later.

## Phase 38j: FA Plan tab you can trust (FA, 2026-10-30)

ROADMAP row 38j (absorbs 41). docs/BEST_SETUP.md *Plan tab you can trust (phase 38j, FA)*; UNVERIFIED D36 (new), D30
note; DATA_SOURCES *Phase 38j*. Switches stay free (D10).

- **Kits compared, not timed** (display): the score is unchanged (Σ HP ÷ DPS, "boss time"). The total is labelled "boss
  time, your DPS alone: a rough estimate" (`plan-estimate`); alternatives / rejected kits, kit loadouts, other rings and
  the other routes show % differences ("1.4% more boss time than this kit"; closeCalls.ts `bossTimeDiff` / `bossTimeVs`),
  seconds in tooltips / `data-seconds`.
- **Spec energy from the measured room times** (roomTimes.ts): personal best per encounter and party size, else global
  best × the user's pace at that size (6 players 1.763698), else × the pace over all 24 pairs (1.819193; solo, 7, 8). The
  spec budget's clock stretches an encounter's rows to max(room, fight wall) (`rowWallsOn`; Ocellus P2 kept at 120 s);
  the raid clock = rooms + travel spread evenly (`clockWall`, `routeClock`, `raidClock(..., even)`); FA "Non-fight time"
  → "Travel time", default 21.5 → 4.5 min (overall best − five room bests, 3-6 players: 268.75 s). Other raids unchanged.
- **Close calls** (closeCalls.ts, `CloseCallsBox`): kit vs alternative, loadout vs without it, ring vs another full run,
  last carrier vs one fewer, your bar (HP spec vs carry), first damage weapon vs the best other (HP per bar over the
  route): within 2%; plus 38h-2's Solo drain flags (10%). Tagged "close call (depends on A11, …)" (A11 always; Obligator
  A1 / A2, Ascension crossbows A5, demonbane A8, Zorya A9). Not computed: whether a choice flips under an assumption
  (needs a magnitude per assumption).
- **Search / Summary filler** (`leftoverWeapon`): the cheaper weapon with the most HP for one spec (was the cheapest): FA
  Xarth "· leftover: Crimson kisten" on Search = Summary = Plan.
- **Headlines** (`pinHeadlines --full`), all from the extra energy (rooms last 2-5× the fight wall at 6 players, ~1.8×
  the solo fight): **fa 21:43.3 → 21:14.1** (−29.2 s): filler Burning claws → Crimson kisten (on Xarth, Ocellus P3); kit,
  ring, route, carriers, surge (AG, Ocellus) unchanged; AG 174.77 → 169.50, Bork + Smorks 189.75 → 186.19, Moia 65.32 →
  59.50, Xarth 181.62 → 180.61, Ocellus 691.84 → 678.32. **faSolo 22:53.9 → 22:08.7** (−45.2 s): ring Ultor →
  Lightbearer (regen per 15 s pays more over long solo rooms; 1328.7 vs Ultor 1329.6 s: a close call), the melee switch
  + Torva full helm, filler kisten (Ocellus P3), surge AG / Moia / Ocellus → AG / Ezekiel / Xarth / Ocellus; AG 180.67 →
  175.15, Ezekiel 210.65 → 216.71 (Lightbearer's lost DPS), Moia 65.32 → 42.06, Xarth 181.62 → 179.20, Ocellus 735.60 →
  715.62. **faNotOwned 24:43.4 → 24:17.4** (−26.0 s): ring Ultor → Lightbearer (0.2 s ahead), carriers 1 Elder maul + 4
  Tonalztics → 2 + 2 + 1 Eye of Ayak (3822 vs 3785 HP); AG 191.91 → 186.21, Bork 222.80 → 212.78, Moia 65.97 → 60.07,
  Xarth 209.70 → 211.66, Ocellus 792.97 → 786.72.
- **Close calls on the headlines**: fa 4 (an alternative kit at the same boss time, the worn Ascension crossbows 0.6%,
  the 3rd Tonalztics carrier 0.7%, the 2nd Elder maul 0.4%); faSolo 3 (the kit with a Tumeken's shadow worn 0.6%, the
  Ascension crossbows 0.6%, Ultor vs Lightbearer 0.1%); faNotOwned 8 (the melee + ranged kit 1.4%, five rings within
  0.0-1.7%, the 2nd Elder maul 1.8%, the Ayak carrier 0.3%).
- **Hand checks**: fa Xarth room 141 s = 4 ticks: bars 2 maul 200 + 80 + 5 − 100 = 185, 3 Tonalztics 300 + 120 + 7.5 −
  50 = 377.5, yours 100 + 40 + 2.5 − 75 − 50 = 17.5 (drainOutcome probe agrees); faSolo AG 178 × 1.819193 = 323.82 s on
  the Lightbearer: 21 ticks, 100 + 210 + 25 + 15 − 325 = 25; faSolo Xarth 458.44 s: 30 ticks, 5 ZCB, 15 left.
- **Tests**: Phase38j (room times by hand, rowWallsOn, the even clock and surge doses, Xarth ticks with / without the room,
  bossTimeDiff, close calls by hand for every kind + none, the fa headline's close calls). Updated: Phase37c (Xarth /
  Solo AG pools), Phase38h3b (kisten; the filler moves fa's second dose Ocellus → Xarth when removed, so the ZCB counts
  are compared where the doses agree; leftoverWeapon), Phase38h3 (filler, Solo ZCB per bar with the Lightbearer kit,
  Solo spec counts), Phase38h2 (faNotOwned carriers 3822.4 HP), Phase33 (Solo Bork 2 Tonalztics), Phase38a / 38c (4.5
  min); Phase38g's Solo Bork and Phase38a's carry test pinned to the fight-wall clock (`roomSeconds: undefined`); r27fa
  re-pinned. Slow pins: Phase34 (Bring / share: Crimson kisten), Phase38h3 slot check (Tonalztics 1061.4, Ayak 436.8
  HP), Phase32 user plan 26:28.0 → 25:42.2, Phase29 Solo pinned list 1388.56 → 1349.05 s, PHASE37_MEMO faSolo / faNotOwned.
- **Planning time** (pinHeadlines, alone): fa 38.8 s (HEAD ~35), faSolo 54.8 s (HEAD 29.8 s, **1.8×**: all six rings now
  run in full, the ring screens are within the guard), faNotOwned 43.7 s (HEAD 57.2 s with two at once). verifyPhase27's re-plan limit 20 → 30 s (20.5 s measured alone).
- **Open (blocker for review)**: the two brute-force kit tests fail: Phase36 (small pool, 294 kits) gap 4.39 s, Phase37c
  (tiny pool) 7.88 s; `bruteForceKits.mjs fa` gap 2.68 s. Cause (measured): the optimiser times a kit with a reference
  kit's spec plan (`fixedAlloc`); with the room times' spare energy the exact plans differ more between kits (other drain
  weapons per event), so Inquisitor's mace + Twisted bow + Scythe is valued 1516.8 s under the reference plan vs 1500.0 s
  exact and never reaches the exact re-time. Tried, no effect: RETIME_TOP 5 → 12; the best kit of each style mix re-timed
  exactly; per-encounter min over the plans of the best single loadout per style. The headline plans re-time with gap 0
  (`retime.mjs`); the missed kits are 0.2-0.5% faster (inside the close-call margin).
- Run: fast suite green (1449); FA slow suites (CrossRaid, Phase2*, Phase3*) green except the two brute-force tests above;
  `pinHeadlines --full` (then `--check` faNotOwned: no change); retime probe gap 0 (three FA); verifyAll 38j 38h3b 38h3 38a
  21 29 OK, 27 OK alone (timing); tsc, lint clean.

## Phase 38h-3b review fixes (FA, 2026-10-30)

Review of 5dabafac: PASS with findings; display only. (1) `leftoverWeapon` (bringRule.ts) picks the cheapest weapon
cheaper than the first that gains (ties: ranked order), and Search / Summary use the Plan's form "Then: 1. A (per bar) ·
leftover: B": FA Xarth now reads "… · leftover: Burning claws" on Search, Summary and Plan (was Crimson kisten on Search).
Tests (Phase38h3b): {zcb 80, kisten 60, claws 50} → Burning claws; a cheaper weapon gaining nothing is skipped; FA Xarth
`damageThenText` at the plan's Xarth DPS = the Plan's Xarth line. verifyPhase38h3b expects "leftover: Burning claws";
BEST_SETUP sentence about the mismatch removed. (2) planner.ts: comment that one filler candidate (the most HP) is priced
against kitHpCost on purpose (planning time; in FA claws is the only weapon fitting 22-40%).
- Run: `pinHeadlines --full --check` no change; Phase38h3b / Phase38h3, fast suite green; verifyAll 38h3 38h3b OK; tsc, lint clean.

## Phase 38h-3b: filler spec weapon for leftover energy (FA, 2026-10-30)

ROADMAP row 38h-3b (user decision A). docs/BEST_SETUP.md *Filler spec weapon for leftover energy (phase 38h-3b, FA)*.

- **Spend**: `DamageChoice.filler` (from `BestSetupAssumptions.damageFiller` → `SpecBudgetConfig.filler`) is the
  allocateBudget DP's second objective (`fw`): drains × 1.1 + the main damage specs first, then the filler's HP, so it
  only takes energy nothing else uses. Without a filler the DP is unchanged.
- **Bring** (planner items block): after the bring rule's weapons and the surge rule, each owned damage weapon not
  brought is tried as the filler on the planned route; the one adding the most HP is brought (free slot: > 0 HP; a slot
  from the kit: ≥ `kitHpCost`); then the surge rule runs again. HP only, no seconds.
- **Briefing**: Plan "Then: 1. Zaryte crossbow (per bar) · leftover: Burning claws" on the encounters where the plan
  specs it (`withLeftover`); Search Specs box / Summary: `thenWithLeftover` (the best per bar of the weapons cheaper than
  the first; FA Xarth Team shows Crimson kisten, while the plan picks Burning claws because 22-40% leftover fits 35%, not 50%).
- **Headlines** (`pinHeadlines --full`): **fa 21:47.8 → 21:43.3** (−4.5 s): Bring ZCB → ZCB + Burning claws + Surge
  potion (claws +29 HP, the dose +31 HP now that it can buy a claws spec); claws on AG Grounded, Smorks, Xarth, Ocellus
  P1; AG 175.78 → 174.77, Bork + Smorks 190.63 → 189.75, Xarth 182.78 → 181.62, Ocellus 693.30 → 691.84; free slots 6 → 4;
  kit, ring, route, carriers unchanged. **faSolo 22:57.2 → 22:53.9** (−3.3 s): + Burning claws (+46 HP) on Ezekiel,
  Xarth, Ocellus P3; Ezekiel 211.89 → 210.65, Xarth 182.78 → 181.62, Ocellus 736.58 → 735.60; free slots 3 → 2.
  **faNotOwned 24:43.4** unchanged (no free slot: claws add 40 HP, the kit change costs 788 HP; a new note). ZCB
  specs per encounter unchanged in all three. Recovers 4.5 of the 6.8 s (FA) and 3.3 of the 3.8 s (Solo) 38h-3 cost: the
  rest was kisten specs and the free mix of the old DP, which the "leftover only" rule does not allow.
- **Hand checks**: Xarth fa: 100 + 1 tick 10 + Death Charge 2.5 − ZCB 75 = 37.5 ≥ 35, so claws, 2.5% at the end
  (Phase37c updated: 37.5 → 2.5); faSolo: 100 + 60 + 15 − Tonalztics 50 − ZCB 75 = 50 ≥ 35, 15% at the end.
- **Tests**: Phase38h3b (DP one row at 120%: free 3 claws 165 HP vs filler ZCB + claws 155 HP; 100%: 25% left, no claws;
  + surge: claws; a filler never displaces a drain; text helpers; the headlines' ZCB counts equal those without the
  filler; Xarth pools by hand). Phase38h3 (damage / filler / Then strings), Phase37c (Xarth pool). Test utils
  (`finalAssumptions`, `recomputed`) carry `damageFiller`. Verify: verifyPhase38h3 accepts "· leftover"; new
  verifyPhase38h3b.mjs + docs/screenshots/phase38h3b-plan.png.
- **Planning time** (`pinHeadlines --check`, 3 at once, HEAD vs this): fa 41.8 → 34.7 s, faSolo 38.0 → 32.2 s, faNotOwned
  71.1 → 67.0 s (noise; the filler costs ≤ 4 route evaluations, faNotOwned one extra kit optimisation).
- **Memo pins** (PHASE37_MEMO) re-measured: fa 10698 / 8388 / 462466 / 5554, faSolo 23993 / 18648 / 1141713 / 7065,
  faNotOwned 20896 → 29805 encounter runs (+43%: the kit re-optimised for the claws, then rejected) / 13946 / 822703 / 18920.
- Run: fast suite green; FA slow suite once (360 passed, 2 failed: Phase34's pinned strings (bring line, share reason,
  alternatives) and the faNotOwned memo pin, both updated, then Phase34 / CrossRaidHeadlines / Phase31 re-run green);
  retime gap 0 (all three FA); verifyAll 38h3 38h3b OK; tsc, lint clean.

## Phase 38h-4: Soulflame horn (FA, display only, 2026-10-29)

ROADMAP row 38h-4. Wiki read first (docs/DATA_SOURCES.md *Soulflame horn*): Entice costs 25% energy per other player and makes
their next melee attack within 6 s always hit, melee specs included. The wiki matches the row (frees accuracy-limited drains).

- `soulflame.ts` (pure): `soulflameSaving` per melee drain weapon (Elder maul, DWH, BGS; not Tonalztics / Ayak): specs saved per
  landed drain = 1/p - 1/p' (p' = 1 for the maul, damage > 0 given an accurate roll for DWH / BGS), times the weapon's 50%
  energy, less the horn's 25% for one ally; shown only when the net is above zero (the maul below 2/3), else silent.
  `soulflameNote` picks the best weapon in the plan. SpecPlanPanel computes and shows it (not a DrainLine field: that would change the pinned plan hash).
- Value is in specs / spec energy, not HP: an HP value needs the team DPS and boss HP, which a drain state doesn't have (the
  planner's HP values live in the encounter budget); a note under the spec plan, no plan choice.
- FA: the maul is 54% only on Smorks (0.8 specs, 42% energy, 17% net: shown); every other target's maul is above 66% (silent,
  Ezekiel 88% tested). Tests (Phase38h4, hand-computed: maul 40% = 1.5 specs / 75% / 50% net; DWH 40.2% of 41.8% accurate; 80%
  silent). verifyPhase38h4.mjs + docs/screenshots/phase38h4-soulflame.png.
- Run: `pinHeadlines --full --check` no change; Phase38h4, fast suite, tsc, lint clean; verifyAll 38h4 OK.

## Phase 38h-3 review fixes 2 (FA, 2026-10-29)

Re-review of 5362a476: FAIL on C. `assignMe`'s HP now credits your carrying only when every bar is a carrier's
(Σ carriers > party − 1, `carrierBarCredit`); with a teammate's bar free the Team drain counts their carrier the same, so
0 HP and no kit slot given up. Low: a Solo slot check is dropped when a later round finds a free slot. Tests (Phase29):
5 carriers of 6 → 0 HP, no carry; 6 of 6 → 120 HP vs 30, carry; party 1 credited. Headlines unchanged (`pinHeadlines
--full --check` no change); Phase29 / 31 / 38h3 with slow tests green, fast suite green, retime gap 0, tsc, lint clean.

## Phase 38h-3 review fixes (FA, 2026-10-29)

Review of a4c63704: PASS with findings; fixed (the reviewer's A: filler weapon for leftover energy, and B: vote
counting, wait for the user).

- **1, `kitHpCostOf`** (bringRule.ts, pure; the planner's `kitHpCost` uses it): Jest by hand: 1000 HP at DPS 10 → 9.5
  costs 50 HP; Ocellus P2 (fixed length, carry-over 0.4) 20 HP; 10 → 11 is −100.
- **2, Solo drain weapons against a kit slot**: one that needs a slot from the kit (the kit without it has none free)
  is kept only when the HP it adds on the route (Σ `EncounterSpecPlan.hp` with − without, on the kit with it) is at least
  `kitHpCost` of the kit change (both kits without it); the worst goes first, notes say why (`perWeapon.slot` = adds /
  costs). Test (slow): a reduced Solo plan with 12 non-item slots: Elder maul 0 vs 148.9 HP, left at home; Tonalztics
  1045.0 vs 194.0 and Eye of Ayak 420.4 vs 339.8, kept. faSolo has free slots: unchanged.
- **3**: `perWeapon.specs` is the final plan's route count, `refSpecs` the reference plan's (faSolo: Elder maul 2 → 1,
  Tonalztics 10 → 7); the Plan list shows the final count (verify scripts 29 / 38h3 read `data-ref-specs`).
- **4**: stale comments (planner.ts spec weapons; PlanView's team-briefing tooltip) reworded to headcount / HP.
- **5**: BEST_SETUP notes the bring-rule gains come from the pre-items state (Team: you carrying, 6 carriers; the final
  plan has 5), so stored gains differ slightly (Solo Ezekiel 68.4 vs 67.1).
- **6**: ROADMAP round 7: with the spec budget off, Solo brings every owned drain weapon.
- **C, `assignMe` in HP** (no seconds): your share without items is carried when the drain HP its last carrier's bar pays on
  the route ≥ `kitHpCost` of the slot it takes (`share.slotHp`); `SHARE_MAX_SLOT_SECONDS` removed. Tests by hand
  (120 vs 50 carry, 50 vs 50 carry, 40 vs 75 not, nothing measured not). The headlines never reach it (you damage-spec).
- **Headlines**: unchanged (fa 21:47.8, faSolo 22:57.2, faNotOwned 24:43.4); phase37/faSolo.json moved only by
  `specs` / `refSpecs`. PHASE37_MEMO faSolo re-measured (24029 / 18699 / 1166147 / 6425: one optimiser run without each
  drain weapon); faSolo plans in 23.4 s (17.8 s before this fix; 76.8 s at a0efe7ed). Phase29's phase-29-pinned-list Solo
  test: Bring Tonalztics (the maul priced against its kit slot).
- Run: fast suite green; FA slow suite once (344 passed, 2 failed: the faSolo memo pin and the Phase29 pinned-list bring,
  both updated, then Phase31 and that test re-run green); retime gap 0; bruteForceKits fa tiny gap 0; `pinHeadlines --full
  --check` no change; verifyAll 29 38h3 OK; tsc, lint clean.

## Phase 38h-3: bring rule, no seconds left in spec choices (FA, 2026-10-29)

ROADMAP row 38h-3. docs/BEST_SETUP.md *Bring rule, no seconds in spec choices (phase 38h-3, FA)*.

- **Bring rule** (bringRule.ts, planner items block; replaces 38e's seconds beam / swaps and the 1 s a slot test): per
  boss / phase of the kit's planned route, each damage weapon's HP per full bar (`gainPerFullBar` at the row's drain
  event and DPS, `routeSpecGains`); bring the weapon ranked first on the most bosses / phases, a second only where the
  first can't hit or another deals ≥ 1.2× per bar (at most two); a free slot, or one from the kit (re-optimised) when the
  HP the item adds there is at least the HP the kit change costs on the route (`kitHpCost`: Σ damage × (1 − new DPS ÷ old
  DPS), the drain value's form; found by the FA tiny brute force: forcing ZCB into the kit's last slot left a 9.6 s
  faster kit unfound, so the slot is valued too; faNotOwned +400 vs 99 HP: kept). Surge
  potions while one adds HP the bars pay and a slot is free. A damage weapon (Solo: also a drain weapon) the plan then
  never specs is left at home.
- **Solo drain weapons**: `searchSpecSubsets` / `deltaSeconds` removed; the weapons the plan with every owned one specs
  on the reference kit's route (`PlanSpecs.solo.perWeapon`: weapon, chosen, specs).
- **You carry or you spec** (Team): by the HP the bars pay on the route (`pickCarriersByHp`, 10% leave-you-out), not
  the faster. `PlanItemStep.saved` (seconds) → `hp`. Removed: `searchSpecSubsets`, `weaponDeltaText`, `bestWithoutText`,
  `pickSpecItem`, `itemBeam`, `itemStepNet` (and their tests in Phase29 / 31 / 36 / 38e).
- **Briefing per boss**: "Drain: … · Then: 1. Zaryte crossbow (per bar)" on Plan (`PlanSpecs.then`, the brought
  weapons per encounter), Search (Specs box) and Summary (`GearSearchResult.then`, lazy). Plan's spec plan reads in HP
  (the bring rule line, "+N HP the bars pay", Solo "N specs on the route (brought)" / "left at home").
- **Scope choices** (closest to "values in HP, no seconds, fewer inputs"): the bring rule counts bosses / phases (Ocellus
  P3's two quadrants and Bork's four armour phases count separately); it runs on the kit before the items (the carriers
  then are the party's); a second weapon's slot is never priced in seconds (the rule decides; the kit is re-optimised
  if no slot is free); surge potions never take a kit slot; `assignMe`'s slot value in seconds (your share when you carry,
  no items) is not a choice this row names and stays. The ZCB ruby proc is valued at full hp in the rule (unverified
  simplification; the spec budget still caps at the hp left).
- **Headlines** (`pinHeadlines --full`): **fa 21:41.0 → 21:47.8** (+6.8 s): Bring ZCB + Burning claws + Crimson kisten +
  Surge potion → ZCB only. ZCB is first on all 12 Team phases (closest Ocellus P3 Q1-3, Crimson kisten 59.8 vs 62.3 HP per
  bar), so no second; the surge dose adds 0 HP with ZCB alone (75% a spec: +25% buys no extra spec on this route).
  Free slots 3 → 6; AG 173.49 → 175.78, Bork + Smorks 189.75 → 190.63, Xarth 180.61 → 182.78, Ocellus 691.84 → 693.30
  (the claws / kisten specs filling leftover energy are gone); kit, ring, route, carriers (2 maul + 3 Tonalztics) and
  "you spec" (2968 vs 2589 HP) unchanged. **faSolo 22:53.4 → 22:57.2** (+3.8 s): Bring Tonalztics → Elder maul +
  Tonalztics (the plan with every owned drain weapon specs the maul 2× and Tonalztics 10×; the maul used to be dropped for
  saving < 1 s per slot), ZCB + one Surge potion (+123 HP; a second adds none), Burning claws / Crimson kisten not brought
  (ZCB first on 7 of 8 phases; Ocellus P3 Q1-3 kisten 59.3 vs 58.7, below 1.2×). Free slots 2 → 3; Ezekiel 211.61 →
  211.89, Xarth 181.62 → 182.78, Ocellus 734.19 → 736.58. **faNotOwned 24:43.4** unchanged (ZCB only already; you spec
  3293 vs 2854 HP); its phase37 fixture moved only by the new fields (bring rule, Then, item HP, notes).
- **Tests** (Phase38h3.test.ts, 13): the rule on toys by hand (first / second / 1.2× edge / ties / not owned / nothing
  gains), `mergeGains`, `thenText`, `profileGain` ((50 − 10 × 5 × 0.6) ÷ 75 × 100); per FA boss on fa (Team) and faSolo
  (Solo): an independent HP per bar (buildTargetMonster at each event's counts, upstream's spec profile, the formula) with
  ZCB pinned per boss / phase (0.1 HP), the best other weapon, none ≥ 1.2×; `routeSpecGains` (kit path) = the independent
  values; the plan's stored decision = the rule on its stored gains; "Then" on every encounter; Solo perWeapon; Team
  you-spec by `pickCarriersByHp` on the note's HP. Updated: Phase29 / 31 (Solo choice by specs), Phase36 (carry vs spec
  in HP, slow), Phase37c Xarth (your pool 37.5: no surge dose), Phase38e (beam tests removed; the party-8 plan 25:08.7 →
  25:15.9, ZCB only), Phase33 / 29 slow (Solo Bring Elder maul + Tonalztics), Phase34 (alternatives with 3 more free
  slots; Bring ZCB), PHASE37_MEMO fa / faSolo / faNotOwned re-measured (10638 / 8309 / 497142 / 3847; 9706 / 9352 /
  640382 / 1292; 20896 / 13664 / 591775 / 9461: no subset search, no beam). Verify scripts: new
  verifyPhase38h3; 29 and 31's Solo checks.
- Speed (Node, `pinHeadlines --check --jobs 1`, same session, vs a0efe7ed via `git archive`): fa 30.1 → 25.3 s, faSolo
  76.8 → 17.8 s (no subset search), faNotOwned 82.0 → 50.6 s (no item beam).
- Run: fast suite green; FA slow (`CrossRaid Phase2 Phase3`) once: 344 passed; retime probe gap 0 (fa, faSolo,
  faNotOwned); bruteForceKits fa (small and tiny) gap 0; `pinHeadlines --full --check` no change; verifyAll 29 31 38h3 OK
  (29's AG Flying chance check relaxed to 9x%: it has read 99% since 38h-1/2); tsc, lint clean.
- Unverified / open: the ZCB ruby proc at full hp in the rule; the 1.2× factor and "most bosses / phases" counting are
  the ROADMAP's wording read literally (Bork's armour phases count four times).

## Phase 38h-2 review fixes 2 (FA, 2026-10-29)

Re-review of 136283d7: FAIL on N1 (Medium); findings 1-6 closed.

- **N1, carrier sets valued by what the bars pay** (option b, at the final choice): `kitCarriers`' per-phase value credits
  every phase with full bars (Ocellus, 4 Tonalztics: T ×2 + T ×8 + T ×5), so it overrates one-weapon-heavy sets. On the
  final kit the planner now values every set the walk considers (the most carriers the bars allow, Eye of Ayak ≤ the
  kit's mages, + the current one) by Σ `EncounterSpecPlan.hp` of the budgeted plans over the planned route (bars shared;
  the planner's DPS matrix, one route pass per set) and keeps the most HP (`pickCarriersByHp`, the 10% leave-you-out
  rule). The per-phase value still drives the kit search (cheap). *Correction*: the previous entry called faNotOwned's
  gap a search limit; it was this value bias.
- **N2**: Eye of Ayak stays at its ranked drain (documented in `drainOutcomeStates` and BEST_SETUP: averaging its up to
  magic-defence + 1 outcomes would multiply the DPS evaluations; unverified as an approximation).
- **Headlines** (`pinHeadlines --full`): fa 21:41.0 and faSolo 22:53.4 unchanged; **faNotOwned 24:48.4 → 24:43.4** (−5.0 s):
  same kit and route, carriers 4 Tonalztics + 1 Eye of Ayak → 1 Elder maul + 4 Tonalztics (HP on the route 3293.2 →
  3358.9; Bork + Smorks 217.50 → 222.80, Ocellus 803.29 → 792.97). The review's 1 Elder maul + 3 Tonalztics + 1 Eye of
  Ayak is 1.4 s faster (1481.98 s) but pays less HP (3347.1): the choice is by HP, not seconds. PHASE37_MEMO faNotOwned
  re-measured (82985 / 13958 / 2177152 / 75431: one route pass per carrier set). r27fa, Phase27 and the CrossRaid preset
  pins unchanged.
- **Tests** (Phase38h2.test.ts): `pickCarriersByHp` by hand; faNotOwned: the plan's carriers pay the most HP on the
  planned route among the review's alternatives (3358.9 vs 3347.1 / 3355.3 / 3293.2 / 3324.5, exact evaluator).
- Speed (Node, alone, same session): fa 15.7 s (38h-1 code) → 28.6 s (1.82×).
- Run: fast suite 1418 passed / 196 skipped; FA slow (`CrossRaid Phase2 Phase3`) once: 346 passed, none out of date;
  retime probe gap 0 (fa, faSolo, faNotOwned); drainOutcome faNotOwned Ocellus / Bork + Smorks: spec plan = the plan's;
  tsc, lint clean.

## Phase 38h-2 review fixes (FA, 2026-10-29)

Review of 87f51141 = FAIL; fixes (docs/BEST_SETUP.md *Spec bars valued in boss HP (phase 38h-2, FA)* updated).

- **Stale carriers** (HIGH): the carriers were taken on an earlier kit; the item steps re-optimised it and the guards
  re-took them only when there were too many (faNotOwned: an Ayak carrier with 0 mages). The planner now takes them again
  on the final kit (`headcountOf`, Eye of Ayak capped at its mages), re-times, keeps the faster; a kit never keeps more
  Ayak carriers than mages (test on the pinned plans). Timing every finalist with re-taken carriers was tried: 3× slower,
  the same headlines; dropped.
- **Kit carriers over the planned route** (user decision): `kitCarriers` values the bosses of the route the plan takes
  with the kit (its fastest route under the plan's current specs), not every route's.
- **Values averaged over the outcomes** (user decision): every option is worth Σ P(Defence d) × H × (1 − DPS without ÷
  DPS at d) (`drainOutcomeStates`, `PhaseQuery.defence`, bestSetup.ts `monsterAtDefence`), the planner's carrier value
  too; the exclusion of partial drains ranked at the floor below the threshold is gone (they now count at their chances).
- Damage specs on a row worth at most the row's damage (specBudget.ts). ROADMAP round 7: re-check ToA's Liquid adrenaline
  (window guard removed).
- **Headlines** (`pinHeadlines --full`, vs 87f51141): **fa 21:41.7 → 21:41.0** (−0.7 s, Bork + Smorks 190.43 → 189.75:
  Bork Elder maul ×3, the Smorks Tonalztics ×6 + Elder maul ×1, was 4 / 6 + 0; Ocellus unchanged). **faSolo 23:04.4 →
  22:53.4** (−11.0 s): with the real chances a single Tonalztics spec on Moia, Xarth and Ocellus P1 (was 2) and the energy
  to damage specs; the kit brings Burning claws too (free slots 3 → 2): Ezekiel 210.43 → 211.61 (Burning claws ×2 for the
  Zaryte crossbow), Moia 71.13 → 65.32 (a ZCB spec, the surge dose here), Xarth 182.78 → 181.62 (Burning claws), Ocellus
  739.40 → 734.19 (a ZCB spec on P1, the dose here). **faNotOwned 24:53.7 → 24:48.4** (−5.3 s): another kit (Tumeken's
  shadow + a Twisted bow switch + Scythe; a mage, so 4 Tonalztics + 1 Eye of Ayak are valid and taken again on it), route
  Bork + Smorks instead of Ezekiel, Zaryte crossbow only (AG 191.91, Bork + Smorks 217.50, Moia 65.97, Xarth 209.70,
  Ocellus 803.29). *Corrected in review fixes 2*: the carrier pick here was the per-phase value's bias (full bars
  at every phase), not a search limit. r27fa 1545.8 → 1531.5 (memo 1116 /
  1320 / 19132 / 185); Phase27 ring pin 1545.8 → 1531.5; CrossRaid preset kit Ocellus 833.8 → 820.8; memo counters of
  fa / faSolo / faNotOwned within PHASE37_MEMO.
- **Tests** (Phase38h2.test.ts): per FA boss (Team, Solo) each event's HP recomputed by enumerating upstream's spec calc
  over the outcomes in the plan's order and the DPS at each Defence; HP pins (presets kit; AG Team 381.7, the Smorks 246.9,
  Xarth 192.7, Ocellus P1 / P2 / P3 414.9 / 195.4 / 718.2, Solo AG 338.5, Solo Ocellus P3 495.9); an exhaustive joint
  check on Ocellus (Team: every P1 × P2 × P3 option, the DP placing the damage specs and the dose: none beats the plan);
  Eye of Ayak carriers ≤ mages on the pinned plans; the close call moved to the Smorks (party 1, Elder maul + ZCB, 64 HP).
  Updated strings (comments): Phase33, 34, 35b, 37c, 38g.
- Speed (Node, alone, same session, machine under load): fa 35.0 s (38h-1 code) → 64.8 s (1.85×; was 1.4× before the
  fixes): the DPS at every Defence outcome.
- Run: fast suite 1416 passed / 196 skipped; FA slow (`CrossRaid Phase2 Phase3`) once: 5 out of date (Phase34 / 35b strings:
  the Smorks Tonalztics ×6 + Elder maul Def 7, Xarth Elder maul ×2 → Tonalztics; Phase32 user plan 26:07.5 → 26:28.0;
  Phase29 Solo with the phase 29 pinned list now 1388.56, 1.1% above the faSolo headline: pinned to its own value;
  Phase31's CPU guard 205 → 300 s, 208.8 s measured under load), updated and those tests re-run green; retime probe gap 0
  (fa, faSolo, faNotOwned); drainOutcome AG / Bork + Smorks / Ocellus (fa, faSolo, faNotOwned): spec plan = the plan's;
  tsc, lint clean.

## Phase 38h-2 - spec bars valued in boss HP (FA, 2026-10-29)

Numbers phase (ROADMAP 38h-2; docs/BEST_SETUP.md *Spec bars valued in boss HP (phase 38h-2, FA)*).

- **Drain value** H × g ÷ (1 + g) (encounterBudget.ts `drainHpValue`: per row damage × (1 − DPS without ÷ DPS with), from
  the pass with the event's plan vs none; Ocellus P2 counts through the damage it carries off P3). **Damage spec** = its
  net (E[spec] − DPS × ticks, at the drained Defence). **Per bar** (specBudget.ts `allocateBudget`): the DP now maximises
  HP (drains × 1.1 + damage nets; `DRAIN_CLOSE_CALL`), was the least seconds; seconds are only reported. `closeCall` on
  an event your bar pays when its energy buys damage specs worth ≥ 0.9 × the drain; every event carries its `hp`.
  Liquid adrenaline window guard removed (a row's specs cost what its start says). Surge / Death Charge placement unchanged.
- **Options per event** (`eventOptions`): the line's plan, it cut short in send order (partial drains), the line's plan
  within every cap (Team per weapon, Solo in all): **re-planned, not cut** (carry-over a; Ocellus P3 Q1-3 with 1 maul
  left: T ×3 → M → T 98.1% vs the cut M → T 68.9%); partial Eye of Ayak counts. A partial drain that ranks at the floor
  below the threshold is not offered (1 Tonalztics on Ocellus P1 73% would be worth a full drain: the ranked-Defence
  rounding). Team: drains chosen first over the carriers' bars, then your damage specs (speed; see BEST_SETUP).
- **Interleaved orders** (carry-over b; `bestDrainPlan`, `defenceOutcome`): up to 3 weapon blocks (T ×3 → M ×3 → T ×3);
  the Smorks with 2 maul + 3 Tonalztics: 97.5% vs block 95.0%. The 38h-1 line plans are unchanged.
- **Kit carriers by HP** (`kitCarriers` `value`, planner `drainValueOf`): replaces the coverage count and the worst-boss
  P(floor) tie-break; a kit leaving you out wins unless the other is worth > 1.1 × it. **Scope choice (report)**: H for the
  carriers' value = each phase's damage in the kit's undrained pass and all bosses of every route are summed (a heuristic
  over the raid, like the old "most any boss needs").
- **Headlines** (`pinHeadlines --full`): **fa 21:39.9 → 21:41.7** (+1.8 s): Bork + Smorks 189.79 → 190.43 (same drains;
  the Zaryte crossbow spec moves from Bork armour 12 to armour 8, where it is worth more HP: its ruby proc is a share of
  the HP left; the seconds objective preferred the slower row), Ocellus 690.73 → 691.84 (P2 Elder maul ×4 → Tonalztics
  ×1, 59%, ranked Def 15, was ×2 97% Def 0; P3 gets 5 Tonalztics specs, 97% Def 150, was 4, 91%: P3's drain is worth more
  HP than P2's last Tonalztics spec). **faSolo 23:39.1 → 23:04.4** (−34.7 s, all Ocellus 774.09 → 739.40): P2 no drain
  (its 1 Tonalztics spec was worth little: Def 250 → 223 for a fixed 120 s), P3 2 Tonalztics specs (Def 176, was 1, Def
  213), a Crimson kisten spec on P3 and the Zaryte crossbow on the last quadrant; the kit now brings Crimson kisten (free
  slots 4 → 3). **faNotOwned 24:40.2 → 24:53.7** (+13.5 s, Ocellus 783.89 → 797.40): carriers 2 Elder maul + 3 Tonalztics
  → 4 Tonalztics + 1 Eye of Ayak. *Corrected by the review*: the Ayak carrier was worth 0 HP on the final kit (no mage);
  the carriers had been taken on an earlier kit with a mage and the item steps changed the kit without re-taking them (on
  the final kit 2 Elder maul + 3 Tonalztics were worth more and 11.8 s faster). Fixed in the review fixes below. r27fa re-pinned (1562.5 → 1545.8 s; memo 1113 / 1251 / 21007 / 155, within PHASE37_MEMO; fa / faSolo / faNotOwned
  counters measured within ±20%, unchanged). Phase27 ring pin 1564.4 → 1545.8; CrossRaid preset-kit pins Bork + Smorks
  230.2 → 221.2, Ocellus 844.7 → 833.8. ToA / CoX / ToB frozen (their pins not re-run).
- **Tests**: Phase38h2.test.ts (drainHpValue by hand incl. the P2 → P3 carry; interleaved Smorks and the two-weapon
  re-plan by upstream enumeration; kitCarriers HP rule + 10% leave-you-out by hand; per FA boss Team and Solo (AG, Bork +
  Smorks, Ezekiel, Moia, Xarth, Dagon'hai, Ocellus): each event's HP recomputed with the formula from the model's passes,
  plan HP = drains + damage nets; a real close call (Ocellus P2, party 4, maul + ZCB) checked against the rule). DP toys
  rewritten in HP with hand values and exhaustive search (Phase36, 37, 38b). Updated strings with comments: Phase32, 33,
  34, 35b, 38g, CrossRaid, Phase27.
- Speed (Node, one plan alone): fa 13.2 → 18.5 s, faSolo ~43 → 46 s (option memo by model content, Solo caps in all, no
  option pruning, Team drains-first DP).
- Run: `verifyAll 38g 38g2` 2 / 2 OK; fast suite 1412 passed / 196 skipped; FA slow (`CrossRaid Phase2 Phase3`) once: 4 slow pins out of date (Phase32 user plan 27:16.5 → 26:07.5, Phase29 Solo {maul, Tonalztics} 1463.9 → 1418.0, Phase38e party-8 25:07.9 → 25:08.7, Phase34 Ocellus strings), updated and those files re-run green; retime probe gap 0 (fa, faSolo, faNotOwned);
  drainOutcome archive-guardian / bork-smorks / ocellus (fa, faSolo, faNotOwned): spec plan = the plan's; tsc, lint clean.
- Open: partial drains are valued at the ranked Defence (nearest reachable to the expected), not the expected DPS over
  the outcomes; the Team two-stage DP ignores a damage spec's net change with the drain; the close-call flag is in the
  plan data only (the briefing line is 38h-3).

## Phase 38h-1 - the bars pay the drain line's plan (FA, 2026-10-28)

Numbers phase (ROADMAP 38h-1; docs/BEST_SETUP.md *The bars pay the line's plan (phase 38h-1, FA)*).

- **One model everywhere**: `defenceOutcome` sends the attempts as weapon blocks in the order that lands the floor most
  often, each spec at the Defence the earlier ones leave (was upstream's order at the undrained hit chance); ranked counts
  reproduce the Defence in upstream's order (`reproducingCounts`). The drains made are the line's plan (`kitDrainPlan` =
  `bestDrainPlan` within the kit's carriers / your weapons; `bestDrainPlan` gets an `available` cap): spec budget
  (`eventWantedCounts`: the plan's exact specs; a later phase of an event that the specs so far already floor adds none),
  Team drain state's first round (`teamSpecPlan` `firstRound`), Solo plan, `neededSpecs`, kit carriers (`teamRoles` /
  `kitCarriers`: the line's carriers per boss, first in its passing teams). Search brief = line on every FA boss, e.g. AG
  Grounded "first round 2× Elder maul + 1× Tonalztics (P floor 96%)" = "Tonalztics → Elder maul ×2 (floor 96%)".
- **Interleaved orders**: scratch probe over every FA phase (23, Team party 6 and Solo), every sequence of the plan's
  length and one fewer: gain 0.000 points everywhere, none reaches 95% with a spec fewer. Block orders suffice (no change).
- **Headlines** (`pinHeadlines --full`): **fa 22:07.3 → 21:39.9** (−27.4 s): Ocellus 715.27 → 690.73 (P2 pays the line's
  Elder maul ×4 → Tonalztics ×2 instead of maul ×4 + Tonalztics ×4, so the Tonalztics bars pay 4 specs on P3 instead of 2:
  P3 P(floor) 31.9% → 90.9%, ranked Def 176 → 150); Bork + Smorks 192.62 → 189.79 (same specs; the Smorks' Tonalztics ×6
  at the drained rolls: P(floor) 28.5% → 51.4%, ranked Def 36 → 13). **faSolo 23:39.1 unchanged** (its phase37 fixture
  moved only the comparison hash and one DPS-matrix cell: Ocellus P2 Solo drain state 15.08 → 15.45 DPS, a fixed-length
  phase, so no seconds). **faNotOwned 25:11.1 → 24:40.2** (−30.9 s): at the drained rolls 2 Elder maul + 3 Tonalztics
  carriers cover every boss (the Smorks: 97.7% with every carrier's 2 specs; the budget's plan Elder maul ×3 → Tonalztics ×6 = 95.0%; was below 95%, which needed a 4th Tonalztics carrier = you), so you are no
  longer a carrier: you bring Crimson kisten, Zaryte crossbow, Burning claws and a surge potion; the kit drops Tumeken's
  shadow (4 free slots) and the fastest route takes Ezekiel instead of Bork + Smorks (AG 196.47 → 186.44, Moia 71.13 →
  65.32, Xarth 214.79 → 206.83, Ocellus 800.13 → 783.89). r27fa re-pinned by hand (1564.4 → 1562.5 s; memo 1168 / 1159 /
  17232 / 57, within PHASE37_MEMO). ToA / CoX / ToB frozen (round 6).
- **Tests**: Phase38h1.test.ts (per FA boss AG Flying / Grounded, Bork, Smorks, Ezekiel, Xarth, Ocellus P1-P3, Team and Solo:
  the line's plan, the brief's counts, P(floor) and the budget's event counts, P built by an independent enumeration of
  upstream's spec calc at each drained Defence; AG Grounded and Bork in closed form; AG event; the reproducing counts toy).
  Updated for the new numbers (each with a comment): Phase23, 29, 32, 33, 34, 35b, 38g, Presets. `drainOutcome` probe:
  new `order` column and the drain line per phase (AG: the event pays the shield's Tonalztics ×4, which floors Grounded at
  99.6%; Grounded's own line Tonalztics → Elder maul ×2 is shown below it).
- Run: fast suite 1391 passed / 196 skipped; FA slow (`CrossRaid Phase2 Phase3`) once: 3 string / memo pins out of date (Phase34, Phase35b: Smorks Def 36 → 13, Ocellus P3 Def 176 → 150; faNotOwned memo counters, re-measured: 74977 / 9838 / 1854095 / 66172, more kits once you have free slots), fixed and those three files re-run green; retime probe gap 0 (fa, faSolo, faNotOwned); `verifyAll 38g 38g2` OK; `drainOutcome` on archive-guardian / ocellus / bork-smorks: spec plan = the plan's, no overspend; tsc, lint clean.
- Open: `landedNeed`'s "once 1 Elder maul spec lands" still explains in upstream's order (AG Grounded); when the bars can't
  pay an event's plan the shortfall is cut, not re-planned (Ocellus P3: no maul bar left after P2).

## Phase 38i - reality check of the FA data against Gearscape (2026-10-28)

Compare only; no src/lib change (ROADMAP 38i). Details and the full cell table: docs/DATA_SOURCES.md *Phase 38i*.

- **Gearscape can be automated** (Nuxt/Vuex store commits + the page's own `loadTarget`, then read the result card; no login).
  `scripts/probes/gearscapeOurs.mjs` (ours; `--drain team` for drained numbers) and `gearscapeCompare.mjs` (both, ~2 min).
- 14 FA rows (AG Flying / Grounded, Bork armour 8/10/12/14 + stunned, Smorks, Ezekiel, Xarth, Ocellus P1 x2 / P2 / P3) x 4 setups
  (Twisted bow, Scythe, Obligator, Shadow) at the planner's default player: accuracy equal in every cell; DPS equal in 32 of 56,
  <1% in 9 more (Obligator: size bonus per hit in ours vs on the max hit in Gearscape, UNVERIFIED A1; reproduced by enumeration).
- **>3%, all explained, none a data error of ours**: Bork armour rows (Gearscape has a fixed flat 10, ours 8-14; our armour 10 row
  matches), Bork armour 10 Twisted bow -4.6% (Seeking min hit 3 before vs after the flat armour; Gearscape's mean fits "after"
  exactly), Bork stunned (ours: melee auto-hit, Gearscape rolls; shadow +6%: ours drops the 2 magic resistance, A6), Ocellus P1
  walking (ours Protect from Melee = 0, Gearscape has no prayer state). No new fix row.
- **docs/calibration/checklist.md** (+ results.md to fill): drain specs thrown / landed vs our hit chance per boss, DPS Counter vs
  our drained DPS, A11, A1, A3, A7 with what to record.
- Gates: `pinHeadlines --full --check` no change (fa 22:07.3, faSolo 23:39.1, faNotOwned 25:11.1); fast suite 1376 passed / 196 skipped; lint clean.

## Phase 38g-2 - one drain plan: the combination and order that land most often (FA, 2026-10-28)

Numbers phase, display only (ROADMAP 38g-2; docs/BEST_SETUP.md *One drain plan (phase 38g-2, FA)*). No headline moved.

- **Bug**: the 38g line showed `drainOrder` (each weapon alone at the undrained Defence) with a count `neededSpecs` scored
  in upstream order. Now ONE plan (teamSpecs.ts `bestDrainPlan`): every combination in every weapon-block order, the
  fewest specs reaching the floor at 95%, then the highest P(floor); the shown order is the one whose chance is shown.
  "to Def d*" uses the best mix over all plans (was the first weapon alone, drainLine.ts:135).
- **Order matters** because each spec now rolls at the Defence the earlier ones leave (`outcomesAt`; specs.ts
  `DrainModel.accuracy` = attack roll + defence roll per level, kept only where it reproduces upstream exactly; Tonalztics'
  two hits rebuilt as upstream does). Matches upstream's spec calc at drained Defences to 1e-12 on every FA boss.
- **FA lines** (Team, default party): AG Grounded "Tonalztics → Elder maul ×2 (floor 96%); 1 brings Tonalztics, 1 brings
  Elder maul" (maul ×2 → Tonalztics lands less); AG Flying "Tonalztics ×4 (floor 99%)"; Bork (every armour phase) "Elder
  maul ×4 (floor 97%); 2 bring Elder maul"; Smorks "Tonalztics ×8 (floor 96%); 4 bring Tonalztics" (was ~9 / floor not
  reached Solo); Ezekiel "Elder maul ×3 (floor 97%)"; Xarth "Tonalztics ×2 (floor 98%)"; Ocellus P1 "Tonalztics ×2 (floor
  99%)"; P2 "Elder maul ×4 → Tonalztics ×2 (floor 97%)" (was ~8 specs); P3 Q1-3 "Elder maul ×3 → Tonalztics (floor 98%)",
  last quadrant (Deflect Melee) "Tonalztics ×5 (floor 97%)".
- **Not changed** (38h): the time model, `eventWantedCounts`, the ranked Defence and kit carriers keep the undrained rolls,
  so the bars may pay more than the line's plan. `pinHeadlines --full`: headlines.json / README unchanged (FA 22:07.3, FA
  Solo 23:39.1, FA not owned 25:11.1); phase37/fa, faSolo, faNotOwned and r27fa (by hand) changed only their `comparison`
  hash: the drain facts text inside the route comparison (checked: the comparison JSON with `facts` stripped hashes the same
  at HEAD and here). ToA / CoX / ToB fixtures stay frozen (their facts text moved too; round 7 re-pins them).
- Tests: Phase38g2.test.ts (outcomes vs upstream per FA boss; per boss AG, Bork, Smorks, Ezekiel, Xarth, Ocellus P1-P3
  with P(floor) hand-built from upstream hit chances at each drained Defence or an independent enumeration; AG and Ocellus
  P3 where the order changes the chance; d* best mix on a hand toy (M M T → 23 vs maul ×3 → 28) and the Smorks with maul +
  BGS). Phase38g / Phase35b wording updated. verifyPhase38g.mjs regexes updated; new verifyPhase38g2.mjs (screenshot
  docs/screenshots/phase38g2-search.png).
- Run: fast suite 1376 passed / 196 skipped (123 s; this machine was ~4× slower today: Phase28 alone 20 s here and at HEAD);
  FA slow (`CrossRaid Phase2 Phase3`) 25 suites green, 12 min 10 s; verifyAll 38g 38g2 OK (38g2's grammar fixed once for
  the Eye of Ayak suffix and "none of your drain weapons can hit"); tsc, lint clean.
- Open (38h): the Search / Plan drain brief above the line still shows the drain state's own specs (AG Grounded: "Tonalztics
  4 hits → Def 156") while the line recommends "Tonalztics → Elder maul ×2"; making the bars pay the line's plan moves
  headlines and belongs with the HP valuation.

## Phase 38f-2 - FA only: the other raids hidden, their tests / pins / verify steps gated (2026-10-28)

Tooling + UI, no src/lib calculation change (ROADMAP 38f-2; round 6 is Fractured Archive only).

- **UI**: `SHOW_OTHER_RAIDS` / `VISIBLE_RAIDS` in `src/lib/raids/index.ts` (default off; `NEXT_PUBLIC_SHOW_OTHER_RAIDS=1`
  shows the tabs). BestSetup.tsx lists only `VISIBLE_RAIDS`; a saved tab of toa / cox / tob shows the FA (the saved value and the
  other raids' saved inputs are left as they are). `scripts/verifyPhase38f2.mjs` (screenshot `docs/screenshots/phase38f2-fa-only.png`): OK.
- **Tests**: `src/tests/utils/otherRaids.ts` (`otherRaidsTest` / `otherRaidsDescribe` / `otherRaidsSlow*`, `faRows`, `OTHER_RAIDS`).
  ToA / CoX / ToB files gated whole; mixed files split (FA part stays on) in CrossRaid, CrossRaidHeadlines(Cox) (via
  `headlineTests`), Phase21, 27, 30-38g, 35b, 36, 37, 37b, 37c, 38a-c, RaidConfig, SpecAccuracy, Heart, ItemRefresh. Kept on: upstream
  scaling tests, pure maths, settings persistence (Phase37b). The Phase37c CLI smoke now runs `retime.mjs fa`.
- **Pins**: `pinHeadlines.mjs` defaults to fa / faSolo / faNotOwned (`--other-raids` / `RUN_OTHER_RAIDS=1` for all); toa / cox / tob
  fixtures (headlines.json entries, phase37/*.json) frozen. `verifyAll.mjs`: scripts marked `// other-raids-only` (35, 37b)
  skipped, the other-raid steps of 21, 23, 27, 30, 32, 33, 35b, 36, 37, 38a, 38b gated by `scripts/otherRaids.mjs`; flag `--other-raids`.
  (37b, the settings round trip, ran on ToA: its FA-only form is round 7 / final review; Phase37b.test.ts still covers it.)
- **Suite times** (before -> after): fast 39.2 s / 1609 tests -> 26.3 s / 1356; `RUN_OTHER_RAIDS=1` fast 35.7 s / 1610 (green once);
  FA slow (`CrossRaid Phase2 Phase3`) ~12 min (BUILDER, not re-measured) -> 4 min 51 s, 24 suites green.
- Gates: `pinHeadlines --full --check` "no change" (fa 22:07.3, faSolo 23:39.1, faNotOwned 25:11.1; 40 s); verifyAll 21 23 27 30 32 33
  35b 36 37 38a 38b 38f2 OK; tsc, lint clean.

## Phase 38g fix round — review B1 / B2, the user's decisions (2026-10-28)

Review of 7278baad: FAIL on two display bugs; the user decided three open points. One fix commit.

- **B1**: the Team facts line counted at most 8 specs while carriers go to 2 × party (the Smorks read "not reached in 8
  specs; 5 bring Tonalztics"): `neededSpecs(…, maxSpecs)`, Team max(8, 2 × party). The floor out of reach with `paid`
  known: "(floor not reached, you have ~N)"; specs mixing more than a single / hammer + finisher team show their carriers.
- **B2**: Solo counted the specs to the floor over every weapon (faSolo Ezekiel "~3", the maul's): now over the weapons
  you bring (Tonalztics: "~5"); the order still lists all. Search, Solo: the short line reads "2 must land" (`mustLand`).
- **Decision 1**: Ocellus P2 keeps its drain (no change).
- **Decision 2, cap at what helps**: an event whose floor no kit team reaches at 95% gets d* = the lowest Defence the
  available specs reach at 95% (`defenceAtThreshold`) and spends only the fewest specs in drain order still reaching d*
  (`helpfulSpecs`; Team in whole carriers); was "every carrier". Hand-checked on Tekton (maul h ≈ 0.67): 6 specs → d* =
  91 with 5; 4 specs → d* = 140 with 3. The line: "floor not reached in 8 specs; ~7 specs to Def 60 at 95%; 4 bring Elder
  maul for Def 60".
- **Decision 3, `kitCarriers`**: Eye of Ayak competes in the carrier walk (was reserved first); on equal coverage (the
  user's intent: carriers must not crowd out your items) (a) a kit that leaves you out wins (new `party` option), (b) then
  the higher worst-covered-boss P(floor), (c) only then more carriers. max-over-bosses is kept only when it doesn't make you a
  carrier. `greedyCarriers` deleted.
- **Headlines** (before 38g → 7278baad → fix): FA 21:40.7 → 22:07.3 → **22:07.3**; FA Solo 22:53.4 → 23:39.1 →
  **23:39.1**; ToA 14:20.0 → 14:22.6 → **14:36.3**; CoX 7:06.9 → 7:27.3 → **7:24.0**; ToB 7:23.4 → 7:37.3 → **7:28.8**; FA
  without Obligator / Ascension 24:40.3 → 25:17.4 → **25:11.1**. Why the carriers changed:
  - FA: 2 Elder maul (Bork / Ezekiel) + 3 Tonalztics (Ocellus P3's last quadrant) = 5 of 6, unchanged.
  - ToA: max over bosses 3 Ayak (Obelisk, > the 1 mage: covers nothing) + 2 maul + 2 Tonalztics + 2 BGS = 9 > 5 bars:
    2 maul + 2 Tonalztics cover every boss, + 1 BGS raises the worst boss's P(floor) (rule b): 2 + 1 BGS + 2, no Ayak (was
    2 maul + 1 Tonalztics + 1 Ayak); Wardens 340.2 → 353.0 s.
  - CoX: 2 maul + 3 Tonalztics, the Ayak carrier no longer reserved; your bar is free again: Dragon claws + Zaryte crossbow
    (7278baad: none, your share Tonalztics).
  - ToB: 3 Tonalztics, no Ayak; Dragon claws again (7278baad: your share Tonalztics).
  - FA without Obligator / Ascension: 2 maul + 4 Tonalztics = the party (no 5-carrier kit covers every boss), so you carry
    (your share Tonalztics, no items; route via Bork + Smorks, kit + Tumeken's shadow, 0 free).
- Pins: Phase38g (Tekton / B1 / B2 / kit tests), Phase29 (Ayak with mages), Phase36 (party 6 now carries by headcount),
  `PHASE37_MEMO` re-measured (r27 unchanged), phase37/*.json + headlines.json re-pinned.
- Run: fast suite 1609 passed (29 s); slow suites (CrossRaid Phase2 Phase3) green after the two pin updates; verifyAll 38g
  29 30 31 32 33 34 35b OK (30 alone: its icon checks time out under parallel load); tsc, lint clean.
- 38h scope (still seconds-based): the Solo bring-subset choice (`deltaSeconds`) and items vs one fewer carrier.

## Phase 38g — drains as facts: order to the floor, carriers by headcount (2026-10-28)

Numbers phase (ROADMAP 38g; docs/BEST_SETUP.md *Drains as facts (phase 38g)*). No drain choice rests on seconds any more.

- **Drain facts** (drainLine.ts `drainFacts`, `DrainLine.facts`, computed on first read): per boss / phase the drain
  weapons that can hit, ordered by the Defence one spec removes on average (teamSpecs.ts `drainOrder`), with hit
  chances; the specs to the floor at 95% (`neededSpecs`, was "if every spec lands"; ≤ `MAX_FLOOR_SPECS` 8); Team: the
  fewest carriers at 95% (`recommendCarriers`). Shown under the drain box (Search), in each Summary cell, and per drain
  event in the Plan briefing (`DrainFactsLine`), the same text everywhere; "(needs 4 specs, you have ~2)" when the
  drain state's own specs are fewer.
- **Time model** (encounterBudget.ts `eventWantedCounts`): one fixed drain set per event (Team: the fewest of the kit's
  carriers at 95%, 2 specs each, all carriers when no team reaches the floor; Solo: your specs to the floor at 95%), cut
  to what the bars pay (`simulateBudget`, drains only); the DP only places damage specs and the dose. Removed:
  `countVectors`, `capOptions`, `MAX_EVENT_OPTIONS`, event-option pruning, the top-up. `CLOCK_ROUNDS` kept.
- **Kit carriers** (planner.ts `headcountOf` → specChoice.ts `kitCarriers`; was `greedyCarriers` on the route time):
  per weapon the most any boss needs; over the party: the fewest within it covering every boss. No carrier steps.
- **Headlines** (`pinHeadlines --full`, every one slower — the energy now goes to each event's 95% drain whatever it
  saves): FA 21:40.7 → **22:07.3** (carriers 1 maul + 4 Tonalztics → 2 + 3; Ocellus 690.8 → 715.3: P2's drain takes
  the maul bars, P3 gets 2 Tonalztics specs); ToA 14:20.0 → **14:22.6** (1 maul + 1 Ayak → 2 maul + 1 Tonalztics + 1
  Ayak); CoX 7:06.9 → **7:27.3** (3 maul + 2 Tonalztics → 2 + 3 + 1 Ayak = the party, so Zaryte crossbow + Burning
  claws dropped, your share Tonalztics; kit Twisted bow + Scythe #2 + Inquisitor's helm instead of Inquisitor's +
  Scythe; Olm 202.4 → 216.2: the right claw takes every carrier); ToB 7:23.4 → **7:37.3** (1 maul + 2 Tonalztics → 3
  Tonalztics + 1 Ayak, Dragon claws dropped, your share Tonalztics; Sotetseg maze 2 gets no specs); FA Solo 22:53.4 →
  **23:39.1** (your bar pays the drains first: Crimson kisten + Burning claws dropped, surge at AG / Ezekiel / Xarth);
  FA without Obligator / Ascension 24:40.3 → **25:17.4** (1 maul + 4 Tonalztics → 2 + 2 + 1 Ayak).
- **Tests**: Phase38g.test.ts (hand-computed Elder maul counts: FA Bork armour 8 best case 2 → 4 at 95%; ToA Kephri
  (63%) best case 1 → 4; ToB Sotetseg maul alone 5 (4 give 94.9%); CoX Tekton floor 0 unreachable; carriers per event;
  Solo can't-pay "needs 4 specs, you have ~2"; the three tabs render the same line for one boss per raid). Updated
  pins: Phase27 switch totals, Phase29 (95% count, headcount carriers), Phase33 / 34 / 35b drain lines, CrossRaid preset
  pins, Phase36 (option cap test removed), Phase37c Xarth probe, r27*.json, `PHASE37_MEMO` (re-measured).
- **Slow pins followed** (RUN_SLOW_TESTS): Phase29 (6-man carriers 2 maul + 3 Tonalztics, no steps; Solo {maul, Tonalztics}
  1415.95 → 1463.9; Solo planner = the faSolo headline; Ayak carriers with 2 mages), Phase30 (no carrier steps), Phase32
  (the user's plan 25:58.7 → 27:16.5), Phase34 / 35b (FA briefing strings).
- **Verify**: new scripts/verifyPhase38g.mjs (Plan / Search / Summary show the same Xarth line; Solo mark); strings /
  steps / the user's total updated in verifyPhase29, 30, 31, 32, 33, 34, 35b (34: the facts line may say "needs").
- Run: fast suite green (31 s; 176 s earlier while the machine was loaded, HEAD 264 s then); slow suites
  (CrossRaid Phase2 Phase3) green after the pin updates; verifyAll 38g 21 23 29 30 31 32 33 34 35b 36 OK; tsc, lint clean.
- **Left / unverified**: the rule spends drains on fixed-length / unreachable events (Ocellus P2, Olm's right claw)
  that a seconds-based plan skipped — a user call for 38h; "floor not reached in 8 specs" next to "5 bring Tonalztics"
  (10 specs) on the Smorks reads oddly; Eye of Ayak carriers come in with any mage (teamRoles' rule).

## Phase 38f — pin gear, not seconds; the fast suite fast again (2026-10-27)

Tooling only: no src/lib change; `node scripts/pinHeadlines.mjs --full --check` unchanged (240 s, no change).

- **Fast suite** (`yarn test`, 20 cores, coverage off): **683 s -> 42 s** (1619 -> 1596 tests run, 45 skipped). The long pole was
  Phase35 "team briefing per-boss minimum..." (635 s alone, 681 s in the suite); now the longest file is Phase37 (40 s).
- **Moved to the slow gate** (`RUN_SLOW_TESTS=1`; helper `src/tests/utils/slow.ts`: `slowTest`, `slowDescribe`, `rowsFor`,
  `withinPct`): Phase35 the ToA reduced plan (camp one ring, every route; a fast copy plans one route with ring switches
  and manual specs / carriers, 3 s, same rule: no add in the spec plan or briefing); Phase27 caches, ToA potions, camp-one /
  camp-Lightbearer / pinned-Lightbearer / switch-reproduces for ToA, CoX, ToB (FA stays fast); Phase28 the fragments /
  ownership / ring-policy cache misses (Zeal stays); Phase29 the three Team / Solo "planner decides" plans (36 / 13 / 9 s);
  Phase30 CoX pickaxe plan and carrier steps; Phase31 CoX heart case; Phase33 Solo chips = Bring; Phase37 the four
  parallel-helper plans; Phase37c the two CLI smokes and the brute-force smoke; CrossRaid the ToA and CoX reduced plans.
- **Fast coverage kept**: every rule has a unit case or one fast plan: adds (Phase35 first describes + the fast one-route plan),
  rings (FA camp-one / camp-Lightbearer / switch), carriers (Phase29 toy greedy, `teamRoles`, `assignMe`), Ayak thresholds
  (`ayakSpecsToThreshold`, `searchSpecSubsets` toys), chips = Bring (`withPlanSpecs` cases + Team plan), cache keys
  (Zeal fast, Planner.test cached rows). **Left without a fast plan**: the cache-key misses for elemental fragments, ownership
  and the ring policy (Phase28, slow only); the ToA / CoX / ToB per-raid ring plans (FA covers the rule); carrier steps
  re-timed on the returned kit (Phase30, slow only; Phase29 checks the steps against the briefing fast); CoX's Dragon pickaxe
  plan (CoX.test.ts keeps a reduced CoX plan with a pickaxe).
- **Pins**: gear exact (kit, loadout per boss, items, spec weapons, carriers, route), times within 1% per raid and 2% per
  encounter. `src/tests/utils/headlines.ts` `headlineGear` / `headlineTimeProblems`; the slow headline tests
  (`crossRaidHeadlines.ts`, Phase31) compare gear exactly and times to the fixture within tolerance, and no longer compare the
  plan to `phase37/*.json` (that exact gate is `pinHeadlines --full --check`; the fast reduced plans in Phase37 keep their
  bit-identical JSON). Loosened: CrossRaid per-encounter preset pins (0.5 s -> 2%), Phase27 switch totals (0.05 s -> 1%), Phase29
  / 32 / 34 / 35 / 35b slow totals (exact -> 1%), Phase34 briefing rows (seconds -> 2% of the fixture's encounters; kit
  marginals, alternatives and carrier steps without seconds), Phase37c CLI regex, verify scripts (`headlineClose` /
  `durationClose` in scripts/headlines.mjs, 1%; history clauses with old totals removed from messages), BEST_SETUP (a note
  that its totals are history; the timing table without totals).
- **Stale slow tests fixed** (they had not run since 38c): Phase29 / 32 / 34 / 35b followed the 38a-38e model (Solo 1388.56 s,
  Solo manual 1415.95 s, the user's plan 25:58.7, Team carriers 1 Elder maul + 4 Tonalztics, Bork + Smorks "Elder maul 2 specs
  + Tonalztics 1 hit -> Def 184", Ocellus three events, Bring + Crimson kisten).
- **Stale verify scripts fixed** (failing at HEAD since 38c-38e): 23 (ToA has six routes), 29 / 31 / 32 / 33 / 34 now read carriers, Bring, free slots and the magic-loadout flag from `headlines.json` (`headlineOf` in scripts/headlines.mjs) instead of literals; 33 / 34 briefing strings updated to the 38e output.
- **Also**: `docs/screenshots/*-review*.png` in .gitignore (files kept); the two modified phase7 screenshots restored.
- Verified: fast suite 42 s green; slow suites (CrossRaid, Phase2x / 3x) green once; `pinHeadlines --full --check` no change;
  verifyAll 21 23 26 29 30 31 32 33 34 35 35b 37; tsc, lint clean.

## Phase 38e fix — carrier swaps dropped (2026-10-27)

- **Review (2026-10-27): pass.** retime gap 0 on all six; kit brute force gap 0 (FA small pool; FA without Obligator / Ascension with its own probe, plus a joint kit x item-set search whose best, +1 slot for 0.92 s, fails the 1 s/slot rule). Two low findings: the beam's dedupe key ignores free slots (search incompleteness, no instance found; left, 38g / 38h replace the model); the two slow tests accepted an overfull plan, now assert overfull false and cells <= slots (Phase38e 9/9 with RUN_SLOW_TESTS).
- **User decision**: the next phase replaces the tick-level spec timing by a per-boss value-per-energy ranking, so
  `swapCarriers` (specChoice.ts), its planner block and its two tests are removed. Kept: the item beam, item swaps, the
  0-slot pin.
- **Headlines** (`pinHeadlines --full`): ToB 7:23.2 → **7:23.4** (back to 1 Elder maul + 2 Tonalztics; phase37/tob.json
  identical to b37192b0 again); FA without Obligator / Ascension **24:40.3** stays (the beam's kit and items); FA
  21:40.7, FA Solo 22:53.4, ToA 14:20.0, CoX 7:06.9 unchanged. Net 38e vs b37192b0: only FA without Obligator moved.
- **User's party-8 plan**: **25:07.9** (the beam alone, same as b37192b0: ZCB + Surge + Crimson kisten, carriers 2 DWH +
  1 BGS + 3 Tonalztics + 1 Eye of Ayak, the Ayak saving 0 s; a 4th Tonalztics would give 25:07.0, left for the new spec
  model). The slow test now asserts ≤ 25:07.95 with ZCB brought (no ≤ 25:07.4).
- `PHASE37_MEMO` re-measured (all within 2% of the 38e pins: fa 11507 / 10789 / 444757 / 19359, toa 153849 / 21674 /
  2843862 / 138797, tob 82173 / 24732 / 3799983 / 62574, cox 164099 / 43579 / 4139701 / 149355, faNotOwned 74332 /
  20132 / 1863420 / 72932).
- **Fast suite time** (675 s here, 1619 passed): `Phase35.test.ts` alone is the long pole, 673 s in the suite; its one
  reduced ToA plan (camp one ring: every ring screened + guarded full runs) takes **418 s alone at b37192b0 → 635 s
  alone now** (+52%, the item beam), so it was already slow before 38e. Next: Phase27 116, Phase29 79, Phase28 68,
  Phase37 64, Phase37c 57, CrossRaid 50, Phase30 46, Phase33 44, Phase31 39 s; Phase27 / 29 alone: 79 / 40 s at
  b37192b0 vs 79 / 45 s now (unchanged). Not fixed in this round.
- Fast suite green; slow CrossRaidHeadlines* + Phase38e green; tsc, lint clean.

## Phase 38e — item beam, swaps, 0-slot pin, carrier swaps (2026-10-27)

**Numbers moved** (`node scripts/pinHeadlines.mjs --full`): ToB 7:23.4 → **7:23.2**, FA without Obligator / Ascension
24:40.8 → **24:40.3**; FA 21:40.7, FA Solo 22:53.4, ToA 14:20.0, CoX 7:06.9 unchanged (ToA / CoX fixtures: notes only,
plus CoX's rejected rings' full runs 0.1-0.2 s faster). `retime`: all six gap 0. Docs: BEST_SETUP *Item beam, swaps,
0-slot pin (phase 38e)*.

- **Item steps** (planner.ts after the carriers; specChoice.ts `itemBeam`, `itemStepNet`): each candidate that passes
  `pickSpecItem`'s 1 s/slot rule with a free slot is evaluated for real (no free slot: the kit re-optimised with it
  carried, every such candidate, not only the first-ranked one), ranked by `itemStepNet` (saved − 1 s × free slots used
  up; a re-optimised kit's free slots are credited); a beam: the best 2 per state for 3 steps, then greedy, same item
  set keeps the faster, the fastest state wins. Then swaps (one item for one not brought, same kit, ≥ 0.05 s and 1 s per
  added slot). Rejection notes come from the chosen path (ToA's in candidate order now).
- **0-slot pin**: an item accepted at 0 slots is pinned in the carried list (`pinItem`); `kitSlotUsage` also counts the
  spec items the grid lists (the 29-cells-in-28 / `overfull` false case).
- **Carrier swaps** (specChoice.ts `swapCarriers`; Team with your damage specs / doses, auto carriers): one carrier for
  another weapon or dropped, while one saves ≥ 0.05 s; can swap out a weapon no longer offered (Eye of Ayak without a
  mage). Added beyond the ROADMAP row because the row's target (the user's plan ≤ 25:07.4) needs it at HEAD: the 38c
  fix had already moved that plan to ZCB + Surge + kisten (25:07.9), and the gap left was the carriers (2 DWH + 1 BGS +
  3 Tonalztics + 1 Eye of Ayak, the Ayak saving 0 s on the final kit).
- **User's party-8 FA plan** (Plan tab inputs, party 8, no Obligator, ring switches, one route, P2 off): 25:18.1 (the
  report) / 25:07.9 (HEAD) → **25:07.0**; kit (Ascension diamond, ZCB + Ruby #2, Inquisitor's + Scythe, Twisted bow)
  and items (ZCB, Surge, Crimson kisten) unchanged; carriers → 2 DWH + 1 BGS + 4 Tonalztics. The planInputsFor variant
  (party 8, same overrides): 25:41.8 → 25:41.5 (Crimson kisten first, ZCB carried anyway and pinned, Surge).
- **Kit changes per headline**: ToB carriers 1 Elder maul + 2 Tonalztics → **1 DWH + 2 Tonalztics** (kit, items
  unchanged; Sotetseg 74.48 → 73.48, Xarpus 55.71 → 56.34, Bloat +0.06, Nylocas +0.04). FA without Obligator: kit
  Twisted bow switch on Tumeken's shadow + Tumeken's shadow + Inquisitor's + Scythe (0 free) → **Twisted bow (Masori) +
  Inquisitor's + Scythe (4 free)**; items Zaryte crossbow → **Crimson kisten (13.90 s, kit re-optimised: the shadow
  loadouts go), Zaryte crossbow (3.42), Surge (5.45, free slot), Burning claws (2.87, free slot)**; route via Ezekiel
  (was Bork + Smorks); Guardian 191.91 → 186.44, Moia 65.97 → 65.32, Xarth 209.70 → 206.83, Ocellus 792.97 → 784.01,
  Ezekiel 237.73 vs Bork 220.20. Others: no kit / item / carrier change.
- **Speed** (browser, `yarn dev`, defaults, Playwright, two runs each, HEAD → 38e): FA 27.0 → 35.1 s (+30%), ToA 42.4 →
  50.9 s (+20%), ToB 24.5 → 36.7 s (+50%), CoX 51.4 → 74.0 s (+44%). Above the old 25% cap, under the 2× flag (the user
  relaxed the cap on 2026-10-27; the beam was kept at width 2 / depth 3). Today's HEAD is already slower than phase 37's
  FA 19 / ToA 17 / ToB 21 / CoX 38 s (phases 38a-c).
- Tests: new Phase38e.test.ts (itemStepNet, itemBeam toys by hand incl. the user's step-0 numbers, swapCarriers by hand,
  29 items → overfull; slow: the user's plan ≤ 25:07.4 with ZCB and cells ≤ slots, the 0-slot path's cells).
- Re-pinned: `PHASE37_MEMO` fa / toa / tob / cox / faNotOwned (the beam's extra re-optimisations: CoX encounter runs
  73944 → 164139, ToA 69292 → 153876, ToB 25001 → 84006, FA without 26777 → 74380), the headline CPU budgets
  (`PHASE37_FIXTURE`: FA 200, ToA 450, ToB 220, CoX 800, FA without 400 s; the slow suite measured FA 130.8 s),
  verifyPhase37 CoX limit 60 → 120 s. Fast suite green (1621 passed); slow CrossRaidHeadlines* / Phase27 / Phase31 /
  Phase36 / Phase37 / Phase38e green; retime probe all six gap 0; verifyAll 36 37 OK; tsc, lint clean.

## Phase 38c fix — dedupe rule in the brute force, P2's wall time (2026-10-27)

- **Review finding 1** (`bruteForceKits.mjs toa --pool tiny` on Kephri + Ba-Ba: Twisted bow + Shadow + Scythe #3
  916.08 s vs the planner's Shadow + Scythe #3 919.16 s): not a keying bug. Instrumented, the optimiser's own estimate of
  the bow kit was 915.62 s, and its `prune` (the dedupe rule) drops it: the bow adds 7 slots (19 → 26) and must save
  `switchSavingRequired(7)` = 7 s; it saves 3.08 s. The probe timed every kit without the rule, so the route that made
  the bow marginal exposed it (K+Z: no such kit). `bruteForceKits` (src/tests/utils/probes.ts) now keeps only kits where
  every loadout saves at least that (`bestAny` / `pruned` report the rest): ToA tiny K+B gap **0** (92 kits, the bow
  kit pruned). New slow Phase38c test (RUN_SLOW_TESTS): that case, gap 0, `pruned` > 0.
- **Finding 2**: `PhaseTime.fixedWall` (Ocellus P2) and `rowWallSeconds` (encounterBudget.ts): P2 lasts 120 s on the
  spec budget's clock (was 120 ÷ party: 20 s at party 6). The drainOutcome probe uses the same clock (it reported FA
  Ocellus "OVERSPENT" without it). The raid clock still divides the encounter's seconds by the party.
- **Headlines** (`pinHeadlines --full`): FA 21:43.6 → **21:40.7** (Ocellus 693.52 → 690.80, 7 regen ticks before the
  end instead of 3; carriers re-chosen 1 Elder maul + 4 Tonalztics, was 2 + 3; Burning claws added (on P1); Ocellus
  events P1 4 Tonalztics, P2 2 maul + 4 Tonalztics, P3 4 Tonalztics; Bork 190.71 → 190.53); FA without Obligator /
  Ascension 24:52.2 → **24:40.8** (Ocellus 804.39 → 792.97; an Elder maul carrier instead of the DWH); FA Solo
  (fixture: 2 lines), ToA 14:20.0, CoX, ToB unchanged. `retime`: all six gap 0.
- Docs: D35 (the P2 specs live on the Blade credit; with carry-over 0 they move to P1 / P3; ask the user for the Blade
  damage), BEST_SETUP (P2 default 120 s in the Ocellus model row; the fix round; BGS paragraph: P3 0.782, P2 0.829 → 72).
- Re-pinned: Phase27 FA 1544.4 → 1534.7 (r27fa.json re-captured), CrossRaid fast pin Ocellus 832 → 823.8, Phase33 /
  34 Ocellus lines, Phase37c Xarth (2 maul + 8 Tonalztics; balances 12.5 / 50 / 12.5), `PHASE37_MEMO` r27fa / fa /
  faNotOwned, verifyPhase35b (Bork / Ocellus strings). Fast suite green; Phase38c slow test; verifyAll 35b OK; tsc,
  lint clean.

## Phase 38c — Ocellus events, ToA path pair, clock default, displays (2026-10-27)

**Numbers moved** (`node scripts/pinHeadlines.mjs --full`, 9 changes): FA 21:05.3 → **21:43.6**, FA Solo 21:56.2 →
**22:53.4**, FA without Obligator / Ascension 24:11.9 → **24:52.2**, ToA 14:30.1 → **14:20.0**; CoX 7:06.9, ToB 7:23.4
unchanged. Docs: BEST_SETUP *Ocellus events, ToA path pair, clock default, displays (phase 38c)*, DATA_SOURCES *Phase
38c*, UNVERIFIED D5 (P2 120 s), D30 (non-fight time), D31 (the pair), new D35 (Ocellus events / the Blade).

- **Ocellus** (raidTime.ts `evalEncounterPass`): the Defence resets P1 → P2 and P2 → P3 (the user, in-game): the Blade
  row `drainReset: 'P1'`, P3's first row (quadrants 1-3) `drainReset: 'P2'`: three drain events, P3's specs on Q1-3
  (were on the last quadrant). The P2 query carries its rowKey. "Ocellus P2 length" default 0 → **120 s** (the user:
  "~2 min, little damage lands"; unverified). Lines: "Start of fight: … · After P1 (Defence restored), again: … · After
  P2 (Defence restored), again: …". Gap (D35): in FA's "your DPS alone" seconds P2's wall time is 120 ÷ party.
- **ToA path pair** (toa/time.ts `TOA_ROUTES`, `toaRoomOf`; raidTime.ts `RaidTimeModel.routes`, `modelRoutes`): every
  path room has a plain (after the supplies) and a `-before-supplies` encounter id (copies now also for Akkha, his
  Shadows, Ba-Ba); six routes, one per pair done first; `compareRoutes` / the planner take the cheapest (the Plan's
  Route select = `firstPaths`: "Compare all" or one pair; no separate setting). Adrenaline 0 / 1 / 2 per id.
- **Raid clock** (raidTime.ts `raidClock(walls, raidSeconds, nonFightSeconds)`, `surgeClockSpan`; base.ts
  `nonFightMinutes`; settings.ts / PlanView "Non-fight time (min)", `plan.nonFightMinutes`, the old `raidMinutes` key
  not read): the clock = fight wall + non-fight time (FA 21.5 = 25 min − 210.9 s, ToA 15.5, CoX 12.9, ToB 12.6), so a
  solo raid is not squeezed (D30). An explicit `raidMinutes` keeps the 38a clock. Moves no headline (every pinned kit
  re-timed with the 38a clock: the same totals).
- **Displays**: per-boss 95% table (planner.ts `briefing`, SpecPlanPanel) and "Load worn / Load all"
  (`planLoadoutToPlayer(…, target)`) use `assumptionsForTarget`; ToA `hpNote` (Search / Summary footer): they use the
  salts, the Plan fights the first two paths with the normal potions.
- **Moved totals, explained:** FA: Ocellus 655.17 → 693.52 (P2 +120 s; the Blade takes 15.30 DPS × 120 = 1836, 918
  off P3: Q1-3 252.7 s, last quadrant 125.2 s; events P1 1 Tonalztics, P2 4 maul + 1 Tonalztics, P3 4 Tonalztics);
  kit, ring, carriers unchanged. FA Solo: Ocellus 677.04 → 734.19 (P2, 724 carried; P3 2 Tonalztics + Crimson kisten,
  now brought). FA not owned: Ocellus 767.67 → 804.39, Bork 216.68 → 220.26, carriers re-chosen (1 DWH + 4 Tonalztics,
  was 2 maul + 2 Tonalztics + 1 Ayak). ToA: pair **Kephri + Ba-Ba** (route
  `toa-kephri-before-supplies>toa-baba-before-supplies>toa-zebak>toa-akkha>toa-wardens`): with the kit, before − after
  the supplies = Kephri 11.02, Ba-Ba 12.63, Akkha 20.31, Zebak 22.70 s, so the two cheapest rooms go first; the six
  routes K+Z 870.10, K+A 867.70, K+B 860.03, Z+A 879.38, Z+B 871.71, A+B 869.31 (Zebak after 141.74 → 119.04, Ba-Ba
  before 90.20 → 102.83); same six loadouts (listed in another order).
- **BGS vs Elder maul on Ocellus** (hand check, FA headline assumptions, drainModel): maul −35% of current Def per
  landed spec (rounded down), BGS −damage dealt. Def 250: P3 maul 0.782 × 87 = 68 Def per 50% spec vs BGS
  E[damage] 26.5 (P2 0.829 → 72 vs 25.2); P1 Def 215: 0.752 × 75 = 56 vs 28.2. The BGS only catches up below Def ≈ 80 (35% of Def < its damage),
  i.e. after the maul / Tonalztics; so the carriers are maul + Tonalztics and no plan brings a BGS.
- Re-pinned with explanations: RaidTime (P2 off in the hand-computed Ocellus test; required targets), RaidConfig / ToA
  / CrossRaid (6 ToA routes; fast pins FA Ocellus 776.5 → 832, ToA Zebak + Akkha first for the preset kit: Kephri after
  148.6, Akkha before 180.4), Phase27 (FA 1493.8 → 1544.4, ToA 925.0 → 905.5; r27fa / r27toa.json re-captured),
  Phase29 (a Team line brings ≤ 2 specs per carrier: three Ocellus events split the energy), Phase33 / 34 / 35b (the
  Ocellus lines), Phase37b / 38a (the Plan input), Phase38b (ToA ids), Phase37c (retime CLI 14:20.0),
  `PHASE37_MEMO` r27fa / r27toa / fa / toa / faSolo / faNotOwned re-recorded (ToA encounter runs +43%: 9 encounters).
- Tests: new `Phase38c.test.ts` (11, hand-computed: Ocellus rows and events at DPS 1 (P2 120 dealt, 3 events, the
  reset moves to the last quadrant when it is all of P3), the Team spec plan's events / firstRowKey; six ToA routes,
  adrenaline per id; the cheapest pair at half DPS before the supplies = the two shortest rooms; the clock for party 6
  vs 1 (starts 322.5 / 745 / 1490 vs 322.5 / 1245 / 2490), the defaults, the Plan input; Load into calculator +19 vs
  +26 strength; the 95% table's drain model). Fast suite 1612 passed / 24 skipped; `RUN_SLOW_TESTS=1`
  CrossRaidHeadlines + CrossRaidHeadlinesCox 5 / 5; `retime`: all six gap 0, fastest = pinned route. Verify:
  `verifyAll 35b 38a` OK (35b's Ocellus line and Kephri id updated; 38a's input → Non-fight time, screenshot
  phase38a-raid-length.png re-taken). tsc, lint clean.

## Phase 38b fix — adrenaline window guard (2026-10-27)

- Review finding: a row starting inside Liquid adrenaline's window but running past it priced every damage spec at
  half. Now (specBudget.ts `damageSpecCost`, `ticksBefore`; the DP and `simulateBudget` alike) the specs the energy
  before the close pays for (after the row's drain spends + the dose + regen ticks strictly before `halfCostUntil`)
  cost half, min(n, floor(left ÷ half)) per weapon, the rest full. Drain spends keep the row's start.
- Phase38b: the forced-dose Zebak case is 3 ZCB, not 4 (100 + 4 ticks before 150 s = 140% → 3 × 37.5%; the 4th would
  cost 75%); new test of a 0-200 s row with the window to 100 s: 130% before the close → 5 half-price specs (125%), a
  6th costs 175% in all > 160% → 190 s. Phase36's brute-force simulator prices the same way.
- `pinHeadlines --full --check`: every total, kit, ring and carrier unchanged; phase37/toa.json moved only in
  side figures (the other rings' totals, e.g. Venator 873.54 → 874.02, Lightbearer / Bellator order; a maul
  carrier's "saved" 51.26 → 51.28; the Surge potion note 3.2 → 2.4 s), re-pinned. `retime`: all six gap 0. Phase38b /
  Phase36 green; tsc, lint clean.

## Phase 38b — Death Charge, Liquid adrenaline, damage specs on adds (2026-10-25)

**Numbers moved** (`node scripts/pinHeadlines.mjs --full`, 9 changes): ToA 14:38.2 → **14:30.1**, CoX 7:08.7 →
**7:06.9**; FA 21:05.3, FA Solo 21:56.2, FA without Obligator / Ascension 24:11.9, ToB 7:23.4 unchanged (their phase37
fixtures moved only in the new `deathCharge` plan field, end energies, the comparison hash and FA Solo's rejected
alternatives' deltas). Docs: BEST_SETUP *Death Charge, Liquid adrenaline, damage specs on adds (phase 38b)*,
DATA_SOURCES *Phase 38b* (wiki Death Charge, Liquid adrenaline, Helpful Spirit), UNVERIFIED D32-D34 (D26 / D28 / D31
point to them).

- **Death Charge** (specBudget.ts `deathChargeSchedule`, `BudgetRow.restore`; encounterBudget.ts `rowKills`,
  `withDeathCharge`): wiki "restore 15% ... after they dealt the killing blow to any monster within one minute after
  casting", "once every 60 seconds", upgraded "two targets per cast" (2 per cast: the user). Kills = each NPC's last row
  (Akkha's Shadows: `kills: 4`), minus the wiki exceptions (`noDeathCharge`: Glowing crystal, Olm's hands, the Wardens'
  obelisk); greedy casts, ready at each encounter's start; every bar +15% ÷ party size per covered kill at the row's
  end, after the cap. Arceuus only: new per-raid Plan input "Spellbook" (Advanced (plan), default Arceuus, saved as
  `plan.spellbook`; `RaidBase.spellbook`, `spellbookOf`, `SPELLBOOK_NOTES`: the FA Xarth / ToB Maiden freezer on
  Ancients is noted, not modelled).
- **Liquid adrenaline** (toa/supplies.ts `LIQUID_ADRENALINE_*`, `suppliesAdrenaline`; toa/time.ts
  `TOA_ADRENALINE_DOSES`, `RaidTimeModel.adrenalineDoses`; `AllocationProblem.halfCostUntil`, `costFactorAt`): wiki
  "reduce energy costs for special attacks by half for 150 seconds", no rounding; the Power bundle (implied by the
  salts) gives 2 doses per drop: Akkha 1, Ba-Ba 1, Wardens 2 (300 s), none before the supplies. Spends on rows starting
  in the window cost half (drains and damage specs, every bar); the option caps use the halved cost.
- **Damage specs on adds**: types.ts splits the rule: `noDrains` (adds: "adds: not worth a drain spec") vs the new
  `noDamageSpecs` (none set); `damageLimited` no longer excludes adds. UI: "no drains (adds)" (Plan rows, Summary).
- **Moved totals, explained:** ToA: with adrenaline the Zaryte crossbow costs 37.5%, so it replaces Voidwaker (your
  bar: Akkha 3 ZCB incl. 1 on the Shadows, Ba-Ba 3, Wardens 5; Kephri / Zebak 2 / 1 at 75%), the carriers spec more
  (Elidinis' Warden now 2 maul + 2 Tonalztics): Akkha 143.26 → 141.74, Ba-Ba 92.47 → 90.20, Wardens 344.47 → 340.10,
  Kephri 156.21 → 156.32, Zebak 141.81 → 141.74 = −8.1 s; kit, ring, carriers unchanged. CoX: damage specs on adds
  (2 Burning claws on Vasa's crystals, ZCB + claws on the Mystics, ZCB on the Shamans / small Muttadile / portal,
  claws on the Ice demon, Tekton, Olm's left claw) and Death Charge (2.5% per mid-fight kill) → Zaryte crossbow +
  Burning claws replace Dragon claws; the planner re-chose the kit (8 loadouts: Inquisitor's + Obligator, Twisted bow,
  Scorching bow ... ) and carriers (3 Elder maul + 2 Tonalztics, was + 1 BGS + 1 Tonalztics): Vespula −1.5, Mystics
  −0.9, Shamans −0.9, Muttadiles −0.5, Tekton +0.4, Olm +1.3, ... = −1.8 s. FA / ToB: their mid-fight kills (Bork
  before the Smorks) give 2.5-3.75% that buys no spec.
- Re-pinned with explanations: CrossRaid fast pin ToA Ba-Ba 103.1 → 97.3 (Wardens 349.8); Phase27 ToA switch 930.9 →
  925.0 (r27toa.json re-captured; r27fa / cox / tob changed only in the comparison hash); Phase35 (the adds string),
  Phase35b (Elidinis' Warden now specced), Phase36 (adds: damage-limited now), Phase37b (spellbook in the saved
  plan), Phase37c (retime ToA; drain outcome balances + Death Charge: Xarth 25 / 37.5 / 12.5, Solo AG 25).
- Probes: `drainOutcome` counts Death Charge (`restored`, a new column) and halves spends inside the adrenaline window
  (it reported "OVERSPENT" on ToA rooms 3-5 before); `retime`: all six gap 0.
- **Speed (a cost to flag):** the ToA / CoX headline plans take +31% / +68% CPU (slow suite 235.5 / 527.8 s; adrenaline
  doubles the spec options per ToA event, damage specs on the adds' rows, CoX's bigger kit with 2 damage spec weapons);
  `PHASE37_MEMO` toa / cox re-recorded, the catastrophe budgets raised ToA 180 → 300, CoX 315 → 650 s.
- Tests: new `Phase38b.test.ts` (8, hand-computed: the cast schedule; kills per row and the wiki exceptions; a toy
  encounter with 2 kills → 60% at row c, 2 + 1 maul specs, 80 s vs 90 s, party 2 → 45%, 90 s; Spellbook default /
  share / validation; Bork & Smorks 2 kills covered at party 1; adrenaline doses and the window; Zebak with a forced
  150 s dose: 150% buys 4 ZCB at 37.5% vs 2 at 75%, seconds = s0 × (1 − m × net ÷ damage); Burning claws ×2 on Vasa's
  crystals with their drain event empty, ×2 on the Ice demon). Fast suite: 1624 tests, the 26 failures of the first
  run were the re-pins above (each file re-run green: Phase27, 35, 35b, 36, 37, 37b, 37c, 38a, 38b, CrossRaid);
  `RUN_SLOW_TESTS=1` CrossRaidHeadlines + CrossRaidHeadlinesCox 5 / 5. Verify: `verifyAll 36 38a 35` 3 / 3 OK
  (verifyPhase35's strings updated); new `verifyPhase38b.mjs` OK (defaults, tooltips, saved across a reload;
  screenshot phase38b-spellbook.png). tsc, lint clean.

## Phase 38a — Raid wall clock + ToA supplies by room (2026-10-25)

**Numbers moved** (`node scripts/pinHeadlines.mjs --full`, 7 changes): FA 21:07.7 → **21:05.3**, FA Solo 21:59.0 →
**21:56.2**, ToA 14:07.8 → **14:38.2**; CoX 7:08.7, ToB 7:23.4, FA without Obligator / Ascension 24:11.9 unchanged.
Docs: BEST_SETUP *Raid wall clock + ToA supplies by room (phase 38a)*, DATA_SOURCES *Phase 38a*, UNVERIFIED D30 (the
clock) / D31 (ToA supplies), D29 points to D30.

- **Raid clock** (raidTime.ts `raidClock`, `surgeClockStarts`, `surgeClockSpan`): a per-raid typical raid length
  (`RaidBase.typicalRaidMinutes`: FA 25 min from the user's raid stats, ToA 30, CoX 20, ToB 20 above the wiki's speed
  tasks; `RAID_LENGTH_SOURCES`), `BestSetupAssumptions.raidMinutes` → `RaidTimeAssumptions.raidSeconds`. The non-fight
  time max(0, L − Σ fight walls) goes before each encounter in proportion to its fight time. Surge doses
  (`routeSurgeDoses`) are placed on it (ToB: fight time only, `surgePausesBetweenEncounters`); the planner tries a second
  potion when the clock allows > 4 doses; with `CARRY_SPEC_ENERGY` (off) the bars regenerate in the gaps (+10% per tick,
  cap 100%). Plan tab → Advanced (plan) → "Typical raid length (min)" (0-120, saved as `plan.raidMinutes`).
- **ToA supplies by room** (new src/lib/raids/toa/supplies.ts): Kephri and Zebak (rooms 1-2 of the fixed route) target
  `-before-supplies` copies (`beforeSupplies`, hidden from Search / Summary); `assumptionsForTarget` swaps Smelling salts
  for Super combat / Ranging potion / Saturated heart in the kit evaluator (`KitLoadout.toPlayer`'s new 3rd argument),
  the planner's DPS matrix and damage-spec values, the drain model (`buildTargetMonster`, `specCountsDrainKey`) and the
  gear search. Wiki: supplies "once after completing two paths, and once again ... before" the Wardens.
- **Moved totals, explained:** FA: the clock starts AG at ≈ 179 s, Xarth ≈ 694 s, Ocellus ≈ 1391 s, so 3 doses (AG,
  Xarth, Ocellus; was Ocellus only); with the extra energy the item greedy takes Crimson kisten (4.47 s, on AG grounded)
  instead of Burning claws (was on the Smorks): AG 175.78 → 173.49 (dose + kisten), Xarth 181.62 → 180.61 (dose; ZCB +
  kisten from 100 + 10 + 25), Bork 189.79 → 190.71 (no claws spec), Ocellus 655.17 (dose as before) = −2.38 s; kit,
  ring, route, carriers unchanged. FA Solo: a third dose on Ocellus (679.81 → 677.04). ToA: Kephri 146.63 → 156.21,
  Zebak 121.02 → 141.81 without salts (+26 → +19 / +13 levels), same six loadouts (listed in another order), no surge
  potion. Reduced plans: r27toa 881.2 → 930.9 (Phase27 pin, r27toa.json re-captured); CrossRaid fast pins ToA Kephri
  157 → 185.1, Zebak 120.8 → 137.8; Phase37c drain outcome FA Xarth: your bar 0 → 10 (dose, kisten); PHASE37_MEMO toa
  re-recorded (encounter runs +21%).
- Test re-timers pass the 3rd `toPlayer` argument (crossRaidHeadlines `recomputed`, probes.ts, Phase36's kit brute
  force): one that ignores it times ToA rooms 1-2 with the salts (the retime probe caught it: gap −30.2 s).
- Tests: new `Phase38a.test.ts` (8: defaults; the clock by hand (100/100/200 s in 1200 s → starts 200/500/1000); dose
  placement on a 25-min FA party 6 with hand gains → AG, Moia, Ocellus vs Ocellus on the fight clock / ToB pause; regen
  in the gaps with carry; the Plan input validation; ToA rooms 1-2 copies; boosts by hand +26 / +19 / +13 / +13; Zebak
  seconds = hp ÷ (normal DPS × 6)); ToA / Phase21 / Phase37b / Phase37c / CrossRaid / Phase27 expectations updated.
  `yarn test` (fast) green after the updates; `RUN_SLOW_TESTS=1` CrossRaidHeadlines + CrossRaidHeadlinesCox 5 / 5;
  `node scripts/probes/retime.mjs`: all six gap 0. Verify: new `verifyPhase38a.mjs` OK (defaults per raid, tooltip
  sources, saved across a reload, Reset; screenshot phase38a-raid-length.png); verifyPhase36 OK; verifyPhase37 fails
  only its 60 s CoX time limit (112 s alone; the machine is slow today: `pinHeadlines cox --check` 128 s here vs 129 s
  at HEAD, so not this phase). tsc, lint clean.

## Phase 37c — Reusable review probes (2026-10-25)

**No result changed** (no src/lib file touched; `node scripts/pinHeadlines.mjs --full --check` → no change, 615 s
alongside the fast suite). Docs:
BUILDER (*Running things*, the probes rule, reviewer checklist step 2).

- `scripts/probes/` (CLIs; header = usage; exit 1 on a failed check, 2 on bad arguments) over
  `src/tests/utils/probes.ts` (no Jest import), bundled with esbuild like pinHeadlines (`scripts/probes/bundle.mjs`,
  `__dirname` defined as src/tests/utils so the fixtures resolve; rebuilt each run, so it times the working tree):
  - `retime.mjs [names] [--quiet]`: each headline kit from phase37/<name>.json rebuilt as kit loadouts with the plan's
    ring, carriers / Solo subset, damage specs and surge potions (`finalAssumptions`, generalises crossRaidHeadlines'
    `recomputed` to faSolo / faNotOwned), `compareRoutes` over the raid's routes vs headlines.json. All six: gap 0.0
    (bit-equal totals), the pinned route fastest, every encounter = its 0.01 s pin; ~6 s.
  - `drainOutcome.mjs <encounter> [--plan]`: one encounter of a re-timed headline: events (spec counts), per phase
    the drain model (Def, floor, magic def, hit chance, energy) and outcome (P(floor), E[def], ranked def, Ayak), your
    damage specs, per pool start / end energy, regen ticks, spent, start + regen (+ surge) − spent. Fails if the
    re-time's spec plan differs from the fixture's or a pool overspends; ~1 s. Spot checks by hand: FA Xarth (4 maul +
    6 Tonalztics, Def 170 → 102, pools 20 / 30 / 0), FA Solo Archive Guardian (100 + 6 ticks + 25 dose − 175 = 10 = end).
  - `bruteForceKits.mjs <raid> [--pool small|tiny] [--route] [--max-kit] [--ring] [--candidates]`: a reduced Team plan
    (Phase36 tuning) with `PlanHooks.onKitSpace`, every kit (≤ max(pool size, the planner's kit size)) timed exactly vs
    the planner's. FA small: 336 kits, gap 0.000000 (= Phase36's slow test), 90 s; FA tiny 90 kits 30 s; ToB tiny gap
    0, 65 s.
- Tests: new `Phase37c.test.ts` (11, fast suite, ~45 s: retime of all six + its exit condition, both CLIs run with exit
  codes, drain outcome Xarth / Solo AG with hand-computed pools, brute force FA tiny on one ring run (camp Lightbearer,
  first 3 candidates + the planner's)). `yarn test` 1608 (1584 pass / 24 skipped; 620 s, alongside the pin check);
  tsc, lint clean. No slow suite or
  verify script (tooling only; nothing they reach changed).

## Phase 37b — Remember my settings + workflow speed-ups (2026-10-25)

**No result changed** (the phase 37 full-plan fixtures and the new headline fixture reproduce exactly:
`node scripts/pinHeadlines.mjs --full --check` → no change). Docs: BEST_SETUP *Remember my settings (phase 37b)*,
*Re-pinning the headlines (phase 37b)*, Performance (review nits); new docs/BUILDER.md (linked from CLAUDE.md);
DEPLOY (CI line); README headline table; ROADMAP 37b done.

- **Remember my settings** (`src/lib/raids/settings.ts`, BestSetup.tsx, PlanView.tsx): every best-setup input per raid
  (Assumptions + Advanced incl. raid inputs, carriers + mode, floor, players at your DPS, energy priority, time model;
  Drains; spec mode; the Plan inputs: route, supplies, rune pouch, rings, mages, Items I always bring) and the raid tab
  in localStorage `mxeaez-dps:settings:v1` = `{ version: 1, raid, raids: { <id>: { assumptions, time, drain, specMode,
  plan } } }`, only values that differ from the defaults; restored on load with per-field validation (wrong type / out
  of range → that input's default; other version / corrupt JSON → all defaults); written through on every change; plan
  results never stored. "Reset" now resets every input of the raid (Drains and Plan included) and drops its entry;
  "Reset all saved settings" in the ? help removes the key (Items I don't own kept). Side effects: the Plan inputs
  survive Search ↔ Plan, each raid keeps its Drains / spec mode / time settings across raid tabs. The verify scripts'
  clean-slate reloads also clear the new key (17 reloads in 11 scripts), so they behave as before.
- **verifyAll** (`scripts/verifyAll.mjs`): verify scripts in parallel (`--jobs`, default 3), one OK / FAIL line each,
  logs in a temp folder, tracked screenshots restored (files modified before the run put back as they were). Full set,
  3 jobs: wall 1040 s vs 2984 s summed (2.9×); 15 / 25 OK — the 9 failures (verifyPhase13, 14, 16, 17, 18, 19, 20,
  24, 25) fail identically at HEAD 37 (checked by stashing this phase: stale checks from older defaults, listed in
  BUILDER), and verifyPhase37's 60 s CoX limit read 67 s under the parallel load (43 s alone: OK).
- **Headline fixture** `src/tests/fixtures/headlines.json` (fa, toa, cox, tob, faSolo, faNotOwned: total + seconds,
  route, ring, kit, free slots, carriers, Bring, items, your share, surge doses, encounter seconds), cases and summary in
  `src/tests/utils/headlines.ts`, regenerated by `scripts/pinHeadlines.mjs` (esbuild bundle, child processes; `--full`
  also writes phase37/*.json, `--check`, `--readme`). Read by CrossRaidHeadlines* (whole summary + totals), Phase31
  Solo, Phase34 / 35 / 35b (totals, free slots, carriers), 12 verify scripts (`scripts/headlines.mjs`) and the README
  table (generated; `Phase37b.test.ts` checks it and that the fixture = the phase 37 fixtures' summaries).
- **CI** (`.github/workflows/ci.yml`, coordinator add-on): push / PR to `main-mxeaez`: Node 22.23.4 (.nvmrc), yarn
  install --immutable (cached), lint, tsc, fast Jest suite (`--coverage=false --maxWorkers=2`; 166 s locally). Not run
  yet (needs a push).
- **Phase 37 review nits**: memo counters bound encounter and pass runs separately (`memoCountersWithin`); memo keys tag
  non-finite numbers (`memoKeyJson`); `encodeRingRuns` keeps -0; parallel plans' footer shows the job's searches and
  wall time (`parallelPlanStats`); the rings progress stops at "12 / 12" (`ringProgressDone`).
- Tests: new `Phase37b.test.ts` (17: settings round trip, version / corrupt → defaults, partial + invalid data, Reset,
  diffs only; nits (a)-(e); fixture vs phase 37 fixtures; README). `yarn test` 1597 (1573 pass / 24 skipped);
  `RUN_SLOW_TESTS=1` CrossRaidHeadlines, Phase27, 31, 34, 35, 35b, 37 181 / 181 (279 s); tsc, lint clean. Verify:
  new `verifyPhase37b.mjs` (set party 4, Solo, brews 5, route, Allow switches, ToA level 300; reload: kept; Reset;
  Reset all; screenshot phase37b-settings.png) OK; 21, 23, 26, 27, 29-37 OK.

## Phase 37 — Performance + final review, round 5 (2026-10-25)

**No result changed.** The plans of HEAD 7864dacc (phase 36 fixes) were captured before any change
(`src/tests/lib/raids/phase37/*.json`: FA, ToA, CoX, ToB headlines, FA Solo party 1, FA without Obligator / Ascension
crossbows, the four reduced Phase27 plans) and every one is reproduced field for field (kit, carriers, items, spec plans,
every route / encounter time, inventory, strings; only DPS-evaluation counts and timings differ): FA 21:07.7, ToA
14:07.8, CoX 7:08.7, ToB 7:23.4, FA Solo 21:59.0, FA without Obligator / Ascension 24:11.9, the user's plan 25:15.5,
reduced 1493.8 / 881.2 / 452.7 / 457.3. Docs: BEST_SETUP *Performance (phase 37)*.

- **Profile** (Node `--cpu-prof`, FA headline, 43 s with the profiler): `encounterTime` from the optimiser's replays and
  the carrier / item greedies 65%; inside it `specCountsDrainKey`'s JSON key per query 19%, the DP's model passes per
  (event, option) 23%, the DP 5% (CoX 22%), DPS of new drain states 13%; search 12%; ring screens 31% of the plan; the
  exact re-times each had their own DPS memo.
- **Exact speed-ups**, measured in Node one at a time (FA 29.3 s at HEAD): (1) drain-state lookups memoised by the spec
  counts before the JSON drain key (FA → 26.4 s); (2) exact encounter / pass memos (`traceMemo.ts`, `kitMemo.ts`,
  `RaidKit.memoEncounter` / `memoPass`): a remembered run is reused only by a kit that picks the same member on every
  drain state the run asked about, keyed by the encounter, assumptions, spec plan and options (a pass without the spec
  budget, so carrier / item / surge changes reuse passes); keys interned by identity (FA → 21.6 s, ToB 64.3 → 28.2,
  CoX 122.5 → 77.9 → 63.7 with (3)); (3) the exact re-times share one DPS memo (`kitEvaluatorCache`); (4) the DP's
  state key lists its pools once per row; (5) **parallel camp-one ring runs** in the browser (`parallelRings.ts`,
  `planRingRun`, `PlanHooks.ringRuns`; helpers = cores − 1, at most 8, none below 4 cores): every ring's screen, then
  the best rings' full runs with the screens' search rows; the main plan takes them (a Node test builds the plan from
  helper runs through the worker JSON — `encodeRingRuns` keeps Infinity — and gets the same plan). Tried and dropped:
  starting the full runs with the screens (each searching: slower on the loaded machine). Not applied: a DP memo per
  problem (repeats are 1.1 of CoX's 16.9 s of DP), a lower `MAX_EVENT_OPTIONS`, the one-event DP shortcut (< 1% of the
  time once passes are memoised).
- **Times** (dev machine, 20 threads; it also runs games, so the times vary ±50% with their load). Node, one thread, at
  rest: FA 29.3 → 21.6 s, ToA 64.6 → 35.6, ToB 64.3 → 25.1, CoX 122.5 → 62.5, FA Solo 81.9 → 41.5, FA without
  Obligator / Ascension 140.0 → 61.2 (under the games' load, same minute: FA 55.4 → 34.5). Browser (verifyPhase21, 8
  helpers), quiet: FA 18.4-19.1 s, ToA 16.5, ToB 21.2, CoX 38.3 (phase 36: ~38 / 51 / 72 / 112 s); under load the same
  run read FA 55, ToA 49, ToB 62, CoX 111 s; the last run (some load) FA 22.7, ToA 19.5, ToB 26.4, CoX 46.2 s. verifyPhase21's limit 240 → 150 s, verifyPhase27's re-plan 60 → 20 s
  (16.8 s).
- **Slow suites** (`RUN_SLOW_TESTS=1` CrossRaid + Phase27-37, Jest in parallel, `--coverage=false`): 997 s at HEAD (16.6
  min; CrossRaid the long pole at 991 s) → **726 s** (12.1 min, 321 / 321; the long pole is now
  CrossRaidHeadlinesCox at 720 s). CrossRaid's slow headline tests moved unchanged to `CrossRaidHeadlines.test.ts` (FA,
  ToA, ToB) and `CrossRaidHeadlinesCox.test.ts` (CoX, FA without Obligator / Ascension; shared code in
  src/tests/utils/crossRaid*.ts) so they run in parallel workers; the bit-identity checks of the headline plans sit in
  those tests and Phase31's Solo test (each plan planned once). Two runs in between, with the old file layout and the
  machine busy with games, took 1118 / 1178 s.
- **Specs (damage) box** (user add-on): plain headers with tooltips — Avg damage, Gain over normal hits, Time saved, Cost —
  and a new **Gain per 100% energy** (gain ÷ cost × 100, `gainPerFullBar`), the default order; numbers unchanged
  (Xarth: ZCB 74.9, Kisten 60.6, Dragon claws 55.5, Burning claws 46.4, Voidwaker 41.2).
- **Drain summary fix** (user, FA party 4: Bork got no specs and the briefing showed one unlabelled Smorks line): names
  and lines come from the drainable NPCs (a drain line on a non-`noDrains` target), specced or not — "Bork: no specs ·
  Smorks: Tonalztics 8 hits + BGS 2 specs → Def 48"; a named NPC's event without specs is in the short line too (CoX
  Olm "Right claw, after phase 1: no specs", ToA "Elidinis' Warden: no specs"); adds stay out. Display only
  (`drainSummaryPhases` in briefing.ts passes `noDrains`); Phase35b re-pinned for those two lines.
- **Final review, round 5**: BEST_SETUP (Reading the Plan tab: the phase 36 additions; Specs box table; 35b fix;
  Performance section), UNVERIFIED (D21-D29, B10, E9, F7, G7 all have in-game checks; no new row: the speed-ups
  approximate nothing; D28's check names "Avg damage"), README (headlines = CrossRaid; the Specs box; plan times),
  ROADMAP (37 done, a phase 37 decision; the coordinator's round 6 table and "Future work (round 7)" kept as found),
  UPSTREAM_MERGE round 5 (phases 33-36 touched no upstream file; phase 37 +7 lines in `CalcWorkerTypes.ts`; nothing to
  send upstream; `formatDuration`'s fix is fork-only), DEPLOY unchanged, `git grep -i` for the owner's email empty.
- Tests: new `Phase37.test.ts` (trace memo; memoised = unmemoised kits on FA / ToB / ToA for carriers, items, surge,
  Solo, hp left, members, a fixed plan and a random sequence; shared re-time memo; DP key; Specs box render;
  Bork no-specs toy; parallel helpers = the plan alone (6 helpers; slow: 3 helpers, auto carriers, Solo subset); the
  reduced plans = the fixtures, with memo counters); the headline slow tests (CrossRaidHeadlines*, Phase31 Solo) compare
  their plans with the fixtures, check the memo counters (`stats.memo`, new, deterministic: `memoWithin` ±20%) and a
  catastrophe-only CPU budget (5× each plan's time alone: wall and CPU times were 3-9× a plan alone in the parallel slow
  run, so tight time budgets failed there); Phase35b re-pinned.
  `yarn test` 1580 (1556 pass / 24 skipped); `RUN_SLOW_TESTS=1` CrossRaid + Phase27-37 321 / 321; tsc, lint clean. Verify: new `verifyPhase37.mjs` (Specs box headers / order, CoX plan with "rings in
  parallel", Olm's "no specs" lines; screenshots phase37-*.png), verifyPhase36 re-pinned to the new headers;
  verifyPhase21 / 23 / 26 / 27 / 29-37 all OK (verifyPhase34 found the six-column Specs table 432 px wide at 390 px: it
  now scrolls inside its box; verifyPhase27's re-plan 15.4 s; with the machine busy it read 50 s once); tracked
  screenshots they overwrote restored.

## Phase 36 fixes — review follow-ups (2026-10-25)

The independent review recomputed E[spec], net, ticks and the DP (unpruned brute force) and found them correct; these
fixes change numbers. Docs: BEST_SETUP *Damage specs, surge potion …* (Pools, Clock and regen, Hp left, Review fixes,
headline table), UNVERIFIED D27 / D28 / D29, DATA_SOURCES *Phase 36*.

- **One spec bar per party member** (blocker): Team plans used party + 1 bars (the carriers up to the party plus your
  bar for damage specs / doses: FA 7 in a 6-man, CoX 7, ToB 5). With damage specs or a Surge potion you are not a carrier
  now: `specBudgetFrom` cuts the carriers at party − 1; the item greedy makes room by dropping the carrier whose removal
  costs least (`fitBars`); afterwards the carriers are re-run greedily with party − 1 and the planner keeps the faster of
  "you carry a drain weapon, no items" and "you spec" (a note gives both times; the share text covers surge doses too).
- **Damage specs at the hp left** (`rowHpLeft`, `atHpLeft`, `PhaseQuery.hpLeft`): the ZCB ruby proc was a share of the
  full hp, so the DP put ZCB specs on the AG's last 165 hp and Bork's last armour phase; now each phase's specs are
  valued at the NPC's hp left at its start (its damage still to deal in the drain event, capped at the full hp) and no
  spec's E[damage] exceeds it: FA ZCB specs now on the AG shield (6.28 s), Bork's third phase (6.76 s), Moia, Xarth,
  Ocellus P1 and P3's last quadrant.
- **Regen on the drained clock**: the encounter is re-planned on its own drained phases' clock (up to `CLOCK_ROUNDS` = 2
  re-plans). The AG's Burning claws spec (relying on a regen tick of the 36.7 s undrained clock that the 29.1 s drained
  fight never reaches) is gone: AG 174.8 → 175.8 s.
- Headlines (Team defaults): FA 21:04.9 → **21:07.7** (2 Elder maul + 3 Tonalztics; ZCB + Burning claws + a Surge potion,
  dose at Ocellus; 21:43.8 if you carry), ToA 14:05.5 → **14:07.8** (1 maul + 1 Ayak; Voidwaker), CoX 7:03.6 → **7:08.7**
  (3 maul + 1 BGS + 1 Tonalztics; Dragon claws), ToB 7:21.2 → **7:23.4** (1 maul + 2 Tonalztics; Dragon claws; Sotetseg:
  start maul ×2, after each maze Tonalztics ×2). FA Solo 21:54.8 → 21:59.0; FA without Obligator / Ascension 24:05.1 →
  24:11.9; the user's plan 25:00.0 → 25:15.5 (it had 4 carriers + your bar in a 4-man).
- Docs report the items' **marginal** values in the final FA plan (ZCB 23.9 s, Surge 3.8 s, Burning claws 2.1 s), the
  surge cooldown clock as conservative everywhere (in-room non-DPS time isn't counted), and that a dose can't pay for
  drain specs on the phase it's drunk.
- **Fixed-plan replay vs exact allocation**: a slow test brute-forces every kit of a reduced FA pool (10 candidates, ≤ 4
  loadouts, 336 kits) with each kit's own exact allocation: the planner's kit is the best (gap 0.0000 s). New test hook
  `PlanHooks.onKitSpace`.
- Tests: Phase36 +7 (bars = party; carriers cut at party − 1; rowHpLeft; ZCB on 165 hp ≤ 36; AG drained clock; carry
  vs spec at party 1 / 6 (slow); the kit brute force (slow)); CrossRaid asserts bars ≤ party on every headline plan;
  Phase27 (ToA 881.2, CoX 452.7), 29, 31, 32, 34, 35, 35b and CrossRaid re-pinned; verify scripts re-pinned.

## Phase 36 — Damage specs, surge potion, one spec budget per encounter (2026-10-25)

Numbers move (full independent review next). Docs: docs/BEST_SETUP.md *Damage specs, surge potion and one spec budget
per encounter (phase 36)*; UNVERIFIED B10 / E9 / F7 / G7 updated, D27 (budget), D28 (damage specs), D29 (surge) new;
DATA_SOURCES *Phase 36*.

- **One spec budget per encounter** (`specBudget.ts` pure DP, `encounterBudget.ts` time-model glue; raidTime.ts
  `encounterTime` / `raidTime`): pools = your bar (Solo) or one bar per carrier + yours (Team); 100% at each encounter
  (`CARRY_SPEC_ENERGY = false`, the flag carries the leftover with 0 s of travel); drain events per NPC + Defence resets
  (new: Kephri's final phase, the Warden's enrage, Olm's hand phases — wiki quotes in DATA_SOURCES); regen +10% / 30 s
  (15 s Lightbearer) on the encounter's wall clock; exact DP with dominance pruning, ties → fewer specs, then a top-up
  spending spare energy on drain reliability; never slower than no specs; at most 24 options per event after the
  pruning (`MAX_EVENT_OPTIONS`; only Olm's events have more: CoX 7:03.2 → 7:03.6 for a ~45% faster plan). Couplings (Bloat's first down → later downs)
  attributed to the causing event.
- **Damage specs** (`damageSpecs.ts`): Voidwaker, Dragon / Burning claws, Zaryte crossbow (ruby / diamond (e)), Crimson
  kisten (the roadmap's "Kiston": a Maggot King unique); Keris partisan of breaching and Bone dagger not modelled
  (no upstream spec). E[spec] = upstream `getSpecCalc().getExpectedDamage()`; net = E − DPS × ticks × 0.6; seconds =
  net ÷ (team-DPS multiplier × DPS); only damage-limited phases, never adds.
- **Surge potion**: a 1-slot item (4 doses, pseudo id like the hearts, bundled wiki image); +25% capped, once per
  encounter after your first spec or below 100%; doses placed exactly per route (≥ 300 s apart on the route's DPS clock,
  first at the raid start); a second potion only if > 4 doses fit.
- **Planner**: the optimiser replays a fixed spec plan (`fixedAlloc`) found by the DP on a bootstrap kit; carriers /
  share / items greedy use the DP on the kit; exact re-time allocates per kit. Damage weapons and surge potions brought
  greedily at ≥ 1 s per slot (`pickSpecItem`); Team: with damage specs your share is "your spec energy goes to …".
  Fixes found on the way: the optimiser's times are re-timed after the item greedy (step 7 used stale times), and
  `formatDuration` rounds before splitting minutes (1499.96 s read "24:60.0").
- **UI**: Plan briefing "You: [icon] ×N" damage specs and a surge "dose" marker; Bring line + "Surge dose at: Ocellus"
  (icon); per-phase rows list damage specs; inventory shows the Surge potion; Search "Specs (damage)" box
  (`SpecDamageBox.tsx`, best first: E[dmg], net, s / spec, energy); Search Solo drain box "with a surge dose" line.
- **Headlines** (Team defaults, camp one ring): FA 21:44.4 → **21:04.9** (Bring Zaryte crossbow + Burning claws + Surge
  potion, dose at Ocellus; carriers 2 Elder maul + 4 Tonalztics), ToA 14:12.1 → **14:05.5** (Voidwaker), CoX 7:01.3 →
  **7:03.6** (Dragon claws; Olm re-drained from one budget: slower), ToB 7:29.5 → **7:21.2** (Dragon claws; Sotetseg
  "start: Tonalztics 3 hits → Def 107 · after maze 1 / 2: Elder maul 2 specs + Tonalztics 1 hit → Def 100"). FA Solo
  party 1 22:01.9 → 21:54.8; FA without Obligator / Ascension 24:34.1 → 24:05.1; the user's plan 25:46.3 → 25:00.0.
- Tests: new `src/tests/lib/raids/Phase36.test.ts` (26); re-pinned Phase27 / 29 / 30 / 31 / 32 / 33 / 34 / 35 / 35b /
  CrossRaid. Verify: new `scripts/verifyPhase36.mjs`; verifyPhase21-35b re-pinned (totals, Bork lines).
  `yarn test` 1556 (1534 pass / 22 skipped); `RUN_SLOW_TESTS=1` CrossRaid + Phase27-36 294/294; tsc, lint clean.
  Verify: verifyPhase36 all OK (screenshots phase36-*.png); verifyPhase21 / 23 / 26 / 27 / 29-35b all OK after the re-pins
  (tracked screenshots they overwrote restored). verifyPhase35b's "Obligator not owned" Wear check is skipped when the
  route no longer passes Bork + Smorks (it now takes Ezekiel).
- Not done / left: plans are slower (browser: FA ~40 s, ToA ~50 s, ToB ~70 s, CoX ~112 s, 193 s before the option cap;
  verifyPhase21's limit raised 150 → 240 s, verifyPhase27's re-plan 20 → 60 s); the time between
  encounters (energy carry), mid-event re-drains and two doses in one long encounter are not modelled (D27, D29).

## Phase 35b — Briefing: one drain line per NPC (2026-10-24)

User (FA plan briefing): "It says Bork + Smorks. But they are separate bosses. I can't tell which I should use
elder/ralos on". Phase 33 folded every target of an encounter into the first phase's drain line (The Smorks, Def 220
floor 0, was hidden under Bork's 300 → 180). UI fix, **no number changes** (FA 21:44.4; per-phase strings unchanged).

- **Grouping**: new optional `BestSetupTarget.npc` (types.ts); `phaseNpc(targetKey)` (briefing.ts) = `npc` ?? monster
  `name`. Same-name targets are one NPC with no data (AG, Bork's phases, Ocellus P1–P3, Kephri, Wardens shield / core,
  Nylocas forms, Verzik). `npc` set where one name covers different NPCs or is long: Smorks, Obelisk, Olm Right claw /
  Left claw / Head, Melee / Ranged / Magic vanguard, Small / Large muttadile.
- **Events** (`encounterDrainSummary`, drainLine.ts): one event per NPC (first-appearance order; an NPC coming back joins
  its event), plus the `drainReset` events (Sotetseg, Bloat). Unspecced NPCs (adds) get no line. Several specced NPCs →
  named: "Bork: Elder maul 2 specs + Tonalztics 2 hits → Def 180 · Smorks: Elder maul 4 specs + Tonalztics 2 hits →
  Def 5" (briefing, two lines); tooltip / per-phase details "Bork: 2 Elder maul carriers … → Def 180 · 99.6% · Smorks: …
  → Def 5". `encounterBrief` labels per NPC and never merges two NPCs into "× N". Single-NPC encounters unchanged.
- **Wear** (`wearGroups`; PlanBriefing): one line per NPC ("Bork: [icons]" / "Smorks: [icons]") when the NPCs use
  different loadouts; NPCs with the same loadouts share a line; otherwise the phase 34 cell. Phone: weapon icon only.
- **Other multi-NPC encounters** (defaults, Team): ToA Wardens now Obelisk / Elidinis' Warden (P2 shield, P2 core) /
  Tumeken's Warden lines (the core and P3 lines were folded into the Obelisk's); CoX Olm Right claw / Left claw / Head
  (was the right claw's only); Kephri, Akkha, Vasa, Vespula, Muttadiles keep one spec line (adds unspecced) and get a
  per-NPC Wear; Vanguards Wear per Vanguard; AG, Ocellus, Dagon'hai, ToB unchanged. Full table: docs/BEST_SETUP.md
  *One drain line per NPC (phase 35b)*.
- Tests: new `src/tests/lib/raids/Phase35b.test.ts` (16); Phase34.test re-pinned (Bork + Smorks line, a render test's
  rows carry `wear`). Verify: new `scripts/verifyPhase35b.mjs` (all OK; screenshots phase35b-*.png); verifyPhase33 / 34
  re-pinned to the per-NPC line; verifyPhase29–35 re-run, tracked screenshots they overwrote restored.
  `yarn test` 1530 (1508 pass / 22 skipped); `RUN_SLOW_TESTS=1` CrossRaid + Phase27-35 + 35b 268/268; tsc, lint clean.

## Phase 35 — No specs on adds (2026-10-24)

Rule (user): "you obviously aren't going to Ralos or Elder maul spec the little minions that die in a few hits anyway".
Until now every add was its own drain plan with a fresh 100% spec budget, which overstated the drains' value.

- **Targets** (`noDrains: NO_DRAINS_ADDS` = "adds: not worth a spec", `src/lib/raids/types.ts`): ToA Spitting / Soldier /
  Arcane Scarab, Akkha's Shadow; CoX Skeletal Mystic, Lizardman shaman, Muttadile (small), Glowing crystal, Abyssal
  portal; ToB the six wave nylocas (Search only); FA Jelly (Search only; the roadmap said "FA: none", but the jellies
  are 61 hp summoned adds and the time model ignores them, so no headline moves). The wiki phrase per target is in the
  target's comment and docs/DATA_SOURCES.md *Phase 35*. Existing reasons kept (Vanguards, Bloat after a stomp, Verzik).
  Judgement calls that keep drains: Ice demon, Tekton, Vasa, Vespula, the large Muttadile, Olm hands / head, ToA
  Obelisk, Warden core, Kephri (shielded), Dagon'hai, Ocellus P2, The Smorks.
- **Effect**: the existing `noDrains` path (`buildTargetMonster`) ranks them at full Defence in every drain state, so no
  drains are planned on them (Solo and Team), the planner's team briefing skips them (`perTarget`), and the greedy
  carriers gain nothing on them (route time; an add's seconds are identical with / without carriers). UI: Search drain
  box "No drains: adds: not worth a spec" (it wins over Solo's "no spec weapons" note; no per-boss table for `noDrains`
  targets), Summary "no specs (adds)" (other `noDrains` targets "no specs"; reason in the tooltip), Plan per-phase rows
  "no specs (adds)".
- **Headlines** (defaults, Team, camp one ring): FA **21:44.4** and ToB **7:29.5** unchanged; ToA 14:04.1 → **14:12.1**
  (same kit; Akkha 138.5 → 144.5 s, the shadows 42.8 → 48.8; Kephri 145.8 → 147.8, the scarabs 17.8 → 19.8; carriers
  1 Elder maul + 1 Tonalztics + 1 Eye of Ayak → 1 Elder maul + 1 Eye of Ayak; your share Eye of Ayak → Elder maul); CoX
  6:35.9 → **7:01.3** (Mystics 31.8 → 43.9, Shamans 25.1 → 29.7, Vespula 19.3 → 23.4, Vasa 18.5 → 21.8, Muttadiles
  21.6 → 22.8, Olm 189.6 → 189.7; carriers 2 Elder maul + 2 Tonalztics + 1 BGS + 1 Ayak → one Tonalztics fewer; your
  share Tonalztics → Elder maul). Reduced pools, allow switches (`Phase27`): ToA 872.6 → 879.6, CoX 411.9 → 442.0.
  Re-pinned: CrossRaid (headlines + fast pins), Phase27, verifyPhase23 / 32, README, BEST_SETUP, ROADMAP.
- **Found, not modelled** (UNVERIFIED F10): the Glowing crystal "regenerates any drained defence levels" of Vasa when he
  reaches it, and Mod Ash's CoX stat-regeneration rates (Tekton 1 level / 15 ticks, Vasa 10, Vespula 10, Muttadiles 15,
  ...): CoX drains decay within a room; the model keeps them for the whole room.
- Tests: new `src/tests/lib/raids/Phase35.test.ts` (every add has the reason; `buildTargetMonster` Solo / Team = the
  undrained monster; judgement calls still drain; ToA / CoX encounters: add phases take the drains-None seconds with
  Team and Solo, no drain line; briefing rows; a reduced ToA plan's team briefing / drivers / phases list no add;
  SpecPlanPanel render; slow: ToA 14:12.1, CoX 7:01.3 with their carriers). Presets.test's per-target drain check skips
  `noDrains` targets (the Jelly).
  `yarn test` 1514 (1493 pass / 21 skipped); `RUN_SLOW_TESTS=1` CrossRaid + Phase27-35 252/252;
  lint, tsc clean.
- Playwright: new `scripts/verifyPhase35.mjs` all OK (ToA Search Spitting Scarab Team / Solo: the note, no icons,
  ranked at Def 80; ToA Plan 14:12.1, briefing / Spec plan without scarab or shadow, the 4 add phase rows "no specs
  (adds)", Kephri / Akkha still drain; CoX Summary Skeletal Mystic "no specs (adds)", Tekton drains); screenshots
  `phase35-{search-scarab-team,search-scarab-solo,plan-toa,plan-toa-details,summary-cox}.png`. verifyPhase21 / 23 / 26 /
  27 / 29-34 all OK (23 / 32 re-pinned to ToA 14:12.1); tracked screenshots restored.
- Docs: BEST_SETUP *Targets that never get specs (phase 35)*, DATA_SOURCES *Phase 35*, UNVERIFIED D26 (the adds rule)
  and F10 (CoX drain decay), README, ROADMAP 35 done.

## Phase 34 — Readability, all three tabs (2026-10-24)

UI only: no number changes. Rule (user): "if it doesn't provide useful information we should hide it" — the default view
shows what to wear, what to spec, how many and how long, as icons and bold numbers; the rest is in tooltips or sections
closed by default. Full map of where every old element went: BEST_SETUP *Reading the Plan tab (phase 34)*.

- **Short drain form** (drainLine.ts `briefText` / `briefItems` / `briefResultText`, DrainLineView `DrainBrief`): a
  large weapon icon and one bold number per weapon — Tonalztics **4 hits** (landed hits needed), Elder maul / DWH **2
  specs** (landed), BGS **N specs**, Eye of Ayak **≈ 39 magic def** — then "→ Def 156"; "not needed" weapons left out
  (tooltip keeps them). Search drain box header "[Tonalztics] 4 hits → Def 156 · Magic def 130"; Summary cells; the
  Plan briefing.
- **Plan tab**: a raid briefing at the top of the result (`PlanBriefing.tsx`, `briefing.ts` `briefingRows`): boss
  image, the kit loadouts used as icons (weapon + items, style colour; phone: weapon only), specs at the start (from
  phase 33's drain events; Sotetseg "× 3"; carriers not repeated; the phase 33 line is the tooltip), seconds; then
  "Bring" + your share, the worn / inventory grids. Closed sections: **Why this kit** (kit loadouts, potions, ring +
  others, spec note, rejected / alternatives, stats), **Spec plan** (Solo list / team briefing table, added in order,
  per-boss minimum, notes), **Per-phase details** (phase 33's encounter table with its toggle, routes). Inputs: the
  intro and ring summary are tooltips; Route, the potions note and the raid items moved to Advanced (plan).
- **Search**: drain sentence, hit chances, budget, chance of the floor and the per-boss table under the box's "details";
  ranked-at / best preset / evaluations / can't-hit under "Search details"; "vs best preset", max hit, accuracy, item
  list and "search started from" are tooltips. **Summary**: best preset in a tooltip, "↗" load button, drains as icon +
  number (the sentence and "(fight ≈ 15 s → N specs)" are the tooltip).
- **Assumptions**: potion / Heart pickers are custom icon lists (`IconSelect.tsx`, `potionChoices.ts`: relevant
  choices first, the rest under "more"; the same options as the old selects), Zeal with its prayer icon, Elemental
  fragments → Advanced, the Ayak hint an "ⓘ" tooltip, "from the last plan" / ring-lock notes screen-reader text.
- **Item icons everywhere** (`ItemNames` / `itemImageByName`): "uses: …" badges, Excluded, potions, rings, Worn / Switch
  names, alternatives (`PlanRejection.weapons`, new optional field), spec note, added in order, your share, raid items,
  always-brought warning, "+ heart" buttons.
- **Drain-line wording** (tooltip / per-phase rows): "4 specs (2 carriers), 8 swings" → "4 specs (2 carriers) = 8
  attacks, 4 must land" (Solo "4 specs = 8 attacks, 4 must land"; maul / DWH / BGS specs only); tooltip "attacks twice
  and each attack can miss"; glossary updated. Phase23 / 29 / 32 tests and verifyPhase23 / 29 / 30 / 32 re-pinned to
  the new text only.
- Tests: new `Phase34.test.ts` (briefText per weapon; rewording; briefing rows FA Team / Solo, ToB Sotetseg × 3; potion
  lists = the old options; render-level icon checks on DrainBrief / PlanBriefing / KitLoadoutIcons / ItemNames; slow:
  the FA Team plan 21:44.4, 6 free, briefing, phase 33 encounter lines, "Why this kit" / "Spec plan" strings).
  `yarn test` 1456 (1437 pass / 19 skipped); `RUN_SLOW_TESTS=1` CrossRaid + Phase27-34 193 / 193; lint, tsc clean.
- Playwright: before / after screenshots `phase34-before-{search,plan,summary,plan-phone}.png`,
  `phase34-after-{search,plan,summary,plan-phone,plan-details}.png` (`scripts/phase34Shots.mjs before|after`); new
  `verifyPhase34` all OK (default views have no sentence-form drain text, sections open the old content, icons, no
  overflow at 390 px; the 3 px upstream top bar overflow at 390 px is pre-existing, also on the calculator page); the
  phase 33 page's plan strings were dumped before the change and compared after: identical except the drain rewording
  and "Why this kit" now being the section title. verifyPhase21 / 23 / 26 / 27 / 29 / 30 / 31 / 32 / 33 all OK (verifyPhase32 counts the loadout's item-row icons, not the new weapon icon by its name) (they open the moved sections first:
  `scripts/phase34Sections.mjs`); tracked screenshots restored.
- Docs: BEST_SETUP *Reading the Plan tab (phase 34)* (layout, where each element went, icons), ROADMAP 34 done.

## Phase 33 — Specs follow the plan; one drain line per encounter (2026-10-24)

UI / defaults only; no plan total moves (the Plan tab already defaulted to "Planner decides").

- **"Specs I bring" defaults to none** (`DEFAULT_ASSUMPTIONS.mySpecs`: every weapon off, Ayak 0; ToA / CoX / ToB copy
  it). The row has a mode select ("Planner decides (Plan tab)" / "Set manually") that is the same setting as the Plan
  tab's "Spec weapons" (lifted to the page). Planner decides: the chips are read-only (dashed, disabled) and mirror the
  last plan's "Bring" (Solo: the chosen subset; Team: your share when carried), "(from the last plan; Search / Summary
  use them)", or unlit with "(run a plan to fill these)" before a plan; Search / Summary Solo drains use exactly those
  weapons (`withPlanSpecs` in specChoice.ts → `mySpecsForSubset`: Ayak until magic def 0). A plan with drains "None"
  leaves the last Bring. Set manually: editable chips as before. The Search tab's Solo drain box with no spec weapons:
  "no spec weapons: run a plan or pick Specs I bring"; the Ayak hint only shows with Ayak specs.
- **What moved** (Search, FA party 6, Solo drains, top row; phase 32 default Elder maul + Ayak × 2 → none before a plan
  → the plans' Bring, Tonalztics): Bork 10.327 → 8.945 → 9.235; AG Flying 10.095 → 9.387 → 11.127; AG Grounded 12.855 →
  11.413 → 12.887; Xarth 13.917 → 12.839 → 13.917; Moia 10.931 → 10.084 → 11.386 (Summary Solo column likewise). Tests
  that pinned numbers with the old default keep it as an explicit input (`src/tests/utils/phase32Specs.ts`: Presets,
  Phase23, SpecAccuracy, Ownership, Phase27, Phase29).
- **One drain line per encounter** (`encounterDrainSummary` in drainLine.ts; PlanView `EncounterDrains`): the encounter
  row shows the specs at the start of the fight, from the first phase whose drain line specs a weapon (its own
  numbers); a later phase needing another set of weapons gets its own line. FA Team defaults: Bork + Smorks "Start of
  fight: 2 Elder maul carriers (4 specs) + 2 Tonalztics carriers (4 specs) → Def 180 · 99.6%"; AG "Flying shield: 2
  Tonalztics carriers (4 specs) → Def 156 · 98% · Grounded: 2 Elder maul carriers (4 specs) + 2 Tonalztics carriers (4
  specs) → Def 156 · >99.9%"; Ocellus "P1 at a corner: … → Def 129 · >99.9% · P3 last quadrant, Deflect Melee: 2
  Tonalztics carriers (4 specs) → Def 150 · 84%". Solo party 1 (Bring Tonalztics): "Start: 3 Tonalztics specs → Def 156 ·
  86%" (AG), "Start: 2 Tonalztics specs → Def 129 · 99%" (Ocellus); Bork + Smorks isn't on the Solo route (unit test,
  presets kit: "Start: 3 Tonalztics specs → Def 267").
- **Drain events** (coordinator amendment): `PlannedPhase.drainReset` (→ `PhaseTime`) marks a phase where the Defence is
  restored; the line is grouped per event ("After maze 1 (Defence restored), again: …"). Flagged across the four raids
  (defaults): ToB Sotetseg thirds 2 and 3 (`maze 1`, `maze 2`) and ToB Bloat's later downs (`the stomp`; no drains in the
  model, "no specs"). Not flagged (sources say nothing of a restore / drains carry): Tekton, Vanguards (no drains),
  Wardens P3, Akkha, Olm, Verzik, Xarpus. Maths unchanged: each phase still plans with 100% energy (tooltip: re-draining
  needs spec energy again; phase 36 shares one budget per encounter).
- **Per-phase details**: one "▸ Show per-phase details (N phases)" toggle for the whole table (closed by default; rows
  stay in the DOM, hidden); the phase rows' drain lines are unchanged. Search / Summary keep their per-phase lines.
- Tests: new `Phase33.test.ts` (defaults per raid; withPlanSpecs; reduced plans Solo / Team chips = Bring; toy summaries;
  FA Bork / AG / Ocellus / Xarth / Solo lines = the first phase's; stun-uptime six rows → one line; reset flags across
  every raid = the "Defence restored" labels; Sotetseg 3 events, Bork 1, Bloat 2; slow: full FA Solo party 1 → chips
  Tonalztics, Team → your share). `yarn test` 1434 (1416 pass / 18 skipped); `RUN_SLOW_TESTS=1` CrossRaid + Phase27-33 171 / 171; lint, tsc clean.
- Playwright: new `verifyPhase33` all OK (ToB 7:29.5; Sotetseg "Start of fight: 1 Elder maul carrier (2 specs) + 2
  Tonalztics carriers (4 specs) → Def 100 · 99.7%", then "After maze 1 (Defence restored), again: …" and "After maze 2
  …" with the same numbers) (screenshots phase33-search-solo-nospecs / -plan-collapsed / -plan-expanded /
  -plan-solo / -search-solo-plan / -tob-sotetseg); verifyPhase29 (opens the per-phase details) and 32 ("Set manually"
  before toggling Tonalztics) adapted; verifyPhase21 / 23 / 26 / 27 / 29 / 30 / 31 / 32 all OK (verifyPhase23 ticks the Elder
  maul by hand for its Solo budget check); tracked
  screenshots restored.
- Docs: BEST_SETUP (*Specs follow the plan; one drain line per encounter (phase 33)*, Assumptions, Plan tab layout,
  glossary), ROADMAP 33 done.

## Phase 32 — Final review, round 4 (2026-10-24)

Slot costs change (full independent review next).

- **Zero-value switch items** (user, FA party 4 without Obligator: a slot for Rada's blessing 4 in the melee switch).
  The blessing (prayer only) left `MELEE_FILL` / `ANCESTRAL` (every raid's melee / magic presets) and the melee / ranged
  / magic search pools' `ammo` slot. planner.ts: `isUnusedAmmo` (an ammo-slot item on a weapon that fires no ammo,
  `ammoApplicability` ALLOWED on canonical ids, no melee / magic attack or strength, not Crystal blessing) is dropped
  from every candidate (`withoutUnusedAmmo` in `addCandidate`), never counted (`equipmentItemIds`) and never drawn
  (`inventoryGrid`). **Kept ammo**: a loadout without ammo of its own keeps a kit ammo item in its ammo slot
  (`wornItemCounts`, `wornKeptAmmo`, `SlotUsage.keptAmmo`, `KitProblem.wearsAmmo`, `PlanResult.keptAmmo`) — the bolts
  stay equipped while meleeing — so it holds one inventory item fewer (without it the blessing's slot only moved into
  swap space). Worn grid: the kept ammo in the ammo slot (dashed, "a switch's ammo, worn here too"); free-slots tooltip
  "(… worn in the ammo slot)". UNVERIFIED D25.
- **The user's plan** (FA, party 4, Camp Lightbearer, 6 / 4 / 0 / 2, 1 rune pouch, not owned: Obligator, Zorya's tome,
  Rondache, Inquisitor's helm / hauberk / plateskirt / mace): 25:47.4 → **25:46.3**; the melee switch 10 → 9 items; the
  freed slot buys Onyx ascension bolts (e) for the void Ascension crossbows switch (−1.1 s for 1 slot ≥ 1 s), so still
  0 / 28. The "Zaryte crossbow + Ruby dragon bolts (e) #2" candidate (not in this kit at HEAD inputs; saves 0 s here):
  +3 slots = Zaryte crossbow, Ruby dragon bolts (e), **Twisted buckler** (one-handed crossbow vs the two-handed worn
  Ascension crossbows; +18 ranged attack / +10 ranged str: a DPS item, kept).
- Headlines (Team, camp one ring) phase 31 → 32: FA **21:44.4** (same kit, 6 free, was 5); ToA **14:04.1** and CoX
  **6:35.9** (same kits; the worn melee set keeps the diamond ascension bolts (e): your share now carried in the freed
  slot, ToA Eye of Ayak, CoX Tonalztics); ToB 7:30.0 → **7:29.5** (the Tumeken's shadow partial switch becomes the full
  Shadow (Ancestral) loadout; Nylocas 41.5 → 41.0 s; a 0.5 s-per-slot upgrade (its Imbued Guthix cape): the 1 s rule is per loadout); FA without Obligator / Ascension 24:45.3 → **24:34.1** (the
  Twisted bow partial switch on the Shadow becomes the full Twisted bow (Masori) worn; AG 198.9 → 196.5, Ocellus 775.4 →
  767.3 s); FA Solo party 1 **22:01.9** (6 free). Phase 29 regression {maul, Tonalztics} Solo (phase 29 pinned list)
  1382.50 → 1329.96 s; Phase27 reduced "allow switches" FA 1533.2 → 1493.8, ToA 879.7 → 872.6 s.
- **Drain-line units** (user: "needed ×4 · team brings ×4 (8 hits)" read as 4 people / 8 landed hits): `neededText`
  "needs 4 landed hits · 4 specs (2 carriers), 8 swings · 98%" (+ " · team: 6 specs (3 carriers) · 99.8%" when the team
  brings more; "not needed · team: …"); landed drains of the weapon alone from the start Defence (`landedToReach`:
  Tonalztics hits, maul / DWH specs, BGS "≈ N damage", Ayak "≈ N magic defence drained"), or from the Defence the others leave
  ("needs 2 landed hits once 1 Elder maul spec lands (Def 195)", `landedNeed`), else "needs the other drains too". Solo
  (`soloNeeds`): "needs 3 landed hits · 2 specs, 4 swings · → Def 167". Tooltip: the landed range, "a charged
  Tonalztics spec swings twice and each swing can miss", what the % means. Planned specs' tooltip "(8 swings)"; the
  Max-drain buttons keep "×2 (4 hits)" ("(4 landed hits)"). Glossary "Needs / team". Review: the % is P(the Defence reaches the floor) with these and the other weapons' specs (Bork maul 98% includes the Tonalztics; alone 86.3%), no % sentence when the line reads "→ Def X"; "once 1 Elder maul spec lands (Def 195)"; Ayak "≈ N magic defence drained"; D25 notes a pinned blessing with an all-melee / magic kit is counted as a slot (conservative by one).
- Quiver nits: UNVERIFIED D23 quotes the Dizana's max cape page in full ("when worn" is the max-cape exceptions'; the page
  doesn't say if the slot works from the inventory), same-kind pair (manual swap, not modelled; `quiverSavedSlots` not
  limited: not a one-line change), a quiver only pinned / worn by a non-ranged loadout still frees the slot; QUIVER_NAMES
  comment likewise.
- Round 4 review: UNVERIFIED D21 / D22 got in-game checks, new D24 (Solo 1 s per slot) and D25 (zero-value items, kept
  ammo); ROADMAP 29-32 done, decisions, round 5 (+ finer quiver rule, same-kind ammo swap, prayer bonus); UPSTREAM_MERGE
  round 4: no upstream file changed (+334 / −29), nothing new upstream-worthy; README headline (ToB 7:29.5); DEPLOY
  unchanged; a grep for the owner's email is empty.
- Tests: new `Phase32.test.ts` (data; DPS with no ammo = blessing = every pool ammo on every phase of every raid's melee /
  magic presets; isUnusedAmmo; toy kits; brute force over 8191 FA preset subsets vs an exhaustive count with kept ammo;
  grid; reduced plan; drain wording for AG / Xarth / Bork / Ayak / Solo; slow: the user's plan 25:46.3). Updated: Phase23
  / Phase29 (wording), Planner (comfort supplies), Phase27 (switch totals), Phase31 (exhaustive with kept ammo),
  Phase29 slow (1329.96), CrossRaid (ToB, FA-owned). `yarn test` 1406 (1390 pass / 16 skipped; 13 fewer parametrised preset / pool-item cases without the blessing); `RUN_SLOW_TESTS=1` CrossRaid + Phase27-32 143 / 143; lint, tsc clean.
- Playwright: new `verifyPhase32` all OK (screenshots phase32-drain-ag-flying / -drain-solo / -user-plan /
  -fa-defaults / -kept-ammo); verifyPhase21 / 23 / 26 / 27 / 29 / 30 / 31 re-pinned (ToB 7:29.5, FA-owned 24:34.1,
  drain wording; ToB steps −31.8 / −10.4 / −3.5 s on the new kit): all OK; tracked screenshots restored.

## Phase 31 — Quiver ammo + heart as magic's potion (2026-10-24)

Slot costs change (full independent review next).

- **Quiver** (planner.ts `QUIVER_NAMES`, `isQuiver`, `isQuiverAmmo`, `quiverSpecOf`, `quiverSavedSlots`,
  `quiverHeldAmmo`): a kit carrying any Dizana's quiver (Charged / Uncharged / Locked, Blessed, Dizana's max cape), worn or
  not, and ≥ 2 arrow / bolt types needs 1 slot less (one type per quiver; the Bolt rack, javelins, atlatl darts,
  blessings don't count). Source: wiki Dizana's quiver (https://oldschool.runescape.wiki/w/Dizana%27s_quiver, read
  2026-10-24): "an additional ammunition slot, which can only be filled with arrows or bolts", "only appearing if the
  quiver is in the inventory or equipped" (UNVERIFIED D23). In every count: `optimiseKit` (`KitProblem.quiver`), the
  plan's `usedWith` / `usedOfKit`, `kitSlotUsage` (`SlotUsage.quiverAmmo`), `inventoryGrid` (the held type takes no
  cell). Kit view: the held ammo on the quiver's corner (worn cape slot or the quiver's inventory cell), tooltip "…
  held in the quiver (0 inventory slots)"; free-slots tooltip "− 1 ammo held in the quiver (name)".
- **Heart = magic's kit potion** (`kitHeart`, `kitPotions` → `KitPotion` with type 'heart'): FA / ToB no longer pin it
  (`planDefaults.ts`); a kit with a magic loadout pays one slot (a pinned heart: counted once, no potion slot), magic is
  always boosted (`planAssumptions`: pinned heart, else the Assumptions box's, else Saturated). Inventory: a 'potion' cell
  right after the potions; "Potions (from the kit): … Saturated heart (magic)". ToA / CoX unchanged (raid potion, no
  heart slot). The "+ Saturated / Imbued heart" pin buttons stay (optional).
- **Solo subset search, 1 s per slot** (specChoice.ts `SubsetProblem.slotSeconds`, default `SHARE_MAX_SLOT_SECONDS`,
  `subsetScore`): ranked by time + 1 s × slots, "best without …" too; "adding Elder maul to this plan: −0.6 s (1 slot,
  < 1 s per slot)".
- Headlines (Team, camp one ring) phase 30 → 31: FA 21:44.4 → **21:44.4** (quiver holds the Seeking dragon arrows, and
  the unused pinned heart is gone: 5 free slots, was 3; nothing saves ≥ 1 s per slot); ToA 14:06.0 → **14:04.1** (quiver
  holds the Diamond ascension bolts (e); the slot buys a Keris partisan of breaching loadout, Kephri 147.7 → 145.8 s);
  CoX 6:36.3 → **6:35.9** (quiver holds the Diamond ascension bolts (e); kit re-shuffled: Inquisitor's + Obligator worn,
  Twisted bow + Scorching bow switches, Tekton 16.3 → 14.4 s); ToB **7:30.0** (heart now a kit potion for the Shadow
  switch: same slot); FA without Obligator / Ascension crossbows **24:45.3** (same: the heart for the Shadow loadout).
  Solo party 1: 22:01.3 (Elder maul + Tonalztics) → **22:01.9, Bring: Tonalztics** (Elder maul saved 0.57 s). Phase 29's
  slow regression with the phase 29 pinned list: 21:53.0 → 21:44.4.
- Tests: new `Phase31.test.ts` (toy kits (a)-(d) hand-counted in `kitSlotUsage`, the optimiser and the grid; real items;
  brute force over all 8191 subsets of the 13 FA presets vs an exhaustive per-worn-state count; heart (e)-(h) on reduced
  plans incl. ToB / ToA / CoX; subset rule (i); slow: Solo Bring Tonalztics 22:01.9 + exhaustive count of the plan's
  kit, Team exhaustive count); Heart / Phase21 / Phase27 / Phase30 / Planner / CrossRaid updated for the heart; CrossRaid
  ToA / CoX re-pinned; Phase29 slow 21:44.4. `yarn test` 1391 (1376 pass / 15 skipped); `RUN_SLOW_TESTS=1` CrossRaid +
  Phase27 + 28 + 29 + 30 + 31 115 / 115; lint, tsc clean.
- Playwright: new `verifyPhase31` all OK (FA quiver badge on the worn Dizana's quiver, "Seeking dragon arrow: held in the
  quiver", no cell, pinned list empty; FA owned: heart cell right after the potions; Solo "Bring: Tonalztics" 22:01.9,
  "adding Elder maul … < 1 s per slot"); screenshots phase31-fa-quiver / -fa-heart / -solo. verifyPhase21 / 23 / 26 / 27 /
  29 / 30 re-pinned (pinned lists empty, ToA 14:04.1, Solo Tonalztics 22:01.9): all OK; tracked screenshots restored.
- Docs: BEST_SETUP (*Plan tab → Heart*, *Quiver ammo and the heart (phase 31)*, potions, ToB / Assumptions lines),
  UNVERIFIED D23 (+ D11 / D14 / D19), ROADMAP 31 done + decisions, README headlines.

## Phase 30 — Plan tab polish (2026-10-24)

UI / defaults only; the planner's maths is unchanged.

- **Supply icons**: brew / restore / food show the wiki's inventory images (Saradomin brew(4).png, Super restore(4).png,
  Anglerfish.png — the cooked fish's file; "Cooked anglerfish.png" 404s), downloaded with the generic User-Agent into
  `src/public/img/supplies/` and statically imported like upstream's Ranging / Super combat images (so they show in dev
  without a CDN deploy; not in `cdn/`, so `copyCdn.mjs` is not involved); "Other" keeps the generic flask.
- **Ring policy** left Advanced: a "Rings" dropdown in the supplies row with the one-line summary next to it (the
  explanation is its tooltip); behaviour unchanged.
- **Empty pinned defaults** (all raids; FA / ToB keep the Saturated heart until phase 31). CoX: the Guardians are
  pickaxe-only, and the planner adds the Dragon pickaxe switch itself (it's in the CoX pool / presets): no pin, no raid
  rule needed (`Phase30.test.ts`; CoX planNote updated). Headlines (Team, camp one ring): FA 21:53.0 → **21:44.4** (5
  freed slots: Ascension crossbows + diamond (e) worn beside the Twisted bow switch, AG 190.7 → 182.1 s; 3 slots stay
  free), ToA 14:10.6 → **14:06.0** (Lightbearer + Zaryte crossbow freed: Twisted bow switch, Zebak 126.5 → 121.9 s),
  CoX **6:36.3** and ToB **7:30.0** unchanged (same kits), FA without Obligator / Ascension 24:53.8 → **24:45.3**
  (Tumeken's shadow loadout boosted by the heart that was unused before). Solo party 1: 22:10.5 → **22:01.3**, Bring
  Elder maul + Tonalztics = the brute-force optimum over all 32 sets (1321.34 s, tied by ten other sets).
- **Drain-line wording**: `specsNeeded` (Defence loop, and Eye of Ayak likewise) — when everything brought reaches the
  floor at the threshold, "needed" is the fewest that still do: AG Flying "needed ×4 (98%) · team brings ×4 (8 hits,
  98%)" (was ×3 (86%)); Xarth Tonalztics "needed ×2 (97%) · team brings ×4 (8 hits, >99.9%)" (was ×1 (66%)); Bork maul
  "needed ×3 (98%) · team brings ×4 (99.6%)", Tonalztics "needed ×3 (97%) · team brings ×4 (8 hits, 99.6%)" (was "not
  needed").
- **Greedy steps re-timed on the returned kit** (`retimeSteps`, a prefix re-time per step; negligible cost): ToB
  "Tonalztics −34.3 s, Elder maul −10.4 s, Tonalztics −3.5 s" (was −31.8 / −10.4 / −3.5).
- Search carriers table summary: "Per boss minimum at 95% (for reference): …".
- Tests: Phase30 (icons, ring dropdown placement, empty defaults, CoX pickaxe added, steps on the returned kit);
  Phase29 (AG ×4 98%, Xarth ×2 97%, Bork, never-sub-threshold sweep incl. Ayak; slow block keeps the phase 29 pinned
  list as input); Phase27 / Ownership keep the phase 29 lists as explicit inputs; Phase21 defaults; CrossRaid re-pinned.
  `yarn test` 1371 (1358 pass / 13 skipped); `RUN_SLOW_TESTS=1` CrossRaid + Phase27 + Phase28 + Phase29 87 / 87; lint,
  tsc clean.
- Playwright: new verifyPhase30 all OK (screenshots phase30-*); verifyPhase21 / 23 / 26 / 27 / 29 re-pinned and all OK;
  tracked screenshots restored.

## Phase 29 fixes 2 — ring guard, Ayak cap, drain-line wording (2026-10-24)

- **Ring guard** (blocker; `guardedFullRuns`, every camp-one run): the best two screened rings in full, g = the largest
  screen − full gap among the rings planned in full, every ring within 2 g of the best full time in full, re-checked
  after each run. "Specs I bring" {Elder maul, Tonalztics}, Solo party 1: Lightbearer 1400.17 → **Ultor 1382.50** (slow
  test). Reviewer's brute force re-run (32 subsets, guard vs every ring in full): **0.00 s miss on all 32** (was 17.7-
  27.1 s on 4).
- **Eye of Ayak carriers ≤ mages** (greedy cap; manual counts clamped with a note; more manual carriers than the party:
  only the first N count, noted, briefing capped). ToA **13:19.6 → 14:10.6** (carriers 5 Ayak + 1 maul → 1 maul, 1
  Tonalztics, 1 Ayak; Ultor; steps maul −55.1, Ayak −14.0, Tonalztics −3.5 s); FA / CoX / ToB / FA-owned unchanged.
  UNVERIFIED D22 (gains overstated by party ÷ mages: teammates are copies of you); ROADMAP round 5 item.
- **`specsNeeded` in sequence** (upstream weapon order; the first minimised with the others as brought, then the next
  given it): Xarth maul "not needed", Tonalztics "needed ×1 (66%)" (was both "not needed"); Bork maul ×3 (98%),
  Tonalztics not needed; AG Flying Tonalztics ×3 (86%).
- **Drain-line wording**: "needed ×3 (86%) · team brings ×4 (8 hits, 98%)" (P(floor from the first round); "→ Def X" /
  "→ magic def X" when the plan doesn't rank at the floor; hits only on the team's part).
- **Search / Summary follow the planner's carriers** (`withPlanCarriers`; PlanView `onCarriers`): the disabled
  Advanced counts show the last plan's carriers; before any plan the defaults with "run a plan to fill these".
- **Your share tie-break**: equal carriers → the higher "last carrier saves" (FA: Tonalztics 27.0 s over Elder maul 3.6 s).
- Greedy steps shown from the final kit when the re-run picks the same carriers (ToB −34.3 / −10.4 / −3.5 s).
- Tests: Phase29 (+ ring-guard toy, Ayak-cap toy, effectiveCarriers, tie-break, Xarth sequence, "→ Def" case, AG
  wording, withPlanCarriers; slow: {maul, Tonalztics} → Ultor 1382.50, manual 2 / 2 / 1 → ayak capped, 21:53.0);
  Phase23 regex; CrossRaid ToA 14:10.6.
  `yarn test` 1361 (1348 pass / 13 skipped); `RUN_SLOW_TESTS=1` CrossRaid + Phase27 + Phase28 + Phase29 85 / 85; lint, tsc
  clean.
- Playwright: verifyPhase29 all OK (new wording on AG Flying, share Tonalztics, counts follow the plan, notes before /
  after a plan, Solo Tonalztics 22:10.5); verifyPhase21 / 23 (ToA 14:10.6) / 26 / 27 all OK; tracked screenshots
  restored.

## Phase 29 fixes — review follow-ups (2026-10-24)

- **Blocker: the Solo subset search missed the optimum** (reviewer's brute force over all 32 sets: {Tonalztics}
  22:10.5 = 1330.53 s, not {Elder maul, Ayak} 22:42.7). Cause: the quick runs took `seeds.slice(0, 4)` of a list ranked
  under the all-weapons drain table (favours magic through Ayak) with the group bests appended at the end. Fix:
  `pickSeeds` (the n best singles + every style group's best, always) ranked under each subset's own table; a guard
  (`SUBSET_GUARD_FACTOR` 2: every subset whose quick time is within 2 × the best's quick − full gap of the best full
  time gets the full run). FA Solo party 1 now: **Bring Tonalztics, 22:10.5** (= the brute force).
- **Ring and subset together** (camp one ring): the screens time the first screen's subset; if the best ring's full run
  picks another subset, the rings are screened again with it and the new best ring is planned in full (≤ 2 rounds;
  `specs.solo.screenedWith`, `ringRounds`). FA Solo: one round (fixed point {Tonalztics}, Ultor).
- **Wording**: "dropping X from this plan: +N s (frees 1 slot)", "adding X to this plan: ±N s (1 slot)", and "best
  without X: …, time" (`bestWithout`, `bestWithoutText`). FA Solo: dropping Tonalztics +228.2 s; best without it Elder
  maul + Eye of Ayak 22:42.7; adding Elder maul +52.0, DWH +52.0, Ayak +52.6, BGS +52.9 s.
- **Team carriers are planner output** (the user's decision): `greedyCarriers` adds one carrier at a time (any weapon,
  the one that lowers the kit's route time most) while it saves ≥ 1 s, party-size cap, Ayak only with mages; the kit is
  re-optimised under them (and the greedy re-run once if the kit changed); the Team drain state uses exactly these
  carriers (`PlanInputs.carrierMode`, `DEFAULT_CARRIER_MODE` 'auto'; `plan()` default 'manual'). Advanced "Team carriers:
  Planner decides / Set manually" (counts editable and the party-size warning only when manual; Search / Summary use
  the counts). Briefing: carriers, what the last one saves, the encounters it saves on, the order added; the drain
  line's "needed ×N" = the fewest of that weapon's first-round specs giving the same ranked drain on that boss
  (`specsNeeded`; "not needed" when 0). FA 6-man: **2 Elder maul + 2 Tonalztics** (added: Tonalztics −230.0 s,
  Tonalztics −35.2, Elder maul −13.3, Elder maul −3.6; the next < 1 s); "Set manually" at 2 / 2 / 1 gives the same
  21:53.0.
- Headlines (Team, camp one ring) phase 29 → fixes: FA 21:53.0 → **21:53.0**, ToA 14:10.5 → **13:19.6** (1 maul + 5
  Ayak, Magus), CoX 6:36.3 → **6:36.3** (2 maul, 2 Tonalztics, 1 BGS, 1 Ayak), ToB 7:30.6 → **7:30.0** (2 Tonalztics, 1
  maul); FA without Obligator + Ascension crossbows 24:53.8 → **24:53.8** (2 Tonalztics). Your share: FA Elder maul
  (free slot), ToA none (5.1 s), CoX none (3.4 s), ToB Tonalztics (0.5 s).
- Nits: no team carrier table in the Search drain box at party 1; UNVERIFIED D21 (new criterion), D17.
- Tests: Phase29 (+ guard toy, seed toy, greedy toy, Smorks stall, briefing rows, specsNeeded, carriers = drain-state
  carriers on a reduced plan; slow: FA Solo party 1 → Tonalztics ≤ 22:10.5 + fixed point, FA 6-man carriers and the
  manual 21:53.0); Phase23 drain-line regex; CrossRaid headlines + recompute with the planner's carriers.
  `yarn test` 1355 (1343 pass / 12 skipped); `RUN_SLOW_TESTS=1` CrossRaid + Phase27 + Phase28 + Phase29 79 / 79; lint,
  tsc clean.
- Playwright: `verifyPhase29` all OK (carriers 2 maul + 2 Tonalztics "picked by the planner", the order added, AG
  Flying "needed ×3 (6 hits) · team brings ×4", Solo party 1 Bring Tonalztics 22:10.5 in 20.5 s, "dropping / adding …
  this plan", "best without Tonalztics: Elder maul + Eye of Ayak, 22:42.7", no carrier table at party 1); re-pinned and
  re-ran verifyPhase21 (ToB 7:30.0) / 23 (ToA 13:19.6) / 26 / 27: all OK; tracked screenshots restored.

## Phase 29 — Planner decides spec weapons (2026-10-24)

- New `specChoice.ts` (pure): `searchSpecSubsets` (Solo subset search: one candidate per distinct drain state = the
  cheapest subset, dominance pruning, quick optimiser for all, full for the best 3, per-weapon Δ and the best rejected
  weapon), `teamRoles` (team briefing: per boss / phase `recommendCarriers`' minimum, max per weapon over the planned
  route, the bosses driving it; Eye of Ayak only with mages), `assignMe` (your share: the most-needed weapon only if
  carried anyway / a free slot / its slot worth < 1 s of gear), `mySpecsForSubset` (Ayak until P(magic def 0) ≥ 95%:
  `ayakSpecsToThreshold`, `SoloSpecInput.ayakUntilZero`, `MySpecs.ayakAuto`).
- `planner.ts`: `SpecMode` (`DEFAULT_SPEC_MODE` = 'auto' in the Plan tab; `plan()` default 'manual' = "Specs I bring"),
  `PlanInputs.specMode` / `magesInParty`, `PlanResult.specs` (bring, text, solo per-weapon Δ, team briefing, share,
  notes). Solo: the subset search inside the kit optimiser per ring run (shared DPS columns per distinct drain state —
  the DPS cache key is now the monster's reductions; `SOLO_DRAIN_CACHE` by phase / subset / energy-budget bucket; ring
  screens after the first reuse its subset). Team: briefing on the matrix-fastest route, share, then the briefing on
  the final route. Spec weapons left the pinned defaults (FA / CoX / ToB Elder maul).
- Drain line: Team items read "needed ×2 (4 hits) · team brings ×4" (`neededSpecs`: specs reaching the floor if every
  one lands); Tonalztics shows its hits inline ("×2 (4 hits)"). Search header: the duplicate "Drains:" line is gone
  ("ranked at [Def icon] Def … · [Magic icon] Magic def …").
- UI: "My specs" → "Specs I bring"; "Ring: I wear a Lightbearer" toggle (locked to the Plan's ring policy while the
  Plan tab is open); Plan "Spec weapons: Planner decides / Specs I bring", "Mages in party" (Advanced (plan)), results
  box (Bring, per-weapon Δ, team briefing table, your share, Ayak hint). FA party size 1 allowed (solo = 2-scale hp);
  a party of 1 disables Team (Solo drains).
- Headlines (Team, camp one ring, planner decides) before → after: FA 22:47.9 → **21:53.0** (Tonalztics in a free
  slot), ToA 14:22.3 → **14:10.5** (no spec weapon: slot worth 6.2 s), CoX 6:40.3 → **6:36.3** (none: 3.4 s), ToB
  7:31.7 → **7:30.6** (Tonalztics: slot worth 0.5 s); FA without Obligator + Ascension crossbows 25:24.5 → **24:53.8**.
  "Specs I bring" reproduces the phase 28 FA total (22:47.9).
- Solo (FA defaults, party 1, Ultor): **22:42.7, Bring: Elder maul (saves 104.4 s), Eye of Ayak (69.2 s)**; not
  brought: DWH −7.7 s, BGS −11.1 s, Tonalztics −49.6 s; 22 drain states / 32 sets, 10 dominated, 13 timed; Jest 53 s
  (123 s before the drain cache / pruning / screen reuse), browser 19.9 s (searches cached).
- Playwright `verifyPhase29.mjs` all OK (Bring / briefing / assign me, AG Flying "needed ×2 (4 hits) · team brings ×4",
  Lightbearer toggle follows the ring policy, Search header without the duplicate line, party 1 → Solo);
  screenshots `phase29-search-header`, `-team`, `-camp-lightbearer`, `-solo`.
  Re-ran verifyPhase21 / 23 / 26 / 27 (re-pinned to the phase 29 totals; 23: "Specs I bring" toggles, Team line "needed
  … · team brings ×N", no Search-header drain line): all OK; tracked screenshots restored.
- Tests: `Phase29.test.ts` (21: toy subset search incl. finalists / signatures / dominance, Ayak threshold, team roles =
  carriers table for AG Flying (2 Tonalztics) and Bork (2 Elder maul), mages, assign-me rule, drain line texts, reduced
  plans: modes, Team share, Solo without magic never brings Ayak, magic-only kit values it, Ayak hint); Phase21 / 23 /
  Ownership updated (pinned lists, drain-line title, "Specs I bring"); CrossRaid headlines re-pinned. `yarn test` 1347
  (1337 pass / 10 skipped); `RUN_SLOW_TESTS=1` CrossRaid + Phase27 + Phase28 50 / 50 (headlines recomputed outside the
  planner equal the new totals); lint, tsc clean.
- Docs: BEST_SETUP *Spec weapons (phase 29)*, UNVERIFIED D21 (assign-me rule), D22 (mages in party), D17; ROADMAP 29 in
  review + decisions; README.

---

Older entries (rounds 1-4, phases 0-28) are archived in `docs/archive/PROGRESS-rounds-1-4.md`.
