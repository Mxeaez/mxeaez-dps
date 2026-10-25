'use client';

import React, { useMemo } from 'react';
import {
  buildTargetMonster, DRAIN_STATES, DrainStateId, findTarget,
} from '@/lib/fracturedArchive/bestSetup';
import { BestSetupAssumptions } from '@/lib/fracturedArchive/presets';
import { drainModel, planLabelText } from '@/lib/fracturedArchive/specs';
import { formatProbability, recommendCarriers } from '@/lib/fracturedArchive/teamSpecs';
import DrainLineView, { DrainBrief } from '@/app/components/bestSetup/DrainLineView';
import { briefResultText } from '@/lib/fracturedArchive/drainLine';

// Phase 14: the drain plan of the selected drain state (text + P(floor)) and the team carrier table for the selected
// boss / phase, shown under the Search tab's selectors. All numbers come from specs.ts / teamSpecs.ts (pure).
// Phase 23: the plan is shown as "[icon] ×N" with the hit chance per spec (DrainLineView), the text as its tooltip;
// the carrier table is collapsed.
// Phase 34: the header is the short line ("[icon] 4 hits [icon] ≈ 39 magic def → Def 156 · Magic def 91"); the sentence
// form, the hit chances, the Solo budget, the chance of the floor and the per-boss minimum table are under "details".

const WEAPON_LABELS: Record<string, string> = {
  elderMaul: 'Elder maul', dwh: 'DWH', tonalztics: 'Tonalztics', bgs: 'BGS',
};

const SpecPlanPanel: React.FC<{
  targetKey: string,
  phase: string | undefined,
  drain: DrainStateId,
  assumptions: BestSetupAssumptions,
  /** Phase 33: shown instead of an empty line when the Solo drains have no spec weapons. */
  noSpecsNote?: string,
}> = ({
  targetKey, phase, drain, assumptions, noSpecsNote: noSpecsNoteIn,
}) => {
  const target = findTarget(targetKey);
  // phase 35: a target drains never apply to (adds, Vanguards, Verzik, ...) says so instead of "no spec weapons"
  const noDrains = !!target.noDrains && drain !== 'none';
  const noSpecsNote = noDrains ? undefined : noSpecsNoteIn;
  const { state, rec, floor } = useMemo(() => {
    const built = buildTargetMonster(target, phase, drain, assumptions);
    const model = drainModel(built.monster, assumptions);
    return {
      state: built.drain,
      floor: model.floor,
      rec: recommendCarriers(model, {
        partySize: assumptions.partySize,
        threshold: assumptions.floorThreshold,
        label: target.label,
      }),
    };
  }, [target, phase, drain, assumptions]);

  const cols = Array.from({ length: rec.partySize }, (_, i) => i + 1);
  const cell = (p: number) => (
    <td className={`text-right px-1 ${p >= rec.threshold ? 'font-semibold text-green-700 dark:text-green-400' : ''}`}>{formatProbability(p)}</td>
  );

  return (
    <div className="text-xs flex flex-col gap-1 border border-body-400 dark:border-dark-200 rounded p-2" data-testid="spec-plan">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold" title={DRAIN_STATES.find((d) => d.id === drain)?.description}>{`${DRAIN_STATES.find((d) => d.id === drain)?.label} drains:`}</span>
        {noSpecsNote && <span className="text-orange-700 dark:text-orange-300" data-testid="drain-no-specs">{noSpecsNote}</span>}
        {noDrains && <span className="text-orange-700 dark:text-orange-300" data-testid="drain-no-drains">{state.plan}</span>}
        {!noSpecsNote && !noDrains && (state.line
          ? <DrainBrief items={state.line.items} result={briefResultText(state.line, state.line.items, true)} title={state.line.text} />
          : <span>{state.plan}</span>)}
        {/* the full text stays available (tooltip of the line, and here for tests / copy) */}
        <span className="sr-only" data-testid="drain-plan">{state.plan}</span>
      </div>
      <details data-testid="spec-plan-details">
        <summary className="cursor-pointer text-gray-500 dark:text-gray-400" data-testid="spec-plan-details-toggle">details</summary>
        <div className="flex flex-col gap-1 mt-1 pl-2 border-l-2 border-body-400 dark:border-dark-200">
          {!noSpecsNote && state.line && <div><DrainLineView line={state.line} showBudget /></div>}
          {state.pFloor !== undefined && (
          <div className="text-gray-500 dark:text-gray-400" data-testid="drain-pfloor" title="P(floor): the chance this plan gets the boss to its Defence floor; the DPS uses the floor only when this is at least the confidence in Advanced">
            {`Chance of the Defence floor (${floor}): ${formatProbability(state.pFloor)}${state.label ? ` · full plan: ${planLabelText(state.label)}` : ''}`}
          </div>
          )}
          {/* phase 29 review: a party of 1 has no team (Solo only) */}
          {assumptions.partySize > 1 && !target.noDrains && (
          <details data-testid="team-table">
            <summary className="cursor-pointer">
              {`Per boss minimum at ${formatProbability(rec.threshold)} (for reference): ${rec.text}`}
            </summary>
            <div className="overflow-x-auto max-w-full">
              <table className="mt-1">
                <thead>
                  <tr>
                    <th className="text-left pr-2">P(floor) from the first round, carriers →</th>
                    {cols.map((c) => <th key={c} className="text-right px-1">{c}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rec.table.map((row) => (
                    <tr key={row.weapon}>
                      <td className="pr-2">{WEAPON_LABELS[row.weapon]}</td>
                      {row.p.map((p, i) => <React.Fragment key={cols[i]}>{cell(p)}</React.Fragment>)}
                    </tr>
                  ))}
                  <tr>
                    <td className="pr-2">Ayak (magic def 0)</td>
                    {rec.ayak.map((p, i) => <React.Fragment key={cols[i]}>{cell(p)}</React.Fragment>)}
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="text-gray-500 dark:text-gray-400">
              {`Each carrier specs twice at the start (100% energy). Exact binomial / convolution over the calculator's spec hit distributions; bold ≥ ${formatProbability(rec.threshold)}.`}
            </div>
          </details>
          )}
        </div>
      </details>
    </div>
  );
};

export default SpecPlanPanel;
