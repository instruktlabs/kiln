export type IslandState = 'idle' | 'loading' | 'ready' | 'error';

/** A request owns its mount; an obsolete request may never reopen a closed island. */
export function createIslandSession(
  load: () => Promise<() => void>,
  onState: (state: IslandState, error?: Error) => void,
) {
  let generation = 0;
  let active = false;
  let cleanup: (() => void) | undefined;
  return {
    async start() {
      if (active) return;
      active = true;
      const request = ++generation;
      onState('loading');
      try {
        const dispose = await load();
        if (request !== generation) {
          dispose();
          return;
        }
        cleanup = dispose;
        onState('ready');
      } catch (cause) {
        if (request !== generation) return;
        active = false;
        onState('error', cause instanceof Error ? cause : new Error(String(cause)));
      }
    },
    stop() {
      generation++;
      active = false;
      cleanup?.();
      cleanup = undefined;
      onState('idle');
    },
  };
}
