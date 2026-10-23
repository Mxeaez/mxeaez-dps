/**
 * Best-setup Summary tab check (not part of the Jest run). Phase 8 checked the "Per boss" preset table here; that tab
 * was removed in phase 13 and the Summary became search-based, so this now checks the Summary.
 *
 * Usage (dev server running): node scripts/verifyBestSetup.mjs [baseUrl]
 * Opens /best-setup → Summary: the searches run one after the other with a progress bar; Cancel stops them and
 * Continue resumes (cached cells stay); waits for every cell (20 rows × None/Solo/Team), checks the DPS cells use the
 * accent orange, that switching tabs keeps the cache (no re-run), and loads one cell into the calculator (same DPS).
 * Screenshots docs/screenshots/phase13-summary*.png.
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE = (process.argv[2] || 'http://localhost:3001/osrs-dps/').replace(/\/?$/, '/');

let failures = 0;
const check = (ok, msg) => {
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`);
};

const readCalcRow = async (page, label) => {
  const row = page.locator('table tbody tr', { has: page.locator('th[title]', { hasText: new RegExp(`^${label}$`) }) }).first();
  return (await row.locator('th').nth(1).innerText()).trim();
};

const main = async () => {
  fs.mkdirSync('docs/screenshots', { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 1400 } });
  await page.goto(`${BASE}best-setup`, { waitUntil: 'load', timeout: 120000 });
  check(await page.locator('[data-testid="boss-tab"]').count() === 0, 'no "Per boss" tab');

  const t0 = Date.now();
  await page.locator('[data-testid="summary-tab"]').click();
  await page.locator('[data-testid="summary-progress"]').waitFor({ timeout: 30000 });
  check(await page.locator('[data-testid="summary-row"]').count() === 20, 'Summary: 20 boss / phase rows');
  await page.locator('[data-testid="summary-cell"]').nth(1).waitFor({ timeout: 120000 });

  // Cancel, then Continue
  await page.locator('[data-testid="summary-cancel"]').click();
  await page.waitForTimeout(500);
  const afterCancel = await page.locator('[data-testid="summary-cell"]').count();
  check(await page.locator('[data-testid="summary-continue"]').count() === 1, `Cancel stops the run (${afterCancel} cells kept)`);
  await page.waitForTimeout(1500);
  check(await page.locator('[data-testid="summary-cell"]').count() === afterCancel, 'nothing runs after Cancel');
  await page.locator('[data-testid="summary-continue"]').click();

  await page.locator('[data-testid="summary-progress"]').waitFor({ state: 'detached', timeout: 900000 });
  const cells = await page.locator('[data-testid="summary-cell"]').count();
  check(cells === 60, `all searches done: ${cells} cells in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  const cls = await page.locator('[data-testid="summary"] [data-testid="dps"]').first().getAttribute('class');
  check(cls.includes('text-orange-400') && cls.includes('font-semibold'), `Summary DPS class: ${cls}`);
  const icons = await page.locator('[data-testid="summary"] img[data-testid="item-icon"]').evaluateAll(async (imgs) => {
    await Promise.all(imgs.map((img) => {
      img.scrollIntoView();
      return img.complete ? null : new Promise((r) => { img.onload = r; img.onerror = r; setTimeout(r, 5000); });
    }));
    return imgs.map((img) => ({ w: img.naturalWidth, size: img.width, title: img.title }));
  });
  const loaded = icons.filter((i) => i.w > 0);
  check(loaded.length >= 20, `Summary icons loaded: ${loaded.length}/${icons.length} (naturalWidth > 0; raid-4 images are not on upstream's dev CDN)`);
  check(icons.some((i) => i.size === 16) && icons.some((i) => i.size === 24), 'Summary has 16 px loadout strips and 24 px boss icons');
  const agRow = (await page.locator('[data-testid="summary-row"]', { hasText: 'Archive Guardian (Flying)' }).first().innerText()).replace(/\s+/g, ' ');
  console.log(`     ${agRow}`);
  check(!agRow.includes('Elder maul') && agRow.includes('Tonalztics'), 'AG Flying Solo/Team drains use Tonalztics');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.mouse.move(0, 0);
  await page.screenshot({ path: 'docs/screenshots/phase13-summary.png', fullPage: true });

  // cache survives a tab switch
  await page.locator('[data-testid="search-tab"]').click();
  await page.waitForTimeout(500);
  await page.locator('[data-testid="summary-tab"]').click();
  await page.waitForTimeout(800);
  check(await page.locator('[data-testid="summary-cell"]').count() === 60
    && await page.locator('[data-testid="summary-progress"]').count() === 0, 'tab switch: cached, no re-run');

  // load the Xarth / Team cell into the calculator
  const xarth = page.locator('[data-testid="summary-row"]', { hasText: 'Xarth' }).first();
  const cell = xarth.locator('[data-testid="summary-cell"]').nth(2);
  const dps = (await cell.locator('[data-testid="dps"]').innerText()).trim();
  await cell.getByRole('button', { name: 'load' }).click();
  await page.waitForURL((u) => !u.pathname.endsWith('best-setup'), { timeout: 60000 });
  await page.getByPlaceholder('Search for monster...').waitFor({ timeout: 120000 });
  await page.waitForTimeout(3000);
  const cDps = await readCalcRow(page, 'DPS');
  check(cDps === dps, `Xarth Team summary cell loaded: summary ${dps}, calculator ${cDps}`);

  await browser.close();
  process.exit(failures ? 1 : 0);
};

main();
