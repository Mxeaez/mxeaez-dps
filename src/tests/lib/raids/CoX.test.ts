import { expect, test } from '@jest/globals';
import { otherRaidsDescribe } from '@/tests/utils/otherRaids';
import { generateEmptyPlayer } from '@/state';
import { scaleMonster } from '@/lib/MonsterScaling';
import { getDefenceFloor } from '@/lib/scaling/DefenceReduction';
import { INITIAL_MONSTER_INPUTS } from '@/lib/Monsters';
import { MonsterAttribute } from '@/enums/MonsterAttribute';
import { Monster } from '@/types/Monster';
import {
  applyPresetToPlayer, buildTargetMonster, evaluateLoadout, findTarget, presetStyles,
} from '@/lib/fracturedArchive/bestSetup';
import { BestSetupAssumptions, PresetDef } from '@/lib/fracturedArchive/presets';
import { runGearSearch } from '@/lib/fracturedArchive/search';
import {
  encounterTime, PhaseQuery, phaseKey, RaidKit, raidTimeAssumptionsFrom,
} from '@/lib/fracturedArchive/raidTime';
import { DEFAULT_PINNED_NAMES, plan, planItemByName } from '@/lib/fracturedArchive/planner';
import { resolveItem } from '@/lib/fracturedArchive/loadout';
import {
  CHAMBERS_OF_XERIC_RAID, raidBase, teamDpsMultiplier, TimeSettings, withScalingInput,
} from '@/lib/raids';
import { COX_DEFAULT_SUPPLIES } from '@/lib/raids/chambersOfXeric';
import { COX_DEFAULT_ASSUMPTIONS, COX_PRESETS } from '@/lib/raids/cox/presets';
import { COX_SEARCH_POOL } from '@/lib/raids/cox/searchPool';
import { COX_TARGETS } from '@/lib/raids/cox/targets';
import { getCoxMeleeDamageDivisor } from '@/lib/raids/cox/damage';
import { mysticCount, olmStandardPhases, shamanCount } from '@/lib/raids/cox/constants';
import { COX_TIME_DEFAULTS, coxEncounterPlan } from '@/lib/raids/cox/time';

// Phase 19: Chambers of Xeric. Scaling = upstream src/lib/scaling/ChambersOfXeric.ts (checked against in-game Monster
// Examine values by upstream's src/tests/lib/scaling/ChambersOfXeric.test.ts). The wiki has no "Chambers of
// Xeric/Scaling" page (404 on 2026-10-23); it says "The stats of the enemies in the raid will likewise scale accordingly
// to the team size" (Chambers of Xeric), "In all rooms, their stats will scale accordingly" (Strategies) and, for
// Challenge Mode, "Apart from the Great Olm's health, all of the enemies' combat stats (including health) are increased by
// 50%" (Chambers of Xeric/Challenge Mode). Encounter sequences: Strategies + room pages; notes in docs/DATA_SOURCES.md.

const A = COX_DEFAULT_ASSUMPTIONS;
const CM: BestSetupAssumptions = { ...A, cox: { challengeMode: true } };
const withParty = (n: number, a: BestSetupAssumptions = A): BestSetupAssumptions => ({ ...a, partySize: n });
const scaled = (key: string, a: BestSetupAssumptions = A) => scaleMonster(buildTargetMonster(findTarget(key), undefined, 'none', a).monster);
const preset = (name: string): PresetDef => COX_PRESETS.find((p) => p.name === name)!;
const presetDpsOn = (name: string, monster: Monster, a: BestSetupAssumptions = A) => {
  const p = preset(name);
  return Math.max(...presetStyles(p).map((s) => evaluateLoadout(applyPresetToPlayer(generateEmptyPlayer(), p, s, null, monster, a), monster, false).dps));
};
const presetDps = (name: string, key: string, a: BestSetupAssumptions = A) => presetDpsOn(name, buildTargetMonster(findTarget(key), undefined, 'none', a).monster, a);

