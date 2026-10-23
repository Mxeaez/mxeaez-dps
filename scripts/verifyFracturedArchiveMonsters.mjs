/**
 * Phase 1 UI check for The Fractured Archive monsters (not part of the Jest run).
 *
 * Usage (dev server running): node scripts/verifyFracturedArchiveMonsters.mjs [baseUrl]
 * Selects each monster/version in the monster box, reads the stat panel and compares it with the values
 * transcribed from the OSRS Wiki infoboxes (fetched 2026-10-22). Saves docs/screenshots/phase1-<name>.png.
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:3001/osrs-dps/';

// [hp, atk, str, def, magic, ranged, flatArmour], [atk, str, magic, magicStr, ranged, rangedStr],
// [stab, slash, crush, magic, light, standard, heavy] -- wiki infobox values.
const EXPECTED = [
  { file: 'archive-guardian-flying', name: 'Archive Guardian', version: 'Flying', skills: [550, 250, 240, 260, 250, 280, 0], off: [0, 0, 350, 55, 350, 55], def: [120, 110, 20, 130, 75, 120, 50] },
  { file: 'archive-guardian-grounded', name: 'Archive Guardian', version: 'Grounded', skills: [550, 250, 240, 260, 250, 280, 0], off: [0, 0, 350, 55, 350, 55], def: [120, 90, 20, 130, 50, 115, 50] },
  { file: 'the-smorks', name: 'The Smorks', version: '', skills: [600, 1, 1, 220, 185, 185, 2], off: [0, 0, 185, 35, 250, 30], def: [220, 170, 160, 400, 80, 150, 80] },
  // Bork flat armour is "8-14 (Base), 0 (Stunned)" on the wiki; the generator stores 0 (see docs/DATA_SOURCES.md).
  { file: 'bork', name: 'Bork', version: '', skills: [1500, 200, 200, 300, 90, 200, 0], off: [100, 40, 0, 0, 0, 0], def: [140, 130, 20, 300, 80, 50, 5] },
  { file: 'dreadnoth', name: 'Dreadnoth the Jellied', version: '', skills: [2100, 280, 285, 125, 220, 250, 0], off: [185, 35, 0, 0, 180, 20], def: [15, 20, 5, 20, 100, 80, 80] },
  { file: 'jelly-dreadnoth', name: 'Jelly (Dreadnoth)', version: '', skills: [61, 200, 160, 100, 100, 1, 0], off: [0, 0, 0, 0, 0, 0], def: [4, 5, 0, 15, -45, 18, -50] },
  { file: 'xarth', name: 'Xarth', version: '', skills: [2600, 250, 225, 170, 350, 220, 0], off: [150, 225, 250, 350, 250, 0], def: [115, 105, 20, 205, 125, 230, 155] },
  { file: 'ocellus-p1', name: 'Ocellus', version: 'Phase 1', skills: [2500, 1, 1, 215, 350, 250, 0], off: [1, 1, 150, 0, 150, 0], def: [150, 95, 60, 100, 50, 135, 50] },
  // Phase 2 hp is not on the wiki (manual entry, hp set to the phase 3 pool; unverified).
  { file: 'ocellus-p2', name: 'Ocellus', version: 'Phase 2', skills: [5250, 1, 1, 250, 220, 1, 0], off: [0, 0, 0, 0, 0, 0], def: [150, 120, 10, 100, 100, 110, 80] },
  { file: 'ocellus-p3', name: 'Ocellus', version: 'Phase 3', skills: [5250, 325, 250, 250, 300, 300, 0], off: [150, 10, 350, 10, 0, 0], def: [150, 100, 30, 200, 250, 250, 250] },
];

const readSection = async (page, heading) => page.locator('p', { hasText: /^Skills$/ })
  .locator('xpath=../..')
  .locator('p', { hasText: new RegExp(`^${heading}$`) })
  .locator('xpath=..')
  .locator('div[title] div.font-mono')
  .allInnerTexts()
  .then((vals) => vals.map((v) => Number(v.trim())));

const main = async () => {
  fs.mkdirSync('docs/screenshots', { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1300 } });
  await page.goto(BASE, { waitUntil: 'load', timeout: 120000 });
  await page.getByPlaceholder('Search for monster...').waitFor({ timeout: 120000 });
  let failures = 0;

  for (const m of EXPECTED) {
    const input = page.getByPlaceholder('Search for monster...');
    await input.click();
    await input.fill(m.name);
    await page.waitForTimeout(800);
    const options = page.locator('[role="option"]', { hasText: m.name });
    const count = await options.count();
    let picked = false;
    for (let i = 0; i < count; i++) {
      const opt = options.nth(i);
      const label = (await opt.innerText()).trim();
      const versionText = (await opt.locator('.monster-version').count()) ? (await opt.locator('.monster-version').innerText()).replace(/^#\s*/, '').trim() : '';
      const labelName = label.replace(/#[\s\S]*$/, '').trim();
      if (labelName === m.name && versionText === m.version) {
        await opt.click();
        picked = true;
        break;
      }
    }
    if (!picked) {
      console.log(`FAIL ${m.name}#${m.version}: not found in monster box`);
      failures++;
      continue;
    }
    await page.waitForTimeout(500);
    const got = {
      skills: await readSection(page, 'Skills'),
      off: await readSection(page, 'Offensive'),
      def: await readSection(page, 'Defensive'),
    };
    const diffs = ['skills', 'off', 'def'].filter((k) => JSON.stringify(got[k]) !== JSON.stringify(m[k]));
    if (diffs.length) {
      failures++;
      console.log(`FAIL ${m.name}#${m.version}: ${diffs.map((k) => `${k} got ${JSON.stringify(got[k])} want ${JSON.stringify(m[k])}`).join('; ')}`);
    } else {
      console.log(`OK   ${m.name}#${m.version}`);
    }
    await page.screenshot({ path: `docs/screenshots/phase1-${m.file}.png`, fullPage: true });
  }

  await browser.close();
  process.exit(failures ? 1 : 0);
};

main();
