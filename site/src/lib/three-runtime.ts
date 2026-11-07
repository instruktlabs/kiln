import { Timer } from 'three/webgpu';

/**
 * What bare `three` resolves to in the site's client code (`astro.config.mjs`): the WebGPU build, so the viewer, its
 * loaders and React Three Fiber share one copy of three's classes. The scene kit's facade does the same for the scenes.
 * That build has no `Clock` or `WebGLRenderer`, and React Three Fiber names both.
 */
export * from 'three/webgpu';

export class Clock {
  autoStart: boolean;
  startTime = 0;
  oldTime = 0;
  elapsedTime = 0;
  running = false;
  private readonly timer = new Timer();

  constructor(autoStart = true) {
    this.autoStart = autoStart;
  }

  start(): void {
    this.startTime = performance.now();
    this.oldTime = this.startTime;
    this.elapsedTime = 0;
    this.running = true;
    this.timer.reset();
  }

  stop(): void {
    this.getElapsedTime();
    this.running = false;
    this.autoStart = false;
  }

  getDelta(): number {
    if (this.autoStart && !this.running) {
      this.start();
      return 0;
    }
    if (!this.running) return 0;
    this.timer.update();
    const delta = this.timer.getDelta();
    this.oldTime = performance.now();
    this.elapsedTime += delta;
    return delta;
  }

  getElapsedTime(): number {
    this.getDelta();
    return this.elapsedTime;
  }
}

/** The classic renderer is not in this build. A canvas given no renderer factory fails here, by name. */
export class WebGLRenderer {
  constructor() {
    throw new Error('The 3D view needs its WebGPU renderer factory (viewer-renderer.ts).');
  }
}
