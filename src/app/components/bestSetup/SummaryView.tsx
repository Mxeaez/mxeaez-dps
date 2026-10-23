'use client';

import React, {
  useCallback, useEffect, useRef, useState,
} from 'react';
import { generateEmptyPlayer } from '@/state';
import Spinner from '@/app/components/Spinner';
import {
  buildTargetMonster, DRAIN_STATES, findTarget, summaryQueries,
} from '@/lib/fracturedArchive/bestSetup';
import { BestSetupAssumptions } from '@/lib/fracturedArchive/presets';
import {
  GearSearchProgress,
  GearSearchQuery,
  GearSearchResult,
  loadoutSummary,
  searchCacheKey,
  searchRowToPlayer,
  summarySearchQueries,
} from '@/lib/fracturedArchive/search';
import { SearchJob, startGearSearch } from '@/worker/searchWorkerClient';
import openInCalculator from '@/app/components/bestSetup/loadIntoCalculator';
import { searchRowIcons, searchRowWeaponParts, targetImageUrl } from '@/lib/fracturedArchive/loadoutIcons';
import { ItemIcon, LoadoutIconRow, WeaponLine } from '@/app/components/bestSetup/ItemIcons';
import DPS_TEXT_CLASS from '@/app/components/bestSetup/styles';

// "Summary" tab of /best-setup (phase 13): the top gear-search result for every Summary boss / phase × drain state.
// The ~54 searches run one after the other in the search worker when the tab opens; results are cached in memory for
// the session (module scope, so switching tabs keeps them) and keyed by the assumptions, so changing an assumption
// re-runs. Cancel stops after the current search is terminated; "Continue" resumes with the uncached ones.

/** What the table needs of a search (the full result has 10+ rows per search). */
type SummaryCell = Pick<GearSearchResult, 'drain' | 'bestPreset'> & { top: GearSearchResult['rows'][number] | null };

const cache = new Map<string, SummaryCell>();
let cacheAssumptions = '';

const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(3) : '-');

