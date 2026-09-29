import { describe, expect, test } from 'bun:test';
import farm from '../src/data/packs/farm.json';
import bridge from '../src/data/standalone/golden-gate-bridge.json';
import build from '../src/data/commons-build.json';
import manifest from '../src/data/mirror-manifest.json';
import { imageRecord, inspectGlb } from './generate-commons.mjs';

function glb(json: object) {
  const encoded = Buffer.from(JSON.stringify(json));
  const padding = (4 - (encoded.length % 4)) % 4;
  const bytes = Buffer.alloc(20 + encoded.length + padding, 0x20);
  bytes.write('glTF'); bytes.writeUInt32LE(2, 4); bytes.writeUInt32LE(bytes.length, 8);
  bytes.writeUInt32LE(encoded.length + padding, 12); bytes.writeUInt32LE(0x4e4f534a, 16);
  encoded.copy(bytes, 20);
  return bytes;
}

describe('Commons catalog bindings', () => {
  test('measures placed meshes through parent transforms and retains every runtime clip', () => {
    const data = glb({ scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: 'root', translation: [10, 0, 0], children: [1, 2] }, { name: 'first', mesh: 0, translation: [0, 1, 0] }, { name: 'second', mesh: 0, translation: [5, 0, 0], scale: [2, 2, 2] }], meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }], accessors: [{ min: [0, 0, 0], max: [1, 1, 1], count: 3 }, { count: 3 }], materials: [{}], animations: [{ name: 'Open' }, { name: 'ArticulationProbe' }] });
    const result = inspectGlb(data);
    expect(result.bounds).toEqual([7, 2, 2]);
    expect(result.boundsMin).toEqual([10, 0, 0]);
    expect(result.meshes).toBe(2);
    expect(result.triangles).toBe(2);
    expect(result.clips).toEqual(['Open', 'ArticulationProbe']);
    expect(result.partPaths).toEqual(['root/first', 'root/second']);
  });
  test('selected r34 delivers the accepted floor and preserves historical r33 facts', () => {
    const house = farm.assets.find((asset) => asset.id === 'farmhouse');
    expect(farm.revision).toBe('r34');
    expect(house?.revisionId).toBe(farm.floorRevision.asset.revisionId);
    expect(house?.revisionId).not.toBe(farm.floorRevision.parentRevision);
    expect(house?.metrics.triangles).toBe(4080);
    expect(house?.review.ownerAccepted).toBe(true);
    expect(farm.floorRevision.ownerAccepted).toBe(true);
    expect(farm.ownerReview.acceptedAssets).toBe(23);
    expect(farm.deliveryReview.acceptedAssets).toBe(23);
    expect(farm.ownerApprovedAssets).toBe(23);
    expect(farm.fullPackAccepted).toBe(true);
    expect(farm.deliveryHistory.find((entry) => entry.revision === 'r33')?.fullPackAccepted).toBe(false);
    expect(farm.deliveryHistory.find((entry) => entry.revision === 'r33')?.acceptedAssets).toBe(22);
    expect(house?.poster.sourceRevisionId).toBe(farm.floorRevision.parentRevision);
    expect(house?.poster.exactRevision).toBe(false);
    expect(house?.reviewImage.sourceRevisionId).toBe(house?.revisionId);
    expect(farm.qualification.performanceQualified).toBe(false);
  });
  test('pins all 24 model/source identities and every generated image input', () => {
    const assets = [...farm.assets, bridge];
    expect(new Set(assets.map((asset) => asset.slug)).size).toBe(24);
    for (const asset of assets) {
      const model = build.models.find((model) => `/${model.output}` === asset.modelPath);
      expect(model?.sha256).toBe(asset.runtimeDownload.sha256);
      expect(build.sources.find((source) => `/${source.output}` === asset.sourcePath)?.sha256).toBe(asset.sourceSha256);
      expect(asset.metrics.bounds.every((value) => value > 0)).toBe(true);
      if (asset.id === 'tractor' || asset.id === 'cow') expect(asset.metrics.clips).toContain('ArticulationProbe');
    }
    for (const image of build.images) expect(manifest.files.some((file) => file.path === image.inputPath)).toBe(true);
  });
  test('keeps requested effort distinct from independent confirmation', () => {
    for (const asset of farm.assets) for (const revision of asset.revisions) {
      expect(revision.requestedEffort).toBe('high');
      if (revision.modelId !== 'gpt-6-astra') expect(revision.confirmedEffort).toBeNull();
      expect(revision.harnessVersion).toBeTruthy();
    }
  });
  test('Bridge requested effort is sourced without independent confirmation', () => {
    expect(bridge.provenance.requests).toHaveLength(2);
    for (const request of bridge.provenance.requests) {
      expect(request.requestedEffort).toBe('ultra');
      expect(request.harnessVersion).toBe('0.157.1');
      expect(request.confirmedEffort).toBeNull();
    }
    expect(bridge.revisionId).toBe('r_9f4b0e76ea634be083de8a5e38c4e838');
  });
  test('generates only non-upscaled srcset entries', () => {
    const image = imageRecord('media/image.webp', 508, 384);
    expect(image.srcsetWebp).toBe('/media/image-320.webp 320w, /media/image-480.webp 480w');
    expect(image.srcsetAvif).toBe('/media/image-320.avif 320w, /media/image-480.avif 480w');
  });
});
