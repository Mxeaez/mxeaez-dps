/**
 * Phase 23 UI check (not part of the Jest run): the best-setup UI cleanup.
 *
 * Usage (dev server running): node scripts/verifyPhase23.mjs [baseUrl]
 * - Simple view: the assumptions box shows ≤ 10 form inputs (+ the "My specs" icon toggles); Advanced is closed and
 *   holds the team carriers, one "carriers use Lightbearer" toggle (no per-weapon LB boxes), the floor confidence, the
 *   team-DPS multiplier, the energy priority and the time-model settings; no Fight length input anywhere; the "?"
 *   glossary opens.
 * - Tabs are Search · Plan · Summary (no Routes / Encounters tab).
 * - Search (Xarth): the drain line shows icons with ×N and a hit % under each (Team: maul ×4, Tonalztics ×8,
 *   Ayak ×2), Solo shows "fight ≈ N s → M specs"; None: top DPS 12.839 (unchanged); the can't-hit list is collapsed.
 * - Plan: FA shows the 8-route table, ToA a single-route table, per-phase drain lines.
 * - Calculator: the Max-drain buttons show icons ×N with hit %.
 * Screenshots docs/screenshots/phase23-*.png.
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
  await page.screenshot({ path: `docs/screenshots/phase23-${name}.png`, fullPage: true });
};

const waitSearch = async (page) => {
  await page.waitForTimeout(800);
  await page.locator('[data-testid="search-progress"]').waitFor({ state: 'detached', timeout: 300000 });
  await page.locator('[data-testid="search-results"]').waitFor({ timeout: 300000 });
};
const topDps = async (page) => Number((await page.locator('[data-testid="search-row"] [data-testid="dps"]').first().innerText()).trim());
const lineItems = (page, scope) => page.locator(`${scope} [data-testid="drain-line-item"]`).evaluateAll((els) => els.map((e) => ({
  weapon: e.getAttribute('data-weapon'),
  count: e.querySelector('[data-testid="drain-line-count"]')?.textContent,
  hit: e.querySelector('[data-testid="drain-line-hit"]')?.textContent,
  icon: !!e.querySelector('img'),
})));

const runPlan = async (page) => {
  await page.locator('[data-testid="plan-tab"]').click();
  await page.locator('[data-testid="plan-view"]').waitFor({ timeout: 30000 });
  await page.waitForTimeout(800);
  await page.locator('[data-testid="plan-progress"]').waitFor({ state: 'detached', timeout: 600000 });
  await page.locator('[data-testid="plan-result"]').waitFor({ timeout: 600000 });
};

const main = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1400 } });
  await page.goto(`${BASE}best-setup`, { waitUntil: 'load', timeout: 120000 });
  await page.locator('[data-testid="assumptions"]').waitFor({ timeout: 120000 });

  // --- simple view
  const box = page.locator('[data-testid="assumptions"]');
  const visibleInputs = await box.locator('input, select').evaluateAll((els) => els.filter((e) => e.checkVisibility()).length);
  const toggles = await box.locator('[data-testid="my-specs"] button[aria-pressed]').count();
  check(visibleInputs <= 10, `simple view: ${visibleInputs} visible inputs / selects (≤ 10), + ${toggles} icon toggles`);
  check(toggles === 5, `My specs: ${toggles} icon toggles (Elder maul, DWH, BGS, Tonalztics, Lightbearer)`);
  const advancedOpen = await page.locator('[data-testid="advanced"]').evaluate((e) => e.open);
  check(!advancedOpen, 'Advanced closed by default');
  check(!(await page.locator('#bs-team-elderMaul').isVisible()), 'carriers hidden in the simple view');
  check(await page.locator('#bs-fight').count() === 0, 'no Fight length input');
  check(!/Fight length/i.test(await box.innerText()), 'no "Fight length" text in the assumptions box');
  check(await page.locator('[id^="bs-team-lb-"]').count() === 0, 'no per-weapon LB checkboxes');
  await shot(page, 'simple');

  // tabs
  const tabs = await page.locator('[data-testid$="-tab"]').allInnerTexts();
  check(JSON.stringify(tabs.map((t) => t.trim())) === JSON.stringify(['Search', 'Plan', 'Summary']), `tabs: ${tabs.join(' · ')}`);
  check(await page.locator('[data-testid="routes-tab"]').count() === 0, 'no Routes / Encounters tab');

  // glossary
  await page.locator('[data-testid="glossary-button"]').click();
  const glossary = await page.locator('[data-testid="glossary"]').innerText();
  check(['Drains', 'Floor', 'First round', 'Team DPS ×', 'Carriers'].every((t) => glossary.includes(`${t}:`)), 'glossary lists drain states, floor, first round, Team DPS ×, carriers');
  await shot(page, 'glossary');
  await page.locator('[data-testid="glossary-button"]').click();

  // Advanced
  await page.locator('[data-testid="advanced-toggle"]').click();
  await page.waitForTimeout(300);
  check(await page.locator('#bs-team-elderMaul').isVisible(), 'Advanced: carriers visible');
  check(await page.locator('#bs-team-lightbearer').isVisible(), 'Advanced: one "carriers use Lightbearer" toggle');
  const advText = await page.locator('[data-testid="advanced"]').innerText();
  check(advText.includes('Count the floor as reached when the first round\'s chance is ≥'), 'Advanced: floor confidence label');
  check(advText.includes('Players assumed at your DPS when converting HP to time'), 'Advanced: team-DPS multiplier label');
  check(await page.locator('[data-testid="time-settings"]').isVisible(), 'Advanced: time-model settings');
  const untitled = await page.locator('[data-testid="advanced"] input, [data-testid="advanced"] select').evaluateAll((els) => els
    .filter((e) => !(e.closest('label')?.title || e.title)).map((e) => e.id));
  check(untitled.length === 0, `Advanced inputs have tooltips${untitled.length ? ` (missing: ${untitled.join(', ')})` : ''}`);
  await shot(page, 'advanced');
  await page.locator('[data-testid="advanced-toggle"]').click();

  // --- Search: Xarth
  await page.locator('[data-testid="boss-select"]').selectOption('xarth');
  await waitSearch(page);
  const team = await lineItems(page, '[data-testid="spec-plan"]');
  check(JSON.stringify(team.map((i) => [i.weapon, i.count])) === JSON.stringify([['elderMaul', '×4'], ['tonalztics', '×8'], ['ayak', '×2']]), `Team drain line: ${team.map((i) => `${i.weapon} ${i.count}`).join(', ')}`);
  check(team.every((i) => /^\d+%$/.test(i.hit || '') && i.icon), `hit chance under each icon: ${team.map((i) => i.hit).join(', ')}`);
  const result = await page.locator('[data-testid="spec-plan"] [data-testid="drain-line-result"]').innerText();
  check(/→ Def \d+ · Magic def \d+/.test(result), `drain line result "${result}"`);
  check(await page.locator('[data-testid="search-summary"] [data-testid="drain-line"]').count() === 1, 'Search header shows the drain line');
  await shot(page, 'search-xarth-team');

  await page.locator('[data-testid="drain-solo"]').click();
  await waitSearch(page);
  const budget = await page.locator('[data-testid="spec-plan"] [data-testid="drain-line-budget"]').innerText();
  check(/fight ≈ \d+ s → \d+ specs?/.test(budget), `Solo budget "${budget}"`);

  await page.locator('[data-testid="drain-none"]').click();
  await waitSearch(page);
  const none = await topDps(page);
  check(Math.abs(none - 12.839) < 0.0005, `Xarth None top DPS ${none} (12.839 unchanged)`);

  // can't-hit list collapsed (AG flying: melee can't reach it)
  await page.locator('[data-testid="boss-select"]').selectOption('ag-flying');
  await waitSearch(page);
  const cant = page.locator('[data-testid="cant-hit"]');
  check(await cant.count() === 1 && /\d+ weapons? can't hit \(show\)/.test(await cant.locator('summary').innerText()), `can't-hit summary "${await cant.locator('summary').innerText()}"`);
  check(!(await page.locator('[data-testid="cant-hit-list"]').isVisible()), 'can\'t-hit list collapsed');
  await shot(page, 'search-ag-flying');

  // --- Plan: FA (8 routes) and ToA (single route), Team drains (the default)
  await page.locator('[data-testid="drain-team"]').click();
  await runPlan(page);
  const faRoutes = await page.locator('[data-testid="plan-route-row"]').count();
  check(faRoutes === 8, `FA Plan: ${faRoutes} route rows`);
  const encCells = await page.locator('[data-testid="plan-route-row"]').first().locator('[data-testid^="plan-enc-"]').count();
  check(encCells === 5, `FA route row: ${encCells} encounter cells`);
  const planLines = await page.locator('[data-testid="plan-phase-drains"] [data-testid="drain-line-item"]').count();
  check(planLines > 0, `Plan per-phase drain lines: ${planLines} icons`);
  const faTotal = (await page.locator('[data-testid="plan-total"]').innerText()).trim();
  check(faTotal === '23:30.4', `FA plan total ${faTotal} (23:30.4 unchanged)`);
  await shot(page, 'plan-fa');

  await page.locator('[data-testid="raid-tab-toa"]').click();
  await page.waitForTimeout(500);
  await runPlan(page);
  const toaRoutes = await page.locator('[data-testid="plan-route-row"]').count();
  check(toaRoutes === 1, `ToA Plan: ${toaRoutes} route row (single route)`);
  const toaTotal = (await page.locator('[data-testid="plan-total"]').innerText()).trim();
  check(toaTotal === '14:20.2', `ToA plan total ${toaTotal} (14:20.2 unchanged)`);
  await shot(page, 'plan-toa');

  // --- calculator Max-drain buttons
  await page.goto(BASE, { waitUntil: 'load', timeout: 120000 });
  const monster = page.getByPlaceholder('Search for monster...');
  await monster.waitFor({ timeout: 120000 });
  await monster.click();
  await monster.fill('Xarth');
  await page.waitForTimeout(800);
  await page.locator('[role="option"]', { hasText: 'Xarth' }).first().click();
  await page.waitForTimeout(800);
  const maul = page.getByRole('button', { name: 'Floor (Elder maul)', exact: true });
  if (await maul.count() === 0 || !(await maul.isVisible())) {
    await page.locator('button', { hasText: 'Defensive Reductions' }).first().click();
    await page.waitForTimeout(300);
  }
  const btn = await maul.locator('[data-testid="drain-line-item"]').evaluateAll((els) => els.map((e) => ({
    weapon: e.getAttribute('data-weapon'),
    count: e.querySelector('[data-testid="drain-line-count"]')?.textContent,
    hit: e.querySelector('[data-testid="drain-line-hit"]')?.textContent,
  })));
  check(btn.length > 0 && btn[0].weapon === 'elderMaul' && /^×\d+$/.test(btn[0].count || '') && /^\d+%$/.test(btn[0].hit || ''), `Max-drain Elder maul button: ${btn.map((b) => `${b.weapon} ${b.count} (${b.hit})`).join(', ')}`);
  await maul.scrollIntoViewIfNeeded();
  await shot(page, 'calc-maxdrain');

  await browser.close();
  console.log(failures ? `${failures} FAILED` : 'all OK');
  process.exit(failures ? 1 : 0);
};

main();
