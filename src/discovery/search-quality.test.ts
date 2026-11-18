import { expect, test } from 'bun:test';
import { createDiscovery } from '.';
import { SEARCH_QUALITY } from './search-quality.fixture';

const discover = createDiscovery();

test('every query in the search quality set finds its helper in the top three', async () => {
  const misses: string[] = [];
  for (const [query, expected] of SEARCH_QUALITY) {
    const { entries } = await discover({ query, limit: 12 });
    const rank = entries.findIndex((entry) => entry.id === expected) + 1;
    if (rank < 1 || rank > 3)
      misses.push(
        `${query} -> ${expected}: rank ${rank || 'none'} (${entries
          .slice(0, 3)
          .map((e) => e.id)
          .join(', ')})`,
      );
  }
  expect(misses).toEqual([]);
  expect(SEARCH_QUALITY.length).toBeGreaterThanOrEqual(30);
});

test('a query that names a helper lists that helper first, then helpers whose names start with it', async () => {
  expect((await discover({ query: 'box' })).entries[0]?.id).toBe('operation:boxGeo');
  expect((await discover({ query: 'capsule' })).entries[0]?.id).toBe('operation:capsuleGeo');
  expect((await discover({ query: 'Sweep' })).entries[0]?.id).toBe('operation:sweepProfile');
  const cylinder = (await discover({ query: 'cylinder', limit: 12 })).entries.map((e) => e.id);
  expect(cylinder[0]).toBe('operation:cylinderGeo');
  // Name-prefix matches follow the named helper, ahead of helpers that only mention it.
  const prefixed = cylinder.filter((id) => /^operation:cylinder/.test(id));
  expect(cylinder.slice(0, prefixed.length)).toEqual(prefixed);
});

test('a search hit leads with the signature and keeps its prose short', async () => {
  const result = await discover({ query: 'sweep' });
  const hit = result.text.split('\n\n').find((p) => p.startsWith('operation:sweepProfile '))!;
  expect(hit).toContain('sweepProfile(');
  expect(hit.indexOf('sweepProfile(')).toBeLessThan(
    hit.indexOf(result.entries[0]!.summary.slice(0, 20)),
  );
  // The prose after the signature is capped; the signature itself is never shortened.
  const prose = hit.slice(
    hit.indexOf('THREE.BufferGeometry. ') + 'THREE.BufferGeometry. '.length,
    hit.indexOf(' Limits:'),
  );
  expect(prose.length).toBeLessThanOrEqual(160);
  // The structured entry keeps the whole summary; the contract is one ids call away.
  expect(result.entries[0]!.summary.length).toBeGreaterThan(0);
  expect(result.text).toContain('Fetch');
});

test('the overview lists every family and stays under 3,000 bytes', async () => {
  const overview = await discover({});
  for (const family of overview.orientation!.families) expect(overview.text).toContain(family);
  expect(Buffer.byteLength(overview.text)).toBeLessThan(3000);
});

test('the overview names the tag count and lists tags when one family is browsed', async () => {
  const overview = await discover({});
  expect(overview.text).toMatch(/\d+ tags; browse one family to list its tags\./);
  expect(overview.orientation!.tags.length).toBeGreaterThan(0);
  const curves = await discover({ family: 'curves' });
  expect(curves.text).toContain('Tags in curves: ');
  expect(curves.text).toContain('sweep');
});
