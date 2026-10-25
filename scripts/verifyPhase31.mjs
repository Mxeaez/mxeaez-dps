/**
 * Phase 31 UI check (not part of the Jest run): quiver ammo, the heart as magic's kit potion, the Solo slot price.
 *
 * Usage (dev server running): node scripts/verifyPhase31.mjs [baseUrl]
 * - FA Plan (defaults: 6-man, Team, camp one ring, planner decides): "Items I always bring" is empty (no heart); the
 *   total is the phase 31 headline; when the kit carries two arrow / bolt types, the second is drawn on the quiver's
 *   corner (worn grid or inventory cell) with the tooltip "… held in the quiver (0 inventory slots)" and has no
 *   inventory cell; the free-slots tooltip says "ammo held in the quiver".
 * - The heart: beside the potions (a 'potion' inventory cell right after the potions, and in the "Potions (from the
 *   kit)" line) when the kit has a magic loadout, never in the pinned list; FA without Obligator / Ascension crossbows
 *   (a Tumeken's shadow kit) shows it.
 * - Solo (party 1): "Bring: Tonalztics" (phase 30: Elder maul + Tonalztics for 0.6 s), "adding Elder maul … < 1 s per
 *   slot".
 * Screenshots docs/screenshots/phase31-*.png.
 */
import { chromium } from '@playwright/test';
import { openSections } from './phase34Sections.mjs';

const BASE = (process.argv[2] || 'http://localhost:3001/osrs-dps/').replace(/\/?$/, '/');
const FA_TOTAL = process.env.FA_TOTAL || '21:44.4';
const FA_OWNED_TOTAL = process.env.FA_OWNED_TOTAL || '24:34.1'; // phase 32 (phase 31: 24:45.3)
const SOLO_TOTAL = process.env.SOLO_TOTAL || '22:01.9';

