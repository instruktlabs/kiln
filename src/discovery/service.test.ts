import { expect, test } from 'bun:test';
import { createDiscoveryService } from './service';
import { listDiscoveryEntries } from './catalog';

const index = {
  search: async (_query: string) => [
    { id: 'operation:arrayRadial', score: 10 },
    { id: 'operation:arrayLinear', score: 4 },
  ],
};
const make = () =>
  createDiscoveryService(listDiscoveryEntries(), index, async () => ({ host: 'test' }));

test('compact search and overview retain stability for experimental helpers and recipes', async () => {
  const run = make();
  for (const entry of listDiscoveryEntries().filter(
    (entry) => entry.stability === 'experimental',
  )) {
    const result = await run({ query: entry.id, limit: 1 });
    expect(result.entries[0]?.id).toBe(entry.id);
    expect(result.text).toContain(`${entry.id} [experimental]`);
    for (const limitation of entry.limitations) expect(result.text).toContain(limitation);
  }
  const stable = await run({ query: 'boxGeo', limit: 1 });
  expect(stable.text).toContain('operation:boxGeo [stable]');
  let offset: number | null = 0;
  while (offset !== null) {
    const page = await run({ offset });
    for (const entry of page.entries)
      expect(page.text).toContain(`${entry.id} [${entry.stability}]`);
    offset = page.nextOffset;
  }
});

test('a deprecated entry is identified without silently removing it', async () => {
  const catalog = listDiscoveryEntries().map((entry) =>
    entry.name === 'arrayRadial' ? { ...entry, stability: 'deprecated' as const } : entry,
  );
  const run = createDiscoveryService(catalog, index, async () => ({}));
  const result = await run({ query: 'repeat', limit: 1 });
  expect(result.text).toContain('operation:arrayRadial [deprecated]');
  expect(result.entries[0]?.stability).toBe('deprecated');
});

test('search exposes execution mode and the exact-contract next step without full detail', async () => {
  const run = make();
  for (const [name, execution] of [
    ['roundedBoxGeo', 'async'],
    ['proceduralTexture', 'sync'],
  ]) {
    const result = await run({ query: name, limit: 1 });
    expect(result.entries[0]).toHaveProperty('execution', execution);
    expect(result.entries[0]).not.toHaveProperty('contract');
    expect(result.text).toContain(execution === 'async' ? 'async; await the result' : 'sync');
    expect(result.text).toContain('Fetch selected contracts with ids');
  }
  const recipes = await run({ kind: 'recipe', limit: 1 });
  expect(recipes.entries[0]).not.toHaveProperty('execution');
});

test('overview paginates summaries without embedding full examples or signatures', async () => {
  const result = await make()({ limit: 2 });
  expect(result.entries).toHaveLength(2);
  expect(result.nextOffset).toBe(2);
  expect(JSON.stringify(result.entries)).not.toContain('contract');
  expect(JSON.stringify(result.entries)).not.toContain('example');
  expect(result.orientation?.start.map((entry) => entry.id)).toEqual([
    'operation:createRoot',
    'operation:createPart',
  ]);
  expect(result.orientation?.families).toContain('geometry');
  expect(result.text).toContain('createPart(');
  expect(result.text).toContain('BufferGeometry');
  expect(result.text).toContain('programRef');
});

test('detail resolves exact IDs and names in requested order and returns detached data', async () => {
  const run = make();
  const result = await run({ ids: ['sweepProfile', 'operation:copyGeometry'] });
  expect(result.entries.map((entry) => entry.name)).toEqual(['sweepProfile', 'copyGeometry']);
  expect(result.entries[0]).toHaveProperty('contract');
  result.entries[0]!.tags.push('mutation');
  expect((await run({ ids: ['sweepProfile'] })).entries[0]!.tags).not.toContain('mutation');
});

test('unknown exact names fail as a whole without silently substituting a related function', async () => {
  const result = await make()({ ids: ['sweepProfile', 'sweepProfle'] });
  expect(result.error?.code).toBe('UNKNOWN_ID');
  expect(result.entries).toHaveLength(0);
  expect(result.suggestions?.length).toBeGreaterThan(0);
});

test('ranked search filters then paginates and never exposes numeric confidence', async () => {
  const run = make();
  const result = await run({ query: 'repeat', kind: 'operation', limit: 1 });
  expect(result.entries[0]?.name).toBe('arrayRadial');
  expect(result.nextOffset).toBe(1);
  expect(result.entries[0]).not.toHaveProperty('score');
  expect(result.entries[0]).not.toHaveProperty('contract');
  expect((await run({ query: 'repeat', family: 'unknown' })).error?.code).toBe('UNKNOWN_FILTER');
});

test('capabilities read the current host only when explicitly requested', async () => {
  let reads = 0;
  const run = createDiscoveryService(listDiscoveryEntries(), index, async () => ({
    reads: ++reads,
  }));
  await run({});
  await run({ query: 'repeat' });
  expect(reads).toBe(0);
  expect((await run({ capabilities: true })).capabilities).toEqual({ reads: 1 });
  expect((await run({ capabilities: true })).capabilities).toEqual({ reads: 2 });
});

test('invalid index IDs and nonfinite scores cannot silently corrupt catalog results', async () => {
  for (const match of [
    { id: 'operation:missing', score: 1 },
    { id: 'operation:arrayRadial', score: Number.NaN },
  ]) {
    const run = createDiscoveryService(
      listDiscoveryEntries(),
      { search: async () => [match] },
      async () => ({}),
    );
    await expect(run({ query: 'repeat' })).rejects.toThrow('index');
  }
});
