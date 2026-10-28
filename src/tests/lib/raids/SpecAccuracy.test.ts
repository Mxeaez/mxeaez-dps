import { describe, expect, test } from '@jest/globals';
import { otherRaidsDescribe, otherRaidsTest } from '@/tests/utils/otherRaids';
import PlayerVsNPCCalc from '@/lib/PlayerVsNPCCalc';
import { scaleMonster } from '@/lib/MonsterScaling';
import { getCombatStylesForCategory } from '@/utils';
import { EquipmentCategory } from '@/enums/EquipmentCategory';
import { buildTargetMonster, findTarget } from '@/lib/fracturedArchive/bestSetup';
import { BestSetupAssumptions } from '@/lib/fracturedArchive/presets';
import { resolveItem } from '@/lib/fracturedArchive/loadout';
import {
  drainModel, SPEC_WEAPONS, specPlayer, specProfile, SpecWeapon,
} from '@/lib/fracturedArchive/specs';
import { drainLineNote } from '@/lib/fracturedArchive/drainLine';
import { TOA_DEFAULT_ASSUMPTIONS } from '@/lib/raids/toa/presets';
import { COX_DEFAULT_ASSUMPTIONS } from '@/lib/raids/cox/presets';
import { TOB_DEFAULT_ASSUMPTIONS } from '@/lib/raids/tob/presets';
import { withPhase32Specs } from '@/tests/utils/phase32Specs';

// Phase 24: spec accuracy in the raids. The spec profiles (specs.ts) run upstream's own spec calc
// (`getSpecCalc()`), which scales the monster (CoX party / CM levels) and uses `getNPCDefenceRoll()`, where ToA's
// raid level multiplies the defence roll by (250 + level) / 250 - the same path as a normal attack. Hand computations
// below; table in docs/DATA_SOURCES.md, "Spec accuracy by raid".

const toaAt = (invocationLevel: number): BestSetupAssumptions => ({
  ...withPhase32Specs(TOA_DEFAULT_ASSUMPTIONS), toa: { ...TOA_DEFAULT_ASSUMPTIONS.toa!, invocationLevel },
});
const undrained = (key: string, a: BestSetupAssumptions) => buildTargetMonster(findTarget(key), undefined, 'none', a).monster;
const hit = (atk: number, def: number) => (atk > def ? 1 - (def + 2) / (2 * (atk + 1)) : atk / (2 * (def + 1)));

/** Normal-attack and spec calcs for the spec player, in the style the profile picked. */
const calcs = (key: string, a: BestSetupAssumptions, weapon: SpecWeapon) => {
  const m = undrained(key, a);
  const profile = specProfile(m, weapon, undefined, a);
  const item = resolveItem(SPEC_WEAPONS[weapon].item);
  const style = getCombatStylesForCategory(item.category || EquipmentCategory.NONE)
    .find((s) => profile.style === `${s.name} (${s.stance})`)!;
  const player = specPlayer(m, weapon, style, a);
  const normal = new PlayerVsNPCCalc(player, m, { loadoutName: 'normal', detailedOutput: false });
  return {
    m, profile, player, normal, spec: normal.getSpecCalc()!,
  };
};

