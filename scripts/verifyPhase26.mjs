/**
 * Phase 26 UI check (not part of the Jest run): "Items I don't own".
 *
 * Usage (dev server running): node scripts/verifyPhase26.mjs [baseUrl]
 * - Starts with an empty list (localStorage key cleared). Search, Fractured Archive, Xarth, Team drains, all styles:
 *   top row Obligator 13.917, nothing marked.
 * - Adds Obligator (quick-add button) and Ascension crossbows (the equipment search box): the Obligator row is still at
 *   the top (no re-run) but greyed with a "uses: Obligator" badge.
 * - "Only items I own": the search re-runs without them; prints the new top row; no row is marked.
 * - Plan tab (FA defaults): "Excluded: Obligator, Ascension crossbows", no kit loadout uses them; prints the kit, free
 *   slots and total; "compare with max" → "Best possible with everything: 22:47.9 (yours: …)" (phase 27; was 23:30.4).
 * - Reload: the list and the toggle persist. Clear: list empty, Search top row back to Obligator 13.917, unmarked.
 * Screenshots docs/screenshots/phase26-*.png.
 */
import { chromium } from '@playwright/test';

const BASE = (process.argv[2] || 'http://localhost:3001/osrs-dps/').replace(/\/?$/, '/');
const KEY = 'mxeaez-dps:not-owned';

