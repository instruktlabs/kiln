/**
 * The host-rooted export destination behind `kiln_export_to` (#207): the model
 * names a path relative to a root the host configured, and nothing it names can
 * leave that root, replace a file or reveal where the root is.
 */
import { describe, expect, test } from 'bun:test';
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { validateExportPath } from './export-root';
import {
  createExportRootWriter,
  exportRootWriterFromEnv,
  resolveExportRoot,
} from './export-root-node';

const bytes = (text: string) => new TextEncoder().encode(text);

describe('export path rules', () => {
  test('accepts a relative forward-slash .glb path and derives the sidecar beside it', () => {
    expect(validateExportPath('models/doors/door-01.glb')).toEqual({
      path: 'models/doors/door-01.glb',
      metadataPath: 'models/doors/door-01.kiln-metadata.json',
      metadataFileName: 'door-01.kiln-metadata.json',
    });
    expect(validateExportPath('Crate.GLB').metadataPath).toBe('Crate.kiln-metadata.json');
  });

  test.each([
    ['../escape.glb', /\.\./],
    ['models/../../escape.glb', /\.\./],
    ['./door.glb', /segment/],
    ['/abs/door.glb', /relative/],
    ['C:/Users/door.glb', /relative/],
    ['c:door.glb', /relative/],
    ['//host/share/door.glb', /relative/],
    ['models\\door.glb', /forward slashes/],
    ['models//door.glb', /segment/],
    ['models/', /\.glb/],
    ['models/door.gltf', /\.glb/],
    ['models/door', /\.glb/],
    ['.glb', /segment/],
    ['con/door.glb', /device/],
    ['models/NUL.glb', /device/],
    ['models/lpt1.txt/door.glb', /device/],
    ['models/door .glb', /segment/],
    ['models/dir./door.glb', /segment/],
    ['a/b/c/d/e/f/g/h/door.glb', /8 segments/],
    [`${'a'.repeat(237)}.glb`, /240/],
  ])('refuses %s', (path, message) => {
    expect(() => validateExportPath(path)).toThrow(message);
  });
});

