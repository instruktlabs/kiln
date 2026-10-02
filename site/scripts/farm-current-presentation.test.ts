import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import farm from '../src/data/packs/farm.json';

test('current Farm pack instructions describe the review camera and download', async () => {
  const page = await readFile(new URL('../src/pages/packs/[slug].astro', import.meta.url), 'utf8');
  expect(page).toMatch(/walk in third person/i);
  expect(page).toMatch(/drag to look/i);
  expect(page).toContain('Escape');
  expect(page).toMatch(/download is an earlier build, which walks in\s+first\s+person/);
  expect(page).not.toMatch(/click.*capture|fixed eye height|mobile walking or\s+driving are not included|0\.186\.1/);
  expect(page).not.toContain('High effort was requested throughout');
  expect(page).toContain('node scene/serve.mjs --verify');
});

test('farmer child is owner accepted alongside the 22 retained approvals', () => {
  const farmer = farm.assets.find(asset => asset.id === 'farmer')!;
  expect(farm.revision).toBe('r36-local-review');
  expect(farmer.revisionId).toBe('r_70907c7fd97249ce807e9948613882cd');
  expect(farmer.parentRevision).toBe('r_654c203b0ed3438c93d19b6709bef9f6');
  expect(farmer.review).toMatchObject({ ownerAccepted: true, status: 'accepted', recordedAt: '2026-10-01' });
  expect(farmer.previousOwnerReview.ownerAccepted).toBe(true);
  expect(farm.assets.filter(asset => asset.id !== 'farmer').every(asset => asset.review.ownerAccepted)).toBe(true);
  expect(farm.ownerReview.revisions.filter(row => row.ownerAccepted)).toHaveLength(23);
  expect(farm.ownerReview.status).toBe('all-current-revisions-accepted');
  // Every asset is approved; the sealed package's own acceptance flag is a separate record and stays as sealed.
  expect(farm.deliveryReview).toMatchObject({ acceptedAssets: 23, fullPackAccepted: false });
  expect(farm.deliveryHistory.find(row => row.revision === 'r34')).toMatchObject({ fullPackAccepted: true, acceptedAssets: 23 });
});
