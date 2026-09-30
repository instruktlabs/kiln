import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { BRIDGE_RUNS, bridgeRequest, bridgeRequests } from './bridge-requests.mjs';
import { hashBytes } from './mirror-core.mjs';
import { save } from './bridge-test-fixtures';

const RUN = { stage: 'first', author: 'author-x', dir: 'first' };
const receipt = { status: 'completed', requestedModel: 'gpt-6-astra', requestedEffort: 'ultra', harness: 'codex', harnessVersion: '0.157.1', reportedModels: [], startedAt: '2026-09-29T10:00:00.000Z', lastEventAt: '2026-09-29T11:00:00.000Z' };
const invocation = { requestedModel: 'gpt-6-astra', requestedEffort: 'ultra', harness: 'codex', harnessVersion: '0.157.1' };

async function withRuns(run: (commons: string) => Promise<void>, overrides: { receipt?: object; invocation?: object } = {}) {
  const commons = await mkdtemp(join(tmpdir(), 'kiln-bridge-requests-'));
  try {
    await save(join(commons, 'showcase/runs/author-x/first/receipt.json'), JSON.stringify({ ...receipt, ...overrides.receipt }));
    await save(join(commons, 'showcase/runs/author-x/first/invocation.json'), JSON.stringify({ ...invocation, ...overrides.invocation }));
    await run(commons);
  } finally {
    const target = resolve(commons);
    if (!target.startsWith(resolve(tmpdir())) || !target.includes('kiln-bridge-requests-')) throw new Error('Unsafe test cleanup path');
    await rm(target, { recursive: true, force: true });
  }
}

describe('a recorded bridge run', () => {
  test('carries what the run asked for, pinned to its receipt and invocation, with no confirmed effort', async () => {
    await withRuns(async (commons) => {
      const request = await bridgeRequest(commons, RUN);
      expect(request).toMatchObject({ stage: 'first', author: 'author-x', requestedModel: 'gpt-6-astra', requestedEffort: 'ultra', harness: 'codex', harnessVersion: '0.157.1', confirmedEffort: null, modelReported: null, startedAt: receipt.startedAt, endedAt: receipt.lastEventAt });
      expect(request.confirmation).toMatch(/not independently confirmed/);
      expect(request.source.receipt).toBe('showcase/runs/author-x/first/receipt.json');
      expect(request.source.receiptSha256).toBe(hashBytes(await readFile(join(commons, request.source.receipt))));
      expect(request.source.invocationSha256).toBe(hashBytes(await readFile(join(commons, request.source.invocation))));
    });
  });

  test('keeps the models a harness reported apart from the one requested', async () => {
    await withRuns(async (commons) => {
      expect((await bridgeRequest(commons, RUN)).modelReported).toEqual(['claude-sonnet-5-5']);
    }, { receipt: { reportedModels: ['claude-sonnet-5-5'] } });
  });

  test('refuses a run that did not complete', async () => {
    await withRuns(async (commons) => {
      await expect(bridgeRequest(commons, RUN)).rejects.toThrow(/is failed, not a completed run/);
    }, { receipt: { status: 'failed' } });
  });

  test.each(['requestedModel', 'requestedEffort', 'harness', 'harnessVersion'])('refuses a receipt and invocation that disagree on %s', async (key) => {
    await withRuns(async (commons) => {
      await expect(bridgeRequest(commons, RUN)).rejects.toThrow(new RegExp(`disagree on ${key}`));
    }, { invocation: { [key]: 'something-else' } });
  });

  test('lists the runs in the order they happened, each stage once', async () => {
    expect(BRIDGE_RUNS.map((run) => run.stage)).toEqual(['first', 'review-1', 'review-2', 'fix-up-1', 'fix-review-1', 'fix-review-2', 'fix-review-3']);
    await withRuns(async (commons) => {
      expect((await bridgeRequests(commons, [RUN, { ...RUN, stage: 'second' }])).map((request) => request.stage)).toEqual(['first', 'second']);
    });
  });
});

// The checked-in file is the receipts' record. It is compared with the receipts themselves whenever the commons
// checkout is available (set KILN_COMMONS_DIR), so an edited receipt or a hand-edited record cannot pass quietly.
const commons = process.env.KILN_COMMONS_DIR;
describe('the checked-in bridge requests', () => {
  const file = join(import.meta.dir, '../src/data/bridge-requests.json');

  test('list every run once, each with its requested effort and no confirmation', async () => {
    const requests = JSON.parse(await readFile(file, 'utf8'));
    expect(requests.map((request: { stage: string }) => request.stage)).toEqual(BRIDGE_RUNS.map((run) => run.stage));
    for (const request of requests) {
      expect(request.confirmedEffort).toBeNull();
      expect(request.requestedEffort).toEqual(expect.any(String));
      expect(request.source.receiptSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(request.source.invocationSha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  test.skipIf(!commons || !existsSync(commons))('equal what the receipts say now', async () => {
    const recorded = JSON.parse(await readFile(file, 'utf8'));
    expect(recorded).toEqual(await bridgeRequests(resolve(commons as string)));
  });
});
