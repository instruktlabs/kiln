import { Timer } from 'three/webgpu';

// One underlying three build. The adapter only replaces the deprecated Clock
// constructor R3F uses internally; renderer/material classes retain identity.
export * from 'three/webgpu';

type ClockSource = {
  timer: { reset(): unknown; update(): unknown; getDelta(): number };
  now(): number;
};

export class Clock {
  autoStart: boolean;
  startTime = 0;
  oldTime = 0;
  elapsedTime = 0;
  running = false;
  private readonly source: ClockSource;

  constructor(autoStart = true, source?: ClockSource) {
    this.autoStart = autoStart;
    this.source = source ?? { timer: new Timer(), now: () => performance.now() };
  }

  start(): void {
    this.startTime = this.source.now();
    this.oldTime = this.startTime;
    this.elapsedTime = 0;
    this.running = true;
    this.source.timer.reset();
  }

  stop(): void {
    this.getElapsedTime();
    this.running = false;
    this.autoStart = false;
  }

  getDelta(): number {
    if (this.autoStart && !this.running) { this.start(); return 0; }
    if (!this.running) return 0;
    this.source.timer.update();
    const delta = this.source.timer.getDelta();
    this.oldTime = this.source.now();
    this.elapsedTime += delta;
    return delta;
  }

  getElapsedTime(): number {
    this.getDelta();
    return this.elapsedTime;
  }
}

// Bare-three consumers use the WebGPU build. If a missed async factory would
// cause R3F to construct the unavailable classic renderer, fail explicitly.
export class WebGLRenderer {
  constructor() { throw new Error('Scene kit requires an async WebGPURenderer factory.'); }
}
