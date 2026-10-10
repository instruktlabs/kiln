/**
 * Which Kiln is answering.
 *
 * A server named `kiln` is not necessarily this installation. Two live examples
 * from one development machine: a `kiln` entry in `~/.cursor/mcp.json` pointing at
 * an extracted 0.6.0 package while the checkout was 0.7.0, and a cached
 * `kiln_local` tool namespace from a different harness's app store. Both answer
 * tool calls perfectly happily, and neither announces that it is not the engine
 * the workspace was built against.
 *
 * The generated workspace guide already says "a server named kiln may be a
 * different installation; do not substitute it silently" -- an instruction with
 * nothing behind it, because no tool result carried the identity to check. This
 * module is what it checks: `kiln_discover {capabilities:true}` reports
 * this, `.kiln/workspace.json` records `runtime`, and the two can be compared.
 *
 * No filesystem read, deliberately. `src/views/renderer-id.ts` does one at module
 * load and AGENTS.md warns about exactly that: this graph is kept free of
 * node-only dependencies evaluated at import time, and `src/tools/discovery.ts`
 * imports this. So the version is a literal the package-contents test pins to
 * `package.json`, and the location comes from `import.meta.url`, which every ESM
 * runtime supplies without an import.
 */

/**
 * The engine version. A literal rather than a `package.json` read; a test in
 * `src/__tests__/package-contents.test.ts` fails if it disagrees with the manifest
 * or with any plugin manifest, which is what keeps the literal honest.
 */
export const ENGINE_VERSION = '1.2.1';

/**
 * Where this engine was loaded from, as a `file://` URL of the package root.
 *
 * A URL rather than a path because deriving one needs no import: `fileURLToPath`
 * lives in `node:url`, and this module is reachable from the tool registry.
 * Callers comparing against a recorded filesystem path can still do so -- the
 * `runtime` a workspace manifest records appears verbatim inside this URL.
 */
export const ENGINE_INSTALL_URL: string = new URL('../', import.meta.url).href;

/** The identity block embedded in `kiln.capabilities.v1`. */
export interface EngineIdentityV1 {
  version: string;
  installUrl: string;
}

export function engineIdentity(): EngineIdentityV1 {
  return { version: ENGINE_VERSION, installUrl: ENGINE_INSTALL_URL };
}
