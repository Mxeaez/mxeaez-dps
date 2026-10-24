import React from 'react';
import { DrainLine } from '@/lib/fracturedArchive/drainLine';
import { equipmentImageUrl } from '@/lib/fracturedArchive/loadoutIcons';
import { ItemIcon } from '@/app/components/bestSetup/ItemIcons';

// Phase 23: a drain plan as "[icon] ×N" per weapon with the per-spec hit chance under each icon, then
// "→ Def 156 · Magic def 91". The full plan text is the tooltip. Data: src/lib/fracturedArchive/drainLine.ts.

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
        <span key={it.weapon} className="inline-flex flex-col items-center leading-none" title={it.title} data-testid="drain-line-item" data-weapon={it.weapon} data-count={it.count}>
          <span className="inline-flex items-center gap-0.5">
            <ItemIcon name={it.label} src={equipmentImageUrl(it.image)} size={size} title={it.title} />
            <span className="font-mono font-semibold" data-testid="drain-line-count">{it.unit === 'dmg' ? `${it.count} dmg` : `×${it.count}`}</span>
          </span>
          {it.hitChance !== undefined && (
            <span className={`${compact ? 'text-[9px]' : 'text-[10px]'} text-gray-500 dark:text-gray-400`} data-testid="drain-line-hit">{pct(it.hitChance)}</span>
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
    </span>
  );
};

export default DrainLineView;
