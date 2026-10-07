import { expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../', import.meta.url));

test('a Node consumer embeds the shared MCP host through a public package import', () => {
  const result = execFileSync(
    'node',
    [
      '--input-type=module',
      '-e',
      `
    import assert from 'node:assert/strict';
    import { createKilnMcpServer, createKilnToolHost, kilnMcpToolDefs } from '@instruktlabs/kiln/mcp';
    const host = createKilnToolHost();
    assert.deepEqual(host.defs.map(t => t.name), kilnMcpToolDefs().map(t => t.name));
    assert.equal(host.defs.length, 14);
    const result = await host.callTool('kiln_discover', { overview: true }, { signal: new AbortController().signal });
    assert.notEqual(result.isError, true);
    assert.ok(result.content.some(block => block.type === 'text' && block.text.includes('createRoot(name: string)')));
    const server = createKilnMcpServer();
    await server.close();
    console.log('public-mcp-host-ok');
  `,
    ],
    { cwd: repo, encoding: 'utf8', windowsHide: true, timeout: 15000 },
  );
  expect(result.trim()).toBe('public-mcp-host-ok');
});

test('portable Discovery and input diagnostics bundle for browsers without Node shims', async () => {
  await mkdir(join(repo, '.cache'), { recursive: true });
  const stage = await mkdtemp(join(repo, '.cache', 'portable-sdk-'));
  try {
    const entry = join(stage, 'consumer.mjs');
    await writeFile(
      entry,
      `
      import { createDiscoveryService, createLexicalDiscoveryIndex, parseCatalog,
        discoveryInputSchema, REMOVED_AUTHORING_HELPERS } from '@instruktlabs/kiln/discovery/portable';
      import { describeInputError, schemaFields } from '@instruktlabs/kiln/tools/input';
      export async function exercise(catalog) {
        const entries = parseCatalog(catalog);
        const discover = createDiscoveryService(entries, createLexicalDiscoveryIndex(entries),
          async () => ({ runtime: 'portable' }), REMOVED_AUTHORING_HELPERS);
        const invalid = discoveryInputSchema.safeParse({ unknownField: true });
        return {
          exact: await discover({ ids: ['operation:boxGeo'] }),
          found: await discover({ query: 'box geometry' }),
          capabilities: await discover({ capabilities: true }),
          diagnostic: describeInputError('kiln_discover', invalid.error,
            { fields: schemaFields(discoveryInputSchema) }),
        };
      }
    `,
    );
    const built = await Bun.build({ entrypoints: [entry], target: 'browser', format: 'esm' });
    expect(built.success, built.logs.map(String).join('\n')).toBe(true);
    // Execute the browser bundle in a consumer process. Bun 1.4.2 crashes while
    // collecting coverage for a large generated module imported through a data URL.
    await writeFile(join(stage, 'browser-bundle.mjs'), await built.outputs[0].text());
    await writeFile(
      join(stage, 'exercise.mjs'),
      `import { exercise } from './browser-bundle.mjs';
       import { listDiscoveryEntries } from '@instruktlabs/kiln/discovery';
       console.log(JSON.stringify(await exercise(listDiscoveryEntries())));`,
    );
    const result = JSON.parse(
      execFileSync('node', [join(stage, 'exercise.mjs')], {
        cwd: repo,
        encoding: 'utf8',
        windowsHide: true,
        timeout: 15000,
      }),
    );
    expect(result.exact.entries[0].id).toBe('operation:boxGeo');
    expect(result.found.entries.some((entry) => entry.id === 'operation:boxGeo')).toBe(true);
    expect(result.capabilities.capabilities).toEqual({ runtime: 'portable' });
    expect(result.diagnostic).toContain('kiln_discover takes');
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
});

test('the public renderer port helper propagates cancellation without invoking the renderer', async () => {
  const { captureViewPngsViaPort } = await import('@instruktlabs/kiln/views/port');
  const controller = new AbortController();
  controller.abort(new Error('host cancelled'));
  let calls = 0;
  const result = await captureViewPngsViaPort(
    async () => {
      calls++;
      throw new Error('unexpected render');
    },
    new Uint8Array([1]),
    100,
    [[0, 0, 1]],
    8,
    undefined,
    undefined,
    undefined,
    { signal: controller.signal },
  );
  expect(calls).toBe(0);
  expect(result.ok).toBe(false);
  expect(result.reason).toContain('host cancelled');
});
