import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, test } from 'bun:test';
import * as THREE from 'three';
import galleryOrder from '../src/data/gallery-order.json';
import { cathedralGalleryAssets, cathedralModelUrl } from '../src/lib/cathedral-gallery';
import { buildGallery } from '../src/lib/gallery';
import { modelSha256, qaErrorsAndWarnings, validateVerifiedReviews } from '../src/lib/gallery-verified';
import { h7GalleryAssets, h7ModelUrl } from '../src/lib/h7-gallery';
import { holodeckAssets } from '../src/lib/holodeck';
import { textTo3dGalleryAssets } from '../src/lib/text-to-3d-gallery';
import {
  captureSheet,
  loadReviewEngine,
  pendingRecord,
  pinnedGlb,
  promote,
  proposal,
  proposeNote,
  qaPinnedGlb,
  reviewPage,
  selectCards,
  servedModel,
} from './gallery-verified-review.mjs';

const ENGINE = new URL('../../src/', import.meta.url);
const engineModule = (path: string) => import(new URL(path, ENGINE).href);
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const cards = buildGallery(true);
let engine: Awaited<ReturnType<typeof loadReviewEngine>>;
let render: (root: THREE.Object3D) => Promise<Uint8Array>;
let scratch: string;

beforeAll(async () => {
  engine = await loadReviewEngine();
  const { renderSceneToGLB } = await engineModule('render.ts');
  render = async (root) => (await renderSceneToGLB(root)).bytes;
  scratch = await mkdtemp(join(tmpdir(), 'kiln-verified-review-'));
});
afterAll(() => rm(scratch, { recursive: true, force: true }));

const box = (name: string, color: number, x = 0, size = 1) => {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size, size, size),
    new THREE.MeshStandardMaterial({ color, roughness: 0.8 }),
  );
  mesh.name = name;
  mesh.position.set(x, size / 2, 0);
  return mesh;
};
const scene = (name: string, ...children: THREE.Object3D[]) => {
  const root = new THREE.Group();
  root.name = name;
  root.add(...children);
  return root;
};
const codes = (evidence: { qa: { dimensions: Record<string, { findings: { code: string }[] }> } }) =>
  Object.values(evidence.qa.dimensions).flatMap((dimension) => dimension.findings.map((finding) => finding.code));

test('the first cards of the curated order are reviewed on the GLB their pages load', () => {
  const chosen = selectCards({ first: 14 }, cards);
  expect(chosen.map((card) => card.href)).toEqual(galleryOrder.order.slice(0, 14));
  for (const card of chosen) {
    const served = servedModel(card);
    expect(served.sha256).toBe(modelSha256(card));
    for (const path of served.paths) expect(path).not.toMatch(/^\/|\.\.|\\/);
  }
  const href = (path: string) => cards.find((card) => card.href === path)!;
  // Holodeck serves its runtime GLB, not the saved asset.glb; the viewer adds the revision.
  const fountain = holodeckAssets.find((asset) => asset.slug === 'plaza-fountain')!;
  expect(servedModel(href('/gallery/holodeck/plaza-fountain/'))).toEqual({
    url: `${fountain.runtimeModelDownload.url}?revision=${fountain.revisionId}`,
    bytes: fountain.runtimeModelDownload.bytes,
    sha256: fountain.runtimeModelDownload.sha256,
    paths: [fountain.runtimeModelDownload.path],
    hostPath: fountain.runtimeModelDownload.path,
  });
  // Cathedral Square serves its staged scene pack; the delivery copy holds the same bytes.
  const cathedral = cathedralGalleryAssets(true).find((asset) => asset.slug === 'cathedral')!;
  const cathedralServed = servedModel(href('/gallery/cathedral-square/cathedral/'));
  expect(cathedralServed.url).toBe(cathedralModelUrl(cathedral));
  expect(cathedralServed.paths).toEqual([
    cathedralModelUrl(cathedral).split('?')[0]!.slice(1),
    'packs/cathedral-square/cs2/models/cathedral.glb',
  ]);
  const cockpit = h7GalleryAssets(true).find((asset) => asset.slug === 'mech-cockpit')!;
  expect(servedModel(href('/gallery/h-7/mech-cockpit/')).url).toBe(h7ModelUrl(cockpit));
  // The Text-to-3D mech serves the page's own file, which is not its saved asset.glb either.
  const mech = textTo3dGalleryAssets(true).find((asset) => asset.slug === 'mech')!;
  expect(servedModel(href('/gallery/text-to-3d/mech/'))).toMatchObject({ url: mech.runtimeDownload.url, sha256: mech.runtimeDownload.sha256 });
  expect(() => servedModel(href('/gallery/faceted-tree/'))).toThrow(/does not know which GLB/);
  expect(() => selectCards({ hrefs: ['/gallery/nothing/'] }, cards)).toThrow(/No gallery card/);
});

