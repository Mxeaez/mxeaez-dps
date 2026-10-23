'use client';

import React, { useMemo, useState } from 'react';
import { PotionMap } from '@/utils';
import Potion from '@/enums/Potion';
import {
  buildTargetMonster,
  DRAIN_STATES,
  DrainStateId,
  findTarget,
  targetPhases,
} from '@/lib/fracturedArchive/bestSetup';
import {
  BestSetupAssumptions, MySpecs, StyleGroup, TeamSpecAssumptions,
} from '@/lib/fracturedArchive/presets';
import { scaleMonster } from '@/lib/MonsterScaling';
import {
  RaidConfig, RaidId, RAIDS, raidConfig, scalingInputValue, withScalingInput,
} from '@/lib/raids';
import { ayakExpectedDrain, drainModel, specProfile } from '@/lib/fracturedArchive/specs';
import SpecPlanPanel from '@/app/components/bestSetup/SpecPlanPanel';
import SearchView from '@/app/components/bestSetup/SearchView';
import SummaryView from '@/app/components/bestSetup/SummaryView';
import RoutesView from '@/app/components/bestSetup/RoutesView';
import PlanView from '@/app/components/bestSetup/PlanView';
import { targetImageUrl } from '@/lib/fracturedArchive/loadoutIcons';
import { ItemIcon } from '@/app/components/bestSetup/ItemIcons';

// Fractured Archive "Best setup" view (phase 8; "Search" tab phase 9). Phase 12: Search is the default tab; item icons.
// Phase 13: the "Per boss" preset table was removed (the presets still seed the search and give the "vs best preset"
// column); Summary is search-based (SummaryView.tsx). Phase 16: "Routes" tab (RoutesView.tsx, raid time model).
// Phase 17: "Plan" tab (PlanView.tsx, kit planner), second tab: Search, Plan, Routes, Summary.
// Phase 18: raid tabs (Fractured Archive, Tombs of Amascut; src/lib/raids) at the top; each raid keeps its own
// assumptions, and the four tabs below work from that raid's config (ToA's routes tab is "Encounters").
// Docs: docs/BEST_SETUP.md.

const POTION_OPTIONS = (Object.keys(PotionMap) as unknown as string[])
  .map((k) => Number(k) as Potion)
  .sort((a, b) => PotionMap[a].order - PotionMap[b].order);

const GROUP_PRAYER: Record<StyleGroup, string> = { melee: 'Piety', ranged: 'Rigour', magic: 'Augury' };

type MyWeapon = 'elderMaul' | 'dwh' | 'bgs' | 'tonalztics';
const MY_SPEC_WEAPONS: [MyWeapon, string][] = [['elderMaul', 'Elder maul'], ['dwh', 'DWH'], ['bgs', 'BGS'], ['tonalztics', 'Tonalztics']];
type TeamWeapon = keyof TeamSpecAssumptions['carriers'];
const TEAM_WEAPONS: [TeamWeapon, string][] = [['elderMaul', 'maul'], ['dwh', 'DWH'], ['bgs', 'BGS'], ['tonalztics', 'Tonalztics'], ['ayak', 'Ayak']];

const ScalingInputs: React.FC<{
  raid: RaidConfig,
  value: BestSetupAssumptions,
  onChange: (a: BestSetupAssumptions) => void,
}> = ({ raid, value, onChange }) => (
  <div className="flex flex-wrap gap-x-4 gap-y-2 items-center" data-testid="scaling-inputs">
    <span className="font-semibold">Raid scaling:</span>
    {raid.scalingInputs.map((d) => {
      const id = d.key === 'partySize' ? 'bs-party' : `bs-scale-${d.key.replace('.', '-')}`;
      return (
        <label key={d.key} htmlFor={id} className="flex items-center gap-1" title={d.title}>
          {d.label}
          <input
            id={id}
            type="number"
            className="form-control text-xs py-0.5 w-16"
            min={d.min}
            max={d.max}
            step={d.step ?? 1}
            value={scalingInputValue(value, d.key)}
            data-testid={`scaling-${d.key}`}
            onChange={(e) => onChange(withScalingInput(value, d, Number(e.target.value)))}
          />
        </label>
      );
    })}
  </div>
);

