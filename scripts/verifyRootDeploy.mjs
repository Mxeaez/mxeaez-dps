/**
 * Phase 10 deploy check (not part of the Jest run).
 *
 * Usage: build (`yarn build`), serve out/ at the site root the way Cloudflare Pages does
 * (`npx wrangler pages dev out --port 8788`), then: node scripts/verifyRootDeploy.mjs [baseUrl] [--screenshots <dir>]
 * Loads /, selects Archive Guardian, equips a Twisted bow + dragon arrows and checks its image comes from our own /cdn/ with HTTP 200 and a DPS renders;
 * checks the Share button shows the "not available" notice; opens /best-setup (clean URL), runs the full gear
 * search for Xarth and waits for results (search worker loads from the root). Screenshots phase10-root-*.png go to
 * the OS temp dir unless --screenshots is given (pass `--screenshots docs/screenshots` to refresh the committed ones).
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const shotsIx = args.indexOf('--screenshots');
const SHOTS = shotsIx >= 0 ? args.splice(shotsIx, 2)[1] : path.join(os.tmpdir(), 'mxeaez-dps-verify');
const BASE = (args[0] || 'http://127.0.0.1:8788/').replace(/\/?$/, '/');
const shot = (name) => path.join(SHOTS, `phase10-root-${name}.png`);

let failures = 0;
const check = (ok, msg) => {
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`);
};

const readRow = async (page, label) => {
  const row = page.locator('table tbody tr', { has: page.locator('th[title]', { hasText: new RegExp(`^${label}$`) }) }).first();
  return (await row.locator('th').nth(1).innerText()).trim();
};

const main = async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  console.log(`screenshots -> ${SHOTS}`);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1400 } });
  const failed = [];
  const images = new Map();
  page.on('response', (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith('/cdn/')) images.set(decodeURIComponent(u.pathname), r.status());
    if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
  });
  page.on('requestfailed', (r) => failed.push(`failed ${r.url()}`));

  await page.goto(BASE, { waitUntil: 'load', timeout: 120000 });
  check(/mxeaez DPS/.test(await page.title()), `title: ${await page.title()}`);
  await page.getByPlaceholder('Search for monster...').waitFor({ timeout: 120000 });

  const input = page.getByPlaceholder('Search for monster...');
  await input.click();
  await input.fill('Archive Guardian');
  await page.waitForTimeout(800);
  await page.locator('[role="option"]', { hasText: 'Flying' }).first().click();
  await page.waitForTimeout(2500);

  const eq = page.getByPlaceholder('Search for equipment...');
  for (const item of ['Twisted bow', 'Dragon arrow']) {
    await eq.click();
    await eq.fill(item);
    await page.waitForTimeout(800);
    await page.locator('[role="option"]', { hasText: item }).first().click();
    await page.waitForTimeout(1000);
  }
  await page.waitForTimeout(1500);

  const agImg = '/cdn/monsters/Archive Guardian.png';
  check(images.get(agImg) === 200, `${agImg} -> HTTP ${images.get(agImg)}`);
  const imgOk = await page.locator('img[src*="Archive"]').first().evaluate((i) => i.complete && i.naturalWidth > 0);
  check(imgOk, 'Archive Guardian image rendered (naturalWidth > 0)');
  const equip = [...images.entries()].filter(([p]) => p.startsWith('/cdn/equipment/'));
  check(equip.length > 0 && equip.every(([, s]) => s === 200), `equipment images from /cdn/equipment: ${equip.length}, all 200`);
  const dps = await readRow(page, 'DPS');
  check(/^\d+\.\d+$/.test(dps) && parseFloat(dps) > 0, `DPS renders: ${dps}`);
  check(await page.getByTestId('fork-credit').isVisible(), 'footer fork credit visible');
  await page.mouse.move(0, 0);
  await page.screenshot({ path: shot('calculator'), fullPage: true });

  await page.getByRole('button', { name: 'Share loadout' }).click();
  await page.waitForTimeout(500);
  check(await page.getByText('Share links are not available on this site yet').isVisible(), 'Share modal shows notice');
  await page.screenshot({ path: shot('share') });
  await page.keyboard.press('Escape');

  const res = await page.goto(`${BASE}best-setup`, { waitUntil: 'load', timeout: 120000 });
  check(res.status() === 200 && new URL(page.url()).pathname.replace(/\/$/, '') === '/best-setup', `/best-setup -> ${res.status()} at ${page.url()}`);
  // Search is the default tab and runs automatically (phase 12); changing boss/drains re-runs it
  await page.locator('[data-testid="search-row"]').first().waitFor({ timeout: 120000 });
  const t0 = Date.now();
  await page.locator('[data-testid="boss-select"]').selectOption('xarth');
  await page.locator('[data-testid="drain-none"]').click();
  await page.locator('[data-testid="search-row"]').first().waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
  await page.locator('[data-testid="search-row"]').first().waitFor({ timeout: 120000 });
  const top = (await page.locator('[data-testid="search-row"]').first().locator('[data-testid="dps"]').innerText()).trim();
  check(true, `Xarth search done in ${((Date.now() - t0) / 1000).toFixed(1)}s, top DPS ${top}`);
  await page.mouse.move(0, 0);
  await page.screenshot({ path: shot('best-setup'), fullPage: true });

  const bad = failed.filter((f) => !f.includes('localhost:37'));
  check(bad.length === 0, `no failed requests${bad.length ? `: ${bad.join(', ')}` : ''}`);
  await browser.close();
  process.exit(failures ? 1 : 0);
};

main();
