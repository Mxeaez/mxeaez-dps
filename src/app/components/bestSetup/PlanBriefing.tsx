import React from 'react';
import { PlayerEquipment } from '@/types/Player';
import { StyleGroup } from '@/lib/fracturedArchive/presets';
import { PlanCandidate } from '@/lib/fracturedArchive/planner';
import { BriefingRow, damageText } from '@/lib/fracturedArchive/briefing';
import { itemImageByName, LOADOUT_SLOT_ORDER, searchItemIcon } from '@/lib/fracturedArchive/loadoutIcons';
import SurgeImg from '@/public/img/supplies/Surge potion(4).png';
import { ItemIcon, LoadoutIconRow } from '@/app/components/bestSetup/ItemIcons';
import { DrainBrief, DrainFactsLine } from '@/app/components/bestSetup/DrainLineView';

// Phase 34: the Plan tab's raid briefing (one row per encounter: boss, what to wear, specs at the start, seconds). Data:
// src/lib/fracturedArchive/briefing.ts. Every explanation is a tooltip; the per-phase table is under "Per-phase details".
// Phase 35b: an encounter with several NPCs (Bork + Smorks) gets one specs line per NPC ("Bork:", "Smorks:") and, when
// the NPCs use different loadouts, one Wear line per NPC.

const GROUP_BORDER: Record<StyleGroup, string> = {
  melee: 'border-red-500', ranged: 'border-green-600', magic: 'border-blue-500',
};

