/**
 * Phase 2 UI check (not part of the Jest run).
 *
 * Usage (dev server running): node scripts/verifyFracturedArchivePartySize.mjs [baseUrl]
 * Selects Archive Guardian (Flying), checks the party size input and its "unverified" hint are shown, sets party
 * size 2 and 8, reads the displayed (scaled) hitpoints and saves docs/screenshots/phase2-ag-party{2,8}.png.
 * Expected HP comes from FRACTURED_ARCHIVE_HP_SCALING (currently 1/1 for every size -> 550).
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:3001/osrs-dps/';
const EXPECTED_HP = { 2: 550, 8: 550 };

const readSkills = async (page) => page.locator('p', { hasText: /^Skills$/ })
  .locator('xpath=..')
  .locator('div[title] div.font-mono')
  .allInnerTexts()
  .then((vals) => vals.map((v) => Number(v.trim())));

const main = async () => {
  fs.mkdirSync('docs/screenshots', { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1300 } });
  await page.goto(BASE, { waitUntil: 'load', timeout: 120000 });
  const search = page.getByPlaceholder('Search for monster...');
  await search.waitFor({ timeout: 120000 });
  await search.click();
  await search.fill('Archive Guardian');
  await page.waitForTimeout(800);
  await page.locator('[role="option"]', { hasText: 'Flying' }).first().click();
  await page.waitForTimeout(500);

  const heading = page.locator('h4', { hasText: 'Party size' });
  await heading.waitFor({ timeout: 10000 });
  const hint = await heading.locator('span', { hasText: 'unverified' }).count();
  console.log(`party size input shown, unverified hint: ${hint ? 'yes' : 'NO'}`);
  const input = heading.locator('xpath=..').locator('input');

  let failures = hint ? 0 : 1;
  for (const size of [2, 8]) {
    await input.fill(String(size));
    await input.press('Tab');
    await page.waitForTimeout(800);
    const [hp] = await readSkills(page);
    const ok = hp === EXPECTED_HP[size];
    if (!ok) failures++;
    console.log(`${ok ? 'OK  ' : 'FAIL'} party ${size}: hp ${hp} (expected ${EXPECTED_HP[size]})`);
    await page.screenshot({ path: `docs/screenshots/phase2-ag-party${size}.png`, fullPage: true });
  }

  await browser.close();
  process.exit(failures ? 1 : 0);
};

main();
