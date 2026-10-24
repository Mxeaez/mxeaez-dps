'use client';

import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { generateEmptyPlayer } from '@/state';
import { PlayerEquipment } from '@/types/Player';
import Spinner from '@/app/components/Spinner';
import EquipmentSelect from '@/app/components/player/equipment/EquipmentSelect';
import { buildTargetMonster, DrainStateId, findTarget } from '@/lib/fracturedArchive/bestSetup';
import { BestSetupAssumptions, StyleGroup } from '@/lib/fracturedArchive/presets';
import {
  enumerateRoutes, formatDuration, PhaseTime,
} from '@/lib/fracturedArchive/raidTime';
import {
  COMFORT_SUPPLY_TYPES,
  DEFAULT_RING_POLICY,
  equipmentById,
  equipmentItemIds,
  HEART_ITEMS,
  heartById,
  heartByPotion,
  INVENTORY_SLOTS,
  InventoryCell,
  ownedPinned,
  PlanCandidate,
  planItemByName,
  planAssumptions,
  planLoadoutToPlayer,
  PlanProgress,
  PlanRejection,
  PlanResult,
  RING_POLICIES,
  ringAssumptions,
  RingPolicy,
  SUPPLY_TYPES,
  SupplyCounts,
  SupplyType,
} from '@/lib/fracturedArchive/planner';
import { SearchRow } from '@/lib/fracturedArchive/search';
import { PlanJob, startRaidPlan } from '@/worker/searchWorkerClient';
import {
  RaidConfig, teamDpsMultiplier, teamTimeLabel, TimeSettings,
} from '@/lib/raids';
import {
  equipmentImageUrl, LOADOUT_SLOT_ORDER, searchItemIcon, targetImageUrl,
} from '@/lib/fracturedArchive/loadoutIcons';
import { ItemIcon, LoadoutIconRow } from '@/app/components/bestSetup/ItemIcons';
import DrainLineView from '@/app/components/bestSetup/DrainLineView';
import openInCalculator, { openLoadoutsInCalculator } from '@/app/components/bestSetup/loadIntoCalculator';
import DPS_TEXT_CLASS from '@/app/components/bestSetup/styles';
import RangingImg from '@/public/img/potions/Ranging.png';
import SuperCombatImg from '@/public/img/potions/Super combat.png';
import SaturatedHeartImg from '@/public/img/potions/Saturated heart.png';
import ImbuedHeartImg from '@/public/img/potions/Imbued heart.png';
import headSlot from '@/public/img/slots/head.png';
import capeSlot from '@/public/img/slots/cape.png';
import neckSlot from '@/public/img/slots/neck.png';
import ammoSlot from '@/public/img/slots/ammo.png';
import weaponSlot from '@/public/img/slots/weapon.png';
import bodySlot from '@/public/img/slots/body.png';
import shieldSlot from '@/public/img/slots/shield.png';
import legsSlot from '@/public/img/slots/legs.png';
import handsSlot from '@/public/img/slots/hands.png';
import feetSlot from '@/public/img/slots/feet.png';
import ringSlot from '@/public/img/slots/ring.png';
import { isOwned, unownedLabel } from '@/lib/fracturedArchive/ownership';

// "Plan" tab of /best-setup (phase 17): the kit (worn set + switch items) that minimises the route time within 28
// inventory slots (src/lib/fracturedArchive/planner.ts), run in the search worker (RAID_PLAN). The per-phase search rows
// are cached in memory for the session per assumptions + drain + phase, so a change of supplies / items / route only
// rebuilds the matrix and re-optimises. Docs: docs/BEST_SETUP.md (Plan tab).
// Phase 23: the Routes / Encounters tab is merged in: the route comparison table (every route, or the raid's single
// route, with per-encounter times) is under the per-encounter table; the time-model settings come from Advanced.

// Phase 26: the plan always honours "Items I don't own": the list is part of the search-row cache key, unowned pinned
// items are dropped (shown struck through). "Best possible with everything" = the same plan with no list, from
// `maxTotals` (filled by every plan run without a list) or on demand ("compare with max", a second plan run).

const searchCache = new Map<string, SearchRow[]>();
const cachePrefix = (a: BestSetupAssumptions, drain: DrainStateId, notOwned: string[] = []) => `${JSON.stringify(a)}|${drain}|${notOwned.length ? `${JSON.stringify([...notOwned].sort())}|` : ''}`;
/** Route totals (s) of plans without an "Items I don't own" list, by everything else the plan depends on. */
const maxTotals = new Map<string, number>();

const DEBOUNCE_MS = 500;

const SUPPLY_IMAGES: Partial<Record<SupplyType, string>> = {
  ranging: RangingImg.src,
  superCombat: SuperCombatImg.src,
};
const SUPPLY_COLOURS: Record<SupplyType, string> = {
  brew: '#d9b44a', restore: '#b04aa6', ranging: '#3f8fd1', superCombat: '#3c9a3c', food: '#a0522d', other: '#888888',
};
/** The hearts are pinned pseudo items (planner.ts HEART_ITEMS), not equipment: their icons by pseudo id. */
const HEART_IMAGES: Record<string, string> = {
  'Saturated heart': SaturatedHeartImg.src,
  'Imbued heart': ImbuedHeartImg.src,
};

const SLOT_PLACEHOLDERS: Record<keyof PlayerEquipment, string> = {
  head: headSlot.src,
  cape: capeSlot.src,
  neck: neckSlot.src,
  ammo: ammoSlot.src,
  weapon: weaponSlot.src,
  body: bodySlot.src,
  shield: shieldSlot.src,
  legs: legsSlot.src,
  hands: handsSlot.src,
  feet: feetSlot.src,
  ring: ringSlot.src,
};

