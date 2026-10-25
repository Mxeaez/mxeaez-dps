'use client';

import React, { useMemo } from 'react';
import { buildTargetMonster, DrainStateId, findTarget } from '@/lib/fracturedArchive/bestSetup';
import { BestSetupAssumptions } from '@/lib/fracturedArchive/presets';
import { damageSpecRanking, gainPerFullBar } from '@/lib/fracturedArchive/damageSpecs';
import { itemImageByName } from '@/lib/fracturedArchive/loadoutIcons';
import { ItemIcon } from '@/app/components/bestSetup/ItemIcons';

// Phase 36: the Search tab's "Specs" box (user, 2026-10-24: "best spec weapon per boss"): every damage-spec weapon on
// the selected boss / phase under the selected drain state, best first: E[damage] per spec (upstream's spec calc), net
// of what the top row's normal attacks deal in the spec's ticks, and the seconds one spec saves at the current party
// (net ÷ (team-DPS multiplier × DPS), the time model's rate). Data: damageSpecs.ts `damageSpecRanking`. Phase 37: plain
// headers (Avg damage, Gain over normal hits, Time saved, Cost) and the gain per 100% energy, the default order.

const SpecDamageBox: React.FC<{
  targetKey: string,
  phase: string | undefined,
  drain: DrainStateId,
  assumptions: BestSetupAssumptions,
  /** DPS of the loadout the spec replaces (the top Search row). */
  dps: number,
  /** Team-DPS multiplier (the time model's players at your DPS). */
  mult: number,
}> = ({
  targetKey, phase, drain, assumptions, dps, mult,
}) => {
  // phase 37 (user, 2026-10-25): plain-word headers, and sorted by the gain per 100% energy (the number to compare
  // weapons by when energy is the limit); weapons that can't hit last
  const rows = useMemo(() => {
    const { monster } = buildTargetMonster(findTarget(targetKey), phase, drain, assumptions);
    return damageSpecRanking(monster, assumptions, dps, mult)
      .map((r, i) => ({ ...r, perEnergy: gainPerFullBar(r), i }))
      .sort((a, b) => (Number(b.canHit) - Number(a.canHit)) || (b.perEnergy - a.perEnergy) || (a.i - b.i));
  }, [targetKey, phase, drain, assumptions, dps, mult]);
  return (
    <details className="text-xs border border-body-400 dark:border-dark-200 rounded p-2" data-testid="spec-damage-box" open>
      <summary className="cursor-pointer font-semibold" title={`Damage special attacks on this boss with these drains: average damage per spec, minus what your best loadout here (${dps.toFixed(3)} DPS) deals in the spec's ticks, and the seconds one spec saves (gain ÷ (${mult} × DPS)); best gain per 100% energy first`}>
        Specs (damage)
      </summary>
      {/* phase 37: six columns are wider than a phone: the table scrolls sideways inside the box */}
      <div className="overflow-x-auto">
        <table className="mt-1" data-testid="spec-damage-table">
          <thead>
            <tr className="text-left">
              <th className="pr-3">Weapon</th>
              <th className="pr-3 text-right" title="Average damage of one spec, hits and misses included">Avg damage</th>
              <th className="pr-3 text-right" title="Average spec damage minus what your normal attacks would have dealt in the spec's ticks (hover a row for its ticks)">Gain over normal hits</th>
              <th className="pr-3 text-right" title="Seconds one spec saves at the team's DPS">Time saved</th>
              <th className="pr-3 text-right" title="Spec energy">Cost</th>
              <th className="text-right" title="Gain over normal hits ÷ cost × 100: the number to compare weapons by when energy is the limit">Gain per 100% energy</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.weapon} data-testid="spec-damage-row" data-weapon={r.weapon} data-saved={r.saved.toFixed(2)} data-per-energy={r.perEnergy.toFixed(1)} title={r.canHit ? `${r.variant}; ${r.ticks} ticks` : 'can\'t hit this boss / phase with this weapon'} className={r.canHit ? '' : 'opacity-50'}>
                <td className="pr-3">
                  <span className="flex items-center gap-1">
                    <ItemIcon name={r.label} src={itemImageByName(r.label)} size={18} />
                    {r.label}
                  </span>
                </td>
                <td className="pr-3 text-right font-mono">{r.expected.toFixed(1)}</td>
                <td className="pr-3 text-right font-mono" title={r.canHit ? `${r.expected.toFixed(1)} − your normal attacks' damage in ${r.ticks} ticks` : undefined}>{r.net.toFixed(1)}</td>
                <td className="pr-3 text-right font-mono">{r.canHit ? `${r.saved.toFixed(2)} s` : '—'}</td>
                <td className="pr-3 text-right font-mono">{`${r.energy}%`}</td>
                <td className="text-right font-mono font-bold">{r.canHit ? r.perEnergy.toFixed(1) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
};

export default SpecDamageBox;
