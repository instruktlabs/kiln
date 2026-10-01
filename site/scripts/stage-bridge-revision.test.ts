import { describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { BRIDGE_CAPTURES, bridgeCaptureFile, bridgeRevisionDir, bridgeTierFiles } from './bridge-captures.mjs';
import { ASSET_ID, buildBridgeFixture, fixtureGlb, pngBytes, save, seal } from './bridge-test-fixtures';
import { hashBytes, verifyArchive } from './mirror-core.mjs';
import { pinDirectory, stageBridgeRevision, verifyLineage, verifyTier } from './stage-bridge-revision.mjs';

async function withFixture(run: (fixture: Awaited<ReturnType<typeof buildBridgeFixture>>, root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'kiln-stage-bridge-'));
  try {
    await run(await buildBridgeFixture(root), root);
  } finally {
    const target = resolve(root);
    if (!target.startsWith(resolve(tmpdir())) || !target.includes('kiln-stage-bridge-')) throw new Error('Unsafe test cleanup path');
    await rm(target, { recursive: true, force: true });
  }
}

const tierOf = (fixture: { tiers: { tiers: { tier: string }[] } }, name: string) => fixture.tiers.tiers.find((tier) => tier.tier === name) as never;

describe('verifying one tier', () => {
  test('builds a deterministic editable archive from the saved revision and seals every member', async () => {
    await withFixture(async (fixture) => {
      const args = { tier: tierOf(fixture, 'web'), assetId: ASSET_ID, outputs: fixture.outputs, library: fixture.library };
      const first = await verifyTier(args);
      const second = await verifyTier(args);
      expect(hashBytes(first.zip)).toBe(hashBytes(second.zip));
      const archive = verifyArchive(first.zip, 'editable');
      expect(archive.prefix).toBe(`${ASSET_ID}/r_web/`);
      expect(Object.keys(archive.files).sort()).toEqual(['manifest.json', 'asset.glb', 'preview.png', 'source.kiln.js'].map((name) => `${archive.prefix}${name}`).sort());
      expect(first.triangles).toBe(1);
    });
  });

  test('refuses an export whose bytes are not the accepted pin', async () => {
    await withFixture(async (fixture) => {
      await writeFile(join(fixture.outputs, 'golden-gate-far.glb'), fixtureGlb('tampered'));
      await expect(verifyTier({ tier: tierOf(fixture, 'far'), assetId: ASSET_ID, outputs: fixture.outputs, library: fixture.library })).rejects.toThrow(/verification failed/);
    });
  });

  test('refuses metadata that names another revision', async () => {
    await withFixture(async (fixture) => {
      const path = join(fixture.outputs, 'golden-gate-web.kiln-metadata.json');
      const metadata = JSON.parse(await readFile(path, 'utf8'));
      metadata.source.revisionId = 'r_other';
      await writeFile(path, JSON.stringify(metadata));
      await expect(verifyTier({ tier: tierOf(fixture, 'web'), assetId: ASSET_ID, outputs: fixture.outputs, library: fixture.library })).rejects.toThrow(/metadata names r_other/);
    });
  });

  test('refuses a saved revision whose parent is not the accepted parent', async () => {
    await withFixture(async (fixture) => {
      const tier = { ...tierOf(fixture, 'full'), parent: 'r_someone_else' } as never;
      await expect(verifyTier({ tier, assetId: ASSET_ID, outputs: fixture.outputs, library: fixture.library })).rejects.toThrow(/not r_full \(parent r_someone_else\)/);
    });
  });

  test('refuses a saved file that the revision manifest does not seal', async () => {
    await withFixture(async (fixture) => {
      await writeFile(join(fixture.library, 'r_far', 'source.kiln.js'), '// edited after saving');
      await expect(verifyTier({ tier: tierOf(fixture, 'far'), assetId: ASSET_ID, outputs: fixture.outputs, library: fixture.library })).rejects.toThrow(/verification failed/);
    });
  });
});

