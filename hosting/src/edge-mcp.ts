import {
  createMcpHandler,
  Server,
  ProtocolError,
  ProtocolErrorCode,
  type Tool,
} from '@modelcontextprotocol/server';
import { createDiscoveryService } from '../../src/discovery/service';
import { discoveryInputSchema, parseDiscoveryRequest } from '../../src/discovery/query-schema';
import { describeInputError, schemaFields } from '../../src/tools/actions';
import { parseCatalog } from '../../src/discovery/catalog-schema';
import { createLexicalDiscoveryIndex } from '../../src/discovery/lexical-index';
import { REMOVED_AUTHORING_HELPERS } from '../../src/geometry-catalog';
import manifest from './generated/edge-manifest.json';
import { privateResponse, readBounded } from './http';

const tools = new Map(manifest.tools.map((tool) => [tool.name, tool]));
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
      instructions: manifest.instructions,
      cacheHints: {
        'server/discover': fixedCache,
        'tools/list': fixedCache,
        'resources/list': fixedCache,
        'resources/templates/list': fixedCache,
      },
    });
    server.setRequestHandler('tools/list', () => ({ tools: manifest.tools as unknown as Tool[] }));
    server.setRequestHandler('resources/list', () => ({ resources: manifest.resources }));
    server.setRequestHandler('resources/templates/list', () => ({
      resourceTemplates: manifest.resourceTemplates,
    }));
    server.setRequestHandler('tools/call', async (request) => {
      if (request.params.name !== 'kiln_discover')
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

function nativeCall(value: unknown): boolean {
  if (
    !record(value) ||
    value.jsonrpc !== '2.0' ||
    !(
      typeof value.id === 'string' ||
      (typeof value.id === 'number' && Number.isFinite(value.id))
    ) ||
    !record(value.params)
  )
    return false;
  if (value.method === 'resources/read') return typeof value.params.uri === 'string';
  if (
    value.method !== 'tools/call' ||
    typeof value.params.name !== 'string' ||
    !tools.has(value.params.name)
  )
    return false;
  if (value.params.arguments !== undefined && !record(value.params.arguments)) return false;
  if (value.params.name !== 'kiln_discover') return true;
  try {
    return parseDiscoveryRequest(value.params.arguments ?? {}).mode === 'capabilities';
  } catch {
    return false;
  }
}

/** Called only after OAuth and account checks, over the bounded credential-free request. */
export async function tryEdgeMcp(request: Request): Promise<Response | undefined> {
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
    if (nativeCall(message)) return undefined;
  }
  return privateResponse(await handler.fetch(request));
}
