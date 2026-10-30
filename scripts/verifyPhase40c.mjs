/**
 * Phase 40c / 40c-2 UI check (not part of the Jest run): "Ranged prayer" (Rigour / Deadeye / Eagle Eye) and "Magic
 * prayer" (Augury / Mystic Vigour / Mystic Might) in the FA Assumptions box. Rigour / Augury by default (footer
 * "Prayers: Piety / Rigour / Augury"); Deadeye / Mystic Might change the footer and the Summary rows, and stay chosen
 * after a reload (saved settings).
 *
 * Usage (dev server running): node scripts/verifyPhase40c.mjs [baseUrl]
 * Screenshot docs/screenshots/phase40c-prayers.png.
 */
import { chromium } from '@playwright/test';

const BASE = (process.argv[2] || 'http://localhost:3001/osrs-dps/').replace(/\/?$/, '/');
// src/enums/Prayer.ts
const RIGOUR = '14';
const AUGURY = '15';
const DEADEYE = '19';
const MYSTIC_MIGHT = '11';
let failures = 0;
const check = (ok, msg) => {
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`);
};

const footer = async (page) => ((await page.getByText(/Prayers: /).first().textContent()) ?? '').replace(/.*(Prayers: [^.]*)\..*/, '$1');
const summaryText = async (page) => {
  await page.locator('[data-testid="summary-row"]').first().waitFor({ timeout: 300000 });
  await page.waitForTimeout(3000); // the assumption debounce, then the searches start
  await page.locator('[data-testid="summary-progress"]').waitFor({ state: 'detached', timeout: 900000 });
  return (await page.locator('[data-testid="summary-row"]').allTextContents()).join(' | ');
};
const pick = async (page, g, value) => {
  await page.locator(`[data-testid="bs-prayer-${g}"]`).click();
  await page.locator(`[data-testid="bs-prayer-${g}-option"][data-value="${value}"]`).click();
};
const chosen = (page, g) => page.locator(`[data-testid="bs-prayer-${g}"]`).getAttribute('data-value');

const main = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
  await page.goto(`${BASE}best-setup`, { waitUntil: 'load', timeout: 120000 });
  await page.evaluate(() => { localStorage.removeItem('mxeaez-dps:not-owned'); localStorage.removeItem('mxeaez-dps:settings:v1'); });
  await page.reload({ waitUntil: 'load', timeout: 120000 });
  await page.locator('[data-testid="raid-tab-fractured-archive"]').click();

  check(await chosen(page, 'ranged') === RIGOUR, 'Ranged prayer: Rigour by default');
  check(await chosen(page, 'magic') === AUGURY, 'Magic prayer: Augury by default');
  await page.locator('[data-testid="bs-prayer-ranged"]').click();
  const options = await page.locator('[data-testid="bs-prayer-ranged-option"]').allInnerTexts();
  check(options.map((o) => o.trim()).join(',') === 'Rigour,Deadeye,Eagle Eye', `ranged options: ${options.join(', ')}`);
  await page.locator('[data-testid="bs-prayer-ranged"]').click();
  check((await footer(page)) === 'Prayers: Piety / Rigour / Augury', await footer(page));

  await page.locator('[data-testid="summary-tab"]').click();
  const before = await summaryText(page);

  await pick(page, 'ranged', DEADEYE);
  await pick(page, 'magic', MYSTIC_MIGHT);
  check((await footer(page)) === 'Prayers: Piety / Deadeye / Mystic Might', await footer(page));
  const after = await summaryText(page);
  check(after !== before, 'Summary rows change with Deadeye / Mystic Might');
  await page.locator('[data-testid="assumptions"]').screenshot({ path: 'docs/screenshots/phase40c-prayers.png' });

  await page.waitForTimeout(1500);
  await page.reload({ waitUntil: 'load', timeout: 120000 });
  await page.locator('[data-testid="raid-tab-fractured-archive"]').click();
  check(await chosen(page, 'ranged') === DEADEYE, 'Deadeye after reload');
  check(await chosen(page, 'magic') === MYSTIC_MIGHT, 'Mystic Might after reload');

  await page.evaluate(() => localStorage.removeItem('mxeaez-dps:settings:v1'));
  await browser.close();
  console.log(failures ? `${failures} FAILED` : 'all OK');
  process.exit(failures ? 1 : 0);
};

main().catch((e) => { console.error(e); process.exit(1); });