test('the served bytes come only from a copy with the pinned hash, fetched only when allowed', async () => {
  const bytes = new TextEncoder().encode('pinned glb bytes');
  const served = { url: 'https://example.test/a.glb', bytes: bytes.length, sha256: sha256(bytes), paths: ['packs/a/a.glb'], hostPath: 'packs/a/a.glb' };
  const stale = join(scratch, 'stale');
  const good = join(scratch, 'good');
  await mkdir(join(stale, 'packs/a'), { recursive: true });
  await mkdir(join(good, 'packs/a'), { recursive: true });
  await writeFile(join(stale, 'packs/a/a.glb'), 'other glb bytes!');
  await writeFile(join(good, 'packs/a/a.glb'), bytes);
  const found = await pinnedGlb(served, { mirrors: [stale, good] });
  expect(found.source).toBe(join(good, 'packs/a/a.glb'));
  expect([...found.bytes]).toEqual([...bytes]);
  await expect(pinnedGlb(served, { mirrors: [stale] })).rejects.toThrow(/No verified copy[\s\S]*Other bytes were found/);
  // Fetching is opt-in, checked, and cached.
  const cache = join(scratch, 'cache');
  let fetched = 0;
  const host = (body: Uint8Array) => async () => {
    fetched++;
    return new Response(body);
  };
  await expect(pinnedGlb(served, { cache, fetchImpl: host(bytes) })).rejects.toThrow(/--fetch/);
  await expect(pinnedGlb(served, { cache, fetch: true, fetchImpl: host(new TextEncoder().encode('tampered bytes!!')) })).rejects.toThrow(/did not serve the pinned bytes/);
  expect((await pinnedGlb(served, { cache, fetch: true, fetchImpl: host(bytes) })).source).toBe('https://assets.kilnstudio.tools/packs/a/a.glb');
  expect((await pinnedGlb(served, { cache, fetch: true, fetchImpl: host(bytes) })).source).toBe(join(cache, 'packs/a/a.glb'));
  expect(fetched).toBe(2);
  // A saved asset.glb with the same hash is the same file.
  const saved = join(scratch, 'asset.glb');
  await writeFile(saved, bytes);
  expect((await pinnedGlb(served, { saved: [saved] })).source).toBe(saved);
});

test('FLUSH_FACES and the QA rules run on the pinned bytes, read back by the engine', async () => {
  const bytes = await render(scene('Pair', box('Left', 0xaa3322), box('Right', 0x2244aa, 0.25)));
  const { evidence } = await qaPinnedGlb(engine, bytes);
  expect(evidence).toMatchObject({ kind: 'kiln.gallery-verified-qa', version: 1, glbSha256: sha256(bytes), requirements: 'default: no saved manifest found', policy: 'default' });
  expect(evidence.flushFaces.pairs).toBeGreaterThan(0);
  expect(evidence.flushFaces).toMatchObject({ truncated: false, unexaminedParts: 0 });
  // Parts are named as the readback names them: each primitive of a mesh node.
  expect(evidence.flushFaces.listed[0].parts.sort()).toEqual(['Left:primitive-0', 'Right:primitive-0']);
  expect(evidence.qa).toMatchObject({ kind: 'kiln.asset-qa-report', schemaVersion: 2 });
  // The same measurement on other bytes differs: nothing is rebuilt from a program.
  const apart = await render(scene('Pair', box('Left', 0xaa3322), box('Right', 0x2244aa, 3)));
  expect((await qaPinnedGlb(engine, apart)).evidence.flushFaces.pairs).toBe(0);
});

