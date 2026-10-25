/**
 * Phase 34 before / after screenshots (not part of the Jest run). Same inputs for both: FA defaults, Team drains, a plan
 * run first (so "Specs I bring" mirrors it); Search (default boss), Plan, Summary (after every search finished) at
 * 1400 px wide, the Plan at 390 px wide (phone).
 *
 * Usage (dev server running): node scripts/phase34Shots.mjs before|after [baseUrl]
 * Writes docs/screenshots/phase34-<tag>-{search,plan,summary,plan-phone}.png (after: also -plan-details.png, every
 * collapsed section open).
 */
import { chromium } from '@playwright/test';

const TAG = process.argv[2] || 'after';
const BASE = (process.argv[3] || 'http://localhost:3001/osrs-dps/').replace(/\/?$/, '/');
const shot = async (page, name) => {
  await page.mouse.move(0, 0);
  await page.screenshot({ path: `docs/screenshots/phase34-${TAG}-${name}.png`, fullPage: true });
  console.log(`docs/screenshots/phase34-${TAG}-${name}.png`);
};
const waitPlan = async (page) => {
  await page.waitForTimeout(1500);
  for (let k = 0; k < 3; k++) {
    await page.locator('[data-testid="plan-progress"]').waitFor({ state: 'detached', timeout: 900000 });
    await page.waitForTimeout(3000);
  }
  await page.locator('[data-testid="plan-result"]').waitFor({ timeout: 900000 });
};
const waitSearch = async (page) => {
  await page.waitForTimeout(800);
  await page.locator('[data-testid="search-progress"]').waitFor({ state: 'detached', timeout: 300000 });
  await page.locator('[data-testid="search-results"]').waitFor({ timeout: 300000 });
};
const open = async (page) => {
  await page.goto(`${BASE}best-setup`, { waitUntil: 'load', timeout: 120000 });
  await page.evaluate(() => localStorage.removeItem('mxeaez-dps:not-owned'));
  await page.reload({ waitUntil: 'load', timeout: 120000 });
  await page.locator('[data-testid="raid-tab-fractured-archive"]').waitFor({ timeout: 120000 });
  await page.locator('[data-testid="raid-tab-fractured-archive"]').click();
};

const main = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  await open(page);
  await page.locator('[data-testid="plan-tab"]').click();
  await waitPlan(page);
  await page.locator('[data-testid="search-tab"]').click();
  await waitSearch(page);
  await page.waitForTimeout(1500);
  await shot(page, 'search');
  await page.locator('[data-testid="plan-tab"]').click();
  await waitPlan(page);
  await page.waitForTimeout(1500);
  await shot(page, 'plan');
  if (TAG === 'after') {
    for (const id of ['plan-why-toggle', 'plan-spec-toggle', 'plan-phase-details-toggle']) {
      const sm = page.locator(`[data-testid="${id}"]`);
      if (await sm.count()) await sm.click();
    }
    await page.waitForTimeout(500);
    const t = page.locator('[data-testid="plan-phase-toggle"]');
    if (await t.count() && await t.getAttribute('aria-expanded') === 'false') {
      await t.scrollIntoViewIfNeeded();
      await t.click();
    }
    await page.waitForTimeout(800);
    await shot(page, 'plan-details');
    if (await t.count() && await t.getAttribute('aria-expanded') === 'true') await t.click();
    await page.locator('[data-testid="plan-result"] details').evaluateAll((els) => els.forEach((d) => { d.open = false; }));
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(1500);
  await shot(page, 'plan-phone');
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.locator('[data-testid="summary-tab"]').click();
  await page.waitForTimeout(1500);
  await page.locator('[data-testid="summary-progress"]').waitFor({ state: 'detached', timeout: 1800000 });
  await page.waitForTimeout(1500);
  await shot(page, 'summary');
  await browser.close();
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
