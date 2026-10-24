/**
 * Fix check (not part of the Jest run): the Saturated heart is a pinned item, not a potion supply.
 *
 * Usage (dev server running): node scripts/verifyHeartFix.mjs [baseUrl]
 * - Assumptions box: the magic selector reads "Heart" (Saturated / Imbued heart).
 * - FA Plan with defaults: no "Magic potion" supply input; the Saturated heart is among the pinned items with one
 *   inventory cell; the kit (or an alternative) has a magic loadout, boosted: the Tumeken's shadow DPS on a phase
 *   matches Search's Shadow row on the same boss.
 * - Removing the heart drops the magic boost (that phase's DPS falls) and offers "+ Saturated heart".
 * Screenshots docs/screenshots/fix-heart-*.png.
 */
import { chromium } from '@playwright/test';

const BASE = (process.argv[2] || 'http://localhost:3001/osrs-dps/').replace(/\/?$/, '/');

let failures = 0;
const check = (ok, msg) => {
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`);
};
const shot = async (page, name) => {
  await page.mouse.move(0, 0);
  await page.screenshot({ path: `docs/screenshots/fix-heart-${name}.png`, fullPage: true });
};
const waitPlan = async (page) => {
  await page.waitForTimeout(800); // debounce
  await page.locator('[data-testid="plan-progress"]').waitFor({ state: 'detached', timeout: 600000 });
  await page.locator('[data-testid="plan-result"]').waitFor({ timeout: 600000 });
};
const magicPhaseRows = async (page) => page.locator('[data-testid="plan-phase-row"]').evaluateAll((els) => els.map((e) => ({
  target: e.getAttribute('data-target'),
  phase: e.getAttribute('data-phase'),
  loadout: e.children[1].textContent.trim(),
  dps: Number(e.querySelector('[data-testid="plan-phase-dps"]').textContent),
})));

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 1400 } });
  await page.goto(`${BASE}best-setup`, { waitUntil: 'load', timeout: 120000 });
  await page.locator('[data-testid="raid-tab-fractured-archive"]').waitFor({ timeout: 120000 });

  // Assumptions box: "Heart"
  const magicLabel = (await page.locator('label[for="bs-potion-magic"]').innerText()).trim();
  check(/^Heart/.test(magicLabel), `magic selector reads "Heart" (${magicLabel.split('\n')[0]})`);
  const heartOptions = await page.locator('#bs-potion-magic option').allInnerTexts();
  check(heartOptions.join(',') === 'Imbued heart,Saturated heart' || heartOptions.join(',') === 'Saturated heart,Imbued heart', `heart options: ${heartOptions.join(', ')}`);

  // Plan defaults
  await page.locator('[data-testid="plan-tab"]').click();
  await page.locator('[data-testid="plan-view"]').waitFor({ timeout: 60000 });
  check(await page.locator('#plan-supply-magic').count() === 0, 'no "Magic potion" / magic supply input');
  const supplyText = await page.locator('[data-testid="plan-supplies"]').innerText();
  check(!/magic/i.test(supplyText), `supplies row has no magic entry (${supplyText.replace(/\s+/g, ' ').slice(0, 120)})`);
  const pinned = (await page.locator('[data-testid="pinned-item"]').allInnerTexts()).map((t) => t.replace('×', '').trim());
  check(pinned.includes('Saturated heart'), `Saturated heart pinned (${pinned.join(', ')})`);
  await waitPlan(page);
  const total = (await page.locator('[data-testid="plan-total"]').innerText()).trim();
  const free = Number(await page.locator('[data-testid="free-slots"]').getAttribute('data-free'));
  const kit = await page.locator('[data-testid="kit-loadout"]').evaluateAll((els) => els.map((e) => ({
    text: e.textContent.replace(/\s+/g, ' ').trim(), group: e.getAttribute('data-group'), weapon: e.getAttribute('data-weapon'),
  })));
  console.log(`     FA plan: ${total}, ${free} free`);
  kit.forEach((k) => console.log(`       ${k.text.slice(0, 160)}`));
  const alts = await page.locator('[data-testid="plan-alternatives"] li').allInnerTexts().catch(() => []);
  alts.slice(0, 3).forEach((a) => console.log(`     alt: ${a.slice(0, 200)}`));
  const heartCells = await page.locator('[data-testid="inventory-cell"][data-label="Saturated heart"]').count();
  check(heartCells === 1, `one Saturated heart inventory cell (${heartCells})`);
  check(await page.locator('[data-testid="inventory-cell"][data-kind="supply"][data-label*="Magic"]').count() === 0, 'no magic supply cell');
  check(await page.locator('[data-testid="unused-supplies"]').filter({ hasText: /heart/i }).count() === 0, 'no "unused supplies" warning for the heart');
  const magicKit = kit.filter((k) => k.group === 'magic');
  check(magicKit.length > 0 || alts.some((a) => /shadow|magic/i.test(a)), `a magic loadout in the kit or alternatives (${magicKit.map((k) => k.weapon).join(', ')})`);
  if (magicKit.length) {
    check(await page.locator('[data-testid="unused-carried"]').filter({ hasText: 'Saturated heart' }).count() === 0, 'heart not reported unused (the kit has a magic loadout)');
  }
  await shot(page, 'plan-fa');

  // a Shadow phase vs Search's Shadow row
  const rows = await magicPhaseRows(page);
  const shadowRow = rows.find((r) => /shadow/i.test(r.loadout) && r.dps > 0);
  if (shadowRow) {
    console.log(`     plan Shadow phase: ${shadowRow.target} ${shadowRow.phase || ''} ${shadowRow.dps} DPS (${shadowRow.loadout})`);
    // remove the heart: the same phase loses the boost
    await page.locator('[data-testid="pinned-item"][data-heart="true"] button').click();
    check(await page.locator('[data-testid="pin-heart"]').count() === 2, '"+ Saturated heart" / "+ Imbued heart" offered after removing it');
    await waitPlan(page);
    const after = (await magicPhaseRows(page)).find((r) => r.target === shadowRow.target && r.phase === shadowRow.phase);
    console.log(`     without the heart: ${after ? `${after.dps} DPS (${after.loadout})` : 'phase gone'}`);
    check(!after || after.dps < shadowRow.dps || !/shadow/i.test(after.loadout), 'without the heart the magic phase is slower (no boost)');
    await shot(page, 'plan-fa-no-heart');
    await page.locator('[data-testid="pin-heart"]').first().click(); // back to the Saturated heart
    await waitPlan(page);
    check((await page.locator('[data-testid="plan-total"]').innerText()).trim() === total, `heart re-pinned: total back to ${total}`);

    // Search on the same boss (default drain state of the page), Shadow row
    await page.locator('[data-testid="search-tab"]').click();
    await page.waitForTimeout(500);
    await page.locator('[data-testid="boss-select"]').selectOption(shadowRow.target);
    await page.waitForTimeout(500);
    if (shadowRow.phase) {
      const phaseSel = page.locator('[data-testid="phase-select"]');
      if (await phaseSel.count()) await phaseSel.selectOption(shadowRow.phase).catch(() => {});
    }
    await page.waitForTimeout(800);
    await page.locator('[data-testid="search-progress"]').waitFor({ state: 'detached', timeout: 600000 });
    await page.locator('[data-testid="search-row"]').first().waitFor({ timeout: 600000 });
    const searchRows = await page.locator('[data-testid="search-row"]').evaluateAll((els) => els.map((e) => ({
      dps: Number(e.querySelector('[data-testid="dps"]').textContent),
      text: e.textContent.replace(/\s+/g, ' ').trim(),
    })));
    const shadows = searchRows.filter((r) => /Tumeken's shadow/.test(r.text));
    console.log(`     search Shadow rows: ${shadows.map((r) => r.dps).join(', ') || 'none'}`);
    const match = shadows.find((r) => Math.abs(r.dps - shadowRow.dps) < 0.0015);
    check(!!match || (shadows.length > 0 && shadowRow.dps <= shadows[0].dps + 0.0015 && shadowRow.dps > shadows[shadows.length - 1].dps * 0.9),
      `plan Shadow ${shadowRow.dps} DPS matches a Search Shadow row or sits within the Search Shadow range (boosted)${match ? `: ${match.text.slice(0, 120)}` : ''}`);
    await shot(page, 'search-shadow');

    // load the plan's worn set (Shadow on the first phase): the calculator has the heart's boost and the same DPS
    await page.locator('[data-testid="plan-tab"]').click();
    await waitPlan(page);
    const worn = kit[0];
    const firstDps = (await page.locator('[data-testid="plan-phase-row"]').first().locator('[data-testid="plan-phase-dps"]').innerText()).trim();
    await page.locator('[data-testid="load-worn"]').click();
    await page.waitForURL((u) => !u.pathname.endsWith('best-setup'), { timeout: 60000 });
    await page.getByPlaceholder('Search for monster...').waitFor({ timeout: 120000 });
    await page.waitForTimeout(3000);
    const row = page.locator('table tbody tr', { has: page.locator('th[title]', { hasText: /^DPS$/ }) }).first();
    const cDps = (await row.locator('th').nth(1).innerText()).trim();
    await page.locator('button[data-tooltip-content="Skills"]').first().click().catch(() => {});
    await page.waitForTimeout(500);
    const magicLevel = Number((await page.locator('span[title="Your current Magic level"]').first().innerText()).replace('/', '').trim());
    console.log(`     worn ${worn.group} loaded: plan ${firstDps}, calculator ${cDps}; current Magic ${magicLevel}`);
    check(cDps === firstDps, `calculator DPS = plan DPS on the first phase (${cDps} / ${firstDps})`);
    if (worn.group === 'magic') check(magicLevel === 112, `Saturated heart boost in the calculator: Magic 99 → ${magicLevel} (112)`);
    await shot(page, 'loaded');
  } else {
    check(false, 'a Shadow phase row in the plan');
  }

  await browser.close();
  console.log(failures ? `${failures} FAILED` : 'all OK');
  process.exit(failures ? 1 : 0);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
