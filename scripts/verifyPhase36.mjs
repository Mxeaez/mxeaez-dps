/**
 * Phase 36 UI check (not part of the Jest run): damage specs, the surge potion, one spec budget per encounter.
 *
 * Usage (dev server running): node scripts/verifyPhase36.mjs [baseUrl]
 * - Search, FA Xarth (Team): the "Specs (damage)" box lists the five damage spec weapons, best first (seconds per spec
 *   descending; phase 37: by gain per 100% energy), each with avg damage, gain, time saved, cost; Voidwaker's avg is 54.0. Solo: the drain box has a
 *   "with a surge dose" line. Screenshots docs/screenshots/phase36-search-xarth.png, phase36-search-solo.png.
 * - Plan, FA (Team defaults): the total (EXPECT.fa), "Surge dose at: …" with the potion icon, the briefing rows show your
 *   damage specs ("You: [icon] ×N") and the dose; the Bring line names the damage spec weapons; the inventory holds the
 *   Surge potion. Screenshot docs/screenshots/phase36-plan-fa.png.
 * - Plan, ToB (Team defaults): Sotetseg's three events have different specs (no "× 3"). Screenshot phase36-plan-tob.png.
 */
import { chromium } from '@playwright/test';

const BASE = (process.argv[2] || 'http://localhost:3001/osrs-dps/').replace(/\/?$/, '/');
const EXPECT = { fa: process.env.FA_TOTAL || '', tob: process.env.TOB_TOTAL || '' };

