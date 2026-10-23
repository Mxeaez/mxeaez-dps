'use client';

import React, {
  useCallback, useEffect, useRef, useState,
} from 'react';
import localforage from 'localforage';
import { generateEmptyPlayer, parseLoadoutsFromImportedData } from '@/state';
import { ImportableData } from '@/types/State';
import { Player } from '@/types/Player';
import Spinner from '@/app/components/Spinner';
import { DrainStateId, findTarget } from '@/lib/fracturedArchive/bestSetup';
import { BestSetupAssumptions, StyleGroup } from '@/lib/fracturedArchive/presets';
import {
  EncounterTime,
  formatDuration,
  PhaseSearchBest,
  RAID_TIME_DEFAULTS,
  RaidTimeSettings,
  RouteComparisonProgress,
  RouteComparisonResult,
} from '@/lib/fracturedArchive/raidTime';
import { RaidConfig, ToaTimeSettings } from '@/lib/raids';
import { TOA_TIME_DEFAULTS } from '@/lib/raids/toa/time';
import { RoutesJob, startRouteComparison } from '@/worker/searchWorkerClient';
import { targetImageUrl } from '@/lib/fracturedArchive/loadoutIcons';
import { ItemIcon } from '@/app/components/bestSetup/ItemIcons';
import DPS_TEXT_CLASS from '@/app/components/bestSetup/styles';

// "Routes" tab of /best-setup (phase 16): DPS-only clear time of the 8 Fractured Archive routes for a kit
// (src/lib/fracturedArchive/raidTime.ts). Everything runs in the search worker (RAID_ROUTES): the per-phase gear searches
// the kit needs, then the route times. Search results are cached in memory for the session (module scope) per
// assumptions + drain state + phase, so changing a time-model setting or the kit only re-times (a second or two).
// Docs: docs/BEST_SETUP.md (Routes tab). Phase 18: per raid (RaidConfig); a raid with one fixed route (ToA) shows it
// as "Encounters" with the per-phase breakdown open.

const searchCache = new Map<string, PhaseSearchBest[string]>();
const cachePrefix = (a: BestSetupAssumptions, drain: DrainStateId) => `${JSON.stringify(a)}|${drain}|`;

const DEBOUNCE_MS = 500;
const GROUPS: StyleGroup[] = ['melee', 'ranged', 'magic'];

/** Seconds as sent by the worker (Infinity is serialised as null). */
const secs = (v: number | null | undefined): number => (typeof v === 'number' ? v : Infinity);
const fmtS = (v: number | null | undefined) => {
  const s = secs(v);
  return Number.isFinite(s) ? `${s.toFixed(1)} s` : '∞';
};

const SETTING_FIELDS: {
  key: Exclude<keyof RaidTimeSettings, 'toa'>, label: string, unit: '%' | 's' | 'hp', title: string, max?: number,
}[] = [
  {
    key: 'agShieldHp', label: 'AG shield', unit: 'hp', title: 'Archive Guardian flying shield hp at 6 players (wiki: "1490 health shield in 6-scale", unverified), dealt at the Flying version\'s DPS; scaled by the (identity, unverified) party-size table',
  },
  {
    key: 'agGroundedFraction', label: 'AG grounded', unit: '%', title: 'Share of AG\'s 550 hp dealt while grounded; the rest at Flying DPS (it flies permanently below 30%)',
  },
  {
    key: 'borkStunUptime', label: 'Bork stun uptime', unit: '%', title: 'Share of Bork\'s damage dealt while he is stunned (heavy cannonball); the rest is split over armour 8/10/12/14. Stun length unpublished',
  },
  {
    key: 'ocellusWalkingFraction', label: 'Ocellus P1 walking', unit: '%', title: 'Share of P1\'s hp dealt while he walks to a corner (Protect from Melee)',
  },
  {
    key: 'ocellusP2Seconds', label: 'Ocellus P2 length', unit: 's', title: 'P2 (The Blade) is time-limited: its length in seconds (0 = ignore P2). The damage dealt to the Blade × carry-over comes off P3', max: 600,
  },
  {
    key: 'ocellusP2CarryOver', label: 'P2 carry-over', unit: '%', title: 'Share of the Blade damage that comes off P3 (wiki: half)',
  },
  {
    key: 'ocellusLastQuadrantFraction', label: 'Ocellus last quadrant', unit: '%', title: 'Share of P3\'s hp dealt in the last quadrant, at the Deflect option that blocks the kit\'s best style (pessimistic)',
  },
];

