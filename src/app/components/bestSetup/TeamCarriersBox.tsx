import React, { useState } from 'react';
import {
  BestSetupAssumptions, carriersUseLightbearer, ItemRef, TeamSpecAssumptions, withCarrierLightbearer,
} from '@/lib/fracturedArchive/presets';
import { SPEC_WEAPONS } from '@/lib/fracturedArchive/specs';
import { resolveItem } from '@/lib/fracturedArchive/loadout';
import { equipmentImageUrl } from '@/lib/fracturedArchive/loadoutIcons';
import { ItemIcon } from '@/app/components/bestSetup/ItemIcons';

const itemImage = (ref: ItemRef): string | null => {
  try {
    return equipmentImageUrl(resolveItem(ref).image);
  } catch {
    return null;
  }
};

// Phase 39: the Team carriers, moved from Advanced to the Plan tab's inputs. Compact: the carriers the planner picked (or
// the manual counts) as icon x number, with a small "Set manually" toggle that opens the mode, counts and Lightbearer.
const TEAM_WEAPONS: (keyof TeamSpecAssumptions['carriers'])[] = ['elderMaul', 'dwh', 'bgs', 'tonalztics', 'ayak'];

const TeamCarriersBox: React.FC<{
  value: BestSetupAssumptions,
  onChange: (a: BestSetupAssumptions) => void,
  /** The last plan's carriers (shown while the planner decides). */
  planCarriers?: TeamSpecAssumptions['carriers'] | null,
}> = ({ value, onChange, planCarriers }) => {
  const [open, setOpen] = useState(false);
  const set = (patch: Partial<BestSetupAssumptions>) => onChange({ ...value, ...patch });
  const carrierTotal = Object.values(value.team.carriers).reduce((t, n) => t + n, 0);
  const shown = !value.team.manual && planCarriers ? planCarriers : value.team.carriers;
  const lightbearer = carriersUseLightbearer(value.team);
  let note = '(run a plan to fill these)';
  if (value.team.manual) note = '(set manually)';
  else if (planCarriers) note = '(from the last plan)';
  return (
    <div className="flex flex-col gap-1" data-testid="team-specs">
      <div className="flex flex-wrap gap-x-3 gap-y-1 items-center">
        <span className="font-semibold" title={`Team drain state: teammates who bring a drain weapon spec twice each at the start of every fight. The party size (${value.partySize}) is set above`}>
          Team carriers:
        </span>
        <span className="flex flex-wrap gap-x-3 items-center" data-testid="team-carriers-shown">
          {TEAM_WEAPONS.map((k) => (
            <span key={k} className="flex items-center gap-1" data-weapon={k} data-count={shown[k]} title={`${shown[k]} teammate(s) bring ${SPEC_WEAPONS[k].label} and spec it at the start`}>
              <ItemIcon name={SPEC_WEAPONS[k].label} src={itemImage(SPEC_WEAPONS[k].item)} size={18} />
              <span className="font-mono">{shown[k]}</span>
            </span>
          ))}
          {lightbearer && <span className="text-gray-500 dark:text-gray-400">(Lightbearer)</span>}
        </span>
        <span className="text-gray-500 dark:text-gray-400" data-testid="team-carriers-note">
          {note}
        </span>
        <button type="button" className="btn text-xs py-0" data-testid="team-carriers-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Hide' : 'Set manually'}
        </button>
        {value.team.manual && carrierTotal > value.partySize && (
          <span className="text-red-600" data-testid="team-too-many">{`${carrierTotal} carriers > party size: only the first ${value.partySize} count`}</span>
        )}
      </div>
      {open && (
        <div className="flex flex-wrap gap-x-3 gap-y-2 items-center pl-2 border-l-2 border-body-400 dark:border-dark-200" data-testid="team-carriers-manual">
          <select
            id="bs-team-mode"
            className="form-control text-xs py-0.5"
            value={value.team.manual ? 'manual' : 'auto'}
            data-testid="team-carrier-mode"
            title="Planner decides: the Plan tab picks the carriers (the ones that save the most route time) and its Team drains use them; Search and Summary use the last plan's. Set manually: every tab uses the counts here"
            onChange={(e) => set({ team: { ...value.team, manual: e.target.value === 'manual' } })}
          >
            <option value="auto">Planner decides (Plan tab)</option>
            <option value="manual">Set manually</option>
          </select>
          {TEAM_WEAPONS.map((k) => (
            <label key={k} htmlFor={`bs-team-${k}`} className="flex items-center gap-1" title={`How many teammates bring ${SPEC_WEAPONS[k].label} and spec it at the start`}>
              <ItemIcon name={SPEC_WEAPONS[k].label} src={itemImage(SPEC_WEAPONS[k].item)} size={18} />
              <span className="sr-only">{SPEC_WEAPONS[k].label}</span>
              <input
                id={`bs-team-${k}`}
                type="number"
                disabled={!value.team.manual}
                className="form-control text-xs py-0.5 w-12 disabled:opacity-50"
                min={0}
                max={8}
                value={shown[k]}
                onChange={(e) => set({
                  team: {
                    ...value.team,
                    carriers: { ...value.team.carriers, [k]: Math.min(8, Math.max(0, Math.floor(Number(e.target.value) || 0))) },
                  },
                })}
              />
            </label>
          ))}
          <label htmlFor="bs-team-lightbearer" className="flex items-center gap-1" title="Every carrier wears Lightbearer (spec energy back twice as fast). Only changes the whole-fight figures: the ranking uses the first round, done with full energy">
            <input
              id="bs-team-lightbearer"
              type="checkbox"
              checked={lightbearer}
              onChange={(e) => set({ team: withCarrierLightbearer(value.team, e.target.checked) })}
            />
            carriers use Lightbearer
          </label>
        </div>
      )}
    </div>
  );
};

export default TeamCarriersBox;
