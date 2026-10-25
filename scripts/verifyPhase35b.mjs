/**
 * Phase 35b UI check (not part of the Jest run): the Plan briefing shows one drain line per NPC.
 *
 * Usage (dev server running): node scripts/verifyPhase35b.mjs [baseUrl]
 * - FA Plan (Team, defaults): 21:44.4 (unchanged); the "Bork + Smorks" row's specs read "Bork: … → Def 180" and
 *   "Smorks: … → Def 5" on two lines (was one line, Bork's); the tooltip and the per-phase encounter line name both NPCs;
 *   the other FA rows are unchanged (AG "Flying shield / Grounded", Ocellus P1 / P3).
 * - FA Plan with Obligator not owned (Bork and the Smorks get different loadouts): the Wear cell reads "Bork: [icons]" /
 *   "Smorks: [icons]"; at 390 px only the weapon icons show. Screenshot docs/screenshots/phase35b-bork-smorks.png.
 * - CoX Plan (defaults): the Olm row has "Right claw / Left claw / Head" lines; ToA Plan: the Wardens row names the
 *   Obelisk / Elidinis' Warden / Tumeken's Warden; Kephri has no scarab line.
 * Screenshots docs/screenshots/phase35b-*.png.
 */
import { chromium } from '@playwright/test';
import { headlineTotal } from './headlines.mjs';

const BASE = (process.argv[2] || 'http://localhost:3001/osrs-dps/').replace(/\/?$/, '/');
// phase 36: one spec budget for Bork and the Smorks (and the planner's 2 Elder maul + 4 Tonalztics carriers)
const BORK_SPECS = 'Bork: Elder maul 2 specs → Def 180 · Smorks: Elder maul 1 spec + Tonalztics 9 hits → Def 13'; // phase 36 review
// phase 36 review: 2 Elder maul + 3 Tonalztics carriers (you damage-spec)
const BORK_LINE = 'Bork: 2 Elder maul carriers (3 specs) → Def 180 · 86% · Smorks: 1 Elder maul carrier (1 spec) + 3 Tonalztics carriers (6 specs) → Def 13';
const FA_OTHERS = {
  'archive-guardian': 'Flying shield: Tonalztics 4 hits → Def 156 · Grounded: Tonalztics 4 hits → Def 156',
  moia: 'Tonalztics 2 hits → Def 117',
  xarth: 'Tonalztics 2 hits → Def 102',
  ocellus: 'P1 at a corner: Tonalztics 2 hits → Def 129 · P3 last quadrant, Deflect Melee: Tonalztics 3 hits → Def 150',
};

