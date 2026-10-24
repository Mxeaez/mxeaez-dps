import React from 'react';
import { RaidConfig, TimeSettings } from '@/lib/raids';

// The raid's time-model settings (phase 16/18, from its `timeSettingFields`; each model has its own settings object).
// Phase 23: moved out of the removed Routes tab into the Advanced box; the Plan tab's route times use them.

const TimeSettingsBox: React.FC<{
  raid: RaidConfig, value: TimeSettings, onChange: (s: TimeSettings) => void,
}> = ({ raid, value, onChange }) => (
  <div className="flex flex-col gap-1" data-testid="time-settings">
    <div className="font-semibold" title={raid.timeModelNote}>Time model (Plan tab)</div>
    <div className="text-gray-500 dark:text-gray-400">{raid.timeModelNote}</div>
    <div className="flex flex-wrap gap-x-4 gap-y-2 items-center">
      {raid.timeSettingFields.map((f) => {
        const id = `rt-${f.key}`;
        const v = value[f.key];
        if (f.kind === 'bool') {
          return (
            <label key={f.key} htmlFor={id} className="flex items-center gap-1" title={f.title}>
              <input id={id} type="checkbox" checked={v === true} onChange={(e) => onChange({ ...value, [f.key]: e.target.checked })} />
              {f.label}
            </label>
          );
        }
        if (f.kind === 'select') {
          return (
            <label key={f.key} htmlFor={id} className="flex items-center gap-1" title={f.title}>
              {f.label}
              <select id={id} className="form-control text-xs py-0.5" value={String(v)} onChange={(e) => onChange({ ...value, [f.key]: e.target.value })}>
                {(f.options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
          );
        }
        const pct = f.kind === 'percent';
        const n = typeof v === 'number' ? v : 0;
        return (
          <label key={f.key} htmlFor={id} className="flex items-center gap-1" title={f.title}>
            {f.label}
            <input
              id={id}
              type="number"
              className="form-control text-xs py-0.5 w-16"
              min={0}
              max={pct ? 100 : f.max}
              value={pct ? Math.round(n * 1000) / 10 : n}
              onChange={(e) => {
                const x = Math.max(0, Number(e.target.value) || 0);
                onChange({ ...value, [f.key]: pct ? Math.min(100, x) / 100 : x });
              }}
            />
            {pct ? '%' : f.unit}
          </label>
        );
      })}
      <button type="button" className="underline" onClick={() => onChange(raid.defaultTimeSettings)}>Reset</button>
    </div>
  </div>
);

export default TimeSettingsBox;