otherRaidsDescribe('CoX scaling (upstream) at party 6: normal vs Challenge Mode', () => {
  test('Tekton: hp 300 → 1200 / CM 1800; Defence 205 → 215 / CM 290 (hand derivation)', () => {
    // hp: trunc(300 × 126 / 126) = 300; + 300 × trunc(6 × 50 / 100) = + 900 → 1200; CM: + 50% → 1800
    // Defence: trunc(205 × 99 / 99) = 205; × (100 + iSqrt(5) + trunc(5 × 7 / 10)) / 100 = × 105% → trunc(215.25) = 215
    // CM Tekton (4+ players): + 35% → 215 + trunc(75.25) = 290 (wiki changelog: "Tekton's defence will scale less
    // harshly for challenge raids consisting of smaller numbers of players")
    const n = scaled('cox-tekton');
    const c = scaled('cox-tekton', CM);
    expect([n.skills.hp, n.skills.def]).toEqual([1200, 215]);
    expect([c.skills.hp, c.skills.def]).toEqual([1800, 290]);
    // below 4 players CM Tekton gets +20% instead (upstream test values at size 3: see ChambersOfXeric.test.ts)
    const c3 = scaled('cox-tekton', withParty(3, CM));
    const n3 = scaled('cox-tekton', withParty(3));
    expect(c3.skills.def).toBe(n3.skills.def + Math.trunc((n3.skills.def * 20) / 100));
  });

  test('Vasa: hp 300 → 1200 / CM 1800; Defence 175 → 183 / CM 274', () => {
    expect([scaled('cox-vasa').skills.hp, scaled('cox-vasa').skills.def]).toEqual([1200, 183]);
    expect([scaled('cox-vasa', CM).skills.hp, scaled('cox-vasa', CM).skills.def]).toEqual([1800, 274]);
  });

  test('Great Olm: head 800 + 400 × 5 = 2800, claws 600 + 300 × 5 = 2100; CM keeps the hp, Defence +50%', () => {
    // upstream: factor = min(party - 1, 50) - 3 × trunc(min(party, 50) / 8) = 5 at party 6
    expect([scaled('cox-olm-head').skills.hp, scaled('cox-olm-head').skills.def]).toEqual([2800, 157]);
    expect([scaled('cox-olm-head', CM).skills.hp, scaled('cox-olm-head', CM).skills.def]).toEqual([2800, 235]);
    expect(scaled('cox-olm-left').skills.hp).toBe(2100);
    expect(scaled('cox-olm-right').skills.hp).toBe(2100);
    expect(scaled('cox-olm-left', CM).skills.hp).toBe(2100);
    // right claw: half the magic level (upstream)
    expect(scaled('cox-olm-right').skills.magic).toBe(Math.trunc(scaled('cox-olm-left').skills.magic / 2));
  });

  test('every target: Defence scales with party size (not only hp), CM raises hp except Olm / Glowing crystal', () => {
    COX_TARGETS.forEach((t) => {
      const one = scaled(t.key, withParty(1));
      const six = scaled(t.key);
      const cm = scaled(t.key, CM);
      expect(six.skills.hp).toBeGreaterThan(one.skills.hp);
      expect(six.skills.def).toBeGreaterThanOrEqual(one.skills.def);
      if (t.name === 'Great Olm' || t.name === 'Glowing crystal') expect(cm.skills.hp).toBe(six.skills.hp);
      else expect(cm.skills.hp).toBe(six.skills.hp + Math.trunc(six.skills.hp / 2));
    });
    expect(scaled('cox-tekton').skills.def).toBeGreaterThan(scaled('cox-tekton', withParty(1)).skills.def);
  });

  test('the calculator\'s CoX inputs: CM flag, best player 126 / 99, party Mining 99 × size (Guardians 1000 hp at 6)', () => {
    const { monster } = buildTargetMonster(findTarget('cox-guardian'), undefined, 'none', A);
    expect(monster.inputs.isFromCoxCm).toBe(false);
    expect(monster.inputs.partyMaxCombatLevel).toBe(126);
    expect(monster.inputs.partyMaxHpLevel).toBe(99);
    expect(monster.inputs.partySumMiningLevel).toBe(594);
    expect(buildTargetMonster(findTarget('cox-guardian'), undefined, 'none', CM).monster.inputs.isFromCoxCm).toBe(true);
    // upstream: base 151 + trunc(594 / 6) = 250, × (1 + trunc(6 / 2)) = 1000 (the wiki's formula gives 1198: UNVERIFIED F)
    expect(scaled('cox-guardian').skills.hp).toBe(1000);
  });

  test('party input: 1-15 (CoX allows 1-100), Challenge Mode is a checkbox input', () => {
    const base = raidBase('cox');
    expect(base.partySize).toEqual({ min: 1, max: 15 });
    const [party, cm] = base.scalingInputs;
    expect(withScalingInput(A, party, 40).partySize).toBe(15);
    expect(cm.kind).toBe('bool');
    expect(cm.get(A)).toBe(0);
    expect(withScalingInput(A, cm, 1).cox!.challengeMode).toBe(true);
    expect(cm.get(withScalingInput(A, cm, 1))).toBe(1);
    expect(teamDpsMultiplier(A)).toBe(6);
  });

  test('no Defence floors in CoX (upstream getDefenceFloor): drains can reach 0', () => {
    COX_TARGETS.forEach((t) => expect(getDefenceFloor(scaled(t.key))).toBe(0));
  });
});

