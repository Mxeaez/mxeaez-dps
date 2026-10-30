'use client';

import React, {
  useCallback, useEffect, useRef, useState,
} from 'react';
import { generateEmptyPlayer } from '@/state';
import { withActiveLevels } from '@/lib/fracturedArchive/levels';
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
import { searchRowIcons, searchRowWeaponParts } from '@/lib/fracturedArchive/loadoutIcons';
import { ItemNames, LoadoutIconRow, WeaponLine } from '@/app/components/bestSetup/ItemIcons';
import DPS_TEXT_CLASS from '@/app/components/bestSetup/styles';
import DefenceIcon from '@/public/img/bonuses/defence.png';
import MagicIcon from '@/public/img/bonuses/magic.png';
import { teamDpsMultiplier, teamTimeLabel } from '@/lib/raids';
import { loadoutUsesUnowned, unownedLabel } from '@/lib/fracturedArchive/ownership';
import SpecDamageBox from '@/app/components/bestSetup/SpecDamageBox';

// "Search" tab of /best-setup (phase 9): full gear search over the pool in src/lib/fracturedArchive/searchCandidates.ts,
// run in its own worker (src/worker/searchWorker.ts). Docs: docs/BEST_SETUP.md.
// Phase 12: the default tab; runs automatically (debounced) when the page opens and whenever the inputs change.
// Phase 26: rows that use an item on the "Items I don't own" list are greyed with a "uses: …" badge; "Only items I
// own" searches the pool without them instead (OnlyOwnedToggle, shared with the Summary tab).
// Phase 34 (readability): rows show weapon, DPS, TTK, style, icons and the "uses: …" badge; the ranking Defence, the
// best preset, evaluation counts / timings and the can't-hit list are under "Search details"; the gain over the best
// preset, max hit, accuracy, the item list and "search started from" are tooltips.

/** Delay between the last input change and the automatic search. */
export const AUTO_RUN_DEBOUNCE_MS = 300;

const fmt = (n: number, digits = 3) => (Number.isFinite(n) ? n.toFixed(digits) : '-');
const fmtAcc = (n: number) => `${(n * 100).toFixed(1)}%`;
const fmtTtk = (t: number | null) => (t === null || !Number.isFinite(t) ? 'n/a' : `${t.toFixed(1)}s`);

const fmtGain = (dps: number, base: number | undefined) => {
  if (base === undefined || base <= 0) return '-';
  const d = dps - base;
  const sign = d > 0.0005 ? '+' : '';
  return `${sign}${d.toFixed(3)} (${sign}${((d / base) * 100).toFixed(1)}%)`;
};

/** Phase 26: the "Only items I own" checkbox of the Search and Summary tabs (one shared, persisted setting). */
export const OnlyOwnedToggle: React.FC<{ notOwned: string[], on: boolean, onChange: (on: boolean) => void }> = ({ notOwned, on, onChange }) => (
  <label
    htmlFor="bs-only-owned"
    className={`flex items-center gap-1 ${notOwned.length ? '' : 'opacity-60'}`}
    title={notOwned.length
      ? `Off: search everything (the true best) and mark rows that use ${unownedLabel(notOwned)}. On: search only items you own.`
      : 'Add items to "Items I don’t own" above first'}
  >
    <input id="bs-only-owned" type="checkbox" checked={on} data-testid="only-owned" onChange={(e) => onChange(e.target.checked)} />
    Only items I own
  </label>
);

