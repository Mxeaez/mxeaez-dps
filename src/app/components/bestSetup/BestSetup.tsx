'use client';

import React, {
  useCallback, useEffect, useMemo, useState,
} from 'react';
import localforage from 'localforage';
import { CalcProvider, useCalc } from '@/worker/CalcWorker';
import { BestSetupRequest, WorkerRequestType } from '@/worker/CalcWorkerTypes';
import { generateEmptyPlayer } from '@/state';
import { ImportableData, IMPORT_VERSION } from '@/types/State';
import { NUMBER_OF_LOADOUTS } from '@/lib/constants';
import { PotionMap } from '@/utils';
import Potion from '@/enums/Potion';
import Spinner from '@/app/components/Spinner';
import {
  applyPresetToPlayer,
  BEST_SETUP_TARGETS,
  BestSetupResult,
  buildTargetMonster,
  DRAIN_STATES,
  DrainStateId,
  findTarget,
  PresetResult,
  summaryQueries,
  targetPhases,
} from '@/lib/fracturedArchive/bestSetup';
import {
  BestSetupAssumptions, DEFAULT_ASSUMPTIONS, PRESETS, StyleGroup,
} from '@/lib/fracturedArchive/presets';

// Fractured Archive "Best setup" view (phase 8). Computation: src/lib/fracturedArchive/bestSetup.ts, run in the calc
// web worker (WorkerRequestType.BEST_SETUP). Docs: docs/BEST_SETUP.md.

const fmt = (n: number, digits = 3) => (Number.isFinite(n) ? n.toFixed(digits) : '-');
const fmtTtk = (r: PresetResult) => (r.ttk === null || !Number.isFinite(r.ttk) ? 'n/a' : `${r.ttk.toFixed(1)}s`);
const fmtAcc = (n: number) => `${(n * 100).toFixed(1)}%`;

const POTION_OPTIONS = (Object.keys(PotionMap) as unknown as string[])
  .map((k) => Number(k) as Potion)
  .sort((a, b) => PotionMap[a].order - PotionMap[b].order);

const GROUP_PRAYER: Record<StyleGroup, string> = { melee: 'Piety', ranged: 'Rigour', magic: 'Augury' };

/**
 * Writes the preset + boss + drains into the main calculator's saved session (as a new loadout, or replacing the
 * selected one when all loadouts are used) and opens the calculator, which restores it on load.
 */
const loadIntoCalculator = async (
  row: PresetResult,
  targetKey: string,
  phase: string | undefined,
  drain: DrainStateId,
  assumptions: BestSetupAssumptions,
) => {
  const preset = PRESETS.find((p) => p.name === row.preset)!;
  const { monster } = buildTargetMonster(findTarget(targetKey), phase, drain, assumptions);
  const player = applyPresetToPlayer(generateEmptyPlayer(row.preset), preset, row.style, row.spell, monster, assumptions);

  let data: ImportableData = {
    serializationVersion: IMPORT_VERSION,
    loadouts: [player],
    selectedLoadout: 0,
    monster,
  };
  try {
    const saved = await localforage.getItem<ImportableData>('dps-calc-state');
    if (saved && saved.serializationVersion === IMPORT_VERSION && saved.loadouts?.length) {
      const loadouts = [...saved.loadouts];
      let ix = loadouts.length;
      if (ix >= NUMBER_OF_LOADOUTS) {
        ix = saved.selectedLoadout || 0;
      }
      loadouts[ix] = player;
      data = { ...data, loadouts, selectedLoadout: ix };
    }
  } catch (e) { /* no saved session: start a fresh one */ }

  await localforage.setItem('dps-calc-state', data);
  window.location.assign(`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/`);
};

const AssumptionsBox: React.FC<{
  value: BestSetupAssumptions,
  onChange: (a: BestSetupAssumptions) => void,
}> = ({ value, onChange }) => {
  const set = (patch: Partial<BestSetupAssumptions>) => onChange({ ...value, ...patch });
  return (
    <div className="text-xs bg-body-100 dark:bg-dark-400 border border-body-400 dark:border-dark-200 rounded p-3 flex flex-col gap-2" data-testid="assumptions">
      <div className="font-bold text-sm">Assumptions</div>
      <div>All skills 99. Prayers: Piety (or Zeal) / Rigour / Augury by style. Items per preset: src/lib/fracturedArchive/presets.ts.</div>
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
        <label htmlFor="bs-party" className="flex items-center gap-1" title="HP scaling by party size is unverified (identity table): TTK is relative only">
          Party size
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
        <label htmlFor="bs-ayak" className="flex items-center gap-1" title="Eye of Ayak damage assumed for the Solo drain state (40 per spec)">
          Solo Ayak damage
          <input
            id="bs-ayak"
            type="number"
            className="form-control text-xs py-0.5 w-16"
            min={0}
            value={value.soloAyakDamage}
            onChange={(e) => set({ soloAyakDamage: Math.max(0, Number(e.target.value) || 0) })}
          />
        </label>
        <button type="button" className="underline" onClick={() => onChange(DEFAULT_ASSUMPTIONS)}>Reset</button>
      </div>
    </div>
  );
};

