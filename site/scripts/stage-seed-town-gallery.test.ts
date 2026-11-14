import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  PENDING_STATEMENT, checkSeedTownRights, collectSeedTownGallery, stageSeedTownGallery,
} from './stage-seed-town-gallery.mjs';

const sha = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const repo = (path: string) => new URL(`../../${path}`, import.meta.url);
const readJson = async (path: string) => JSON.parse(await readFile(repo(path), 'utf8'));

/** A GLB with only a JSON chunk, enough for the provenance pointer the stager reads. */
function glb(document: object) {
  let text = JSON.stringify(document);
  while (text.length % 4) text += ' ';
  const chunk = Buffer.from(text);
  const header = Buffer.alloc(20);
  header.write('glTF', 0, 'latin1');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + chunk.length, 8);
  header.writeUInt32LE(chunk.length, 12);
  header.write('JSON', 16, 'latin1');
  return Buffer.concat([header, chunk]);
}

const savedGlb = Buffer.from('saved lamp glb');
const source = Buffer.from('export default () => lamp;\n');
const sidecarFor = (overrides: object = {}) => Buffer.from(JSON.stringify({
  version: 'kiln.runtime-metadata.v1',
  source: { assetId: 'a_lamp', revisionId: 'r_lamp', glbSha256: `sha256:${sha(savedGlb)}`, sourceSha256: `sha256:${sha(source)}` },
  scenes: [],
  params: {
    colors: { iron: [{ index: 0, name: 'iron' }] },
    switches: { lit: [{ index: 1, name: 'Glow', visibleWhen: [true] }], arms: [{ index: 2, name: 'Arms_post', visibleWhen: ['post'] }, { index: 3, name: 'Arms_twin', visibleWhen: ['twin'] }] },
    presets: { night: 0 },
    shapes: { height: { mode: 'morph', clip: 'kiln.param.height', keys: [] } },
  },
  ...overrides,
}));
const sidecar = sidecarFor();
const carriedFor = (metadata: Buffer, uri = 'street-lamp.kiln-metadata.json') =>
  glb({ asset: { version: '2.0', extras: { kilnProvenanceV1: { version: 'kiln.provenance.v1', profile: 'runtime', metadata: { uri, sha256: `sha256:${sha(metadata)}` } } } } });
const carried = carriedFor(sidecar);
const pin = {
  id: 'street-lamp', name: 'Street lamp', collectionId: 'project', assetId: 'a_lamp', revisionId: 'r_lamp',
  savedGlbSha256: sha(savedGlb), sourceSha256: sha(source), sha256: sha(carried), bytes: carried.length,
};
const manifest = { schema: 'kiln.seed-town-manifest/1', release: 'st1', assets: [pin] };
const pack = {
  id: 'seed-town', release: 'st1',
  models: [{ id: pin.id, path: 'models/street-lamp.glb' }],
  files: [{ path: 'models/street-lamp.glb', sha256: pin.sha256, bytes: pin.bytes }],
};
const params = {
  height: { type: 'range', default: 3.8, min: 3.2, max: 4.6, unit: 'm', describe: 'Height of the post.' },
  arms: { type: 'choice', default: 'post', options: ['post', 'twin'], describe: 'One lantern or two.' },
  lit: { type: 'toggle', default: false, describe: 'Panes glow.' },
  iron: { type: 'color', default: '#1f2a26', describe: 'Ironwork colour.' },
};
const kits = { schema: 'kiln.seed-town-kits/1', kits: { 'street-lamp': {
  defaults: { height: 3.8, arms: 'post', lit: false, iron: '#1f2a26' },
  sizes: { height: { min: 3.2, default: 3.8, max: 4.6 } },
} } };
const names = { kits: { 'street-lamp': { name: 'Street lamp', description: 'A lamp.' } } };
const record = (manifestOverrides: object = {}) => ({
  manifest: {
    version: 'kiln.asset.v1', assetId: pin.assetId, revisionId: pin.revisionId, name: 'Street lamp', editable: true,
    attribution: { model: 'fixture' },
    files: {
      'asset.glb': { sha256: `sha256:${pin.savedGlbSha256}`, bytes: savedGlb.length },
      'source.kiln.js': { sha256: `sha256:${pin.sourceSha256}`, bytes: source.length },
    },
    build: {
      dependencies: [],
      integration: { artifactSha256: pin.savedGlbSha256, bounds: { size: [0.4, 4.5, 0.7] }, renderMetrics: { triangles: 336, uniqueMaterials: 2 } },
      params: { schemaVersion: 1, params },
    },
    ...manifestOverrides,
  },
});
const inputs = (overrides: Record<string, unknown> = {}) => ({
  manifest, pack, kits, names,
  readModel: async () => carried,
  readRevision: async () => record(),
  readSidecar: async () => sidecar,
  ...overrides,
});
/** Inputs whose pack seals a carried model that points at `metadata`, so only the sidecar's content differs. */
const sealedWith = (metadata: Buffer) => {
  const model = carriedFor(metadata);
  return inputs({
    manifest: { ...manifest, assets: [{ ...pin, sha256: sha(model), bytes: model.length }] },
    pack: { ...pack, files: [{ ...pack.files[0], sha256: sha(model), bytes: model.length }] },
    readModel: async () => model,
    readSidecar: async () => metadata,
  });
};
const sidecarParams = JSON.parse(sidecar.toString()).params;

