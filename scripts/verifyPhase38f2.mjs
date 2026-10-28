/**
 * Phase 38f-2 (round 6 is Fractured Archive only): the ToA / CoX / ToB raid tabs are hidden (src/lib/raids/index.ts
 * `SHOW_OTHER_RAIDS`, off by default). Checks, from a fresh browser:
 * - only the Fractured Archive tab is on the page (no raid-tab-toa / cox / tob);
 * - a saved active tab of toa (mxeaez-dps:settings:v1) lands on the Fractured Archive, and the saved settings are
 *   kept untouched (the other raid's saved inputs are still in storage after the page wrote its own changes).
 * Screenshot docs/screenshots/phase38f2-fa-only.png. Dev server on :3001 started WITHOUT NEXT_PUBLIC_SHOW_OTHER_RAIDS.
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
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(`${BASE}best-setup`, { waitUntil: 'load', timeout: 120000 });
  await page.locator('[data-testid="raid-tab-fractured-archive"]').waitFor({ timeout: 120000 });
  const tabs = await page.locator('[data-testid^="raid-tab-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
  check(JSON.stringify(tabs) === '["raid-tab-fractured-archive"]', `only the Fractured Archive tab is shown (${tabs.join(', ')})`);
  check(await page.locator('[data-testid="raid-tab-toa"], [data-testid="raid-tab-cox"], [data-testid="raid-tab-tob"]').count() === 0, 'no ToA / CoX / ToB tab');

  // a saved ToA tab (and ToA inputs) from an earlier session
  const saved = { version: 1, raid: 'toa', raids: { toa: { assumptions: { toa: { invocationLevel: 300 } } } } };
  await page.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [KEY, saved]);
  await page.reload({ waitUntil: 'load', timeout: 120000 });
  await page.locator('[data-testid="raid-tab-fractured-archive"]').waitFor({ timeout: 120000 });
  await page.waitForTimeout(500);
  const heading = await page.locator('h2', { hasText: 'Best setup' }).first().innerText();
  check(/Fractured Archive/.test(heading), `a saved ToA tab lands on the Fractured Archive ("${heading}")`);
  check(await page.locator('#bs-scale-toaInvocationLevel, [data-testid="scaling-toaInvocationLevel"]').count() === 0, 'no ToA raid inputs on screen');
  // touch an FA input so the page writes its settings; ToA's saved inputs must survive
  await page.locator('#bs-party').fill('4');
  await page.waitForTimeout(500);
  const after = JSON.parse(await page.evaluate((k) => localStorage.getItem(k), KEY) || 'null');
  check(after?.raids?.toa?.assumptions?.toa?.invocationLevel === 300, 'the saved ToA settings are kept');
  check(after?.raids?.['fractured-archive']?.assumptions?.partySize === 4, 'the FA change is saved');
  await page.mouse.move(0, 0);
  await page.screenshot({ path: 'docs/screenshots/phase38f2-fa-only.png', clip: { x: 0, y: 0, width: 1400, height: 600 } });

  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
