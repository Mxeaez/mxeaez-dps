import React from 'react';
import {
  briefItems, briefText, countText, DrainFacts, DrainLine, DrainLineItem, neededText,
} from '@/lib/fracturedArchive/drainLine';
import { equipmentImageUrl } from '@/lib/fracturedArchive/loadoutIcons';
import { ItemIcon } from '@/app/components/bestSetup/ItemIcons';

// Phase 23: a drain plan as "[icon] ×N" per weapon with the per-spec hit chance under each icon, then
// "→ Def 156 · Magic def 91". The full plan text is the tooltip. Data: src/lib/fracturedArchive/drainLine.ts.
// Phase 29: Tonalztics shows its hits ("×2 (4 hits)"). Phase 32: planned lines read "needs 4 landed hits · 4 specs (2
// carriers), 8 swings · 98%"; phase 34: "4 specs (2 carriers) = 8 attacks, 4 must land" (+ " · team: 6 specs (3 carriers) · 99.8%" when the team brings more; Solo: no carriers).

const pct = (p: number) => `${Math.round(p * 100)}%`;

const DrainLineView: React.FC<{
  line: DrainLine | undefined,
  /** Smaller icons, no "Magic def" part (the calculator's Max-drain buttons). */
  compact?: boolean,
  /** Hide the "→ Def …" part. */
  noResult?: boolean,
  /** Show the Solo budget ("fight ≈ 48 s → 2 specs"). */
  showBudget?: boolean,
  className?: string,
}> = ({
  line, compact, noResult, showBudget, className,
}) => {
  if (!line) return null;
  const size = compact ? 16 : 22;
  return (
    <span
      className={`inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 ${className ?? ''}`}
      title={line.text}
      data-testid="drain-line"
    >
      {line.items.length === 0 && <span className="text-gray-500 dark:text-gray-400">no specs</span>}
      {line.items.map((it) => (
        <span
          key={it.weapon}
          className={`inline-flex flex-col items-center leading-none ${it.count === 0 ? 'opacity-50' : ''}`}
          title={it.title}
          data-testid="drain-line-item"
          data-weapon={it.weapon}
          data-count={it.count}
          data-short={it.short ?? 0}
        >
          <span className="inline-flex items-center gap-0.5">
            <ItemIcon name={it.label} src={equipmentImageUrl(it.image)} size={size} title={it.title} />
            <span className="font-mono font-semibold" data-testid="drain-line-count">{it.unit === 'dmg' ? `${it.count} dmg` : (neededText(it) ?? countText(it.count, it.hits))}</span>
            {it.count === 0 && it.short ? <span className="text-gray-500 dark:text-gray-400" data-testid="drain-line-no-energy">(no energy)</span> : null}
          </span>
          {it.hitChance !== undefined && it.count > 0 && (
            <span className="text-[11px] text-gray-500 dark:text-gray-400" data-testid="drain-line-hit">{`${pct(it.hitChance)} land`}</span>
          )}
        </span>
      ))}
      {!noResult && (
        <span className="whitespace-nowrap" data-testid="drain-line-result">
          {`→ Def ${line.defAfter}${compact ? '' : ` · Magic def ${line.magicDefAfter}`}`}
        </span>
      )}
      {showBudget && line.budget && (
        <span className="text-gray-500 dark:text-gray-400 whitespace-nowrap" data-testid="drain-line-budget" title="Your spec energy: 100% + 10% per 30 s (15 s with Lightbearer); the fight length is the boss's undrained time to kill with the best preset">
          {`(fight ≈ ${line.budget.fightSeconds} s → ${line.budget.specs} spec${line.budget.specs === 1 ? '' : 's'})`}
        </span>
      )}
      {line.note && (
        <span className="basis-full text-[11px] text-amber-700 dark:text-amber-400" data-testid="drain-line-note">{line.note}</span>
      )}
    </span>
  );
};

/**
 * Phase 34: the short drain line: per weapon a large icon and one bold number ("4 hits", "2 specs", "≈ 39 magic def";
 * drainLine.ts `briefText`), then a small "→ Def 156". The sentence form (DrainLineView) is the tooltip / details.
 */
export const DrainBrief: React.FC<{
  items: DrainLineItem[],
  result?: string,
  /** Tooltip of the whole line (the sentence form). */
  title?: string,
  /**
   * Phase 38g fix (Search, Solo): the landed specs / hits read "2 must land" / "4 hits must land", so the best case doesn't
   * read as the 95% count of the drain facts line.
   */
  mustLand?: boolean,
  size?: number,
  className?: string,
}> = ({
  items, result, title, mustLand, size = 26, className,
}) => (
  <span className={`inline-flex flex-wrap items-center gap-x-3 gap-y-0.5 ${className ?? ''}`} title={title} data-testid="drain-brief">
    {items.length === 0 && <span className="text-gray-500 dark:text-gray-400">no specs</span>}
    {briefItems(items).map((it) => {
      const base = briefText(it);
      const landed = typeof it.landed === 'number' && it.landed > 0 ? it.landed : undefined;
      let text = base;
      if (mustLand && landed !== undefined && (it.weapon === 'elderMaul' || it.weapon === 'dwh')) text = `${landed} must land`;
      if (mustLand && landed !== undefined && it.weapon === 'tonalztics') text = `${landed} hit${landed === 1 ? '' : 's'} must land`;
      const dim = it.count === 0 || base === 'not needed';
      return (
        <span
          key={it.weapon}
          className={`inline-flex items-center gap-1 ${dim ? 'opacity-50' : ''}`}
          title={it.title}
          data-testid="drain-brief-item"
          data-weapon={it.weapon}
          data-count={it.count}
        >
          <ItemIcon name={it.label} src={equipmentImageUrl(it.image)} size={size} title={it.title} />
          <span className="font-bold whitespace-nowrap" data-testid="drain-brief-count">{it.count === 0 && it.short ? '× 0 (no energy)' : text}</span>
        </span>
      );
    })}
    {result && <span className="text-xs text-gray-600 dark:text-gray-300 whitespace-nowrap" data-testid="drain-brief-result">{result}</span>}
  </span>
);

/**
 * Phase 38g: the drain facts line (drainLine.ts `drainFacts`), the same on Search, Plan and Summary; phase 38g-2: one
 * plan, "Drain: Elder maul → Tonalztics ×2 (floor 96%); 1 brings Elder maul, 1 brings Tonalztics", then, when the bars
 * pay fewer, "(needs 3 specs, you have ~2)" in orange.
 */
export const DrainFactsLine: React.FC<{ facts: DrainFacts | undefined, label?: string, className?: string }> = ({ facts, label, className }) => (facts ? (
  <span
    className={`text-[11px] text-gray-600 dark:text-gray-300 ${className ?? ''}`}
    data-testid="drain-facts"
    data-text={facts.text}
    data-short={facts.short ?? ''}
    title="The drain specs to send, in this order, that reach the Defence floor in the fewest specs at the confidence in Advanced, with the chance they get there (each spec rolls against the Defence the earlier ones leave); floor out of reach: the lowest Defence any plan reaches at that confidence; Team: the carriers per weapon (2 specs each)"
  >
    {label ? `${label}: ` : ''}
    {facts.text}
    {facts.short && <span className="ml-1 font-semibold text-orange-700 dark:text-orange-300" data-testid="drain-facts-short">{`(${facts.short})`}</span>}
  </span>
) : null);

export default DrainLineView;
