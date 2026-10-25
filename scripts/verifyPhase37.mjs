/**
 * Phase 37 UI check (not part of the Jest run): performance (parallel ring runs) and the two display add-ons.
 *
 * Usage (dev server running): node scripts/verifyPhase37.mjs [baseUrl]
 * - Search, FA Xarth (Team): the "Specs (damage)" box headers are plain words with tooltips (Avg damage, Gain over normal
 *   hits, Time saved, Cost, Gain per 100% energy), rows sorted by gain per 100% energy. Screenshot
 *   docs/screenshots/phase37-search-specs.png.
 * - Plan, CoX (Team defaults): the progress shows the ring runs in parallel; the plan finishes in ≤ 60 s with 7:08.7;
 *   the Great Olm row lists the right claw's events without specs ("Right claw, after phase 1" + "no specs"), as the
 *   tooltip does. Screenshot docs/screenshots/phase37-plan-cox.png.
 */
import { chromium } from '@playwright/test';

const BASE = (process.argv[2] || 'http://localhost:3001/osrs-dps/').replace(/\/?$/, '/');

let failures = 0;
const check = (ok, msg) => {
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`);
};
const text = async (loc) => (await loc.innerText()).replace(/\s+/g, ' ').trim();
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
  await page.evaluate(() => localStorage.removeItem('mxeaez-dps:not-owned'));
  await page.reload({ waitUntil: 'load', timeout: 120000 });
  await page.locator('[data-testid="raid-tab-fractured-archive"]').waitFor({ timeout: 120000 });
  await page.locator('[data-testid="raid-tab-fractured-archive"]').click();
  await page.waitForTimeout(500);

  // --- Search: Xarth, the Specs box
  await page.locator('[data-testid="search-tab"]').click();
  await page.locator('[data-testid="boss-select"]').selectOption('xarth');
  await page.locator('[data-testid="drain-team"]').click();
  await waitSearch(page);
  const heads = await page.locator('[data-testid="spec-damage-table"] th').evaluateAll((els) => els.map((e) => ({ t: e.textContent.trim(), title: e.getAttribute('title') || '' })));
  check(heads.map((h) => h.t).join(' | ') === 'Weapon | Avg damage | Gain over normal hits | Time saved | Cost | Gain per 100% energy', `headers: ${heads.map((h) => h.t).join(' | ')}`);
  heads.slice(1).forEach((h) => console.log(`     ${h.t}: "${h.title}"`));
  check(heads.slice(1).every((h) => h.title.length > 10), 'a tooltip on every number column');
  const rows = await page.locator('[data-testid="spec-damage-row"]').evaluateAll((els) => els.map((e) => ({
    w: e.dataset.weapon, per: Number(e.dataset.perEnergy), cells: Array.from(e.querySelectorAll('td')).map((c) => c.textContent.trim()),
  })));
  rows.forEach((r) => console.log(`     ${r.cells.join(' | ')}`));
  check(rows.every((r, i) => i === 0 || rows[i - 1].per >= r.per), 'sorted by gain per 100% energy');
  const vw = rows.find((r) => r.w === 'voidwaker');
  check(vw?.cells.slice(1).join(' | ') === '54.0 | 20.6 | 1.48 s | 50% | 41.2', `Voidwaker numbers unchanged + 41.2 per 100% (${vw?.cells.slice(1).join(' | ')})`);
  await page.mouse.move(0, 0);
  await page.locator('[data-testid="spec-damage-box"]').screenshot({ path: 'docs/screenshots/phase37-search-specs.png' });

  // --- Plan: CoX
  await page.locator('[data-testid="raid-tab-cox"]').click();
  await page.waitForTimeout(500);
  await page.locator('[data-testid="plan-tab"]').click();
  await page.locator('[data-testid="plan-view"]').waitFor({ timeout: 30000 });
  const tPlan = Date.now();
  let parallelSeen = '';
  for (let k = 0; k < 600 && !parallelSeen; k++) {
    const p = page.locator('[data-testid="plan-progress"]');
    if (await p.count()) {
      const s = await p.innerText().catch(() => '');
      if (/in parallel/.test(s)) parallelSeen = s.replace(/\s+/g, ' ').trim();
    }
    if (await page.locator('[data-testid="plan-result"]').count() && !(await page.locator('[data-testid="plan-progress"]').count())) break;
    await page.waitForTimeout(250);
  }
  await page.locator('[data-testid="plan-progress"]').waitFor({ state: 'detached', timeout: 600000 });
  await page.locator('[data-testid="plan-result"]').waitFor({ timeout: 600000 });
  const secs = (Date.now() - tPlan) / 1000;
  check(!!parallelSeen, `progress: "${parallelSeen}"`);
  const total = await text(page.locator('[data-testid="plan-total"]'));
  check(total === '7:08.7', `CoX total ${total} (7:08.7, unchanged)`);
  check(secs <= 60, `CoX plan in ≤ 60 s (${secs.toFixed(1)} s)`);
  const olm = page.locator('[data-testid="plan-briefing-row"][data-encounter="cox-olm"]');
  const groups = await olm.locator('[data-testid="plan-briefing-group"]').evaluateAll((els) => els.map((e) => e.dataset.text));
  groups.forEach((g) => console.log(`     Olm: ${g}`));
  check(groups.some((g) => /^Right claw, after phase 1: no specs$/.test(g)), 'Olm: "Right claw, after phase 1: no specs" in the short line');
  const tooltip = await olm.locator('[data-testid="plan-briefing-specs"]').getAttribute('title');
  // the tooltip's long form: "Right claw, after phase 1 (Defence restored), again: no specs"
  const parts = (tooltip ?? '').split(' · ');
  check(groups.filter((g) => /no specs$/.test(g)).every((g) => parts.some((p) => p.startsWith(g.replace(': no specs', '')) && p.endsWith(': no specs'))), 'every "no specs" group is in the tooltip too');
  check(await olm.locator('[data-testid="plan-briefing-group"]', { hasText: 'no specs' }).count() >= 1, '"no specs" rendered in the briefing');
  await page.mouse.move(0, 0);
  await page.locator('[data-testid="plan-briefing"]').screenshot({ path: 'docs/screenshots/phase37-plan-cox.png' });

  await browser.close();
  console.log(`${failures ? `${failures} FAILED` : 'all OK'} (${Math.round((Date.now() - t0) / 1000)} s)`);
  process.exit(failures ? 1 : 0);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
