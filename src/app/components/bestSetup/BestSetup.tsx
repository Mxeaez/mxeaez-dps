'use client';

import React, { useMemo, useState } from 'react';
import { PotionMap } from '@/utils';
import Potion from '@/enums/Potion';
import {
  BEST_SETUP_TARGETS,
  DRAIN_STATES,
  DrainStateId,
  findTarget,
  targetPhases,
} from '@/lib/fracturedArchive/bestSetup';
import {
  BestSetupAssumptions, DEFAULT_ASSUMPTIONS, StyleGroup,
} from '@/lib/fracturedArchive/presets';
import SearchView from '@/app/components/bestSetup/SearchView';
import SummaryView from '@/app/components/bestSetup/SummaryView';
import { targetImageUrl } from '@/lib/fracturedArchive/loadoutIcons';
import { ItemIcon } from '@/app/components/bestSetup/ItemIcons';

// Fractured Archive "Best setup" view (phase 8; "Search" tab phase 9). Phase 12: Search is the default tab; item icons.
// Phase 13: the "Per boss" preset table was removed (the presets still seed the search and give the "vs best preset"
// column); Summary is search-based (SummaryView.tsx). Docs: docs/BEST_SETUP.md.

const POTION_OPTIONS = (Object.keys(PotionMap) as unknown as string[])
  .map((k) => Number(k) as Potion)
  .sort((a, b) => PotionMap[a].order - PotionMap[b].order);

const GROUP_PRAYER: Record<StyleGroup, string> = { melee: 'Piety', ranged: 'Rigour', magic: 'Augury' };

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

/** The searches run in their own worker (src/worker/searchWorker.ts), so the main calculator isn't affected. */
const BestSetup: React.FC = () => {
  const [mode, setMode] = useState<'summary' | 'search'>('search');
  const [targetKey, setTargetKey] = useState(BEST_SETUP_TARGETS[0].key);
  const [phase, setPhase] = useState<string | undefined>(undefined);
  const [drain, setDrain] = useState<DrainStateId>('team');
  const [assumptions, setAssumptions] = useState<BestSetupAssumptions>(DEFAULT_ASSUMPTIONS);

  const target = useMemo(() => findTarget(targetKey), [targetKey]);
  const phases = useMemo(() => targetPhases(target), [target]);

  const tabClass = (active: boolean) => `px-3 py-1 rounded text-sm border ${active
    ? 'bg-orange-400 dark:bg-orange-700 text-white border-orange-500'
    : 'bg-btns-400 dark:bg-dark-500 text-white border-transparent hover:bg-btns-300 dark:hover:bg-dark-200'}`;

  return (
    <div className="max-w-[1420px] mx-auto mt-4 mb-8 px-2">
      <div className="sm:rounded shadow-lg bg-tile dark:bg-dark-300">
        <div className="px-4 py-3.5 border-b-body-400 bg-body-100 dark:bg-dark-400 dark:border-b-dark-200 border-b sm:rounded-t flex flex-wrap gap-2 justify-between items-center">
          <h2 className="font-serif text-lg tracking-tight font-bold dark:text-white">Best setup · The Fractured Archive</h2>
          <div className="flex gap-1">
            <button type="button" className={tabClass(mode === 'search')} onClick={() => setMode('search')} data-testid="search-tab">Search</button>
            <button type="button" className={tabClass(mode === 'summary')} onClick={() => setMode('summary')} data-testid="summary-tab">Summary</button>
          </div>
        </div>
        <div className="p-4 flex flex-col gap-3 dark:text-body-200">
          <AssumptionsBox value={assumptions} onChange={setAssumptions} />

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

          {mode === 'search' && (
            <SearchView
              targetKey={targetKey}
              phase={phase ?? phases[0]}
              drain={drain}
              assumptions={assumptions}
            />
          )}
          {mode === 'summary' && <SummaryView assumptions={assumptions} />}

          <div className="text-[11px] text-gray-500 dark:text-gray-400">
            {`Same calculation as the main calculator. Expected TTK uses the infobox HP (party-size scaling unverified) — compare setups, don't trust the absolute seconds. Prayers: ${Object.values(GROUP_PRAYER).join(' / ')}. See docs/BEST_SETUP.md for caveats.`}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BestSetup;
