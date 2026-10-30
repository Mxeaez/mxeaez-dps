/**
 * Phase 29 UI check (not part of the Jest run): the planner decides the spec weapons.
 *
 * Usage (dev server running): node scripts/verifyPhase29.mjs [baseUrl]
 * - FA Plan, defaults (party 6, Team drains, "Spec weapons: Planner decides"): "Bring: …", the team briefing table
 *   (weapon → carriers → bosses driving it) and "Your share (assign me): …"; prints them.
 * - The AG Flying phase row's drain line reads "needs 4 landed hits · 4 specs (2 carriers), 8 swings · 98%" (Tonalztics;
 *   phase 32 wording; review: the fewest of those specs giving the same ranked Defence; "not needed" when 0).
 * - Review: "Team carriers: Planner decides" by default (counts disabled); the briefing shows the planner's carriers
 *   (2 Elder maul + 2 Tonalztics on the FA defaults) with what the last carrier of each saves and the order they were
 *   added; Solo party 1 brings Tonalztics (phase 31: 22:01.9, Elder maul's 0.6 s < 1 s per slot; phase 30: Elder maul + Tonalztics 22:01.3; phase 29: Tonalztics, 22:10.5) with "dropping … / adding … to this plan" and "best without …";
 *   the party-1 Search drain box has no team carrier table.
 * - "I wear a Lightbearer" follows the ring policy: Camp one ring → the planned ring (off unless it is Lightbearer),
 *   Camp Lightbearer → on, Allow ring switches → the user's toggle again.
 * - Search header: no duplicate "Drains:" line, only "ranked at Def … · Magic def …" (the drain line is in the box
 *   above).
 * - Party size 1 → Solo drains (Team disabled) → the Solo subset result: the weapons it picks, what each saves, the best
 *   rejected one; prints them.
 * Screenshots docs/screenshots/phase29-*.png.
 */
import { chromium } from '@playwright/test';
import { headlineClose, headlineOf } from './headlines.mjs';
import { openSections } from './phase34Sections.mjs';

const BASE = (process.argv[2] || 'http://localhost:3001/osrs-dps/').replace(/\/?$/, '/');

