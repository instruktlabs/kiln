import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { unzipSync } from 'fflate';
import catalog from '../src/data/packs/foundry-floor.json';
import { displayName, slugOfName } from './foundry-floor-spec.mjs';
import { buildModelsArchive, licenceStatements, parseLicence } from './stage-foundry-floor.mjs';

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const revision = `r_${'1'.repeat(32)}`;
const digest = 'a'.repeat(64);
const modelLine = (slug: string, author = 'sonnet-ff-tools', hash = digest) => `models/${slug}.glb  ${slug}  Kiln revision ${revision}  showcase/authors/${author}  SHA-256 ${hash}`;
/** A licence text in the layout the Foundry Floor staging writes: identifier, release, scope and one line per model. */
const licenceText = (lines: string[], { spdx = 'CC0-1.0', scope = 'to the extent of the owner\'s rights' } = {}) =>
  [`Foundry Floor pack`, `SPDX-License-Identifier: ${spdx}`, 'Release: ff2', '', `The authored models are designated CC0 1.0 Universal, ${scope}.`, '', ...lines, ''].join('\n');

describe('Foundry Floor licence text', () => {
  test('reads each model line: path, slug, revision, author folder and SHA-256', () => {
    const { lines, release } = parseLicence(licenceText([modelLine('etch-cluster-tool'), modelLine('foup', 'sonnet-ff-movers', 'b'.repeat(64))]));
    expect(release).toBe('ff2');
    expect(lines.size).toBe(2);
    expect(lines.get('models/foup.glb')).toEqual({ slug: 'foup', revision, author: 'sonnet-ff-movers', sha256: 'b'.repeat(64) });
  });

  test('stops rather than relabel a text that is not CC0-1.0 or lacks the scope', () => {
    expect(() => parseLicence(licenceText([modelLine('foup')], { spdx: 'CC-BY-4.0' }))).toThrow('stopping rather than relabelling');
    expect(() => parseLicence(licenceText([modelLine('foup')], { scope: 'worldwide' }))).toThrow('owner\'s rights');
    expect(() => parseLicence(licenceText([modelLine('foup'), modelLine('foup')]))).toThrow('twice');
  });

  test('every licence statement in the pack must be CC0-1.0, or the run stops and reports it', () => {
    const pack = { credits: [{ name: 'foup (Kiln-authored model)', licence: 'CC0-1.0' }] };
    const assetMap = { licence: { spdx: 'CC0-1.0' } };
    const licence = licenceText([modelLine('foup')]);
    expect(licenceStatements({ pack, assetMap, licence })).toHaveLength(3);
    const other = { credits: [...pack.credits, { name: 'reference photo', licence: 'CC-BY-4.0' }] };
    expect(() => licenceStatements({ pack: other, assetMap, licence })).toThrow('Stop and report: pack.json credit reference photo says CC-BY-4.0');
    expect(() => licenceStatements({ pack, assetMap: { licence: {} }, licence })).toThrow('data/assets.json licence says null');
  });
});

describe('Foundry Floor names and archive', () => {
  test('every page name is written from the pack slug and traces back to it', () => {
    for (const asset of catalog.assets) {
      expect(asset.name).toBe(displayName(asset.slug));
      expect(slugOfName(asset.name)).toBe(asset.slug);
    }
    expect(displayName('cvd-ald-cluster-tool')).toBe('CVD/ALD cluster tool');
    expect(displayName('euv-scanner')).toBe('EUV scanner');
    expect(displayName('subfab-pump-abatement-kit')).toBe('Subfab pump/abatement kit');
  });

  test('the models archive is the same bytes from the same inputs, sealed by its inventory', () => {
    const glb = new Uint8Array(Buffer.from('glTF model bytes'));
    const results = [{ slug: 'foup', glb, sha: sha(glb), entity: { source: { revision } }, measured: { triangles: { detailed: 12, lod1: 2, hiddenByDefault: 4 } }, placed: true }];
    const licenceBytes = Buffer.from(licenceText([modelLine('foup', 'sonnet-ff-movers', sha(glb))]));
    const first = buildModelsArchive({ results, licenceBytes, release: 'ff2' });
    const second = buildModelsArchive({ results, licenceBytes, release: 'ff2' });
    expect(sha(first)).toBe(sha(second));
    const files = unzipSync(first);
    expect(Object.keys(files).sort()).toEqual(['delivery.json', 'licenses/ASSET-LICENSE.txt', 'models/foup.glb']);
    const inventory = JSON.parse(new TextDecoder().decode(files['delivery.json']));
    expect(inventory).toMatchObject({ pack: 'Foundry Floor', release: 'ff2', status: 'in production', license: 'CC0-1.0' });
    expect(inventory.assets).toEqual([{ slug: 'foup', name: 'FOUP', revisionId: revision, model: 'models/foup.glb', placedInScene: true, triangles: { detailed: 12, lod1: 2, hiddenByDefault: 4 } }]);
    expect(inventory.files['models/foup.glb']).toEqual({ bytes: glb.length, sha256: sha(glb) });
  });
});
