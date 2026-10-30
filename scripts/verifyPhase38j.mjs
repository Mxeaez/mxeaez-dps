/**
 * Phase 38j UI check (not part of the Jest run): the FA Plan tab compares kits, it doesn't time raids.
 *
 * Usage (dev server running): node scripts/verifyPhase38j.mjs [baseUrl]
 * - Plan (FA defaults, Team): the total = the fa headline, labelled "a rough estimate" (data-testid plan-estimate).
 * - "Why this kit": alternatives and kit loadouts as % of boss time ("… more boss time than this kit"), no seconds in the
 *   text; the ring line's others as %.
 * - Close calls box: the fa headline's 3 (the worn Ascension crossbows, both carriers; review 38j: no superset kit), each tagged
 *   "close call (depends on A11…)".
 * - Advanced (plan): "Travel time (min)" = 4.5 (the travel between the measured rooms).
 * - Per-phase details, routes table: the planned route in m:ss, the others as a % difference.
 * Screenshot docs/screenshots/phase38j-plan.png.
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
  await page.waitForTimeout(1500);
  for (let k = 0; k < 3; k++) {
    await page.locator('[data-testid="plan-progress"]').waitFor({ state: 'detached', timeout: 900000 });
    await page.waitForTimeout(3000);
  }
  await page.locator('[data-testid="plan-result"]').waitFor({ timeout: 900000 });
};
const texts = (loc) => loc.evaluateAll((els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));

const main = async () => {
  const t0 = Date.now();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 1300 } });
  await page.goto(`${BASE}best-setup`, { waitUntil: 'load', timeout: 120000 });
  await page.evaluate(() => { localStorage.removeItem('mxeaez-dps:not-owned'); localStorage.removeItem('mxeaez-dps:settings:v1'); });
  await page.reload({ waitUntil: 'load', timeout: 120000 });
  await page.locator('[data-testid="raid-tab-fractured-archive"]').waitFor({ timeout: 120000 });
  await page.locator('[data-testid="raid-tab-fractured-archive"]').click();
  await page.locator('[data-testid="drain-team"]').click();
  await page.locator('[data-testid="plan-tab"]').click();
  await waitPlan(page);

  const h = headlineOf('fa');
  const total = ((await page.locator('[data-testid="plan-total"]').textContent()) ?? '').trim();
  check(total === h.total, `Plan total ${total} = the fa headline ${h.total}`);
  const estimate = ((await page.locator('[data-testid="plan-estimate"]').textContent()) ?? '').trim();
  check(/rough estimate/.test(estimate) && /differences/.test(estimate), `labelled: "${estimate}"`);

  await page.locator('[data-testid="plan-why-toggle"]').click();
  const alts = await texts(page.locator('[data-testid="plan-alternatives"] li'));
  alts.forEach((t) => console.log(`     alt: ${t.slice(0, 160)}`));
  check(alts.length > 0 && alts.every((t) => /(\d+\.\d% more boss time than this kit|the same boss time as this kit|can't kill every boss)/.test(t) && !/ s route time/.test(t)), `alternatives as % of boss time (${alts.length})`);
  const marginal = await texts(page.locator('[data-testid="kit-marginal"]'));
  check(marginal.length > 0 && marginal.every((t) => /(less|more) boss time than without it|infinitely less boss time/.test(t)), `kit loadouts: ${marginal.join(' | ')}`);
  const ring = ((await page.locator('[data-testid="plan-ring-result"]').textContent()) ?? '').replace(/\s+/g, ' ');
  check(/others: .*% more boss time/.test(ring), `ring others as %: ${ring.slice(0, 200)}`);

  const box = page.locator('[data-testid="plan-close-calls"]');
  const calls = await page.locator('[data-testid="plan-close-call"]').evaluateAll((els) => els.map((e) => ({
    kind: e.getAttribute('data-kind'), depends: e.getAttribute('data-depends'), text: e.textContent.replace(/\s+/g, ' ').trim(),
  })));
  calls.forEach((c) => console.log(`     close call [${c.kind}] ${c.text}`));
  check(await box.getAttribute('data-count') === '3', `close calls: ${await box.getAttribute('data-count')} (expected 3)`);
  check(calls.map((c) => c.kind).join(',') === 'loadout,carrier,carrier', `kinds: ${calls.map((c) => c.kind).join(',')}`);
  check(calls.filter((c) => c.kind === 'carrier').every((c) => c.depends === 'A11,D36'), 'carriers: depends on A11, D36');
  check(calls.every((c) => c.depends.startsWith('A11') && /close call \(depends on A11/.test(c.text)), 'each tagged "close call (depends on A11…)"');
  check(calls.some((c) => c.kind === 'loadout' && c.text.startsWith('Ascension crossbows + diamond (e) (Masori) (worn): 0.6% less boss time') && c.depends === 'A11,A5'), 'the worn Ascension crossbows: 0.6%, depends on A11, A5');

  await page.locator('[data-testid="plan-phase-details-toggle"]').click();
  const routes = await page.locator('[data-testid="plan-route-row"]').evaluateAll((els) => els.map((e) => ({
    fastest: e.getAttribute('data-fastest'), total: e.querySelector('[data-testid="plan-route-total"]').textContent.trim(),
  })));
  check(routes.length === 8 && routes.filter((r) => r.fastest === 'true').length === 1
    && routes.find((r) => r.fastest === 'true').total === h.total
    && routes.filter((r) => r.fastest !== 'true').every((r) => /^\d+\.\d% more$|^the same$/.test(r.total)), `routes: ${routes.map((r) => r.total).join(', ')}`);

  if (!(await page.locator('[data-testid="plan-non-fight-minutes"]').isVisible())) await page.locator('[data-testid="plan-advanced-toggle"]').click();
  const travel = await page.locator('[data-testid="plan-non-fight-minutes"]').inputValue();
  const label = ((await page.locator('label[for="plan-non-fight-minutes"]').textContent()) ?? '').trim();
  check(travel === '4.5' && label.startsWith('Travel time (min)'), `${label}: ${travel}`);

  await page.locator('[data-testid="plan-advanced-toggle"]').click();
  // the headline (rough estimate) and the close-calls box under the Bring box
  await page.locator('[data-testid="plan-close-calls"]').evaluate((e) => e.scrollIntoView({ block: 'end' }));
  await page.mouse.move(0, 0);
  await page.screenshot({ path: 'docs/screenshots/phase38j-plan.png', fullPage: false });

  await browser.close();
  console.log(`${failures ? `${failures} FAILED` : 'all OK'} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  process.exit(failures ? 1 : 0);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
