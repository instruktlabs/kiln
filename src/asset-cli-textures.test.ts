/**
 * `kiln export --textures manifest|external` (#213): an opt-in sidecar manifest, and a `.gltf`
 * whose images are shared content-addressed files that a re-export never replaces.
 */
import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Document, WebIO } from '@gltf-transform/core';
import { encodePng } from './views/png';

const sha = (bytes: Uint8Array) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

async function texturedGlb(): Promise<Uint8Array> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const accessor = (type: 'VEC2' | 'VEC3', values: number[]) =>
    doc.createAccessor().setType(type).setArray(new Float32Array(values)).setBuffer(buffer);
  const png = (rgb: number[]) => new Uint8Array(encodePng(new Uint8Array(rgb), 2, 2));
  const base = doc
    .createTexture('base')
    .setImage(png([200, 40, 40, 40, 200, 40, 40, 40, 200, 220, 220, 220]))
    .setMimeType('image/png');
  const normal = doc
    .createTexture('normal')
    .setImage(png(Array.from({ length: 4 }, () => [128, 128, 255]).flat()))
    .setMimeType('image/png');
  const primitive = doc
    .createPrimitive()
    .setAttribute('POSITION', accessor('VEC3', [0, 0, 0, 1, 0, 0, 0, 1, 0]))
    .setAttribute('TEXCOORD_0', accessor('VEC2', [0, 0, 1, 0, 0, 1]))
    .setMaterial(doc.createMaterial('Wall').setBaseColorTexture(base).setNormalTexture(normal));
  doc
    .createScene('Scene')
    .addChild(doc.createNode('Wall').setMesh(doc.createMesh('Wall').addPrimitive(primitive)));
  return new WebIO().writeBinary(doc);
}

test('CLI texture manifest and external content-addressed textures', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-asset-cli-textures-'));
  const run = (args: string[]) =>
    spawnSync(process.execPath, [resolve('src/cli.ts'), ...args], {
      cwd: root,
      env: {
        ...process.env,
        KILN_RENDER: 'cpu',
        KILN_PROGRAM_STORE: join(root, '.kiln', 'programs'),
        KILN_COLLECTIONS: JSON.stringify({ project: join(root, 'collection') }),
      },
      encoding: 'utf8',
      windowsHide: true,
    });
  try {
    const source = join(root, 'wall.glb');
    await writeFile(source, await texturedGlb());
    const imported = run(['import', source, '--name', 'Wall']);
    expect(imported.stderr).toBe('');
    const { assetId, revisionId } = JSON.parse(imported.stdout).assets[0];
    const exportArgs = (...args: string[]) => ['export', assetId, revisionId, ...args];

    // Manifest: the GLB layout is unchanged; the sidecar names every image.
    const manifestRun = run(
      exportArgs('--out', join(root, 'm.glb'), '--profile', 'runtime', '--textures', 'manifest'),
    );
    expect(manifestRun.stderr).toBe('');
    const manifest = JSON.parse(await readFile(join(root, 'm.kiln-metadata.json'), 'utf8'));
    expect(manifest.textures).toEqual([
      expect.objectContaining({ image: 0, colorSpace: 'srgb', mimeType: 'image/png' }),
      expect.objectContaining({ image: 1, colorSpace: 'linear', mimeType: 'image/png' }),
    ]);

    const external = (name: string) =>
      run(
        exportArgs(
          '--out',
          join(root, 'out', name),
          '--profile',
          'runtime',
          '--target',
          'three',
          '--textures',
          'external',
          '--json',
        ),
      );
    const first = external('a.gltf');
    expect(first.stderr).toBe('');
    const receipt = JSON.parse(first.stdout);
    expect(receipt).toMatchObject({
      ok: true,
      profile: 'runtime',
      target: 'three',
      format: 'gltf',
    });
    const metadata = JSON.parse(await readFile(join(root, 'out', 'a.kiln-metadata.json'), 'utf8'));
    const textures = metadata.textures.map((entry: { uri: string }) =>
      join(root, 'out', ...entry.uri.split('/')),
    );
    expect(receipt.files).toEqual(
      await Promise.all(
        [
          ['gltf', join(root, 'out', 'a.gltf')],
          ['bin', join(root, 'out', 'a.bin')],
          ['metadata', join(root, 'out', 'a.kiln-metadata.json')],
          ...textures.map((path: string) => ['texture', path]),
        ].map(async ([kind, path]) => {
          const bytes = new Uint8Array(await readFile(path!));
          return {
            kind,
            path,
            bytes: bytes.length,
            sha256: sha(bytes),
            ...(kind === 'texture' ? { reused: false } : {}),
          };
        }),
      ),
    );
    const before = await Promise.all(textures.map((path: string) => stat(path)));

    // A second export into the same folder shares the texture files.
    const second = external('b.gltf');
    expect(second.stderr).toBe('');
    expect(
      JSON.parse(second.stdout)
        .files.filter(({ kind }: { kind: string }) => kind === 'texture')
        .map(({ reused }: { reused: boolean }) => reused),
    ).toEqual([true, true]);
    expect((await readdir(join(root, 'out', 'textures'))).length).toBe(2);
    expect((await readdir(join(root, 'out'))).sort()).toEqual([
      'a.bin',
      'a.gltf',
      'a.kiln-metadata.json',
      'b.bin',
      'b.gltf',
      'b.kiln-metadata.json',
      'textures',
    ]);

    // A re-export never replaces a model file or a texture.
    const again = external('a.gltf');
    expect(again.status).toBe(1);
    expect(again.stderr).toContain('already exists and is never replaced');
    const after = await Promise.all(textures.map((path: string) => stat(path)));
    expect(after.map((entry) => entry.mtimeMs)).toEqual(before.map((entry) => entry.mtimeMs));

    for (const flags of [
      ['--out', join(root, 'bad.gltf'), '--profile', 'runtime', '--textures', 'external'],
      [
        '--out',
        join(root, 'bad.glb'),
        '--profile',
        'runtime',
        '--target',
        'three',
        '--textures',
        'external',
      ],
      ['--out', join(root, 'bad.gltf'), '--profile', 'runtime', '--textures', 'manifest'],
      ['--out', join(root, 'bad.glb'), '--profile', 'editable', '--textures', 'manifest'],
      ['--out', join(root, 'bad.glb'), '--profile', 'runtime', '--textures', 'embedded'],
    ]) {
      const refused = run(exportArgs(...flags));
      expect(refused.status).toBe(1);
    }
    expect((await readdir(root)).filter((name) => name.startsWith('bad'))).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 120_000); // Seven compiled-CLI runs; see asset-cli.test.ts for the measured range.
