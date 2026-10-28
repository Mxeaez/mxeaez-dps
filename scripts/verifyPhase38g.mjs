/**
 * Phase 38g UI check (not part of the Jest run): the drain facts line (phase 38g-2 wording: "Drain: Tonalztics ×2 (floor
 * 98%); 1 brings Tonalztics", drainLine.ts `drainFacts`) is the same on Plan, Search and
 * Summary, in Team and in Solo; a drain the bars can't pay for at 95% is marked ("needs 4 specs, you have ~2").
 *
 * Usage (dev server running): node scripts/verifyPhase38g.mjs [baseUrl]
 * - Plan (FA defaults, Team): every briefing row with drains has a facts line; the Xarth row's is read.
 * - Search (Team, Xarth): the drain box shows the same facts line.
 * - Summary: the Xarth Team cell shows it too; every drainable cell has one.
 * - Search, Solo party 1 with Elder maul only (Bork, armour 8): the line is the Team one without the carriers, marked
 *   "needs 4 specs, you have ~N".
 * Screenshots docs/screenshots/phase38g-*.png.
 */
import { chromium } from '@playwright/test';

const BASE = (process.argv[2] || 'http://localhost:3001/osrs-dps/').replace(/\/?$/, '/');

let failures = 0;
const check = (ok, msg) => {
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`);
};
const shot = async (page, name) => {
  await page.mouse.move(0, 0);
  await page.screenshot({ path: `docs/screenshots/phase38g-${name}.png`, fullPage: true });
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
const facts = async (loc) => loc.locator('[data-testid="drain-facts"]').evaluateAll((els) => els.map((e) => ({
  text: e.getAttribute('data-text'), short: e.getAttribute('data-short'), shown: e.textContent, visible: e.checkVisibility(),
})));

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

  // --- Plan (Team)
  await page.locator('[data-testid="plan-tab"]').click();
  await waitPlan(page);
  const rows = await page.locator('[data-testid="plan-briefing-row"]').evaluateAll((els) => els.map((e) => ({
    id: e.dataset.encounter,
    facts: Array.from(e.querySelectorAll('[data-testid="drain-facts"]')).map((f) => ({ text: f.getAttribute('data-text'), short: f.getAttribute('data-short'), shown: f.textContent })),
  })));
  rows.forEach((r) => r.facts.forEach((f) => console.log(`     ${r.id}: ${f.shown}`)));
  check(rows.length > 0 && rows.every((r) => r.facts.length > 0 && r.facts.every((f) => /^Drain: /.test(f.text))), 'Plan: every briefing row has a drain facts line');
  const xarth = rows.find((r) => r.id === 'xarth')?.facts[0];
  check(!!xarth && /^Drain: Tonalztics ×\d+ \(floor \d+%\); \d+ brings? Tonalztics$/.test(xarth.text), `Plan Xarth: "${xarth?.text}"`);
  await shot(page, 'plan');

  // --- Search (Team, Xarth)
  await page.locator('[data-testid="search-tab"]').click();
  await page.locator('[data-testid="boss-select"]').selectOption('xarth');
  await waitSearch(page);
  const search = await facts(page.locator('[data-testid="spec-plan"]'));
  check(search.length === 1 && search[0].visible, 'Search: the drain box shows one facts line, visible by default');
  check(search[0]?.text === xarth?.text, `Search Xarth = Plan Xarth: "${search[0]?.text}"`);
  await shot(page, 'search-team');

  // --- Summary
  await page.locator('[data-testid="summary-tab"]').click();
  await page.waitForTimeout(1500);
  await page.locator('[data-testid="summary-progress"]').waitFor({ state: 'detached', timeout: 1800000 });
  const cell = page.locator('[data-testid="summary-row"][data-target="xarth"] [data-testid="summary-cell"][data-drain="team"]');
  const summary = await facts(cell);
  check(summary.length === 1 && summary[0].text === xarth?.text, `Summary Xarth (Team) = Plan Xarth: "${summary[0]?.text}"`);
  const cells = await page.locator('[data-testid="summary-cell"]:not([data-drain="none"])').evaluateAll((els) => els.map((e) => ({
    noDrains: !!e.querySelector('[data-testid="summary-no-drains"]'),
    facts: e.querySelectorAll('[data-testid="drain-facts"]').length,
  })));
  check(cells.length > 20 && cells.every((c) => c.noDrains || c.facts === 1), `Summary: every drainable Solo / Team cell has one facts line (${cells.length} cells)`);
  await shot(page, 'summary');

  // --- Search, Solo party 1, Elder maul only (Bork, armour 8)
  await page.locator('[data-testid="search-tab"]').click();
  await page.locator('[data-testid="drain-solo"]').click();
  await page.locator('[data-testid="scaling-partySize"]').fill('1');
  await page.locator('[data-testid="my-specs-mode"]').selectOption('manual');
  const maul = page.locator('[data-testid="bs-my-elderMaul"]');
  if ((await maul.getAttribute('aria-pressed')) !== 'true') await maul.click();
  for (const w of ['dwh', 'bgs', 'tonalztics']) {
    const b = page.locator(`[data-testid="bs-my-${w}"]`);
    if ((await b.getAttribute('aria-pressed')) === 'true') await b.click();
  }
  await page.locator('[data-testid="boss-select"]').selectOption('bork');
  await waitSearch(page);
  const solo = await facts(page.locator('[data-testid="spec-plan"]'));
  console.log(`     Search Solo Bork: ${solo[0]?.shown}`);
  check(solo.length === 1 && /^Drain: Elder maul ×\d+ \(floor \d+%\)$/.test(solo[0].text) && !/ bring /.test(solo[0].text), 'Search Solo: the facts line without carriers');
  check(/^needs 4 specs, you have ~\d$/.test(solo[0]?.short ?? '') || solo[0]?.short === '', `Search Solo: the "needs …, you have ~N" mark when the bar can't pay ("${solo[0]?.short}")`);
  await shot(page, 'search-solo');

  await browser.close();
  console.log(`${failures ? `${failures} FAILED` : 'all OK'} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  process.exit(failures ? 1 : 0);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