test('embedded images are decoded for the material rule, which otherwise reports every textured slot', async () => {
  const { encodePng } = await engineModule('views/png.ts');
  const { loadTexture, pbrMaterial } = await engineModule('textures.ts');
  const albedo = await loadTexture(encodePng(new Uint8Array(4 * 4 * 3).fill(180), 4, 4), { usage: 'albedo', name: 'Plaster' });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), pbrMaterial({ albedo, name: 'Wall' }));
  mesh.name = 'Wall';
  const bytes = await render(scene('Textured', mesh));
  // The premise: the engine's readback keeps encoded bytes only.
  const { root, clips } = await engine.glb.loadGlbReviewScene(bytes);
  const context = engine.requirements.resolveRequirementsContext();
  const raw = engine.run.runRequirementsSceneQa(context, root.children[0], clips, {}, {});
  expect(codes({ qa: raw })).toContain('MAT_TEXTURE_DECODE_FAILED');
  const { evidence } = await qaPinnedGlb(engine, bytes);
  expect(codes(evidence)).not.toContain('MAT_TEXTURE_DECODE_FAILED');
  expect(codes(evidence)).not.toContain('MAT_TEXTURE_INVALID_DIMENSIONS');
  expect(evidence.readbackDetail).toMatchObject({ imagesDecoded: 1, imageDecodeFailures: [] });
});

test('the rules run on the scene root node, so the glTF scene is not counted as a second node', async () => {
  // Saved and delivered GLBs often name the glTF scene as their root node (the Skitterer does).
  const doc = await engine.io.createGltfIO().readBinary(await render(scene('Crate', box('Lid', 0x886644))));
  doc.getRoot().getDefaultScene()!.setName('Crate');
  const bytes = await engine.io.createGltfIO().writeBinary(doc);
  const { root, clips } = await engine.glb.loadGlbReviewScene(bytes);
  // The premise: the readback wraps the root node in a group named after the glTF scene.
  expect([root.name, root.children.map((child: THREE.Object3D) => child.name)]).toEqual(['Crate', ['Crate']]);
  const context = engine.requirements.resolveRequirementsContext();
  expect(codes({ qa: engine.run.runRequirementsSceneQa(context, root, clips, {}, {}) })).toContain('UNIVERSAL_DUPLICATE_NODE_NAME');
  const { evidence } = await qaPinnedGlb(engine, bytes);
  expect(codes(evidence)).not.toContain('UNIVERSAL_DUPLICATE_NODE_NAME');
  expect(evidence.readbackDetail.rootNode).toBe('Crate');
});

const png = async (size = 8) => {
  const { encodePng } = await engineModule('views/png.ts');
  return new Uint8Array(encodePng(new Uint8Array(size * size * 3).fill(90), size, size));
};
const fakePort =
  (attest: boolean) =>
  async (request: { glb: Uint8Array; viewDirs?: unknown[] }) => ({
    ok: true,
    rendererId: 'dawn-test:gpu',
    viewsPng: await Promise.all((request.viewDirs ?? []).map(() => png())),
    ...(attest ? { derivativeFidelity: { materialFaithful: true, inputGlbSha256: `sha256:${sha256(request.glb)}` } } : {}),
  });