const fmtSeconds = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(1)} s` : '∞');

/** A kit loadout as its weapon (large) and the rest of its items (small icons); the name is the tooltip. */
export const KitLoadoutIcons: React.FC<{ kit: PlanCandidate, worn: boolean }> = ({ kit, worn }) => {
  const slots = LOADOUT_SLOT_ORDER.filter((s) => kit.equipment[s]) as (keyof PlayerEquipment)[];
  const weapon = kit.equipment.weapon;
  return (
    <span
      className={`inline-flex items-center gap-1 border-l-4 pl-1 ${GROUP_BORDER[kit.group]}`}
      title={`${worn ? 'Worn' : 'Switch'}: ${kit.label} (${kit.group})`}
      data-testid="briefing-loadout"
      data-label={kit.label}
    >
      {weapon && <ItemIcon name={weapon.name} src={searchItemIcon('weapon', weapon).imageUrl} size={28} title={`${kit.label} (${worn ? 'worn' : 'switch'})`} />}
      {/* phone width: the weapon only (the rest of the loadout is in the kit below) */}
      <span className="hidden sm:inline-flex">
        <LoadoutIconRow icons={slots.filter((s) => s !== 'weapon').map((s) => searchItemIcon(s, kit.equipment[s]!))} size={16} />
      </span>
    </span>
  );
};

const loadoutIcons = (loadouts: string[], kit: PlanCandidate[]) => loadouts.map((l) => {
  const k = kit.findIndex((c) => c.label === l);
  return k >= 0
    ? <KitLoadoutIcons key={l} kit={kit[k]} worn={k === 0} />
    : <span key={l} className="text-xs">{l}</span>;
});

const PlanBriefing: React.FC<{
  rows: BriefingRow[],
  kit: PlanCandidate[],
  imageOf: (encounterId: string) => string | null,
}> = ({ rows, kit, imageOf }) => (
  <div className="overflow-x-auto max-w-[100vw]">
    <table className="w-full text-sm" data-testid="plan-briefing">
      <thead>
        <tr className="bg-btns-400 dark:bg-dark-500 text-white text-left">
          <th className="px-2">Boss</th>
          <th className="px-2" title="The kit loadouts used in this fight (the first is worn), per NPC when the NPCs use different ones; hover for the name">Wear</th>
          <th className="px-2" title="Specs at the start of the fight: the landed hits / specs needed (Eye of Ayak: magic defence drained), then the Defence the DPS uses; one line per NPC that is specced (each NPC has its own Defence). Hover for the full plan">Specs at the start</th>
          <th className="px-2 text-right">Seconds</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-t border-body-300 dark:border-dark-400 align-middle" data-testid="plan-briefing-row" data-encounter={r.id} data-specs={r.specsText}>
            <td className="px-2 py-1">
              <span className="flex items-center gap-2 font-semibold">
                <ItemIcon name={r.label} src={imageOf(r.id)} size={32} />
                {r.label}
              </span>
            </td>
            <td className="px-2 py-1">
              {r.wear.length > 1 ? (
                // phase 35b: the NPCs use different loadouts: "Bork: [icons]" / "Smorks: [icons]", one line each
                <span className="flex flex-col gap-0.5">
                  {r.wear.map((w) => (
                    <span key={w.npc} className="flex flex-wrap items-center gap-2" data-testid="briefing-wear-group" data-npc={w.npc}>
                      <span className="text-[11px] text-gray-500 dark:text-gray-400">{`${w.npc}:`}</span>
                      {loadoutIcons(w.loadouts, kit)}
                    </span>
                  ))}
                </span>
              ) : (
                <span className="flex flex-wrap items-center gap-2">
                  {r.loadouts.length === 0 && '—'}
                  {loadoutIcons(r.loadouts, kit)}
                </span>
              )}
            </td>
            <td className="px-2 py-1" title={r.drainText} data-testid="plan-briefing-specs">
              {r.specs.length === 0 && r.damage.length === 0 && !r.surge && <span className="text-gray-500 dark:text-gray-400">—</span>}
              <span className="flex flex-col gap-0.5">
                {r.specs.map((g) => (
                  <span key={g.key} className="inline-flex flex-wrap items-center gap-x-2" data-testid="plan-briefing-group" data-text={g.text}>
                    {g.label && <span className="text-[11px] text-gray-500 dark:text-gray-400">{`${g.label}:`}</span>}
                    <DrainBrief items={g.items} result={g.result} size={24} title={r.drainText} />
                    {g.times > 1 && <span className="font-bold" title="The Defence is restored mid-fight: the same specs again each time">{`× ${g.times}`}</span>}
                  </span>
                ))}
                {/* phase 38g: the drain facts per drain event, the same line as on Search and Summary */}
                {r.facts.map((f) => <DrainFactsLine key={`${f.label ?? ''}|${f.facts.text}`} facts={f.facts} label={f.label} />)}
                {/* phase 36: your damage specs and the surge dose (your own spec energy) */}
                {(r.damage.length > 0 || r.surge) && (
                  <span className="inline-flex flex-wrap items-center gap-x-2" data-testid="plan-briefing-damage" data-text={damageText(r.damage)} data-surge={r.surge ? 'true' : 'false'}>
                    {r.damage.length > 0 && <span className="text-[11px] text-gray-500 dark:text-gray-400">You:</span>}
                    {r.damage.map((d) => (
                      <span key={d.weapon} className="inline-flex items-center gap-0.5" title={`${d.count} ${d.label} spec${d.count === 1 ? '' : 's'} (damage; your spec energy): saves ${d.saved.toFixed(1)} s`}>
                        <ItemIcon name={d.label} src={itemImageByName(d.label)} size={24} />
                        <span className="font-bold">{`×${d.count}`}</span>
                      </span>
                    ))}
                    {r.surge && (
                      <span className="inline-flex items-center gap-0.5" title="Drink a Surge potion dose here (+25% spec energy), right after your first spec: it does nothing at 100%" data-testid="plan-briefing-surge">
                        <ItemIcon name="Surge potion(4)" src={SurgeImg.src} size={20} />
                        <span className="text-[11px]">dose</span>
                      </span>
                    )}
                  </span>
                )}
              </span>
            </td>
            <td className="px-2 py-1 text-right font-mono font-bold whitespace-nowrap" data-testid="plan-briefing-seconds">{fmtSeconds(r.seconds)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export default PlanBriefing;
