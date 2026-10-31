/**
 * Phase 6 UI check (not part of the Jest run).
 *
 * Usage (dev server running): node scripts/verifyOcellus.mjs [baseUrl]
 * Loadout 1: "Max Melee" preset + Emberlight, Super combat, Piety, Slash (aggressive slash).
 * Loadout 2: "Max Mage" preset + Tumeken's shadow (charged, Accurate), Saturated heart, Augury.
 * Selects Ocellus phase 1, 2 and 3, reads max hit / DPS of both loadouts (and the demonbane factor), and cycles some
 * Phase dropdown options. Values are compared with src/tests/lib/fracturedArchive/Ocellus.test.ts.
 * Saves docs/screenshots/phase6-ocellus-p1.png, -p2.png, -p3.png and -p3-void.png.
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:3001/osrs-dps/';

// keep in sync with src/tests/lib/fracturedArchive/Ocellus.test.ts ([melee max, melee dps, mage max, mage dps])
const MAGE = [70];
const EXPECTED = [
  {
    version: 'Phase 1', file: 'p1', phase: 'At a corner', factor: '70 * 80 / 100 = 56', values: [59, 7.875, ...MAGE, 7.847],
  },
  {
    version: 'Phase 2', file: 'p2', phase: null, factor: '', values: [38, 2.640, ...MAGE, 9.232],
  },
  {
    version: 'Phase 3', file: 'p3', phase: 'Quadrants 1-3', factor: '70 * 80 / 100 = 56', values: [59, 7.023, ...MAGE, 6.373],
  },
];
// extra phase options: [version, phase, melee dps, mage max, mage dps, screenshot]
const PHASE_OPTIONS = [
  ['Phase 1', 'Walking to a corner (Protect from Melee)', 0, 70, 7.847, null],
  // phase 40d: every attack 2-tick in the explosions (was 3.140 at the Shadow's 5 ticks)
  ['Phase 3', 'Last quadrant: Deflect Melee + void explosions', 0, 35, 7.851, 'p3-void'],
  ['Phase 3', 'Last quadrant: Deflect Ranged', 7.023, 70, 6.373, null],
  ['Phase 3', 'Last quadrant: Soul Split', 7.023, 70, 6.373, null],
];

const pickCombobox = async (page, placeholder, text, option = text) => {
  const input = page.getByPlaceholder(placeholder);
  await input.click();
  await input.fill(text);
  await page.waitForTimeout(800);
  await page.locator('[role="option"]', { hasText: option }).first().click();
  await page.waitForTimeout(500);
};

// results table: column 1 = loadout 1, column 2 = loadout 2
const readRow = async (page, label, col) => {
  const row = page.locator('table tbody tr', { has: page.locator('th[title]', { hasText: new RegExp(`^${label}$`) }) }).first();
  return (await row.locator('th').nth(col).innerText()).trim();
};

const readDetail = async (page, label) => {
  const row = page.locator('tr', { has: page.locator('td', { hasText: new RegExp(`^${label}$`) }) }).first();
  if (await row.count() === 0) return '';
  return (await row.locator('td').nth(1).innerText()).trim();
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
  await pickCombobox(page, 'Search for equipment...', 'Emberlight', /^Emberlight/);
  await setBoosts(page, 'Super combat', 'Piety', 'Slash');

  // loadout 2: magic (cloned from loadout 1, then re-equipped; Super combat doesn't affect magic)
  await page.locator('button[data-tooltip-content="Add new loadout"]').first().click();
  await page.waitForTimeout(500);
  await applyPreset(page, 'Max Mage');
  await pickCombobox(page, 'Search for equipment...', "Tumeken's shadow", /^Tumeken's shadow.*Charged/);
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

  const details = page.getByText('[Debug] Calc Details').first();
  let detailsOpen = false;

  for (const exp of EXPECTED) {
    await pickCombobox(page, 'Search for monster...', 'Ocellus', new RegExp(`^Ocellus.*${exp.version}`));
    await page.waitForTimeout(800);
    if (exp.phase) {
      check(await phaseToggle(page, exp.phase).count() > 0, `${exp.version}: default phase is "${exp.phase}"`);
    }
    await checkRows(exp.version, exp.values);
    // demonbane factor of the selected loadout (2 = shadow has none), so check it on loadout 1
    await page.locator('button', { hasText: /^1$/ }).first().click();
    await page.waitForTimeout(800);
    // the first click on the collapsed panel is sometimes swallowed by a re-render; retry until rows show
    for (let i = 0; i < 3 && !detailsOpen; i++) {
      await details.scrollIntoViewIfNeeded();
      await details.click();
      await page.waitForTimeout(1500);
      detailsOpen = await page.locator('td', { hasText: /^Max hit$/ }).count() > 0;
    }
    const factor = await readDetail(page, 'Demonbane factor');
    check(factor === exp.factor, `${exp.version}: demonbane factor "${factor}" (expected "${exp.factor}")`);
    const bladeHint = await page.getByText('TTK n/a', { exact: true }).count();
    check((bladeHint > 0) === (exp.version === 'Phase 2'), `${exp.version}: "TTK n/a" hint shown = ${bladeHint > 0}`);
    await page.screenshot({ path: `docs/screenshots/phase6-ocellus-${exp.file}.png`, fullPage: true });
  }

  let selected = null;
  let current = null;
  for (const [version, phase, meleeDps, mageMax, mageDps, file] of PHASE_OPTIONS) {
    if (version !== selected) {
      await pickCombobox(page, 'Search for monster...', 'Ocellus', new RegExp(`^Ocellus.*${version}`));
      selected = version;
      current = EXPECTED.find((e) => e.version === version).phase;
    }
    await selectPhase(page, current, phase);
    current = phase;
    await checkRows(`${version} / ${phase}`, [null, meleeDps, mageMax, mageDps]);
    if (file) {
      await page.screenshot({ path: `docs/screenshots/phase6-ocellus-${file}.png`, fullPage: true });
    }
  }

  await browser.close();
  process.exit(failures ? 1 : 0);
};

main();
