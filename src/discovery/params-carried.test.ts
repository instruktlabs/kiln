import { expect, test } from 'bun:test';
import { listDiscoveryEntries } from './catalog';

const entry = (id: string) => {
  const found = listDiscoveryEntries().find((item) => item.id === id || item.name === id);
  if (!found) throw new Error(`No Discovery entry ${id}`);
  return JSON.stringify(found);
};

test('the defineParams contract says what an exported GLB carries and how the sweep reports it', () => {
  const text = entry('defineParams');
  // The three carried kinds and the opt-in one, in the words the sweep result uses.
  for (const word of ['factor', 'visibility', 'morph', 'rebuild', '--carry-shapes'])
    expect(text).toContain(word);
  // How to author each so it is carried.
  expect(text).toContain('visible');
  expect(text).toContain('unchanged');
});

test('the params shape names the three sweep reports about carried values', () => {
  const text = entry('shape:params');
  for (const field of ['colors', 'switches', 'shapes']) expect(text).toContain(field);
});
