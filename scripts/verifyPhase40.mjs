/**
 * Phase 40 UI check (not part of the Jest run): the FA Plan tab's "Required variants" box. The default Team plan (party
 * 6, Xarth route) shows "1 player: freezes corpses (Ice Barrage, ≥75 magic attack: …), then back to DPS" with the
 * switch, its slots and the team DPS on Xarth's phase 2; the total is the fa headline (which counts the freezer); "I'm
 * this player" shows the variant kit and is saved. A route without Xarth (Dagon'hai) shows no variant.
 *
 * Usage (dev server running): node scripts/verifyPhase40.mjs [baseUrl]
 * Screenshot docs/screenshots/phase40-variants.png.
 */
import { chromium } from '@playwright/test';
import { headlineOf } from './headlines.mjs';

const BASE = (process.argv[2] || 'http://localhost:3001/osrs-dps/').replace(/\/?$/, '/');
let failures = 0;
const check = (ok, msg) => {
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`);
};

const waitPlan = async (page) => {
  await page.locator('[data-testid="plan-progress"]').waitFor({ timeout: 60000 }).catch(() => {});
  await page.locator('[data-testid="plan-progress"]').waitFor({ state: 'detached', timeout: 900000 });
  await page.waitForTimeout(3000);
  await page.locator('[data-testid="plan-progress"]').waitFor({ state: 'detached', timeout: 900000 });
  await page.locator('[data-testid="plan-result"]').waitFor({ timeout: 900000 });
};

const main = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
  await page.goto(`${BASE}best-setup`, { waitUntil: 'load', timeout: 120000 });
  await page.evaluate(() => { localStorage.removeItem('mxeaez-dps:not-owned'); localStorage.removeItem('mxeaez-dps:settings:v1'); });
  await page.reload({ waitUntil: 'load', timeout: 120000 });
  await page.locator('[data-testid="raid-tab-fractured-archive"]').click();
  await page.locator('[data-testid="drain-team"]').click();
  await page.locator('[data-testid="plan-tab"]').click();
  await page.locator('[data-testid="plan-inputs"]').waitFor({ timeout: 60000 });
  await waitPlan(page);

  const h = headlineOf('fa');
  const total = (await page.locator('[data-testid="plan-total"]').textContent()) ?? '';
  check(total.includes(h.total), `plan total ${h.total} (the fa headline, freezer counted)`);
  const box = page.locator('[data-testid="plan-variants"]');
  check(await box.isVisible(), 'Required variants box shown');
  const v = box.locator('[data-testid="plan-variant"][data-id="xarth-freezer"]');
  check(await v.count() === 1, 'one variant: the Xarth freezer');
  const head = (await v.locator('[data-testid="plan-variant-head"]').textContent()) ?? '';
  check(head === "1 player: freezes corpses (Ice Barrage, ≥75 magic attack: Kodai wand + Ancestral robe top + Confliction gauntlets), then back to DPS", `head: ${head}`);
  const role = (await v.locator('[data-testid="plan-variant-role"]').textContent()) ?? '';
  check(/80% of their DPS on Xarth phase 2/.test(role), `role: ${role}`);
  const slots = (await v.locator('[data-testid="plan-variant-slots"]').textContent()) ?? '';
  check(slots === "+3 items: 3 free slots (75 magic attack worn; the freezer's inventory, not yours)", `slots: ${slots}`);
  const team = (await v.locator('[data-testid="plan-variant-team"]').textContent()) ?? '';
  check(/^Xarth phase 2 \(50% of the HP\): \(5 × \d+\.\d\d \+ 1 × \d+\.\d\d\) ÷ 6 = \d+\.\d\d DPS per player there; ≈ \+\d+\.\d s \(same spec plan\)$/.test(team), `team: ${team}`);
  check(await v.locator('[data-testid="plan-variant-switch"] img').count() === 3, 'switch icons shown (3)');
  check(await v.locator('[data-testid="plan-variant-mine"]').count() === 0, 'not ticked: no variant kit line');

  await v.locator('[data-testid="plan-variant-me"]').check();
  const mine = (await v.locator('[data-testid="plan-variant-mine"]').textContent()) ?? '';
  check(mine === "Your kit: The kit above + Kodai wand + Ancestral robe top + Confliction gauntlets (Ancient spellbook); carry Kodai wand, Ancestral robe top, Confliction gauntlets.", `ticked: ${mine}`);
  await box.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'docs/screenshots/phase40-variants.png', fullPage: false });
  await page.waitForTimeout(600);
  const saved = await page.evaluate(() => localStorage.getItem('mxeaez-dps:settings:v1'));
  check(/"variantMe":\["xarth-freezer"\]/.test(saved ?? ''), 'tick saved to localStorage');

  // a route without Xarth: no variant
  const dagonhai = await page.locator('#plan-route option').evaluateAll((os) => os.map((o) => o.value).find((x) => x.includes('dagonhai')));
  await page.locator('#plan-route').selectOption(dagonhai);
  await waitPlan(page);
  check(await page.locator('[data-testid="plan-variants"]').count() === 0, `route ${dagonhai}: no Required variants box`);

  await browser.close();
  console.log(failures ? `${failures} FAILED` : 'ALL OK');
  process.exit(failures ? 1 : 0);
};
main().catch((e) => { console.error(e); process.exit(1); });
