import { describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { BRIDGE_CAPTURES, bridgeCaptureFile, bridgeCaptureKey, bridgeCapturePath, bridgeRevisionDir } from './bridge-captures.mjs';
import { buildBridgeFixture, fixtureGlb, pngBytes, save, saveJson } from './bridge-test-fixtures';
import { generateCommons } from './generate-commons.mjs';
import { applyRigBridge } from './rig-posters-core.mjs';
import { stageBridgeRevision } from './stage-bridge-revision.mjs';

/** A staged fixture delivery: the mirror directory, the manifest of its files and the data folder the update reads. */
async function stagedFixture(root: string) {
  const fixture = await buildBridgeFixture(root);
  const mirror = join(root, 'mirror');
  const manifest = join(root, 'manifest.json');
  const png = await pngBytes('#aab1bc', 4);
  for (const capture of BRIDGE_CAPTURES) await save(join(mirror, bridgeRevisionDir('r_full'), 'captures', bridgeCaptureFile(capture.name)), png);
  await stageBridgeRevision({ outputs: fixture.outputs, library: fixture.library, mirror, manifestOut: manifest, data: fixture.data, log: () => {} });
  const inputs = join(root, 'inputs');
  await save(join(inputs, 'golden-gate/REFERENCE.md'), '## Published dimensions adopted\n| Quantity | Published | Model metres | Source |\n|---|---|---|---|\n| Span | 1 m | 1 | fixture |\n## Estimates\n');
  // The update starts from the current catalog: a Farm file and the plan and pins it replaces the bridge in.
  await saveJson(join(fixture.data, 'packs/farm.json'), { revision: 'r34', assets: [] });
  await saveJson(join(fixture.data, 'commons-build.json'), { schemaVersion: 1, images: [], archives: [], sources: [], models: [] });
  await saveJson(join(fixture.data, 'mirror-manifest.json'), { base: 'https://assets.kilnstudio.tools/', files: [] });
  return { ...fixture, mirror, manifest, inputs, root };
}

async function withStaged(run: (staged: Awaited<ReturnType<typeof stagedFixture>>) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'kiln-bridge-tiers-'));
  try {
    await run(await stagedFixture(root));
  } finally {
    const target = resolve(root);
    if (!target.startsWith(resolve(tmpdir())) || !target.includes('kiln-bridge-tiers-')) throw new Error('Unsafe test cleanup path');
    await rm(target, { recursive: true, force: true });
  }
}

const update = (staged: Awaited<ReturnType<typeof stagedFixture>>) => generateCommons({ inputs: staged.inputs, mirror: staged.mirror, manifest: staged.manifest, bridgeRevision: 'r_full', onlyBridge: true, out: staged.data });

