# Best setup view (phase 8; Search tab phase 9; default tab + icons phase 12; search-based Summary phase 13; spec & drain model phase 14; Routes tab phase 16; Plan tab phase 17; raid tabs + ToA phase 18; CoX phase 19; ToB phase 20; per-raid Plan defaults + dedupe phase 21; UI cleanup phase 23; "Items I don't own" phase 26; potions from the kit + ring policy phase 27; Plan tab polish phase 30; quiver ammo + heart as magic's potion phase 31; zero-value switch items + drain-line units phase 32; specs follow the plan + one drain line per encounter phase 33; readability phase 34; damage specs, surge potion and one spec budget per encounter phase 36; remembered settings and the headline fixture phase 37b)

> **Totals in this file are history** (phase 38f): the number a phase measured, as of that phase. The current exact totals,
> kits, carriers and per-encounter seconds are `src/tests/fixtures/headlines.json` (written by `scripts/pinHeadlines.mjs`;
> the README table is generated from it). Tests pin the gear exactly and times only within 1% per raid / 2% per encounter.

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
  (phase 29; was "My specs") as icon toggles (Elder maul, DWH, BGS, Tonalztics, Ayak × N; phase 33: none by default,
  and filled read-only from the last plan while "Planner decides" — see *Specs follow the plan* below), and **Ring: I wear a
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

