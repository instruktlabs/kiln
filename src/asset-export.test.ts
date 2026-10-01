import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { exportAssetGlb } from './asset-export';
import type { AssetRecord } from './assets';
import { renderGLB } from './render';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { AnimationMixer, LoadingManager, LoopOnce } from 'three';

const sha = (bytes: Uint8Array) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
function glb(json: unknown, tail = new Uint8Array([4, 0, 0, 0, 0x42, 0x49, 0x4e, 0, 1, 2, 3, 4])) {
  const text = new TextEncoder().encode(JSON.stringify(json));
  const length = Math.ceil(text.length / 4) * 4;
  const bytes = new Uint8Array(20 + length + tail.length);
  const view = new DataView(bytes.buffer);
  [0x46546c67, 2, bytes.length, length, 0x4e4f534a].forEach((n, i) => {
    view.setUint32(i * 4, n, true);
  });
  bytes.fill(32, 20, 20 + length);
  bytes.set(text, 20);
  bytes.set(tail, 20 + length);
  return bytes;
}
function json(bytes: Uint8Array) {
  return JSON.parse(
    new TextDecoder().decode(
      bytes.subarray(20, 20 + new DataView(bytes.buffer, bytes.byteOffset).getUint32(12, true)),
    ),
  );
}
function record(bytes: Uint8Array): AssetRecord {
  return {
    manifest: {
      version: 'kiln.asset.v1',
      assetId: 'a_test',
      revisionId: 'r_test',
      name: 'Test',
      tags: [],
      createdAt: '2026-09-15T00:00:00.000Z',
      editable: false,
      files: { 'asset.glb': { bytes: bytes.length, sha256: sha(bytes) as `sha256:${string}` } },
    },
    files: { 'asset.glb': bytes },
  };
}
const review = { version: 1, clips: [{ name: 'Open', duration: 1, tracks: [] }] };
// Version 2 is the review copy of clips with a cubic track (R67).
const cubicReview = { version: 2, clips: [{ name: 'Open', duration: 1, tracks: [] }] };
const fixture = () =>
  record(
    glb({
      asset: { version: '2.0', extras: { application: 'keep' } },
      scenes: [
        { nodes: [0], extras: { kilnReviewClipsV1: review, custom: [1, 2] } },
        { extras: { kilnReviewClipsV1: cubicReview } },
      ],
      nodes: [{ name: 'Socket', extras: { kilnReviewClipsV1: 'not scene-owned', socket: true } }],
      animations: [{ name: 'Open', channels: [], samplers: [] }],
      buffers: [{ byteLength: 4 }],
    }),
  );

test('editable default preserves exact canonical bytes, including review metadata', async () => {
  const source = fixture();
  expect(await exportAssetGlb(source)).toEqual({
    profile: 'editable',
    glb: source.files['asset.glb']!,
  });
  expect(await exportAssetGlb(source, { profile: 'editable' })).toEqual(
    await exportAssetGlb(source),
  );
});

test('runtime externalizes only owned scene review data, preserving JSON semantics and binary bytes', async () => {
  const source = fixture();
  const before = source.files['asset.glb']!.slice();
  const output = await exportAssetGlb(source, {
    profile: 'runtime',
    metadataFileName: 'mech.kiln-metadata.json',
  });
  expect(output.profile).toBe('runtime');
  if (output.profile !== 'runtime') throw new Error('wrong profile');
  const meta = JSON.parse(new TextDecoder().decode(output.metadata.bytes));
  expect(meta).toEqual({
    version: 'kiln.runtime-metadata.v1',
    source: { assetId: 'a_test', revisionId: 'r_test', glbSha256: sha(before) },
    scenes: [
      { index: 0, kilnReviewClipsV1: review },
      { index: 1, kilnReviewClipsV1: cubicReview },
    ],
  });
  const actual = json(output.glb);
  expect(actual.asset.extras.kilnProvenanceV1).toEqual({
    version: 'kiln.provenance.v1',
    profile: 'runtime',
    metadata: { uri: 'mech.kiln-metadata.json', sha256: sha(output.metadata.bytes) },
  });
  delete actual.asset.extras.kilnProvenanceV1;
  const expected = json(before);
  for (const scene of expected.scenes) delete scene.extras.kilnReviewClipsV1;
  expect(actual).toEqual(expected);
  expect(output.glb.slice(-12)).toEqual(before.slice(-12));
  expect(source.files['asset.glb']).toEqual(before);
  expect(
    await exportAssetGlb(source, {
      profile: 'runtime',
      metadataFileName: 'mech.kiln-metadata.json',
    }),
  ).toEqual(output);
});