const SearchView: React.FC<{
  targetKey: string,
  phase: string | undefined,
  drain: DrainStateId,
  assumptions: BestSetupAssumptions,
  notOwned?: string[],
  onlyOwned?: boolean,
  setOnlyOwned?: (on: boolean) => void,
}> = ({
  targetKey, phase, drain, assumptions, notOwned = [], onlyOwned = false, setOnlyOwned,
}) => {
  // phase 26: the list only changes the search itself with "Only items I own"; otherwise it only marks rows
  const searchNotOwned = onlyOwned ? notOwned : [];
  const searchNotOwnedKey = JSON.stringify(searchNotOwned);
  const [styles, setStyles] = useState<StyleFilter>('all');
  // phase 18: the TTK shown assumes this many players at the user's DPS
  const teamMult = teamDpsMultiplier(assumptions);
  const [perWeapon, setPerWeapon] = useState(false);
  const [progress, setProgress] = useState<GearSearchProgress | null>(null);
  const [result, setResult] = useState<GearSearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [startedAt, setStartedAt] = useState(0);
  const [wallMs, setWallMs] = useState<number | null>(null);
  const job = useRef<SearchJob | null>(null);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Stops a pending automatic run and the running search (the worker is terminated). */
  const cancel = useCallback(() => {
    if (autoTimer.current) clearTimeout(autoTimer.current);
    autoTimer.current = null;
    job.current?.cancel();
    job.current = null;
    setRunning(false);
    setProgress(null);
  }, []);

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
        basePlayer: withActiveLevels(generateEmptyPlayer()),
        query: {
          targetKey, phase, drain, styles,
        },
        assumptions,
        ...(searchNotOwned.length ? { notOwned: searchNotOwned } : {}),
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

  const runRef = useRef(run);
  runRef.current = run;

  // Inputs changed (or the tab opened): drop the old result, cancel any running search and start a new one after
  // AUTO_RUN_DEBOUNCE_MS, so quick successive changes only search once. Shown as running (Cancel works) meanwhile.
  useEffect(() => {
    cancel();
    setResult(null);
    setError(null);
    setWallMs(null);
    setRunning(true);
    setStartedAt(performance.now());
    autoTimer.current = setTimeout(() => {
      autoTimer.current = null;
      runRef.current();
    }, AUTO_RUN_DEBOUNCE_MS);
    return () => {
      if (autoTimer.current) clearTimeout(autoTimer.current);
      autoTimer.current = null;
    };
  }, [targetKey, phase, drain, assumptions, styles, cancel, searchNotOwnedKey]);

  const onLoad = (row: SearchRow) => {
    const { monster } = buildTargetMonster(findTarget(targetKey), phase, drain, assumptions);
    const player = searchRowToPlayer(withActiveLevels(generateEmptyPlayer(row.weaponLabel)), row, monster, assumptions);
    openInCalculator(player, monster).catch(console.error);
  };

  const fraction = progress ? Math.min(0.99, progress.evaluations / Math.max(1, progress.estimate)) : 0;
  let rows: SearchRow[] = [];
  if (result) rows = perWeapon ? result.rowsByWeapon : result.rows;
  const baseDps = result?.bestPreset?.dps;
  const target = findTarget(targetKey);

  return (
    <div className="flex flex-col gap-2" data-testid="search-view">
      <div className="flex flex-wrap gap-3 items-center text-sm" title="Tries every end-game item in every slot (weapons, ammo, styles, spells) against this boss and drain state.">
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
          <button type="button" className="btn text-sm" onClick={run} data-testid="search-run" title="Runs automatically when the boss, phase, drains, styles or assumptions change">Run again</button>
        ) : (
          <button type="button" className="btn text-sm" onClick={cancel} data-testid="search-cancel">Cancel</button>
        )}
        <label htmlFor="bs-search-perweapon" className="flex items-center gap-1" title="Show the best loadout of each weapon instead of the top loadouts overall">
          <input id="bs-search-perweapon" type="checkbox" checked={perWeapon} onChange={(e) => setPerWeapon(e.target.checked)} />
          Best per weapon
        </label>
        {setOnlyOwned && <OnlyOwnedToggle notOwned={notOwned} on={onlyOwned} onChange={setOnlyOwned} />}
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
          {target.note && <div className="text-xs text-orange-700 dark:text-orange-300">{target.note}</div>}
          {/* phase 36: the damage spec weapons on this boss (best first), against the top row's DPS */}
          {result.rows.length > 0 && result.rows[0].dps > 0 && (
            <SpecDamageBox targetKey={targetKey} phase={phase} drain={drain} assumptions={assumptions} dps={result.rows[0].dps} mult={teamMult} />
          )}
          <details className="text-xs" data-testid="search-details">
            <summary className="cursor-pointer text-gray-500 dark:text-gray-400" data-testid="search-details-toggle">Search details</summary>
            <div className="text-xs flex flex-col gap-0.5" data-testid="search-summary">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {/* phase 29: the drain plan itself is in the box above (SpecPlanPanel); only what the ranking used here */}
                <span className="flex items-center gap-1" title={result.drain.plan} data-testid="search-ranked-at">
                  ranked at
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={DefenceIcon.src} alt="" width={14} height={14} className="inline" />
                  {`Def ${result.drain.defAfter} ·`}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={MagicIcon.src} alt="" width={14} height={14} className="inline" />
                  {`Magic def ${result.drain.magicDefAfter}`}
                </span>
                <span data-testid="search-best-preset" title="Gain column = DPS over this preset (same boss and drains)">
                  {result.bestPreset
                    ? `Best preset: ${result.bestPreset.preset} ${fmt(result.bestPreset.dps)} DPS (${result.bestPreset.styleLabel})`
                    : 'No preset for these styles'}
                </span>
              </div>
              <div className="text-gray-500 dark:text-gray-400 flex flex-wrap items-center gap-x-1" data-testid="search-stats">
                <span title={`${result.evaluations} evaluations over ${result.variants} weapon variants`}>
                  {`${result.evaluations} evaluations · ${(result.elapsedMs / 1000).toFixed(1)}s${wallMs !== null ? ` (wall ${(wallMs / 1000).toFixed(1)}s)` : ''} · Exp. TTK (top row only): ${teamTimeLabel(teamMult)}`}
                </span>
                {result.cantHit.length > 0 && (
                <details className="inline" data-testid="cant-hit">
                  <summary className="cursor-pointer underline inline">{`· ${result.cantHit.length} weapon${result.cantHit.length === 1 ? '' : 's'} can't hit (show)`}</summary>
                  <ul className="list-disc ml-5" data-testid="cant-hit-list">
                    {Array.from(new Set(result.cantHit.map((c) => c.reason))).map((reason) => (
                      <li key={reason}>{`${reason}: ${result.cantHit.filter((c) => c.reason === reason).map((c) => c.weapon).join(', ')}`}</li>
                    ))}
                  </ul>
                </details>
                )}
              </div>
            </div>
          </details>
          <div className="overflow-x-auto max-w-[100vw]">
            <table className="w-full" data-testid="search-results">
              <thead>
                <tr className="bg-btns-400 dark:bg-dark-500 text-white">
                  <th>#</th>
                  <th className="text-right">DPS</th>
                  <th className="text-right" title={`Expected time to kill, top row only (${teamTimeLabel(teamMult)})`} data-testid="ttk-header">{teamMult === 1 ? 'Exp. TTK' : `Exp. TTK (${teamMult}×)`}</th>
                  <th>Style</th>
                  <th>Loadout</th>
                  <th aria-label="actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const unowned = loadoutUsesUnowned(r.equipment, notOwned);
                  return (
                    <tr
                      key={`${r.weaponLabel}|${loadoutSummary(r)}|${r.styleLabel}`}
                      data-testid="search-row"
                      data-unowned={unowned.length ? unownedLabel(unowned) : undefined}
                      className={unowned.length ? 'opacity-50 grayscale' : undefined}
                      title={unowned.length ? `Uses items you don't own: ${unownedLabel(unowned)}` : undefined}
                    >
                      <td className="px-2 py-1">{i + 1}</td>
                      <td
                        className="px-2 py-1 text-right font-mono"
                        title={`vs best preset: ${fmtGain(r.dps, baseDps)} · max hit ${r.maxHit} · accuracy ${fmtAcc(r.accuracy)}`}
                      >
                        <span className={`font-bold ${DPS_TEXT_CLASS}`} data-testid="dps">{fmt(r.dps)}</span>
                        <span className="sr-only" data-testid="gain">{fmtGain(r.dps, baseDps)}</span>
                        <span className="sr-only" data-testid="maxhit">{r.maxHit}</span>
                      </td>
                      <td className="px-2 py-1 text-right font-mono" data-testid="ttk">{i === 0 ? fmtTtk(r.ttk === null ? null : r.ttk / teamMult) : ''}</td>
                      <td className="px-2 py-1 text-xs">
                        <div className="capitalize">{r.group}</div>
                        <div>{r.styleLabel}</div>
                      </td>
                      <td className="px-2 py-1">
                        <WeaponLine parts={searchRowWeaponParts(r)} className="font-bold text-sm" />
                        {unowned.length > 0 && (
                        <span className="inline-block text-[10px] px-1 rounded bg-red-600 text-white" data-testid="unowned-badge">
                          {'uses: '}
                          <ItemNames names={unowned} size={14} />
                        </span>
                        )}
                        <div title={`${loadoutSummary(r)} · search started from: ${r.seed}`} data-testid="search-row-loadout">
                          <LoadoutIconRow icons={searchRowIcons(r)} />
                        </div>
                      </td>
                      <td className="px-2 py-1">
                        <button type="button" className="btn text-xs whitespace-nowrap" onClick={() => onLoad(r)}>
                          Load into calculator
                        </button>
                      </td>
                    </tr>
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

export default SearchView;
