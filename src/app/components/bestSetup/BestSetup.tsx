'use client';

import React, {
  useCallback, useEffect, useMemo, useState,
} from 'react';
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
  BestSetupAssumptions, carriersUseLightbearer, ItemRef, MySpecs, StyleGroup, TeamSpecAssumptions, withCarrierLightbearer, withPlanCarriers,
} from '@/lib/fracturedArchive/presets';
import { scaleMonster } from '@/lib/MonsterScaling';
import {
  RaidConfig, RaidId, RAIDS, raidConfig, teamDpsMultiplier, teamTimeLabel, TimeSettings, visibleTargets, withScalingInput,
} from '@/lib/raids';
import {
  ayakExpectedDrain, drainModel, SPEC_WEAPONS, specProfile,
} from '@/lib/fracturedArchive/specs';
import { resolveItem } from '@/lib/fracturedArchive/loadout';
import SpecPlanPanel from '@/app/components/bestSetup/SpecPlanPanel';
import SearchView from '@/app/components/bestSetup/SearchView';
import SummaryView from '@/app/components/bestSetup/SummaryView';
import PlanView, { LightbearerLock } from '@/app/components/bestSetup/PlanView';
import TimeSettingsBox from '@/app/components/bestSetup/TimeSettingsBox';
import { equipmentImageUrl, targetImageUrl } from '@/lib/fracturedArchive/loadoutIcons';
import { ItemIcon } from '@/app/components/bestSetup/ItemIcons';
import NotOwnedBox from '@/app/components/bestSetup/NotOwnedBox';
import {
  loadNotOwned, loadOnlyOwned, saveNotOwned, saveOnlyOwned,
} from '@/lib/fracturedArchive/ownership';

// Fractured Archive "Best setup" view (phase 8; "Search" tab phase 9). Phase 12: Search is the default tab; item icons.
// Phase 13: the "Per boss" preset table was removed (the presets still seed the search and give the "vs best preset"
// column); Summary is search-based (SummaryView.tsx). Phase 16: "Routes" tab (RoutesView.tsx, raid time model).
// Phase 17: "Plan" tab (PlanView.tsx, kit planner), second tab: Search, Plan, Routes, Summary.
// Phase 18: raid tabs (Fractured Archive, Tombs of Amascut; src/lib/raids) at the top; each raid keeps its own
// assumptions, and the tabs below work from that raid's config.
// Phase 23: simple view + Advanced expander; the Routes / Encounters tab is merged into Plan (tabs: Search, Plan,
// Summary); no fight-length input (computed per boss, bestSetup.ts autoFightSeconds).
// Phase 26: "Items I don't own" (NotOwnedBox.tsx, global for every raid tab, kept in localStorage).
// Phase 29: "My specs" → "Specs I bring" (Search / Summary Solo drains; the Plan tab's manual override); Lightbearer is
// an "I wear a Lightbearer" ring toggle, which the Plan tab's ring policy sets while the Plan tab is open.
// Docs: docs/BEST_SETUP.md.

const POTION_OPTIONS = (Object.keys(PotionMap) as unknown as string[])
  .map((k) => Number(k) as Potion)
  .sort((a, b) => PotionMap[a].order - PotionMap[b].order);

const HEART_POTIONS = [Potion.SATURATED_HEART, Potion.IMBUED_HEART];

const GROUP_PRAYER: Record<StyleGroup, string> = { melee: 'Piety', ranged: 'Rigour', magic: 'Augury' };

type MyWeapon = 'elderMaul' | 'dwh' | 'bgs' | 'tonalztics';
const MY_SPEC_WEAPONS: MyWeapon[] = ['elderMaul', 'dwh', 'bgs', 'tonalztics'];
type TeamWeapon = keyof TeamSpecAssumptions['carriers'];
const TEAM_WEAPONS: TeamWeapon[] = ['elderMaul', 'dwh', 'bgs', 'tonalztics', 'ayak'];

/** Icon of a spec weapon / Lightbearer (equipment.json image), or null. */
const itemImage = (ref: ItemRef): string | null => {
  try {
    return equipmentImageUrl(resolveItem(ref).image);
  } catch {
    return null;
  }
};
const LIGHTBEARER = 'Lightbearer';