const AssumptionsBox: React.FC<{
  raid: RaidConfig,
  value: BestSetupAssumptions,
  onChange: (a: BestSetupAssumptions) => void,
  /** e.g. "≈ 40 magic def drained on Bork" for the selected boss (phase 14). */
  ayakHint?: string,
}> = ({
  raid, value, onChange, ayakHint,
}) => {
  const set = (patch: Partial<BestSetupAssumptions>) => onChange({ ...value, ...patch });
  const carrierTotal = Object.values(value.team.carriers).reduce((t, n) => t + n, 0);
  // the Fractured Archive keeps party size in the Team row (phase 14 layout); raids with more inputs get their own row
  const scalingRow = raid.scalingInputs.some((d) => d.key !== 'partySize');
  return (
    <div className="text-xs bg-body-100 dark:bg-dark-400 border border-body-400 dark:border-dark-200 rounded p-3 flex flex-col gap-2" data-testid="assumptions">
      <div className="font-bold text-sm">Assumptions</div>
      <div>
        {raid.raidOnlyAssumptions
          ? 'All skills 99. Prayers: Piety (or Zeal) / Rigour / Augury by style. Items per preset: src/lib/fracturedArchive/presets.ts.'
          : 'All skills 99. Prayers: Piety / Rigour / Augury by style. Presets: the Fractured Archive list + src/lib/raids/toa/presets.ts.'}
      </div>
      {scalingRow && <ScalingInputs raid={raid} value={value} onChange={onChange} />}
      <div className="flex flex-wrap gap-x-4 gap-y-2 items-center">
        {(['melee', 'ranged', 'magic'] as StyleGroup[]).map((g) => (
          <label key={g} htmlFor={`bs-potion-${g}`} className="flex items-center gap-1">
            <span className="capitalize">{`${g} potion`}</span>
            <select
              id={`bs-potion-${g}`}
              className="form-control text-xs py-0.5"
              value={value.potions[g]}
              onChange={(e) => set({ potions: { ...value.potions, [g]: Number(e.target.value) as Potion } })}
            >
              {POTION_OPTIONS.map((p) => <option key={p} value={p}>{PotionMap[p].name}</option>)}
            </select>
          </label>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2 items-center">
        {raid.raidOnlyAssumptions && (
          <>
            <label htmlFor="bs-zeal" className="flex items-center gap-1">
              <input id="bs-zeal" type="checkbox" checked={value.useZeal} onChange={(e) => set({ useZeal: e.target.checked })} />
              Zeal instead of Piety (melee)
            </label>
            <label htmlFor="bs-fragments" className="flex items-center gap-1" title="+2 base max hit for elemental spells; only affects spell presets">
              <input
                id="bs-fragments"
                type="checkbox"
                checked={value.elementalFragments}
                onChange={(e) => set({ elementalFragments: e.target.checked })}
              />
              Elemental fragments (magic)
            </label>
          </>
        )}
        <label htmlFor="bs-fight" className="flex items-center gap-1" title="Fight length for the spec-energy budget: 100% + 10% per 30 s (15 s with Lightbearer). Rough default until the phase 16 time model.">
          Fight length
          <input
            id="bs-fight"
            type="number"
            className="form-control text-xs py-0.5 w-16"
            min={0}
            value={value.fightSeconds}
            onChange={(e) => set({ fightSeconds: Math.max(0, Number(e.target.value) || 0) })}
          />
          s
        </label>
        <label htmlFor="bs-threshold" className="flex items-center gap-1" title="A drain plan counts as reaching the Defence floor (and is ranked there) when P(floor) is at least this">
          Floor at P ≥
          <input
            id="bs-threshold"
            type="number"
            className="form-control text-xs py-0.5 w-14"
            min={1}
            max={100}
            value={Math.round(value.floorThreshold * 100)}
            onChange={(e) => set({ floorThreshold: Math.min(100, Math.max(1, Number(e.target.value) || 95)) / 100 })}
          />
          %
        </label>
        <button type="button" className="underline" onClick={() => onChange(raid.defaultAssumptions)}>Reset</button>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-2 items-center" data-testid="my-specs">
        <span className="font-semibold" title="Solo drain state: only these weapons, within your own spec energy">My specs:</span>
        {MY_SPEC_WEAPONS.map(([k, label]) => (
          <label key={k} htmlFor={`bs-my-${k}`} className="flex items-center gap-1">
            <input
              id={`bs-my-${k}`}
              type="checkbox"
              checked={value.mySpecs[k]}
              onChange={(e) => set({ mySpecs: { ...value.mySpecs, [k]: e.target.checked } })}
            />
            {label}
          </label>
        ))}
        <label htmlFor="bs-ayak" className="flex items-center gap-1" title="Eye of Ayak specs (mine): drain = specs × hit chance × expected damage on a hit, from the calculator">
          Ayak ×
          <input
            id="bs-ayak"
            type="number"
            className="form-control text-xs py-0.5 w-12"
            min={0}
            max={10}
            value={value.mySpecs.ayak}
            onChange={(e) => set({ mySpecs: { ...value.mySpecs, ayak: Math.min(10, Math.max(0, Math.floor(Number(e.target.value) || 0))) } })}
          />
          {ayakHint && <span className="text-gray-500 dark:text-gray-400" data-testid="ayak-hint">{ayakHint}</span>}
        </label>
        <label htmlFor="bs-my-lightbearer" className="flex items-center gap-1" title="Lightbearer doubles spec regeneration (10% per 15 s)">
          <input
            id="bs-my-lightbearer"
            type="checkbox"
            checked={value.mySpecs.lightbearer}
            onChange={(e) => set({ mySpecs: { ...value.mySpecs, lightbearer: e.target.checked } })}
          />
          Lightbearer
        </label>
        <label htmlFor="bs-priority" className="flex items-center gap-1" title="When the energy doesn't cover every spec">
          Energy first to
          <select
            id="bs-priority"
            className="form-control text-xs py-0.5"
            value={value.mySpecs.priority}
            onChange={(e) => set({ mySpecs: { ...value.mySpecs, priority: e.target.value as MySpecs['priority'] } })}
          >
            <option value="defence">Defence drains</option>
            <option value="ayak">Ayak</option>
          </select>
        </label>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-2 items-center" data-testid="team-specs">
        <span className="font-semibold" title="Team drain state: the carriers' first round of specs">Team:</span>
        {!scalingRow && (
          <label htmlFor="bs-party" className="flex items-center gap-1" title="Team spec planner party size; also the HP scaling party size (identity table, unverified)">
            party size
            <input
              id="bs-party"
              type="number"
              className="form-control text-xs py-0.5 w-14"
              min={2}
              max={8}
              value={value.partySize}
              onChange={(e) => set({ partySize: Math.min(8, Math.max(2, Number(e.target.value) || 2)) })}
            />
          </label>
        )}
        <span>carriers:</span>
        {TEAM_WEAPONS.map(([k, label]) => (
          <span key={k} className="flex items-center gap-1">
            <label htmlFor={`bs-team-${k}`} className="flex items-center gap-1">
              {label}
              <input
                id={`bs-team-${k}`}
                type="number"
                className="form-control text-xs py-0.5 w-12"
                min={0}
                max={8}
                value={value.team.carriers[k]}
                onChange={(e) => set({
                  team: {
                    ...value.team,
                    carriers: { ...value.team.carriers, [k]: Math.min(8, Math.max(0, Math.floor(Number(e.target.value) || 0))) },
                  },
                })}
              />
            </label>
            <label htmlFor={`bs-team-lb-${k}`} className="flex items-center" title={`${label} carriers wear Lightbearer`}>
              <input
                id={`bs-team-lb-${k}`}
                type="checkbox"
                checked={value.team.lightbearer[k]}
                onChange={(e) => set({
                  team: { ...value.team, lightbearer: { ...value.team.lightbearer, [k]: e.target.checked } },
                })}
              />
              <span className="text-[10px]">LB</span>
            </label>
          </span>
        ))}
        {carrierTotal > value.partySize && (
          <span className="text-red-600" data-testid="team-too-many">{`${carrierTotal} carriers > party size: only the first ${value.partySize} count`}</span>
        )}
      </div>
    </div>
  );
};

const tabClass = (active: boolean) => `px-3 py-1 rounded text-sm border ${active
  ? 'bg-orange-400 dark:bg-orange-700 text-white border-orange-500'
  : 'bg-btns-400 dark:bg-dark-500 text-white border-transparent hover:bg-btns-300 dark:hover:bg-dark-200'}`;

/**
 * One raid's view (remounted on a raid change; the raid's assumptions live in the page). The searches run in their own
 * worker (src/worker/searchWorker.ts), so the main calculator isn't affected.
 */
const RaidBestSetup: React.FC<{
  raid: RaidConfig,
  assumptions: BestSetupAssumptions,
  setAssumptions: (a: BestSetupAssumptions) => void,
  raidTabs: React.ReactNode,
}> = ({
  raid, assumptions, setAssumptions, raidTabs,
}) => {
  const [mode, setMode] = useState<'summary' | 'search' | 'routes' | 'plan'>('search');
  const [targetKey, setTargetKey] = useState(raid.targets[0].key);
  const [phase, setPhase] = useState<string | undefined>(undefined);
  const [drain, setDrain] = useState<DrainStateId>('team');

  const target = useMemo(() => findTarget(targetKey), [targetKey]);
  const phases = useMemo(() => targetPhases(target), [target]);
  const ayakHint = useMemo(() => {
    if (mode !== 'search') return undefined;
    const { monster } = buildTargetMonster(target, phase ?? phases[0], 'none', assumptions);
    const model = drainModel(monster, assumptions);
    const profile = specProfile(monster, 'ayak', undefined, assumptions);
    if (!profile.canHit) return `(can't hit ${target.label})`;
    const drained = ayakExpectedDrain(profile, assumptions.mySpecs.ayak, model.magicDef);
    return `≈ ${drained.toFixed(0)} magic def drained on ${target.label} (of ${model.magicDef}; ${(profile.hitChance * 100).toFixed(0)}% × ${profile.expectedDamageOnHit.toFixed(1)} per spec)`;
  }, [mode, target, phase, phases, assumptions]);
  // the boss's hp as the calculator scales it (party size, ToA raid / path levels)
  const targetHp = useMemo(() => {
    if (mode !== 'search') return undefined;
    return scaleMonster(buildTargetMonster(target, phase ?? phases[0], 'none', assumptions).monster).skills.hp;
  }, [mode, target, phase, phases, assumptions]);

  const drainButtons = (
    <div className="flex gap-1 items-center text-sm" title={DRAIN_STATES.find((s) => s.id === drain)?.description}>
      Drains
      {DRAIN_STATES.map((s) => (
        <button
          key={s.id}
          type="button"
          className={tabClass(drain === s.id)}
          title={s.description}
          data-testid={`drain-${s.id}`}
          onClick={() => setDrain(s.id)}
        >
          {s.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="max-w-[1420px] mx-auto mt-4 mb-8 px-2">
      <div className="sm:rounded shadow-lg bg-tile dark:bg-dark-300">
        <div className="px-4 py-3.5 border-b-body-400 bg-body-100 dark:bg-dark-400 dark:border-b-dark-200 border-b sm:rounded-t flex flex-wrap gap-2 justify-between items-center">
          <h2 className="font-serif text-lg tracking-tight font-bold dark:text-white">{`Best setup · ${raid.name}`}</h2>
          {raidTabs}
          <div className="flex gap-1">
            <button type="button" className={tabClass(mode === 'search')} onClick={() => setMode('search')} data-testid="search-tab">Search</button>
            <button type="button" className={tabClass(mode === 'plan')} onClick={() => setMode('plan')} data-testid="plan-tab">Plan</button>
            <button type="button" className={tabClass(mode === 'routes')} onClick={() => setMode('routes')} data-testid="routes-tab">{raid.routesLabel}</button>
            <button type="button" className={tabClass(mode === 'summary')} onClick={() => setMode('summary')} data-testid="summary-tab">Summary</button>
          </div>
        </div>
        <div className="p-4 flex flex-col gap-3 dark:text-body-200">
          <AssumptionsBox raid={raid} value={assumptions} onChange={setAssumptions} ayakHint={ayakHint} />

          {mode === 'search' && (
            <div className="flex flex-wrap gap-3 items-center">
              <label htmlFor="bs-boss" className="flex items-center gap-1 text-sm">
                Boss
                <ItemIcon key={targetKey} name={target.label} src={targetImageUrl(target)} size={24} />
                <select
                  id="bs-boss"
                  className="form-control text-sm"
                  value={targetKey}
                  data-testid="boss-select"
                  onChange={(e) => {
                    setTargetKey(e.target.value);
                    setPhase(undefined);
                  }}
                >
                  {raid.targets.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </label>
              {targetHp !== undefined && (
                <span className="text-xs text-gray-500 dark:text-gray-400" data-testid="target-hp" title="Hitpoints as the calculator scales them for these assumptions">
                  {`${targetHp} hp`}
                </span>
              )}
              {phases.length > 0 && (
                <label htmlFor="bs-phase" className="flex items-center gap-1 text-sm">
                  Phase
                  <select
                    id="bs-phase"
                    className="form-control text-sm"
                    value={phase ?? phases[0]}
                    data-testid="phase-select"
                    onChange={(e) => setPhase(e.target.value)}
                  >
                    {phases.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </label>
              )}
              {drainButtons}
            </div>
          )}

          {mode === 'search' && (
            <SpecPlanPanel
              targetKey={targetKey}
              phase={phase ?? phases[0]}
              drain={drain}
              assumptions={assumptions}
            />
          )}

          {mode === 'search' && (
            <SearchView
              targetKey={targetKey}
              phase={phase ?? phases[0]}
              drain={drain}
              assumptions={assumptions}
            />
          )}
          {mode === 'summary' && <SummaryView assumptions={assumptions} targets={raid.targets} />}
          {mode === 'plan' && drainButtons}
          {mode === 'plan' && <PlanView assumptions={assumptions} drain={drain} raid={raid} />}
          {mode === 'routes' && drainButtons}
          {mode === 'routes' && <RoutesView assumptions={assumptions} drain={drain} raid={raid} />}

          <div className="text-[11px] text-gray-500 dark:text-gray-400">
            {`Same calculation as the main calculator. ${raid.hpNote} Prayers: ${Object.values(GROUP_PRAYER).join(' / ')}. See docs/BEST_SETUP.md for caveats.`}
          </div>
        </div>
      </div>
    </div>
  );
};

/** /best-setup: raid tabs, each raid with its own assumptions (kept while switching tabs). */
const BestSetup: React.FC = () => {
  const [raidId, setRaidId] = useState<RaidId>(RAIDS[0].id);
  const [assumptionsBy, setAssumptionsBy] = useState<Record<string, BestSetupAssumptions>>(
    () => Object.fromEntries(RAIDS.map((r) => [r.id, r.defaultAssumptions])),
  );
  const raid = raidConfig(raidId);
  const raidTabs = (
    <div className="flex gap-1" data-testid="raid-tabs">
      {RAIDS.map((r) => (
        <button
          key={r.id}
          type="button"
          className={tabClass(r.id === raidId)}
          onClick={() => setRaidId(r.id)}
          data-testid={`raid-tab-${r.id}`}
        >
          {r.shortName}
        </button>
      ))}
    </div>
  );
  return (
    <RaidBestSetup
      key={raid.id}
      raid={raid}
      assumptions={assumptionsBy[raid.id]}
      setAssumptions={(a) => setAssumptionsBy((m) => ({ ...m, [raid.id]: a }))}
      raidTabs={raidTabs}
    />
  );
};

export default BestSetup;