const GROUP_COLOURS: Record<StyleGroup, string> = {
  melee: 'border-red-500', ranged: 'border-green-600', magic: 'border-blue-500',
};

/** Seconds as sent by the worker (Infinity is serialised as null). */
const secs = (v: number | null | undefined): number => (typeof v === 'number' ? v : Infinity);
const fmtS = (v: number | null | undefined) => {
  const s = secs(v);
  return Number.isFinite(s) ? `${s.toFixed(1)} s` : '∞';
};
const fmtDelta = (v: number | null | undefined) => {
  const s = typeof v === 'number' ? v : -Infinity;
  if (!Number.isFinite(s)) return s > 0 ? '−∞' : '+∞';
  // deltaSeconds = seconds saved (+) → shown as the time change
  return `${s > 0 ? '−' : '+'}${Math.abs(s).toFixed(1)} s`;
};

/** Phase 27 review: another camp ring vs the chosen one: exact when planned in full, else the screen's estimate. */
const ringOther = (x: PlanResult['ring']['screened'][number], chosen: number | null) => {
  if (x.full) return `${x.ring} ${fmtDelta(secs(chosen) - secs(x.seconds))}`;
  if ((x.atLeast ?? 0) >= 1) return `${x.ring} ≥ +${(x.atLeast ?? 0).toFixed(0)} s (estimate)`;
  return `${x.ring} (slower by the quick screen; not planned in full)`;
};

/** A generic potion / supply icon (no image in src/public/img for brews, restores, food). */
const SupplyIcon: React.FC<{ type: SupplyType, label: string, size?: number }> = ({ type, label, size = 26 }) => {
  const src = SUPPLY_IMAGES[type];
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={label} title={label} width={size} height={size} style={{ width: size, height: size }} className="object-contain" data-testid="item-icon" />;
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={label} data-testid="item-icon">
      <title>{label}</title>
      <rect x="9" y="2" width="6" height="4" rx="1" fill="#8a6d3b" />
      <path d="M8 7h8v3l3 5v5a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-5l3-5z" fill={SUPPLY_COLOURS[type]} stroke="#333" strokeWidth="0.8" />
    </svg>
  );
};

const itemUrl = (id: number) => {
  const heart = heartById(id);
  return heart ? HEART_IMAGES[heart.name] : equipmentImageUrl(equipmentById(id)?.image);
};
const pinnedName = (id: number) => heartById(id)?.name ?? equipmentById(id)?.name;

/** The worn set, laid out like the calculator's equipment grid. */
const WornGrid: React.FC<{ kit: PlanCandidate }> = ({ kit }) => {
  const cell = (slot: keyof PlayerEquipment) => {
    const it = kit.equipment[slot];
    return (
      <div
        key={slot}
        className="flex justify-center items-center h-[40px] w-[40px] bg-body-100 dark:bg-dark-400 border border-body-300 dark:border-dark-400 rounded"
        data-testid="worn-slot"
        data-slot={slot}
        data-item={it?.name ?? ''}
        title={it ? `${it.name} (${slot})` : slot}
      >
        {it
          ? <ItemIcon name={it.name} src={searchItemIcon(slot, it).imageUrl} size={32} />
          // eslint-disable-next-line @next/next/no-img-element
          : <img className="opacity-30 dark:filter dark:invert" src={SLOT_PLACEHOLDERS[slot]} alt={slot} draggable={false} />}
      </div>
    );
  };
  return (
    <div className="flex flex-col items-center gap-1 w-[160px]" data-testid="worn-grid">
      <div className="flex justify-center">{cell('head')}</div>
      <div className="flex justify-center gap-2">{(['cape', 'neck', 'ammo'] as const).map(cell)}</div>
      <div className="flex justify-center gap-6">{(['weapon', 'body', 'shield'] as const).map(cell)}</div>
      <div className="flex justify-center">{cell('legs')}</div>
      <div className="flex justify-center gap-6">{(['hands', 'feet', 'ring'] as const).map(cell)}</div>
    </div>
  );
};

const cellTitle = (c: InventoryCell) => {
  switch (c.kind) {
    case 'supply': return c.supply === 'ranging' || c.supply === 'superCombat' ? `${c.label} (from the kit: one per style)` : `${c.label} (comfort supply)`;
    case 'switch': return `${c.label} (${c.group} switch)`;
    case 'spec': return `${c.label} (spec weapon)`;
    case 'pinned': return `${c.label} (always brought)`;
    default: return c.label;
  }
};

/** The 4 × 7 inventory. */
const InventoryGrid: React.FC<{ cells: InventoryCell[] }> = ({ cells }) => (
  <div className="grid grid-cols-4 gap-1 p-2 rounded bg-[#3e3529] border border-[#2a241b] w-fit" data-testid="inventory-grid">
    {cells.map((c, i) => {
      const border = c.kind === 'switch' && c.group ? `border-2 ${GROUP_COLOURS[c.group]}` : 'border border-[#5a4d3a]';
      let content: React.ReactNode = null;
      if (c.kind === 'supply' && c.supply) content = <SupplyIcon type={c.supply} label={c.label} />;
      else if (c.item) content = <ItemIcon name={c.label} src={itemUrl(c.item.id)} size={30} title={cellTitle(c)} />;
      else if (c.kind === 'non-item') content = <span className="text-[9px] text-center leading-tight text-body-100">{c.label}</span>;
      else if (c.kind === 'swap') content = <span className="text-[9px] text-center leading-tight text-yellow-200">swap</span>;
      return (
        <div
          // eslint-disable-next-line react/no-array-index-key
          key={i}
          className={`h-[40px] w-[40px] flex items-center justify-center rounded ${border} ${c.kind === 'free' ? 'border-dashed opacity-50' : 'bg-[#4a3f31]'}`}
          title={cellTitle(c)}
          data-testid="inventory-cell"
          data-kind={c.kind}
          data-label={c.label}
        >
          {content}
        </div>
      );
    })}
  </div>
);

