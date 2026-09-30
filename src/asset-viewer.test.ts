import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileAssetLibrary } from './assets-node';
import { startAssetViewer } from './asset-viewer';

test('viewer serves only configured collections and rejects cross-origin writes and unknown files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-viewer-'));
  const viewer = await startAssetViewer(new FileAssetLibrary({ project: root }), { port: 0 });
  try {
    const response = await fetch(`${viewer.url}api/collections`);
    expect(await response.json()).toEqual({
      collections: [{ id: 'project', label: 'Workspace storage' }],
    });
    expect((await fetch(`${viewer.url}api/assets?collection=project`)).status).toBe(200);
    expect((await fetch(`${viewer.url}api/assets?collection=unknown`)).status).toBe(400);
    expect((await fetch(`${viewer.url}package.json`)).status).toBe(404);
    expect(
      (await fetch(`${viewer.url}api/collections`, { headers: { Origin: 'https://example.com' } }))
        .status,
    ).toBe(403);
    expect((await fetch(`${viewer.url}api/collections`, { method: 'POST' })).status).toBe(405);
  } finally {
    await viewer.close();
    await rm(root, { recursive: true, force: true });
  }
});
