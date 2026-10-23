/**
 * Phase 5 UI check (not part of the Jest run).
 *
 * Usage (dev server running): node scripts/verifyDreadnothAndXarth.mjs [baseUrl]
 * Loads the "Max Melee" equipment preset + Emberlight, Super combat, Piety and Slash (aggressive slash), then selects
 * Dreadnoth the Jellied, Xarth and Jelly (Dreadnoth) and reads max hit / DPS and the demonbane factor from the calc
 * details. Values are compared with the "real loadout sanity check / UI parity" test in
 * src/tests/lib/fracturedArchive/DreadnothAndXarth.test.ts.
 * Saves docs/screenshots/phase5-dreadnoth.png, phase5-xarth.png and phase5-jelly.png.
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:3001/osrs-dps/';

// keep in sync with the UI parity test in src/tests/lib/fracturedArchive/DreadnothAndXarth.test.ts
const EXPECTED = [
  {
    search: 'Dreadnoth', option: /^Dreadnoth the Jellied/, file: 'dreadnoth', maxHit: 44, dps: '7.785', factor: '70 * 25 / 100 = 17',
  },
  {
    search: 'Xarth', option: /^Xarth/, file: 'xarth', maxHit: 59, dps: '8.541', factor: '70 * 80 / 100 = 56',
  },
  {
    search: 'Jelly (Dreadnoth)', option: /^Jelly \(Dreadnoth\)/, file: 'jelly', maxHit: 64, dps: '12.41', factor: '70 * 100 / 100 = 70',
  },
];

const pickCombobox = async (page, placeholder, text, option = text) => {
  const input = page.getByPlaceholder(placeholder);
  await input.click();
  await input.fill(text);
  await page.waitForTimeout(800);
  await page.locator('[role="option"]', { hasText: option }).first().click();
  await page.waitForTimeout(500);
};

const readRow = async (page, label) => {
  await page.waitForTimeout(1000);
  const row = page.locator('table tbody tr', { has: page.locator('th[title]', { hasText: new RegExp(`^${label}$`) }) }).first();
  return (await row.locator('th').nth(1).innerText()).trim();
};

// "[Debug] Calc Details" table row, e.g. "Demonbane factor" -> "70 * 25 / 100 = 17" ('' if the row isn't shown)
const readDetail = async (page, label) => {
  const row = page.locator('tr', { has: page.locator('td', { hasText: new RegExp(`^${label}$`) }) }).first();
  if (await row.count() === 0) return '';
  return (await row.locator('td').nth(1).innerText()).trim();
};

// Super combat potion (Skills tab), Piety (Prayer tab) and the given combat style (Combat tab), then back to Equipment
const setMeleeBoosts = async (page, styleName) => {
  const tab = (name) => page.locator(`button[data-tooltip-content="${name}"]`).first();
  await tab('Skills').click();
  await page.locator('button', { hasText: /^Super combat$/ }).first().click();
  await tab('Prayer').click();
  await page.locator('button[data-tooltip-content="Piety"]').first().click();
  await tab('Combat').click();
  await page.locator('button', { hasText: new RegExp(`^${styleName}`) }).first().click();
  await tab('Equipment').click();
  await page.waitForTimeout(500);
};

const main = async () => {
  fs.mkdirSync('docs/screenshots', { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1400 } });
  await page.goto(BASE, { waitUntil: 'load', timeout: 120000 });
  await page.getByPlaceholder('Search for monster...').waitFor({ timeout: 120000 });

  await page.getByText('Presets', { exact: true }).first().click();
  await page.waitForTimeout(500);
  await page.locator('[role="option"]', { hasText: /^Max Melee$/ }).first().click();
  await page.waitForTimeout(800);
  await pickCombobox(page, 'Search for equipment...', 'Emberlight', /^Emberlight/);
  await setMeleeBoosts(page, 'Slash');

  let failures = 0;
  const check = (ok, msg) => {
    if (!ok) failures++;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`);
  };

  // open the calc details once so the demonbane factor can be read
  const details = page.getByText('[Debug] Calc Details').first();

  for (const exp of EXPECTED) {
    await pickCombobox(page, 'Search for monster...', exp.search, exp.option);
    await page.waitForTimeout(800);
    const maxHit = Number(await readRow(page, 'Max hit'));
    const dps = await readRow(page, 'DPS');
    check(maxHit === exp.maxHit && dps.startsWith(exp.dps),
      `${exp.search}: max hit ${maxHit} (expected ${exp.maxHit}), dps ${dps} (expected ${exp.dps}...)`);
    let factor = await readDetail(page, 'Demonbane factor');
    if (!factor) {
      await details.click();
      await page.waitForTimeout(800);
      factor = await readDetail(page, 'Demonbane factor');
    }
    check(factor === exp.factor, `${exp.search}: demonbane factor "${factor}" (expected "${exp.factor}")`);
    await page.screenshot({ path: `docs/screenshots/phase5-${exp.file}.png`, fullPage: true });
  }

  await browser.close();
  process.exit(failures ? 1 : 0);
};

main();
