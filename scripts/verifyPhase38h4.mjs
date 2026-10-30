/**
 * Phase 38h-4 UI check (not part of the Jest run): the Soulflame horn note under the spec plan (SpecPlanPanel
 * `drain-soulflame`). Usage (dev server running): node scripts/verifyPhase38h4.mjs [baseUrl]
 * - Search (FA, Team): Smorks shows the note (Elder maul 54% -> 100%); Ezekiel has none. Screenshot
 *   docs/screenshots/phase38h4-soulflame.png.
 */
import { chromium } from '@playwright/test';

const BASE = (process.argv[2] || 'http://localhost:3001/osrs-dps/').replace(/\/?$/, '/');
let failures = 0;
const check = (ok, msg) => {
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`);
};
const waitSearch = async (page) => {
  await page.waitForTimeout(800);
  await page.locator('[data-testid="search-progress"]').waitFor({ state: 'detached', timeout: 300000 });
  await page.locator('[data-testid="search-results"]').waitFor({ timeout: 300000 });
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1200 } });
await page.goto(`${BASE}best-setup`, { waitUntil: 'load', timeout: 120000 });
await page.evaluate(() => { localStorage.removeItem('mxeaez-dps:settings:v1'); });
await page.reload({ waitUntil: 'load', timeout: 120000 });
await page.locator('[data-testid="raid-tab-fractured-archive"]').click();
await page.locator('[data-testid="drain-team"]').click();
await page.locator('[data-testid="search-tab"]').click();
await page.locator('[data-testid="boss-select"]').selectOption('ezekiel');
await waitSearch(page);
check(await page.locator('[data-testid="drain-soulflame"]').count() === 0, 'Ezekiel: no Soulflame note');
await page.locator('[data-testid="boss-select"]').selectOption('smorks');
await waitSearch(page);
const note = page.locator('[data-testid="drain-soulflame"]');
check(await note.count() === 1, 'Smorks: Soulflame note shown');
const text = (await note.first().textContent()) ?? '';
console.log(`     ${text}`);
check(/Elder maul 54% → 100%/.test(text), 'note reads Elder maul 54% -> 100%');
await page.locator('[data-testid="spec-plan"]').first().screenshot({ path: 'docs/screenshots/phase38h4-soulflame.png' });
await browser.close();
process.exit(failures ? 1 : 0);