/** Phase 23: the "?" glossary (plain-language meaning of the terms on this page). */
export const GLOSSARY: [string, string][] = [
  ['Drains', 'None: no Defence / Magic defence drains. Solo: only your own specs ("Specs I bring"; in the Plan tab the planner picks them), within the spec energy you have in that fight. Team: the team\'s spec carriers (Advanced) each spec twice at the start.'],
  ['Needed / team brings', 'Team drain line: "needed ×2 (4 hits)" = the specs that reach the floor if every one lands; "team brings ×4" = the specs the carriers do in the first round (2 each).'],
  ['Floor', 'The lowest Defence a boss can be drained to (e.g. Archive Guardian 156). The Defence floor is used when its chance is at least the % set in Advanced (95%).'],
  ['First round', 'The specs everyone does at the start of the fight with full (100%) energy: 2 specs each for 50% weapons.'],
  ['Hit chance', 'The "77% land" under each drain icon: the chance one spec lands its drain (from the calculator, against the undrained boss). "×0 (no energy)": specs you asked for that your spec energy doesn\'t cover.'],
  ['Fight length (computed)', 'The boss\'s time to kill without drains, using the best preset, with the whole party at your DPS. It sets your Solo spec energy (shown as "fight ≈ N s → M specs"); the Plan tab uses each encounter\'s own time.'],
  ['Players assumed at your DPS', 'How many players are assumed to deal your DPS when HP is turned into time (Advanced). Fractured Archive: 1 (how its HP scales with party size is unknown, so times are you alone); ToA / CoX / ToB: the party size (their HP scales with it).'],
  ['Carriers', 'Teammates who bring a drain weapon and spec it at the start (Team drains). The party size above is shared; carriers beyond it don\'t count.'],
];

const Glossary: React.FC = () => {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative">
      <button
        type="button"
        className="w-5 h-5 rounded-full border border-body-500 dark:border-dark-200 text-xs font-bold"
        title="What do these terms mean?"
        aria-expanded={open}
        data-testid="glossary-button"
        onClick={() => setOpen(!open)}
      >
        ?
      </button>
      {open && (
        <div className="absolute z-20 right-0 mt-1 w-[340px] max-w-[90vw] p-2 rounded shadow-lg bg-white dark:bg-dark-500 border border-body-400 dark:border-dark-200 text-xs flex flex-col gap-1" data-testid="glossary">
          {GLOSSARY.map(([term, text]) => (
            <div key={term}>
              <span className="font-semibold">{`${term}: `}</span>
              {text}
            </div>
          ))}
          <button type="button" className="underline self-end" onClick={() => setOpen(false)}>close</button>
        </div>
      )}
    </span>
  );
};

/** An icon toggle button (pressed = on). */
const IconToggle: React.FC<{
  id: string, label: string, src: string | null, on: boolean, onChange: (on: boolean) => void, title: string,
}> = ({
  id, label, src, on, onChange, title,
}) => (
  <button
    type="button"
    id={id}
    aria-pressed={on}
    aria-label={label}
    title={`${title} (${on ? 'on' : 'off'}; click to toggle)`}
    data-testid={id}
    className={`flex items-center gap-1 px-1.5 py-0.5 rounded border ${on
      ? 'border-orange-500 bg-orange-100 dark:bg-orange-900/40'
      : 'border-body-400 dark:border-dark-200 opacity-50 grayscale'}`}
    onClick={() => onChange(!on)}
  >
    <ItemIcon name={label} src={src} size={20} title={label} />
    <span>{label}</span>
  </button>
);

