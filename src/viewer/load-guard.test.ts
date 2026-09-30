import { expect, test } from 'bun:test';
import { acceptLoadedResource } from './load-guard';

test('a late parsed model cannot replace the retained model after returning to an earlier selection', async () => {
  let selected = 'A';
  let visible = 'A';
  const released: string[] = [];
  let finish!: (value: string) => void;
  const parsing = new Promise<string>((resolve) => {
    finish = resolve;
  });
  selected = 'B';
  const result = parsing.then((model) => {
    const accepted = acceptLoadedResource(
      model,
      () => selected === 'B',
      (old) => released.push(old),
    );
    if (accepted !== undefined) visible = accepted;
  });
  selected = 'A';
  finish('B');
  await result;
  expect(visible).toBe('A');
  expect(released).toEqual(['B']);
});

test('current parsed resources are retained and an invalidated comparison is released', () => {
  const released: string[] = [];
  expect(
    acceptLoadedResource(
      'A',
      () => true,
      (value) => released.push(value),
    ),
  ).toBe('A');
  expect(
    acceptLoadedResource(
      'B',
      () => false,
      (value) => released.push(value),
    ),
  ).toBeUndefined();
  expect(released).toEqual(['B']);
});
