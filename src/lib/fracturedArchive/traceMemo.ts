/**
 * Phase 37 (speed): an exact memo of a deterministic computation that reads its varying input only through an oracle
 * (the planner's kits: "which member is best on this drain state?"). A run is remembered with the oracle's answers in
 * the order it first asked each question (its trace); another oracle gets the remembered result when it gives the same
 * answer to every question of a remembered trace, asked in that order. That is exact: a deterministic run that gets the
 * same answers asks the same questions, so it would compute the same result.
 *
 * The traces of one key form a tree (a question, then one branch per answer), so a lookup asks at most one trace's
 * questions, however many runs are remembered.
 */
export interface TraceStep<Q> {
  /** The question's identity (two steps with the same id are the same question). */
  id: string;
  question: Q;
  answer: number;
}

interface Leaf<R> {
  result: R;
}
interface Ask<Q, R> {
  id: string;
  question: Q;
  next: Map<number, Node<Q, R>>;
}
type Node<Q, R> = Leaf<R> | Ask<Q, R>;

const isLeaf = <Q, R>(n: Node<Q, R>): n is Leaf<R> => !('next' in n);

export class TraceMemo<Q, R> {
  private roots = new Map<string, Node<Q, R>>();

  private nodes = 0;

  constructor(private readonly maxNodes = 2_000_000) {}

  /** The remembered result for this key and oracle (and with `withSteps`, the steps asked on the way); null on a miss. */
  get(key: string, answer: (q: Q) => number, withSteps = false): { result: R, steps: TraceStep<Q>[] } | null {
    let n = this.roots.get(key);
    const steps: TraceStep<Q>[] = [];
    while (n) {
      if (isLeaf(n)) return { result: n.result, steps };
      const a = answer(n.question);
      if (withSteps) steps.push({ id: n.id, question: n.question, answer: a });
      n = n.next.get(a);
    }
    return null;
  }

  /**
   * Remembers a run: its steps (first asks only, in order) and result. A trace that disagrees with the tree on a
   * question (not deterministic) is not stored.
   */
  set(key: string, steps: TraceStep<Q>[], result: R): void {
    if (this.nodes >= this.maxNodes) this.clear();
    const leaf: Leaf<R> = { result };
    const build = (from: number): Node<Q, R> => {
      let out: Node<Q, R> = leaf;
      for (let i = steps.length - 1; i >= from; i--) {
        out = { id: steps[i].id, question: steps[i].question, next: new Map([[steps[i].answer, out]]) };
        this.nodes += 1;
      }
      return out;
    };
    let n = this.roots.get(key);
    if (!n) {
      this.roots.set(key, build(0));
      return;
    }
    for (let i = 0; ; i++) {
      if (isLeaf(n)) return; // already remembered
      if (i >= steps.length || n.id !== steps[i].id) return; // not the same questions: don't store
      const child: Node<Q, R> | undefined = n.next.get(steps[i].answer);
      if (!child) {
        n.next.set(steps[i].answer, build(i + 1));
        return;
      }
      n = child;
    }
  }

  clear(): void {
    this.roots.clear();
    this.nodes = 0;
  }

  get size(): number {
    return this.nodes;
  }
}

/** The questions a run asked (first asks, in order), forwarded to the run it is part of. */
export class TraceRecorder<Q> {
  readonly seen = new Map<string, number>();

  readonly steps: TraceStep<Q>[] = [];

  constructor(private readonly parent?: TraceRecorder<Q>) {}

  note(step: TraceStep<Q>): void {
    if (this.seen.has(step.id)) return;
    this.seen.set(step.id, step.answer);
    this.steps.push(step);
    this.parent?.note(step);
  }
}
