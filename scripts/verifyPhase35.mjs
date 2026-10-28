// other-raids-only: skipped by verifyAll unless RUN_OTHER_RAIDS=1 (phase 38f-2: round 6 is Fractured Archive only)
/**
 * Phase 35 UI check (not part of the Jest run): adds and short-lived targets get no specs.
 *
 * Usage (dev server running): node scripts/verifyPhase35.mjs [baseUrl]
 * - ToA Search, Spitting Scarab, Team and Solo: the drain box reads "No drains: adds: not worth a drain spec" (no drain icons,
 *   no "no spec weapons" note, no per-boss minimum table); ranked at the undrained Defence (= the target's Def).
 * - ToA Plan (Team, defaults): 14:12.1; the briefing rows mention no scarab / shadow; the Kephri / Akkha per-phase rows
 *   of the scarabs and shadows have no drain icons and say "no drains (adds)"; the team briefing ("Spec plan") lists no
 *   add target.
 * - CoX Summary row "Skeletal Mystic": "no drains (adds)" in the Solo / Team cells.
 * Screenshots docs/screenshots/phase35-*.png.
 */
import { chromium } from '@playwright/test';
import { headlineClose } from './headlines.mjs';
import { openSections } from './phase34Sections.mjs';

const BASE = (process.argv[2] || 'http://localhost:3001/osrs-dps/').replace(/\/?$/, '/');
const ADDS = /Scarab|Shadow/;
const NOTE = 'No drains: adds: not worth a drain spec';

