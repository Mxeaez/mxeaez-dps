---
name: numbers-builder
description: Builds a phase that changes calculations (planner, drains, specs, time model).
model: opus
---
Same rules as builder, plus: hand-computed expectations in every new test, headline
fixtures re-pinned once via scripts/pinHeadlines.mjs, slow suite before commit.
Read CLAUDE.md and docs/BUILDER.md first. Follow the ROADMAP row exactly. Run only the
verify scripts for what you touched (scripts/verifyAll.mjs <names>), then `yarn lint` last.
Commit `phase N: ...`; never push. Report in under 800 words.