const RejectionList: React.FC<{ rows: PlanRejection[], testId: string }> = ({ rows, testId }) => (
  <ul className="list-disc ml-5" data-testid={testId}>
    {rows.map((r) => (
      <li key={r.label}>
        <span className="font-semibold">{r.label}</span>
        {`: ${fmtDelta(r.deltaSeconds)} route time, ${r.deltaSlots >= 0 ? '+' : ''}${r.deltaSlots} slot${Math.abs(r.deltaSlots) === 1 ? '' : 's'} — ${r.reason}`}
      </li>
    ))}
  </ul>
);

const PhaseRows: React.FC<{ phases: PhaseTime[], encounter: string }> = ({ phases, encounter }) => (
  <>
    {phases.map((p) => (
      <tr key={p.key} className="text-[11px] text-gray-600 dark:text-gray-400" data-testid="plan-phase-row" data-encounter={encounter} data-target={p.targetKey} data-phase={p.phase ?? ''}>
        <td className="px-2 pl-6">
          {p.label}
          {p.note && <span className="text-gray-500 dark:text-gray-400">{` · ${p.note}`}</span>}
        </td>
        <td className="px-2">{p.choice?.loadout ?? 'nothing in the kit'}</td>
        <td className="px-2">{p.choice?.style ?? ''}</td>
        <td className="px-2" data-testid="plan-phase-drains">
          {p.choice?.drainLine ? <DrainLineView line={p.choice.drainLine} compact /> : ''}
        </td>
        <td className="px-2 text-right font-mono" data-testid="plan-phase-dps">{p.dps.toFixed(3)}</td>
        <td className="px-2 text-right font-mono">{fmtS(p.seconds)}</td>
      </tr>
    ))}
  </>
);

