import { describe, expect, test } from '@jest/globals';
import { faRows } from '@/tests/utils/otherRaids';
import { generateEmptyPlayer } from '@/state';
import {
  applyPresetToPlayer, buildTargetMonster, drainStateFor, evaluateLoadout, findTarget, presetSpells, presetStyles,
  resolvePresetEquipment, targetPhases,
} from '@/lib/fracturedArchive/bestSetup';
import { DrainLineItem, neededText } from '@/lib/fracturedArchive/drainLine';
import {
  equipmentById,
  equipmentItemIds,
  inventoryGrid,
  isQuiverAmmo,
  isUnusedAmmo,
  kitSlotUsage,
  lightenKit,
  plan,
  PlanEquipment,
  PlanInputs,
  PlanItem,
  planItemByName,
  PlanResult,
  PlanTuning,
  quiverSpecOf,
  SupplyCounts,
  toPlanItem,
  withoutUnusedAmmo,
  wornItemCounts,
  wornKeptAmmo,
} from '@/lib/fracturedArchive/planner';
import { resolveItem } from '@/lib/fracturedArchive/loadout';
import {
  BestSetupAssumptions, DEFAULT_ASSUMPTIONS, ItemRef, MASORI_F, PresetDef, StyleGroup,
} from '@/lib/fracturedArchive/presets';
import { refName } from '@/lib/fracturedArchive/searchCandidates';
import { drainModel } from '@/lib/fracturedArchive/specs';
import { landedNeed, landedToReach, specsNeeded } from '@/lib/fracturedArchive/teamSpecs';
import {
  FRACTURED_ARCHIVE_RAID, RaidConfig, RAIDS, withScalingInput,
} from '@/lib/raids';

// Phase 32 (final review, round 4):
// (1) a switch item that changes none of its loadout's DPS costs no slot and is not shown: Rada's blessing 4 left the
//     melee / magic presets and the search pool, `isUnusedAmmo` drops such an item from a candidate, and a loadout
//     without ammo of its own keeps the kit's ammo in its ammo slot (`wornItemCounts`: the bolts stay equipped while
//     meleeing), so it holds one item fewer in the inventory;
// (2) the drain line states its units: "needs 4 landed hits · 4 specs (2 carriers), 8 swings · 98%".
// Docs: docs/BEST_SETUP.md (*Phase 32*), docs/UNVERIFIED.md D23-D25.

const BLESSING = "Rada's blessing 4";
const NO_SUPPLIES: SupplyCounts = {
  brew: 0, restore: 0, ranging: 0, superCombat: 0, food: 0, other: 0,
};
const FA = FRACTURED_ARCHIVE_RAID;

// --- 1a. the data -----------------------------------------------------------------------------------------------------

describe('no ammo-slot filler in the presets and the search pool', () => {
  test.each(faRows(RAIDS).map((r) => [r.id, r] as const))('%s: no preset and no search-pool group has Rada\'s blessing', (_id, raid) => {
    raid.presets.forEach((p) => expect(p.equipment.ammo ? refName(p.equipment.ammo) : '').not.toBe(BLESSING));
    Object.values(raid.searchPool).forEach((g) => {
      expect((g.slots.ammo ?? []).map((c) => refName(c.ref))).not.toContain(BLESSING);
    });
  });

  test('melee / magic presets wear no ammo; ranged presets keep their fired ammo', () => {
    faRows(RAIDS).flatMap((r) => r.presets).forEach((p) => {
      if (p.group !== 'ranged') expect(p.equipment.ammo).toBeUndefined();
    });
    expect(FA.presets.find((p) => p.name === 'Twisted bow (Masori)')!.equipment.ammo).toBeDefined();
  });
});

// --- 1b. the DPS: an ammo-slot item on a weapon that fires no ammo changes nothing ------------------------------------

