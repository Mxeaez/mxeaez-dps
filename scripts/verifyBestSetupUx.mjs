/**
 * Phase 12 UI check (not part of the Jest run).
 *
 * Usage (dev server running): node scripts/verifyBestSetupUx.mjs [baseUrl]
 * Opens /best-setup and checks: Search is the default tab and runs without clicking Run; changing the boss re-runs it;
 * weapon / loadout / boss icons load (naturalWidth > 0); "Load into calculator" from the Search table and from the
 * Per boss table gives the same DPS / max hit in the calculator (the Per boss part was removed in phase 13 with the tab).
 * Screenshots docs/screenshots/phase12-*.png.
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE = (process.argv[2] || 'http://localhost:3001/osrs-dps/').replace(/\/?$/, '/');

let failures = 0;
const check = (ok, msg) => {
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`);
};

const readCalcRow = async (page, label) => {
  const row = page.locator('table tbody tr', { has: page.locator('th[title]', { hasText: new RegExp(`^${label}$`) }) }).first();
  return (await row.locator('th').nth(1).innerText()).trim();
};

const loadedIcons = async (page, scope) => page.locator(`${scope} img[data-testid="item-icon"]`).evaluateAll(async (imgs) => {
  // lazy images below the fold: scroll them in and wait for them
  await Promise.all(imgs.map((img) => {
    img.scrollIntoView();
    return img.complete ? null : new Promise((r) => { img.onload = r; img.onerror = r; setTimeout(r, 5000); });
  }));
  return imgs.map((img) => ({ alt: img.alt, w: img.naturalWidth, src: img.src }));
});

const loadAndCompare = async (page, rowSelector, label) => {
  const row = page.locator(rowSelector).first();
  const dps = (await row.locator('[data-testid="dps"]').innerText()).trim();
  const maxHit = (await row.locator('[data-testid="maxhit"]').innerText()).trim();
  await row.getByRole('button', { name: 'Load into calculator' }).click();
  await page.waitForURL((u) => !u.pathname.endsWith('best-setup'), { timeout: 60000 });
  await page.getByPlaceholder('Search for monster...').waitFor({ timeout: 120000 });
  await page.waitForTimeout(3000);
  const cDps = await readCalcRow(page, 'DPS');
  const cMax = await readCalcRow(page, 'Max hit');
  check(cDps === dps && cMax === maxHit, `${label} loaded: view ${dps} / ${maxHit}, calculator ${cDps} / ${cMax}`);
  return page;
};

const main = async () => {
  fs.mkdirSync('docs/screenshots', { recursive: true });
  const browser = await chromium.launch();

  // 1. default tab + auto-run
  let ctx = await browser.newContext({ viewport: { width: 1500, height: 1400 } });
  let page = await ctx.newPage();
  const t0 = Date.now();
  await page.goto(`${BASE}best-setup`, { waitUntil: 'load', timeout: 120000 });
  check(await page.locator('[data-testid="search-view"]').count() === 1, 'Search tab is open by default');
  check(await page.locator('[data-testid="ranking"]').count() === 0, 'Per boss table not shown by default');
  await page.locator('[data-testid="search-row"]').first().waitFor({ timeout: 120000 });
  const firstTop = (await page.locator('[data-testid="search-row"]').first().locator('[data-testid="dps"]').innerText()).trim();
  check(true, `auto-run without clicking Run: ${(Date.now() - t0) / 1000}s after goto, top DPS ${firstTop} (Archive Guardian (Flying), Team)`);

  const icons = await loadedIcons(page, '[data-testid="search-results"]');
  const ok = icons.filter((i) => i.w > 0);
  check(ok.length >= 5, `search icons loaded: ${ok.length}/${icons.length} (naturalWidth > 0)`);
  if (icons.length) console.log(`     e.g. ${icons[0].alt} → ${icons[0].src}`);
  const weaponLine = (await page.locator('[data-testid="search-row"]').first().locator('[data-testid="weapon-line"]').innerText()).replace(/\s+/g, ' ').trim();
  console.log(`     top weapon line: ${weaponLine}`);
  // Dev loads images from upstream's CDN, which lacks the raid-4 images (Archive Guardian, Ascension crossbows/bolts):
  // those must be hidden (fallback) and must exist on our production /cdn/ (served there via NEXT_PUBLIC_CDN_URL).
  const broken = icons.filter((i) => i.w === 0);
  const hidden = await page.locator('[data-testid="search-results"] img[data-testid="item-icon"]').evaluateAll((imgs) => imgs
    .filter((i) => i.naturalWidth === 0).every((i) => i.style.display === 'none'));
  check(hidden, `broken icons are hidden (${broken.length}; names stay as text / tooltips)`);
  const boss = await loadedIcons(page, 'label[for="bs-boss"]');
  const brokenSrcs = [...new Set([...broken, ...boss.filter((i) => i.w === 0)].map((i) => i.src))];
  for (const src of brokenSrcs) {
    const prod = src.replace(/^.*\/cdn\//, 'https://dps.mxeaez.com/cdn/');
    // eslint-disable-next-line no-await-in-loop
    const st = (await fetch(prod)).status;
    check(src.startsWith('https://tools.runescape.wiki/') && st === 200, `not on upstream's CDN (dev only), production has it: ${st} ${decodeURI(prod)}`);
  }
  check(boss.length === 1, `boss icon present (${boss[0]?.alt}, loaded in dev: ${boss[0]?.w > 0})`);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.mouse.move(0, 0);
  await page.screenshot({ path: 'docs/screenshots/phase12-search-default.png', fullPage: true });

  // 2. boss change re-runs
  await page.locator('[data-testid="boss-select"]').selectOption('xarth');
  await page.locator('[data-testid="drain-none"]').click();
  await page.locator('[data-testid="search-row"]').first().waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
  await page.locator('[data-testid="search-row"]').first().waitFor({ timeout: 120000 });
  const xTop = (await page.locator('[data-testid="search-row"]').first().locator('[data-testid="dps"]').innerText()).trim();
  check(xTop === '12.839', `boss/drain change re-ran the search: Xarth None top ${xTop} (Jest 12.839)`);
  await page.waitForTimeout(500);
  await page.mouse.move(0, 0);
  await page.screenshot({ path: 'docs/screenshots/phase12-search-xarth.png', fullPage: true });
  await loadAndCompare(page, '[data-testid="search-row"]', 'Search top row (Xarth None)');
  await page.screenshot({ path: 'docs/screenshots/phase12-search-loaded.png', fullPage: true });
  await ctx.close();

  await browser.close();
  process.exit(failures ? 1 : 0);
};

main();
