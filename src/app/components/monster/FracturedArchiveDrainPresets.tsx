import React from 'react';
import { observer } from 'mobx-react-lite';
import { toJS } from 'mobx';
import { useStore } from '@/state';
import { FRACTURED_ARCHIVE_MONSTER_IDS } from '@/lib/fracturedArchive/constants';
import { DRAIN_PRESETS, DrainPreset, drainPresetReductions } from '@/lib/fracturedArchive/drains';

const WEAPON_PRESETS = DRAIN_PRESETS.filter((p) => p.options);
const RESET_PRESET = DRAIN_PRESETS.find((p) => !p.options)!;

/**
 * "Max drain" buttons in the Defensive Reductions panel, Fractured Archive monsters only. Each button writes the
 * spec counts from src/lib/fracturedArchive/drains.ts into the normal inputs below, so they can still be tweaked.
 */
const FracturedArchiveDrainPresets: React.FC = observer(() => {
  const store = useStore();
  const { monster } = store;

  if (!FRACTURED_ARCHIVE_MONSTER_IDS.includes(monster.id)) {
    return null;
  }

  const apply = (p: DrainPreset) => store.updateMonster({
    inputs: { defenceReductions: drainPresetReductions(toJS(monster), p.id) },
  });

  const button = (p: DrainPreset, text: string) => (
    <button
      key={p.id}
      type="button"
      className="btn text-xs px-1.5 py-0.5"
      aria-label={p.label}
      data-tooltip-id="tooltip"
      data-tooltip-content={p.options
        ? `${p.label}: fewest specs to reach the defence floor${p.options.ayak ? ', plus Eye of Ayak damage to bring magic defence to 0' : ''}. Other reductions are cleared.`
        : 'Clear all defensive reductions'}
      onClick={() => apply(p)}
    >
      {text}
    </button>
  );

  return (
    <div className="mb-2 text-xs">
      <div className="flex justify-between items-center mb-1">
        <span className="text-gray-300">Max drain</span>
        {button(RESET_PRESET, RESET_PRESET.label)}
      </div>
      {[false, true].map((ayak) => (
        <div key={String(ayak)} className="flex flex-wrap items-center gap-1 mb-1">
          <span className="w-14">{ayak ? '+ Ayak' : 'Floor'}</span>
          {WEAPON_PRESETS.filter((p) => p.options!.ayak === ayak)
            .map((p) => button(p, p.label.replace(/^Floor \((.*)\).*$/, '$1')))}
        </div>
      ))}
    </div>
  );
});

export default FracturedArchiveDrainPresets;
