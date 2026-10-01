import { describe, expect, test } from 'bun:test';
import farm from '../src/data/packs/farm.json';
import vehicles from '../src/data/packs/vehicles.json';
import foundryFloor from '../src/data/packs/foundry-floor.json';
import scenePacks from '../src/data/scene-packs.json';
import vehicleRuns from '../src/data/vehicle-runs.json';
import rigPosters from '../src/data/rig-posters.json';
import bridge from '../src/data/standalone/golden-gate-bridge.json';
import tiers from '../src/data/standalone/golden-gate-tiers.json';
import build from '../src/data/commons-build.json';
import manifest from '../src/data/mirror-manifest.json';
import { imageRecord, inspectGlb } from './generate-commons.mjs';
import { CORRECTED_REVISION_APPROVALS, vehicleReview } from './stage-vehicles.mjs';
import { VEHICLES } from './vehicles-spec.mjs';
import { buildGallery } from '../src/lib/gallery';

const repairedVehicleSlugs = ['hatchback', 'sedan', 'suv'];
const allVehicleSlugs = ['hatchback', 'sedan', 'suv', 'pickup', 'box-truck', 'transit-bus'];
const historicalHeavyPins = {
  pickup: { revisionId: 'r_b74ac56a93a44c7484890f712df9c64c', sha256: '3adba5410c857ae9e4ec9e2a6eb65428b928783746a7a34fd18679a4d29d83a4' },
  'box-truck': { revisionId: 'r_d5e37b6d4e7347ac863220cdbd8e49a4', sha256: 'bea417d293d5e2a32f99795bc2841ef845bd1a94ccc6f9d9e4691c050c5a0e94' },
  'transit-bus': { revisionId: 'r_6ab2ee53817449c59972502fcf008f1a', sha256: 'c55fbf069668774e0d3dc98db76c3efd05ff630f0ffd2b2cf475579336875617' },
};
// Each completed author window is pinned separately. Add later windows only from their sealed receipts.
const refinementRuns = [{
  slugs: repairedVehicleSlugs,
  stage: 'review-2',
  receiptSha256: '594736b61d05bd42ad60aca561428e554f00dadf8dfdfbe215b62e167540e9e8',
  invocationSha256: 'b966599658212da1455e1545b9fbc15e078768ef887da5d1ba169639db3e95fe',
  startedAt: '2026-10-01T01:20:41.060Z',
  endedAt: '2026-10-01T01:36:10.724Z',
  savedModelLabel: 'GPT-6',
}, {
  slugs: repairedVehicleSlugs,
  stage: 'review-2',
  receiptSha256: 'db903f08ce1bb407fa64adc1d2b65fc59b8a96d0ebffa26a899d0a9a8a4be932',
  invocationSha256: '4817e5c1611eb1d27fd694211b00c71cdf02adbb3b9ea4c6e9191cba11c97be7',
  startedAt: '2026-10-01T02:08:52.327Z',
  endedAt: '2026-10-01T02:49:04.999Z',
  savedModelLabel: 'gpt-6-astra',
}, {
  slugs: ['pickup', 'box-truck', 'transit-bus'],
  stage: 'review-2',
  receiptSha256: '44d5ce5810543c98f74046bd0698ae167cef7d7fcf9eebc61991a3cc14e32f55',
  invocationSha256: '8371748f40e8b208c65558d4fe2e4c44b48846e1bf380c2bd6fc65e51e2e8ffb',
  startedAt: '2026-10-01T02:51:04.975Z',
  endedAt: '2026-10-01T03:11:55.501Z',
  savedModelLabel: 'gpt-6-astra',
}, {
  slugs: repairedVehicleSlugs,
  stage: 'review-2',
  receiptSha256: '6d77d7bc8249d2f6e84ce7e5befe0d83f2932084d5bbcc0aaca017482a8bb45a',
  invocationSha256: 'd40a5dd01e5c05dd6ce6d24ee8f354043184ff42e6f3150c79432ce0e72539b6',
  startedAt: '2026-10-01T03:13:25.532Z',
  endedAt: '2026-10-01T03:29:28.744Z',
  savedModelLabel: 'gpt-6-astra',
}];

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
  test('selected r36 retains the accepted floor and all 23 approvals without inheriting r34 acceptance', () => {
    const house = farm.assets.find((asset) => asset.id === 'farmhouse');
    expect(farm.revision).toBe('r36-local-review');
    expect(house?.revisionId).toBe(farm.floorRevision.asset.revisionId);
    expect(house?.revisionId).not.toBe(farm.floorRevision.parentRevision);
    expect(house?.metrics.triangles).toBe(4080);
    expect(house?.review.ownerAccepted).toBe(true);
    expect(farm.floorRevision.ownerAccepted).toBe(true);
    expect(farm.ownerReview.acceptedAssets).toBe(23);
    expect(farm.deliveryReview.acceptedAssets).toBe(23);
    expect(farm.ownerApprovedAssets).toBe(23);
    expect(farm.fullPackAccepted).toBe(false);
    expect(farm.deliveryHistory.find((entry) => entry.revision === 'r34')?.fullPackAccepted).toBe(true);
    expect(farm.deliveryHistory.find((entry) => entry.revision === 'r34')?.acceptedAssets).toBe(23);
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
      const farmerReviewRefinement = ['r_654c203b0ed3438c93d19b6709bef9f6', 'r_70907c7fd97249ce807e9948613882cd'].includes(revision.revisionId);
      expect(revision.requestedEffort).toBe(farmerReviewRefinement ? 'ultra' : 'high');
      if (farmerReviewRefinement) expect(revision.confirmedEffort).toBeNull();
      if (revision.modelId !== 'gpt-6-astra') expect(revision.confirmedEffort).toBeNull();
      expect(revision.harnessVersion).toBeTruthy();
    }
  });
  test('Bridge requested effort is sourced without independent confirmation', () => {
    // Nine runs: three Astra (ultra requested, codex 0.157.1) and six Sonnet (max requested, claude 2.1.280).
    expect(bridge.provenance.requests.map((request) => request.stage)).toEqual(['first', 'review-1', 'review-2', 'fix-up-1', 'fix-review-1', 'fix-review-2', 'fix-review-3', 'fix-review-4', 'fix-review-5']);
    for (const request of bridge.provenance.requests) {
      const astra = request.requestedModel === 'gpt-6-astra';
      expect(request.requestedEffort).toBe(astra ? 'ultra' : 'max');
      expect(request.harness).toBe(astra ? 'codex' : 'claude');
      expect(request.harnessVersion).toBe(astra ? '0.157.1' : '2.1.280');
      expect(request.confirmedEffort).toBeNull();
      expect(request.source.receiptSha256).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(bridge.provenance.requests.filter((request) => request.requestedModel === 'claude-sonnet-5-5')).toHaveLength(6);
    // Review 4 stopped at its spending cap after saving only the web tier; every other run completed.
    expect(bridge.provenance.requests.filter((request) => request.status !== 'completed').map((request) => [request.stage, request.stop])).toEqual([['fix-review-4', 'error_max_budget_usd']]);
    expect(bridge.revisions.some((revision) => revision.request === 'fix-review-4')).toBe(false);
    expect(bridge.provenance.tierHistory.web.filter((revision) => revision.request === 'fix-review-4').map((revision) => revision.revisionId)).toEqual(['r_c81f6d5fb70c492fb2c1d57e2d482437']);
    expect(bridge.provenance.originalModel).toBe('GPT-6 Astra');
    expect(bridge.provenance.refinementModels).toEqual(['Claude Sonnet 5.5']);
    for (const revision of [...bridge.revisions, ...Object.values(bridge.provenance.tierHistory).flat()]) expect(revision.confirmedEffort).toBeNull();
  });
  test('Bridge delivers review 5 (full and web) and review 2 (far) as three tiers pinned to the accepted bytes', () => {
    expect(bridge.delivery).toBe(tiers.delivery);
    expect(bridge.delivery).toBe('review-5');
    expect(bridge.revisionId).toBe('r_76c7a4080e7844e185896b7e1b196e5a');
    expect(bridge.tiers.map((tier) => [tier.tier, tier.revisionId, tier.runtime.bytes, tier.metrics.triangles])).toEqual([
      ['full', 'r_76c7a4080e7844e185896b7e1b196e5a', 12_402_960, 311_826],
      ['web', 'r_de88c9d5481d4642837b9d00c81cf0a9', 3_508_476, 85_822],
      ['far', 'r_fcddc546fa134910b2221561353d97e2', 490_460, 11_480],
    ]);
    expect(bridge.provenance.tierHistory.web.at(-1)?.request).toBe('fix-review-5');
    expect(bridge.provenance.tierHistory.far.at(-1)?.request).toBe('fix-review-2');
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
  test('Bridge is owner approved (S-1, 30 September 2026) and its images are rig renders of the delivered revision', () => {
    expect(bridge.review.status).toBe('accepted');
    expect(bridge.review.ownerAccepted).toBe(true);
    expect(bridge.review.scope).toContain('the owner approved this delivery on 30 September 2026');
    // 2b-5: each tier's delivered review is stated, never "review N is the delivered revision of each tier".
    expect(bridge.review.scope).toContain('The full and web tiers are the review-5 revisions; the far tier is the review-2 revision, unchanged since.');
    expect(bridge.review.scope).not.toMatch(/delivered revision of each tier/);
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
    expect(vehicles.assets.map((asset) => asset.slug)).toEqual(allVehicleSlugs);
    expect(vehicles.release).toBe('r4-local-review');
    expect(vehicles.assetCount).toBe(6);
    expect(vehicles.license).toBe('CC0-1.0');
    // Scope qualifier and the dependencies statement travel with the licence (D-35): authored content only.
    expect(vehicles.licenseScope).toContain('authored asset content only');
    const pinned = (path: string) => manifest.files.find((file) => file.path === path);
    for (const asset of vehicles.assets) {
      expect(asset.pack).toBe('vehicles');
      // All six new saved masters author standard LOD, independently of the wheel-cull runtime derivative.
      expect(asset.runtimeDownload.form).toBe('MSFT_lod');
      expect(asset.editableDownload.glbForm).toBe('MSFT_lod');
      expect(asset.canonicalGlb.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(asset.canonicalGlb.bytes).toBeGreaterThan(0);
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
      expect(asset.poster.inputPath).toBe(`media/rig/review-neutral-v1/vehicles/${vehicles.release}/${asset.slug}.png`);
      expect(rigPosters.posters[`vehicles:${asset.slug}` as keyof typeof rigPosters.posters]).toMatchObject({ path: asset.poster.inputPath, revisionId: asset.revisionId, glb: { sha256: asset.runtimeDownload.sha256, bytes: asset.runtimeDownload.bytes } });
      expect(manifest.files.some((file) => file.path === asset.poster.inputPath)).toBe(true);
      // Review sheets keep their own fidelity evidence; the new sheets captured the exact saved artifact.
      expect('rig' in asset.reviewImage).toBe(false);
      expect(asset.reviewImage.fidelity).toMatchObject({ materialFaithful: true, exactArtifact: true });
      expect(asset.reviewImage.sourceRevisionId).toBe(asset.revisionId);
      expect(asset.reviewImage.fidelity).toMatchObject({ inputGlbSha256: `sha256:${asset.canonicalGlb.sha256}` });
    }
  });
  test('six new masters await review while their exact parent history retains its original approval scope', () => {
    expect(vehicles.ownerReview.acceptedAssets).toBe(0);
    expect(vehicles.ownerReview.total).toBe(6);
    const accepted = vehicles.assets.filter((asset) => asset.review.ownerAccepted).map((asset) => asset.slug);
    expect(accepted).toEqual([]);
    // The pack record is what the assets say, never typed separately.
    expect(vehicles.ownerReview.status).toBe('awaiting-owner-review');
    expect(vehicles.ownerReview.awaiting).toEqual(allVehicleSlugs);
    expect(vehicles.assets.filter((asset) => !asset.review.ownerAccepted).map((asset) => asset.slug)).toEqual(allVehicleSlugs);
    for (const asset of vehicles.assets) {
      expect(asset.review).toMatchObject({ status: 'awaiting-owner-review', ownerAccepted: false });
      expect(asset.revisionId).not.toBe(asset.parentRevision);
      const revisions = new Map(asset.revisions.map(revision => [revision.revisionId, revision]));
      expect(revisions.size).toBe(asset.revisions.length);
      expect(revisions.get(asset.revisionId)?.parentRevisionId).toBe(asset.parentRevision);
      const ancestry = new Set<string>();
      let revision = revisions.get(asset.revisionId);
      while (revision) {
        expect(ancestry.has(revision.revisionId)).toBe(false);
        ancestry.add(revision.revisionId);
        if (!revision.parentRevisionId) break;
        expect(revisions.has(revision.parentRevisionId)).toBe(true);
        revision = revisions.get(revision.parentRevisionId);
      }
      if (!repairedVehicleSlugs.includes(asset.slug)) {
        const pin = historicalHeavyPins[asset.slug as keyof typeof historicalHeavyPins];
        expect(pin).toBeDefined();
        expect(ancestry.has(pin.revisionId)).toBe(true);
        expect(asset.revisionId).not.toBe(pin.revisionId);
        expect(revisions.get(pin.revisionId)?.modelId).toBe('claude-sonnet-5-5');
        expect(manifest.files.find(file => file.path === `packs/vehicles/r2/models/${asset.slug}.glb`)?.sha256).toBe(pin.sha256);
      }
    }
    const bus = vehicles.assets.find((asset) => asset.slug === 'transit-bus')!;
    const approvedBus = historicalHeavyPins['transit-bus'].revisionId;
    expect(bus.review.status).toBe('awaiting-owner-review');
    expect(bus.revisions.find(revision => revision.revisionId === approvedBus)?.parentRevisionId).toBe('r_4dc2fb11b58b4dcd9f89197a8f7e28ff');
    // The September approval remains bound to the original r2 bus, never the new standard-LOD child.
    expect(Object.keys(CORRECTED_REVISION_APPROVALS)).toEqual([approvedBus]);
    expect(CORRECTED_REVISION_APPROVALS[bus.revisionId as keyof typeof CORRECTED_REVISION_APPROVALS]).toBeUndefined();
    const spec = VEHICLES.find((vehicle) => vehicle.slug === 'transit-bus')!;
    expect(vehicleReview(spec, { geometryUnchanged: true })).toMatchObject({ ownerAccepted: true, status: 'accepted' });
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
      expect(revision.confirmedEffort).toBeNull();
      if (revision.modelId === 'gpt-6-astra') {
        const run = refinementRuns.find(run => run.receiptSha256 === revision.run.receiptSha256);
        expect(run, `${asset.slug}/${revision.revisionId} must name a separately sealed author window`).toBeDefined();
        expect(run!.slugs).toContain(asset.slug);
        expect(revision).toMatchObject({ request: 'owner-review-2', requestedEffort: 'ultra', harness: 'codex', harnessVersion: '0.159.2', savedModelLabel: run!.savedModelLabel });
        expect(revision.run).toMatchObject({
          stage: run!.stage, status: 'completed', stop: 'success',
          receiptSha256: run!.receiptSha256, invocationSha256: run!.invocationSha256,
          startedAt: run!.startedAt, endedAt: run!.endedAt,
        });
        expect(Date.parse(revision.savedAt)).toBeGreaterThanOrEqual(Date.parse(revision.run.startedAt));
        expect(Date.parse(revision.savedAt)).toBeLessThanOrEqual(Date.parse(revision.run.endedAt));
        continue;
      }
      expect(revision).toMatchObject({ modelId: 'claude-sonnet-5-5', requestedEffort: 'max', harness: 'claude', harnessVersion: '2.1.280' });
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
  test('Foundry Floor pack lists the 62 models of FF3, all placed, each pinned to its GLB and the licence text', () => {
    expect(foundryFloor.assetCount).toBe(62);
    expect(foundryFloor.assets).toHaveLength(62);
    expect(foundryFloor.release).toBe('ff3-review2');
    expect(foundryFloor.status).toBe('in-production');
    expect(foundryFloor.placedInScene).toBe(62);
    expect(foundryFloor.assets.filter((asset) => asset.placedInScene)).toHaveLength(62);
    expect(foundryFloor.assets.filter((asset) => !asset.placedInScene)).toHaveLength(0);
    expect(Object.fromEntries(foundryFloor.groups.map(group => [group.id, foundryFloor.assets.filter(asset => asset.group === group.id).length]))).toEqual({ tools:12, transport:9, building:6, campus:12, vehicles:6, vegetation:8, freight:5, people:4 });
    expect(foundryFloor.assets.filter(asset => asset.reviewStatus === 'review-candidate')).toHaveLength(55);
    // The pack the catalog was staged from is the one the site serves.
    expect(foundryFloor.scenePack).toMatchObject({ release: scenePacks['foundry-floor'].release, packJsonSha256: scenePacks['foundry-floor'].packJsonSha256, sha256sumsSha256: scenePacks['foundry-floor'].sha256sumsSha256 });
    const pinned = (path: string) => manifest.files.find((file) => file.path === path);
    expect(pinned(foundryFloor.licence.path)).toMatchObject({ bytes: foundryFloor.licence.bytes, sha256: foundryFloor.licence.sha256 });
    expect(foundryFloor.licence.models).toBe(62);
    const slugs = new Set<string>();
    for (const asset of foundryFloor.assets) {
      slugs.add(asset.slug);
      expect(asset.pack).toBe('foundry-floor');
      expect(foundryFloor.groups.map((group) => group.id)).toContain(asset.group);
      expect(asset.revisionId).toMatch(/^r_[0-9a-f]{32}$/);
      expect(asset.author).toMatch(/^(Claude Sonnet 5\.5|Claude Opus 5\.5|GPT-6\.1 Sol|GPT-6 Astra|Codex) · /);
      if (asset.group === 'vehicles') expect(asset.author).toBe('GPT-6 Astra · codex 0.159.2');
      expect(asset.author).not.toMatch(/sonnet-ff-|codex-ff-/);
      expect(pinned(asset.runtimeDownload.path)).toMatchObject({ bytes: asset.runtimeDownload.bytes, sha256: asset.runtimeDownload.sha256 });
      expect(asset.runtimeDownload.path).toBe(`packs/foundry-floor/${foundryFloor.release}/models/${asset.slug}.glb`);
      expect(asset.licence).toMatchObject({ path: foundryFloor.licence.path, sha256: foundryFloor.licence.sha256, spdx: 'CC0-1.0', statesGlbSha256: asset.runtimeDownload.sha256 });
      // Default draw excludes off-scene standard LOD tiers; every delivered tier still contributes to the all-tiers measurement.
      const metrics = asset.metrics;
      expect(metrics.trianglesAllTiers).toBe(metrics.trianglesDetailed + metrics.trianglesLod1 + metrics.trianglesHidden);
      expect(metrics.triangles).toBe(metrics.trianglesDetailed + metrics.trianglesHidden + (asset.lod?.form === 'MSFT_lod' ? 0 : metrics.trianglesLod1));
      expect(metrics.bounds.every((size) => size > 0)).toBe(true);
      expect(asset.lod === null).toBe(metrics.trianglesLod1 === 0);
      // A rig render of the exact revision, pinned.
      expect(asset.poster?.rig).toBe('review-neutral-v1');
      expect(asset.poster?.sourceRevisionId).toBe(asset.revisionId);
      const poster = rigPosters.posters[`foundry-floor:${asset.slug}`];
      expect(asset.poster?.inputPath).toBe(poster.path);
      expect(poster.glb.sha256).toBe(asset.runtimeDownload.sha256);
      expect(poster.revisionId).toBe(asset.revisionId);
      expect(manifest.files.some((file) => file.path === asset.poster?.inputPath)).toBe(true);
    }
    expect(slugs.size).toBe(62);
    // Migrated interiors and accepted campus models expose43 optional standard LOD sets.
    expect(foundryFloor.assets.filter((asset) => asset.metrics.trianglesLod1 > 0)).toHaveLength(43);
    expect(foundryFloor.conventions.lod).toContain('43 models declare optional MSFT_lod');
    // One full models archive with62 GLBs, all licence texts, sealed asset metadata, replacement lineage and delivery inventory.
    const [archive] = foundryFloor.downloads;
    expect(foundryFloor.downloads).toHaveLength(1);
    expect(archive).toMatchObject({ profile: 'models', assets: 62, files: 73, bytes: 10_908_158, sha256: 'ca18282aee9361082a229e2d625aaaab4ebf2d262b7485dc22efa35ea913b547' });
    expect(pinned(archive!.path)).toMatchObject({ bytes: archive!.bytes, sha256: archive!.sha256 });
    expect(build.archives).toContain(archive!.path);
  });
  test('all 62 Foundry models appear in the gallery and shared vehicles retain one exact identity', () => {
    const gallery = buildGallery(true);
    const foundryCards = gallery.filter((card) => card.packs.includes('foundry-floor'));
    expect(foundryCards).toHaveLength(62);
    for (const asset of foundryFloor.assets) {
      const matches = foundryCards.filter((card) => card.slug === asset.slug);
      expect(matches).toHaveLength(1);
      expect(matches[0]).toMatchObject({ revisionId: asset.revisionId, runtimeDownload: { sha256: asset.runtimeDownload.sha256 } });
    }
    for (const asset of foundryFloor.assets.filter(asset => asset.group === 'vehicles')) {
      const reusable = vehicles.assets.find(vehicle => vehicle.slug === asset.slug);
      expect(reusable?.runtimeDownload.sha256).toBe(asset.runtimeDownload.sha256);
      expect(reusable?.revisionId).toBe(asset.revisionId);
      expect(gallery.filter((card) => card.slug === asset.slug)).toHaveLength(1);
    }
    const text = JSON.stringify(foundryFloor);
    expect(text).not.toMatch(/\b(Tesla|SpaceX|xAI|Intel|ASML|Terafab)\b/);
  });
  test('Every pack licence is CC0-1.0 with the Farm scope qualifier; the transit bus reads like the other five', () => {
    // D-35: the Farm's qualifier is the reference; the vehicles and the Foundry Floor carry the same scope sentence.
    const scope = 'authored asset content only, to the extent of the owner’s rights';
    for (const pack of [farm, vehicles, foundryFloor]) {
      expect(pack.license).toBe('CC0-1.0');
      expect(pack.licenseScope).toContain(`CC0-1.0 covers ${scope}.`);
    }
    for (const asset of [...vehicles.assets, ...foundryFloor.assets]) {
      expect(asset.license).toBe('CC0-1.0');
      expect(asset.licence.spdx).toBe('CC0-1.0');
    }
    // The original bus correction approval remains historical; the final saved child awaits its own review.
    const bus = vehicles.assets.find((asset) => asset.slug === 'transit-bus')!;
    const busSpec = VEHICLES.find(vehicle => vehicle.slug === 'transit-bus')!;
    expect(vehicleReview(busSpec, { geometryUnchanged: true }).scope).toBe('The owner approved all six vehicles at every tier on 29 September 2026. The transit bus was then found to be see-through from behind, and this revision (review 2) corrects that. Its triangle counts, body bounds and wheels equal the first revision’s at every tier. The owner approved the corrected revision on 30 September 2026.');
    expect(bus.review.scope).toContain('acceptance of this revision is pending');
    expect(vehicles.ownerReview.status).toBe('awaiting-owner-review');
    expect(vehicles.ownerReview.awaiting).toEqual(allVehicleSlugs);
    for (const asset of vehicles.assets) {
      expect(Object.keys(asset.licence).sort()).toEqual(['bytes', 'path', 'sha256', 'spdx', 'statesDeliveredGlbSha256', 'url']);
      expect(asset.licence.path).toBe(`packs/vehicles/${vehicles.release}/licenses/${asset.slug}.ASSET-LICENSE.txt`);
      expect(asset.review).toMatchObject({ status: 'awaiting-owner-review', ownerAccepted: false });
    }
  });
  test('generates only non-upscaled srcset entries', () => {
    const image = imageRecord('media/image.webp', 508, 384);
    expect(image.srcsetWebp).toBe('/media/image-320.webp 320w, /media/image-480.webp 480w');
    expect(image.srcsetAvif).toBe('/media/image-320.avif 320w, /media/image-480.avif 480w');
  });
});
