/**
 * Phase 38b UI check (not part of the Jest run): the Plan tab's "Spellbook" (Advanced (plan)).
 *
 * Usage (dev server running): node scripts/verifyPhase38b.mjs [baseUrl]
 * - Every raid defaults to Arceuus (Death Charge; RaidBase.spellbook); the tooltip names Death Charge and the raid's
 *   note (FA: the Xarth route's freezer on Ancients; ToB: Maiden's).
 * - FA set to Ancient: saved in `mxeaez-dps:settings:v1` (plan.spellbook = 'ancients') and kept after a reload.
 * Screenshot docs/screenshots/phase38b-spellbook.png (FA Plan inputs, Advanced open).
 */
import { chromium } from '@playwright/test';
import { OTHER_RAIDS } from './otherRaids.mjs';

const BASE = (process.argv[2] || 'http://localhost:3001/osrs-dps/').replace(/\/?$/, '/');
const KEY = 'mxeaez-dps:settings:v1';

let failures = 0;
const check = (ok, msg) => {
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`);
};

const main = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
  const load = async () => {
    await page.locator('[data-testid="raid-tab-fractured-archive"]').waitFor({ timeout: 120000 });
    await page.waitForTimeout(300);
  };
  await page.goto(`${BASE}best-setup`, { waitUntil: 'load', timeout: 120000 });
  await load();
  const select = page.locator('[data-testid="plan-spellbook"]');
  const openPlan = async (raid) => {
    await page.locator(`[data-testid="raid-tab-${raid}"]`).click();
    await page.locator('[data-testid="plan-tab"]').click();
    await page.locator('[data-testid="plan-inputs"]').waitFor({ timeout: 60000 });
    if (!(await select.isVisible())) await page.locator('[data-testid="plan-advanced-toggle"]').click();
    await select.waitFor({ timeout: 30000 });
  };

  for (const raid of ['fractured-archive', 'toa', 'cox', 'tob'].filter((r) => OTHER_RAIDS || r === 'fractured-archive')) {
    await openPlan(raid);
    check(await select.inputValue() === 'arceuus', `${raid}: spellbook ${await select.inputValue()} (expected arceuus)`);
    const title = await page.locator('label[for="plan-spellbook"]').getAttribute('title');
    check(/Death Charge/.test(title), `${raid}: tooltip names Death Charge`);
    if (raid === 'fractured-archive') check(/Xarth route needs one freezer/.test(title), 'FA tooltip: the Xarth freezer note');
    if (raid === 'tob') check(/Maiden needs one freezer/.test(title), 'ToB tooltip: the Maiden freezer note');
  }

  await openPlan('fractured-archive');
  await select.selectOption('ancients');
  await page.waitForTimeout(1000);
  await page.reload({ waitUntil: 'load', timeout: 120000 });
  await load();
  await openPlan('fractured-archive');
  check(await select.inputValue() === 'ancients', `FA after reload: ${await select.inputValue()} (expected ancients)`);
  const stored = JSON.parse(await page.evaluate((k) => localStorage.getItem(k), KEY) || '{}');
  check(stored?.raids?.['fractured-archive']?.plan?.spellbook === 'ancients', `saved: plan.spellbook = ${stored?.raids?.['fractured-archive']?.plan?.spellbook}`);
  await select.selectOption('arceuus');
  await page.waitForTimeout(500);
  await page.locator('[data-testid="plan-inputs"]').screenshot({ path: 'docs/screenshots/phase38b-spellbook.png' });

  await browser.close();
  console.log(failures ? `${failures} FAILED` : 'all OK');
  process.exit(failures ? 1 : 0);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
