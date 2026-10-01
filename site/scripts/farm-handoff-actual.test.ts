import { expect, test } from 'bun:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import sharp from 'sharp';
import current from '../src/data/packs/farm.json';
import { fetchPinnedFile, hashBytes } from './mirror-core.mjs';
import { switchFarmDelivery } from './switch-farm-delivery.mjs';
const put = async (path: string, value: string | Uint8Array) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, value); };
const json = (path: string, value: unknown) => put(path, JSON.stringify(value));
const seal = (bytes: Uint8Array) => ({ bytes: bytes.length, sha256: `sha256:${hashBytes(bytes)}` });
function glbFixture() {
  const data = JSON.stringify({ scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: 'Farmhouse', mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }], accessors: [{ count: 3, min: [0, 0, 0], max: [1, 1, 1] }, { count: 3 }], materials: [{}] });
  const length = Math.ceil(Buffer.byteLength(data) / 4) * 4, bytes = Buffer.alloc(length + 20, 32); bytes.write('glTF'); bytes.writeUInt32LE(2, 4); bytes.writeUInt32LE(bytes.length, 8); bytes.writeUInt32LE(length, 12); bytes.writeUInt32LE(0x4e4f534a, 16); bytes.write(data, 20); return bytes;
}
test('actual handoff schema resolves evidence pins from source root and qualifies retained exterior media', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'kiln-site-real-handoff-'));
  try {
    const dataDir = join(temp, 'data'), sourceRoot = join(temp, 'source'), cache = join(temp, 'cache'), prefix = 'delivery/farm-r34-documented-downloads/';
    const baseline = structuredClone(current); baseline.revision = 'r33'; baseline.fullPackAccepted = false; baseline.ownerApprovedAssets = 0; baseline.deliveryReview = { ...baseline.deliveryReview, revision: 'r33', fullPackAccepted: false, acceptedAssets: 0, total: 1 }; baseline.assets = baseline.assets.filter((asset) => asset.id === 'farmhouse'); const house = baseline.assets[0]!; house.revisionId = baseline.floorRevision.parentRevision;
    baseline.ownerReview.revisions = baseline.ownerReview.revisions.filter((asset) => asset.id === 'farmhouse');
    await json(join(dataDir, 'packs/farm.json'), baseline); await json(join(dataDir, 'owner-review.json'), { assetId: 'farmhouse', revisionId: baseline.floorRevision.asset.revisionId, ownerAccepted: true, date: '2026-09-29', statement: 'Accepted', source: 'owner.md' });
    await json(join(dataDir, 'mirror-manifest.json'), { base: 'https://assets.kilnstudio.tools/', files: [] }); await json(join(dataDir, 'commons-build.json'), { images: [], archives: [], models: [], sources: [{ output: 'sources/other.kiln.js', archive: 'other.zip' }] });
    const glb = glbFixture(), source = strToU8('const meta = {name:"Farmhouse"};'), preview = await sharp({ create: { width: 2, height: 2, channels: 4, background: '#eee9df' } }).png().toBuffer();
    const revisionId = baseline.floorRevision.asset.revisionId, projectRevision = 'r_project_34';
    const asset = { id: 'farmhouse', revisionId, triangles: 1, authorship: { originalModel: 'claude-opus-5-5', refinementModels: ['gemini-3.8-flash-high'], history: [{ stage: 'wood-floor', revisionId, parentRevisionId: house.revisionId, requested: { model: 'gemini-3.8-flash-high', effort: 'high' }, confirmed: { model: 'gemini-3.8-flash-high', effort: null }, harness: { name: 'agy', version: '1.2.12' } }] } };
    const meta = { revisionId, runtime: { file: 'models/farmhouse.glb', ...seal(glb) }, source: { sourceSha256: hashBytes(source) } };
    const downloads = [];
    for (const profile of ['runtime', 'editable', 'scene']) {
      const members: Record<string, Uint8Array> = profile === 'runtime' ? { 'models/farmhouse.glb': glb, 'models/farmhouse.json': strToU8(JSON.stringify(meta)), 'previews/farmhouse.png': preview } : profile === 'editable' ? { 'sources/farmhouse.kiln.js': source } : { 'scene/README.txt': strToU8('Fixture') };
      const manifest = { projectRevision, fullPackAccepted: true, assets: [asset], files: Object.fromEntries(Object.entries(members).map(([name, bytes]) => [name, seal(bytes)])) };
      const archive = zipSync({ ...members, 'delivery.json': strToU8(JSON.stringify(manifest)) }), fileName = `shapes-and-seasons-farm-${profile}.zip`, path = prefix + fileName; await put(join(sourceRoot, path), archive); downloads.push({ profile, fileName, path, ...seal(archive) });
    }
    const index = { projectRevision, fullPackAccepted: true, downloads: downloads.map(({ fileName, path: _path, ...row }) => ({ ...row, archive: fileName })) }, indexBytes = strToU8(JSON.stringify(index)); await put(join(sourceRoot, prefix, 'downloads.json'), indexBytes);
    const handoff = { kind: 'shapes-and-seasons-farm-site-handoff', pack: { projectRevision, assetCount: 1 }, acceptance: { fullPackAccepted: true, approvedAssets: 1, performanceQualified: false, publicationAuthorized: false }, downloads, evidence: [{ path: `${prefix}downloads.json`, ...seal(indexBytes) }], assets: [{ id: 'farmhouse', revisionId, preview: { member: 'previews/farmhouse.png', ...seal(preview) }, ownerApproval: { verdict: 'accepted' } }], farmhouse: { before: { revisionId: house.revisionId }, after: { revisionId }, changes: { boundsUnchanged: true, materialChanges: 0, exteriorRayProbes: { count: 132, identical: true } } }, media: { r33SiteMediaValidity: [{ media: house.poster.inputPath, status: 'expected valid for silhouette and exterior; not re-rendered' }, { media: 'media/farm/r33/scene/farm-scene-{wide,close,portrait}.webp', status: 'valid for layout and exterior; not re-captured for r34' }] } };
    const handoffPath = join(sourceRoot, prefix, 'site-handoff.json'); await json(handoffPath, handoff);
    const options = { handoff: handoffPath, sourceRoot, dataDir, cache };
    await expect(switchFarmDelivery(options)).resolves.toEqual({ revision: 'r34', assets: 1, fullPackAccepted: true, newPinnedFiles: 5 });
    const result = JSON.parse(await readFile(join(dataDir, 'packs/farm.json'), 'utf8')); expect(result.assets[0].revisionId).toBe(revisionId); expect(result.deliveryHistory[0].revision).toBe('r33'); expect(result.deliveryHistory[0].fullPackAccepted).toBe(false); expect(result.qualification.performanceQualified).toBe(false); expect(result.assets[0].poster.sourceRevisionId).toBe(house.revisionId); expect(result.assets[0].poster.exactRevision).toBe(false); expect(result.assets[0].poster.revisionQualification).toContain('not re-rendered'); expect(result.assets[0].reviewImage.inputPath).toBe('media/farm/r34/poster/farmhouse.png'); expect(result.assets[0].reviewImage.sourceRevisionId).toBe(revisionId); expect(result.scene.poster.sourceDelivery).toBe('r33'); expect(result.scene.poster.exactRevision).toBe(false); expect(result.floorRevision.parentRevision).toBe(baseline.floorRevision.parentRevision); expect(result.floorRevision.before).toEqual(baseline.floorRevision.before); expect(result.floorRevision.after).toEqual(baseline.floorRevision.after);
    const plan = JSON.parse(await readFile(join(dataDir, 'commons-build.json'), 'utf8')); expect(plan.sources.some((entry: { output: string }) => entry.output === 'sources/other.kiln.js')).toBe(true);
    const pins = JSON.parse(await readFile(join(dataDir, 'mirror-manifest.json'), 'utf8')); for (const pin of pins.files) expect(await fetchPinnedFile(pin, { mirror: join(temp, 'absent-original-mirror'), cache: join(cache, 'mirror') })).toContain(join(cache, 'mirror'));
    await json(join(dataDir, 'packs/farm.json'), baseline); handoff.farmhouse.changes.exteriorRayProbes.identical = false; await json(handoffPath, handoff); await expect(switchFarmDelivery(options)).rejects.toThrow('exterior'); expect(JSON.parse(await readFile(join(dataDir, 'packs/farm.json'), 'utf8')).revision).toBe('r33');
  } finally {
    const target = resolve(temp); if (!target.startsWith(resolve(tmpdir())) || !target.includes('kiln-site-real-handoff-')) throw new Error('Unsafe test cleanup path'); await rm(target, { recursive: true, force: true });
  }
});
