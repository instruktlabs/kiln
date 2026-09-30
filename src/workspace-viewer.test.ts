import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileAssetLibrary } from './assets-node';
import { FileWorkspace } from './workspace-node';
import { FileLiveReview } from './live-review-node';
import { startAssetViewer } from './asset-viewer';
import { decodeProjectBundle } from './project-bundle';

test('dashboard edits shared project state with explicit conflicts and observes persisted operations', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-workspace-http-'));
  const workspace = new FileWorkspace(root);
  const liveReview = new FileLiveReview(root);
  const viewer = await startAssetViewer(new FileAssetLibrary({ project: join(root, 'assets') }), {
    port: 0,
    workspace,
    liveReview,
  });
  const headers = { 'Content-Type': 'application/json', Origin: viewer.url.slice(0, -1) };
  try {
    const created = await fetch(`${viewer.url}api/projects`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ projectId: 'pilot', name: 'Pilot', brief: 'Shared configuration' }),
    });
    expect(created.status).toBe(201);
    const project = (await created.json()) as { revisionId: string };
    expect((await workspace.projects.read('pilot')).revisionId).toBe(project.revisionId);
    const patch = { expectedRevision: project.revisionId, patch: { brief: 'Dashboard revision' } };
    expect(
      (
        await fetch(`${viewer.url}api/projects/pilot`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify(patch),
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await fetch(`${viewer.url}api/projects/pilot`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify(patch),
        })
      ).status,
    ).toBe(409);
    const current = (await (await fetch(`${viewer.url}api/projects/pilot`)).json()) as {
      brief: string;
    };
    expect(current.brief).toBe('Dashboard revision');
    for (const profile of ['editable', 'runtime'] as const) {
      const download = await fetch(
        `${viewer.url}api/projects/pilot/bundle?profile=${profile}&revision=${encodeURIComponent(project.revisionId)}`,
      );
      expect(download.status).toBe(200);
      expect(download.headers.get('content-type')).toContain('application/zip');
      const decoded = await decodeProjectBundle(new Uint8Array(await download.arrayBuffer()));
      expect(decoded.project.revisionId).toBe(project.revisionId);
      expect(decoded.project.brief).toBe('Shared configuration');
      expect(decoded.manifest.profile).toBe(profile);
    }
    expect(
      (
        await fetch(`${viewer.url}api/projects`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await fetch(`${viewer.url}api/projects`, {
          method: 'POST',
          headers,
          body: ' '.repeat(1024 * 1024 + 1),
        })
      ).status,
    ).toBe(413);
    expect((await fetch(`${viewer.url}api/materials`)).status).toBe(200);
    await liveReview.observe('fixture', { projectId: 'pilot' }, async () => ({
      ok: false,
      error: 'Deliberate fixture failure',
    }));
    await liveReview.flush();
    const snapshot = (await (await fetch(`${viewer.url}api/live?project=pilot`)).json()) as {
      cursor: string;
      operations: Array<{ operationId: string; status: string }>;
    };
    expect(snapshot.operations[0]?.status).toBe('failed');
    const operationId = snapshot.operations[0]!.operationId;
    expect(
      (
        await fetch(`${viewer.url}api/live/${operationId}/pin`, {
          method: 'POST',
          headers,
          body: '{"pinned":true}',
        })
      ).status,
    ).toBe(200);
    const operation = (await (await fetch(`${viewer.url}api/live/${operationId}`)).json()) as {
      pinned: boolean;
    };
    expect(operation.pinned).toBe(true);
    expect((await fetch(`${viewer.url}api/live/${operationId}/record.json`)).status).toBe(404);
    expect(
      (await fetch(`${viewer.url}api/collections`, { method: 'POST', headers, body: '{}' })).status,
    ).toBe(405);
  } finally {
    await viewer.close();
    await rm(root, { recursive: true, force: true });
  }
});