test('the default six-view sheet counts as material evidence only when the renderer attests these bytes', async () => {
  const bytes = await render(scene('Sheet', box('Block', 0x777777)));
  const drawn = await captureSheet(engine, fakePort(true), bytes);
  expect(drawn.viewFidelity).toEqual({
    version: 'kiln.view-fidelity.v1',
    requested: 'full-preferred',
    delivered: 'full-material',
    materialFaithful: true,
    exactArtifact: true,
    rendererId: 'dawn-test:gpu',
    inputGlbSha256: `sha256:${sha256(bytes)}`,
    degraded: false,
  });
  expect(drawn.png).toBeTruthy();
  expect(drawn.shots).toMatch(/^default six-view sheet: .*6 cells/);
  const unattested = await captureSheet(engine, fakePort(false), bytes);
  expect(unattested.viewFidelity).toMatchObject({ materialFaithful: false, exactArtifact: false, degradeReason: expect.stringMatching(/did not attest/) });
  const down = await captureSheet(engine, async () => { throw new Error('service stopped'); }, bytes);
  expect(down.viewFidelity).toMatchObject({ delivered: 'none', materialFaithful: false, degradeReason: expect.stringMatching(/service stopped/) });
});

test('proposals follow the bar, and notes come from facts in the bytes where the code allows', async () => {
  const faithful = { materialFaithful: true, exactArtifact: true, delivered: 'full-material' };
  const flush = (pairs: number, extra = {}) => ({ pairs, truncated: false, unexaminedParts: 0, triangles: 10, examined: 10, ...extra });
  expect(proposal({ flush: flush(0), viewFidelity: faithful, findings: [], assetId: 'a_x', collection: 'project' })).toEqual({ verdict: 'verified', standing: 'likely to pass', reasons: [] });
  expect(proposal({ flush: flush(3), viewFidelity: faithful, findings: [], assetId: 'a_x', collection: 'project' })).toMatchObject({ verdict: 'rejected', standing: 'fails the bar', reasons: ['FLUSH_FACES reports 3 pairs'] });
  // A truncated check says how much of the GLB it measured: parts past the budget are not in its own count.
  const truncated = flush(0, { truncated: true, triangles: 400_000, examined: 400_000 });
  expect(proposal({ flush: truncated, modelTriangles: 3_193_943, viewFidelity: faithful, findings: [], assetId: 'a_x', collection: 'project' }).reasons).toEqual([
    'the flush-face check stopped at its budget after measuring 400,000 of the 3,193,943 triangles in the GLB',
  ]);
  expect(proposal({ flush: truncated, viewFidelity: faithful, findings: [], assetId: 'a_x', collection: 'project' }).reasons).toEqual([
    'the flush-face check stopped at its budget after measuring 400,000 triangles; the parts past it were not measured',
  ]);
  // A skinned GLB the check cannot measure is the owner's call, and its saved GLB informs it.
  expect(
    proposal({ flush: flush(0, { unexaminedParts: 9, examined: 0, triangles: 0 }), viewFidelity: faithful, findings: [], assetId: 'a_x', savedFlush: flush(32) }),
  ).toEqual({
    verdict: 'rejected',
    standing: 'needs the owner’s judgment',
    reasons: [
      '9 parts skinned, morphed or instanced, so FLUSH_FACES did not measure anything',
      'the saved asset.glb of this revision, which the check can measure, has 32 flush-face pairs',
      'the card names no collection; the record says project',
    ],
  });
  // The skinned-mesh warning is harmless when every parent transform is identity, which the bytes show.
  const { Document } = await import('@gltf-transform/core');
  const doc = new Document();
  const parent = doc.createNode('Rig');
  const body = doc.createNode('Body');
  parent.addChild(body);
  expect(proposeNote({ code: 'GLTF_NODE_SKINNED_MESH_NON_ROOT', subject: '/nodes/1', message: 'm' }, { doc })).toMatch(/under Rig, whose transform is identity/);
  parent.setTranslation([0, 1, 0]);
  expect(proposeNote({ code: 'GLTF_NODE_SKINNED_MESH_NON_ROOT', subject: '/nodes/1', message: 'm' }, { doc })).toMatch(/check the views/);
  expect(proposeNote({ code: 'SOMETHING_NEW', message: 'It was measured.' })).toMatch(/^It was measured\. Accepted after the visual review/);
});

const views = { shots: 'default six-view sheet', viewFidelity: { rendererId: 'dawn-test:gpu', delivered: 'full-material', materialFaithful: true, exactArtifact: true } };

