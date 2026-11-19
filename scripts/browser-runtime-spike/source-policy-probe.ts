// Which browser-reachable globals does the engine's generated-source check let through? Each
// probe is a one-line program body; the check is the same `assertGeneratedSourceSafe` the
// build path runs before `new Function`. Nothing here executes the probes.
// Not part of the package.  bun scripts/browser-runtime-spike/source-policy-probe.ts
import { assertGeneratedSourceSafe } from '../../src/validation';

export const PROBES: Record<string, string> = {
  globalThis: 'globalThis.x = 1;',
  fetch: "fetch('https://example.invalid');",
  'function constructor': "(function () {}).constructor('return this')();",
  'arrow constructor property': "const F = (() => 0)['constr' + 'uctor'];",
  'dynamic import': "import('https://example.invalid/x.js');",
  localStorage: "localStorage.getItem('k');",
  indexedDB: "indexedDB.open('k');",
  'window.open via open': "open('https://example.invalid');",
  parent: "parent.postMessage('x', '*');",
  top: 'top.location;',
  postMessage: "postMessage('x');",
  importScripts: "importScripts('https://example.invalid/x.js');",
  Worker: "new Worker('x.js');",
  Image: "new Image().src = 'https://example.invalid/p';",
  navigator: 'navigator.sendBeacon;',
  crypto: 'crypto.getRandomValues(new Uint8Array(1));',
  setTimeout: 'setTimeout(() => 0, 1);',
  'while(true)': 'while (true) {}',
};

export function probeSourcePolicy(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, body] of Object.entries(PROBES)) {
    try {
      assertGeneratedSourceSafe(`${body}\nfunction build() { return new THREE.Group(); }`);
      out[name] = 'accepted';
    } catch (error) {
      out[name] = `refused (${(error as { code?: string }).code ?? (error as Error).name})`;
    }
  }
  return out;
}

if (import.meta.main)
  for (const [k, v] of Object.entries(probeSourcePolicy())) console.log(`${k.padEnd(28)} ${v}`);