otherRaidsDescribe('CoX damage rules', () => {
  test('Guardians: only pickaxes deal damage (upstream); the search lists everything else as can\'t hit', () => {
    expect(presetDps('Torva + Scythe (slash)', 'cox-guardian')).toBe(0);
    expect(presetDps('Twisted bow (Masori)', 'cox-guardian')).toBe(0);
    expect(presetDps('Dragon pickaxe (Torva)', 'cox-guardian')).toBeGreaterThan(3);
  });

  test('Great Olm is a dragon: the Dragon hunter lance beats the same hit on a non-dragon', () => {
    const { monster } = buildTargetMonster(findTarget('cox-olm-left'), undefined, 'none', A);
    expect(monster.attributes).toContain(MonsterAttribute.DRAGON);
    const notDragon: Monster = { ...monster, attributes: monster.attributes.filter((x) => x !== MonsterAttribute.DRAGON) };
    expect(presetDpsOn('Dragon hunter lance (Torva)', monster)).toBeGreaterThan(presetDpsOn('Dragon hunter lance (Torva)', notDragon) * 1.15);
  });

  test('Olm melee mitigation (wiki "66% damage mitigation"): melee ÷3 on the head and right claw, not the left claw', () => {
    const m = (key: string) => buildTargetMonster(findTarget(key), undefined, 'none', A).monster;
    expect(getCoxMeleeDamageDivisor(m('cox-olm-head'), true)).toBe(3);
    expect(getCoxMeleeDamageDivisor(m('cox-olm-right'), true)).toBe(3);
    expect(getCoxMeleeDamageDivisor(m('cox-olm-left'), true)).toBe(1);
    expect(getCoxMeleeDamageDivisor(m('cox-olm-head'), false)).toBe(1);
    expect(getCoxMeleeDamageDivisor(m('cox-tekton'), true)).toBe(1);
    // the hook is live: the same melee loadout on the head deals about a third of what it deals on a copy without the rule
    const head = m('cox-olm-head');
    const copy: Monster = { ...head, id: -1 };
    const ratio = presetDpsOn('Dragon hunter lance (Torva)', head) / presetDpsOn('Dragon hunter lance (Torva)', copy);
    expect(ratio).toBeGreaterThan(0.3);
    expect(ratio).toBeLessThan(0.36);
  });

  test('Tekton is immune to ranged, Vespula and the portal to melee (upstream)', () => {
    expect(presetDps('Twisted bow (Masori)', 'cox-tekton')).toBe(0);
    expect(presetDps('Torva + Scythe (slash)', 'cox-vespula')).toBe(0);
    expect(presetDps('Torva + Scythe (slash)', 'cox-abyssal-portal')).toBe(0);
    expect(presetDps('Twisted bow (Masori)', 'cox-vespula')).toBeGreaterThan(0);
  });

  test('Vanguards: drains never apply ("they will restore all drained stats upon retreating into their shell")', () => {
    const team = buildTargetMonster(findTarget('cox-vanguard-melee'), undefined, 'team', A);
    expect(team.monster.inputs.defenceReductions).toEqual(INITIAL_MONSTER_INPUTS.defenceReductions);
    expect(team.drain.plan).toMatch(/^No drains/);
    expect(team.drain.id).toBe('team');
    // Tekton does get the team's drains
    const tek = buildTargetMonster(findTarget('cox-tekton'), undefined, 'team', A);
    expect(scaleMonster(tek.monster).skills.def).toBeLessThan(215);
  });

  test('presets and pool: every item resolves; pickaxes, dragonbane weapons and the Salve (ei) are in the pool', () => {
    COX_PRESETS.forEach((p) => Object.values(p.equipment).forEach((ref) => expect(resolveItem(ref!)).toBeTruthy()));
    const weapons = Object.values(COX_SEARCH_POOL).flatMap((g) => g.weapons.map((w) => (Array.isArray(w.weapon) ? w.weapon[0] : w.weapon)));
    ['Dragon pickaxe', 'Crystal pickaxe', 'Dragon hunter lance', 'Dragon hunter crossbow', 'Dragon hunter wand'].forEach((n) => expect(weapons).toContain(n));
    Object.values(COX_SEARCH_POOL).forEach((g) => expect(g.slots.neck!.map((c) => c.ref)).toContain('Salve amulet(ei)'));
  });
});