describe('verifying the lineage against the library and the recorded runs', () => {
  test('accepts a chain whose parents, ends and save times agree', async () => {
    await withFixture(async (fixture) => {
      const lines = await verifyLineage({ lineage: fixture.lineage, tiers: fixture.tiers, requests: fixture.requests, library: fixture.library });
      expect(lines).toHaveLength(6);
      expect(lines[0]).toContain('inside run first');
    });
  });

  test('refuses a revision saved outside its run', async () => {
    await withFixture(async (fixture) => {
      const requests = [{ ...fixture.requests[0], endedAt: '2026-09-29T09:00:00.000Z', startedAt: '2026-09-29T08:00:00.000Z' }];
      await expect(verifyLineage({ lineage: fixture.lineage, tiers: fixture.tiers, requests, library: fixture.library })).rejects.toThrow(/outside run first/);
    });
  });

  test('refuses a chain that does not end at the pinned revision', async () => {
    await withFixture(async (fixture) => {
      const lineage = { ...fixture.lineage, full: fixture.lineage.full.slice(0, 1) };
      await expect(verifyLineage({ lineage, tiers: fixture.tiers, requests: fixture.requests, library: fixture.library })).rejects.toThrow(/ends at r_full_parent, not r_full/);
    });
  });

  test('refuses a parent link the library does not have', async () => {
    await withFixture(async (fixture) => {
      const lineage = structuredClone(fixture.lineage);
      lineage.full[1].parentRevisionId = 'r_invented';
      await expect(verifyLineage({ lineage, tiers: fixture.tiers, requests: fixture.requests, library: fixture.library })).rejects.toThrow(/parent r_full_parent in the library, r_invented in the lineage/);
    });
  });
});

describe('staging a delivery into the mirror', () => {
  test('writes the revision directory, needs the rig views first and lists every file with its hash', async () => {
    await withFixture(async (fixture, root) => {
      const mirror = join(root, 'mirror');
      const manifestOut = join(root, 'manifest.json');
      const log: string[] = [];
      const args = { outputs: fixture.outputs, library: fixture.library, mirror, manifestOut, data: fixture.data, log: (line: string) => log.push(line) };
      await expect(stageBridgeRevision(args)).rejects.toThrow(/Missing rig view classic/);
      const dir = bridgeRevisionDir('r_full');
      const png = await pngBytes('#aab1bc', 4);
      for (const capture of BRIDGE_CAPTURES) await save(join(mirror, dir, 'captures', bridgeCaptureFile(capture.name)), png);
      const staged = await stageBridgeRevision(args);
      const paths = staged.files.map((file: { path: string }) => file.path.slice(dir.length));
      expect(paths).toContain('ASSET-LICENSE.txt');
      expect(paths).toContain('captures/review-sheet-neutral.png');
      for (const tier of ['full', 'web', 'far']) for (const name of Object.values(bridgeTierFiles(tier))) expect(paths).toContain(name);
      expect(staged.files).toHaveLength(1 + 9 + 1 + BRIDGE_CAPTURES.length);
      const written = JSON.parse(await readFile(manifestOut, 'utf8'));
      expect(written.files).toEqual(staged.files);
      for (const file of written.files) expect(file).toEqual({ path: file.path, ...seal(await readFile(join(mirror, file.path))) });
      expect(log.some((line) => line.startsWith('licence ASSET-LICENSE.txt'))).toBe(true);
      // The saved preview of the full tier is the review sheet, byte for byte.
      const preview = await readFile(join(fixture.library, 'r_full', 'preview.png'));
      expect(hashBytes(await readFile(join(mirror, dir, 'captures/review-sheet-neutral.png')))).toBe(hashBytes(preview));
    });
  });

  test('a directory listing is sorted and relative to the mirror', async () => {
    await withFixture(async (_fixture, root) => {
      await save(join(root, 'mirror/a/b/two.txt'), 'two');
      await save(join(root, 'mirror/a/one.txt'), 'one');
      expect((await pinDirectory(join(root, 'mirror'), 'a/')).map((pin: { path: string }) => pin.path)).toEqual(['a/b/two.txt', 'a/one.txt']);
    });
  });
});