test('the catalog ties the sealed carried model, its sidecar and the saved revision to one kit', async () => {
  const catalog = await collectSeedTownGallery(inputs());
  expect(catalog).toMatchObject({ id: 'seed-town', name: 'Seed Town', release: 'st1' });
  expect(catalog.assets).toEqual([{
    slug: 'street-lamp', name: 'Street lamp', description: 'A lamp.', collection: 'project',
    assetId: 'a_lamp', revisionId: 'r_lamp', parentRevision: null, attribution: { model: 'fixture' },
    metrics: { triangles: 336, materials: 2, bounds: [0.4, 4.5, 0.7] },
    savedModel: { sha256: pin.savedGlbSha256, bytes: savedGlb.length },
    runtimeModelDownload: { member: 'models/street-lamp.glb', bytes: pin.bytes, sha256: pin.sha256 },
    runtimeMetadata: { member: 'models/street-lamp.kiln-metadata.json', bytes: sidecar.length, sha256: sha(sidecar) },
    parameters: {
      options: [
        { name: 'arms', kind: 'choice', values: ['post', 'twin'], default: 'post', describe: 'One lantern or two.' },
        { name: 'lit', kind: 'toggle', default: false, describe: 'Panes glow.' },
      ],
      sizes: [{ name: 'height', min: 3.2, default: 3.8, max: 4.6, unit: 'm', describe: 'Height of the post.' }],
      colours: [{ name: 'iron', default: '#1f2a26', describe: 'Ironwork colour.' }],
      variants: ['night'],
    },
  }]);
});

test('the catalog follows the manifest list rather than a fixed set of kits', async () => {
  const second = { ...pin, id: 'second-lamp', assetId: 'a_second', revisionId: 'r_second' };
  const secondSidecar = sidecarFor({ source: { assetId: 'a_second', revisionId: 'r_second', glbSha256: `sha256:${sha(savedGlb)}`, sourceSha256: `sha256:${sha(source)}` } });
  const secondModel = carriedFor(secondSidecar, 'second-lamp.kiln-metadata.json');
  const both = {
    manifest: { ...manifest, assets: [pin, { ...second, sha256: sha(secondModel), bytes: secondModel.length }] },
    pack: {
      ...pack,
      models: [...pack.models, { id: 'second-lamp', path: 'models/second-lamp.glb' }],
      files: [...pack.files, { path: 'models/second-lamp.glb', sha256: sha(secondModel), bytes: secondModel.length }],
    },
    kits: { ...kits, kits: { ...kits.kits, 'second-lamp': kits.kits['street-lamp'] } },
    names: { kits: { ...names.kits, 'second-lamp': { name: 'Second lamp', description: 'Another lamp.' } } },
    readModel: async (member: string) => (member.includes('second') ? secondModel : carried),
    readRevision: async (kit: typeof pin) => (kit.id === 'second-lamp' ? record({ assetId: 'a_second', revisionId: 'r_second' }) : record()),
    readSidecar: async (kit: typeof pin) => (kit.id === 'second-lamp' ? secondSidecar : sidecar),
  };
  const catalog = await collectSeedTownGallery(both);
  expect(catalog.assets.map((asset: { slug: string }) => asset.slug)).toEqual(['street-lamp', 'second-lamp']);
});

