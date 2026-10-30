/**
 * Phase 40c UI check (not part of the Jest run): "Rigour unlocked" / "Augury unlocked" in the FA Assumptions box.
 * Both ticked by default (footer "Prayers: Piety / Rigour / Augury"); unticked, the footer reads Eagle Eye / Mystic
 * Might, the Summary rows change, and the boxes stay unticked after a reload (saved settings).
 *
 * Usage (dev server running): node scripts/verifyPhase40c.mjs [baseUrl]
 * Screenshot docs/screenshots/phase40c-prayers.png.
 */
import { chromium } from '@playwright/test';

const BASE = (process.argv[2] || 'http://localhost:3001/osrs-dps/').replace(/\/?$/, '/');
let failures = 0;
const check = (ok, msg) => {
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`);
};

const footer = async (page) => (await page.getByText(/Prayers: /).first().textContent()) ?? '';
const summaryText = async (page) => {
  await page.locator('[data-testid="summary-row"]').first().waitFor({ timeout: 300000 });
  await page.waitForTimeout(3000); // the assumption debounce, then the searches start
  await page.locator('[data-testid="summary-progress"]').waitFor({ state: 'detached', timeout: 900000 });
  return (await page.locator('[data-testid="summary-row"]').allTextContents()).join(' | ');
};

const main = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
  await page.goto(`${BASE}best-setup`, { waitUntil: 'load', timeout: 120000 });
  await page.evaluate(() => { localStorage.removeItem('mxeaez-dps:not-owned'); localStorage.removeItem('mxeaez-dps:settings:v1'); });
  await page.reload({ waitUntil: 'load', timeout: 120000 });
  await page.locator('[data-testid="raid-tab-fractured-archive"]').click();

  const rigour = page.locator('#bs-rigour');
  const augury = page.locator('#bs-augury');
  check(await rigour.isChecked(), 'Rigour unlocked ticked by default');
  check(await augury.isChecked(), 'Augury unlocked ticked by default');
  check((await footer(page)).includes('Prayers: Piety / Rigour / Augury'), `footer: ${await footer(page)}`);

  await page.locator('[data-testid="summary-tab"]').click();
  const before = await summaryText(page);

  await rigour.uncheck();
  await augury.uncheck();
  check((await footer(page)).includes('Prayers: Piety / Eagle Eye / Mystic Might'), `footer unticked: ${await footer(page)}`);
  const after = await summaryText(page);
  check(after !== before, 'Summary rows change with both unticked');
  await page.locator('[data-testid="assumptions"]').screenshot({ path: 'docs/screenshots/phase40c-prayers.png' });

  await page.waitForTimeout(1500);
  await page.reload({ waitUntil: 'load', timeout: 120000 });
  await page.locator('[data-testid="raid-tab-fractured-archive"]').click();
  check(!(await page.locator('#bs-rigour').isChecked()), 'Rigour unticked after reload');
  check(!(await page.locator('#bs-augury').isChecked()), 'Augury unticked after reload');

  await page.evaluate(() => localStorage.removeItem('mxeaez-dps:settings:v1'));
  await browser.close();
  console.log(failures ? `${failures} FAILED` : 'all OK');
  process.exit(failures ? 1 : 0);
};

main().catch((e) => { console.error(e); process.exit(1); });
