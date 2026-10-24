'use client';

import React from 'react';
import EquipmentSelect from '@/app/components/player/equipment/EquipmentSelect';
import { ItemIcon } from '@/app/components/bestSetup/ItemIcons';
import { equipmentImageUrl } from '@/lib/fracturedArchive/loadoutIcons';
import { resolveItem } from '@/lib/fracturedArchive/loadout';
import { RAID4_REWARDS } from '@/lib/fracturedArchive/ownership';

// Phase 26: "Items I don't own" (src/lib/fracturedArchive/ownership.ts). Global (every raid tab), kept in localStorage
// by BestSetup.tsx. Search / Summary mark rows that use a listed item (or, with "Only items I own", skip them); the Plan
// tab always leaves them out.

const imageOf = (name: string): string | null => {
  try {
    return equipmentImageUrl(resolveItem(name).image);
  } catch {
    return null;
  }
};

const NotOwnedBox: React.FC<{ value: string[], onChange: (names: string[]) => void }> = ({ value, onChange }) => {
  const add = (name: string) => {
    if (!value.includes(name)) onChange([...value, name]);
  };
  const quick = RAID4_REWARDS.filter((n) => !value.includes(n));
  return (
    <div className="flex flex-col gap-1" data-testid="not-owned">
      <div className="flex flex-wrap gap-2 items-center">
        <span
          className="font-semibold"
          title="Everything assumes max gear. Cross off what you don't have: the Plan tab leaves these out; Search and Summary still show the true best but mark rows that use them (or skip them with &quot;Only items I own&quot;). Saved in this browser."
        >
          Items I don&apos;t own:
        </span>
        {value.length === 0 && <span className="text-gray-500 dark:text-gray-400" data-testid="not-owned-empty">none (max gear assumed)</span>}
        {value.map((name) => (
          <span
            key={name}
            className="flex items-center gap-1 border border-red-400 bg-red-50 dark:bg-red-900/30 rounded px-1 line-through decoration-red-500/60"
            data-testid="not-owned-item"
            data-name={name}
            title={`${name} (and its variants: charged / uncharged, ornament, upgraded)`}
          >
            <ItemIcon name={name} src={imageOf(name)} size={18} />
            {name}
            <button
              type="button"
              className="text-red-600 ml-1 no-underline"
              style={{ textDecoration: 'none' }}
              title={`I own ${name}`}
              aria-label={`Remove ${name}`}
              data-testid="not-owned-remove"
              onClick={() => onChange(value.filter((x) => x !== name))}
            >
              ×
            </button>
          </span>
        ))}
        {quick.map((name) => (
          <button
            key={name}
            type="button"
            className="flex items-center gap-1 underline"
            title={`I don't own ${name} (Fractured Archive reward)`}
            data-testid="not-owned-quick"
            data-name={name}
            onClick={() => add(name)}
          >
            <ItemIcon name={name} src={imageOf(name)} size={16} />
            {`+ ${name}`}
          </button>
        ))}
        {value.length > 0 && (
          <button type="button" className="underline" data-testid="not-owned-clear" title="Back to max gear" onClick={() => onChange([])}>Clear</button>
        )}
      </div>
      <div className="max-w-[360px]" data-testid="not-owned-search">
        <EquipmentSelect onSelectedItemChange={(opt) => { if (opt) add(opt.equipment.name); }} />
      </div>
    </div>
  );
};

export default NotOwnedBox;
