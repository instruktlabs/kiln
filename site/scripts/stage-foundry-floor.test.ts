import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unzipSync } from 'fflate';
import catalog from '../src/data/packs/foundry-floor.json';
import { foundryGlbFixture } from './fixtures/foundry-glb.mjs';
import { displayName, slugOfName } from './foundry-floor-spec.mjs';
import { buildModelsArchive, licenceStatements, parseLicence, verifyModelIdentity, verifyCampusModel, verifyModel } from './stage-foundry-floor.mjs';


const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const revision = `r_${'1'.repeat(32)}`;
const digest = 'a'.repeat(64);
const modelLine = (slug: string, author = 'sonnet-ff-tools', hash = digest) => `models/${slug}.glb  ${slug}  Kiln revision ${revision}  showcase/authors/${author}  SHA-256 ${hash}`;
/** A licence text in the layout the Foundry Floor staging writes: identifier, release, scope and one line per model. */
const licenceText = (lines: string[], { spdx = 'CC0-1.0', scope = 'to the extent of the owner\'s rights' } = {}) =>
  [`Foundry Floor pack`, `SPDX-License-Identifier: ${spdx}`, 'Release: ff2', '', `The authored models are designated CC0 1.0 Universal, ${scope}.`, '', ...lines, ''].join('\n');

