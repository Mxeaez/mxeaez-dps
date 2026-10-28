/**
 * Phase 21 UI check (not part of the Jest run): the Plan tab per raid on /best-setup.
 *
 * Usage (dev server running): node scripts/verifyPhase21.mjs [baseUrl]
 * - For each raid tab (Fractured Archive, Tombs of Amascut, Chambers of Xeric, Theatre of Blood): the Plan inputs show
 *   that raid's defaults (comfort supplies, rune pouch, items always brought; src/lib/raids/planDefaults.ts), the plan
 *   runs in ≤ 150 s (phase 27: camp one ring screens six rings), 28 inventory cells, every kit loadout obeys the dedupe
 *   rule (saves ≥ max(1, slots) s).
 * - FA: total 21:44.4 (phase 30: empty pinned defaults; phase 29, the planner picks the spec weapons: 21:53.0; phase 27:
 *   22:47.9; was 23:30.4).
 * - ToB: 7:29.5 at 28/28 (phase 32, no blessing: the Tumeken's shadow loadout in full; phase 31: 7:30.0; phase 29 review: planner carriers; phase 29: 7:30.6; phase 27, camp Ultor ring: 7:31.7; was 7:32.4 with 1 free slot), a Dawnbringer loadout (the staff
 *   free), no Dawnbringer inventory cell, a "Lighter kit" alternative, the "Raid items (0 slots)" note; Search: the
 *   Prinkipas only in Hard Mode. The Scythe loadouts are printed (with one ring camped, single-piece swaps of the Scythe
 *   set merge into the preset names; the dedupe rule is what keeps them).
 * Screenshots docs/screenshots/phase21-*.png.
 */
import { chromium } from '@playwright/test';
import { headlineClose } from './headlines.mjs';
import { openSections } from './phase34Sections.mjs';

const BASE = (process.argv[2] || 'http://localhost:3001/osrs-dps/').replace(/\/?$/, '/');