let failures = 0;
const check = (ok, msg) => {
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`);
};
const text = async (loc) => (await loc.innerText()).replace(/\s+/g, ' ').trim();
const waitPlan = async (page) => {
  await page.waitForTimeout(1500);
  for (let k = 0; k < 3; k++) {
    await page.locator('[data-testid="plan-progress"]').waitFor({ state: 'detached', timeout: 1800000 });
    await page.waitForTimeout(3000);
  }
  await page.locator('[data-testid="plan-result"]').waitFor({ timeout: 1800000 });
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
  await page.locator('[data-testid="raid-tab-fractured-archive"]').waitFor({ timeout: 120000 });
  await page.locator('[data-testid="raid-tab-fractured-archive"]').click();
  await page.waitForTimeout(500);

  // --- Search: Xarth
  await page.locator('[data-testid="search-tab"]').click();
  await page.locator('[data-testid="boss-select"]').selectOption('xarth');
  await page.locator('[data-testid="drain-team"]').click();
  await waitSearch(page);
  const rows = await page.locator('[data-testid="spec-damage-row"]').evaluateAll((els) => els.map((e) => ({
    w: e.dataset.weapon, saved: Number(e.dataset.saved), cells: Array.from(e.querySelectorAll('td')).map((c) => c.textContent.trim()),
  })));
  rows.forEach((r) => console.log(`     ${r.w}: ${r.cells.join(' | ')}`));
  check(rows.length === 5, `Specs box: 5 damage spec weapons (${rows.map((r) => r.w).join(', ')})`);
  // phase 37 (user): plain-word headers with tooltips, a "Gain per 100% energy" column, the default order
  const heads = await page.locator('[data-testid="spec-damage-table"] th').evaluateAll((els) => els.map((e) => ({ t: e.textContent.trim(), title: e.getAttribute('title') || '' })));
  check(heads.map((h) => h.t).join(' | ') === 'Weapon | Avg damage | Gain over normal hits | Time saved | Cost | Gain per 100% energy', `headers: ${heads.map((h) => h.t).join(' | ')}`);
  check(heads.slice(1).every((h) => h.title.length > 10), 'every number column has a tooltip');
  const perEnergy = await page.locator('[data-testid="spec-damage-row"]').evaluateAll((els) => els.map((e) => Number(e.dataset.perEnergy)));
  check(perEnergy.every((x, i) => i === 0 || perEnergy[i - 1] >= x), `best first (gain per 100% energy: ${perEnergy.join(', ')})`);
  const vw = rows.find((r) => r.w === 'voidwaker');
  check(vw?.cells[1] === '54.0', `Voidwaker avg damage ${vw?.cells[1]} (54.0: max 54 → 27-81)`);
  check(vw && Math.abs(Number(vw.cells[5]) - (Number(vw.cells[2]) / Number(vw.cells[4].replace('%', ''))) * 100) < 0.11, `Voidwaker gain per 100% = gain ÷ cost × 100 (${vw?.cells[5]})`);
  check(rows.every((r) => /%$/.test(r.cells[4])), 'each row shows its cost');
  check(rows.every((r) => / s$|—/.test(r.cells[3])), 'each row keeps its time saved');
  await page.mouse.move(0, 0);
  await page.locator('[data-testid="search-view"]').screenshot({ path: 'docs/screenshots/phase36-search-xarth.png' });

  // --- Plan: FA
  await page.locator('[data-testid="plan-tab"]').click();
  await page.locator('[data-testid="plan-view"]').waitFor({ timeout: 30000 });
  await waitPlan(page);
  const total = await text(page.locator('[data-testid="plan-total"]'));
  check(!EXPECT.fa || total === EXPECT.fa, `FA Team total ${total}${EXPECT.fa ? ` (expected ${EXPECT.fa})` : ''}`);
  const bring = await text(page.locator('[data-testid="plan-bring"]'));
  console.log(`     ${bring}`);
  const surgeLine = page.locator('[data-testid="plan-surge"]');
  const hasSurge = await surgeLine.count();
  if (hasSurge) {
    const at = await surgeLine.getAttribute('data-at');
    check((await surgeLine.locator('img').count()) > 0 && /^Surge dose at:/.test(await text(surgeLine)), `"${await text(surgeLine)}" (icon + label)`);
    const briefSurge = await page.locator('[data-testid="plan-briefing-surge"]').count();
    check(briefSurge === at.split('|').length, `briefing marks the dose on ${briefSurge} row(s) (${at})`);
    check(await page.locator('[data-testid="inventory-cell"][data-label^="Surge potion"]').count() >= 1, 'the inventory holds the Surge potion');
  } else console.log('     (no surge dose in this plan)');
  const dmg = await page.locator('[data-testid="plan-briefing-damage"]').evaluateAll((els) => els.map((e) => e.dataset.text).filter(Boolean));
  console.log(`     damage specs per row: ${JSON.stringify(dmg)}`);
  check(dmg.length > 0 ? (await page.locator('[data-testid="plan-briefing-damage"] img').count()) > 0 : true, 'damage specs shown with icons');
  const briefing = await page.locator('[data-testid="plan-briefing-row"]').evaluateAll((els) => els.map((e) => `${e.dataset.encounter}: ${e.dataset.specs}`));
  briefing.forEach((b) => console.log(`     ${b}`));
  await page.mouse.move(0, 0);
  await page.locator('[data-testid="plan-result"]').screenshot({ path: 'docs/screenshots/phase36-plan-fa.png' });

  // --- Plan: ToB (Sotetseg)
  await page.locator('[data-testid="raid-tab-tob"]').click();
  await page.waitForTimeout(500);
  await page.locator('[data-testid="plan-tab"]').click();
  await page.locator('[data-testid="plan-view"]').waitFor({ timeout: 30000 });
  await waitPlan(page);
  const tobTotal = await text(page.locator('[data-testid="plan-total"]'));
  check(!EXPECT.tob || tobTotal === EXPECT.tob, `ToB Team total ${tobTotal}${EXPECT.tob ? ` (expected ${EXPECT.tob})` : ''}`);
  const sote = await page.locator('[data-testid="plan-briefing-row"][data-encounter="tob-sotetseg"]').getAttribute('data-specs');
  console.log(`     tob-sotetseg: ${sote}`);
  check(!/× 3/.test(sote ?? '') && /after maze 1/.test(sote ?? ''), 'Sotetseg: one budget, the events listed separately (no "× 3")');
  await page.mouse.move(0, 0);
  await page.locator('[data-testid="plan-briefing"]').screenshot({ path: 'docs/screenshots/phase36-plan-tob.png' });

  // --- Search, Solo with Tonalztics ticked (Set manually): the "with a surge dose" line; then back to Planner decides
  await page.locator('[data-testid="raid-tab-fractured-archive"]').click();
  await page.waitForTimeout(500);
  await page.locator('[data-testid="search-tab"]').click();
  await page.locator('[data-testid="boss-select"]').selectOption('xarth');
  await page.locator('[data-testid="my-specs-mode"]').selectOption('manual');
  await page.locator('#bs-my-tonalztics').click();
  await page.locator('[data-testid="drain-solo"]').click();
  await waitSearch(page);
  const surge = page.locator('[data-testid="drain-surge"]');
  check(await surge.count() === 1, `Solo drain box: "with a surge dose" line: "${await surge.count() ? await text(surge) : ''}"`);
  await page.mouse.move(0, 0);
  await page.locator('[data-testid="spec-plan"]').screenshot({ path: 'docs/screenshots/phase36-search-solo.png' });
  await page.locator('#bs-my-tonalztics').click();
  await page.locator('[data-testid="my-specs-mode"]').selectOption('auto');
  await page.locator('[data-testid="drain-team"]').click();
  await page.waitForTimeout(1000);

  await browser.close();
  console.log(`${failures ? `${failures} FAILED` : 'all OK'} (${Math.round((Date.now() - t0) / 1000)} s)`);
  process.exit(failures ? 1 : 0);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