test('the catalog refuses a changed pack, another revision, another source and a mismatched sidecar', async () => {
  await expect(collectSeedTownGallery(inputs({ pack: { ...pack, files: [{ ...pack.files[0], sha256: 'b'.repeat(64) }] } }))).rejects.toThrow('sealed scene model');
  await expect(collectSeedTownGallery(inputs({ pack: { ...pack, release: 'st2' } }))).rejects.toThrow('release');
  await expect(collectSeedTownGallery(inputs({ readModel: async () => Buffer.from('other bytes') }))).rejects.toThrow('sealed scene model');
  await expect(collectSeedTownGallery(inputs({ readRevision: async () => record({ revisionId: 'r_other' }) }))).rejects.toThrow('saved revision');
  await expect(collectSeedTownGallery(inputs({ readRevision: async () => record({ files: { ...record().manifest.files, 'asset.glb': { sha256: `sha256:${'c'.repeat(64)}`, bytes: 1 } } }) }))).rejects.toThrow('saved revision');
  await expect(collectSeedTownGallery(inputs({ readRevision: async () => record({ files: { ...record().manifest.files, 'source.kiln.js': { sha256: `sha256:${'d'.repeat(64)}`, bytes: 1 } } }) }))).rejects.toThrow('saved revision');
  await expect(collectSeedTownGallery(inputs({ readSidecar: async () => Buffer.from(`${sidecar} `) }))).rejects.toThrow('sidecar');
  await expect(collectSeedTownGallery(sealedWith(sidecarFor({ source: { assetId: 'a_lamp', revisionId: 'r_other', glbSha256: `sha256:${sha(savedGlb)}`, sourceSha256: `sha256:${sha(source)}` } })))).rejects.toThrow('sidecar names another revision');
  await expect(collectSeedTownGallery(sealedWith(sidecarFor({ source: { assetId: 'a_lamp', revisionId: 'r_lamp', glbSha256: `sha256:${'e'.repeat(64)}`, sourceSha256: `sha256:${sha(source)}` } })))).rejects.toThrow('sidecar names another revision');
  await expect(collectSeedTownGallery(sealedWith(sidecarFor({ version: 'kiln.runtime-metadata.v0' })))).rejects.toThrow('sidecar');
  await expect(collectSeedTownGallery(inputs({ manifest: { ...manifest, assets: [pin, pin] } }))).rejects.toThrow('inventory');
});

test('the catalog refuses a kit without a name, a size the export does not carry or a dropped parameter', async () => {
  await expect(collectSeedTownGallery(inputs({ names: { kits: {} } }))).rejects.toThrow('name and description');
  await expect(collectSeedTownGallery(sealedWith(sidecarFor({ params: { ...sidecarParams, shapes: {} } })))).rejects.toThrow('does not carry');
  await expect(collectSeedTownGallery(sealedWith(sidecarFor({ params: { ...sidecarParams, shapes: { height: { mode: 'rebuild' } } } })))).rejects.toThrow('does not carry');
  await expect(collectSeedTownGallery(sealedWith(sidecarFor({ params: { ...sidecarParams, switches: { lit: sidecarParams.switches.lit } } })))).rejects.toThrow('does not carry');
  await expect(collectSeedTownGallery(sealedWith(sidecarFor({ params: { ...sidecarParams, colors: {} } })))).rejects.toThrow('does not carry');
  await expect(collectSeedTownGallery(sealedWith(sidecarFor({ params: { ...sidecarParams, dropped: ['height'] } })))).rejects.toThrow('does not carry');
  await expect(collectSeedTownGallery(inputs({ kits: { ...kits, kits: { 'street-lamp': { ...kits.kits['street-lamp'], sizes: { height: { min: 3, default: 3.8, max: 4.6 } } } } } }))).rejects.toThrow('kits.json');
});