const SummaryView: React.FC<{ assumptions: BestSetupAssumptions }> = ({ assumptions }) => {
  const queries = useRef<GearSearchQuery[]>(summarySearchQueries()).current;
  const [cells, setCells] = useState<Record<string, SummaryCell>>({});
  const [running, setRunning] = useState(false);
  const [current, setCurrent] = useState<{ index: number, progress: GearSearchProgress | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const job = useRef<SearchJob | null>(null);
  const runId = useRef(0);

  const cachedCells = useCallback(() => Object.fromEntries(queries
    .map((q) => [searchCacheKey(q, assumptions), cache.get(searchCacheKey(q, assumptions))])
    .filter(([, c]) => c)) as Record<string, SummaryCell>, [queries, assumptions]);

  const cancel = useCallback(() => {
    runId.current += 1;
    job.current?.cancel();
    job.current = null;
    setRunning(false);
    setCurrent(null);
  }, []);

  const run = useCallback(async () => {
    cancel();
    const id = runId.current;
    setError(null);
    setRunning(true);
    for (let i = 0; i < queries.length; i++) {
      const q = queries[i];
      const key = searchCacheKey(q, assumptions);
      if (!cache.has(key)) {
        setCurrent({ index: i, progress: null });
        const j = startGearSearch(
          { basePlayer: generateEmptyPlayer(), query: q, assumptions },
          (progress) => {
            if (runId.current === id) setCurrent({ index: i, progress });
          },
        );
        job.current = j;
        try {
          // eslint-disable-next-line no-await-in-loop
          const r = await j.promise;
          cache.set(key, { drain: r.drain, bestPreset: r.bestPreset, top: r.rows[0] ?? null });
        } catch (e) {
          if (runId.current === id && (e as Error).message !== 'cancelled') {
            setError(`${findTarget(q.targetKey).label} ${q.phase ?? ''} ${q.drain}: ${(e as Error).message}`);
          }
        }
        if (runId.current !== id) return; // cancelled or superseded
        setCells(cachedCells());
      }
    }
    job.current = null;
    setRunning(false);
    setCurrent(null);
  }, [cancel, queries, assumptions, cachedCells]);

  // Open / assumptions changed: drop the cache if the assumptions differ (memory), show what's cached, run the rest.
  useEffect(() => {
    const a = JSON.stringify(assumptions);
    if (a !== cacheAssumptions) {
      cache.clear();
      cacheAssumptions = a;
    }
    setCells(cachedCells());
    run();
    return () => cancel();
  }, [assumptions, cachedCells, run, cancel]);

  const onLoad = (q: GearSearchQuery, cell: SummaryCell) => {
    if (!cell.top) return;
    const { monster } = buildTargetMonster(findTarget(q.targetKey), q.phase, q.drain, assumptions);
    const player = searchRowToPlayer(generateEmptyPlayer(cell.top.weaponLabel), cell.top, monster, assumptions);
    openInCalculator(player, monster).catch(console.error);
  };

  const done = Object.keys(cells).length;
  const inner = current?.progress ? Math.min(0.99, current.progress.evaluations / Math.max(1, current.progress.estimate)) : 0;
  const fraction = (done + inner) / queries.length;
  const currentQuery = current ? queries[current.index] : null;

  return (
    <div className="flex flex-col gap-2" data-testid="summary-view">
      <div className="flex flex-wrap gap-3 items-center text-sm">
        {running ? (
          <button type="button" className="btn text-sm" onClick={cancel} data-testid="summary-cancel">Cancel</button>
        ) : (
          done < queries.length && (
            <button type="button" className="btn text-sm" onClick={run} data-testid="summary-continue">Continue</button>
          )
        )}
        <span className="text-[11px] text-gray-500 dark:text-gray-400">
          Top gear-search result (all styles) per boss / phase and drain state; cached for this session until an assumption changes.
        </span>
      </div>
      {(running || done < queries.length) && (
        <div className="flex flex-col gap-1 text-xs" data-testid="summary-progress">
          <div className="flex items-center gap-2">
            {running && <Spinner className="w-4" />}
            {`${done} / ${queries.length} searches`}
            {currentQuery && ` · ${findTarget(currentQuery.targetKey).label}${currentQuery.phase ? ` (${currentQuery.phase})` : ''}, ${DRAIN_STATES.find((d) => d.id === currentQuery.drain)?.label}`}
            {!running && ' · cancelled'}
          </div>
          <div className="w-full h-2 bg-body-200 dark:bg-dark-500 rounded">
            <div className="h-2 bg-orange-400 rounded" style={{ width: `${(fraction * 100).toFixed(1)}%` }} />
          </div>
        </div>
      )}
      {error && <div className="text-red-600 text-xs">{`Error: ${error}`}</div>}
      <div className="overflow-x-auto max-w-[100vw]">
        <table className="w-full text-sm" data-testid="summary">
          <thead>
            <tr className="bg-btns-400 dark:bg-dark-500 text-white">
              <th>Boss / phase</th>
              {DRAIN_STATES.map((s) => <th key={s.id} title={s.description}>{s.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {summaryQueries().map((row) => {
              const target = findTarget(row.targetKey);
              return (
                <tr key={`${row.targetKey}|${row.phase}`} data-testid="summary-row">
                  <td className="px-2 py-1 align-top">
                    <div className="flex items-center gap-1 font-bold">
                      <ItemIcon name={target.label} src={targetImageUrl(target)} size={24} />
                      {target.label}
                    </div>
                    {row.phase && <div className="text-[11px] text-gray-500 dark:text-gray-400">{row.phase}</div>}
                  </td>
                  {DRAIN_STATES.map((d) => {
                    const q = queries.find((x) => x.targetKey === row.targetKey && x.phase === row.phase && x.drain === d.id)!;
                    const cell = cells[searchCacheKey(q, assumptions)];
                    if (!cell) {
                      return <td key={d.id} className="px-2 py-1 align-top text-xs text-gray-500">…</td>;
                    }
                    if (!cell.top || cell.top.dps <= 0) {
                      return <td key={d.id} className="px-2 py-1 align-top text-xs text-gray-500">nothing can hit</td>;
                    }
                    return (
                      <td key={d.id} className="px-2 py-1 align-top" data-testid="summary-cell">
                        <WeaponLine parts={searchRowWeaponParts(cell.top)} className="text-xs font-bold" iconSize={18} />
                        <LoadoutIconRow icons={searchRowIcons(cell.top)} size={16} />
                        <div className="text-[11px]" title={loadoutSummary(cell.top)}>
                          <span className={`font-mono ${DPS_TEXT_CLASS}`} data-testid="dps">{fmt(cell.top.dps)}</span>
                          {` · ${cell.top.styleLabel}`}
                        </div>
                        <div className="text-[11px] text-gray-500 dark:text-gray-400">
                          {cell.bestPreset ? `best preset ${fmt(cell.bestPreset.dps)}` : 'no preset'}
                          {' · '}
                          <button type="button" className="underline" onClick={() => onLoad(q, cell)}>load</button>
                        </div>
                        <div className="text-[10px] text-gray-500 dark:text-gray-400" title="Drains">{cell.drain.specs}</div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SummaryView;
