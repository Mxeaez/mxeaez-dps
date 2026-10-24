import { describe, expect, test } from '@jest/globals';
import {
  calculatePlayerVsNpc,
  findEquipment,
  findSpell,
  getTestMonster,
  getTestPlayer,
} from '@/tests/utils/TestUtils';
import { ammoApplicability, AmmoApplicability, calculateEquipmentBonusesFromGear } from '@/lib/Equipment';
import { PRESETS } from '@/lib/fracturedArchive/presets';
import { SEARCH_POOL, refName } from '@/lib/fracturedArchive/searchCandidates';
import { resolvePresetEquipment } from '@/lib/fracturedArchive/bestSetup';
import { RAID_BASES } from '@/lib/raids/base';
import { Monster } from '@/types/Monster';
import { EquipmentPiece } from '@/types/Player';

// Phase 25: items added to the best-setup pools (Maggot King / The Blood Moon Rises and the Elemental amulet). Their
// effects are upstream's; these tests pin what the pool relies on, with hand derivations. Wiki item pages 2026-10-23,
// see docs/DATA_SOURCES.md ("Equipment", phase 25). All players have 99 in every skill, no prayer, no potion.

const RAPID = { name: 'Rapid', type: 'ranged', stance: 'Rapid' } as const;

const rangedPlayer = (monster: Monster, weapon: EquipmentPiece, ammo: EquipmentPiece, neck?: EquipmentPiece) => getTestPlayer(monster, {
  equipment: { weapon, ammo, ...(neck ? { neck } : {}) },
  style: RAPID,
});

/** P(total damage == d) of a single-hitsplat distribution. */
const pDamage = (dist: ReturnType<typeof calculatePlayerVsNpc>['dist'], d: number): number => dist.dists[0].hits
  .filter((h) => h.getSum() === d)
  .reduce((acc, h) => acc + h.probability, 0);

describe('item data (wiki infoboxes)', () => {
  test.each([
    // name, slot, [ranged attack, ranged str, prayer]
    ['Necklace of rupture', 'neck', [20, 8, 3]],
    ['Necklace of anguish', 'neck', [15, 5, 2]],
    ['Seeking dragon arrow', 'ammo', [20, 60, 0]],
    ['Elemental amulet', 'neck', [0, 0, 0]],
  ] as [string, string, number[]][])('%s', (name, slot, [ranged, rstr, prayer]) => {
    const e = findEquipment(name);
    expect(e.slot).toBe(slot);
    expect([e.offensive.ranged, e.bonuses.ranged_str, e.bonuses.prayer]).toEqual([ranged, rstr, prayer]);
  });

  test('Elemental amulet: +10 magic attack, no magic damage', () => {
    const e = findEquipment('Elemental amulet');
    expect([e.offensive.magic, e.bonuses.magic_str]).toEqual([10, 0]);
  });
});

