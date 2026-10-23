'use client';

import React, {
  useCallback, useEffect, useRef, useState,
} from 'react';
import { generateEmptyPlayer } from '@/state';
import Spinner from '@/app/components/Spinner';
import { buildTargetMonster, DrainStateId, findTarget } from '@/lib/fracturedArchive/bestSetup';
import { BestSetupAssumptions } from '@/lib/fracturedArchive/presets';
import {
  GearSearchProgress,
  GearSearchResult,
  loadoutSummary,
  SearchRow,
  searchRowToPlayer,
  STYLE_FILTERS,
  StyleFilter,
} from '@/lib/fracturedArchive/search';
import { SearchJob, startGearSearch } from '@/worker/searchWorkerClient';
import openInCalculator from '@/app/components/bestSetup/loadIntoCalculator';

// "Search" tab of /best-setup (phase 9): full gear search over the pool in src/lib/fracturedArchive/searchCandidates.ts,
// run in its own worker (src/worker/searchWorker.ts). Docs: docs/BEST_SETUP.md.

const fmt = (n: number, digits = 3) => (Number.isFinite(n) ? n.toFixed(digits) : '-');
const fmtAcc = (n: number) => `${(n * 100).toFixed(1)}%`;
const fmtTtk = (t: number | null) => (t === null || !Number.isFinite(t) ? 'n/a' : `${t.toFixed(1)}s`);

const fmtGain = (dps: number, base: number | undefined) => {
  if (base === undefined || base <= 0) return '-';
  const d = dps - base;
  const sign = d > 0.0005 ? '+' : '';
  return `${sign}${d.toFixed(3)} (${sign}${((d / base) * 100).toFixed(1)}%)`;
};

