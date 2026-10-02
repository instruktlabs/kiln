import { describe, expect, test } from 'bun:test';
import { listDiscoveryEntries } from './catalog';
import { parseCatalog, type DiscoveryEntry } from './catalog-schema';
import { createDiscoveryService, type DiscoveryIndex } from './service';

type Executable = Extract<DiscoveryEntry, { kind: 'operation' | 'assembly' }>;
function operation(name: string): Executable {
  const template = listDiscoveryEntries().find((entry) => entry.name === 'copyGeometry');
  if (!template || !('contract' in template)) throw new Error('Missing contract fixture');
  return {
    ...template,
    id: `operation:${name}`,
    name,
    kind: 'operation',
    summary: `Test operation ${name}.`,
    family: 'geometry',
    tags: ['shape'],
    aliases: [],
    related: [],
    limitations: [],
  };
}
const emptyIndex: DiscoveryIndex = { search: async () => [] };
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;

describe('Discovery service adversarial boundaries', () => {
  test('different exact selectors cannot request the same canonical entry twice', async () => {
    const run = createDiscoveryService([operation('example')], emptyIndex, async () => ({}));
    const result = await run({ ids: ['example', 'operation:example'] });
    expect(result.error?.code).toBe('DUPLICATE_ID');
    expect(result.entries).toEqual([]);
  });

  test('an oversized text mirror includes its truncation notice inside the text bound', async () => {
    const source = operation('large');
    source.contract.example = 'x'.repeat(20_000);
    const run = createDiscoveryService([source], emptyIndex, async () => ({}));
    const result = await run({ ids: ['large'] });
    expect(result.error).toBeUndefined();
    expect(result.textTruncated).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(16 * 1024);
    expect(result.entries[0]).toHaveProperty('contract.example', source.contract.example);
    expect(bytes(result)).toBeLessThanOrEqual(64 * 1024);
  });

  test('an exact detail page returns whole contracts and names the ones that did not fit', async () => {
    const source = operation('oversized');
    source.contract.example = 'x'.repeat(70_000);
    const run = createDiscoveryService([operation('small'), source], emptyIndex, async () => ({}));
    // Contract rule 7: the page stays inside the default result size; an entry
    // beyond it is named for another call, never clipped mid-contract.
    const result = await run({ ids: ['small', 'oversized'] });
    expect(result.error).toBeUndefined();
    expect(result.entries.map((entry) => entry.id)).toEqual(['operation:small']);
    expect(result.total).toBe(2);
    expect(result.omittedIds).toEqual(['operation:oversized']);
    expect(result.text).toContain('operation:oversized');
    expect(result.text.startsWith('[{')).toBe(true);
    expect(bytes(result)).toBeLessThanOrEqual(64 * 1024);
    // A single contract that cannot fit at all still fails atomically.
    const alone = await run({ ids: ['oversized'] });
    expect(alone.error?.code).toBe('RESPONSE_TOO_LARGE');
    expect(alone.entries).toEqual([]);
    expect(bytes(alone)).toBeLessThanOrEqual(64 * 1024);
  });

  test('response budget counts UTF-8 bytes rather than JavaScript string length', async () => {
    const source = operation('unicode');
    source.contract.example = '界'.repeat(22_000);
    const run = createDiscoveryService([source], emptyIndex, async () => ({}));
    const result = await run({ ids: ['unicode'] });
    expect(result.error?.code).toBe('RESPONSE_TOO_LARGE');
    expect(bytes(result)).toBeLessThanOrEqual(64 * 1024);
  });

  test('oversized host capabilities fail without embedding the oversized host object', async () => {
    const run = createDiscoveryService([operation('example')], emptyIndex, async () => ({
      available: true,
      resources: 'z'.repeat(80_000),
    }));
    const result = await run({ capabilities: true });
    expect(result.error?.code).toBe('RESPONSE_TOO_LARGE');
    expect(result.capabilities).toBeUndefined();
    expect(bytes(result)).toBeLessThanOrEqual(64 * 1024);
  });

  test('exact lookup is case-sensitive and never resolves descriptive aliases', async () => {
    const a = operation('alpha');
    const b = operation('beta');
    a.aliases = ['ambiguous alias'];
    b.aliases = ['ambiguous alias'];
    const run = createDiscoveryService(
      [a, b],
      {
        search: async () => [
          { id: a.id, score: 1 },
          { id: b.id, score: 1 },
        ],
      },
      async () => ({}),
    );
    for (const selector of ['Alpha', 'operation:Alpha', 'ambiguous alias', 'assembly:alpha']) {
      const result = await run({ ids: [selector] });
      expect(result.error?.code).toBe('UNKNOWN_ID');
      expect(result.entries).toEqual([]);
      expect(result.suggestions?.length).toBeGreaterThan(0);
    }
    expect((await run({ ids: ['alpha'] })).entries[0]?.id).toBe('operation:alpha');
  });

  test('canonical executable names cannot collide across namespaces', () => {
    const a = operation('same');
    const b = { ...operation('same'), kind: 'assembly' as const, id: 'assembly:same' };
    expect(() => parseCatalog([a, b])).toThrow(/Duplicate executable/);
  });

  test('valid exact detail does not invoke or depend on the ranking backend', async () => {
    let searched = false;
    const run = createDiscoveryService(
      [operation('example')],
      {
        search: async () => {
          searched = true;
          throw new Error('offline index');
        },
      },
      async () => ({}),
    );
    const result = await run({ ids: ['operation:example'] });
    expect(result.entries[0]?.name).toBe('example');
    expect(searched).toBe(false);
  });

  test('filters apply to direct and related results, and all tags must match', async () => {
    const a = operation('seed');
    const b = operation('matching');
    const c = operation('wrongFamily');
    const d = operation('wrongTag');
    a.tags = b.tags = ['shape', 'solid'];
    c.family = 'material';
    c.tags = ['shape', 'solid'];
    d.tags = ['shape'];
    a.related = [b, c, d].map((entry) => ({ id: entry.id, relation: 'companion' as const }));
    const run = createDiscoveryService(
      [a, b, c, d],
      { search: async () => [{ id: a.id, score: 1 }] },
      async () => ({}),
    );
    const result = await run({ query: 'anything', family: 'geometry', tags: ['shape', 'solid'] });
    expect(result.entries.map((entry) => entry.name)).toEqual(['seed', 'matching']);
    expect(result.entries[1]).toHaveProperty('match.basis', 'related');
    expect(result.entries[1]).toHaveProperty('match.via', a.id);
  });

  test('duplicate ranked hits and related edges do not duplicate results or destabilize paging', async () => {
    const a = operation('alpha');
    const b = operation('beta');
    a.related = [
      { id: b.id, relation: 'companion' },
      { id: b.id, relation: 'alternative' },
    ];
    const run = createDiscoveryService(
      [b, a],
      {
        search: async () => [
          { id: b.id, score: 4 },
          { id: a.id, score: 1 },
          { id: a.id, score: 4 },
        ],
      },
      async () => ({}),
    );
    const first = await run({ query: 'q', limit: 1 });
    const second = await run({ query: 'q', limit: 1, offset: first.nextOffset! });
    expect(first.total).toBe(2);
    expect(first.entries[0]?.name).toBe('alpha');
    expect(second.entries[0]?.name).toBe('beta');
    expect(second.nextOffset).toBeNull();
    expect((await run({ query: 'q', offset: 100 })).entries).toEqual([]);
  });

  test('source and capability snapshots remain detached across calls', async () => {
    const source = operation('example');
    const host = { renderer: { ready: true }, resources: ['one'] };
    const run = createDiscoveryService([source], emptyIndex, async () => host);
    source.tags.push('changed-after-construction');
    source.contract.parameters.push('changed-after-construction');
    const detail = await run({ ids: ['example'] });
    expect(detail.entries[0]?.tags).not.toContain('changed-after-construction');
    expect(JSON.stringify(detail)).not.toContain('changed-after-construction');
    const caps = await run({ capabilities: true });
    host.renderer.ready = false;
    host.resources.push('two');
    expect(caps.capabilities).toEqual({ renderer: { ready: true }, resources: ['one'] });
    expect((await run({ capabilities: true })).capabilities).toEqual(host);
  });

  test('unsupported input keys and ambiguous modes fail before consulting the index or host', async () => {
    let calls = 0;
    const run = createDiscoveryService(
      [operation('example')],
      {
        search: async () => {
          calls++;
          return [];
        },
      },
      async () => {
        calls++;
        return {};
      },
    );
    for (const input of [
      { ids: ['example'], limit: 1 },
      { query: 'x', ids: ['example'] },
      { capabilities: true, tags: ['shape'] },
      { overview: true, category: 'prop' },
      { query: 'x', limit: 13 },
      { ids: ['example', 'example'] },
    ])
      await expect(run(input)).rejects.toThrow();
    expect(calls).toBe(0);
  });
});
