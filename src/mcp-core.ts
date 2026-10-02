/**
 * The protocol half of the Kiln MCP server, shared by the thin stdio entry
 * (`src/mcp-server.ts`) and the in-process server the tests build
 * (`createKilnMcpServer` in `src/mcp-engine.ts`): identity, instructions,
 * the request handlers over a tool manifest, cache hints and the stdin guard.
 *
 * Nothing here imports the engine. That is the whole point: the entry bundles
 * this module with a generated manifest and loads `mcp-engine` on the first
 * call that needs it, so the handshake, `server/discover` and the tool list
 * are answered in the time it takes Node to load the protocol library, not
 * the time it takes to load three, zod, sharp and the registry. Codex gives
 * an optional server one second before it goes on without its tools.
 *
 * The handlers are written on the low-level `Server` rather than `McpServer`
 * because the advertised definitions must be exact bytes from the manifest
 * (stable across processes, no library-side schema conversion at startup)
 * and because the capabilities must say only what Kiln does: the list of
 * tools and resources is fixed for a build, so no `listChanged` is
 * advertised and none is acknowledged on `subscriptions/listen`.
 */
import {
  type CallToolResult,
  type JSONRPCMessage,
  ProtocolError,
  ProtocolErrorCode,
  Server,
  type Tool,
  type Transport,
} from '@modelcontextprotocol/server';
import {
  EXTENSION_ID as MCP_APPS_EXTENSION_ID,
  RESOURCE_MIME_TYPE as MCP_APPS_MIME_TYPE,
} from '@modelcontextprotocol/ext-apps/server';
import {
  type ServeStdioOptions,
  type StdioServerHandle,
  StdioServerTransport,
  serveStdio,
} from '@modelcontextprotocol/server/stdio';
import { readFile } from 'node:fs/promises';

import { KILN_ASSET_WIDGET_URI } from './asset-widget-uri';
import type { AssetLink } from './assets-resources';
import { ENGINE_VERSION } from './engine-identity';
import { CATEGORY_MIGRATION_MESSAGE } from './requirements-json';

/** Server identity reported in the handshake and stamped into every 2026-07-28 result. */
export const MCP_SERVER_NAME = 'kiln';
export const MCP_SERVER_VERSION = ENGINE_VERSION;

/**
 * The spec's optional `instructions` field, returned by `initialize` and
 * `server/discover`.
 *
 * This is the only orientation channel that survives every install shape. A
 * user who configures the server by hand and opens an empty folder has no
 * AGENTS.md, no CLAUDE.md and no registered skills -- but the skills do ship
 * beside the server, so the useful thing to say is that they exist and where.
 *
 * At most 700 characters, with the essentials inside the first 512 (v1 contract
 * rule 5): the text rides on every session start in every client, and the
 * harnesses that cut it cut from the end. It names no absolute path, so the
 * same bytes serve every installation.
 */
export const MCP_SERVER_INSTRUCTIONS =
  "Kiln turns JavaScript you write into GLB assets and returns rendered views. Work by reference: send a program once to kiln_validate or kiln_render, keep the returned programRef exactly, and use it for every later render, inspect, kiln_source and kiln_edit call; never resend a program to change part of it. Call kiln_discover first for helper contracts, with capabilities:true for the host's runtime, project and camera facts. Read viewFidelity before judging materials: a CPU view shows shape, not material; GPU views need the render service in render-service/. Agent Skills for authoring, refining, QA and scenes ship in skills/ beside this server's dist/; read the matching SKILL.md first.";

/** One MCP content block. Mirrors the SDK's `CallToolResult['content']` element. */
export type KilnContentBlock =
  | AssetLink
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string };

/**
 * The structurally-typed subset of the SDK's `CallToolResult` Kiln produces.
 *
 * Declared locally rather than imported so `runTool` stays usable by callers
 * that are not holding an SDK type (the parity test drives it directly).
 *
 * A type alias, not an interface, and that is load-bearing: the SDK's
 * `CallToolResult` carries an index signature for protocol passthrough fields,
 * and TypeScript grants an implicit index signature to type aliases but not to
 * interfaces.
 */
export type KilnToolResult = {
  content: KilnContentBlock[];
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
  _meta?: Record<string, unknown>;
};

/** One `resources/read` content entry: text for source and JSON, base64 for everything else. */
export type KilnResourceContents = {
  uri: string;
  mimeType: string;
  _meta?: Record<string, unknown>;
} & ({ text: string } | { blob: string });

