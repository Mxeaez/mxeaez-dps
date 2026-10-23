# Merging upstream (weirdgloop/osrs-dps-calc)

This fork branched from upstream `89c3e25`. Most raid code is in new files (`src/lib/fracturedArchive/*`,
`src/lib/scaling/FracturedArchive.ts`, `src/app/components/bestSetup/*`, `src/app/components/monster/FracturedArchive*`,
`src/worker/searchWorker*.ts`, `docs/`, `scripts/verify*.mjs`, `scripts/copyCdn.mjs`), which never conflict. Upstream
files only get small hooks that call into those modules.

## How to merge

```
git fetch upstream
git switch main-mxeaez
git merge upstream/main
# resolve conflicts (see below), then:
cd scripts; uv run generateMonsters.py; uv run generateEquipment.py; cd ..
node .yarn/releases/yarn-4.9.2.cjs install
node .yarn/releases/yarn-4.9.2.cjs test
node .yarn/releases/yarn-4.9.2.cjs lint
npx tsc --noEmit
```

Then, with `yarn dev` running, check the raid bosses in the UI (`node scripts/verifyFracturedArchiveMonsters.mjs`,
`verifyBestSetup.mjs`) and
compare the best-setup numbers with the snapshot in `docs/BEST_SETUP.md`.

## Generated data: regenerate, don't hand-merge

`cdn/json/monsters.json` and `cdn/json/equipment.json` are generated from the wiki. On a conflict, take either side
(`git checkout --theirs cdn/json/monsters.json cdn/json/equipment.json`) and **re-run the generators** (above). Our
hand-added data lives elsewhere and survives a regeneration:

- `scripts/manual_monster.json`: Ocellus Phase 2 (The Blade), manual id 100090. If the wiki ever adds a row for
  P2 (ids 16675 / 16676), delete the manual entry so the monster doesn't appear twice. `OCELLUS_P2_IDS` already lists
  both ids.
- Image folders `cdn/monsters/`, `cdn/equipment/`: the generators download what's missing.

After regenerating, run the tests. They cover the raid mechanics and every preset / search item name. Also re-run
`node scripts/verifyFracturedArchiveMonsters.mjs` (dev server running), which compares the raid monsters' stats in the UI with the wiki
values (Bork's flat armour comes from the phase input, so the generated 0 is expected).

## Upstream files we touched (vs `89c3e25`, lines added / removed)

| File | +/− | What | Conflict risk |
|---|---|---|---|
| `src/lib/PlayerVsNPCCalc.ts` | 62 / 6 | imports; Zorya's tome accuracy, max hit and spec; fragment max-hit bonus; stunned-Bork accuracy; Obligator thrust distribution (+ Maggot King exclusion); ascension (e) bolts added to the diamond/onyx `wearing` lists; Bork magic resistance and Ocellus void-explosion transforms; `isImmune` checks (incl. Moia out of melee reach, phase 15); 3 capitalisation fixes in `UNIMPLEMENTED_SPECS` | **Medium–high**: about 9 separate places in upstream's busiest file. Each hunk is 2–6 lines next to an upstream anchor (Eye of Ayak spec, elemental amulet, Eclipse Moon clone, scythe dist, flat armour, `isImmune`), so conflicts are local and easy to redo by hand |
| `src/lib/BaseCalc.ts` | 20 / 7 | imports; demonbane hook (`?? 100`); spell-immunity, Ocellus-prayer and melee-reach (Moia) issues; Blood/Blue/Eclipse Moon and Staff of the Dead name fixes | Medium: the name fixes will conflict if upstream fixes them too. Take upstream's version of those lines |
| `src/lib/constants.ts` | 15 / 0 | re-export of the raid constants; party-size list; phase dropdowns for Bork / Ocellus / Dagon'hai | Low (additions next to the Mad Angel phases and the party-size list) |
| `src/lib/Equipment.ts` | 11 / 0 | ascension ammo; Obligator Smash speed; Zorya spec cost | Low |
| `src/lib/scaling/DefenceReduction.ts` | 9 / 1 | raid floors in `getDefenceFloor`; AG magic-level drain floor | Low–medium (the `floors` line replaces upstream's `const floor = ...` line) |
| `src/lib/MonsterScaling.ts` | 2 / 0 | `applyFracturedArchiveScaling` after ToA | Low |
| `src/lib/CalcDetails.ts` | 1 / 0 | `MAX_HIT_ELEMENTAL_FRAGMENT` | Low |
| `src/enums/Prayer.ts` | 16 / 1 | **Zeal = 21** | **High if upstream adds a prayer**: it will likely take id 21 too. Renumber Zeal to the next free id. Saved loadouts that stored 21 then need a one-time fix (only Zeal users) |
| `src/enums/EquipmentCategory.ts`, `src/utils.ts` | 1 + 18 / 1 | Extending Chain Mace category + styles; CDN URL and shortlink env flags | Medium if upstream adds the Obligator itself. Then drop ours and keep `getObligatorAttackSpeed` / thrust logic only if upstream lacks it |
| `src/types/Player.ts` | 6 / 1 | `buffs.elementalFragments` | Low |
| `src/worker/CalcWorkerTypes.ts`, `worker.ts` | 62 + 6 | `BEST_SETUP`, `BEST_SETUP_SEARCH`, `RAID_ROUTES` (phase 16) request types | Low–medium (enum additions at the end) |
| `src/app/components/monster/MonsterContainer.tsx` | 12 / 2 | party size 2–8 + hint for raid bosses | Low |
| `DefensiveReductions.tsx`, `player/Combat.tsx`, `TopBar.tsx` | 2, 2, 12 | drain-preset buttons, fragment toggle, "Best setup" button | Low |
| `Footer.tsx`, `ShareModal.tsx`, `InitialLoad.tsx`, `layout.tsx` | 11, 17, 1, 3 | fork branding, shortlinks off | Low–medium (branding text; keep ours) |
| `package.json`, `yarn.lock` | 2 / 1, 32 | build runs `copyCdn.mjs`; `@playwright/test` | Medium for `yarn.lock`: resolve by taking upstream's and re-running `yarn install` |
| `scripts/generate*.py` | 2 / 2 each | UTF-8 file encoding (Windows); alias names | Low |
| `README.md`, `.env.production`, `.nvmrc`, `.gitignore` | — | fork-specific | Keep ours |

No consolidation was done in phase 11. The hooks are already as small as they can be without refactoring upstream
code, and moving them would not make the merge easier.

## Things upstream might add that overlap with ours

- **Fractured Archive support upstream** (bosses, Obligator, Zorya's tome, ascension crossbows, Zeal): prefer
  upstream's version of each, then delete ours and re-run the raid tests (`src/tests/lib/fracturedArchive/*`,
  `src/tests/lib/scaling/FracturedArchive.test.ts`). Expect differences wherever `docs/UNVERIFIED.md` lists an
  assumption.
- **Defence floors**: if upstream adds raid floors to `getDefenceFloor`, keep one source (ours is
  `DEFENCE_FLOORS` in `src/lib/scaling/FracturedArchive.ts`).
- **Party size / HP scaling**: if upstream adds Fractured Archive scaling to `MonsterScaling.ts`, remove
  `applyPartySizeScaling` but keep `applyBorkFlatArmour` (or move it to `Phases.ts`).
