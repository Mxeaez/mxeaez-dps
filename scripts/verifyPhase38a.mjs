/**
 * Phase 38a UI check (not part of the Jest run): the Plan tab's "Typical raid length (min)" (Advanced (plan)).
 *
 * Usage (dev server running): node scripts/verifyPhase38a.mjs [baseUrl]
 * - FA: the input shows the default 25 min; ToA 30, CoX 20, ToB 20 (RaidBase.typicalRaidMinutes); its tooltip names
 *   the source (FA: the user's raid stats; ToB: the surge cooldown pauses between rooms).
 * - FA set to 40: kept after a reload and saved in `mxeaez-dps:settings:v1` (plan.raidMinutes = 40); FA "Reset" → 25.
 * Screenshot docs/screenshots/phase38a-raid-length.png (FA Plan inputs, Advanced open).
 */
import { chromium } from '@playwright/test';

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
  const input = page.locator('[data-testid="plan-raid-minutes"]');
  const openPlan = async (raid) => {
    await page.locator(`[data-testid="raid-tab-${raid}"]`).click();
    await page.locator('[data-testid="plan-tab"]').click();
    await page.locator('[data-testid="plan-inputs"]').waitFor({ timeout: 60000 });
    if (!(await input.isVisible())) await page.locator('[data-testid="plan-advanced-toggle"]').click();
    await input.waitFor({ timeout: 30000 });
  };

  for (const [raid, minutes] of [['fractured-archive', '25'], ['toa', '30'], ['cox', '20'], ['tob', '20']]) {
    await openPlan(raid);
    check(await input.inputValue() === minutes, `${raid}: typical raid length ${await input.inputValue()} min (expected ${minutes})`);
    const title = await page.locator('label[for="plan-raid-minutes"]').getAttribute('title');
    if (raid === 'fractured-archive') check(/the user's in-game raid stats/.test(title), 'FA tooltip names the user\'s raid stats');
    if (raid === 'tob') check(/pauses between rooms/.test(title), 'ToB tooltip: the surge cooldown pauses between rooms');
  }

  await openPlan('fractured-archive');
  await input.fill('40');
  await page.waitForTimeout(1000);
  const before = JSON.parse(await page.evaluate((k) => localStorage.getItem(k), KEY) || '{}');
  check(before?.raids?.['fractured-archive']?.plan?.raidMinutes === 40, `written through: ${JSON.stringify(before?.raids?.['fractured-archive'] ?? null)}`);
  await page.reload({ waitUntil: 'load', timeout: 120000 });
  await load();
  await openPlan('fractured-archive');
  check(await input.inputValue() === '40', `FA after reload: ${await input.inputValue()} min (expected 40)`);
  const stored = JSON.parse(await page.evaluate((k) => localStorage.getItem(k), KEY) || '{}');
  check(stored?.raids?.['fractured-archive']?.plan?.raidMinutes === 40, `saved: plan.raidMinutes = ${stored?.raids?.['fractured-archive']?.plan?.raidMinutes}`);
  await page.locator('[data-testid="plan-inputs"]').screenshot({ path: 'docs/screenshots/phase38a-raid-length.png' });

  // FA Reset (Assumptions box) → the default again
  const reset = page.locator('[data-testid="assumptions-reset"]');
  if (await reset.count()) {
    await reset.first().click();
    await page.waitForTimeout(500);
    await openPlan('fractured-archive');
    check(await input.inputValue() === '25', `FA after Reset: ${await input.inputValue()} min (expected 25)`);
  } else {
    check(false, 'FA Reset button (data-testid="assumptions-reset") not found');
  }

  await browser.close();
  console.log(failures ? `${failures} FAILED` : 'all OK');
  process.exit(failures ? 1 : 0);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
