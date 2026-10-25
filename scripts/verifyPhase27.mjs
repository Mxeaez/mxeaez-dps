/**
 * Phase 27 UI check (not part of the Jest run): Plan tab potions from the kit, comfort supplies, ring policy.
 *
 * Usage (dev server running): node scripts/verifyPhase27.mjs [baseUrl]
 * - FA Plan inputs: "Comfort supplies (your call)" with brew / restore / food / other only (no ranging / super combat
 *   inputs), the "Potions: chosen from the kit" note, the ring policy (phase 30: a "Rings" dropdown with the inputs,
 *   default Camp one ring, its one-line summary next to it).
 * - Camp one ring (default): every kit loadout wears the chosen ring; the inventory grid shows one Super combat if the
 *   kit has a melee loadout and one Ranging potion if ranged (matching "Potions (from the kit)"); prints the total and
 *   the other rings' times.
 * - Allow ring switches / Camp Lightbearer: the kit's rings and the total change; Lightbearer on every loadout and no
 *   Lightbearer inventory cell under Camp Lightbearer.
 * - ToA: no combat potions (the raid's potion), "Other" is a comfort supply.
 * Screenshots docs/screenshots/phase27-*.png.
 */
import { chromium } from '@playwright/test';
import { openSections } from './phase34Sections.mjs';

const BASE = (process.argv[2] || 'http://localhost:3001/osrs-dps/').replace(/\/?$/, '/');

