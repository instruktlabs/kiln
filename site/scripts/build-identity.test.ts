import { expect, test } from 'bun:test';
import { tmpdir } from 'node:os';
import { sourceCommit } from './build-info.mjs';

test('a known Git checkout must fail if its diff cannot be recorded', () => {
  const git = (args: string[]) => {
    if (args[0] === 'diff') throw new Error('ENOBUFS: diff exceeded capture budget');
    if (args[0] === 'status') return ' M site/source.ts';
    return args.includes('--short') ? 'abc1234' : '/fixture';
  };
  expect(() => sourceCommit(tmpdir(), git)).toThrow('ENOBUFS');
});

test('an exported source directory without Git may report an unknown commit', () => {
  expect(sourceCommit(tmpdir(), () => { throw new Error('not a git repository'); })).toEqual({ commit: null, top: null, clean: null });
});
