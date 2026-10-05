import { expect, test } from 'bun:test';
import { assetPreview, bridge, farm, vehicles } from '../src/lib/catalog';

test('Bridge preview uses its web tier while full runtime remains available', () => {
  const web = bridge.tiers.find(tier => tier.tier === 'web')!;
  expect(assetPreview(bridge)).toEqual({ url: web.runtime.url, revisionId: web.revisionId, tier: 'web' });
  expect(bridge.runtimeDownload.bytes).toBeGreaterThan(web.runtime.bytes);
});

test('Farm and Vehicles retain their declared model and revision for previews', () => {
  for (const asset of [farm.assets[0]!, vehicles.assets[0]!]) {
    expect(assetPreview(asset)).toEqual({ url: asset.modelPath, revisionId: asset.revisionId, tier: null });
  }
});