describe('export root configuration', () => {
  test('resolves an existing absolute directory to its real path', async () => {
    const base = await mkdtemp(join(tmpdir(), 'kiln-export-root-'));
    try {
      const root = join(base, 'exports');
      await mkdir(root);
      expect(
        await resolveExportRoot(root, { collectionRoots: [join(base, 'assets', 'kiln')] }),
      ).toBe(await realpath(root));
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test('refuses a relative, Git Bash, missing, file or collection-overlapping root', async () => {
    const base = await mkdtemp(join(tmpdir(), 'kiln-export-root-'));
    try {
      const collection = join(base, 'assets', 'kiln');
      await mkdir(collection, { recursive: true });
      await mkdir(join(base, '.kiln'));
      await writeFile(join(base, 'file.txt'), 'x');
      const options = { collectionRoots: [collection], workspaceRoot: base };
      await expect(resolveExportRoot('exports', options)).rejects.toThrow(/absolute/);
      await expect(
        resolveExportRoot('/c/Users/me/exports', { ...options, operatingSystem: 'win32' }),
      ).rejects.toThrow(/Git Bash path \(\/c\/\.\.\.\).*Write it as C:\/\.\.\./);
      await expect(resolveExportRoot(join(base, 'missing'), options)).rejects.toThrow(
        /does not exist/,
      );
      await expect(resolveExportRoot(join(base, 'file.txt'), options)).rejects.toThrow(
        /not a directory/,
      );
      await expect(resolveExportRoot(collection, options)).rejects.toThrow(/collection/);
      await mkdir(join(collection, 'exports'));
      await expect(resolveExportRoot(join(collection, 'exports'), options)).rejects.toThrow(
        /collection/,
      );
      await expect(resolveExportRoot(join(base, 'assets'), options)).rejects.toThrow(/collection/);
      await mkdir(join(base, '.kiln', 'exports'));
      await expect(resolveExportRoot(join(base, '.kiln', 'exports'), options)).rejects.toThrow(
        /\.kiln/,
      );
      await expect(resolveExportRoot(base, options)).rejects.toThrow(/collection|\.kiln/);
      // Rule 9: the message is returned to the agent, so it names no local path.
      const failure = await resolveExportRoot(join(base, 'missing'), options).catch(
        (error: Error) => error.message,
      );
      expect(failure).not.toContain(base);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});

describe('export root from the host environment', () => {
  test('is absent without KILN_EXPORT_ROOT and checked at host start with it', async () => {
    const base = await mkdtemp(join(tmpdir(), 'kiln-export-env-'));
    try {
      const options = { collectionRoots: [join(base, 'assets', 'kiln')], workspaceRoot: base };
      expect(await exportRootWriterFromEnv({}, options)).toBeUndefined();
      expect(await exportRootWriterFromEnv({ KILN_EXPORT_ROOT: '' }, options)).toBeUndefined();
      await expect(
        exportRootWriterFromEnv({ KILN_EXPORT_ROOT: join(base, 'missing') }, options),
      ).rejects.toThrow(/does not exist/);
      await mkdir(join(base, 'exports'));
      const writer = await exportRootWriterFromEnv(
        { KILN_EXPORT_ROOT: join(base, 'exports') },
        options,
      );
      await writer!.writeNew([{ path: 'a.glb', data: bytes('glb') }]);
      expect(await readdir(join(base, 'exports'))).toEqual(['a.glb']);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});

describe('export root writer', () => {
  test('writes new files under the root and creates missing directories', async () => {
    const base = await mkdtemp(join(tmpdir(), 'kiln-export-writer-'));
    try {
      const writer = createExportRootWriter(await realpath(base));
      await writer.writeNew([
        { path: 'game/props/crate.kiln-metadata.json', data: bytes('{}') },
        { path: 'game/props/crate.glb', data: bytes('glb') },
      ]);
      expect(await readFile(join(base, 'game', 'props', 'crate.glb'), 'utf8')).toBe('glb');
      expect(await readdir(join(base, 'game', 'props'))).toEqual([
        'crate.glb',
        'crate.kiln-metadata.json',
      ]);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test('never replaces an existing GLB or sidecar, and names only the root-relative path', async () => {
    const base = await mkdtemp(join(tmpdir(), 'kiln-export-writer-'));
    try {
      const writer = createExportRootWriter(await realpath(base));
      await writeFile(join(base, 'door.glb'), 'original');
      const replaced = await writer
        .writeNew([{ path: 'door.glb', data: bytes('new') }])
        .catch((error: Error) => error.message);
      expect(replaced).toBe(
        'door.glb already exists in the export root and is never replaced; choose a new path or remove the file.',
      );
      expect(await readFile(join(base, 'door.glb'), 'utf8')).toBe('original');
      // A pre-existing sidecar stops the pair before the GLB is published.
      await writeFile(join(base, 'gate.kiln-metadata.json'), 'old');
      await expect(
        writer.writeNew([
          { path: 'gate.kiln-metadata.json', data: bytes('{}') },
          { path: 'gate.glb', data: bytes('glb') },
        ]),
      ).rejects.toThrow('gate.kiln-metadata.json already exists');
      expect((await readdir(base)).sort()).toEqual(['door.glb', 'gate.kiln-metadata.json']);
      expect(await readFile(join(base, 'gate.kiln-metadata.json'), 'utf8')).toBe('old');
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test('refuses a symlink or junction ancestor and writes nothing', async () => {
    const base = await mkdtemp(join(tmpdir(), 'kiln-export-writer-'));
    try {
      const root = join(base, 'root');
      const outside = join(base, 'outside');
      await mkdir(root);
      await mkdir(outside);
      // A junction needs no privilege on Windows; elsewhere it is an ordinary symlink.
      await symlink(outside, join(root, 'linked'), 'junction');
      const writer = createExportRootWriter(await realpath(root));
      const failure = await writer
        .writeNew([{ path: 'linked/door.glb', data: bytes('glb') }])
        .catch((error: Error) => error.message);
      expect(failure).toContain('linked');
      expect(failure).toMatch(/link/);
      expect(failure).not.toContain(base);
      expect(await readdir(outside)).toEqual([]);
      // The writer applies the path rules itself, not only the tool.
      await expect(
        writer.writeNew([{ path: '../outside/door.glb', data: bytes('x') }]),
      ).rejects.toThrow(/\.\./);
      expect(await readdir(outside)).toEqual([]);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});
