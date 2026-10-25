// STALE: checks written for pre-phase-29 defaults; fails at HEAD. Run with `node scripts/verifyAll.mjs --all` only.
/**
 * Phase 24 UI check (not part of the Jest run): spec accuracy in the raids.
 *
 * Usage (dev server running): node scripts/verifyPhase24.mjs [baseUrl]
 * - Best setup, ToA, Kephri (Shielded), raid level 500, Team and Solo: the drain line shows the Elder maul hit % (63%,
 *   the spec model = hand computation in src/tests/lib/raids/SpecAccuracy.test.ts) and the note "1 landed spec reaches
 *   the floor (Def 60)"; raid level 150 → the % rises (80%).
 * - Ba-Ba at 500 (Solo): "drains unlikely to land here: N% per spec".
 * - Main calculator: the spec player (Elder maul, Inquisitor's, Piety, Smelling salts; fixture
 *   scripts/phase24-kephri-loadout.json, written from `specPlayer()`) vs Kephri (Shielded) at raid level 500: normal
 *   Accuracy 53.77%, spec Accuracy 63.02%, attack roll 47362, NPC defence roll 43788.
 * Screenshots docs/screenshots/phase24-*.png.
 */
import { readFileSync } from 'fs';
import { chromium } from '@playwright/test';

const BASE = (process.argv[2] || 'http://localhost:3001/osrs-dps/').replace(/\/?$/, '/');

