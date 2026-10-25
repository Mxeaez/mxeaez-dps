import type {
  EncounterBudgetOptions, EncounterId, EncounterTime, KitChoice, PhaseQuery, PhaseTime, RaidKit, RaidTimeAssumptions,
} from '@/lib/fracturedArchive/raidTime';
import { TraceMemo, TraceRecorder } from '@/lib/fracturedArchive/traceMemo';

/**
 * Phase 37 (speed): kits whose encounter times and model passes are memoised exactly (`RaidKit.memoEncounter` /
 * `memoPass`, traceMemo.ts). The planner's kits differ only in their members; a kit answers a query through the drain
 * state it maps to (`ask`: the same for every kit) and its pick there (`pick`: the member it uses), and everything else
 * a kit has (`parts`: spec damage, which weapons hit, drain keys) is the same for every kit. So a remembered encounter
 * (or pass) is reused by any kit with the same pick on every drain state the remembered run asked about; the key holds
 * the rest (encounter, assumptions, spec plan, budget options; for a pass its drain state, fight length and how the
 * budget rewrote the kit's queries). Assumptions and spec plans must not be mutated once timed with (keyed by identity).
 */
export interface KitMemoOptions<S> {
  /** The drain state of a query: `id` = its identity (equal ids = equal states for every kit). */
  ask: (q: PhaseQuery) => { id: string, state: S };
  /** The member a kit uses on a drain state (-1: none). */
  pick: (state: S, id: string, members: number[]) => number;
  /** The kit's answer for a pick. */
  choice: (pick: number, state: S, id: string) => KitChoice | null;
  /** The kit parts that don't depend on the members. */
  parts: Pick<RaidKit, 'specDamage' | 'specHits' | 'drainKey'>;
  /** Memo bound (trace nodes per memo; cleared when reached). */
  maxNodes?: number;
}

export interface KitMemo {
  /** A kit of these members with the memos. */
  kit: (members: number[]) => RaidKit;
  /** The same kit without them (tests: must give the same results). */
  plain: (members: number[]) => RaidKit;
  stats: { encounterHits: number, encounterRuns: number, passHits: number, passRuns: number };
}

export const createKitMemo = <S>(o: KitMemoOptions<S>): KitMemo => {
  type Q = { id: string, state: S };
  const encounters = new TraceMemo<Q, EncounterTime>(o.maxNodes);
  const passes = new TraceMemo<Q, PhaseTime[]>(o.maxNodes);
  const stats = {
    encounterHits: 0, encounterRuns: 0, passHits: 0, passRuns: 0,
  };
  // keys: objects by identity → a short id of their JSON (the keys are hashed on every lookup)
  const ids = new Map<string, number>();
  const short = (full: string) => {
    let id = ids.get(full);
    if (id === undefined) {
      id = ids.size;
      ids.set(full, id);
    }
    return `#${id}`;
  };
  const objectKey = <T extends object>(memo: WeakMap<T, string>, x: T, key: (y: T) => string) => {
    let k = memo.get(x);
    if (k === undefined) {
      k = short(key(x));
      memo.set(x, k);
    }
    return k;
  };
  const assumptionKeys = new WeakMap<RaidTimeAssumptions, string>();
  const passAssumptionKeys = new WeakMap<RaidTimeAssumptions, string>();
  const allocKeys = new WeakMap<object, string>();
  const encounterKey = (id: EncounterId, a: RaidTimeAssumptions, opts: EncounterBudgetOptions) => {
    const alloc = a.fixedAlloc?.[id];
    return `${id}|${objectKey(assumptionKeys, a, (x) => JSON.stringify([{ ...x, model: undefined, fixedAlloc: undefined }, x.model?.id ?? null]))}|${
      alloc ? objectKey(allocKeys, alloc, (x) => JSON.stringify(x)) : ''}|${JSON.stringify(opts)}`;
  };
  // a model pass reads the kit's answers, never the spec budget or plan
  const passKey = (key: string, a: RaidTimeAssumptions) => `${key}|${objectKey(passAssumptionKeys, a, (x) => JSON.stringify([{
    ...x, model: undefined, fixedAlloc: undefined, specBudget: undefined,
  }, x.model?.id ?? null]))}`;
  const answerOf = (members: number[]) => (q: Q) => o.pick(q.state, q.id, members);

  const recordingKit = (members: number[], rec: TraceRecorder<Q>): RaidKit => ({
    best: (q) => {
      const { id, state } = o.ask(q);
      let p = rec.seen.get(id);
      if (p === undefined) {
        p = o.pick(state, id, members);
        rec.note({ id, question: { id, state }, answer: p });
      }
      return o.choice(p, state, id);
    },
    ...o.parts,
    memoPass: (key, a, run) => {
      const k = passKey(key, a);
      const hit = passes.get(k, answerOf(members), true);
      if (hit) {
        stats.passHits += 1;
        hit.steps.forEach((st) => rec.note(st));
        return hit.result;
      }
      stats.passRuns += 1;
      const sub = new TraceRecorder<Q>(rec);
      const rows = run(recordingKit(members, sub));
      passes.set(k, sub.steps, rows);
      return rows;
    },
  });

  const plain = (members: number[]): RaidKit => ({
    best: (q) => {
      const { id, state } = o.ask(q);
      return o.choice(o.pick(state, id, members), state, id);
    },
    ...o.parts,
  });

  const kit = (members: number[]): RaidKit => ({
    ...plain(members),
    memoEncounter: (id, a, opts, run) => {
      const key = encounterKey(id, a, opts);
      const hit = encounters.get(key, answerOf(members));
      if (hit) {
        stats.encounterHits += 1;
        return hit.result;
      }
      stats.encounterRuns += 1;
      const rec = new TraceRecorder<Q>();
      const result = run(recordingKit(members, rec));
      encounters.set(key, rec.steps, result);
      return result;
    },
  });

  return { kit, plain, stats };
};