test('a pending record is the final record with every field filled, refused by the site until decided', async () => {
  const card = cards.find((candidate) => candidate.href === '/gallery/holodeck/plaza-fountain/')!;
  const served = servedModel(card);
  const evidence = {
    kind: 'kiln.gallery-verified-qa',
    version: 1,
    glbSha256: served.sha256,
    flushFaces: { pairs: 0, truncated: false, unexaminedParts: 0 },
    qa: { kind: 'kiln.asset-qa-report', schemaVersion: 2, dimensions: { exportIntegrity: { findings: [{ code: 'GLTF_NODE_SKINNED_MESH_NON_ROOT', disposition: 'warn', message: 'Node with a skinned mesh is not root.', affected: { nodePath: '/nodes/9' } }, { code: 'GEO_NOTE', disposition: 'observe', message: 'Informational.' }] } } },
  };
  const bytes = new TextEncoder().encode(JSON.stringify(evidence));
  const qaReport = { path: 'gallery-verified/qa/test.json', sha256: sha256(bytes) };
  const record = pendingRecord({ card, served, evidence, qaReport, views, proposed: { verdict: 'verified' }, date: '2026-11-19' });
  expect(record).toMatchObject({ status: 'pending', collection: 'project', assetId: card.assetId, revisionId: card.revisionId, glbSha256: served.sha256, verdict: 'verified', reviewer: 'owner', qaReport });
  // One finding per QA error and warning, none for the informational note.
  expect(record.findings).toEqual([{ code: 'GLTF_NODE_SKINNED_MESH_NON_ROOT', subject: '/nodes/9', resolution: 'accepted', note: expect.any(String) }]);
  const readQaFile = () => bytes;
  const file = (reviews: unknown[]) => ({ bar: 1, reviews });
  expect(() => validateVerifiedReviews(file([record]), { readQaFile })).toThrow(/pending/);
  const { status: _pending, ...decided } = record;
  expect(validateVerifiedReviews(file([decided]), { readQaFile })).toHaveLength(1);
  expect(qaErrorsAndWarnings(evidence)).toHaveLength(record.findings.length);
});

test('the review page shows each sheet, flush result and proposed note, with everything escaped', async () => {
  const sheet = await png(16);
  const evidence = {
    flushFaces: { pairs: 1, truncated: false, unexaminedParts: 0, triangles: 12, examined: 12, matching: 0, hidden: 0, omitted: 0, listed: [{ parts: ['Lid', 'Box'], sharedArea: 0.25, at: [0, 1, 0] }], warning: 'FLUSH_FACES: 1 pair.' },
    requirements: 'default: no saved manifest found',
    qa: { kind: 'kiln.asset-qa-report', schemaVersion: 2, disposition: 'warn', acceptance: 'accepted', dimensions: { visualQuality: { findings: [{ code: 'X_WARN', disposition: 'warn', message: 'Bad <b>thing</b>', affected: { node: 'Lid' } }, { code: 'Y_NOTE', disposition: 'observe', message: 'Fine.' }] }, runtimeCost: { findings: [], metrics: { triangles: 40 } } } },
  };
  const record = { revisionId: 'r_1', assetId: 'a_1', collection: 'project', glbSha256: 'f'.repeat(64), qaReport: { path: 'gallery-verified/qa/r_1.json', sha256: 'e'.repeat(64) }, findings: [{ code: 'X_WARN', subject: 'Lid', resolution: 'accepted', note: 'Kept <on purpose>.' }], views: { shots: 'default six-view sheet', backdrop: 'neutral', materialFaithful: true } };
  const page = reviewPage({
    generated: '2026-11-19T00:00:00.000Z',
    engine: { name: '@instruktlabs/kiln', version: '1.8.0', sourceCommit: '0123456789abcdef', sourceDirty: false },
    renderer: 'dawn-test:gpu at http://127.0.0.1:8000',
    candidates: [{ card: { name: 'Crate <script>alert(1)</script>', href: '/gallery/x/' }, served: { url: 'https://assets.example/x.glb', sha256: 'f'.repeat(64), bytes: 1234 }, record, proposed: { verdict: 'rejected', standing: 'fails the bar', reasons: ['FLUSH_FACES reports 1 pair'] }, evidence, viewFidelity: views.viewFidelity, png: sheet, source: 'mirror', recordFile: 'r_1.json' }],
  });
  expect(page).toContain(`src="data:image/png;base64,${Buffer.from(sheet).toString('base64')}"`);
  expect(page).not.toContain('<script>alert(1)</script>');
  expect(page).toContain('Crate &lt;script&gt;');
  expect(page).toContain('Bad &lt;b&gt;thing&lt;/b&gt;');
  expect(page).toContain('Kept &lt;on purpose&gt;.');
  expect(page).toContain('Lid and Box: 0.25 m');
  expect(page).toContain('12 of the 40 triangles in the GLB measured');
  expect(page).toContain('1 candidate: 0 likely to pass, 0 need the owner&rsquo;s judgment, 1 fails the bar');
  expect(page).toContain('1 informational note');
});

