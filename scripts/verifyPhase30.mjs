/**
 * Phase 30 UI check (not part of the Jest run): Plan tab polish (no maths change).
 *
 * Usage (dev server running): node scripts/verifyPhase30.mjs [baseUrl]
 * - Comfort supplies: the brew / restore / food icons are the wiki's inventory images (src/public/img/supplies, bundled
 *   by Next like the Ranging / Super combat potions, so they load in dev without a CDN deploy); "Other" keeps the
 *   generic flask. Checks each <img> src path, that it loaded (naturalWidth > 0) and that the file is in the repo.
 * - Ring policy: a "Rings" dropdown in the supplies row (not under Advanced), default Camp one ring, its one-line
 *   summary next to it; changing it changes the summary.
 * - "Items I always bring": empty in every raid (phase 31: the FA / ToB heart is magic's kit potion).
 * - Search drain box (Team, Advanced 2 / 2 / 1, before any plan): "needed" reaches the confidence threshold when the
 *   team's specs do — AG Flying "needs 4 landed hits · 4 specs (2 carriers), 8 swings · 98%", Xarth Tonalztics "… 2
 *   specs (1 carrier), 4 swings · 97%", Bork Tonalztics "… 3 specs (2 carriers), 6 swings · 97%" after Elder maul ×3
 *   (phase 32 wording); the carriers table summary reads "Per boss minimum at 95% (for reference): …".
 * - FA plan: the headline total; ToB plan: phase 38g, no "Added in this order" steps (carriers by headcount).
 * Screenshots docs/screenshots/phase30-*.png.
 */
import { existsSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { headlineClose } from './headlines.mjs';
import { OTHER_RAIDS } from './otherRaids.mjs';
import { openSections } from './phase34Sections.mjs';

const BASE = (process.argv[2] || 'http://localhost:3001/osrs-dps/').replace(/\/?$/, '/');

let failures = 0;
const check = (ok, msg) => {
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`);
};
const shot = async (page, name) => {
  await page.mouse.move(0, 0);
  await page.screenshot({ path: `docs/screenshots/phase30-${name}.png`, fullPage: true });
};
const text = async (loc) => (await loc.innerText()).replace(/\s+/g, ' ').trim();
const waitPlan = async (page) => {
  await page.waitForTimeout(1200);
  await page.locator('[data-testid="plan-progress"]').waitFor({ state: 'detached', timeout: 900000 });
  await page.locator('[data-testid="plan-result"]').waitFor({ timeout: 900000 });
  await openSections(page); // phase 34: open the sections what this script reads moved into
};
const waitSearch = async (page) => {
  await page.waitForTimeout(800);
  await page.locator('[data-testid="search-progress"]').waitFor({ state: 'detached', timeout: 300000 });
  await page.locator('[data-testid="search-results"]').waitFor({ timeout: 300000 });
  await openSections(page); // phase 34: open the sections what this script reads moved into
};
const openPlan = async (page, raid) => {
  await page.locator(`[data-testid="raid-tab-${raid}"]`).click();
  await page.waitForTimeout(500);
  await page.locator('[data-testid="plan-tab"]').click();
  await page.locator('[data-testid="plan-view"]').waitFor({ timeout: 30000 });
};
const pinnedNames = async (page) => (await page.locator('[data-testid="pinned-item"]').allInnerTexts()).map((t) => t.replace('×', '').trim());

const SUPPLY_FILES = { brew: 'Saradomin brew(4)', restore: 'Super restore(4)', food: 'Anglerfish' };

const main = async () => {
  const t0 = Date.now();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 1300 } });
  await page.goto(`${BASE}best-setup`, { waitUntil: 'load', timeout: 120000 });
  await page.evaluate(() => { localStorage.removeItem('mxeaez-dps:not-owned'); localStorage.removeItem('mxeaez-dps:settings:v1'); });
  await page.reload({ waitUntil: 'load', timeout: 120000 });
  await page.locator('[data-testid="raid-tab-fractured-archive"]').waitFor({ timeout: 120000 });
  await page.locator('[data-testid="raid-tab-fractured-archive"]').click();

  // --- Search drain box (Team, before any plan: the Advanced 2 / 2 / 1)
  await page.locator('[data-testid="drain-team"]').click();
  const drainItem = (w) => page.locator(`[data-testid="spec-plan"] [data-testid="drain-line-item"][data-weapon="${w}"]`);
  await page.locator('[data-testid="boss-select"]').selectOption('ag-flying');
  await waitSearch(page);
  const ag = await text(drainItem('tonalztics'));
  check(/needs 4 landed hits · 4 specs \(2 carriers\) = 8 attacks, 4 must land · 98%/.test(ag), `AG Flying Tonalztics: "${ag}"`);
  const table = await text(page.locator('[data-testid="team-table"] summary'));
  check(/^Per boss minimum at 95% \(for reference\): 6-man/.test(table), `carriers table summary: "${table}"`);
  await page.locator('[data-testid="boss-select"]').selectOption('xarth');
  await waitSearch(page);
  const xMaul = await text(drainItem('elderMaul'));
  const xTona = await text(drainItem('tonalztics'));
  check(/not needed · team: 4 specs \(2 carriers\) · >99\.9%/.test(xMaul) && /needs 2 landed hits · 2 specs \(1 carrier\) = 4 attacks, 2 must land · 97% · team: 4 specs \(2 carriers\) · >99\.9%/.test(xTona), `Xarth: "${xMaul}" | "${xTona}"`);
  await shot(page, 'search-xarth');
  await page.locator('[data-testid="boss-select"]').selectOption('bork');
  await waitSearch(page);
  const bMaul = await text(drainItem('elderMaul'));
  const bTona = await text(drainItem('tonalztics'));
  check(/needs 2 landed specs · 3 specs \(2 carriers\) · 98% · team: 4 specs \(2 carriers\) · 99\.6%/.test(bMaul) && /needs 2 landed hits once 1 Elder maul spec lands \(Def 195\) · 3 specs \(2 carriers\) = 6 attacks, 2 must land · 97% · team: 4 specs \(2 carriers\) · 99\.6%/.test(bTona), `Bork: "${bMaul}" | "${bTona}"`);

  // --- FA Plan inputs
  await page.locator('[data-testid="plan-tab"]').click();
  await page.locator('[data-testid="plan-view"]').waitFor({ timeout: 30000 });
  for (const [type, file] of Object.entries(SUPPLY_FILES)) {
    const img = page.locator(`[data-testid="plan-supplies"] img[data-supply="${type}"]`);
    const src = decodeURIComponent(await img.getAttribute('src') ?? '');
    const loaded = await img.evaluate((e) => e.complete && e.naturalWidth > 0);
    const inRepo = existsSync(`src/public/img/supplies/${file}.png`);
    check(src.includes(`/_next/static/media/${file}.`) && loaded && inRepo, `${type} icon: ${src} (loaded ${loaded}, in repo ${inRepo})`);
  }
  check(await page.locator('[data-testid="plan-supplies"] img[data-supply="other"]').count() === 0
    && await page.locator('[data-testid="plan-supplies"] svg[aria-label="Other"]').count() === 1, '"Other" keeps the generic flask');
  const policy = page.locator('[data-testid="plan-supplies"] [data-testid="plan-ring-policy"]');
  check(await policy.count() === 1 && await policy.isVisible() && await policy.inputValue() === 'camp-one', 'Rings dropdown in the supplies row (visible, Camp one ring)');
  check(await page.locator('[data-testid="plan-advanced"] [data-testid="plan-ring-policy"]').count() === 0, 'no ring policy under Advanced (plan)');
  const label = await text(page.locator('label[for="plan-ring-policy"]'));
  check(/^Rings/.test(label), `labelled "${label.slice(0, 5)}"`);
  check((await pinnedNames(page)).length === 0, `FA pinned: ${(await pinnedNames(page)).join(', ') || '(none)'}`);
  await waitPlan(page);
  const faTotal = await text(page.locator('[data-testid="plan-total"]'));
  check(headlineClose(faTotal, 'fa'), `FA plan total ${faTotal}`);
  const summary = await text(page.locator('[data-testid="plan-ring-summary-text"]'));
  check(/^one ring on every loadout: .+ \(the fastest of \d+\)$/.test(summary), `ring summary next to the dropdown: "${summary}"`);
  const faSteps = page.locator('[data-testid="plan-team-steps"]');
  if (await faSteps.count()) console.log(`     FA ${await text(faSteps)}`);
  await shot(page, 'plan-inputs');
  await policy.selectOption('switch');
  await page.waitForTimeout(300);
  check(/^each loadout wears its own best ring/.test(await text(page.locator('[data-testid="plan-ring-summary-text"]'))), 'Allow ring switches: summary follows');
  await policy.selectOption('camp-one');

  if (OTHER_RAIDS) { // phase 38f-2: the ToA / CoX / ToB steps run with RUN_OTHER_RAIDS=1 only
  // --- pinned defaults in the other raids
  for (const [raid, want] of [['toa', []], ['cox', []]]) {
    await openPlan(page, raid);
    const got = await pinnedNames(page);
    check(JSON.stringify(got) === JSON.stringify(want), `${raid} pinned: ${got.join(', ') || '(none)'}`);
  }
  await shot(page, 'cox-inputs');

  // --- ToB: the steps timed on the returned kit
  await openPlan(page, 'tob');
  check((await pinnedNames(page)).length === 0, `tob pinned: ${(await pinnedNames(page)).join(', ')}`);
  await waitPlan(page);
  const tobTotal = await text(page.locator('[data-testid="plan-total"]'));
  check(headlineClose(tobTotal, 'tob'), `ToB plan total ${tobTotal}`);
  // phase 38g: the carriers are taken by headcount (the most any boss needs at 95%), not added one by one on the route
  // time: no "Added in this order" line any more
  check(await page.locator('[data-testid="plan-team-steps"]').count() === 0, 'ToB: no carrier steps line (carriers by headcount)');
  await shot(page, 'tob-steps');
  }

  await browser.close();
  console.log(`${failures ? `${failures} FAILED` : 'all OK'} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  process.exit(failures ? 1 : 0);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
