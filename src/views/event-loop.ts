/**
 * One MCP process serves every call of a session, so a long synchronous stretch in one call
 * holds up the others: their requests, their cancellations and their replies. Long host loops
 * call `pace.step(work)` with the work each item cost; once the work since the last pause
 * reaches the budget, `step` waits for one turn of the event loop (a macrotask, so pending I/O
 * and timers run) and then honours cancellation. Work is counted in the loop's own units
 * (vertices, triangles, frames), never by a clock, so where a call pauses does not depend on
 * how busy the machine is, and nothing a call produces depends on it either.
 */
export interface EventLoopPace {
  /** Count `work` units; pause when the budget is spent. Resolves at once otherwise. */
  step(work?: number): Promise<void> | undefined;
  /** Pause now, whatever has been counted. */
  pause(): Promise<void>;
}

export function eventLoopPace(budget: number, signal?: AbortSignal): EventLoopPace {
  let spent = 0;
  const pause = () =>
    new Promise<void>((resolve, reject) => {
      setImmediate(() => {
        spent = 0;
        try {
          signal?.throwIfAborted();
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
  return {
    step(work = 1) {
      spent += work;
      return spent >= budget ? pause() : undefined;
    },
    pause,
  };
}

/** One turn of the event loop between two long steps of a call, then its cancellation. */
export function pauseForEventLoop(signal?: AbortSignal): Promise<void> {
  return eventLoopPace(1, signal).pause();
}

/** Vertices a scene load or bounds walk handles between pauses: about 10–20 ms on a 2026 desktop. */
export const VERTEX_BUDGET = 150_000;
/** Triangles the CPU rasterizer draws between pauses. */
export const TRIANGLE_BUDGET = 20_000;