/** Every ammo-slot item the presets / search pools fire, plus the blessing. */
const POOL_AMMO: ItemRef[] = (() => {
  const refs: ItemRef[] = [BLESSING];
  faRows(RAIDS).forEach((r) => {
    r.presets.forEach((p) => p.equipment.ammo && refs.push(p.equipment.ammo));
    Object.values(r.searchPool).forEach((g) => g.weapons.forEach((w) => (w.ammo ?? []).forEach((a) => refs.push(a))));
  });
  const seen = new Set<string>();
  return refs.filter((r) => {
    const k = JSON.stringify(r);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
})();

const withAmmo = (p: PresetDef, ammo: ItemRef | undefined): PresetDef => {
  const equipment = { ...p.equipment };
  if (ammo) equipment.ammo = ammo;
  else delete equipment.ammo;
  return { ...p, equipment };
};

describe('a melee / magic loadout\'s DPS is the same with no ammo, the blessing or any pool ammo (every phase, every raid)', () => {
  test('the pool ammo has no melee / magic stat (the kit\'s ammo can sit in a melee / magic loadout\'s ammo slot)', () => {
    expect(POOL_AMMO.length).toBeGreaterThan(8);
    POOL_AMMO.forEach((ref) => {
      const a = resolveItem(ref);
      expect([a.offensive.stab, a.offensive.slash, a.offensive.crush, a.offensive.magic, a.bonuses.str, a.bonuses.magic_str]).toEqual([0, 0, 0, 0, 0, 0]);
    });
  });

  test.each(faRows(RAIDS).map((r) => [r.id, r] as const))('%s', (_id, raid: RaidConfig) => {
    const a = raid.defaultAssumptions;
    const presets = raid.presets.filter((p) => p.group !== 'ranged');
    let checked = 0;
    raid.targets.forEach((target) => {
      const phases = targetPhases(target);
      (phases.length ? phases : [undefined]).forEach((phase) => {
        const { monster } = buildTargetMonster(target, phase, 'none', a);
        presets.forEach((p) => {
          const style = presetStyles(p)[0];
          const spell = presetSpells(p)[0];
          const dpsWith = (ammo: ItemRef | undefined) => evaluateLoadout(applyPresetToPlayer(generateEmptyPlayer(), withAmmo(p, ammo), style, spell, monster, a), monster, false).dps;
          const none = dpsWith(undefined);
          POOL_AMMO.forEach((ammo) => expect(dpsWith(ammo)).toBe(none));
          checked += 1;
        });
      });
    });
    expect(checked).toBeGreaterThan(10);
  }, 300000);
});

// --- 1c. isUnusedAmmo -------------------------------------------------------------------------------------------------

const item = (ref: ItemRef, slot?: PlanItem['slot']): PlanItem => toPlanItem(resolveItem(ref), slot);
const eqOf = (refs: Partial<Record<PlanItem['slot'], ItemRef>>): PlanEquipment => Object.fromEntries(Object.entries(refs)
  .map(([slot, ref]) => [slot, item(ref!, slot as PlanItem['slot'])]));

describe('isUnusedAmmo: an ammo-slot item that changes none of the loadout\'s DPS', () => {
  test('the blessing (or bolts) on a melee / magic weapon, or on a ranged weapon that fires no ammo, is unused', () => {
    expect(isUnusedAmmo(eqOf({ weapon: 'Scythe of Vitur', ammo: BLESSING }))).toBe(true);
    expect(isUnusedAmmo(eqOf({ weapon: "Tumeken's shadow", ammo: BLESSING }))).toBe(true);
    expect(isUnusedAmmo(eqOf({ weapon: 'Scythe of Vitur', ammo: 'Ruby dragon bolts (e)' }))).toBe(true);
    expect(isUnusedAmmo(eqOf({ weapon: 'Bow of Faerdhinen (c)', ammo: BLESSING }))).toBe(true);
  });

  test('fired ammo, an ammo item with an effect (Crystal blessing), no weapon or no ammo: not unused', () => {
    expect(isUnusedAmmo(eqOf({ weapon: 'Zaryte crossbow', ammo: 'Ruby dragon bolts (e)' }))).toBe(false);
    expect(isUnusedAmmo(eqOf({ weapon: 'Twisted bow', ammo: 'Seeking dragon arrow' }))).toBe(false);
    expect(isUnusedAmmo(eqOf({ weapon: ['Venator bow', 'Charged'], ammo: 'Dragon arrow' }))).toBe(false);
    expect(isUnusedAmmo(eqOf({ weapon: 'Eclipse atlatl', ammo: 'Atlatl dart' }))).toBe(false);
    expect(isUnusedAmmo(eqOf({ weapon: 'Bow of Faerdhinen (c)', ammo: 'Crystal blessing' }))).toBe(false);
    expect(isUnusedAmmo(eqOf({ ammo: BLESSING }))).toBe(false);
    expect(isUnusedAmmo(eqOf({ weapon: 'Scythe of Vitur' }))).toBe(false);
  });

  test('withoutUnusedAmmo drops it; equipmentItemIds never counts it', () => {
    const eq = eqOf({ weapon: 'Scythe of Vitur', body: 'Torva platebody', ammo: BLESSING });
    expect(withoutUnusedAmmo(eq).ammo).toBeUndefined();
    expect(withoutUnusedAmmo(eq).body?.name).toBe('Torva platebody');
    expect(equipmentItemIds(eq).map((id) => equipmentById(id)!.name).sort()).toEqual(['Scythe of Vitur', 'Torva platebody']);
    const zcb = eqOf({ weapon: 'Zaryte crossbow', ammo: 'Ruby dragon bolts (e)' });
    expect(withoutUnusedAmmo(zcb)).toBe(zcb);
    expect(equipmentItemIds(zcb)).toHaveLength(2);
  });

  test('the Twisted buckler of a Zaryte crossbow switch is a DPS item (not dropped): +18 ranged attack, +10 ranged str', () => {
    const { monster } = buildTargetMonster(findTarget('ag-flying'), undefined, 'none', DEFAULT_ASSUMPTIONS);
    const zcb = (shield: boolean): PresetDef => ({
      name: 'zcb',
      group: 'ranged',
      equipment: {
        ...MASORI_F, weapon: 'Zaryte crossbow', ammo: 'Ruby dragon bolts (e)', ...(shield ? { shield: 'Twisted buckler' } : {}),
      },
    });
    const dps = (p: PresetDef) => evaluateLoadout(applyPresetToPlayer(generateEmptyPlayer(), p, presetStyles(p)[0], null, monster, DEFAULT_ASSUMPTIONS), monster, false).dps;
    expect(dps(zcb(true))).toBeGreaterThan(dps(zcb(false)) * 1.03);
  });
});

// --- 1d. the slot count: a loadout without ammo keeps the kit's ammo in its ammo slot -------------------------------

// toy ids: Q = a quiver, A1 / A2 = arrow / bolt types (wear ammo), 1..30 = other items
const Q = 100;
const A1 = 201;
const A2 = 202;
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

describe('wornItemCounts / kitSlotUsage (toy kits, counted by hand)', () => {
  test('wornItemCounts: + 1 for a loadout without ammo when another loadout has some; unchanged without `wears`', () => {
    expect(wornItemCounts([10, 9], [true, false])).toEqual([10, 10]);
    expect(wornItemCounts([9, 9], [false, false])).toEqual([9, 9]);
    expect(wornItemCounts([10, 9])).toEqual([10, 9]);
  });

  test('(a) ranged (9 items + bolts) + melee (9 items, no ammo): 19 items carried, 9 in the inventory whichever is worn', () => {
    const R = [...range(1, 9), A1];
    const M = range(11, 19);
    const wears = [true, false];
    // phase 31 count (no `wears`): the melee set is the smallest (9), so 19 − 9 = 10
    expect(kitSlotUsage([R, M], 0, [], NO_SUPPLIES, 0).used).toBe(10);
    // wearing R: the inventory holds M (9); wearing M: R minus the bolts, which stay in the ammo slot (9)
    const r = kitSlotUsage([R, M], 0, [], NO_SUPPLIES, 0, 28, [], undefined, wears);
    expect(r).toMatchObject({
      used: 9, inventoryItems: 9, swapReserve: 0, keptAmmo: 0, minLoadoutItems: 10,
    });
    const m = kitSlotUsage([R, M], 1, [], NO_SUPPLIES, 0, 28, [], undefined, wears);
    expect(m).toMatchObject({
      used: 9, inventoryItems: 9, swapReserve: 0, keptAmmo: 1,
    });
  });

  test('(b) two ranged loadouts (shared armour + quiver, arrows / bolts) + melee: one ammo in the slot, one in the quiver', () => {
    const shared = [...range(1, 8), Q];
    const R1 = [...shared, 20, A1];
    const R2 = [...shared, 21, A2];
    const M = range(11, 19);
    const toy = { quivers: [Q], ammo: [A1, A2] };
    // carried 22; wearing M: 22 − 9 − 1 (ammo slot) − 1 (quiver) = 11; wearing R1: 22 − 11 − 1 (quiver) = 10 (+ 1 to swap to M)
    [0, 1, 2].forEach((w) => expect(kitSlotUsage([R1, R2, M], w, [], NO_SUPPLIES, 0, 28, [], toy, [true, true, false]).used).toBe(11));
    expect(kitSlotUsage([R1, R2, M], 2, [], NO_SUPPLIES, 0, 28, [], toy, [true, true, false]).keptAmmo).toBe(1);
  });

  test('(c) no loadout has ammo: nothing kept (the phase 31 count)', () => {
    const M = range(1, 9);
    const G = range(5, 14);
    expect(kitSlotUsage([M, G], 1, [], NO_SUPPLIES, 0, 28, [], undefined, [false, false]).used)
      .toBe(kitSlotUsage([M, G], 1, [], NO_SUPPLIES, 0).used);
  });
});

/**
 * Independent count (no planner code): for every loadout L the kit can wear, the inventory holds U \ L; when L has no
 * ammo-slot item, one of the kit's ammo items sits in L's ammo slot (one the quiver can't hold first); the quiver (if
 * carried) takes one arrow / bolt type out when the kit carries ≥ 2 such types (phase 31). The kit needs the worst.
 */
const exhaustive = (loadouts: number[][], carried: number[]): number => {
  const U = new Set([...carried, ...loadouts.flat()]);
  const nameOf = (id: number) => equipmentById(id)?.name ?? '';
  const isAmmoSlot = (id: number) => equipmentById(id)?.slot === 'ammo';
  const quiver = Array.from(U).some((id) => ["Dizana's quiver", "Blessed Dizana's quiver", "Dizana's max cape"].includes(nameOf(id)));
  const qAmmo = (id: number) => isAmmoSlot(id) && /arrow|bolts/i.test(nameOf(id)) && nameOf(id) !== 'Bolt rack';
  const types = Array.from(U).filter(qAmmo).length;
  const kitAmmo = loadouts.flat().filter(isAmmoSlot);
  let worst = 0;
  loadouts.forEach((L) => {
    const worn = new Set(L);
    let inv = Array.from(U).filter((id) => !worn.has(id));
    if (!L.some(isAmmoSlot)) {
      const kept = inv.find((id) => kitAmmo.includes(id) && !qAmmo(id)) ?? inv.find((id) => kitAmmo.includes(id));
      if (kept !== undefined) inv = inv.filter((id) => id !== kept);
    }
    const held = quiver && types >= 2 && inv.some(qAmmo) ? 1 : 0;
    worst = Math.max(worst, inv.length - held);
  });
  return worst;
};

const SATURATED = planItemByName('Saturated heart').id;

describe('brute force: every subset of the FA presets (phase 32 presets: no blessing)', () => {
  test('kitSlotUsage (every worn index) and the optimiser equal the exhaustive count', () => {
    const pool = FA.presets.map((p) => equipmentItemIds(withoutUnusedAmmo(Object.fromEntries(Object.entries(resolvePresetEquipment(p))
      .filter(([, x]) => !!x).map(([slot, x]) => [slot, toPlanItem(x!, slot as PlanItem['slot'])])))));
    const wearsOf = (l: number[]) => l.some((id) => equipmentById(id)?.slot === 'ammo');
    const q = quiverSpecOf(pool.flat());
    let kept = 0;
    for (let mask = 1; mask < (1 << pool.length); mask++) {
      const k = pool.filter((_, i) => (mask >> i) & 1);
      const wears = k.map(wearsOf);
      const ex = exhaustive(k, [SATURATED]);
      for (let w = 0; w < k.length; w++) {
        const u = kitSlotUsage(k, w, [SATURATED], NO_SUPPLIES, 0, 28, [], q, wears);
        expect(u.used).toBe(ex);
        if (u.keptAmmo) kept += 1;
      }
      expect(lightenKit({
        items: k, carried: [SATURATED], fixedSlots: 0, totalSlots: 28, time: () => 0, seeds: [0], quiver: q, wearsAmmo: wears, noPrune: true,
      }, k.map((_, i) => i)).used).toBe(ex);
    }
    // the rule fires (melee / magic worn sets beside ranged switches)
    expect(kept).toBeGreaterThan(100);
  });
});

describe('inventory grid: the worn set\'s kept ammo takes no cell', () => {
  test('worn melee + a ranged switch with bolts: the bolts are worn (wornKeptAmmo), not in the grid', () => {
    const melee = { group: 'melee' as StyleGroup, equipment: eqOf({ weapon: 'Scythe of Vitur', body: 'Torva platebody' }) };
    const ranged = { group: 'ranged' as StyleGroup, equipment: eqOf({ weapon: 'Zaryte crossbow', body: 'Masori body (f)', ammo: 'Ruby dragon bolts (e)' }) };
    const kit = [melee, ranged];
    expect(wornKeptAmmo(kit, 0)?.name).toBe('Ruby dragon bolts (e)');
    expect(wornKeptAmmo(kit, 1)).toBeNull();
    const cells = inventoryGrid(kit, 0, [], [], NO_SUPPLIES, 0);
    expect(cells.filter((c) => c.kind === 'switch').map((c) => c.label)).toEqual(['Zaryte crossbow', 'Masori body (f)']);
    expect(cells.filter((c) => c.kind === 'swap')).toHaveLength(0);
    const ids = kit.map((l) => equipmentItemIds(l.equipment));
    expect(cells.filter((c) => c.kind !== 'free').length).toBe(kitSlotUsage(ids, 0, [], NO_SUPPLIES, 0, 28, [], undefined, [false, true]).used);
    // a pinned blessing is one pinned item (it is never part of a switch)
    const pinned = [item(BLESSING)];
    const withPin = inventoryGrid([{ ...melee, equipment: { ...melee.equipment, ammo: pinned[0] } }, ranged], 0, [], pinned, NO_SUPPLIES, 0);
    expect(withPin.filter((c) => c.label === BLESSING).map((c) => c.kind)).toEqual(['pinned']);
  });
});

// --- 1e. plans --------------------------------------------------------------------------------------------------------

const noSpecs = (a: BestSetupAssumptions): BestSetupAssumptions => ({
  ...a,
  mySpecs: {
    ...a.mySpecs, elderMaul: false, dwh: false, bgs: false, tonalztics: false, ayak: 0,
  },
});
const total = (r: PlanResult) => r.comparison!.routes[r.planned].seconds;
const kitNames = (r: PlanResult) => r.kit.flatMap((c) => Object.values(c.equipment).map((x) => x!.name));
const carriedOf = (r: PlanResult) => [...r.specItems.map((x) => x.id), ...(r.potions.some((p) => p.type === 'heart') ? [SATURATED] : [])];
const kitIds = (r: PlanResult) => r.kit.map((c) => equipmentItemIds(c.equipment));

describe('plan (reduced FA pool): no blessing anywhere, the count = the exhaustive count', () => {
  const tuning: PlanTuning = {
    model: FA.time,
    presets: FA.presets.filter((p) => ['Torva + Scythe (slash)', 'Twisted bow (Masori)', "Tumeken's shadow (Ancestral)"].includes(p.name)),
    search: { weapons: ['Scythe of Vitur', 'Twisted bow'], maxPasses: 1 },
    perGroupWeapons: 1,
    perWeapon: 1,
    bases: 1,
    partners: 1,
    seeds: 2,
  };
  const r = plan({
    basePlayer: generateEmptyPlayer(),
    assumptions: noSpecs(FA.defaultAssumptions),
    drain: 'team',
    settings: FA.defaultTimeSettings,
    route: 'all',
    pinned: [],
    nonItemSlots: FA.planDefaults.nonItemSlots,
    supplies: FA.defaultSupplies,
  }, tuning);

  test('no switch carries the blessing; melee / magic loadouts wear no ammo of their own', () => {
    expect(kitNames(r)).not.toContain(BLESSING);
    expect(r.inventory.map((c) => c.label)).not.toContain(BLESSING);
    r.kit.filter((c) => c.group !== 'ranged').forEach((c) => expect(c.equipment.ammo).toBeUndefined());
  });

  test('slots = supplies + non-items + the exhaustive count; the kept ammo matches the worn set', () => {
    expect(r.slots!.used).toBe(r.slots!.supplies + r.slots!.nonItem + exhaustive(kitIds(r), carriedOf(r)));
    expect(r.slots!.keptAmmo).toBe(r.keptAmmo ? 1 : 0);
    if (r.keptAmmo) {
      expect(r.kit[0].equipment.ammo).toBeUndefined();
      expect(r.inventory.some((c) => c.item?.id === r.keptAmmo!.id)).toBe(false);
      expect(r.quiverAmmo?.id).not.toBe(r.keptAmmo.id);
    }
    expect(r.inventory.filter((c) => c.kind === 'free')).toHaveLength(r.slots!.free);
  });
});

// --- 2. the drain line: units on every number -------------------------------------------------------------------------

const A = DEFAULT_ASSUMPTIONS;
const undrained = (key: string) => buildTargetMonster(findTarget(key), undefined, 'none', A).monster;
const teamItem = (key: string, w: DrainLineItem['weapon']) => drainStateFor(undrained(key), 'team', A).line!.items.find((i) => i.weapon === w)!;

// phase 34: "S swings" → "= S attacks, L must land" (Tonalztics; Elder maul / DWH / BGS: specs only)
describe('drain line wording: "needs N landed hits · N specs (C carriers) = S attacks, N must land · P%"', () => {
  test('AG Flying (Team, default carriers): needs 4 landed hits · 4 specs (2 carriers) = 8 attacks, 4 must land · 98%', () => {
    const tona = teamItem('ag-flying', 'tonalztics');
    expect(neededText(tona)).toBe('needs 4 landed hits · 4 specs (2 carriers) = 8 attacks, 4 must land · 98%');
    // the tooltip explains the units and the %
    expect(tona.title).toMatch(/^needs 4 landed hits · 4 specs \(2 carriers\) = 8 attacks, 4 must land · 98% \(4 landed hits of Tonalztics alone take Def 260 → 156; a charged Tonalztics spec attacks twice and each attack can miss; the % is the chance the Defence reaches the floor in the first round with these specs and the other weapons' specs/);
    // what one landed hit drains: trunc(Magic / 8) = 31: 260 → 229 → 198 → 167 (3 hits, above the floor 156) → 156
    const model = drainModel(undrained('ag-flying'), A);
    expect([model.def, model.floor, Math.trunc(model.magicLevel / 8)]).toEqual([260, 156, 31]);
    expect(model.def - 3 * 31).toBeGreaterThan(model.floor);
    expect(landedToReach(model, 'tonalztics', model.floor)).toBe(4);
  });

  test('the team part: shown when the team brings more ("team: 4 specs (2 carriers) · >99.9%"), else left out', () => {
    expect(neededText(teamItem('xarth', 'elderMaul'))).toBe('not needed · team: 4 specs (2 carriers) · >99.9%');
    expect(neededText(teamItem('xarth', 'tonalztics'))).toBe('needs 2 landed hits · 2 specs (1 carrier) = 4 attacks, 2 must land · 97% · team: 4 specs (2 carriers) · >99.9%');
    expect(neededText(teamItem('bork', 'elderMaul'))).toBe('needs 2 landed specs · 3 specs (2 carriers) · 98% · team: 4 specs (2 carriers) · 99.6%');
    // Bork: Tonalztics alone would need 11 landed hits (> 6 attacks): counted after the maul's drains (Def 195)
    expect(neededText(teamItem('bork', 'tonalztics'))).toBe('needs 2 landed hits once 1 Elder maul spec lands (Def 195) · 3 specs (2 carriers) = 6 attacks, 2 must land · 97% · team: 4 specs (2 carriers) · 99.6%');
    // Eye of Ayak: magic defence drained
    expect(neededText(teamItem('ag-flying', 'ayak'))).toBe('needs ≈ 39 magic defence drained · 2 specs (1 carrier) · → magic def 91');
  });

  test('landedToReach / landedNeed (hand-checked: Bork Def 300, floor 180, Elder maul −35%)', () => {
    const bork = drainModel(undrained('bork'), A);
    expect([bork.def, bork.floor]).toEqual([300, 180]);
    // 300 → 195 → 127 (the floor stops it at 180): 2 landed specs; 1 spec leaves 195
    expect(landedToReach(bork, 'elderMaul', 180)).toBe(2);
    expect(landedToReach(bork, 'bgs', 180)).toBe(120);
    expect(landedToReach(bork, 'elderMaul', 300)).toBe(0);
    expect(landedNeed(bork, { elderMaul: 3, tonalztics: 3 }, 'tonalztics', 180)).toEqual({
      landed: 2, from: 195, to: 180, afterOthers: '1 Elder maul spec lands',
    });
    expect(specsNeeded(bork, [...Array(4).fill('elderMaul'), ...Array(4).fill('tonalztics')]).elderMaul).toMatchObject({
      n: 3, landed: 2, from: 300, to: 180,
    });
  });

  test('Solo lines: no carriers — "needs 3 landed hits · 2 specs = 4 attacks, 3 must land · → Def 167" (AG Flying, Tonalztics only)', () => {
    const d = drainStateFor(undrained('ag-flying'), 'solo', {
      ...A,
      mySpecs: {
        ...A.mySpecs, elderMaul: false, tonalztics: true, ayak: 0,
      },
    });
    const tona = d.line!.items.find((i) => i.weapon === 'tonalztics')!;
    expect(neededText(tona)).toBe('needs 3 landed hits · 2 specs = 4 attacks, 3 must land · → Def 167');
    // review: no % on the line ("→ Def 167"), so the tooltip doesn't explain one
    expect(tona.title).not.toMatch(/the %/);
    const xarth = drainStateFor(undrained('xarth'), 'solo', { ...A, mySpecs: { ...A.mySpecs, elderMaul: false, tonalztics: true } });
    const xt = xarth.line!.items.find((i) => i.weapon === 'tonalztics')!;
    expect(neededText(xt)).toBe('needs 2 landed hits · 2 specs = 4 attacks, 2 must land · 97%');
    expect(xt.title).toMatch(/the % is the chance the Defence reaches the floor with your specs/);
    // Team: the % counts every weapon's specs (Bork maul 98% includes the Tonalztics)
    expect(teamItem('bork', 'elderMaul').title).toMatch(/the % is the chance the Defence reaches the floor in the first round with these specs and the other weapons' specs/);
    expect(teamItem('ag-flying', 'ayak').title).not.toMatch(/the %/);
  });

  test('text variants: unreachable, needs the other drains too', () => {
    const base = teamItem('ag-flying', 'tonalztics');
    expect(neededText({ ...base, needed: null })).toBe('floor not reachable · team: 4 specs (2 carriers) · 98%');
    expect(neededText({ ...base, landed: null })).toBe('needs the other drains too · 4 specs (2 carriers) = 8 attacks · 98%');
    expect(neededText({ ...base, count: 6 })).toBe('needs 4 landed hits · 4 specs (2 carriers) = 8 attacks, 4 must land · 98% · team: 6 specs (3 carriers) · 98%');
  });
});

// --- slow: the user's plan (2026-10-24) -------------------------------------------------------------------------------

/** FA, party 4, Camp Lightbearer, 6 brew / 4 restore / 0 food / 2 other, 1 rune pouch, the user's "don't own" list. */
const USER_PLAN_NOT_OWNED = ['Obligator', "Zorya's tome", 'Rondache', "Inquisitor's great helm", "Inquisitor's hauberk", "Inquisitor's plateskirt", "Inquisitor's mace"];
/** Phase 31: 25:47.4 (blessing in the melee switch, 0 free); phase 32: see PROGRESS. */
// phase 36 (one spec budget per encounter, damage specs, the surge potion; formatDuration's rounding fix: it read
// "24:60.0"): 25:46.3 → 25:00.0. Phase 36 review: 25:00.0 → 25:15.5 — the plan had 4 carriers + your bar for a party of
// 4; with your damage specs you are not a carrier now (BGS + 2 Tonalztics; the Elder maul carrier made way)
// phase 38f: 25:58.7 now (the pin followed the model through 38a-38e)
// phase 38g (one fixed drain set per event, carriers by headcount): 25:58.7 → 27:16.5
const USER_PLAN: [string, number] = ['27:16.5', 1636.54];

(process.env.RUN_SLOW_TESTS ? describe : describe.skip)('the user\'s plan (slow)', () => {
  test('no blessing; the freed slot buys Onyx bolts for the void switch (−1.1 s); slots = the exhaustive count', () => {
    const inputs: PlanInputs = {
      basePlayer: generateEmptyPlayer(),
      assumptions: withScalingInput(FA.defaultAssumptions, FA.scalingInputs[0], 4),
      drain: 'team',
      settings: FA.defaultTimeSettings,
      route: 'all',
      pinned: [],
      nonItemSlots: 1,
      supplies: {
        brew: 6, restore: 4, food: 0, other: 2, ranging: 0, superCombat: 0,
      },
      ringPolicy: 'camp-lightbearer',
      specMode: 'auto',
      carrierMode: 'auto',
      notOwned: USER_PLAN_NOT_OWNED,
    };
    const r = plan(inputs, { model: FA.time });
    expect(kitNames(r)).not.toContain(BLESSING);
    expect(Math.abs(total(r) - USER_PLAN[1])).toBeLessThanOrEqual(USER_PLAN[1] * 0.01);
    expect(r.slots!.used).toBe(r.slots!.supplies + r.slots!.nonItem + exhaustive(kitIds(r), carriedOf(r)));
    // phase 36 review: the Onyx bolts switch is gone (the slot went to the kit's Scythe of Vitur); a quiver holds quiver ammo
    if (r.quiverAmmo) expect(isQuiverAmmo(equipmentById(r.quiverAmmo.id))).toBe(true);
  }, 900000);
});
