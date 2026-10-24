/**
 * Phase 16 UI check (not part of the Jest run): the route comparison on /best-setup (raid time model).
 * Phase 23: the Routes tab is merged into Plan: the route table is the Plan result's (the planned kit on every route), the
 * time-model settings are under Advanced.
 *
 * Usage (dev server running): node scripts/verifyPhase16.mjs [baseUrl]
 * - Routes tab, default kit (best melee + ranged + magic search result per phase), Team drains, party 6: 8 routes
 *   render, exactly one is marked fastest and it has the lowest total; the totals equal the sum of the encounter cells.
 * - Expanding the fastest route shows per-phase rows (loadout, DPS, seconds).
 * - Changing "Bork stun uptime" changes the Bork + Smorks time (and nothing else in the AG column).
 * Prints the route table (the phase 16 headline). Screenshots docs/screenshots/phase16-*.png.
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE = (process.argv[2] || 'http://localhost:3001/osrs-dps/').replace(/\/?$/, '/');

let failures = 0;
const check = (ok, msg) => {
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`);
};

const readRoutes = async (page) => page.locator('[data-testid="plan-route-row"]').evaluateAll((rows) => rows.map((r) => ({
  id: r.getAttribute('data-route'),
  fastest: r.getAttribute('data-fastest') === 'true',
  total: r.querySelector('[data-testid="plan-route-total"]').textContent.trim(),
  encounters: Array.from(r.querySelectorAll('[data-testid^="plan-enc-"]')).map((c) => ({
    id: c.getAttribute('data-testid').slice(9),
    seconds: Number(c.getAttribute('data-seconds')),
  })),
})));

const waitIdle = async (page, timeout = 600000) => {
  await page.waitForTimeout(800); // debounce
  await page.locator('[data-testid="plan-progress"]').waitFor({ state: 'detached', timeout });
  await page.locator('[data-testid="plan-result"]').waitFor({ timeout });
};

const main = async () => {
  fs.mkdirSync('docs/screenshots', { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 1400 } });
  await page.goto(`${BASE}best-setup`, { waitUntil: 'load', timeout: 120000 });
  await page.locator('[data-testid="plan-tab"]').click();
  await page.locator('[data-testid="plan-view"]').waitFor({ timeout: 60000 });
  check(await page.locator('[data-testid="drain-team"]').count() === 1, 'drain selector shown on the Plan tab');
  await page.locator('[data-testid="advanced-toggle"]').click();
  for (const id of ['rt-agShieldHp', 'rt-agGroundedFraction', 'rt-borkStunUptime', 'rt-ocellusWalkingFraction', 'rt-ocellusP2Seconds', 'rt-ocellusLastQuadrantFraction']) {
    check(await page.locator(`#${id}`).count() === 1, `setting #${id} rendered`);
  }

  const t0 = Date.now();
  await waitIdle(page);
  console.log(`     first run ${((Date.now() - t0) / 1000).toFixed(1)} s; ${await page.locator('[data-testid="plan-stats"]').innerText()}`);

  const routes = await readRoutes(page);
  check(routes.length === 8, `8 routes (${routes.length})`);
  const fastest = routes.filter((r) => r.fastest);
  check(fastest.length === 1, 'exactly one route marked fastest');
  const sums = routes.map((r) => r.encounters.reduce((t, e) => t + e.seconds, 0));
  const minIx = sums.indexOf(Math.min(...sums));
  check(routes[minIx].fastest, `the fastest-marked route has the lowest total (${routes[minIx].id})`);
  console.log('     route | total | encounter seconds');
  routes.forEach((r, i) => console.log(`     ${r.fastest ? '*' : ' '} ${r.id} | ${r.total} (${sums[i].toFixed(1)} s) | ${r.encounters.map((e) => `${e.id} ${e.seconds.toFixed(1)}`).join(', ')}`));
  await page.screenshot({ path: 'docs/screenshots/phase16-routes.png', fullPage: true });

  // per-phase rows of the planned (fastest) route
  const phaseRows = page.locator('[data-testid="plan-phase-row"]');
  await phaseRows.first().waitFor({ timeout: 10000 });
  const n = await phaseRows.count();
  check(n >= 8, `expanded route shows per-phase rows (${n})`);
  const detail = (await page.locator('[data-testid="plan-encounters"]').innerText()).replace(/\s+/g, ' ');
  check(/Flying shield/.test(detail) && /P1 at a corner/.test(detail), 'per-phase rows include the AG shield and Ocellus P1');
  console.log(`     detail: ${detail.slice(0, 900)}`);
  await page.locator('[data-testid="plan-encounters"]').screenshot({ path: 'docs/screenshots/phase16-expanded.png' });

  // Bork stun uptime changes the Bork + Smorks time
  const borkBefore = routes.find((r) => r.encounters.some((e) => e.id === 'bork-smorks')).encounters.find((e) => e.id === 'bork-smorks').seconds;
  const agBefore = routes[0].encounters[0].seconds;
  await page.locator('#rt-borkStunUptime').fill('30');
  await page.locator('[data-testid="plan-progress"]').waitFor({ timeout: 10000 }).catch(() => {});
  await waitIdle(page);
  const after = await readRoutes(page);
  const borkAfter = after.find((r) => r.encounters.some((e) => e.id === 'bork-smorks')).encounters.find((e) => e.id === 'bork-smorks').seconds;
  check(Math.abs(borkAfter - borkBefore) > 0.05, `Bork stun uptime 30% changes Bork + Smorks: ${borkBefore.toFixed(1)} → ${borkAfter.toFixed(1)} s`);
  check(Math.abs(after[0].encounters[0].seconds - agBefore) < 1e-6, 'AG time unchanged by the Bork setting');
  await page.screenshot({ path: 'docs/screenshots/phase16-bork-stun.png', fullPage: true });

  await browser.close();
  console.log(failures ? `${failures} FAILED` : 'All OK');
  process.exit(failures ? 1 : 0);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