const BossView: React.FC<{
  result: BestSetupResult,
  drain: DrainStateId,
  onLoad: (row: PresetResult) => void,
}> = ({ result, drain, onLoad }) => {
  const current = result.drains.find((d) => d.drain.id === drain)!;
  const others = result.drains.filter((d) => d.drain.id !== drain);
  const target = findTarget(result.targetKey);

  return (
    <div>
      <div className="text-xs mb-2" data-testid="drain-specs">
        {`Drains: ${current.drain.specs} → Defence ${current.drain.defAfter}, Magic def bonus ${current.drain.magicDefAfter}`}
        {target.note && <div className="text-orange-700 dark:text-orange-300">{target.note}</div>}
      </div>
      <div className="overflow-x-auto max-w-[100vw]">
        <table className="w-full" data-testid="ranking">
          <thead>
            <tr className="bg-btns-400 dark:bg-dark-500 text-white">
              <th>#</th>
              <th>Preset</th>
              <th>Best style</th>
              <th className="text-right">DPS</th>
              <th className="text-right">Exp. TTK</th>
              <th className="text-right">Max hit</th>
              <th className="text-right">Accuracy</th>
              {others.map((o) => (
                <th key={o.drain.id} className="text-right">{`DPS (${DRAIN_STATES.find((s) => s.id === o.drain.id)!.label})`}</th>
              ))}
              <th aria-label="actions" />
            </tr>
          </thead>
          <tbody>
            {current.rows.map((r, i) => (
              <tr
                key={r.preset}
                className={r.cantHit ? 'opacity-50' : ''}
                title={r.cantHit}
                data-testid="ranking-row"
              >
                <td className="px-2 py-1">{r.cantHit ? '-' : i + 1}</td>
                <td className="px-2 py-1">
                  <div className="font-bold">{r.preset}</div>
                  <div className="text-[11px] text-gray-500 dark:text-gray-400">
                    {r.cantHit ? `Can't hit: ${r.cantHit}` : `${r.group}${r.note ? ` · ${r.note}` : ''}`}
                  </div>
                </td>
                <td className="px-2 py-1 text-xs">{r.styleLabel}</td>
                <td className="px-2 py-1 text-right font-mono font-bold" data-testid="dps">{fmt(r.dps)}</td>
                <td className="px-2 py-1 text-right font-mono">{fmtTtk(r)}</td>
                <td className="px-2 py-1 text-right font-mono" data-testid="maxhit">{r.maxHit}</td>
                <td className="px-2 py-1 text-right font-mono">{fmtAcc(r.accuracy)}</td>
                {others.map((o) => (
                  <td key={o.drain.id} className="px-2 py-1 text-right font-mono text-xs text-gray-500 dark:text-gray-400">
                    {fmt(o.rows.find((x) => x.preset === r.preset)?.dps ?? NaN)}
                  </td>
                ))}
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
    </div>
  );
};

const SummaryView: React.FC<{ results: BestSetupResult[] }> = ({ results }) => (
  <div className="overflow-x-auto max-w-[100vw]">
    <table className="w-full" data-testid="summary">
      <thead>
        <tr className="bg-btns-400 dark:bg-dark-500 text-white">
          <th>Boss / phase</th>
          {DRAIN_STATES.map((s) => <th key={s.id}>{`Best (${s.label})`}</th>)}
        </tr>
      </thead>
      <tbody>
        {results.map((r) => {
          const target = findTarget(r.targetKey);
          return (
            <tr key={`${r.targetKey}|${r.phase}`}>
              <td className="px-2 py-1">
                <div className="font-bold">{target.label}</div>
                {r.phase && <div className="text-[11px] text-gray-500 dark:text-gray-400">{r.phase}</div>}
              </td>
              {r.drains.map((d) => {
                const top = d.rows[0];
                return (
                  <td key={d.drain.id} className="px-2 py-1 align-top">
                    {top && top.dps > 0 ? (
                      <>
                        <div>{top.preset}</div>
                        <div className="font-mono text-xs">
                          {`${fmt(top.dps)} DPS · ${fmtTtk(top)}`}
                        </div>
                        <div className="text-[11px] text-gray-500 dark:text-gray-400">{d.drain.specs}</div>
                      </>
                    ) : <span className="text-gray-500">no preset can hit</span>}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

const BestSetupInner: React.FC = () => {
  const calc = useCalc();
  const [mode, setMode] = useState<'boss' | 'summary'>('boss');
  const [targetKey, setTargetKey] = useState(BEST_SETUP_TARGETS[0].key);
  const [phase, setPhase] = useState<string | undefined>(undefined);
  const [drain, setDrain] = useState<DrainStateId>('team');
  const [assumptions, setAssumptions] = useState<BestSetupAssumptions>(DEFAULT_ASSUMPTIONS);
  const [results, setResults] = useState<BestSetupResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const target = useMemo(() => findTarget(targetKey), [targetKey]);
  const phases = useMemo(() => targetPhases(target), [target]);

  useEffect(() => {
    let cancelled = false;
    setResults(null);
    setError(null);
    const req: BestSetupRequest = {
      type: WorkerRequestType.BEST_SETUP,
      data: {
        basePlayer: generateEmptyPlayer(),
        queries: mode === 'summary' ? summaryQueries() : [{ targetKey, phase }],
        assumptions,
        ttk: mode === 'summary' ? 'top' : 'all',
      },
    };
    // the worker may not be initialised on the very first render; retry shortly
    const send = (attempt: number) => {
      if (!calc.isReady() && attempt < 20) {
        setTimeout(() => send(attempt + 1), 100);
        return;
      }
      calc.do(req)
        .then((resp) => {
          if (!cancelled) setResults(resp.payload as BestSetupResult[]);
        })
        .catch((e: Error) => {
          if (!cancelled) setError(e.message);
        });
    };
    send(0);
    return () => {
      cancelled = true;
    };
  }, [calc, mode, targetKey, phase, assumptions]);

  const onLoad = useCallback((row: PresetResult) => {
    loadIntoCalculator(row, targetKey, results?.[0]?.phase, drain, assumptions).catch(console.error);
  }, [targetKey, results, drain, assumptions]);

  const tabClass = (active: boolean) => `px-3 py-1 rounded text-sm border ${active
    ? 'bg-orange-400 dark:bg-orange-700 text-white border-orange-500'
    : 'bg-btns-400 dark:bg-dark-500 text-white border-transparent hover:bg-btns-300 dark:hover:bg-dark-200'}`;

  return (
    <div className="max-w-[1420px] mx-auto mt-4 mb-8 px-2">
      <div className="sm:rounded shadow-lg bg-tile dark:bg-dark-300">
        <div className="px-4 py-3.5 border-b-body-400 bg-body-100 dark:bg-dark-400 dark:border-b-dark-200 border-b sm:rounded-t flex flex-wrap gap-2 justify-between items-center">
          <h2 className="font-serif text-lg tracking-tight font-bold dark:text-white">Best setup · The Fractured Archive</h2>
          <div className="flex gap-1">
            <button type="button" className={tabClass(mode === 'boss')} onClick={() => setMode('boss')}>Per boss</button>
            <button type="button" className={tabClass(mode === 'summary')} onClick={() => setMode('summary')} data-testid="summary-tab">Summary</button>
          </div>
        </div>
        <div className="p-4 flex flex-col gap-3 dark:text-body-200">
          <AssumptionsBox value={assumptions} onChange={setAssumptions} />

          {mode === 'boss' && (
            <div className="flex flex-wrap gap-3 items-center">
              <label htmlFor="bs-boss" className="flex items-center gap-1 text-sm">
                Boss
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
                  {BEST_SETUP_TARGETS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </label>
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
            </div>
          )}

          {error && <div className="text-red-600">{`Error: ${error}`}</div>}
          {!results && !error && (
            <div className="flex items-center gap-2 text-sm" data-testid="loading">
              <Spinner className="w-4" />
              Computing…
            </div>
          )}
          {results && mode === 'boss' && results[0] && (
            <BossView result={results[0]} drain={drain} onLoad={onLoad} />
          )}
          {results && mode === 'summary' && <SummaryView results={results} />}

          <div className="text-[11px] text-gray-500 dark:text-gray-400">
            {`Same calculation as the main calculator. Expected TTK uses the infobox HP (party-size scaling unverified) — compare setups, don't trust the absolute seconds. Prayers: ${Object.values(GROUP_PRAYER).join(' / ')}. See docs/BEST_SETUP.md for caveats.`}
          </div>
        </div>
      </div>
    </div>
  );
};

/** Own calc worker, like LoadoutComparison, so the main calculator's requests aren't affected. */
const BestSetup: React.FC = () => (
  <CalcProvider>
    <BestSetupInner />
  </CalcProvider>
);

export default BestSetup;
