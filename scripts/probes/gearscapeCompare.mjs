/**
 * Phase 38i: the Gearscape cross-check (docs/DATA_SOURCES.md, *Phase 38i*). Our max hit / accuracy / DPS
 * (gearscapeOurs.mjs: the planner's presets, default assumptions, best style) against https://gearscape.net/calculators/dps,
 * driven with Playwright through its Vuex store (setup / player / calculator commits, then the page's own loadTarget);
 * the numbers are read from the page's result card. Generic User-Agent, no personal data. Compare only.
 *
 * Usage: node scripts/probes/gearscapeCompare.mjs [--out file.json]   (about 2 minutes; needs network)
 * Prints one row per boss / phase / setup: ours, Gearscape's, and the % difference of DPS, max hit and accuracy.
 */
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { table, fmt, pct } from './bundle.mjs';
import { evaluate } from './gearscapeOurs.mjs';

// our row label -> [Gearscape target group text, index of the version in it]
const GS_TARGET = {
  'AG Flying': ['Archive Guardian', 0],
  'AG Grounded': ['Archive Guardian', 1],
  'Bork armour 8': ['Bork', 0],
  'Bork armour 10': ['Bork', 0],
  'Bork armour 12': ['Bork', 0],
  'Bork armour 14': ['Bork', 0],
  'Bork stunned': ['Bork', 1],
  Smorks: ['The Smorks', 0],
  Ezekiel: ['Ezekiel', 0],
  Xarth: ['Xarth', 0],
  'Ocellus P1 at a corner': ['Ocellus', 0],
  'Ocellus P1 walking (Prot Melee)': ['Ocellus', 0],
  'Ocellus P2 (Blade)': ['Ocellus', 1],
  'Ocellus P3 quadrants 1-3': ['Ocellus', 2],
};
const GEAR = {
  'Twisted bow (Masori)': {
    head: 'masori mask (f)', body: 'masori body (f)', legs: 'masori chaps (f)', cape: "dizana's quiver", neck: 'necklace of rupture', hands: 'zaryte vambraces', feet: 'avernic treads (max)', ring: 'venator ring', weapon: 'twisted bow', ammunition: 'seeking dragon arrow', shield: 'none',
  },
  'Torva + Scythe (slash)': {
    head: 'torva full helm', body: 'torva platebody', legs: 'torva platelegs', cape: 'infernal cape', neck: 'amulet of rancour', hands: 'ferocious gloves', feet: 'avernic treads (max)', ring: 'ultor ring', weapon: 'scythe of vitur', ammunition: 'none', shield: 'none',
  },
  'Torva + Obligator': {
    head: 'torva full helm', body: 'torva platebody', legs: 'torva platelegs', cape: 'infernal cape', neck: 'amulet of rancour', hands: 'ferocious gloves', feet: 'avernic treads (max)', ring: 'ultor ring', weapon: 'obligator', ammunition: 'none', shield: 'none',
  },
  "Tumeken's shadow (Ancestral)": {
    head: 'ancestral hat', body: 'ancestral robe top', legs: 'ancestral robe bottom', cape: 'imbued guthix cape', neck: 'occult necklace', hands: 'confliction gauntlets', feet: 'avernic treads (max)', ring: 'magus ring', weapon: "tumeken's shadow", ammunition: 'none', shield: 'none',
  },
};
const GROUP = {
  'Twisted bow (Masori)': 'ranged', 'Torva + Scythe (slash)': 'melee', 'Torva + Obligator': 'melee', "Tumeken's shadow (Ancestral)": 'magic',
};

const ours = evaluate();
const b = await chromium.launch();
const pg = await b.newPage({ userAgent: 'mxeaez-dps (private fork of osrs-dps-calc)', viewport: { width: 1600, height: 1200 } });
await pg.goto('https://gearscape.net/calculators/dps', { waitUntil: 'load' });
await pg.waitForTimeout(6000);

