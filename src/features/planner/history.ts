/**
 * Undo/redo stack of immutable snapshots.
 *
 * Consecutive pushes with the same `key` inside `coalesceMs` replace the top
 * entry instead of adding a new one (typing in a field, nudging with arrows),
 * so one undo reverts the whole burst.
 */
export class History<T> {
  private past: T[] = [];
  private future: T[] = [];
  private current: T;
  private lastKey: string | null = null;
  private lastAt = 0;

  constructor(
    initial: T,
    private readonly opts: { limit?: number; coalesceMs?: number } = {},
  ) {
    this.current = initial;
  }

  get present(): T {
    return this.current;
  }

  get canUndo() {
    return this.past.length > 0;
  }

  get canRedo() {
    return this.future.length > 0;
  }

  get size() {
    return { past: this.past.length, future: this.future.length };
  }

  push(state: T, key?: string | null, now = Date.now()) {
    const window = this.opts.coalesceMs ?? 1000;
    const coalesce = key != null && key === this.lastKey && now - this.lastAt <= window && this.past.length > 0;
    if (!coalesce) {
      this.past.push(this.current);
      const limit = this.opts.limit ?? 100;
      if (this.past.length > limit) this.past.splice(0, this.past.length - limit);
    }
    this.current = state;
    this.future = [];
    this.lastKey = key ?? null;
    this.lastAt = now;
  }

  undo(): T | null {
    const prev = this.past.pop();
    if (prev === undefined) return null;
    this.future.push(this.current);
    this.current = prev;
    this.lastKey = null;
    return prev;
  }

  redo(): T | null {
    const next = this.future.pop();
    if (next === undefined) return null;
    this.past.push(this.current);
    this.current = next;
    this.lastKey = null;
    return next;
  }

  /** Replaces the present without recording a step (e.g. server reload). */
  reset(state: T, clear = true) {
    this.current = state;
    this.lastKey = null;
    if (clear) {
      this.past = [];
      this.future = [];
    }
  }
}
