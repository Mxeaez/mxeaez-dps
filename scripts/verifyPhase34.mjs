/**
 * Phase 34 UI check (not part of the Jest run): readability — the default view shows what you act on; the rest is in
 * sections closed by default; item icons next to item names.
 *
 * Usage (dev server running): node scripts/verifyPhase34.mjs [baseUrl]
 * - Search (FA defaults, Team, AG Flying): the drain box reads "[Tonalztics] 4 hits → Def 156 · Magic def 130" (icon +
 *   bold number); no sentence form, "N% land", "Chance of the Defence floor" or "Per boss minimum" visible until
 *   "details" is opened; "Search details" hides ranked-at / best preset / evaluations; no "vs best preset" column, no
 *   "search started from" text.
 * - Potion pickers: custom lists with icons, the relevant choices first, the rest under "more".
 * - Plan (Team): 21:44.4 (phase 33); the raid briefing (boss image, loadout icons, specs as icon + bold number, seconds)
 *   with the pinned short lines; Bring / your share visible; "Why this kit", "Spec plan", "Per-phase details" closed,
 *   and they open the old content (phase 33's encounter lines unchanged).
 * - Summary: cells show the drains as icon + number, no drain sentence, no "best preset" text.
 * - Phone width (390 px): no horizontal page scroll on Search, Plan and Summary.
 * Screenshots docs/screenshots/phase34-check-*.png (the before / after set: scripts/phase34Shots.mjs).
 */
import { chromium } from '@playwright/test';

const BASE = (process.argv[2] || 'http://localhost:3001/osrs-dps/').replace(/\/?$/, '/');
const BRIEFING = [
  'Flying shield: Tonalztics 4 hits → Def 156 · Grounded: Tonalztics 4 hits → Def 156',
  'Bork: Elder maul 2 specs → Def 180 · Smorks: Tonalztics 10 hits → Def 0', // phase 35b; phase 36: one spec budget
  'Tonalztics 2 hits → Def 117',
  'Tonalztics 2 hits → Def 102',
  'P1 at a corner: Tonalztics 2 hits → Def 129 · P3 last quadrant, Deflect Melee: Tonalztics 3 hits → Def 150',
];
// phase 35b: one line per NPC (phase 33: Bork's line only, "Start of fight: … → Def 180 · 99.6%")
const BORK_LINE = 'Bork: 2 Elder maul carriers (4 specs) → Def 180 · 96% · Smorks: 4 Tonalztics carriers (8 specs) → Def 0 · 85%'; // phase 36

