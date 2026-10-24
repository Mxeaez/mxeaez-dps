# Best setup view (phase 8; Search tab phase 9; default tab + icons phase 12; search-based Summary phase 13; spec & drain model phase 14; Routes tab phase 16; Plan tab phase 17; raid tabs + ToA phase 18; CoX phase 19; ToB phase 20; per-raid Plan defaults + dedupe phase 21; UI cleanup phase 23; "Items I don't own" phase 26; potions from the kit + ring policy phase 27)

`/best-setup` (dev: http://localhost:3001/osrs-dps/best-setup; "Best setup" button in the top bar, "Calculator" leads
back). Tabs, in order: **Search** (the default, phase 9/12, see the end of this file) searches a pool of end-game items
per slot for setups no preset has and runs automatically; **Plan** (phase 17, see *Plan tab* below) finds the worn set
+ switch items that minimise the route time within 28 inventory slots, then shows that kit's per-encounter times and the
route comparison (phase 23: the former **Routes / Encounters** tab, see *Routes tab* below, is merged into it);
**Summary** (phase 13) shows the top search result for every boss/phase. Search and Plan take the drain state
(None / Solo / Team). The page always opens on Search (the last-used tab is deliberately not remembered).

## Layout and glossary (phase 23)

User feedback after round 2: too many inputs, unclear terms ("Fight length", "Floor at P", "Team DPS × 1 at party
size 6", the per-weapon "LB" boxes), drains as long text, an "Encounters" tab nobody understood. Phase 23 changed the
presentation only; the numbers are unchanged except the Solo fight length (below).

- **Tabs**: Search · Plan · Summary.
- **Assumptions, simple view** (≤ 10 inputs): raid scaling (party size; ToA raid / path levels; CoX Challenge Mode;
  ToB mode), the potion per style and the Heart (FA / ToB), Zeal and Elemental fragments (FA), and **Specs I bring**
  (phase 29; was "My specs") as icon toggles (Elder maul, DWH, BGS, Tonalztics, Ayak × N), and **Ring: I wear a
  Lightbearer** (phase 29: a ring toggle, not a spec weapon; the Plan tab's ring policy sets it while that tab is open). Every input has a plain-language tooltip; Reset
  and a **"?" glossary** are top right.
- **Advanced** (closed by default): team carriers per weapon (the party size above is shared) with **one "carriers use
  Lightbearer" toggle** for all carriers (`withCarrierLightbearer` in presets.ts; the per-weapon flags stay in the data);
  "Use the Defence floor when its chance is ≥ 95%" (was "Floor at P ≥"); "Players assumed at your
  DPS when converting HP to time" (was "Team DPS ×"); "Spec energy goes first to"; the raid's time-model settings (AG
  shield, Bork stun uptime, …; they were on the Routes tab and now drive the Plan tab).
- **No Fight length input.** The Solo spec-energy budget (Search, Summary, the calculator panels) uses the boss /
  phase's **undrained time to kill with the whole party at your DPS**: hp ÷ (party size × best preset DPS), the best of
  the raid's presets against the undrained monster — one untimed pass, like the time model's first pass — rounded and
  clamped to 15–600 s (90 s when no preset deals damage). `autoFightSeconds` / `fightSecondsFrom` in bestSetup.ts.
  It is per boss / phase (every row of a Search shares it), not per encounter (AG Flying and Grounded, Ocellus P1 / P3
  each get their own). Review fix: the party size, not the team-DPS multiplier — FA's ×1 had timed a 6-player fight as
  you alone and inflated the budget. `BestSetupAssumptions.fightSeconds` is optional (undefined = computed). The Plan
  tab / time model use each encounter's own undrained time with the same formula (phase 28 fix, `drainFightSecondsOf`
  in raidTime.ts: encounter time × team-DPS multiplier ÷ party size, same clamp; before, FA's ×1 gave Plan's Solo
  budget a fight 6× too long at party 6); the planner's fallback stays 90 s. The drain line shows
  the value: "(fight ≈ 34 s → 2 specs)".
  **Effect on Solo numbers** (default assumptions, 6-man FA; was 90 s everywhere = 130% = 2 specs): the computed
  fights are 15-79 s, i.e. 100-120% = 2 specs, so the defaults give the same Solo plans as before (Bork 28 s → 2 maul
  specs, Def 195, top 10.327; Xarth 34 s, top 13.917). Smaller parties get longer fights and more specs (2-man Ocellus
  P3 237 s → 170% = 3 specs). Team and None are unchanged.
- **Ayak ×0 (no energy)**: Ayak specs asked for under My specs that the energy doesn't cover stay on the Solo line,
  greyed, with the count that fits; the Ayak hint next to the input uses the fitted count ("1 of your 2 specs fit").
- **Labels**: the Solo label `team-only` reads "needs teammates' specs" (`solo+lightbearer`: "solo with Lightbearer";
  `planLabelText` in specs.ts; the `PlanLabel` values are unchanged).
- **Drain line** (`drainLine.ts` data, `DrainLineView.tsx`): `[icon] ×N` per weapon — spec attempts (Tonalztics too:
  ×4 specs, "8 hits" in the tooltip; the BGS in the Max-drain buttons as damage) — with "77% land" (the chance per spec
  to land) under each icon, then "→ Def 156 · Magic def 91". The Max-drain buttons are labelled (Elder maul / DWH /
  BGS) and their hit chances come from the undrained monster. The full plan text is the tooltip. Used
  in the Search plan panel and header, Summary cells, the Plan tab's per-phase rows, and the calculator's Max-drain
  buttons (hit chances from the same spec model, against the undrained monster).
- **Search header**: two lines (drains + best preset; evaluations · time · TTK label), the can't-hit weapons collapsed
  behind "N weapons can't hit (show)". The carrier table under the plan is collapsed.

**Glossary** (the "?" popover, `GLOSSARY` in BestSetup.tsx):