test('the rights record must pin the saved model and source of every kit', () => {
  const rights = {
    decision: { ownerStatement: 'CC0 for the town kits', spdx: 'CC0-1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/', scope: 'Scope.' },
    pins: [{ id: pin.id, assetId: pin.assetId, revisionId: pin.revisionId, sha256: pin.savedGlbSha256, source: { sha256: `sha256:${pin.sourceSha256}`, bytes: source.length } }],
    dependencies: [],
  };
  expect(checkSeedTownRights(rights, manifest).get(pin.id)).toBe(rights.pins[0]);
  expect(() => checkSeedTownRights({ ...rights, pins: [{ ...rights.pins[0], sha256: pin.sha256 }] }, manifest)).toThrow('licence');
  expect(() => checkSeedTownRights({ ...rights, pins: [] }, manifest)).toThrow('licence');
  expect(() => checkSeedTownRights({ ...rights, decision: { ...rights.decision, spdx: 'CC-BY-4.0' } }, manifest)).toThrow('CC0');
});

test('a pending owner statement stops staging unless explicitly allowed', async () => {
  const pending = { decision: { ownerStatement: PENDING_STATEMENT, spdx: 'CC0-1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/', scope: 'Scope.' }, pins: [], dependencies: [] };
  expect(() => checkSeedTownRights(pending, { assets: [] })).toThrow(PENDING_STATEMENT);
  expect(checkSeedTownRights(pending, { assets: [] }, { allowPendingStatement: true }).size).toBe(0);
  // The checked-in record carries the owner's words, so the stager's own check of it passes.
  const recorded = await readJson('packs/seed-town/rights.json');
  expect(recorded.decision.ownerStatement).toBe('CC0, matching the existing free Kiln packs');
  expect(() => checkSeedTownRights(recorded, { assets: recorded.pins.map(() => ({})) })).not.toThrow(PENDING_STATEMENT);
});

test('delivery review output cannot be staged under site public', async () => {
  await expect(stageSeedTownGallery({ allowPendingStatement: true, reviewOut: fileURLToPath(new URL('../public/gallery-review', import.meta.url)) })).rejects.toThrow('review directory');
});

test('the checked-in catalog, rights and names cover exactly the scene manifest and sealed pack', async () => {
  const manifest = await readJson('scenes/packages/seed-town/ASSET-MANIFEST.json');
  // The sealed pack is on the asset host, not in the repository: the checked-in record of it is what a fresh clone has.
  const sealed = (await readJson('site/src/data/scene-packs.json'))['seed-town'];
  const catalog = await readJson('site/src/data/packs/seed-town.json');
  const rights = await readJson('packs/seed-town/rights.json');
  const names = await readJson('packs/seed-town/names.json');
  expect(catalog.release).toBe(manifest.release);
  expect(sealed.release).toBe(manifest.release);
  expect(sealed.packJsonSha256).toBe((await readJson('scenes/packages/seed-town/site-runtime.json')).packJsonSha256);
  expect(catalog.assets.map((asset: any) => [asset.slug, asset.assetId, asset.revisionId, asset.runtimeModelDownload.sha256, asset.runtimeModelDownload.bytes, asset.savedModel.sha256]))
    .toEqual(manifest.assets.map((asset: any) => [asset.id, asset.assetId, asset.revisionId, asset.sha256, asset.bytes, asset.savedGlbSha256]));
  // Where a workspace has staged the pack itself, it is that sealed pack and lists the same kits.
  const staged = await readFile(repo('scenes/packages/seed-town/standalone/public/assets/pack.json')).catch(() => null);
  if (staged) {
    expect(sha(staged)).toBe(sealed.packJsonSha256);
    expect(JSON.parse(staged.toString('utf8')).models.map((model: any) => model.id)).toEqual(manifest.assets.map((asset: any) => asset.id));
  }
  expect(rights.pins.map((entry: any) => [entry.id, entry.assetId, entry.revisionId, entry.sha256, entry.source.sha256]))
    .toEqual(manifest.assets.map((asset: any) => [asset.id, asset.assetId, asset.revisionId, asset.savedGlbSha256, `sha256:${asset.sourceSha256}`]));
  expect(rights.dependencies).toEqual([]);
  expect(Object.keys(names.kits).sort()).toEqual(manifest.assets.map((asset: any) => asset.id).sort());
  for (const asset of catalog.assets) {
    expect(asset.name).toBe(names.kits[asset.slug].name);
    expect(asset.description).toBe(names.kits[asset.slug].description);
  }
});

