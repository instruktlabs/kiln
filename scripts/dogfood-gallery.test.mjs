import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { FileAssetLibrary, localAssetLibrary } from '../src/assets-node';
import {
  archiveSavedAssets,
  assertLocalGalleryRoot,
  defaultDogfoodGalleryRoot,
  discoverSavedAssets,
} from './dogfood-gallery.mjs';
import { startAssetViewer } from '../src/asset-viewer';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function minimalGlb() {
  const json = Buffer.from('{"asset":{"version":"2.0"}}  ');
  const bytes = Buffer.alloc(20 + json.length);
  bytes.writeUInt32LE(0x46546c67, 0);
  bytes.writeUInt32LE(2, 4);
  bytes.writeUInt32LE(bytes.length, 8);
  bytes.writeUInt32LE(json.length, 12);
  bytes.writeUInt32LE(0x4e4f534a, 16);
  json.copy(bytes, 20);
  return bytes;
}

function fixtureAsset(root, relativeRoot, overrides = {}) {
  const revision = join(
    root,
    relativeRoot,
    'assets',
    'kiln',
    overrides.assetId ?? 'a_fixture',
    'revisions',
    overrides.revisionId ?? 'r_fixture',
  );
  mkdirSync(revision, { recursive: true });
  writeFileSync(
    join(revision, 'source.kiln.js'),
    overrides.source ?? 'export default "fixture";\n',
  );
  writeFileSync(join(revision, 'asset.glb'), overrides.glb ?? minimalGlb());
  if (overrides.preview !== false)
    writeFileSync(join(revision, 'preview.png'), overrides.preview ?? 'fixture-png');
  writeFileSync(
    join(revision, 'manifest.json'),
    `${JSON.stringify({
      name: overrides.name ?? 'Clockwork Tidal Shrine',
      assetId: overrides.assetId ?? 'a_fixture',
      revisionId: overrides.revisionId ?? 'r_fixture',
      brief: overrides.brief ?? 'An intricate tidal shrine.',
      description: overrides.description ?? 'Brass, stone, and moving tide vanes.',
      preview: { fidelity: { delivered: 'full-material', materialFaithful: true } },
      build: {
        integration: {
          renderMetrics: { triangles: 12345 },
          structuralQa: { validatorErrors: 0, validatorWarnings: 0 },
        },
      },
    })}\n`,
  );
  return revision;
}

