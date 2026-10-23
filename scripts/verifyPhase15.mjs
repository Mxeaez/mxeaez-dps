/**
 * Phase 15 UI check (not part of the Jest run): Ezekiel, Moia, Dagon'hai Elder + Monks.
 *
 * Usage (dev server running): node scripts/verifyPhase15.mjs [baseUrl]
 * Loadout 1: "Max Melee" preset + Inquisitor's mace, Super combat, Piety, Pummel (aggressive crush).
 * Loadout 2: "Max Mage" preset + Tumeken's shadow (charged, Accurate), Saturated heart, Augury.
 * Selects each monster, compares the stat panel with the wiki infobox values (fetched 2026-10-23) and the max hit /
 * DPS of both loadouts with src/tests/lib/fracturedArchive/EzekielMoiaDagonhai.test.ts; checks Moia's melee warning
 * and the Dagon'hai Phase dropdown (Shielded default, Unshielded changes no DPS).
 * Saves docs/screenshots/phase15-*.png.
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:3001/osrs-dps/';

// stat panel: [hp, atk, str, def, magic, ranged, flatArmour], [atk, str, magic, magicStr, ranged, rangedStr],
// [stab, slash, crush, magic, light, standard, heavy] -- wiki infobox values.
// values: [melee max, melee dps, mage max, mage dps] -- keep in sync with EzekielMoiaDagonhai.test.ts
const DAGONHAI_STATS = {
  skills: [640, 1, 1, 100, 290, 260, 0], off: [0, 1, 1, 0, 0, 180], def: [50, 50, 50, 100, 80, 80, 80],
};
const DAGONHAI_VALUES = [58, 10.024, 70, 8.486];
const EXPECTED = [
  {
    file: 'ezekiel',
    name: 'Ezekiel',
    version: '',
    skills: [3000, 250, 150, 130, 200, 80, 0],
    off: [0, 0, 250, 0, 0, 0],
    def: [150, 90, 35, 200, 445, 370, 320],
    values: [58, 9.802, 70, 8.087],
  },
  {
    file: 'moia',
    name: 'Moia',
    version: '',
    skills: [785, 1, 1, 195, 350, 200, 0],
    off: [0, 0, 300, 0, 350, 35],
    def: [20, 110, 15, 30, 60, 120, 140],
    values: [null, 0, 70, 9.479],
    warning: 'Melee can\'t reach this monster: use ranged or magic.',
  },
  {
    file: 'dagonhai-elder', name: 'Dagon\'hai Elder', version: '', ...DAGONHAI_STATS, values: DAGONHAI_VALUES, phase: 'Shielded (shield gauge)',
  },
  {
    file: 'dagonhai-monk-staff', name: 'Dagon\'hai Monk', version: 'Staff', ...DAGONHAI_STATS, values: DAGONHAI_VALUES, phase: 'Shielded (shield gauge)',
  },
  {
    file: 'dagonhai-monk-book', name: 'Dagon\'hai Monk', version: 'Book', ...DAGONHAI_STATS, values: DAGONHAI_VALUES, phase: 'Shielded (shield gauge)',
  },
];
const UNSHIELDED = 'Unshielded (after the cauldron explodes, 7 hp)';

const pickCombobox = async (page, placeholder, text, option = text) => {
  const input = page.getByPlaceholder(placeholder);
  await input.click();
  await input.fill(text);
  await page.waitForTimeout(800);
  await page.locator('[role="option"]', { hasText: option }).first().click();
  await page.waitForTimeout(500);
};

const pickMonster = async (page, name, version) => {
  const input = page.getByPlaceholder('Search for monster...');
  await input.click();
  await input.fill(name);
  await page.waitForTimeout(800);
  const options = page.locator('[role="option"]', { hasText: name });
  const count = await options.count();
  for (let i = 0; i < count; i++) {
    const opt = options.nth(i);
    const label = (await opt.innerText()).trim();
    const versionText = (await opt.locator('.monster-version').count())
      ? (await opt.locator('.monster-version').innerText()).replace(/^#\s*/, '').trim() : '';
    if (label.replace(/#[\s\S]*$/, '').trim() === name && versionText === version) {
      await opt.click();
      await page.waitForTimeout(800);
      return true;
    }
  }
  return false;
};

const readSection = async (page, heading) => page.locator('p', { hasText: /^Skills$/ })
  .locator('xpath=../..')
  .locator('p', { hasText: new RegExp(`^${heading}$`) })
  .locator('xpath=..')
  .locator('div[title] div.font-mono')
  .allInnerTexts()
  .then((vals) => vals.map((v) => Number(v.trim())));

// results table: column 1 = loadout 1, column 2 = loadout 2
const readRow = async (page, label, col) => {
  const row = page.locator('table tbody tr', { has: page.locator('th[title]', { hasText: new RegExp(`^${label}$`) }) }).first();
  return (await row.locator('th').nth(col).innerText()).trim();
};

