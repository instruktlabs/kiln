import { fileURLToPath } from 'node:url';

/** Bare `three` in the site's client graph is the WebGPU build (`src/lib/three-runtime.ts`), so its classes have one identity. */
export const VIEWER_THREE_ALIAS = {
  find: /^three$/,
  replacement: fileURLToPath(new URL('../src/lib/three-runtime.ts', import.meta.url)),
};