const TimeSettingsBox: React.FC<{ value: RaidTimeSettings, onChange: (s: RaidTimeSettings) => void }> = ({ value, onChange }) => (
  <div className="text-xs bg-body-100 dark:bg-dark-400 border border-body-400 dark:border-dark-200 rounded p-3 flex flex-col gap-2" data-testid="time-settings">
    <div className="font-bold text-sm">Assumptions (time model)</div>
    <div>
      Time = Σ damage ÷ DPS per phase, the kit&apos;s best loadout + style per phase (switching is free); no puzzles, travel,
      healing or adds. HP: infobox × party-size table (unverified). Drains (Solo / Team) are planned per encounter with
      that encounter&apos;s undrained time as the fight length.
    </div>
    <div className="flex flex-wrap gap-x-4 gap-y-2 items-center">
      {SETTING_FIELDS.map((f) => {
        const pct = f.unit === '%';
        const shown = pct ? Math.round(value[f.key] * 1000) / 10 : value[f.key];
        return (
          <label key={f.key} htmlFor={`rt-${f.key}`} className="flex items-center gap-1" title={f.title}>
            {f.label}
            <input
              id={`rt-${f.key}`}
              type="number"
              className="form-control text-xs py-0.5 w-16"
              min={0}
              max={pct ? 100 : f.max}
              value={shown}
              onChange={(e) => {
                const n = Math.max(0, Number(e.target.value) || 0);
                onChange({ ...value, [f.key]: pct ? Math.min(100, n) / 100 : n });
              }}
            />
            {f.unit}
          </label>
        );
      })}
      <button type="button" className="underline" onClick={() => onChange(RAID_TIME_DEFAULTS)}>Reset</button>
    </div>
  </div>
);

/** Phase 18: the Tombs of Amascut time-model settings (src/lib/raids/toa/time.ts). */
const ToaTimeSettingsBox: React.FC<{
  value: RaidTimeSettings, onChange: (s: RaidTimeSettings) => void, reset: RaidTimeSettings,
}> = ({ value, onChange, reset }) => {
  const toa: ToaTimeSettings = { ...TOA_TIME_DEFAULTS, ...(value.toa || {}) };
  const set = (patch: Partial<ToaTimeSettings>) => onChange({ ...value, toa: { ...toa, ...patch } });
  const pctInput = (key: 'kephriSwarmLeak' | 'p3SiphonFraction', label: string, title: string) => (
    <label htmlFor={`rt-toa-${key}`} className="flex items-center gap-1" title={title}>
      {label}
      <input
        id={`rt-toa-${key}`}
        type="number"
        className="form-control text-xs py-0.5 w-16"
        min={0}
        max={100}
        value={Math.round(toa[key] * 1000) / 10}
        onChange={(e) => set({ [key]: Math.min(100, Math.max(0, Number(e.target.value) || 0)) / 100 })}
      />
      %
    </label>
  );
  return (
    <div className="text-xs bg-body-100 dark:bg-dark-400 border border-body-400 dark:border-dark-200 rounded p-3 flex flex-col gap-2" data-testid="time-settings">
      <div className="font-bold text-sm">Assumptions (time model)</div>
      <div>
        Time = Σ damage ÷ (party size × your DPS) per phase — every member is assumed to deal your DPS — with the kit&apos;s
        best loadout + style per phase (switching is free); DPS time only (no paths, puzzles, invulnerable phases or
        healing). HP: upstream&apos;s ToA scaling (raid level, path level, party size; verified in-game). Kephri: 3 shields,
        the overlord scarabs, then her hp; Akkha: his hp + 4 shadows + 20% final stand in melee; Wardens: obelisk, P2
        downs (shield, then the core for 21/29/37 ticks, ×5 damage), P3 95% + 25% enraged.
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2 items-center">
        <label htmlFor="rt-toa-p2Warden" className="flex items-center gap-1" title="The warden fought in P2 (prays Melee + Ranged: Elidinis', Melee + Magic: Tumeken's); the other one is P3 (same stats)">
          P2 warden
          <select
            id="rt-toa-p2Warden"
            className="form-control text-xs py-0.5"
            value={toa.p2Warden}
            onChange={(e) => set({ p2Warden: e.target.value as ToaTimeSettings['p2Warden'] })}
          >
            <option value="elidinis">Elidinis&apos; (magic only)</option>
            <option value="tumeken">Tumeken&apos;s (ranged only)</option>
          </select>
        </label>
        <label htmlFor="rt-toa-akkha" className="flex items-center gap-1" title="Akkha prays against the style he attacks with: split his hp over his three prayers (the kit's best unblocked style each third). Off: always an unprotected style">
          <input id="rt-toa-akkha" type="checkbox" checked={toa.akkhaPrayerRotation} onChange={(e) => set({ akkhaPrayerRotation: e.target.checked })} />
          Akkha prayer rotation
        </label>
        <label htmlFor="rt-toa-overlords" className="flex items-center gap-1" title="Kill Kephri's overlord scarabs (Spitting, Soldier, Arcane)">
          <input id="rt-toa-overlords" type="checkbox" checked={toa.kephriOverlords} onChange={(e) => set({ kephriOverlords: e.target.checked })} />
          Kephri scarabs
        </label>
        {pctInput('kephriSwarmLeak', 'Kephri swarm leak', 'Extra Kephri shield per intermission from leaked swarms, as % of one shield (Strategies: ~10% per swarm, capped ~15% over max)')}
        {pctInput('p3SiphonFraction', 'P3 siphons', 'Share of the P3 Warden hp taken off by reversed energy siphons (unpublished; 0 = not counted)')}
        <button type="button" className="underline" onClick={() => onChange(reset)}>Reset</button>
      </div>
    </div>
  );
};

