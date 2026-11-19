// Evaluated before any engine module in the browser bundle (ES modules run their imports in
// order). The engine wraps GLB bytes in `Buffer.from` and reads `Buffer.byteLength`, so the
// browser build installs Bun's built-in browser fallback for `node:buffer` as the global.
// In Node this is a no-op. Spike code: it does not ship in the package.
import { Buffer } from 'node:buffer';

if (typeof globalThis.Buffer === 'undefined') globalThis.Buffer = Buffer;
