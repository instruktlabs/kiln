import {
  createMcpHandler,
  Server,
  ProtocolError,
  ProtocolErrorCode,
  type Tool,
} from '@modelcontextprotocol/server';
import { createDiscoveryService } from '../../src/discovery/service';
import { discoveryInputSchema } from '../../src/discovery/query-schema';
import { describeInputError, schemaFields } from '../../src/tools/actions';
import { parseCatalog } from '../../src/discovery/catalog-schema';
import { createLexicalDiscoveryIndex } from '../../src/discovery/lexical-index';
import { REMOVED_AUTHORING_HELPERS } from '../../src/geometry-catalog';
import manifest from './generated/edge-manifest.json';
import { privateResponse, readBounded } from './http';
import { createPublicTools, hostedInstructions } from './public-tools';

const surface = createPublicTools(manifest.tools as unknown as Tool[]);
const catalog = parseCatalog(manifest.catalog);
const discover = createDiscoveryService(
  catalog,
  createLexicalDiscoveryIndex(catalog),
  async () => {
    throw new Error('Live capabilities require the native host');
  },
  REMOVED_AUTHORING_HELPERS,
);
const fixedCache = { ttlMs: 86_400_000, cacheScope: 'public' as const };
const handler = createMcpHandler(
  () => {
    const server = new Server(manifest.serverInfo, {
      capabilities: manifest.capabilities,
      instructions: hostedInstructions,
      cacheHints: {
        'server/discover': fixedCache,
        'tools/list': fixedCache,
        'resources/list': fixedCache,
        'resources/templates/list': fixedCache,
      },
    });
    server.setRequestHandler('tools/list', () => ({ tools: surface.tools }));
    server.setRequestHandler('resources/list', () => ({ resources: manifest.resources }));
    server.setRequestHandler('resources/templates/list', () => ({
      resourceTemplates: manifest.resourceTemplates,
    }));
    server.setRequestHandler('tools/call', async (request) => {
      if (
        request.params.name !== 'kiln_discover' ||
        !surface.resolve(request.params.name, request.params.arguments ?? {})
      )
        throw new ProtocolError(
          ProtocolErrorCode.InvalidParams,
          'Unknown tool or invalid tool request',
        );
      try {
        const result = await discover(request.params.arguments ?? {});
        const { text, textTruncated, ...structured } = result;
        const content = textTruncated
          ? JSON.stringify(structured)
          : structured.suggestions?.length
            ? `${text}\nSuggestions: ${structured.suggestions.join(', ')}`
            : text;
        return { content: [{ type: 'text', text: content }] };
      } catch (error) {
        const text =
          describeInputError('kiln_discover', error, {
            fields: schemaFields(discoveryInputSchema),
          }) ?? 'Discovery is temporarily unavailable';
        // Match the pinned engine's diagnostic redaction without importing its Node-only core.
        // Native-host parity tests cover both schema errors and caller-supplied path keys.
        const safe = text.replace(
          /(?<![A-Za-z0-9])(?:[A-Za-z]:[\\/]|\\\\[^\s"'`]+|\/(?:home|Users|tmp|var|opt|mnt|root|srv|private)\/)[^\s"'`)\]]*/gu,
          '<local path>',
        );
        return { isError: true, content: [{ type: 'text', text: safe }] };
      }
    });
    return server;
  },
  { legacy: 'stateless', maxRequestBodySize: 1024 * 1024, maxSubscriptions: 0, onerror: () => {} },
);

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function nativeCall(value: unknown): { params?: Record<string, unknown> } | undefined {
  if (
    !record(value) ||
    value.jsonrpc !== '2.0' ||
    !(
      typeof value.id === 'string' ||
      (typeof value.id === 'number' && Number.isFinite(value.id))
    ) ||
    !record(value.params)
  )
    return undefined;
  if (value.method === 'resources/read')
    return typeof value.params.uri === 'string' ? {} : undefined;
  if (value.method !== 'tools/call' || typeof value.params.name !== 'string') return undefined;
  if (value.params.arguments !== undefined && !record(value.params.arguments)) return undefined;
  const resolved = surface.resolve(value.params.name, value.params.arguments ?? {});
  if (!resolved || value.params.name === 'kiln_discover') return undefined;
  return resolved.name === value.params.name ? {} : { params: { ...value.params, ...resolved } };
}

/** Called only after OAuth and account checks, over the bounded credential-free request. */
export async function routeEdgeMcp(request: Request): Promise<Response | Request> {
  if (request.method === 'POST') {
    // Inspect a bounded copy; the original stream remains available to native admission.
    const bytes = await readBounded(request.clone().body, 1024 * 1024, request.signal);
    let message: unknown;
    try {
      message = JSON.parse(
        new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes),
      );
    } catch {
      /* The maintained MCP handler owns malformed-message responses. */
    }
    if (record(message) && record(message.params)) {
      const method = request.headers.get('mcp-method');
      const name = request.headers.get('mcp-name');
      const toolName = typeof message.params.name === 'string' ? message.params.name : '';
      const matchesName =
        name === toolName ||
        (/^[\x20-\x7e]+$/.test(toolName) && name === `=?base64?${btoa(toolName)}?=`);
      if (
        (method !== null && method !== message.method) ||
        (name !== null && message.method === 'tools/call' && !matchesName)
      ) {
        return privateResponse(
          Response.json(
            {
              jsonrpc: '2.0',
              id:
                typeof message.id === 'string' || typeof message.id === 'number'
                  ? message.id
                  : null,
              error: {
                code: ProtocolErrorCode.InvalidParams,
                message: 'MCP routing headers disagree with the request',
              },
            },
            { status: 400 },
          ),
        );
      }
    }
    const native = nativeCall(message);
    if (native) {
      if (!native.params) return request;
      const headers = new Headers(request.headers);
      // Modern MCP checks routing metadata as well as the JSON envelope.
      // Rewrite only a header already matched against the public operation above.
      if (headers.has('mcp-name')) headers.set('mcp-name', String(native.params.name));
      headers.delete('content-length');
      return new Request(request, {
        headers,
        body: JSON.stringify({ ...(message as object), params: native.params }),
      });
    }
  }
  return privateResponse(await handler.fetch(request));
}
