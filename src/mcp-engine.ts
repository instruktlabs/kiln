/**
 * The engine half of the Kiln MCP server: the registry's tool definitions,
 * their execution as MCP results, the resource readers, and the packaged host
 * that `dist/mcp-server.mjs` loads on the first call that needs it.
 *
 * `createKilnMcpServer` builds the complete in-process server (the protocol
 * core over this engine) for tests and embedders. The stdio executable is
 * `src/mcp-server.ts`, which must not import this module statically: it is
 * built beside it as `dist/mcp-engine.mjs` and imported by file URL.
 */
import type { Server } from '@modelcontextprotocol/server';
import { AsyncLocalStorage } from 'node:async_hooks';
import { fileURLToPath } from 'node:url';

import { localAssetLibrary } from './assets-node';
import { type AssetLink, readAssetResource } from './assets-resources';
import { buildRenderPort, resolveRenderMode } from './cli-render-mode';
import { FileLiveReview } from './live-review-node';
import { createPackagedLocalToolContext } from './local-runtime';
import { LOOPBACK_HOSTNAMES } from './loopback';
import {
  createKilnServer,
  errorMessage,
  type KilnContentBlock,
  type KilnMcpHost,
  type KilnResourceContents,
  type KilnToolResult,
  withoutLocalPaths,
} from './mcp-core';
import { buildMcpManifest } from './mcp-manifest';
import { localProgramStore } from './program-store-node';
import { validateRequirementsBinding } from './requirements-context';
import { describeInputError, schemaFields } from './tools/actions';
import {
  createKilnProgramToolRegistry,
  type KilnToolContext,
  type KilnToolDef,
} from './tools/registry';
import { localWorkspaceRoot } from './workspace-node';

export type { KilnToolResult } from './mcp-core';

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
  // Rule 9: a result that reports its own failure is an error to the harness
  // too, so the model sees it as one instead of as a successful result that
  // happens to say ok: false.
  const failed =
    typeof output === 'object' && output !== null && (output as { ok?: unknown }).ok === false
      ? { isError: true as const }
      : {};

  // Rule 7: JSON on one line. The indented form cost 24% more tokens in the
  // measured sessions and told the model nothing the keys do not.
  const multi = def.mediaMulti?.(output);
  if (multi) {
    return {
      ...failed,
      content: [
        ...multi.pngs.map(
          (png): KilnContentBlock => ({
            type: 'image',
            data: Buffer.from(png).toString('base64'),
            mimeType: 'image/png',
          }),
        ),
        { type: 'text', text: JSON.stringify(multi.json) },
      ],
    };
  }

  const media = def.media?.(output);
  if (media) {
    return {
      ...failed,
      content: [
        {
          type: 'image',
          data: Buffer.from(media.png).toString('base64'),
          mimeType: 'image/png',
        },
        { type: 'text', text: JSON.stringify(media.json) },
      ],
    };
  }

  // A def may render its own text when the default JSON would repeat itself.
  const asText = def.text?.(output);
  if (asText !== undefined) return { ...failed, content: [{ type: 'text', text: asText }] };

  const resources = (output as { resources?: AssetLink[] } | null)?.resources ?? [];
  const includeResourceLinks = options.artifactResourceLinks === true;
  const payload =
    resources.length && includeResourceLinks
      ? { ...(output as object), resources: undefined }
      : output;
  return {
    ...failed,
    content: [
      { type: 'text', text: JSON.stringify(payload) },
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

/** The engine as the protocol core sees it: tool execution and resource reads over one context. */
export function createKilnToolHost(
  context: KilnToolContext = {},
  options: KilnMcpCompatibilityOptions = {},
): KilnMcpHost & { defs: KilnToolDef[] } {
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
  const defs = kilnMcpToolDefs(requestContext);
  const byName = new Map(defs.map((def) => [def.name, def] as const));
  return {
    defs,
    async callTool(name, args, request): Promise<KilnToolResult> {
      const def = byName.get(name);
      if (!def)
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `${name} is not available in this session. Available: ${defs.map((d) => d.name).join(', ')}.`,
            },
          ],
        };
      try {
        return await requests.run(request.signal, () => runTool(def, args, options));
      } catch (err) {
        // A tool error is a result, not a transport failure: the calling agent
        // should see the message and correct its program rather than lose the
        // session. Rule 9: readable, naming the next step, with no local path.
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: withoutLocalPaths(
                describeInputError(name, err, { fields: schemaFields(def.inputSchema) }) ??
                  errorMessage(err),
              ),
            },
          ],
        };
      }
    },
    async readResource(uri): Promise<KilnResourceContents> {
      if (uri.startsWith('kiln://assets/')) {
        if (!context.assetLibrary) throw new Error(`No asset library serves ${uri} here.`);
        const file = await readAssetResource(context.assetLibrary, uri);
        return {
          uri,
          mimeType: file.mimeType,
          ...(file.name.endsWith('.json') || file.name.endsWith('.js')
            ? { text: resourceText(file.name, file.bytes) }
            : { blob: Buffer.from(file.bytes).toString('base64') }),
        };
      }
      if (uri.startsWith('kiln://projects/')) {
        if (!context.projectBundleReader)
          throw new Error(`No project bundle reader serves ${uri} here.`);
        const [project, revision, file, ...extra] = new URL(uri).pathname
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
        const bytes = await context.projectBundleReader(
          project,
          revision,
          file === 'editable.zip' ? 'editable' : 'runtime',
        );
        return { uri, mimeType: 'application/zip', blob: Buffer.from(bytes).toString('base64') };
      }
      throw new Error(`Resource not found: ${uri}`);
    },
  };
}

