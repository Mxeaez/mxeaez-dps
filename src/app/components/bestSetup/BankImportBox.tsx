'use client';

import React, { useRef, useState } from 'react';
import {
  BankImportInfo, BankItem, loadBankImport, matchBank, mergeNotOwned, parseBank, poolGearNames, saveBankImport, shortDate,
} from '@/lib/fracturedArchive/bankImport';
import {
  LEVEL_SKILLS, parseCharacter, SavedLevels, SavedLevelSkills,
} from '@/lib/fracturedArchive/levels';

// Phase 39b: "Import from RuneLite" (character-exporter plugin: bank.json + character.json). Parsed in the browser,
// nothing is uploaded, the account name is never read or stored. A confirm panel comes first.

interface Pending {
  bank?: { exportedAt: string | null, matched: string[], missing: string[], total: number },
  levels?: { levels: SavedLevelSkills, exportedAt: string | null },
  errors: string[],
}

const BankImportBox: React.FC<{
  notOwned: string[],
  onNotOwned: (names: string[]) => void,
  levels?: SavedLevels | null,
  onLevels?: (l: SavedLevels | null) => void,
}> = ({
  notOwned, onNotOwned, levels = null, onLevels,
}) => {
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [unticked, setUnticked] = useState<string[]>([]);
  const [info, setInfo] = useState<BankImportInfo | null>(() => loadBankImport());

  const readFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    const next: Pending = { errors: [] };
    for (const file of Array.from(files)) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const json = JSON.parse(await file.text());
        if (json && typeof json === 'object' && 'stats' in json) {
          const c = parseCharacter(json);
          if ('error' in c) next.errors.push(`${file.name}: ${c.error}`);
          else next.levels = c;
        } else if (json && typeof json === 'object' && 'items' in json) {
          const b = parseBank(json);
          if ('error' in b) next.errors.push(`${file.name}: ${b.error}`);
          else {
            const m = matchBank(b.items as BankItem[]);
            next.bank = {
              exportedAt: b.exportedAt, matched: m.matched, missing: m.missing, total: b.items.length,
            };
          }
        } else {
          next.errors.push(`${file.name}: not a bank.json or character.json export.`);
        }
      } catch {
        next.errors.push(`${file.name}: could not be read as JSON.`);
      }
    }
    setUnticked([]);
    setPending(next);
    if (input.current) input.current.value = '';
  };

  const apply = () => {
    if (!pending) return;
    const now = new Date().toISOString();
    if (pending.bank) {
      const missing = pending.bank.missing.filter((n) => !unticked.includes(n));
      onNotOwned(mergeNotOwned(notOwned, missing, poolGearNames()));
      const i: BankImportInfo = {
        exportedAt: pending.bank.exportedAt, importedAt: now, matched: pending.bank.matched.length + unticked.length, missing: missing.length,
      };
      saveBankImport(i);
      setInfo(i);
    }
    if (pending.levels && onLevels) {
      onLevels({ levels: pending.levels.levels, exportedAt: pending.levels.exportedAt, importedAt: now });
    }
    setPending(null);
  };

  const canApply = !!pending && (!!pending.bank || (!!pending.levels && !!onLevels));
  return (
    <div className="flex flex-col gap-1" data-testid="bank-import">
      <div className="flex flex-wrap gap-2 items-center">
        <button
          type="button"
          className="underline"
          data-testid="import-open"
          title="Pick bank.json and/or character.json from the RuneLite character-exporter plugin (.runelite/character-exporter/<account>/). Read in this browser only: nothing is uploaded and the account name is not kept."
          onClick={() => input.current?.click()}
        >
          Import from RuneLite…
        </button>
        <input
          ref={input}
          type="file"
          accept=".json,application/json"
          multiple
          className="hidden"
          data-testid="import-files"
          onChange={(e) => { readFiles(e.target.files); }}
        />
        {info && (
          <span className="text-gray-600 dark:text-gray-400" data-testid="import-info">
            {`bank imported ${shortDate(info.importedAt)}${info.exportedAt ? ` (exported ${shortDate(info.exportedAt)})` : ''}: ${info.matched} pool items found, ${info.missing} not owned`}
          </span>
        )}
        {levels && (
          <span className="text-gray-600 dark:text-gray-400" data-testid="import-levels-info">
            {`levels imported ${shortDate(levels.importedAt)}`}
            {' '}
            <button type="button" className="underline" data-testid="import-levels-clear" title="Back to all 99s" onClick={() => onLevels?.(null)}>use 99s</button>
          </span>
        )}
      </div>
      {pending && (
        <div className="border border-body-400 dark:border-dark-200 rounded p-2 flex flex-col gap-1 max-w-[900px]" data-testid="import-confirm">
          {pending.errors.map((e) => <div key={e} className="text-red-600" data-testid="import-error">{e}</div>)}
          {pending.bank && (
            <div data-testid="import-bank">
              <div>
                <span data-testid="import-bank-summary">
                  {`Matched ${pending.bank.matched.length} pool items; ${pending.bank.missing.length} not found`}
                </span>
                {' '}
                - untick any you have on you or in the POH / seed vault / group storage (the export is the bank only; worn and
                carried gear is not in it). Ticked items are marked not owned; this replaces the pool items in your current list.
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                {pending.bank.missing.map((n) => (
                  <label key={n} className="flex items-center gap-1" htmlFor={`import-missing-${n}`}>
                    <input
                      id={`import-missing-${n}`}
                      type="checkbox"
                      data-testid="import-missing"
                      data-name={n}
                      checked={!unticked.includes(n)}
                      onChange={(e) => setUnticked((u) => (e.target.checked ? u.filter((x) => x !== n) : [...u, n]))}
                    />
                    {n}
                  </label>
                ))}
              </div>
            </div>
          )}
          {pending.levels && (
            <div data-testid="import-levels">
              {onLevels ? 'Levels (potion boosts are recomputed from these): ' : 'Levels (not applied here): '}
              {LEVEL_SKILLS.filter((s) => s.key !== 'mining' && s.key !== 'herblore').map((s) => (
                <span key={s.key} className="mr-2" data-skill={s.key}>{`${s.name} ${pending.levels!.levels[s.key]}`}</span>
              ))}
            </div>
          )}
          <div className="flex gap-3">
            <button type="button" className="underline font-semibold" disabled={!canApply} data-testid="import-apply" onClick={apply}>Apply</button>
            <button type="button" className="underline" data-testid="import-cancel" onClick={() => setPending(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BankImportBox;
