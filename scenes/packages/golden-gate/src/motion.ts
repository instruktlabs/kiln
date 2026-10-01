/** A scene clock for ambient motion, flights and driving; orbit input stays available. */
export function createGoldenGateMotion(initialReduced: boolean, changed: (paused: boolean) => void = () => {}) {
  let reduced = initialReduced, paused = initialReduced, time = 0, delta = 0;
  let previousSource: number | undefined;
  const control = {
    get paused() { return paused; }, get time() { return time; }, get delta() { return delta; },
    now: () => time,
    setPaused(value: boolean) { if (value === paused) return; paused = value; delta = 0; changed(paused); },
    setReduced(value: boolean) { if (value === reduced) return; reduced = value; if (reduced) control.setPaused(true); },
    advance(dt: number, sourceTime?: number) {
      // Explicit review seeks remain absolute, while ordinary frames retain the pause offset.
      if (sourceTime !== undefined) {
        if (previousSource === undefined || Math.abs(sourceTime - previousSource - dt) > 1e-7) time = sourceTime - dt;
        previousSource = sourceTime;
      }
      delta = paused ? 0 : Math.max(0, dt); time += delta;
    },
  };
  return control;
}