const SearchView: React.FC<{
  targetKey: string,
  phase: string | undefined,
  drain: DrainStateId,
  assumptions: BestSetupAssumptions,
}> = ({
  targetKey, phase, drain, assumptions,
}) => {
  const [styles, setStyles] = useState<StyleFilter>('all');
  const [perWeapon, setPerWeapon] = useState(false);
  const [progress, setProgress] = useState<GearSearchProgress | null>(null);
  const [result, setResult] = useState<GearSearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [startedAt, setStartedAt] = useState(0);
  const [wallMs, setWallMs] = useState<number | null>(null);
  const job = useRef<SearchJob | null>(null);

  const cancel = useCallback(() => {
    job.current?.cancel();
    job.current = null;
    setRunning(false);
    setProgress(null);
  }, []);

  // inputs changed: the old result no longer applies
  useEffect(() => {
    cancel();
    setResult(null);
    setError(null);
    setWallMs(null);
  }, [targetKey, phase, drain, assumptions, styles, cancel]);

  useEffect(() => () => job.current?.cancel(), []);

  const run = () => {
    cancel();
    setResult(null);
    setError(null);
    setWallMs(null);
    setRunning(true);
    const t0 = performance.now();
    setStartedAt(t0);
    const j = startGearSearch(
      {
        basePlayer: generateEmptyPlayer(),
        query: {
          targetKey, phase, drain, styles,
        },
        assumptions,
      },
      setProgress,
    );
    job.current = j;
    j.promise
      .then((r) => {
        if (job.current !== j) return;
        setResult(r);
        setWallMs(performance.now() - t0);
      })
      .catch((e: Error) => {
        if (job.current === j && e.message !== 'cancelled') setError(e.message);
      })
      .finally(() => {
        if (job.current === j) {
          job.current = null;
          setRunning(false);
          setProgress(null);
        }
      });
  };

  const onLoad = (row: SearchRow) => {
    const { monster } = buildTargetMonster(findTarget(targetKey), phase, drain, assumptions);
    const player = searchRowToPlayer(generateEmptyPlayer(row.weaponLabel), row, monster, assumptions);
    openInCalculator(player, monster).catch(console.error);
  };

  const fraction = progress ? Math.min(0.99, progress.evaluations / Math.max(1, progress.estimate)) : 0;
  let rows: SearchRow[] = [];
  if (result) rows = perWeapon ? result.rowsByWeapon : result.rows;
  const baseDps = result?.bestPreset?.dps;
  const target = findTarget(targetKey);

  return (
    <div className="flex flex-col gap-2" data-testid="search-view">
      <div className="flex flex-wrap gap-3 items-center text-sm">
        <label htmlFor="bs-search-styles" className="flex items-center gap-1">
          Styles
          <select
            id="bs-search-styles"
            className="form-control text-sm"
            value={styles}
            data-testid="search-styles"
            onChange={(e) => setStyles(e.target.value as StyleFilter)}
          >
            {STYLE_FILTERS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        {!running ? (
          <button type="button" className="btn text-sm" onClick={run} data-testid="search-run">Run search</button>
        ) : (
          <button type="button" className="btn text-sm" onClick={cancel} data-testid="search-cancel">Cancel</button>
        )}
        <label htmlFor="bs-search-perweapon" className="flex items-center gap-1" title="Show the best loadout of each weapon instead of the top loadouts overall">
          <input id="bs-search-perweapon" type="checkbox" checked={perWeapon} onChange={(e) => setPerWeapon(e.target.checked)} />
          Best per weapon
        </label>
        <span className="text-[11px] text-gray-500 dark:text-gray-400">
          Searches the end-game pool in searchCandidates.ts (all slots, every weapon/ammo/style/spell) for this boss and drain state.
        </span>
      </div>

      {running && (
        <div className="flex flex-col gap-1 text-xs" data-testid="search-progress">
          <div className="flex items-center gap-2">
            <Spinner className="w-4" />
            {progress
              ? `${progress.evaluations} / ~${Math.round(progress.estimate)} evaluations · weapon ${progress.variantsDone + 1}/${progress.variants}: ${progress.current}`
              : 'Starting…'}
            <span className="text-gray-500">{`${((performance.now() - startedAt) / 1000).toFixed(0)}s`}</span>
          </div>
          <div className="w-full h-2 bg-body-200 dark:bg-dark-500 rounded">
            <div className="h-2 bg-orange-400 rounded" style={{ width: `${(fraction * 100).toFixed(1)}%` }} />
          </div>
        </div>
      )}

      {error && <div className="text-red-600">{`Error: ${error}`}</div>}

      {result && (
        <>
          <div className="text-xs" data-testid="search-summary">
            <div>
              {`Drains: ${result.drain.specs} → Defence ${result.drain.defAfter}, Magic def bonus ${result.drain.magicDefAfter}. `}
              {result.bestPreset
                ? `Best preset: ${result.bestPreset.preset} ${fmt(result.bestPreset.dps)} DPS (${result.bestPreset.styleLabel}).`
                : 'No preset for these styles.'}
            </div>
            <div className="text-gray-500 dark:text-gray-400" data-testid="search-stats">
              {`${result.evaluations} evaluations over ${result.variants} weapon variants in ${(result.elapsedMs / 1000).toFixed(1)}s`}
              {wallMs !== null && ` (wall ${(wallMs / 1000).toFixed(1)}s)`}
              {result.cantHit.length > 0 && ` · can't hit: ${result.cantHit.map((c) => c.weapon).join(', ')} (${result.cantHit[0].reason})`}
            </div>
            {target.note && <div className="text-orange-700 dark:text-orange-300">{target.note}</div>}
          </div>
          <div className="overflow-x-auto max-w-[100vw]">
            <table className="w-full" data-testid="search-results">
              <thead>
                <tr className="bg-btns-400 dark:bg-dark-500 text-white">
                  <th>#</th>
                  <th className="text-right">DPS</th>
                  <th className="text-right" title="Gain over the best Phase 8 preset of the searched styles (same boss and drains)">vs best preset</th>
                  <th className="text-right">Exp. TTK</th>
                  <th className="text-right">Max hit</th>
                  <th className="text-right">Accuracy</th>
                  <th>Style</th>
                  <th>Loadout</th>
                  <th aria-label="actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.weaponLabel}|${loadoutSummary(r)}|${r.styleLabel}`} data-testid="search-row">
                    <td className="px-2 py-1">{i + 1}</td>
                    <td className="px-2 py-1 text-right font-mono font-bold" data-testid="dps">{fmt(r.dps)}</td>
                    <td className="px-2 py-1 text-right font-mono text-xs" data-testid="gain">{fmtGain(r.dps, baseDps)}</td>
                    <td className="px-2 py-1 text-right font-mono">{i === 0 ? fmtTtk(r.ttk) : ''}</td>
                    <td className="px-2 py-1 text-right font-mono" data-testid="maxhit">{r.maxHit}</td>
                    <td className="px-2 py-1 text-right font-mono">{fmtAcc(r.accuracy)}</td>
                    <td className="px-2 py-1 text-xs">
                      <div className="capitalize">{r.group}</div>
                      <div>{r.styleLabel}</div>
                    </td>
                    <td className="px-2 py-1">
                      <div className="font-bold text-sm">{r.weaponLabel}</div>
                      <div className="text-[11px] text-gray-500 dark:text-gray-400">{loadoutSummary(r)}</div>
                      <div className="text-[10px] text-gray-400">{`seed (start of the ascent): ${r.seed}`}</div>
                    </td>
                    <td className="px-2 py-1">
                      <button type="button" className="btn text-xs whitespace-nowrap" onClick={() => onLoad(r)}>
                        Load into calculator
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default SearchView;