const PlanView: React.FC<{
  assumptions: BestSetupAssumptions, drain: DrainStateId, raid: RaidConfig, timeSettings?: TimeSettings, notOwned?: string[],
}> = ({
  assumptions, drain, raid, timeSettings, notOwned: notOwnedProp,
}) => {
  const notOwnedKey = JSON.stringify(notOwnedProp ?? []);
  const notOwned = useMemo(() => JSON.parse(notOwnedKey) as string[], [notOwnedKey]);
  const settings = timeSettings ?? raid.defaultTimeSettings;
  const routes = useMemo(() => enumerateRoutes(raid.time.routeSlots, raid.time.labels), [raid]);
  // phase 21: per-raid defaults (src/lib/raids/planDefaults.ts); the view is remounted on a raid change
  // the pinned heart (magic boost) follows the Assumptions box's Heart; another magic potion there = no heart pinned
  const selectedHeart = heartByPotion(assumptions.potions.magic);
  const defaultPinned = useMemo(() => raid.planDefaults.pinned.map((n) => planItemByName(n).id)
    .flatMap((id) => {
      if (!heartById(id)) return [id];
      return selectedHeart ? [selectedHeart.id] : [];
    }), [raid, selectedHeart]);
  const [route, setRoute] = useState('all');
  // phase 27: comfort supplies only (the kit's potions are derived by the planner); the ring policy (Advanced)
  const [supplies, setSupplies] = useState<SupplyCounts>(raid.defaultSupplies);
  const [ringPolicy, setRingPolicy] = useState<RingPolicy>(DEFAULT_RING_POLICY);
  const [nonItem, setNonItem] = useState(raid.planDefaults.nonItemSlots);
  const [pinned, setPinned] = useState<number[]>(defaultPinned);
  // a new Heart in the Assumptions box replaces the pinned one (or removes it); the first render keeps the defaults
  const lastHeart = useRef(selectedHeart);
  useEffect(() => {
    if (lastHeart.current === selectedHeart) return;
    lastHeart.current = selectedHeart;
    setPinned((p) => {
      const had = p.some((id) => heartById(id));
      const rest = p.filter((id) => !heartById(id));
      return had && selectedHeart ? [...rest, selectedHeart.id] : rest;
    });
  }, [selectedHeart]);
  const [result, setResult] = useState<PlanResult | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<PlanProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState(0);
  const job = useRef<PlanJob | null>(null);
  // phase 26: the pinned items the plan keeps (unowned ones are dropped); "compare with max"
  const keptPinned = useMemo(() => ownedPinned(pinned, notOwned).kept, [pinned, notOwned]);
  const maxKey = `${raid.id}|${JSON.stringify(assumptions)}|${drain}|${route}|${JSON.stringify(supplies)}|${ringPolicy}|${nonItem}|${JSON.stringify(pinned)}|${JSON.stringify(settings)}`;
  const [maxSeconds, setMaxSeconds] = useState<number | undefined>(undefined);
  const [comparing, setComparing] = useState(false);
  const compareJob = useRef<PlanJob | null>(null);
  useEffect(() => {
    compareJob.current?.cancel();
    compareJob.current = null;
    setComparing(false);
    setMaxSeconds(maxTotals.get(maxKey));
  }, [maxKey]);
  useEffect(() => () => compareJob.current?.cancel(), []);

  const planData = (list: string[]) => {
    const prefix = cachePrefix(planAssumptions(assumptions, supplies, ownedPinned(pinned, list).kept), drain, list);
    const searchRows: Record<string, SearchRow[]> = {};
    searchCache.forEach((v, k) => {
      if (k.startsWith(prefix)) searchRows[k.slice(prefix.length)] = v;
    });
    return {
      prefix,
      data: {
        basePlayer: generateEmptyPlayer(),
        assumptions,
        drain,
        settings,
        route,
        pinned,
        nonItemSlots: nonItem,
        supplies,
        ringPolicy,
        searchRows,
        ...(list.length ? { notOwned: list } : {}),
      },
    };
  };
  const planDataRef = useRef(planData);
  planDataRef.current = planData;

  const compareWithMax = () => {
    compareJob.current?.cancel();
    const key = maxKey;
    const { prefix, data } = planData([]);
    setComparing(true);
    const j = startRaidPlan(data, () => {});
    compareJob.current = j;
    j.promise.then((r) => {
      if (compareJob.current !== j) return;
      Object.entries(r.searchRows).forEach(([k, v]) => searchCache.set(prefix + k, v));
      const best = r.comparison && r.planned >= 0 ? r.comparison.routes[r.planned].seconds : undefined;
      if (typeof best === 'number') {
        maxTotals.set(key, best);
        setMaxSeconds(best);
      }
      setComparing(false);
      compareJob.current = null;
    }).catch(() => {
      if (compareJob.current === j) {
        setComparing(false);
        compareJob.current = null;
      }
    });
  };

  const cancel = useCallback(() => {
    job.current?.cancel();
    job.current = null;
    setRunning(false);
    setProgress(null);
  }, []);

  useEffect(() => {
    cancel();
    setError(null);
    const timer = setTimeout(() => {
      const { prefix, data } = planDataRef.current(notOwned);
      const key = maxKey;
      setRunning(true);
      const j = startRaidPlan(data, setProgress);
      job.current = j;
      j.promise.then((r) => {
        Object.entries(r.searchRows).forEach(([k, v]) => searchCache.set(prefix + k, v));
        const total = r.comparison && r.planned >= 0 ? r.comparison.routes[r.planned].seconds : undefined;
        if (!notOwned.length && !r.cancelled && typeof total === 'number') {
          maxTotals.set(key, total);
          setMaxSeconds(total);
        }
        setResult(r.cancelled ? null : r);
        setRunning(false);
        setProgress(null);
        job.current = null;
      }).catch((e: Error) => {
        if (e.message !== 'cancelled') {
          setError(e.message);
          setRunning(false);
          setProgress(null);
        }
      });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      cancel();
    };
  }, [assumptions, drain, route, supplies, ringPolicy, nonItem, pinned, runId, cancel, settings, notOwned, maxKey]);

  const planned = result && result.comparison && result.planned >= 0 ? result.comparison.routes[result.planned] : null;
  const firstPhase = planned?.encounters[0]?.phases[0];

  // the assumptions the plan used (a camped ring sets the Solo Lightbearer regen)
  const resultAssumptions = () => ringAssumptions(
    planAssumptions(assumptions, supplies, keptPinned),
    result?.ring.policy ?? 'switch',
    result?.ring.ring ? { name: result.ring.ring } : null,
  );
  const monsterForFirstPhase = () => {
    if (!planned || !firstPhase) return null;
    const enc = planned.encounters[0];
    return buildTargetMonster(findTarget(firstPhase.targetKey), firstPhase.phase, drain, {
      ...resultAssumptions(), fightSeconds: enc.drainFightSeconds ?? assumptions.fightSeconds,
    }).monster;
  };
  const loadWorn = () => {
    const monster = monsterForFirstPhase();
    if (!result || !monster) return;
    const player = planLoadoutToPlayer(generateEmptyPlayer(), result.kit[0], monster, resultAssumptions());
    openInCalculator(player, monster).catch(console.error);
  };
  const loadAll = () => {
    const monster = monsterForFirstPhase();
    if (!result || !monster) return;
    const players = result.kit.map((c) => planLoadoutToPlayer(generateEmptyPlayer(), c, monster, resultAssumptions()));
    openLoadoutsInCalculator(players, monster).catch(console.error);
  };

  const supplyTotal = COMFORT_SUPPLY_TYPES.reduce((t, s) => t + supplies[s], 0);
  const ringPolicyDef = RING_POLICIES.find((p) => p.id === ringPolicy)!;
  const ringSummary = () => {
    if (ringPolicy === 'switch') return 'each loadout wears its own best ring (ring switches take slots)';
    if (ringPolicy === 'camp-lightbearer') return 'Lightbearer on every loadout (Solo spec energy regenerates twice as fast)';
    const r = result && !running && result.ring.policy === 'camp-one' ? result.ring.ring : null;
    return r ? `one ring on every loadout: ${r} (the fastest of ${result!.ring.screened.length})` : 'one ring on every loadout (the planner picks it)';
  };
  const fraction = progress
    ? (progress.done + (progress.search ? Math.min(0.99, progress.search.evaluations / Math.max(1, progress.search.estimate)) : 0)) / Math.max(1, progress.total)
    : 0;
  const stageText = (p: PlanProgress) => {
    switch (p.stage) {
      case 'search': return `Searching ${p.done + 1} / ${p.total}: ${p.label}`;
      case 'matrix': return `DPS matrix: loadout ${p.done + 1} / ${p.total}`;
      case 'partials': return `Partial switches ${p.done + 1} / ${p.total}`;
      case 'optimise': return `Optimising: seed ${p.done + 1} / ${p.total}`;
      case 'rings': return `Trying rings ${p.done + 1} / ${p.total}: ${p.label}`;
      default: return 'Route times…';
    }
  };

  return (
    <div className="flex flex-col gap-3" data-testid="plan-view">
      <div className="text-xs bg-body-100 dark:bg-dark-400 border border-body-400 dark:border-dark-200 rounded p-3 flex flex-col gap-2" data-testid="plan-inputs">
        <div className="font-bold text-sm">Assumptions (plan)</div>
        <div>
          Finds the worn set + switch items with the lowest route time (time model: see Advanced above) that fit in
          {` ${INVENTORY_SLOTS} `}
          inventory slots. Party size, drains and spec weapons (&quot;My specs&quot;) come from the boxes above; spec weapons
          and the items below take a slot unless a loadout wears them.
          {raid.planNote && ` ${raid.planNote}`}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2 items-center">
          <label htmlFor="plan-route" className="flex items-center gap-1">
            Route
            <select id="plan-route" className="form-control text-xs py-0.5" value={route} onChange={(e) => setRoute(e.target.value)} data-testid="plan-route">
              <option value="all">Compare all (plan for the fastest)</option>
              {routes.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-2 items-center" data-testid="plan-supplies">
          <span className="font-semibold" title="Brews, restores, food and anything else you like to bring: the planner doesn't choose these">{`Comfort supplies (your call, ${supplyTotal} slots):`}</span>
          {SUPPLY_TYPES.filter((s) => COMFORT_SUPPLY_TYPES.includes(s.id)).map((s) => (
            <label key={s.id} htmlFor={`plan-supply-${s.id}`} className="flex items-center gap-1" title={s.label}>
              <SupplyIcon type={s.id} label={s.label} size={18} />
              {s.label}
              <input
                id={`plan-supply-${s.id}`}
                type="number"
                className="form-control text-xs py-0.5 w-12"
                min={0}
                max={28}
                value={supplies[s.id]}
                onChange={(e) => setSupplies({ ...supplies, [s.id]: Math.min(28, Math.max(0, Math.floor(Number(e.target.value) || 0))) })}
              />
            </label>
          ))}
          <label htmlFor="plan-nonitem" className="flex items-center gap-1" title="Inventory slots taken by things that aren't equipment: rune pouch, teleports, ...">
            Rune pouch / other non-items
            <input
              id="plan-nonitem"
              type="number"
              className="form-control text-xs py-0.5 w-12"
              min={0}
              max={28}
              value={nonItem}
              onChange={(e) => setNonItem(Math.min(28, Math.max(0, Math.floor(Number(e.target.value) || 0))))}
            />
          </label>
        </div>
        <div className="text-gray-600 dark:text-gray-300" data-testid="plan-potions-note">
          {raid.boostsNeedSupplies
            ? 'Potions: chosen from the kit — one Super combat if it has a melee loadout, one Ranging potion if ranged (a slot each); magic uses the pinned heart.'
            : 'Potions: the raid\'s own potion ("Other") boosts every style; no combat potions are brought.'}
        </div>
        <div className="flex flex-wrap gap-x-2 items-center" data-testid="plan-ring-summary">
          <span className="font-semibold" title="Which ring each loadout wears; change it under Advanced (plan)">Rings:</span>
          <span data-testid="plan-ring-summary-text">{`${ringPolicyDef.label} — ${ringSummary()}`}</span>
        </div>
        <details className="border border-body-400 dark:border-dark-200 rounded px-2 py-1" data-testid="plan-advanced">
          <summary className="cursor-pointer font-semibold" data-testid="plan-advanced-toggle">Advanced (plan)</summary>
          <div className="flex flex-col gap-1 mt-1">
            <label htmlFor="plan-ring-policy" className="flex items-center gap-1">
              Ring policy
              <select id="plan-ring-policy" className="form-control text-xs py-0.5" value={ringPolicy} onChange={(e) => setRingPolicy(e.target.value as RingPolicy)} data-testid="plan-ring-policy">
                {RING_POLICIES.map((p) => <option key={p.id} value={p.id} title={p.title}>{p.label}</option>)}
              </select>
            </label>
            <div className="text-gray-500 dark:text-gray-400">
              {ringPolicyDef.title}
              {ringPolicy === 'camp-one' && '. Tried: Ultor, Bellator, Venator, Magus, Ring of shadows, Lightbearer (the ones you own); camping Lightbearer also gives the Solo spec budget its regen.'}
              {ringPolicy === 'camp-lightbearer' && '. Sets the Solo spec budget\'s Lightbearer regen (15 s per 10%) for this plan.'}
            </div>
          </div>
        </details>
        <div className="flex flex-col gap-1" data-testid="plan-pinned">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="font-semibold" title="Always in the inventory (or worn, if a loadout uses them); free to use in any loadout">Items I always bring:</span>
            {pinned.map((id) => {
              const name = pinnedName(id);
              const unowned = !!name && !isOwned(name, notOwned);
              let title: string | undefined;
              if (unowned) title = 'On your "Items I don’t own" list: the plan leaves it out';
              else if (heartById(id)) title = 'Magic boost for every magic loadout (reusable: one slot for the whole raid)';
              return (
                <span
                  key={id}
                  className={`flex items-center gap-1 border border-body-400 dark:border-dark-200 rounded px-1 ${unowned ? 'line-through opacity-50' : ''}`}
                  data-testid="pinned-item"
                  data-heart={heartById(id) ? 'true' : undefined}
                  data-unowned={unowned ? 'true' : undefined}
                  title={title}
                >
                  <ItemIcon name={name ?? String(id)} src={itemUrl(id)} size={18} />
                  {name ?? id}
                  <button type="button" className="text-red-600 ml-1" title="Remove" onClick={() => setPinned(pinned.filter((x) => x !== id))}>×</button>
                </span>
              );
            })}
            {raid.boostsNeedSupplies && !pinned.some((id) => heartById(id)) && HEART_ITEMS.map((h) => (
              <button key={h.id} type="button" className="underline" onClick={() => setPinned([...pinned, h.id])} data-testid="pin-heart" title="The magic boost: magic loadouts are evaluated without a boost unless a heart is brought">
                {`+ ${h.name}`}
              </button>
            ))}
            <button type="button" className="underline" onClick={() => setPinned(defaultPinned)} data-testid="pinned-reset">reset</button>
            {raid.planDefaults.raidSupplied.length > 0 && (
              <span className="text-gray-500 dark:text-gray-400" data-testid="raid-supplied" title="Handed out by the raid: free to use on any loadout, no inventory slot">
                {`Raid items (0 slots): ${raid.planDefaults.raidSupplied.map((r) => (typeof r === 'string' ? r : r[0])).join(', ')}`}
              </span>
            )}
          </div>
          <div className="max-w-[360px]">
            <EquipmentSelect
              onSelectedItemChange={(opt) => {
                if (opt && !pinned.includes(opt.equipment.id)) setPinned([...pinned, opt.equipment.id]);
              }}
            />
          </div>
        </div>
      </div>

      {running && (
        <div className="flex flex-col gap-1 text-xs" data-testid="plan-progress">
          <div className="flex items-center gap-2">
            <Spinner className="w-4" />
            {progress ? stageText(progress) : 'Starting…'}
            <button type="button" className="btn text-xs" onClick={cancel} data-testid="plan-cancel">Cancel</button>
          </div>
          <div className="w-full h-2 bg-body-200 dark:bg-dark-500 rounded">
            <div className="h-2 bg-orange-400 rounded" style={{ width: `${(fraction * 100).toFixed(1)}%` }} />
          </div>
        </div>
      )}
      {!running && (
        <div>
          <button type="button" className="btn text-xs" onClick={() => setRunId((n) => n + 1)} data-testid="plan-run">Run again</button>
        </div>
      )}
      {error && <div className="text-red-600 text-xs">{`Error: ${error}`}</div>}

      {result && result.slots && planned && (
        <div className="flex flex-col gap-3" data-testid="plan-result">
          {result.excluded.length > 0 && (
            <div className="text-xs flex flex-col gap-0.5 px-2 py-1 rounded border border-red-300 bg-red-50 dark:bg-red-900/20" data-testid="plan-ownership">
              <div data-testid="plan-excluded">
                <span className="font-semibold">Excluded: </span>
                {unownedLabel(result.excluded)}
                <span className="text-gray-500 dark:text-gray-400"> (Items I don&apos;t own)</span>
              </div>
              <div data-testid="plan-max-compare">
                {maxSeconds !== undefined ? (
                  <span data-testid="plan-max-line">
                    {`Best possible with everything: ${formatDuration(maxSeconds)} (yours: ${formatDuration(secs(planned.seconds))})`}
                  </span>
                ) : (
                  <button type="button" className="underline" disabled={comparing} onClick={compareWithMax} data-testid="plan-compare-max" title="Runs the same plan again assuming max gear (about as long as this plan took)">
                    {comparing ? 'Comparing with max gear…' : 'compare with max'}
                  </button>
                )}
              </div>
              {result.ownershipNotices.map((n) => <div key={n} className="text-orange-700 dark:text-orange-300" data-testid="plan-ownership-notice">{n}</div>)}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-sm" data-testid="plan-headline">
              <span className="font-semibold">{planned.route.label}</span>
              {' · '}
              <span className={`font-mono ${DPS_TEXT_CLASS}`} data-testid="plan-total">{formatDuration(secs(planned.seconds))}</span>
              {route === 'all' && <span className="text-xs text-gray-500 dark:text-gray-400"> (fastest route with this kit)</span>}
              <span className="text-xs text-gray-500 dark:text-gray-400" data-testid="plan-team-label">{` · ${teamTimeLabel(teamDpsMultiplier(assumptions))}`}</span>
            </div>
            <span
              className={`px-2 py-0.5 rounded text-sm font-bold ${result.slots.free > 0 ? 'bg-green-600' : 'bg-orange-500'} text-white`}
              data-testid="free-slots"
              data-free={result.slots.free}
              title={`${result.slots.supplies} supplies + ${result.slots.nonItem} non-item + ${result.slots.inventoryItems} items + ${result.slots.swapReserve} swap space = ${result.slots.used} of ${result.slots.total}`}
            >
              {`Free slots: ${result.slots.free} / ${result.slots.total}`}
            </span>
            {result.slots.overfull && (
              <span className="text-red-600 text-xs" data-testid="overfull">
                {`Supplies, non-items and carried items alone need ${result.slots.used} slots: no room for switches.`}
              </span>
            )}
            <button type="button" className="btn text-xs" onClick={loadWorn} data-testid="load-worn" title="Opens the calculator with the worn set against the route's first phase (drains as planned)">Load worn set into calculator</button>
            <button type="button" className="btn text-xs" onClick={loadAll} data-testid="load-all" title="Adds one calculator loadout per kit loadout (replaces the calculator's loadouts if there isn't room), against the route's first phase">Load all loadouts</button>
          </div>

          <div className="flex flex-wrap gap-6 items-start">
            <div className="flex flex-col items-center gap-1">
              <div className="text-xs font-semibold">Worn</div>
              <WornGrid kit={result.kit[0]} />
              <div className="text-[11px] text-center max-w-[180px]" data-testid="worn-label">{result.kit[0].label}</div>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="text-xs font-semibold">Inventory</div>
              <InventoryGrid cells={result.inventory} />
              <div className="text-[10px] text-gray-500 dark:text-gray-400 max-w-[190px]" data-testid="spec-note">
                {`Spec weapons come from "My specs" above${result.specItems.length ? ` (${result.specItems.map((x) => x.name).join(', ')})` : ''}; each takes a slot. Untick a weapon or set Ayak × 0 to free it.`}
              </div>
            </div>
            <div className="flex flex-col gap-1 text-xs min-w-[300px] flex-1" data-testid="kit-loadouts">
              <div className="font-semibold">{`Kit loadouts (${result.kit.length})`}</div>
              {result.kit.map((c, i) => (
                <div key={c.key} className="border-l-4 pl-2 border-body-400 dark:border-dark-200" data-testid="kit-loadout" data-weapon={c.equipment.weapon?.name ?? ''} data-ring={c.equipment.ring?.name ?? ''} data-items={[...equipmentItemIds(c.equipment)].sort((x, y) => x - y).join(',')} data-group={c.group}>
                  <div>
                    <span className="font-semibold">{i === 0 ? 'Worn: ' : 'Switch: '}</span>
                    {c.label}
                    <span className="text-gray-500 dark:text-gray-400">{` · ${c.group} · ${c.source}`}</span>
                    {result.kit.length > 1 && result.kitMarginal?.[i] && (
                      <span className="text-gray-500 dark:text-gray-400" data-testid="kit-marginal" data-slots={result.kitMarginal[i].slots}>
                        {` · +${result.kitMarginal[i].slots} slot${result.kitMarginal[i].slots === 1 ? '' : 's'}, saves ${fmtS(result.kitMarginal[i].seconds)}`}
                      </span>
                    )}
                  </div>
                  <LoadoutIconRow
                    icons={LOADOUT_SLOT_ORDER.filter((s) => c.equipment[s]).map((s) => searchItemIcon(s, c.equipment[s]!))}
                    size={20}
                  />
                </div>
              ))}
              <div className="mt-1 text-gray-600 dark:text-gray-300" data-testid="plan-potions">
                {result.potions.length
                  ? `Potions (from the kit): ${result.potions.map((p) => `${p.label} (${p.group})`).join(', ')}`
                  : 'Potions (from the kit): none'}
              </div>
              <div className="text-gray-600 dark:text-gray-300" data-testid="plan-ring-result" data-ring={result.ring.ring ?? ''} data-policy={result.ring.policy}>
                {result.ring.ring ? `Ring: ${result.ring.ring} on every loadout` : 'Ring: each loadout\'s own'}
                {result.ring.screened.length > 1 && (
                  <span className="text-gray-500 dark:text-gray-400" title="Route time with each ring camped, vs the chosen ring. Exact (±) for the rings planned in full; '≥ … (estimate)' for rings whose quick screen (presets + search rows only) was too far behind to plan in full">
                    {` · others: ${result.ring.screened.filter((x) => x.ring !== result.ring.ring).map((x) => ringOther(x, planned.seconds)).join(', ')}`}
                  </span>
                )}
              </div>
              {result.unusedCarried.length > 0 && (
                <div className="mt-1 px-2 py-1 rounded border border-orange-400 bg-orange-50 dark:bg-orange-900/30 flex flex-wrap items-center gap-2" data-testid="unused-carried">
                  <span>{`Always brought but in no kit loadout: ${result.unusedCarried.map((x) => x.name).join(', ')}.`}</span>
                  <button
                    type="button"
                    className="btn text-xs"
                    data-testid="drop-pinned"
                    onClick={() => setPinned(pinned.filter((id) => !result.unusedCarried.some((x) => x.id === id)))}
                  >
                    {`Remove these to free ${result.unusedCarried.length} slot${result.unusedCarried.length === 1 ? '' : 's'}`}
                  </button>
                </div>
              )}
            </div>
          </div>

          <table className="w-full text-sm" data-testid="plan-encounters">
            <thead>
              <tr className="bg-btns-400 dark:bg-dark-500 text-white">
                <th className="px-2 text-left">Encounter</th>
                <th className="px-2 text-left">Loadout used</th>
                <th className="px-2 text-left">Style</th>
                <th className="px-2 text-left" title="The drain plan of each phase: weapon icon × specs, the chance each spec lands under each icon, then the Defence the DPS uses">Drains</th>
                <th className="px-2 text-right" title="Damage ÷ seconds over the encounter's phases (phase rows: that phase's DPS)">avg DPS (time-weighted)</th>
                <th className="px-2 text-right">Seconds</th>
              </tr>
            </thead>
            <tbody>
              {planned.encounters.map((e) => {
                const damage = e.phases.reduce((t, p) => t + p.damage, 0);
                const time = secs(e.seconds);
                const loadouts = Array.from(new Set(e.phases.map((p) => p.choice?.loadout).filter(Boolean)));
                const styles = Array.from(new Set(e.phases.map((p) => p.choice?.group).filter(Boolean)));
                return (
                  <React.Fragment key={e.id}>
                    <tr className="border-t border-body-300 dark:border-dark-400" data-testid="plan-encounter-row" data-encounter={e.id}>
                      <td className="px-2 py-1">
                        <span className="flex items-center gap-1">
                          <ItemIcon name={e.label} src={targetImageUrl(findTarget(raid.encounterTarget[e.id]))} size={20} />
                          {e.label}
                        </span>
                      </td>
                      <td className="px-2 py-1">{loadouts.join(' / ') || '—'}</td>
                      <td className="px-2 py-1 capitalize">{styles.join(' / ')}</td>
                      <td className="px-2 py-1 text-[11px] text-gray-500 dark:text-gray-400" data-testid="plan-encounter-fight">
                        {e.drainFightSeconds !== undefined ? `drains planned for a ${e.drainFightSeconds} s fight` : ''}
                      </td>
                      <td className={`px-2 py-1 text-right font-mono ${DPS_TEXT_CLASS}`}>{Number.isFinite(time) && time > 0 ? (damage / time).toFixed(3) : '0'}</td>
                      <td className="px-2 py-1 text-right font-mono" data-testid="plan-encounter-seconds">{fmtS(e.seconds)}</td>
                    </tr>
                    <PhaseRows phases={e.phases} encounter={e.id} />
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>

          {result.comparison && (
            <div className="overflow-x-auto max-w-[100vw]">
              <table className="w-full text-sm" data-testid="plan-routes">
                <thead>
                  <tr className="bg-btns-400 dark:bg-dark-500 text-white">
                    <th className="px-2 text-left" title="The same kit timed on every route (the Fractured Archive's middle bosses vary; other raids have one fixed route)">
                      {result.comparison.routes.length > 1 ? 'Route (same kit)' : 'Route'}
                    </th>
                    <th className="px-2 text-right">Total</th>
                    {raid.time.routeSlots.map((sl) => <th key={sl.order} className="px-2 text-right">{`${sl.order}.`}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {result.comparison.routes.map((r, i) => (
                    <tr
                      key={r.route.id}
                      data-testid="plan-route-row"
                      data-route={r.route.id}
                      data-fastest={i === result.planned ? 'true' : 'false'}
                      className={`border-t border-body-300 dark:border-dark-400 ${i === result.planned ? 'bg-orange-100 dark:bg-orange-900/40 font-semibold' : ''}`}
                    >
                      <td className="px-2 py-0.5">
                        {r.route.label}
                        {i === result.planned && result.comparison!.routes.length > 1 && (
                          <span className="ml-2 text-[10px] px-1 rounded bg-orange-400 text-white" data-testid="fastest-badge">{route === 'all' ? 'fastest' : 'planned'}</span>
                        )}
                      </td>
                      <td className={`px-2 py-0.5 text-right font-mono ${DPS_TEXT_CLASS}`} data-testid="plan-route-total" title={fmtS(r.seconds)}>{formatDuration(secs(r.seconds))}</td>
                      {r.encounters.map((e) => (
                        <td key={e.id} className="px-2 py-0.5 text-right whitespace-nowrap font-normal" data-testid={`plan-enc-${e.id}`} data-seconds={secs(e.seconds)}>
                          <div className="flex items-center justify-end gap-1 text-xs">
                            <ItemIcon name={e.label} src={targetImageUrl(findTarget(raid.encounterTarget[e.id]))} size={18} />
                            <span>{e.label}</span>
                          </div>
                          <div className="font-mono text-xs">{e.phases.length ? fmtS(e.seconds) : '—'}</div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="text-xs flex flex-col gap-1" data-testid="plan-why">
            <div className="font-semibold">Why this kit</div>
            {result.rejected.length > 0 ? (
              <>
                <div>Faster with one more loadout, but it doesn&apos;t fit:</div>
                <RejectionList rows={result.rejected} testId="plan-rejected" />
              </>
            ) : <div>No other candidate loadout would make the route faster.</div>}
            {result.alternatives.length > 0 && (
              <>
                <div>Alternatives (a lighter kit, then the best kit of each other style mix):</div>
                <RejectionList rows={result.alternatives} testId="plan-alternatives" />
              </>
            )}
          </div>

          <div className="text-[11px] text-gray-500 dark:text-gray-400" data-testid="plan-stats">
            {`${result.stats.phases} phases, ${result.stats.searches} new searches; ${result.stats.candidates.total} candidate loadouts (${result.stats.candidates.preset} presets, ${result.stats.candidates.search} search rows, ${result.stats.candidates.partial} partial switches${result.stats.candidates.capped ? `, ${result.stats.candidates.capped} capped` : ''}); ${result.stats.evaluations} DPS evaluations, ${result.stats.kitsEvaluated} kits timed; ${(result.stats.ms.total / 1000).toFixed(1)} s (search ${(result.stats.ms.search / 1000).toFixed(1)}, matrix ${(result.stats.ms.matrix / 1000).toFixed(1)}, optimiser ${(result.stats.ms.optimise / 1000).toFixed(1)}).`}
            {' Times: DPS only (Σ HP ÷ DPS per phase); switching is free and instant.'}
          </div>
        </div>
      )}
    </div>
  );
};

export default PlanView;