let failures = 0;
const check = (ok, msg) => {
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`);
};
const shot = async (page, name) => {
  await page.mouse.move(0, 0);
  await page.screenshot({ path: `docs/screenshots/phase27-${name}.png`, fullPage: true });
};
const waitPlan = async (page) => {
  await page.waitForTimeout(1200);
  await page.locator('[data-testid="plan-progress"]').waitFor({ state: 'detached', timeout: 900000 });
  await page.locator('[data-testid="plan-result"]').waitFor({ timeout: 900000 });
  await openSections(page); // phase 34: open the sections what this script reads moved into
};
const readPlan = async (page) => ({
  total: (await page.locator('[data-testid="plan-total"]').innerText()).trim(),
  free: Number(await page.locator('[data-testid="free-slots"]').getAttribute('data-free')),
  kit: await page.locator('[data-testid="kit-loadout"]').evaluateAll((els) => els.map((e) => ({
    label: e.textContent.replace(/\s+/g, ' ').trim().split(' · ')[0],
    group: e.getAttribute('data-group'),
    ring: e.getAttribute('data-ring'),
  }))),
  cells: await page.locator('[data-testid="inventory-cell"]').evaluateAll((els) => els.map((e) => ({ kind: e.getAttribute('data-kind'), label: e.getAttribute('data-label') }))),
  potions: (await page.locator('[data-testid="plan-potions"]').innerText()).trim(),
  ring: await page.locator('[data-testid="plan-ring-result"]').getAttribute('data-ring'),
  policy: await page.locator('[data-testid="plan-ring-result"]').getAttribute('data-policy'),
  ringLine: (await page.locator('[data-testid="plan-ring-result"]').innerText()).replace(/\s+/g, ' ').trim(),
  // phase 30: the ring policy is a dropdown with the inputs; its one-line summary is next to it
  summary: (await page.locator('[data-testid="plan-ring-summary-text"]').innerText()).replace(/\s+/g, ' ').trim(),
});
const count = (cells, label) => cells.filter((c) => c.label === label).length;
const checkPotions = (p, name) => {
  const groups = new Set(p.kit.map((k) => k.group));
  check(count(p.cells, 'Super combat') === (groups.has('melee') ? 1 : 0), `${name}: Super combat cells ${count(p.cells, 'Super combat')} (melee loadout: ${groups.has('melee')})`);
  check(count(p.cells, 'Ranging potion') === (groups.has('ranged') ? 1 : 0), `${name}: Ranging potion cells ${count(p.cells, 'Ranging potion')} (ranged loadout: ${groups.has('ranged')})`);
  check(groups.has('melee') === p.potions.includes('Super combat') && groups.has('ranged') === p.potions.includes('Ranging potion'), `${name}: "${p.potions}"`);
};
const print = (p, name) => {
  console.log(`     ${name}: ${p.total}, free ${p.free}; ${p.ringLine}`);
  p.kit.forEach((k) => console.log(`       ${k.label} [${k.group}] ring=${k.ring}`));
};

const main = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 1300 } });
  await page.goto(`${BASE}best-setup`, { waitUntil: 'load', timeout: 120000 });
  await page.evaluate(() => localStorage.removeItem('mxeaez-dps:not-owned'));
  await page.reload({ waitUntil: 'load', timeout: 120000 });
  await page.locator('[data-testid="raid-tab-fractured-archive"]').waitFor({ timeout: 120000 });
  await page.locator('[data-testid="raid-tab-fractured-archive"]').click();
  await page.locator('[data-testid="drain-team"]').click();
  await page.locator('[data-testid="plan-tab"]').click();
  await page.locator('[data-testid="plan-view"]').waitFor({ timeout: 30000 });

  // --- inputs
  const supplyIds = await page.locator('[data-testid="plan-supplies"] input[id^="plan-supply-"]').evaluateAll((els) => els.map((e) => e.id.replace('plan-supply-', '')));
  check(JSON.stringify(supplyIds) === JSON.stringify(['brew', 'restore', 'food', 'other']), `comfort supply inputs: ${supplyIds.join(', ')} (no ranging / super combat)`);
  const supLabel = await page.locator('[data-testid="plan-supplies"]').innerText();
  check(/Comfort supplies \(your call, 10 slots\)/.test(supLabel), 'label "Comfort supplies (your call, 10 slots)" (6 brews + 4 restores)');
  await openSections(page, ['plan-advanced']); // phase 34: the potions note moved to Advanced (plan)
  check(/Potions: chosen from the kit/.test(await page.locator('[data-testid="plan-potions-note"]').innerText()), 'potions note shown');
  // phase 30: the ring policy left Advanced: a dropdown with the inputs, its summary next to it
  check(await page.locator('[data-testid="plan-ring-policy"]').isVisible() && await page.locator('[data-testid="plan-ring-policy"]').inputValue() === 'camp-one', 'ring policy dropdown with the inputs (not under Advanced): Camp one ring');

  // --- camp one ring (default)
  let t0 = Date.now();
  await waitPlan(page);
  console.log(`     first plan (incl. searches): ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  const camp = await readPlan(page);
  print(camp, 'camp one ring');
  check(camp.policy === 'camp-one' && !!camp.ring && camp.kit.every((k) => k.ring === camp.ring), `camp one ring: every loadout wears ${camp.ring}`);
  check(camp.summary.includes(`one ring on every loadout: ${camp.ring}`), `summary "${camp.summary}"`);
  check(!camp.cells.some((c) => c.kind === 'switch' && /ring$|Lightbearer/.test(c.label) && c.label !== camp.ring), 'no ring switch items in the inventory');
  checkPotions(camp, 'camp one ring');
  // review fix: rings not planned in full are estimates, never a precise delta
  check(/others: .*((estimate)|not planned in full)/.test(camp.ringLine), 'screen-only rings shown as estimates');
  // review fix: a supplies change re-plans from the caches
  await page.locator('#plan-supply-brew').fill('7');
  t0 = Date.now();
  await waitPlan(page);
  const replan = (Date.now() - t0) / 1000;
  console.log(`     re-plan after a supplies change: ${replan.toFixed(1)} s`);
  // phase 36: ≤ 60 s (was 20 s: the spec budget's DP re-runs with the kit)
  check(replan <= 60, `re-plan ≤ 60 s (${replan.toFixed(1)} s)`);
  await page.locator('#plan-supply-brew').fill('6');
  await waitPlan(page);
  check(camp.cells.length === 28, '28 inventory cells');
  await openSections(page, ['plan-advanced']); // phase 34: opened above already (a click would close it)
  await shot(page, 'fa-camp-one');

  // --- allow switches
  await page.locator('[data-testid="plan-ring-policy"]').selectOption('switch');
  await waitPlan(page);
  const sw = await readPlan(page);
  print(sw, 'allow switches');
  check(sw.policy === 'switch' && sw.ring === '', 'allow switches: no camped ring');
  check(sw.summary.startsWith('each loadout wears its own best ring'), `summary "${sw.summary}"`);
  check(JSON.stringify(sw.kit.map((k) => k.ring)) !== JSON.stringify(camp.kit.map((k) => k.ring)) || sw.total !== camp.total, `rings or total changed (${camp.total} → ${sw.total})`);
  checkPotions(sw, 'allow switches');
  await shot(page, 'fa-switch');

  // --- camp Lightbearer
  await page.locator('[data-testid="plan-ring-policy"]').selectOption('camp-lightbearer');
  await waitPlan(page);
  const lb = await readPlan(page);
  print(lb, 'camp Lightbearer');
  check(lb.policy === 'camp-lightbearer' && lb.kit.every((k) => k.ring === 'Lightbearer'), 'camp Lightbearer: Lightbearer on every loadout');
  check(count(lb.cells, 'Lightbearer') === 0, 'the pinned Lightbearer is worn (no inventory cell)');
  check(lb.total !== camp.total, `total changed (${camp.total} → ${lb.total})`);
  checkPotions(lb, 'camp Lightbearer');
  await shot(page, 'fa-camp-lightbearer');

  // --- ToA: the raid potion only
  await page.locator('[data-testid="raid-tab-toa"]').click();
  await page.waitForTimeout(500);
  await page.locator('[data-testid="plan-tab"]').click();
  await page.locator('[data-testid="plan-view"]').waitFor({ timeout: 30000 });
  await openSections(page, ['plan-advanced']);
  check(/raid's own potion/.test(await page.locator('[data-testid="plan-potions-note"]').innerText()), 'ToA: the raid potion note');
  await waitPlan(page);
  const toa = await readPlan(page);
  print(toa, 'ToA camp one ring');
  check(count(toa.cells, 'Super combat') + count(toa.cells, 'Ranging potion') === 0 && toa.potions.endsWith('none'), 'ToA: no combat potions');
  check(toa.kit.every((k) => k.ring === toa.ring), `ToA: every loadout wears ${toa.ring}`);
  await shot(page, 'toa-camp-one');

  await browser.close();
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks OK');
  process.exitCode = failures ? 1 : 0;
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
