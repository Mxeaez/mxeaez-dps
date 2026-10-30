import React from 'react';
import type { PlanVariant } from '@/lib/fracturedArchive/planner';
import { variantLines } from '@/lib/fracturedArchive/variantText';
import { LOADOUT_SLOT_ORDER, searchItemIcon } from '@/lib/fracturedArchive/loadoutIcons';
import { LoadoutIconRow } from '@/app/components/bestSetup/ItemIcons';

// Phase 40 (ROADMAP 40): the variations the raid forces on a few players (the FA's Xarth freezer). Everyone runs the
// kit above; the variant's headcount adds its switch. "I'm this player" shows that kit (the times are the team's either
// way: the plan already counts the variant player at the variant's DPS).
const VariantsBox: React.FC<{
  variants: PlanVariant[],
  partySize: number,
  labelOf: (encounter: string) => string,
  mine: string[],
  onMine: (ids: string[]) => void,
}> = ({
  variants, partySize, labelOf, mine, onMine,
}) => (
  <div className="text-sm flex flex-col gap-1 px-2 py-1 rounded border border-blue-400 bg-blue-50 dark:bg-blue-900/30" data-testid="plan-variants">
    <div className="font-semibold">Required variants (everyone else runs the kit above)</div>
    {variants.map((v) => {
      const l = variantLines(v, partySize, labelOf(v.encounter));
      const me = mine.includes(v.id);
      return (
        <div key={v.id} className="flex flex-col gap-0.5" data-testid="plan-variant" data-id={v.id} data-headcount={v.headcount} data-extra={v.extraItems.length} data-seconds={v.seconds.toFixed(2)} data-variant-dps={v.variantDps.toFixed(3)} data-base-dps={v.baseDps.toFixed(3)} data-me={me ? 'true' : 'false'}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold" data-testid="plan-variant-head">{l.head}</span>
            <label htmlFor={`plan-variant-me-${v.id}`} className="text-xs flex items-center gap-1" title="Tick if you are this player: the Plan shows your kit with the variant">
              <input
                id={`plan-variant-me-${v.id}`}
                type="checkbox"
                checked={me}
                data-testid="plan-variant-me"
                onChange={(e) => onMine(e.target.checked ? [...mine.filter((x) => x !== v.id), v.id] : mine.filter((x) => x !== v.id))}
              />
              I&apos;m this player
            </label>
          </div>
          <div className="text-xs">{l.role}</div>
          <div className="text-xs flex flex-wrap items-center gap-1" data-testid="plan-variant-switch">
            <span>{`${v.loadout.label}:`}</span>
            <LoadoutIconRow icons={LOADOUT_SLOT_ORDER.filter((s) => v.loadout.equipment[s]).map((s) => searchItemIcon(s, v.loadout.equipment[s]!))} size={18} />
            <span className="text-gray-600 dark:text-gray-300" data-testid="plan-variant-slots">{l.slots}</span>
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-300" data-testid="plan-variant-team" title="The time model averages the team's DPS on the variant's share of the encounter: the variant player at the variant loadout's DPS, the others at yours (UNVERIFIED D37)">{l.team}</div>
          {me && (
            <div className="text-xs font-semibold" data-testid="plan-variant-mine">
              {`Your kit: ${l.mine}; carry ${v.extraItems.map((it) => it.name).join(', ') || 'nothing extra'}.`}
            </div>
          )}
        </div>
      );
    })}
  </div>
);

export default VariantsBox;
