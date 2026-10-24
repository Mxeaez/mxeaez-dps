/**
 * Phase 29 UI check (not part of the Jest run): the planner decides the spec weapons.
 *
 * Usage (dev server running): node scripts/verifyPhase29.mjs [baseUrl]
 * - FA Plan, defaults (party 6, Team drains, "Spec weapons: Planner decides"): "Bring: …", the team briefing table
 *   (weapon → carriers → bosses driving it) and "Your share (assign me): …"; prints them.
 * - The AG Flying phase row's drain line reads "needed ×N (2N hits) · team brings ×4" (Tonalztics; review: N = the
 *   fewest of those specs giving the same ranked Defence; "not needed" when 0).
 * - Review: "Team carriers: Planner decides" by default (counts disabled); the briefing shows the planner's carriers
 *   (2 Elder maul + 2 Tonalztics on the FA defaults) with what the last carrier of each saves and the order they were
 *   added; Solo party 1 brings Elder maul + Tonalztics (22:01.3; phase 29: Tonalztics, 22:10.5) with "dropping … / adding … to this plan" and "best without …";
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
};
const waitSearch = async (page) => {
  await page.waitForTimeout(800);
  await page.locator('[data-testid="search-progress"]').waitFor({ state: 'detached', timeout: 300000 });
  await page.locator('[data-testid="search-results"]').waitFor({ timeout: 300000 });
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
  await page.evaluate(() => localStorage.removeItem('mxeaez-dps:not-owned'));
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
  // "needed ×4 (98%) · team brings ×4 (8 hits, 98%)" (Search uses the Advanced 2 / 2 / 1 before any plan)
  check(/needed ×4 \(98%\) · team brings ×4 \(8 hits, 98%\)/.test(panelTona), `Search drain box (AG Flying, Team): "${panelTona}"`);
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
  // review 2: 2 / 2 tie → the weapon whose last carrier saves more (Tonalztics 27.0 s vs Elder maul 3.6 s)
  check(shareWeapon === 'tonalztics', `assign me picks the most-needed weapon, ties by what the last carrier saves (${shareWeapon})`);
  const specCells = await page.locator('[data-testid="inventory-cell"][data-kind="spec"]').count();
  check(specCells === (carry ? 1 : 0), `spec weapons in the inventory: ${specCells} (carry ${carry})`);
  check((await specs.getAttribute('data-bring')) === (carry ? shareWeapon : ''), `data-bring "${await specs.getAttribute('data-bring')}"`);

  // AG Flying drain line in the encounter table
  const agDrains = await text(page.locator('[data-testid="plan-phase-row"][data-target="ag-flying"] [data-testid="plan-phase-drains"]').first());
  check(/needed ×4 \(98%\) · team brings ×4 \(8 hits, 98%\)/.test(agDrains), `AG Flying (Team) drain line: "${agDrains}"`);
  const carriers = Object.fromEntries(rows.map((r) => [r.weapon, r.carriers]));
  check(carriers.elderMaul === 2 && carriers.tonalztics === 2 && rows.length === 2, `planner carriers: ${JSON.stringify(carriers)} (2 Elder maul + 2 Tonalztics)`);
  check(/picked by the planner/.test(await text(page.locator('[data-testid="plan-team-roles"] .font-semibold').first())), 'briefing says "picked by the planner"');
  const steps = page.locator('[data-testid="plan-team-steps"]');
  check(await steps.count() === 1, `${await steps.count() ? await text(steps) : 'no steps line'}`);

  // Lightbearer follows the ring policy (camp one ring: the planned ring)
  const ring = await page.locator('[data-testid="plan-ring-result"]').getAttribute('data-ring');
  let lb = await lightbearer(page);
  check(lb.locked && lb.on === (ring === 'Lightbearer') && lb.text.includes(`Camp one ring → ${ring}`), `Camp one ring → ${ring}: "${lb.text}"`);
  await shot(page, 'team');
  // review 2: Search / Summary now use the plan's carriers (shown in the disabled counts)
  check(/from the last plan/.test((await page.locator('[data-testid="team-carriers-note"]').textContent())), 'carriers note after the plan: "from the last plan"');
  check(await page.locator('#bs-team-tonalztics').inputValue() === '2' && await page.locator('#bs-team-ayak').inputValue() === '0', `Advanced counts follow the plan: Tonalztics ${await page.locator('#bs-team-tonalztics').inputValue()}, Ayak ${await page.locator('#bs-team-ayak').inputValue()}`);

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
  const weapons = await page.locator('[data-testid="plan-spec-weapon"]').evaluateAll((els) => els.map((e) => ({
    weapon: e.getAttribute('data-weapon'), delta: Number(e.getAttribute('data-delta')), text: e.textContent.trim(),
  })));
  check(weapons.length > 0 && weapons.every((w) => w.delta > 0 && w.text.startsWith('dropping ')), `each brought weapon: ${weapons.map((w) => w.text).join('; ')}`);
  // phase 30 (empty pinned defaults): the brute force over all 32 sets has 1321.34 s for {Elder maul, Tonalztics} (tied
  // with ten other sets pairing Tonalztics with Elder maul or DWH); phase 29: Bring Tonalztics, 22:10.5
  check(/^Bring: Elder maul, Tonalztics$/.test(soloBring) && soloTotal === '22:01.3', `Solo optimum (brute force): Bring Elder maul, Tonalztics, 22:01.3 (${soloBring}, ${soloTotal})`);
  const without = page.locator('[data-testid="plan-spec-without"]');
  check(await without.count() === weapons.length, `${await without.count() ? await text(without.first()) : 'no "best without" line'}`);
  const others = await page.locator('[data-testid="plan-spec-rejected"], [data-testid="plan-spec-other"]').evaluateAll((els) => els.map((e) => e.textContent.trim()));
  check(others.length > 0 && others.every((t) => t.startsWith('adding ')), `not brought: ${others.join('; ')}`);
  const rejected = page.locator('[data-testid="plan-spec-rejected"]');
  if (await rejected.count()) console.log(`       ${await text(rejected)}`);
  check(await page.locator('[data-testid="plan-team-roles"]').count() === 0, 'Solo: no team briefing');
  const specItems = await page.locator('[data-testid="inventory-cell"][data-kind="spec"]').count();
  check(specItems <= weapons.length, `spec weapons in the inventory: ${specItems}`);
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
