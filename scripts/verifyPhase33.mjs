/**
 * Phase 33 UI check (not part of the Jest run): "Specs I bring" follows the plan; one drain line per encounter.
 *
 * Usage (dev server running): node scripts/verifyPhase33.mjs [baseUrl]
 * - FA defaults: "Specs I bring" is "Planner decides", every chip unlit and read-only, "(run a plan to fill these)";
 *   the Search tab's Solo drain box reads "no spec weapons: run a plan or pick Specs I bring".
 * - Team plan (party 6): total unchanged (21:44.4); Bork + Smorks (5 rows) shows one line "Start of fight: 2 Elder maul carriers
 *   (4 specs) + 2 Tonalztics carriers (4 specs) → Def 180 · 99.6%"; the per-phase rows are collapsed; the toggle shows
 *   the five rows (armour 8 / 10 / 12 / 14 + the Smorks; stunned has no damage at 0% uptime); the chips = the plan's "Bring" (your share); prints AG / Ocellus lines.
 * - Solo plan (party 1): Bring Tonalztics, 22:01.9; the chips = Tonalztics only; the Search Solo drain uses it.
 * - ToB (defaults): Sotetseg shows three drain events (the start, after maze 1 / 2: Defence restored); Bloat's stomp.
 * - "Set manually": the chips are editable and the Plan tab's "Spec weapons" follows (one setting).
 * Screenshots docs/screenshots/phase33-*.png.
 */
import { chromium } from '@playwright/test';
import { openSections } from './phase34Sections.mjs';

const BASE = (process.argv[2] || 'http://localhost:3001/osrs-dps/').replace(/\/?$/, '/');
// phase 35b: one line per NPC (phase 33: Bork's line only, "Start of fight: … → Def 180 · 99.6%")
// phase 36: one spec budget for Bork and the Smorks; the planner's 2 Elder maul + 4 Tonalztics carriers
// phase 36 review: 2 Elder maul + 3 Tonalztics carriers (you damage-spec)
const BORK_LINE = 'Bork: 2 Elder maul carriers (3 specs) → Def 180 · 86% · Smorks: 1 Elder maul carrier (1 spec) + 3 Tonalztics carriers (6 specs) → Def 13';
const WEAPONS = ['elderMaul', 'dwh', 'bgs', 'tonalztics'];

