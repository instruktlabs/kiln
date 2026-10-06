import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { createKilnMcpServer } from '../../dist/mcp-engine.mjs';
import { listDiscoveryEntries } from '../../lib/discovery/index.js';
import { HOSTED_PROGRAM_RETENTION } from '../src/program-contract.ts';

const destination = new URL('../src/generated/edge-manifest.json', import.meta.url);

/** Capture metadata only. These sentinels cannot evaluate source or access user storage. */
export async function generateEdgeManifest() {
  const unavailable = () => {
    throw new Error('Metadata generation must not access host services');
  };
  const service = new Proxy(
    {},
    { get: (_target, key) => (key === 'retention' ? HOSTED_PROGRAM_RETENTION : unavailable) },
  );
  const createServer = () =>
    createKilnMcpServer({
      assetLibrary: service,
      programStore: service,
      evaluatorProfile: 'evaluator-required',
      evaluatorPort: { render: unavailable },
      cacheEvaluations: false,
      cacheCaptures: false,
    });
  const handler = createMcpHandler(createServer, { legacy: 'stateless', maxSubscriptions: 0 });
  async function rpc(method, params = {}) {
    const response = await handler.fetch(
      new Request('http://kiln-native.internal/mcp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          'mcp-protocol-version': '2025-11-25',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      }),
    );
    const text = await response.text();
    const message = response.headers.get('content-type')?.includes('text/event-stream')
      ? text
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => JSON.parse(line.slice(5)))
          .findLast((value) => value.id !== undefined)
      : JSON.parse(text);
    if (response.status !== 200 || !message?.result || message.error)
      throw new Error(`Cannot capture native metadata for ${method}`);
    return message.result;
  }
  try {
    const { serverInfo, capabilities, instructions } = await rpc('initialize', {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'metadata-build', version: '1' },
    });
    const { tools } = await rpc('tools/list');
    const { resources } = await rpc('resources/list');
    const { resourceTemplates } = await rpc('resources/templates/list');
    return {
      kind: 'kiln.hosted-edge.v1',
      serverInfo,
      capabilities,
      instructions,
      tools,
      resources,
      resourceTemplates,
      catalog: listDiscoveryEntries(),
    };
  } finally {
    await handler.close();
  }
}

export async function checkEdgeManifest() {
  const expected = `${JSON.stringify(await generateEdgeManifest(), null, 2)}\n`;
  if ((await readFile(destination, 'utf8')) !== expected)
    throw new Error(
      'Hosted edge manifest is stale. Run node hosting/scripts/edge-manifest.mjs --write',
    );
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  if (process.argv.includes('--write')) {
    await mkdir(new URL('../src/generated/', import.meta.url), { recursive: true });
    await writeFile(destination, `${JSON.stringify(await generateEdgeManifest(), null, 2)}\n`);
    console.log('Generated hosted metadata from the native engine; no services called.');
  } else {
    await checkEdgeManifest();
    console.log('Hosted edge metadata matches the native engine.');
  }
}
