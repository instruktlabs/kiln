#!/usr/bin/env node
/**
 * The stdio executable every harness launches: `node dist/mcp-server.mjs`.
 *
 * It carries the protocol library and a generated manifest of the tool
 * definitions and nothing else, so `initialize`, `server/discover` and
 * `tools/list` are answered as soon as Node has loaded the library. The engine
 * (`dist/mcp-engine.mjs`, built beside this file) loads on the first call that
 * needs it, and is warmed in the background once the harness holds the tool
 * list. A configuration problem found while loading it -- a stale workspace, an
 * invalid KILN_RENDER, a missing bundle -- comes back as a tool result naming
 * the next step; the process stays up and the next call tries again.
 *
 * Importing this module must not start a server: the entry block is guarded by
 * `isDirectEntry`. Nothing here may import the engine statically;
 * `src/__tests__/mcp-startup.test.ts` scans the bundle's imports.
 */
import { isDirectEntry } from './direct-entry';
import generated from './generated/mcp-manifest.json';
import {
  errorMessage,
  type KilnMcpHost,
  type KilnMcpManifest,
  MCP_SERVER_INSTRUCTIONS,
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
  parseMcpArguments,
  serveKilnStdio,
  withoutLocalPaths,
} from './mcp-core';
import { readHostRequirementsJson } from './requirements-json';
import { assertNodeRuntime } from './runtime-support.mjs';

export { MCP_SERVER_INSTRUCTIONS, MCP_SERVER_NAME, MCP_SERVER_VERSION };

/** The definitions this executable advertises. `bun run mcp:manifest` regenerates the file. */
export const KILN_MCP_MANIFEST = generated as unknown as KilnMcpManifest;

type EngineModule = typeof import('./mcp-engine');

/** The engine built beside this file, or its TypeScript source when run from source. */
function loadEngine(): Promise<EngineModule> {
  const sibling = import.meta.url.endsWith('.ts') ? './mcp-engine.ts' : './mcp-engine.mjs';
  return import(new URL(sibling, import.meta.url).href) as Promise<EngineModule>;
}

/**
 * One engine per process, loaded on first use. A failed load is not cached:
 * the diagnostic goes back as a tool result and the next call tries again, so
 * a workspace repaired while the harness is open needs no restart.
 */
export function packagedEngineHost(options: {
  requirements?: unknown;
}): () => Promise<KilnMcpHost> {
  let pending: Promise<KilnMcpHost> | undefined;
  return () =>
    (pending ??= loadEngine()
      .catch((error: unknown) => {
        throw new Error(
          `The Kiln engine could not be loaded: dist/mcp-engine.mjs is missing or broken beside dist/mcp-server.mjs (${withoutLocalPaths(errorMessage(error))}). Reinstall Kiln (bun install, then bun run build:runtime), run kiln-init . --repair in the workspace, and restart the MCP session.`,
        );
      })
      .then((engine) => engine.createPackagedKilnHost(options))
      .catch((error: unknown) => {
        pending = undefined;
        throw error;
      }));
}

/** `KILN_LIVE_REVIEW=off` removes the review store, and with it the one tool that needs it. */
function manifestFor(env: Record<string, string | undefined>): KilnMcpManifest {
  if (env['KILN_LIVE_REVIEW'] !== 'off') return KILN_MCP_MANIFEST;
  return {
    ...KILN_MCP_MANIFEST,
    tools: KILN_MCP_MANIFEST.tools.filter((tool) => tool.name !== 'kiln_review'),
  };
}

if (isDirectEntry(import.meta.url)) {
  let requirements: unknown;
  try {
    assertNodeRuntime();
    const { requirementsFile } = parseMcpArguments(process.argv.slice(2));
    if (requirementsFile !== undefined)
      requirements = await readHostRequirementsJson(requirementsFile);
  } catch (error) {
    // A wrong command line or an unreadable host file is the host's own
    // mistake, and the honest answer is an exit before the protocol starts.
    console.error(errorMessage(error));
    process.exit(1);
  }
  const host = packagedEngineHost({ requirements });
  let warmup: ReturnType<typeof setTimeout> | undefined;
  const cancelWarmup = () => {
    if (warmup !== undefined) clearTimeout(warmup);
    warmup = undefined;
  };
  process.stdin.once('end', cancelWarmup);
  process.stdin.once('close', cancelWarmup);
  // stdout is the MCP transport; diagnostics must never touch it.
  console.error(`kiln MCP server ${MCP_SERVER_VERSION} on stdio`);
  void serveKilnStdio({
    manifest: manifestFor(process.env),
    host,
    // The harness now holds the tool list and is busy with its model request,
    // which takes seconds: load the engine meanwhile so the first call is quick.
    // A failure here is reported by that call, not here.
    afterFirstToolList: () => {
      if (process.stdin.readableEnded || process.stdin.destroyed) return;
      warmup = setTimeout(() => {
        warmup = undefined;
        if (!process.stdin.readableEnded && !process.stdin.destroyed) void host().catch(() => {});
      }, 50);
      // Speculative work must not keep a disconnected stdio process alive.
      warmup.unref();
    },
  });
}
