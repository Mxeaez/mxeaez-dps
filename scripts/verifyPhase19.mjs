/**
 * Phase 19 UI check (not part of the Jest run): the Chambers of Xeric tab on /best-setup.
 *
 * Usage (dev server running): node scripts/verifyPhase19.mjs [baseUrl]
 * - Raid tabs: Fractured Archive, Tombs of Amascut, Chambers of Xeric. FA unchanged (Xarth None top 12.839).
 * - CoX tab: party 6, Challenge Mode checkbox (off), Overload (+) potions, team-DPS ×6, 18 targets, "Encounters".
 * - Tekton Search: 1200 hp / Def 215 (upstream scaling at 6); Challenge Mode → 1800 hp / Def 290; back off.
 * - Guardians Search: a pickaxe on top; non-pickaxe weapons listed as can't hit.
 * - Top Search row per target (Team drains) for the headline.
 * - Encounters: one route, 10 encounters, Olm breakdown = 3 hand phases × 2 claws + head.
 * - Plan runs (≤ 30 s), 28 cells. ToA unchanged (Zebak 8000 hp at raid level 500). Back to FA: Xarth 12.839.
 * Screenshots docs/screenshots/phase19-*.png.
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
  await page.screenshot({ path: `docs/screenshots/phase19-${name}.png`, fullPage: true });
};
const stats = async (page) => ({
  hp: (await page.locator('[data-testid="target-hp"]').innerText()).trim(),
  def: (await page.locator('[data-testid="target-def"]').innerText()).trim(),
});
/** Selects a target and drain state and waits for a fresh search. */
const search = async (page, key, drain) => {
  const select = page.locator('[data-testid="boss-select"]');
  const changed = (await select.inputValue()) !== key;
  if (changed) await select.selectOption(key);
  await page.locator(`[data-testid="drain-${drain}"]`).click();
  await waitSearch(page);
  return top(page);
};

const faXarth = async (page, label) => {
  await page.locator('[data-testid="boss-select"]').selectOption('xarth');
  await page.locator('[data-testid="drain-none"]').click();
  await waitSearch(page);
  const t = await top(page);
  check(t.dps === '12.839', `${label}: FA Xarth None top ${t.dps} (phase 9-18: 12.839)`);
};

