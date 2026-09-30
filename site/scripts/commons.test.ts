import { describe, expect, test } from 'bun:test';
import farm from '../src/data/packs/farm.json';
import vehicles from '../src/data/packs/vehicles.json';
import vehicleRuns from '../src/data/vehicle-runs.json';
import rigPosters from '../src/data/rig-posters.json';
import bridge from '../src/data/standalone/golden-gate-bridge.json';
import tiers from '../src/data/standalone/golden-gate-tiers.json';
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
    // The poster is rendered under the review rig from the accepted child's own sealed GLB (rig-posters.json).
    expect(house?.poster.sourceRevisionId).toBe(house?.revisionId);
    expect(house?.poster.exactRevision).toBe(true);
    expect(house?.poster.rig).toBe('review-neutral-v1');
    expect(house?.reviewImage.sourceRevisionId).toBe(house?.revisionId);
    expect(farm.qualification.performanceQualified).toBe(false);
  });
  test('pins all 30 model/source identities and every generated image input', () => {
    const assets = [...farm.assets, ...vehicles.assets, bridge];
    expect(new Set(assets.map((asset) => asset.slug)).size).toBe(30);
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
    // Seven runs: three Astra (ultra requested, codex 0.157.1) and four Sonnet (max requested, claude 2.1.280).
    expect(bridge.provenance.requests.map((request) => request.stage)).toEqual(['first', 'review-1', 'review-2', 'fix-up-1', 'fix-review-1', 'fix-review-2', 'fix-review-3']);
    for (const request of bridge.provenance.requests) {
      const astra = request.requestedModel === 'gpt-6-astra';
      expect(request.requestedEffort).toBe(astra ? 'ultra' : 'max');
      expect(request.harness).toBe(astra ? 'codex' : 'claude');
      expect(request.harnessVersion).toBe(astra ? '0.157.1' : '2.1.280');
      expect(request.confirmedEffort).toBeNull();
      expect(request.source.receiptSha256).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(bridge.provenance.requests.filter((request) => request.requestedModel === 'claude-sonnet-5-5')).toHaveLength(4);
    expect(bridge.provenance.originalModel).toBe('GPT-6 Astra');
    expect(bridge.provenance.refinementModels).toEqual(['Claude Sonnet 5.5']);
    for (const revision of [...bridge.revisions, ...Object.values(bridge.provenance.tierHistory).flat()]) expect(revision.confirmedEffort).toBeNull();
  });
  test('Bridge delivers review 3 as three tiers pinned to the accepted bytes', () => {
    expect(bridge.delivery).toBe(tiers.delivery);
    expect(bridge.revisionId).toBe('r_0d1532b4a00b4663909f8edf2bd290aa');
    expect(bridge.revisions.at(-1)?.revisionId).toBe(bridge.revisionId);
    expect(bridge.tiers.map((tier) => tier.tier)).toEqual(['full', 'web', 'far']);
    const pinned = (path: string) => manifest.files.find((file) => file.path === path);
    for (const tier of bridge.tiers) {
      const accepted = tiers.tiers.find((entry) => entry.tier === tier.tier);
      expect(accepted).toBeDefined();
      expect(tier.revisionId).toBe(accepted?.revision);
      expect(tier.parentRevision).toBe(accepted?.parent);
      expect(tier.metrics.triangles).toBe(accepted?.glb.triangles);
      expect(tier.runtime.bytes).toBe(accepted?.glb.bytes);
      expect(tier.runtime.sha256).toBe(accepted?.glb.sha256);
      expect(pinned(tier.runtime.path)).toMatchObject({ bytes: accepted?.glb.bytes, sha256: accepted?.glb.sha256 });
      expect(pinned(tier.editable.path)).toMatchObject({ bytes: tier.editable.bytes, sha256: tier.editable.sha256 });
      expect(tier.runtime.url).toBe(`https://assets.kilnstudio.tools/${tier.runtime.path}`);
    }
    // The page's headline downloads are the full tier, and the build serves only that tier's GLB from the site.
    expect(bridge.runtimeDownload.sha256).toBe(bridge.tiers[0].runtime.sha256);
    expect(build.models.filter((model) => 'path' in model && String(model.path).includes('golden-gate'))).toHaveLength(1);
    expect(JSON.stringify(build)).not.toContain('golden-gate-web');
    expect(JSON.stringify(build)).not.toContain('golden-gate-far');
    expect(bridge.licence.sha256).toBe(tiers.licence.sha256);
    expect(pinned(bridge.licence.path)).toMatchObject({ bytes: tiers.licence.bytes, sha256: tiers.licence.sha256 });
    // No old revision's file remains pinned beside the new delivery.
    const revisions = new Set(manifest.files.map((file) => /^standalone\/golden-gate-bridge\/(r_[0-9a-f]+)\//.exec(file.path)?.[1]).filter(Boolean));
    expect([...revisions]).toEqual([bridge.revisionId]);
  });
  test('Bridge is awaiting owner review and its images are rig renders of the delivered revision', () => {
    expect(bridge.review.status).toBe('awaiting-owner-review');
    expect(bridge.review.ownerAccepted).toBe(false);
    expect(bridge.poster.rig).toBe('review-neutral-v1');
    expect(bridge.poster.sourceRevisionId).toBe(bridge.revisionId);
    expect(bridge.poster.exactRevision).toBe(true);
    expect(bridge.captures).toHaveLength(4);
    for (const capture of bridge.captures) expect(capture.rig).toBe('review-neutral-v1');
    // The saved six-view sheet is the revision's own preview, not a rig render.
    expect(bridge.reviewImage.inputPath.endsWith('captures/review-sheet-neutral.png')).toBe(true);
    expect('rig' in bridge.reviewImage).toBe(false);
  });
  test('Vehicles pack lists six vehicles pinned to the delivered GLBs, licence texts and archives', () => {
    expect(vehicles.assets.map((asset) => asset.slug)).toEqual(['hatchback', 'sedan', 'suv', 'pickup', 'box-truck', 'transit-bus']);
    expect(vehicles.assetCount).toBe(6);
    expect(vehicles.license).toBe('CC0-1.0');
    // Scope qualifier and the dependencies statement travel with the licence (D-35): authored content only.
    expect(vehicles.licenseScope).toContain('authored asset content only');
    const pinned = (path: string) => manifest.files.find((file) => file.path === path);
    for (const asset of vehicles.assets) {
      expect(asset.pack).toBe('vehicles');
      // Delivered form: tiers linked with MSFT_lod; the editable archive keeps the author's named groups.
      expect(asset.runtimeDownload.form).toBe('MSFT_lod');
      expect(asset.editableDownload.glbForm).toBe('named-groups');
      expect(pinned(asset.runtimeDownload.path)).toMatchObject({ bytes: asset.runtimeDownload.bytes, sha256: asset.runtimeDownload.sha256 });
      expect(pinned(asset.editableDownload.path)).toMatchObject({ bytes: asset.editableDownload.bytes, sha256: asset.editableDownload.sha256 });
      expect(pinned(asset.licence.path)).toMatchObject({ bytes: asset.licence.bytes, sha256: asset.licence.sha256 });
      expect(asset.licence.statesDeliveredGlbSha256).toBe(asset.runtimeDownload.sha256);
      expect(asset.licence.spdx).toBe('CC0-1.0');
      // The site serves the GLB itself, so the plan and the catalog agree on its bytes.
      expect(build.models.find((model) => `/${model.output}` === asset.modelPath)?.sha256).toBe(asset.runtimeDownload.sha256);
      expect(asset.tiers.map((tier) => tier.tier)).toEqual(['LOD0', 'LOD1', 'LOD2']);
      // Each tier fits its brief's body budget and gets simpler; the wheels are drawn only where LOD2 has not started.
      for (const tier of asset.tiers) expect(tier.bodyTriangles).toBeLessThanOrEqual(tier.budget);
      expect(asset.tiers[0]!.bodyTriangles).toBeGreaterThan(asset.tiers[1]!.bodyTriangles);
      expect(asset.tiers[1]!.bodyTriangles).toBeGreaterThan(asset.tiers[2]!.bodyTriangles);
      expect(asset.tiers.map((tier) => tier.wheelsShown)).toEqual([true, true, false]);
      // The headline triangle count is what a loader without MSFT_lod draws: LOD0 and the wheels.
      expect(asset.metrics.triangles).toBe(asset.tiers[0]!.triangles);
      expect(asset.tierLinks.wheelsHiddenAtLastTier).toBe(true);
    }
    // One runtime archive, pinned, with the six GLBs, six licence texts and the delivery inventory.
    const [archive] = vehicles.downloads;
    expect(archive?.assets).toBe(6);
    expect(archive?.files).toBe(13);
    expect(pinned(archive!.path)).toMatchObject({ bytes: archive!.bytes, sha256: archive!.sha256 });
    expect(build.archives).toContain(archive!.path);
  });
  test('Vehicles posters are rig renders of each delivered revision; no unpinned poster remains', () => {
    for (const asset of vehicles.assets) {
      expect(asset.poster.rig).toBe('review-neutral-v1');
      expect(asset.poster.sourceRevisionId).toBe(asset.revisionId);
      expect(asset.poster.exactRevision).toBe(true);
      expect(asset.poster.inputPath).toBe(`media/rig/review-neutral-v1/vehicles/r1/${asset.slug}.png`);
      expect(rigPosters.posters[`vehicles:${asset.slug}` as keyof typeof rigPosters.posters]).toMatchObject({ path: asset.poster.inputPath, revisionId: asset.revisionId });
      expect(manifest.files.some((file) => file.path === asset.poster.inputPath)).toBe(true);
      // The saved six-view sheet is the revision's own source evaluation, not a rig render.
      expect('rig' in asset.reviewImage).toBe(false);
      expect(asset.reviewImage.fidelity.exactArtifact).toBe(false);
    }
  });
  test('Vehicles review status keeps the corrected bus separate from the five approved vehicles', () => {
    expect(vehicles.ownerReview.acceptedAssets).toBe(5);
    expect(vehicles.ownerReview.total).toBe(6);
    const accepted = vehicles.assets.filter((asset) => asset.review.ownerAccepted).map((asset) => asset.slug);
    expect(accepted).toEqual(['hatchback', 'sedan', 'suv', 'pickup', 'box-truck']);
    const bus = vehicles.assets.find((asset) => asset.slug === 'transit-bus')!;
    expect(bus.review.status).toBe('awaiting-owner-review');
    expect(bus.review.correction).toContain('see-through');
    expect(bus.revisions).toHaveLength(2);
    expect(bus.parentRevision).toBe(bus.revisions[0]!.revisionId);
    expect(bus.revisionId).toBe(bus.revisions[1]!.revisionId);
  });
  test('Vehicles requested effort stays distinct from independent confirmation', () => {
    for (const run of vehicleRuns) {
      expect(run.requestedModel).toBe('claude-sonnet-5-5');
      expect(run.requestedEffort).toBe('max');
      expect(run.harness).toBe('claude');
      expect(run.harnessVersion).toBe('2.1.280');
      expect(run.confirmedEffort).toBeNull();
      expect(run.source.receiptSha256).toMatch(/^[0-9a-f]{64}$/);
    }
    for (const asset of vehicles.assets) for (const revision of asset.revisions) {
      expect(revision.requestedEffort).toBe('max');
      expect(revision.confirmedEffort).toBeNull();
      expect(revision.harnessVersion).toBe('2.1.280');
      // The revision names the run that saved it, and that run's receipt hash is the one the run record holds.
      const saved = vehicleRuns.find((run) => run.source.receiptSha256 === revision.run.receiptSha256);
      expect(saved?.stage).toBe(revision.request);
      expect(saved?.status).toBe(revision.run.status);
      expect(saved?.source.invocationSha256).toBe(revision.run.invocationSha256);
    }
    // The second author's first run stopped at its spending limit after saving the pickup, the box truck and the bus.
    const failed = vehicleRuns.filter((run) => run.status === 'failed');
    expect(failed.map((run) => run.stop)).toEqual(['error_max_budget_usd']);
    expect(vehicleRuns).toHaveLength(3);
  });
  test('generates only non-upscaled srcset entries', () => {
    const image = imageRecord('media/image.webp', 508, 384);
    expect(image.srcsetWebp).toBe('/media/image-320.webp 320w, /media/image-480.webp 480w');
    expect(image.srcsetAvif).toBe('/media/image-320.avif 320w, /media/image-480.avif 480w');
  });
});
