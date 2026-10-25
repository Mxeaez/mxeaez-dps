'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ItemIcon } from '@/app/components/bestSetup/ItemIcons';

// Phase 34: a select whose options show an icon (native <select> options can't show images). The relevant options are
// listed first; the rest are behind "more". Used for the Assumptions box's potion / Heart pickers.

export interface IconOption<T extends string | number> {
  value: T;
  label: string;
  src: string | null;
}

const IconSelect = <T extends string | number>({
  id, value, primary, more = [], onChange, title, testId,
}: {
  id: string,
  value: T,
  primary: IconOption<T>[],
  more?: IconOption<T>[],
  onChange: (v: T) => void,
  title?: string,
  testId?: string,
}) => {
  const [open, setOpen] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  const all = [...primary, ...more];
  const current = all.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const option = (o: IconOption<T>) => (
    <button
      key={String(o.value)}
      type="button"
      role="option"
      aria-selected={o.value === value}
      className={`flex items-center gap-1 w-full text-left px-2 py-0.5 rounded hover:bg-body-200 dark:hover:bg-dark-300 ${o.value === value ? 'font-semibold bg-orange-100 dark:bg-orange-900/40' : ''}`}
      data-testid={testId ? `${testId}-option` : undefined}
      data-value={o.value}
      onClick={() => {
        onChange(o.value);
        setOpen(false);
      }}
    >
      <ItemIcon name={o.label} src={o.src} size={18} />
      {o.label}
    </button>
  );

  return (
    <span className="relative inline-block" ref={box}>
      <button
        id={id}
        type="button"
        className="form-control text-xs py-0.5 flex items-center gap-1"
        aria-haspopup="listbox"
        aria-expanded={open}
        title={title}
        data-testid={testId}
        data-value={value}
        onClick={() => {
          setOpen(!open);
          setShowMore(more.some((o) => o.value === value));
        }}
      >
        {current && <ItemIcon name={current.label} src={current.src} size={18} />}
        <span>{current?.label ?? String(value)}</span>
        <span aria-hidden className="text-gray-500">▾</span>
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute z-30 left-0 mt-1 min-w-[180px] max-h-[320px] overflow-y-auto p-1 rounded shadow-lg bg-white dark:bg-dark-500 border border-body-400 dark:border-dark-200 text-xs"
          data-testid={testId ? `${testId}-list` : undefined}
        >
          {primary.map(option)}
          {more.length > 0 && (
            <>
              <button
                type="button"
                className="w-full text-left px-2 py-0.5 underline text-gray-500 dark:text-gray-400"
                aria-expanded={showMore}
                data-testid={testId ? `${testId}-more` : undefined}
                onClick={() => setShowMore(!showMore)}
              >
                {showMore ? '▾ fewer' : `▸ more (${more.length})`}
              </button>
              {showMore && more.map(option)}
            </>
          )}
        </div>
      )}
    </span>
  );
};

export default IconSelect;