const PhaseRows: React.FC<{ e: EncounterTime }> = ({ e }) => (
  <>
    {e.phases.map((p) => (
      <tr key={`${e.id}|${p.key}`} data-testid="phase-row" data-encounter={e.id} className="text-xs border-t border-body-200 dark:border-dark-400">
        <td className="px-2 py-0.5 pl-6">{p.label}</td>
        <td className="px-2 py-0.5 text-right font-mono">{Math.round(p.damage)}</td>
        <td className="px-2 py-0.5">
          {p.choice ? (
            <>
              <span className="font-semibold">{p.choice.loadout}</span>
              <span className="text-gray-500 dark:text-gray-400">{` · ${p.choice.style}`}</span>
            </>
          ) : <span className="text-gray-500">nothing in the kit</span>}
          {p.note && <span className="text-gray-500 dark:text-gray-400">{` · ${p.note}`}</span>}
        </td>
        <td className={`px-2 py-0.5 text-right font-mono ${DPS_TEXT_CLASS}`}>{p.dps.toFixed(3)}</td>
        <td className="px-2 py-0.5 text-right font-mono" data-testid="phase-seconds">{fmtS(p.seconds)}</td>
        <td className="px-2 py-0.5 text-[10px] text-gray-500 dark:text-gray-400">{p.choice?.drain ?? ''}</td>
      </tr>
    ))}
  </>
);

