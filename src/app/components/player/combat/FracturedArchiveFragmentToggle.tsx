import { observer } from 'mobx-react-lite';
import React from 'react';
import { useStore } from '@/state';
import Toggle from '@/app/components/generic/Toggle';
import { ELEMENTAL_FRAGMENT_MAX_HIT_BONUS, ELEMENTAL_FRAGMENT_NAMES } from '@/lib/fracturedArchive/equipment';

/**
 * Fractured Archive elemental fragment unlock for the selected spell's element (+2 base max hit).
 * Shown only for elemental spells. Logic: src/lib/fracturedArchive/equipment.ts.
 */
const FracturedArchiveFragmentToggle: React.FC = observer(() => {
  const store = useStore();
  const { spell, buffs } = store.player;
  const element = spell?.element;
  if (!element) {
    return null;
  }

  return (
    <Toggle
      checked={!!buffs.elementalFragments?.[element]}
      setChecked={(v) => {
        store.updatePlayer({ buffs: { elementalFragments: { [element]: v } } });
      }}
      label={(
        <>
          {ELEMENTAL_FRAGMENT_NAMES[element]}
          {' '}
          <span
            className="align-super underline decoration-dotted cursor-help text-xs text-gray-300"
            data-tooltip-id="tooltip"
            data-tooltip-content={`Unlocked (broken) from The Fractured Archive: +${ELEMENTAL_FRAGMENT_MAX_HIT_BONUS} base max hit for ${element} spells.`}
          >
            ?
          </span>
        </>
      )}
    />
  );
});

export default FracturedArchiveFragmentToggle;
