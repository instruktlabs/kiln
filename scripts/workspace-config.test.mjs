import { describe, expect, test } from 'bun:test';
import { mergeJsonConfig, mergeTomlConfig } from './workspace-config.mjs';

const server = { command: '/node', args: ['/kiln/mcp.mjs'], env: { KILN_WORKSPACE: '/game' } };
const change = { path: ['mcpServers', 'kiln_workspace'], value: server };

describe('project JSON configuration ownership', () => {
  test('adds only Kiln while preserving unrelated servers, settings, comments and numeric spelling', () => {
    const source =
      '{\r\n  // Project configuration\r\n  "model": "owner-choice",\r\n  "budget": 9007199254740993,\r\n  "mcpServers": {\r\n    "other": { "command": "other-cli", "env": { "TOKEN": "private-fixture" } }\r\n  }\r\n}\r\n';
    const result = mergeJsonConfig(source, [change], { comments: true });
    expect(result).toContain('// Project configuration\r\n');
    expect(result).toContain('"budget": 9007199254740993');
    expect(result).toContain(
      '"other": { "command": "other-cli", "env": { "TOKEN": "private-fixture" } }',
    );
    expect(result).toContain('"model": "owner-choice"');
    expect(result).toContain('"kiln_workspace"');
    expect(result.replaceAll('\r\n', '')).not.toContain('\n');
    expect(mergeJsonConfig(result, [change], { comments: true })).toBe(result);
  });

  test('replaces only a previously owned entry, tolerating independent project edits', () => {
    const source = JSON.stringify({
      model: 'new-choice',
      mcpServers: { other: { url: 'https://example.test/mcp' }, kiln_workspace: server },
    });
    const updated = { ...server, args: ['/new/kiln/mcp.mjs'] };
    const result = JSON.parse(
      mergeJsonConfig(source, [{ ...change, value: updated, previous: server }]),
    );
    expect(result.model).toBe('new-choice');
    expect(result.mcpServers.other).toEqual({ url: 'https://example.test/mcp' });
    expect(result.mcpServers.kiln_workspace).toEqual(updated);
  });

  test('refuses a conflicting server or non-object parent without leaking values', () => {
    for (const source of [
      '{"mcpServers":{"kiln_workspace":{"token":"private-fixture"}}}',
      '{"mcpServers":["private-fixture"]}',
      '{"mcpServers":null}',
    ]) {
      let message;
      try {
        mergeJsonConfig(source, [change]);
      } catch (error) {
        message = error.message;
      }
      expect(message).toMatch(/conflict.*mcpServers/i);
      expect(message).not.toContain('private-fixture');
    }
  });

  test('refuses modified owned entries and never overwrites unknown fields in them', () => {
    const source = JSON.stringify({
      mcpServers: { kiln_workspace: { ...server, enabled: false } },
    });
    expect(() =>
      mergeJsonConfig(source, [
        { ...change, previous: server, value: { ...server, command: '/new-node' } },
      ]),
    ).toThrow(/conflict/i);
  });

  test('rejects malformed, duplicate, ambiguous and unsafe paths with sanitized errors', () => {
    for (const source of [
      '{"private-fixture":',
      '{"mcpServers":{},"mcpServers":{}}',
      '{"mcpServers":{"kiln_workspace":{},"kiln_\\u0077orkspace":{}}}',
      '[]',
      '{"a":1,}',
      '// private-fixture\n{}',
    ]) {
      let message;
      try {
        mergeJsonConfig(source, [change]);
      } catch (error) {
        message = error.message;
      }
      expect(message).toMatch(/invalid.*configuration/i);
      expect(message).not.toContain('private-fixture');
    }
    for (const path of [
      [],
      ['__proto__', 'polluted'],
      ['constructor', 'prototype'],
      ['mcpServers', 0],
    ])
      expect(() => mergeJsonConfig('{}', [{ path, value: true }])).toThrow(/invalid.*path/i);
    expect({}.polluted).toBeUndefined();
  });

  test('rejects overlapping edits and leaves input unchanged when a later edit conflicts', () => {
    const source = '{"owned":{"value":1}}';
    expect(() => mergeJsonConfig(source, [change, { path: ['owned'], value: 2 }])).toThrow(
      /conflict/i,
    );
    expect(source).toBe('{"owned":{"value":1}}');
    expect(() => mergeJsonConfig('{}', [change, { path: ['mcpServers'], value: {} }])).toThrow(
      /overlap/i,
    );
  });

  test('rejects lossy owned numbers, unsupported desired values and oversized input', () => {
    for (const source of ['{"owned":9007199254740993}', '{"owned":1e999}'])
      expect(() => mergeJsonConfig(source, [{ path: ['owned'], value: 9007199254740992 }])).toThrow(
        /conflict/i,
      );
    for (const value of [
      undefined,
      Number.NaN,
      Infinity,
      () => {},
      new Date(0),
      { nested: undefined },
    ])
      expect(() => mergeJsonConfig('{}', [{ path: ['owned'], value }])).toThrow(
        /invalid configuration value/i,
      );
    expect(() => mergeJsonConfig(' '.repeat(2 * 1024 * 1024 + 1), [change])).toThrow(
      /^Invalid JSON configuration\.$/,
    );
  });

  test('preserves unrelated prototype-like keys without mutating object prototypes', () => {
    const source = '{"__proto__":{"owner":"keep"},"constructor":{"prototype":"keep"}}';
    const result = mergeJsonConfig(source, [change]);
    expect(Object.getOwnPropertyDescriptor(JSON.parse(result), '__proto__')?.value).toEqual({
      owner: 'keep',
    });
    expect(JSON.parse(result).constructor).toEqual({ prototype: 'keep' });
    expect({}.owner).toBeUndefined();
  });

  test('supports empty files, trailing commas when allowed, and multiple independent entries', () => {
    expect(JSON.parse(mergeJsonConfig('', [change])).mcpServers.kiln_workspace).toEqual(server);
    const source = '{\n "model": "owner-choice",\n}\n';
    const result = mergeJsonConfig(
      source,
      [change, { path: ['skills', 'paths'], value: ['/game/skills'] }],
      { comments: true },
    );
    expect(result).toContain('"model": "owner-choice"');
    expect(mergeJsonConfig(result, [change], { comments: true })).toBe(result);
  });
});

