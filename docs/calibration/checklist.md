# Calibration checklist (phase 38i)

Short list of things to write down while you play. Put every result in `docs/calibration/results.md` (the block named in each
item). Rough numbers are fine; more tries is better than a perfect one.

## 1. Drain specs: thrown vs landed

For each boss, count the specs you throw and how many land (a "landed" spec shows the Defence drop hit splat / the lowered
Defence). Over many kills this gives a hit rate to compare with ours. Write into results.md block **A**.

Our hit chance per spec (default party of 6, Team plan; from `node scripts/probes/drainOutcome.mjs <encounter> --plan fa`,
Ezekiel `--plan faSolo`) and how many specs the plan throws:

| Boss / phase | Spec weapon | Our hit chance | Specs the plan counts | Floor reached (our chance) |
|---|---|---|---|---|
| Archive Guardian (Grounded) | Tonalztics | 96.2% | 4 | 99.2% |
| Archive Guardian (Flying / shield) | Tonalztics | 94.3% | 4 | 98.0% |
| Bork (every armour phase) | Elder maul | 76.8% | 4 | 95.9% |
| The Smorks | Tonalztics | 91.5% | 6 | 28.5% (floor 0, so any extra drain helps) |
| Ezekiel | Tonalztics | 79.6% | 2 | 43.0% |
| Xarth | Tonalztics | 95.3% | 2 | 97.0% |
| Ocellus P1 | Tonalztics | 97.3% | 2 | 98.6% |
| Ocellus P2 (Blade) | Elder maul / Tonalztics | 82.9% / 92.6% | 4 + 4 | 98.1% |
| Ocellus P3 | Tonalztics | 73.1% | 2 | 31.9% |

Record per boss: weapon, thrown, landed, and (if you can see it) the boss's Defence after the drains. Hit chances are the spec's
accuracy against the boss's current Defence; they rise as Defence drops, so count the first spec of each kill separately if you can.

## 2. RuneLite DPS Counter vs our DPS

Run the DPS Counter plugin on a kill, wear one fixed setup the whole kill (no switching), and note the counter's DPS for you
alone, the party size, and whether the boss was drained. Write into results.md block **B**.

Our DPS for the four standard setups with the boss drained as the Team plan drains it (99s, Super combat / Ranging / Saturated
heart, Piety / Rigour / Augury; best style shown). The counter's number will be lower for real (misses of your own timing,
movement, switching, mechanics), so compare the *ratios* between setups and bosses more than the raw number:

| Boss / phase | Twisted bow | Scythe | Obligator | Shadow |
|---|---|---|---|---|
| AG Grounded | 10.7 (Rapid) | 9.5 (Chop) | 12.6 (Thrust) | 9.1 (Accurate) |
| AG Flying | 10.6 (Rapid) | 0.0 (Reap) | 0.0 (Thrust) | 9.1 (Accurate) |
| Bork armour 8 | 4.1 (Rapid) | 4.0 (Reap) | 10.1 (Thrust) | 9.0 (Accurate) |
| Bork armour 14 | 3.0 (Rapid) | 2.6 (Chop) | 8.6 (Thrust) | 9.0 (Accurate) |
| Smorks | 10.9 (Rapid) | 12.2 (Chop) | 14.3 (Thrust) | 6.2 (Accurate) |
| Ezekiel | 9.8 (Rapid) | 11.9 (Chop) | 13.8 (Thrust) | 8.6 (Accurate) |
| Xarth | 10.4 (Rapid) | 10.8 (Chop) | 13.6 (Thrust) | 6.0 (Accurate) |
| Ocellus P1 at a corner | 10.9 (Rapid) | 10.2 (Chop) | 11.9 (Thrust) | 8.7 (Accurate) |
| Ocellus P3 quadrants 1-3 | 8.5 (Rapid) | 9.3 (Chop) | 12.4 (Thrust) | 7.0 (Accurate) |

Also write the real gear and potions if they differ from the above. Our numbers on the same setups with no drains are in
`docs/DATA_SOURCES.md`, *Phase 38i* (they match Gearscape).

## 3. UNVERIFIED items (what to record)

**A11: Defence does not scale with party size** (`docs/UNVERIFIED.md` A11). Read one boss's Defence at the start of the fight
(Defence plugin or Monster Examine) as a duo and as a 6-man (any pair of sizes is fine), and the Defence it stops at after the drains
(Archive Guardian floor 156). Write both sizes and numbers into block **C**. Same number = no scaling (our assumption).

**A1: Obligator Thrust, how many accuracy rolls** (A1). Hit one boss about 100 times with Thrust and count the 0 hits. We expect
about (1 - the calculator's Accuracy) of hits to be 0 (e.g. 68.2% accuracy on AG Grounded undrained: about 32 zeros in 100). Many
fewer zeros means each roll has its own accuracy roll. Also note your highest Thrust hit on a 5x5 boss (we show 58 at 99s with the
Torva setup; the size bonus per hit or on the max would differ). Block **D**: boss, accuracy shown, thrusts, zeros, highest hit.

**A3: Ocellus last quadrant, is magic deflected?** (A3). Done 2026-10-28: not deflected (user). During Deflect Melee in P3, attack with Tumeken's shadow (or any spell) and
note whether hits are normal or 0; do the same during Deflect Ranged if you can. Block **E**: which deflect, weapon, normal or 0.

**A7: Bork flat armour steps 8 / 10 / 12 / 14** (A7). With one weapon, record your highest hit on Bork while the Smorks are above 75%
(expect max - 8), 75-51%, 50-26% and below 25% (expect max - 14). Scythe is clearest (3 hits per swing). If you use Seeking dragon
arrows, also note whether low Twisted bow hits on Bork show as 3 or 0 (Gearscape and our calculator disagree on this, see
*Phase 38i* in `docs/DATA_SOURCES.md`). Block **F**: weapon, Smorks HP band, highest hit.