test('promoting decisions writes only records that meet the bar, with their QA reports', async () => {
  const card = cards.find((candidate) => candidate.href === '/gallery/holodeck/plaza-fountain/')!;
  const served = servedModel(card);
  const dir = join(scratch, 'promote');
  const data = join(scratch, 'promote-data');
  await mkdir(join(dir, 'data/gallery-verified/qa'), { recursive: true });
  await mkdir(data, { recursive: true });
  const evidence = (pairs: number) => ({ kind: 'kiln.gallery-verified-qa', version: 1, glbSha256: served.sha256, flushFaces: { pairs, truncated: false, unexaminedParts: 0 }, qa: { kind: 'kiln.asset-qa-report', schemaVersion: 2, dimensions: { exportIntegrity: { findings: [] } } } });
  const write = async (name: string, value: unknown) => {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    await writeFile(join(dir, 'data/gallery-verified/qa', name), bytes);
    return { path: `gallery-verified/qa/${name}`, sha256: sha256(bytes) };
  };
  const clean = pendingRecord({ card, served, evidence: evidence(0), qaReport: await write('clean.json', evidence(0)), views, proposed: { verdict: 'verified' }, date: '2026-11-18' });
  await writeFile(join(dir, 'pending.json'), JSON.stringify({ bar: 1, reviews: [clean] }));
  const empty = JSON.stringify({ description: 'records', bar: 1, reviews: [] });
  await writeFile(join(data, 'gallery-verified.json'), empty);
  await expect(promote(dir, { verified: ['/gallery/nothing/'], data, cards })).rejects.toThrow(/No pending record/);
  const chosen = await promote(dir, { verified: [card.href], date: '2026-11-19', data, cards });
  expect(chosen).toEqual([{ ...(({ status: _s, ...rest }) => rest)(clean), verdict: 'verified', date: '2026-11-19' }]);
  const written = JSON.parse(await readFile(join(data, 'gallery-verified.json'), 'utf8'));
  expect(written.description).toBe('records');
  expect(written.reviews).toEqual(chosen);
  expect(await readFile(join(data, clean.qaReport.path), 'utf8')).toBe(JSON.stringify(evidence(0)));
  // A record that does not meet the bar is never kept as verified, and nothing is written.
  const flushed = pendingRecord({ card, served, evidence: evidence(2), qaReport: await write('flushed.json', evidence(2)), views, proposed: { verdict: 'rejected' }, date: '2026-11-18' });
  flushed.flushFaces.pairs = 2;
  await writeFile(join(dir, 'pending.json'), JSON.stringify({ bar: 1, reviews: [flushed] }));
  await writeFile(join(data, 'gallery-verified.json'), empty);
  await expect(promote(dir, { verified: [card.revisionId], data, cards })).rejects.toThrow(/complete flush-face check with no pair/);
  expect(await readFile(join(data, 'gallery-verified.json'), 'utf8')).toBe(empty);
  expect((await promote(dir, { rejected: [card.revisionId], data, cards }))[0]).toMatchObject({ verdict: 'rejected' });
});