- *Drains*: None = no Defence / Magic defence drains. Solo = only your own specs ("Specs I bring"; the Plan tab's planner picks them), within the spec energy
  you have in that fight. Team = the team's spec carriers (Advanced) each spec twice at the start.
- *Floor*: the lowest Defence a boss can be drained to (e.g. Archive Guardian 156). The Defence floor is used when its
  chance is at least the % set in Advanced (95%).
- *First round*: the specs everyone does at the start of the fight with full (100%) energy: 2 specs each for 50% weapons.
- *Hit chance*: the "77% land" under each drain icon: the chance one spec lands its drain (from the calculator, against
  the undrained boss). "×0 (no energy)": specs you asked for that your spec energy doesn't cover.
- *Fight length (computed)*: the boss's time to kill without drains, using the best preset, with the whole party at
  your DPS; it sets your Solo spec energy (see above).
- *Players assumed at your DPS* (Advanced): how many players are assumed to deal your DPS when HP is turned into time. Fractured Archive: 1 (how its
  HP scales with party size is unknown, so times are you alone); ToA / CoX / ToB: the party size (their HP scales with it).
- *Carriers*: teammates who bring a drain weapon and spec it at the start (Team drains). The party size is shared;
  carriers beyond it don't count.

**Phase 13: "Per boss" removed.** The phase 8 preset ranking tab is gone (UI code, the calc-worker `BEST_SETUP`
request and its handler deleted). The presets stay: they seed the search and give the "vs best preset" column / the
Summary's "best preset" reference; `computeBestSetup` / `evaluatePreset` stay as tested library code
(`Presets.test.ts`).

## Items I don't own (phase 26)

Everything assumes max gear. The **Items I don't own** row of the Assumptions box (simple view, every raid tab: the
list is global) crosses items off: chips with ×, an equipment search box (the calculator's item search), quick-add
buttons for the Fractured Archive rewards (Obligator, Ascension crossbows, Zorya's tome, Rondache) and *Clear*. Kept in
this browser's localStorage under `mxeaez-dps:not-owned` (a JSON array of `equipment.json` names; the "Only items I
own" flag under `mxeaez-dps:only-owned`); blocked storage just means it isn't remembered. Code:
`src/lib/fracturedArchive/ownership.ts` (pure), `src/app/components/bestSetup/NotOwnedBox.tsx`.

- **Matching** (`unownedBase`): an item is unowned when its name *is* a listed name (every version: Charged /
  Uncharged / Restored share the name), *starts with* "listed name (" (upgrades / ornaments: "Avernic treads" covers
  "Avernic treads (max)", "Necklace of anguish" covers "(or)"; not the other way round), or is in the same upstream
  alias group (`src/lib/EquipmentAliases.ts`: locked / broken / cosmetic variants, e.g. Holy / Sanguine Scythe of
  Vitur; symmetric).
- **Search / Summary**: still search the full pool (the true best) and grey every row / cell whose loadout uses a listed
  item, with a red "uses: Obligator" badge. Changing the list alone doesn't re-run anything. **Only items I own**
  (checkbox in the Search and Summary headers, one shared setting, default off) searches `filterPool(pool)` instead:
  weapons (and ammo options / blowpipe dart), slot candidates and sets with an unowned piece leave the pool; presets
  still seed the search with their unowned pieces left out. *vs best preset* always uses every preset. Searches with a
  list have their own cache key (`searchCacheKey(q, a, notOwned)`).
- **Plan** always honours the list (`PlanInputs.notOwned`): the per-phase searches use the filtered pool, presets that
  use a listed item are dropped, and listed pinned items are dropped (struck through in "Items I always bring", plus a
  notice). A listed spec weapon that "My specs" still brings gets a notice only (the drain model follows My specs: untick
  it there). Above the result: **Excluded: Obligator, Ascension crossbows** and **Best possible with everything: 22:47.9
  (yours: …)** (phase 27; 23:30.4 before): the max total comes from the session cache of a plan run with an empty list and the same inputs, or a
  *compare with max* button runs that plan (a second run, about as long, so it's on demand).

## Raid tabs and Tombs of Amascut (phase 18)

**Raid tabs** at the top of `/best-setup`: *Fractured Archive* (default), *Tombs of Amascut*, *Chambers of Xeric*
(phase 19) and *Theatre of Blood* (phase 20). Each raid keeps its own assumptions while you switch; the tabs (Search, Plan,
Summary; a Routes / Encounters tab until phase 23) are the same code driven by a **`RaidConfig`** (`src/lib/raids/index.ts`). Shared code has no raid branches:
the pure modules read the per-raid rules from **`RaidBase`** (`src/lib/raids/base.ts`: targets, party-size range,
monster inputs, scaling inputs with their own get / set, default assumptions, presets, pool, `hpScalesWithParty`,
`boostsNeedSupplies`) by `assumptions.raid` / `target.raid`; `RaidConfig` adds the time model and its own settings
object + settings-box fields (`timeSettingFields`, `timeModelNote`), default supplies, Plan note and UI labels.

| Field | Fractured Archive | Tombs of Amascut |
|---|---|---|
| `targets` (boss / phase list) | `BEST_SETUP_TARGETS` (bestSetup.ts) | `TOA_TARGETS` (`src/lib/raids/toa/targets.ts`): Kephri Shielded / Unshielded, Spitting / Soldier / Arcane Scarab, Zebak, Akkha (prayer phases), Akkha's Shadow, Ba-Ba, Obelisk, Elidinis' / Tumeken's Warden P2 (prayer phases), Warden core, Tumeken's Warden P3 / P3 enraged |
| `scalingInputs` | party size 2-8 (Team row, as before) | "Raid scaling" row: party size 1-8, raid level (default **500**), path level per path (Het, Apmeken, Scabaras, Crondis; default 0) |
| `defaultAssumptions` | `DEFAULT_ASSUMPTIONS` | `TOA_DEFAULT_ASSUMPTIONS`: Smelling salts for all styles, Piety / Rigour / Augury, no Zeal / fragments (hidden), same spec carriers |
| `presets` | `PRESETS` | FA list + Osmumten's fang, Keris partisan of breaching, Ghrazi rapier (Torva + Avernic defender) |
| `searchPool` | `SEARCH_POOL` | FA pool + Keris partisan of breaching, Keris partisan of amascut, Blade of Saeldor (c), Eye of Ayak |
| `time` (encounter model) | `FA_TIME_MODEL` (raidTime.ts): 8 routes | `TOA_TIME_MODEL` (`src/lib/raids/toa/time.ts`): one fixed route |
| team-DPS multiplier default | 1 (identity hp table) | party size (hp scales with party) |
| route table (Plan results since phase 23) | 8 routes | the single route |

The raid is `assumptions.raid` (undefined = Fractured Archive), so every cache key, the worker requests and the
pure modules pick the raid from the assumptions: `findTarget` searches every raid's targets (ToA keys start with
`toa-`), `buildTargetMonster` sets the calculator's ToA inputs (`toaInvocationLevel`, `toaPathLevel` of the target's
path, the raid's party-size range), the search and planner default to the raid's presets / pool (`raidBase`), and the
worker hands Routes / Plan the raid's time model.

**Team-DPS multiplier** (Advanced: "Players assumed at your DPS when converting HP to time", "Team DPS ×" before
phase 23; `teamDpsMultiplier` in base.ts): every time shown — Search TTK, the Plan's route table and headline — assumes this many players dealing your DPS, and says so
("times assume 6 players at your DPS" / "your DPS alone"). Default: the party size where boss hp scales with it (ToA),
1 for the Fractured Archive (identity hp table, so its numbers are unchanged); "auto" resets an override. Ocellus P2
stays its wall-clock length (the damage dealt in it scales). The Summary shows the scaled hp of each row and the raid
inputs in its header. Fractured Archive behaviour is unchanged (all phase 8-17 tests pass
as they were).

**Tombs of Amascut — what comes from upstream** (not re-modelled): hp scaling by raid level (+4% per 10 levels; the
core +1%), path level (+8% at level 1, +5% per further level; path bosses and their adds) and party size (+90% for the
2nd-3rd member, +60% for each further one), rounded like the game (`src/lib/scaling/TombsOfAmascut.ts`, checked
against in-game hp by upstream's `TombsOfAmascut.test.ts`), so the times are real for that team; NPC defence roll ×
(250 + raid level) / 250; Defence floors (`getDefenceFloor`: Akkha 70, Ba-Ba 60, Kephri 60, Zebak 50, Obelisk 60, P3
Warden 120; P2 Warden and the core: none); weaknesses (Kephri fire 40 / 35, Akkha's Shadow air 60, Wardens earth 50);
Tumeken's shadow ×4 in ToA; Osmumten's fang's double accuracy roll in ToA; keris bonuses on kalphites (Kephri,
scarabs; breaching +33% accuracy); Keris partisan of the sun below 25% hp; the P2 Warden's 100% accuracy with damage
scaled by accuracy (and the double Twisted bow scaling there); melee always max hits on the core.

**What phase 18 adds** (`src/lib/raids/toa/*`, tests in `src/tests/lib/raids/ToA.test.ts`):

- **Prayers** (`prayers.ts`, hooked into `isImmune` + a calculator warning): Akkha phase options *Not praying against
  your style* (default, = upstream), *Praying Melee / Ranged / Magic*, *Final stand (Protect from Magic + Missiles)*;
  P2 Warden (Active) options *Not praying* (default, = upstream), *Praying Melee + Ranged* (Elidinis' initial),
  *Praying Melee + Magic* (Tumeken's initial). The best-setup P2 targets default to each warden's initial prayers.
- **Encounter model** (`time.ts`): time = damage ÷ (team-DPS multiplier × your DPS):
  - Kephri: 3 × shield hp (+ *swarm leak* × shield per intermission, default 0) + Spitting / Soldier / Arcane Scarab
    (setting, default on) + the unshielded hp.
  - Zebak, Ba-Ba: their hp.
  - Akkha: he switches style (and prayer) after "six auto-attacks followed by a special attack", i.e. on time, so with
    *Akkha prayer rotation* (default on) he spends **equal time** under *Praying Melee / Ranged / Magic*; his hp is
    dealt in proportion to the kit's best DPS under each (a prayer that blocks the kit's only style still costs its
    time); off = always an unprotected style. + 4 × Akkha's Shadow + 20% of his hp in the final stand (melee only, so
    a kit without melee shows ∞ — you can't finish Akkha without it).
  - Wardens: P1 obelisk hp; P2 downs: each = the Active warden's hp (the shield) at the warden's prayers, then the
    core for 21 / 29 / 37 ticks (Warden ≥ 80% / ≥ 60% / below) at core DPS × 5 Warden hp, until the Warden's hp (the
    Core-ejected entry's 4500-based hp) is gone; P3 95% of hp + 25% enraged (5% left + 20% heal, Defence 180, floor
    120); *P3 siphons* share (default 0). *P2 warden* setting: Elidinis' (default; magic only) or Tumeken's (ranged
    only); P3 uses Tumeken's entries (identical stats).
- **Plan tab**: the same planner; every style keeps the salts boost while the "Other" supply count is > 0 (phase 21
  supplies: 6 restore + 2 Other, see *Per-raid defaults* below; phase 18 had 8 "Other" slots). With 0 Other no style is
  boosted (a pinned heart still boosts magic; heart fix).
- Not modelled: invulnerable time (Akkha's memory blast, Ba-Ba's rolling stones, Zebak's specials, siphon phases),
  paths and puzzles, the phantoms in P3, Kephri's healing (soldier scarab swarms), boulders / swarms / eggs (max hits),
  the warden switching prayers between downs, specs during the core (dragon dagger + liquid adrenaline).

**Headline (raid level 500, 6-man, path 0, Team drains, 2026-10-23)** — top search result per boss: Kephri (Shielded
and Unshielded) Keris partisan of breaching 9.520; Zebak Ascension crossbows + diamond (e) 10.633 (Shadow 10.055);
Akkha Tumeken's shadow 13.020, final stand Osmumten's fang 9.035; Akkha's Shadow Ascension crossbows + onyx (e)
15.262; Ba-Ba Ascension crossbows + diamond (e) 9.441; Obelisk Shadow 13.002; P2 Warden (Elidinis', praying melee +
ranged) Shadow 14.167; core Scythe of Vitur 31.333 (always max hits); P3 Shadow 12.493. Encounters with the best search
result per style: 14:02.4 (Kephri 145.5, Zebak 125.4, Akkha 137.5, Ba-Ba 92.5, Wardens 341.5 s; team of 6 at your
DPS). **Plan** (defaults: pinned items, 8 supply slots): worn Keris partisan of breaching (Torva), switches Tumeken's
shadow (Ancestral), Osmumten's fang, Scythe and Obligator (Torva), 1 free slot, **14:20.0**. Search TTK on Zebak:
125.6 s (6 players; 753.5 s alone).

## Chambers of Xeric (phase 19)

Third raid tab, same code (`CHAMBERS_OF_XERIC_RAID`, `src/lib/raids/chambersOfXeric.ts`; `src/lib/raids/cox/*`).

- **Inputs** ("Raid scaling" row): party size **1-15** (CoX allows 1-100; the times assume every member deals your
  DPS, which means nothing for mass raids) and a **Challenge Mode** checkbox (scaling inputs can now be `kind: 'bool'`).
  The calculator's CoX inputs are set per target: `isFromCoxCm`, best player 126 combat / 99 hp, party Mining 99 ×
  size. Search shows the scaled hp **and Defence** next to the boss (`target-def`).
- **Scaling** is upstream's (hp and Defence scale with party size; CM +50%, Olm hp unchanged, Tekton Defence +20/35%);
  see DATA_SOURCES *Chambers of Xeric*. No Defence floors.
- **Targets** (18): Tekton, Tekton (enraged), Vasa Nistirio, Glowing crystal, Vanguard melee / ranged / magic (drains
  never apply: `noDrains`), Vespula, Abyssal portal, Muttadile small / large, Skeletal Mystic, Lizardman shaman,
  Guardian, Ice demon, Great Olm left claw / right claw / head.
- **Defaults**: Overload (+) for every style (raid boost, `boostsNeedSupplies: false`), Piety / Rigour / Augury, Team
  carriers = FA's + 1 BGS, team-DPS multiplier = party size.
- **Presets** = FA list + Dragon hunter lance (Torva), Dragon pickaxe (Torva, Smash), Dragon hunter crossbow + ruby (e)
  (Masori). The Great Olm *is* a dragon in the data / wiki, so the dragonbane bonuses apply. **Pool** = FA pool + DHL,
  Dragon / Crystal pickaxe, DHCB (ruby / diamond (e)), Dragon hunter wand, Salve amulet(ei) (kept) in every neck slot.
- **New damage rule**: Olm head and right claw take ÷3 from melee (wiki "66% damage mitigation"; upstream only divides
  magic / ranged) — `cox/damage.ts`.
- **Encounters** (one route; `cox/time.ts`): rooms are checkboxes (default all = an upper bound; unticked rooms show
  "—"), the Great Olm always. Tekton 80% + 20% enraged (+ anvil heal, default 0); Vasa 1 crystal (setting) + hp;
  Vanguards 3 × hp, no drains; Vespula 80% then the portal (or portal only); Mystics / shamans count by party size;
  Muttadiles small + large (+ meat-tree heal, default 0); Guardians 2 × hp (pickaxe only, ∞ without one); Ice demon hp;
  Olm 3 (+1 per 8 players) hand phases × (right claw + left claw), then the head.
- **Plan**: supplies default to 8 "Other" (raid-made potions); note to bring a pickaxe for Guardians.

**Headline (normal, 6-man, Team drains, every room, 2026-10-23)** — top search result per target: Tekton Obligator
14.416 (enraged 12.446); Vasa Obligator 15.845; Glowing crystal Scythe 14.545; Vanguards melee Tumeken's shadow 11.479,
ranged Scythe 10.757, magic Ascension crossbows + diamond (e) 11.591; Vespula Ascension + onyx (e) 15.331; portal
Ascension + diamond (e) 13.297; Muttadile small Ascension + onyx (e) 15.535, large Twisted bow 16.402; Mystic Ascension
+ diamond (e) 17.880; shaman Ascension + onyx (e) 15.626; Guardian Dragon pickaxe 9.410; Ice demon Harmonised staff +
Fire Surge 16.186; Olm left claw Scythe 14.994, right claw Shadow 12.087, head Twisted bow 16.324. Encounters with the
best search result per style: **6:25.6** (Olm 185.5 s). **Plan** (20.8 s): worn Inquisitor's + Scythe (slash), switches
Tumeken's shadow (Ancestral), Dragon pickaxe, Kodai + best Surge (Ice demon), Ascension crossbows (weapon-only switch
on the Shadow set, Salve (ei)); 0 free slots; **6:59.9**. Same kit in **Challenge Mode** (6-man): **9:12.5** (Olm 199.2
s vs 197.5 s — Olm keeps its hp).

## Theatre of Blood (phase 20)

Fourth raid tab, same code (`THEATRE_OF_BLOOD_RAID`, `src/lib/raids/theatreOfBlood.ts`; `src/lib/raids/tob/*`).

- **Inputs** ("Raid scaling" row): party size **1-5** (default **4**: the Strategies page describes the roles "as they
  appear in a 4-Scale"; the shared default 6 is out of range) and a **mode** select — Normal / Hard Mode / Entry Mode
  (scaling inputs can now be `kind: 'select'` with `options`). Each mode is its own set of monsters in monsters.json,
  so the mode swaps the target's monster version (`RaidBase.resolveTarget`, used by `buildTargetMonster`; the table is
  `TOB_VERSIONS` in `tob/targets.ts`). No calculator input changes.
- **Scaling** is upstream's and hp only: normal / Hard Mode 75% at 1-3 players, 87.5% at 4, 100% at 5; Entry Mode
  25 / 47.5 / 67.5 / 85 / 100% (see DATA_SOURCES *Theatre of Blood*). Upstream missed the Nylocas Vasilias / melee
  Prinkipas ids monsters.json uses (8354, 10807, 10786, 10803): added to `TOB_MONSTER_IDS` / `TOB_EM_MONSTER_IDS`.
- **Targets** (20): Maiden; Bloat + "Bloat (after a stomp: Defence restored)" (`noDrains`); Nylocas Vasilias melee /
  ranged / magic form (one phase each); wave nylocas Ischyros / Toxobolos / Hagios small + big and Hard Mode's
  Prinkipas melee / ranged / magic (not in the Summary); Sotetseg; Xarpus; Verzik P1 / P2 / P3 (`noDrains`: "absorbs
  the defence reduction"). The Maiden's 70 / 50 / 30% versions have her normal stats (and no image): encounter phases.
- **Damage rules**: upstream has Verzik P1's cap (melee 10 / otherwise 3, modelled as min(hit, uniform 0..cap)), the
  Dawnbringer's exemption, guaranteed hit and halved max hit, and the floors (Sotetseg 100, Verzik = her Defence).
  New in `tob/damage.ts`: **nylocas style gating** (Vasilias by its form phase "Melee / Ranged / Magic form", default
  melee; wave nylocas by name; Prinkipas by version; Verzik's nylocas not gated) and **Dawnbringer only on Verzik P1**
  — and not under P1's new phase "Shield (Dawnbringer with a teammate)" (one staff per raid).
- **Defaults**: Super combat / Ranging / Saturated heart (no raid boost; potions are supplies, the heart a pinned item), Piety / Rigour / Augury,
  Team carriers **2 Elder maul + 2 BGS** (Strategies 4-scale Maiden plan), team-DPS multiplier = party size.
- **Presets** = FA list + "Torva + Salve (ei) + Scythe (slash)" (Bloat is undead) and "Dawnbringer (Ancestral)".
  **Pool** = FA pool + Blade of Saeldor (c), Abyssal tentacle, Eye of Ayak, Dawnbringer, Salve amulet(ei) (kept) in
  every neck slot.
- **Encounters** (one fixed route; `tob/time.ts`): Maiden 30 / 20 / 20 / 30% (+ leaked-nylo heal per spawn, default
  0); Bloat: the first down (18 s, setting) at the drained target, the rest at the restored one; Nylocas: (Hard Mode: 3
  Prinkipas, then) the Vasilias in **equal time per form** (like Akkha; setting), the waves aren't counted (fixed spawn
  schedule); Sotetseg in thirds (Defence restored after each maze: each third drained again); Xarpus P2 75% → 25% (+
  exhumed heals, default 0; Entry 22.5%), P3 25% (same stats); Verzik P1 = Dawnbringer specs (2 per player × 112.5,
  each costs one 4-tick attack: specs × 2.4 s ÷ team) + the rest at **1 player × the kit's best + (team − 1) × the
  kit's best without the Dawnbringer**, P2 (+ heals, default 0), P3 (+ heals; Hard Mode always +30%).
- **Plan**: supplies brew 4 / restore 3 / 1 ranging / 1 super combat + a pinned Saturated heart (lower than a no-resupply raid: the chests after Bloat and
  Sotetseg sell brews and restores — documented, not modelled); phase 21: the Dawnbringer costs 0 slots (*Plan tab →
  Per-raid defaults*).

**Headline (normal, 4-man, Team drains, 2026-10-23)** — top search result per target: Maiden Ascension crossbows +
onyx (e) 14.792; Bloat Scythe 16.383; Vasilias melee form Scythe 14.592, ranged form Ascension crossbows + diamond (e)
13.887, magic form Tumeken's shadow 11.426; Sotetseg Scythe 11.875; Xarpus Scythe 14.566; Verzik P1 **Dawnbringer**
4.809 (Scythe 4.01: the cap), P2 Scythe 9.933, P3 Scythe 11.813. Encounters with the best search result per style:
**7:27.7** (Verzik 197.1 s). **Plan** (16.3 s): worn Torva + Scythe (slash); switches Torva helm + Oathplate + Scythe,
search-found Scythe sets for Bloat (×2) and Verzik P2, Eye of Ayak and Ascension crossbows partial switches; **7:35.5**. Same kit in **Hard
Mode** (4-man): **8:33.5** (Bloat 33.6, Nylocas 67.2 with the Prinkipas, Xarpus 67.5, Verzik 219.1 s).

## Plan tab (phase 17: raid kit planner)

Code: `src/lib/fracturedArchive/planner.ts` (pure, tested in `src/tests/lib/fracturedArchive/Planner.test.ts`); UI
`src/app/components/bestSetup/PlanView.tsx`; runs in the search worker (`WorkerRequestType.RAID_PLAN`, `plan()`),
progress bar + **Cancel** (terminates the worker). Runs on opening the tab and again 500 ms after any input change;
"Run again" re-runs. The per-phase search rows are cached in memory for the session (per assumptions + drain + phase),
so a change of supplies / items / route skips the searches.

**Inputs.** From the boxes above the tabs: party size (default 6), drain state (default Team), spec weapons (phase 29:
picked by the planner by default — *Spec weapons (phase 29)* below; or "Specs I bring": Elder maul, DWH, BGS,
Tonalztics when ticked, Eye of Ayak when its count > 0 — each takes a slot). In the tab's
"Assumptions (plan)" box: **Route** — one of the 8, or *Compare all* (default: plan for the fastest route; the route
table then shows the other routes' times with the same kit); **Comfort supplies (your call)** as slot counts — brew,
restore, food, other (phase 27; Fractured Archive default Saradomin brew 6, Super restore 4; phase 21: each raid has its
own, see *Per-raid defaults*); the combat potions are **not inputs** any more, the planner derives them from the kit
(*Potions from the kit and ring policy*, below); no magic potion — see *Heart* below; **Rune pouch /
other non-items** (default 1); **Rings** (one-line summary; the policy is under "Advanced (plan)", default *Camp one
ring*);
**Items I always bring** (default Lightbearer, Elder maul, Zaryte crossbow, Kodai wand, Ancestral robe top, Elidinis'
ward (f), Saturated heart; editable with the calculator's item search; each takes a slot unless a kit loadout wears it, and any loadout
may use them for free). Time-model settings come from the Advanced box (phase 23; defaults `raid.defaultTimeSettings`;
FA: `RAID_TIME_DEFAULTS`). Phase 22: `plan()` and `computeRouteComparison()` throw if the time model passed isn't the
assumptions' raid's (`assertTimeModelForRaid`), since both default to the Fractured Archive's.

**Supplies → DPS** (review fix; phase 27): Super combat carries the melee boost, Ranging potion the ranged one
(`KIT_POTIONS`). Since phase 27 the kit always brings the potion of each style it has, so melee / ranged are always
boosted and the potion's slot is part of the kit's slot cost; before, a style whose supply count was 0 was evaluated
**without a potion** (`BestSetupAssumptions.withoutPotion`, still used for magic without a heart and for ToA / CoX
without the raid potion; `planAssumptions(assumptions, supplies, pinned)`, honoured by `applyLoadoutToPlayer`); the
Assumptions box's potion is the one used. The searches, matrix, exact times
and "Load into calculator" all use it; the drain / spec model keeps the potions (team carriers bring their own).

**Heart** (fix 2026-10-23, user: "Nobody uses magic potions, they use Saturated heart instead"): the magic boost is a
reusable item, one inventory slot for the whole raid, so it is a **pinned item**, not a supply (the old "Magic boost"
supply count is gone). Hearts are pseudo items (`HEART_ITEMS` in `planner.ts`: Saturated heart −9001, Imbued heart
−9002 — not equipment) that live in the pinned list: one slot each, counted once, never worn; `planItemByName` resolves
their names. Rules:
- **FA, ToB** (`boostsNeedSupplies`): magic is boosted **iff a heart is pinned**, with that heart's boost. The default
  pinned lists include the Saturated heart. The Assumptions box's magic selector reads **Heart** (Saturated / Imbued
  heart) there; the Plan's pinned heart follows it (changing it swaps the pinned heart; removing the heart in the Plan
  turns the magic boost off and offers "+ Saturated heart" / "+ Imbued heart"). **Search, Summary and Routes always
  assume the heart is brought**; the Plan with the heart pinned gives the same DPS.
- **ToA, CoX** (raid potions: Smelling salts / Overload boost every style): every style keeps the raid potion iff the
  "Other" supply count is > 0 (the default); with 0 Other no style is boosted, except magic when a heart is pinned. The
  heart isn't pinned by default there.
- Warnings: the heart is never a kit potion; it shows under "Always brought but in no kit loadout" when the kit has
  no magic loadout.

**Algorithm** (`plan(inputs, tuning?, hooks?)`; `PLAN_DEFAULTS` holds the caps):

1. *Phase targets*: the (target, phase) pairs the time model queries for the route(s) (16 for compare-all; recorded by
   running `compareRoutes` with a recording kit). One all-style gear search per phase (`runGearSearch`, top 80 rows),
   keeping per style group the best `perGroupWeapons` = 3 weapons and up to `perWeapon` = 2 distinct loadouts each.
2. *Candidates*: those rows + every preset, merged when items and style group are equal (style options are unioned).
   *Partial switches*: for each base A (the best `bases` = 2 per style by Σ DPS ÷ best DPS over the phases) and partner
   B of another style (the best `partners` = 2 per style, plus the best loadout of every carried weapon, e.g. Kodai):
   A with B's weapon (+ B's ammo; B's shield, or none if two-handed; A's shield otherwise) and B's k best other pieces,
   k = 0..all, pieces ranked by the DPS each adds on B's best phase (where B is closest to the best candidate), carried
   pieces first (they're free). Cap `maxCandidates` = 600 (cheapest switches kept first); the default plan has 243
   candidates (12 presets, 45 search rows, 186 partial switches), so the cap doesn't bite.
3. *DPS matrix*: every candidate × phase target under the drain state, evaluated once (best style option; can't hit or
   an error → 0). Drains are planned at a fixed fight length (`RaidTimeAssumptions.fixedFightSeconds`, added to
   raidTime.ts; a number or one per encounter). Team / None: 90 s — exact, the Team plan uses the carriers' first round,
   which doesn't depend on the length. **Solo** (review fix): each encounter's undrained time with the best single
   preset / search loadout (one extra undrained pass over those, ~900 evaluations), so the Solo energy budget matches
   the fight (Bork + Smorks 281 s instead of 90 s; matrix DPS within 1% of the exact times, tested).
4. *Slot cost*: inventory = |items of all kit loadouts ∪ pinned ∪ spec weapons| − fewest items of any kit loadout (the
   most the bag ever holds: while wearing the smallest loadout; the difference to the worn set is shown as "swap
   space") + comfort supplies + the kit's potions (phase 27: one per style present, `KitProblem.potions`) + non-items;
   must be ≤ 28. Shared items count once. The cost doesn't depend on which loadout is
   worn, so the **worn set is the loadout used on the route's first phase** (the AG shield; saves a switch).
5. *Optimiser* (`optimiseKit`): seeds = the 20 best single loadouts by their own route time (+ the best of each style);
   from each, two greedy passes (add the loadout with the best Δtime ÷ Δslots; add the one with the best Δtime) while
   one fits and helps, then local search (drop a loadout that doesn't help; swap one for any candidate) until stable.
   Phase 21: then the **dedupe rule** (below) prunes each result. Best kit: lowest time, then fewest slots, then fewest
   loadouts. Deterministic. The best 5 distinct kits are then
   re-timed with `createKitEvaluator` + `compareRoutes` (the Routes tab's code, drains planned with each kit's own
   encounter lengths) and the fastest of those wins; those times are what the tab shows.
6. *Why*: every candidate that would make the route faster if added (none fits, otherwise the optimiser would have
   added it), top 3 by Δtime with their Δslots; and the best kit of every other style mix (optimised over that mix's
   candidates only; a style the optimiser left out is forced in with its best addition).

**Output.** Free-slot badge; worn set (laid out like the calculator's equipment grid); 4×7 inventory (supplies, switch
items grouped by style with a coloured border — melee red, ranged green, magic blue —, spec weapons, pinned items, rune
pouch / other, swap space, free; icons + tooltips; brews / restores / food get a generic potion icon, Ranging / Super
combat / Saturated heart upstream's images; a note on where the spec weapons come from: the planner or "Specs I bring"); kit loadouts with icon
rows and where each came from; "Potions (from the kit)" and "Ring" lines (phase 27; the old "unused potion supplies"
warning is gone: the kit never brings a potion it doesn't use); a warning with a one-click fix for always-brought items
no loadout wears ("Remove these to free N slots"), which re-plans; the
per-encounter table (loadouts and styles used, "avg DPS (time-weighted)" = damage ÷ seconds, seconds; phase rows with
each phase's DPS); the route table; the why list; run statistics. "Load worn set into calculator" opens the calculator with the worn set against the route's first phase
(drains as planned; its DPS = the first phase row, checked by `scripts/verifyPhase17.mjs`); "Load all loadouts" adds
one calculator loadout per kit loadout (or replaces the calculator's loadouts if they don't all fit in 6).

**Timings** (default pool and inputs, Team): browser (headless Chromium, dev server) 16.1 s for the first run
(16 searches ~10 s, matrix ~4 s, optimiser < 1 s); a supplies / items / route change ~5 s (cached searches; the matrix
is rebuilt). Solo adds the undrained pass (~1 s). Jest without coverage: ~25 s. Within the 30 s target, so the caps
stayed at their defaults.

**Limits.** Switching is free and instant; supplies are never drunk down; every item is one slot (UNVERIFIED D10–D12).
Only the candidate pool above is searched (greedy + local search, not exhaustive; exhaustive on the toy cases in the
tests). The kit's DPS per phase is the best of its loadouts, so per-phase cherry-picking is limited to the kit.

**Headline, heart fix** (defaults incl. the pinned Saturated heart, 6-man, Team drains, compare all;
`scripts/verifyHeartFix.mjs`, 2026-10-23): worn **Tumeken's shadow switch +6 on Inquisitor's + Obligator** (Shadow,
Ancestral robe top / bottom, Confliction gauntlets, Occult, Magus ring, Imbued Guthix cape over the Inquisitor's base),
switch **Inquisitor's + Obligator** (+7 slots, saves 732.5 s); **0 free slots**; fastest route **AG → Bork + Smorks →
Moia → Xarth → Ocellus, 23:30.4**. The heart's slot costs more than the boost gains on this route (23:18.8 before, with
no heart and unboosted magic); the plan's Shadow on AG (flying) 8.374 DPS = the calculator after "Load worn set" (Magic
99 → 112). Removing the heart: the AG magic phase drops to the Ascension crossbows switch. ToB unchanged at **7:32.2**,
28/28 (the heart was already a 1-slot supply there).

**Headline, phase 17** (defaults: 6-man, Team drains, the pinned items and supplies above — no magic boost —, compare all;
2026-10-23 after the review fixes, `scripts/verifyPhase17.mjs`): worn a **partial switch: Ascension crossbows +
diamond bolts (e) with Masori body / chaps (f), Dizana's quiver, Necklace of anguish, Zaryte vambraces over the
Inquisitor's + Obligator base** (Inquisitor's great helm, Avernic treads, Ultor ring stay); switch **Inquisitor's +
Obligator** (7 bag items: Obligator, hauberk, plateskirt, Infernal cape, Amulet of rancour, Ferocious gloves, Rada's
blessing); **0 free slots**; fastest route **AG → Bork + Smorks → Moia → Xarth → Ocellus, 23:18.8** (AG 191.0 s, Bork +
Smorks 196.5, Moia 86.8, Xarth 186.8, Ocellus 737.6). Rejected: adding Twisted bow (Masori) −79.0 s but +4 slots;
the full Ascension crossbows (Masori) −39.7 s, +2 slots; Tumeken's shadow + Inquisitor's + Obligator +56.9 s (no magic
boost). Five always-brought items are in no loadout (Lightbearer, Zaryte crossbow, Kodai wand, Ancestral robe top,
Elidinis' ward (f)); removing them (one click) gives Ascension crossbows worn + Inquisitor's + Obligator + Twisted bow,
**21:50.1** with 1 free slot. Brews 6 → 10: 25:45.9. Solo drains: 24:29.3 (Bork + Smorks 210.1 s, = the exact time).

### Per-raid defaults, raid items and the dedupe rule (phase 21)

**Defaults per raid** (`RaidBase.planDefaults`, `src/lib/raids/planDefaults.ts`; the Plan inputs load them when the
raid tab opens, "reset" restores the pinned list). Spec weapons come from the planner (phase 29; Elder maul left the FA / CoX / ToB
pinned lists) or "Specs I bring", and are counted once with the pinned items. Every raid has 1 non-item slot (the rune pouch: every Strategies
example inventory has one).

| Raid | Items always brought | Supplies (slots) | Raid items (0 slots) | Source |
|---|---|---|---|---|
| Fractured Archive | Lightbearer, Elder maul, Zaryte crossbow, Kodai wand, Ancestral robe top, Elidinis' ward (f), Saturated heart | 6 brew, 4 restore (+ the kit's potions, phase 27; was 2 ranging, 1 super combat) | — | the user's kit (2026-10-23) |
| Tombs of Amascut | Lightbearer, Zaryte crossbow | 6 restore (Sanfew serums, later Tears / Nectar), 2 Other (Smelling salts) | — | Tombs_of_Amascut/Strategies max-gear inventory: Zaryte crossbow, Lightbearer, 6 Sanfew serums, 1 divine super combat, rune pouch; "Players can no longer eat food" at high invocations; salts / nectar / tears from the Helpful Spirit "once after completing two paths, and once again …" (Tombs of Amascut). The boost is always the salts, so no combat potions |
| Chambers of Xeric | Dragon pickaxe, Elder maul | 2 brew (Xeric's aid), 2 restore (Prayer enhance / Revitalisation), 1 Other (Overload) | — | Chambers_of_Xeric/Strategies: "If guardians are in the raid, bring the best pickaxe possible"; specials "Bandos godsword + Elder maul > Dragon warhammer" (the first maul / DWH spec on Tekton always hits); the potions are made in the raid and dropped by Tekton, Vasa, Vanguards, Vespula, Muttadiles. Olm wants more ("6-7 brews, 2-3 restores"): raise them for an Olm-heavy plan |
| Theatre of Blood | Elder maul, Saturated heart | 4 brew, 3 restore (+ the kit's potions, phase 27; was 1 ranging, 1 super combat) | **Dawnbringer** | Theatre_of_Blood/Strategies max-gear inventories (Elder maul + BGS + claws, rune pouch, 1 brew + 1 restore + combat potions + food); the chests after Bloat and Sotetseg sell brews / restores, hence fewer than a raid without resupply. Lightbearer isn't in those inventories |

**ToB supply chests** (documented, not modelled): "When the Pestilent Bloat and Sotetseg are killed, players will gain
access to a chest with supplies ... containing food and potions" (Saradomin brews, Super restores, staminas; Strategies).
The plan uses one inventory for the whole raid, so it can't swap brews in at a chest; the lower ToB default (4 / 3 vs
FA's 6 / 4) stands for "top up at the chests". Raise it if you don't.

**Raid-supplied items** (`planDefaults.raidSupplied`; ToB: the Dawnbringer, CoX / ToA / FA: none) cost **0 inventory
slots** and may go on any loadout. In the slot accounting they are left out of the carried-item union but still count
in a loadout's size, so a loadout wearing the Dawnbringer in place of the main weapon needs no swap space (it takes the
weapon's place; `kitSlotUsage` / `optimiseKit` / `inventoryGrid`, which shows no cell for it). The planner adds the
raid weapon as a partial-switch partner (like a carried weapon) and, weapon only, on **every** full candidate of another
style ("Dawnbringer switch on <loadout>"), so it is free whichever loadout ends up worn. Before phase 21 the only
Dawnbringer loadouts were "Dawnbringer (Ancestral)" and search rows, priced at +6 slots, so the kit skipped them.

**Single-piece swaps** (new candidates): for each base loadout, the same loadout with one piece of another full loadout
of the **same weapon** (e.g. "Torva helm + Oathplate + Scythe (slash) + Salve amulet(ei)", the Salve taken from "Torva +
Salve (ei) + Scythe (slash)"). Without them the only way to get the Salve at Bloat was a whole second Scythe set.

**Dedupe rule** (`SWITCH_MIN_SAVING_SECONDS` = 1, `SWITCH_MIN_SECONDS_PER_SLOT` = 1 in planner.ts; the optimiser's
prune step after every greedy + local search, matrix times; skipped for a kit that can't clear the route): a kit
loadout stays only if removing it costs ≥ max(1 s, 1 s × the slots it frees). So a switch that costs 0 extra slots and
saves < 1 s (a near-duplicate) is dropped, and each extra slot must buy ≥ 1 s. The plan only drops; it never trades
time for slots by swapping a loadout. Review fix: the **lighter kit** — the plan with every loadout swapped for a cheaper
one of the same style whenever the slots it frees bought < 1 s each (`lightenKit`) — is listed first under
"Alternatives" as "Lighter kit: … −N slots for +X.X s" when it frees at least one slot. Switching takes ticks in-game but is free in the
model, so differences under a second are noise. The kit table shows each loadout's "+N slots, saves X s" (vs the kit
without it). The "why" list marks additions that fit but miss the rule.

**Effect** (defaults, Team drains, 2026-10-23, `scripts/verifyPhase21.mjs`, browser timings):

| Raid | Phase 17–20 headline (FA pins + old supplies in every raid) | Phase 21 defaults, rule off (`noPrune`) | Phase 21 |
|---|---|---|---|
| FA | 23:18.8 — Ascension crossbows partial over Inquisitor's + Obligator, Inquisitor's + Obligator | 23:18.8 | **23:18.8, unchanged** (both loadouts are needed; 17.4 s in the browser) ; heart fix: **23:30.4** with the Saturated heart pinned (Shadow partial worn) |
| ToA | 14:20.0 — Keris partisan of breaching (Torva) worn; Shadow, fang, Scythe, Obligator; 1 free | 14:20.0 — same kit incl. Torva + Obligator (saves 0.2 s for +1 slot); 3 free | **14:20.2** — Torva + Obligator dropped; Keris worn, Shadow, fang, Torva + Scythe; **4 free** (19.3 s) |
| CoX | 6:59.9 (8 "Other" slots) | 6:41.9 | **6:41.9, same kit** — Inquisitor's + Obligator worn; Shadow, Dragon pickaxe, Inquisitor's + Scythe (0 slots, 2.1 s), Harmonised Nightmare staff, Scythe (Tekton; +1 slot, 3.6 s), Ascension crossbows partial; 0 free (every switch ≥ 1 s per slot; 20.6 s) |
| ToB | 7:35.5 — Torva + Scythe worn; Torva helm + Oathplate + Scythe, two Scythe search sets, Eye of Ayak, Ascension crossbows partial | 7:32.0 (before the piece swaps) — Torva + Scythe worn; Oathplate + Scythe (+2 slots, 6.0 s), Torva + Salve (ei) + Scythe (+1, 3.8 s), Dawnbringer + 5 Ancestral pieces (+0), Eye of Ayak, Ascension crossbows partial; 0 free | **7:32.2, 28/28** — worn Torva helm + Oathplate + Scythe; switches Dawnbringer search set (+1 slot: the staff itself is free), Tumeken's shadow, Oathplate + Salve amulet(ei) swap, Ascension crossbows partial (18.2 s). **Alternative "Lighter kit"**: Dawnbringer (Ancestral) at +0 slots (its Ancestral pieces are the Shadow's) and a smaller Ascension crossbows partial — −3 slots for +1.9 s (7:34.1, 3 free) |

The three ToB Scythe sets each saved ≥ 1 s per slot, so the rule alone didn't drop them; once the single-piece swap
"Oathplate + Salve (ei)" exists the optimiser keeps one Scythe set + the Salve (7:32.2, 28/28). ToA's 14:20.2 is the
drop rule (Torva + Obligator: 0.2 s for its slot).

### Potions from the kit and ring policy (phase 27)

User requests (2026-10-23): "It's hard to know your potions up front … it's like I have to know the best layout to
predict the potions. Maybe it should calculate the potions itself based on the gear" and "A lot of people don't bring
ring switches. They camp one ring like Ultor the whole fight, or camp Lightbearer for constant specs even though it's a
bit less DPS."

**Potions from the kit** (`KIT_POTIONS`, `kitPotions`, `kitSupplies`, `potionSlots` in planner.ts). Where the
potions are brought (FA, ToB: `boostsNeedSupplies`) a kit with a melee loadout brings **one Super combat**, with a
ranged loadout **one Ranging potion**; magic uses the pinned heart (unchanged); ToA / CoX bring no combat potion (the
raid potion, "Other", boosts every style, as before). One potion item = one slot whatever its doses (no "Potion doses"
setting: upstream's boost model doesn't depend on doses). The potion slots are part of the kit's slot cost in the
optimiser (`KitProblem.potions`: one slot per distinct potion of the kit's members), so a melee + ranged + magic kit pays
2, a melee-only kit 1 and a magic-only kit 0, and adding a second style is weighed with its potion. The chosen potions
are in the inventory grid (tooltip "from the kit: one per style") and in a "Potions (from the kit)" line;
`PlanInputs.supplies` keeps its type, but its ranging / superCombat counts are ignored (`comfortSupplies`).

**Comfort supplies** stay user-entered: brew, restore, food, other ("Comfort supplies (your call)"), per-raid defaults in
`planDefaults.ts` (FA 6 brew / 4 restore, ToA 6 restore / 2 Other, CoX 2 / 2 / 1 Other, ToB 4 brew / 3 restore).

**Ring policy** (`PlanInputs.ringPolicy`, `RING_POLICIES`; the Plan tab's Advanced box, with a one-line "Rings:" summary
in the simple view; default `DEFAULT_RING_POLICY` = *Camp one ring*; `plan()` without a policy = *Allow ring switches*,
so the API and the phase 17-26 tests are unchanged):

- **Allow ring switches**: each candidate keeps the ring its search row / preset has (ring switches are inventory
  items) — the previous behaviour (with the same potions the phase 26 planner gives the same kits and totals; tested on
  the reduced pools of all four raids).
- **Camp one ring**: every candidate (presets, search rows, partial switches) gets the same ring, so no ring is ever a
  switch item. Rings tried (`CAMP_RINGS`, owned ones only): Ultor ring, Bellator ring, Venator ring, Magus ring, Ring of
  shadows (charged), Lightbearer. Each ring is first **screened** (presets + search rows only, no partial switches, 6
  seeds, one exact re-time; ~1 s each in Jest with the caches), then the full plan as below. Camping Lightbearer here
  also turns on the Solo Lightbearer regen.

  **The ring screen: estimated vs fully planned** (review fix). A screen leaves out the partial switches, so it
  overstates a ring's route time — on the FA defaults by 23 s for Ultor and 50-73 s for Bellator / Venator (the screen
  showed Bellator +82.0 s; its full plan is +31.8 s). So: (1) the best-screened ring gets the full plan, giving
  g = its screen − full time; (2) every other ring whose screen is within `RING_GUARD_FACTOR` (2) × g of the best full
  time gets the full plan too; (3) the fastest exact route wins. The "others" line shows a fully planned ring with its
  exact delta ("Ultor ring +3.1 s") and a screen-only ring only as **"≥ +X s (estimate)"**, X = screen − best −
  `RING_ESTIMATE_FACTOR` (4) × g (on the FA defaults screens overstated by up to 3.2 g; an estimate, not a guarantee),
  or "(slower by the quick screen; not planned in full)" when X < 1 s — never as a precise delta. The slow test
  (`Phase27.test.ts`, *ring guard*, `RUN_SLOW_TESTS=1`) plans all six FA rings in full (`PlanTuning.ringGuard:
  Infinity`): the guarded choice (Ultor) is the true best; true gaps Lightbearer +29.1 s, Bellator +31.8, Venator
  +45.0, Ring of shadows +54.0, Magus +59.5 (Venator's estimate ≥ +26.8 s; the others show "not planned in full").
- **Camp Lightbearer**: every loadout wears Lightbearer, and the plan's assumptions get the Solo spec budget's
  Lightbearer regen (`mySpecs.lightbearer` = true via `ringAssumptions`: 10 % per 15 s instead of 30 s; matters for
  Solo drains only). A camp policy with another ring sets that flag to false; *Allow switches* keeps the user's.
- **Pinned Lightbearer** (FA, ToA defaults): worn under *Camp Lightbearer* (no slot, no warning); under *Camp one ring*
  with another ring it stays pinned and shows under "Always brought but in no kit loadout" (one click removes it).

The dedupe rule, the alternatives and the lighter kit run inside the chosen ring's plan.

**Results** (defaults, Team drains, compare all, Jest without coverage; the slow `CrossRaid` headline test pins the
camp-one totals):

| Raid | Phase 26 | Allow ring switches | **Camp one ring (default)** | Camp Lightbearer |
|---|---|---|---|---|
| FA | 23:30.4 | 22:47.7 — worn Tumeken's shadow (Ancestral, Magus ring), Inquisitor's + Obligator (Ultor ring); 1 Super combat; 1 free | **22:47.9, Ultor ring** — worn Twisted bow (Masori), Obligator switch +5 on Ascension crossbows (Masori); Super combat + Ranging potion; 28/28 (every ring in full: Lightbearer +29.1 s, Bellator +31.8, Venator +45.0, Ring of shadows +54.0, Magus +59.5) | 23:16.9 (+29.0 s vs camp Ultor) |
| ToA | 14:20.2 | 14:20.2 (unchanged: no combat potions) | **14:22.3, Magus ring** (+2.1 s vs switching; Ultor +3.1 s full run) | 14:30.0 |
| CoX | 6:39.9 | 6:39.9 (unchanged) | **6:40.3, Ultor ring** (+0.4 s; Bellator +2.3 s full run) | 6:48.2 |
| ToB | 7:32.4 | 7:32.4 (same potions as its old defaults) | **7:31.7, Ultor ring** (−0.7 s: no ring switch items frees slots; Bellator +1.5 s) | 7:47.0 |

FA's gain over phase 26 is the potions: the old defaults carried 2 ranging + 1 super combat (3 slots) whatever the kit;
now 1 per style. Camping one ring costs 0.1 s (FA), 2.1 s (ToA), 0.4 s (CoX) or saves 0.7 s (ToB) vs switching rings.

**Timings and caches** (review fix). Phase 27 first made a default plan 68-79 s in the browser (six ring screens, plus
16 searches that had crept up to ~30-45 s). Two fixes:
- **Search speed**: a CPU profile of the 16 FA searches (Jest, 42.4 s) put 62 % of the time in upstream
  `getCanonicalItemId` (`src/lib/Equipment.ts`: a linear scan over every alias group, called for every item of every
  evaluated player), not in the phase 23 fight length (`autoFightSeconds` is already cached per boss / phase) nor the
  phase 25 pool (1,300 evaluations per boss, as in phase 9) or the ownership filter. A reverse alias map built once
  (same first-match result) + a memoised `resolveItem` (loadout.ts): **42.4 s → 11.3 s** for the 16 searches (Jest).
  Worth sending upstream (docs/UPSTREAM_MERGE.md).
- **Caches for the worker's lifetime** (`planner.ts`: `DPS_CACHE`, `SEARCH_CACHE`, `clearPlanCaches`): DPS per
  (assumptions incl. the ring flag, base player, monster = drain / target / phase / fight length, style group,
  equipment, style options) and the picked search rows per (plan assumptions, drain, target / phase, "Items I don't
  own", search hooks, row caps). Every input that changes DPS is in the key, so nothing goes stale; capped (cleared at
  400k DPS entries / 400 searches).

Before → after (FA defaults, camp one ring): Jest first plan **77 s → 19.9 s**, re-plan after a supplies change
**33 s → 4.0 s**; browser (`verifyPhase21/27`) first plan FA 12.5-14.9 s, ToA 14.3, CoX 15.8, ToB 48.0 s (more rings
within the guard), re-plan after a supplies change 7.7 s (incl. ~1.7 s of debounce / waits). `verifyPhase21` keeps its
150 s limit.

### Final review, round 3 (phase 28)

- **Headlines re-computed independently** (slow `CrossRaid` test): each returned kit is rebuilt as `KitLoadout`s
  (`applyLoadoutToPlayer` with the plan's assumptions and the camped ring) and timed with `compareRoutes`; the totals
  equal the planner's to 1e-6 s, every kit loadout wears the camped ring, ≤ 28 slots. FA 22:47.9 (Ultor), ToA 14:22.3
  (Magus), CoX 6:40.3 (Ultor), ToB 7:31.7 (Ultor). **FA with Obligator + Ascension crossbows on the "don't own" list:
  25:24.5**, camping Lightbearer (the pinned Lightbearer is worn and frees its slot; Magus / Ultor screens ≥ 36 s
  slower); kit Twisted bow (Masori) worn + Inquisitor's + Scythe (slash) (phase 26, before potions-from-kit and ring
  policy: 25:46.8).
- **Caches**: `getCanonicalItemId`'s reverse map equals the linear scan for every id in `equipment.json` and every alias
  id; the memoised `resolveItem` equals the uncached pick for every item name (`Phase28.test.ts`). `DPS_CACHE` /
  `SEARCH_CACHE` keys: the plan assumptions after the ring policy (raid, party size and ToA / CoX / ToB inputs, potions,
  `withoutPotion` (heart), Zeal, fragments, My specs incl. the Lightbearer flag, carriers, floor threshold, spec
  priority), the base player, drain state / target / phase / fight length, style group, equipment ids (ring and
  blowpipe dart included) and style options; the search key adds "Items I don't own" and the row caps. Tested: Zeal,
  fragments, ownership and camp Lightbearer each miss, and a warm plan equals a cold one.
- **Fix: Plan's Solo fight length** = the encounter's undrained time × team-DPS multiplier ÷ party size
  (`drainFightSecondsOf`, raidTime.ts; clamped 15-600 s like Search). FA's multiplier 1 had given Plan / the time model
  a Solo fight as long as you alone would take (Bork + Smorks ~220 s instead of ~37 s at party 6), while Search used
  hp ÷ (party × DPS) since the phase 23 review. ToA / CoX / ToB (multiplier = party size) and every Team / None number,
  including the headlines, are unchanged.
- Camp Lightbearer with Lightbearer on the "don't own" list now shows a notice.
- Wording: Search header "Exp. TTK (top row only)" (the TTK column is filled for the top row only), "Tries every
  end-game item in every slot …" (was a file name), "search started from: …" (was "seed (start of the ascent)"), the
  Ayak hint "each spec lands 73% of the time and drains ≈ 27.0 when it does" (was "73% × 27.0 per spec").

### Spec weapons: the planner decides (phase 29)

User question (round 3 review): "how do I know if I should mark that I'm bringing Ayak specs before the plan is made?
… should the plan decide which spec weapons to bring, based on party size too?" Code: `src/lib/fracturedArchive/specChoice.ts`
(pure), `planner.ts` (`SpecMode`, `PlanInputs.specMode` / `magesInParty`, `PlanResult.specs`), `PlanView.tsx` (`SpecsBox`).

**Spec weapons** (Plan inputs; `DEFAULT_SPEC_MODE` = *Planner decides*; `plan()` without it = *Specs I bring*, the
phase 17-28 behaviour, like the ring policy). *Specs I bring* uses the Assumptions box's toggles (renamed from "My
specs") and carries them. Spec weapons are no longer in the pinned defaults (FA / CoX / ToB had Elder maul).

**Solo** (drain Solo, or a party of 1: FA now allows party size 1, solo = 2-scale hp; Team is disabled then).
`searchSpecSubsets`: every subset of the owned Elder maul / DWH / BGS / Tonalztics / Eye of Ayak (32) is a candidate.
A subset's drains per phase = the Solo plan of those weapons (`mySpecsForSubset`: Defence drains first, then Eye of Ayak
until P(magic def 0) ≥ the threshold, `ayakSpecsToThreshold`) within your energy at each encounter's fight length;
it costs one slot per weapon not carried anyway. Subsets with the same reductions on every phase (same *signature*)
are one candidate — the one with the fewest slots (DWH next to a maul that already floors everything adds nothing);
a candidate whose every DPS is ≤ another's with no more slots is skipped (*dominated*). Each candidate gets a quick
optimiser run (4 seeds; inside the kit optimiser, so gear and specs trade slots), the best 3 the full one; the fastest
wins (ties: fewer slots, fewer weapons). The DPS matrix is shared: one column per distinct drain state (the DPS cache
key is now the monster's reductions, not the drain-state name), and the Solo reductions are cached by (phase, subset,
energy-budget bucket) across ring screens and re-plans (`SOLO_DRAIN_CACHE`); ring screens after the first reuse its
subset. Reported: "Bring: …", per brought weapon the route time it saves (the kit re-optimised without it) and its
slot, and the best weapon not brought with what it would save (negative = it costs time: its slot is worth more as
gear). Eye of Ayak's drain only helps magic, so it is valued only through the kit's magic loadouts.

**Team** (party ≥ 2). *Team briefing* (`teamRoles`): per boss / phase of the planned route, the fewest carriers whose
first round (2 specs each) reaches P(floor) ≥ the threshold (`recommendCarriers`: one weapon or a hammer + finisher
pair), then per weapon the most any boss needs, with the bosses that drive it ("Bork" when all its phases do, else the
phases). Eye of Ayak carriers (P(magic def 0) ≥ threshold) only when **Mages in party** (Advanced (plan); default 1
if your kit has a magic loadout, else 0) is > 0 (UNVERIFIED D22). *Your share* (`assignMe`, default "assign me"): the
Team drain state counts every carrier whoever carries it, so carrying gains *you* nothing; you get the most-needed
weapon (most carriers; ties Elder maul, Tonalztics, DWH, BGS, Ayak) only if it is carried anyway, fits in a free
slot, or the slot it takes is worth < 1 s of route time as gear (`SHARE_MAX_SLOT_SECONDS`; the kit is re-optimised
with the weapon carried to measure it); else "none: your last slot is worth X s as gear — let a teammate carry …"
(UNVERIFIED D21). *Specs I bring* is the manual override ("I'll bring: …"). The Team drain state itself still uses
the carriers in Advanced; the drain line shows both: **"needed ×2 (4 hits) · team brings ×4"** = the specs that reach
the floor if every one lands (`neededSpecs`) vs the specs the carriers do (Solo lines show Tonalztics as "×2 (4 hits)").

**Ring toggle.** "I wear a Lightbearer" (the Solo regen flag) is a ring toggle now, not a spec weapon; on the Plan tab
the ring policy sets it (Camp Lightbearer: on; Camp one ring: on only if the planned ring is Lightbearer; Allow ring
switches: your toggle). Ayak hint in the results when it is carried but no kit loadout is magic (Solo) or Mages in
party is 0 (Team). The Search header no longer repeats the drain line: "ranked at Def … · Magic def …" only.

**Numbers** (defaults, Team, compare all, camp one ring; slow `CrossRaid` pins):

| Raid | Phase 28 | **Phase 29** | Your share |
|---|---|---|---|
| FA | 22:47.9 | **21:53.0** | Tonalztics (5 carriers: The Smorks, floor 0) in a free slot |
| ToA | 14:22.3 | **14:10.5** | none: the slot is worth 6.2 s (Tonalztics, 3) |
| CoX | 6:40.3 | **6:36.3** | none: 3.4 s (Eye of Ayak, 6: Lizardman shaman) |
| ToB | 7:31.7 | **7:30.6** | Tonalztics (3): its slot was worth 0.5 s |
| FA without Obligator + Ascension crossbows | 25:24.5 | **24:53.8** (Ultor) | Tonalztics in a free slot |

The gains are the slots the old "My specs" default (Elder maul + Eye of Ayak) and the pinned Elder maul took. FA 6-man
briefing: 5 Tonalztics (The Smorks: floor 0, the % drains stall), 2 Elder maul (Bork, Ocellus P3).

**Solo** (FA defaults at party size 1, camp one ring → Ultor; `verifyPhase29`): **22:42.7, "Bring: Elder maul, Eye of
Ayak"** — Elder maul saves 104.4 s and Eye of Ayak 69.2 s for 1 slot each; not brought: DWH would cost 7.7 s, BGS
11.1 s, Tonalztics 49.6 s (its specs take the energy Ayak would use — Defence drains go first — and its slot is worth
more as gear). Kit: Tumeken's shadow (Ancestral) worn + Inquisitor's + Obligator + Harmonised Nightmare staff. 22
distinct drain states among the 32 sets, 10 skipped as dominated, 13 timed. Timings: Jest first Solo plan 123 s → 53 s
(the reductions cache, dominance pruning and the screen reuse; searches included), browser 19.9 s with the searches
cached; Team plans are as fast as before (FA 11-12 s in Jest).

## Routes tab (phase 16: raid time model)

**Phase 23: the tab is gone.** Its route table is now part of the Plan tab's results (the *planned* kit timed on every
route; FA 8 routes, the other raids their single route, with per-encounter cells), and its time-model settings are in
the Advanced box. The "kit" choices of the old tab (best search result per style per phase = an upper bound, presets,
the calculator's loadouts) are no longer in the UI; `computeRouteComparison` / `RAID_ROUTES` stay as tested library
code. The rest of this section describes the time model, which is unchanged.

Code: `src/lib/fracturedArchive/raidTime.ts` (pure, tested in `src/tests/lib/fracturedArchive/RaidTime.test.ts`); UI:
the Plan tab's route table (`RoutesView.tsx` was deleted in phase 23); runs in the search worker (`WorkerRequestType.RAID_ROUTES`,
`computeRouteComparison`). It is the objective function for the phase 17 planner.

**API.** `raidTime(route, kit, assumptions, cache?) → RouteTime` and `compareRoutes(kit, assumptions) → { routes,
fastest }`, where a route comes from `enumerateRoutes()` (the cartesian product of `ROUTE_SLOTS`: AG; Ezekiel | Bork +
Smorks; Moia | Dreadnoth; Dagon'hai | Xarth; Ocellus → 8 routes), a kit is anything with `best(phaseQuery) →
{ loadout, style, dps, drain }` (the real one: `createKitEvaluator(loadouts, bestSetupAssumptions)`), and
`assumptions = { partySize, drain, settings, fallbackFightSeconds }` (`raidTimeAssumptionsFrom`). The result is per
route → per encounter → per phase: damage, chosen loadout + style, DPS, seconds; plus totals and the fastest route
(argmin; ties keep the first; −1 when no route is finite).

**Model.** Time = Σ over encounters and phases of damage ÷ DPS, with the kit's best loadout + style per phase (switching
is free). DPS time only: no puzzles, travel, boss invulnerability, healing or adds. A phase that nothing in the kit can
damage is infinite (shown ∞; e.g. a melee-only kit on the AG shield). Settings (`RAID_TIME_DEFAULTS`, editable in the
"Assumptions (time model)" box, all **unverified**, UNVERIFIED.md group D):

| Encounter | Phases (damage → DPS of) |
|---|---|
| Archive Guardian | flying shield `agShieldHp` 1490 (wiki "1490 health shield in 6-scale", scaled by the party-size table relative to 6) → Flying; 550 × `agGroundedFraction` 70% → Grounded; the remaining 30% → Flying (it flies permanently below 30%). The guardian charges that do ~40% of the shield are not counted (pessimistic) |
| Bork + Smorks | killed evenly: Bork's 1500 in four quarters at armour 8 / 10 / 12 / 14 (each × (1 − `borkStunUptime`)), + 1500 × `borkStunUptime` (default 0) at Stunned; Smorks 600 |
| Ezekiel / Moia / Dreadnoth / Xarth | 3000 / 785 / 2100 (jellies ignored) / 2600 |
| Dagon'hai trio | `dagonhaiEncounterDamage(640)` = 3207 at Shielded |
| Ocellus | P1 2500 × (1 − `ocellusWalkingFraction`, default 0) at a corner, the rest at Walking; P2 lasts `ocellusP2Seconds` (default 0 = ignored) and the damage dealt to the Blade in that time × `ocellusP2CarryOver` 50% comes off P3's 5250; P3 remainder × (1 − `ocellusLastQuadrantFraction` 25%) at Quadrants 1-3, the rest at the Deflect option that is worse for the kit (= the one blocking the kit's best style; for a magic-best kit, where magic is never deflected in our model, the lower of the two) |

- **Drains** (None / Solo / Team = the drain buttons above the tab): per encounter, a first pass without drains gives
  the encounter's time; that × team-DPS multiplier ÷ party size (phase 28; = the time when the multiplier is the party
  size), rounded and clamped to 15-600 s, is the fight length for `drainModel` / the Solo spec budget, and the encounter is
  evaluated again with that drain state (one fixed-point iteration). Team plans don't depend on the length (first
  round), Solo ones do (more energy in long fights). The second pass is shorter, so a Solo plan gets slightly more energy
  than the drained fight would give.
- **Party size**: every hp figure is the calculator's party-scaled hp (`FRACTURED_ARCHIVE_HP_SCALING`, identity today);
  the AG shield uses the same factor relative to 6 (`partyHpFactor`). Filling that table (phase 22) updates every time.
- **Kit** (UI): one or more of (a) the **best search result per style** (melee / ranged / magic ticked by default):
  one all-style gear search per phase target the model queries (16 at the default settings), under the selected drain
  state, keeping each style's best row; each row is offered on its own phase only, with its own style (an upper bound:
  a different loadout per phase); (b) **presets** (any of `presets.ts`, each tries its styles / spells per phase);
  (c) **current calculator loadouts** (read from the calculator's saved session; used as they are: own style, spell,
  prayers, potions; equipment bonuses recomputed per monster).
- **Cost**: evaluations are memoised per (loadout, style, target, phase, drain reductions), so the 8 routes share the
  8 encounters; the default kit needs ~90 evaluations after the searches. Searches are cached in memory per
  assumptions + drain + phase, so a time-model setting or kit change only re-times (about a second); the first run
  takes ~10–15 s (16 searches). Changes are debounced (500 ms); **Cancel** stops the run.
- **Table**: the 8 routes with total (m:ss.s) and per-encounter seconds (boss icons), the fastest highlighted with a
  "fastest" badge; "+" expands the per-phase breakdown (damage, loadout · style, DPS, seconds, drain plan, and the fight
  length the drains were planned for).

Headline (default assumptions + kit, Team drains, 6-man, 2026-10-23, `scripts/verifyPhase16.mjs`): fastest **AG → Bork +
Smorks → Moia → Xarth → Ocellus, 21:49.5** (AG 181.2 s, Bork + Smorks 195.9, Moia 72.0, Xarth 186.8, Ocellus 673.5);
slowest AG → Ezekiel → Dreadnoth → Dagon'hai → Ocellus 23:43.1. Per slot: Bork + Smorks beats Ezekiel by 17.6 s, Moia
beats Dreadnoth by 63.0 s, Xarth beats the Dagon'hai by 33.1 s. Absolute seconds are only as good as the hp figures
(party scaling unverified) and the settings.

## Summary tab (phase 13)

One gear search (all styles, `runGearSearch`, same as the Search tab) per Summary row × drain state
(`summarySearchQueries()` in `search.ts`: 20 rows × None / Solo / Team = 60 searches (17 / 51 before phase 15 added Ezekiel, Moia and the Dagon'hai); the rows are `summaryQueries()`:
each boss/version at its default phase, plus Bork stunned, Ocellus P1 walking and the Ocellus P3 last-quadrant
options). They run one after the other in the search worker when the tab is opened, with a progress bar (searches
done / 60 + progress inside the current one) and **Cancel**; **Continue** resumes with the missing ones. Results are
cached in memory for the session (module scope in `SummaryView.tsx`, so switching tabs doesn't re-run), keyed by
`searchCacheKey(query, assumptions)`; changing any assumption clears the cache and re-runs. Each row starts with the
boss icon; each cell shows the top result's weapon line (18 px icons), a 16 px loadout icon strip (names in
tooltips), DPS (orange) + style, the best preset's DPS for reference, a "load" link (Load into calculator) and the
drain plan. Expect roughly 1–3 minutes for all 51 in a browser.

## Item icons (phase 12)

Search rows (and, smaller, Summary cells) show the weapon line with icons — weapon, then its ammo (ranged, not a blessing) or blowpipe
dart, then the autocast spell as text, e.g. "Ascension crossbows · Diamond ascension bolts (e)", "Kodai wand · Fire
Surge" — and the whole loadout as a row of 20 px icons in the calculator's equipment-grid order (head, cape, neck, ammo,
weapon, body, shield, legs, hands, feet, ring) with "name (slot)" tooltips; the boss selector shows the monster's icon.
URLs come from `src/lib/fracturedArchive/loadoutIcons.ts`, which uses the same helper as the calculator's equipment
slots and monster panel: `getCdnImage('equipment/<image>')` / `getCdnImage('monsters/<image>')` with the `image` field
of equipment.json / monsters.json. Production therefore serves them from `/cdn/` on our domain
(`NEXT_PUBLIC_CDN_URL`). Since the phase 13 fixes, dev uses the same deployed copy (`.env.development`), so the raid-4
images (Obligator, Ascension crossbows and bolts, the bosses), which upstream's CDN lacks, load in dev too. An `<img>`
that fails to load hides itself (the name stays as text). Icons are `loading="lazy"`, `alt` = item name. Spell icons are not shown: upstream loads
them from the wiki (`getWikiImage`), which would be hotlinking. `LoadoutIcons.test.ts` checks the slot order, URLs,
weapon lines, and that every preset/pool item and boss image exists in `cdn/` without a `%` in the name (those are
skipped by the deploy).

## Files

| File | What |
|---|---|
| `src/lib/fracturedArchive/presets.ts` | The presets (plain data) and the default assumptions. **Edit this to change setups.** |
| `src/lib/fracturedArchive/bestSetup.ts` | Pure computation (no React): item lookup, targets, drain states, `applyPresetToPlayer`, `evaluateLoadout`, `evaluatePreset`, `computeBestSetup`. Phase 9 should reuse `evaluateLoadout` / `buildTargetMonster`. |
| `src/app/best-setup/page.tsx`, `src/app/components/bestSetup/BestSetup.tsx` | The page (tabs, assumptions, boss / phase / drain selectors). |
| `src/lib/fracturedArchive/specs.ts`, `teamSpecs.ts` | Phase 14: spec mechanics / hit chances per weapon and energy budget; exact solo / team planners and the carrier recommendation (pure). `loadout.ts`: player assembly split out of bestSetup.ts (re-exported). |
| `src/app/components/bestSetup/SpecPlanPanel.tsx` | Phase 14: plan text, P(floor) and carrier table under the selectors. |
| `src/app/components/bestSetup/SummaryView.tsx` | Summary tab (phase 13): sequential searches, session cache, Cancel / Continue. |
| `src/lib/fracturedArchive/raidTime.ts`, `src/app/components/bestSetup/TimeSettingsBox.tsx` | Phase 16: raid time model (routes, encounters, kit evaluator, `RAID_TIME_DEFAULTS`); phase 23: its settings in the Advanced box (the Routes tab, RoutesView.tsx, was removed). |
| `src/lib/fracturedArchive/drainLine.ts`, `src/app/components/bestSetup/DrainLineView.tsx` | Phase 23: drain plans as "[icon] ×N" with hit chances. |
| `src/lib/fracturedArchive/ownership.ts`, `src/app/components/bestSetup/NotOwnedBox.tsx`, `Ownership.test.ts`, `scripts/verifyPhase26.mjs` | Phase 26: "Items I don't own" (storage, matching, pool / preset filtering, row marking) and its checks. |
| `src/lib/fracturedArchive/planner.ts`, `src/app/components/bestSetup/PlanView.tsx` | Phase 17: raid kit planner (candidates, partial switches, DPS matrix, slot accounting, optimiser, inventory grid) and the Plan tab. |
| `src/lib/fracturedArchive/specChoice.ts` | Phase 29: the planner's spec weapons — Solo subset search, team briefing (`teamRoles`), your share (`assignMe`); tests `Phase29.test.ts`, UI check `scripts/verifyPhase29.mjs`. |
| `src/tests/lib/fracturedArchive/Planner.test.ts`, `scripts/verifyPhase17.mjs` | Phase 17 tests (slot accounting, toy optima vs brute force, partial switches, reduced-pool plans, determinism, cancellation) and the Playwright check (`docs/screenshots/phase17-*.png`). |
| `src/tests/lib/fracturedArchive/RaidTime.test.ts`, `scripts/verifyPhase16.mjs` | Phase 16 tests (hand-computed times with toy kits, drains per encounter, argmin, monotonicity) and the Playwright check (`docs/screenshots/phase16-*.png`). |
| `src/tests/lib/fracturedArchive/Presets.test.ts` | Item names resolve, players are valid, the view's numbers equal a direct `PlayerVsNPCCalc`, ranking order, drain spec counts. |
| `scripts/verifyBestSetup.mjs` | Playwright check of the Summary tab since phase 13 (60 cells since phase 15, Cancel / Continue, cache on tab switch, icons, load a cell; `docs/screenshots/phase13-summary.png`). |

## Editing presets

Open `src/lib/fracturedArchive/presets.ts`; the comment at the top explains the fields. In short: copy an entry, give it
a unique `name`, list items by their exact calculator name per slot (`['Name', 'Version']` to force a version),
optionally restrict `styles` (style names to try) and `spells` (autocast spells to try). Then run `yarn test` — the
Presets test fails if an item name doesn't exist or doesn't fit its slot, or if a two-handed weapon has a shield.

The view tries every listed style (and spell) per preset and shows the one with the highest DPS for that boss/drain.

## Assumptions (the "Assumptions" box; defaults in `DEFAULT_ASSUMPTIONS`)

- All skills 99 (the calculator's default player).
- Potions per style: Super combat / Ranging potion / Saturated heart (selectable; in FA / ToB the magic one is labelled
  **Heart** and offers Saturated / Imbued heart — it is a pinned item in the Plan tab, see *Plan tab → Heart*; CoX-only overloads/super potions and
  ToA smelling salts are available in the dropdown but don't work in the raid).
- Prayers: Piety / Rigour / Augury; "Zeal instead of Piety" switches melee to the raid prayer.
- Elemental fragments: on for magic presets (all four elements, +2 base max hit to elemental spells). Only the Kodai
  preset casts spells, so only it is affected.
- **Fight length**: no input since phase 23 — computed per boss / phase (see *Layout and glossary*); it was 90 s for
  every boss (phase 14). The Plan tab uses each encounter's own undrained time. **Floor confidence** 95% (Advanced;
  was "Floor at P ≥"): when a drain plan counts as reaching the floor.
- **Specs I bring** (phase 14 "My specs", the Solo drain state; phase 23: icon toggles; phase 29: renamed, Lightbearer
  moved to its own "Ring: I wear a Lightbearer" toggle): Elder maul on, DWH / BGS / Tonalztics off,
  `Ayak × 2` (with "≈ X magic def drained on <boss>" next to it = specs × hit chance × expected damage on a hit, from
  the calculator), Lightbearer off; "Spec energy goes first to: Defence drains / Ayak" (Advanced).
- **Team carriers** (phase 14, the Team drain state; Advanced): party size 6 (the raid input, also the HP-scaling party
  size, an identity table), carriers per weapon (default maul 2, DWH 0, BGS 0, Tonalztics 2, Ayak 1), one "carriers use
  Lightbearer" toggle (phase 23; was a box per weapon). Carriers beyond the party size are ignored (warned in red).

The assumptions are kept in page state only (reset on reload). Change the defaults in `presets.ts`.

## Drain states (phase 14: spec & drain model)

| State | Defence | Magic defence bonus |
|---|---|---|
| None | undrained | undrained |
| Solo | my ticked weapons within **my** spec energy: `soloSpecPlan` | my Ayak specs that fit in the energy left: specs × expected damage per spec |
| Team | the carriers' **first round** (each specs twice from 100% energy): `teamSpecPlan` | the Ayak carriers' first round |

**Which Defence the DPS ranking uses** (both Solo and Team): the floor if P(floor) ≥ the threshold (95%), otherwise
the reachable Defence nearest to the expected Defence (`rankedDefence` in `teamSpecs.ts`). Magic defence: 0 if
P(magic def 0) ≥ the threshold, otherwise bonus − expected drain (rounded down). The state is written into
`defenceReductions` as landed counts (maul / DWH specs, Tonalztics hits, BGS damage on Defence, Ayak damage) that
reproduce that Defence exactly in the calculator, so "Load into calculator" shows the same numbers. The plan text and
P(floor) are shown under the selectors ("Solo drains: …", "P(Defence floor …) …"), and the Search line keeps the short
form (e.g. "first round 4× Elder maul + 4× Tonalztics + 2× Ayak (P floor 99.5%)").

- **Hit chances** come from upstream's spec calc (`specs.ts`): a 99s player with the weapon, the Phase 8 preset armour of
  its style (Inquisitor's / Masori (f) / Ancestral), prayer + potion from the assumptions, `getSpecCalc()` →
  `getDistribution()`. Against the undrained boss, so follow-up specs are modelled slightly less accurate than they are.
  Mechanics per weapon: `docs/DATA_SOURCES.md`, *Spec mechanics*.
- **Energy budget**: `energyBudget({ seconds, lightbearer })` = 100 + 10 × floor(seconds / 30), or per 15 s with
  Lightbearer (wiki). All drain specs cost 50%, so 90 s = 130% = 2 specs (Lightbearer 160% = 3). 100% at the start of
  every boss is assumed (unverified).
- **Solo** (`soloSpecPlan`): Defence first (default): the fewest attempts whose best combination of the carried
  weapons reaches P(floor) ≥ 95%, else every attempt the budget pays for; leftover energy goes to Ayak (up to the
  count). It never spends more than the budget (tested). The plan's label is that of the *full* plan (attempts for
  95% + Ayak count): `solo` (fits 100% + regen), `solo+lightbearer` or `team-only`. With the defaults (maul + 2 Ayak)
  and the old 90 s every boss was `team-only` ("needs teammates' specs" on the page since phase 23): 2 maul attempts
  use the 130% and the Ayak specs don't fit — the line shows "Ayak ×0 (no energy)". Since phase 23 the fight length is
  computed with the whole party (6-man fights are 15-79 s, still 2 specs); smaller parties get longer fights and more
  specs. A floor
  the carried weapons can't reach is shown as a partial drain, e.g. The Smorks: "2× Elder maul → expected Def 145
  (floor 0 not reachable; best case Def 93) → ranked at Def 143".
- **Team** (`teamSpecPlan`): exact P(floor from the first round), expected Defence, Ayak P(0). When the first round
  reaches the floor with P ≥ the threshold, the line adds the expected attempts to the floor; otherwise it shows the
  whole-fight P(floor) (each carrier's later attempts from regen / Lightbearer). (The expected attempt count is capped
  at the attempts available, so it is not shown when the floor is unlikely.) Team plans have no solo / team-only
  label (summing every carrier's energy as one player's would always say team-only); Solo plans keep theirs.
- **Ayak with the default single carrier** (2 specs ≈ 40 damage) won't reach magic defence 0 on high-magic-defence
  bosses (Bork +300, The Smorks +400, Xarth +205, Ocellus P3 +200): the Team state then uses bonus − expected drain.
  The carrier table's Ayak row shows how many carriers 0 needs.
- **Carrier table** (`recommendCarriers`, under the plan): P(floor from the first round) for 1..party-size carriers of
  each weapon, Ayak P(magic def 0), and the fewest carriers (one weapon, or a hammer + Tonalztics/BGS pair) reaching
  95%, e.g. "6-man Bork: 1 Elder maul → 59%, 2 Elder maul → 96%"; "6-man The Smorks: 4 Tonalztics → 84%, 5 Tonalztics
  → 98%" (hammers alone never reach floor 0).

- **Raid scaling in the hit chance** (phase 24 audit): the spec calc scales the monster and builds the defence roll
  exactly like a normal attack, so ToA's raid-level multiplier (defence roll × (250 + level) / 250), CoX party / CM
  Defence and ToB's per-mode monsters are all in the "N% land" under each icon. Kephri at 500: Elder maul 63% per spec
  (87.7% at raid level 0); table and hand computation in `docs/DATA_SOURCES.md`, *Spec accuracy by raid*.
- **Drain line note** (phase 24, `drainLineNote`): a planned weapon with < 40% per spec → "drains unlikely to land
  here: 39% per spec"; else, when one landed maul / DWH spec reaches the floor (Kephri, Akkha, P3 Wardens: ToA's capped
  drains) → "1 landed spec reaches the floor (Def 60); ≈ 1.6 specs on average, later ones add nothing" — so the Team
  line's "×4" (everyone's first round) isn't read as "4 needed". Shown under the line (`data-testid="drain-line-note"`).

Phase 13 rule kept: weapons that can't hit the boss in the selected version / phase have hit chance 0 (via upstream's
`isImmune`, `hittable.ts`), e.g. Archive Guardian (Flying) Solo with the default specs has no Defence drain ("Elder maul
can't hit here"), Team uses the Tonalztics carriers. The calculator's **Max drain** buttons (`drains.ts`) are unchanged
(all specs landing); phase 23 shows each button's plan as icons ×N with the per-spec hit chance.

## How the numbers are computed

Each preset is turned into a player exactly as the main calculator builds one (equipment →
`calculateEquipmentBonusesFromGear`, attack speed, potion boosts as the store's `recomputeBoosts`), and the monster as
the calculator holds it after selecting the boss/phase, party size and pressing the drain buttons (raw stats + inputs,
current HP = scaled HP). `evaluateLoadout` then calls `PlayerVsNPCCalc` like the worker's `COMPUTE_BASIC` handler:
`getDps`, `getTtk` (expected TTK), `getDistribution().getMax()`, `getDisplayHitChance()`. "Load into calculator" adds the
row's setup as a new loadout (or replaces the selected one if all 6 are used) with the same boss, phase and drains, and
opens the calculator — the numbers there are identical (checked by `scripts/verifyBestSetup.mjs`).

TTK is the expensive part (O(HP × max hit)), so it is computed only for each preset's winning style.

A preset that fails to evaluate (e.g. a misspelt item) shows as a 0-DPS "Error: ..." row instead of breaking the
view (`safeEvaluatePreset`).

Rows that deal no damage are greyed with the reason (e.g. melee on Archive Guardian (Flying): "Flying: melee can't
reach it"; Ocellus P1 walking / P3 deflect: "Ocellus is praying against this combat style.").

## Results snapshot (default assumptions, 2026-10-22)

**Phase 14 note:** this snapshot and the Search results table below predate the spec model; Solo / Team now use the
spec planners (e.g. Bork Team top = Inquisitor's + Obligator 10.524 at Def 180, The Smorks Solo is ranked at Def 143).
Re-run the Summary tab for current numbers.

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

Every unverified reading, with how to check it in-game, is in [UNVERIFIED.md](UNVERIFIED.md); group (A) there lists
the ones that could change a winner.

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
- Phase 14: spec misses are modelled (exact probabilities); there is still no fight simulation (spec timing, boss healing), and the fight length is the boss's undrained time to kill with the best preset and the whole party (phase 23; was one 90 s setting).

# Search tab (phase 9)

"Search" (the default tab on `/best-setup` since phase 12) searches over end-game items per slot for the selected
boss/phase and drain state and lists the top loadouts by DPS, so a combination no preset has can still win. Boss, phase
and drains are chosen above the table; the Assumptions box applies too. Styles: All / Melee / Ranged / Magic.

**Auto-run (phase 12):** the search starts by itself when the tab opens (i.e. when the page loads) and whenever the
boss, phase option, drain state, style filter or an assumption changes. Each change clears the old table, cancels the
running search (its worker is terminated) or a pending start, and schedules a new run after a 300 ms debounce
(`AUTO_RUN_DEBOUNCE_MS` in `SearchView.tsx`), so several quick changes search once. During the debounce and the run the
progress bar shows ("Starting…", then evaluations done / estimated and the weapon being searched); **Cancel** stops
both. **Run again** re-runs by hand (e.g. after a cancel). "Best per weapon"
switches the table from the top 10 loadouts overall to the best loadout of each weapon (top 10).

Table: rank, DPS, gain vs the best Phase 8 preset of the searched styles (same boss/drains; the preset is named above
the table), expected TTK (winner only), max hit, accuracy, style, the full loadout, the seed the
ascent started from, and **Load into calculator** (adds the exact items incl. the blowpipe dart,
with the boss, phase and drains). Weapons that can't deal damage at all (melee vs Flying, a style Ocellus prays
against) are listed under the stats line instead of in the table.

## Files

| File | What |
|---|---|
| `src/lib/fracturedArchive/searchCandidates.ts` | The candidate pool (plain data, commented). **Edit this to change what is searched.** |
| `src/lib/fracturedArchive/search.ts` | The search (pure): `runGearSearch`, `prunePool`, `spellsForMonster`, `searchRowToPlayer`. |
| `src/lib/fracturedArchive/poolAudit.ts`, `poolAuditSources.ts` | Phase 25 pool audit + `POOL_EXCLUDED`; `node scripts/auditPool.mjs [--all]`, `PoolAudit.test.ts`. |
| `src/worker/searchWorker.ts`, `searchWorkerClient.ts` | `WorkerRequestType.BEST_SETUP_SEARCH`: own worker per run, progress messages, cancel = terminate. |
| `src/app/components/bestSetup/SearchView.tsx` | The tab (auto-run). |
| `src/lib/fracturedArchive/loadoutIcons.ts`, `src/app/components/bestSetup/ItemIcons.tsx` | Item / boss icons (phase 12). |
| `src/tests/lib/fracturedArchive/Search.test.ts` | Pool data, pruning, spells, search properties (see below). |
| `scripts/verifyGearSearch.mjs` | Playwright check (screenshots `docs/screenshots/phase9-search-*.png`). |
| `scripts/verifyBestSetupUx.mjs` | Phase 12 Playwright check: default tab, auto-run, re-run on boss change, icons, Load into calculator from both tables (`docs/screenshots/phase12-*.png`). |

## Pool (searchCandidates.ts)

| Style | Weapons (variants) | Slot candidates (before pruning) | Full-set seeds |
|---|---|---|---|
| Melee | 14: Scythe, Obligator, Inquisitor's mace, Soulreaper axe, Osmumten's fang, Emberlight, Arclight, Burning claws, Voidwaker, Abyssal bludgeon, Noxious halberd, Elder maul, Dual macuahuitl, Ghrazi rapier (14 variants) | 31: Torva / Inquisitor's / Oathplate / Bandos / Blood Moon / Void, Neitiznot faceguard, Infernal + Fire cape, rancour / torture / blood fury, Ferocious / Void gloves, Avernic treads (max) / Primordial, Ultor / Bellator, Avernic defender, Rada's blessing 4 | Inquisitor's, Torva, Oathplate, Blood Moon (macuahuitl only), Void (melee) |
| Ranged | 9: Twisted bow, Ascension crossbows (diamond / onyx ascension bolts (e)), Zaryte crossbow (ruby / diamond / onyx dragon bolts (e)), Bow of Faerdhinen (c), Venator bow, Eclipse atlatl (+ atlatl darts), Scorching bow, Toxic blowpipe (dragon darts), Heavy ballista (dragon javelins); the three bows fire Seeking dragon arrows or dragon arrows (phase 25) (15 variants) | 23 + 4 atlatl-only: Masori (f) / Crystal / Eclipse Moon / Elite void, Dizana's quiver / Ava's, Necklace of rupture / anguish, Zaryte / Void gloves, Avernic treads (max) / Pegasian, Venator ring, Twisted buckler (ZCB), Rada's; the atlatl also gets Infernal cape, rancour, Ferocious gloves, Ultor ring (it scales with melee strength) | Masori (f), Crystal (Bowfa only), Eclipse Moon (atlatl only), Elite void (ranged) |
| Magic | 8: Tumeken's shadow, Zorya's tome, Harmonised Nightmare staff, Kodai wand, Sanguinesti staff, Purging staff, Accursed sceptre, Warped sceptre (8 variants) | 26: Ancestral / Virtus / Blue Moon / Void, Imbued Guthix cape, Occult / Elemental amulet (kept for the autocasting Harmonised staff / Kodai / Purging staff, + Dragon hunter wand in CoX), Confliction / Tormented / Void gloves, Avernic treads (max) / Eternal, Magus ring, Elidinis' ward (f) / Tome of Fire / Water / Earth (one-handed weapons), Rada's | Ancestral, Virtus (Kodai only), Blue Moon, Elite void (magic) |

37 weapon variants in total. Autocast spells (Kodai, Harmonised, Purging staff): Fire Surge (highest base) + the surge of
the boss's elemental weakness, Dark Demonbane against demons, Ice Barrage (Kodai) unless the boss is immune to ancients
(Archive Guardian). Constraints in the data/code: two-handed weapons (from the item data) never get a shield; weapons
that fire ammo list it per weapon (the test checks the calculator accepts it); others use Rada's blessing in the ammo
slot (the test checks the weapon doesn't require ammo); the blowpipe's dart goes in the weapon's `itemVars` like the
calculator's dart picker.

Left out on purpose: Dragon hunter lance (no dragons), Justiciar / Sunfire fanatic (no offensive effect), Lightbearer
(spec only), "ruby ascension bolts (e)" (don't exist in the data — only diamond and onyx), Blue Moon spear (the
calculator doesn't model the Blue Moon / Eclipse Moon set effects; the Blue Moon armour is still seeded). Phase 25: the
full list of deliberate omissions, with reasons, is `POOL_EXCLUDED` (below).

### Pool audit (phase 25)

User report: "It seems to not have Maggot King items — the Amulet of rupture isn't being used. Doesn't look like it's
using Seeking dragon arrows either." (The item is the **Necklace of rupture**; there is no "Amulet of rupture".) Both
were in `cdn/json/equipment.json` and fully modelled upstream since the baseline; only the pool lacked them.

`src/lib/fracturedArchive/poolAudit.ts` (run: `node scripts/auditPool.mjs [--all]`; Jest: `PoolAudit.test.ts`, which
fails on any new item) lists every item that
1. **beats a pool item on stats** in some raid's pool / style group / slot: ≥ in every relevant stat and > in one, vs a
   pool item nothing else in the pool beats (melee: stab | slash | crush + strength, one attack type at a time; ranged:
   attack + strength; magic: attack + damage). Fired ammo is compared per bow / crossbow with the ammo that weapon
   accepts. Weapons are not compared by stats (powered staves, bows and specs differ by built-in max hits and effects;
   the rule flagged ~60 irrelevant weapons), or
2. **has an upstream effect**: its exact name is a string in `PlayerVsNPCCalc.ts`, `BaseCalc.ts` or `Equipment.ts`
   (307 names),

and is in no pool, preset or spec loadout (by name or canonical id) and not in `POOL_EXCLUDED` (25 grouped entries,
each with a reason: Bounty Hunter / Deadman / Leagues / wilderness / Barbarian Assault items, slayer-task and
vampyre / turoth / kalphite gear, Barrows, obsidian, lower Void / Salve versions, god capes, single-element amulets,
Brimstone ring, recoil rings, low-tier staves, Gauntlet weapons, pickaxes other than dragon / crystal, damage-spec and
mid-tier weapons incl. the **Crimson kisten** (Maggot King's other unique: its *Brutal Swing* is a damage spec, which the
model doesn't have yet — ROADMAP "Damage specs vs drain value"), non-dragon gem bolts).

Before phase 25 the audit found exactly three gaps, now in every raid's pool:

| Item | Wiki (2026-10-23) | Upstream model | Pool |
|---|---|---|---|
| Necklace of rupture (33639) | "upgraded variant of the necklace of anguish ... +5 ranged attack, +3 ranged strength, and +1 prayer bonus over the necklace of anguish"; Maggot King's elder venator fang | stats only (no effect; upstream's own Max Ranged / Bowfa presets already wear it) | ranged neck, first; anguish kept |
| Seeking dragon arrow (33595) | "+20 ranged attack bonus over their regular variants, as well as increasing the player's minimum hit from 1 to 3 upon a successful hit"; 8 July 2026: "+20 ranged attack bonus when using bows" only | in `bow_t60` (Twisted / Venator / Scorching bow accept it, bonuses INCLUDED); accurate hits raised to ≥ 3 (`PlayerVsNPCCalc`, "Seeking" + INCLUDED ammo) | ammo option for the Twisted bow, Venator bow, Scorching bow (dragon arrows kept as a second variant) |
| Elemental amulet (34428) | "adding a +2 max hit to elemental spells, which is added before magic damage and elemental weakness modifiers" | `hasMatchingElementalAmulet` → +2 base max hit | magic neck, kept for the autocasting weapons (+ DHW in CoX) |

Presets: `MASORI_F` (every Masori preset, incl. CoX's Dragon hunter crossbow) wears **rupture**, and **Twisted bow (Masori)**
fires **Seeking dragon arrows** (both better in every case; the spec model's ranged armour is that preset, so the
Tonalztics spec player gets +5 ranged attack too). Upstream commit 89c3e25 "Add Seeking broad arrows to
isWearingLeafBladedWeapon" is about turoths / kurasks (broad ammo) — irrelevant here, excluded.

Effect on the numbers (default assumptions, Xarth): the overall top row is unchanged (Obligator 12.839 None / 13.917
Solo & Team). Ranged-only: Team / Solo top Ascension crossbows + diamond (e) **10.012 → 10.430** (+4.2%, rupture);
Twisted bow **9.834 → 10.379** (+5.5%, Seeking + rupture; dragon arrows + rupture 10.138); None: Twisted bow 7.585 →
8.248 (+8.7%) and now beats the crossbows. Magic-only: Harmonised Nightmare staff + Tome of Water **6.291 → 6.633**
(Team, +5.4%) with the Elemental amulet instead of Occult (+2 base max hit before magic damage beats Occult's +5%
damage and +2 magic attack). With all styles,
rupture appears in rows 7–9 (ranged rows; rancour / torture are melee necks, so they don't compete — the melee rows
keep rancour). Plan totals (Team, defaults): FA 23:30.4 and ToA 14:20.2 unchanged (no ranged kit loadout); **CoX
6:41.9 → 6:39.9** (ranged loadouts wear rupture, Scorching bow + Seeking); **ToB 7:32.2 → 7:32.4**, 1 slot free (was 28/28; the kit now carries
an Ascension crossbows + rupture switch; the planner is a heuristic, so a bigger pool can cost a few tenths).

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
- `PoolAudit.test.ts` (phase 25): the audit finds nothing missing; the rules flag known items with no exclusions; every
  exclusion matches an item and no pool member is excluded. `ItemRefresh.test.ts`: rupture / Seeking / Elemental amulet
  stats and effects (hand-derived rolls and max hits), pool and preset membership.
- `node scripts/verifyPhase25.mjs`: Xarth Search rows with rupture / Seeking / Elemental amulet, apostrophe images 200.
- `node scripts/verifyGearSearch.mjs`: full search for Xarth (None) and Ocellus P2 (Team) in the UI, top row equals the
  Jest numbers, wall time ≤ 15 s, the top row loaded into the main calculator shows the same DPS / max hit, Cancel works.
