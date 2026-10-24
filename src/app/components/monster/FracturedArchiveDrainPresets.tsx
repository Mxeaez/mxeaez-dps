import React from 'react';
import { observer } from 'mobx-react-lite';
import { toJS } from 'mobx';
import { useStore } from '@/state';
import { FRACTURED_ARCHIVE_MONSTER_IDS } from '@/lib/fracturedArchive/constants';
import {
  ayakSpecsToZero, DRAIN_PRESETS, DrainPlan, DrainPreset, drainPresetReductions, maxDrainReductions,
} from '@/lib/fracturedArchive/drains';
import { drainModel, specProfile } from '@/lib/fracturedArchive/specs';
import { DrainLine, drainLineFromReductions } from '@/lib/fracturedArchive/drainLine';
import DrainLineView from '@/app/components/bestSetup/DrainLineView';

const WEAPON_PRESETS = DRAIN_PRESETS.filter((p) => p.options);
const RESET_PRESET = DRAIN_PRESETS.find((p) => !p.options)!;

/**
 * "Max drain" buttons in the Defensive Reductions panel, Fractured Archive monsters only. Each button writes the
 * spec counts from src/lib/fracturedArchive/drains.ts into the normal inputs below, so they can still be tweaked.
 * Phase 23: each button shows its plan as "[icon] ×N" with the chance per spec to land (DrainLineView); the full text
 * stays the tooltip.
 */
const FracturedArchiveDrainPresets: React.FC = observer(() => {
  const store = useStore();
  const { monster } = store;

  if (!FRACTURED_ARCHIVE_MONSTER_IDS.includes(monster.id)) {
    return null;
  }

  const m = toJS(monster);
  const apply = (p: DrainPreset) => store.updateMonster({
    inputs: { defenceReductions: drainPresetReductions(m, p.id) },
  });

  // Phase 13: the plan only uses weapons that can hit in the selected version / phase (e.g. no melee while AG flies).
  const plans = new Map(WEAPON_PRESETS.map((p) => [p.id, maxDrainReductions(m, p.options!)]));
  const fallback = WEAPON_PRESETS.map((p) => plans.get(p.id)!).find((plan) => !plan.weaponCanHit);

  // per-spec hit chances (the calculator's spec distributions vs the undrained monster; cached per monster)
  let hit: Parameters<typeof drainLineFromReductions>[1] = {};
  let ayakSpecs: number | undefined;
  try {
    const model = drainModel(m);
    // review fix: the accursed profile against the undrained monster too (drainModel resets the drains itself)
    const undrained = { ...m, inputs: { ...m.inputs, defenceReductions: drainPresetReductions(m, 'none') } };
    hit = { ...model.hitChance, accursed: specProfile(undrained, 'accursed').hitChance };
    ayakSpecs = ayakSpecsToZero(m, model.expectedDamage.ayak);
  } catch {
    // no hit chances (e.g. a monster the spec model can't build): the icons still show
  }
  const lineOf = (plan: DrainPlan, text: string): DrainLine => drainLineFromReductions(
    plan.reductions,
    hit,
    { defAfter: plan.defAfter, magicDefAfter: plan.magicDefAfter },
    text,
    ayakSpecs,
  );

  const button = (p: DrainPreset, text: string) => {
    const plan = plans.get(p.id);
    const blocked = plan && !plan.weaponCanHit;
    let tooltip = 'Clear all defensive reductions';
    if (p.options && plan) {
      tooltip = blocked
        ? `${text} can't hit ${monster.name} here (${monster.inputs.phase || monster.version || 'this phase'}); applies the cheapest plan that can: ${plan.summary}${p.options.ayak ? ', Eye of Ayak to 0 magic defence' : ''}. Other reductions are cleared.`
        : `${p.label}: ${plan.summary}${p.options.ayak ? ', plus Eye of Ayak damage to bring magic defence to 0' : ''}. Other reductions are cleared.`;
    }
    return (
      <button
        key={p.id}
        type="button"
        className={`btn text-xs px-1.5 py-0.5${blocked ? ' opacity-50 line-through' : ''}`}
        aria-label={p.label}
        data-blocked={blocked ? 'true' : undefined}
        data-tooltip-id="tooltip"
        data-tooltip-content={tooltip}
        onClick={() => apply(p)}
      >
        {p.options && plan && !blocked
          ? (
            <span className="inline-flex items-center gap-1">
              <span>{`${text}:`}</span>
              <DrainLineView line={lineOf(plan, tooltip)} compact />
            </span>
          )
          : text}
      </button>
    );
  };

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
      {fallback && (
        <div className="text-[11px] text-gray-400" data-testid="drain-fallback">
          {'Melee can\'t hit here — buttons apply: '}
          <DrainLineView line={lineOf(fallback, fallback.summary)} compact />
        </div>
      )}
    </div>
  );
});

export default FracturedArchiveDrainPresets;
