import { afterEach, expect, test, spyOn } from 'bun:test';
import { mkdtemp, rm, readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileLiveReview, observeTool } from './live-review-node';
import { renderGLBInProcess } from './render';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function journal() {
  const root = await mkdtemp(join(tmpdir(), 'kiln-live-'));
  roots.push(root);
  return { root, review: new FileLiveReview(root) };
}
const code =
  "const meta = { name: 'Review cube' }; function build() { const root = createRoot('Root'); createPart('Body', boxGeo(1,1,1), gameMaterial('#88aa66'), {parent: root}); return root; }";

test('host work identity survives separate sessions and is optional', async () => {
  const { root } = await journal();
  const a = new FileLiveReview(root, { workId: 'cow' });
  const b = new FileLiveReview(root, { workId: 'cow' });
  await a.observe('render', {}, async () => ({ ok: true }));
  await b.observe('edit', {}, async () => ({ ok: true }));
  await Promise.all([a.flush(), b.flush()]);
  const operations = (await new FileLiveReview(root).snapshot()).operations;
  expect(operations.map((o) => o.workId)).toEqual(['cow', 'cow']);
  expect(new Set(operations.map((o) => o.sessionId)).size).toBe(2);
});

test('live history retains separate captures of the same source across hosts and reopen', async () => {
  const { root, review } = await journal();
  const rendered = await renderGLBInProcess(code);
  const run = () =>
    review.observe('kiln_render', { code }, async () => {
      review.artifact(code, rendered);
      return { ok: true, programRef: 'p_example', viewFidelity: { renderer: 'test' } };
    });
  await Promise.all([run(), run()]);
  await review.flush();
  const snapshot = await new FileLiveReview(root).snapshot();
  expect(snapshot.operations).toHaveLength(2);
  expect(new Set(snapshot.operations.map((op) => op.operationId)).size).toBe(2);
  for (const op of snapshot.operations) {
    expect(op.status).toBe('complete');
    expect(op.artifact?.sha256).toBe(rendered.artifactGlbSha256);
    expect(await review.readFile(op.operationId, 'asset.glb')).toEqual(
      new Uint8Array(rendered.glb),
    );
  }
  expect((await review.snapshot({ cursor: snapshot.cursor })).unchanged).toBe(true);
});

test('failed operations stay visible and cannot replace another operation artifact', async () => {
  const { review } = await journal();
  const rendered = await renderGLBInProcess(code);
  await review.observe('kiln_render', { code }, async () => {
    review.artifact(code, rendered);
    return { ok: true };
  });
  await expect(
    review.observe('kiln_render', {}, async () => {
      throw new Error('broken source');
    }),
  ).rejects.toThrow('broken source');
  await review.observe('kiln_edit', {}, async () => ({ ok: false, error: 'invalid edit' }));
  await review.flush();
  const { operations } = await review.snapshot();
  expect(operations.map((op) => op.status).sort()).toEqual(['complete', 'failed', 'failed']);
  expect(operations.filter((op) => op.artifact)).toHaveLength(1);
  await expect(review.readFile('../escape', 'asset.glb')).rejects.toThrow();
  await expect(review.readFile(operations[0]!.operationId, '../source.kiln.js')).rejects.toThrow();
});

test('observation does not wait for storage or change tool output on observer failure', async () => {
  const pending = new Promise<void>(() => {});
  const result = await observeTool(
    { begin: () => pending, artifact: () => {}, finish: () => pending },
    'kiln_render',
    {},
    async () => ({ ok: true, value: 42 }),
  );
  expect(result).toEqual({ ok: true, value: 42 });
  const throwing = {
    begin: () => {
      throw new Error('disk offline');
    },
    artifact: () => {},
    finish: () => {
      throw new Error('disk offline');
    },
  };
  expect(await observeTool(throwing, 'kiln_render', {}, async () => 'kept')).toBe('kept');
});

