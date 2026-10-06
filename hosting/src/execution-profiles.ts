import { RENDER_LIMITS } from './render-limits';

/** Host-selected profiles only. No HTTP or tool field chooses code, image or environment. */
export const EXECUTION_PROFILES = {
  evaluation: {
    url: 'http://kiln-evaluator.internal/evaluate',
    image: 'kiln',
    entry: '/opt/kiln/evaluate.mjs',
    env: { KILN_RENDER: 'cpu' } as Record<string, string>,
    requestBytes: 4 * 1024 * 1024,
    responseBytes: 8 * 1024 * 1024,
    deadlineMs: 60_000,
  },
  render: {
    url: 'http://kiln-renderer.internal/render',
    image: 'renderer',
    entry: '/opt/kiln/render.mjs',
    env: {} as Record<string, string>,
    requestBytes: RENDER_LIMITS.requestBytes,
    responseBytes: RENDER_LIMITS.responseBytes,
    deadlineMs: RENDER_LIMITS.deadlineMs,
  },
} as const;
export type ExecutionKind = keyof typeof EXECUTION_PROFILES;
