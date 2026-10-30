/**
 * Phase 40b UI check (not part of the Jest run): Bork + Smorks stun-swap. Advanced → Time model has "Bork kill order"
 * (Stun-swap default, Killed evenly), "Bork stuns per kill" (4) and "Bork stun length (ticks, ≈ 5 Scythe hits)" (25 ticks, phase 40b-2), not "Bork stun uptime".
 * The default FA Team plan is the fa headline; its Bork + Smorks row is stunned Bork + the Smorks (phase details).
 * Killed evenly re-plans with Bork's four armour quarters.
 *
 * Usage (dev server running): node scripts/verifyPhase40b.mjs [baseUrl]
 * Screenshot docs/screenshots/phase40b-bork-stun.png.
 */
import { chromium } from '@playwright/test';
import { headlineOf } from './headlines.mjs';

const BASE = (process.argv[2] || 'http://localhost:3001/osrs-dps/').replace(/\/?$/, '/');
let failures = 0;
const check = (ok, msg) => {
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`);
};

const waitPlan = async (page) => {
  await page.locator('[data-testid="plan-progress"]').waitFor({ timeout: 60000 }).catch(() => {});
  await page.locator('[data-testid="plan-progress"]').waitFor({ state: 'detached', timeout: 900000 });
  await page.waitForTimeout(3000);
  await page.locator('[data-testid="plan-progress"]').waitFor({ state: 'detached', timeout: 900000 });
  await page.locator('[data-testid="plan-result"]').waitFor({ timeout: 900000 });
};

const borkPhases = async (page) => {
  const toggle = page.locator('[data-testid="plan-phase-details-toggle"]');
  if (!(await page.locator('[data-testid="plan-phase-details"]').getAttribute('open') !== null)) await toggle.click();
  const show = page.locator('[data-testid="plan-phase-toggle"]');
  if ((await show.getAttribute('aria-expanded')) !== 'true') await show.click();
  return (await page.locator('[data-testid="plan-phase-row"][data-encounter="bork-smorks"]').allTextContents()).join(' | ');
};

const main = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
  await page.goto(`${BASE}best-setup`, { waitUntil: 'load', timeout: 120000 });
  await page.evaluate(() => { localStorage.removeItem('mxeaez-dps:not-owned'); localStorage.removeItem('mxeaez-dps:settings:v1'); });
  await page.reload({ waitUntil: 'load', timeout: 120000 });
  await page.locator('[data-testid="raid-tab-fractured-archive"]').click();
  await page.locator('[data-testid="drain-team"]').click();
  await page.locator('[data-testid="advanced-toggle"]').click();

  const order = page.locator('#rt-borkKillOrder');
  check(await order.count() === 1, 'Bork kill order input shown');
  check(await order.inputValue() === 'stun-swap', `kill order default: ${await order.inputValue()}`);
  const options = await order.locator('option').allTextContents();
  check(options.join(',') === 'Stun-swap,Killed evenly', `options: ${options.join(', ')}`);
  check(await page.locator('#rt-borkStunsPerKill').inputValue() === '4', 'stuns per kill 4');
  check(await page.locator('#rt-borkStunTicks').inputValue() === '25', 'stun length 25 ticks');
  check((await page.locator('label[for="rt-borkStunTicks"]').textContent() ?? '').includes('Bork stun length (ticks, ≈ 5 Scythe hits)'), 'stun length label ≈ 5 Scythe hits');
  check(await page.locator('#rt-borkStunUptime').count() === 0, 'no Bork stun uptime input');
  const times = page.locator('[data-testid="time-settings"]');
  await times.scrollIntoViewIfNeeded();

  await page.locator('[data-testid="plan-tab"]').click();
  await page.locator('[data-testid="plan-inputs"]').waitFor({ timeout: 60000 });
  await waitPlan(page);
  const h = headlineOf('fa');
  const total = (await page.locator('[data-testid="plan-total"]').textContent()) ?? '';
  check(total.includes(h.total), `plan total ${h.total} (the fa headline)`);
  const phases = await borkPhases(page);
  check(/Bork, stunned \(4 × 25 ticks\)/.test(phases), `Bork row: stunned (4 × 25 ticks): ${phases.slice(0, 160)}`);
  check(!/armour (8|10|12)/.test(phases), 'no armour 8 / 10 / 12 rows');
  await page.locator('[data-testid="plan-encounter-row"][data-encounter="bork-smorks"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'docs/screenshots/phase40b-bork-stun.png', fullPage: false });

  // the old model as an option: four armour quarters
  await order.selectOption('evenly');
  await page.locator('[data-testid="plan-tab"]').click();
  await waitPlan(page);
  const evenly = await borkPhases(page);
  check(/armour 8 \(¼ of hp\)/.test(evenly) && /armour 14 \(¼ of hp\)/.test(evenly), `killed evenly: four quarters: ${evenly.slice(0, 160)}`);
  const total2 = (await page.locator('[data-testid="plan-total"]').textContent()) ?? '';
  check(!total2.includes(h.total), `killed evenly changes the total (${total2.trim().slice(0, 40)})`);

  await browser.close();
  console.log(failures ? `${failures} FAILED` : 'ALL OK');
  process.exit(failures ? 1 : 0);
};
main().catch((e) => { console.error(e); process.exit(1); });
