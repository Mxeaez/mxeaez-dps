/**
 * Phase 37b UI check (not part of the Jest run): "Remember my settings".
 *
 * Usage (dev server running): node scripts/verifyPhase37b.mjs [baseUrl]
 * - FA: party size 4, Drains Solo, Plan tab: brews 5, a fixed route, ring policy "Allow switches"; ToA: raid level 300 (the
 *   ToA tab left active). Reload: the ToA tab is active with raid level 300; FA keeps every value. localStorage holds
 *   `mxeaez-dps:settings:v1` (version 1, only the changed values).
 * - FA "Reset": FA back to the defaults (party 6, Team, brews 6, Compare all, Camp one ring), also after a reload; ToA keeps
 *   its raid level. "Reset all saved settings" (? help): ToA back to its default, the key removed.
 * Screenshot docs/screenshots/phase37b-settings.png (FA Plan inputs after the reload).
 */
import { chromium } from '@playwright/test';

const BASE = (process.argv[2] || 'http://localhost:3001/osrs-dps/').replace(/\/?$/, '/');
const KEY = 'mxeaez-dps:settings:v1';

let failures = 0;
const check = (ok, msg) => {
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`);
};

const main = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
  const load = async () => {
    await page.locator('[data-testid="raid-tab-fractured-archive"]').waitFor({ timeout: 120000 });
    await page.waitForTimeout(300);
  };
  const reload = async () => {
    await page.reload({ waitUntil: 'load', timeout: 120000 });
    await load();
  };
  await page.goto(`${BASE}best-setup`, { waitUntil: 'load', timeout: 120000 });
  await page.evaluate((k) => {
    localStorage.removeItem(k);
    localStorage.removeItem('mxeaez-dps:not-owned');
  }, KEY);
  await reload();
  const stored = () => page.evaluate((k) => localStorage.getItem(k), KEY);
  const tab = (id) => page.locator(`[data-testid="raid-tab-${id}"]`);
  const activeTab = async (testId) => /bg-orange-400/.test(await page.locator(`[data-testid="${testId}"]`).getAttribute('class'));
  const drainShown = async () => {
    for (const d of ['none', 'solo', 'team']) if (await activeTab(`drain-${d}`)) return d;
    return null;
  };
  const party = page.locator('#bs-party');
  const toaLevel = page.locator('[data-testid="scaling-toaInvocationLevel"]');
  const planInputs = async () => {
    await page.locator('[data-testid="plan-tab"]').click();
    await page.locator('[data-testid="plan-inputs"]').waitFor({ timeout: 60000 });
    if (!(await page.locator('[data-testid="plan-route"]').isVisible())) await page.locator('[data-testid="plan-advanced-toggle"]').click();
    return {
      brew: await page.locator('#plan-supply-brew').inputValue(),
      route: await page.locator('[data-testid="plan-route"]').inputValue(),
      ring: await page.locator('[data-testid="plan-ring-policy"]').inputValue(),
    };
  };

  check(await stored() === null, 'no saved settings at the start');
  const defaultsPlan = await planInputs();
  const routeOptions = await page.locator('[data-testid="plan-route"] option').evaluateAll((els) => els.map((e) => e.value));
  const route = routeOptions[2];
  console.log(`     FA defaults: ${JSON.stringify(defaultsPlan)}; route picked: ${route}`);

  // --- set: FA party 4, Solo, brews 5, a route, Allow switches; ToA raid level 300
  await page.locator('[data-testid="search-tab"]').click();
  await party.fill('4');
  await page.locator('[data-testid="drain-solo"]').click();
  await planInputs();
  await page.locator('#plan-supply-brew').fill('5');
  await page.locator('[data-testid="plan-route"]').selectOption(route);
  await page.locator('[data-testid="plan-ring-policy"]').selectOption('switch');
  await page.waitForTimeout(300);
  await tab('toa').click();
  await page.waitForTimeout(300);
  const toaDefault = await toaLevel.inputValue();
  await toaLevel.fill('300');
  await page.waitForTimeout(300);
  const saved = JSON.parse(await stored() || 'null');
  console.log(`     stored: ${JSON.stringify(saved)}`);
  check(saved?.version === 1 && saved.raid === 'toa', 'stored: version 1, raid tab ToA');
  check(JSON.stringify(saved?.raids?.['fractured-archive']?.plan?.supplies) === '{"brew":5}', 'stored: only the changed supply (brew 5)');

  // --- reload: everything kept
  await reload();
  check(await activeTab('raid-tab-toa'), 'after reload: the ToA tab is active');
  check(await toaLevel.inputValue() === '300', `after reload: ToA raid level 300 (${await toaLevel.inputValue()}; default ${toaDefault})`);
  await tab('fractured-archive').click();
  await page.waitForTimeout(300);
  check(await party.inputValue() === '4', `after reload: FA party size 4 (${await party.inputValue()})`);
  check(await drainShown() === 'solo', `after reload: FA Drains Solo (${await drainShown()})`);
  const kept = await planInputs();
  check(kept.brew === '5' && kept.route === route && kept.ring === 'switch', `after reload: FA plan inputs kept ${JSON.stringify(kept)}`);
  await page.mouse.move(0, 0);
  await page.locator('[data-testid="plan-inputs"]').screenshot({ path: 'docs/screenshots/phase37b-settings.png' });

  // --- Search ↔ Plan keeps the plan inputs (the view remounts)
  await page.locator('[data-testid="search-tab"]').click();
  const again = await planInputs();
  check(JSON.stringify(again) === JSON.stringify(kept), 'Search → Plan: the plan inputs are kept');

  // --- FA Reset
  await page.locator('[data-testid="assumptions-reset"]').click();
  await page.waitForTimeout(300);
  const afterReset = await planInputs();
  check(JSON.stringify(afterReset) === JSON.stringify(defaultsPlan), `Reset: FA plan inputs back to the defaults ${JSON.stringify(afterReset)}`);
  check(await party.inputValue() === '6', `Reset: FA party size 6 (${await party.inputValue()})`);
  check(await drainShown() === 'team', `Reset: FA Drains Team (${await drainShown()})`);
  await reload();
  const savedAfterReset = JSON.parse(await stored() || 'null');
  check(!!savedAfterReset && !savedAfterReset.raids['fractured-archive'] && savedAfterReset.raids.toa, `Reset: FA's saved values gone, ToA's kept (${JSON.stringify(savedAfterReset)})`);
  await tab('fractured-archive').click();
  await page.waitForTimeout(300);
  check(await party.inputValue() === '6' && await drainShown() === 'team', 'Reset + reload: FA defaults');
  await tab('toa').click();
  await page.waitForTimeout(300);
  check(await toaLevel.inputValue() === '300', 'Reset (FA) left ToA\'s raid level');

  // --- Reset all (? help)
  await page.locator('[data-testid="glossary-button"]').click();
  await page.locator('[data-testid="settings-reset-all"]').click();
  await page.waitForTimeout(300);
  check(await toaLevel.inputValue() === toaDefault, `Reset all: ToA raid level back to ${toaDefault} (${await toaLevel.inputValue()})`);
  await tab('fractured-archive').click();
  await page.waitForTimeout(300);
  check(await stored() === null, 'Reset all: nothing stored (back on the FA tab)');
  await reload();
  check(await activeTab('raid-tab-fractured-archive') && await party.inputValue() === '6', 'Reset all + reload: FA tab, defaults');

  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exitCode = failures ? 1 : 0;
};

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