describe('Seeking dragon arrow', () => {
  const monster = getTestMonster('General Graardor');
  const bow = findEquipment('Scorching bow'); // ranged +124, ranged str +40; no effect on a non-demon
  const seeking = findEquipment('Seeking dragon arrow');
  const dragon = findEquipment('Dragon arrow', 'Unpoisoned');

  test('fits the bows in the pool (Twisted, Venator, Scorching), not crossbows', () => {
    for (const name of ['Twisted bow', 'Scorching bow']) {
      expect(ammoApplicability(findEquipment(name).id, seeking.id)).toBe(AmmoApplicability.INCLUDED);
    }
    expect(ammoApplicability(findEquipment('Venator bow', 'Charged').id, seeking.id)).toBe(AmmoApplicability.INCLUDED);
    expect(ammoApplicability(findEquipment('Zaryte crossbow').id, seeking.id)).toBe(AmmoApplicability.INVALID);
  });

  test('+20 ranged attack over dragon arrows, same max hit', () => {
    const withSeeking = rangedPlayer(monster, bow, seeking);
    const withDragon = rangedPlayer(monster, bow, dragon);
    expect(withSeeking.offensive.ranged - withDragon.offensive.ranged).toBe(20);
    expect(withSeeking.bonuses.ranged_str).toBe(withDragon.bonuses.ranged_str);

    // Hand: effective ranged = 99 + 0 (Rapid) + 8 = 107; attack roll = 107 × (bonus + 64).
    // Seeking: 107 × (124 + 20 + 64) = 22256; dragon: 107 × (124 + 64) = 20116.
    const s = calculatePlayerVsNpc(monster, withSeeking);
    const d = calculatePlayerVsNpc(monster, withDragon);
    expect(s.maxAttackRoll).toBe(22256);
    expect(d.maxAttackRoll).toBe(20116);
    expect(s.maxHit).toBe(d.maxHit);
    expect(s.dps).toBeGreaterThan(d.dps);
  });

  test('minimum hit 3 on an accurate hit (0, 1, 2, 3 → 3), misses stay 0', () => {
    const s = calculatePlayerVsNpc(monster, rangedPlayer(monster, bow, seeking));
    const { accuracy, maxHit } = s;
    const n = maxHit + 1; // accurate damage roll 0..max, uniform
    expect(pDamage(s.dist, 1)).toBe(0);
    expect(pDamage(s.dist, 2)).toBe(0);
    expect(pDamage(s.dist, 3)).toBeCloseTo((accuracy * 4) / n, 12);
    expect(pDamage(s.dist, 0)).toBeCloseTo(1 - accuracy, 12);

    // dragon arrows: accurate 0 is raised to 1 (upstream), so P(1) = 2 / n of the hits, P(3) = 1 / n
    const d = calculatePlayerVsNpc(monster, rangedPlayer(monster, bow, dragon));
    expect(pDamage(d.dist, 1)).toBeCloseTo((d.accuracy * 2) / (d.maxHit + 1), 12);
    expect(pDamage(d.dist, 3)).toBeCloseTo(d.accuracy / (d.maxHit + 1), 12);
  });
});

describe('Necklace of rupture', () => {
  const monster = getTestMonster('General Graardor');
  const bow = findEquipment('Scorching bow');
  const seeking = findEquipment('Seeking dragon arrow');

  test('+5 ranged attack and +3 ranged strength over the Necklace of anguish; no other effect', () => {
    const rupture = rangedPlayer(monster, bow, seeking, findEquipment('Necklace of rupture'));
    const anguish = rangedPlayer(monster, bow, seeking, findEquipment('Necklace of anguish'));
    expect(rupture.offensive.ranged - anguish.offensive.ranged).toBe(5);
    expect(rupture.bonuses.ranged_str - anguish.bonuses.ranged_str).toBe(3);
    // Hand: ranged str 40 + 60 + 8 = 108 (rupture) / 105 (anguish); max hit = floor(0.5 + 107 × (str + 64) / 640)
    //   rupture: floor(0.5 + 107 × 172 / 640) = floor(29.256) = 29; anguish: floor(0.5 + 107 × 169 / 640) = 28
    expect(calculatePlayerVsNpc(monster, rupture).maxHit).toBe(29);
    expect(calculatePlayerVsNpc(monster, anguish).maxHit).toBe(28);
  });
});

