/**
 * Phase 32 UI check (not part of the Jest run): zero-value switch items and the drain-line units.
 *
 * Usage (dev server running): node scripts/verifyPhase32.mjs [baseUrl]
 * - The user's plan (2026-10-24): FA, party 4, Rings: Camp Lightbearer, 6 brew / 4 restore / 0 food / 2 other, 1 rune
 *   pouch, "Items I don't own" = Obligator, Zorya's tome, Rondache, Inquisitor's great helm / hauberk / plateskirt /
 *   mace. Rada's blessing 4 is in no kit loadout and no inventory cell (phase 31: in the melee switch, a slot); the melee
 *   switch is 9 items (was 10); the freed slot is spent (the void Ascension switch fires Onyx bolts, −1.1 s) or free:
 *   total 25:46.3 (phase 31: 25:47.4). Prints the kit and the free-slot tooltip.
 * - A worn set without ammo of its own (when the plan has one) shows the kit's ammo in its ammo slot ("worn here too")
 *   and that ammo has no inventory cell.
 * - Search drain box, AG Flying, Team (Advanced 2 / 2 / 1): "needs 4 landed hits · 4 specs (2 carriers), 8 swings · 98%"
 *   with no team part (the team brings what is needed); the tooltip explains swings and the %; Xarth: "… · team: 4 specs
 *   (2 carriers) · >99.9%". Solo with Tonalztics: "needs 3 landed hits · 2 specs, 4 swings · → Def 167" (no carriers).
 * Screenshots docs/screenshots/phase32-*.png.
 */
import { chromium } from '@playwright/test';

const BASE = (process.argv[2] || 'http://localhost:3001/osrs-dps/').replace(/\/?$/, '/');
const USER_TOTAL = process.env.USER_TOTAL || '25:46.3';
const USER_TOTAL_PHASE31 = '25:47.4';
const NOT_OWNED = ['Obligator', "Zorya's tome", 'Rondache', "Inquisitor's great helm", "Inquisitor's hauberk", "Inquisitor's plateskirt", "Inquisitor's mace"];
const BLESSING = "Rada's blessing 4";

