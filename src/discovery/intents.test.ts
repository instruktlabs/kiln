import { expect, test } from 'bun:test';
import { discoveryIntents, discoveryTokens } from './intents';
import { listHelperSpecs } from './helper-specs';

test('tokenization handles identifiers and ordinary inflections without losing axes or negation', () => {
  expect(discoveryTokens('Please arrayRadial the supports, pipes and windows.')).toEqual([
    'array',
    'radial',
    'support',
    'pipe',
    'window',
  ]);
  expect(discoveryTokens('not X Y Z 3 mm')).toEqual(['not', 'x', 'y', 'z', '3', 'mm']);
  expect(discoveryTokens('ＷＨＥＥＬ')).toEqual(['wheel']);
  expect(discoveryTokens('ＭｅｓｈＧｅｏ UVProject')).toEqual(['mesh', 'geo', 'uv', 'project']);
});

test('a word that names an Object.prototype member stays that word', () => {
  // `constructor` once read Object.prototype.constructor out of the inflection table.
  expect(discoveryTokens('Shape constructor CONSTRUCTOR __proto__')).toEqual([
    'shape',
    'constructor',
    'constructor',
    'proto',
  ]);
});

test('all curated intent metadata belongs to existing current helpers', () => {
  const names = new Set(listHelperSpecs().map((entry) => entry.name));
  for (const [name, intents] of Object.entries(discoveryIntents)) {
    expect(names.has(name)).toBe(true);
    expect(intents.length).toBeGreaterThan(0);
  }
  expect(discoveryIntents.cloneGeometry).toBeUndefined();
});