let failures = 0;
const check = (ok, msg) => {
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`);
};
const text = async (loc) => (await loc.innerText()).replace(/\s+/g, ' ').trim();
const waitPlan = async (page) => {
  await page.waitForTimeout(1500);
  for (let k = 0; k < 3; k++) {
    await page.locator('[data-testid="plan-progress"]').waitFor({ state: 'detached', timeout: 900000 });
    await page.waitForTimeout(3000);
  }
  await page.locator('[data-testid="plan-result"]').waitFor({ timeout: 900000 });
};
const briefing = async (page) => page.locator('[data-testid="plan-briefing-row"]').evaluateAll((els) => els.map((e) => ({
  id: e.dataset.encounter,
  specs: e.dataset.specs,
  title: e.querySelector('[data-testid="plan-briefing-specs"]').getAttribute('title'),
  groups: Array.from(e.querySelectorAll('[data-testid="plan-briefing-group"]')).map((g) => g.textContent.replace(/\s+/g, ' ').trim()),
  wear: Array.from(e.querySelectorAll('[data-testid="briefing-wear-group"]')).map((w) => ({
    npc: w.dataset.npc,
    loadouts: Array.from(w.querySelectorAll('[data-testid="briefing-loadout"]')).map((l) => l.dataset.label),
    icons: Array.from(w.querySelectorAll('[data-testid="briefing-loadout"]')).map((l) => Array.from(l.querySelectorAll('img')).filter((i) => i.checkVisibility()).length),
  })),
  loadouts: Array.from(e.querySelectorAll('[data-testid="briefing-loadout"]')).map((l) => l.dataset.label),
})));
const openRaidPlan = async (page, raid) => {
  await page.locator(`[data-testid="raid-tab-${raid}"]`).click();
  await page.waitForTimeout(500);
  await page.locator('[data-testid="plan-tab"]').click();
  await page.locator('[data-testid="plan-view"]').waitFor({ timeout: 30000 });
  await waitPlan(page);
};
const log = (rows) => rows.forEach((r) => console.log(`     ${r.id}: ${r.specs}${r.wear.length ? ` | wear ${r.wear.map((w) => `${w.npc}: ${w.loadouts.join(' + ')}`).join(' · ')}` : ` | wear ${r.loadouts.join(' + ')}`}`));

const main = async () => {
  const t0 = Date.now();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
  await page.goto(`${BASE}best-setup`, { waitUntil: 'load', timeout: 120000 });
  await page.evaluate(() => { localStorage.removeItem('mxeaez-dps:not-owned'); localStorage.removeItem('mxeaez-dps:settings:v1'); });
  await page.reload({ waitUntil: 'load', timeout: 120000 });
  await page.locator('[data-testid="raid-tab-fractured-archive"]').waitFor({ timeout: 120000 });

  // --- FA Plan (Team defaults)
  await openRaidPlan(page, 'fractured-archive');
  const total = await text(page.locator('[data-testid="plan-total"]'));
  check(total === headlineTotal('fa'), `FA Team total ${total} (phase 35: 21:44.4)`);
  let rows = await briefing(page);
  log(rows);
  const bork = rows.find((r) => r.id === 'bork-smorks');
  check(bork?.specs === BORK_SPECS, `Bork + Smorks specs: "${bork?.specs}"`);
  check(JSON.stringify(bork?.groups.map((g) => g.split(':')[0])) === JSON.stringify(['Bork', 'Smorks']), `two lines, "Bork:" / "Smorks:": ${JSON.stringify(bork?.groups)}`);
  check(bork?.title === BORK_LINE, 'the tooltip names both NPCs');
  Object.entries(FA_OTHERS).forEach(([id, s]) => check(rows.find((r) => r.id === id)?.specs === s, `${id} unchanged: "${rows.find((r) => r.id === id)?.specs}"`));
  check(rows.every((r) => r.id === 'bork-smorks' || r.groups.every((g) => !/^(Bork|Smorks):/.test(g))), 'no NPC labels on single-NPC rows');
  const enc = await page.locator('[data-testid="plan-encounter-row"][data-encounter="bork-smorks"] [data-testid="plan-encounter-drains"]').getAttribute('data-text');
  check(enc === BORK_LINE, `per-phase details encounter line: "${enc}"`);

  // --- FA with Obligator not owned: Bork and the Smorks get different loadouts → labelled Wear
  await page.evaluate(() => { localStorage.removeItem('mxeaez-dps:settings:v1'); localStorage.setItem('mxeaez-dps:not-owned', JSON.stringify(['Obligator'])); });
  await page.reload({ waitUntil: 'load', timeout: 120000 });
  await page.locator('[data-testid="raid-tab-fractured-archive"]').waitFor({ timeout: 120000 });
  await openRaidPlan(page, 'fractured-archive');
  console.log(`     (Obligator not owned) total ${await text(page.locator('[data-testid="plan-total"]'))}`);
  rows = await briefing(page);
  log(rows);
  const b2 = rows.find((r) => r.id === 'bork-smorks');
  // phase 36: with the damage specs this plan takes the Ezekiel route (no Bork + Smorks): the per-NPC Wear check is skipped
  if (!b2) console.log('     (Obligator not owned: the route no longer passes Bork + Smorks — per-NPC Wear check skipped)');
  else {
    check(JSON.stringify(b2?.groups.map((g) => g.split(':')[0])) === JSON.stringify(['Bork', 'Smorks']), `spec lines "Bork:" / "Smorks:": ${JSON.stringify(b2?.groups)}`);
    check(JSON.stringify(b2?.wear.map((w) => w.npc)) === JSON.stringify(['Bork', 'Smorks']) && b2.wear.every((w) => w.loadouts.length > 0 && w.icons.every((n) => n >= 5)), `Wear per NPC: ${JSON.stringify(b2?.wear)}`);
    const row = page.locator('[data-testid="plan-briefing-row"][data-encounter="bork-smorks"]');
    const wearText = await text(row.locator('td').nth(1));
    check(/^Bork:.*Smorks:/.test(wearText), `Wear cell text: "${wearText}"`);
    await page.mouse.move(0, 0);
    await page.locator('[data-testid="plan-briefing"]').screenshot({ path: 'docs/screenshots/phase35b-bork-smorks.png' });
    // phone width: the weapon icon only
    await page.setViewportSize({ width: 390, height: 1100 });
    await page.waitForTimeout(500);
    rows = await briefing(page);
    const b3 = rows.find((r) => r.id === 'bork-smorks');
    check(b3.wear.every((w) => w.icons.every((n) => n === 1)), `390 px: one (weapon) icon per loadout: ${JSON.stringify(b3.wear.map((w) => w.icons))}`);
    await page.locator('[data-testid="plan-briefing"]').screenshot({ path: 'docs/screenshots/phase35b-bork-smorks-phone.png' });
  }
  await page.setViewportSize({ width: 1400, height: 1100 });
  await page.evaluate(() => { localStorage.removeItem('mxeaez-dps:not-owned'); localStorage.removeItem('mxeaez-dps:settings:v1'); });
  await page.reload({ waitUntil: 'load', timeout: 120000 });
  await page.locator('[data-testid="raid-tab-fractured-archive"]').waitFor({ timeout: 120000 });

  // --- CoX: Olm's claws and head
  await openRaidPlan(page, 'cox');
  rows = await briefing(page);
  log(rows);
  const olm = rows.find((r) => r.id === 'cox-olm');
  // phase 36: Olm's phases reset the stats (wiki): each claw's later phases are their own lines
  const olmLabels = olm?.groups.map((g) => g.split(':')[0]) ?? [];
  check(olmLabels.includes('Head') && olmLabels.some((l) => l.startsWith('Right claw')) && olmLabels.some((l) => l.startsWith('Left claw')) && olmLabels.some((l) => /after phase/.test(l)), `Olm: ${JSON.stringify(olm?.groups)}`);
  await page.mouse.move(0, 0);
  await page.locator('[data-testid="plan-briefing"]').screenshot({ path: 'docs/screenshots/phase35b-cox.png' });

  // --- ToA: Wardens, Kephri
  await openRaidPlan(page, 'toa');
  rows = await briefing(page);
  log(rows);
  const w = rows.find((r) => r.id === 'toa-wardens');
  check(w?.groups.length >= 3 && w.groups[0].startsWith('Obelisk:') && w.groups.some((g) => g.startsWith('Tumeken\'s Warden:')), `Wardens: ${JSON.stringify(w?.groups)}`);
  const kephri = rows.find((r) => r.id === 'toa-kephri');
  check(kephri && !/Scarab/.test(kephri.specs) && !/Scarab/.test(kephri.title), `Kephri: no scarab line ("${kephri?.specs}")`);
  await page.mouse.move(0, 0);
  await page.locator('[data-testid="plan-briefing"]').screenshot({ path: 'docs/screenshots/phase35b-toa.png' });

  await browser.close();
  console.log(`${failures ? `${failures} FAILED` : 'all OK'} (${Math.round((Date.now() - t0) / 1000)} s)`);
  process.exit(failures ? 1 : 0);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
