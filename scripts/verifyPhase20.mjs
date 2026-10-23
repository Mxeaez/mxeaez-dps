/**
 * Phase 20 UI check (not part of the Jest run): the Theatre of Blood tab on /best-setup.
 *
 * Usage (dev server running): node scripts/verifyPhase20.mjs [baseUrl]
 * - Raid tabs: Fractured Archive, Tombs of Amascut, Chambers of Xeric, Theatre of Blood. FA unchanged (Xarth 12.839).
 * - ToB tab: party 4, mode select (Normal), team-DPS ×4, 20 targets, "Encounters".
 * - Maiden 3062 hp at 4 → 3500 at 5 (upstream / wiki 87.5% → 100%); back to 4.
 * - Hard Mode: Xarpus 4375 hp / Def 250 → 5250 / Def 200; back to Normal.
 * - Verzik P1 (best per weapon): melee max hit 30 (3 × 10), ranged / magic 3, Dawnbringer uncapped.
 * - Vasilias magic form: magic on top, melee and ranged listed as can't hit.
 * - Top Search row per Summary target (Team drains) for the headline.
 * - Encounters: one route, 6 encounters, Maiden 4 segments, Verzik P1 specs + P1 + P2 + P3.
 * - Plan runs (≤ 30 s), 28 cells; Hard Mode Encounters total for the planned kit.
 * - CoX Tekton 1200 / Def 215, ToA Zebak 8000, FA Xarth 12.839 after.
 * Screenshots docs/screenshots/phase20-*.png.
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
  await page.screenshot({ path: `docs/screenshots/phase20-${name}.png`, fullPage: true });
};
const stats = async (page) => ({
  hp: (await page.locator('[data-testid="target-hp"]').innerText()).trim(),
  def: (await page.locator('[data-testid="target-def"]').innerText()).trim(),
});
const search = async (page, key, drain) => {
  const select = page.locator('[data-testid="boss-select"]');
  if ((await select.inputValue()) !== key) await select.selectOption(key);
  await page.locator(`[data-testid="drain-${drain}"]`).click();
  await waitSearch(page);
  return top(page);
};
const setParty = async (page, n) => {
  await page.locator('#bs-party').fill(String(n));
  await page.waitForTimeout(400);
};
const setMode = async (page, label) => {
  await page.locator('#bs-scale-tobMode').selectOption({ label });
  await page.waitForTimeout(400);
};
const runEncounters = async (page) => {
  await page.locator('[data-testid="routes-tab"]').click();
  await page.locator('[data-testid="routes-view"]').waitFor({ timeout: 30000 });
  await page.waitForTimeout(900);
  await page.locator('[data-testid="routes-progress"]').waitFor({ state: 'detached', timeout: 600000 });
  await page.locator('[data-testid="route-row"]').first().waitFor({ timeout: 600000 });
  const total = (await page.locator('[data-testid="route-total"]').innerText()).trim();
  const encs = await page.locator('[data-testid="route-row"] [data-testid^="enc-"]').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-testid').slice(4)}=${Number(e.getAttribute('data-seconds')).toFixed(1)}`));
  return { total, encs };
};
const faXarth = async (page, label) => {
  await page.locator('[data-testid="boss-select"]').selectOption('xarth');
  await page.locator('[data-testid="drain-none"]').click();
  await waitSearch(page);
  const t = await top(page);
  check(t.dps === '12.839', `${label}: FA Xarth None top ${t.dps} (phase 9-19: 12.839)`);
};

const main = async () => {
  fs.mkdirSync('docs/screenshots', { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 1500 } });
  await page.goto(`${BASE}best-setup`, { waitUntil: 'load', timeout: 120000 });

  // 1. raid tabs, FA unchanged
  const raids = await page.locator('[data-testid^="raid-tab-"]').allInnerTexts();
  check(raids.join(',') === 'Fractured Archive,Tombs of Amascut,Chambers of Xeric,Theatre of Blood', `raid tabs: ${raids.join(', ')}`);
  await faXarth(page, 'before');

  // 2. ToB tab
  await page.locator('[data-testid="raid-tab-tob"]').click();
  await page.locator('h2', { hasText: 'Theatre of Blood' }).waitFor({ timeout: 30000 });
  check((await page.locator('[data-testid="routes-tab"]').innerText()).trim() === 'Encounters', 'ToB routes tab = Encounters');
  check(await page.locator('#bs-party').inputValue() === '4', 'party size 4');
  const mode = page.locator('#bs-scale-tobMode');
  check(await mode.count() === 1 && (await mode.evaluate((e) => e.tagName)) === 'SELECT', 'mode is a select');
  check((await mode.evaluate((e) => e.selectedOptions[0].textContent)) === 'Normal', 'mode Normal');
  check(await page.locator('#bs-team-mult').inputValue() === '4', 'team-DPS multiplier 4 (= party size)');
  const bosses = await page.locator('[data-testid="boss-select"] option').evaluateAll((els) => els.map((e) => e.value));
  check(bosses.length === 20, `${bosses.length} ToB targets`);

  // 3. party 5 vs 4: Maiden hp
  await search(page, 'tob-maiden', 'none');
  const m4 = await stats(page);
  check(m4.hp === '3062 hp', `Maiden at 4: ${m4.hp} (3500 × 7/8 = 3062)`);
  await setParty(page, 5);
  const m5 = await stats(page);
  check(m5.hp === '3500 hp', `Maiden at 5: ${m5.hp}`);
  check(await page.locator('#bs-team-mult').inputValue() === '5', 'team-DPS multiplier follows party (5)');
  await shot(page, 'maiden-party5');
  await setParty(page, 4);
  check((await stats(page)).hp === '3062 hp', 'back to 4: 3062 hp');
  await waitSearch(page);

  // 4. Hard Mode: Xarpus
  await search(page, 'tob-xarpus', 'none');
  const xn = await stats(page);
  check(xn.hp === '4375 hp' && xn.def === 'Def 250', `Xarpus normal at 4: ${xn.hp}, ${xn.def}`);
  await setMode(page, 'Hard Mode');
  const xh = await stats(page);
  check(xh.hp === '5250 hp' && xh.def === 'Def 200', `Xarpus Hard Mode at 4: ${xh.hp}, ${xh.def} (6000 × 7/8, Def 200)`);
  await waitSearch(page);
  await shot(page, 'xarpus-hm');
  await setMode(page, 'Normal');
  check((await stats(page)).hp === '4375 hp', 'back to Normal: 4375 hp');
  await waitSearch(page);

  // 5. Verzik P1 capped max hits (best per weapon)
  await page.locator('#bs-search-perweapon').check();
  await search(page, 'tob-verzik-p1', 'none');
  const rowsNow = () => page.locator('[data-testid="search-row"]').evaluateAll((rows) => rows.map((r) => ({
    weapon: r.querySelector('[data-testid="weapon-line"]').textContent.replace(/\s+/g, ' ').trim(),
    max: Number(r.querySelector('[data-testid="maxhit"]').textContent),
    group: r.querySelectorAll('td')[6].textContent.trim().toLowerCase(),
  })));
  const p1rows = await rowsNow();
  await shot(page, 'verzik-p1');
  // ranged / magic rows sit below the melee ones: search each style on its own
  for (const g of ['ranged', 'magic']) {
    await page.locator('[data-testid="search-styles"]').selectOption(g);
    await waitSearch(page);
    p1rows.push(...await rowsNow());
  }
  await page.locator('[data-testid="search-styles"]').selectOption('all');
  await waitSearch(page);
  p1rows.slice(0, 12).forEach((r) => console.log(`     P1: ${r.group.slice(0, 6)} ${r.weapon.slice(0, 60)} max ${r.max}`));
  const scythe = p1rows.find((r) => r.weapon.startsWith('Scythe of Vitur'));
  const tbow = p1rows.find((r) => r.weapon.startsWith('Twisted bow'));
  const shadow = p1rows.find((r) => r.weapon.startsWith('Tumeken'));
  const dawn = p1rows.find((r) => r.weapon.startsWith('Dawnbringer'));
  check(scythe && scythe.max === 30, `P1 Scythe max ${scythe?.max} (3 hitsplats × 10)`);
  check(tbow && tbow.max === 3, `P1 Twisted bow max ${tbow?.max} (3)`);
  check(shadow && shadow.max === 3, `P1 Tumeken's shadow max ${shadow?.max} (3)`);
  check(dawn && dawn.max > 3, `P1 Dawnbringer max ${dawn?.max} (uncapped)`);
  check(p1rows.filter((r) => r.group.startsWith('melee') && !/^(Scythe|Dual)/.test(r.weapon)).every((r) => r.max <= 10), 'P1 single-hit melee rows: max 10');
  check(p1rows.filter((r) => r.group.startsWith('ranged')).every((r) => r.max <= 3), 'P1 every ranged row: max 3');
  await page.locator('#bs-search-perweapon').uncheck();

  // 6. Vasilias magic form
  const nm = await search(page, 'tob-nylo-boss-magic', 'none');
  const nStats = (await page.locator('[data-testid="search-stats"]').innerText()).replace(/\s+/g, ' ');
  console.log(`     Vasilias magic form: ${nm.weapon} ${nm.dps} DPS`);
  check(/Tumeken|staff|Kodai|Ayak|sceptre|wand|Harmonised/i.test(nm.weapon), 'Vasilias magic form: a magic weapon on top');
  check(nStats.includes('can\'t hit') && nStats.includes('Scythe of Vitur') && nStats.includes('Twisted bow'), 'Vasilias magic form: Scythe / Twisted bow listed as can\'t hit');
  await shot(page, 'nylo-magic');

  // 7. top Search row per Summary target, Team drains (headline)
  for (const key of ['tob-maiden', 'tob-bloat', 'tob-nylo-boss-melee', 'tob-nylo-boss-ranged', 'tob-nylo-boss-magic', 'tob-sotetseg', 'tob-xarpus', 'tob-verzik-p1', 'tob-verzik-p2', 'tob-verzik-p3']) {
    const t = await search(page, key, 'team');
    const s = await stats(page);
    const label = await page.locator(`[data-testid="boss-select"] option[value="${key}"]`).innerText();
    console.log(`     ${label} (${s.hp}, ${s.def}) Team: ${t.weapon.slice(0, 140)} | ${t.dps} DPS, TTK ${t.ttk}`);
  }

  // 8. Encounters
  const tr = Date.now();
  const enc = await runEncounters(page);
  console.log(`     Encounters (best search result per style, Team): ${enc.total} — ${enc.encs.join(', ')} (${((Date.now() - tr) / 1000).toFixed(1)} s)`);
  check(await page.locator('[data-testid="route-row"]').count() === 1, 'one route');
  check(enc.encs.length === 6, `6 encounters (${enc.encs.length})`);
  const maidenRows = await page.locator('[data-testid="phase-row"][data-encounter="tob-maiden"]').allInnerTexts();
  const verzikRows = await page.locator('[data-testid="phase-row"][data-encounter="tob-verzik"]').allInnerTexts();
  [...maidenRows, ...verzikRows].forEach((r) => console.log(`     row: ${r.replace(/\s+/g, ' ').slice(0, 170)}`));
  check(maidenRows.length === 4, 'Maiden: 4 segments (100/70/50/30%)');
  check(verzikRows.length === 4 && verzikRows[0].includes('Dawnbringer'), 'Verzik: Dawnbringer specs, P1, P2, P3');
  await shot(page, 'encounters');

  // 9. Plan
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
  const encPlan = await page.locator('[data-testid^="plan-enc-"]').evaluateAll((els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim().slice(0, 80))).catch(() => []);
  encPlan.forEach((e) => console.log(`     plan enc: ${e}`));
  check(cells === 28, `Plan for ToB: 28-cell inventory (${cells})`);
  check(planSeconds <= 30, `Plan ran in ≤ 30 s (${planSeconds.toFixed(1)} s)`);
  check(/\d+:\d\d\.\d/.test(headline) && headline.includes('times assume 4 players at your DPS'), 'Plan total time shown, team label');
  await shot(page, 'plan');

  // 10. Hard Mode with the planned kit: the plan's comparison under Hard Mode
  await setMode(page, 'Hard Mode');
  await page.waitForTimeout(900);
  await page.locator('[data-testid="plan-progress"]').waitFor({ state: 'detached', timeout: 600000 }).catch(() => {});
  await page.locator('[data-testid="plan-result"]').waitFor({ timeout: 600000 }).catch(() => {});
  const hmHeadline = (await page.locator('[data-testid="plan-headline"]').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  console.log(`     plan (Hard Mode): ${hmHeadline}`);
  await shot(page, 'plan-hm');
  await setMode(page, 'Normal');

  // 11. CoX and ToA unchanged
  await page.locator('[data-testid="raid-tab-cox"]').click();
  await page.locator('h2', { hasText: 'Chambers of Xeric' }).waitFor({ timeout: 30000 });
  await page.locator('[data-testid="search-tab"]').click().catch(() => {});
  await page.locator('[data-testid="boss-select"]').selectOption('cox-tekton');
  await page.waitForTimeout(300);
  const tek = await stats(page);
  check(tek.hp === '1200 hp' && tek.def === 'Def 215', `CoX Tekton at 6: ${tek.hp}, ${tek.def} (1200 / 215)`);
  await page.locator('[data-testid="raid-tab-toa"]').click();
  await page.locator('h2', { hasText: 'Tombs of Amascut' }).waitFor({ timeout: 30000 });
  await page.locator('[data-testid="search-tab"]').click().catch(() => {});
  await page.locator('[data-testid="boss-select"]').selectOption('toa-zebak');
  await page.waitForTimeout(300);
  const zHp = (await page.locator('[data-testid="target-hp"]').innerText()).trim();
  check(zHp === '8000 hp', `ToA Zebak at raid level 500, 6 players: ${zHp} (8000)`);

  // 12. back to FA
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
