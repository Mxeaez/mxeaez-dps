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
  RouteComparisonProgress,
  RouteComparisonResult,
} from '@/lib/fracturedArchive/raidTime';
import {
  RaidConfig, teamDpsMultiplier, teamTimeLabel, TimeSettings,
} from '@/lib/raids';
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

/** Phase 18: the raid's time-model settings box, from its `timeSettingFields` (each model has its own settings object). */
const TimeSettingsBox: React.FC<{
  raid: RaidConfig, value: TimeSettings, onChange: (s: TimeSettings) => void,
}> = ({ raid, value, onChange }) => (
  <div className="text-xs bg-body-100 dark:bg-dark-400 border border-body-400 dark:border-dark-200 rounded p-3 flex flex-col gap-2" data-testid="time-settings">
    <div className="font-bold text-sm">Assumptions (time model)</div>
    <div>{raid.timeModelNote}</div>
    <div className="flex flex-wrap gap-x-4 gap-y-2 items-center">
      {raid.timeSettingFields.map((f) => {
        const id = `rt-${f.key}`;
        const v = value[f.key];
        if (f.kind === 'bool') {
          return (
            <label key={f.key} htmlFor={id} className="flex items-center gap-1" title={f.title}>
              <input id={id} type="checkbox" checked={v === true} onChange={(e) => onChange({ ...value, [f.key]: e.target.checked })} />
              {f.label}
            </label>
          );
        }
        if (f.kind === 'select') {
          return (
            <label key={f.key} htmlFor={id} className="flex items-center gap-1" title={f.title}>
              {f.label}
              <select id={id} className="form-control text-xs py-0.5" value={String(v)} onChange={(e) => onChange({ ...value, [f.key]: e.target.value })}>
                {(f.options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
          );
        }
        const pct = f.kind === 'percent';
        const n = typeof v === 'number' ? v : 0;
        return (
          <label key={f.key} htmlFor={id} className="flex items-center gap-1" title={f.title}>
            {f.label}
            <input
              id={id}
              type="number"
              className="form-control text-xs py-0.5 w-16"
              min={0}
              max={pct ? 100 : f.max}
              value={pct ? Math.round(n * 1000) / 10 : n}
              onChange={(e) => {
                const x = Math.max(0, Number(e.target.value) || 0);
                onChange({ ...value, [f.key]: pct ? Math.min(100, x) / 100 : x });
              }}
            />
            {pct ? '%' : f.unit}
          </label>
        );
      })}
      <button type="button" className="underline" onClick={() => onChange(raid.defaultTimeSettings)}>Reset</button>
    </div>
  </div>
);

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
  const [settings, setSettings] = useState<TimeSettings>(raid.defaultTimeSettings);
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
      <TimeSettingsBox raid={raid} value={settings} onChange={setSettings} />

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
            <span data-testid="routes-team-label">{`${teamTimeLabel(teamDpsMultiplier(assumptions))}. `}</span>
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