/**
 * A saved manifest is pretty-printed on disk and one line as a resource: a Codex session
 * read 33,563 characters of one, a quarter of them line breaks and indentation (H26;
 * decision 27 of 2 October 2026). Source files and anything that is not JSON are served
 * as they are.
 */
function resourceText(name: string, bytes: Uint8Array): string {
  const text = new TextDecoder().decode(bytes);
  if (!name.endsWith('.json')) return text;
  try {
    return JSON.stringify(JSON.parse(text));
  } catch {
    return text;
  }
}

/** Build the complete in-process server: the protocol core over this context's engine. */
export function createKilnMcpServer(
  context: KilnToolContext = {},
  options: KilnMcpCompatibilityOptions = {},
): Server {
  const host = createKilnToolHost(context, options);
  return createKilnServer({
    manifest: buildMcpManifest(host.defs, context),
    host: async () => host,
  });
}

export interface PackagedKilnHostOptions {
  /** The host binding read from `--requirements`, validated here once the engine is up. */
  requirements?: unknown;
}

/**
 * The host behind the stdio executable. Everything that used to happen before
 * the handshake happens here instead, on the first call that needs it: the
 * workspace check, the render mode, the renderer probe and the stores. Each
 * failure is a message that names the next step and no local path, because it
 * is returned to the agent as a tool result.
 */
export async function createPackagedKilnHost(
  options: PackagedKilnHostOptions = {},
): Promise<KilnMcpHost & { defs: KilnToolDef[] }> {
  const env = process.env;
  const requirements =
    options.requirements === undefined
      ? undefined
      : validateRequirementsBinding(options.requirements);
  const workspace = env['KILN_WORKSPACE'];
  if (workspace) {
    // Keep setup code outside the runtime bundle; importing it must not turn its
    // direct-entry check into another entrypoint for this MCP executable.
    const setup = (await import(
      new URL('../scripts/create-workspace.mjs', import.meta.url).href
    )) as {
      createWorkspace: (
        root: string,
        harness: string,
        options: { installation: string; check: true },
      ) => Promise<{
        status: string;
        runtimeChanged: boolean;
        files: { path: string; status: string }[];
      }>;
    };
    let report: Awaited<ReturnType<typeof setup.createWorkspace>>;
    try {
      report = await setup.createWorkspace(workspace, 'claude', {
        installation: fileURLToPath(new URL('..', import.meta.url)),
        check: true,
      });
    } catch (error) {
      throw new Error(
        `The Kiln workspace could not be checked (${withoutLocalPaths(errorMessage(error))}). In the workspace folder run kiln-init . --repair from the current Kiln installation, then restart the MCP session.`,
      );
    }
    if (report.status !== 'current')
      throw new Error(
        `Kiln workspace is out of date${report.runtimeChanged ? ' (runtime changed)' : ''}: ${report.files
          .filter((entry) => entry.status !== 'customized')
          .map((entry) => entry.path)
          .join(
            ', ',
          )}. In the workspace folder run kiln-init . --check, then kiln-init . --upgrade (or kiln-init . --repair if the installation moved), and restart the MCP session.`,
      );
  }
  const mode = resolveRenderMode();
  // One probe before the first connection, so no client attach waits on a network
  // round trip -- but NOT a decision that lasts the session. `autoSpawn` hands
  // back a port that starts the packaged renderer on the first view that needs
  // one, which is the only ordering a user can actually achieve: the harness owns
  // this process's lifecycle, so "start the renderer first" was never theirs to do.
  const context = await createPackagedLocalToolContext({
    ...(await buildRenderPort(mode, env['KILN_RENDER_PORT_URL'], { autoSpawn: true })),
    requirements,
    assetLibrary: localAssetLibrary(),
    ...(env.KILN_LIVE_REVIEW !== 'off'
      ? {
          liveReview: new FileLiveReview(localWorkspaceRoot(), {
            transport: 'mcp',
            workId: env.KILN_WORK_ITEM,
          }),
        }
      : {}),
  });
  context.programStore = localProgramStore();
  // Decision 12: the lean and compact defaults are compared live with the same
  // briefs, switched per session here so the advertised schema never changes.
  const detail = env['KILN_RESULT_DETAIL'];
  if (detail) {
    if (detail !== 'lean' && detail !== 'compact')
      throw new Error(
        'KILN_RESULT_DETAIL must be lean or compact (full is per call). Correct the variable and restart the MCP session.',
      );
    context.resultDetail = detail;
  }
  const deliveryBase = env['KILN_ASSET_DOWNLOAD_BASE_URL'];
  if (deliveryBase) {
    const base = new URL(deliveryBase);
    if (
      base.protocol !== 'https:' &&
      !(base.protocol === 'http:' && LOOPBACK_HOSTNAMES.includes(base.hostname))
    )
      throw new Error(
        'KILN_ASSET_DOWNLOAD_BASE_URL must use HTTPS or loopback HTTP. Correct the variable and restart the MCP session.',
      );
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
  console.error(`kiln engine ready (${mode})`);
  return createKilnToolHost(context, {
    artifactResourceLinks: env['KILN_MCP_RESOURCE_LINKS'] === '1',
  });
}
