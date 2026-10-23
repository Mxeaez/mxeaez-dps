import React from 'react';
import { LoadoutIcon, WeaponPart } from '@/lib/fracturedArchive/loadoutIcons';

// Small item icons for the /best-setup tables (phase 12). Image URLs: src/lib/fracturedArchive/loadoutIcons.ts.

/** An item icon; hides itself if the image fails to load (the name stays in the text / tooltip). */
export const ItemIcon: React.FC<{
  name: string, src: string | null, size?: number, title?: string,
}> = ({
  name, src, size = 22, title,
}) => {
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      title={title ?? name}
      loading="lazy"
      width={size}
      height={size}
      className="inline-block object-contain shrink-0"
      style={{ width: size, height: size }}
      data-testid="item-icon"
      onError={(e) => {
        e.currentTarget.style.display = 'none';
      }}
    />
  );
};

/** "Ascension crossbows · Diamond ascension bolts (e)" with an icon before each item that has one. */
export const WeaponLine: React.FC<{ parts: WeaponPart[], className?: string }> = ({ parts, className }) => (
  <div className={`flex flex-wrap items-center gap-x-1 ${className ?? ''}`} data-testid="weapon-line">
    {parts.map((p, i) => (
      <React.Fragment key={p.name}>
        {i > 0 && <span className="text-gray-400">·</span>}
        <ItemIcon name={p.name} src={p.imageUrl} size={22} />
        <span>{p.name}</span>
      </React.Fragment>
    ))}
  </div>
);

/** The full loadout as a row of small icons (calculator slot order), item names as tooltips. */
export const LoadoutIconRow: React.FC<{ icons: LoadoutIcon[] }> = ({ icons }) => (
  <div className="flex flex-wrap items-center gap-0.5 my-0.5" data-testid="loadout-icons">
    {icons.map((ic) => (
      <ItemIcon key={ic.slot} name={ic.name} title={`${ic.name} (${ic.slot})`} src={ic.imageUrl} size={20} />
    ))}
  </div>
);