const tomlPath = ['mcp_servers', 'kiln_workspace'];
const fragment =
  '[mcp_servers.kiln_workspace]\ncommand = "/node"\nargs = ["/kiln/mcp.mjs"]\n[mcp_servers.kiln_workspace.env]\nKILN_WORKSPACE = "/game"\n';

describe('project TOML configuration ownership', () => {
  test('preserves existing configuration byte-for-byte while adding a validated Kiln table', () => {
    const source =
      '# Owner comment\r\nmodel = "owner-choice"\r\nlimit = 9223372036854775807\r\n[mcp_servers."other"]\r\nurl = "https://example.test/mcp"\r\n';
    const result = mergeTomlConfig(source, { path: tomlPath, fragment });
    expect(result.startsWith(source)).toBe(true);
    expect(result).toContain('[mcp_servers.kiln_workspace]');
    expect(result.replaceAll('\r\n', '')).not.toContain('\n');
    expect(mergeTomlConfig(result, { path: tomlPath, fragment, previous: fragment })).toBe(result);
  });

  test('updates the owned block while preserving before/after user content', () => {
    const initial = mergeTomlConfig('model = "owner-choice"\n', { path: tomlPath, fragment });
    const suffix = '\n[owner]\nnote = "keep this"\n';
    const result = mergeTomlConfig(initial + suffix, {
      path: tomlPath,
      fragment: fragment.replace('/node', '/new-node'),
      previous: fragment,
    });
    expect(result.startsWith('model = "owner-choice"\n')).toBe(true);
    expect(result.endsWith(suffix)).toBe(true);
    expect(result).toContain('command = "/new-node"');
    expect(result).not.toContain('command = "/node"');
  });

  test('rejects manual target tables and edited managed blocks without printing credentials', () => {
    const initial = mergeTomlConfig('', { path: tomlPath, fragment });
    for (const source of [fragment, initial.replace('/node', '/private-fixture')]) {
      let message;
      try {
        mergeTomlConfig(source, { path: tomlPath, fragment, previous: fragment });
      } catch (error) {
        message = error.message;
      }
      expect(message).toMatch(/conflict/i);
      expect(message).not.toContain('private-fixture');
    }
  });

  test('rejects invalid TOML and fragments that would modify non-Kiln settings', () => {
    expect(() => mergeTomlConfig('token = "private-fixture', { path: tomlPath, fragment })).toThrow(
      /^Invalid TOML configuration\.$/,
    );
    expect(() =>
      mergeTomlConfig('', { path: tomlPath, fragment: `model = "overwrite"\n${fragment}` }),
    ).toThrow(/fragment/i);
    expect(() => mergeTomlConfig('', { path: ['__proto__'], fragment })).toThrow(/invalid.*path/i);
  });

  test('marker-like text in a multiline value is never interpreted as a writable block', () => {
    const initial = mergeTomlConfig('', { path: tomlPath, fragment });
    const source = `notes = '''\n${initial}\n'''\n`;
    expect(() => mergeTomlConfig(source, { path: tomlPath, fragment, previous: fragment })).toThrow(
      /conflict/i,
    );
  });

  test('rejects ambiguous trailing assignments whose table changes when a block is updated', () => {
    const initial = mergeTomlConfig('', { path: tomlPath, fragment });
    expect(() =>
      mergeTomlConfig(`${initial}OWNER_SETTING = "keep"\n`, {
        path: tomlPath,
        fragment: fragment.replace('/node', '/new-node'),
        previous: fragment,
      }),
    ).toThrow(/conflict/i);
  });

  test('rejects duplicate or incomplete markers and unsafe parent shapes', () => {
    const initial = mergeTomlConfig('', { path: tomlPath, fragment });
    const begin = initial.split('\n')[0];
    for (const source of [`${begin}\n${initial}`, initial.replace('# END KILN', '# OWNER END')])
      expect(() =>
        mergeTomlConfig(source, { path: tomlPath, fragment, previous: fragment }),
      ).toThrow(/conflict/i);
    expect(() =>
      mergeTomlConfig('mcp_servers = "private-fixture"', { path: tomlPath, fragment }),
    ).toThrow(/conflict/i);
    expect(() =>
      mergeTomlConfig(' '.repeat(2 * 1024 * 1024 + 1), { path: tomlPath, fragment }),
    ).toThrow(/^Invalid TOML configuration\.$/);
  });
});
