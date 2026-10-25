// STALE: checks written for pre-phase-29 defaults; fails at HEAD. Run with `node scripts/verifyAll.mjs --all` only.
/**
 * Phase 13 UI check (not part of the Jest run).
 *
 * Usage (dev server running): node scripts/verifyPhase13.mjs [baseUrl]
 * - /best-setup Search: Archive Guardian (Flying) Solo shows the Tonalztics drain plan and no "Elder maul";
 *   Archive Guardian (Grounded) Solo shows "Elder maul"; Search DPS cells use the accent orange class (Summary:
 *   scripts/verifyBestSetup.mjs).
 * - Calculator, Defensive Reductions panel on AG Flying: weapon buttons greyed out, fallback line names the plan.
 * Screenshots docs/screenshots/phase13-*.png.
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE = (process.argv[2] || 'http://localhost:3001/osrs-dps/').replace(/\/?$/, '/');
const ORANGE = 'text-orange-400';

let failures = 0;
const check = (ok, msg) => {
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`);
};

const waitRows = async (page, testid) => {
  await page.locator(`[data-testid="${testid}"]`).first().waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
  await page.locator(`[data-testid="${testid}"]`).first().waitFor({ timeout: 120000 });
};

const pickCombobox = async (page, placeholder, text, option = text) => {
  const input = page.getByPlaceholder(placeholder);
  await input.click();
  await input.fill(text);
  await page.waitForTimeout(800);
  await page.locator('[role="option"]', { hasText: option }).first().click();
  await page.waitForTimeout(800);
};

const main = async () => {
  fs.mkdirSync('docs/screenshots', { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 1400 } });

  // 1. Search: AG Flying Solo
  await page.goto(`${BASE}best-setup`, { waitUntil: 'load', timeout: 120000 });
  await page.locator('[data-testid="boss-select"]').selectOption('ag-flying');
  await page.locator('[data-testid="drain-solo"]').click();
  await waitRows(page, 'search-row');
  await page.waitForTimeout(500);
  let summary = (await page.locator('[data-testid="search-summary"]').innerText()).replace(/\s+/g, ' ');
  console.log(`     ${summary.slice(0, 140)}`);
  // phase 14: Solo only uses the user's carried weapons (default Elder maul + Ayak) → no Defence drain while flying
  // phase 23: the drain line is "[icon] ×N" items (data-weapon) + "→ Def N · Magic def M"
  const weapons = () => page.locator('[data-testid="search-summary"] [data-testid="drain-line-item"]').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-weapon')}×${e.getAttribute('data-count')}`));
  check(summary.includes('Def 260'), 'AG Flying Solo (phase 14): carried Elder maul can\'t hit → Defence 260');
  const drainLine = await weapons();
  check(!drainLine.some((w) => w.startsWith('elderMaul')), `AG Flying Solo: no Elder maul in the drain line (${drainLine.join(', ')})`);
  const cls = await page.locator('[data-testid="search-row"] [data-testid="dps"]').first().getAttribute('class');
  check(cls.includes(ORANGE) && cls.includes('font-semibold'), `Search DPS cell class: ${cls}`);
  await page.mouse.move(0, 0);
  await page.screenshot({ path: 'docs/screenshots/phase13-search-ag-flying-solo.png', fullPage: true });

  // 2. Search: AG Grounded Solo
  await page.locator('[data-testid="boss-select"]').selectOption('ag-grounded');
  await waitRows(page, 'search-row');
  await page.waitForTimeout(500);
  summary = (await page.locator('[data-testid="search-summary"]').innerText()).replace(/\s+/g, ' ');
  console.log(`     ${summary.slice(0, 140)}`);
  check((await weapons()).includes('elderMaul×2'), 'AG Grounded Solo: Elder maul ×2 plan');

  // 2b. Team: Ayak spec count visible
  await page.locator('[data-testid="drain-team"]').click();
  await waitRows(page, 'search-row');
  summary = (await page.locator('[data-testid="search-summary"]').innerText()).replace(/\s+/g, ' ');
  // phase 14: Team = the carriers' first round (probabilities: scripts/verifyPhase14.mjs)
  const teamLine = await weapons();
  check(teamLine.some((w) => w.startsWith('ayak')), `Team shows the first-round specs incl. Ayak: ${teamLine.join(', ')}`);

  // 3. The Per boss tab is gone; the search-based Summary is checked by scripts/verifyBestSetup.mjs
  check(await page.locator('[data-testid="boss-tab"]').count() === 0, 'no "Per boss" tab');

  // 4. Calculator: Defensive Reductions panel on AG Flying
  await page.goto(BASE, { waitUntil: 'load', timeout: 120000 });
  await page.getByPlaceholder('Search for monster...').waitFor({ timeout: 120000 });
  await pickCombobox(page, 'Search for monster...', 'Archive Guardian', 'Flying');
  if (await page.getByRole('button', { name: 'Floor (Elder maul) + Ayak' }).count() === 0) {
    await page.locator('button', { hasText: 'Defensive Reductions' }).first().click();
    await page.waitForTimeout(300);
  }
  const fb = page.locator('[data-testid="drain-fallback"]');
  check(await fb.count() === 1, `fallback line: ${(await fb.innerText().catch(() => '')).trim()}`);
  const blocked = await page.getByRole('button', { name: 'Floor (Elder maul)', exact: true }).getAttribute('data-blocked');
  check(blocked === 'true', 'Floor (Elder maul) button marked as blocked (greyed out)');
  await page.getByRole('button', { name: 'Floor (Elder maul) + Ayak' }).hover();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'docs/screenshots/phase13-calc-ag-flying-drains.png', fullPage: true });

  await pickCombobox(page, 'Search for monster...', 'Archive Guardian', 'Grounded');
  check(await page.locator('[data-testid="drain-fallback"]').count() === 0, 'AG Grounded: no fallback line, melee buttons active');

  await browser.close();
  process.exit(failures ? 1 : 0);
};

main();
