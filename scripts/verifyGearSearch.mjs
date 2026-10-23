/**
 * Phase 9 UI check (not part of the Jest run).
 *
 * Usage (dev server running): node scripts/verifyGearSearch.mjs [baseUrl]
 * Opens /best-setup (Search is the default tab and runs automatically since phase 12), switches to Xarth (drains None)
 * and Ocellus P2 (Team) — each change re-runs the full search (all styles) — records the wall time (change → table), checks the top row against a Jest run of runGearSearch with the same inputs (docs/BEST_SETUP.md,
 * "Search results"), checks Cancel stops a run, screenshots docs/screenshots/phase9-search-*.png, and loads each top
 * row into the main calculator to compare DPS / max hit.
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE = (process.argv[2] || 'http://localhost:3001/osrs-dps/').replace(/\/?$/, '/');

// runGearSearch in Jest (default assumptions) for the top row of the full search
const EXPECTED = {
  'xarth|none': { dps: '12.839', maxHit: '58' },
  'ocellus-p2|team': { dps: '15.551', maxHit: '58' },
};

let failures = 0;
const check = (ok, msg) => {
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`);
};

// Opens /best-setup and waits for the automatic search of the default boss.
const openSearch = async (ctx) => {
  const page = await ctx.newPage();
  await page.goto(`${BASE}best-setup`, { waitUntil: 'load', timeout: 120000 });
  await page.locator('[data-testid="search-row"]').first().waitFor({ timeout: 120000 });
  return page;
};

// Changing the boss / drains re-runs the search automatically (300 ms debounce).
const runSearch = async (page, bossKey, drain) => {
  const t0 = Date.now();
  await page.locator('[data-testid="boss-select"]').selectOption(bossKey);
  await page.locator(`[data-testid="drain-${drain}"]`).click();
  await page.locator('[data-testid="search-row"]').first().waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
  await page.locator('[data-testid="search-row"]').first().waitFor({ timeout: 120000 });
  const wall = (Date.now() - t0) / 1000;
  const top = await page.locator('[data-testid="search-row"]').first().evaluate((r) => ({
    dps: r.querySelector('[data-testid="dps"]').textContent.trim(),
    maxHit: r.querySelector('[data-testid="maxhit"]').textContent.trim(),
    gain: r.querySelector('[data-testid="gain"]').textContent.trim(),
    weapon: r.querySelector('td:nth-child(8) .font-bold').textContent.trim(),
  }));
  const stats = await page.locator('[data-testid="search-stats"]').innerText();
  return { wall, top, stats };
};

const readCalcRow = async (page, label) => {
  const row = page.locator('table tbody tr', { has: page.locator('th[title]', { hasText: new RegExp(`^${label}$`) }) }).first();
  return (await row.locator('th').nth(1).innerText()).trim();
};

const searchAndLoad = async (browser, bossKey, drain, shot) => {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1400 } });
  const page = await openSearch(ctx);
  const { wall, top, stats } = await runSearch(page, bossKey, drain);
  console.log(`     ${bossKey} ${drain}: ${wall.toFixed(1)}s wall (change → table); ${stats}`);
  console.log(`     top: ${top.weapon} ${top.dps} / ${top.maxHit} (vs best preset ${top.gain})`);
  const exp = EXPECTED[`${bossKey}|${drain}`];
  check(top.dps === exp.dps && top.maxHit === exp.maxHit, `${bossKey} ${drain}: top ${top.dps} / ${top.maxHit} (Jest ${exp.dps} / ${exp.maxHit})`);
  check(wall <= 15, `${bossKey} ${drain}: wall time ${wall.toFixed(1)}s <= 15s`);
  await page.mouse.move(0, 0);
  await page.screenshot({ path: `docs/screenshots/phase9-search-${shot}.png`, fullPage: true });

  await page.locator('[data-testid="search-row"]').first().getByRole('button', { name: 'Load into calculator' }).click();
  await page.waitForURL((u) => !u.pathname.endsWith('best-setup'), { timeout: 60000 });
  await page.getByPlaceholder('Search for monster...').waitFor({ timeout: 120000 });
  await page.waitForTimeout(3000);
  const dps = await readCalcRow(page, 'DPS');
  const maxHit = await readCalcRow(page, 'Max hit');
  check(dps === top.dps && maxHit === top.maxHit, `${bossKey} ${drain} loaded: view ${top.dps} / ${top.maxHit}, calculator ${dps} / ${maxHit}`);
  await page.screenshot({ path: `docs/screenshots/phase9-search-${shot}-loaded.png`, fullPage: true });
  await ctx.close();
};

const checkCancel = async (browser) => {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const page = await openSearch(ctx);
  await page.locator('[data-testid="boss-select"]').selectOption('smorks'); // starts an automatic run
  await page.locator('[data-testid="search-progress"]').waitFor({ timeout: 10000 });
  await page.waitForTimeout(500); // past the 300 ms debounce; a full search takes ~1 s here: cancel while it runs
  await page.locator('[data-testid="search-cancel"]').click();
  await page.waitForTimeout(1500);
  const progress = await page.locator('[data-testid="search-progress"]').count();
  const rows = await page.locator('[data-testid="search-row"]').count();
  const runVisible = await page.locator('[data-testid="search-run"]').count();
  check(progress === 0 && rows === 0 && runVisible === 1, `Cancel: progress hidden, no results, Run button back (${progress}/${rows}/${runVisible})`);
  await ctx.close();
};

const main = async () => {
  fs.mkdirSync('docs/screenshots', { recursive: true });
  const browser = await chromium.launch();
  await searchAndLoad(browser, 'xarth', 'none', 'xarth-none');
  await searchAndLoad(browser, 'ocellus-p2', 'team', 'ocellus-p2-team');
  await checkCancel(browser);
  await browser.close();
  process.exit(failures ? 1 : 0);
};

main();
