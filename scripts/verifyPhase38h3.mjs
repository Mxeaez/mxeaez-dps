/**
 * Phase 38h-3 UI check (not part of the Jest run): the per-boss briefing "Drain: … · Then: 1. <weapon> 2. <weapon>
 * (per bar)" (bringRule.ts `thenText`) on Search, Summary and Plan, and the Plan's spec plan in HP (no seconds).
 *
 * Usage (dev server running): node scripts/verifyPhase38h3.mjs [baseUrl]
 * - Search (FA, Team, Xarth): the Specs box reads "Then: 1. … (per bar)", its first weapon = the box's first row.
 * - Summary: the Xarth Team cell's facts line ends in "· Then: …".
 * - Plan (FA defaults, Team): the bring rule line (first weapon = the headline's), every briefing row with damage specs
 *   has "Then: 1. Zaryte crossbow (per bar)" after its drain line; the spec items read in HP ("+N HP the bars pay").
 * - Plan Solo (party 1): each owned drain weapon with its specs ("N specs on the route (brought)" / "left at home").
 * Screenshot docs/screenshots/phase38h3-plan.png.
 */
import { chromium } from '@playwright/test';
import { headlineOf } from './headlines.mjs';

const BASE = (process.argv[2] || 'http://localhost:3001/osrs-dps/').replace(/\/?$/, '/');

let failures = 0;
const check = (ok, msg) => {
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`);
};
const waitSearch = async (page) => {
  await page.waitForTimeout(800);
  await page.locator('[data-testid="search-progress"]').waitFor({ state: 'detached', timeout: 300000 });
  await page.locator('[data-testid="search-results"]').waitFor({ timeout: 300000 });
};
const waitPlan = async (page) => {
  await page.waitForTimeout(1500);
  for (let k = 0; k < 3; k++) {
    await page.locator('[data-testid="plan-progress"]').waitFor({ state: 'detached', timeout: 900000 });
    await page.waitForTimeout(3000);
  }
  await page.locator('[data-testid="plan-result"]').waitFor({ timeout: 900000 });
};
const thenOf = async (loc) => loc.locator('[data-testid="drain-facts-then"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-text')));
// phase 38h-3b: optionally "· leftover: <weapon>" (the filler)
const THEN = /^Then: 1\. [A-Z][A-Za-z ]+(?: 2\. [A-Z][A-Za-z ]+)? \(per bar\)(?: · leftover: [A-Z][A-Za-z ]+)?$/;

const main = async () => {
  const t0 = Date.now();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 1200 } });
  await page.goto(`${BASE}best-setup`, { waitUntil: 'load', timeout: 120000 });
  await page.evaluate(() => { localStorage.removeItem('mxeaez-dps:not-owned'); localStorage.removeItem('mxeaez-dps:settings:v1'); });
  await page.reload({ waitUntil: 'load', timeout: 120000 });
  await page.locator('[data-testid="raid-tab-fractured-archive"]').waitFor({ timeout: 120000 });
  await page.locator('[data-testid="raid-tab-fractured-archive"]').click();
  await page.locator('[data-testid="drain-team"]').click();

  // --- Search (Team, Xarth)
  await page.locator('[data-testid="search-tab"]').click();
  await page.locator('[data-testid="boss-select"]').selectOption('xarth');
  await waitSearch(page);
  const box = page.locator('[data-testid="spec-damage-box"]');
  const search = await thenOf(box);
  const firstRow = await box.locator('[data-testid="spec-damage-row"]').first().locator('td').first().textContent();
  console.log(`     Search Xarth: ${search[0]}`);
  check(search.length === 1 && THEN.test(search[0] ?? '') && (search[0] ?? '').startsWith(`Then: 1. ${(firstRow ?? '').trim()}`),
    `Search Xarth (Team): "${search[0]}", first = the Specs box's first row (${(firstRow ?? '').trim()})`);

  // --- Summary
  await page.locator('[data-testid="summary-tab"]').click();
  await page.waitForTimeout(1500);
  await page.locator('[data-testid="summary-progress"]').waitFor({ state: 'detached', timeout: 1800000 });
  const cell = page.locator('[data-testid="summary-row"][data-target="xarth"] [data-testid="summary-cell"][data-drain="team"]');
  const summary = await thenOf(cell);
  const shown = await cell.locator('[data-testid="drain-facts"]').first().textContent();
  check(summary.length === 1 && summary[0] === search[0] && (shown ?? '').includes(` · ${summary[0]}`), `Summary Xarth (Team): "${shown}"`);

  // --- Plan (Team)
  await page.locator('[data-testid="plan-tab"]').click();
  await waitPlan(page);
  const h = headlineOf('fa');
  const rule = page.locator('[data-testid="plan-bring-rule"]');
  const first = (await rule.count()) ? await rule.getAttribute('data-first') : '';
  check(await rule.count() === 1 && h.items.includes('Zaryte crossbow') && first === 'zcb', `Plan: bring rule "${(await rule.count()) ? (await rule.textContent()) : ''}"`);
  const rows = await page.locator('[data-testid="plan-briefing"] tr').evaluateAll((els) => els.map((e) => ({
    damage: !!e.querySelector('[data-testid="plan-briefing-damage"]'),
    then: e.querySelector('[data-testid="drain-facts-then"]')?.getAttribute('data-text') ?? null,
  })));
  const withDamage = rows.filter((r) => r.damage);
  check(withDamage.length > 0 && withDamage.every((r) => (r.then ?? '').startsWith('Then: 1. Zaryte crossbow (per bar)')), `Plan: every briefing row with damage specs says "Then: 1. Zaryte crossbow (per bar)" (38h-3b: + leftover) (${withDamage.length} rows)`);
  await page.locator('[data-testid="plan-briefing"]').scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  await page.screenshot({ path: 'docs/screenshots/phase38h3-plan.png', fullPage: false });
  const items = await page.locator('[data-testid="plan-spec-item"]').evaluateAll((els) => els.map((e) => e.textContent.trim()));
  check(items.length > 0 && items.every((t) => /HP the bars pay|frees a slot/.test(t) && !/ s \(/.test(t)), `Plan: spec items in HP: ${items.join('; ')}`);

  // --- Plan Solo (party 1)
  await page.locator('#bs-party').fill('1');
  await page.locator('#bs-party').blur();
  await waitPlan(page);
  const solo = await page.locator('[data-testid="plan-spec-weapons"] li').evaluateAll((els) => els.map((e) => ({
    id: e.getAttribute('data-testid'), specs: Number(e.getAttribute('data-ref-specs')), text: e.textContent.trim(),
  })));
  check(solo.length === 5 && solo.every((w) => (w.id !== 'plan-spec-weapon' || w.specs > 0)), `Plan Solo: ${solo.map((w) => w.text).join('; ')}`);
  const bring = await page.locator('[data-testid="plan-bring"]').textContent();
  check((bring ?? '').trim() === headlineOf('faSolo').bring, `Plan Solo: "${(bring ?? '').trim()}" = the faSolo headline`);

  await browser.close();
  console.log(`${failures ? `${failures} FAILED` : 'all OK'} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  process.exit(failures ? 1 : 0);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
