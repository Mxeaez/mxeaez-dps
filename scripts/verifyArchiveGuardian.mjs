/**
 * Phase 3 UI check (not part of the Jest run).
 *
 * Usage (dev server running): node scripts/verifyArchiveGuardian.mjs [baseUrl]
 * Loads the "Max Mage" equipment preset, equips a Kodai wand and autocasts Fire Surge, then reads max hit / attack
 * roll / DPS for Archive Guardian (Flying) and (Grounded) and compares them with the values asserted in
 * src/tests/lib/fracturedArchive/ArchiveGuardian.test.ts ("UI parity" test). Then switches to Ice Barrage and checks
 * the Ancient Magicks immunity (0 DPS). Saves docs/screenshots/phase3-ag-flying.png / -grounded.png.
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:3001/osrs-dps/';

// keep in sync with the "UI parity" test in src/tests/lib/fracturedArchive/ArchiveGuardian.test.ts
const EXPECTED = {
  Flying: { maxHit: 53, dps: '4.636' },
  Grounded: { maxHit: 43, dps: '3.014' },
};

const pickCombobox = async (page, placeholder, text, option = text) => {
  const input = page.getByPlaceholder(placeholder);
  await input.click();
  await input.fill(text);
  await page.waitForTimeout(800);
  await page.locator('[role="option"]', { hasText: option }).first().click();
  await page.waitForTimeout(500);
};

const selectMonster = async (page, version) => {
  await pickCombobox(page, 'Search for monster...', 'Archive Guardian', version);
  await page.waitForTimeout(800);
};

const readRow = async (page, label) => {
  await page.waitForTimeout(1000);
  const row = page.locator('table tbody tr', { has: page.locator('th[title]', { hasText: new RegExp(`^${label}$`) }) }).first();
  return (await row.locator('th').nth(1).innerText()).trim();
};

const main = async () => {
  fs.mkdirSync('docs/screenshots', { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1400 } });
  await page.goto(BASE, { waitUntil: 'load', timeout: 120000 });
  await page.getByPlaceholder('Search for monster...').waitFor({ timeout: 120000 });

  await selectMonster(page, 'Flying');
  await page.getByText('Presets', { exact: true }).first().click();
  await page.waitForTimeout(500);
  await page.locator('[role="option"]', { hasText: /^Max Mage$/ }).first().click();
  await page.waitForTimeout(800);
  await pickCombobox(page, 'Search for equipment...', 'Kodai wand');
  await page.getByRole('button', { name: 'Combat' }).first().click();
  await page.waitForTimeout(500);
  await page.locator('button', { hasText: /magic\s*,\s*Autocast$/i }).first().click();
  await page.waitForTimeout(500);
  await pickCombobox(page, 'Select a spell...', 'Fire Surge');

  let failures = 0;
  for (const version of ['Flying', 'Grounded']) {
    await selectMonster(page, version);
    const maxHit = Number(await readRow(page, 'Max hit'));
    const dps = await readRow(page, 'DPS');
    const exp = EXPECTED[version];
    const ok = maxHit === exp.maxHit && dps.startsWith(exp.dps);
    if (!ok) failures++;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${version}: max hit ${maxHit} (expected ${exp.maxHit}), dps ${dps} (expected ${exp.dps}...)`);
    await page.screenshot({ path: `docs/screenshots/phase3-ag-${version.toLowerCase()}.png`, fullPage: true });
  }

  // Ancient Magicks immunity
  await pickCombobox(page, 'Select a spell...', 'Ice Barrage');
  const barrageDps = await readRow(page, 'DPS');
  const barrageOk = Number(barrageDps) === 0;
  if (!barrageOk) failures++;
  console.log(`${barrageOk ? 'OK  ' : 'FAIL'} Grounded + Ice Barrage: dps ${barrageDps} (expected 0, immune)`);
  await page.screenshot({ path: 'docs/screenshots/phase3-ag-ancients.png', fullPage: true });

  await browser.close();
  process.exit(failures ? 1 : 0);
};

main();