test('live retention preserves pinned operations and rejects corrupted artifacts', async () => {
  const { root } = await journal();
  const review = new FileLiveReview(root, { maxOperations: 2 });
  const rendered = await renderGLBInProcess(code);
  for (let i = 0; i < 2; i++)
    await review.observe('kiln_render', {}, async () => {
      review.artifact(code, rendered);
      return { ok: true };
    });
  await review.flush();
  const first = (await review.snapshot()).operations[0]!;
  await review.pin(first.operationId, true);
  await review.observe('kiln_render', {}, async () => ({ ok: true }));
  await review.flush();
  const snapshot = await review.snapshot();
  expect(snapshot.operations).toHaveLength(2);
  expect(snapshot.operations.some((op) => op.operationId === first.operationId && op.pinned)).toBe(
    true,
  );
  const file = join(review.directory, first.operationId, 'asset.glb');
  const corrupt = await readFile(file);
  corrupt[corrupt.length - 1] = corrupt[corrupt.length - 1]! ^ 1;
  await writeFile(file, corrupt);
  await expect(review.readFile(first.operationId, 'asset.glb')).rejects.toThrow('integrity');
});

test('queue pressure retains terminal metadata and explicitly reports omitted payloads', async () => {
  const { root } = await journal();
  const review = new FileLiveReview(root, { maxQueuedBytes: 1024 });
  const rendered = await renderGLBInProcess(code);
  await review.observe('kiln_render', {}, async () => {
    review.artifact(code, rendered);
    return { ok: true };
  });
  await review.flush();
  const op = (await new FileLiveReview(root).snapshot()).operations[0]!;
  expect(op.status).toBe('complete');
  expect(op.artifact).toBeUndefined();
  expect(op.observationIssues?.join(' ')).toContain('queue');
  expect(await review.get(op.operationId)).toEqual(op);
});

test('invalid artifacts and cyclic optional results never alter authoring success', async () => {
  const { review } = await journal();
  const rendered = await renderGLBInProcess(code);
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  expect(
    await review.observe('kiln_render', {}, async () => {
      review.artifact(code, { ...rendered, glb: Buffer.from([1, 2, 3]) });
      return { ok: true, qaReport: circular, viewFidelity: circular };
    }),
  ).toMatchObject({ ok: true });
  await review.flush();
  const op = (await review.snapshot()).operations[0]!;
  expect(op.status).toBe('complete');
  expect(op.observationIssues?.length).toBeGreaterThan(0);
  expect(op.result).toMatchObject({ ok: true });
});

test('large warning and QA detail lists retain essential live metrics and acceptance', async () => {
  const { review } = await journal();
  const rendered = await renderGLBInProcess(code);
  const warnings = Array.from(
    { length: 321 },
    (_, index) => `Mesh ${index}: ${'detail '.repeat(40)}`,
  );
  const qaReport = {
    ...(rendered.meta.qaReport as Record<string, unknown>),
    acceptance: 'blocked',
    details: warnings,
  };
  const output = {
    ok: true,
    tris: 3852,
    meshes: 321,
    materials: 8,
    warnings,
    qaReport,
    viewFidelity: { materialFaithful: true, rendererId: 'fixture-gpu' },
  };
  expect(
    await review.observe('kiln_render', {}, async () => {
      review.artifact(code, { ...rendered, warnings });
      return output;
    }),
  ).toBe(output);
  await review.flush();
  const op = (await review.snapshot()).operations[0]!;
  expect(op.result).toMatchObject({
    ok: true,
    tris: 3852,
    meshes: 321,
    materials: 8,
    qaReport: { acceptance: 'blocked' },
  });
  expect(op.viewFidelity).toEqual(output.viewFidelity);
  expect(Buffer.byteLength(JSON.stringify(op.result))).toBeLessThanOrEqual(32768);
  expect((op.result!.warnings as unknown[]).length).toBeLessThan(warnings.length);
  expect(op.observationIssues?.join(' ')).toMatch(/detail.*omitted|truncated/i);
  const evaluation = JSON.parse(
    new TextDecoder().decode(await review.readFile(op.operationId, 'evaluation.json')),
  );
  expect(evaluation.warnings).toEqual(warnings);
});

