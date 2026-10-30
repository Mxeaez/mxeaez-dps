/**
 * Phase 38h-3b UI check (not part of the Jest run): the filler spec weapon in the briefing ("Then: 1. Zaryte crossbow
 * (per bar) · leftover: Crimson kisten") on Search, Summary and Plan. Phase 38j: Crimson kisten (was Burning claws): the
 * measured room times' regen leaves ≥ 50% after the ZCB specs, and Search / Summary name the cheaper weapon with the most
 * HP for one spec.
 *
 * Usage (dev server running): node scripts/verifyPhase38h3b.mjs [baseUrl]
 * - Search (FA, Team, Xarth): the Specs box's "Then" ends in "· leftover: Crimson kisten".
 * - Summary: the Xarth Team cell shows the same "Then".
 * - Plan (FA defaults, Team): the bring line = the fa headline (Crimson kisten in it); the spec items list Crimson kisten
 *   as the filler; the briefing rows of the encounters where the plan specs it end in "· leftover: Crimson kisten"
 *   (Xarth, Ocellus).
 * Screenshot docs/screenshots/phase38h3b-plan.png.
 */
import { chromium } from '@playwright/test';
import { headlineOf } from './headlines.mjs';

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
const waitPlan = async (page) => {
  await page.waitForTimeout(1500);
  for (let k = 0; k < 3; k++) {
    await page.locator('[data-testid="plan-progress"]').waitFor({ state: 'detached', timeout: 900000 });
    await page.waitForTimeout(3000);
  }
  await page.locator('[data-testid="plan-result"]').waitFor({ timeout: 900000 });
};
const thenOf = async (loc) => loc.locator('[data-testid="drain-facts-then"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-text')));

const main = async () => {
  const t0 = Date.now();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 1200 } });
  await page.goto(`${BASE}best-setup`, { waitUntil: 'load', timeout: 120000 });
  await page.evaluate(() => { localStorage.removeItem('mxeaez-dps:not-owned'); localStorage.removeItem('mxeaez-dps:settings:v1'); });
  await page.reload({ waitUntil: 'load', timeout: 120000 });
  await page.locator('[data-testid="raid-tab-fractured-archive"]').waitFor({ timeout: 120000 });
  await page.locator('[data-testid="raid-tab-fractured-archive"]').click();
  await page.locator('[data-testid="drain-team"]').click();

  // --- Search (Team, Xarth)
  await page.locator('[data-testid="search-tab"]').click();
  await page.locator('[data-testid="boss-select"]').selectOption('xarth');
  await waitSearch(page);
  const box = page.locator('[data-testid="spec-damage-box"]');
  const search = (await thenOf(box))[0] ?? '';
  console.log(`     Search Xarth: ${search}`);
  check(search.startsWith('Then: 1. Zaryte crossbow') && search.endsWith(' · leftover: Crimson kisten'), `Search Xarth (Team): "${search}" (leftover: Crimson kisten, as on the Plan)`);

  // --- Summary
  await page.locator('[data-testid="summary-tab"]').click();
  await page.waitForTimeout(1500);
  await page.locator('[data-testid="summary-progress"]').waitFor({ state: 'detached', timeout: 1800000 });
  const cell = page.locator('[data-testid="summary-row"][data-target="xarth"] [data-testid="summary-cell"][data-drain="team"]');
  const summary = (await thenOf(cell))[0] ?? '';
  check(summary === search, `Summary Xarth (Team): "${summary}" = Search`);

  // --- Plan (Team)
  await page.locator('[data-testid="plan-tab"]').click();
  await waitPlan(page);
  const h = headlineOf('fa');
  const bring = ((await page.locator('[data-testid="plan-bring"]').textContent()) ?? '').trim();
  check(bring === h.bring && bring.includes('Crimson kisten'), `Plan: "${bring}" = the fa headline`);
  const items = await page.locator('[data-testid="plan-spec-item"]').evaluateAll((els) => els.map((e) => e.textContent.trim()));
  check(items.some((t) => t.includes('Crimson kisten') && t.includes('filler')), `Plan: spec items: ${items.join('; ')}`);
  const rows = await page.locator('[data-testid="plan-briefing"] tr').evaluateAll((els) => els.map((e) => ({
    text: e.textContent.trim().slice(0, 40),
    then: e.querySelector('[data-testid="drain-facts-then"]')?.getAttribute('data-text') ?? null,
  })));
  const filled = rows.filter((r) => (r.then ?? '').endsWith(' · leftover: Crimson kisten'));
  rows.filter((r) => r.then).forEach((r) => console.log(`     ${r.text} … ${r.then}`));
  check(filled.length === 2 && filled.every((r) => r.then.startsWith('Then: 1. Zaryte crossbow (per bar)')), `Plan: ${filled.length} briefing rows end in "· leftover: Crimson kisten" (2: Xarth, Ocellus)`);
  await page.locator('[data-testid="plan-briefing"]').scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  await page.screenshot({ path: 'docs/screenshots/phase38h3b-plan.png', fullPage: false });

  await browser.close();
  console.log(`${failures ? `${failures} FAILED` : 'all OK'} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  process.exit(failures ? 1 : 0);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