let failures = 0;
const check = (ok, msg) => {
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`);
};
const shot = async (page, name) => {
  await page.mouse.move(0, 0);
  await page.screenshot({ path: `docs/screenshots/phase31-${name}.png`, fullPage: true });
};
const text = async (loc) => (await loc.innerText()).replace(/\s+/g, ' ').trim();
const waitPlan = async (page) => {
  await page.waitForTimeout(1200);
  await page.locator('[data-testid="plan-progress"]').waitFor({ state: 'detached', timeout: 900000 });
  await page.locator('[data-testid="plan-result"]').waitFor({ timeout: 900000 });
  await openSections(page); // phase 34: open the sections what this script reads moved into
};
const pinnedNames = async (page) => (await page.locator('[data-testid="pinned-item"]').allInnerTexts()).map((t) => t.replace('×', '').trim());
const cells = async (page) => page.locator('[data-testid="inventory-cell"]').evaluateAll((els) => els.map((e) => ({ kind: e.dataset.kind, label: e.dataset.label })));

/** The quiver / heart checks of one plan result. */
const checkKit = async (page, tag) => {
  const inv = await cells(page);
  const kinds = inv.map((c) => c.kind);
  const potions = await text(page.locator('[data-testid="plan-potions"]'));
  const magic = await page.locator('[data-testid="kit-loadout"][data-group="magic"]').count() > 0;
  const heartCells = inv.filter((c) => c.label === 'Saturated heart');
  if (magic) {
    const ix = inv.findIndex((c) => c.kind === 'potion');
    const lastSupply = kinds.lastIndexOf('supply');
    const potionSupplies = inv.filter((c) => c.kind === 'supply' && /Super combat|Ranging potion/.test(c.label)).length;
    check(heartCells.length === 1 && heartCells[0].kind === 'potion' && /Saturated heart \(magic\)/.test(potions),
      `${tag}: magic kit → the heart beside the potions (cell "${heartCells[0]?.kind}", "${potions}")`);
    check(ix >= 0 && (potionSupplies === 0 || inv[ix - 1]?.kind === 'supply') && ix <= lastSupply + 1, `${tag}: heart cell right after the potion cells (index ${ix})`);
  } else {
    check(heartCells.length === 0 && !/heart/.test(potions), `${tag}: no magic loadout → no heart (${potions})`);
  }
  const badges = page.locator('[data-testid="quiver-ammo"]');
  const nBadges = await badges.count();
  const slotsTitle = await page.locator('[data-testid="free-slots"]').getAttribute('title');
  if (nBadges) {
    const item = await badges.first().getAttribute('data-item');
    const title = await badges.first().getAttribute('title');
    const host = await badges.first().evaluate((e) => {
      const p = e.parentElement;
      return { testid: p.dataset.testid, slot: p.dataset.slot ?? '', kind: p.dataset.kind ?? '', label: p.dataset.label ?? p.dataset.item ?? '' };
    });
    check(nBadges === 1 && title === `${item}: held in the quiver (0 inventory slots)`, `${tag}: quiver-held ${item} ("${title}")`);
    check(/Dizana's quiver|Dizana's max cape/.test(host.label) && (host.slot === 'cape' || host.kind === 'switch'), `${tag}: drawn on the quiver (${host.testid} ${host.slot || host.kind}: ${host.label})`);
    check(!inv.some((c) => c.label === item), `${tag}: ${item} has no inventory cell`);
    check(/− 1 ammo held in the quiver/.test(slotsTitle ?? ''), `${tag}: free-slots tooltip "${slotsTitle}"`);
  } else {
    console.log(`     ${tag}: no second arrow / bolt type in this kit (no quiver badge); free slots "${slotsTitle}"`);
  }
  return { magic, quiver: nBadges > 0 };
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

  // --- FA defaults
  await page.locator('[data-testid="plan-tab"]').click();
  await page.locator('[data-testid="plan-view"]').waitFor({ timeout: 30000 });
  check((await pinnedNames(page)).length === 0, `FA pinned list empty (${(await pinnedNames(page)).join(', ') || 'none'})`);
  await openSections(page, ['plan-advanced']); // phase 34: the potions note moved to Advanced (plan)
  const note = await text(page.locator('[data-testid="plan-potions-note"]'));
  check(/the Saturated heart if magic/.test(note), `potions note: "${note}"`);
  await waitPlan(page);
  const faTotal = await text(page.locator('[data-testid="plan-total"]'));
  check(faTotal === FA_TOTAL, `FA plan total ${faTotal} (expected ${FA_TOTAL}; phase 30: 21:44.4)`);
  const fa = await checkKit(page, 'FA');
  check(fa.quiver, 'FA: the kit has a quiver-held ammo type');
  check((await pinnedNames(page)).length === 0, 'FA pinned list still empty after the plan');
  await shot(page, 'fa-quiver');

  // --- FA without Obligator / Ascension crossbows (a magic kit: the heart)
  await page.evaluate(() => localStorage.setItem('mxeaez-dps:not-owned', JSON.stringify(['Obligator', 'Ascension crossbows'])));
  await page.reload({ waitUntil: 'load', timeout: 120000 });
  await page.locator('[data-testid="raid-tab-fractured-archive"]').click();
  await page.locator('[data-testid="plan-tab"]').click();
  await page.locator('[data-testid="plan-view"]').waitFor({ timeout: 30000 });
  await waitPlan(page);
  const ownedTotal = await text(page.locator('[data-testid="plan-total"]'));
  check(ownedTotal === FA_OWNED_TOTAL, `FA without Obligator / Ascension crossbows ${ownedTotal} (expected ${FA_OWNED_TOTAL})`);
  const owned = await checkKit(page, 'FA owned');
  check(owned.magic, 'FA owned: a magic loadout (the heart case)');
  await shot(page, 'fa-heart');
  await page.evaluate(() => localStorage.removeItem('mxeaez-dps:not-owned'));
  await page.reload({ waitUntil: 'load', timeout: 120000 });
  await page.locator('[data-testid="raid-tab-fractured-archive"]').click();

  // --- Solo, party 1
  await page.locator('[data-testid="plan-tab"]').click();
  await page.locator('[data-testid="plan-view"]').waitFor({ timeout: 30000 });
  await page.locator('#bs-party').fill('1');
  await page.locator('#bs-party').blur();
  await waitPlan(page);
  const soloTotal = await text(page.locator('[data-testid="plan-total"]'));
  const soloBring = await text(page.locator('[data-testid="plan-bring"]'));
  check(soloBring === 'Bring: Tonalztics' && soloTotal === SOLO_TOTAL, `Solo: "${soloBring}", ${soloTotal} (expected Bring: Tonalztics, ${SOLO_TOTAL}; phase 30: Elder maul + Tonalztics 22:01.3)`);
  const maul = page.locator('[data-testid="plan-spec-weapons"] li[data-weapon="elderMaul"]');
  const maulText = (await maul.count()) ? await text(maul.first()) : '';
  check(/^adding Elder maul to this plan: −0\.\d s \(1 slot, < 1 s per slot\)$/.test(maulText), `Solo: "${maulText}"`);
  await checkKit(page, 'Solo');
  await shot(page, 'solo');

  await browser.close();
  console.log(`${failures ? `${failures} FAILED` : 'all OK'} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  process.exit(failures ? 1 : 0);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
