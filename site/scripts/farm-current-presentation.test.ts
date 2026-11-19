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
  // The flush-face fix child of the approved back-repair revision carries its parent's acceptance, dated when the owner approved the fix.
  expect(farmer.revisionId).toBe('r_be4c304cc47c42f3aba0bf6b24cc2a94');
  expect(farmer.parentRevision).toBe('r_70907c7fd97249ce807e9948613882cd');
  expect(farmer.review).toMatchObject({ ownerAccepted: true, status: 'accepted', recordedAt: '2026-11-13', scope: 'Flush-face fix of an approved revision; approved by the owner on 2026-11-13.' });
  expect(farmer.previousOwnerReview).toMatchObject({ ownerAccepted: true, status: 'accepted', recordedAt: '2026-10-01' });
  expect(farm.ownerReview.revisions.find(row => row.id === 'farmer')).toEqual({ id: 'farmer', revisionId: farmer.revisionId, ownerAccepted: true });
  expect(farm.assets.filter(asset => asset.id !== 'farmer').every(asset => asset.review.ownerAccepted)).toBe(true);
  expect(farm.ownerReview.revisions.filter(row => row.ownerAccepted)).toHaveLength(23);
  expect(farm.ownerReview.status).toBe('all-current-revisions-accepted');
  // Every asset is approved; the sealed package's own acceptance flag is a separate record and stays as sealed.
  expect(farm.deliveryReview).toMatchObject({ acceptedAssets: 23, fullPackAccepted: false });
  expect(farm.deliveryHistory.find(row => row.revision === 'r34')).toMatchObject({ fullPackAccepted: true, acceptedAssets: 23 });
});

test('the five flush-face fix children saved on 2026-11-19 carry their parents\' acceptance', () => {
  // Saved once their farm-production project records were restored; each child takes its approved parent's state,
  // dated when the owner signed the children off, and keeps the parent's review as the previous one.
  const children = {
    farmhouse: ['r_10b63bdd371e4a78ae90faf92a8568ed', 'r_01f97f5e943e4c2693b6db8596f3e353'],
    windmill: ['r_be71af41cdd34106b2a81e84e44a529f', 'r_ef9045311dd040258e0143345c171d6f'],
    watermill: ['r_437647e09af4431da99fb2dd0906288a', 'r_f8ab38b03b5a4fb691b860d9fb076200'],
    tractor: ['r_e89c34e3ad4e45d7abc75e779daae0cc', 'r_ebeeb57adda343dd98d575e97ca24f92'],
    trailer: ['r_50136ad30e7a43d688d32e1d1a60a9c8', 'r_c72e516ce16949cfbddedbc9155efa06'],
  };
  for (const [id, [revisionId, parentRevision]] of Object.entries(children)) {
    const asset = farm.assets.find(entry => entry.id === id)!;
    expect(asset.revisionId).toBe(revisionId);
    expect(asset.parentRevision).toBe(parentRevision);
    expect(asset.review).toMatchObject({ ownerAccepted: true, status: 'accepted', recordedAt: '2026-11-19', scope: 'Flush-face fix of an approved revision; approved by the owner on 2026-11-19.' });
    expect(asset.previousOwnerReview).toMatchObject({ ownerAccepted: true, status: 'accepted', recordedAt: '2026-09-29' });
    expect(farm.ownerReview.revisions.find(row => row.id === id)).toEqual({ id, revisionId, ownerAccepted: true });
    // The model is the child's own runtime file under the release that moved it; the review image is its saved preview.
    expect(asset.runtimeDownload.path).toBe(`packs/farm/delivery-20261119-01/models/${id}.glb`);
    expect(asset.reviewImage).toMatchObject({ inputPath: `media/farm/delivery-20261119-01/poster/${id}.png`, sourceRevisionId: revisionId, exactRevision: true });
  }
});