test('capture byte limits are checked before allocating rejected decoded frames', async () => {
  const { review } = await journal();
  const png = Buffer.alloc(16 * 1024 * 1024);
  png.set(Buffer.from('89504e470d0a1a0a', 'hex'));
  const encoded = png.toString('base64');
  const decode = spyOn(Buffer, 'from');
  try {
    await review.observe('kiln_screenshot_animation', {}, async () => ({
      ok: true,
      framesBase64: [encoded, encoded, encoded],
    }));
    const calls = decode.mock.calls as unknown[][];
    expect(calls.filter((args) => args[1] === 'base64')).toHaveLength(2);
  } finally {
    decode.mockRestore();
    await review.flush();
  }
  const op = (await review.snapshot()).operations[0]!;
  expect(op.captures).toHaveLength(2);
  expect(op.observationIssues?.join(' ')).toMatch(/budget|size/);
});

test('persisted records are validated before returning metadata or file URLs', async () => {
  const { review } = await journal();
  await review.observe('kiln_render', {}, async () => ({ ok: true }));
  await review.flush();
  const op = (await review.snapshot()).operations[0]!;
  const file = join(review.directory, op.operationId, 'record.json');
  const record = JSON.parse(await readFile(file, 'utf8'));
  record.operation.status = 'invented';
  await writeFile(file, JSON.stringify(record));
  await expect(review.get(op.operationId)).rejects.toThrow();
  const snapshot = await review.snapshot();
  expect(snapshot.operations).toEqual([]);
  expect(snapshot.observationIssues?.join(' ')).toContain('record');
});

test('concurrent pin admission is idempotent and respects a shared count budget', async () => {
  const { root } = await journal();
  const review = new FileLiveReview(root, { maxOperations: 2 });
  await Promise.all([
    review.observe('one', {}, async () => ({})),
    review.observe('two', {}, async () => ({})),
  ]);
  await review.flush();
  const ops = (await review.snapshot()).operations;
  const outcomes = await Promise.allSettled(
    ops.map((op) => new FileLiveReview(root, { maxOperations: 2 }).pin(op.operationId, true)),
  );
  expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
  const pinned = (await review.snapshot()).operations.find((op) => op.pinned)!;
  await review.pin(pinned.operationId, true);
  expect((await review.snapshot()).retention.pinned).toBe(1);
});

