import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileAssetLibrary } from './assets-node';
import { startAssetViewer } from './asset-viewer';
import { hostRequest } from './__tests__/helpers/host-request';

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

test('viewer answers loopback Host names on its port and explains refusing any other host', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-viewer-host-'));
  const viewer = await startAssetViewer(new FileAssetLibrary({ project: root }), { port: 0 });
  const port = new URL(viewer.url).port;
  try {
    for (const host of [
      `localhost:${port}`,
      `LOCALHOST:${port}`,
      `127.0.0.1:${port}`,
      `[::1]:${port}`,
    ]) {
      const answered = await hostRequest(`${viewer.url}api/collections`, host);
      expect(answered.status).toBe(200);
      expect(JSON.parse(answered.body).collections[0].id).toBe('project');
    }
    const page = await hostRequest(`${viewer.url}api/collections`, `localhost:${port}`, {
      headers: { Origin: `http://localhost:${port}` },
    });
    expect(page.status).toBe(200);
    for (const host of [
      'evil.example',
      `evil.example:${port}`,
      `localhost.evil.example:${port}`,
      'localhost:1',
      `user@localhost:${port}`,
    ]) {
      const refused = await hostRequest(`${viewer.url}api/collections`, host);
      expect(refused.status).toBe(403);
      expect(refused.contentType).toBe('text/plain; charset=utf-8');
      expect(refused.body).toContain(`port ${port}`);
      expect(refused.body).toContain('DNS rebinding');
      expect(refused.body).toContain(`http://127.0.0.1:${port}/`);
    }
    const long = await hostRequest(`${viewer.url}api/collections`, `${'x'.repeat(2000)}.example`);
    expect(long.status).toBe(403);
    expect(long.body).not.toContain('x'.repeat(200));
    // Another loopback spelling is still another origin.
    const crossed = await hostRequest(`${viewer.url}api/collections`, `localhost:${port}`, {
      headers: { Origin: `http://127.0.0.1:${port}` },
    });
    expect(crossed.status).toBe(403);
    expect(crossed.contentType).toBe('text/plain; charset=utf-8');
  } finally {
    await viewer.close();
    await rm(root, { recursive: true, force: true });
  }
});
