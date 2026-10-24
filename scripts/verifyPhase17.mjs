/**
 * Phase 17 UI check (not part of the Jest run): the Plan tab on /best-setup (raid kit planner).
 *
 * Usage (dev server running): node scripts/verifyPhase17.mjs [baseUrl]
 * - Plan is the second tab; with the defaults (6-man, Team drains, the user's pinned items and supplies, compare all
 *   routes) a worn set and a 28-cell inventory grid render with icons, the free-slot count is shown, the per-encounter
 *   table has 5 rows for the fastest route; records the run time (target ≤ 30 s).
 * - Brews 6 → 10: free slots drop (or the kit shrinks) and the plan re-runs.
 * - "Load worn set into calculator": the calculator's DPS = the plan's DPS on the route's first phase (AG shield).
 * Prints the plan (the phase 17 headline). Screenshots docs/screenshots/phase17-*.png.
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

const waitIdle = async (page, timeout = 600000) => {
  await page.waitForTimeout(900); // debounce
  await page.locator('[data-testid="plan-progress"]').waitFor({ state: 'detached', timeout });
  await page.locator('[data-testid="plan-result"]').waitFor({ timeout });
};

const readPlan = async (page) => ({
  free: Number(await page.locator('[data-testid="free-slots"]').getAttribute('data-free')),
  total: (await page.locator('[data-testid="plan-total"]').innerText()).trim(),
  headline: (await page.locator('[data-testid="plan-headline"]').innerText()).trim(),
  stats: (await page.locator('[data-testid="plan-stats"]').innerText()).trim(),
  worn: await page.locator('[data-testid="worn-slot"]').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-slot')}=${e.getAttribute('data-item')}`)),
  kit: await page.locator('[data-testid="kit-loadout"]').allInnerTexts(),
  cells: await page.locator('[data-testid="inventory-cell"]').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-kind')}:${e.getAttribute('data-label')}`)),
  encounters: await page.locator('[data-testid="plan-encounter-row"]').allInnerTexts(),
  why: (await page.locator('[data-testid="plan-why"]').innerText()).trim(),
});

const main = async () => {
  fs.mkdirSync('docs/screenshots', { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 1600 } });
  await page.goto(`${BASE}best-setup`, { waitUntil: 'load', timeout: 120000 });
  const tabs = await page.locator('[data-testid$="-tab"]').evaluateAll((els) => els.map((e) => e.textContent.trim()));
  check(tabs.join(',') === 'Search,Plan,Summary', `tab order Search, Plan, Summary (phase 23: Routes merged into Plan) (${tabs.join(', ')})`);
  await page.locator('[data-testid="plan-tab"]').click();
  await page.locator('[data-testid="plan-view"]').waitFor({ timeout: 60000 });
  check(await page.locator('[data-testid="drain-team"]').count() === 1, 'drain selector on the Plan tab');
  check(await page.locator('#bs-party').inputValue() === '6', 'party size 6');
  check(await page.locator('#plan-supply-brew').inputValue() === '6' && await page.locator('#plan-supply-restore').inputValue() === '4'
    && await page.locator('#plan-supply-ranging').inputValue() === '2' && await page.locator('#plan-supply-superCombat').inputValue() === '1', 'default supplies 6 / 4 / 2 / 1');
  const pinned = await page.locator('[data-testid="pinned-item"]').allInnerTexts();
  check(pinned.length === 7, `7 pinned items (incl. the Saturated heart) (${pinned.map((x) => x.replace('×', '').trim()).join(', ')})`);

  const t0 = Date.now();
  await waitIdle(page);
  const runSeconds = (Date.now() - t0) / 1000;
  console.log(`     first run ${runSeconds.toFixed(1)} s (incl. 0.5 s debounce)`);
  check(runSeconds <= 45, `first run within 45 s in headless dev (target ≤ 30 s): ${runSeconds.toFixed(1)} s`);

  const p = await readPlan(page);
  console.log(`     ${p.headline}\n     ${p.stats}`);
  console.log(`     worn: ${p.worn.join(', ')}`);
  p.kit.forEach((k) => console.log(`     kit: ${k.replace(/\s+/g, ' ')}`));
  console.log(`     free slots ${p.free}; inventory: ${p.cells.join(', ')}`);
  p.encounters.forEach((e) => console.log(`     enc: ${e.replace(/\s+/g, ' ')}`));
  console.log(`     why: ${p.why.replace(/\s+/g, ' ')}`);
  check(p.worn.filter((w) => !w.endsWith('=')).length >= 8, 'worn set rendered (≥ 8 slots filled)');
  check(await page.locator('[data-testid="worn-grid"] [data-testid="item-icon"]').count() >= 8, 'worn set has item icons');
  check(p.cells.length === 28, `inventory grid has 28 cells (${p.cells.length})`);
  const gridIcons = await page.locator('[data-testid="inventory-grid"] [data-testid="item-icon"]').count();
  const filled = p.cells.filter((c) => !c.startsWith('free') && !c.startsWith('non-item') && !c.startsWith('swap')).length;
  check(gridIcons === filled, `every supply / item cell has an icon (${gridIcons} / ${filled})`);
  check(Number.isFinite(p.free) && p.free >= 0, `free slots shown (${p.free})`);
  check(p.cells.filter((c) => c.startsWith('free')).length === p.free, 'free cells = free-slot count');
  check(p.encounters.length === 5, `per-encounter table has 5 rows (${p.encounters.length})`);
  const fastestRows = await page.locator('[data-testid="plan-route-row"][data-fastest="true"]').count();
  check(fastestRows === 1 && await page.locator('[data-testid="plan-route-row"]').count() === 8, '8 routes listed with the same kit, one highlighted');
  check(/avg DPS \(time-weighted\)/.test(await page.locator('[data-testid="plan-encounters"] thead').innerText()), 'encounter DPS column labelled "avg DPS (time-weighted)"');
  check(/My specs/.test(await page.locator('[data-testid="spec-note"]').innerText()), 'note: spec weapons come from My specs');
  const unusedText = await page.locator('[data-testid="unused-carried"]').innerText().catch(() => '');
  console.log(`     unused carried: ${unusedText.replace(/\s+/g, ' ')}`);
  check(await page.locator('[data-testid="drop-pinned"]').count() === 1, 'unused pinned items warned with a one-click remove');
  const unusedSup = await page.locator('[data-testid="unused-supplies"]').allInnerTexts();
  console.log(`     unused supplies: ${unusedSup.join(' | ') || 'none'}`);
  await page.screenshot({ path: 'docs/screenshots/phase17-plan.png', fullPage: true });
  await page.locator('[data-testid="plan-result"]').screenshot({ path: 'docs/screenshots/phase17-kit.png' });

  // brews 6 → 10
  await page.locator('#plan-supply-brew').fill('10');
  await page.waitForTimeout(700);
  const reran = await page.locator('[data-testid="plan-progress"]').count();
  await waitIdle(page);
  const q = await readPlan(page);
  console.log(`     brews 10: free ${q.free}, ${q.headline}; kit ${q.kit.length} loadouts; ${q.stats}`);
  check(reran === 1 || q.stats !== p.stats, 'the plan re-ran');
  check(q.cells.length === 28 && q.cells.filter((c) => c.startsWith('supply')).length === 17, '17 supply cells after brews 10');
  check(q.free < p.free || q.free === 0 || q.kit.length < p.kit.length || q.cells.filter((c) => c.startsWith('switch')).length < p.cells.filter((c) => c.startsWith('switch')).length,
    `free slots drop or the switches shrink (${p.free} → ${q.free})`);
  await page.screenshot({ path: 'docs/screenshots/phase17-brews10.png', fullPage: true });
  await page.locator('#plan-supply-brew').fill('6');
  await waitIdle(page);

  // remove the unused pinned items: they leave the pinned list and the plan re-runs with the freed slots
  const pinnedBefore = await page.locator('[data-testid="pinned-item"]').count();
  const removed = (await page.locator('[data-testid="unused-carried"] span').first().innerText()).replace(/^.*loadout: /, '').replace(/\.$/, '').split(', ');
  await page.locator('[data-testid="drop-pinned"]').click();
  await page.waitForTimeout(700);
  await waitIdle(page);
  const pinnedAfter = await page.locator('[data-testid="pinned-item"]').count();
  const r = await readPlan(page);
  console.log(`     after removing unused pinned: ${pinnedBefore} → ${pinnedAfter} pinned; ${r.headline}; free ${r.free}; kit ${r.kit.map((k) => k.split('·')[0].trim()).join(' / ')}`);
  // (items the new kit no longer wears, e.g. the heart when it drops magic, may become unused in turn; they stay pinned)
  check(pinnedAfter < pinnedBefore && !r.cells.some((c) => removed.some((n) => c === `pinned:${n}`)), `unused pinned items removed in one click (${removed.join(', ')}); re-planned`);
  await page.screenshot({ path: 'docs/screenshots/phase17-unpinned.png', fullPage: true });
  await page.getByTestId('plan-pinned').getByRole('button', { name: 'reset' }).click();
  await waitIdle(page);

  // load the worn set: calculator DPS = the plan's DPS on the first phase
  const firstDps = (await page.locator('[data-testid="plan-phase-row"]').first().locator('[data-testid="plan-phase-dps"]').innerText()).trim();
  await page.locator('[data-testid="load-worn"]').click();
  await page.waitForURL((u) => !u.pathname.endsWith('best-setup'), { timeout: 60000 });
  await page.getByPlaceholder('Search for monster...').waitFor({ timeout: 120000 });
  await page.waitForTimeout(3000);
  const cDps = await readCalcRow(page, 'DPS');
  check(cDps === firstDps, `worn set loaded: plan ${firstDps} DPS on the AG shield phase, calculator ${cDps}`);
  await page.screenshot({ path: 'docs/screenshots/phase17-loaded.png', fullPage: true });

  await browser.close();
  process.exit(failures ? 1 : 0);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