test('the kit names and descriptions follow the site copy rules', async () => {
  const names = await readJson('packs/seed-town/names.json');
  for (const { name, description } of Object.values(names.kits) as { name: string; description: string }[]) {
    expect(name.length).toBeGreaterThan(0);
    expect(description).toMatch(/^[A-Z].*\.$/);
    expect(description.split(/[.!?](?:\s|$)/).filter(Boolean)).toHaveLength(1);
    expect(`${name} ${description}`).not.toMatch(/[;–—]| - |approv|review|provenance|generated|authored|AI\b/i);
  }
});

test('Seed Town has one linked gallery card per kit and stays out of packs-off builds', async () => {
  const manifest = await readJson('scenes/packages/seed-town/ASSET-MANIFEST.json');
  const { buildGallery } = await import('../src/lib/gallery');
  const { seedTownGalleryAssets, seedTownModelUrl, seedTownPack } = await import('../src/lib/seed-town-gallery');
  const { browseGallery } = await import('../src/lib/gallery-browse');
  const cards = browseGallery(buildGallery(true), { pack: 'seed-town' });
  expect(seedTownGalleryAssets(false)).toEqual([]);
  expect(cards.map((card) => card.href).sort()).toEqual(manifest.assets.map((asset: any) => `/gallery/seed-town/${asset.id}/`).sort());
  for (const asset of seedTownGalleryAssets(true)) {
    expect(seedTownModelUrl(asset)).toBe(`/scene-packs/seed-town/${seedTownPack.release}/models/${asset.slug}.glb?revision=${asset.revisionId}`);
    expect(cards.find((card) => card.slug === asset.slug)?.scenes).toEqual([{ label: 'Explore Seed Town', href: '/scenes/seed-town/' }]);
  }
});

test('each kit has pinned runtime, metadata and editable downloads, and any poster matches its rig record', async () => {
  const catalog = await readJson('site/src/data/packs/seed-town.json');
  const delivery = await readJson('site/src/data/asset-delivery.json');
  const mirror = await readJson('site/src/data/mirror-manifest.json');
  const posters = await readJson('site/src/data/rig-posters.json');
  const group = delivery.groups['seed-town'];
  expect(catalog.license).toMatchObject({ spdx: 'CC0-1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/' });
  expect(group.downloads.map((download: any) => download.profile)).toEqual(['runtime', 'editable']);
  expect(group.assets.map((asset: any) => asset.slug)).toEqual(catalog.assets.map((asset: any) => asset.slug));
  const pins = new Map(mirror.files.map((file: any) => [file.path, file]));
  for (const file of group.downloads) expect(pins.get(file.path)).toMatchObject({ bytes: file.bytes, sha256: file.sha256 });
  for (const asset of catalog.assets) {
    const downloads = group.assets.find((item: any) => item.slug === asset.slug);
    expect(downloads.includedRevisions).toEqual([asset.revisionId]);
    expect(downloads.runtimeDownload).toMatchObject({ sha256: asset.runtimeModelDownload.sha256, bytes: asset.runtimeModelDownload.bytes });
    expect(downloads.runtimeMetadataDownload).toMatchObject({ sha256: asset.runtimeMetadata.sha256, bytes: asset.runtimeMetadata.bytes });
    // The GLB names its sidecar by file name, so the two must sit side by side under that name.
    expect(downloads.runtimeMetadataDownload.path).toBe(downloads.runtimeDownload.path.replace(/\.glb$/, '.kiln-metadata.json'));
    for (const file of [downloads.runtimeDownload, downloads.runtimeMetadataDownload, downloads.editableDownload]) {
      expect(pins.get(file.path)).toMatchObject({ bytes: file.bytes, sha256: file.sha256 });
    }
    const record = posters.posters[`seed-town:${asset.slug}`];
    if (!asset.poster) {
      expect(record).toBeUndefined();
      continue;
    }
    expect(record).toMatchObject({ assetId: asset.assetId, revisionId: asset.revisionId, glb: { sha256: asset.runtimeModelDownload.sha256, bytes: asset.runtimeModelDownload.bytes } });
    expect(asset.poster.inputPath).toBe(record.path);
    expect(pins.get(record.path)).toMatchObject({ bytes: record.bytes, sha256: record.sha256 });
  }
});