/** A tool definition exactly as `tools/list` advertises it. */
export interface KilnMcpManifestTool {
  name: string;
  description: string;
  inputSchema: { type: 'object'; [key: string]: unknown };
  annotations?: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
  };
  _meta?: Record<string, unknown>;
  outputSchema?: { [key: string]: unknown };
}

/** A fixed resource exactly as `resources/list` advertises it. */
export interface KilnMcpManifestResource {
  uri: string;
  name: string;
  mimeType: string;
  description: string;
  _meta?: Record<string, unknown>;
}

/** A resource template exactly as `resources/templates/list` advertises it. */
export interface KilnMcpManifestTemplate {
  name: string;
  uriTemplate: string;
  description: string;
}

/**
 * Everything a client can learn without calling a tool. Generated from the
 * registry by `scripts/generate-mcp-manifest.ts` into
 * `src/generated/mcp-manifest.json`, which the entry bundles; a test proves
 * the committed file equals what the registry builds.
 */
export interface KilnMcpManifest {
  kind: 'kiln.mcp-manifest.v1';
  tools: KilnMcpManifestTool[];
  resources: KilnMcpManifestResource[];
  resourceTemplates: KilnMcpManifestTemplate[];
}

/** What the engine supplies once loaded: the calls that need it. */
export interface KilnMcpHost {
  callTool(
    name: string,
    args: Record<string, unknown>,
    request: { signal: AbortSignal },
  ): Promise<KilnToolResult>;
  readResource(uri: string): Promise<KilnResourceContents>;
}

/** Presentation hints for the asset viewer app, hidden from the language model. */
export const KILN_WIDGET_META: Record<string, unknown> = {
  ui: { prefersBorder: true, csp: { connectDomains: [], resourceDomains: [] } },
  'openai/widgetDescription': 'Inspect the saved 3D asset and download its GLB or editable bundle.',
  'openai/widgetPrefersBorder': true,
};

export const KILN_WIDGET_RESOURCE: KilnMcpManifestResource = {
  uri: KILN_ASSET_WIDGET_URI,
  name: 'kiln-asset-viewer',
  mimeType: MCP_APPS_MIME_TYPE,
  description: 'Interactive Kiln asset viewer and downloads',
  _meta: KILN_WIDGET_META,
};

export const KILN_RESOURCE_TEMPLATES = {
  assetFile: {
    name: 'asset-file',
    uriTemplate: 'kiln://assets/{collection}/{asset}/{revision}/{file}',
    description:
      'Saved GLB/source/preview/manifest/bundle, or derived runtime GLB and metadata sidecar.',
  },
  projectPackage: {
    name: 'project-package',
    uriTemplate: 'kiln://projects/{project}/{revision}/{profile}',
    description: 'Exact editable project bundle or runtime derivative ZIP.',
  },
} as const satisfies Record<string, KilnMcpManifestTemplate>;

/**
 * Definitions, templates and the viewer page are fixed for a build, and a new
 * build restarts the process, so a client may hold them for a day. Asset and
 * project files are a user's own data: never shared, and re-read on demand.
 */
export const DEFINITION_TTL_MS = 86_400_000;
const CACHE_HINTS = {
  'server/discover': { ttlMs: DEFINITION_TTL_MS, cacheScope: 'public' },
  'tools/list': { ttlMs: DEFINITION_TTL_MS, cacheScope: 'public' },
  'resources/list': { ttlMs: DEFINITION_TTL_MS, cacheScope: 'public' },
  'resources/templates/list': { ttlMs: DEFINITION_TTL_MS, cacheScope: 'public' },
  'resources/read': { ttlMs: 0, cacheScope: 'private' },
} as const;

/** Only what Kiln does: no `listChanged`, because the lists never change within a build. */
export function kilnServerCapabilities() {
  return {
    tools: {},
    resources: {},
    extensions: { [MCP_APPS_EXTENSION_ID]: { mimeTypes: [MCP_APPS_MIME_TYPE] } },
  };
}

export interface KilnServerOptions {
  manifest: KilnMcpManifest;
  /**
   * Supplies the engine on first use. The entry loads `mcp-engine` here; the
   * in-process server resolves immediately. A rejection is reported as a tool
   * result naming the next step, and the next call tries again.
   */
  host: () => Promise<KilnMcpHost>;
  /** Runs once, after the first `tools/list` has been answered on this instance. */
  afterFirstToolList?: () => void;
  /** The viewer page served for the widget resource; defaults to the packaged `dist/viewer/chat.html`. */
  widgetHtml?: () => Promise<string>;
  instructions?: string;
}