otherRaidsDescribe("ToA: Kephri, Elder maul (Piety, Smelling salts, Inquisitor's), party 6, path 0", () => {
  // Attack: 99 + Smelling salts (11 + 16%) = 125; Piety x1.2 -> 150; +8 +3 (Accurate) = 161; x (crush +223 + 64) =
  // 46207; Inquisitor's set +2.5% crush -> 47362 (normal attack); spec +25% -> 59202.
  // Defence: (80 + 9) x (crush +100 + 64) = 14596; raid level L multiplies it by (250 + L) / 250 -> 43788 at 500.
  const ATK_NORMAL = 47362;
  const ATK_SPEC = 59202;
  const defRoll = (level: number) => Math.trunc(14596 * (250 + level) / 250);

  test.each([0, 150, 500])('raid level %i: spec and normal accuracy match the hand computation', (level) => {
    const {
      player, normal, spec, profile,
    } = calcs('toa-kephri-shielded', toaAt(level), 'elderMaul');
    expect(profile.style).toBe('Pound (Accurate)');
    expect(player.offensive.crush).toBe(223);
    expect(normal.getMaxAttackRoll()).toBe(ATK_NORMAL);
    expect(spec.getMaxAttackRoll()).toBe(ATK_SPEC);
    expect(normal.getNPCDefenceRoll()).toBe(defRoll(level));
    expect(spec.getNPCDefenceRoll()).toBe(defRoll(level));
    expect(normal.getHitChance()).toBeCloseTo(hit(ATK_NORMAL, defRoll(level)), 6);
    expect(profile.hitChance).toBeCloseTo(hit(ATK_SPEC, defRoll(level)), 6);
  });

  test('the raid level lowers the spec hit chance: 87.7% at 0, 80.3% at 150, 63.0% at 500 (normal attack 53.8%)', () => {
    const at = (level: number) => specProfile(undrained('toa-kephri-shielded', toaAt(level)), 'elderMaul', undefined, toaAt(level)).hitChance;
    expect(at(0)).toBeCloseTo(0.8767, 4);
    expect(at(150)).toBeCloseTo(0.8028, 4);
    expect(at(500)).toBeCloseTo(0.6302, 4);
    expect(calcs('toa-kephri-shielded', toaAt(500), 'elderMaul').normal.getHitChance()).toBeCloseTo(0.5377, 4);
  });

  test('her Defence level and bonuses are low; the drain floor is 60 (wiki: lowered by at most 20)', () => {
    const s = scaleMonster(undrained('toa-kephri-shielded', toaAt(500)));
    expect(s.skills.def).toBe(80);
    expect(s.defensive.crush).toBe(100);
    expect(drainModel(undrained('toa-kephri-shielded', toaAt(500)), toaAt(500)).floor).toBe(60);
  });

  test('the drain line shows the computed hit chance, and says one landed spec reaches the floor', () => {
    for (const drain of ['team', 'solo'] as const) {
      const d = buildTargetMonster(findTarget('toa-kephri-shielded'), undefined, drain, toaAt(500)).drain;
      const maul = d.line!.items.find((i) => i.weapon === 'elderMaul')!;
      expect(maul.hitChance).toBeCloseTo(0.6302, 4);
      expect(d.defAfter).toBe(60);
      expect(d.line!.note).toMatch(/^1 landed spec reaches the floor \(Def 60\); ≈ 1\.\d specs on average/);
    }
    const lower = buildTargetMonster(findTarget('toa-kephri-shielded'), undefined, 'team', toaAt(150)).drain;
    expect(lower.line!.items.find((i) => i.weapon === 'elderMaul')!.hitChance).toBeCloseTo(0.8028, 4);
  });
});

otherRaidsDescribe('CoX: Tekton, DWH, party 6', () => {
  // Defence (party 6) 215, CM 290; roll = (def + 9) x (crush +105 + 64). The DWH spec has no accuracy modifier.
  const coxAt = (challengeMode: boolean): BestSetupAssumptions => ({ ...COX_DEFAULT_ASSUMPTIONS, partySize: 6, cox: { challengeMode } });

  test('Challenge Mode raises Defence (scaleMonster) and the spec calc uses it', () => {
    const normal = calcs('cox-tekton', coxAt(false), 'dwh');
    const cm = calcs('cox-tekton', coxAt(true), 'dwh');
    expect(scaleMonster(normal.m).skills.def).toBe(215);
    expect(scaleMonster(cm.m).skills.def).toBe(290);
    expect(normal.spec.getNPCDefenceRoll()).toBe(224 * 169);
    expect(cm.spec.getNPCDefenceRoll()).toBe(299 * 169);
    const atk = normal.spec.getMaxAttackRoll();
    expect(cm.spec.getMaxAttackRoll()).toBe(atk);
    expect(normal.profile.hitChance).toBeCloseTo(hit(atk, 224 * 169), 6);
    expect(cm.profile.hitChance).toBeCloseTo(hit(atk, 299 * 169), 6);
    expect(normal.profile.hitChance).toBeCloseTo(0.5668, 4);
    expect(cm.profile.hitChance).toBeCloseTo(0.4323, 4);
  });

  test('party size scales Defence too (party 1: Defence 205)', () => {
    const solo = calcs('cox-tekton', { ...coxAt(false), partySize: 1 }, 'dwh');
    expect(scaleMonster(solo.m).skills.def).toBe(205);
    expect(solo.profile.hitChance).toBeGreaterThan(calcs('cox-tekton', coxAt(false), 'dwh').profile.hitChance);
  });
});

