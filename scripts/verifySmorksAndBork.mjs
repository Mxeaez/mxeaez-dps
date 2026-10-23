/**
 * Phase 4 UI check (not part of the Jest run).
 *
 * Usage (dev server running): node scripts/verifySmorksAndBork.mjs [baseUrl]
 * Loads the "Max Melee" equipment preset + Scythe of Vitur (charged), selects Bork, cycles every option of the Phase
 * dropdown and reads max hit / DPS, then selects The Smorks. Values are compared with the "UI parity" test in
 * src/tests/lib/fracturedArchive/SmorksAndBork.test.ts. Also checks the party size input shows 2 for these bosses.
 * Saves docs/screenshots/phase4-bork-<option>.png and phase4-smorks.png.
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:3001/osrs-dps/';

// keep in sync with the "UI parity" test in src/tests/lib/fracturedArchive/SmorksAndBork.test.ts
const BORK_EXPECTED = [
  { phase: 'Smorks 100-76% HP (armour 8)', file: 'armour8', maxHit: 36, dps: '0.950' },
  { phase: 'Smorks 75-51% HP (armour 10)', file: 'armour10', maxHit: 32, dps: '0.774' },
  { phase: 'Smorks 50-26% HP (armour 12)', file: 'armour12', maxHit: 28, dps: '0.621' },
  { phase: 'Smorks 25-0% HP (armour 14)', file: 'armour14', maxHit: 24, dps: '0.493' },
  { phase: 'Stunned (armour 0)', file: 'stunned', maxHit: 60, dps: '10.06' },
];
const SMORKS_EXPECTED = { maxHit: 54, dps: '2.010' };

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

// the Phase dropdown is upstream's Select (downshift); its toggle div shows the current phase
const phaseToggle = (page, current) => page.locator('div.form-control', { hasText: current }).first();
const selectPhase = async (page, current, phase) => {
  await phaseToggle(page, current).click();
  await page.waitForTimeout(400);
  await page.locator('[role="option"]', { hasText: phase }).first().click();
  await page.waitForTimeout(600);
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
  await pickCombobox(page, 'Search for equipment...', 'Scythe of Vitur', /^Scythe of Vitur.*Charged/);

  await pickCombobox(page, 'Search for monster...', 'Bork', /^Bork/);
  await page.waitForTimeout(800);

  let failures = 0;
  const check = (ok, msg) => {
    if (!ok) failures++;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`);
  };

  const partySize = await page.locator('input[type="number"][min="2"][max="8"]').first().inputValue();
  check(partySize === '2', `party size input shows ${partySize} (expected 2)`);

  let current = BORK_EXPECTED[0].phase;
  check(await phaseToggle(page, current).count() > 0, `default phase is "${current}"`);
  for (const exp of BORK_EXPECTED) {
    if (exp.phase !== current) {
      await selectPhase(page, current, exp.phase);
      current = exp.phase;
    }
    const maxHit = Number(await readRow(page, 'Max hit'));
    const dps = await readRow(page, 'DPS');
    check(maxHit === exp.maxHit && dps.startsWith(exp.dps),
      `Bork ${exp.phase}: max hit ${maxHit} (expected ${exp.maxHit}), dps ${dps} (expected ${exp.dps}...)`);
    await page.screenshot({ path: `docs/screenshots/phase4-bork-${exp.file}.png`, fullPage: true });
  }

  await pickCombobox(page, 'Search for monster...', 'The Smorks', /^The Smorks/);
  await page.waitForTimeout(800);
  const maxHit = Number(await readRow(page, 'Max hit'));
  const dps = await readRow(page, 'DPS');
  check(maxHit === SMORKS_EXPECTED.maxHit && dps.startsWith(SMORKS_EXPECTED.dps),
    `The Smorks: max hit ${maxHit} (expected ${SMORKS_EXPECTED.maxHit}), dps ${dps} (expected ${SMORKS_EXPECTED.dps}...)`);
  await page.screenshot({ path: 'docs/screenshots/phase4-smorks.png', fullPage: true });

  await browser.close();
  process.exit(failures ? 1 : 0);
};

main();