const LOCAL_PATH =
  /(?<![A-Za-z0-9])(?:[A-Za-z]:[\\/]|\\\\[^\s"'`]+|\/(?:home|Users|tmp|var|opt|mnt|root|srv|private)\/)[^\s"'`)\]]*/gu;

/**
 * Rule 9 of the v1 contract: a diagnostic names the cause and the next call
 * and carries no absolute local path. Raw filesystem errors do carry one, so
 * the loading diagnostics pass through here before they reach a tool result.
 */
export function withoutLocalPaths(text: string): string {
  return text.replace(LOCAL_PATH, '<local path>');
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function readPackagedWidgetHtml(): Promise<string> {
  return readFile(new URL('../dist/viewer/chat.html', import.meta.url), 'utf8');
}

/** Build the server over a manifest; every call that needs the engine goes through `host()`. */
export function createKilnServer(options: KilnServerOptions): Server {
  const { manifest } = options;
  const tools = new Map(manifest.tools.map((tool) => [tool.name, tool] as const));
  const templatePrefixes = manifest.resourceTemplates.map((template) =>
    template.uriTemplate.slice(0, template.uriTemplate.indexOf('{')),
  );
  const server = new Server(
    { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
    {
      instructions: options.instructions ?? MCP_SERVER_INSTRUCTIONS,
      capabilities: kilnServerCapabilities(),
      cacheHints: CACHE_HINTS,
    },
  );

  let listed = false;
  server.setRequestHandler('tools/list', () => {
    if (!listed) {
      listed = true;
      // After the return: the answer is written before anything else happens.
      if (options.afterFirstToolList) queueMicrotask(options.afterFirstToolList);
    }
    return { tools: manifest.tools as unknown as Tool[] };
  });

  server.setRequestHandler('tools/call', async (request, ctx) => {
    const name = request.params.name;
    const tool = tools.get(name);
    if (!tool) {
      // Unknown tools are protocol errors, as the spec asks; a model that
      // misspells a name gets the list to pick from.
      throw new ProtocolError(
        ProtocolErrorCode.InvalidParams,
        `Unknown tool ${name}. This server provides: ${manifest.tools.map((t) => t.name).join(', ')}.`,
      );
    }
    let host: KilnMcpHost;
    try {
      host = await options.host();
    } catch (error) {
      // The engine could not be loaded or configured. A result, not a dead
      // server: the agent reads the next step and the session lives.
      return { isError: true, content: [{ type: 'text', text: errorMessage(error) }] };
    }
    const result = await host.callTool(name, request.params.arguments ?? {}, {
      signal: ctx.mcpReq.signal,
    });
    return server.projectCallToolResult(result as CallToolResult, tool.outputSchema);
  });

  server.setRequestHandler('resources/list', () => ({ resources: manifest.resources }));
  server.setRequestHandler('resources/templates/list', () => ({
    resourceTemplates: manifest.resourceTemplates,
  }));
  server.setRequestHandler('resources/read', async (request) => {
    const uri = request.params.uri;
    if (uri === KILN_ASSET_WIDGET_URI) {
      return {
        contents: [
          {
            uri,
            mimeType: MCP_APPS_MIME_TYPE,
            text: await (options.widgetHtml ?? readPackagedWidgetHtml)(),
            _meta: KILN_WIDGET_META,
          },
        ],
        // The page is fixed for a build and carries no user data.
        ttlMs: DEFINITION_TTL_MS,
        cacheScope: 'public' as const,
      };
    }
    if (!templatePrefixes.some((prefix) => uri.startsWith(prefix))) {
      throw new ProtocolError(
        ProtocolErrorCode.InvalidParams,
        `Resource not found: ${uri}. Readable URIs come from kiln_save, kiln_present, kiln_export and kiln_project results and follow ${manifest.resourceTemplates.map((t) => t.uriTemplate).join(' or ')}.`,
      );
    }
    let host: KilnMcpHost;
    try {
      host = await options.host();
    } catch (error) {
      throw new ProtocolError(ProtocolErrorCode.InternalError, errorMessage(error));
    }
    try {
      return { contents: [await host.readResource(uri)] };
    } catch (error) {
      throw new ProtocolError(ProtocolErrorCode.InvalidParams, errorMessage(error));
    }
  });

  return server;
}

/** Options the MCP executable accepts on its command line. */
export interface KilnMcpArguments {
  requirementsFile?: string;
}

/**
 * Only explicit host startup configuration can supply a standalone session's
 * policy. Parsed before the engine, because a wrong command line is the host's
 * mistake and the only honest answer is an exit with the message.
 */
export function parseMcpArguments(argv: readonly string[]): KilnMcpArguments {
  let file: string | undefined;
  for (let index = 0; index < argv.length; index++) {
    const option = argv[index];
    if (option === '--category' || option?.startsWith('--category='))
      throw new Error(CATEGORY_MIGRATION_MESSAGE);
    if (option !== '--requirements') throw new Error(`Unknown MCP option: ${option}`);
    if (file !== undefined) throw new Error('--requirements may be supplied only once.');
    file = argv[++index];
    if (!file || file.startsWith('-')) throw new Error('--requirements requires a file path.');
  }
  return file === undefined ? {} : { requirementsFile: file };
}

const PROTOCOL_VERSION_META_KEY = 'io.modelcontextprotocol/protocolVersion';
const CLIENT_CAPABILITIES_META_KEY = 'io.modelcontextprotocol/clientCapabilities';
/** Requests a 2025 client may send before `initialize` has been answered. */
const PRE_HANDSHAKE_METHODS = new Set(['initialize', 'ping']);

type InboundRequest = { jsonrpc: '2.0'; id: number | string; method: string; params?: unknown };

function asRequest(message: JSONRPCMessage): InboundRequest | undefined {
  const candidate = message as Partial<InboundRequest>;
  return typeof candidate.method === 'string' && candidate.id !== undefined
    ? (candidate as InboundRequest)
    : undefined;
}

function carriesProtocolVersion(params: unknown): boolean {
  const meta = (params as { _meta?: Record<string, unknown> } | null | undefined)?._meta;
  return typeof meta === 'object' && meta !== null && PROTOCOL_VERSION_META_KEY in meta;
}

/**
 * Refuses a request that belongs to neither era: no per-request protocol
 * version (so not a 2026-07-28 request) and no `initialize` before it (so not a
 * 2025 session either). Under 2026-07-28 a request missing a required `_meta`
 * field is malformed and answered -32602; under 2025-11-25 nothing but a ping
 * may precede the handshake. The library would otherwise pin the connection to
 * a 2025 instance and serve it, which hides a broken client.
 */
export function guardedStdioTransport(inner: Transport = new StdioServerTransport()): Transport {
  let handshakeSeen = false;
  const guard: Transport = {
    start: () => inner.start(),
    send: (message, options) => inner.send(message, options),
    close: () => inner.close(),
  };
  inner.onclose = () => guard.onclose?.();
  inner.onerror = (error) => guard.onerror?.(error);
  inner.onmessage = (message, extra) => {
    const request = asRequest(message);
    if (
      request &&
      !handshakeSeen &&
      !PRE_HANDSHAKE_METHODS.has(request.method) &&
      !carriesProtocolVersion(request.params)
    ) {
      const refusal: JSONRPCMessage = {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: ProtocolErrorCode.InvalidParams,
          message:
            `${request.method} carries no protocol version and no initialize handshake preceded it. ` +
            `Either send initialize first (protocol 2025-11-25 or 2025-06-18), or put params._meta["${PROTOCOL_VERSION_META_KEY}"] = "2026-07-28" ` +
            `and params._meta["${CLIENT_CAPABILITIES_META_KEY}"] on every request.`,
        },
      };
      void inner.send(refusal).catch(() => {});
      return;
    }
    if (request?.method === 'initialize') handshakeSeen = true;
    guard.onmessage?.(message, extra);
  };
  return guard;
}

/**
 * Serve over this process's stdio, both eras: a 2025 client opens with
 * `initialize`, a 2026-07-28 client with `server/discover` or any request
 * carrying the per-request envelope. The library owns the era decision; Kiln
 * adds the pre-handshake guard above.
 */
export function serveKilnStdio(
  options: KilnServerOptions,
  stdio: Pick<ServeStdioOptions, 'onerror'> = {},
): StdioServerHandle {
  return serveStdio(() => createKilnServer(options), {
    legacy: 'serve',
    transport: guardedStdioTransport(),
    ...stdio,
  });
}
