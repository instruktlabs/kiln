import { expect, test } from 'bun:test';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createAssetRequirementsV1 } from '../contracts/requirements';
import { createAssetRequirementsStore } from '../requirements-store';

const bundle = resolve(import.meta.dir, '../../dist/mcp-server.mjs');
const source = `const meta={name:'Asset',requirements:{requirements:{}}};function build(){const root=createRoot('Asset');createPart('Body',boxGeo(1,1,1),gameMaterial('#888888'),{parent:root});return root;}`;

test('standalone Node MCP honors an explicit host binding and snapshots it for the session', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kiln-mcp-requirements-'));
  const file = join(directory, 'binding.json');
  const binding = createAssetRequirementsStore().host.bind(
    { taskId: 'owner-task', lineageId: 'animated-asset' },
    createAssetRequirementsV1({
      requirements: { animation: { state: 'requested', value: { clips: ['Wave'] } } },
    }),
    { actor: 'owner', source: 'brief', reason: 'Must have a Wave clip' },
  );
  const client = new Client({ name: 'requirements-entry-test', version: '1' });
  try {
    await writeFile(file, JSON.stringify(binding));
    const transport = new StdioClientTransport({
      command: 'node',
      args: [bundle, '--requirements', file],
      cwd: directory,
      env: { ...process.env, KILN_RENDER: 'cpu', KILN_BUILD_CACHE: 'off' } as Record<
        string,
        string
      >,
      stderr: 'pipe',
    });
    await client.connect(transport);
    const data = async (name: string) => {
      const result = await client.callTool({ name, arguments: { code: source } });
      return JSON.parse(result.content.find((c) => c.type === 'text')!.text as string);
    };
    const validated = await data('kiln_validate');
    expect(validated.requirements.binding).toEqual(binding);
    // A later file edit cannot weaken a live session's policy.
    await writeFile(file, '{}');
    expect((await data('kiln_validate')).requirements.binding).toEqual(binding);
    const rendered = await data('kiln_render');
    expect(rendered.ok).toBe(false);
    expect(JSON.stringify(rendered)).toContain('Wave');
  } finally {
    await client.close();
    await rm(directory, { recursive: true, force: true });
  }
}, 60_000); // MCP server starts: 1.0 s in CI, past its old budget at load 20+ on 5 November 2026.

test('MCP rejects invalid host options or data before renderer startup without stdout pollution', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kiln-mcp-invalid-policy-'));
  const file = join(directory, 'binding.json');
  try {
    await writeFile(file, '{"category":"prop"}');
    for (const [args, expected] of [
      [['--requirements', file], 'migration'],
      [['--requirements'], 'requires a file'],
      [['--requirements', file, '--requirements', file], 'only once'],
      [['--category', 'prop'], 'removed'],
      [['--category=prop'], 'removed'],
      [['--unknown'], 'Unknown MCP option'],
    ] as const) {
      const result = spawnSync('node', [bundle, ...args], {
        cwd: directory,
        encoding: 'utf8',
        timeout: 10000,
        env: { ...process.env, KILN_RENDER: 'invalid-render-mode' },
      });
      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain(expected);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 60_000); // MCP server starts: 0.8 s in CI, past its old budget at load 20+ on 5 November 2026.