const ScalingInputs: React.FC<{
  raid: RaidConfig,
  value: BestSetupAssumptions,
  onChange: (a: BestSetupAssumptions) => void,
}> = ({ raid, value, onChange }) => (
  <div className="flex flex-wrap gap-x-4 gap-y-2 items-center" data-testid="scaling-inputs">
    <span className="font-semibold">Raid:</span>
    {raid.scalingInputs.map((d) => {
      const id = d.key === 'partySize' ? 'bs-party' : `bs-scale-${d.key}`;
      if (d.kind === 'bool') {
        return (
          <label key={d.key} htmlFor={id} className="flex items-center gap-1" title={d.title}>
            <input
              id={id}
              type="checkbox"
              checked={d.get(value) > 0}
              data-testid={`scaling-${d.key}`}
              onChange={(e) => onChange(withScalingInput(value, d, e.target.checked ? 1 : 0))}
            />
            {d.label}
          </label>
        );
      }
      if (d.kind === 'select') {
        return (
          <label key={d.key} htmlFor={id} className="flex items-center gap-1" title={d.title}>
            {d.label}
            <select
              id={id}
              className="form-control text-xs py-0.5"
              value={d.get(value)}
              data-testid={`scaling-${d.key}`}
              onChange={(e) => onChange(withScalingInput(value, d, Number(e.target.value)))}
            >
              {(d.options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        );
      }
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
            value={d.get(value)}
            data-testid={`scaling-${d.key}`}
            onChange={(e) => onChange(withScalingInput(value, d, Number(e.target.value)))}
          />
        </label>
      );
    })}
  </div>
);

/**
 * Phase 23: the assumptions box. Simple view: raid scaling, potions / heart, Zeal, fragments, "Specs I bring" (phase 29; was "My specs") as icon
 * toggles + Lightbearer. Everything else under "Advanced" (team carriers, floor confidence, team-DPS multiplier,
 * energy priority, the Plan tab's time model).
 */
const AssumptionsBox: React.FC<{
  raid: RaidConfig,
  value: BestSetupAssumptions,
  onChange: (a: BestSetupAssumptions) => void,
  /** e.g. "≈ 40 magic def drained on Bork" for the selected boss (phase 14). */
  ayakHint?: string,
  timeSettings: TimeSettings,
  onTimeSettings: (s: TimeSettings) => void,
  notOwned: string[],
  onNotOwned: (names: string[]) => void,
  /** Phase 29: set while the Plan tab's ring policy decides the ring (camp Lightbearer / camp one ring). */
  lightbearerLock?: LightbearerLock | null,
  /** Phase 29 review 2: the last plan's carriers (shown in the disabled counts while the planner decides). */
  planCarriers?: TeamSpecAssumptions['carriers'] | null,
}> = ({
  raid, value, onChange, ayakHint, timeSettings, onTimeSettings, notOwned, onNotOwned, lightbearerLock, planCarriers,
}) => {
  const set = (patch: Partial<BestSetupAssumptions>) => onChange({ ...value, ...patch });
  const carrierTotal = Object.values(value.team.carriers).reduce((t, n) => t + n, 0);
  const mult = teamDpsMultiplier(value);
  return (
    <div className="text-xs bg-body-100 dark:bg-dark-400 border border-body-400 dark:border-dark-200 rounded p-3 flex flex-col gap-2" data-testid="assumptions">
      <div className="flex items-center gap-2">
        <span className="font-bold text-sm">Assumptions</span>
        <span className="text-gray-500 dark:text-gray-400" title={raid.raidOnlyAssumptions ? 'Items per preset: src/lib/fracturedArchive/presets.ts' : raid.presetsNote}>
          {`All skills 99 · ${raid.raidOnlyAssumptions ? 'Piety (or Zeal)' : 'Piety'} / Rigour / Augury by style`}
        </span>
        <span className="flex-1" />
        <button type="button" className="underline" title="Back to this raid's defaults (every input, Advanced included)" onClick={() => onChange(raid.defaultAssumptions)}>Reset</button>
        <Glossary />
      </div>
      <ScalingInputs raid={raid} value={value} onChange={onChange} />
      <div className="flex flex-wrap gap-x-4 gap-y-2 items-center">
        {(['melee', 'ranged', 'magic'] as StyleGroup[]).map((g) => {
          // where the potions are brought (FA, ToB) the magic boost is a heart (phase 31: the Plan tab's kit potion for magic)
          const heart = g === 'magic' && raid.boostsNeedSupplies;
          const options = heart ? POTION_OPTIONS.filter((p) => HEART_POTIONS.includes(p) || p === value.potions[g]) : POTION_OPTIONS;
          return (
            <label
              key={g}
              htmlFor={`bs-potion-${g}`}
              className="flex items-center gap-1"
              title={heart
                ? 'Magic boost. Search and Summary assume this heart is brought; the Plan tab brings it (the magic potion of the kit) when the kit has a magic loadout, one slot'
                : `Boost used by every ${g} setup`}
            >
              <span className={heart ? '' : 'capitalize'}>{heart ? 'Heart' : `${g} potion`}</span>
              <select
                id={`bs-potion-${g}`}
                className="form-control text-xs py-0.5"
                value={value.potions[g]}
                onChange={(e) => set({ potions: { ...value.potions, [g]: Number(e.target.value) as Potion } })}
              >
                {options.map((p) => <option key={p} value={p}>{PotionMap[p].name}</option>)}
              </select>
            </label>
          );
        })}
        {raid.raidOnlyAssumptions && (
          <>
            <label htmlFor="bs-zeal" className="flex items-center gap-1" title="Melee setups pray Zeal (the Fractured Archive prayer) instead of Piety">
              <input id="bs-zeal" type="checkbox" checked={value.useZeal} onChange={(e) => set({ useZeal: e.target.checked })} />
              Zeal instead of Piety
            </label>
            <label htmlFor="bs-fragments" className="flex items-center gap-1" title="All four elemental fragments unlocked: +2 base max hit for elemental spells (magic setups only)">
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
      </div>
      <div className="flex flex-wrap gap-x-2 gap-y-2 items-center" data-testid="my-specs">
        <span className="font-semibold" title="The drain weapons you bring yourself: the Solo drain state (Search, Summary) uses only these, within your own spec energy. The Plan tab picks the spec weapons itself unless its &quot;Spec weapons&quot; is set to &quot;Specs I bring&quot;">Specs I bring:</span>
        {MY_SPEC_WEAPONS.map((k) => (
          <IconToggle
            key={k}
            id={`bs-my-${k}`}
            label={SPEC_WEAPONS[k].label}
            src={itemImage(SPEC_WEAPONS[k].item)}
            on={value.mySpecs[k]}
            title={`I bring ${SPEC_WEAPONS[k].label}`}
            onChange={(on) => set({ mySpecs: { ...value.mySpecs, [k]: on } })}
          />
        ))}
        <label
          htmlFor="bs-ayak"
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded border ${value.mySpecs.ayak > 0 ? 'border-orange-500 bg-orange-100 dark:bg-orange-900/40' : 'border-body-400 dark:border-dark-200'}`}
          title="Eye of Ayak specs I do (0 = I don't bring it): each lowers the boss's Magic defence by the damage dealt"
        >
          <ItemIcon name="Eye of Ayak" src={itemImage(SPEC_WEAPONS.ayak.item)} size={20} />
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
        </label>
        {ayakHint && <span className="text-gray-500 dark:text-gray-400" data-testid="ayak-hint">{ayakHint}</span>}
      </div>
      <div className="flex flex-wrap gap-x-2 gap-y-2 items-center" data-testid="ring-toggle">
        <span className="font-semibold" title="Your ring (Solo spec energy): Lightbearer makes spec energy come back twice as fast">Ring:</span>
        {lightbearerLock ? (
          <span
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded border border-dashed ${lightbearerLock.on ? 'border-orange-500 bg-orange-100 dark:bg-orange-900/40' : 'border-body-400 dark:border-dark-200 opacity-60 grayscale'}`}
            data-testid="bs-my-lightbearer"
            aria-pressed={lightbearerLock.on}
            data-locked="true"
            title={`Set by the Plan tab's ring policy: ${lightbearerLock.reason}`}
          >
            <ItemIcon name="Lightbearer" src={itemImage(LIGHTBEARER)} size={20} />
            {`I wear a Lightbearer: ${lightbearerLock.on ? 'yes' : 'no'}`}
            <span className="text-gray-500 dark:text-gray-400" data-testid="lightbearer-lock">{`(${lightbearerLock.reason})`}</span>
          </span>
        ) : (
          <IconToggle
            id="bs-my-lightbearer"
            label="I wear a Lightbearer"
            src={itemImage(LIGHTBEARER)}
            on={value.mySpecs.lightbearer}
            title="I wear Lightbearer: spec energy comes back twice as fast (10% per 15 s) for the Solo drains"
            onChange={(on) => set({ mySpecs: { ...value.mySpecs, lightbearer: on } })}
          />
        )}
      </div>
      <NotOwnedBox value={notOwned} onChange={onNotOwned} />
      <details data-testid="advanced">
        <summary className="cursor-pointer font-semibold" data-testid="advanced-toggle">Advanced</summary>
        <div className="flex flex-col gap-2 mt-2 pl-2 border-l-2 border-body-400 dark:border-dark-200">
          <div className="flex flex-wrap gap-x-3 gap-y-2 items-center" data-testid="team-specs">
            <span className="font-semibold" title="Team drain state: teammates who bring a drain weapon spec twice each at the start of every fight">
              {`Team carriers (party of ${value.partySize}, set above):`}
            </span>
            <select
              id="bs-team-mode"
              className="form-control text-xs py-0.5"
              value={value.team.manual ? 'manual' : 'auto'}
              data-testid="team-carrier-mode"
              title="Planner decides: the Plan tab picks the carriers (the ones that save the most route time) and its Team drains use them; Search and Summary use the counts here. Set manually: every tab uses the counts here"
              onChange={(e) => set({ team: { ...value.team, manual: e.target.value === 'manual' } })}
            >
              <option value="auto">Planner decides (Plan tab)</option>
              <option value="manual">Set manually</option>
            </select>
            {TEAM_WEAPONS.map((k) => (
              <label key={k} htmlFor={`bs-team-${k}`} className="flex items-center gap-1" title={`How many teammates bring ${SPEC_WEAPONS[k].label} and spec it at the start`}>
                <ItemIcon name={SPEC_WEAPONS[k].label} src={itemImage(SPEC_WEAPONS[k].item)} size={18} />
                <span className="sr-only">{SPEC_WEAPONS[k].label}</span>
                <input
                  id={`bs-team-${k}`}
                  type="number"
                  disabled={!value.team.manual}
                  className="form-control text-xs py-0.5 w-12 disabled:opacity-50"
                  min={0}
                  max={8}
                  value={(!value.team.manual && planCarriers ? planCarriers : value.team.carriers)[k]}
                  onChange={(e) => set({
                    team: {
                      ...value.team,
                      carriers: { ...value.team.carriers, [k]: Math.min(8, Math.max(0, Math.floor(Number(e.target.value) || 0))) },
                    },
                  })}
                />
              </label>
            ))}
            <label htmlFor="bs-team-lightbearer" className="flex items-center gap-1" title="Every carrier wears Lightbearer (spec energy back twice as fast). Only changes the whole-fight figures: the ranking uses the first round, done with full energy">
              <input
                id="bs-team-lightbearer"
                type="checkbox"
                checked={carriersUseLightbearer(value.team)}
                onChange={(e) => set({ team: withCarrierLightbearer(value.team, e.target.checked) })}
              />
              carriers use Lightbearer
            </label>
            {!value.team.manual && (
              <span className="text-gray-500 dark:text-gray-400" data-testid="team-carriers-note">
                {planCarriers ? '(from the last plan; Search / Summary use them)' : '(run a plan to fill these; until then Search / Summary use the counts shown)'}
              </span>
            )}
            {value.team.manual && carrierTotal > value.partySize && (
              <span className="text-red-600" data-testid="team-too-many">{`${carrierTotal} carriers > party size: only the first ${value.partySize} count`}</span>
            )}
          </div>
          <label htmlFor="bs-threshold" className="flex items-center gap-1" title="Drain plans are ranked at the Defence floor only when they are this likely to get there (Team: from the first round of specs; Solo: with your specs). Below it, the ranking uses the Defence you can expect on average">
            Use the Defence floor when its chance is ≥
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
          <label htmlFor="bs-team-mult" className="flex items-center gap-1" title="HP is turned into time as HP ÷ (this × your DPS). The Fractured Archive defaults to 1 because how its HP scales with party size is unknown (times are you alone); ToA / CoX / ToB default to the party size because their HP scales with it">
            Players assumed at your DPS when converting HP to time
            <input
              id="bs-team-mult"
              type="number"
              className="form-control text-xs py-0.5 w-14"
              min={1}
              max={raid.partySize.max}
              step={0.5}
              value={mult}
              data-testid="team-dps-mult"
              onChange={(e) => set({ teamDpsMultiplier: Math.min(raid.partySize.max, Math.max(1, Number(e.target.value) || 1)) })}
            />
            {value.teamDpsMultiplier !== undefined && (
              <button type="button" className="underline" onClick={() => set({ teamDpsMultiplier: undefined })}>auto</button>
            )}
            <span className="text-gray-500 dark:text-gray-400" data-testid="team-time-label">{`(${teamTimeLabel(mult)})`}</span>
          </label>
          <label htmlFor="bs-priority" className="flex items-center gap-1" title="Solo: when your spec energy doesn't cover every spec, which ones are done first">
            Spec energy goes first to
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
          <TimeSettingsBox raid={raid} value={timeSettings} onChange={onTimeSettings} />
        </div>
      </details>
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
  notOwned: string[],
  setNotOwned: (names: string[]) => void,
  onlyOwned: boolean,
  setOnlyOwned: (on: boolean) => void,
}> = ({
  raid, assumptions, setAssumptions, raidTabs, notOwned, setNotOwned, onlyOwned, setOnlyOwned,
}) => {
  const [mode, setMode] = useState<'summary' | 'search' | 'plan'>('search');
  // phase 23: the time-model settings live in the Advanced box (they were the Routes tab's); the Plan tab uses them
  const [timeSettings, setTimeSettings] = useState<TimeSettings>(raid.defaultTimeSettings);
  const [chosenKey, setTargetKey] = useState(raid.targets[0].key);
  const [phase, setPhase] = useState<string | undefined>(undefined);
  const [chosenDrain, setDrain] = useState<DrainStateId>('team');
  // phase 29: a party of 1 has no team: Team drains become Solo (your own specs)
  const soloParty = assumptions.partySize <= 1;
  const drain: DrainStateId = soloParty && chosenDrain === 'team' ? 'solo' : chosenDrain;
  // phase 29: the Plan tab's ring policy sets the Lightbearer flag while the Plan tab is open
  const [planLightbearer, setPlanLightbearer] = useState<LightbearerLock | null>(null);
  // phase 29 review 2: the last plan's carriers ("Planner decides"); Search / Summary use them
  const [planCarriers, setPlanCarriers] = useState<TeamSpecAssumptions['carriers'] | null>(null);
  const searchA = useMemo(() => withPlanCarriers(assumptions, planCarriers), [assumptions, planCarriers]);

  // phase 21: the boss list follows the raid inputs (ToB: Prinkipas only in Hard Mode); a hidden pick falls back to the first
  const bossList = useMemo(() => visibleTargets(raid, assumptions), [raid, assumptions]);
  const targetKey = bossList.some((t) => t.key === chosenKey) ? chosenKey : bossList[0].key;
  const target = useMemo(() => findTarget(targetKey), [targetKey]);
  const phases = useMemo(() => targetPhases(target), [target]);
  const ayakHint = useMemo(() => {
    if (mode !== 'search') return undefined;
    const { monster } = buildTargetMonster(target, phase ?? phases[0], 'none', searchA);
    const model = drainModel(monster, searchA);
    const profile = specProfile(monster, 'ayak', undefined, searchA);
    if (!profile.canHit) return `(can't hit ${target.label})`;
    // review fix: the Ayak specs that fit in your Solo spec energy (the drain line shows "×0 (no energy)" otherwise)
    const asked = searchA.mySpecs.ayak;
    const solo = buildTargetMonster(target, phase ?? phases[0], 'solo', searchA).drain;
    const fitted = solo.line?.items.find((i) => i.weapon === 'ayak')?.count ?? 0;
    const drained = ayakExpectedDrain(profile, fitted, model.magicDef);
    const fitText = fitted < asked ? `${fitted} of your ${asked} specs fit in your spec energy; ` : '';
    return `Solo: ≈ ${drained.toFixed(0)} magic def drained on ${target.label} (${fitText}of ${model.magicDef}; each spec lands ${(profile.hitChance * 100).toFixed(0)}% of the time and drains ≈ ${profile.expectedDamageOnHit.toFixed(1)} when it does)`;
  }, [mode, target, phase, phases, searchA]);
  // the boss's hp and (undrained) Defence as the calculator scales them (party size, ToA raid / path levels, CoX CM)
  const targetStats = useMemo(() => {
    if (mode !== 'search') return undefined;
    return scaleMonster(buildTargetMonster(target, phase ?? phases[0], 'none', assumptions).monster).skills;
  }, [mode, target, phase, phases, assumptions]);
  const targetHp = targetStats?.hp;

  const drainButtons = (
    <div className="flex gap-1 items-center text-sm" title={DRAIN_STATES.find((s) => s.id === drain)?.description}>
      Drains
      {DRAIN_STATES.map((s) => (
        <button
          key={s.id}
          type="button"
          className={`${tabClass(drain === s.id)} disabled:opacity-40`}
          title={soloParty && s.id === 'team' ? 'A party of 1 has no team: Solo drains (your own specs)' : s.description}
          data-testid={`drain-${s.id}`}
          disabled={soloParty && s.id === 'team'}
          onClick={() => setDrain(s.id)}
        >
          {s.label}
        </button>
      ))}
      {soloParty && chosenDrain === 'team' && <span className="text-xs text-gray-500 dark:text-gray-400" data-testid="drain-solo-party">(party of 1: Solo)</span>}
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
            <button type="button" className={tabClass(mode === 'summary')} onClick={() => setMode('summary')} data-testid="summary-tab">Summary</button>
          </div>
        </div>
        <div className="p-4 flex flex-col gap-3 dark:text-body-200">
          <AssumptionsBox
            raid={raid}
            value={assumptions}
            onChange={setAssumptions}
            ayakHint={ayakHint}
            timeSettings={timeSettings}
            onTimeSettings={setTimeSettings}
            notOwned={notOwned}
            onNotOwned={setNotOwned}
            lightbearerLock={mode === 'plan' ? planLightbearer : null}
            planCarriers={planCarriers}
          />

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
                  {bossList.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </label>
              {targetHp !== undefined && (
                <span className="text-xs text-gray-500 dark:text-gray-400" data-testid="target-hp" title="Hitpoints as the calculator scales them for these assumptions">
                  {`${targetHp} hp`}
                </span>
              )}
              {targetStats !== undefined && (
                <span className="text-xs text-gray-500 dark:text-gray-400" data-testid="target-def" title="Defence level as the calculator scales it, before drains">
                  {`Def ${targetStats.def}`}
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
              assumptions={searchA}
            />
          )}

          {mode === 'search' && (
            <SearchView
              targetKey={targetKey}
              phase={phase ?? phases[0]}
              drain={drain}
              assumptions={searchA}
              notOwned={notOwned}
              onlyOwned={onlyOwned}
              setOnlyOwned={setOnlyOwned}
            />
          )}
          {mode === 'summary' && (
            <SummaryView
              assumptions={searchA}
              targets={raid.targets}
              notOwned={notOwned}
              onlyOwned={onlyOwned}
              setOnlyOwned={setOnlyOwned}
            />
          )}
          {mode === 'plan' && drainButtons}
          {mode === 'plan' && <PlanView assumptions={assumptions} drain={drain} raid={raid} timeSettings={timeSettings} notOwned={notOwned} onLightbearer={setPlanLightbearer} onCarriers={setPlanCarriers} />}

          <div className="text-[11px] text-gray-500 dark:text-gray-400">
            {`Same calculation as the main calculator. ${raid.hpNote} ${teamTimeLabel(teamDpsMultiplier(assumptions))}. Prayers: ${Object.values(GROUP_PRAYER).join(' / ')}. See docs/BEST_SETUP.md for caveats.`}
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
  // phase 26: global, kept in localStorage (read after mount: the page is a static export)
  const [notOwned, setNotOwnedState] = useState<string[]>([]);
  const [onlyOwned, setOnlyOwnedState] = useState(false);
  useEffect(() => {
    setNotOwnedState(loadNotOwned());
    setOnlyOwnedState(loadOnlyOwned());
  }, []);
  const setNotOwned = useCallback((names: string[]) => {
    setNotOwnedState(names);
    saveNotOwned(names);
  }, []);
  const setOnlyOwned = useCallback((on: boolean) => {
    setOnlyOwnedState(on);
    saveOnlyOwned(on);
  }, []);
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
      notOwned={notOwned}
      setNotOwned={setNotOwned}
      onlyOwned={onlyOwned}
      setOnlyOwned={setOnlyOwned}
    />
  );
};

export default BestSetup;