const run = (arg) => pg.evaluate(async ({
  gear, group, styleName, row, gsTarget,
}) => {
  const st = window.$nuxt.$store; const s = st.state;
  const get = (slot, n) => (n === 'none' ? { name: 'none' } : s.data.equipment[slot].find((i) => i.name === n));
  Object.entries(gear).forEach(([slot, n]) => {
    const item = get(slot, n);
    if (!item) throw new Error(`no item ${n}`);
    st.commit('setup/setSlotItem', { setupId: 0, slot, item });
  });
  const w = get('weapon', gear.weapon);
  const style = w.styles.find((x) => x.startsWith(`${styleName.toLowerCase()},`)) || w.styles.find((x) => x.startsWith('accurate,magic'));
  if (!style) throw new Error(`no style ${styleName} in ${w.styles}`);
  st.commit('setup/setSpell', { setupId: 0, spell: null });
  st.commit('setup/setStyle', { setupId: 0, style });
  const pot = {
    melee: { attack: 'super combat potion', strength: 'super combat potion', defence: 'super combat potion' },
    ranged: { ranged: 'ranging potion' },
    magic: { magic: 'saturated heart' },
  }[group];
  const pray = {
    melee: { attack: 'piety', strength: 'piety', defence: 'piety' },
    ranged: { ranged: 'rigour', defence: 'rigour' },
    magic: { magic: 'augury', defence: 'augury' },
  }[group];
  ['attack', 'strength', 'defence', 'ranged', 'magic'].forEach((skill) => {
    st.commit('player/setPotion', { setupId: 0, skill, potion: pot[skill] || 'none' });
    st.commit('player/setPrayer', { setupId: 0, skill, prayer: pray[skill] || 'none' });
  });
  const ex = JSON.parse(JSON.stringify(s.setup.extras[0]));
  ex.elementalFragments = group === 'magic';
  st.commit('setup/setExtras', { setupId: 0, extras: ex });
  const tgt = s.data.targets.find((t) => t.text === gsTarget[0]).value[gsTarget[1]];
  st.commit('calculator/setTarget', tgt);
  const find = (vm) => { if (vm.loadTarget) return vm; for (const c of vm.$children) { const f = find(c); if (f) return f; } return null; };
  await find(window.$nuxt.$root).loadTarget();
  return { style, target: tgt.name, row };
}, arg);

const num = (t, k) => { const at = t.indexOf(`${k}:`); return at < 0 ? null : parseFloat(t.slice(at + k.length + 1)); };
const out = [];
for (const o of ours) {
  const info = await run({
    gear: GEAR[o.setup], group: GROUP[o.setup], styleName: o.style, row: o.label, gsTarget: GS_TARGET[o.label],
  });
  await pg.waitForTimeout(500);
  const text = await pg.innerText('body');
  const blk = text.slice(text.indexOf('Dps:'));
  const acc = /Accuracy:\s*([\d.]+)%/.exec(blk);
  out.push({
    ...o, gs: { dps: num(blk, 'Dps'), maxHit: num(blk, 'Max Hit'), accuracy: acc ? Number(acc[1]) / 100 : null, style: info.style, target: info.target },
  });
}
await b.close();
const d = (a, g) => (g === null || a === null ? '-' : (g === 0 && a === 0 ? '0.0%' : `${(((a - g) / (g || 1)) * 100).toFixed(1)}%`));
const oi = process.argv.indexOf('--out');
if (oi >= 0) writeFileSync(process.argv[oi + 1], JSON.stringify(out, null, 1));
console.log(table(
  ['row', 'setup', 'style', 'GS target', 'max ours', 'max GS', 'acc ours', 'acc GS', 'DPS ours', 'DPS GS', 'dDPS'],
  out.map((r) => [r.label, r.setup, r.style, r.gs.target, r.maxHit, r.gs.maxHit, pct(r.accuracy), pct(r.gs.accuracy), fmt(r.dps, 3), fmt(r.gs.dps, 3), d(r.dps, r.gs.dps)]),
));
