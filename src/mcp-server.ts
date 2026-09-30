#!/usr/bin/env node
/**
 * Stdio adapter for the shared program-aware tool registry.
 * The CLI entry uses a persistent local source store. Embedded callers can inject
 * their own store and renderer; schemas and image extraction stay in the registry.
 */
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/server';
import {
  EXTENSION_ID as MCP_APPS_EXTENSION_ID,
  RESOURCE_MIME_TYPE as MCP_APPS_MIME_TYPE,
  registerAppResource,
  registerAppTool,
} from '@modelcontextprotocol/ext-apps/server';
import { localAssetLibrary } from './assets-node';
import { readAssetResource, type AssetLink } from './assets-resources';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { AsyncLocalStorage } from 'node:async_hooks';
import { fileURLToPath } from 'node:url';

import {
  createKilnProgramToolRegistry,
  KILN_ASSET_WIDGET_URI,
  type KilnToolDef,
  type KilnToolContext,
} from './tools/registry';
import { buildRenderPort, resolveRenderMode } from './cli-render-mode';
import { localProgramStore } from './program-store-node';
import { isDirectEntry } from './direct-entry';
import { assertNodeRuntime } from './runtime-support.mjs';
import { ENGINE_VERSION } from './engine-identity';
import { createPackagedLocalToolContext } from './local-runtime';
import { FileLiveReview } from './live-review-node';
import { localWorkspaceRoot } from './workspace-node';
import { CATEGORY_MIGRATION_MESSAGE, readHostRequirementsFile } from './requirements-file';

/** Server identity reported in the MCP handshake. */
export const MCP_SERVER_NAME = 'kiln';
export const MCP_SERVER_VERSION = ENGINE_VERSION;

/** Optional wire features whose support is not negotiated by core MCP. */
export type KilnMcpCompatibilityOptions = {
  /**
   * Add core `resource_link` blocks for saved artifact files.
   *
   * Core MCP 2026-07-28 permits these blocks but exposes no client capability
   * for them. They therefore remain opt-in while clients differ in how they
   * consume them. The same resource descriptors always remain in JSON text and
   * structured content, and every URI remains readable through resources/read.
   */
  artifactResourceLinks?: boolean;
};

/**
 * Absolute path to the skills that ship beside this server. Both entry shapes
 * resolve correctly: `dist/mcp-server.mjs` and `src/mcp-server.ts` each sit one
 * level below the installation root, where `skills/` lives. URL arithmetic only,
 * so nothing touches the filesystem at module load.
 */
const packagedSkillsDir = fileURLToPath(new URL('../skills', import.meta.url));

/**
 * The spec's optional `instructions` field, returned in the initialize result.
 *
 * This is the only orientation channel that survives every install shape. A
 * user who configures the server by hand and opens an empty folder has no
 * AGENTS.md, no CLAUDE.md and no registered skills -- but the skills do ship
 * beside the server, so the useful thing to say is that they exist and where.
 *
 * Deliberately an index and a pointer rather than the skill bodies themselves.
 * The bodies are about 2,700 tokens and would be paid at every session start by
 * every client, which is exactly what the Agent Skills progressive-disclosure
 * model exists to avoid: names and descriptions up front, bodies on activation.
 */