otherRaidsDescribe('CoX encounter damage sequences (src/lib/raids/cox/time.ts)', () => {
  const settings: TimeSettings = CHAMBERS_OF_XERIC_RAID.defaultTimeSettings;
  const timeA = (s: TimeSettings = settings, best: BestSetupAssumptions = A, drain: 'none' | 'team' = 'none') => raidTimeAssumptionsFrom(best, drain, s, CHAMBERS_OF_XERIC_RAID.time);
  const plan1 = (id: string, s = settings, best = A) => coxEncounterPlan(id, timeA(s, best)).map((p) => [p.targetKey, Math.round(p.damage * 10) / 10]);
  const toyKit = (dps: Record<string, number>): RaidKit => ({
    best: (q: PhaseQuery) => {
      const d = dps[phaseKey(q.targetKey, q.phase)] ?? dps[q.targetKey] ?? 0;
      return d > 0 ? { loadout: 'toy', style: 'x', dps: d } : null;
    },
  });

  test('Olm phases: 3 standard phases + head below 8 players, +1 per 8 (wiki Strategies / Great Olm)', () => {
    expect([1, 2, 6, 7].map(olmStandardPhases)).toEqual([3, 3, 3, 3]);
    expect([8, 12, 15].map(olmStandardPhases)).toEqual([4, 4, 4]);
    expect(olmStandardPhases(16)).toBe(5);
    expect(plan1('cox-olm')).toEqual([
      ['cox-olm-right', 2100], ['cox-olm-left', 2100],
      ['cox-olm-right', 2100], ['cox-olm-left', 2100],
      ['cox-olm-right', 2100], ['cox-olm-left', 2100],
      ['cox-olm-head', 2800],
    ]);
    // 8 players: a 4th hand phase; upstream shares the extra phase's hp out (claws 600 + 300 × (7 - 3) = 1800)
    const eight = plan1('cox-olm', settings, withParty(8));
    expect(eight.length).toBe(9);
    expect(eight[0]).toEqual(['cox-olm-right', 1800]);
    expect(eight[8]).toEqual(['cox-olm-head', 2400]);
    // total claw hp at 8 = at 7 (4 × 3600 = 3 × 4800)
    const claws = (rows: (string | number)[][]) => rows.filter((r) => r[0] !== 'cox-olm-head').reduce((t, r) => t + (r[1] as number), 0);
    expect(claws(eight)).toBe(claws(plan1('cox-olm', settings, withParty(7))));
    expect(coxEncounterPlan('cox-olm', timeA()).map((p) => p.label)[4]).toBe('Phase 3 of 3, penultimate: right claw (mage hand)');
  });

  test('rooms at party 6: Tekton 80 / 20 enraged, Vasa crystal + hp, 3 Vanguards, Vespula 80% + portal, counts by party', () => {
    expect(plan1('cox-tekton')).toEqual([['cox-tekton', 960], ['cox-tekton-enraged', 240]]);
    expect(plan1('cox-vasa')).toEqual([['cox-glowing-crystal', 480], ['cox-vasa', 1200]]);
    expect(plan1('cox-vanguards')).toEqual([['cox-vanguard-melee', 720], ['cox-vanguard-ranged', 720], ['cox-vanguard-magic', 720]]);
    expect(plan1('cox-vespula')).toEqual([['cox-vespula', 640], ['cox-abyssal-portal', 1000]]);
    expect(plan1('cox-mystics')).toEqual([['cox-mystic', 5 * 640]]);
    expect(plan1('cox-shamans')).toEqual([['cox-shaman', 3 * 760]]);
    expect(plan1('cox-muttadiles')).toEqual([['cox-muttadile-small', 1000], ['cox-muttadile-large', 1000]]);
    expect(plan1('cox-guardians')).toEqual([['cox-guardian', 2000]]);
    expect(plan1('cox-ice-demon')).toEqual([['cox-ice-demon', 560]]);
    // Strategies tables
    expect([1, 2, 3, 5, 6, 8, 9, 15].map(mysticCount)).toEqual([3, 3, 4, 4, 5, 5, 6, 8]);
    expect([1, 4, 5, 9, 10, 14, 15].map(shamanCount)).toEqual([2, 2, 3, 3, 4, 4, 5]);
  });

  test('settings: unticked rooms are skipped, Vespula portal-only, heals add damage', () => {
    expect(coxEncounterPlan('cox-tekton', timeA({ ...COX_TIME_DEFAULTS, room_tekton: false }))).toEqual([]);
    expect(coxEncounterPlan('cox-olm', timeA({ ...COX_TIME_DEFAULTS, room_tekton: false })).length).toBe(7);
    expect(plan1('cox-vespula', { ...COX_TIME_DEFAULTS, vespulaMethod: 'portal' })).toEqual([['cox-abyssal-portal', 1000]]);
    expect(plan1('cox-tekton', { ...COX_TIME_DEFAULTS, tektonAnvilHeal: 0.1, tektonEnragedFraction: 0 })).toEqual([['cox-tekton', 1320], ['cox-tekton-enraged', 0]]);
    expect(plan1('cox-muttadiles', { ...COX_TIME_DEFAULTS, muttadileHeal: 0.4 })).toEqual([['cox-muttadile-small', 1400], ['cox-muttadile-large', 1400]]);
    expect(plan1('cox-vasa', { ...COX_TIME_DEFAULTS, vasaCrystals: 0 })).toEqual([['cox-glowing-crystal', 0], ['cox-vasa', 1200]]);
  });

  test('CM: more hp per room (Olm unchanged)', () => {
    expect(plan1('cox-tekton', settings, CM)).toEqual([['cox-tekton', 1440], ['cox-tekton-enraged', 360]]);
    expect(plan1('cox-olm', settings, CM)).toEqual(plan1('cox-olm'));
  });

  test('time = damage ÷ (party × DPS); a room the kit can\'t damage (no pickaxe at Guardians) is infinite', () => {
    const kit = toyKit({
      'cox-olm-right': 10, 'cox-olm-left': 12, 'cox-olm-head': 15, 'cox-tekton': 8, 'cox-tekton-enraged': 6,
    });
    const olm = encounterTime('cox-olm', kit, timeA());
    expect(olm.phases.length).toBe(7);
    expect(olm.seconds).toBeCloseTo((3 * 2100) / 60 + (3 * 2100) / 72 + 2800 / 90);
    const tek = encounterTime('cox-tekton', kit, timeA());
    expect(tek.seconds).toBeCloseTo(960 / 48 + 240 / 36);
    expect(encounterTime('cox-guardians', kit, timeA()).seconds).toBe(Infinity);
    // a room that isn't in the layout takes no time
    const off = encounterTime('cox-guardians', kit, timeA({ ...COX_TIME_DEFAULTS, room_guardians: false }));
    expect(off.phases).toEqual([]);
    expect(off.seconds).toBe(0);
  });

  test('required phase targets follow the ticked rooms', () => {
    const all = CHAMBERS_OF_XERIC_RAID.time.requiredPhaseTargets(timeA()).map((q) => q.targetKey);
    expect(all.length).toBe(18);
    const few = CHAMBERS_OF_XERIC_RAID.time.requiredPhaseTargets(timeA({
      ...COX_TIME_DEFAULTS, room_vasa: false, room_guardians: false, vespulaMethod: 'portal',
    })).map((q) => q.targetKey);
    expect(few).not.toContain('cox-glowing-crystal');
    expect(few).not.toContain('cox-guardian');
    expect(few).not.toContain('cox-vespula');
    expect(few).toContain('cox-olm-head');
  });
});

