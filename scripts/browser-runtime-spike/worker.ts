// Dedicated-worker host for the spike bundle: the same build path off the page's main thread.
// Messages carry data only (source text, options, parameter values); the GLB returns as a
// transferred ArrayBuffer. Not part of the package.
import { buildProgram } from './entry';

interface BuildRequest {
  id: number;
  code: string;
  options: Parameters<typeof buildProgram>[1];
}

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<BuildRequest>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};

scope.onmessage = async (event) => {
  const { id, code, options } = event.data;
  const started = performance.now();
  try {
    const result = await buildProgram(code, options);
    const ms = performance.now() - started;
    const glb = result.glb.slice();
    scope.postMessage(
      {
        id,
        ok: true,
        ms,
        glb: glb.buffer,
        tris: result.tris,
        artifactGlbSha256: result.artifactGlbSha256,
      },
      [glb.buffer],
    );
  } catch (error) {
    scope.postMessage({
      id,
      ok: false,
      ms: performance.now() - started,
      error: String((error as Error)?.stack ?? error),
    });
  }
};
scope.postMessage({ ready: true });
