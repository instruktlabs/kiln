export type SceneErrorCode = 'no-container' | 'renderer-init' | 'asset-fetch' | 'asset-hash' | 'asset-parse' | 'pack-invalid' | 'three-version' | 'context-lost' | 'msaa-discard' | 'runtime';
export class SceneError extends Error {
  readonly code: SceneErrorCode; override readonly cause?: unknown;
  constructor(code: SceneErrorCode, message: string, cause?: unknown) { super(message); this.name = 'SceneError'; this.code = code; this.cause = cause; }
}
export function asSceneError(error: unknown, code: SceneErrorCode = 'runtime'): SceneError {
  return error instanceof SceneError ? error : new SceneError(code, error instanceof Error ? error.message : 'Scene operation failed', error);
}
export function createReadyGate(o: { ready(): void; error(e: Error): void; schedule(fn: () => void): number; cancel(id: number): void }) {
  let dead = false, failed = false, delivered = false, pending = 0;
  return {
    get disposed() { return dead; }, get ready() { return delivered; }, get failed() { return failed; },
    frame(complete: boolean) {
      if (!complete || dead || failed || delivered || pending) return;
      pending = o.schedule(() => { pending = 0; if (!dead && !failed && !delivered) { delivered = true; o.ready(); } });
    },
    fail(e: unknown) { if (dead || failed) return; failed = true; if (pending) o.cancel(pending); pending = 0; o.error(asSceneError(e)); },
    dispose() { if (dead) return; dead = true; if (pending) o.cancel(pending); pending = 0; },
  };
}