test('pin admission counts bytes and active runs remain visible across another writer cleanup', async () => {
  const { root } = await journal();
  const review = new FileLiveReview(root, { maxBytes: 8192, maxOperations: 4 });
  let finish!: () => void;
  const running = review.observe(
    'long',
    {},
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  await review.flush();
  const active = (await review.snapshot()).operations[0]!;
  const second = new FileLiveReview(root, { maxBytes: 8192, maxOperations: 4 });
  await second.observe('other', {}, async () => ({ ok: true }));
  await second.flush();
  expect((await second.get(active.operationId)).status).toBe('running');
  await second.pin(active.operationId, true);
  finish();
  await running;
  await review.flush();
  expect((await review.get(active.operationId)).pinned).toBe(true);
  const large = await renderGLBInProcess(code);
  await second.observe('large', {}, async () => {
    second.artifact(code, large);
    return { ok: true };
  });
  await second.flush();
  const snapshot = await second.snapshot();
  expect(snapshot.retention.bytes).toBeLessThanOrEqual(8192);
  expect(snapshot.operations.some((op) => op.operationId === active.operationId && op.pinned)).toBe(
    true,
  );
});

test('a dead author process is interrupted and reclaimable after restart', async () => {
  const { root } = await journal();
  const script = `import { FileLiveReview } from ${JSON.stringify(new URL('./live-review-node.ts', import.meta.url).href)};
    const review = new FileLiveReview(${JSON.stringify(root)}, { maxOperations: 2 });
    void review.observe('crashed', {}, () => new Promise(() => {}));
    await review.flush();`;
  const child = Bun.spawn([process.execPath, '--eval', script], { stdout: 'pipe', stderr: 'pipe' });
  expect(await child.exited).toBe(0);
  const review = new FileLiveReview(root, { maxOperations: 2 });
  const crashed = (await review.snapshot()).operations[0]!;
  expect(crashed.status).toBe('interrupted');
  for (let i = 0; i < 3; i++) await review.observe('new', {}, async () => ({ ok: true }));
  await review.flush();
  expect((await review.snapshot()).operations).toHaveLength(2);
  expect((await readdir(review.directory)).filter((name) => name.startsWith('op_'))).toHaveLength(
    2,
  );
});

test('restart cleanup removes unpublished payloads and records exact host build identity', async () => {
  const { review } = await journal();
  await review.observe('one', { runtimeIdentity: 'sha256:old-host' }, async () => ({ ok: true }));
  await review.flush();
  const op = (await review.snapshot()).operations[0]!;
  expect(op.runtimeIdentity).toBe('sha256:old-host');
  await writeFile(join(review.directory, op.operationId, 'asset.glb'), new Uint8Array(16384));
  await writeFile(join(review.directory, op.operationId, 'record.json.abandoned.tmp'), 'partial');
  const orphan = 'op_00000000-0000-0000-0000-000000000001';
  await mkdir(join(review.directory, orphan));
  await writeFile(join(review.directory, orphan, 'asset.glb'), new Uint8Array(16384));
  await review.observe('two', {}, async () => ({ ok: true }));
  await review.flush();
  expect(await readdir(join(review.directory, op.operationId))).toEqual(['record.json']);
  expect((await readdir(review.directory)).includes(orphan)).toBe(false);
  expect((await review.snapshot()).observationIssues?.join(' ')).toContain('unpublished');
});

test('liveness timeout is unknown rather than a claim that a live process exited', async () => {
  const { review } = await journal();
  await review.observe('one', {}, async () => ({}));
  await review.flush();
  const op = (await review.snapshot()).operations[0]!;
  const path = join(review.directory, op.operationId, 'record.json');
  const raw = JSON.parse(await readFile(path, 'utf8'));
  raw.operation.status = 'running';
  raw.ownerPid = process.pid;
  raw.heartbeatAt = '2020-01-01T00:00:00.000Z';
  await writeFile(path, JSON.stringify(raw));
  expect((await review.get(op.operationId)).status).toBe('unknown');
});

test('independent processes recover a dead lock and cannot over-admit pins', async () => {
  const { root } = await journal();
  const review = new FileLiveReview(root, { maxOperations: 2 });
  await review.observe('one', {}, async () => ({}));
  await review.observe('two', {}, async () => ({}));
  await review.flush();
  const ops = (await review.snapshot()).operations;
  const departed = Bun.spawn([process.execPath, '--eval', 'process.exit(0)'], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  expect(await departed.exited).toBe(0);
  const directory = join(review.directory, '.locks');
  const names = (await readdir(directory)).filter((name) => name.endsWith('.lock')).sort();
  const next = Number(names.at(-1)!.slice(0, 16)) + 1;
  await writeFile(
    join(directory, `${String(next).padStart(16, '0')}.lock`),
    JSON.stringify({ pid: departed.pid, token: '00000000-0000-4000-8000-000000000001' }),
  );
  const outputs = await Promise.all(
    ops.map(async (op) => {
      const script = `import { FileLiveReview } from ${JSON.stringify(new URL('./live-review-node.ts', import.meta.url).href)};
      try { await new FileLiveReview(${JSON.stringify(root)}).pin(${JSON.stringify(op.operationId)}, true); console.log('accepted'); }
      catch (error) { console.log('rejected'); }`;
      const child = Bun.spawn([process.execPath, '--eval', script], {
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const output = await new Response(child.stdout).text();
      expect(await child.exited).toBe(0);
      return output.trim();
    }),
  );
  expect(outputs.sort()).toEqual(['accepted', 'rejected']);
  expect((await review.snapshot()).retention.pinned).toBe(1);
  expect(
    (await readdir(directory)).filter((name) => name.endsWith('.lock')).length,
  ).toBeLessThanOrEqual(3);
});

test('pin byte admission reserves bounded room for new metadata', async () => {
  const { root } = await journal();
  const review = new FileLiveReview(root, { maxBytes: 8192 });
  await review.observe('large', {}, async () => ({ warnings: ['x'.repeat(7350)] }));
  await review.flush();
  const op = (await review.snapshot()).operations[0]!;
  expect(op).toBeDefined();
  await expect(review.pin(op.operationId, true)).rejects.toThrow('byte budget');
});

test('snapshot overlaps bounded record reads while retaining deterministic invalid-record warnings', async () => {
  const { root, review } = await journal();
  for (let index = 0; index < 18; index++)
    await review.observe(`operation-${index}`, {}, async () => ({ ok: true }));
  await review.flush();
  const order = (await readdir(review.directory)).filter((name) => name.startsWith('op_'));
  const invalid = [order[0]!, order[1]!];
  for (const id of invalid) await writeFile(join(review.directory, id, 'record.json'), '{');
  const reader = new FileLiveReview(root);
  const access = reader as unknown as { record(id: string): Promise<unknown> };
  const original = access.record.bind(reader);
  let active = 0;
  let peak = 0;
  const reading = spyOn(access, 'record').mockImplementation(async (id) => {
    active++;
    peak = Math.max(peak, active);
    try {
      // The first invalid record finishes after the second when reads overlap.
      if (id === invalid[0]) await new Promise((resolve) => setTimeout(resolve, 10));
      return await original(id);
    } finally {
      active--;
    }
  });
  try {
    const snapshot = await reader.snapshot();
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(8);
    expect(active).toBe(0);
    expect(snapshot.operations).toHaveLength(16);
    const issues = snapshot.observationIssues ?? [];
    expect(issues).toHaveLength(2);
    expect(issues[0]).toContain(invalid[0]!);
    expect(issues[1]).toContain(invalid[1]!);
    expect(snapshot.operations.map((op) => op.operationId)).toEqual(
      [...snapshot.operations]
        .sort(
          (a, b) =>
            a.startedAt.localeCompare(b.startedAt) || a.operationId.localeCompare(b.operationId),
        )
        .map((op) => op.operationId),
    );
  } finally {
    reading.mockRestore();
  }
});

test('cleanup releases orphan bytes before retention admission without losing external pins', async () => {
  const { root } = await journal();
  const review = new FileLiveReview(root, { maxBytes: 4096, maxOperations: 4 });
  await review.observe('pinned', {}, async () => ({ ok: true }));
  await review.flush();
  const pinned = (await review.snapshot()).operations[0]!;
  await new FileLiveReview(root).pin(pinned.operationId, true);
  await writeFile(
    join(review.directory, pinned.operationId, 'abandoned.tmp'),
    new Uint8Array(16384),
  );
  const writer = new FileLiveReview(root);
  await writer.observe('retained-after-cleanup', {}, async () => ({ ok: true }));
  await writer.flush();
  const snapshot = await review.snapshot();
  expect(snapshot.operations).toHaveLength(2);
  expect(snapshot.operations.find((op) => op.operationId === pinned.operationId)?.pinned).toBe(
    true,
  );
  expect(snapshot.operations.some((op) => op.tool === 'retained-after-cleanup')).toBe(true);
  expect(snapshot.retention.bytes).toBeLessThanOrEqual(4096);
  expect(await readdir(join(review.directory, pinned.operationId))).toEqual([
    'pinned',
    'record.json',
  ]);
  expect(snapshot.observationIssues?.join(' ')).toContain('unpublished');
});

test('unchanged snapshots still discover publications and pins from another instance', async () => {
  const { root, review } = await journal();
  await review.observe('first', {}, async () => ({}));
  await review.flush();
  const first = await review.snapshot();
  expect((await review.snapshot({ cursor: first.cursor })).unchanged).toBe(true);
  const other = new FileLiveReview(root);
  await other.pin(first.operations[0]!.operationId, true);
  await other.observe('external', {}, async () => ({}));
  await other.flush();
  const updated = await review.snapshot({ cursor: first.cursor });
  expect(updated.unchanged).toBe(false);
  expect(updated.operations).toHaveLength(2);
  expect(
    updated.operations.find((op) => op.operationId === first.operations[0]!.operationId)?.pinned,
  ).toBe(true);
});