let failures = 0;
const check = (ok, msg) => {
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`);
};
const shot = async (page, name) => {
  await page.mouse.move(0, 0);
  await page.screenshot({ path: `docs/screenshots/phase26-${name}.png`, fullPage: true });
};
const near = (a, b) => Math.abs(a - b) < 0.0005;

const waitSearch = async (page) => {
  await page.waitForTimeout(800);
  await page.locator('[data-testid="search-progress"]').waitFor({ state: 'detached', timeout: 300000 });
  await page.locator('[data-testid="search-results"]').waitFor({ timeout: 300000 });
};
const waitPlan = async (page) => {
  await page.waitForTimeout(1000);
  await page.locator('[data-testid="plan-progress"]').waitFor({ state: 'detached', timeout: 600000 });
  await page.locator('[data-testid="plan-result"]').waitFor({ timeout: 600000 });
};
const readRows = (page) => page.locator('[data-testid="search-row"]').evaluateAll((rows) => rows.map((r) => ({
  dps: Number(r.querySelector('[data-testid="dps"]').textContent.trim()),
  weapon: r.querySelector('[data-testid="weapon-line"]').innerText.replace(/\s+/g, ' ').trim(),
  unowned: r.getAttribute('data-unowned'),
  greyed: r.className.includes('opacity-50'),
  badge: r.querySelector('[data-testid="unowned-badge"]')?.textContent ?? null,
})));
const chips = (page) => page.locator('[data-testid="not-owned-item"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-name')));

const main = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1400 } });
  await page.goto(`${BASE}best-setup`, { waitUntil: 'load', timeout: 120000 });
  await page.evaluate((k) => {
    localStorage.removeItem(k);
    localStorage.removeItem('mxeaez-dps:only-owned');
  }, KEY);
  await page.reload({ waitUntil: 'load', timeout: 120000 });
  await page.locator('[data-testid="assumptions"]').waitFor({ timeout: 120000 });
  check(await page.locator('[data-testid="not-owned-empty"]').isVisible(), '"Items I don\'t own" shown in the simple view, empty by default');

  // --- baseline
  await page.locator('[data-testid="boss-select"]').selectOption('xarth');
  await waitSearch(page);
  let rows = await readRows(page);
  check(near(rows[0].dps, 13.917) && rows[0].weapon.startsWith('Obligator') && rows.every((r) => !r.unowned), `baseline: Xarth top ${rows[0].weapon} ${rows[0].dps}, no row marked`);

  // --- add Obligator (quick add) + Ascension crossbows (search box)
  await page.locator('[data-testid="not-owned-quick"][data-name="Obligator"]').click();
  const input = page.locator('[data-testid="not-owned-search"] input');
  await input.click();
  await input.fill('Ascension crossbows');
  await page.waitForTimeout(800);
  await page.locator('[role="option"]', { hasText: 'Ascension crossbows' }).first().click();
  await page.waitForTimeout(800);
  check(JSON.stringify(await chips(page)) === JSON.stringify(['Obligator', 'Ascension crossbows']), `chips: ${(await chips(page)).join(', ')}`);
  check(await page.locator('[data-testid="search-progress"]').count() === 0, 'list change alone does not re-run the search');
  rows = await readRows(page);
  check(rows[0].weapon.startsWith('Obligator') && near(rows[0].dps, 13.917) && rows[0].greyed && rows[0].badge === 'uses: Obligator',
    `top row still ${rows[0].weapon} ${rows[0].dps}, greyed, badge "${rows[0].badge}"`);
  const marked = rows.filter((r) => r.unowned);
  console.log(`     marked rows: ${marked.map((r) => `${r.weapon} (${r.unowned})`).join('; ')}`);
  check(rows.filter((r) => !r.unowned).every((r) => !r.greyed && !r.badge), 'unmarked rows are not greyed');
  await shot(page, 'search-marked');

  // --- only items I own
  await page.locator('[data-testid="only-owned"]').check();
  await waitSearch(page);
  rows = await readRows(page);
  check(rows.length > 0 && rows.every((r) => !r.unowned && !/Obligator|Ascension crossbows/.test(r.weapon)), 'only owned: no row uses Obligator / Ascension crossbows');
  console.log(`     only-owned top: ${rows[0].weapon} ${rows[0].dps}; #2 ${rows[1]?.weapon} ${rows[1]?.dps}; #3 ${rows[2]?.weapon} ${rows[2]?.dps}`);
  const preset = await page.locator('[data-testid="search-best-preset"]').innerText();
  console.log(`     ${preset}`);
  await shot(page, 'search-only-owned');

  // --- Plan
  await page.locator('[data-testid="plan-tab"]').click();
  await waitPlan(page);
  const excluded = (await page.locator('[data-testid="plan-excluded"]').innerText()).trim();
  check(excluded.startsWith('Excluded: Obligator, Ascension crossbows'), `plan line "${excluded}"`);
  const kit = await page.locator('[data-testid="kit-loadout"]').evaluateAll((els) => els.map((e) => ({
    weapon: e.getAttribute('data-weapon'), group: e.getAttribute('data-group'), text: e.innerText.replace(/\s+/g, ' ').trim(),
  })));
  check(kit.every((k) => !/Obligator|Ascension crossbows/.test(k.weapon)), `kit without them: ${kit.map((k) => `${k.weapon} (${k.group})`).join(' / ')}`);
  kit.forEach((k) => console.log(`     ${k.text}`));
  const total = (await page.locator('[data-testid="plan-total"]').innerText()).trim();
  const free = await page.locator('[data-testid="free-slots"]').getAttribute('data-free');
  console.log(`     plan total ${total}, free slots ${free}`);
  await page.locator('[data-testid="plan-compare-max"]').click();
  await page.locator('[data-testid="plan-max-line"]').waitFor({ timeout: 600000 });
  const maxLine = (await page.locator('[data-testid="plan-max-line"]').innerText()).trim();
  check(maxLine === `Best possible with everything: 22:47.9 (yours: ${total})`, `"${maxLine}"`);
  await shot(page, 'plan-excluded');

  // --- reload: persisted
  await page.reload({ waitUntil: 'load', timeout: 120000 });
  await page.locator('[data-testid="assumptions"]').waitFor({ timeout: 120000 });
  await page.waitForTimeout(1000);
  check(JSON.stringify(await chips(page)) === JSON.stringify(['Obligator', 'Ascension crossbows']), `after reload: ${(await chips(page)).join(', ')}`);
  check(await page.locator('[data-testid="only-owned"]').isChecked(), '"Only items I own" persisted');
  await shot(page, 'reload');

  // --- clear
  await page.locator('[data-testid="not-owned-clear"]').click();
  await page.locator('[data-testid="only-owned"]').uncheck();
  check((await chips(page)).length === 0 && await page.evaluate((k) => localStorage.getItem(k), KEY) === null, 'cleared (storage key removed)');
  await page.locator('[data-testid="boss-select"]').selectOption('xarth');
  await waitSearch(page);
  rows = await readRows(page);
  check(near(rows[0].dps, 13.917) && rows[0].weapon.startsWith('Obligator') && rows.every((r) => !r.unowned && !r.greyed), `after clear: top ${rows[0].weapon} ${rows[0].dps}, nothing marked`);
  await shot(page, 'cleared');

  await browser.close();
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks OK');
  process.exitCode = failures ? 1 : 0;
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
