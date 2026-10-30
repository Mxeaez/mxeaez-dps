/**
 * Phase 39 UI check (not part of the Jest run): Team carriers and the Route selector are in the FA Plan tab's main inputs,
 * not under Advanced; "Set manually" is behind a small toggle; the saved settings still hold them.
 *
 * Usage (dev server running): node scripts/verifyPhase39.mjs [baseUrl]
 * Screenshot docs/screenshots/phase39-plan.png.
 */
import { chromium } from '@playwright/test';
import { headlineOf } from './headlines.mjs';

const BASE = (process.argv[2] || 'http://localhost:3001/osrs-dps/').replace(/\/?$/, '/');
let failures = 0;
const check = (ok, msg) => {
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`);
};
const inside = (page, sel, within) => page.locator(`${within} ${sel}`).count().then((n) => n > 0);

const main = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  await page.goto(`${BASE}best-setup`, { waitUntil: 'load', timeout: 120000 });
  await page.evaluate(() => { localStorage.removeItem('mxeaez-dps:not-owned'); localStorage.removeItem('mxeaez-dps:settings:v1'); });
  await page.reload({ waitUntil: 'load', timeout: 120000 });
  await page.locator('[data-testid="raid-tab-fractured-archive"]').click();
  await page.locator('[data-testid="drain-team"]').click();
  await page.locator('[data-testid="plan-tab"]').click();
  await page.locator('[data-testid="plan-inputs"]').waitFor({ timeout: 60000 });

  check(await inside(page, '[data-testid="team-specs"]', '[data-testid="plan-inputs"]'), 'Team carriers are in the Plan inputs');
  check(await inside(page, '[data-testid="plan-route"]', '[data-testid="plan-inputs"]'), 'Route is in the Plan inputs');
  check(!(await inside(page, '[data-testid="team-specs"]', '[data-testid="advanced"]')), 'no carriers under Advanced');
  check(!(await inside(page, '[data-testid="plan-route"]', '[data-testid="plan-advanced"]')), 'no Route under Advanced (plan)');
  check(await page.locator('[data-testid="plan-route"]').isVisible() && await page.locator('[data-testid="team-carriers-shown"]').isVisible(), 'both visible without opening anything');
  check(!(await page.locator('#bs-team-elderMaul').isVisible()), 'manual counts are behind the "Set manually" toggle');

  await page.locator('[data-testid="plan-progress"]').waitFor({ timeout: 60000 }).catch(() => {});
  await page.locator('[data-testid="plan-progress"]').waitFor({ state: 'detached', timeout: 900000 });
  await page.waitForTimeout(3000);
  await page.locator('[data-testid="plan-progress"]').waitFor({ state: 'detached', timeout: 900000 });
  await page.locator('[data-testid="plan-result"]').waitFor({ timeout: 900000 });
  const want = headlineOf('fa').carriers;
  const shown = await page.locator('[data-testid="team-carriers-shown"] [data-weapon]').evaluateAll((els) => Object.fromEntries(els.map((e) => [e.getAttribute('data-weapon'), Number(e.getAttribute('data-count'))])));
  check(Object.keys(want).every((k) => (want[k] ?? 0) === (shown[k] ?? 0)) && /from the last plan/.test(await page.locator('[data-testid="team-carriers-note"]').textContent()), `planner result shown plainly: ${JSON.stringify(shown)}`);
  await page.screenshot({ path: 'docs/screenshots/phase39-plan.png', fullPage: false });

  // manual: toggle, set, Lightbearer, persistence
  await page.locator('[data-testid="team-carriers-toggle"]').click();
  await page.locator('[data-testid="team-carrier-mode"]').selectOption('manual');
  await page.locator('#bs-team-elderMaul').fill('3');
  await page.locator('#bs-team-lightbearer').check();
  await page.locator('#plan-route').selectOption({ index: 1 });
  const route = await page.locator('#plan-route').inputValue();
  await page.waitForTimeout(600);
  const saved = await page.evaluate(() => localStorage.getItem('mxeaez-dps:settings:v1'));
  check(/"manual":true/.test(saved) && /"elderMaul":3/.test(saved), 'manual carriers saved to localStorage');
  await page.reload({ waitUntil: 'load', timeout: 120000 });
  await page.locator('[data-testid="plan-tab"]').click().catch(() => {});
  await page.locator('[data-testid="plan-inputs"]').waitFor({ timeout: 60000 });
  check(await page.locator('[data-testid="plan-route"]').inputValue() === route, `route restored (${route})`);
  check(/set manually/.test(await page.locator('[data-testid="team-carriers-note"]').textContent()), 'manual carriers restored');
  check(/Lightbearer/.test(await page.locator('[data-testid="team-carriers-shown"]').textContent()), 'carriers use Lightbearer restored');
  await page.locator('[data-testid="team-carriers-toggle"]').click();
  check(await page.locator('#bs-team-elderMaul').inputValue() === '3', 'Elder maul 3 restored');

  await browser.close();
  console.log(failures ? `${failures} FAILED` : 'ALL OK');
  process.exit(failures ? 1 : 0);
};
main().catch((e) => { console.error(e); process.exit(1); });