export const MCP_SERVER_INSTRUCTIONS = `Kiln turns JavaScript you write into GLB 3D assets and returns rendered views for review.

Work by reference. Send a program once to kiln_validate or kiln_render; the result carries a programRef. Keep it exactly as returned, including a short p_ handle, and use it for every later view and edit. kiln_source with that ref and a literal query returns exact edit anchors, and kiln_edit with that ref plus edits returns a new ref and renders by default. Do not resend a whole program to change part of it.

Call kiln_discover before writing code to get exact helper signatures, with capabilities: true for the runtime, source, export and camera contract. Read viewFidelity in any render result before judging materials: a geometry-flat CPU image is evidence about shape, not about material. When materialFaithful is false and the task concerns appearance, say so rather than concluding from a CPU view. Material-faithful views come from the GPU render service included as render-service/ in this Kiln installation. Its native dependencies are optional dependencies of Kiln; keep them enabled when installing. Check kiln service status for readiness and follow docs/rendering.md for local or remote setup. Auto mode starts a compatible local service on demand. Installed dependencies alone do not prove GPU support.

Detailed workflows ship beside this server as Agent Skills, one directory each under ${packagedSkillsDir}:
- kiln-setup-workspace: create a managed workspace for authoring, and verify its tools came up
- kiln-author-asset: write a new asset and export a GLB
- kiln-refine-asset: change a saved asset through revisions
- kiln-qa-asset: verify geometry, export fidelity, and behaviour in the destination project
- kiln-compose-scene: arrange several existing GLB assets into a scene
- kiln-batch-dispatch: run comparable trials across harnesses or models

Read the one matching the task before authoring; each names its own reference files.

Most harnesses register skills only from their own directories, so these may not appear as registered skills where you are. If the user wants them registered, offer to copy the relevant directories into .claude/skills/ or .agents/skills/ in their project. Ask before writing, and say that registration takes effect in a new session.`;

/** One MCP content block. Mirrors the SDK's `CallToolResult['content']` element. */
type ContentBlock =
  | AssetLink
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string };

/**
 * The structurally-typed subset of the SDK's `CallToolResult` this file produces.
 *
 * Declared locally rather than imported so `runTool` stays usable by callers that
 * are not holding an SDK type (the parity test drives it directly), while still
 * being assignable to what `registerTool` accepts.
 *
 * A type alias, not an interface, and that is load-bearing: the SDK's
 * `CallToolResult` carries an index signature for protocol passthrough fields, and
 * TypeScript grants an implicit index signature to type aliases but not to
 * interfaces. As an interface this fails to satisfy the handler's return type, and
 * the compiler reports it as an unrelated schema-overload error.
 */
export type KilnToolResult = {
  content: ContentBlock[];
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
  _meta?: Record<string, unknown>;
};

/** Use the shared program-aware definitions, including standalone validation. */
export function kilnMcpToolDefs(context: KilnToolContext = {}): KilnToolDef[] {
  return createKilnProgramToolRegistry(context);
}

/**
 * Run one def and shape its output as MCP content.
 *
 * Defs carrying a `media`/`mediaMulti` extractor return images, which is the whole
 * point of `kiln_render`: the calling agent must literally see the render, not a
 * description of it. The JSON that accompanies an image has its embedded base64
 * stripped by the extractor, so pixels are never double-encoded onto the wire.
 */
export async function runTool(
  def: KilnToolDef,
  args: unknown,
  options: KilnMcpCompatibilityOptions = {},
): Promise<KilnToolResult> {
  const output = await def.run(args);

  const multi = def.mediaMulti?.(output);
  if (multi) {
    return {
      content: [
        ...multi.pngs.map(
          (png): ContentBlock => ({
            type: 'image',
            data: Buffer.from(png).toString('base64'),
            mimeType: 'image/png',
          }),
        ),
        { type: 'text', text: JSON.stringify(multi.json, null, 2) },
      ],
    };
  }

  const media = def.media?.(output);
  if (media) {
    return {
      content: [
        {
          type: 'image',
          data: Buffer.from(media.png).toString('base64'),
          mimeType: 'image/png',
        },
        { type: 'text', text: JSON.stringify(media.json, null, 2) },
      ],
    };
  }

  // A def may render its own text when the default JSON would repeat itself.
  const asText = def.text?.(output);
  if (asText !== undefined) return { content: [{ type: 'text', text: asText }] };

  const resources = (output as { resources?: AssetLink[] } | null)?.resources ?? [];
  const includeResourceLinks = options.artifactResourceLinks === true;
  const payload =
    resources.length && includeResourceLinks
      ? { ...(output as object), resources: undefined }
      : output;
  return {
    content: [
      { type: 'text', text: JSON.stringify(payload, null, 2) },
      ...(includeResourceLinks ? resources : []),
    ],
    ...(def.ui
      ? {
          structuredContent: output as Record<string, unknown>,
          _meta: await def.ui.data(output),
        }
      : {}),
  };
}

