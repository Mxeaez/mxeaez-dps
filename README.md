# mxeaez-dps

A fork of the [OSRS Wiki DPS calculator](https://github.com/weirdgloop/osrs-dps-calc) (by Weird Gloop, GPL-3.0),
live at **https://dps.mxeaez.com**.

What this fork adds on top of upstream:

* **The Fractured Archive (raid 4) bosses**: Archive Guardian, The Smorks + Bork, Dreadnoth the Jellied, Xarth and
  Ocellus (all phases), with party size, defence floors and boss-specific rules, plus the raid's reward items.
* **Best setup** (`/best-setup`): ranks gear presets per boss and runs a full gear **search** in a web worker.
* Images served from this repo's `cdn/` folder, so new monsters have images.

Data sources and unverified values are listed in [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md); the work is logged in
[ROADMAP.md](ROADMAP.md) and [PROGRESS.md](PROGRESS.md). See [NOTICE](NOTICE) for license and modification notes,
and [docs/DEPLOY.md](docs/DEPLOY.md) for the Cloudflare Pages setup.

## Local development

Yarn 4 is vendored in `.yarn/releases` (Node 22 LTS, see `.node-version`):

```
node .yarn/releases/yarn-4.9.2.cjs install
node .yarn/releases/yarn-4.9.2.cjs dev     # http://localhost:3001/osrs-dps (or the port Next prints)
node .yarn/releases/yarn-4.9.2.cjs test
node .yarn/releases/yarn-4.9.2.cjs lint
node .yarn/releases/yarn-4.9.2.cjs build   # static export in out/ (stop dev and delete .next first)
```

## Upstream

Web-based DPS calculator for Old School RuneScape, created for the [OSRS Wiki](https://oldschool.runescape.wiki).
The original is at https://tools.runescape.wiki/osrs-dps; please report issues with the base calculator
[upstream](https://github.com/weirdgloop/osrs-dps-calc) ([contributing info](CONTRIBUTING.md)).

## Acknowledgements
* Bitterkoekje's [spreadsheet](https://docs.google.com/spreadsheets/d/1wzy1VxNWEAAc0FQyDAdpiFggAfn5U6RGPp2CisAHZW8/edit?pli=1#gid=158500257) for a lot of initial math, formulas, and more
* Many [OSRS Wiki](https://oldschool.runescape.wiki) contributors for information on items, monsters, spells, and more
* ...and all of the [contributors](https://github.com/weirdgloop/osrs-dps-calc/graphs/contributors) to this project!