describe('Elemental amulet', () => {
  const monster = getTestMonster('General Graardor');
  const kodai = findEquipment('Kodai wand'); // magic damage +15%
  const magicPlayer = (neck: EquipmentPiece, spell = 'Fire Surge') => getTestPlayer(monster, {
    equipment: { weapon: kodai, neck },
    style: { name: 'Spell', type: 'magic', stance: 'Autocast' },
    spell: findSpell(spell),
  });

  test('Fire Surge max hit: +2 base before magic damage, beats the Occult necklace with the Kodai', () => {
    // Hand: Fire Surge base 24. Elemental amulet: (24 + 2) × 1.15 = 29.9 → 29. Occult (+5%): 24 × 1.20 = 28.8 → 28.
    expect(calculatePlayerVsNpc(monster, magicPlayer(findEquipment('Elemental amulet'))).maxHit).toBe(29);
    expect(calculatePlayerVsNpc(monster, magicPlayer(findEquipment('Occult necklace'))).maxHit).toBe(28);
  });

  test('no bonus on a non-elemental spell (Ice Barrage)', () => {
    // Ice Barrage base 30: Elemental amulet 30 × 1.15 = 34.5 → 34; Occult 30 × 1.20 = 36
    expect(calculatePlayerVsNpc(monster, magicPlayer(findEquipment('Elemental amulet'), 'Ice Barrage')).maxHit).toBe(34);
    expect(calculatePlayerVsNpc(monster, magicPlayer(findEquipment('Occult necklace'), 'Ice Barrage')).maxHit).toBe(36);
  });
});

describe('pools and presets (phase 25)', () => {
  test('every raid pool has rupture + anguish (ranged neck), Occult + Elemental amulet (magic neck)', () => {
    for (const base of RAID_BASES) {
      const neck = (g: 'ranged' | 'magic') => (base.searchPool[g].slots.neck || []).map((c) => refName(c.ref));
      expect(neck('ranged')).toEqual(expect.arrayContaining(['Necklace of rupture', 'Necklace of anguish']));
      expect(neck('magic')).toEqual(expect.arrayContaining(['Occult necklace', 'Elemental amulet']));
    }
    const elemental = SEARCH_POOL.magic.slots.neck!.find((c) => refName(c.ref) === 'Elemental amulet')!;
    expect(elemental.keep).toEqual(expect.arrayContaining(['Kodai wand', 'Harmonised Nightmare staff']));
  });

  test('CoX: the Elemental amulet is also kept for the Dragon hunter wand', () => {
    const cox = RAID_BASES.find((r) => r.id === 'cox')!;
    const elemental = cox.searchPool.magic.slots.neck!.find((c) => refName(c.ref) === 'Elemental amulet')!;
    expect(elemental.keep).toEqual(expect.arrayContaining(['Kodai wand', 'Dragon hunter wand']));
  });

  test('the bows fire Seeking dragon arrows or dragon arrows', () => {
    for (const name of ['Twisted bow', 'Venator bow', 'Scorching bow']) {
      const cand = SEARCH_POOL.ranged.weapons.find((w) => refName(w.weapon) === name)!;
      expect((cand.ammo || []).map(refName)).toEqual(['Seeking dragon arrow', 'Dragon arrow']);
    }
  });

  test('Twisted bow (Masori) preset: Seeking dragon arrows + Necklace of rupture, ammo bonuses counted', () => {
    const preset = PRESETS.find((p) => p.name === 'Twisted bow (Masori)')!;
    const eq = resolvePresetEquipment(preset);
    expect(eq.ammo?.id).toBe(33595);
    expect(eq.neck?.id).toBe(33639);
    expect(ammoApplicability(eq.weapon?.id, eq.ammo?.id)).toBe(AmmoApplicability.INCLUDED);
    const monster = getTestMonster('Xarth');
    const player = getTestPlayer(monster, { equipment: eq });
    const { offensive } = calculateEquipmentBonusesFromGear(player, monster);
    // the ammo's +20 counts (INCLUDED) and the charged quiver adds +10 for fired ammo (upstream), on top of the pieces
    const pieces = Object.values(eq).reduce((acc, p) => acc + (p?.offensive.ranged ?? 0), 0);
    expect(offensive.ranged).toBe(pieces + 10);
  });

  test('every ranged preset that wore anguish now wears rupture', () => {
    for (const base of RAID_BASES) {
      for (const p of base.presets) {
        expect(p.equipment.neck).not.toBe('Necklace of anguish');
      }
    }
  });
});