describe('dogfood asset collection', () => {
  test('uses the XDG data directory without touching the repository gallery', () => {
    expect(defaultDogfoodGalleryRoot({ XDG_DATA_HOME: '/data' }, '/home/operator', 'linux')).toBe(
      join('/data', 'kiln', 'library'),
    );
    expect(defaultDogfoodGalleryRoot({}, '/home/operator', 'linux')).toBe(
      join('/home/operator', '.local', 'share', 'kiln', 'library'),
    );
    expect(defaultDogfoodGalleryRoot({}, '/Users/operator', 'darwin')).toBe(
      join('/Users/operator', 'Library', 'Application Support', 'Kiln', 'library'),
    );
    expect(
      defaultDogfoodGalleryRoot(
        { LOCALAPPDATA: 'C:\\Users\\operator\\AppData\\Local' },
        'C:\\Users\\operator',
        'win32',
      ),
    ).toBe(join('C:\\Users\\operator\\AppData\\Local', 'Kiln', 'library'));
  });

  test('refuses a local gallery inside the repository boundary', () => {
    const repository = resolve(join(tmpdir(), 'kiln-repository-boundary'));
    const outside = resolve(join(tmpdir(), 'kiln-library-outside'));
    expect(() => assertLocalGalleryRoot(join(repository, 'examples', 'local'), repository)).toThrow(
      'outside the repository',
    );
    expect(() => assertLocalGalleryRoot(repository, repository)).toThrow('outside the repository');
    expect(assertLocalGalleryRoot(outside, repository)).toBe(outside);
  });

  test('discovers saved assets in sibling workspaces and ignores cloned repositories', () => {
    const root = mkdtempSync(join(tmpdir(), 'kiln-gallery-discovery-'));
    roots.push(root);
    fixtureAsset(root, 'run-01/workspace');
    fixtureAsset(root, 'outer-agent-created-sibling');
    fixtureAsset(root, 'clone');
    mkdirSync(join(root, 'clone', '.git'));

    expect(discoverSavedAssets([root]).map(({ manifestPath }) => manifestPath)).toEqual([
      join(
        root,
        'outer-agent-created-sibling/assets/kiln/a_fixture/revisions/r_fixture/manifest.json',
      ),
      join(root, 'run-01/workspace/assets/kiln/a_fixture/revisions/r_fixture/manifest.json'),
    ]);
  });

  test('discovers standalone exported source, GLB and preview sets', () => {
    const root = mkdtempSync(join(tmpdir(), 'kiln-gallery-standalone-'));
    roots.push(root);
    mkdirSync(join(root, 'workspace'), { recursive: true });
    writeFileSync(join(root, 'workspace', 'celestial-telegraph.kiln.js'), 'const meta = {};\n');
    writeFileSync(join(root, 'workspace', 'celestial-telegraph.glb'), 'glb');
    writeFileSync(join(root, 'workspace', 'celestial-telegraph-contact-sheet.png'), 'png');

    expect(discoverSavedAssets([root])).toMatchObject([
      {
        manifestPath: null,
        manifest: { name: 'Celestial Telegraph' },
        sourcePath: join(root, 'workspace', 'celestial-telegraph.kiln.js'),
        glbPath: join(root, 'workspace', 'celestial-telegraph.glb'),
        previewPath: join(root, 'workspace', 'celestial-telegraph-contact-sheet.png'),
      },
    ]);
  });

  test('discovers the previous flat archive format for lossless migration', async () => {
    const root = mkdtempSync(join(tmpdir(), 'kiln-gallery-legacy-'));
    const galleryRoot = mkdtempSync(join(tmpdir(), 'kiln-gallery-migrated-'));
    roots.push(root, galleryRoot);
    const entry = join(root, 'assets', 'tidal-shrine-abc123');
    mkdirSync(entry, { recursive: true });
    writeFileSync(join(entry, 'source.kiln.js'), 'export default "legacy";\n');
    writeFileSync(join(entry, 'asset.glb'), minimalGlb());
    writeFileSync(join(entry, 'preview.png'), 'primary');
    writeFileSync(join(entry, 'preview-side.png'), 'side');
    writeFileSync(
      join(entry, 'record.json'),
      JSON.stringify({
        schema: 'kiln.local-dogfood-asset.v1',
        name: 'Legacy Tidal Shrine',
        assetId: 'a_legacy',
        revisionId: 'r_legacy',
        provenance: [{ harness: 'hermes', model: 'nemotron' }],
        viewFidelity: {
          version: 'kiln.view-fidelity.v1',
          requested: 'full-preferred',
          delivered: 'geometry-flat',
          materialFaithful: false,
          exactArtifact: false,
          rendererId: 'cpu-raster:0.7.0',
          degraded: true,
        },
      }),
    );

    const discovered = discoverSavedAssets([root]);
    expect(discovered).toMatchObject([
      {
        manifestPath: join(entry, 'record.json'),
        manifest: {
          name: 'Legacy Tidal Shrine',
          assetId: 'a_legacy',
          revisionId: 'r_legacy',
        },
        sourcePath: join(entry, 'source.kiln.js'),
        glbPath: join(entry, 'asset.glb'),
        previewPaths: [join(entry, 'preview.png'), join(entry, 'preview-side.png')],
      },
    ]);
    archiveSavedAssets({ assets: discovered, galleryRoot });
    const library = new FileAssetLibrary({ library: galleryRoot });
    expect((await library.list('library'))[0]?.attribution).toEqual({
      harness: 'hermes',
      model: 'nemotron',
    });
    expect((await library.list('library'))[0]?.preview?.fidelity.delivered).toBe('geometry-flat');
  });

  test('archives exact source, GLB, preview, metadata and deduplicates repeated imports', () => {
    const root = mkdtempSync(join(tmpdir(), 'kiln-gallery-source-'));
    const galleryRoot = mkdtempSync(join(tmpdir(), 'kiln-gallery-target-'));
    roots.push(root, galleryRoot);
    fixtureAsset(root, 'workspace');

    const first = archiveSavedAssets({
      assets: discoverSavedAssets([root]),
      galleryRoot,
      provenance: { harness: 'codex', model: 'gpt-5.6-luna', runId: 'run-01' },
      importedAt: '2026-09-13T12:00:00.000Z',
    });
    const second = archiveSavedAssets({
      assets: discoverSavedAssets([root]),
      galleryRoot,
      provenance: { harness: 'codex', model: 'gpt-5.6-luna', runId: 'run-01' },
      importedAt: '2026-09-13T13:00:00.000Z',
    });

    expect(first.entries).toHaveLength(1);
    expect(second.entries).toHaveLength(1);
    expect(second.totalEntries).toBe(1);
    const entry = second.entries[0];
    const entryRoot = join(galleryRoot, entry.relativeRoot);
    expect(readFileSync(join(entryRoot, 'source.kiln.js'), 'utf8')).toBe(
      'export default "fixture";\n',
    );
    expect(readFileSync(join(entryRoot, 'asset.glb'))).toEqual(minimalGlb());
    expect(readFileSync(join(entryRoot, 'preview.png'), 'utf8')).toBe('fixture-png');
    expect(JSON.parse(readFileSync(join(entryRoot, 'record.json'), 'utf8'))).toMatchObject({
      schema: 'kiln.local-asset.v1',
      name: 'Clockwork Tidal Shrine',
      publicGallery: false,
      publication: { state: 'local-only' },
      metrics: { triangles: 12345, validatorErrors: 0 },
      provenance: [{ harness: 'codex', model: 'gpt-5.6-luna', runId: 'run-01' }],
    });
    expect(existsSync(join(galleryRoot, 'index.json'))).toBe(true);
    expect(existsSync(join(galleryRoot, 'index.html'))).toBe(false);
  });

  test('merges managed and loose copies while retaining different preview variants', () => {
    const root = mkdtempSync(join(tmpdir(), 'kiln-gallery-preview-variants-'));
    const galleryRoot = mkdtempSync(join(tmpdir(), 'kiln-gallery-target-'));
    roots.push(root, galleryRoot);
    fixtureAsset(root, 'workspace', { source: 'same-source', preview: 'managed' });
    writeFileSync(join(root, 'workspace', 'salvage-winch.kiln.js'), 'same-source');
    writeFileSync(join(root, 'workspace', 'salvage-winch.glb'), minimalGlb());
    writeFileSync(join(root, 'workspace', 'salvage-winch.png'), 'loose');

    const result = archiveSavedAssets({ assets: discoverSavedAssets([root]), galleryRoot });

    expect(result.totalEntries).toBe(1);
    expect(result.entries).toHaveLength(1);
    const record = result.entries[0];
    expect(record.name).toBe('Clockwork Tidal Shrine');
    expect(record.files.previewAlternates).toHaveLength(1);
    expect(existsSync(join(galleryRoot, record.relativeRoot, 'preview.png'))).toBe(true);
    expect(
      existsSync(join(galleryRoot, record.relativeRoot, record.files.previewAlternates[0].name)),
    ).toBe(true);
  });

  test('opens imported candidates as a collection in the existing interactive viewer', async () => {
    const root = mkdtempSync(join(tmpdir(), 'kiln-gallery-view-source-'));
    const galleryRoot = mkdtempSync(join(tmpdir(), 'kiln-gallery-view-target-'));
    roots.push(root, galleryRoot);
    fixtureAsset(root, 'workspace');
    const archived = archiveSavedAssets({
      assets: discoverSavedAssets([root]),
      galleryRoot,
      provenance: { harness: 'codex', model: 'gpt-5.6-luna' },
      importedAt: '2026-09-14T12:00:00.000Z',
    });

    const env = {
      KILN_PROGRAM_STORE: join(root, 'workspace', '.kiln', 'programs'),
      XDG_DATA_HOME: dirname(dirname(galleryRoot)),
      KILN_COLLECTIONS: JSON.stringify({
        project: join(root, 'workspace', 'assets', 'kiln'),
        library: galleryRoot,
      }),
    };
    const library = localAssetLibrary(env);
    expect(library.collections()).toEqual([
      { id: 'project', label: 'Workspace storage' },
      { id: 'library', label: 'User library storage' },
    ]);
    const manifests = await library.list('library');
    expect(manifests).toHaveLength(1);
    expect(manifests[0]).toMatchObject({
      version: 'kiln.asset.v1',
      name: 'Clockwork Tidal Shrine',
      tags: [],
      editable: true,
      attribution: { harness: 'codex', model: 'gpt-5.6-luna' },
    });
    const saved = await library.read('library', manifests[0].assetId, manifests[0].revisionId);
    expect(new TextDecoder().decode(saved.files['source.kiln.js'])).toBe(
      'export default "fixture";\n',
    );
    expect(Buffer.from(saved.files['asset.glb'])).toEqual(minimalGlb());
    expect(archived.entries[0].publicGallery).toBe(false);

    const viewer = await startAssetViewer(library, { port: 0 });
    try {
      expect(await (await fetch(`${viewer.url}api/collections`)).json()).toEqual({
        collections: [
          { id: 'project', label: 'Workspace storage' },
          { id: 'library', label: 'User library storage' },
        ],
      });
      const response = await fetch(
        `${viewer.url}files/library/${manifests[0].assetId}/${manifests[0].revisionId}/asset.glb`,
      );
      expect(response.status).toBe(200);
      expect(Buffer.from(await response.arrayBuffer())).toEqual(minimalGlb());
      const shell = await (await fetch(viewer.url)).text();
      expect(shell).toContain('Drag to orbit');
      expect(shell).toContain('Wireframe');
    } finally {
      await viewer.close();
    }
  });
});