let failures = 0;
const check = (ok, msg) => {
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`);
};
const shot = async (page, name) => {
  await page.mouse.move(0, 0);
  await page.screenshot({ path: `docs/screenshots/phase29-${name}.png`, fullPage: true });
};
const waitPlan = async (page) => {
  await page.waitForTimeout(1200);
  await page.locator('[data-testid="plan-progress"]').waitFor({ state: 'detached', timeout: 900000 });
  await page.locator('[data-testid="plan-result"]').waitFor({ timeout: 900000 });
  await openSections(page); // phase 34: open the sections what this script reads moved into
};
const waitSearch = async (page) => {
  await page.waitForTimeout(800);
  await page.locator('[data-testid="search-progress"]').waitFor({ state: 'detached', timeout: 300000 });
  await page.locator('[data-testid="search-results"]').waitFor({ timeout: 300000 });
  await openSections(page); // phase 34: open the sections what this script reads moved into
};
const text = async (loc) => (await loc.innerText()).replace(/\s+/g, ' ').trim();
const lightbearer = async (page) => {
  const t = page.locator('[data-testid="bs-my-lightbearer"]');
  return {
    locked: (await t.getAttribute('data-locked')) === 'true',
    on: (await t.getAttribute('aria-pressed')) === 'true',
    text: await text(t),
  };
};

const main = async () => {
  const t0 = Date.now();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 1300 } });
  await page.goto(`${BASE}best-setup`, { waitUntil: 'load', timeout: 120000 });
  await page.evaluate(() => { localStorage.removeItem('mxeaez-dps:not-owned'); localStorage.removeItem('mxeaez-dps:settings:v1'); });
  await page.reload({ waitUntil: 'load', timeout: 120000 });
  await page.locator('[data-testid="raid-tab-fractured-archive"]').waitFor({ timeout: 120000 });
  await page.locator('[data-testid="raid-tab-fractured-archive"]').click();

  // --- renamed "Specs I bring"; the Lightbearer ring toggle
  const specsRow = await text(page.locator('[data-testid="my-specs"]'));
  check(specsRow.startsWith('Specs I bring:') && !/My specs/.test(specsRow), `"Specs I bring:" row (was "My specs"): "${specsRow.slice(0, 40)}…"`);
  check(/I wear a Lightbearer/.test(await text(page.locator('[data-testid="ring-toggle"]'))), '"Ring: I wear a Lightbearer" toggle, not in the specs row');
  check(!/Lightbearer/.test(specsRow), 'Lightbearer is not a spec weapon any more');

  // --- Search header: no duplicate drain line
  await page.locator('[data-testid="drain-team"]').click();
  await page.locator('[data-testid="boss-select"]').selectOption('ag-flying');
  await waitSearch(page);
  const header = await text(page.locator('[data-testid="search-summary"]'));
  check(!/Drains:/.test(header), 'Search header has no "Drains:" line');
  check(await page.locator('[data-testid="search-summary"] [data-testid="drain-line"]').count() === 0, 'no drain line in the Search header (it is in the box above)');
  const ranked = await text(page.locator('[data-testid="search-ranked-at"]'));
  check(/^ranked at Def \d+ · Magic def -?\d+$/.test(ranked) && await page.locator('[data-testid="search-ranked-at"] img').count() === 2, `"${ranked}" with the Defence / Magic icons`);
  const panelTona = await text(page.locator('[data-testid="spec-plan"] [data-testid="drain-line-item"][data-weapon="tonalztics"]'));
  // review 2: "needed ×3 (86%) · …"; phase 30: "needed" reaches the threshold too when the team's specs do:
  // phase 38h-3: the chance printed is the plan's own (99% since the 38h-1 / 38h-2 drain lines), any 9x% passes
  // "needed ×4 (98%) · team brings ×4 (8 hits, 98%)"; phase 32: "needs 4 landed hits · 4 specs (2 carriers), 8 swings ·
  // 98%" (Search uses the Advanced 2 / 2 / 1 before any plan)
  check(/needs 4 landed hits · 4 specs \(2 carriers\) = 8 attacks, 4 must land · 9\d%/.test(panelTona) && !/team:/.test(panelTona), `Search drain box (AG Flying, Team): "${panelTona}"`);
  check(/run a plan to fill these/.test((await page.locator('[data-testid="team-carriers-note"]').textContent())), 'carriers note before any plan: "run a plan to fill these"');
  check(await page.locator('[data-testid="team-carrier-mode"]').inputValue() === 'auto', 'Team carriers: "Planner decides" by default');
  check(await page.locator('#bs-team-elderMaul').isDisabled(), 'carrier counts disabled while the planner decides');
  await shot(page, 'search-header');

  // --- Plan, defaults (Team, planner decides)
  await page.locator('[data-testid="plan-tab"]').click();
  await page.locator('[data-testid="plan-view"]').waitFor({ timeout: 30000 });
  check(await page.locator('[data-testid="plan-spec-mode"]').inputValue() === 'auto', 'Spec weapons: "Planner decides" by default');
  await waitPlan(page);
  const total = await text(page.locator('[data-testid="plan-total"]'));
  const specs = page.locator('[data-testid="plan-specs"]');
  const bring = await text(page.locator('[data-testid="plan-bring"]'));
  check(/^Bring: /.test(bring), `"${bring}" (total ${total})`);
  const rows = await page.locator('[data-testid="plan-team-row"]').evaluateAll((els) => els.map((e) => ({
    weapon: e.getAttribute('data-weapon'), carriers: Number(e.getAttribute('data-carriers')), text: e.textContent.replace(/\s+/g, ' ').trim(),
  })));
  check(rows.length > 0, `team briefing: ${await text(page.locator('[data-testid="plan-team-roles"] .font-semibold').first())}`);
  rows.forEach((r) => console.log(`       ${r.text}`));
  const share = page.locator('[data-testid="plan-share"]');
  const shareText = await text(share);
  check(/^Your share \(assign me\): /.test(shareText), `"${shareText}"`);
  const carry = (await share.getAttribute('data-carry')) === 'true';
  const shareWeapon = await share.getAttribute('data-weapon');
  // phase 36: you bring damage spec weapons (Zaryte crossbow, Burning claws) and a Surge potion: your energy goes to them,
  // no drain weapon for you (review 2's tie rule picked Tonalztics before)
  check(shareWeapon === '' && /your spec energy goes to your/.test(shareText), `your share: none, damage specs (${shareWeapon || 'none'})`);
  const specCells = await page.locator('[data-testid="inventory-cell"][data-kind="spec"]').count();
  check(specCells === (bring.replace('Bring: ', '').split(', ').length), `spec items in the inventory: ${specCells} ("${bring}")`);
  check((await specs.getAttribute('data-bring')) === (carry ? shareWeapon : ''), `data-bring "${await specs.getAttribute('data-bring')}"`);

  // AG Flying drain line in the encounter table (phase 33: the phase rows are under "per-phase details")
  if (await page.locator('[data-testid="plan-phase-toggle"]').getAttribute('aria-expanded') !== 'true') await page.locator('[data-testid="plan-phase-toggle"]').click();
  const agDrains = await text(page.locator('[data-testid="plan-phase-row"][data-target="ag-flying"] [data-testid="plan-phase-drains"]').first());
  check(/needs 4 landed hits · 4 specs \(2 carriers\) = 8 attacks, 4 must land · 9\d%/.test(agDrains), `AG Flying (Team) drain line: "${agDrains}"`);
  const carriers = Object.fromEntries(rows.map((r) => [r.weapon, r.carriers]));
  const wantCarriers = headlineOf('fa').carriers; // phase 38f: the fixture, not literals
  check((carriers.elderMaul ?? 0) === wantCarriers.elderMaul && (carriers.tonalztics ?? 0) === wantCarriers.tonalztics && rows.length === Object.values(wantCarriers).filter((n) => n > 0).length, `planner carriers: ${JSON.stringify(carriers)} (the headline's: ${JSON.stringify(wantCarriers)})`);
  check(/picked by the planner/.test(await text(page.locator('[data-testid="plan-team-roles"] .font-semibold').first())), 'briefing says "picked by the planner"');
  // phase 38g: carriers by headcount, no "added in this order" steps line
  check(await page.locator('[data-testid="plan-team-steps"]').count() === 0, 'no carrier steps line (carriers by headcount)');

  // Lightbearer follows the ring policy (camp one ring: the planned ring)
  const ring = await page.locator('[data-testid="plan-ring-result"]').getAttribute('data-ring');
  let lb = await lightbearer(page);
  check(lb.locked && lb.on === (ring === 'Lightbearer') && lb.text.includes(`Camp one ring → ${ring}`), `Camp one ring → ${ring}: "${lb.text}"`);
  await shot(page, 'team');
  // review 2: Search / Summary now use the plan's carriers (shown in the disabled counts)
  check(/from the last plan/.test((await page.locator('[data-testid="team-carriers-note"]').textContent())), 'carriers note after the plan: "from the last plan"');
  check(await page.locator('#bs-team-tonalztics').inputValue() === String(headlineOf('fa').carriers.tonalztics) && await page.locator('#bs-team-ayak').inputValue() === '0', `Advanced counts follow the plan: Tonalztics ${await page.locator('#bs-team-tonalztics').inputValue()}, Ayak ${await page.locator('#bs-team-ayak').inputValue()}`);

  await page.locator('[data-testid="plan-ring-policy"]').selectOption('camp-lightbearer'); // phase 30: with the inputs
  await page.waitForTimeout(300);
  lb = await lightbearer(page);
  check(lb.locked && lb.on && /Camp Lightbearer/.test(lb.text), `Camp Lightbearer: "${lb.text}"`);
  await waitPlan(page);
  await shot(page, 'camp-lightbearer');
  await page.locator('[data-testid="plan-ring-policy"]').selectOption('switch');
  await page.waitForTimeout(300);
  lb = await lightbearer(page);
  check(!lb.locked && /I wear a Lightbearer/.test(lb.text), `Allow ring switches: the user's toggle again (on: ${lb.on})`);
  await page.locator('[data-testid="plan-ring-policy"]').selectOption('camp-one');
  await waitPlan(page);
  check(await text(page.locator('[data-testid="plan-total"]')) === total, `back to Camp one ring: ${total}`);

  // --- party size 1 → Solo subset search
  const ts = Date.now();
  await page.locator('#bs-party').fill('1');
  await page.locator('#bs-party').blur();
  await page.waitForTimeout(500);
  check(await page.locator('[data-testid="drain-team"]').isDisabled(), 'party of 1: the Team drain button is disabled');
  check(await page.locator('[data-testid="drain-solo-party"]').count() === 1, '"(party of 1: Solo)" shown');
  await waitPlan(page);
  const soloTotal = await text(page.locator('[data-testid="plan-total"]'));
  const soloBring = await text(page.locator('[data-testid="plan-bring"]'));
  check(/^Bring: /.test(soloBring), `Solo: "${soloBring}" (total ${soloTotal}, ${((Date.now() - ts) / 1000).toFixed(1)} s)`);
  // phase 38h-3 (no seconds): each owned drain weapon with its specs in the plan with every owned one; brought ⇔ specced
  const weapons = await page.locator('[data-testid="plan-spec-weapons"] li').evaluateAll((els) => els.map((e) => ({
    id: e.getAttribute('data-testid'), specs: Number(e.getAttribute('data-specs')), text: e.textContent.trim(),
  })));
  check(weapons.length > 0 && weapons.every((w) => (w.id === 'plan-spec-weapon') === (w.specs > 0)), `each drain weapon: ${weapons.map((w) => w.text).join('; ')}`);
  check(soloBring === headlineOf('faSolo').bring && headlineClose(soloTotal, 'faSolo'), `Solo: the faSolo headline (${soloBring}, ${soloTotal})`);
  check(await page.locator('[data-testid="plan-team-roles"]').count() === 0, 'Solo: no team briefing');
  const specItems = await page.locator('[data-testid="inventory-cell"][data-kind="spec"]').count();
  // phase 36: the drain weapons + the damage spec weapons / Surge potions (one cell each)
  check(specItems === soloBring.replace('Bring: ', '').split(', ').length, `spec items in the inventory: ${specItems}`);
  await shot(page, 'solo');
  await page.locator('[data-testid="search-tab"]').click();
  await page.waitForTimeout(800);
  check(await page.locator('[data-testid="spec-plan"]').count() === 1 && await page.locator('[data-testid="team-table"]').count() === 0, 'party 1: no team carrier table in the Search drain box');

  await browser.close();
  console.log(`${failures ? `${failures} FAILED` : 'all OK'} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  process.exit(failures ? 1 : 0);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
