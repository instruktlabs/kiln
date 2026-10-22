import { expect, test } from 'bun:test';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

test('pilot host advertises a condition, delivers a real image and enforces the call cap', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kiln-pilot-host-'));
  const config = join(directory, 'run.json');
  await writeFile(
    config,
    JSON.stringify({
      runId: 'offline-host-proof',
      condition: 'A',
      outputDirectory: join(directory, 'result'),
      programStoreDirectory: join(directory, 'workspace/.kiln/programs'),
      authorization: 'Offline test; no model calls',
      maxToolCalls: 3,
      maxImageCells: 6,
      maxCellSide: 512,
      maxWallSeconds: 60,
    }),
  );
  const client = new Client({ name: 'pilot-host-proof', version: '1' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve('scripts/evaluation/server.ts'), config],
    stderr: 'pipe',
  });
  await client.connect(transport);
  try {
    const listed = await client.listTools();
    expect(listed.tools).toHaveLength(10);
    const discovery = await client.callTool({
      name: 'kiln_discover',
      arguments: { category: 'geometry' },
    });
    expect(JSON.stringify(discovery)).not.toContain('parametricSurface');
    const invalid = await client.callTool({
      name: 'kiln_discover',
      arguments: { query: 'advanced lookup unavailable in A' },
    });
    expect(invalid.isError).toBe(true);
    const rendered = await client.callTool({
      name: 'kiln_render',
      arguments: {
        code: "const meta={name:'Box',category:'prop'};function build(){const r=createRoot('Box');createPart('Body',boxGeo(1,1,1),gameMaterial('#887766'),{parent:r,position:[0,0.5,0]});return r;}",
        capture: { preset: '1x1' },
      },
    });
    expect(
      (rendered.content as Array<{ type: string }>).some((entry) => entry.type === 'image'),
    ).toBe(true);
    const blocked = await client.callTool({ name: 'kiln_discover', arguments: {} });
    expect(blocked.isError).toBe(true);
    expect(JSON.stringify(blocked)).toContain('budget-exhausted');
    const events = (await readFile(join(directory, 'result/events.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(events[1].sequence).toBe(3);
    expect(events[1].images).toHaveLength(1);
    expect(events[1].images[0].hash).toMatch(/^sha256:/);
  } finally {
    await client.close();
  }
}, 30000);

test('explicit same-run restart retains consumed tool budget', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kiln-pilot-resume-'));
  const config = join(directory, 'run.json');
  await writeFile(
    config,
    JSON.stringify({
      runId: 'resume-proof',
      condition: 'B',
      outputDirectory: join(directory, 'result'),
      programStoreDirectory: join(directory, 'workspace/.kiln/programs'),
      authorization: 'Offline',
      allowResume: true,
      maxToolCalls: 1,
      maxImageCells: 6,
      maxCellSide: 512,
      maxWallSeconds: 60,
    }),
  );
  async function connect() {
    const client = new Client({ name: 'resume-proof', version: '1' });
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [resolve('scripts/evaluation/server.ts'), config],
        stderr: 'pipe',
      }),
    );
    return client;
  }
  const first = await connect();
  expect((await first.callTool({ name: 'kiln_discover', arguments: {} })).isError).not.toBe(true);
  await first.close();
  const second = await connect();
  try {
    expect(
      JSON.stringify(await second.callTool({ name: 'kiln_discover', arguments: {} })),
    ).toContain('budget-exhausted');
  } finally {
    await second.close();
  }
}, 30000);

test('parallel requests consume one reservation each and preserve the cap', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kiln-pilot-parallel-'));
  const config = join(directory, 'run.json');
  await writeFile(
    config,
    JSON.stringify({
      runId: 'parallel-proof',
      condition: 'B',
      outputDirectory: join(directory, 'result'),
      programStoreDirectory: join(directory, 'workspace/.kiln/programs'),
      authorization: 'Offline',
      maxToolCalls: 2,
      maxImageCells: 6,
      maxCellSide: 512,
      maxWallSeconds: 60,
    }),
  );
  const client = new Client({ name: 'parallel-proof', version: '1' });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [resolve('scripts/evaluation/server.ts'), config],
      stderr: 'pipe',
    }),
  );
  try {
    const results = await Promise.all(
      [0, 1].map(() => client.callTool({ name: 'kiln_discover', arguments: {} })),
    );
    expect(results.every((result) => result.isError !== true)).toBe(true);
    expect(
      JSON.stringify(await client.callTool({ name: 'kiln_discover', arguments: {} })),
    ).toContain('budget-exhausted');
    const events = (await readFile(join(directory, 'result/events.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(events.map((event) => event.sequence).sort()).toEqual([1, 2, 3]);
    const requests = (await readFile(join(directory, 'result/requests.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(requests.map((event) => event.sequence)).toEqual([1, 2, 3]);
  } finally {
    await client.close();
  }
}, 30000);
