/** A stalled frame (including an HTML 404) cannot hold the scene overlay indefinitely. */
export function createSceneWatchdog(
  fail: () => void,
  clock = {
    set: (fn: () => void, ms: number) => window.setTimeout(fn, ms),
    clear: (id: number) => window.clearTimeout(id),
  },
) {
  let timer: number | undefined;
  const stop = () => {
    if (timer !== undefined) clock.clear(timer);
    timer = undefined;
  };
  return {
    touch() {
      stop();
      timer = clock.set(() => {
        timer = undefined;
        fail();
      }, 20_000);
    },
    stop,
  };
}
