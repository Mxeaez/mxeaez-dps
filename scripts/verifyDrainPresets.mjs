/**
 * Phase 7 UI check (not part of the Jest run).
 *
 * Usage (dev server running): node scripts/verifyDrainPresets.mjs [baseUrl]
 * "Max Mage" equipment preset + Kodai wand + autocast Fire Surge. For Ocellus Phase 2 (The Blade) and Archive Guardian
 * (Flying): reads DPS, clicks "Floor (Elder maul) + Ayak" in the Defensive Reductions panel, then checks the stats
 * panel (Defence = floor, magic defence bonus = 0), the spec inputs and the new DPS against
 * src/tests/lib/fracturedArchive/Drains.test.ts ("UI parity"). Then "Reset" must restore the undrained DPS.
 * Saves docs/screenshots/phase7-blade-maxdrain.png and phase7-ag-maxdrain.png.
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:3001/osrs-dps/';

// keep in sync with the "UI parity" test in src/tests/lib/fracturedArchive/Drains.test.ts
const EXPECTED = [
  {
    name: 'Ocellus', version: 'Phase 2', file: 'blade', def: 0, inputs: [2, 0, 4, 100], before: '2.290', after: '4.279',
  },
  {
    name: 'Archive Guardian', version: 'Flying', file: 'ag', def: 156, inputs: [2, 0, 0, 130], before: '4.636', after: '7.424',
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

// stats panel (shows the scaled/drained monster): Skills [hp, atk, str, def, magic, ranged, flat armour],
// Defensive [stab, slash, crush, magic, light, standard, heavy]
const readSection = async (page, heading) => page.locator('p', { hasText: /^Skills$/ })
  .locator('xpath=../..')
  .locator('p', { hasText: new RegExp(`^${heading}$`) })
  .locator('xpath=..')
  .locator('div[title] div.font-mono')
  .allInnerTexts()
  .then((vals) => vals.map((v) => Number(v.trim())));

// Defensive Reductions inputs: elder maul, dwh, arclight, emberlight, tonalztic, bgs, seercull, ayak
const readReductionInputs = async (page) => {
  const panel = page.locator('button', { hasText: 'Defensive Reductions' }).locator('xpath=..');
  const vals = await panel.locator('input[type="number"]').evaluateAll((els) => els.map((e) => Number(e.value)));
  return [vals[0], vals[1], vals[4], vals[7]]; // maul, dwh, tonalztic, ayak
};

const main = async () => {
  fs.mkdirSync('docs/screenshots', { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1500 } });
  await page.goto(BASE, { waitUntil: 'load', timeout: 120000 });
  await page.getByPlaceholder('Search for monster...').waitFor({ timeout: 120000 });

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
  const check = (ok, msg) => {
    if (!ok) failures++;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`);
  };

  for (const e of EXPECTED) {
    await pickCombobox(page, 'Search for monster...', e.name, e.version);
    await page.waitForTimeout(800);
    const panelHeader = page.locator('button', { hasText: 'Defensive Reductions' }).first();
    if (await page.getByRole('button', { name: 'Floor (Elder maul) + Ayak' }).count() === 0) {
      await panelHeader.click();
      await page.waitForTimeout(300);
    }

    const before = await readRow(page, 'DPS');
    check(before.startsWith(e.before), `${e.name} ${e.version}: undrained DPS ${before} (Jest ${e.before})`);

    await page.getByRole('button', { name: 'Floor (Elder maul) + Ayak' }).click();
    const after = await readRow(page, 'DPS');
    const skills = await readSection(page, 'Skills');
    const def = await readSection(page, 'Defensive');
    const inputs = await readReductionInputs(page);
    check(skills[3] === e.def, `${e.name} ${e.version}: Defence ${skills[3]} (floor ${e.def})`);
    check(def[3] === 0, `${e.name} ${e.version}: magic defence bonus ${def[3]} (expected 0)`);
    check(JSON.stringify(inputs) === JSON.stringify(e.inputs), `${e.name} ${e.version}: inputs maul/dwh/tonalztic/ayak ${inputs} (expected ${e.inputs})`);
    check(after.startsWith(e.after) && Number(after) > Number(before), `${e.name} ${e.version}: drained DPS ${after} (Jest ${e.after})`);
    await page.mouse.move(0, 0);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `docs/screenshots/phase7-${e.file}-maxdrain.png`, fullPage: true });

    await page.getByRole('button', { name: 'Reset' }).click();
    const reset = await readRow(page, 'DPS');
    check(reset === before, `${e.name} ${e.version}: Reset -> DPS ${reset}`);
  }

  await browser.close();
  process.exit(failures ? 1 : 0);
};

main();