let failures = 0;
const check = (ok, msg) => {
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`);
};
const shot = async (page, name) => {
  await page.mouse.move(0, 0);
  await page.screenshot({ path: `docs/screenshots/phase34-check-${name}.png`, fullPage: true });
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
// The best-setup panel and everything in it stays within the viewport, except inside its own horizontal scrollers
// (the wide tables). The upstream top bar is 393 px wide at 390 (the main calculator too): not this page's.
const noHorizontalScroll = async (page, what) => {
  const r = await page.evaluate(() => {
    const cw = document.documentElement.clientWidth;
    let root = document.querySelector('[data-testid="raid-tabs"]');
    while (root && !String(root.className).includes('max-w-[1420px]')) root = root.parentElement;
    const scroller = (e) => { for (let a = e.parentElement; a && a !== root; a = a.parentElement) { if (['auto', 'scroll'].includes(getComputedStyle(a).overflowX)) return true; } return false; };
    const wide = Array.from(root.querySelectorAll('*')).filter((e) => e.checkVisibility() && e.getBoundingClientRect().right > cw + 1 && !scroller(e));
    return { cw, n: wide.length, first: wide.slice(0, 3).map((e) => `${e.tagName} ${e.dataset.testid || ''} ${Math.round(e.getBoundingClientRect().right)}`) };
  });
  check(r.n === 0, `${what} at 390 px: nothing wider than the viewport outside a table scroller (${r.n}${r.n ? `: ${r.first.join('; ')}` : ''})`);
};
// the text a user sees (closed <details> content and hidden elements left out)
const visibleText = async (page, sel) => page.locator(sel).evaluate((root) => {
  const out = [];
  const walk = (n) => {
    if (n.nodeType === 3) {
      if (n.parentElement && n.parentElement.checkVisibility() && !n.parentElement.closest('.sr-only')) out.push(n.textContent);
      return;
    }
    n.childNodes.forEach(walk);
  };
  walk(root);
  return out.join(' ').replace(/\s+/g, ' ');
});

const main = async () => {
  const t0 = Date.now();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
  await page.goto(`${BASE}best-setup`, { waitUntil: 'load', timeout: 120000 });
  await page.evaluate(() => localStorage.removeItem('mxeaez-dps:not-owned'));
  await page.reload({ waitUntil: 'load', timeout: 120000 });
  await page.locator('[data-testid="raid-tab-fractured-archive"]').waitFor({ timeout: 120000 });
  await page.locator('[data-testid="raid-tab-fractured-archive"]').click();

  // --- potion pickers
  const melee = page.locator('[data-testid="bs-potion-melee"]');
  check(await melee.locator('img').count() === 1 && (await text(melee)).startsWith('Super combat'), `melee potion picker shows its icon: "${await text(melee)}"`);
  await melee.click();
  const opts = async () => page.locator('[data-testid="bs-potion-melee-option"]').evaluateAll((els) => els.map((e) => ({ label: e.textContent.trim(), img: !!e.querySelector('img') })));
  const first = await opts();
  check(JSON.stringify(first.map((o) => o.label)) === JSON.stringify(['Super combat', 'Overload (+)', 'Smelling salts']) && first.every((o) => o.img), `relevant choices first, with icons: ${first.map((o) => o.label).join(', ')}`);
  await page.locator('[data-testid="bs-potion-melee-more"]').click();
  const all = await opts();
  check(all.length > 10 && all.every((o) => o.img), `"more" lists the rest, with icons (${all.length} options)`);
  await page.locator('[data-testid="bs-potion-melee-option"][data-value]', { hasText: 'Overload (+)' }).first().click();
  check((await text(melee)).startsWith('Overload (+)'), 'picking Overload (+) sets it');
  await melee.click();
  await page.locator('[data-testid="bs-potion-melee-option"]', { hasText: 'Super combat' }).first().click();
  check((await text(melee)).startsWith('Super combat'), 'back to Super combat');
  const heart = page.locator('[data-testid="bs-potion-magic"]');
  await heart.click();
  const hearts = await page.locator('[data-testid="bs-potion-magic-option"]').allInnerTexts();
  check(JSON.stringify(hearts.map((h) => h.trim())) === JSON.stringify(['Saturated heart', 'Imbued heart']), `Heart: ${hearts.join(', ')}`);
  await page.keyboard.press('Escape');

  // --- Plan (Team) first, so "Specs I bring" follows it
  await page.locator('[data-testid="plan-tab"]').click();
  await waitPlan(page);
  const total = await text(page.locator('[data-testid="plan-total"]'));
  check(total === '21:04.9', `FA Team total ${total} (phase 33: 21:44.4)`);
  const rows = await page.locator('[data-testid="plan-briefing-row"]').evaluateAll((els) => els.map((e) => ({
    id: e.dataset.encounter,
    specs: e.dataset.specs,
    bossImg: !!e.querySelector('td img'),
    loadouts: Array.from(e.querySelectorAll('[data-testid="briefing-loadout"]')).map((l) => l.querySelectorAll('img').length),
    specIcons: Array.from(e.querySelectorAll('[data-testid="drain-brief-item"]')).map((i) => !!i.querySelector('img')),
    counts: Array.from(e.querySelectorAll('[data-testid="drain-brief-count"]')).map((c) => ({ text: c.textContent, bold: getComputedStyle(c).fontWeight >= 600 })),
    seconds: e.querySelector('[data-testid="plan-briefing-seconds"]').textContent,
    title: e.querySelector('[data-testid="plan-briefing-specs"]').getAttribute('title'),
  })));
  rows.forEach((r) => console.log(`     ${r.id}: ${r.specs} · ${r.seconds}`));
  check(JSON.stringify(rows.map((r) => r.specs)) === JSON.stringify(BRIEFING), 'briefing specs = the pinned short lines');
  check(rows.every((r) => r.bossImg && r.loadouts.length > 0 && r.loadouts.every((n) => n >= 5) && r.specIcons.length > 0 && r.specIcons.every(Boolean)), 'every briefing row: boss image, loadout icons, a weapon icon per spec');
  check(rows.every((r) => r.counts.every((c) => c.bold)), 'the spec numbers are bold');
  check(rows.find((r) => r.id === 'bork-smorks')?.title === BORK_LINE, 'the briefing tooltip is phase 33\'s encounter line');
  check(JSON.stringify(rows.map((r) => r.seconds)) === JSON.stringify(['174.8 s', '188.0 s', '65.3 s', '181.6 s', '655.2 s']), 'briefing seconds (phase 36)');
  check(/^Bring: Zaryte crossbow, Burning claws, Surge potion/.test(await text(page.locator('[data-testid="plan-bring"]'))) && await visible(page, '[data-testid="plan-share"]'), 'Bring and your share visible (phase 36: damage specs + Surge potion)');
  for (const [id, inner] of [['plan-why-details', 'kit-loadout'], ['plan-spec-details', 'plan-team-briefing'], ['plan-phase-details', 'plan-encounters']]) {
    const closed = !(await page.locator(`details[data-testid="${id}"]`).evaluate((d) => d.open));
    const hidden = !(await visible(page, `[data-testid="${inner}"]`));
    check(closed && hidden, `${id} closed by default (${inner} hidden)`);
  }
  const planText = await visibleText(page, '[data-testid="plan-result"]');
  check(!/carriers \(\d+ specs\)|Kit loadouts|Alternatives|candidate loadouts|Added in this order|% land/.test(planText), 'default Plan view: no sentence-form drain text, kit list, alternatives or stats');
  await shot(page, 'plan');
  await page.locator('[data-testid="plan-why-toggle"]').click();
  check(await visible(page, '[data-testid="kit-loadout"]') && await visible(page, '[data-testid="plan-alternatives"]') && await visible(page, '[data-testid="plan-stats"]'), '"Why this kit" opens the loadout list, alternatives, stats');
  const kitIcons = await page.locator('[data-testid="kit-loadout"]').evaluateAll((els) => els.every((e) => e.querySelector('div > span img, div > img')));
  check(kitIcons, 'loadout names ("Worn: …", "Switch: …") have their weapon icon');
  check(await page.locator('[data-testid="plan-potions"] img').count() >= 2 && await page.locator('[data-testid="plan-ring-result"] img').count() >= 2, 'potions and ring lines have icons');
  check(await page.locator('[data-testid="plan-alternatives"] li img').count() >= 6, 'alternatives list has weapon icons');
  await page.locator('[data-testid="plan-spec-toggle"]').click();
  check(await visible(page, '[data-testid="plan-team-briefing"]') && await visible(page, '[data-testid="plan-team-steps"]'), '"Spec plan" opens the team briefing table and "added in this order"');
  await page.locator('[data-testid="plan-phase-details-toggle"]').click();
  check(await visible(page, '[data-testid="plan-encounters"]') && await visible(page, '[data-testid="plan-routes"]'), '"Per-phase details" opens the encounter table and the routes');
  const bork = await page.locator('[data-testid="plan-encounter-row"][data-encounter="bork-smorks"] [data-testid="plan-encounter-drains"]').getAttribute('data-text');
  check(bork === BORK_LINE, `encounter line unchanged: "${bork}"`);
  await page.locator('[data-testid="plan-phase-toggle"]').click();
  const agRow = await text(page.locator('[data-testid="plan-phase-row"][data-encounter="archive-guardian"] [data-testid="plan-phase-drains"]').first());
  check(/needs 4 landed hits · 4 specs \(2 carriers\) = 8 attacks, 4 must land · 98%/.test(agRow), `per-phase row reworded: "${agRow}"`);
  await shot(page, 'plan-open');
  await page.locator('[data-testid="plan-phase-toggle"]').click();
  await page.locator('[data-testid="plan-result"] details').evaluateAll((els) => els.forEach((d) => { d.open = false; }));

  // --- Search
  await page.locator('[data-testid="search-tab"]').click();
  await waitSearch(page);
  const brief = await page.locator('[data-testid="spec-plan"] [data-testid="drain-brief-item"]').evaluateAll((els) => els.map((e) => ({ w: e.dataset.weapon, t: e.textContent, img: !!e.querySelector('img') })));
  const res = await text(page.locator('[data-testid="spec-plan"] [data-testid="drain-brief-result"]'));
  console.log(`     Search drain box: ${brief.map((b) => `${b.w} ${b.t}`).join(' + ')} ${res}`);
  check(brief.length === 1 && brief[0].w === 'tonalztics' && brief[0].t === '4 hits' && brief[0].img && res === '→ Def 156 · Magic def 130', 'Search header: [Tonalztics] 4 hits → Def 156 · Magic def 130');
  const boxText = await visibleText(page, '[data-testid="spec-plan"]');
  check(!/needs |% land|Chance of the Defence floor|Per boss minimum|fight ≈/.test(boxText), `drain box default view: no sentence form ("${boxText.trim()}")`);
  await page.locator('[data-testid="spec-plan-details-toggle"]').click();
  check(await visible(page, '[data-testid="spec-plan"] [data-testid="drain-line"]') && await visible(page, '[data-testid="drain-pfloor"]') && await visible(page, '[data-testid="team-table"]'), '"details" opens the sentence form, the chance of the floor and the per-boss table');
  const sentence = await text(page.locator('[data-testid="spec-plan"] [data-testid="drain-line-count"]').first());
  // phase 36: the plan's carriers are 2 Elder maul + 4 Tonalztics
  check(sentence === 'needs 4 landed hits · 4 specs (2 carriers) = 8 attacks, 4 must land · 98% · team: 8 specs (4 carriers) · >99.9%', `sentence form: "${sentence}"`);
  const searchText = await visibleText(page, '[data-testid="search-view"]');
  check(!/search started from|vs best preset|evaluations|Exp\. TTK \(top row only\)|Best preset/.test(searchText), 'Search: no "search started from", "vs best preset", evaluation counts, TTK note or best preset in the default view');
  check(!(await visible(page, '[data-testid="search-ranked-at"]')), 'ranked-at under "Search details"');
  await page.locator('[data-testid="search-details-toggle"]').click();
  check(await visible(page, '[data-testid="search-ranked-at"]') && await visible(page, '[data-testid="search-best-preset"]'), '"Search details" opens ranked-at and the best preset');
  check(await page.locator('[data-testid="search-row"]').first().locator('[data-testid="weapon-line"] img').count() >= 1, 'rows: weapon line with icons');
  await shot(page, 'search-open');

  // --- Summary
  await page.locator('[data-testid="summary-tab"]').click();
  await page.waitForTimeout(1500);
  await page.locator('[data-testid="summary-progress"]').waitFor({ state: 'detached', timeout: 1800000 });
  const cells = await page.locator('[data-testid="summary-cell"]').evaluateAll((els) => els.map((e) => ({
    brief: e.querySelectorAll('[data-testid="drain-brief-item"]').length,
    icons: Array.from(e.querySelectorAll('[data-testid="drain-brief-item"]')).every((i) => i.querySelector('img')),
    line: e.querySelectorAll('[data-testid="drain-line"]').length,
    load: e.querySelectorAll('[data-testid="summary-load"]').length,
  })));
  const sumText = await visibleText(page, '[data-testid="summary"]');
  check(cells.length > 40 && cells.every((c) => c.line === 0 && c.icons && c.load === 1) && cells.some((c) => c.brief > 0), `Summary: ${cells.length} cells, drains as icon + number, a load button each`);
  check(!/best preset|fight ≈|needs |% land/.test(sumText), 'Summary: no "best preset", budget or drain sentences visible');
  await shot(page, 'summary');

  // --- phone
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(1000);
  await noHorizontalScroll(page, 'Summary');
  await page.locator('[data-testid="search-tab"]').click();
  await waitSearch(page);
  await noHorizontalScroll(page, 'Search');
  await page.locator('[data-testid="plan-tab"]').click();
  await waitPlan(page);
  await noHorizontalScroll(page, 'Plan');
  await shot(page, 'plan-phone');

  await browser.close();
  console.log(`${failures ? `${failures} FAILED` : 'all OK'} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  process.exit(failures ? 1 : 0);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
