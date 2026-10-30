/**
 * Phase 39b UI check (not part of the Jest run): "Import from RuneLite" on the Items I don't own box. Synthetic
 * bank.json / character.json are built in memory (no real export is read). Picks both files, checks the confirm panel,
 * unticks one item, applies, checks the not-owned list, the saved levels, that Search runs with the lower levels
 * (a lower top DPS than with 99s), and that everything is restored after a reload.
 *
 * Usage (dev server running): node scripts/verifyPhase39b.mjs [baseUrl]
 * Screenshot docs/screenshots/phase39b-import.png.
 */
import { chromium } from '@playwright/test';

const BASE = (process.argv[2] || 'http://localhost:3001/osrs-dps/').replace(/\/?$/, '/');
let failures = 0;
const check = (ok, msg) => {
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`);
};

const bank = {
  exported_at: '2026-10-27T10:00:00-07:00',
  kind: 'bank',
  item_count: 4,
  items: [
    { slot: 0, id: 20997, quantity: 1, name: 'Twisted bow' },
    { slot: 1, id: 22325, quantity: 1, name: 'Scythe of vitur (uncharged)' },
    { slot: 2, id: 28254, quantity: 1, name: 'Sanguine torva full helm' },
    { slot: 3, id: 892, quantity: 5000, name: 'Rune arrow' },
  ],
};
const stat = (n) => ({ real_level: n, boosted_level: n + 10, experience: 1 });
const character = {
  account_name: 'Synthetic Account',
  exported_at: '2026-10-27T10:00:01-07:00',
  stats: {
    Attack: stat(70), Strength: stat(70), Defence: stat(70), Hitpoints: stat(80), Ranged: stat(75), Magic: stat(75), Prayer: stat(70), Mining: stat(60), Herblore: stat(60),
  },
};
const file = (name, obj) => ({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(obj)) });

const topDps = async (page) => {
  await page.locator('[data-testid="search-row"]').first().waitFor({ timeout: 180000 });
  await page.waitForTimeout(1500);
  return Number((await page.locator('[data-testid="search-row"] [data-testid="dps"]').first().textContent()).replace(/[^0-9.]/g, ''));
};

const main = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
  await page.goto(`${BASE}best-setup`, { waitUntil: 'load', timeout: 120000 });
  await page.evaluate(() => { ['mxeaez-dps:not-owned', 'mxeaez-dps:settings:v1', 'mxeaez-dps:levels', 'mxeaez-dps:bank-import'].forEach((k) => localStorage.removeItem(k)); });
  await page.reload({ waitUntil: 'load', timeout: 120000 });
  await page.locator('[data-testid="raid-tab-fractured-archive"]').click();
  await page.locator('[data-testid="not-owned"]').waitFor({ timeout: 60000 });
  const dps99 = await topDps(page);

  // network: nothing may be uploaded
  const posts = [];
  page.on('request', (r) => { if (r.method() !== 'GET') posts.push(r.url()); });

  await page.locator('[data-testid="import-files"]').setInputFiles([file('bank.json', bank), file('character.json', character)]);
  await page.locator('[data-testid="import-confirm"]').waitFor({ timeout: 30000 });
  const summary = await page.locator('[data-testid="import-bank-summary"]').textContent();
  check(/^Matched \d+ pool items; \d+ not found$/.test(summary), `confirm summary: ${summary}`);
  const missing = await page.locator('[data-testid="import-missing"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-name')));
  check(!missing.includes('Twisted bow') && !missing.includes('Scythe of Vitur') && !missing.includes('Torva full helm'), 'owned / uncharged / ornament items are matched');
  check(missing.includes('Obligator') && missing.includes('Zorya\'s tome'), 'missing gear is listed');
  check(!missing.some((n) => /arrow|bolt|dart/i.test(n)), 'no ammo is judged');
  check(/Attack 70/.test(await page.locator('[data-testid="import-levels"]').textContent()), 'levels preview shown');
  check(!(await page.content()).includes('Synthetic Account'), 'account name is not shown');

  await page.locator('[data-testid="import-missing"][data-name="Obligator"]').uncheck();
  await page.screenshot({ path: 'docs/screenshots/phase39b-import.png', fullPage: false });
  await page.locator('[data-testid="import-apply"]').click();
  await page.locator('[data-testid="not-owned-item"]').first().waitFor({ timeout: 30000 });
  const listed = await page.locator('[data-testid="not-owned-item"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-name')));
  check(listed.length === missing.length - 1 && !listed.includes('Obligator') && listed.includes("Zorya's tome"), `not-owned list = ticked items (${listed.length})`);
  check(/bank imported \d+ \w+ \(exported 27 Oct\)/.test(await page.locator('[data-testid="import-info"]').textContent()), 'info line shows the dates');
  check(/levels imported/.test(await page.locator('[data-testid="import-levels-info"]').textContent()), 'levels info shown');

  const stored = await page.evaluate(() => Object.fromEntries(['mxeaez-dps:not-owned', 'mxeaez-dps:levels', 'mxeaez-dps:bank-import'].map((k) => [k, localStorage.getItem(k)])));
  check(!Object.values(stored).some((v) => v && v.includes('Synthetic')), 'account name is not stored');
  check(JSON.parse(stored['mxeaez-dps:levels']).levels.atk === 70, 'levels saved');
  check(posts.length === 0, `nothing uploaded (${posts.length} non-GET requests)`);

  const dpsLow = await topDps(page);
  check(dpsLow < dps99, `Search uses the imported levels: top DPS ${dpsLow} < ${dps99} (99s)`);

  await page.reload({ waitUntil: 'load', timeout: 120000 });
  await page.locator('[data-testid="not-owned"]').waitFor({ timeout: 60000 });
  check(await page.locator('[data-testid="not-owned-item"]').count() === listed.length, 'not-owned list restored after reload');
  check(/levels imported/.test(await page.locator('[data-testid="import-levels-info"]').textContent()), 'levels info restored');
  check(Math.abs(await topDps(page) - dpsLow) < 0.001, 'same DPS after reload');

  // bad file, cancel, and back to 99s
  await page.locator('[data-testid="import-files"]').setInputFiles([file('x.json', { hello: 1 })]);
  check(/not a bank.json or character.json/.test(await page.locator('[data-testid="import-error"]').textContent()), 'a wrong file gives an error');
  await page.locator('[data-testid="import-cancel"]').click();
  await page.locator('[data-testid="import-levels-clear"]').click();
  check(Math.abs(await topDps(page) - dps99) < 0.001, 'use 99s restores the original DPS');

  await browser.close();
  console.log(failures ? `${failures} FAILED` : 'ALL OK');
  process.exit(failures ? 1 : 0);
};
main().catch((e) => { console.error(e); process.exit(1); });