describe('Foundry Floor licence text', () => {
  test('FF3 binds nested pack paths to asset, revision, hash and exact author/effort credit', () => {
    const author = 'Claude Sonnet 5.5 · claude 2.1.280';
    const effort = 'Requested effort: max. Independently confirmed: not recorded.';
    const text = licenceText([`models/campus/freight-truck.glb  Kiln asset truck-tractor, revision ${revision}  SHA-256 ${digest}`, `    ${author}. ${effort}`]);
    const line = parseLicence(text).lines.get('models/campus/freight-truck.glb');
    expect(line).toEqual({ asset: 'truck-tractor', revision, sha256: digest, author, requestedEffort: 'max', confirmedEffort: null });
    const source = { asset: 'truck-tractor', revision, author, requestedEffort: 'max', confirmedEffort: null };
    const credit = { name: 'Truck tractor (Kiln-authored freight)', licence: 'CC0-1.0', source: `Kiln asset truck-tractor, revision ${revision}. ${author}. ${effort}` };
    expect(() => verifyModelIdentity({ path: 'models/campus/freight-truck.glb', slug: 'truck-tractor', source, line, credit, sha: digest })).not.toThrow();
    for (const bad of [{ ...line, sha256: 'b'.repeat(64) }, { ...line, revision: `r_${'2'.repeat(32)}` }, { ...line, asset: 'another-model' }, { ...line, author: 'Another author' }, { ...line, requestedEffort: 'high' }]) {
      expect(() => verifyModelIdentity({ path: 'models/campus/freight-truck.glb', slug: 'truck-tractor', source, line: bad, credit, sha: digest })).toThrow();
    }
    expect(() => verifyModelIdentity({ path: 'models/campus/freight-truck.glb', slug: 'truck-tractor', source, line, credit: { ...credit, source: credit.source.replace('max', 'high') }, sha: digest })).toThrow();
  });

  test('FF3 rejects malformed model paths and missing author evidence', () => {
    expect(() => parseLicence(licenceText([`models/../bad.glb  Kiln asset bad, revision ${revision}  SHA-256 ${digest}`]))).toThrow();
    expect(() => parseLicence(licenceText([`models/foup.glb  Kiln asset foup, revision ${revision}  SHA-256 ${digest}`]))).toThrow();
  });
  test('FF3 preserves structure path case and generated asset IDs in its sealed licence', () => {
    const path='models/structures/s1-head-W.glb'; const asset=`a_${'3'.repeat(32)}`;
    const parsed=parseLicence(licenceText([`${path}  Kiln asset ${asset}, revision ${revision}  SHA-256 ${digest}`, '    Claude Sonnet 5.5 · claude 2.1.280. Requested effort: max. Independently confirmed: not recorded.']));
    expect(parsed.lines.get(path)?.asset).toBe(asset);
    const unknown=parseLicence(licenceText([`${path}  Kiln asset ${asset}, revision ${revision}  SHA-256 ${digest}`, '    Codex · model and harness version not recorded. Requested effort: not recorded. Independently confirmed: not recorded.']));
    expect(unknown.lines.get(path)?.requestedEffort).toBeNull();
  });
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

test('campus intake measures exact sealed GLB and refuses an altered source pin', async () => {
  const scenePack = await mkdtemp(join(tmpdir(), 'kiln-campus-intake-'));
  try {
    const path = 'models/campus/foup.glb';
    const glb = foundryGlbFixture('standard');
    await mkdir(join(scenePack, 'models/campus'), { recursive: true });
    await writeFile(join(scenePack, path), glb);
    const sha256 = sha(glb);
    const source = { asset: 'foup', revision, author: 'Test Model · codex 1', requestedEffort: 'high', confirmedEffort: null, sha256, bytes: glb.length };
    const credit = { licence: 'CC0-1.0', source: `Kiln asset foup, revision ${revision}. Test Model · codex 1. Requested effort: high. Independently confirmed: not recorded.` };
    const item = { key: 'campus-foup', source, path, slug: 'foup', group: 'campus', placed: true, unplacedWhy: null };
    const input = { item, scenePack, pack: { credits: [credit] }, sums: new Map([[path, sha256]]), licenceLines: new Map([[path, source]]) };
    const result = await verifyCampusModel(input);
    expect(result.measured.triangles.total).toBeGreaterThan(0);
    expect(result.loaded.triangles).toBe(1);
    expect(result.measured.triangles.total).toBe(2);
    const provenance=Buffer.from('{"source":"retained"}');
    const zip = unzipSync(buildModelsArchive({ results: [result], licenceBytes: Buffer.from('licence'), release: 'fixture', additionalFiles: { 'licenses/vehicles/test.txt': Buffer.from('CC0-1.0'), 'evidence/asset-replacements.json':provenance, 'data/assets.json':provenance } }));
    expect(zip[path]).toEqual(new Uint8Array(glb));
    expect(zip['licenses/vehicles/test.txt']).toBeDefined();
    expect(zip['evidence/asset-replacements.json']).toEqual(new Uint8Array(provenance));
    expect(()=>buildModelsArchive({results:[result],licenceBytes:Buffer.from('licence'),release:'fixture',additionalFiles:{'evidence/private-work-notes.json':provenance}})).toThrow('Invalid additional');
    await expect(verifyCampusModel({ ...input, item: { ...item, source: { ...source, sha256: 'b'.repeat(64) } } })).rejects.toThrow('sealed source pin');
  } finally { await rm(scenePack, { recursive: true, force: true }); }
});

async function interiorFixture(scenePack: string, asset = 'foup', path = 'models/foup.glb') {
  const glb = foundryGlbFixture('standard');
  await mkdir(join(scenePack,'models'),{recursive:true}); await writeFile(join(scenePack,path),glb);
  const source={asset,revision,author:'Codex · model not recorded',requestedEffort:null,confirmedEffort:null,bytes:glb.length,sha256:sha(glb)};
  const box={min:[0,0,0],max:[1,1,0],size:[1,1,0]};
  const entity={asset,glb:path,status:'review-candidate',source,pins:{bytes:glb.length,sha256:sha(glb)},measured:{root:'root',triangles:{detailed:1,lod1:1,hiddenByDefault:0},bounds:box,lod1Bounds:box,materials:[],extensions:['MSFT_lod'],textures:0},clips:[]};
  const pack={models:[{id:'fixture',path}],source:{models:{fixture:source}},credits:[{name:`${asset} (Kiln-authored model)`,licence:'CC0-1.0',source:`Kiln asset ${asset}, revision ${revision}. ${source.author}. Requested effort: not recorded. Independently confirmed: not recorded.`}]};
  return {key:'fixture',entity,scenePack,assetMap:{},pack,sums:new Map([[path,source.sha256]]),licenceLines:new Map([[path,source]])};
}

test('an explicitly recorded review candidate can be verified without becoming owner accepted', async () => {
  const scenePack=await mkdtemp(join(tmpdir(),'kiln-candidate-fixture-'));
  try {
    const input=await interiorFixture(scenePack);
    const result=await verifyModel(input);
    expect(result.entity.status).toBe('review-candidate');
    await expect(verifyModel({...input,entity:{...input.entity,status:'rejected'}})).rejects.toThrow('rejected');
  } finally {await rm(scenePack,{recursive:true,force:true});}
});

test('a modern source-backed repair keeps its public model path without renaming the source asset', async () => {
 const scenePack=await mkdtemp(join(tmpdir(),'kiln-repaired-path-'));
 try {
  const input=await interiorFixture(scenePack,'foup-repair','models/stable-file.glb');
  const result=await verifyModel(input);
  expect(result.slug).toBe('stable-file');expect(result.path).toBe('models/stable-file.glb');expect(result.entity.source.asset).toBe('foup-repair');
 }finally{await rm(scenePack,{recursive:true,force:true});}
});