let failures = 0;
const check = (ok, msg) => {
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`);
};
const shot = async (page, name) => {
  await page.mouse.move(0, 0);
  await page.screenshot({ path: `docs/screenshots/phase24-${name}.png`, fullPage: true });
};

const waitSearch = async (page) => {
  await page.waitForTimeout(800);
  await page.locator('[data-testid="search-progress"]').waitFor({ state: 'detached', timeout: 300000 });
  await page.locator('[data-testid="search-results"]').waitFor({ timeout: 300000 });
};
const maulLine = async (page) => {
  const scope = page.locator('[data-testid="spec-plan"]');
  const hit = await scope.locator('[data-testid="drain-line-item"][data-weapon="elderMaul"] [data-testid="drain-line-hit"]').first().innerText();
  const note = await scope.locator('[data-testid="drain-line-note"]').first().innerText().catch(() => '');
  return { hit: hit.trim(), note: note.trim() };
};

const main = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1400 } });
  await page.goto(`${BASE}best-setup`, { waitUntil: 'load', timeout: 120000 });
  await page.locator('[data-testid="assumptions"]').waitFor({ timeout: 120000 });
  await page.locator('[data-testid="raid-tab-toa"]').click();
  await page.locator('h2', { hasText: 'Tombs of Amascut' }).waitFor({ timeout: 30000 });
  check(await page.locator('#bs-scale-toaInvocationLevel').inputValue() === '500', 'ToA raid level 500 (default)');

  await page.locator('[data-testid="boss-select"]').selectOption('toa-kephri-shielded');
  await page.locator('[data-testid="drain-team"]').click();
  await waitSearch(page);
  const t500 = await maulLine(page);
  console.log(`     Team @500: maul ${t500.hit}; note "${t500.note}"`);
  check(t500.hit === '63% land', `Team @500: Elder maul ${t500.hit} (63% = hand computation)`);
  check(/^1 landed spec reaches the floor \(Def 60\)/.test(t500.note), 'Team @500: note says one landed spec reaches the floor (Def 60)');
  await page.locator('[data-testid="spec-plan"]').scrollIntoViewIfNeeded();
  await shot(page, 'kephri-500-team');

  await page.locator('[data-testid="drain-solo"]').click();
  await waitSearch(page);
  const s500 = await maulLine(page);
  check(s500.hit === '63% land', `Solo @500: Elder maul ${s500.hit}`);

  await page.locator('#bs-scale-toaInvocationLevel').fill('150');
  await page.waitForTimeout(300);
  await page.locator('[data-testid="drain-team"]').click();
  await waitSearch(page);
  const t150 = await maulLine(page);
  console.log(`     Team @150: maul ${t150.hit}`);
  check(parseInt(t150.hit, 10) > parseInt(t500.hit, 10) && t150.hit === '80% land', `raid level 150 raises the hit chance (${t500.hit} → ${t150.hit})`);
  await shot(page, 'kephri-150-team');

  await page.locator('#bs-scale-toaInvocationLevel').fill('500');
  await page.waitForTimeout(300);
  await page.locator('[data-testid="boss-select"]').selectOption('toa-baba');
  await page.locator('[data-testid="drain-solo"]').click();
  await waitSearch(page);
  const baba = await maulLine(page);
  console.log(`     Ba-Ba Solo @500: maul ${baba.hit}; note "${baba.note}"`);
  check(/^drains unlikely to land here: \d+% per spec$/.test(baba.note), 'Ba-Ba @500: "drains unlikely to land here"');
  await shot(page, 'baba-500-solo');

  // --- main calculator: the spec player vs Kephri (Shielded) at 500
  const { player, monster } = JSON.parse(readFileSync('scripts/phase24-kephri-loadout.json', 'utf8'));
  await page.goto(BASE, { waitUntil: 'load', timeout: 120000 });
  await page.getByPlaceholder('Search for monster...').waitFor({ timeout: 120000 });
  // localforage's IndexedDB store ('localforage' / 'keyvaluepairs'); created here if the app hasn't saved yet
  await page.evaluate((state) => new Promise((resolve, reject) => {
    const put = (db) => {
      try {
        const tx = db.transaction('keyvaluepairs', 'readwrite');
        tx.objectStore('keyvaluepairs').put(state, 'dps-calc-state');
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      } catch (e) { reject(e); }
    };
    const open = (version) => {
      const req = version ? indexedDB.open('localforage', version) : indexedDB.open('localforage');
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains('keyvaluepairs')) req.result.createObjectStore('keyvaluepairs');
      };
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('indexedDB upgrade blocked'));
      req.onsuccess = () => {
        const db = req.result;
        if (db.objectStoreNames.contains('keyvaluepairs')) put(db);
        else { const v = db.version + 1; db.close(); open(v); }
      };
    };
    open();
    setTimeout(() => reject(new Error('indexedDB write timed out')), 15000);
  }), {
    serializationVersion: 10, loadouts: [player], selectedLoadout: 0, monster,
  });
  await page.reload({ waitUntil: 'load' });
  await page.getByPlaceholder('Search for monster...').waitFor({ timeout: 120000 });
  await page.waitForTimeout(3000);
  const showMore = page.locator('button', { hasText: 'Show more' });
  if (await showMore.count()) await showMore.first().click();
  await page.waitForTimeout(1500);
  const rows = await page.locator('table tr').evaluateAll((trs) => trs.map((tr) => [...tr.children].map((c) => c.textContent.trim())));
  const val = (label, n = 0) => rows.filter((r) => r[0] === label)[n]?.[1];
  const acc = val('Accuracy', 0);
  const specAcc = val('Accuracy', 1);
  const atk = val('Attack roll');
  const def = rows.find((r) => /defen[cs]e roll/i.test(r[0]))?.[1];
  console.log(`     calculator: Accuracy ${acc}, spec Accuracy ${specAcc}, attack roll ${atk}, NPC defence roll ${def}`);
  check(acc === '53.77%', `calculator normal Accuracy ${acc} (53.77%)`);
  check(specAcc === '63.02%', `calculator spec Accuracy ${specAcc} (63.02% = drain line 63%)`);
  check((atk || '').replace(/,/g, '') === '47362' && (def || '').replace(/,/g, '') === '43788', `rolls ${atk} / ${def} (47362 / 43788)`);
  await shot(page, 'calc-kephri-500');

  await browser.close();
  console.log(failures ? `${failures} FAILED` : 'all OK');
  process.exit(failures ? 1 : 0);
};

main();
