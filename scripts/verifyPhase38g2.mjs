/**
 * Phase 38g-2 UI check (not part of the Jest run): the drain line is ONE plan, the specs in the order to send them with
 * that order's chance ("Drain: Tonalztics → Elder maul ×2 (floor 96%); 1 brings Tonalztics, 1 brings Elder maul"),
 * drainLine.ts `drainFacts` / teamSpecs.ts `bestDrainPlan`; no list of hit chances, no spec-count table.
 *
 * Usage (dev server running): node scripts/verifyPhase38g2.mjs [baseUrl]
 * - Search (FA, Team, Archive Guardian (Grounded)): the plan Tonalztics first, then 2 Elder maul specs, with its carriers.
 * - Summary: the Archive Guardian (Grounded) Team cell shows the same line.
 * - Plan (FA defaults, Team): every briefing facts line reads as a plan ("<weapon> [×N] → … (floor N%)" or
 *   "(Def N N%; floor not reached in N specs)"), and no line lists hit chances ("(lands N%)").
 * Screenshot docs/screenshots/phase38g2-search.png.
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
const waitPlan = async (page) => {
  await page.waitForTimeout(1500);
  for (let k = 0; k < 3; k++) {
    await page.locator('[data-testid="plan-progress"]').waitFor({ state: 'detached', timeout: 900000 });
    await page.waitForTimeout(3000);
  }
  await page.locator('[data-testid="plan-result"]').waitFor({ timeout: 900000 });
};
const facts = async (loc) => loc.locator('[data-testid="drain-facts"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-text')));

const STEP = '(?:Elder maul|DWH|Tonalztics|BGS)(?: ×\\d+)?';
const PLAN = new RegExp(`^Drain: (?:${STEP}(?: → ${STEP})* \\((?:floor \\d+%|Def \\d+ \\d+%; floor not reached in \\d+ specs)\\)`
  + `(?:; \\d+ brings? [A-Za-z ]+(?:, \\d+ brings? [A-Za-z ]+)*)?|already at the Defence floor \\(Def \\d+\\)|floor not reached in \\d+ specs|none of your drain weapons can hit|no drain weapon can hit)`
  + '(?:; Eye of Ayak .*)?$');

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

  // --- Search (Team, Archive Guardian (Grounded))
  await page.locator('[data-testid="search-tab"]').click();
  await page.locator('[data-testid="boss-select"]').selectOption('ag-grounded');
  await waitSearch(page);
  const search = await facts(page.locator('[data-testid="spec-plan"]'));
  console.log(`     Search AG Grounded: ${search[0]}`);
  check(search.length === 1 && /^Drain: Tonalztics → Elder maul ×2 \(floor \d+%\); 1 brings Tonalztics, 1 brings Elder maul(?:; Eye of Ayak .*)?$/.test(search[0] ?? ''),
    'Search AG Grounded (Team): Tonalztics first, then 2 Elder maul specs, with the carriers');
  await page.locator('[data-testid="spec-plan"]').scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  await page.screenshot({ path: 'docs/screenshots/phase38g2-search.png', fullPage: true });

  // --- Summary
  await page.locator('[data-testid="summary-tab"]').click();
  await page.waitForTimeout(1500);
  await page.locator('[data-testid="summary-progress"]').waitFor({ state: 'detached', timeout: 1800000 });
  const cell = page.locator('[data-testid="summary-row"][data-target="ag-grounded"] [data-testid="summary-cell"][data-drain="team"]');
  const summary = await facts(cell);
  check(summary.length === 1 && summary[0] === search[0], `Summary AG Grounded (Team) = Search: "${summary[0]}"`);
  const all = await facts(page.locator('[data-testid="summary-cell"]'));
  const bad = all.filter((t) => !PLAN.test(t ?? ''));
  check(all.length > 20 && !bad.length, `Summary: every facts line reads as one plan (${all.length} lines${bad.length ? `; e.g. "${bad[0]}"` : ''})`);

  // --- Plan (Team)
  await page.locator('[data-testid="plan-tab"]').click();
  await waitPlan(page);
  const plan = await facts(page.locator('[data-testid="plan-briefing"]'));
  plan.forEach((t) => console.log(`     Plan: ${t}`));
  check(plan.length > 0 && plan.every((t) => PLAN.test(t ?? '') && !/\(lands \d+%\)/.test((t ?? '').split('; Eye of Ayak')[0])), `Plan: every facts line reads as one plan (${plan.length} lines)`);

  await browser.close();
  console.log(`${failures ? `${failures} FAILED` : 'all OK'} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  process.exit(failures ? 1 : 0);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