describe('a bridge update with three tiers', () => {
  test('lists every tier measured from its own GLB and pinned to the accepted bytes', async () => {
    await withStaged(async (staged) => {
      const { bridge } = await update(staged);
      expect(bridge.tiers.map((tier: { tier: string }) => tier.tier)).toEqual(['full', 'web', 'far']);
      for (const tier of bridge.tiers) {
        const pin = staged.tiers.tiers.find((entry: { tier: string }) => entry.tier === tier.tier);
        expect(tier.runtime.sha256).toBe(pin.glb.sha256);
        expect(tier.runtime.bytes).toBe(pin.glb.bytes);
        expect(tier.runtime.url).toBe(`https://assets.kilnstudio.tools/${tier.runtime.path}`);
        expect(tier.metrics.triangles).toBe(1);
        expect(tier.revisionId).toBe(pin.revision);
        expect(tier.parentRevision).toBe(pin.parent);
        expect(tier.licensed).toEqual({ revisionId: pin.licensed.revision, parentRevision: pin.licensed.parent });
        expect(tier.editable.path.endsWith(tier.tier === 'full' ? 'golden-gate-editable.zip' : `golden-gate-${tier.tier}-editable.zip`)).toBe(true);
        expect(tier.editable.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
      }
      expect(bridge.runtimeDownload.sha256).toBe(bridge.tiers[0].runtime.sha256);
      expect(bridge.editableDownload.sha256).toBe(bridge.tiers[0].editable.sha256);
      expect(bridge.licence).toMatchObject({ file: 'ASSET-LICENSE.txt', section: 'Fix-up 1', sha256: staged.tiers.licence.sha256 });
      expect(bridge.delivery).toBe('review-x');
    });
  });

  test('takes the history from the lineage with each run’s requested effort kept apart from confirmation', async () => {
    await withStaged(async (staged) => {
      const { bridge } = await update(staged);
      expect(bridge.revisions.map((revision: { revisionId: string }) => revision.revisionId)).toEqual(['r_full_parent', 'r_full']);
      expect(bridge.provenance.tierHistory.web.map((revision: { revisionId: string }) => revision.revisionId)).toEqual(['r_web_parent', 'r_web']);
      expect(bridge.provenance.tierHistory.far).toHaveLength(2);
      for (const revision of [...bridge.revisions, ...bridge.provenance.tierHistory.web]) {
        expect(revision).toMatchObject({ request: 'first', model: 'GPT-6 Astra', requestedEffort: 'ultra', confirmedEffort: null });
      }
      expect(bridge.provenance.originalModel).toBe('GPT-6 Astra');
      expect(bridge.provenance.refinementModels).toEqual([]);
    });
  });

  test('replaces the earlier revision’s pins and plan entries and keeps only the tiers the site serves', async () => {
    await withStaged(async (staged) => {
      await saveJson(join(staged.data, 'mirror-manifest.json'), { base: 'x', files: [{ path: 'standalone/golden-gate-bridge/r_old/golden-gate-editable.zip', bytes: 1, sha256: 'old' }, { path: 'media/keep.png', bytes: 1, sha256: 'keep' }] });
      await update(staged);
      const pins = JSON.parse(await readFile(join(staged.data, 'mirror-manifest.json'), 'utf8')).files.map((file: { path: string }) => file.path);
      expect(pins).toContain('media/keep.png');
      expect(pins.some((path: string) => path.includes('r_old'))).toBe(false);
      expect(pins.filter((path: string) => path.startsWith(bridgeRevisionDir('r_full'))).length).toBe(1 + 9 + 1 + BRIDGE_CAPTURES.length); // licence, three tiers of three files, the saved review sheet and the rig views
      const plan = JSON.parse(await readFile(join(staged.data, 'commons-build.json'), 'utf8'));
      expect(plan.archives).toEqual([`${bridgeRevisionDir('r_full')}golden-gate-editable.zip`]);
      expect(plan.models).toEqual([expect.objectContaining({ path: `${bridgeRevisionDir('r_full')}golden-gate-runtime.glb`, output: 'models/standalone/golden-gate-bridge.glb' })]);
      // Web and far are download-only: neither is fetched to build the site.
      expect(JSON.stringify(plan)).not.toContain('golden-gate-web');
      expect(plan.images.map((image: { inputPath: string }) => image.inputPath)).toContain(bridgeCapturePath('r_full', 'classic'));
    });
  });

  test('refuses a tier whose GLB is not the accepted one, even when the mirror pins what it holds', async () => {
    await withStaged(async (staged) => {
      const path = join(staged.mirror, bridgeRevisionDir('r_full'), 'golden-gate-web-runtime.glb');
      const tampered = fixtureGlb('not-accepted');
      await writeFile(path, tampered);
      const manifest = JSON.parse(await readFile(staged.manifest, 'utf8'));
      const pin = manifest.files.find((file: { path: string }) => file.path.endsWith('golden-gate-web-runtime.glb'));
      const { createHash } = await import('node:crypto');
      pin.bytes = tampered.length;
      pin.sha256 = createHash('sha256').update(tampered).digest('hex');
      await writeFile(staged.manifest, JSON.stringify(manifest));
      await expect(update(staged)).rejects.toThrow(/web runtime GLB/);
    });
  });

  test('refuses a lineage that does not end at the selected revision', async () => {
    await withStaged(async (staged) => {
      const lineage = JSON.parse(await readFile(join(staged.data, 'standalone/golden-gate-lineage.json'), 'utf8'));
      lineage.full.pop();
      await saveJson(join(staged.data, 'standalone/golden-gate-lineage.json'), lineage);
      await expect(update(staged)).rejects.toThrow(/The lineage ends at r_full_parent/);
    });
  });
});

describe('applying the rig record to the bridge', () => {
  const capture = (name: string) => BRIDGE_CAPTURES.find((entry) => entry.name === name) as (typeof BRIDGE_CAPTURES)[number];
  const record = (name: string, revisionId = 'r_full') => ({ path: bridgeCapturePath('r_full', name), width: 1024, height: 1024, revisionId, capture: name });
  const image = (name: string) => ({ src: `/x/${name}.webp`, width: 4, height: 4, alt: `Alt ${name}`, inputPath: bridgeCapturePath('r_full', name) });
  const bridge = { slug: 'golden-gate-bridge', revisionId: 'r_full', description: 'Bridge.', poster: image('classic'), captures: [image('water-level'), image('deck')] };
  const posters = (revision = 'r_full') => ({ posters: { [bridgeCaptureKey(capture('classic'))]: record('classic', revision), [bridgeCaptureKey(capture('deck'))]: record('deck', revision) } });

  test('marks the recorded poster and views as rig renders of the exact revision and leaves the others', () => {
    const next = applyRigBridge(bridge, posters());
    expect(next.poster).toMatchObject({ rig: 'review-neutral-v1', exactRevision: true, sourceRevisionId: 'r_full', alt: 'Alt classic' });
    expect(next.captures[1]).toMatchObject({ rig: 'review-neutral-v1', alt: 'Alt deck' });
    expect('rig' in next.captures[0]).toBe(false);
    expect(applyRigBridge(bridge, undefined)).toBe(bridge);
  });

  test('refuses a view rendered from another revision instead of mislabelling it', () => {
    expect(() => applyRigBridge(bridge, posters('r_older'))).toThrow(/rendered from r_older/);
  });
});
