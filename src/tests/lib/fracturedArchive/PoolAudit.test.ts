import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, test } from '@jest/globals';
import { availableEquipment } from '@/lib/Equipment';
import {
  auditPool, collectPoolMembers, effectNamesFromSources, isExcluded, POOL_EXCLUDED,
} from '@/lib/fracturedArchive/poolAudit';
import { AUDIT_EXTRA_REFS, AUDIT_SOURCE_FILES } from '@/lib/fracturedArchive/poolAuditSources';

// Phase 25: every item that dominates a pool slot or has an upstream effect is in a pool / preset / spec loadout, or in
// POOL_EXCLUDED with a reason. A new item (wiki refresh, upstream merge) fails this test until it is added to a pool
// (searchCandidates.ts, src/lib/raids/*/searchPool.ts) or excluded. Same check: node scripts/auditPool.mjs.

const ROOT = path.resolve(__dirname, '../../../..');
const effectNames = effectNamesFromSources(AUDIT_SOURCE_FILES.map((f) => readFileSync(path.join(ROOT, f), 'utf8')));

describe('pool audit', () => {
  test('nothing is missing', () => {
    const missing = auditPool(effectNames, AUDIT_EXTRA_REFS);
    expect(missing.map((f) => `[${f.slot}] ${f.name}: ${f.reasons[0]}`)).toEqual([]);
  });

  test('the effect scan finds upstream name checks (sanity)', () => {
    expect(effectNames).toEqual(expect.arrayContaining(['Twisted bow', 'Salve amulet(ei)', 'Elemental amulet', 'Crimson kisten']));
    expect(effectNames.length).toBeGreaterThan(200);
  });

  test('the rules flag known items when nothing is excluded', () => {
    const all = auditPool(effectNames, AUDIT_EXTRA_REFS, []);
    const byName = Object.fromEntries(all.map((f) => [f.name, f]));
    // stat rule: Barbarian Assault arrows beat dragon arrows in the bows
    expect(byName['Barbed arrow'].reasons.join()).toMatch(/Twisted bow ammo: beats (Seeking dragon arrow|Dragon arrow)/);
    // effect rule: the Crimson kisten (spec) and the Brimstone ring
    expect(byName['Crimson kisten'].reasons).toContain('upstream effect (name checked in the calculator code)');
    expect(byName['Brimstone ring']).toBeDefined();
    // pool members never show up
    expect(byName['Necklace of rupture']).toBeUndefined();
    expect(byName['Seeking dragon arrow']).toBeUndefined();
    expect(byName['Elemental amulet']).toBeUndefined();
  });

  test('the phase 25 additions are pool members', () => {
    const { names } = collectPoolMembers(AUDIT_EXTRA_REFS);
    for (const n of ['Necklace of rupture', 'Seeking dragon arrow', 'Elemental amulet', 'Necklace of anguish', 'Dragon arrow']) {
      expect(names.has(n)).toBe(true);
    }
  });

  test('every exclusion has a reason and matches at least one item (no stale entries)', () => {
    const names = availableEquipment.map((e) => e.name);
    for (const x of POOL_EXCLUDED) {
      expect(x.reason.length).toBeGreaterThan(10);
      expect(names.some((n) => isExcluded(n, [x]))).toBe(true);
    }
  });

  test('no pool member is excluded', () => {
    const { names } = collectPoolMembers(AUDIT_EXTRA_REFS);
    expect(Array.from(names).filter((n) => isExcluded(n))).toEqual([]);
  });
});
