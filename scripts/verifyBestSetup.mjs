/**
 * Phase 8 UI check (not part of the Jest run).
 *
 * Usage (dev server running): node scripts/verifyBestSetup.mjs [baseUrl]
 * Opens the "Best setup" view, checks the Shadow row vs Archive Guardian (Flying), Team drain against Jest
 * (src/tests/lib/fracturedArchive/Presets.test.ts: 70 / 10.595), selects Bork and Ocellus P2 and the Summary tab
 * (screenshots docs/screenshots/phase8-bork.png, phase8-ocellus-p2.png, phase8-summary.png), then loads two rows
 * into the main calculator ("Load into calculator") and checks the calculator's DPS / max hit equal the view's.
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE = (process.argv[2] || 'http://localhost:3001/osrs-dps/').replace(/\/?$/, '/');

let failures = 0;
const check = (ok, msg) => {
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`);
};

const waitForRanking = async (page) => {
  await page.locator('[data-testid="loading"]').waitFor({ state: 'detached', timeout: 120000 }).catch(() => {});
  await page.locator('[data-testid="ranking-row"]').first().waitFor({ timeout: 120000 });
  await page.waitForTimeout(300);
};

const readRows = async (page) => page.locator('[data-testid="ranking-row"]').evaluateAll((rows) => rows.map((r) => ({
  preset: r.querySelector('td:nth-child(2) .font-bold').textContent.trim(),
  dps: r.querySelector('[data-testid="dps"]').textContent.trim(),
  maxHit: r.querySelector('[data-testid="maxhit"]').textContent.trim(),
})));

const openView = async (browser) => {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1400 } });
  await page.goto(`${BASE}best-setup`, { waitUntil: 'load', timeout: 120000 });
  await waitForRanking(page);
  return page;
};

const selectBoss = async (page, key) => {
  await page.locator('[data-testid="boss-select"]').selectOption(key);
  await waitForRanking(page);
};

// main calculator results table: first loadout column of the row labelled `label`
const readCalcRow = async (page, label) => {
  const row = page.locator('table tbody tr', { has: page.locator('th[title]', { hasText: new RegExp(`^${label}$`) }) }).first();
  return (await row.locator('th').nth(1).innerText()).trim();
};

/** Loads the row for `preset` into the calculator (fresh browser context = no saved session) and compares. */
const loadAndCompare = async (browser, bossKey, drain, preset) => {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1400 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}best-setup`, { waitUntil: 'load', timeout: 120000 });
  await waitForRanking(page);
  await selectBoss(page, bossKey);
  await page.locator(`[data-testid="drain-${drain}"]`).click();
  await page.waitForTimeout(300);
  const rows = await readRows(page);
  const ix = rows.findIndex((r) => r.preset === preset);
  const view = rows[ix];
  await page.locator('[data-testid="ranking-row"]').nth(ix).getByRole('button', { name: 'Load into calculator' }).click();
  await page.waitForURL((u) => !u.pathname.endsWith('best-setup'), { timeout: 60000 });
  await page.getByPlaceholder('Search for monster...').waitFor({ timeout: 120000 });
  await page.waitForTimeout(3000);
  const dps = await readCalcRow(page, 'DPS');
  const maxHit = await readCalcRow(page, 'Max hit');
  check(dps === view.dps && maxHit === view.maxHit, `${bossKey} ${drain} ${preset}: view ${view.dps} / ${view.maxHit}, calculator ${dps} / ${maxHit}`);
  await page.mouse.move(0, 0);
  await page.screenshot({ path: `docs/screenshots/phase8-loaded-${bossKey}.png`, fullPage: true });
  await ctx.close();
};

const main = async () => {
  fs.mkdirSync('docs/screenshots', { recursive: true });
  const browser = await chromium.launch();
  const page = await openView(browser);

  // Jest parity: Shadow vs AG Flying, Team drain (default drain state)
  await selectBoss(page, 'ag-flying');
  const ag = await readRows(page);
  const shadow = ag.find((r) => r.preset === "Tumeken's shadow (Ancestral)");
  check(shadow.dps === '10.595' && shadow.maxHit === '70', `AG Flying Team: Shadow ${shadow.dps} / ${shadow.maxHit} (Jest 10.595 / 70)`);
  const greyed = await page.locator('[data-testid="ranking-row"].opacity-50').count();
  check(greyed === 7, `AG Flying: ${greyed} melee rows greyed (can't hit)`);

  await selectBoss(page, 'bork');
  const bork = await readRows(page);
  check(bork.length === 13, `Bork: ${bork.length} presets ranked, top ${bork[0].preset} ${bork[0].dps}`);
  const specs = await page.locator('[data-testid="drain-specs"]').innerText();
  check(specs.includes('2× Elder maul') && specs.includes('8× Ayak (300 dmg)'), `Bork Team drains: ${specs.split('\n')[0]}`);
  await page.mouse.move(0, 0);
  await page.screenshot({ path: 'docs/screenshots/phase8-bork.png', fullPage: true });

  await selectBoss(page, 'ocellus-p2');
  const p2 = await page.locator('[data-testid="ranking-row"]').first().innerText();
  check(p2.includes('n/a'), 'Ocellus P2: TTK shown as n/a');
  await page.screenshot({ path: 'docs/screenshots/phase8-ocellus-p2.png', fullPage: true });

  await page.locator('[data-testid="summary-tab"]').click();
  await page.locator('[data-testid="summary"]').waitFor({ timeout: 180000 });
  const summaryRows = await page.locator('[data-testid="summary"] tbody tr').count();
  check(summaryRows === 17, `Summary: ${summaryRows} boss/phase rows`);
  await page.screenshot({ path: 'docs/screenshots/phase8-summary.png', fullPage: true });
  await page.close();

  await loadAndCompare(browser, 'bork', 'team', bork[0].preset);
  await loadAndCompare(browser, 'ag-flying', 'solo', 'Twisted bow (Masori)');

  await browser.close();
  process.exit(failures ? 1 : 0);
};

main();
