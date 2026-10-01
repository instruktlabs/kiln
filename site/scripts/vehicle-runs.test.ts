import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { save } from './bridge-test-fixtures';
import { VEHICLE_RUNS_FILE, vehicleRuns } from './vehicle-runs.mjs';
import { VEHICLE_RUNS } from './vehicles-spec.mjs';

const commons = process.env.KILN_COMMONS_DIR;

const receipt = { status: 'completed', requestedModel: 'claude-sonnet-5-5', requestedEffort: 'max', harness: 'claude', harnessVersion: '2.1.280', reportedModels: ['claude-sonnet-5-5'], startedAt: '2026-09-29T14:00:00.000Z', lastEventAt: '2026-09-29T15:00:00.000Z', result: { subtype: 'success' } };
const invocation = { requestedModel: 'claude-sonnet-5-5', requestedEffort: 'max', harness: 'claude', harnessVersion: '2.1.280' };

async function withRuns(run: (dir: string) => Promise<void>, overrides: { receipt?: object } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'kiln-vehicle-runs-'));
  try {
    await save(join(dir, 'showcase/runs/author-x/first/receipt.json'), JSON.stringify({ ...receipt, ...overrides.receipt }));
    await save(join(dir, 'showcase/runs/author-x/first/invocation.json'), JSON.stringify(invocation));
    await run(dir);
  } finally {
    const target = resolve(dir);
    if (!target.startsWith(resolve(tmpdir())) || !target.includes('kiln-vehicle-runs-')) throw new Error('Unsafe cleanup path');
    await rm(target, { recursive: true, force: true });
  }
}

describe('vehicle runs', () => {
  test('come from a receipt and invocation that agree, with the outcome and without any confirmed effort', async () => {
    await withRuns(async (dir) => {
      const [record] = await vehicleRuns(dir, [{ stage: 'first-retry1', author: 'author-x', dir: 'first', label: 'first run, retry 1' }]);
      expect(record).toMatchObject({ stage: 'first-retry1', author: 'author-x', requestedModel: 'claude-sonnet-5-5', requestedEffort: 'max', harness: 'claude', harnessVersion: '2.1.280', confirmedEffort: null, status: 'completed', stop: 'success', label: 'first run, retry 1' });
      expect(record!.source.receiptSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(record!.confirmation).toContain('not independently confirmed');
    });
  });

  test('a run that stopped at its spending limit is kept, with its stop reason', async () => {
    await withRuns(async (dir) => {
      const [record] = await vehicleRuns(dir, [{ stage: 'first-retry1', author: 'author-x', dir: 'first', label: 'x' }]);
      expect(record).toMatchObject({ status: 'failed', stop: 'error_max_budget_usd', confirmedEffort: null });
    }, { receipt: { status: 'failed', result: { subtype: 'error_max_budget_usd' } } });
  });

  test('a run that is neither completed nor failed is refused', async () => {
    await withRuns(async (dir) => {
      await expect(vehicleRuns(dir, [{ stage: 's', author: 'author-x', dir: 'first', label: 'x' }])).rejects.toThrow('is running, not a completed or failed run');
    }, { receipt: { status: 'running' } });
  });

  test('the three runs the vehicles were saved by are the three the site records', async () => {
    expect(VEHICLE_RUNS.map((run) => `${run.author}/${run.stage}`)).toEqual(['sonnet-vehicles-a/first-retry1', 'sonnet-vehicles-b/first-retry1', 'sonnet-vehicles-b/review-2']);
    const recorded = JSON.parse(await readFile(VEHICLE_RUNS_FILE, 'utf8'));
    expect(recorded.map((record: { author: string; stage: string }) => `${record.author}/${record.stage}`)).toEqual(VEHICLE_RUNS.map((run) => `${run.author}/${run.stage}`));
  });

  test.skipIf(!commons || !existsSync(commons))('equal what the receipts say now', async () => {
    const recorded = JSON.parse(await readFile(VEHICLE_RUNS_FILE, 'utf8'));
    expect(recorded).toEqual(await vehicleRuns(resolve(commons as string)));
  });
});