otherRaidsDescribe('CoX search and planner', () => {
  test('Search on Tekton (Team drains): melee crush/stab top row ≥ best preset; ranged is listed as can\'t hit', () => {
    const r = runGearSearch(generateEmptyPlayer(), { targetKey: 'cox-tekton', drain: 'team' }, A, { topN: 5 });
    expect(r.cancelled).toBe(false);
    const top = r.rows[0];
    expect(top.group).toBe('melee');
    expect(top.dps).toBeGreaterThanOrEqual(r.bestPreset!.dps);
    expect(top.dps).toBeGreaterThan(8);
    expect(top.dps).toBeLessThan(25);
    expect(r.cantHit.map((c) => c.weapon)).toContain('Twisted bow + Dragon arrow');
    // the team's drains lower Tekton's Defence (no floor)
    expect(r.drain.defAfter).toBeLessThan(215);
  }, 120000);

  test('Search on the Olm head: ranged top row (the head mitigates everything else)', () => {
    const r = runGearSearch(generateEmptyPlayer(), { targetKey: 'cox-olm-head', drain: 'none' }, A, { topN: 3 });
    expect(r.rows[0].group).toBe('ranged');
    expect(r.rows[0].dps).toBeGreaterThan(5);
  }, 120000);

  test('Search on the Guardians: a pickaxe on top, other weapons can\'t hit', () => {
    const r = runGearSearch(generateEmptyPlayer(), { targetKey: 'cox-guardian', drain: 'none' }, A, { topN: 3 });
    expect(r.rows[0].weaponLabel).toMatch(/pickaxe/);
    expect(r.cantHit.map((c) => c.weapon)).toContain('Scythe of Vitur');
  }, 120000);

  test('planner on CoX with a reduced pool: one route, fits in 28 slots, a pickaxe for the Guardians', () => {
    const res = plan({
      basePlayer: generateEmptyPlayer(),
      assumptions: A,
      drain: 'team',
      settings: CHAMBERS_OF_XERIC_RAID.defaultTimeSettings,
      route: 'all',
      pinned: DEFAULT_PINNED_NAMES.map((n) => planItemByName(n).id),
      nonItemSlots: 1,
      supplies: COX_DEFAULT_SUPPLIES,
    }, {
      model: CHAMBERS_OF_XERIC_RAID.time,
      presets: COX_PRESETS.filter((p) => ['Torva + Scythe (slash)', 'Twisted bow (Masori)', 'Tumeken\'s shadow (Ancestral)', 'Dragon pickaxe (Torva)'].includes(p.name)),
      search: { weapons: ['Scythe of Vitur', 'Twisted bow', 'Tumeken\'s shadow', 'Dragon pickaxe'], maxPasses: 1 },
      perGroupWeapons: 2,
      perWeapon: 1,
      seeds: 4,
    });
    expect(res.cancelled).toBe(false);
    expect(res.comparison!.routes.length).toBe(1);
    const route = res.comparison!.routes[res.planned];
    expect(Number.isFinite(route.seconds)).toBe(true);
    expect(res.slots!.used).toBeLessThanOrEqual(28);
    const guardians = route.encounters.find((e) => e.id === 'cox-guardians')!;
    expect(guardians.phases[0].choice?.loadout).toMatch(/pickaxe/);
    const olm = route.encounters.find((e) => e.id === 'cox-olm')!;
    expect(olm.phases.length).toBe(7);
    expect(route.seconds).toBeCloseTo(route.encounters.reduce((t, e) => t + e.seconds, 0));
  }, 300000);
});
