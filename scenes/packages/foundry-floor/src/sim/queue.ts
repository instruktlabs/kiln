// SPDX-License-Identifier: MIT
// The event queue (sim-spec 8): a binary heap ordered by (t, seq), where seq is a global insertion counter, so
// events at the same millisecond always resolve in the order they were scheduled. The heap array is plain
// JSON and travels in snapshots.

/** One scheduled event. `k` is the kind; `a` and `b` are integer payloads (entity index, version token). */
export interface SimEvent {
  t: number;
  s: number;
  k: string;
  a: number;
  b: number;
}

function before(x: SimEvent, y: SimEvent): boolean {
  return x.t < y.t || (x.t === y.t && x.s < y.s);
}

export function heapPush(heap: SimEvent[], ev: SimEvent): void {
  heap.push(ev);
  let i = heap.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    const parent = heap[p] as SimEvent;
    if (!before(ev, parent)) break;
    heap[i] = parent;
    i = p;
  }
  heap[i] = ev;
}

export function heapPop(heap: SimEvent[]): SimEvent | undefined {
  const top = heap[0];
  const last = heap.pop();
  if (top === undefined || last === undefined || heap.length === 0) return top;
  let i = 0;
  const n = heap.length;
  for (;;) {
    const l = 2 * i + 1;
    if (l >= n) break;
    const r = l + 1;
    const c = r < n && before(heap[r] as SimEvent, heap[l] as SimEvent) ? r : l;
    const child = heap[c] as SimEvent;
    if (!before(child, last)) break;
    heap[i] = child;
    i = c;
  }
  heap[i] = last;
  return top;
}

/** The queue in canonical (t, seq) order, for hashing and inspection. */
export function heapSorted(heap: readonly SimEvent[]): SimEvent[] {
  return [...heap].sort((x, y) => x.t - y.t || x.s - y.s);
}
