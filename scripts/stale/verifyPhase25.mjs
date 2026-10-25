// STALE: checks written for pre-phase-29 defaults; fails at HEAD. Run with `node scripts/verifyAll.mjs --all` only.
/**
 * Phase 25 UI check (not part of the Jest run): item data refresh.
 *
 * Usage (dev server running): node scripts/verifyPhase25.mjs [baseUrl]
 * - Search (Fractured Archive, Xarth, Team drains, all styles): top row unchanged (Obligator 13.917); a top-10 row
 *   wears the Necklace of rupture; the best Twisted bow row fires Seeking dragon arrows (a dragon-arrow row is lower).
 * - Styles = Ranged: the top row wears rupture (Ascension crossbows 10.430, was 10.012 with anguish); the Twisted bow
 *   row is "Twisted bow · Seeking dragon arrow" 10.379 (was 9.834).
 * - Styles = Magic: the top row wears the Elemental amulet (Harmonised Nightmare staff 6.633, was 6.291 with Occult).
 * - Images: every requested image URL with an apostrophe is requested with a literal ' (no %27) and answers 200
 *   directly (no 307; a later 304 is the browser revalidating its cache); Tumeken's shadow (Search icons + calculator slot) and '24-carat' sword (calculator slot) load.
 * Screenshots docs/screenshots/phase25-*.png.
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
  await page.screenshot({ path: `docs/screenshots/phase25-${name}.png`, fullPage: true });
};

const waitSearch = async (page) => {
  await page.waitForTimeout(800);
  await page.locator('[data-testid="search-progress"]').waitFor({ state: 'detached', timeout: 300000 });
  await page.locator('[data-testid="search-results"]').waitFor({ timeout: 300000 });
};
const readRows = (page) => page.locator('[data-testid="search-row"]').evaluateAll((rows) => rows.map((r) => ({
  dps: Number(r.querySelector('[data-testid="dps"]').textContent.trim()),
  text: r.innerText,
  weapon: r.querySelector('[data-testid="weapon-line"]').innerText.replace(/\s+/g, ' ').trim(),
})));
const SEEKING_TBOW = /^Twisted bow · Seeking dragon arrow$/;
const near = (a, b) => Math.abs(a - b) < 0.0005;

const pickCombobox = async (page, placeholder, text, option = text) => {
  const input = page.getByPlaceholder(placeholder);
  await input.click();
  await input.fill(text);
  await page.waitForTimeout(800);
  await page.locator('[role="option"]', { hasText: option }).first().click();
  await page.waitForTimeout(800);
};

const main = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1400 } });

  // every image request / response whose URL has an apostrophe (literal or encoded)
  const apostrophe = [];
  page.on('response', (res) => {
    const url = res.url();
    if (!/\/(equipment|monsters)\//.test(url) || !(url.includes("'") || /%27/i.test(url))) return;
    apostrophe.push({ url, status: res.status(), redirected: !!res.request().redirectedFrom() });
  });

  await page.goto(`${BASE}best-setup`, { waitUntil: 'load', timeout: 120000 });
  await page.locator('[data-testid="assumptions"]').waitFor({ timeout: 120000 });

  // --- Search: Xarth, Team drains (default), all styles
  await page.locator('[data-testid="boss-select"]').selectOption('xarth');
  await waitSearch(page);
  let rows = await readRows(page);
  check(near(rows[0].dps, 13.917) && rows[0].text.includes('Obligator'), `Xarth Team top row ${rows[0].dps} Obligator (13.917 unchanged)`);
  const ruptureRows = rows.map((r, i) => [i + 1, r]).filter(([, r]) => r.text.includes('Necklace of rupture'));
  check(ruptureRows.length > 0, `top 10 rows with the Necklace of rupture: #${ruptureRows.map(([i, r]) => `${i} (${r.dps})`).join(', #')}`);
  const tbowRows = rows.filter((r) => r.weapon.startsWith('Twisted bow'));
  // each ammo option is its own variant, so a dragon-arrow Twisted bow row can also make the top 10 — below Seeking
  check(tbowRows.length > 0 && SEEKING_TBOW.test(tbowRows[0].weapon)
    && tbowRows.slice(1).every((r) => r.dps < tbowRows[0].dps), `best Twisted bow row fires Seeking dragon arrows, others lower (${tbowRows.map((r) => `"${r.weapon}" ${r.dps}`).join(', ')})`);
  await shot(page, 'search-xarth-team');

  // --- ranged only
  await page.locator('[data-testid="search-styles"]').selectOption('ranged');
  await waitSearch(page);
  rows = await readRows(page);
  check(rows[0].text.includes('Necklace of rupture') && near(rows[0].dps, 10.43), `Ranged top row ${rows[0].dps} wears rupture (10.430; 10.012 with anguish)`);
  const tbow = rows.find((r) => r.weapon.startsWith('Twisted bow'));
  check(!!tbow && SEEKING_TBOW.test(tbow.weapon) && near(tbow.dps, 10.379), `Twisted bow row ${tbow?.dps} "${tbow?.weapon}" (10.379; 9.834 with dragon arrows + anguish)`);
  check(rows.every((r) => !r.text.includes('Necklace of anguish')), 'no ranged top-10 row keeps the Necklace of anguish');
  await shot(page, 'search-xarth-ranged');

  // --- magic only
  await page.locator('[data-testid="search-styles"]').selectOption('magic');
  await waitSearch(page);
  rows = await readRows(page);
  check(rows[0].text.includes('Elemental amulet') && near(rows[0].dps, 6.633), `Magic top row ${rows[0].dps} wears the Elemental amulet (6.633; 6.291 with Occult)`);
  await shot(page, 'search-xarth-magic');

  // --- calculator: apostrophe images in the equipment slots
  await page.goto(BASE, { waitUntil: 'load', timeout: 120000 });
  await page.getByPlaceholder('Search for monster...').waitFor({ timeout: 120000 });
  await pickCombobox(page, 'Search for equipment...', "Tumeken's shadow");
  const slotImg = async (name) => page.locator(`img[alt="${name}"]`).first().evaluate((img) => ({ src: img.getAttribute('src'), w: img.naturalWidth }));
  await page.waitForTimeout(1500);
  const shadow = await slotImg("Tumeken's shadow");
  check(shadow.w > 0, `Tumeken's shadow slot image loaded (${shadow.src})`);
  await pickCombobox(page, 'Search for equipment...', "'24-carat' sword");
  await page.waitForTimeout(1500);
  const carat = await slotImg("'24-carat' sword");
  check(carat.w > 0, `'24-carat' sword slot image loaded (${carat.src})`);
  await shot(page, 'calculator-apostrophe-images');

  // --- network: literal apostrophes, 200, no redirects
  const want = ["Tumeken's%20shadow.png", "'24-carat'%20sword.png"];
  for (const w of want) {
    const hits = apostrophe.filter((a) => a.url.endsWith(w));
    // 304 = the browser revalidating its cached copy (no redirect)
    check(hits.length > 0 && hits.every((h) => [200, 304].includes(h.status) && !h.redirected), `${decodeURIComponent(w)}: ${hits.map((h) => `${h.status}${h.redirected ? ' (redirected)' : ''}`).join(', ') || 'not requested'}`);
  }
  const encoded = apostrophe.filter((a) => /%27/i.test(a.url));
  const redirects = apostrophe.filter((a) => a.status === 307 || a.redirected);
  check(encoded.length === 0, `no %27 image requests (${apostrophe.length} apostrophe image responses)`);
  check(redirects.length === 0, `no 307 / redirected apostrophe images${redirects.length ? `: ${redirects.map((r) => r.url).join(', ')}` : ''}`);

  await browser.close();
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks OK');
  process.exitCode = failures ? 1 : 0;
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