let failures = 0;
const check = (ok, msg) => {
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`);
};
const shot = async (page, name) => {
  await page.mouse.move(0, 0);
  await page.screenshot({ path: `docs/screenshots/phase33-${name}.png`, fullPage: true });
};
const text = async (loc) => (await loc.innerText()).replace(/\s+/g, ' ').trim();
const waitPlan = async (page) => {
  await page.waitForTimeout(1500);
  for (let k = 0; k < 3; k++) {
    await page.locator('[data-testid="plan-progress"]').waitFor({ state: 'detached', timeout: 900000 });
    await page.waitForTimeout(3000);
  }
  await page.locator('[data-testid="plan-result"]').waitFor({ timeout: 900000 });
  await openSections(page); // phase 34: open the sections what this script reads moved into
};
const waitSearch = async (page) => {
  await page.waitForTimeout(800);
  await page.locator('[data-testid="search-progress"]').waitFor({ state: 'detached', timeout: 300000 });
  await page.locator('[data-testid="search-results"]').waitFor({ timeout: 300000 });
  await openSections(page); // phase 34: open the sections what this script reads moved into
};
const chips = async (page) => Object.fromEntries(await Promise.all(WEAPONS.map(async (w) => {
  const b = page.locator(`[data-testid="bs-my-${w}"]`);
  return [w, { on: (await b.getAttribute('aria-pressed')) === 'true', locked: (await b.getAttribute('data-locked')) === 'true', disabled: await b.isDisabled() }];
})));
const chipsOn = (c) => WEAPONS.filter((w) => c[w].on);
const encLine = async (page, id) => {
  const l = page.locator(`[data-testid="plan-encounter-row"][data-encounter="${id}"] [data-testid="plan-encounter-drains"]`);
  return { data: await l.getAttribute('data-text'), shown: await text(l) };
};
const soloItems = async (page) => page.locator('[data-testid="spec-plan"] [data-testid="drain-line-item"]').evaluateAll((els) => els.filter((e) => Number(e.dataset.count) > 0).map((e) => e.dataset.weapon));

const main = async () => {
  const t0 = Date.now();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 1300 } });
  await page.goto(`${BASE}best-setup`, { waitUntil: 'load', timeout: 120000 });
  await page.evaluate(() => localStorage.removeItem('mxeaez-dps:not-owned'));
  await page.reload({ waitUntil: 'load', timeout: 120000 });
  await page.locator('[data-testid="raid-tab-fractured-archive"]').waitFor({ timeout: 120000 });
  await page.locator('[data-testid="raid-tab-fractured-archive"]').click();

  // --- defaults: planner decides, chips unlit and read-only
  check(await page.locator('[data-testid="my-specs-mode"]').inputValue() === 'auto', '"Specs I bring": Planner decides by default');
  const c0 = await chips(page);
  check(chipsOn(c0).length === 0 && WEAPONS.every((w) => c0[w].locked && c0[w].disabled), `chips unlit, read-only before a plan: ${JSON.stringify(c0)}`);
  check(await page.locator('[data-testid="bs-ayak-locked"]').getAttribute('data-on') === 'false', 'Ayak × 0 before a plan');
  const note0 = await text(page.locator('[data-testid="my-specs-note"]'));
  check(note0 === '(run a plan to fill these)', `note: "${note0}"`);

  // --- Search Solo box with no specs
  await page.locator('[data-testid="drain-solo"]').click();
  await page.locator('[data-testid="boss-select"]').selectOption('bork');
  await waitSearch(page);
  const none = await text(page.locator('[data-testid="drain-no-specs"]'));
  check(none === 'no spec weapons: run a plan or pick Specs I bring', `Search Solo box: "${none}"`);
  check(await page.locator('[data-testid="spec-plan"] [data-testid="drain-line"]').count() === 0, 'no empty drain line beside it');
  await shot(page, 'search-solo-nospecs');
  await page.locator('[data-testid="drain-team"]').click();

  // --- Team plan
  await page.locator('[data-testid="plan-tab"]').click();
  await page.locator('[data-testid="plan-view"]').waitFor({ timeout: 30000 });
  await waitPlan(page);
  const total = await text(page.locator('[data-testid="plan-total"]'));
  check(total === '21:07.7', `FA Team total ${total} (phase 32: 21:44.4)`);
  const bork = await encLine(page, 'bork-smorks');
  check(bork.data === BORK_LINE && bork.shown.replace(' Smorks: ', ' · Smorks: ') === BORK_LINE, `Bork + Smorks: "${bork.shown}"`);
  check(await page.locator('[data-testid="plan-phase-toggle"]').getAttribute('aria-expanded') === 'false', 'per-phase details closed by default');
  const borkRows = page.locator('[data-testid="plan-phase-row"][data-encounter="bork-smorks"]');
  const hiddenAll = await borkRows.evaluateAll((els) => els.every((e) => !e.checkVisibility()));
  check(hiddenAll, `Bork + Smorks phase rows hidden (${await borkRows.count()} rows)`);
  for (const id of ['archive-guardian', 'ezekiel', 'moia', 'dreadnoth', 'dagonhai', 'xarth', 'ocellus']) {
    if (await page.locator(`[data-testid="plan-encounter-row"][data-encounter="${id}"]`).count()) {
      console.log(`     ${id}: "${(await encLine(page, id)).shown}"`);
    }
  }
  const bring = (await page.locator('[data-testid="plan-specs"]').getAttribute('data-bring')).split(',').filter(Boolean);
  const share = await text(page.locator('[data-testid="plan-share"]'));
  const c1 = await chips(page);
  check(JSON.stringify(chipsOn(c1)) === JSON.stringify(bring.filter((w) => w !== 'ayak')) && WEAPONS.every((w) => c1[w].locked), `chips = the plan's Bring [${bring}] (${share})`);
  const note1 = await text(page.locator('[data-testid="my-specs-note"]'));
  check(note1.startsWith('(from the last plan'), `note after the plan: "${note1}"`);
  await shot(page, 'plan-collapsed');
  await page.locator('[data-testid="plan-phase-toggle"]').click();
  const visibleBork = await borkRows.evaluateAll((els) => els.filter((e) => e.checkVisibility()).map((e) => e.dataset.phase || e.dataset.target));
  // stun uptime 0 by default: the stunned row has no damage and is left out
  check(visibleBork.length === 5, `expanded: the five Bork + Smorks rows (${visibleBork.join(' | ')})`);
  const firstBork = await text(page.locator('[data-testid="plan-phase-row"][data-encounter="bork-smorks"]').first().locator('[data-testid="plan-phase-drains"]'));
  console.log(`     Bork armour 8 row: "${firstBork}"`);
  await page.locator('[data-testid="plan-encounters"]').scrollIntoViewIfNeeded();
  await shot(page, 'plan-expanded');

  // --- Search Solo follows the plan
  await page.locator('[data-testid="search-tab"]').click();
  await page.locator('[data-testid="drain-solo"]').click();
  await page.locator('[data-testid="boss-select"]').selectOption('xarth');
  await waitSearch(page);
  const items = await soloItems(page);
  const noSpecs = await page.locator('[data-testid="drain-no-specs"]').count();
  check(bring.length ? JSON.stringify(items) === JSON.stringify(bring) : noSpecs === 1, `Search Solo (Xarth) after the Team plan: [${items}] (Bring [${bring}])`);
  await page.locator('[data-testid="drain-team"]').click();

  // --- Solo plan (party 1)
  await page.locator('#bs-party').fill('1');
  await page.locator('#bs-party').blur();
  await page.locator('[data-testid="plan-tab"]').click();
  await page.locator('[data-testid="plan-view"]').waitFor({ timeout: 30000 });
  await waitPlan(page);
  const soloTotal = await text(page.locator('[data-testid="plan-total"]'));
  const soloBring = await page.locator('[data-testid="plan-specs"]').getAttribute('data-bring');
  check(soloTotal === '21:59.0' && soloBring === 'tonalztics', `Solo party 1: ${soloTotal}, Bring ${soloBring} (phase 32: 22:01.9, Tonalztics)`);
  const c2 = await chips(page);
  check(JSON.stringify(chipsOn(c2)) === '["tonalztics"]', `chips after the Solo plan: [${chipsOn(c2)}]`);
  const soloIds = await page.locator('[data-testid="plan-encounter-row"]').evaluateAll((els) => els.map((e) => e.dataset.encounter));
  const soloLines = [];
  for (const id of soloIds) {
    const l = (await encLine(page, id)).shown;
    soloLines.push(l);
    console.log(`     Solo ${id}: "${l}"`);
  }
  check(soloLines.every((l) => l.startsWith('Start: ') || /^[^:]+: \d/.test(l)), 'Solo encounter lines read "Start: …" (no carriers)');
  check(soloLines.every((l) => !/carrier/.test(l)), 'no carriers on a Solo line');
  await shot(page, 'plan-solo');
  await page.locator('[data-testid="search-tab"]').click();
  await page.locator('[data-testid="boss-select"]').selectOption('ag-flying');
  await waitSearch(page);
  const soloAg = await soloItems(page);
  check(JSON.stringify(soloAg) === '["tonalztics"]', `Search Solo (AG Flying) after the Solo plan: [${soloAg}]`);
  await shot(page, 'search-solo-plan');

  // --- Set manually: editable, and the Plan tab's "Spec weapons" follows
  await page.locator('[data-testid="my-specs-mode"]').selectOption('manual');
  const c3 = await chips(page);
  check(WEAPONS.every((w) => !c3[w].locked && !c3[w].disabled) && chipsOn(c3).length === 0, `Set manually: chips editable, the user's own (none): ${JSON.stringify(chipsOn(c3))}`);
  await page.locator('[data-testid="bs-my-elderMaul"]').click();
  check(await page.locator('[data-testid="bs-my-elderMaul"]').getAttribute('aria-pressed') === 'true', 'Set manually: Elder maul toggles on');
  await page.locator('[data-testid="boss-select"]').selectOption('xarth'); // the Elder maul can't hit the flying AG
  await waitSearch(page);
  const manualItems = await soloItems(page);
  check(JSON.stringify(manualItems) === '["elderMaul"]', `Search Solo (Xarth) uses the manual pick: [${manualItems}]`);
  await page.locator('[data-testid="plan-tab"]').click();
  await page.locator('[data-testid="plan-view"]').waitFor({ timeout: 30000 });
  check(await page.locator('[data-testid="plan-spec-mode"]').inputValue() === 'manual', 'the Plan tab\'s "Spec weapons" follows ("Specs I bring")');
  await page.locator('[data-testid="plan-spec-mode"]').selectOption('auto');
  check(await page.locator('[data-testid="my-specs-mode"]').inputValue() === 'auto', 'and back: "Planner decides" in both');

  // --- ToB: Sotetseg's Defence is restored after each maze (three drain events); Bloat's stomp (a second, no-drain event)
  await page.locator('[data-testid="raid-tab-tob"]').click();
  await page.waitForTimeout(500);
  await page.locator('[data-testid="plan-tab"]').click();
  await page.locator('[data-testid="plan-view"]').waitFor({ timeout: 30000 });
  await waitPlan(page);
  const tobTotal = await text(page.locator('[data-testid="plan-total"]'));
  check(tobTotal === '7:23.4', `ToB plan total ${tobTotal} (phase 32: 7:29.5)`);
  const soteRow = page.locator('[data-testid="plan-encounter-row"][data-encounter="tob-sotetseg"] [data-testid="plan-encounter-drains"]');
  const soteEvents = Number(await soteRow.getAttribute('data-events'));
  const soteParts = (await soteRow.locator('[data-testid="plan-encounter-drain-part"]').allInnerTexts()).map((l) => l.replace(/\s+/g, ' ').trim());
  soteParts.forEach((l) => console.log(`     Sotetseg: "${l.replace(/\s+/g, ' ').trim()}"`));
  check(soteEvents === 3 && /^Start of fight: /.test(soteParts[0]) && /^After maze 1 \(Defence restored\), again: /.test(soteParts[1]) && /^After maze 2 \(Defence restored\), again: /.test(soteParts[2]), `Sotetseg: ${soteEvents} drain events`);
  check(/from the energy left/.test(await soteRow.getAttribute('title')), 'Sotetseg tooltip: re-drained from the energy left (phase 36)');
  const bloatRow = page.locator('[data-testid="plan-encounter-row"][data-encounter="tob-bloat"] [data-testid="plan-encounter-drains"]');
  if (await bloatRow.count()) console.log(`     Bloat: "${await bloatRow.getAttribute('data-text')}"`);
  for (const id of ['tob-maiden', 'tob-nylocas', 'tob-xarpus', 'tob-verzik']) {
    const r = page.locator(`[data-testid="plan-encounter-row"][data-encounter="${id}"] [data-testid="plan-encounter-drains"]`);
    if (await r.count()) console.log(`     ${id}: "${await r.getAttribute('data-text')}"`);
  }
  await page.locator('[data-testid="plan-encounters"]').scrollIntoViewIfNeeded();
  await shot(page, 'tob-sotetseg');

  await browser.close();
  console.log(`${failures ? `${failures} FAILED` : 'all OK'} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  process.exit(failures ? 1 : 0);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
