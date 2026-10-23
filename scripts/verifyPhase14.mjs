/**
 * Phase 14 UI check (not part of the Jest run): spec & drain model on /best-setup.
 *
 * Usage (dev server running): node scripts/verifyPhase14.mjs [baseUrl]
 * - The Assumptions box has "My specs" (Elder maul / DWH / BGS / Tonalztics checkboxes, Ayak count with the
 *   "≈ X magic def drained" hint, Lightbearer) and "Team" (party size, carriers per weapon) inputs; no "Solo Ayak damage".
 * - The Smorks, Solo (maul only, floor 0): the plan shows a partial drain ("floor 0 not reachable").
 * - Team: the plan shows P(floor) and the carrier table; 6-man Bork recommends 2 Elder maul carriers.
 * - The search's top row loaded into the calculator shows the same DPS / max hit (= a direct calc).
 * Screenshots docs/screenshots/phase14-*.png.
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE = (process.argv[2] || 'http://localhost:3001/osrs-dps/').replace(/\/?$/, '/');

let failures = 0;
const check = (ok, msg) => {
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`);
};

const text = async (page, testid) => (await page.locator(`[data-testid="${testid}"]`).first().innerText()).replace(/\s+/g, ' ').trim();

const waitRows = async (page) => {
  await page.locator('[data-testid="search-row"]').first().waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
  await page.locator('[data-testid="search-row"]').first().waitFor({ timeout: 120000 });
};

const readCalcRow = async (page, label) => {
  const row = page.locator('table tbody tr', { has: page.locator('th[title]', { hasText: new RegExp(`^${label}$`) }) }).first();
  return (await row.locator('th').nth(1).innerText()).trim();
};

const main = async () => {
  fs.mkdirSync('docs/screenshots', { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 1500 } });
  await page.goto(`${BASE}best-setup`, { waitUntil: 'load', timeout: 120000 });
  await page.locator('[data-testid="my-specs"]').waitFor({ timeout: 120000 });

  // 1. inputs
  const box = await text(page, 'assumptions');
  check(!box.includes('Solo Ayak damage'), 'no "Solo Ayak damage" input');
  for (const id of ['bs-my-elderMaul', 'bs-my-dwh', 'bs-my-bgs', 'bs-my-tonalztics', 'bs-ayak', 'bs-my-lightbearer', 'bs-party',
    'bs-team-elderMaul', 'bs-team-tonalztics', 'bs-team-ayak', 'bs-fight', 'bs-threshold']) {
    check(await page.locator(`#${id}`).count() === 1, `input #${id} rendered`);
  }
  check(await page.locator('#bs-my-elderMaul').isChecked() && !(await page.locator('#bs-my-dwh').isChecked()), 'defaults: Elder maul ticked, DWH not');
  check(await page.locator('#bs-ayak').inputValue() === '2' && await page.locator('#bs-party').inputValue() === '6'
    && await page.locator('#bs-team-elderMaul').inputValue() === '2', 'defaults: Ayak ×2, party 6, 2 maul carriers');
  const hint = await text(page, 'ayak-hint');
  check(/≈ \d+ magic def drained/.test(hint), `Ayak hint: ${hint}`);

  // 2. The Smorks, Solo: partial drain
  await page.locator('[data-testid="boss-select"]').selectOption('smorks');
  await page.locator('[data-testid="drain-solo"]').click();
  await waitRows(page);
  await page.waitForTimeout(500);
  const soloPlan = await text(page, 'drain-plan');
  console.log(`     ${soloPlan}`);
  check(soloPlan.includes('2× Elder maul') && soloPlan.includes('floor 0 not reachable'), 'Smorks Solo: partial Elder maul drain, floor 0 not reachable');
  const soloDef = Number((await text(page, 'drain-pfloor')).match(/ranked at Defence (\d+)/)?.[1]);
  check(soloDef > 0 && soloDef < 220, `Smorks Solo ranked Defence ${soloDef} (between floor 0 and 220)`);
  const summary = await text(page, 'search-summary');
  check(summary.includes(`Defence ${soloDef}`), 'search summary uses the same Defence');
  await page.mouse.move(0, 0);
  await page.screenshot({ path: 'docs/screenshots/phase14-smorks-solo.png', fullPage: true });

  // 3. Team on Bork: probability and recommendation
  await page.locator('[data-testid="boss-select"]').selectOption('bork');
  await page.locator('[data-testid="drain-team"]').click();
  await waitRows(page);
  await page.waitForTimeout(500);
  const teamP = await text(page, 'drain-pfloor');
  console.log(`     ${await text(page, 'drain-plan')}`);
  console.log(`     ${teamP}`);
  check(/P\(Defence floor 180\) \d+(\.\d)?%/.test(teamP), `Bork Team shows P(floor): ${teamP.slice(0, 40)}`);
  const table = await text(page, 'team-table');
  check(/6-man Bork: 1 Elder maul → \d+%, 2 Elder maul → \d+%/.test(table), `recommendation: ${table.match(/6-man Bork[^(]*/)?.[0]}`);
  await page.screenshot({ path: 'docs/screenshots/phase14-bork-team.png', fullPage: true });

  // 3b. a change of an input re-plans: 0 maul carriers, 1 Tonalztics → lower probability
  await page.locator('#bs-team-elderMaul').fill('0');
  await page.locator('#bs-team-tonalztics').fill('1');
  await page.waitForTimeout(800);
  const teamP2 = await text(page, 'drain-pfloor');
  const p1 = Number(teamP.match(/\) ([\d.]+)%/)?.[1] ?? 100);
  const p2 = Number(teamP2.match(/\) ([\d.<>]+)%/)?.[1]?.replace(/[<>]/g, '') ?? 100);
  check(p2 < p1, `fewer carriers → lower P(floor): ${p1}% → ${p2}%`);
  await page.locator('#bs-team-elderMaul').fill('2');
  await page.locator('#bs-team-tonalztics').fill('2');
  await waitRows(page);
  await page.waitForTimeout(500);

  // 4. DPS = direct calc: load the top row into the calculator
  const row = page.locator('[data-testid="search-row"]').first();
  const dps = (await row.locator('[data-testid="dps"]').innerText()).trim();
  const maxHit = (await row.locator('[data-testid="maxhit"]').innerText()).trim();
  await row.getByRole('button', { name: 'Load into calculator' }).click();
  await page.waitForURL((u) => !u.pathname.endsWith('best-setup'), { timeout: 60000 });
  await page.getByPlaceholder('Search for monster...').waitFor({ timeout: 120000 });
  await page.waitForTimeout(3000);
  const cDps = await readCalcRow(page, 'DPS');
  const cMax = await readCalcRow(page, 'Max hit');
  check(cDps === dps && cMax === maxHit, `Bork Team top row loaded: view ${dps} / ${maxHit}, calculator ${cDps} / ${cMax}`);
  await page.screenshot({ path: 'docs/screenshots/phase14-bork-team-loaded.png', fullPage: true });

  await browser.close();
  process.exit(failures ? 1 : 0);
};

main();