otherRaidsDescribe('ToB: Verzik P2, Elder maul', () => {
  const tobAt = (mode: 'normal' | 'hard' | 'entry'): BestSetupAssumptions => ({ ...TOB_DEFAULT_ASSUMPTIONS, tob: { mode } });

  test('Hard Mode is a separate monster with the same Defence (wiki), so the same hit chance; Entry Mode is lower', () => {
    const nm = calcs('tob-verzik-p2', tobAt('normal'), 'elderMaul');
    const hm = calcs('tob-verzik-p2', tobAt('hard'), 'elderMaul');
    const em = calcs('tob-verzik-p2', tobAt('entry'), 'elderMaul');
    expect(hm.m.id).not.toBe(nm.m.id);
    expect(scaleMonster(hm.m).skills.def).toBe(200);
    expect(hm.spec.getNPCDefenceRoll()).toBe(209 * 164);
    expect(hm.profile.hitChance).toBeCloseTo(nm.profile.hitChance, 9);
    expect(hm.profile.hitChance).toBeCloseTo(0.6934, 4);
    expect(em.profile.hitChance).toBeCloseTo(0.88, 4);
  });

  test('party size changes only hp, not the spec hit chance', () => {
    const p3 = calcs('tob-verzik-p2', { ...tobAt('hard'), partySize: 3 }, 'elderMaul');
    const p5 = calcs('tob-verzik-p2', { ...tobAt('hard'), partySize: 5 }, 'elderMaul');
    expect(scaleMonster(p3.m).skills.hp).not.toBe(scaleMonster(p5.m).skills.hp);
    expect(p3.profile.hitChance).toBe(p5.profile.hitChance);
  });
});

otherRaidsDescribe('consistency with the main calculator', () => {
  test('Elder maul spec accuracy = a normal attack with the attack roll x 1.25 against the same defence roll', () => {
    const { normal, spec, profile } = calcs('toa-kephri', toaAt(300), 'elderMaul');
    const atk = Math.trunc(normal.getMaxAttackRoll() * 5 / 4);
    expect(spec.getMaxAttackRoll()).toBe(atk);
    expect(spec.getNPCDefenceRoll()).toBe(normal.getNPCDefenceRoll());
    expect(profile.hitChance).toBeCloseTo(hit(atk, normal.getNPCDefenceRoll()), 9);
  });
});

describe('drain line note (phase 24)', () => {
  otherRaidsTest('a planned weapon landing < 40% of its specs is called out', () => {
    const d = buildTargetMonster(findTarget('toa-baba'), undefined, 'solo', toaAt(500)).drain;
    const maul = d.line!.items.find((i) => i.weapon === 'elderMaul')!;
    expect(maul.hitChance!).toBeLessThan(0.4);
    expect(d.line!.note).toBe(`drains unlikely to land here: ${Math.round(maul.hitChance! * 100)}% per spec`);
  });

  test('pure rule: names each low weapon when several are planned; compared as shown (rounded)', () => {
    const base = {
      def: 100, floor: 0, magicLevel: 100, outcomes: {} as never,
    };
    const hc = (maul: number, bgs: number) => ({
      elderMaul: maul, dwh: 1, tonalztics: 1, bgs, ayak: 1,
    });
    expect(drainLineNote({ ...base, hitChance: hc(0.31, 0.22) }, ['elderMaul', 'bgs']))
      .toBe('drains unlikely to land here: Elder maul 31%, BGS 22% per spec');
    expect(drainLineNote({ ...base, hitChance: hc(0.31, 0.9) }, ['elderMaul']))
      .toBe('drains unlikely to land here: 31% per spec');
    // 39.6% shows as 40%: not flagged; one spec doesn't reach the floor (100 -> 65 > 0): no note
    expect(drainLineNote({ ...base, hitChance: hc(0.396, 0.9) }, ['elderMaul', 'elderMaul'])).toBeUndefined();
  });
});
