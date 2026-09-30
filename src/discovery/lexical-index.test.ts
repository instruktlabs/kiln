import { expect, test } from 'bun:test';
import { listDiscoveryEntries } from './catalog';
import { createLexicalDiscoveryIndex } from './lexical-index';
import { createDiscoveryService } from './service';

const entries = listDiscoveryEntries();

test('returns lexical evidence and labels unsupported words without certifying capabilities', async () => {
  const index = createLexicalDiscoveryIndex(entries);
  const hits = await index.search('sweepProfile qzxvjk');
  const hit = hits.find((h) => h.id === 'operation:sweepProfile')!;
  expect(hit.evidence?.matchedTerms).toContain('sweep');
  expect(hit.evidence?.unmatchedTerms).toContain('qzxvjk');
  expect(hit.evidence?.fields).toContain('name');
  const run = createDiscoveryService(entries, index, async () => ({}));
  const result = await run({ query: 'sweepProfile qzxvjk' });
  expect(result.text).toContain('Unmatched: qzxvjk');
  expect(result.text).toContain('Matched:');
});
test('fullwidth identifiers are searchable and limitations alone are not primary evidence', async () => {
  const index = createLexicalDiscoveryIndex(entries);
  expect((await index.search('ＭｅｓｈＧｅｏ'))[0]?.id).toBe('operation:meshGeo');
  const hit = (await index.search('bevel only selected edges')).find(
    (h) => h.id === 'operation:subdivide',
  )!;
  expect(hit.evidence?.contextOnly).toBe(true);
});

test('ordinary operation wording retrieves useful helpers without exact API spelling', async () => {
  const index = createLexicalDiscoveryIndex(entries);
  for (const [query, expected] of [
    ['put supports evenly around a circle', 'operation:arrayRadial'],
    ['tube following a curved path', 'operation:pipeAlongPath'],
    ['edit material without changing original', 'operation:copyMaterial'],
  ]) {
    expect((await index.search(query!)).slice(0, 5).map((hit) => hit.id)).toContain(expected!);
  }
});

test('literal names outrank incidental wording while typo search stays separate from exact detail', async () => {
  const run = createDiscoveryService(
    entries,
    createLexicalDiscoveryIndex(entries),
    async () => ({}),
  );
  expect((await run({ query: 'sweepProfile' })).entries[0]?.name).toBe('sweepProfile');
  expect(
    (await run({ query: 'swep profile' })).entries.slice(0, 5).map((entry) => entry.name),
  ).toContain('sweepProfile');
  expect((await run({ ids: ['swepProfile'] })).error?.code).toBe('UNKNOWN_ID');
});

test('blank or unrelated text abstains and short tokens do not trigger broad fuzzy recovery', async () => {
  const index = createLexicalDiscoveryIndex(entries);
  expect(await index.search('the and please')).toEqual([]);
  expect(await index.search('qzxvjk')).toEqual([]);
  expect(await index.search('zz')).toEqual([]);
});

test('searches the entire allowed query instead of silently discarding its final terms', async () => {
  const index = createLexicalDiscoveryIndex(entries);
  const query = `${Array.from({ length: 70 }, (_, n) => `qz${n}`).join(' ')} sweepProfile`;
  expect(query.length).toBeLessThanOrEqual(500);
  expect((await index.search(query)).map((hit) => hit.id)).toContain('operation:sweepProfile');
  await expect(index.search('x'.repeat(501))).rejects.toThrow('500 characters');
});

test('new catalog entries and aliases enter the next index without hand-maintained name lists', async () => {
  const added = structuredClone(entries.find((entry) => entry.name === 'boxGeo')!);
  added.id = 'operation:novelFixture';
  added.name = 'novelFixture';
  added.aliases = ['quasar frobnicator'];
  const before = createLexicalDiscoveryIndex(entries);
  const after = createLexicalDiscoveryIndex([...entries, added]);
  expect(await before.search('quasar frobnicator')).toEqual([]);
  expect((await after.search('quasar frobnicator'))[0]?.id).toBe(added.id);
  added.aliases[0] = 'mutated after indexing';
  expect((await after.search('quasar frobnicator'))[0]?.id).toBe('operation:novelFixture');
});

test('everyday object words reach the reviewed structure and material entries', async () => {
  // Dogfood run C (C-A2): "bench" found nothing and "cast iron" expanded to cost/caster.
  const run = createDiscoveryService(
    entries,
    createLexicalDiscoveryIndex(entries),
    async () => ({}),
  );
  const ids = async (query: string) => (await run({ query })).entries.map((entry) => entry.id);
  expect((await ids('bench')).slice(0, 3)).toContain('recipe:joined-frame-v1');
  expect((await ids('bench slats')).slice(0, 3)).toContain('operation:arrayLinear');
  expect((await ids('table legs')).slice(0, 3)).toContain('recipe:joined-frame-v1');
  const metal = await run({ query: 'cast iron metal' });
  expect(metal.entries[0]?.id).toBe('recipe:material-painted-metal-v1');
  for (const entry of metal.entries.slice(0, 3))
    expect(
      (entry as { match?: { evidence?: { expandedTerms: string[] } } }).match?.evidence
        ?.expandedTerms ?? [],
    ).not.toContain('cost');
});