let failures = 0;
const check = (ok, msg) => {
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`);
};
const shot = async (page, name) => {
  await page.mouse.move(0, 0);
  await page.screenshot({ path: `docs/screenshots/phase35-${name}.png`, fullPage: true });
};
const text = async (loc) => (await loc.innerText()).replace(/\s+/g, ' ').trim();
const visible = async (page, sel) => page.locator(sel).evaluateAll((els) => els.some((e) => e.checkVisibility()));
const waitPlan = async (page) => {
  await page.waitForTimeout(1500);
  for (let k = 0; k < 3; k++) {
    await page.locator('[data-testid="plan-progress"]').waitFor({ state: 'detached', timeout: 900000 });
    await page.waitForTimeout(3000);
  }
  await page.locator('[data-testid="plan-result"]').waitFor({ timeout: 900000 });
};
const waitSearch = async (page) => {
  await page.waitForTimeout(800);
  await page.locator('[data-testid="search-progress"]').waitFor({ state: 'detached', timeout: 300000 });
  await page.locator('[data-testid="search-results"]').waitFor({ timeout: 300000 });
};

const main = async () => {
  const t0 = Date.now();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
  await page.goto(`${BASE}best-setup`, { waitUntil: 'load', timeout: 120000 });
  await page.evaluate(() => { localStorage.removeItem('mxeaez-dps:not-owned'); localStorage.removeItem('mxeaez-dps:settings:v1'); });
  await page.reload({ waitUntil: 'load', timeout: 120000 });
  await page.locator('[data-testid="raid-tab-toa"]').waitFor({ timeout: 120000 });
  await page.locator('[data-testid="raid-tab-toa"]').click();
  await page.waitForTimeout(500);

  // --- ToA Search: Spitting Scarab
  await page.locator('[data-testid="search-tab"]').click();
  await page.locator('[data-testid="boss-select"]').selectOption('toa-spitting-scarab');
  for (const drain of ['team', 'solo']) {
    await page.locator(`[data-testid="drain-${drain}"]`).click();
    await waitSearch(page);
    const note = await text(page.locator('[data-testid="drain-no-drains"]'));
    check(note === NOTE, `Search ${drain}: "${note}"`);
    check(await page.locator('[data-testid="spec-plan"] [data-testid="drain-brief-item"]').count() === 0, `Search ${drain}: no drain icons`);
    check(await page.locator('[data-testid="drain-no-specs"]').count() === 0, `Search ${drain}: no "no spec weapons" note`);
    await openSections(page, ['spec-plan-details', 'search-details']);
    check(!(await visible(page, '[data-testid="team-table"]')), `Search ${drain}: no per-boss minimum table`);
    const def = (await text(page.locator('[data-testid="target-def"]'))).replace('Def ', '');
    const ranked = await text(page.locator('[data-testid="search-ranked-at"]'));
    check(ranked.includes(`Def ${def} ·`), `Search ${drain}: ranked at the undrained Defence (${def}): "${ranked}"`);
    await shot(page, `search-scarab-${drain}`);
  }
  await page.locator('[data-testid="drain-team"]').click();

  // --- ToA Plan (Team defaults)
  await page.locator('[data-testid="plan-tab"]').click();
  await page.locator('[data-testid="plan-view"]').waitFor({ timeout: 30000 });
  await waitPlan(page);
  const total = await text(page.locator('[data-testid="plan-total"]'));
  check(headlineClose(total, 'toa'), `ToA plan total ${total}`);
  const rows = await page.locator('[data-testid="plan-briefing-row"]').evaluateAll((els) => els.map((e) => ({
    id: e.dataset.encounter,
    specs: e.dataset.specs,
    title: e.querySelector('[data-testid="plan-briefing-specs"]')?.getAttribute('title') ?? '',
  })));
  rows.forEach((r) => console.log(`     ${r.id}: ${r.specs}`));
  check(rows.length === 5 && rows.every((r) => !ADDS.test(r.specs) && !ADDS.test(r.title)), 'briefing: no scarab / shadow rows or parts with specs');
  await shot(page, 'plan-toa');
  await openSections(page, ['plan-spec-details', 'plan-phase-details']);
  const briefing = await text(page.locator('[data-testid="plan-team-briefing"]'));
  check(!ADDS.test(briefing), 'Spec plan: the team briefing lists no add target');
  await page.locator('[data-testid="plan-phase-toggle"]').click();
  const addRows = await page.locator('[data-testid="plan-phase-row"]').evaluateAll((els) => els
    .filter((e) => /scarab|shadow/.test(e.dataset.target))
    .map((e) => ({
      target: e.dataset.target,
      icons: e.querySelectorAll('[data-testid="plan-phase-drains"] [data-testid="drain-line-item"]').length,
      note: e.querySelector('[data-testid="plan-phase-no-drains"]')?.textContent ?? '',
    })));
  addRows.forEach((r) => console.log(`     ${r.target}: ${r.icons} drain icons, "${r.note}"`));
  check(addRows.length === 4 && addRows.every((r) => r.icons === 0 && r.note === 'no drains (adds)'), 'per-phase rows: the 3 scarabs and the shadows have no specs ("no drains (adds)")');
  const bossRows = await page.locator('[data-testid="plan-phase-row"]').evaluateAll((els) => els
    .filter((e) => ['toa-kephri-shielded', 'toa-akkha'].includes(e.dataset.target))
    .map((e) => e.querySelectorAll('[data-testid="plan-phase-drains"] [data-testid="drain-line-item"]').length));
  check(bossRows.length > 0 && bossRows.some((n) => n > 0), 'per-phase rows: Kephri (shielded) / Akkha still drain');
  await shot(page, 'plan-toa-details');

  // --- CoX Summary: the Skeletal Mystic row
  await page.locator('[data-testid="raid-tab-cox"]').click();
  await page.waitForTimeout(500);
  await page.locator('[data-testid="summary-tab"]').click();
  await page.waitForTimeout(1500);
  await page.locator('[data-testid="summary-progress"]').waitFor({ state: 'detached', timeout: 1800000 });
  const mystic = await page.locator('[data-testid="summary-row"]').evaluateAll((els) => els
    .filter((e) => e.textContent.includes('Skeletal Mystic'))
    .map((e) => Array.from(e.querySelectorAll('[data-testid="summary-no-drains"]')).map((n) => ({ t: n.textContent, title: n.getAttribute('title') }))));
  console.log(`     Skeletal Mystic: ${JSON.stringify(mystic)}`);
  check(mystic.length === 1 && mystic[0].length === 2 && mystic[0].every((n) => n.t === 'no drains (adds)' && n.title === NOTE), 'Summary: Skeletal Mystic Solo / Team say "no drains (adds)"');
  const tekton = await page.locator('[data-testid="summary-row"]').evaluateAll((els) => els
    .filter((e) => e.textContent.includes('Tekton'))
    .map((e) => e.querySelectorAll('[data-testid="summary-no-drains"]').length));
  check(tekton.length > 0 && tekton.every((n) => n === 0), 'Summary: Tekton keeps its drains');
  await shot(page, 'summary-cox');

  await browser.close();
  console.log(`${failures ? `${failures} FAILED` : 'all OK'} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  process.exit(failures ? 1 : 0);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
