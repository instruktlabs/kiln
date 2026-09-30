import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileLiveReview } from './live-review-node';
import { FileAssetLibrary } from './assets-node';
import { startAssetViewer } from './asset-viewer';

test('review sources are explicitly selected and unknown IDs cannot route to the filesystem', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-review-sources-'));
  const first = new FileLiveReview(join(root, 'first'));
  const second = new FileLiveReview(join(root, 'second'));
  await first.observe('one', {}, async () => ({ ok: true }));
  await second.observe('two', {}, async () => ({ ok: true }));
  await Promise.all([first.flush(), second.flush()]);
  const viewer = await startAssetViewer(new FileAssetLibrary({ project: join(root, 'assets') }), {
    port: 0,
    liveReview: first,
    reviewSources: { second: { label: 'Other workspace', review: second } },
  });
  try {
    const sources = (await (await fetch(`${viewer.url}api/live-sources`)).json()) as {
      sources: { id: string }[];
    };
    expect(sources.sources.map((s) => s.id)).toEqual(['', 'second']);
    const current = (await (await fetch(`${viewer.url}api/live`)).json()) as {
      operations: { tool: string }[];
    };
    const other = (await (await fetch(`${viewer.url}api/live?source=second`)).json()) as {
      operations: { tool: string }[];
    };
    expect(current.operations.map((o) => o.tool)).toEqual(['one']);
    expect(other.operations.map((o) => o.tool)).toEqual(['two']);
    expect((await fetch(`${viewer.url}api/live?source=../../foreign`)).status).toBe(404);
  } finally {
    await viewer.close();
    await rm(root, { recursive: true, force: true });
  }
});