const RoutesView: React.FC<{ assumptions: BestSetupAssumptions, drain: DrainStateId, raid: RaidConfig }> = ({ assumptions, drain, raid }) => {
  const PRESETS = raid.presets;
  const ROUTE_SLOTS = raid.time.routeSlots;
  const singleRoute = ROUTE_SLOTS.every((s) => s.options.length === 1);
  const [settings, setSettings] = useState<RaidTimeSettings>(raid.defaultTimeSettings);
  const [searchGroups, setSearchGroups] = useState<StyleGroup[]>(GROUPS);
  const [presets, setPresets] = useState<string[]>([]);
  const [useCalc, setUseCalc] = useState(false);
  const [calcLoadouts, setCalcLoadouts] = useState<Player[]>([]);
  const [result, setResult] = useState<RouteComparisonResult | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<RouteComparisonProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set(singleRoute ? [0] : []));
  const job = useRef<RoutesJob | null>(null);

  // the main calculator's saved loadouts (the calculator keeps its session in localforage)
  useEffect(() => {
    localforage.getItem<ImportableData>('dps-calc-state').then((saved) => {
      if (!saved?.loadouts?.length) return;
      const base = generateEmptyPlayer();
      setCalcLoadouts(parseLoadoutsFromImportedData(saved).map((p) => ({ ...base, ...p } as Player)));
    }).catch(() => { /* no saved session */ });
  }, []);

  const cancel = useCallback(() => {
    job.current?.cancel();
    job.current = null;
    setRunning(false);
    setProgress(null);
  }, []);

  const kitEmpty = !searchGroups.length && !presets.length && !(useCalc && calcLoadouts.length);

  useEffect(() => {
    cancel();
    setError(null);
    if (kitEmpty) {
      setResult(null);
      return undefined;
    }
    const timer = setTimeout(() => {
      const prefix = cachePrefix(assumptions, drain);
      const searchBest: PhaseSearchBest = {};
      searchCache.forEach((v, k) => {
        if (k.startsWith(prefix)) searchBest[k.slice(prefix.length)] = v;
      });
      setRunning(true);
      const j = startRouteComparison({
        basePlayer: generateEmptyPlayer(),
        assumptions,
        drain,
        settings,
        kit: { searchGroups, presets, players: useCalc ? calcLoadouts : [] },
        searchBest,
      }, setProgress);
      job.current = j;
      j.promise.then((r) => {
        Object.entries(r.searchBest).forEach(([k, v]) => searchCache.set(prefix + k, v));
        setResult(r);
        setRunning(false);
        setProgress(null);
        job.current = null;
      }).catch((e: Error) => {
        if (e.message !== 'cancelled') {
          setError(e.message);
          setRunning(false);
          setProgress(null);
        }
      });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      cancel();
    };
  }, [assumptions, drain, settings, searchGroups, presets, useCalc, calcLoadouts, kitEmpty, cancel]);

  const toggleGroup = (g: StyleGroup, on: boolean) => setSearchGroups((gs) => GROUPS.filter((x) => (x === g ? on : gs.includes(x))));
  const togglePreset = (n: string, on: boolean) => setPresets((ps) => PRESETS.map((p) => p.name).filter((x) => (x === n ? on : ps.includes(x))));
  const toggleExpanded = (i: number) => setExpanded((s) => {
    const n = new Set(s);
    if (n.has(i)) n.delete(i); else n.add(i);
    return n;
  });

  const fraction = progress
    ? (progress.done + (progress.search ? Math.min(0.99, progress.search.evaluations / Math.max(1, progress.search.estimate)) : 0)) / Math.max(1, progress.total)
    : 0;

  return (
    <div className="flex flex-col gap-3" data-testid="routes-view">
      {raid.id === 'toa'
        ? <ToaTimeSettingsBox value={settings} onChange={setSettings} reset={raid.defaultTimeSettings} />
        : <TimeSettingsBox value={settings} onChange={setSettings} />}

      <div className="text-xs flex flex-col gap-2" data-testid="kit">
        <div className="flex flex-wrap gap-x-3 gap-y-1 items-center">
          <span className="font-semibold" title="The loadouts you can switch between; the best one is used for every phase">Kit:</span>
          <span title="The top gear-search result of this style on each phase, under the selected drain state (one search per phase). An upper bound: it assumes a different loadout on every phase, which no inventory holds; the Plan tab finds a kit that fits in 28 slots">Best search result per phase:</span>
          {GROUPS.map((g) => (
            <label key={g} htmlFor={`rt-kit-${g}`} className="flex items-center gap-1 capitalize">
              <input id={`rt-kit-${g}`} type="checkbox" checked={searchGroups.includes(g)} onChange={(e) => toggleGroup(g, e.target.checked)} />
              {g}
            </label>
          ))}
          <label htmlFor="rt-kit-calc" className="flex items-center gap-1" title="The loadouts saved in the main calculator, as they are (their own style, prayers and potions)">
            <input id="rt-kit-calc" type="checkbox" checked={useCalc} onChange={(e) => setUseCalc(e.target.checked)} />
            {`Current calculator loadouts (${calcLoadouts.length})`}
          </label>
        </div>
        <details>
          <summary className="cursor-pointer">{`Presets (${presets.length} of ${PRESETS.length} in the kit)`}</summary>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
            {PRESETS.map((p) => (
              <label key={p.name} htmlFor={`rt-preset-${p.name}`} className="flex items-center gap-1">
                <input id={`rt-preset-${p.name}`} type="checkbox" checked={presets.includes(p.name)} onChange={(e) => togglePreset(p.name, e.target.checked)} />
                {p.name}
              </label>
            ))}
            <button type="button" className="underline" onClick={() => setPresets(PRESETS.map((p) => p.name))}>all</button>
            <button type="button" className="underline" onClick={() => setPresets([])}>none</button>
          </div>
        </details>
      </div>

      {kitEmpty && <div className="text-xs text-red-600">The kit is empty: tick at least one source.</div>}
      {running && (
        <div className="flex flex-col gap-1 text-xs" data-testid="routes-progress">
          <div className="flex items-center gap-2">
            <Spinner className="w-4" />
            {progress?.stage === 'search'
              ? `Searching ${progress.done + 1} / ${progress.total}: ${progress.label}`
              : 'Computing route times…'}
            <button type="button" className="btn text-xs" onClick={cancel} data-testid="routes-cancel">Cancel</button>
          </div>
          <div className="w-full h-2 bg-body-200 dark:bg-dark-500 rounded">
            <div className="h-2 bg-orange-400 rounded" style={{ width: `${(fraction * 100).toFixed(1)}%` }} />
          </div>
        </div>
      )}
      {error && <div className="text-red-600 text-xs">{`Error: ${error}`}</div>}

      {result && (
        <>
          <div className="text-[11px] text-gray-500 dark:text-gray-400" data-testid="routes-stats">
            {`${result.evaluations} evaluations, ${result.searches} new searches, ${(result.elapsedMs / 1000).toFixed(1)} s. `}
            {result.fastest >= 0
              ? `Fastest: ${result.routes[result.fastest].route.label} (${formatDuration(secs(result.routes[result.fastest].seconds))}).`
              : 'No route can be cleared with this kit (some phase has no loadout that deals damage).'}
          </div>
          <div className="overflow-x-auto max-w-[100vw]">
            <table className="w-full text-sm" data-testid="routes-table">
              <thead>
                <tr className="bg-btns-400 dark:bg-dark-500 text-white">
                  <th className="px-2" aria-label="expand" />
                  <th className="px-2 text-left">{singleRoute ? 'Encounters' : 'Route'}</th>
                  <th className="px-2 text-right">Total</th>
                  {ROUTE_SLOTS.map((s) => <th key={s.order} className="px-2 text-right">{`${s.order}.`}</th>)}
                </tr>
              </thead>
              <tbody>
                {result.routes.map((r, i) => {
                  const fastest = i === result.fastest;
                  const open = expanded.has(i);
                  return (
                    <React.Fragment key={r.route.id}>
                      <tr
                        data-testid="route-row"
                        data-route={r.route.id}
                        data-fastest={fastest ? 'true' : 'false'}
                        className={`border-t border-body-300 dark:border-dark-400 ${fastest ? 'bg-orange-100 dark:bg-orange-900/40 font-semibold' : ''}`}
                      >
                        <td className="px-2">
                          <button type="button" className="underline text-xs" onClick={() => toggleExpanded(i)} data-testid="route-expand">{open ? '−' : '+'}</button>
                        </td>
                        <td className="px-2 py-1">
                          {r.route.label}
                          {fastest && <span className="ml-2 text-[10px] px-1 rounded bg-orange-400 text-white" data-testid="fastest-badge">fastest</span>}
                        </td>
                        <td className={`px-2 text-right font-mono ${DPS_TEXT_CLASS}`} data-testid="route-total" title={fmtS(r.seconds)}>{formatDuration(secs(r.seconds))}</td>
                        {r.encounters.map((e) => (
                          <td key={e.id} className="px-2 py-1 text-right whitespace-nowrap" data-testid={`enc-${e.id}`} data-seconds={secs(e.seconds)}>
                            <div className="flex items-center justify-end gap-1 text-xs">
                              <ItemIcon name={e.label} src={targetImageUrl(findTarget(raid.encounterTarget[e.id]))} size={18} />
                              <span className="font-normal">{e.label}</span>
                            </div>
                            <div className="font-mono text-xs">{fmtS(e.seconds)}</div>
                          </td>
                        ))}
                      </tr>
                      {open && (
                        <tr data-testid="route-detail">
                          <td aria-label="detail" />
                          <td colSpan={2 + ROUTE_SLOTS.length} className="pb-2">
                            <table className="w-full">
                              <thead>
                                <tr className="text-[11px] text-gray-500 dark:text-gray-400">
                                  <th className="px-2 text-left">Phase</th>
                                  <th className="px-2 text-right">Damage</th>
                                  <th className="px-2 text-left">Loadout · style</th>
                                  <th className="px-2 text-right">DPS</th>
                                  <th className="px-2 text-right">Time</th>
                                  <th className="px-2 text-left">Drains</th>
                                </tr>
                              </thead>
                              <tbody>
                                {r.encounters.map((e) => (
                                  <React.Fragment key={e.id}>
                                    <tr className="text-xs font-bold border-t border-body-300 dark:border-dark-400">
                                      <td className="px-2 pt-1" colSpan={4}>
                                        {e.label}
                                        {e.drainFightSeconds !== undefined && (
                                          <span className="font-normal text-gray-500 dark:text-gray-400">{` · drains planned for a ${e.drainFightSeconds} s fight`}</span>
                                        )}
                                      </td>
                                      <td className="px-2 pt-1 text-right font-mono">{fmtS(e.seconds)}</td>
                                      <td aria-label="drains" />
                                    </tr>
                                    <PhaseRows e={e} />
                                  </React.Fragment>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default RoutesView;