const main = async () => {
  fs.mkdirSync('docs/screenshots', { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 1500 } });
  await page.goto(`${BASE}best-setup`, { waitUntil: 'load', timeout: 120000 });

  // 1. raid tabs, FA unchanged
  const raids = await page.locator('[data-testid^="raid-tab-"]').allInnerTexts();
  check(raids.slice(0, 3).join(',') === 'Fractured Archive,Tombs of Amascut,Chambers of Xeric', `raid tabs: ${raids.join(', ')}`); // phase 20: + Theatre of Blood
  await faXarth(page, 'before');

  // 2. CoX tab
  await page.locator('[data-testid="raid-tab-cox"]').click();
  await page.locator('h2', { hasText: 'Chambers of Xeric' }).waitFor({ timeout: 30000 });
  check((await page.locator('[data-testid="routes-tab"]').innerText()).trim() === 'Encounters', 'CoX routes tab = Encounters');
  check(await page.locator('#bs-party').inputValue() === '6', 'party size 6');
  const cm = page.locator('#bs-scale-coxChallengeMode');
  check(await cm.count() === 1 && await cm.getAttribute('type') === 'checkbox' && !(await cm.isChecked()), 'Challenge Mode checkbox, off');
  check(await page.locator('#bs-zeal').count() === 0, 'no Zeal / fragments on CoX');
  const potions = await page.locator('select[id^="bs-potion-"]').evaluateAll((els) => els.map((e) => e.selectedOptions[0].textContent));
  check(potions.every((p) => p === 'Overload (+)'), `potions: ${potions.join(', ')}`);
  check(await page.locator('#bs-team-mult').inputValue() === '6', 'team-DPS multiplier 6 (= party size)');
  const bosses = await page.locator('[data-testid="boss-select"] option').evaluateAll((els) => els.map((e) => e.value));
  check(bosses.length === 18, `${bosses.length} CoX targets`);

  // 3. Tekton: scaled hp / Defence, then Challenge Mode
  const tekNone = await search(page, 'cox-tekton', 'none');
  const tek = await stats(page);
  const summary = (await page.locator('[data-testid="search-summary"]').innerText()).replace(/\s+/g, ' ');
  check(tek.hp === '1200 hp' && tek.def === 'Def 215', `Tekton normal, 6 players: ${tek.hp}, ${tek.def} (upstream 1200 / 215)`);
  check(summary.includes('Defence 215'), 'search summary: Defence 215 without drains');
  console.log(`     Tekton None: ${tekNone.weapon} ${tekNone.dps} DPS, TTK ${tekNone.ttk}`);
  await shot(page, 'tekton');
  await cm.check();
  await page.waitForTimeout(300);
  const tekCm = await stats(page);
  check(tekCm.hp === '1800 hp' && tekCm.def === 'Def 290', `Tekton CM: ${tekCm.hp}, ${tekCm.def} (upstream 1800 / 290)`);
  await waitSearch(page);
  const tekCmTop = await top(page);
  console.log(`     Tekton CM None: ${tekCmTop.weapon} ${tekCmTop.dps} DPS, TTK ${tekCmTop.ttk}`);
  check(Number(tekCmTop.dps) < Number(tekNone.dps), 'CM: lower DPS on Tekton (higher Defence)');
  await shot(page, 'tekton-cm');
  await cm.uncheck();
  await page.waitForTimeout(300);
  check((await stats(page)).hp === '1200 hp', 'CM off: back to 1200 hp');

  // 4. Guardians
  const g = await search(page, 'cox-guardian', 'none');
  const gStats = (await page.locator('[data-testid="search-stats"]').innerText()).replace(/\s+/g, ' ');
  console.log(`     Guardians: ${g.weapon} ${g.dps} DPS, TTK ${g.ttk}`);
  check(/pickaxe/i.test(g.weapon), 'Guardians: a pickaxe on top');
  check(gStats.includes('can\'t hit') && gStats.includes('Scythe of Vitur') && gStats.includes('Twisted bow'), 'Guardians: Scythe / Twisted bow listed as can\'t hit');
  await shot(page, 'guardians');

  // 5. top Search row per target, Team drains (headline)
  for (const key of bosses) {
    const t = await search(page, key, 'team');
    const s = await stats(page);
    const label = await page.locator(`[data-testid="boss-select"] option[value="${key}"]`).innerText();
    console.log(`     ${label} (${s.hp}, ${s.def}) Team: ${t.weapon.slice(0, 140)} | ${t.dps} DPS, TTK ${t.ttk}`);
  }

  // 6. Encounters
  await page.locator('[data-testid="routes-tab"]').click();
  await page.locator('[data-testid="routes-view"]').waitFor({ timeout: 30000 });
  const tr = Date.now();
  await page.waitForTimeout(900);
  await page.locator('[data-testid="routes-progress"]').waitFor({ state: 'detached', timeout: 600000 });
  await page.locator('[data-testid="route-row"]').first().waitFor({ timeout: 600000 });
  check(await page.locator('[data-testid="route-row"]').count() === 1, 'one route');
  const total = (await page.locator('[data-testid="route-total"]').innerText()).trim();
  const encs = await page.locator('[data-testid="route-row"] [data-testid^="enc-"]').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-testid').slice(4)}=${Number(e.getAttribute('data-seconds')).toFixed(1)}`));
  console.log(`     Encounters (best search result per style, Team): ${total} — ${encs.join(', ')} (${((Date.now() - tr) / 1000).toFixed(1)} s)`);
  check(encs.length === 10, `10 encounters (${encs.length})`);
  const olmRows = await page.locator('[data-testid="phase-row"][data-encounter="cox-olm"]').allInnerTexts();
  olmRows.forEach((r) => console.log(`     olm: ${r.replace(/\s+/g, ' ').slice(0, 160)}`));
  check(olmRows.length === 7 && olmRows[0].includes('Phase 1 of 3') && olmRows[6].includes('Final phase: head'), 'Olm breakdown: 3 phases × 2 claws + head');
  await shot(page, 'encounters');

  // 7. Plan
  await page.locator('[data-testid="plan-tab"]').click();
  await page.locator('[data-testid="plan-view"]').waitFor({ timeout: 30000 });
  const tp = Date.now();
  await page.waitForTimeout(900);
  await page.locator('[data-testid="plan-progress"]').waitFor({ state: 'detached', timeout: 600000 });
  await page.locator('[data-testid="plan-result"]').waitFor({ timeout: 600000 });
  const planSeconds = (Date.now() - tp) / 1000;
  const headline = (await page.locator('[data-testid="plan-headline"]').innerText()).replace(/\s+/g, ' ').trim();
  const kit = await page.locator('[data-testid="kit-loadout"]').allInnerTexts();
  const cells = await page.locator('[data-testid="inventory-cell"]').count();
  console.log(`     plan (${planSeconds.toFixed(1)} s): ${headline}`);
  kit.forEach((k) => console.log(`     kit: ${k.replace(/\s+/g, ' ').slice(0, 220)}`));
  check(cells === 28, `Plan for CoX: 28-cell inventory (${cells})`);
  check(planSeconds <= 30, `Plan ran in ≤ 30 s (${planSeconds.toFixed(1)} s)`);
  check(/\d+:\d\d\.\d/.test(headline) && headline.includes('times assume 6 players at your DPS'), 'Plan total time shown, team label');
  await shot(page, 'plan');

  // 8. ToA unchanged
  await page.locator('[data-testid="raid-tab-toa"]').click();
  await page.locator('h2', { hasText: 'Tombs of Amascut' }).waitFor({ timeout: 30000 });
  await page.locator('[data-testid="search-tab"]').click().catch(() => {});
  await page.locator('[data-testid="boss-select"]').selectOption('toa-zebak');
  await page.waitForTimeout(300);
  const zHp = (await page.locator('[data-testid="target-hp"]').innerText()).trim();
  check(zHp === '8000 hp', `ToA Zebak at raid level 500, 6 players: ${zHp} (8000)`);

  // 9. back to FA
  await page.locator('[data-testid="raid-tab-fractured-archive"]').click();
  await page.locator('h2', { hasText: 'The Fractured Archive' }).waitFor({ timeout: 30000 });
  await page.locator('[data-testid="search-tab"]').click().catch(() => {});
  await faXarth(page, 'after');

  await browser.close();
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks OK');
  process.exit(failures ? 1 : 0);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