let failures = 0;
const check = (ok, msg) => {
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`);
};
const shot = async (page, name) => {
  await page.mouse.move(0, 0);
  await page.screenshot({ path: `docs/screenshots/phase32-${name}.png`, fullPage: true });
};
const text = async (loc) => (await loc.innerText()).replace(/\s+/g, ' ').trim();
const waitPlan = async (page) => {
  // the ring policy / inputs may start a second run: wait until no progress bar shows for a few seconds
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
const cells = async (page) => page.locator('[data-testid="inventory-cell"]').evaluateAll((els) => els.map((e) => ({ kind: e.dataset.kind, label: e.dataset.label })));
const kitLoadouts = async (page) => page.locator('[data-testid="kit-loadout"]').evaluateAll((els) => els.map((e) => ({
  group: e.dataset.group,
  items: Array.from(e.querySelectorAll('img')).map((i) => i.alt || i.title),
  text: e.textContent.replace(/\s+/g, ' ').trim(),
})));

/** The kept-ammo checks of one plan result (when the worn set has no ammo of its own). */
const checkKept = async (page, tag) => {
  const kept = page.locator('[data-testid="worn-slot"][data-slot="ammo"][data-kept="true"]');
  if (!await kept.count()) {
    console.log(`     ${tag}: the worn set has its own ammo (or no loadout has any): nothing kept`);
    return false;
  }
  const item = await kept.getAttribute('data-item');
  const title = await kept.getAttribute('title');
  check(/a switch's ammo, worn here too/.test(title ?? ''), `${tag}: worn ammo slot keeps ${item} ("${title}")`);
  check(!(await cells(page)).some((c) => c.label === item), `${tag}: ${item} has no inventory cell`);
  const slotsTitle = await page.locator('[data-testid="free-slots"]').getAttribute('title');
  check(slotsTitle?.includes(`(${item} worn in the ammo slot)`), `${tag}: free-slots tooltip "${slotsTitle}"`);
  return true;
};

const main = async () => {
  const t0 = Date.now();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 1300 } });
  await page.goto(`${BASE}best-setup`, { waitUntil: 'load', timeout: 120000 });
  await page.evaluate(() => localStorage.removeItem('mxeaez-dps:not-owned'));
  await page.reload({ waitUntil: 'load', timeout: 120000 });
  await page.locator('[data-testid="raid-tab-fractured-archive"]').waitFor({ timeout: 120000 });
  await page.locator('[data-testid="raid-tab-fractured-archive"]').click();

  // --- Search drain box (Team, before any plan: the Advanced 2 / 2 / 1)
  await page.locator('[data-testid="drain-team"]').click();
  const drainItem = (w) => page.locator(`[data-testid="spec-plan"] [data-testid="drain-line-item"][data-weapon="${w}"]`);
  const drainCount = (w) => drainItem(w).locator('[data-testid="drain-line-count"]');
  await page.locator('[data-testid="boss-select"]').selectOption('ag-flying');
  await waitSearch(page);
  const ag = await text(drainCount('tonalztics'));
  check(ag === 'needs 4 landed hits · 4 specs (2 carriers), 8 swings · 98%', `AG Flying Tonalztics (Team): "${ag}"`);
  const agTitle = await drainItem('tonalztics').getAttribute('title');
  check(/a charged Tonalztics spec swings twice and each swing can miss; the % is the chance the Defence reaches the floor in the first round with these specs and the other weapons' specs/.test(agTitle ?? ''), `AG Flying tooltip: "${agTitle}"`);
  const agAyak = await text(drainCount('ayak'));
  check(/^needs ≈ \d+ magic defence drained · 2 specs \(1 carrier\) · → magic def \d+$/.test(agAyak), `AG Flying Eye of Ayak (Team): "${agAyak}"`);
  await shot(page, 'drain-ag-flying');
  await page.locator('[data-testid="boss-select"]').selectOption('xarth');
  await waitSearch(page);
  const xTona = await text(drainCount('tonalztics'));
  const xMaul = await text(drainCount('elderMaul'));
  check(xTona === 'needs 2 landed hits · 2 specs (1 carrier), 4 swings · 97% · team: 4 specs (2 carriers) · >99.9%', `Xarth Tonalztics (Team): "${xTona}"`);
  check(xMaul === 'not needed · team: 4 specs (2 carriers) · >99.9%', `Xarth Elder maul (Team): "${xMaul}"`);
  await page.locator('[data-testid="boss-select"]').selectOption('bork');
  await waitSearch(page);
  console.log(`     Bork (Team): "${await text(drainCount('elderMaul'))}" | "${await text(drainCount('tonalztics'))}"`);

  // --- Solo with Tonalztics (Specs I bring)
  await page.locator('[data-testid="drain-solo"]').click();
  // phase 33: "Specs I bring" defaults to "Planner decides" (read-only chips): pick by hand
  await page.locator('[data-testid="my-specs-mode"]').selectOption('manual');
  const tonaToggle = page.locator('[data-testid="bs-my-tonalztics"]');
  if ((await tonaToggle.getAttribute('aria-pressed')) !== 'true') await tonaToggle.click();
  await page.locator('[data-testid="boss-select"]').selectOption('ag-flying');
  await waitSearch(page);
  const solo = await text(drainCount('tonalztics'));
  check(/^needs \d+ landed hits? · \d+ specs?, \d+ swings · /.test(solo) && !/carrier|team:/.test(solo), `AG Flying Tonalztics (Solo): "${solo}"`);
  await shot(page, 'drain-solo');
  await tonaToggle.click();
  await page.locator('[data-testid="my-specs-mode"]').selectOption('auto');
  await page.locator('[data-testid="drain-team"]').click();

  // --- the user's plan
  await page.evaluate((l) => localStorage.setItem('mxeaez-dps:not-owned', JSON.stringify(l)), NOT_OWNED);
  await page.reload({ waitUntil: 'load', timeout: 120000 });
  await page.locator('[data-testid="raid-tab-fractured-archive"]').click();
  await page.locator('#bs-party').fill('4');
  await page.locator('#bs-party').blur();
  await page.locator('[data-testid="plan-tab"]').click();
  await page.locator('[data-testid="plan-view"]').waitFor({ timeout: 30000 });
  await page.locator('[data-testid="plan-ring-policy"]').selectOption('camp-lightbearer');
  for (const [id, v] of [['brew', 6], ['restore', 4], ['food', 0], ['other', 2]]) await page.locator(`#plan-supply-${id}`).fill(String(v));
  await page.locator('#plan-nonitem').fill('1');
  await waitPlan(page);
  const total = await text(page.locator('[data-testid="plan-total"]'));
  const free = Number(await page.locator('[data-testid="free-slots"]').getAttribute('data-free'));
  const freeTitle = await page.locator('[data-testid="free-slots"]').getAttribute('title');
  const kit = await kitLoadouts(page);
  kit.forEach((l) => console.log(`     ${l.text}\n       ${l.items.join(' | ')}`));
  check(kit.every((l) => !l.items.includes(BLESSING)), 'no kit loadout wears Rada\'s blessing 4');
  check(!(await cells(page)).some((c) => c.label === BLESSING), 'no inventory cell holds Rada\'s blessing 4');
  const melee = kit.filter((l) => l.group === 'melee');
  check(melee.length > 0 && melee.every((l) => l.items.length === 9), `melee switch: ${melee.map((l) => `${l.items.length} items`).join(', ')} (phase 31: 10 with the blessing)`);
  check(total === USER_TOTAL, `user plan total ${total} (expected ${USER_TOTAL}; phase 31: ${USER_TOTAL_PHASE31}); free ${free}: "${freeTitle}"`);
  const onyx = kit.some((l) => l.items.includes('Onyx ascension bolts (e)'));
  check(free > 0 || onyx, `the freed slot is free (${free}) or bought the Onyx bolts switch (${onyx})`);
  await checkKept(page, 'user plan');
  await shot(page, 'user-plan');

  // --- FA defaults (6-man): a melee worn set, if the plan has one, keeps the ranged switch's ammo
  await page.evaluate(() => localStorage.removeItem('mxeaez-dps:not-owned'));
  await page.reload({ waitUntil: 'load', timeout: 120000 });
  await page.locator('[data-testid="raid-tab-fractured-archive"]').click();
  await page.locator('[data-testid="plan-tab"]').click();
  await page.locator('[data-testid="plan-view"]').waitFor({ timeout: 30000 });
  await waitPlan(page);
  const faTotal = await text(page.locator('[data-testid="plan-total"]'));
  const faFree = Number(await page.locator('[data-testid="free-slots"]').getAttribute('data-free'));
  // the same kit as phase 31 (21:44.4, 5 free): the Inquisitor's + Obligator switch is 9 items without the blessing
  check(faTotal === '21:44.4' && faFree === 6, `FA defaults: ${faTotal}, ${faFree} free (phase 31: 21:44.4, 5 free)`);
  check(!(await kitLoadouts(page)).some((l) => l.items.includes(BLESSING)), 'FA defaults: no blessing in the kit');
  await shot(page, 'fa-defaults');

  // --- ToA defaults: the worn Keris partisan (Torva) keeps a switch's bolts in its ammo slot
  await page.locator('[data-testid="raid-tab-toa"]').click();
  await page.waitForTimeout(500);
  await page.locator('[data-testid="plan-tab"]').click();
  await page.locator('[data-testid="plan-view"]').waitFor({ timeout: 30000 });
  await waitPlan(page);
  const toaTotal = await text(page.locator('[data-testid="plan-total"]'));
  check(toaTotal === '14:04.1', `ToA plan total ${toaTotal} (phase 31: 14:04.1)`);
  check(await checkKept(page, 'ToA'), 'ToA: the worn melee set keeps the kit\'s ammo');
  await shot(page, 'kept-ammo');

  await browser.close();
  console.log(`${failures ? `${failures} FAILED` : 'all OK'} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  process.exit(failures ? 1 : 0);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