let failures = 0;
const check = (ok, msg) => {
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`);
};
const shot = async (page, name) => {
  await page.mouse.move(0, 0);
  await page.screenshot({ path: `docs/screenshots/phase21-${name}.png`, fullPage: true });
};

const EXPECTED = {
  'fractured-archive': {
    supplies: {
      brew: 6, restore: 4, food: 0, other: 0,
    },
    pinned: [], // phase 31: not even the heart (magic's kit potion)
    team: 'times: your DPS alone',
  },
  toa: {
    supplies: {
      brew: 0, restore: 6, food: 0, other: 2,
    },
    pinned: [], // phase 30
    team: 'times assume 6 players at your DPS',
  },
  cox: {
    supplies: {
      brew: 2, restore: 2, food: 0, other: 1,
    },
    pinned: [], // phase 30: the planner adds the pickaxe for the Guardians
    team: 'times assume 6 players at your DPS',
  },
  tob: {
    supplies: {
      brew: 4, restore: 3, food: 0, other: 0,
    },
    pinned: [], // phase 31
    team: 'times assume 4 players at your DPS',
  },
};

const runPlan = async (page, raid) => {
  await page.locator(`[data-testid="raid-tab-${raid}"]`).click();
  await page.waitForTimeout(500);
  await page.locator('[data-testid="plan-tab"]').click();
  await page.locator('[data-testid="plan-view"]').waitFor({ timeout: 30000 });
  const exp = EXPECTED[raid];
  const supplies = {};
  for (const k of Object.keys(exp.supplies)) supplies[k] = Number(await page.locator(`#plan-supply-${k}`).inputValue());
  check(JSON.stringify(supplies) === JSON.stringify(exp.supplies), `${raid}: default comfort supplies ${JSON.stringify(supplies)}`);
  // phase 27: no combat potion inputs (they come from the kit)
  check(await page.locator('#plan-supply-ranging, #plan-supply-superCombat').count() === 0, `${raid}: no ranging / super combat inputs`);
  check(Number(await page.locator('#plan-nonitem').inputValue()) === 1, `${raid}: rune pouch / non-items = 1`);
  const pinned = (await page.locator('[data-testid="pinned-item"]').allInnerTexts()).map((t) => t.replace('×', '').trim());
  check(JSON.stringify(pinned) === JSON.stringify(exp.pinned), `${raid}: items always brought = ${pinned.join(', ')}`);
  const t0 = Date.now();
  await page.waitForTimeout(700); // debounce
  await page.locator('[data-testid="plan-progress"]').waitFor({ state: 'detached', timeout: 600000 });
  await page.locator('[data-testid="plan-result"]').waitFor({ timeout: 600000 });
  await openSections(page); // phase 34: open the sections what this script reads moved into
  const secs = (Date.now() - t0) / 1000 + 0.5;
  const headline = (await page.locator('[data-testid="plan-headline"]').innerText()).replace(/\s+/g, ' ').trim();
  const total = (await page.locator('[data-testid="plan-total"]').innerText()).trim();
  const free = Number(await page.locator('[data-testid="free-slots"]').getAttribute('data-free'));
  const cells = await page.locator('[data-testid="inventory-cell"]').count();
  const kit = await page.locator('[data-testid="kit-loadout"]').evaluateAll((els) => els.map((e) => ({
    text: e.textContent.replace(/\s+/g, ' ').trim(),
    weapon: e.getAttribute('data-weapon'),
    group: e.getAttribute('data-group'),
    slots: e.querySelector('[data-testid="kit-marginal"]')?.getAttribute('data-slots'),
    items: e.getAttribute('data-items'),
    saves: (e.querySelector('[data-testid="kit-marginal"]')?.textContent.match(/saves ([\d.]+|∞)/) || [])[1],
  })));
  console.log(`     ${raid} plan (${secs.toFixed(1)} s): ${headline}; free ${free}`);
  kit.forEach((k) => console.log(`       ${k.text.slice(0, 150)}`));
  // phase 27: ≤ 150 s — camp one ring (the default) screens six rings, then plans the best one or two in full;
  // phase 36: ≤ 240 s (the spec budget's DP; CoX's Olm is the slow one); phase 37 (exact memos, parallel ring runs):
  // back to ≤ 150 s (FA 19 s, ToA 17 s, ToB 21 s, CoX 38 s on the dev machine)
  check(secs <= 150, `${raid}: plan ran in ≤ 150 s (${secs.toFixed(1)} s)`);
  check(cells === 28, `${raid}: 28 inventory cells (${cells})`);
  check(headline.includes(exp.team), `${raid}: team label "${exp.team}"`);
  check(kit.every((k) => k.slots === undefined || k.saves === '∞' || Number(k.saves) + 1e-9 >= Math.max(1, Number(k.slots))), `${raid}: every kit loadout saves ≥ max(1 s, 1 s per slot)`);
  return {
    total, kit, free, page,
  };
};

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
  await page.goto(`${BASE}best-setup`, { waitUntil: 'load', timeout: 120000 });
  await page.locator('[data-testid="raid-tab-tob"]').waitFor({ timeout: 120000 });

  // FA
  const fa = await runPlan(page, 'fractured-archive');
  check(headlineClose(fa.total, 'fa'), `FA plan total ${fa.total}`);
  await shot(page, 'plan-fa');

  // ToA, CoX
  const toa = await runPlan(page, 'toa');
  check(toa.kit.some((k) => k.group === 'magic'), 'ToA: a magic loadout (Wardens P2)');
  await shot(page, 'plan-toa');
  const cox = await runPlan(page, 'cox');
  check(cox.kit.some((k) => /pickaxe/.test(k.weapon)), 'CoX: a pickaxe loadout (Guardians)');
  await shot(page, 'plan-cox');

  // ToB
  const tob = await runPlan(page, 'tob');
  const scythes = tob.kit.filter((k) => k.weapon === 'Scythe of Vitur');
  const fullScythePresets = tob.kit.filter((k) => /^(Worn|Switch): (Torva \+ Scythe \(slash\)|Torva helm \+ Oathplate \+ Scythe \(slash\)|Torva \+ Salve \(ei\) \+ Scythe \(slash\))( ·|$)/.test(k.text));
  // phase 27: with one ring camped, the single-piece swaps of a Scythe set (helm, body, Salve) carry the preset names.
  // Review fix: a real guard — no two kit loadouts are the same item set, and every Scythe loadout past the first costs
  // ≥ 1 slot or saves ≥ 1 s (the dedupe rule)
  check(new Set(tob.kit.map((k) => k.items)).size === tob.kit.length, `ToB: no two kit loadouts are the same item set (${tob.kit.length} loadouts)`);
  const extraScythes = scythes.slice(1);
  check(extraScythes.every((k) => Number(k.slots) >= 1 || k.saves === '∞' || Number(k.saves) >= 1), `ToB: every extra Scythe loadout costs ≥ 1 slot or saves ≥ 1 s (${extraScythes.map((k) => `+${k.slots} slot, ${k.saves} s`).join('; ')})`);
  console.log(`     ToB Scythe preset-named loadouts: ${fullScythePresets.map((k) => k.text.split(' · ')[0]).join(' / ')}; Scythe loadouts ${scythes.length}`);
  const dawn = tob.kit.filter((k) => k.weapon === 'Dawnbringer');
  check(dawn.length === 1 && Number(dawn[0].slots) <= 1, `ToB: a Dawnbringer loadout, the staff free (${dawn.map((k) => `${k.text.split(' · ')[0]} +${k.slots}`).join(', ')})`);
  const alts = await page.locator('[data-testid="plan-alternatives"] li').allInnerTexts();
  alts.slice(0, 2).forEach((a) => console.log(`     alt: ${a.slice(0, 200)}`));
  // phase 25: 7:32.2 → 7:32.4; phase 27 (camp Ultor ring, potions from the kit): 7:31.7 at 28/28 (CrossRaid HEADLINES)
  // phase 29 (the planner picks the spec weapons: Tonalztics, its slot worth 0.5 s): 7:30.6; review: the planner's
  // carriers (2 Tonalztics + 1 Elder maul): 7:30.0
  check(tob.free === 0 && headlineClose(tob.total, 'tob'), `ToB main plan 28/28 (${tob.total}, ${tob.free} free)`);
  check(alts.some((a) => /^Lighter kit: .*−\d+ slots? for \+\d+\.\d s/.test(a)), 'ToB: "Lighter kit" alternative (−N slots for +X.X s)');
  const dawnCell = await page.locator('[data-testid="inventory-cell"][data-label="Dawnbringer"]').count();
  check(dawnCell === 0, 'ToB: no Dawnbringer inventory cell');
  await openSections(page, ['plan-advanced']); // phase 34: the raid items moved to Advanced (plan)
  check((await page.locator('[data-testid="raid-supplied"]').innerText()).includes('Dawnbringer'), 'ToB: "Raid items (0 slots): Dawnbringer" shown');
  await shot(page, 'plan-tob');

  // ToB Search: Prinkipas only in Hard Mode
  await page.locator('[data-testid="search-tab"]').click();
  await page.waitForTimeout(500);
  const options = async () => page.locator('[data-testid="boss-select"] option').evaluateAll((els) => els.map((e) => e.value));
  const normal = await options();
  check(!normal.some((k) => k.startsWith('tob-prinkipas')), `ToB Normal: no Prinkipas in the boss list (${normal.length} targets)`);
  await page.locator('#bs-scale-tobMode').selectOption({ label: 'Hard Mode' });
  await page.waitForTimeout(500);
  const hard = await options();
  check(hard.filter((k) => k.startsWith('tob-prinkipas')).length === 3, `ToB Hard Mode: 3 Prinkipas in the boss list (${hard.length} targets)`);
  await page.locator('[data-testid="boss-select"]').selectOption('tob-prinkipas-magic');
  await page.waitForTimeout(800);
  await shot(page, 'tob-hm-prinkipas');
  await page.locator('#bs-scale-tobMode').selectOption({ label: 'Normal' });
  await page.waitForTimeout(500);
  const back = await page.locator('[data-testid="boss-select"]').inputValue();
  check(!back.startsWith('tob-prinkipas'), `ToB back to Normal: the selected Prinkipas falls back to ${back}`);

  await browser.close();
  console.log(failures ? `${failures} FAILED` : 'all OK');
  process.exit(failures ? 1 : 0);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
