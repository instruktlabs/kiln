import { expect, it } from 'bun:test';
import { applyJsonOption, JSON_OPTION_MESSAGE } from './cli-json';

it('keeps one --json rule: receipts keep it, JSON output ignores it, the rest refuse it', () => {
  for (const argv of [
    ['render', 'a.js', '--json'],
    ['source', 'p_123456789abc', '--json'],
    ['export', 'a', 'r', '--out', 'x.glb', '--json'],
    ['discover', '--json'],
    ['edit', 'p_123456789abc', '--json'],
    ['service', 'status', '--json'],
    ['assets'],
  ])
    expect(applyJsonOption(argv)).toEqual(argv);
  for (const command of [
    'save',
    'collections',
    'assets',
    'asset',
    'import',
    'project',
    'material',
    'review',
    'migrate',
  ])
    expect(applyJsonOption([command, '--json', 'x', '--json'])).toEqual([command, 'x']);
  for (const argv of [
    ['view', '--json'],
    ['collections', 'add', 'shared', 'dir', '--json'],
  ])
    expect(() => applyJsonOption(argv)).toThrow(JSON_OPTION_MESSAGE);
  for (const name of ['render', 'source', 'export', 'discover', 'service status|reprobe', 'assets'])
    expect(JSON_OPTION_MESSAGE).toContain(name);
});
