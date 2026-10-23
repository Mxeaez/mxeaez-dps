/**
 * Phase 7b UI check (not part of the Jest run).
 *
 * Usage (dev server running): node scripts/verifyFracturedArchiveEquipment.mjs [baseUrl]
 * With the default player (99 in every skill, no boosts, no other gear) equips each Fractured Archive reward, picks
 * the combat style used in src/tests/lib/fracturedArchive/Equipment.test.ts, selects the same raid boss and compares
 * the on-screen max hit / DPS with the Jest values. Also shows the new Zeal prayer.
 * Saves docs/screenshots/phase7b-<item>.png.
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:3001/osrs-dps/';

// keep in sync with src/tests/lib/fracturedArchive/Equipment.test.ts
const ITEMS = [
  {
    file: 'obligator', items: [['Obligator', /^Obligator#Charged/]], style: ['Thrust', 1], monster: ['Xarth', /^Xarth/], maxHit: 25, dps: '4.153',
  },
  {
    file: 'zoryas-tome', items: [["Zorya's tome", /^Zorya's tome#Charged/]], monster: ['Dreadnoth', /^Dreadnoth the Jellied/], maxHit: 20, dps: '1.740',
  },
  {
    file: 'ascension-crossbows',
    items: [['Ascension crossbows', /^Ascension crossbows/], ['Ascension bolts', /^Ascension bolts/]],
    style: ['Rapid', 0],
    monster: ['Archive Guardian', /^Archive Guardian.*Flying/],
    maxHit: 20,
    dps: '1.431',
  },
  {
    file: 'diamond-ascension-bolts', items: [['Diamond ascension bolts (e)', /^Diamond ascension bolts \(e\)/]], style: ['Rapid', 0], maxHit: 23,
  },
  {
    file: 'onyx-ascension-bolts', items: [['Onyx ascension bolts (e)', /^Onyx ascension bolts \(e\)/]], style: ['Rapid', 0], maxHit: 24,
  },
  { file: 'rondache', items: [['Rondache', /^Rondache/]] },
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

const tab = (page, name) => page.locator(`button[data-tooltip-content="${name}"]`).first();

const main = async () => {
  fs.mkdirSync('docs/screenshots', { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1400 } });
  await page.goto(BASE, { waitUntil: 'load', timeout: 120000 });
  await page.getByPlaceholder('Search for monster...').waitFor({ timeout: 120000 });

  let failures = 0;
  const check = (ok, msg) => {
    if (!ok) failures++;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`);
  };

  for (const exp of ITEMS) {
    for (const [search, option] of exp.items) {
      await pickCombobox(page, 'Search for equipment...', search, option);
    }
    if (exp.monster) {
      await pickCombobox(page, 'Search for monster...', exp.monster[0], exp.monster[1]);
    }
    if (exp.style) {
      await tab(page, 'Combat').click();
      await page.locator('button', { hasText: new RegExp(`^${exp.style[0]}`) }).nth(exp.style[1]).click();
      await tab(page, 'Equipment').click();
      await page.waitForTimeout(500);
    }
    if (exp.maxHit !== undefined) {
      const maxHit = Number(await readRow(page, 'Max hit'));
      check(maxHit === exp.maxHit, `${exp.file}: max hit ${maxHit} (expected ${exp.maxHit})`);
    }
    if (exp.dps) {
      const dps = await readRow(page, 'DPS');
      check(dps.startsWith(exp.dps), `${exp.file}: dps ${dps} (expected ${exp.dps}...)`);
    }
    await page.screenshot({ path: `docs/screenshots/phase7b-${exp.file}.png`, fullPage: true });
  }

  // Zeal in the prayer book
  await tab(page, 'Prayer').click();
  const zeal = page.locator('button[data-tooltip-content="Zeal"]').first();
  check(await zeal.count() === 1, 'Zeal prayer button present');
  await zeal.click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'docs/screenshots/phase7b-zeal.png', fullPage: true });

  await browser.close();
  process.exit(failures ? 1 : 0);
};

main();