test('runtime handles assets without review clips and includes verified source hash without source or build paths', async () => {
  const source = record(glb({ asset: { version: '2.0' }, scenes: [{ extras: 'custom scalar' }] }));
  const code = new TextEncoder().encode('source deliberately stays in the editable bundle');
  source.files['source.kiln.js'] = code;
  source.manifest.editable = true;
  source.manifest.files['source.kiln.js'] = {
    bytes: code.length,
    sha256: sha(code) as `sha256:${string}`,
  };
  source.manifest.build = {
    engine: 'C:\\private\\engine',
    options: {},
    warnings: [],
    rebuild: 'engine-required',
  };
  const output = await exportAssetGlb(source, { profile: 'runtime' });
  if (output.profile !== 'runtime') throw new Error('wrong profile');
  const meta = JSON.parse(new TextDecoder().decode(output.metadata.bytes));
  expect(meta.scenes).toEqual([]);
  expect(meta.source.sourceSha256).toBe(sha(code));
  expect(new TextDecoder().decode(output.metadata.bytes)).not.toContain('private');
  expect(json(output.glb).scenes[0].extras).toBe('custom scalar');
});

test('runtime refuses collisions and repeat transformation instead of overwriting provenance', async () => {
  for (const extras of [{ kilnProvenanceV1: 'application-owned' }, 'scalar', null]) {
    await expect(
      exportAssetGlb(record(glb({ asset: { version: '2.0', extras } })), { profile: 'runtime' }),
    ).rejects.toThrow('extras');
  }
  const output = await exportAssetGlb(fixture(), { profile: 'runtime' });
  await expect(exportAssetGlb(record(output.glb), { profile: 'runtime' })).rejects.toThrow(
    'kilnProvenanceV1',
  );
  expect((await exportAssetGlb(record(output.glb))).glb).toEqual(output.glb);
});

test('runtime rejects unsafe sidecar names and unsupported owned metadata without mutation', async () => {
  for (const name of [
    '../meta.json',
    'C:\\secret.json',
    'https://example.com/a.json',
    '/meta.json',
    'a%2Fb.kiln-metadata.json',
    'a?b.kiln-metadata.json',
    'CON.kiln-metadata.json',
  ]) {
    await expect(
      exportAssetGlb(fixture(), { profile: 'runtime', metadataFileName: name }),
    ).rejects.toThrow('filename');
  }
  for (const value of [null, {}, { version: 3, clips: [] }, { version: 2, clips: 'bad' }]) {
    await expect(
      exportAssetGlb(
        record(
          glb({ asset: { version: '2.0' }, scenes: [{ extras: { kilnReviewClipsV1: value } }] }),
        ),
        { profile: 'runtime' },
      ),
    ).rejects.toThrow('kilnReviewClipsV1');
  }
});

test('runtime validates integrity and the entire chunk table before returning output', async () => {
  const source = fixture();
  source.manifest.files['asset.glb']!.sha256 = `sha256:${'0'.repeat(64)}`;
  await expect(exportAssetGlb(source, { profile: 'runtime' })).rejects.toThrow('integrity');
  for (const tail of [
    new Uint8Array([1]),
    new Uint8Array([8, 0, 0, 0, 0x42, 0x49, 0x4e, 0]),
    new Uint8Array([1, 0, 0, 0, 0x42, 0x49, 0x4e, 0, 1]),
  ]) {
    await expect(
      exportAssetGlb(record(glb({ asset: { version: '2.0' } }, tail)), { profile: 'runtime' }),
    ).rejects.toThrow('chunk');
  }
});

test('generated runtime GLB loads and plays native animation with no sidecar or network access', async () => {
  const rendered = await renderGLB(`
    const meta = { name: 'Export proof', category: 'prop' };
    function build() {
      const root = createRoot('Proof');
      const arm = createPivot('Arm', [0, 0.5, 0], root);
      createPart('Armor', boxGeo(0.2, 1, 0.2), gameMaterial(0x668899), { parent: arm, position: [0, 0.5, 0] });
      return root;
    }
    function animate() { return [createClip('swing', 1, [rotationTrack('Joint_Arm', [{time: 0, rotation: [0, 0, 0]}, {time: 1, rotation: [0, 0, 70]}])])]; }
  `);
  const output = await exportAssetGlb(record(rendered.glb), { profile: 'runtime' });
  const manager = new LoadingManager();
  manager.setURLModifier(() => {
    throw new Error('Unexpected external resource request');
  });
  const baseline = await new GLTFLoader(manager).parseAsync(
    Uint8Array.from(rendered.glb).buffer,
    '',
  );
  const runtime = await new GLTFLoader(manager).parseAsync(Uint8Array.from(output.glb).buffer, '');
  expect(runtime.animations.map((clip) => clip.name)).toEqual(['swing']);
  expect(runtime.animations[0]!.tracks.map((track) => track.name)).toEqual(
    baseline.animations[0]!.tracks.map((track) => track.name),
  );
  const mixers = [baseline, runtime].map((loaded) => {
    const mixer = new AnimationMixer(loaded.scene);
    const action = mixer.clipAction(loaded.animations[0]!);
    action.setLoop(LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
    return mixer;
  });
  for (const time of [0, 0.1, 0.5, 0.9, 1]) {
    for (const mixer of mixers) mixer.setTime(time);
    const before = baseline.scene.getObjectByName('Joint_Arm')!;
    const after = runtime.scene.getObjectByName('Joint_Arm')!;
    expect(after.quaternion.toArray()).toEqual(before.quaternion.toArray());
    if (time > 0) expect(Math.abs(after.quaternion.z)).toBeGreaterThan(0);
  }
});