/** Build the server, registering every def from the registry. */
export function createKilnMcpServer(
  context: KilnToolContext = {},
  options: KilnMcpCompatibilityOptions = {},
): McpServer {
  const server = new McpServer(
    {
      name: MCP_SERVER_NAME,
      version: MCP_SERVER_VERSION,
    },
    {
      instructions: MCP_SERVER_INSTRUCTIONS,
      capabilities: {
        extensions: {
          [MCP_APPS_EXTENSION_ID]: { mimeTypes: [MCP_APPS_MIME_TYPE] },
        },
      },
    },
  );
  registerAppResource(
    server,
    'kiln-asset-viewer',
    KILN_ASSET_WIDGET_URI,
    {
      description: 'Interactive Kiln asset viewer and downloads',
      _meta: {
        ui: {
          prefersBorder: true,
          csp: { connectDomains: [], resourceDomains: [] },
        },
        'openai/widgetDescription':
          'Inspect the saved 3D asset and download its GLB or editable bundle.',
        'openai/widgetPrefersBorder': true,
      },
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: MCP_APPS_MIME_TYPE,
          text: await (await import('./asset-widget')).readAssetWidgetHtml(),
          _meta: {
            ui: {
              prefersBorder: true,
              csp: { connectDomains: [], resourceDomains: [] },
            },
            'openai/widgetDescription':
              'Inspect the saved 3D asset and download its GLB or editable bundle.',
            'openai/widgetPrefersBorder': true,
          },
        },
      ],
    }),
  );
  if (context.assetLibrary) {
    server.registerResource(
      'asset-file',
      new ResourceTemplate('kiln://assets/{collection}/{asset}/{revision}/{file}', {
        list: undefined,
      }),
      {
        description:
          'Saved GLB/source/preview/manifest/bundle, or derived runtime GLB and metadata sidecar.',
      },
      async (uri) => {
        const file = await readAssetResource(context.assetLibrary!, uri.href);
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: file.mimeType,
              ...(file.name.endsWith('.json') || file.name.endsWith('.js')
                ? { text: new TextDecoder().decode(file.bytes) }
                : { blob: Buffer.from(file.bytes).toString('base64') }),
            },
          ],
        };
      },
    );
  }
  if (context.projectBundleReader) {
    server.registerResource(
      'project-package',
      new ResourceTemplate('kiln://projects/{project}/{revision}/{profile}', { list: undefined }),
      { description: 'Exact editable project bundle or runtime derivative ZIP.' },
      async (uri) => {
        const [project, revision, file, ...extra] = uri.pathname
          .split('/')
          .filter(Boolean)
          .map(decodeURIComponent);
        if (
          extra.length ||
          !project ||
          !revision ||
          !['editable.zip', 'runtime.zip'].includes(file ?? '')
        )
          throw new Error('Invalid project package URI');
        const bytes = await context.projectBundleReader!(
          project,
          revision,
          file === 'editable.zip' ? 'editable' : 'runtime',
        );
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/zip',
              blob: Buffer.from(bytes).toString('base64'),
            },
          ],
        };
      },
    );
  }
  const requests = new AsyncLocalStorage<AbortSignal>();
  const requestContext: KilnToolContext = {
    ...context,
    evaluationControls: () => {
      const configured = context.evaluationControls?.() ?? {};
      const signal = requests.getStore();
      return {
        ...configured,
        ...(signal
          ? {
              signal: configured.signal ? AbortSignal.any([signal, configured.signal]) : signal,
            }
          : {}),
      };
    },
  };

  for (const def of kilnMcpToolDefs(requestContext)) {
    const config = {
      description: def.description,
      annotations: def.annotations,
      // The registry's zod schema, passed straight through as Standard Schema.
      // The SDK advertises the derived JSON Schema and validates arguments, so
      // there is no second copy of the schema anywhere in this file. No cast:
      // a cast here would silently decouple the advertised schema from the
      // registry's, which is the one thing this file exists not to do.
      inputSchema: def.inputSchema,
      ...(def.outputSchema ? { outputSchema: def.outputSchema } : {}),
    };
    const handler = async (
      args: unknown,
      request: Parameters<Parameters<typeof server.registerTool>[2]>[1],
    ): Promise<KilnToolResult> => {
      try {
        return await requests.run(request.mcpReq.signal, () => runTool(def, args, options));
      } catch (err) {
        // A tool error is a result, not a transport failure: the calling agent
        // should see the message and correct its program rather than lose the
        // session.
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: err instanceof Error ? err.message : String(err),
            },
          ],
        };
      }
    };
    if (def.ui) {
      registerAppTool(
        server,
        def.name,
        {
          ...config,
          _meta: {
            ui: { resourceUri: def.ui.resourceUri, visibility: ['model'] },
            'openai/outputTemplate': def.ui.resourceUri,
          },
        },
        handler,
      );
    } else {
      server.registerTool(def.name, config, handler);
    }
  }

  return server;
}