const tab = (page, name) => page.locator(`button[data-tooltip-content="${name}"]`).first();
const setBoosts = async (page, potion, prayer, styleName) => {
  await tab(page, 'Skills').click();
  await page.locator('button', { hasText: new RegExp(`^${potion}$`) }).first().click();
  await tab(page, 'Prayer').click();
  await page.locator(`button[data-tooltip-content="${prayer}"]`).first().click();
  if (styleName) {
    await tab(page, 'Combat').click();
    await page.locator('button', { hasText: new RegExp(`^${styleName}`) }).first().click();
  }
  await tab(page, 'Equipment').click();
  await page.waitForTimeout(500);
};

const applyPreset = async (page, name) => {
  await page.getByText('Presets', { exact: true }).first().click();
  await page.waitForTimeout(500);
  await page.locator('[role="option"]', { hasText: new RegExp(`^${name}$`) }).first().click();
  await page.waitForTimeout(800);
};

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
  const page = await browser.newPage({ viewport: { width: 1400, height: 1500 } });
  await page.goto(BASE, { waitUntil: 'load', timeout: 120000 });
  await page.getByPlaceholder('Search for monster...').waitFor({ timeout: 120000 });

  // loadout 1: melee
  await applyPreset(page, 'Max Melee');
  await pickCombobox(page, 'Search for equipment...', 'Inquisitor\'s mace', /^Inquisitor's mace/);
  await setBoosts(page, 'Super combat', 'Piety', 'Pummel');

  // loadout 2: magic (cloned from loadout 1, then re-equipped; Super combat doesn't affect magic)
  await page.locator('button[data-tooltip-content="Add new loadout"]').first().click();
  await page.waitForTimeout(500);
  await applyPreset(page, 'Max Mage');
  await pickCombobox(page, 'Search for equipment...', 'Tumeken\'s shadow', /^Tumeken's shadow.*Charged/);
  await setBoosts(page, 'Saturated heart', 'Augury', 'Accurate');

  let failures = 0;
  const check = (ok, msg) => {
    if (!ok) failures++;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`);
  };
  const close = (shown, expected) => Math.abs(Number(shown) - expected) < 0.0006;
  const checkRows = async (name, [meleeMax, meleeDps, mageMax, mageDps]) => {
    await page.waitForTimeout(1200);
    const shown = [
      await readRow(page, 'Max hit', 1), await readRow(page, 'DPS', 1),
      await readRow(page, 'Max hit', 2), await readRow(page, 'DPS', 2),
    ];
    const ok = (meleeMax === null || Number(shown[0]) === meleeMax) && close(shown[1], meleeDps)
      && Number(shown[2]) === mageMax && close(shown[3], mageDps);
    check(ok, `${name}: melee ${shown[0]} / ${shown[1]}, mage ${shown[2]} / ${shown[3]} `
      + `(expected ${meleeMax ?? '-'} / ${meleeDps}, ${mageMax} / ${mageDps})`);
  };

  for (const exp of EXPECTED) {
    const label = `${exp.name}${exp.version ? `#${exp.version}` : ''}`;
    if (!await pickMonster(page, exp.name, exp.version)) {
      check(false, `${label}: not found in the monster box`);
      continue;
    }
    const got = {
      skills: await readSection(page, 'Skills'),
      off: await readSection(page, 'Offensive'),
      def: await readSection(page, 'Defensive'),
    };
    const diffs = ['skills', 'off', 'def'].filter((k) => JSON.stringify(got[k]) !== JSON.stringify(exp[k]));
    check(!diffs.length, `${label}: stat panel = wiki infobox${diffs.length ? ` (${diffs.map((k) => `${k} got ${JSON.stringify(got[k])}`).join('; ')})` : ''}`);
    if (exp.phase) {
      check(await phaseToggle(page, exp.phase).count() > 0, `${label}: default phase is "${exp.phase}"`);
    }
    await checkRows(label, exp.values);
    if (exp.warning) {
      await page.locator('button', { hasText: /^1$/ }).first().click();
      await page.waitForTimeout(800);
      // shown as the warning icon on the weapon slot (tooltip text = the calc issue)
      const icon = page.locator(`[data-tooltip-id="tooltip-warning"][data-tooltip-content="${exp.warning}"]`).first();
      const shown = await icon.count() > 0;
      check(shown, `${label}: melee loadout's weapon slot warns "${exp.warning}"`);
      if (shown) {
        await icon.hover();
        await page.waitForTimeout(500);
      }
    }
    await page.screenshot({ path: `docs/screenshots/phase15-${exp.file}.png`, fullPage: true });
  }

  // Dagon'hai: Unshielded changes hp only (no DPS change)
  await pickMonster(page, 'Dagon\'hai Elder', '');
  await selectPhase(page, 'Shielded (shield gauge)', UNSHIELDED);
  check(await phaseToggle(page, UNSHIELDED).count() > 0, 'Dagon\'hai Elder: "Unshielded" selected');
  await checkRows('Dagon\'hai Elder / Unshielded', DAGONHAI_VALUES);
  await page.screenshot({ path: 'docs/screenshots/phase15-dagonhai-unshielded.png', fullPage: true });

  await browser.close();
  process.exit(failures ? 1 : 0);
};

main();
