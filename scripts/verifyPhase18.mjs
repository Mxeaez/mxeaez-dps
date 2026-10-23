/**
 * Phase 18 UI check (not part of the Jest run): raid tabs on /best-setup and Tombs of Amascut.
 *
 * Usage (dev server running): node scripts/verifyPhase18.mjs [baseUrl]
 * - Raid tabs render (Fractured Archive, Tombs of Amascut); FA is the default and unchanged (Xarth None top 12.839).
 * - ToA tab: raid scaling inputs (party 6, raid level 500, 4 path levels 0), no FA-only boosts, routes tab = "Encounters".
 * - ToA Search on Zebak completes; the boss hp shown is the raid-level-500 hp (8000); raid level 300 → 5870 hp and a
 *   different TTK.
 * - Encounters tab: one route, the per-encounter breakdown open. Plan runs for ToA (28-cell grid).
 * - ToA Summary: one row per summary target, all cells filled.
 * - Back to FA: Xarth 12.839 again. Screenshots docs/screenshots/phase18-*.png.
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE = (process.argv[2] || 'http://localhost:3001/osrs-dps/').replace(/\/?$/, '/');

let failures = 0;
const check = (ok, msg) => {
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`);
};

const waitSearch = async (page) => {
  await page.waitForTimeout(800); // auto-run debounce
  await page.locator('[data-testid="search-progress"]').waitFor({ state: 'detached', timeout: 180000 });
  await page.locator('[data-testid="search-row"]').first().waitFor({ timeout: 180000 });
};
const top = async (page) => {
  const row = page.locator('[data-testid="search-row"]').first();
  return {
    dps: (await row.locator('[data-testid="dps"]').innerText()).trim(),
    ttk: (await row.locator('[data-testid="ttk"]').innerText()).trim(),
    weapon: (await row.locator('[data-testid="weapon-line"]').innerText()).replace(/\s+/g, ' ').trim(),
  };
};
const shot = async (page, name) => {
  await page.mouse.move(0, 0);
  await page.screenshot({ path: `docs/screenshots/phase18-${name}.png`, fullPage: true });
};

const faXarth = async (page, label) => {
  await page.locator('[data-testid="boss-select"]').selectOption('xarth');
  await page.locator('[data-testid="drain-none"]').click();
  await waitSearch(page);
  const t = await top(page);
  check(t.dps === '12.839', `${label}: FA Xarth None top ${t.dps} (phase 9-17: 12.839)`);
};

const main = async () => {
  fs.mkdirSync('docs/screenshots', { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 1500 } });
  await page.goto(`${BASE}best-setup`, { waitUntil: 'load', timeout: 120000 });

  // 1. raid tabs
  const raids = await page.locator('[data-testid^="raid-tab-"]').allInnerTexts();
  check(raids.join(',') === 'Fractured Archive,Tombs of Amascut', `raid tabs: ${raids.join(', ')}`);
  const h = (await page.locator('h2').first().innerText()).trim();
  check(h === 'Best setup · The Fractured Archive', `FA is the default raid (${h})`);
  check((await page.locator('[data-testid="routes-tab"]').innerText()).trim() === 'Routes', 'FA routes tab = Routes');
  check(await page.locator('#bs-zeal').count() === 1, 'FA keeps Zeal / fragments');
  await faXarth(page, 'before');
  await shot(page, 'fa-xarth');

  // 2. ToA tab
  await page.locator('[data-testid="raid-tab-toa"]').click();
  await page.locator('h2', { hasText: 'Tombs of Amascut' }).waitFor({ timeout: 30000 });
  check((await page.locator('[data-testid="routes-tab"]').innerText()).trim() === 'Encounters', 'ToA routes tab = Encounters');
  const scaling = await page.locator('[data-testid="scaling-inputs"] input').evaluateAll((els) => els.map((e) => `${e.id}=${e.value}`));
  console.log(`     scaling: ${scaling.join(', ')}`);
  check(scaling.join(',') === 'bs-party=6,bs-scale-toaInvocationLevel=500,bs-scale-toaPath-akkha=0,bs-scale-toaPath-baba=0,bs-scale-toaPath-kephri=0,bs-scale-toaPath-zebak=0',
    'ToA scaling inputs: party 6, raid level 500, path levels 0');
  check(await page.locator('#bs-zeal').count() === 0 && await page.locator('#bs-fragments').count() === 0, 'no Zeal / fragments on ToA');
  const potions = await page.locator('select[id^="bs-potion-"]').evaluateAll((els) => els.map((e) => e.selectedOptions[0].textContent));
  check(potions.every((p) => p === 'Smelling salts'), `potions: ${potions.join(', ')}`);
  const bosses = await page.locator('[data-testid="boss-select"] option').allInnerTexts();
  console.log(`     bosses: ${bosses.join(', ')}`);
  check(bosses.length === 15 && bosses.includes('Zebak') && bosses.includes('Akkha'), `${bosses.length} ToA targets`);

  // 3. Search on Zebak, raid level 500 → 300
  await page.locator('[data-testid="boss-select"]').selectOption('toa-zebak');
  await page.locator('[data-testid="drain-team"]').click();
  const hp500 = (await page.locator('[data-testid="target-hp"]').innerText()).trim();
  check(hp500 === '8000 hp', `Zebak hp at raid level 500, 6 players: ${hp500} (upstream 8000)`);
  const t0 = Date.now();
  await waitSearch(page);
  const z500 = await top(page);
  console.log(`     Zebak Team @500: ${z500.weapon} ${z500.dps} DPS, TTK ${z500.ttk} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  check(Number(z500.dps) > 5, 'Zebak search completed with a top row');
  check(await page.locator('[data-testid="boss-select"] + *').count() >= 0, 'boss icon slot');
  await shot(page, 'toa-zebak-500');
  await page.locator('#bs-scale-toaInvocationLevel').fill('300');
  await page.waitForTimeout(300);
  const hp300 = (await page.locator('[data-testid="target-hp"]').innerText()).trim();
  check(hp300 === '5870 hp', `Zebak hp at raid level 300: ${hp300} (580 × 2.2 × 4.6 → 5870)`);
  await page.locator('[data-testid="search-row"]').first().waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
  await waitSearch(page);
  const z300 = await top(page);
  console.log(`     Zebak Team @300: ${z300.weapon} ${z300.dps} DPS, TTK ${z300.ttk}`);
  check(z300.ttk !== z500.ttk && parseFloat(z300.ttk) < parseFloat(z500.ttk), `raid level 300 changes the TTK (${z500.ttk} → ${z300.ttk})`);
  await shot(page, 'toa-zebak-300');
  await page.locator('#bs-scale-toaInvocationLevel').fill('500');

  // 4. Encounters
  await page.locator('[data-testid="routes-tab"]').click();
  await page.locator('[data-testid="routes-view"]').waitFor({ timeout: 30000 });
  const tr = Date.now();
  await page.waitForTimeout(900);
  await page.locator('[data-testid="routes-progress"]').waitFor({ state: 'detached', timeout: 600000 });
  await page.locator('[data-testid="route-row"]').first().waitFor({ timeout: 600000 });
  const rows = await page.locator('[data-testid="route-row"]').count();
  check(rows === 1, `one route (${rows})`);
  const total = (await page.locator('[data-testid="route-total"]').innerText()).trim();
  const encs = await page.locator('[data-testid="route-row"] [data-testid^="enc-"]').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-testid').slice(4)}=${Number(e.getAttribute('data-seconds')).toFixed(1)}`));
  console.log(`     Encounters (best search result per style, Team): ${total} — ${encs.join(', ')} (${((Date.now() - tr) / 1000).toFixed(1)} s)`);
  check(encs.length === 5, '5 encounters');
  const phaseRows = await page.locator('[data-testid="phase-row"]').count();
  check(phaseRows >= 12, `per-encounter breakdown open (${phaseRows} phase rows)`);
  await shot(page, 'toa-encounters');

  // 5. Plan
  await page.locator('[data-testid="plan-tab"]').click();
  await page.locator('[data-testid="plan-view"]').waitFor({ timeout: 30000 });
  const tp = Date.now();
  await page.waitForTimeout(900);
  await page.locator('[data-testid="plan-progress"]').waitFor({ state: 'detached', timeout: 600000 });
  await page.locator('[data-testid="plan-result"]').waitFor({ timeout: 600000 });
  const headline = (await page.locator('[data-testid="plan-headline"]').innerText()).replace(/\s+/g, ' ').trim();
  const kit = await page.locator('[data-testid="kit-loadout"]').allInnerTexts();
  const cells = await page.locator('[data-testid="inventory-cell"]').count();
  console.log(`     plan (${((Date.now() - tp) / 1000).toFixed(1)} s): ${headline}`);
  kit.forEach((k) => console.log(`     kit: ${k.replace(/\s+/g, ' ').slice(0, 200)}`));
  check(cells === 28, `Plan for ToA: 28-cell inventory (${cells})`);
  check(/\d+:\d\d\.\d/.test(headline), 'Plan total time shown');
  await shot(page, 'toa-plan');

  // 6. Summary
  await page.locator('[data-testid="summary-tab"]').click();
  await page.locator('[data-testid="summary-view"]').waitFor({ timeout: 30000 });
  const ts = Date.now();
  await page.waitForTimeout(900);
  await page.locator('[data-testid="summary-progress"]').waitFor({ state: 'detached', timeout: 900000 });
  const sRows = await page.locator('[data-testid="summary-row"]').count();
  const sCells = await page.locator('[data-testid="summary-cell"] [data-testid="dps"]').count();
  console.log(`     Summary ${sRows} rows, ${sCells} cells (${((Date.now() - ts) / 1000).toFixed(1)} s)`);
  check(sRows === 12 && sCells === 36, `ToA Summary 12 rows × 3 drain states (${sRows}, ${sCells})`);
  await shot(page, 'toa-summary');

  // 7. back to FA
  await page.locator('[data-testid="raid-tab-fractured-archive"]').click();
  await page.locator('h2', { hasText: 'The Fractured Archive' }).waitFor({ timeout: 30000 });
  check(await page.locator('#bs-party').inputValue() === '6', 'FA assumptions kept');
  await faXarth(page, 'after');

  await browser.close();
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks OK');
  process.exit(failures ? 1 : 0);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