- *Drains*: None = no Defence / Magic defence drains. Solo = only your own specs ("Specs I bring": phase 33: the last plan's "Bring" while the planner decides, else the ones you tick), within the spec energy
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

## Remember my settings (phase 37b)

Every best-setup input is remembered in this browser (localStorage, key `mxeaez-dps:settings:v1`) and restored when
the page loads: per raid, the Assumptions box (party size and the raid inputs — ToA raid / path levels, CoX Challenge
Mode, ToB mode — potions / heart, Zeal, Specs I bring + mode, Lightbearer), Advanced (team carriers + mode + "carriers
use Lightbearer", elemental fragments, floor threshold, players at your DPS, spec-energy priority, the time-model
settings), the Drains selector (None / Solo / Team, as chosen: a party of 1 still shows Solo), and the Plan tab's
inputs (Spec weapons, Route, comfort supplies, rune pouch, Rings, Mages in party, Items I always bring); plus the active
raid tab. Plan results, the Search / Plan / Summary tab and the chosen boss are not stored. "Items I don't own" keeps its
own keys (below). Code: `src/lib/raids/settings.ts` (pure), `BestSetup.tsx` (holds every raid's settings, writes them
through on each change), `PlanView.tsx` (starts from the saved Plan inputs, reports changes). The Plan tab's inputs now
also survive leaving the tab and coming back (they used to reset), and each raid keeps its own Drains / spec mode / time
settings across raid-tab switches.

- **Stored JSON**: `{ "version": 1, "raid": "toa", "raids": { "<raid id>": { "assumptions", "time", "drain",
  "specMode", "plan": { "route", "supplies", "ringPolicy", "mages", "nonItem", "pinned" } } } }`, holding **only the
  values that differ from the defaults** (a later change of a default still reaches inputs you never touched); a raid
  with nothing changed has no entry; the key is removed when nothing differs at all.
- **Restore** (`validateRaidSettings`): every field is checked on its own — a value of the wrong type or out of range
  (party size outside the raid's range, an unknown route or ring policy, a potion that doesn't exist, a pinned id that
  is no item, supplies above 28, ...) falls back to that input's default; unknown keys are ignored; a missing part keeps
  its defaults; another `version`, unreadable JSON or blocked storage → every default. The page renders after the
  settings are read (one "Loading…" frame: the site is a static export, so storage is read after mount).
- **Reset** (Assumptions box): every input of this raid back to its defaults — Advanced, Drains and the Plan tab
  included (it used to reset the assumptions only) — and its saved entry removed. **Reset all saved settings** (the ?
  help): every raid back to its defaults and the key deleted; the raid tab stays where you are and "Items I don't own"
  is kept.
- Checks: `Phase37b.test.ts` (round trip, version mismatch / corrupt JSON → defaults, partial and invalid data, Reset,
  only differences stored), `scripts/verifyPhase37b.mjs` (set FA party 4, Solo, brews 5, a route, Allow switches and
  ToA raid level 300; reload: all kept, ToA tab active; Reset; Reset all; screenshot `phase37b-settings.png`). Verify
  scripts start from a fresh browser, so they still see the defaults.

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
- **Defaults**: Super combat / Ranging / Saturated heart (no raid boost; potions come from the kit, phase 31: the heart too), Piety / Rigour / Augury,
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
- **Plan**: supplies brew 4 / restore 3 (+ the kit's potions, phase 27; phase 31: the Saturated heart is magic's kit potion, no longer pinned) (lower than a no-resupply raid: the chests after Bloat and
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
other non-items** (default 1); **Rings** (phase 30: a dropdown on the same row — Camp one ring (default) / Camp
Lightbearer / Allow ring switches — with the one-line summary of what it chose next to it; it was under "Advanced
(plan)" before);
**Items I always bring** (phase 30: empty by default — the planner decides the styles, so nothing is "always brought";
the list is for your own additions; phase 31 removed the FA / ToB Saturated heart, now magic's kit potion; before: Lightbearer, Zaryte crossbow, Kodai wand, Ancestral robe top, Elidinis' ward (f), Saturated heart;
editable with the calculator's item search; each takes a slot unless a kit loadout wears it, and any loadout may use
them for free). Time-model settings come from the Advanced box (phase 23; defaults `raid.defaultTimeSettings`;
FA: `RAID_TIME_DEFAULTS`). Phase 22: `plan()` and `computeRouteComparison()` throw if the time model passed isn't the
assumptions' raid's (`assertTimeModelForRaid`), since both default to the Fractured Archive's.

**Supplies → DPS** (review fix; phase 27): Super combat carries the melee boost, Ranging potion the ranged one
(`KIT_POTIONS`). Since phase 27 the kit always brings the potion of each style it has, so melee / ranged are always
boosted and the potion's slot is part of the kit's slot cost; before, a style whose supply count was 0 was evaluated
**without a potion** (`BestSetupAssumptions.withoutPotion`, still used for ToA / CoX without the raid potion (and, before
phase 31, for FA / ToB magic without a pinned heart); `planAssumptions(assumptions, supplies, pinned)`, honoured by `applyLoadoutToPlayer`); the
Assumptions box's potion is the one used. The searches, matrix, exact times
and "Load into calculator" all use it; the drain / spec model keeps the potions (team carriers bring their own).

**Heart** (fix 2026-10-23, user: "Nobody uses magic potions, they use Saturated heart instead"): the magic boost is a
reusable item, one inventory slot for the whole raid. Hearts are pseudo items (`HEART_ITEMS` in `planner.ts`: Saturated
heart −9001, Imbued heart −9002 — not equipment); `planItemByName` resolves their names. Rules (phase 31; before, the
heart was a pinned item and FA / ToB magic was boosted only while one was pinned):
- **FA, ToB** (`boostsNeedSupplies`): the heart is **magic's kit potion** (`kitPotions`, `kitHeart`), exactly like Super
  combat for melee and Ranging potion for ranged: one slot when the kit has a magic loadout, none otherwise, so magic
  is always boosted. Which heart: a pinned one if you pinned it, else the Assumptions box's **Heart** (Saturated /
  Imbued), else the Saturated heart. It is drawn beside the potions (an inventory cell right after them, tooltip
  "magic's potion, from the kit") and listed in "Potions (from the kit)". Nothing pins it by default; "+ Saturated
  heart" / "+ Imbued heart" still pin one (carried even without a magic loadout, then reported under "Always brought but
  in no kit loadout"); a pinned heart with a magic loadout counts **once** (the optimiser charges no potion slot for
  magic then; the final count de-duplicates by id). **Search, Summary and Routes always assume the heart**; the Plan
  gives the same magic DPS.
- **ToA, CoX** (raid potions: Smelling salts / Overload boost every style): unchanged — every style keeps the raid
  potion iff the "Other" supply count is > 0 (the default), no heart slot; with 0 Other no style is boosted, except
  magic when a heart is pinned.

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
pouch / other, swap space, free; icons + tooltips; phase 30: brews / restores / food show the wiki's inventory images
(Saradomin brew(4), Super restore(4), Anglerfish; `src/public/img/supplies/`, bundled like upstream's potion images so
they show in dev without a CDN deploy), "Other" a generic flask, Ranging / Super combat / Saturated heart upstream's
images; a note on where the spec weapons come from: the planner or "Specs I bring"); kit loadouts with icon
rows and where each came from; "Potions (from the kit)" and "Ring" lines (phase 27; the old "unused potion supplies"
warning is gone: the kit never brings a potion it doesn't use); a warning with a one-click fix for always-brought items
no loadout wears ("Remove these to free N slots"), which re-plans; the
per-encounter table (loadouts and styles used, phase 33: the start-of-fight drain line, "avg DPS (time-weighted)" =
damage ÷ seconds, seconds; phase rows with each phase's DPS and drain plan, under "per-phase details", closed by
default); the route table; the why list; run statistics. "Load worn set into calculator" opens the calculator with the worn set against the route's first phase
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
raid tab opens, "reset" restores the pinned list). **Phase 30: the pinned lists are empty** (FA / ToB keep the
Saturated heart until phase 31); the "Items always brought" column below is the phase 21-29 list, kept for the
sources. CoX needs no pinned pickaxe: the Guardians take damage from pickaxes only, so every CoX plan adds the Dragon
pickaxe switch itself (the CoX pool and presets have it; `Phase30.test.ts`). Spec weapons come from the planner (phase 29; Elder maul left the FA / CoX / ToB
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
ranged loadout **one Ranging potion**; magic uses the pinned heart (phase 31: magic's kit potion is the heart, one slot
when the kit has a magic loadout; *Heart* above); ToA / CoX bring no combat potion (the
raid potion, "Other", boosts every style, as before). One potion item = one slot whatever its doses (no "Potion doses"
setting: upstream's boost model doesn't depend on doses). The potion slots are part of the kit's slot cost in the
optimiser (`KitProblem.potions`: one slot per distinct potion of the kit's members), so a melee + ranged + magic kit pays
2, a melee-only kit 1 and a magic-only kit 0, and adding a second style is weighed with its potion. The chosen potions
are in the inventory grid (tooltip "from the kit: one per style") and in a "Potions (from the kit)" line;
`PlanInputs.supplies` keeps its type, but its ranging / superCombat counts are ignored (`comfortSupplies`).

**Comfort supplies** stay user-entered: brew, restore, food, other ("Comfort supplies (your call)"), per-raid defaults in
`planDefaults.ts` (FA 6 brew / 4 restore, ToA 6 restore / 2 Other, CoX 2 / 2 / 1 Other, ToB 4 brew / 3 restore).

**Ring policy** (`PlanInputs.ringPolicy`, `RING_POLICIES`; phase 30: a "Rings" dropdown with the Plan inputs, its
one-line summary next to it — it was in the Advanced box; default `DEFAULT_RING_POLICY` = *Camp one ring*; `plan()` without a policy = *Allow ring switches*,
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
optimiser run (4 seeds) inside the kit optimiser, so gear and specs trade slots. **Review fixes**: (1) every subset's
seeds are ranked under *its own* drain table, and the best single loadout of every style group is always a seed
(`pickSeeds`; the quick runs used to take the first 4 seeds of a list ranked under the all-weapons table, which
favoured magic through Ayak's drain and pushed the group bests to the end, so {Tonalztics} never got a fair run);
(2) a guard like the ring guard: g = the best-by-quick subset's quick − full time; the best 3 by quick and every
subset whose quick time is within 2 g (`SUBSET_GUARD_FACTOR`) of the best full time get the full run; the fastest
full time wins (ties: fewer slots, fewer weapons). The DPS matrix is shared: one column per distinct drain state (the
DPS cache key is the monster's reductions), and the Solo reductions are cached by (phase, subset, energy-budget
bucket) across ring screens and re-plans (`SOLO_DRAIN_CACHE`).

**Ring guard** (review 2, all ring policies' camp-one runs, `guardedFullRuns`): the best *two* screened rings are planned
in full; g = the *largest* screen − full gap among the rings planned in full; every ring within 2 g of the best full
time is planned in full, re-checked after each full run. Before, g came from one ring (Lightbearer's screen was 18 s
off its full run, Ultor's 70 s), so with "Specs I bring" = {Elder maul, Tonalztics} the plan ended on Lightbearer
(1400.17 s) instead of Ultor (1382.50 s); misses of 17.7-27.1 s on 4 of the 32 subsets. Re-run of the reviewer's
brute force (every subset planned with and without the guard, `ringGuard: Infinity`): **0.00 s miss on all 32**.

**Ring and subset together** (camp one ring, review fix): the first ring screen searches the subsets, the other screens
time that subset; the best screened ring is planned in full (its own subset search). If that picks another subset,
the rings are screened again with it and the new best ring is planned in full if it changed (at most two rounds), so
the ring screens rank the rings with the subset that is actually brought (`specs.solo.screenedWith`, `ringRounds`).

**Reported**: "Bring: …"; per brought weapon "dropping X from this plan: +N s (frees 1 slot)" and **"best without X:
…, time"** (the fastest set timed without it); per weapon not brought "adding X to this plan: ±N s (1 slot)" (review
fix: these are one-change moves from the chosen set, not what a weapon is worth alone). Eye of Ayak's drain only helps
magic, so it is valued only through the kit's magic loadouts.

**Team** (party ≥ 2). **Carriers are planner output** (review fix; the user: "the plan runs and sets this
automatically, like 2 people need elder, 3 need ralos"). *Team carriers* (Advanced): **Planner decides** (default)
or *Set manually* (the counts, phase 28's behaviour; the only mode where the counts are editable and the
"N carriers > party size" warning shows). Planner decides (`greedyCarriers`, `PlanInputs.carrierMode`): the kit is
optimised under the Advanced counts, then from no carriers the planner adds one carrier at a time — the one (any
weapon) that lowers that kit's route time most — while it saves ≥ 1 s (`SHARE_MAX_SLOT_SECONDS`), at most the party
size in all; Eye of Ayak is a candidate only when **Mages in party** (Advanced (plan); default 1 if your kit has a
magic loadout, else 0) is > 0 (UNVERIFIED D22). Then the kit is re-optimised under those carriers (and if it changed,
the greedy runs once more on it). The Team drain state is `teamSpecPlan` with exactly these carriers (the 95 %-floor
ranking rule unchanged), so the briefing and "team brings ×N" agree by construction; Search / Summary keep using the
Advanced counts. *Team briefing*: per weapon the carriers, what the last one saves (route time without it) and the
encounters it saves the most on, plus the order they were added; the per-boss 95 % minimum (`recommendCarriers`) is
listed for reference. The drain line (review 2 wording): **"needed ×3 (86%) · team brings ×4 (8 hits, 98%)"** — N =
the fewest of that weapon's first-round specs that keep the ranked drain on this boss (`specsNeeded`, in upstream's
weapon order: the first weapon minimised with the others as brought, then the next given it, so on Xarth — where 4
maul or 4 Tonalztics alone each reach the floor — the maul reads "not needed" and Tonalztics "needed ×1 (66%)", not
both "not needed"); the % is P(floor from the first round) with those specs / with everything brought; "(→ Def X)"
instead when the plan doesn't rank at the floor (The Smorks, floor 0), "(→ magic def X)" for Eye of Ayak short of 0.
Hits are on the team's part only ("needed ×3 (6 hits)" read as six hits required: 4 hits reach AG's floor). Solo
lines: "×2 (4 hits)". **Phase 32 replaced this wording** (see *Phase 32* below): "needs 4 landed hits · 4 specs (2
carriers), 8 swings · 98%". The Xarth 66% is the ranking rule at work: below 95% the ranking uses the reachable Defence
nearest the expected one, which is still the floor there. **Phase 30**: when everything brought reaches the floor at
the confidence (P ≥ 95%), "needed" must too — the fewest specs that still do, not a smaller count that ranks at the
same Defence below the threshold (Eye of Ayak likewise for magic def 0). With the Advanced 2 / 2 / 1: AG Flying
"needed ×4 (98%) · team brings ×4 (8 hits, 98%)" (was ×3 (86%)); Xarth Elder maul "not needed", Tonalztics "needed ×2
(97%) · team brings ×4 (8 hits, >99.9%)" (was ×1 (66%)); Bork Elder maul "needed ×3 (98%) · team brings ×4 (99.6%)",
Tonalztics "needed ×3 (97%) · team brings ×4 (8 hits, 99.6%)" (was "not needed"). The Search drain box's carrier table
is labelled "Per boss minimum at 95% (for reference): …" (the planner's carriers are the Plan tab's).

*Your share* (`assignMe`, default "assign me"): the Team drain state counts every carrier whoever carries it, so
carrying gains *you* nothing; you get the most-needed weapon of the planner's carriers (most carriers; ties Elder maul,
ties: the weapon whose last carrier saves more (review 2; FA: Tonalztics 27.0 s over Elder maul 3.6 s), then Elder maul,
Tonalztics, DWH, BGS, Ayak) only if it is carried anyway, fits in a free slot, or the slot it takes is worth < 1 s of
route time as gear (the kit is re-optimised with the weapon carried to measure it); else "none: your last slot is worth
X s as gear — let a teammate carry …" (UNVERIFIED D21). *Specs I bring* is the manual override ("I'll bring: …").

**Ring toggle.** "I wear a Lightbearer" (the Solo regen flag) is a ring toggle now, not a spec weapon; on the Plan tab
the ring policy sets it (Camp Lightbearer: on; Camp one ring: on only if the planned ring is Lightbearer; Allow ring
switches: your toggle). Ayak hint in the results when it is carried but no kit loadout is magic (Solo) or Mages in
party is 0 (Team). The Search header no longer repeats the drain line: "ranked at Def … · Magic def …" only; at
party 1 the Search drain box has no team carrier table.

**Numbers** (defaults, Team, compare all, camp one ring; slow `CrossRaid` pins):

| Raid | Phase 28 | Phase 29 | **Review fixes (planner carriers; review 2: Ayak ≤ mages)** | Carriers picked | Your share |
|---|---|---|---|---|---|
| FA | 22:47.9 | 21:53.0 | **21:53.0** | 2 Elder maul, 2 Tonalztics | Tonalztics (review 2 tie-break), in a free slot |
| ToA | 14:22.3 | 14:10.5 | **14:10.6** (Ultor; review 1 without the cap: 13:19.6, 5 Ayak) | 1 Elder maul, 1 Tonalztics, 1 Eye of Ayak | none: slot worth 6.2 s (Ayak) |
| CoX | 6:40.3 | 6:36.3 | **6:36.3** | 2 Elder maul, 2 Tonalztics, 1 BGS, 1 Ayak | none: 3.4 s |
| ToB | 7:31.7 | 7:30.6 | **7:30.0** | 2 Tonalztics, 1 Elder maul | Tonalztics: slot worth 0.5 s |
| FA without Obligator + Ascension crossbows | 25:24.5 | 24:53.8 | **24:53.8** (Ultor) | 2 Tonalztics | Tonalztics, free slot |

**Phase 30 (empty pinned defaults; FA / ToB keep the heart)** — the same planner, the freed slots re-spent (slow
`CrossRaid` pins, `verifyPhase21 / 23 / 26 / 30`):

| Raid | Phase 29 (fixes 2) | **Phase 30** | What the freed slots buy |
|---|---|---|---|
| FA | 21:53.0 | **21:44.4** | 5 freed (Lightbearer, Zaryte crossbow, Kodai wand, Ancestral robe top, Elidinis' ward (f)): Ascension crossbows + diamond bolts (e) worn (Masori) beside the Twisted bow switch (+ Seeking dragon arrows) and Inquisitor's + Obligator — Archive Guardian 190.7 → 182.1 s; 3 slots stay free (nothing else saves ≥ 1 s per slot); carriers and share unchanged (2 maul + 2 Tonalztics; you: Tonalztics) |
| ToA | 14:10.6 | **14:06.0** | Lightbearer + Zaryte crossbow freed: a Twisted bow + Seeking dragon arrows switch (Zebak 126.5 → 121.9 s); your share still none (slot now worth 2.7 s) |
| CoX | 6:36.3 | **6:36.3** | none: the pinned Dragon pickaxe was already the kit's Guardians switch; the planner adds it itself (same kit) |
| ToB | 7:30.0 | **7:30.0** | none (only the heart was pinned) |
| FA without Obligator + Ascension crossbows | 24:53.8 | **24:45.3** | a Tumeken's shadow (Ancestral) loadout (the pinned heart, unused before, now boosts it) with the Twisted bow as a partial switch on it, route via Bork + Smorks; no spec weapon for you (slot worth 8.5 s) |

FA steps on the returned kit (phase 30): Tonalztics −223.9 s, Tonalztics −34.6, Elder maul −13.3, Elder maul −3.6.

FA 6-man, in the order added: Tonalztics −230.0 s, Tonalztics −35.2 s, Elder maul −13.3 s, Elder maul −3.6 s; the next
best (a third Tonalztics, an Ayak carrier without a magic kit) saves < 1 s. In the final kit the last Tonalztics
carrier saves 27.0 s (Ocellus 19.3, Bork + Smorks 4.2, AG 3.5) and the last Elder maul 3.6 s (Bork + Smorks). The old
briefing's "5 Tonalztics for The Smorks" (Def 0 at 95 % from the first round) is gone: carriers 3-5 save 0.58 s
together (reviewer's sweep). "Team carriers: Set manually" at 2 / 2 / 1 gives the same 21:53.0 (the Ayak carrier is
capped at the mages — 0 with this kit — with a note; more carriers than the party: only the first N count, noted).

**Review 2**: Eye of Ayak carriers are capped at "Mages in party" (the time model treats teammates as copies of you, so
an uncapped Magic-defence drain looked worth 5 carriers on ToA: UNVERIFIED D22; ToA steps then: maul −47.3, Ayak
−13.3 / −10.9 / −16.7 / −17.8 / −16.0 s; now maul −55.1, Ayak −14.0, Tonalztics −3.5 s). **Search / Summary follow the
planner's carriers**: in "Planner decides" mode, after a plan the disabled Advanced counts show its carriers and Search /
Summary use them (`withPlanCarriers`); before any plan they keep the defaults (note: "run a plan to fill these").
The briefing's steps are measured on the final kit (ToB: −34.3 / −10.4 / −3.5 s). Phase 30: always — each prefix of
the carriers added is re-timed on the returned kit (the greedy measured them on the kit before partial switches; ToB
showed −31.8 / −10.4 / −3.5 s).

**Solo, phase 30** (empty pinned defaults, party 1, camp one ring → Ultor; `verifyPhase29`): **22:01.3, "Bring: Elder
maul, Tonalztics"** (Elder maul saves 0.6 s in a free slot; kit Ascension crossbows (Masori) worn + Inquisitor's +
Obligator + Twisted bow). Brute force over all 32 sets ("Specs I bring", camp one ring, 2026-10-24): 1321.34 s best,
shared by {Elder maul, Tonalztics} and ten other sets pairing Tonalztics with Elder maul or DWH (BGS / Ayak on top change nothing); {Tonalztics} 1321.91;
the planner's pick is the optimum (0.00 s miss). The phase 29 numbers below are with the phase 29 pinned list (kept as
the input of the slow Phase29 regressions).

**Solo** (phase 29 FA defaults at party size 1, camp one ring → Ultor): **22:10.5, "Bring: Tonalztics"** —
the reviewer's brute force over all 32 sets (each planned with "Specs I bring", re-timed with `compareRoutes`) has
{Tonalztics} 1330.53 s fastest, then {Elder maul, Eye of Ayak} 22:42.7 (the phase 29 pick) and {DWH, Ayak} 22:46.1.
Dropping Tonalztics: +228.2 s; best without it: Elder maul + Eye of Ayak, 22:42.7; adding Elder maul +52.0 s, DWH
+52.0, Eye of Ayak +52.6, BGS +52.9 (each a slot worth more as gear). Kit: Twisted bow (Masori) worn + Inquisitor's +
Obligator. 22 distinct drain states, 10 dominated, 14 timed; the ring screens timed {Tonalztics} (one round).
Timings: Jest first Solo plan 44 s (searches included; 53 s before the fix, 123 s before the phase 29 caches); browser
20.5 s with the searches cached; a Team plan with planner carriers 21 s in Jest (first, searches included), 4 s with
manual carriers once cached.

### Quiver ammo and the heart (phase 31)

User requests (2026-10-24): the quiver should hold the crossbow's bolts when the bow's arrows are worn, and the heart
should be decided by the plan like the other potions.

**Quiver ammo** (`QUIVER_NAMES`, `isQuiver`, `isQuiverAmmo`, `quiverSpecOf`, `quiverSavedSlots`, `quiverHeldAmmo` in
planner.ts). Wiki, [Dizana's quiver](https://oldschool.runescape.wiki/w/Dizana%27s_quiver) (read 2026-10-24): "The
quiver provides an additional ammunition slot, which can only be filled with arrows or bolts", "only appearing if the
quiver is in the inventory or equipped". Rule: a kit that carries a Dizana's quiver (any variant: Charged / Uncharged /
Locked, Blessed Dizana's quiver, Dizana's max cape; not Decorative armour (quiver)), worn or in the inventory, and
**at least two** arrow / bolt types (ammo-slot items whose name says arrow(s) / bolt(s); not the Bolt rack, javelins,
atlatl darts, blessings; blowpipe darts aren't ammo-slot items) needs **one slot less**: one type is worn or in the
inventory, the other rides in the quiver. Only one extra type per quiver (three types: one free). With one type or no
quiver, ammo costs slots as before. The rule is in every slot count: the optimiser (`KitProblem.quiver`), the plan's
`usedWith` / `usedOfKit` (kit marginals, additions, alternatives, lighter kit), `kitSlotUsage` (`SlotUsage.quiverAmmo`)
and the inventory grid (`quiverHeldAmmo`: the first arrow / bolt type not worn by the worn loadout, in grid order, takes
no cell). The kit view draws it on the quiver's corner (worn cape slot, or the quiver's inventory cell) with the tooltip
"… held in the quiver (0 inventory slots)"; the free-slots tooltip reads "… − 1 ammo held in the quiver (name)".
UNVERIFIED D23 (the firing behaviour, the max cape / blessed quiver, and the one-type case not modelled).

**Heart**: see *Plan tab → Heart* — magic's kit potion in FA / ToB, not pinned; ToA / CoX unchanged.

**Solo spec weapons: 1 s per slot** (`SubsetProblem.slotSeconds`, default `SHARE_MAX_SLOT_SECONDS` = 1; `subsetScore`).
The subset search ranks subsets by route time + 1 s × slots, so a larger set wins only if it saves ≥ 1 s per extra slot
(the kit switches' dedupe rule and "assign me" use the same price); "best without …" is ranked the same way. A weapon
left out for that reason reads "adding Elder maul to this plan: −0.6 s (1 slot, < 1 s per slot)". `slotSeconds: 0` is
the phase 29 ranking (fastest, then fewer slots).

**Numbers** (defaults, Team, compare all, camp one ring; slow `CrossRaid`, `Phase31`; `verifyPhase31`):

| Raid | Phase 30 | **Phase 31** | Slots |
|---|---|---|---|
| FA | 21:44.4 | **21:44.4** | the quiver holds the Seeking dragon arrows (Ascension crossbows + diamond bolts (e) worn, Twisted bow switch) and the pinned heart (no magic loadout) is gone: 23 of 28 used, 5 free (was 3); nothing saves ≥ 1 s per slot |
| ToA | 14:06.0 | **14:04.1** | the quiver holds the Diamond ascension bolts (e) (Twisted bow + Ascension crossbows); the slot buys a Keris partisan of breaching (Torva) loadout, Kephri 147.7 → 145.8 s; 28/28 |
| CoX | 6:36.3 | **6:35.9** | the quiver holds the Diamond ascension bolts (e) beside the Seeking dragon arrows; the kit re-shuffled (Inquisitor's + Obligator worn, Twisted bow and Scorching bow switches; Tekton 16.3 → 14.4 s); 28/28 |
| ToB | 7:30.0 | **7:30.0** | the heart (its Shadow switch) is now a kit potion: same slot, same kit; one bolt type, nothing in the quiver |
| FA without Obligator + Ascension crossbows | 24:45.3 | **24:45.3** | the heart (Tumeken's shadow loadout) now a kit potion: same slot; one arrow type |
| FA Solo, party 1 | 22:01.3 (Elder maul + Tonalztics) | **22:01.9, Bring: Tonalztics** | Elder maul saved 0.57 s for its slot (< 1 s); the quiver holds the Seeking dragon arrows; 23/28 |

### Zero-value switch items and drain-line units (phase 32)

User reports (2026-10-24): an FA plan at party 4 without Obligator charged a slot for Rada's blessing 4 in the melee
switch ("Free slots 0 / 28"), and the drain line "needed ×4 · team brings ×4 (8 hits, 98%)" read as 4 people / 8
landed hits.

**Rule**: an item in a switch that changes none of that loadout's DPS costs no slot and is not shown. In practice the
ammo slot: Rada's blessing 4 (prayer +2 only; the prayer bonus is not modelled) was the ammo-slot filler of the melee /
magic presets (`MELEE_FILL`, `ANCESTRAL`) and of the search pool's melee / ranged / magic `ammo` slot; it left all
of them. `isUnusedAmmo` (planner.ts) drops any ammo-slot item on a weapon that fires no ammo
(`ammoApplicability` ALLOWED) with no melee / magic attack or strength stat and no effect (Crystal blessing keeps its
effect) from a candidate before it is costed or shown, and `equipmentItemIds` never counts one (a pinned blessing is one
pinned item). **The ammo slot keeps what is in it**: a loadout without ammo of its own keeps a kit ammo item there — the
bolts stay equipped while meleeing, and a melee worn set starts with one of the kit's ammo items in its slot
(`wornItemCounts`, `wornKeptAmmo`; `SlotUsage.keptAmmo`; `KitProblem.wearsAmmo`): such a loadout holds one
inventory item fewer. Without this the blessing's slot would only move to "swap space". The worn grid draws the kept
ammo (dashed, "a switch's ammo, worn here too …"); the free-slots tooltip says "(… worn in the ammo slot)". Jest
(`Phase32.test.ts`): a melee / magic preset's DPS is identical with no ammo, the blessing or any pool arrow / bolt /
javelin / dart on every phase of every raid; brute force over all 8191 subsets of the FA presets vs an exhaustive
count of every worn state (UNVERIFIED D25).

**The user's plan** (FA, party 4, Camp Lightbearer, 6 brew / 4 restore / 2 other, 1 rune pouch, not owned: Obligator,
Zorya's tome, Rondache, Inquisitor's helm / hauberk / plateskirt / mace): 25:47.4 → **25:46.3**. The melee switch
(Torva + Scythe + Oathplate chest) drops the blessing (10 → 9 items); the freed slot buys a third bolt type, the void
Ascension crossbows switch firing Onyx ascension bolts (e) instead of diamond (−1.1 s for 1 slot), so it is still
0 / 28. The "Zaryte crossbow + Ruby dragon bolts (e) #2 (+3 slots)" candidate (not in this kit; it saves 0 s here): its
three items are the Zaryte crossbow, the Ruby dragon bolts (e) and the **Twisted buckler** — the crossbow is one-handed
and the worn Ascension crossbows are two-handed, so the shield comes with it; the buckler is +18 ranged attack, +10
ranged strength (a DPS item, ≥ 3 % on AG Flying), not a zero-value item.

**Numbers** (defaults, Team, camp one ring; slow `CrossRaid`, `Phase29`, `Phase27`, `Phase32`; `verifyPhase32`):

| Plan | Phase 31 | **Phase 32** | Slots |
|---|---|---|---|
| FA | 21:44.4 | **21:44.4** | same kit; the Inquisitor's + Obligator switch is 9 items: 6 free (was 5) |
| ToA | 14:04.1 | **14:04.1** | same kit; the worn Keris partisan (Torva) keeps the Diamond ascension bolts (e) in its ammo slot: the freed slot carries your share, Eye of Ayak (was none) |
| CoX | 6:35.9 | **6:35.9** | same kit; the worn Inquisitor's + Obligator keeps a switch's bolts: your share Tonalztics in the freed slot (was none) |
| ToB | 7:30.0 | **7:29.5** | the Tumeken's shadow partial switch becomes the full Tumeken's shadow (Ancestral) loadout (Nylocas 41.5 → 41.0 s); carrier steps on this kit: Tonalztics −31.8, Elder maul −10.4, Tonalztics −3.5 s (phase 31 kit: −34.3). The −0.5 s is a 0.5 s-per-slot upgrade (the Imbued Guthix cape of the full Shadow loadout, one slot): the 1 s per slot rule applies per loadout (the Shadow loadout as a whole saves 15.7 s), not per item |
| FA without Obligator + Ascension crossbows | 24:45.3 | **24:34.1** | the worn "Twisted bow switch +5 on Tumeken's shadow" becomes the full Twisted bow (Masori) (AG 198.9 → 196.5, Ocellus 775.4 → 767.3 s) |
| FA Solo, party 1 | 22:01.9 | **22:01.9** | same kit; 6 free (was 5) |
| The user's plan | 25:47.4 | **25:46.3** | the slot buys Onyx bolts (−1.1 s); 0 free |
| Phase 29 regression ({Elder maul, Tonalztics}, Solo party 1, phase 29 pinned list) | 1382.50 s | **1329.96 s** | — |
| Reduced pools, allow ring switches (`Phase27`) | FA 1533.2 / ToA 879.7 s | **1493.8 / 872.6 s** | — |

**Drain-line units.** Every number says what it counts (`neededText`, drainLine.ts; `landedToReach` / `landedNeed` /
`soloNeeds`, teamSpecs.ts). Team, per weapon: **"needs 4 landed hits · 4 specs (2 carriers), 8 swings · 98%"** — the
fewest landed drains of that weapon alone from the start Defence to the ranked Defence (Tonalztics: hits of trunc(Magic
/ 8); Elder maul / DWH: landed specs; BGS: "≈ N damage"; Eye of Ayak: "≈ N magic defence drained"), the needed specs, the
carriers they take (2 first-round specs each for a 50 % weapon), the swings (a charged Tonalztics spec swings twice), and
P(the drain lands within the first round) — or "→ Def X" / "→ magic def X" when the plan doesn't rank at the floor /
0. When the team brings more: " · team: 6 specs (3 carriers) · 99.8%"; "not needed · team: …" when 0 are needed. When
a weapon alone would need more landed drains than its needed specs can land (Bork: Tonalztics backs up the maul), the
count is from the Defence the others leave: "needs 2 landed hits once 1 Elder maul spec lands (Def 195)"; if even that
doesn't fit, "needs the other drains too" (ToA scarabs: one maul spec + Tonalztics). Solo lines likewise, without
carriers: "needs 3 landed hits · 2 specs, 4 swings · → Def 167" (the plan's P(floor) / ranked Defence). The tooltip
explains it: "4 landed hits of Tonalztics alone take Def 260 → 156; a charged Tonalztics spec swings twice and each
swing can miss; the % is the chance the Defence reaches the floor in the first round with these specs and the other weapons' specs". Default carriers (2 / 2 / 1):

| Boss | Elder maul | Tonalztics | Eye of Ayak |
|---|---|---|---|
| AG Flying | — | needs 4 landed hits · 4 specs (2 carriers), 8 swings · 98% | needs ≈ 39 magic defence drained · 2 specs (1 carrier) · → magic def 91 |
| Xarth | not needed · team: 4 specs (2 carriers) · >99.9% | needs 2 landed hits · 2 specs (1 carrier), 4 swings · 97% · team: 4 specs (2 carriers) · >99.9% | needs ≈ 25 magic defence drained · 2 specs (1 carrier) · → magic def 180 |
| Bork | needs 2 landed specs · 3 specs (2 carriers) · 98% · team: 4 specs (2 carriers) · 99.6% | needs 2 landed hits once 1 Elder maul spec lands (Def 195) · 3 specs (2 carriers), 6 swings · 97% · team: 4 specs (2 carriers) · 99.6% | needs ≈ 40 magic defence drained · 2 specs (1 carrier) · → magic def 260 |

Solo, AG Flying with Tonalztics: "needs 3 landed hits · 2 specs, 4 swings · → Def 167". The calculator's Max-drain
buttons keep "×2 (4 hits)" (those are landed hits); the planned lines' tooltips say "(8 swings)".

### Specs follow the plan; one drain line per encounter (phase 33)

User review of the phase 32 plan (2026-10-24): "Specs I bring" stayed lit (Elder maul, Ayak × 2) while the planner
decided the spec weapons, and Bork + Smorks showed five drain lines when the team specs once at the start.

**Specs I bring** defaults to none for every raid (`DEFAULT_ASSUMPTIONS.mySpecs`: every weapon off, Ayak 0; ToA / CoX
/ ToB copy it). The row has a mode select, shared with the Plan tab's **Spec weapons** (one setting; the page holds it,
so it survives leaving the Plan tab, not a raid change):

- **Planner decides (Plan tab)** (default): the chips are read-only (dashed, disabled) and mirror the last plan's
  "Bring" — Solo: the weapons the subset search picked; Team: your share when it is carried (none otherwise) —, with
  "(from the last plan; Search / Summary use them)", or "(run a plan to fill these)" and every chip unlit before a plan
  has run. Search / Summary's Solo drains use exactly those weapons, as the plan's own Solo drain state
  (`withPlanSpecs` in specChoice.ts → `mySpecsForSubset`: Eye of Ayak "until magic def 0", Defence drains first; the
  Lightbearer flag is the user's). Before a plan: no spec weapons. A plan with drains "None" decides nothing and leaves
  the last "Bring".
- **Set manually**: the editable chips (and Ayak × N), as before; the Plan tab uses them ("Spec weapons: Specs I bring").

With no spec weapons, the Search tab's Solo drain box says so: "no spec weapons: run a plan or pick Specs I bring" (no
empty line). The "≈ X magic def drained" hint shows only when Eye of Ayak is in the Solo specs. `plan()` itself still
defaults to `specMode: 'manual'`; tests written against the old default keep it as an explicit input
(`src/tests/utils/phase32Specs.ts`).

What moved (Search, FA party 6, Solo drains, top row of the search; phase 32 default = Elder maul + Ayak × 2 → phase 33
before a plan = none → after the FA Team / Solo plans = Tonalztics, the plans' "Bring"): Bork (armour 8) 10.327 →
8.945 → 9.235 (Def 195 → 300 → 278); AG Flying 10.095 → 9.387 → 11.127 (magic def 91 → 130; Def 260 → 260 → 167);
AG Grounded 12.855 → 11.413 → 12.887; Xarth 13.917 → 12.839 → 13.917; Moia 10.931 → 10.084 → 11.386. The Summary's
Solo column moves the same way. No plan total moves (the Plan tab already defaulted to "Planner decides").

**One drain line per encounter** (`encounterDrainSummary` in drainLine.ts; PlanView `EncounterDrains`): the encounter
row's Drains cell shows the specs at the start of the fight, computed on the first phase (in the encounter's phase
order) whose drain line specs at least one weapon — that phase's own numbers. A later phase whose set of spec weapons
differs gets its own line, labelled with the phase (its share dropped). Team:

| Encounter | Line (FA defaults, party 6: 2 Elder maul + 2 Tonalztics carriers) |
|---|---|
| Archive Guardian | Flying shield: 2 Tonalztics carriers (4 specs) → Def 156 · 98% · Grounded: 2 Elder maul carriers (4 specs) + 2 Tonalztics carriers (4 specs) → Def 156 · >99.9% |
| Bork + Smorks | Start of fight: 2 Elder maul carriers (4 specs) + 2 Tonalztics carriers (4 specs) → Def 180 · 99.6% (phase 35b: one line per NPC, "Bork: … → Def 180 · 99.6% · Smorks: … → Def 5"; see *One drain line per NPC*) |
| Moia | Start of fight: 2 Tonalztics carriers (4 specs) → Def 117 · >99.9% |
| Xarth | Start of fight: 2 Elder maul carriers (4 specs) + 2 Tonalztics carriers (4 specs) → Def 102 · >99.9% |
| Ocellus | P1 at a corner: 2 Elder maul carriers (4 specs) + 2 Tonalztics carriers (4 specs) → Def 129 · >99.9% · P3 last quadrant, Deflect Melee: 2 Tonalztics carriers (4 specs) → Def 150 · 84% |

Solo (party 1, Bring Tonalztics, 22:01.9): "Start: 3 Tonalztics specs → Def 156 · 86%" (AG; the same weapon on every
phase, so one line), Ezekiel "Start: 3 Tonalztics specs → Def 80", Moia "… 2 … → Def 117 · 99%", Xarth "… → Def 102 ·
97%", Ocellus "… → Def 129 · 99%". Carriers = specs ÷ 2 (first-round specs per carrier); the % is the first Defence
drain weapon's P(floor) (Team: with everything the carriers bring; Solo: with your specs), left out when the line ranks
short of the floor ("→ Def X" is then the Def shown); "· magic def X" when Eye of Ayak is specced. Specs that don't fit
in the energy (×0) are left out. The parts are separate lines in the cell (the text joins them with " · ").

**Drain events** (coordinator amendment, 2026-10-24): some bosses get their Defence back mid-fight, and the team drains
again. The time models flag those phases (`PlannedPhase.drainReset`, carried into `PhaseTime`, a reason such as
`maze 1`), instead of the summary reading labels; the encounter line is grouped per drain event (the start, then each
flagged phase; unflagged phases share the event before them: Bork armour 8 → 14, AG shield → flying, Ocellus
quadrants). Flagged with the defaults of all four raids (`Phase33.test.ts` checks the flag = the labels saying "Defence
restored"): ToB **Sotetseg** thirds 2 and 3 ("After clearing the maze, Sotetseg's Defence level is restored, necessitating
further Defence-draining special attacks", Strategies) and ToB **Bloat**'s later downs ("If its Defence has been reduced,
it will regenerate to full when it stomps"; the restored Bloat takes no drains in the model, so that event reads "no
specs"). Sotetseg therefore shows three lines: "Start of fight: …", "After maze 1 (Defence restored), again: …", "After
maze 2 (Defence restored), again: …". Not flagged: CoX Tekton ("no longer resets his Defence when healing at the anvil":
drains carry), Vanguards (no drains at all), Verzik / Xarpus / Nylocas / Maiden (no restore in the sources), ToA
Wardens P3 ("Defence … raised 30 levels to 180": a raise, not stated as a restore; the P3 rows are their own targets
anyway), Akkha's final stand (hp, not Defence), CoX Olm's hand phases (whether a drain carries from one hand phase to
the next isn't in the sources; the line shows the first phase). The maths is unchanged: every phase's drain plan still starts with
100% spec energy, so a re-drain after a reset is assumed to have the energy (the encounter line's tooltip says so; phase
36 shares one spec budget per encounter).

The per-phase rows keep their phase 32 lines unchanged, under one **"▸ Show per-phase details (N phases)"** toggle for
the whole table (closed by default; one click opens every encounter's rows, which keeps the columns aligned). Search
and Summary keep their per-phase lines. Bork + Smorks at the default 0% stun uptime has five rows (armour 8 / 10 / 12 /
14, the Smorks; the stunned row has no damage); with a stun uptime it has six, still one line.

**Quiver review nits**: UNVERIFIED D23 now quotes the Dizana's max cape page in full, records that two types of the
same kind (bolts + bolts) still free the slot though switching between them needs a manual swap (not modelled;
limiting `quiverSavedSlots` to one arrow + one bolt type isn't a one-line change, so it is documented only), and that a
quiver only pinned or worn by a non-ranged loadout still frees the slot (storage per the wiki; firing unverified).

### Reading the Plan tab (phase 34: readability, all three tabs)

User review (2026-10-24): "very easy to get the information you are looking for, very user friendly. If it doesn't
provide useful information we should hide it." The default view of every tab now shows only what a raider acts on —
what to wear, what to spec, how many, how long — as icons and bold numbers; every explanation, intermediate number and
alternative is in a tooltip or a section closed by default. **No number changed** and no pinned string changed except
the drain-line wording below (Phase34.test.ts pins the FA Team plan's free slots and every string that moved;
`verifyPhase34.mjs` compares the page). Screenshots: `docs/screenshots/phase34-before-*.png` /
`phase34-after-*.png` (Search, Plan, Summary at 1400 px; the Plan at 390 px), `phase34-after-plan-details.png` (every
section open).

**The Plan tab, top to bottom:**

1. **Headline**: route · **total** (tooltip: fastest route with this kit · how HP becomes time) · **Free slots** ·
   "↗ Load worn" / "↗ Load all" (the calculator buttons).
2. **Raid briefing** (`PlanBriefing.tsx`, data `briefing.ts` `briefingRows`), one row per encounter of the planned route:
   boss image and name; **Wear**: each kit loadout used (worn first), as its weapon icon plus the rest of its items as
   small icons, coloured by style (red melee, green ranged, blue magic), the loadout name as the tooltip (phone width:
   the weapon only); **Specs at the start**: per drain weapon a large icon and one bold number (drainLine.ts
   `briefText`): Tonalztics **4 hits** (the landed hits it needs), Elder maul / DWH **2 specs** (landed specs), BGS
   **N specs**, Eye of Ayak **≈ 39 magic def** (drained), then a small "→ Def 156" (+ "· Magic def X" with Ayak); a
   weapon the other specs make unnecessary ("not needed") is left out of the short line. Carriers are not repeated (the
   Spec plan's team briefing says them). Several parts (AG flying / grounded, Ocellus P1 / P3) get a small label each;
   Sotetseg's three identical drain events read once with **× 3**; an event with no specs (Bloat after the stomp) is left
   out. The full phase 33 line ("Start of fight: 2 Elder maul carriers (4 specs) + …") is the tooltip. Phase 36 adds
   your damage specs per row ("You: [icon] ×N") and a "dose" marker on the rows that get a surge dose. **Seconds**.
3. **Bring: [icons]** and **Your share** (Team) — the actions (phase 36: "Surge dose at: [icon] Ocellus" under Bring
   when the kit carries a Surge potion).
4. A warning when an "always brought" item is in no loadout (with the button that removes it).
5. **The kit**: the worn grid (and its name, with the weapon icon) and the 28-slot inventory.
6. Closed sections:
   - **Why this kit**: the kit loadouts ("Worn: …" / "Switch: …" with the weapon icon, style, source, "+N slots, saves
     X s", item icons), "Potions (from the kit)" and "Ring: … · others: …" with icons, the spec-weapon note, "Faster with
     one more loadout…" / "No other candidate…", the alternatives (each with its loadouts' weapon icons; `PlanRejection
     .weapons`), the planner stats footer.
   - **Spec plan**: Solo: what each spec weapon saves, the best set without each, the others; Team: the team briefing
     table (weapon icons), "Added in this order" (icons), the per-boss minimum (its own nested toggle); spec notes.
   - **Per-phase details**: phase 33's encounter table (its "Show per-phase details" toggle for the phase rows inside)
     and the route comparison table.

**Drain-line wording** (tooltip and the per-phase rows; drainLine.ts `specsText`): Tonalztics "swings" became
"attacks", with the landed count: "needs 4 landed hits · 4 specs (2 carriers) = 8 attacks, 4 must land · 98%" (Solo:
"4 specs = 8 attacks, 4 must land"; "needs the other drains too · 4 specs (2 carriers) = 8 attacks · 98%"); the
tooltip's "a charged Tonalztics spec attacks twice and each attack can miss"; Elder maul / DWH / BGS read specs only
(one attack each). Tests and verify scripts were re-pinned to this text only.

**Where every old element went:**

| Tab | Element | Now |
|---|---|---|
| Assumptions | "All skills 99 · Piety / Rigour / Augury" | tooltip of "Assumptions" |
| Assumptions | Melee / Ranged potion, Heart (native selects) | icon lists (`IconSelect.tsx`, `potionChoices.ts`): Super combat, Overload (+), Smelling salts / Ranging potion, Overload (+), Smelling salts / Saturated, Imbued heart first, the rest under "▸ more" (the same options as the old selects) |
| Assumptions | Zeal | checkbox with the Zeal prayer icon (stays visible) |
| Assumptions | Elemental fragments | Advanced |
| Assumptions | Solo Ayak hint ("Solo: ≈ 40 magic def drained …") | "ⓘ" with the hint as tooltip |
| Assumptions | "(from the last plan; Search / Summary use them)", the ring lock reason | screen-reader text (the chips' tooltips say it); "(run a plan to fill these)" stays visible |
| Plan inputs | intro paragraph | tooltip of "Assumptions (plan)" |
| Plan inputs | Route, potions note, "Raid items (0 slots)" (icons) | Advanced (plan) |
| Plan inputs | ring summary ("one ring on every loadout: Ultor ring …") | the Rings select's tooltip (screen-reader text) |
| Plan inputs | "+ Saturated heart" / "+ Imbued heart" | with their icons |
| Plan result | "(fastest route with this kit) · times: …" | tooltip of the total |
| Plan result | kit loadout list, potions, ring + alternatives, spec-weapon note, rejected / alternative kits, stats | Why this kit |
| Plan result | team briefing table, added in order, per-boss minimum, Solo weapon list, spec notes | Spec plan |
| Plan result | "Bring:", your share | visible, under the briefing (with icons) |
| Plan result | encounter table (phase 33), route comparison | Per-phase details |
| Plan result | "Excluded: …" | stays, item names with icons |
| Search | the drain line ("[icon] needs 4 landed hits · …", "94% land", "(fight ≈ 15 s → 2 specs)") | header: "[icon] **4 hits** → Def 156 · Magic def 130"; the sentence form, hit chances and Solo budget under the box's "details" |
| Search | "Chance of the Defence floor", "Per boss minimum" table | the drain box's "details" |
| Search | ranked-at, best preset, evaluations / timings / TTK note, can't-hit list | "Search details" (closed) |
| Search | "Tries every end-game item…" | tooltip of the controls row |
| Search | "vs best preset", Max hit, Accuracy columns | tooltip of the DPS cell |
| Search | item list under the icons, "search started from" | tooltip of the icon row |
| Search | "uses: …" badge | stays, item names with icons |
| Summary | "best preset N · load" | best preset in the DPS line's tooltip; "↗" load button |
| Summary | drain line + "(fight ≈ 15 s → N specs)" | icon + bold number ("[icon] 3 hits → Def 167"); the sentence and the budget are the tooltip |
| Summary | "Top gear-search result…" | tooltip of the controls row |

**Item icons** (`ItemNames` in ItemIcons.tsx: an icon before each name, the text unchanged; `itemImageByName` in
loadoutIcons.ts): the potion pickers, "Potions (from the kit)" (bundled potion / heart images), "Ring: …" and the other
rings, "Worn: …" / "Switch: …", the worn grid's name, the alternatives, "uses: …" badges (Search, Summary), "Excluded:
…", "Always brought but in no kit loadout", the raid items, the spec-weapon note, "Added in this order", your share,
the team briefing, every drain line, and (already) the Items I always bring / don't own chips.

**Checks**: `Phase34.test.ts` (briefText per weapon, briefItems, the rewording, briefing rows for FA Team / Solo / ToB
Sotetseg × 3, the potion lists = the old options, render-level tests that every briefing loadout / spec / item name has
its icon; slow: the FA Team plan's total, briefing, phase 33 encounter lines, "Why this kit" and "Spec plan" strings).
`verifyPhase34.mjs`: default views show no sentence-form drain text, the sections open the old content, icons present,
no horizontal page scroll at 390 px. The older verify scripts open the sections first (`scripts/phase34Sections.mjs`).
The upstream top bar is 393 px wide at a 390 px viewport (the main calculator too): not this page's; the check is that
nothing in the best-setup panel overflows outside a table scroller.

### Targets that never get specs (phase 35: no specs on adds)

Why a flat rule is right for multi-copy phases: a spec drains only the NPC it hits, but the time model applies one drain to every copy in a phase (5 Mystics, 3 Shamans, 4 crystals, 4 Shadows), so the old savings were overstated about N times (phase 35 review: Mystics ≈ 2.4 s at best per drain round, versus the 12 s the model claimed). Single-NPC adds (the portal, the small Muttadile, the scarabs) are worth 0.6–3.6 s each with a fresh budget; phase 36's one-budget-per-encounter decides those.

User, 2026-10-24: "you obviously aren't going to Ralos or Elder maul spec the little minions that die in a few hits
anyway". Until phase 35 every add was its own drain plan with a fresh 100% spec budget (Team: the carriers' first
round; Solo: your energy), which overstated what drains are worth (a Mystics room ranked every mystic at the drained
Defence of one spec round). Now these targets carry `noDrains` and are ranked at **full Defence** in every drain state
(Search, Summary, Plan; `buildTargetMonster`, bestSetup.ts):

| Raid | Never specced | Reason (`noDrains`) |
|---|---|---|
| ToA | Spitting / Soldier / Arcane Scarab, Akkha's Shadow | "adds: not worth a spec" |
| CoX | Skeletal Mystic, Lizardman shaman, Muttadile (small), Glowing crystal (Vasa), Abyssal portal (Vespula) | "adds: not worth a spec" |
| ToB | the six wave nylocas (Ischyros / Toxobolos / Hagios, small / big; Search only) | "adds: not worth a spec" |
| FA | Jelly (Dreadnoth) (Search only; the time model ignores the jellies) | "adds: not worth a spec" |
| CoX | Vanguards (phase 19) | "Vanguards restore drained stats in their shell" |
| ToB | Bloat after a stomp, Verzik P1-P3 (phase 20) | Bloat's Defence "will regenerate to full when it stomps"; "Verzik Vitur absorbs the defence reduction!" |

The wiki phrase per add: docs/DATA_SOURCES.md *Phase 35*. **Judgement calls** (keep their drains): the Ice demon (the
room's only target), Tekton, Vasa, Vespula, the large Muttadile (the room's boss), Olm's hands and head (phases of the
boss), ToA's Obelisk (Wardens P1) and the Warden core, Kephri (shielded), the FA Dagon'hai trio (the encounter's
bosses), Ocellus P2 (the Blade, a boss phase), The Smorks.

**What the user sees.** Search: the drain box reads "No drains: adds: not worth a spec" (also with Solo and no spec
weapons; no per-boss minimum table). Summary: "no specs (adds)" in the Solo / Team cells (the reason is the tooltip;
Vanguards / Verzik / Bloat restored say "no specs"). Plan: the add phases' per-phase rows say "no specs (adds)" and
show no drain icons; the briefing, the encounter drain line, the team briefing's per-boss minimum and the carriers'
"saves most on" never list an add. The greedy carriers count route time, and an add's seconds are the same with or
without carriers, so they no longer earn a carrier anything (checked in `Phase35.test.ts`).

**Numbers** (defaults, Team, camp one ring; slow `CrossRaid`, `Phase27`; `verifyPhase23` / `32` / `35`):

| Plan | Phase 34 | **Phase 35** | What moved |
|---|---|---|---|
| FA | 21:44.4 | **21:44.4** | — (no adds in the time model) |
| ToA | 14:04.1 | **14:12.1** | same kit; Akkha 138.5 → 144.5 s (the 4 shadows 42.8 → 48.8), Kephri 145.8 → 147.8 (Spitting 5.9 → 6.8, Soldier 6.0 → 6.6, Arcane 5.9 → 6.4); carriers 1 Elder maul + 1 Tonalztics + 1 Eye of Ayak → 1 Elder maul + 1 Eye of Ayak (the Tonalztics carrier saved 3.5 s, mostly on adds); your share Eye of Ayak → Elder maul |
| CoX | 6:35.9 | **7:01.3** | same loadouts; Mystics 31.8 → 43.9 s, Shamans 25.1 → 29.7, Vespula 19.3 → 23.4 (portal 12.2 → 15.8, Vespula 7.1 → 7.6: one Tonalztics carrier fewer), Vasa 18.5 → 21.8 (crystal 5.6 → 8.9), Muttadiles 21.6 → 22.8 (small 11.0 → 12.3), Olm 189.6 → 189.7; carriers 2 Elder maul + 2 Tonalztics + 1 BGS + 1 Eye of Ayak → 2 + 1 + 1 + 1; your share Tonalztics → Elder maul |
| ToB | 7:29.5 | **7:29.5** | — (the wave nylocas are not in the time model) |
| Reduced pools, allow ring switches (`Phase27`) | ToA 872.6 / CoX 411.9 s | **879.6 / 442.0 s** | — |

The fast pins (`CrossRaid`, the raid's first melee / ranged / magic preset): ToA Kephri 153.8 → 155.5, Akkha 160.9 →
161.6; CoX Vasa 20.1 → 22.9, Vespula 23.3 → 24.1, Mystics 44.8 → 52.4, Shamans 32.1 → 37.5, Muttadiles 23.9 → 24.0.
Search / Summary on the Jelly: Solo and Team now equal None (the 2026-10-22 snapshots below show the old drained
columns).

### One drain line per NPC (phase 35b)

User, 2026-10-24 (the FA plan briefing): "It says Bork + Smorks. But they are separate bosses. I can't tell which I
should use elder/ralos on". Phase 33's encounter line started a new drain event only on a Defence reset, so every target
of an encounter shared the first phase's line: The Smorks (Def 220, floor 0) was hidden under Bork's (300 → 180), and
the Wear cell listed both NPCs' loadouts without saying which is whose. UI only: **no number changed** (FA 21:44.4; the
per-phase strings are as before).

**Who is the same NPC.** A new optional target field `npc` (`BestSetupTarget`, src/lib/raids/types.ts); briefing.ts
`phaseNpc(targetKey)` = the target's `npc`, else its monster `name`. So the phases of one monster are one NPC without
any data (AG flying / grounded, Bork's armour 8–14 and stunned rows, Ocellus P1 / P2 (the Blade) / P3, Kephri shielded /
unshielded, Tekton / enraged, the Nylocas Vasilias forms, Verzik P1–P3, Elidinis' Warden shield / core), and `npc` is
set only where one monster name covers different NPCs or the name is long: The Smorks → "Smorks", the ToA Obelisk →
"Obelisk", CoX Olm → "Right claw" / "Left claw" / "Head", the Vanguards → "Melee / Ranged / Magic vanguard", the
Muttadiles → "Small / Large muttadile". This was the least invasive choice: no time-model change, the grouping follows
the target the phase already names. The Dagon'hai trio is one target (Elder + Monks share stats and one health pool), so
one line.

**Drain events** (`encounterDrainSummary(phases with npc)`, drainLine.ts): each NPC's phases are its own event, in the
order the NPCs first appear; an NPC that comes back after another (Kephri after the scarabs, Olm's claws in phases
2 / 3) joins its first event; a `drainReset` phase still starts a new event of its NPC (Sotetseg's mazes, Bloat's
stomp). NPCs nobody specs (the phase 35 adds, Vanguards) get no line. When more than one NPC is specced, every event is
named — briefing "Bork: [maul] **2 specs** [ralos] **2 hits** → Def 180" and "Smorks: [maul] **4 specs** [ralos] **2
hits** → Def 5" on two lines (tooltip / per-phase details: "Bork: 2 Elder maul carriers (4 specs) + 2 Tonalztics
carriers (4 specs) → Def 180 · 99.6% · Smorks: … → Def 5"); an NPC with several parts reads "Elidinis' Warden, P2
shield" / "…, P2 core"; a reset reads "Bork, after the stomp". Two NPCs with the same numbers stay two lines (the "× 3"
merge is for one NPC drained again). Single-NPC encounters are unchanged (phase 33 / 34 form).

*Phase 37 fix* (user, FA party 4: the budget gave Bork no specs and everything to The Smorks; the briefing showed one
unlabelled "[Tonalztics] 8 hits · [BGS] 2 specs → Def 48" and Bork's line was gone): the names and lines come from the
NPCs that can be drained (a drain line on a phase whose target has no `noDrains`), specced or not, so the line reads
"Bork: no specs · Smorks: Tonalztics 8 hits + BGS 2 specs → Def 48" in the briefing (Bork's group shows "no specs") and
the tooltip alike; a named NPC's event without specs is in the short line too, as in the full text (CoX Olm: "Right
claw: no specs", ToA Wardens: "Elidinis' Warden: no specs"). Adds and other `noDrains` targets still get no line;
an unnamed event without specs (Bloat after the stomp) stays out of the short line. Display only, no number changes.

**Wear per NPC** (`wearGroups`, briefing.ts; PlanBriefing.tsx): when the NPCs don't all use the same loadouts, the Wear
cell has one line per NPC, "Bork: [loadout icons]" / "Smorks: [loadout icons]"; NPCs with the same loadouts share a line
("Spitting Scarab, Arcane Scarab: …"). One loadout list for everyone keeps the phase 34 cell. Phone width: the weapon
icon only, as before.

The briefing of every multi-NPC encounter (Plan tab, defaults, Team, the plan's kit; `verifyPhase35b.mjs`):

| Raid | Encounter | Specs at the start | Wear |
|---|---|---|---|
| FA | Bork + Smorks | Bork: Elder maul 2 specs + Tonalztics 2 hits → Def 180 · Smorks: Elder maul 4 specs + Tonalztics 2 hits → Def 5 | one loadout (Inquisitor's + Obligator) for both; with Obligator not owned: "Bork: Tumeken's shadow switch …" / "Smorks: Ascension crossbows …" |
| FA | Archive Guardian | Flying shield: … · Grounded: … (one NPC, two parts, unchanged) | unchanged |
| FA | Dagon'hai trio | one line (one target) | unchanged |
| FA | Ocellus | P1 at a corner: … · P3 last quadrant, Deflect Melee: … (one NPC, unchanged) | unchanged |
| ToA | Kephri | one line (Kephri; the scarabs have no specs) | Kephri: Keris · Spitting Scarab, Arcane Scarab: Twisted bow · Soldier Scarab: Tumeken's shadow |
| ToA | Akkha | Akkha's praying parts as before (the shadows have no specs) | Akkha: Shadow + ACB + Fang · Akkha's Shadow: ACB |
| ToA | Wardens | Obelisk: Elder maul 1 spec + Eye of Ayak ≈ 49 magic def → Def 65 · Elidinis' Warden, P2 shield: Eye of Ayak not needed → Def 100 · Elidinis' Warden, P2 core: Elder maul 2 specs → Def 43 · Tumeken's Warden: Elder maul 1 spec + Eye of Ayak ≈ 20 magic def → Def 120 (phase 34 showed the Obelisk and the P2 shield only: the core and P3 lines had the Obelisk's weapons and were folded) | Obelisk, Tumeken's Warden: Shadow · Elidinis' Warden: Shadow + Torva Scythe |
| CoX | Olm | Right claw: … → Def 36 · Left claw: … → Def 1 · Head: … → Def 0 (was the right claw's line only) | Right claw: Shadow · Left claw: Scythe · Head: Twisted bow |
| CoX | Vasa / Vespula / Muttadiles | one line (the crystal, portal and small Muttadile have no specs) | per NPC (Glowing crystal / Vasa Nistirio, Vespula / Abyssal portal, Small / Large muttadile) |
| CoX | Vanguards, Mystics, Shamans | no specs | Vanguards: Melee / Ranged / Magic vanguard; Mystics / Shamans one NPC |
| ToB | Nylocas (boss forms), Verzik P1–P3, Xarpus, Maiden | one NPC each: unchanged | unchanged |
| ToB | Sotetseg / Bloat | one NPC with resets: "× 3" / the stomp, unchanged | unchanged |

Not changed: whether drains carry between Olm's phases or from Elidinis' Warden's shield to its core (the model gives
every phase its own plan from 100% spec energy; phase 36 shares one budget per encounter). The briefing now shows the
per-NPC lines the planner already computed.

**Checks**: `src/tests/lib/raids/Phase35b.test.ts` (phaseNpc groupings; FA Bork + Smorks → two events named Bork /
Smorks with Def 180 / Def 5, each the NPC's own phase line; the Wear per NPC; AG one event, two parts; Dagon'hai one
event; Ocellus one NPC; Sotetseg three reset events "× 3"; Kephri / Wardens / Olm / Vanguards; toy with two NPCs, an
add and a reset; render: "Bork:" / "Smorks:" spec and Wear lines; slow: the FA headline and the Bork + Smorks line).
Phase34.test / verifyPhase33 / 34 re-pinned to the per-NPC Bork + Smorks line. Screenshots
`docs/screenshots/phase35b-bork-smorks.png` (Obligator not owned: both spec lines and both Wear lines),
`phase35b-bork-smorks-phone.png`, `phase35b-cox.png`, `phase35b-toa.png`.

### Damage specs, surge potion and one spec budget per encounter (phase 36)

ROADMAP round 5, row 36 (user, 2026-10-24: damage specs like Voidwaker / Zaryte crossbow weren't considered, "best spec
weapon per boss", the surge potion). Until phase 35 every phase target (every Olm phase, every Sotetseg third, Bork and
The Smorks) started from a full spec bar of its own (UNVERIFIED B10 / F7 / G7). **This phase changes numbers.**

**One spec budget per encounter** (`specBudget.ts`, `encounterBudget.ts`; raidTime.ts `encounterTime` when the
assumptions carry a `specBudget`, i.e. Solo / Team drains in the time model and the Plan tab; Search / Summary keep the
one-boss budget):

- *Pools.* Solo: your spec bar. Team: one bar per carrier (each carrier specs only its weapon; Lightbearer per weapon)
  plus yours for your damage specs and the surge dose — and then you are **not a carrier** (review: one bar per party
  member, so the carriers are at most the party − 1; `specBudgetFrom` cuts the list there, and the planner keeps the
  faster of "you carry a drain weapon, no damage specs" and "you damage-spec, carriers ≤ party − 1").
- *Energy across encounters — decision:* every encounter starts at **100%** (`CARRY_SPEC_ENERGY = false`). In-game the
  bar is not reset between rooms, but the DPS-only time model has no travel / puzzle time, and the time between bosses
  (puzzle rooms, walking, ToB / CoX resupply) usually refills most of a bar (100% takes 300 s); carrying the leftover with
  0 s of travel would make every boss after the first start nearly empty, a pessimism the raids don't have. The flag
  flips it: each encounter then starts at min(100%, the previous encounter's leftover + its regen) on the raid clock,
  planned in route order (myopic), and the surge doses are placed greedily in order. UNVERIFIED B10 / D27.
- *Drain events* = per NPC its first phase and every Defence reset: Sotetseg's mazes, Bloat's stomp (phase 33) and, new,
  the wiki's other resets — Kephri's final phase ("the defence level is reset for the final phase"), the Tumeken's
  Warden enrage ("base defence level is reset to 180"), every Olm hand phase after the first ("His stats also reset when
  a new phase starts"). An event's option = spec counts per drain weapon; a weapon's specs are made at the first phase of
  the event it can hit (AG: Tonalztics on the flying shield, the maul when it lands) from the energy then. Every phase of
  the event gets the event's specs that can hit it. Adds (`NO_DRAINS_ADDS`) and other `noDrains` targets get no drain
  specs; adds get no damage specs either.
- *Clock and regen:* rows = the encounter's phases; the first plan is timed on the undrained pass, then re-planned on
  the clock of its own drained phases until it stops changing (at most `CLOCK_ROUNDS` = 2 re-plans; review: the drained
  fight is shorter — the Archive Guardian 36.7 → 29.1 s of wall time — so a Burning claws spec there relied on a regen
  tick that never came, ~1 s); wall time = the model's seconds × team-DPS
  multiplier ÷ party size (the `drainFightSecondsOf` formula; = the seconds in ToA / CoX / ToB, ÷ party in the FA);
  +10% per 30 s (15 s with Lightbearer) per bar, credited at each row's end; damage specs on a row may use the row's
  regen; bars are capped at 100% between rows. Regen during an event does **not** feed that event's drains (the old
  Solo budget counted the whole fight's regen for the start-of-fight specs; now it buys damage specs or later events).
  Sotetseg's mazes aren't in the model, so their regen isn't counted (pessimistic).
- *Choice:* an exact dynamic programme over the rows (state: every bar, the options of the events still running, a dose
  pending) for the least encounter seconds; options that another dominates (as fast on every phase, no more energy from
  any bar at any row, its damage specs at least as good) are dropped first, which keeps the optimum. To keep the planner fast an event keeps at most 24
  options after the pruning (`MAX_EVENT_OPTIONS`: the fastest per spec count, then the fastest; only Olm's events have
  more at the defaults — the DP is exact over the kept ones). Ties: fewer specs;
  then a **top-up** spends spare energy on more drain specs where that costs no time (the ranked Defence rounds: on
  Kephri one maul spec ranks at Def 60 at 63%, four reach it at 98%). "No specs" is always an option, so a plan is
  never slower than spending nothing and an extra carrier never makes it slower (the phase 35 review's BGS carrier that
  cost 3.3 s can't happen any more). Team: the spec counts per weapon are paid by its carriers, each spec from the
  fullest bar. Couplings between events (Bloat's first down sets the damage left for the later downs) are attributed to
  the event that causes them.
- The Team briefing / drain lines / "team: N specs (M carriers)" now show the specs each event gets: Sotetseg's three
  events are listed separately (no "× 3" unless they get the same specs).

**Damage specs** (`damageSpecs.ts`): Voidwaker, Dragon claws, Burning claws, Zaryte crossbow (Ruby / Diamond dragon bolts
(e)), Crimson kisten (a Maggot King unique — the roadmap's "Kiston"; not an FA reward). Keris partisan of breaching (no
special attack upstream) and the Bone dagger (upstream `UNIMPLEMENTED_SPECS`) are not modelled. E[spec damage] =
upstream's `getSpecCalc().getExpectedDamage()` (the spec distribution + Burning claws' burn) against the phase's drained
monster, in the style's armour preset (melee: the better of Torva and Inquisitor's; ranged Masori (f)), every
non-defensive style × armour × bolt tried; the spec's ticks = the spec calc's `getExpectedAttackSpeed()`. A weapon that
can't hit the phase (hittable.ts `canWeaponHit` with its own style: Voidwaker is a melee weapon whose spec rolls magic —
not on Moia, the flying Guardian, Ocellus's Deflect Melee) deals 0.

- *Value of one spec on a phase:* **net = E[spec] − DPS × ticks × 0.6 s** (what your loadout's normal attacks would have
  dealt in those ticks; the variant with the most net at that DPS), **seconds saved = net ÷ (team-DPS multiplier × DPS)**
  — the time model's own rate (time = damage ÷ (multiplier × DPS)): a damage spec takes net damage off the phase. With
  the multiplier = the party size (ToA / CoX / ToB) one player's spec is worth less in a big team; the FA's multiplier
  is 1 (its hp table is the identity), so FA damage specs are worth more. Only on damage-limited phases (seconds =
  damage ÷ (multiplier × DPS)): not Ocellus P2 (fixed length), the Dawnbringer specs, adds.
- *Hp left (review):* a spec is valued at the NPC's hp left at the phase's start (`rowHpLeft`: its damage still to
  deal in its drain event, capped by the kit at its full hp — the AG's shield phase counts the boss's 550): the Zaryte
  crossbow's ruby proc is a share of that hp and no spec's E[damage] exceeds it. Before, the proc used the full hp, so
  the DP put ZCB specs on the AG's last 165 hp (proc ≤ 36, modelled 6.28 s) and Bork's last armour phase (≤ 375 hp,
  7.14 s modelled vs 4.56 s); now they go to the AG shield phase (6.28 s) and Bork's third (750 hp, 6.76 s). A Defence
  reset starts a new count (conservative for a boss that keeps its hp, e.g. Sotetseg); a second ZCB spec on one phase
  (Solo) is valued at the same start hp (UNVERIFIED D28).
- *Energy:* the item's spec cost (Voidwaker / claws / kisten 50%, Burning claws 35%, ZCB 75%) from your bar, which in Solo
  is also the drains' bar: the DP splits it between drains and damage specs per encounter.
- *Bringing one* (planner decides): greedy on the spec budget's route time with the kit, the item saving the most net
  of 1 s per slot, while one saves ≥ 1 s per slot (`pickSpecItem`; the price of kit switches, Solo spec weapons and
  your share); with no free slot the kit is re-optimised with it carried. Solo then drops a drain weapon whose slot is
  now worth < 1 s. Team: damage specs are your energy, so when you bring one your share is "your spec energy goes to
  your … specs — let a teammate carry …" (no drain weapon for you). "Specs I bring" (manual) brings none.

**Surge potion** (wiki, read 2026-10-24/25: 25% per dose, once every five minutes, the cooldown removed on entering a
raid, paused between ToB rooms, not between ToA rooms; "Drinking this would have no effect" at 100%). A 1-slot kit
candidate of 4 doses: a dose adds 25% to your bar (capped) once per encounter, right after your first spec there or
whenever the bar is below 100% (the DP picks the moment). Doses are placed per route (`routeSurgeDoses`, `placeDoses`):
≥ 300 s apart on the route clock (the encounters' wall times without doses; travel 0 s): conservative everywhere —
in-room time that isn't DPS time (Sotetseg's mazes, Nylocas waves, puzzle rooms) isn't counted, so more doses may fit, the first may be at the raid start, at most 4 per potion, exact (the most time saved). A second potion
only when the route allows more than 4 doses (`dosesAllowed`) and it saves ≥ 1 s. The Plan shows "Surge dose at:
Ocellus" with the potion icon and a "dose" marker on those briefing rows; the Search tab's Solo drain box has a "with a
surge dose" line (the boss's Solo budget + 25%). Within a phase the drain spends come before the dose, so a dose can't
pay for drain specs on the phase it's drunk (a small Solo pessimism). UNVERIFIED D29.

Two fixes found on the way: after the damage-spec / surge greedy the optimiser's kit times are re-timed under the new spec
plan (step 7's "what each loadout saves" / additions used stale times), and `formatDuration` rounds to the tenth before
splitting minutes.

**The planner** (planner.ts `runRing`): the optimiser times thousands of kits, so it replays a *fixed* spec plan
(`RaidTimeAssumptions.fixedAlloc`): a bootstrap kit is optimised under the phase 14-35 per-target drain states, the spec
budget's DP on it gives the plan (`fixedFor`), the kit is re-optimised under that plan and the plan re-derived on the
result. The Team carrier greedy, your share and the damage / surge greedy run the DP on the kit itself (`dpCmp`); the
reported times are the exact re-time with the DP on the exact kit. Solo subsets: each subset's plan from the bootstrap
kit; subsets with the same drains on every phase are one candidate.

**Per-boss view** (Search tab, `SpecDamageBox.tsx`, damageSpecs.ts `damageSpecRanking`): a "Specs (damage)" box under the
results lists every damage spec weapon on the selected boss / phase / drain state against the top row's DPS; a weapon
that can't hit is greyed and listed last. Phase 37 (user, 2026-10-25: "E[dmg]", "net", "s / spec" read as statistics
shorthand) — plain headers, each with a tooltip, the numbers unchanged:

| Column | Tooltip / meaning |
|---|---|
| **Avg damage** (was E[dmg]) | average damage of one spec, hits and misses included (upstream's spec calc) |
| **Gain over normal hits** (was net) | average spec damage minus what your normal attacks would have dealt in the spec's N ticks (the row's tooltip gives N) |
| **Time saved** (was s / spec) | seconds one spec saves at the team's DPS (gain ÷ (multiplier × DPS)) |
| **Cost** (was energy) | spec energy |
| **Gain per 100% energy** (new, bold) | gain ÷ cost × 100 (`gainPerFullBar`): the number to compare weapons by when energy is the limit — the default order (phase 36 sorted by time saved, which favours expensive specs) |

FA Xarth, Team (13.917 DPS): Zaryte crossbow gain 56.2 at 75% → 74.9 per 100%; Voidwaker 20.6 at 50% → 41.2.

**Headlines** (Plan tab defaults, Team, camp one ring; CrossRaid):

| Raid | Phase 35b | Phase 36 | **Phase 36 review** | What changed |
|---|---|---|---|---|
| FA | 21:44.4 | 21:04.9 | **21:07.7** | Bring Zaryte crossbow, a Surge potion (one dose, at Ocellus) and Burning claws — **marginal** values in the final plan (the route with the item removed, everything else kept): ZCB 23.9 s, Surge potion 3.8 s, Burning claws 2.1 s (the greedy's step values, which depend on the order added, were 28.8 / 5.2 / 2.1 s); your share: none ("your spec energy goes to your Zaryte crossbow / Burning claws specs / surge doses"); carriers 2 Elder maul + 3 Tonalztics (review; phase 36 had 2 + 4 = 7 bars in a 6-man; 21:43.8 if you carry instead); Bork + Smorks: "Bork: Elder maul 2 specs → Def 180 · Smorks: Tonalztics 10 hits → Def 0" from one budget; damage specs on every boss (ZCB ×1-2, Burning claws ×1) |
| ToA | 14:12.1 | 14:05.5 | **14:07.8** | Bring Voidwaker (6.1 s; ×2-4 per boss); carriers 1 Elder maul + 1 Eye of Ayak (unchanged; 14:13.9 if you carry instead); review: the hp left and the drained clock; Kephri's final phase and the Warden's enrage are new drain events (1 maul spec each from the energy left) |
| CoX | 7:01.3 | 7:03.6 | **7:08.7** | review: carriers 3 Elder maul + 1 BGS + 1 Tonalztics with your Dragon claws (phase 36: 4 + 2 = 7 bars in a 6-man; 7:10.4 if you carry instead) and fewer regen ticks on the drained clock (Olm); phase 36: slower: Olm's hand phases are re-drained from one budget (was a full first round per claw per phase); Bring Dragon claws (a slot from the kit); carriers 4 Elder maul + 2 Tonalztics (was 2 Elder maul + 1 Tonalztics + 1 BGS + 1 Ayak); the option cap (`MAX_EVENT_OPTIONS`, below) costs 0.4 s here (7:03.2 uncapped) for a plan ~45% faster |
| ToB | 7:29.5 | 7:21.2 | **7:23.4** | Bring Dragon claws (marginal 8.4 s); carriers 1 Elder maul + 2 Tonalztics (review; phase 36: 2 + 2 = 5 bars in a 4-man; 7:29.5 if you carry instead); Sotetseg (review, 3 carriers): start Elder maul 2 specs · after maze 1: Tonalztics 2 specs · after maze 2: Tonalztics 2 specs, your 2 Dragon claws specs at the start (phase 36 with 2 + 2 carriers: "start: Tonalztics 3 hits → Def 107 · after maze 1: Elder maul 2 specs + Tonalztics 1 hit → Def 100 · after maze 2: the same"; phase 35b: the full 4 + 4 specs × 3) |
| FA Solo, party 1 | 22:01.9 | 21:54.8 | **21:59.0** | the start-of-fight drains have 100% (no fight regen); damage specs / the surge potion where they save ≥ 1 s per slot |
| FA without Obligator + Ascension crossbows | 24:34.1 | 24:05.1 | **24:11.9** | damage specs and the shared budget |
| The user's plan (Phase32.test: party 4, Camp Lightbearer, the user's "don't own" list) | 25:46.3 | 25:00.0 | **25:15.5** | review: phase 36 had 4 carriers + your bar in a 4-man; now BGS + 2 Tonalztics (the Elder maul carrier made way; Ocellus 780.5 → 794.7 s), the Onyx bolts switch gave way to a Scythe of Vitur loadout (phase 36: `formatDuration`'s rounding fix, 1499.96 s read "24:60.0") |

Worked examples (one spec, the Search box's numbers: Team drains, the best preset's DPS): FA Xarth, Inquisitor's +
Obligator 13.917 DPS, multiplier 1: Zaryte crossbow (Rapid, ruby (e)) E 97.95 in 5 ticks, net 97.95 − 13.917 × 5 × 0.6 =
56.20, saves 56.20 ÷ 13.917 = 4.04 s; Voidwaker E 54.0 (max 54 → 27-81), net 20.6, 1.48 s. ToA Zebak (500), Twisted bow
11.034 DPS, multiplier 6: ZCB E 96.28, net 63.18, 63.18 ÷ (6 × 11.034) = 0.95 s; Voidwaker net 30.02, 0.45 s. CoX Tekton,
Torva + Obligator 14.416 DPS, multiplier 6: Dragon claws E 66.80, net 32.20, 0.37 s (Voidwaker 10.5: Tekton takes a fifth
of magic damage; the ZCB can't hit him). ToB Maiden, Torva + Scythe 14.592 DPS, multiplier 4: ZCB E 109.71, net 65.94,
1.13 s; Dragon claws net 32.85, 0.56 s.

**Review fixes** (2026-10-25): one bar per party member (above, *Pools*); damage specs at the hp left (*Hp left*); regen
on the drained clock (*Clock and regen*); the item greedy, for Team with auto carriers, makes room for your bar by
dropping the carrier whose removal costs least (`fitBars`), then the carriers are re-run greedily with party − 1 and the
faster of that and "you carry" is kept (a note gives both times). A brute force over every kit of a reduced FA pool (10
candidates, up to 4 loadouts: 336 kits, each timed with its own exact allocation) finds the planner's kit (gap 0.0000 s):
the optimiser's fixed-plan replay picked the optimum there.

**Checks**: `src/tests/lib/raids/Phase36.test.ts` (E[spec] by hand for Voidwaker and Dragon claws on Xarth and Zebak vs
upstream; net / seconds on a toy; the DP vs an exhaustive search on toys (Solo two events, with a dose, Team carriers)
and on real encounters (ToB Sotetseg Team, every option combination; FA Xarth Solo with drains, Voidwaker and a dose);
dose placement; the 1 s / slot rule; adds; Sotetseg's shared budget; never slower than no specs; the carry flag),
re-pinned tests of phases 27-35b and CrossRaid; `scripts/verifyPhase36.mjs` (Search Specs box on Xarth, the Solo surge
line, the FA Plan's surge dose and damage specs, ToB Sotetseg), screenshots `docs/screenshots/phase36-*.png`.

### Performance (phase 37)

Phase 36's per-encounter budget made plans 3-5× slower. Phase 37 makes them fast again **without changing any result**:
every plan the tests pin (the four headlines and FA without Obligator / Ascension crossbows in CrossRaid's slow headline
tests, now `CrossRaidHeadlines.test.ts` / `CrossRaidHeadlinesCox.test.ts` so they run in parallel; FA Solo in Phase31's;
the four reduced Phase27 plans in `Phase37.test.ts`) is compared with the plan captured at HEAD 7864dacc before any
change (`src/tests/lib/raids/phase37/*.json`, `src/tests/utils/phase37.ts`) — the kit, carriers, items, spec plans,
every route and encounter time, the inventory and every string (only the run statistics — DPS evaluation counts and
timings — differ). A regression of the memos is caught by their counters (`stats.memo`: encounters / passes computed
and reused, deterministic; `memoWithin` allows 20% more runs, 20% fewer hits; phase 37b: encounter runs and pass runs
bounded separately, so a lost pass memo fails even when the encounter memo makes up the sum) and, for a catastrophe only, a CPU-time
budget of 5× each plan's phase 37 time alone (`cpuSeconds`; wall and even CPU times are 3-4× a plan's alone while Jest
runs the slow suites in parallel, more when the machine is busy).

**Where the time went** (Node `--cpu-prof`, FA headline at HEAD, 43 s with the profiler): the optimiser's replays and the
carrier / item greedies call `encounterTime` for every kit (65% of the time); inside, `specCountsDrainKey` built a JSON
key per query (19%), the model passes per (event, option) of the DP (23%), the DP itself (5%; CoX: 22%), the DPS of
new drain states (`allocDps`, 13%), the search (12%), the ring screens (31% of the plan: six rings), the exact re-times
(each kit its own DPS memo).

**What changed** (each exact):

1. *Drain-state lookups by the spec counts* (planner.ts `allocMonster`, `budgetKitParts.drainKey`): the drain state of a
   query is memoised by its phase and spec counts before the JSON drain key is built (the same monster as before, by
   the same key on a miss). FA 29 → 26 s.
2. *Encounter and pass memos* (`traceMemo.ts`, `kitMemo.ts`; raidTime.ts `RaidKit.memoEncounter` / `memoPass`): the
   planner's kits differ only in their members, and a kit answers a query only through the drain state's member pick
   (the highest-DPS member, the first on ties); spec damage, which weapons hit and drain keys are the same for every
   kit. An encounter time (or one model pass of the DP) is remembered with the picks of every drain state the run asked
   about, in order (a tree per key); a kit that gives the same pick to each of those questions gets the remembered
   result — a deterministic run with the same answers asks the same questions, so it is the result the run would
   compute. Keys: the encounter, the assumptions (carriers, Lightbearer flags, damage specs, surge potions, party, drain
   state, fight lengths), the fixed spec plan, the budget options; for a pass, its drain state, fight length and how
   the budget rewrote the queries (`assignedKit`), without the spec budget (a pass never reads it), so a carrier set,
   item or surge change reuses the passes. Assumptions and spec plans are keyed by identity (never mutated once timed).
   FA 26 → 22 s, ToB 64 → 28 s, CoX 122 → 78 s.
3. *Exact re-times share one DPS memo* (raidTime.ts `kitEvaluatorCache`): the RETIME_TOP kits of a ring run have the
   same assumptions, so a loadout's DPS on a monster is computed once (`stats.evaluations` counts each once now).
4. *The DP's state key* lists the pools that can still spend per row once (specBudget.ts `keyGroups`), not per state.
5. *Parallel ring runs in the browser* (`parallelRings.ts`, searchWorkerClient.ts `startRaidPlan`): with Camp one ring
   and ≥ 4 cores, helper workers (cores − 1, at most 8) run every ring's screen, then the full runs of the best screened
   rings (as many as there are helpers, at least two; with the screens' search rows, so they don't search again —
   starting them with the screens, each searching, was slower on a loaded machine), each a `planRingRun`; the main plan
   takes them
   (`PlanHooks.ringRuns`, by ring, screen / full and — Solo, planner decides — the subset the first screen picked) and
   runs anything else the ring guard asks for itself. A ring run is deterministic given its inputs, so the plan is the
   one it computes alone (`Phase37.test.ts` builds a plan from helper runs passed through the worker JSON). Runs travel
   with `encodeRingRuns` (keeps Infinity; plain worker JSON turns it into null). The progress line reads "rings in
   parallel (N workers)". Below 4 cores, one worker as before.

Not applied: memoising the DP per problem (repeats are 1.1 of CoX's 16.9 s of DP: the expensive problems are distinct);
lowering `MAX_EVENT_OPTIONS` (no other value is free); skipping the DP for one-event encounters (their DP takes < 1% of
the time: the passes per option, now memoised, were the cost). Checked, no change needed: a worker computes a damage
spec's numbers (`damageSpecProfile`, the expensive spec calc) once per drained monster and hp (its module cache is
keyed by the monster, so every ring run and kit shares it; the planner's per-run memo sits in front; a helper worker
has its own); the Search tab's Specs box computes its rows in the page, once per boss / drain state.

| Plan (defaults, Team, camp one ring) | Node, phase 36 | Node, phase 37 | Browser, phase 36 | Browser, phase 37 |
|---|---|---|---|---|
| FA | 29.3 s | 21.6 s | ~38 s | 19.1 s |
| ToA | 64.6 s | 35.6 s | ~51 s | 16.5 s |
| ToB | 64.3 s | 25.1 s | ~72 s | 21.2 s |
| CoX | 122.5 s | 62.5 s | ~112 s | 38.3 s |
| FA Solo, party 1 | 81.9 s | 41.5 s | | |
| FA without Obligator / Ascension | 140.0 s | 61.2 s | | |

(Dev machine: 20 hardware threads; Node = one thread, no helpers; browser = verifyPhase21, 8 helpers. The phase 36
browser times are PROGRESS's. On a 4-core machine the browser gets 3 helpers and less of the parallel gain.)

**Phase 37b review nits** (no result changed; the phase 37 fixtures still match): memo keys write non-finite numbers as
tagged objects (`kitMemo.ts` `memoKeyJson`; plain JSON wrote Infinity / NaN as null, so such keys could collide);
`encodeRingRuns` keeps -0; with helper workers the plan footer shows the whole job's new searches and wall time
(`parallelPlanStats`: the returned plan is a helper's ring run, whose own search had the screens' rows, and the main
plan's clock started after the helpers), and the "Trying rings N / M" progress stops at M (`ringProgressDone`).

### Re-pinning the headlines (phase 37b)

The headline plans (four Team defaults, FA Solo party 1, FA without Obligator / Ascension crossbows) are pinned once,
in `src/tests/fixtures/headlines.json`: per plan the total (text + seconds), route, ring, kit loadouts, free slots,
carriers, "Bring", your spec items, your share, surge doses and each encounter's seconds. Everything that checks a
headline reads it: the slow tests (`CrossRaidHeadlines*.test.ts` compare the whole summary; Phase31's Solo; Phase34 /
35 / 35b's totals, free slots and carriers), the verify scripts (`scripts/headlines.mjs` → `headlineTotal('fa')`)
and the README table (between the `headlines:start` / `headlines:end` markers; `Phase37b.test.ts` checks it matches,
and that the fixture is the summary of the phase 37 full-plan fixtures). Cases and summary:
`src/tests/utils/headlines.ts`.

After a phase that moves numbers:

1. `node scripts/pinHeadlines.mjs --full` (plans all six in Node in child processes, `--jobs 3` by default, ~2 min
   with `--jobs 6` on the dev machine; `--full` also rewrites `src/tests/lib/raids/phase37/<name>.json`, the
   bit-identical guard; name plans to re-pin only those: `node scripts/pinHeadlines.mjs cox`; `--check` writes
   nothing and exits 1 on a difference; `--readme` only rewrites the README table).
2. Review `git diff src/tests/fixtures/headlines.json README.md`: every moved total, kit, carrier or encounter is
   explained in PROGRESS (and the per-phase history comments in the tests, if you keep them).
3. Run the slow suites; re-pin the per-phase strings (briefing lines, drain lines) that moved; update the memo counters
   (`PHASE37_MEMO`) if the memos' work changed.

A phase that claims no number changed must leave both fixtures untouched (`--check` exits 0).

### Raid wall clock + ToA supplies by room (phase 38a)

**The raid clock.** The time model's only clock used to be fight time (Σ encounter wall seconds = seconds × team-DPS
multiplier ÷ party size: ≈ 3.5 min for the FA headline at party 6), so the surge potion's 5-minute cooldown fitted one
dose in a 25-minute raid (the user: "we have 4 doses to use throughout the raid, it only uses one"). Now each raid has a
**typical raid length** (Plan tab → Advanced (plan) → "Typical raid length (min)", saved with the Plan inputs; default
FA 25, ToA 30, CoX 20, ToB 20 min, `RaidBase.typicalRaidMinutes`, sources in docs/DATA_SOURCES.md *Phase 38a*; 0 =
fight time only). `raidClock(walls, raidSeconds)` (raidTime.ts) spreads the non-fight time max(0, L − Σ walls) before
the encounters in proportion to their fight time: gap_i = (L − F) × w_i ÷ F, start_i = Σ_{j<i}(gap_j + w_j) + gap_i,
so the last fight ends at L. On that clock:
- **Surge doses** (`routeSurgeDoses` → `placeDoses`, unchanged rules: ≥ 300 s apart, one per encounter at its start,
  4 per potion, the most route time saved) use the encounters' starts (`surgeClockStarts`). ToB keeps fight time only:
  its cooldown pauses between rooms (`RaidBase.surgePausesBetweenEncounters`). The planner tries a second potion when
  the clock allows more than 4 doses (`surgeClockSpan`: 25 min → 6).
- **Regen between encounters** (only with `CARRY_SPEC_ENERGY`, off: every bar starts an encounter at 100%): each pool
  gains +10% per regen tick of its period inside the gap before the encounter, capped at 100%; the gaps come from the
  full-bar encounter times. Death Charge (phase 38b) runs per encounter, its cooldown ready at each start.

FA headline (party 6, phase 37 seconds: fight 211.3 s of 1500 s): fights start at 179 s (AG), 401 (Bork), 499 (Moia),
694 (Xarth), 1391 s (Ocellus), so up to 3 doses fit (AG, Moia or Xarth, Ocellus; Bork → Xarth is 294 s). Phase 38a test: hand gains
2 / 1 / 3 / 1 / 10 s give AG + Moia + Ocellus (the fight-only clock: Ocellus only).

**ToA supplies by room.** The Helpful Spirit's supplies come after two paths and again before the Wardens (wiki), so
the first two rooms of ToA's fixed route (Kephri, Zebak; src/lib/raids/toa/supplies.ts) are fought with the normal
potions (Super combat +19, Ranging +13, Saturated heart +13 at 99) instead of the Smelling salts (+26 to every style).
Their planned phases target copies of the targets (`<key>-before-supplies`, `beforeSupplies`, hidden from Search and
the Summary); `assumptionsForTarget` swaps the raid potion for the normal one wherever a target's DPS or drains are
computed (`createKitEvaluator` through `KitLoadout.toPlayer`'s third argument, the planner's DPS matrix and damage-spec
values, `buildTargetMonster` / `specCountsDrainKey` for the drain hit chances, `runGearSearch`). Slot-neutral (D31).

**Headlines** (`pinHeadlines --full`): FA 21:07.7 → **21:05.3** (doses AG, Xarth, Ocellus, was Ocellus; Crimson kisten
replaces Burning claws: AG −2.3 s, Xarth −1.0 s, Bork +0.9 s); FA Solo 21:59.0 → **21:56.2** (a third dose on
Ocellus, −2.8 s); ToA 14:07.8 → **14:38.2** (Kephri +9.6 s, Zebak +20.8 s); CoX, ToB, FA without Obligator /
Ascension unchanged (no surge potion in their plans; ToB's surge clock is unchanged).

### Death Charge, Liquid adrenaline, damage specs on adds (phase 38b)

Three more terms in the per-encounter spec budget (encounterBudget.ts → specBudget.ts; sources in docs/DATA_SOURCES.md
*Phase 38b*; readings UNVERIFIED D32-D34):

- **Death Charge** (Arceuus; Plan tab → Advanced (plan) → "Spellbook", saved as `plan.spellbook`, default Arceuus for
  every raid, `RaidBase.spellbook`; other books: none). Kills = each NPC's last row in the encounter (`rowKills`; a row's
  `kills` where the model knows a count: Akkha's 4 Shadows; else 1, so rows standing for several adds under-count),
  minus the wiki's exceptions (`noDeathCharge`: Glowing crystal, Olm's hands, the Wardens' obelisk). A row's k kills are
  spread evenly over it; `deathChargeSchedule` casts greedily (cast just before the first uncovered kill once the 60 s
  cooldown allows, ready at the encounter's start; a cast covers up to 2 kills within 60 s — the upgraded spell, per the
  user). Each covered kill gives every bar 15% ÷ party size (each player as likely to land the killing blow; Solo party
  1: 15%), at the row's end, after its damage specs and the 100% cap (`BudgetRow.restore`; a kill at a full bar is
  wasted, as in game). Kills at an encounter's last row only matter with `CARRY_SPEC_ENERGY` (off). Not modelled: the
  freezer on Ancients (FA Xarth route, ToB Maiden), the cast's tick.
- **Liquid adrenaline** (ToA, when the supplies carry the Smelling salts: the Power bundle, 2 salts + 1 two-dose
  adrenaline per drop). `TOA_ADRENALINE_DOSES`: none before the supplies (Kephri, Zebak), one each for Akkha and Ba-Ba,
  two (300 s) for the Wardens, drunk at the encounter's start by every player. Every spend (drain or damage spec) on a
  row starting inside the window costs half (`halfCostUntil`, `costFactorAt`; no rounding: ZCB 37.5%).
- **Damage specs on adds**: `damageLimited` no longer excludes `NO_DRAINS_ADDS` ("adds: not worth a drain spec"); the
  adds still get no drain specs. The separate target flag `noDamageSpecs` (none set) forbids damage specs. UI: "no
  drains (adds)" in the Plan rows and the Summary.

Hand checks (Phase38b.test.ts): toy Solo encounter, kills at 50 and 110 s: 2 maul specs leave 0 + 10 + 15 + 20 + 15 =
60% at row c (a third spec; 80 s vs 90 s without); party 2: 45%, back to 90 s. Zebak with a forced 150 s dose: 100 + 5
ticks = 150% buys 4 ZCB specs at 37.5% instead of 2 at 75%. CoX Vasa: 2 Burning claws on the crystals, their drain
event empty.

**Headlines** (`pinHeadlines --full`): ToA 14:38.2 → **14:30.1** (Zaryte crossbow replaces Voidwaker: with adrenaline
the ZCB costs 37.5%; Akkha −1.5 s, Ba-Ba −2.3 s, Wardens −4.4 s; Kephri +0.1, Zebak −0.1 before the supplies); CoX
7:08.7 → **7:06.9** (mostly damage specs on adds — the crystals, Mystics, Shamans, small Muttadile, portal; Death Charge
adds 2.5% per mid-fight kill — so Zaryte crossbow + Burning claws replace Dragon claws and the planner re-chose the kit
and carriers: 3 Elder maul + 2 Tonalztics); FA, FA Solo, FA without Obligator / Ascension, ToB unchanged (their mid-fight
kills — Bork before the Smorks — give 2.5-3.75% that buys nothing).

### Ocellus events, ToA path pair, clock default, displays (phase 38c)

**Ocellus: three drain events.** The user (in-game): Ocellus's Defence resets from P1 to P2 and again from P2 to P3.
The Blade (P2) row carries `drainReset: 'P1'` and P3's first row (quadrants 1-3; the last quadrant when it is all of
P3) `drainReset: 'P2'` (raidTime.ts `evalEncounterPass`), so `drainEventsOf` makes three events and each one's specs
are made at its first row: P3's on quadrants 1-3 (before, one event made every spec on P1 and the P3 drains showed up
on the last quadrant as "P3 last quadrant, Deflect Melee: …"). Briefing: "Start of fight: … · After P1 (Defence
restored), again: … · After P2 (Defence restored), again: …". The P2 query now carries its `rowKey` (its event's
counts). **The Blade is in the plan by default**: "Ocellus P2 length" 0 → **120 s** (the user: "~2 min, little damage
lands"; UNVERIFIED D5 / D35): P2 lasts 120 s of model time, the DPS on the Blade × 120 s is dealt and 50% of it comes
off P3's hp. The FA model's seconds are "your DPS alone" (multiplier 1), so the fixed 120 s is also 120 s of that
clock; fix round: the P2 row carries `fixedWall`, so the spec budget's clock (`rowWallSeconds`) gives it 120 s of wall
time (was 120 ÷ party size, 20 s at party 6: 4 regen ticks fewer before P3); the raid clock still divides the
encounter's seconds by the party size.

**ToA: the pair of paths before the supplies is a route.** Each path room has two encounter ids: the plain id (after
the first supply drop: the salts, adrenaline) and `<room>-before-supplies` (normal potions, no adrenaline; its rows
target the `-before-supplies` copies, now also for Akkha, his Shadows and Ba-Ba). `TOA_ROUTES` (toa/time.ts) = the 6
pairs, each `[pair before, the other two after, Wardens]` in the canonical order (Kephri, Zebak, Akkha, Ba-Ba);
`RaidTimeModel.routes` / `modelRoutes` (raidTime.ts) list them instead of the slots' cartesian product, so
`compareRoutes` times all six with the kit and the planner keeps the cheapest (the Plan tab's Route select is the
`firstPaths` choice: "Compare all" = the cheapest pair, or one pair). Adrenaline: 0 doses before the supplies, 1 per
room after, 2 on the Wardens (`TOA_ADRENALINE_DOSES`). A route costs Σ rooms after + Σ over the pair (before − after),
so the cheapest pair is the two rooms that lose least without the salts.

**Raid clock = fight wall + non-fight time.** Phase 38a's fixed typical length squeezed a longer fight (FA Solo: 1316 s
of fight in a 1500 s raid left 184 s of travel). Now the Plan tab's input is **"Non-fight time (min)"** (saved as
`plan.nonFightMinutes`; phase 38a's `plan.raidMinutes` is no longer read), default `RaidBase.nonFightMinutes` = the
typical length − the Team headline's fight wall at the default party: FA 25 min − 210.9 s = **21.5**, ToA 30 − 870.1 s
= **15.5**, CoX 20 − 426.9 s = **12.9**, ToB 20 − 443.4 s = **12.6** (UNVERIFIED D30). `raidClock(walls, 0,
nonFightSeconds)` spreads it exactly as before (∝ fight time), so the raid lasts Σ walls + non-fight time;
`surgeClockSpan` = fight wall + non-fight time. An explicit `raidMinutes` on the assumptions keeps the phase 38a
clock (tests). Hand check (Phase38c.test.ts): FA seconds 600 / 600 / 1200 → party 6 walls 100 / 100 / 200, starts
322.5 / 745 / 1490, end 1690; party 1 walls 600 / 600 / 1200, starts 322.5 / 1245 / 2490, end 3690 (the 25-min clock:
no gaps at all).

**Displays.** The rooms before the supplies now use the normal potions everywhere the plan shows them: the Team
briefing's per-boss 95% table (planner.ts `briefing`: `drainModel(m, assumptionsForTarget(target, a))`), the Search
box's per-boss table (SpecPlanPanel; no effect on the Search targets, which are the salts versions), "Load worn / Load
all" (`planLoadoutToPlayer(…, target)`: the route's first phase's target) and a note in the Search / Summary footer
(ToA `hpNote`: they use the salts; the Plan fights the first two paths with the normal potions).

**BGS vs Elder maul on Ocellus (hand check, FA headline assumptions).** Elder maul: −35% of the current Defence per
landed spec (rounded down); BGS: −damage dealt (Defence first). At Def 250: P3 maul 0.782 (hit chance) × 87 =
**68 Def per spec** vs BGS E[damage] **26.5**; P2 maul 0.829 × 87 = **72** vs BGS 25.2; both 50% energy: the maul
drains ≈ 2.6-2.9× as much. P1 (Def 215, floor 129): maul 0.752 × 75 = 56 vs BGS 28.2. The BGS only catches up where 35% of the Defence
is below its expected damage (Def ≲ 80), i.e. after the maul / Tonalztics have done their work, and a carrier holds one
weapon. So the planner's carriers are Elder maul + Tonalztics and the FA plans bring no BGS.

**Headlines** (`pinHeadlines --full`; the clock change moves none: every headline kit re-timed with the phase 38a
clock gives the same totals):

| Plan | Before | After | Why |
|---|---|---|---|
| FA | 21:05.3 | **21:43.6** | Ocellus 655.17 → 693.52: P2 adds 120 s; the Blade takes 1836 (15.30 DPS × 120), 918 off P3 (P3 Q1-3 252.7 s, last quadrant 125.2 s); events P1 1 Tonalztics, P2 4 maul + 1 Tonalztics, P3 4 Tonalztics; kit, ring, carriers unchanged |
| FA Solo | 21:56.2 | **22:53.4** | Ocellus 677.04 → 734.19 (P2 120 s, 724 carried; P2 gets no spec, P3 2 Tonalztics + Crimson kisten, now brought) |
| FA without Obligator / Ascension | 24:11.9 | **24:52.2** | Ocellus 767.67 → 804.39, Bork 216.68 → 220.26: the carriers re-chosen for three Ocellus events (1 DWH + 4 Tonalztics, was 2 maul + 2 Tonalztics + 1 Ayak) |
| ToA | 14:30.1 | **14:20.0** | pair Kephri + Ba-Ba (was Kephri + Zebak): before − after with the kit Kephri 11.02, Ba-Ba 12.63, Akkha 20.31, Zebak 22.70 s; Zebak after the supplies 141.74 → 119.04, Ba-Ba before them 90.20 → 102.83 |
| CoX, ToB | 7:06.9, 7:23.4 | unchanged | no Ocellus / pair; the clock moves no surge dose |

ToA's six routes with the headline kit: K+Z 870.10, K+A 867.70, **K+B 860.03**, Z+A 879.38, Z+B 871.71, A+B 869.31.

**Fix round** (P2's wall time; `pinHeadlines --full`): FA 21:43.6 → **21:40.7** (Ocellus 693.52 → 690.80: 7 regen
ticks instead of 3; the carriers re-chosen, 1 Elder maul + 4 Tonalztics, events P1 4 Tonalztics, P2 2 maul + 4
Tonalztics, P3 4 Tonalztics; Burning claws added, on P1; Bork 190.71 → 190.53); FA without Obligator / Ascension
24:52.2 → **24:40.8** (Ocellus 804.39 → 792.97, an Elder maul carrier instead of the DWH); FA Solo, ToA, CoX, ToB
unchanged. The brute-force probe (`bruteForceKits`) now applies the planner's dedupe rule: ToA tiny, K+B, camp-one found
Twisted bow + Shadow + Scythe #3 3.08 s faster than the planner's Shadow + Scythe #3, but the bow takes 7 slots and the
rule asks 1 s per slot, so the planner prunes it by design; under the rule the gap is 0.

### Item beam, swaps, 0-slot pin (phase 38e)

**Why.** The user's party-8 FA plan (2026-10-27) brought Crimson kisten + Voidwaker (25:18.1) where Zaryte crossbow
first gave 25:07.4: the phase 36 item greedy ranked the candidates by their free-slot saving (kisten 33.29 vs ZCB
32.41 s), paid for the slot by re-optimising only the one it picked (kisten: 24.51 s), and never revisited.

**Item steps** (planner.ts, after the carriers; specChoice.ts `itemBeam`, `itemStepNet`): every candidate (an owned
damage spec weapon not brought, the next Surge potion) that saves ≥ 1 s per slot with a free slot (`pickSpecItem`'s
rule) is evaluated for real: with a free slot (or 0 slots, its loadout is in the kit) on the kit as is; with none, on
the kit re-optimised with it carried (accepted when it saves ≥ 1 s per slot, as before). The children are ranked by
`itemStepNet` = seconds saved − 1 s × (free slots before − free slots after): a free slot taken costs 1 s, a
re-optimised kit that leaves slots free is credited for them. A beam over the steps: the best **2** children of each
state for the first **3** steps (`ITEM_BEAM_WIDTH` / `ITEM_BEAM_DEPTH`), then one (greedy), at most 12 steps; states
with the same item set reached in another order keep the faster; the fastest state seen wins (route seconds on the
matrix, `cmpSeconds`). Width 1 is the phase 36 greedy (Phase38e.test.ts toy: greedy A → AB 88 s, beam B → BC 86 s).
A candidate rejected in one state is tried again in later states (phase 36 dropped it for good).

**Swaps** (same kit): one item brought for one not brought (a damage spec weapon, or a Surge potion), while one saves
≥ 0.05 s and 1 s per slot it adds (≤ 4 rounds). **Carrier swaps** were built in this phase and dropped in its fix round
(the user, 2026-10-27: the next phase replaces the tick-level spec timing by a per-boss value-per-energy ranking). Known
gap they would close: the user's plan carries 2 DWH + 1 BGS + 3 Tonalztics + 1 Eye of Ayak, the Ayak saving 0 s on the
final kit (an exact re-time with a 4th Tonalztics instead: 25:07.0).

**0-slot pin.** An item accepted at 0 slots (its loadout in the kit) is now added to the carried list too
(`pinItem`), so a later re-optimisation cannot drop the loadout and leave the item uncounted (before: 29 cells in 28
slots with `overfull` false). The slot count (`kitSlotUsage`) also counts the spec items listed in the inventory grid.

**Headlines** (`pinHeadlines --full`): FA, FA Solo, ToA, CoX unchanged (ToA: the rejected-item notes in another order;
CoX: a Crimson kisten note, the rejected rings' full runs 0.1-0.2 s faster; ToB 7:23.4 after the fix round, 1 Elder
maul + 2 Tonalztics); FA without Obligator / Ascension 24:40.8 → **24:40.3** (Crimson kisten first, 13.90 s with
the kit re-optimised: the Tumeken's shadow loadouts go, then Zaryte crossbow 3.42 s, Surge 5.45 s and Burning claws
2.87 s on free slots; kit Twisted bow (Masori) + Inquisitor's + Scythe, 4 slots free; route via Ezekiel instead of
Bork + Smorks). The user's party-8 plan: **25:07.9**, as at HEAD (the 38c fix had already moved it off the kisten to
Zaryte crossbow + Surge + Crimson kisten; the beam keeps that).

**Speed** (browser, dev server, defaults, two runs each): FA 27.0 → 35.1 s, ToA 42.4 → 50.9 s, ToB 24.5 → 36.7 s, CoX
51.4 → 74.0 s (+20-50%, under 2×; the user relaxed the 25% cap on 2026-10-27 for better kits; measured with the carrier
swaps, which add only a few route evaluations).


### Drains as facts: order, 95% count, carriers by headcount (phase 38g)

**Why.** The user (2026-10-27): no drain choice may rest on seconds (the fight length can't be predicted); show the facts.

**Drain facts** (drainLine.ts `drainFacts`, one line on Search, Plan and Summary; `DrainLine.facts`, computed on first
read): the Defence drain weapons that can hit, ordered by the Defence one spec removes on average from the undrained
Defence (teamSpecs.ts `drainOrder`: Σ P(outcome) × drop, floor applied), each with its hit chance; the specs to the
floor at the threshold (`neededSpecs`: for n = 1, 2, … the best combination of n specs, the first with P(floor) ≥ 95%;
was "if every spec lands"; at most `MAX_FLOOR_SPECS` = 8, else "floor not reached in 8 specs"); Team (party > 1): the
fewest carriers at 95% from the first round (`recommendCarriers`). Eye of Ayak (when brought): the fewest specs to magic
def 0 at 95%. The same in Solo and Team and for any party size except the carriers. When the drain state's own specs
(`paid`: Search / Summary the drain state's plan, Plan the time model's event) are fewer than the specs to the floor:
"(needs 4 specs, you have ~2)" ("the team has" in Team). E.g. ToA Kephri: one landed maul reaches the floor, but at 63%
per spec 4 are needed (1 − 0.37³ = 94.9%, 1 − 0.37⁴ = 98.1%).

**Time model** (encounterBudget.ts `eventWantedCounts`, `budgetedEncounter`): each drain event makes ONE fixed drain set
(the seconds-based option search, `countVectors` / `capOptions` / `MAX_EVENT_OPTIONS` and the top-up are gone). Team:
per phase of the event the fewest of the kit's carriers at 95% (`recommendCarriers` with `available` = the kit), 2 specs
each from 100%; no team within the kit reaches it (floor 0 bosses: Tekton, Olm's claws, Smorks, Ocellus P2): every
carrier whose weapon can hit; per weapon the most any phase wants. Solo: the fewest of your specs at 95% (unreachable:
the best 8). Then cut to what the bars pay at the event's spend rows (`simulateBudget` with drains only; events in order;
Team per weapon group, Solo Eye of Ayak first then the weapon last in the drain order). The Defence those specs reach
applies from the event on. The DP (specBudget.ts, unchanged: 38h) only places your damage specs and the surge dose.
`CLOCK_ROUNDS` stays (re-planned on the drained clock).

**Kit carriers** (planner.ts `headcountOf`, specChoice.ts `kitCarriers`; was `greedyCarriers` on the route time): per
weapon the most any boss / phase of the raid needs (`teamRoles`), Eye of Ayak capped at the mages; when that exceeds the
party (or party − 1 with your damage specs: `fitBars`), the fewest carriers within it that still give every boss one of
its 95% teams (`passingTeams`), else the most bosses covered. No carrier steps ("saved s") any more.

**Consequences** (headlines): drains are spent on every event at 95% whatever the time it saves, so energy a later
event would use better is gone (Ocellus: P2's 8 specs leave P3 2 Tonalztics specs; CoX Olm: the right claw takes every
carrier, the left claw none; ToB Sotetseg: maze 2 gets none); Solo pays the drains before damage specs. Every headline
is slower: see PROGRESS phase 38g.

**Fix round** (review + the user, 2026-10-28). The facts line counts Team specs up to 2 per party member (was 8: the
Smorks read "not reached in 8 specs; 5 bring Tonalztics"), Solo over the weapons you bring (the order still lists every
weapon). **Cap at what helps**: an event whose floor is out of reach at 95% (no team within the kit: Tekton, Olm's
claws, the Smorks) gets d* = the lowest Defence the available specs reach at 95% (`defenceAtThreshold`), and spends
only the fewest specs in drain order that still reach d* (`helpfulSpecs`; Team in whole carriers); the line reads
"floor not reached in 8 specs; ~7 specs to Def 60 at 95%; 4 bring Elder maul for Def 60" and "(floor not reached, the
team has ~4)". Ocellus P2 keeps its drain (the user). `kitCarriers`: Eye of Ayak competes in the carrier walk (was
reserved first) and on equal coverage the kit with more carriers wins (spare party slots filled). Search, Solo: the
short line reads "2 must land" (the best case) so it doesn't read as the 95% count. `greedyCarriers` deleted.

### One drain plan: the combination and order that land most often (phase 38g-2, FA)

**Why.** The 38g line showed `drainOrder` (each weapon's average drop alone at the undrained Defence) next to a count
from `neededSpecs`, which scores a combination in upstream order: the order on screen was not the order its chance
belonged to. The user (2026-10-28): one recommendation, "just what to do to land it most often"; no spec-count table.

**Plan** (teamSpecs.ts `bestDrainPlan`; drainLine.ts `drainFacts`): over the available Defence drain weapons (Solo: the
ones you bring, ≤ `MAX_FLOOR_SPECS` = 8 specs; Team: every weapon, ≤ one carrier per party member, 2 specs per carrier
for a 50% spec), every combination in every order of weapon blocks ("Elder maul ×3 → Tonalztics"): the fewest specs
reaching the floor with P ≥ the threshold, among those the highest P(floor), then the lowest expected Defence, then fewer
weapon changes, then the drain order. Floor out of reach: d* = the lowest Defence any such plan reaches at the threshold
(the best mix; the 38g fix used the first weapon alone, drainLine.ts:135), then the fewest specs reaching d* at the
threshold, chosen the same way. Line: "Drain: Tonalztics → Elder maul ×2 (floor 96%); 1 brings Tonalztics, 1 brings
Elder maul" or "Drain: Elder maul ×7 → BGS (Def 60 95%; floor not reached in 8 specs)"; Eye of Ayak part unchanged (38h).

**Each spec rolls at the Defence the earlier ones leave** (teamSpecs.ts `outcomesAt`): specs.ts keeps, per weapon whose
spec accuracy is upstream's plain roll, the max attack roll and the defence roll per effective level (`DrainModel.accuracy`;
roll = (Def + 9) × perLevel; kept only when it reproduces upstream's accuracy and, for Tonalztics, its 0 / 1 / 2-hit
outcome exactly). Elder maul / DWH / BGS scale their landing outcomes by accuracy(Def) ÷ accuracy(undrained); Tonalztics
rebuilds its two hits as upstream does (the second rolls against the Defence an accurate first hit leaves; P(an accurate
hit deals damage) from the undrained outcome). Guaranteed hits (stunned Bork) keep their outcomes. Checked against
upstream's spec calc at drained Defences (BGS-style reduction) for every FA boss to 1e-12 (Phase38g2.test.ts). This is
what makes the order matter: Archive Guardian (Grounded) Tonalztics → maul ×2 lands 96%, maul ×2 → Tonalztics less.

**Search** (exact, pruned): a breadth-first walk over block sequences, one spec per layer; the Defence distribution per
node as an array (BGS damage ranges as runs, a difference array per step); nodes with the same counts and last weapon
(the same continuations) drop a node whose Defence is stochastically higher than another's (a lower Defence lands the next
spec at least as often and leaves a Defence no higher, so no continuation of it does better). ≤ ~100 ms per FA boss.

**Not changed**: the time model, the spec budget (`eventWantedCounts`), the ranked Defence and the kit carriers still use
the undrained rolls and upstream order (38h revalues drains in HP), so every headline is unchanged; the bars may pay more
specs than the line's plan (Ocellus P2: the plan is 6 specs; the count at the undrained rolls was 8).

### The bars pay the line's plan (phase 38h-1, FA)

**Why.** After 38g-2 the drain line recommended one plan (rolled at the drained Defence, in its order) while the drain
state, the spec budget, the ranked Defence and the kit carriers still counted every spec at the undrained Defence in
upstream's order: the Search brief for AG Grounded made "Tonalztics 4 hits → Def 156" while its line said "Tonalztics →
Elder maul ×2". Now one model everywhere.

**What changed** (teamSpecs.ts, encounterBudget.ts, specChoice.ts, bestSetup.ts):
- `defenceOutcome(model, attempts)`: the specs are sent as weapon blocks in the order (of these attempts) with the highest
  P(floor), then the lowest expected Defence, then the drain order (the line's tie-breaks), each spec at the Defence the
  earlier ones leave (`orderedDistribution` / `outcomesAt`, memoised per model). Every user follows: the drain states'
  ranked Defence (`specCountsDrainKey`, `drainStateFor`), `passingTeams`, `recommendCarriers`, `specsNeeded`, `bestAttempts`.
  `rankedCounts` reproduce the ranked Defence in upstream's order (`reproducingCounts`: a flat drain before a % drain removes
  less, so a state reached Tonalztics-first can sit above its landed drains' upstream Defence; then the maul / DWH specs
  stay and the flat part becomes as many Tonalztics hits as fit + BGS damage). At the floor nothing changes.
- `kitDrainPlan` = `bestDrainPlan` within what the drain has: Team, the kit's carriers (each weapon ≤ carriers × 2 specs,
  ≤ that many carriers; new `available` option); Solo, your weapons (≤ 8 specs, the line's Solo plan). `neededSpecs` is
  `bestDrainPlan` within `available` (was its own upstream-order convolution).
- **Spec budget** (`eventWantedCounts`): per phase the plan's specs exactly (a Tonalztics carrier may make 1 spec; was every
  chosen carrier's 2), d* plan when the floor is out of the kit's reach (was `helpfulSpecs` in drain order). Per event,
  phases in order: a later phase that the specs so far (the weapons that can hit it) already floor at the threshold adds
  none (AG: the flying shield's Tonalztics ×4 floor Grounded at 99.6%, so no maul is paid), else per weapon the most.
- **Team drain state** (Search / Summary, `teamSpecPlan` with `firstRound`): the first round is the plan within the
  carriers that count (was every carrier's 2 specs); Eye of Ayak carriers unchanged. **Solo** (`soloSpecPlan`): the line's
  Solo plan when the energy pays it, else the best combination of what it pays (now ordered); "floor needs > 8 specs".
- **Kit carriers** (`teamRoles` → `kitCarriers`): per boss / phase the line's Team carriers (`teamLinePlan`), and that
  team first in the boss's passing teams (then `passingTeams`, now at the ordered chance).

**Result** (default party, line = brief, Phase38h1.test.ts, hand-built from upstream's spec calc at each drained Defence):
AG Flying Tonalztics ×4 99.0%; AG Grounded Tonalztics → Elder maul ×2 96.3%; Bork (armour 8-14) Elder maul ×4 97.4%;
the Smorks Tonalztics ×8 96.2%; Ezekiel Elder maul ×3 97.0%; Xarth Tonalztics ×2 97.6%; Ocellus P1 Tonalztics ×2 98.8%,
P2 Elder maul ×4 → Tonalztics ×2 96.6%, P3 Q1-3 Elder maul ×3 → Tonalztics 98.0%, last quadrant (Deflect Melee)
Tonalztics ×5 97.0%. The kit can be short of the line (default 2 maul + 2 Tonalztics carriers on the Smorks: all 8 specs,
P(floor) 90%, Def 5; the line's "4 bring Tonalztics" is then marked short).

**Interleaved orders** (T M T, scratch probe, every FA phase with drains, Team party 6 and Solo, every sequence of the
plan's length and one fewer, interleaved included, at the drained rolls): no interleaved order gains anything (best
any-order P(floor) = the block plan's, 0.000 points on all 23 phases × 2) and none reaches 95% with one spec fewer (closest:
Ocellus P3 Q1-3 3 specs 91.9%, Bork 3 specs 90.1%). **Block orders suffice for the line's plans**; `bestDrainPlan`'s `expand` is unchanged. Review 38h-1: within a kit an
interleaved order can gain (the Smorks with 2 maul + 3 Tonalztics carriers: T T T M M M T T T 97.5% vs the block plan's
95.0%, same 9 specs, no seconds since both are above 95%; 8 specs 93.1% vs 89.7%, still short); reconsider `expand` for
`kitDrainPlan` in 38h-2. Also noted: in the AG event the shield's Tonalztics ×4 are rolled at Grounded's hit chance
(96.2%) for Grounded's state while thrown on the shield (94.3%, floors at 99.0%); both above 95%, ranked Def unchanged.
Specs the bars can't pay are cut, not re-planned (Ocellus P3, the Smorks in fa: the cut equals the re-plan today, one
weapon left); 38h-2 adds a two-weapon-remainder test.

**Open.** The "needs N landed hits once 1 Elder maul spec lands" wording (`landedNeed`) still explains in upstream's
order (maul first) while the plan sends Tonalztics first (AG Grounded); counts and chance agree. When the bars can't pay
the event's plan (Ocellus P3 after P2: the maul bars are below 50%), the specs paid are the plan's minus what doesn't
fit, not a re-plan of what fits.

### Spec bars valued in boss HP (phase 38h-2, FA)

**Why.** The user (2026-10-28): no spec choice may rest on seconds (the fight length can't be predicted); the unit is
boss HP. A drain and a damage spec now compete on the HP they are worth, and a drain's specs go to the events where they
are worth most.

**Values** (encounterBudget.ts `drainOutcomeStates`, the budget's `expectedValue`; damageSpecs.ts net):
- **Drain**: H × g ÷ (1 + g) per row of the event (H = the row's damage until the next Defence reset, g = the DPS gain at
  the drained Defence: DPS with ÷ DPS without − 1), i.e. damage × (1 − DPS without ÷ DPS with); the fight length cancels.
  Review fix (user decision): **averaged over the drain's outcomes**, Σ P(Defence d) × H × (1 − DPS without ÷ DPS at d):
  every Defence the specs can leave (sent in the plan's order, each at the Defence the earlier ones leave:
  `orderedDistribution`), the DPS at d on the monster with that Defence (`PhaseQuery.defence`, bestSetup.ts
  `monsterAtDefence`: a flat drain of the difference); Eye of Ayak at its ranked drain (not averaged: its drain has up to magic defence + 1 outcomes, which would multiply the DPS evaluations; unverified as an approximation). So a partial drain counts with its
  real chances (1 Tonalztics spec on Ocellus P1, 73%, is worth less than 2; it was worth as much at the ranked Defence and
  was therefore excluded before the fix). Ocellus P2 (fixed 120 s, `fixedWall`) counts the extra damage it deals at the
  expected DPS × its carry-over (what comes off P3). H for a later event (P3) is the damage with the earlier events at
  their line plans. The time model still times each plan at its ranked Defence.
- **Damage spec**: its net damage (E[spec] − DPS × its ticks × 0.6, at the Defence the event's drain leaves), the specs on
  a row at most the row's damage.
- **Per bar** (specBudget.ts `allocateBudget`, `DRAIN_CLOSE_CALL` = 0.1): the DP maximises Σ drain value × 1.1 + Σ damage
  net (was the least seconds), ties: the earlier options (the line's plan first), then fewer specs. So a damage spec wins
  only when worth more than 1.1 × the drain; when its energy would buy damage specs worth ≥ 0.9 × the drain, the event is
  a **close call** (`EncounterAllocEvent.closeCall`, Solo: your bar pays the drain; e.g. the Smorks, party 1, Elder maul +
  ZCB: 1 maul spec, 64 HP, kept). Every event's value is in the plan (`EncounterAllocEvent.hp`, `EncounterSpecPlan.hp`).
- **Liquid adrenaline** (ToA): a row's specs cost what its start says (half inside the window); the window guard
  (`ticksBefore`, specs funded after the window at full cost) is gone with the seconds objective (re-check in round 7).
  Surge and Death Charge placement unchanged.

**Options per event** (`eventOptions`, memoised by drain model content): the line's plan within the kit
(`eventWantedCounts`) and that plan cut short after each spec in its send order (partial drains); the line's plan within
every cap (Team: per weapon up to the carriers' first round; Solo: in all, up to 8): what is left when the bars can't
pay the plan is **re-planned over every weapon left, not cut** (review 38h-1 a: Ocellus P3 quadrants 1-3 with 1 maul
spec left: T ×3 → M → T 98.1%, the cut M → T 68.9%); Eye of Ayak every count up to the line's (partial counts count). Exact
drops: options whose outcomes equal none's, or equal those of one with no more of any weapon. **Team** (speed): the
carriers' bars pay only drains and yours only damage specs, so the DP picks the drains first over the carriers' bars,
then your damage specs and dose at the chosen Defence (a damage spec's net changes a little with the drain's DPS; not
weighed in the drain choice; an exhaustive check on Ocellus finds no better joint plan, Phase38h2.test.ts). No option
pruning (an option's HP grows with its specs, so dominance almost never drops one).

**Interleaved send orders** (review 38h-1 b; teamSpecs.ts `bestDrainPlan`, `MAX_DRAIN_BLOCKS` = 3): a weapon may come
back while the order has fewer than 3 blocks (T ×3 → M ×3 → T ×3); every block order is still tried. `defenceOutcome`
(every drain state's ranked Defence) searches the same orders for its counts (`exact`). The Smorks with 2 maul + 3
Tonalztics carriers: T ×3 → M ×3 → T ×3 97.5% vs the best block order 95.0% (Phase38h2.test.ts, upstream's spec calc at
each Defence). The line plans of 38h-1 are unchanged (no interleaved order gains there).

**Kit carriers by HP** (specChoice.ts `kitCarriers` `value`, planner.ts `drainValueOf`; replaces the coverage count and
the worst-boss P(floor) tie-break): each kit within the bars is worth Σ over the bosses / phases **of the route the plan
takes with this kit** (review fix, user decision: the fastest route of the kit under the plan's current specs, as the
plan's route is chosen; summing every route made alternatives like Bork + Smorks and Ezekiel add up) of its drain value
at the line's plan within the kit, averaged over the outcomes as above (H = the phase's damage in the kit's undrained
pass, the DPS = the kit's best; Ocellus P2: the extra damage × its carry-over). The most HP wins (ties: more carriers,
then ROLE_ORDER), except that a kit leaving you out wins unless the other is worth > 1.1 × it (your slot stays yours on
a close call). Per weapon still at most what its line needs. **On the final kit, by what the bars pay** (review fixes N1): the per-phase value above credits every phase with its
full line plan within the kit, as if every bar were full at every phase (Ocellus with 4 Tonalztics: T ×2 on P1 + T ×8
on P2 + T ×5 on P3, which four bars can't pay), so it overrates one-weapon-heavy sets; it still drives the kit search.
The final choice, on the final kit (the item steps re-optimise the kit the carriers were taken on), values every set the
walk considers with the most carriers the bars allow (Eye of Ayak at most the kit's mages) plus the current one by the HP
the bars really pay: Σ `EncounterSpecPlan.hp` (drains + your damage specs, the bars shared between an encounter's
events) of the budgeted plans over the planned route (the planner's DPS matrix); the most HP wins (`pickCarriersByHp`,
within 10% a set leaving you out). A kit never keeps more Eye of Ayak carriers than mages.

**Result** (`pinHeadlines --full`; PROGRESS phase 38h-2 and its review fixes have every moved total): fa 21:39.9 →
21:41.0, faSolo 23:39.1 → 22:53.4, faNotOwned 24:40.2 → 24:43.4. Times move both ways: the objective is HP, not seconds.

**Speed** (Node, one plan alone, compared against the 38h-1 code in the same session; the machine's load varies): fa
1.4× before the review fixes (13.2 → 18.5 s), 1.82× after them (15.7 → 28.6 s: the DPS at every Defence outcome, one
route pass per carrier set at the end).

### Bring rule, no seconds in spec choices (phase 38h-3, FA)

Code: `src/lib/fracturedArchive/bringRule.ts` (pure), planner.ts (the items block and the Solo drain weapons); tests
`src/tests/lib/fracturedArchive/Phase38h3.test.ts`; UI check `scripts/verifyPhase38h3.mjs`.

**Bring rule** (damage spec weapons). A weapon's value on a boss / phase is its **HP per full bar**: `gainPerFullBar`
= (E[spec] − DPS × ticks × 0.6) ÷ energy × 100, E from upstream's spec calc at the Defence of the row's drain event (the
encounter's spec plan) and the row's DPS (`routeSpecGains`; rows of one boss / phase merged by their damage; rows damage
specs can't apply to are skipped: Ocellus P2, targets with `noDamageSpecs`). On the kit before the items and its planned
route: **first** = the weapon ranked first on the most bosses / phases (ties: Σ HP per bar over every phase, then the
weapon order); a **second** only on the bosses / phases where the first gains nothing (can't hit) or another weapon
deals ≥ `BRING_SECOND_FACTOR` (1.2) × the first's HP per bar: the best other weapon there is a candidate, the candidate
of the most such phases is brought. At most two. Each takes a free slot, or (none free) the kit is re-optimised with it
carried and the item kept when the HP it adds on that kit is at least the HP the kit change costs on the route
(`kitHpCost`: per row of the old kit's pass, damage × (1 − new DPS ÷ old DPS), the drain value's form; Ocellus P2 × its
carry-over); faNotOwned: ZCB +400 HP vs the kit's 99 HP, kept; the FA tiny brute-force pool: +412 vs 546, left out. Not modelled: the Zaryte crossbow's ruby proc at the hp left (the rule values it at full hp; the spec budget
still caps every spec at the hp left).

**Surge potions**: while one adds HP the bars pay on the route (Σ `EncounterSpecPlan.hp`) and a slot is free (never a
slot from the kit). **Left at home**: a damage weapon the plan then never specs; Solo, a drain weapon the plan no longer
specs once the damage specs / doses are in.

**Solo drain weapons** (replaces `searchSpecSubsets`: every subset timed, 1 s a slot): the plan with every owned drain
weapon on the reference kit (the bootstrap kit carrying all of them), the spec budget valuing every bar in HP (38h-2);
the weapons it specs on the planned route are brought (`PlanSpecs.solo.perWeapon`: `refSpecs` = that plan's specs,
`specs` = the final plan's on its route, e.g. faSolo Elder maul 2 → 1, Tonalztics 10 → 7, the damage specs and the dose
taking energy). Review fix: one that needs a slot from the kit (the kit without it has none free) is kept only when the
HP it adds on the route is at least `kitHpCost` of the kit change (both kits without it; `slot` records adds / costs; the
worst goes first). The ring screens reuse that set (`screenSubset`). With the spec budget off (legacy, other raids) Solo
brings every owned drain weapon (round 7).

**You carry or you spec** (Team; replaces the faster of the two): "you spec, carriers ≤ party − 1, the items" against
"you carry, no items" by the HP the bars pay on the planned route, `pickCarriersByHp` (within 10% the set leaving you out
wins). The spec items (`PlanItemStep.hp`) report the HP each adds, not seconds. Removed: `searchSpecSubsets`,
`weaponDeltaText`, `bestWithoutText`, `pickSpecItem`, `itemBeam`, `itemStepNet` (38e's beam and swaps). Kept (not a spec
choice of this row) at first; review fix: `assignMe` (your share when you carry, no items) in HP too: the drain HP the
weapon's last carrier's bar pays on the route vs `kitHpCost` of the slot it takes (`share.slotHp`; carried when adds ≥
costs); `SHARE_MAX_SLOT_SECONDS` is gone.

**Briefing per boss**: after the drain line, "· Then: 1. Zaryte crossbow (per bar)" (`thenText`: the weapons that gain,
best HP per bar first, at most two). Plan: the brought weapons per encounter (`PlanSpecs.then`). Search: the Specs box's
order (every damage weapon). Summary: each cell's top loadout (`GearSearchResult.then`, computed on first read).

**Per FA boss** (ZCB HP per bar on the headline plans; best other weapon; the planner's own decision reads these on the
state before the items, Team with you carrying (6 carriers), while the final plan has 5 and your bar on ZCB, so its stored
gains differ a little from the final plan's, Solo Ezekiel 68.4 vs 67.1; the order is the same): Team AG Flying 90.9 (melee can't hit),
Grounded 82.0 (Crimson kisten 60.0), Bork 85.9-84.8 (Crimson kisten / Voidwaker 54-61), Smorks 85.1 (kisten 60.4), Moia
85.5 (melee can't hit), Xarth 74.9 (kisten 60.6), Ocellus P1 86.5 (kisten 59.4), P3 Q1-3 62.3 (kisten 59.8, the closest:
0.96×), P3 Deflect Melee 81.0. Solo: the same order; Ezekiel 67.1 (kisten 60.7); P3 Q1-3 is the one phase where Crimson
kisten is first (59.3 vs 58.7, 1.01×, below 1.2×). So every FA headline brings the Zaryte crossbow alone.

**Result** (`pinHeadlines --full`; PROGRESS phase 38h-3 has every moved total): fa 21:41.0 → 21:47.8, faSolo 22:53.4 →
22:57.2, faNotOwned 24:43.4 unchanged. Times only estimate (user: gear over time): the choices are by the rule and HP.

### Filler spec weapon for leftover energy (phase 38h-3b, FA)

User decision A (2026-10-29). Since 38h-3 every bar goes to the first-ranked damage weapon (FA: Zaryte crossbow, 75%),
leaving 22-40% per encounter. HP only, no seconds:

- **Spend** (specBudget.ts): a weapon flagged `filler` (`DamageChoice.filler`, from `BestSetupAssumptions.damageFiller` →
  `SpecBudgetConfig.filler`) is the DP's second objective: the plan maximises drains × 1.1 + the other damage specs' HP
  first, then the filler's HP (`fw`), then the old tie-breaks. So the filler only uses energy nothing else would: it never
  displaces a main spec or a drain (Jest: one row at 120%: free DP 3 Burning claws = 165 HP, filler DP ZCB + claws =
  155 HP). `hp` counts both. No filler: the DP is unchanged (bit-identical).
- **Bring** (planner items block, after the bring rule's weapons and the surge rule): each owned damage weapon not
  brought is tried as the filler on the kit's planned route; the one adding the most HP (`routeHp` with − without) is
  brought when that is > 0 and a slot is free, or ≥ `kitHpCost` of the kit change when a slot is taken from the kit (kit
  re-optimised, as for the bring rule's weapons). "Leftover energy (+ surge) covers its cost" is what makes the HP > 0.
  Then the surge rule runs again (a dose can now buy a filler spec). At most one filler.
- **Briefing**: Plan, per encounter where the plan makes a filler spec: "Then: 1. Zaryte crossbow (per bar) · leftover:
  Burning claws" (`withLeftover`). Search / Summary (no route): the leftover weapon is the cheapest of those that gain
  and cost less than the first (`leftoverWeapon`, review 38h-3b: energy below the first's cost can only go to a cheaper
  one, and the cheapest fits the most leftovers; ties: most HP per bar); with one, "Then: 1. A (per bar) · leftover: B" (the
  Plan's form), else the top two "Then: 1. A 2. B (per bar)". FA: Burning claws, the same line as on the Plan.

**Result**: fa 21:47.8 → 21:43.3 (Burning claws + one Surge potion; claws on AG, Bork + Smorks, Xarth, Ocellus), faSolo
22:57.2 → 22:53.9 (Burning claws on Ezekiel, Xarth, Ocellus), faNotOwned 24:43.4 unchanged (no free slot: claws add 40 HP,
the kit change costs 788 HP). The ZCB specs per encounter are unchanged (Phase38h3b.test.ts).

### Plan tab you can trust (phase 38j, FA)

ROADMAP 38j (absorbs 41; user, 2026-10-28: "right about choices, not minutes"). Three parts, FA only; switches stay free
(D10).

- **Kits compared, not timed.** The score is unchanged: Σ HP ÷ DPS over the route ("boss time", your DPS alone, the 38h
  spec values). The Plan shows the total once, labelled "boss time, your DPS alone: a rough estimate"
  (`plan-estimate`), and every comparison as a difference: alternatives / rejected kits "1.4% more boss time than this
  kit", kit loadouts "0.6% less boss time than without it", other rings "Bellator ring 3.8% more boss time", the routes
  table's other routes "+x% more" (closeCalls.ts `bossTimeDiff` / `bossTimeVs`; the seconds stay in the tooltips and
  `data-seconds`).
- **Spec energy from the measured room times** (roomTimes.ts, UNVERIFIED D36). Each FA encounter's room time is the
  user's personal best at the party size (docs/calibration/fa-times-2026-10-25.md), else the global best × the user's
  pace at that size (mean personal ÷ global over the bosses with both; 6 players 1.763698), else (1, 7, 8 players: no
  personal times) × the pace over all 24 pairs (1.819193); 8 players use the 7-player bests. `RaidBase.roomSeconds` →
  `RaidTimeAssumptions.roomSeconds`. On the spec budget's clock an encounter lasts max(room, fight wall): the rows are
  stretched in proportion, a fixed-length phase (Ocellus P2, 120 s) kept (`rowWallsOn`), so regen (+10% per tick) and
  Death Charge run over the real room. The raid clock (surge doses, the carry option) = the rooms (`clockWall`) + the
  travel between them, spread evenly (`raidClock(..., even)`, `routeClock`); the FA's "Non-fight time" input becomes
  "Travel time", default 4.5 min = the user's overall best − the five room bests, averaged over 3-6 players (268.75 s).
  The other raids keep the phase 38c clock. Boss time (the score) doesn't use the room times: only the energy moves.
  Hand check (Phase37c / Phase38j): fa Xarth, room 141 s = 4 ticks: your bar 100 + 40 + Death Charge 2.5 − ZCB 75 −
  Crimson kisten 50 = 17.5 (was 1 tick on the 30 s fight wall); faSolo Archive Guardian 178 × 1.819193 = 323.8 s on the
  Lightbearer (15 s): 21 ticks, 100 + 210 + 25 (dose) + 15 − (2 Tonalztics + 3 ZCB = 325) = 25.
- **Close calls** (closeCalls.ts, `CloseCallsBox` under the Bring box): a choice within 2% of its runner-up
  (`CLOSE_CALL_MARGIN`): the kit vs an alternative kit (boss time), a kit loadout vs the kit without it, the camped ring
  vs another planned in full, the last carrier of a drain weapon vs one fewer (`lastSaved`), your spec bar (Team: the HP
  the bars pay with your damage specs vs carrying), the first damage spec weapon vs the best other (HP per bar summed
  over the route), and the Solo drains already flagged by 38h-2 (within 10%). Each is tagged "close call (depends on
  A11, …)": A11 (Defence doesn't scale) for every FA choice, plus the rows of the weapons involved (Obligator A1 / A2,
  Ascension crossbows A5, demonbane weapons A8, Zorya's tome A9). Not computed: whether a choice really flips under an
  assumption (that needs a magnitude per assumption, e.g. how much Defence would scale).
- **Search / Summary filler name** (`leftoverWeapon`): the cheaper weapon with the most HP for one spec (HP per bar ×
  cost), no longer the cheapest: with the room times' regen the plan's leftover after the ZCB specs is ≥ 50% where it
  specs a filler, and it takes Crimson kisten (FA Xarth: Search = Summary = Plan "· leftover: Crimson kisten").

**Result** (`pinHeadlines --full`): fa 21:43.3 → 21:14.1, faSolo 22:53.9 → 22:08.7, faNotOwned 24:43.4 → 24:17.4 (more
energy per encounter: the rooms last 2-5× the 6-man fight wall). PROGRESS has the per-encounter changes.
**Kits ranked by their own spec plan** (38j follow-up): the optimiser times a kit with a reference kit's spec plan
(`fixedAlloc`), which undervalued kits whose own plan differs (other drain weapons per event once energy is spare; the
brute-force probes found kits 0.2-0.5% faster). That time is now a pre-screen: every fitting kit the optimisers timed
(`seenKits`) is re-scored, and in borrowed order those within `OWN_PLAN_MARGIN` (1%) of the best, each loadout saving ≥
`OWN_PLAN_MEMBER_MIN` (0.5 s), are re-timed exactly with their own plan (memoised per kit) until the borrowed time passes
the best exact × 1.01; the fastest keeping the dedupe rule on exact times wins. Run again after the Team carriers are
re-picked by HP (the brute force times every kit under the final carriers). The winners needed 0.50% (small pool) and
0.77% (tiny pool) of borrowed slack. Phase36's brute force now applies the dedupe rule, as the probe does since 38c.
Review 38j: the margin is 1.5% (a kit's own plan beat its borrowed time by up to 1.16% in the tiny pool;
`stats.ownPlanSlack`, Phase37c checks < 0.8 × the margin). The Plan's alternative kits and rejected additions are still
timed with the reference kit's spec plan (the optimiser's score, error up to ~1.2%, under the 2% close-call margin; the
tooltip says so); the chosen kit is not.

### Required variants (phase 40, FA)

Everyone runs the planner's kit; a raid can force a variation on a few players. The FA's (variants.ts `XARTH_FREEZER`;
wiki Strategies → Xarth → Phase 2, docs/DATA_SOURCES.md *Phase 40*): **1 player: + Ancients (Xarth corpses)**, on every
route with Xarth, party ≥ 2 (party 1: none; other raids: none, round 7).

- **Team DPS** (variantBlend.ts, UNVERIFIED D37): on the `xarth` row, `share` = 50% of the HP is phase 2, where the
  freezer casts Ice Barrage at Xarth (Kodai wand + Ancestral, Elidinis' ward (f), the camped ring; owned pieces only) and
  the other n − 1 players deal your DPS d. The team averages d2 = d × (1 − 1/n) + v/n there, so the row's seconds are
  0.5 H ÷ d + 0.5 H ÷ d2, i.e. the row's DPS is the harmonic blend `variantRowDps` = 1 ÷ (0.5/d + 0.5/d2). It is
  applied at the kit (`variantKit` wraps `best` on the variant rows), so passes, drain values, damage specs and the
  carrier valuation all read the team's average. Hand case (Phase40.test.ts): H 2600, d 12, v 6, n 6 → d2 11, 108.33 +
  118.18 = 226.52 s vs 216.67 s.
- **Kit-independent**: the freezer's loadout is fixed per plan run (not sized per kit), so the optimiser, the exact
  re-times, the own-plan picks and the brute force all time the same team (`timeA` in `plan()`; the re-timers rebuild it
  from `PlanResult.variants` with `timeVariantsOfPlan`). The variant's id (def, items, assumptions) is in the memo keys;
  its evaluator is shared per id.
- **Sized to 28 slots** (`PlanResult.variants`): the freezer carries the switch items the kit lacks (+ the heart when no
  kit loadout is magic), paid from the kit's free slots, then supplies are left behind (`VARIANT_DROP_ORDER`: brews,
  food, other, restores). fa: +9 items, 4 free, 5 Saradomin brews left behind.
- **Plan tab** (`VariantsBox.tsx`): "1 player: + Ancients (Xarth corpses)", the role, the switch, the slots, the team DPS
  line ("5 × 13.92 + 1 × 1.73 (Ice Barrage) ÷ 6 = 11.89 DPS per player there; +15.4 s"), and "I'm this player" (saved:
  `plan.variantMe`) showing that kit. Who is the freezer does not change the times.
- **Not modelled**: the freezer's Death Charge (Ancients: their own bar gets none; D32), corpse HP / healing, the
  barrage's damage to the corpses, freezes by Undead Grasp or water spells (the wiki's alternatives).
- Headlines: fa 21:14.1 → 21:29.1 (Xarth 180.61 → 195.57; kit unchanged); faNotOwned 24:17.6 → 24:30.9 (the Dagon'hai
  route and Lightbearer win once Xarth costs the freezer); faSolo (party 1) unchanged.

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
| Ocellus | P1 2500 × (1 − `ocellusWalkingFraction`, default 0) at a corner, the rest at Walking; P2 lasts `ocellusP2Seconds` (default 120 s: phase 38c, D5 / D35) and the damage dealt to the Blade in that time × `ocellusP2CarryOver` 50% comes off P3's 5250; P3 remainder × (1 − `ocellusLastQuadrantFraction` 25%) at Quadrants 1-3, the rest at the Deflect option that is worse for the kit (= the one blocking the kit's best style; for a magic-best kit, where magic is never deflected in our model, the lower of the two) |

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
  **Heart** and offers Saturated / Imbued heart — phase 31: the Plan tab brings it as magic's kit potion, see *Plan tab → Heart*; CoX-only overloads/super potions and
  ToA smelling salts are available in the dropdown but don't work in the raid).
- Prayers: Piety / Rigour / Augury; "Zeal instead of Piety" switches melee to the raid prayer.
- Elemental fragments: on for magic presets (all four elements, +2 base max hit to elemental spells). Only the Kodai
  preset casts spells, so only it is affected.
- **Fight length**: no input since phase 23 — computed per boss / phase (see *Layout and glossary*); it was 90 s for
  every boss (phase 14). The Plan tab uses each encounter's own undrained time. **Floor confidence** 95% (Advanced;
  was "Floor at P ≥"): when a drain plan counts as reaching the floor.
- **Specs I bring** (phase 14 "My specs", the Solo drain state; phase 23: icon toggles; phase 29: renamed, Lightbearer
  moved to its own "Ring: I wear a Lightbearer" toggle; phase 33: none by default — every weapon off, `Ayak × 0` —, and
  in "Planner decides" mode the last plan's "Bring", read-only): with Ayak, "≈ X magic def drained on <boss>" next to it
  = specs × hit chance × expected damage on a hit, from the calculator; Lightbearer off; "Spec energy goes first to:
  Defence drains / Ayak" (Advanced; "Set manually" only — the planner's specs put Defence drains first).
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
that fire ammo list it per weapon (the test checks the calculator accepts it); others have nothing (phase 32; was Rada's blessing) in the ammo
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