/** Only explicit host startup configuration can supply a standalone session's policy. */
async function readMcpRequirements(
  argv: readonly string[],
): Promise<KilnToolContext['requirements']> {
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
  return file === undefined ? undefined : readHostRequirementsFile(file);
}

if (isDirectEntry(import.meta.url)) {
  let requirements: KilnToolContext['requirements'];
  try {
    assertNodeRuntime();
    requirements = await readMcpRequirements(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
  if (process.env['KILN_WORKSPACE']) {
    // Keep setup code outside the runtime bundle; importing it must not turn its
    // direct-entry check into another entrypoint for this MCP executable.
    const { assertWorkspaceCurrent } = await import(
      new URL('../scripts/create-workspace.mjs', import.meta.url).href
    );
    try {
      await assertWorkspaceCurrent(
        process.env['KILN_WORKSPACE'],
        fileURLToPath(new URL('..', import.meta.url)),
      );
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }
  const mode = resolveRenderMode();
  // One probe before the first connection, so no client attach waits on a network
  // round trip -- but NOT a decision that lasts the session. `autoSpawn` hands
  // back a port that starts the packaged renderer on the first view that needs
  // one, which is the only ordering a user can actually achieve: the harness owns
  // this process's lifecycle, so "start the renderer first" was never theirs to do.
  const context = await createPackagedLocalToolContext({
    ...(await buildRenderPort(mode, process.env['KILN_RENDER_PORT_URL'], { autoSpawn: true })),
    requirements,
    assetLibrary: localAssetLibrary(),
    ...(process.env.KILN_LIVE_REVIEW !== 'off'
      ? {
          liveReview: new FileLiveReview(localWorkspaceRoot(), {
            transport: 'mcp',
            workId: process.env.KILN_WORK_ITEM,
          }),
        }
      : {}),
  });
  context.programStore = localProgramStore();
  const deliveryBase = process.env['KILN_ASSET_DOWNLOAD_BASE_URL'];
  if (deliveryBase) {
    const base = new URL(deliveryBase);
    if (
      base.protocol !== 'https:' &&
      !(base.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname))
    )
      throw new Error('Asset download base must use HTTPS or loopback HTTP');
    context.assetDownloadUrls = async (collection, assetId, revisionId) =>
      Object.fromEntries(
        ['asset.glb', 'editable.zip', 'source.kiln.js', 'preview.png', 'manifest.json'].map(
          (file) => [
            file,
            new URL(
              `files/${collection}/${assetId}/${revisionId}/${file}?download`,
              base.href.endsWith('/') ? base.href : `${base.href}/`,
            ).href,
          ],
        ),
      );
  }
  // stdout is the MCP transport; diagnostics must never touch it.
  console.error(`kiln MCP server on stdio (${mode})`);
  void serveStdio(() =>
    createKilnMcpServer(context, {
      artifactResourceLinks: process.env['KILN_MCP_RESOURCE_LINKS'] === '1',
    }),
  );
}
