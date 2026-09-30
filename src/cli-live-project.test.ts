import { expect, test } from 'bun:test';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { FileWorkspace } from './workspace-node';
import { FileLiveReview } from './live-review-node';

test('real CLI records exact project and output for no-view builds and failures', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-cli-live-'));
  try {
    const workspace = new FileWorkspace(root);
    const project = await workspace.projects.create({
      projectId: 'pilot',
      name: 'Pilot',
      brief: 'CLI integration fixture',
    });
    await workspace.projects.create({
      projectId: 'other',
      name: 'Other',
      brief: 'Explicit selection required',
    });
    const source = join(root, 'fixture.kiln.js');
    const output = join(root, 'out.glb');
    await writeFile(
      source,
      `const meta={name:'Live fixture'};function build(){const root=createRoot('Root');createPart('Body',boxGeo(1,1,1),gameMaterial('#88aa66'),{parent:root});return root;}`,
    );
    const cli = resolve('src/cli.ts');
    const run = () =>
      new Promise<{ status: number | null; out: string; err: string }>((resolve, reject) => {
        const child = spawn(
          process.execPath,
          [
            cli,
            'render',
            source,
            '--project',
            'pilot',
            '--out',
            output,
            '--json',
            '--render',
            'cpu',
          ],
          {
            cwd: root,
            env: {
              ...process.env,
              KILN_WORKSPACE: root,
              KILN_PROGRAM_STORE: join(root, '.kiln', 'programs'),
              KILN_EVALUATOR_MODE: 'in-process',
              KILN_RENDER: 'cpu',
            },
            stdio: ['ignore', 'pipe', 'pipe'],
          },
        );
        let out = '',
          err = '';
        child.stdout.on('data', (d) => {
          out += d;
        });
        child.stderr.on('data', (d) => {
          err += d;
        });
        child.on('error', reject);
        child.on('close', (status) => resolve({ status, out, err }));
      });
    const first = await run();
    expect(first.status).toBe(0);
    const receipt = JSON.parse(first.out);
    const live = new FileLiveReview(root);
    const snapshot = await live.snapshot();
    expect(snapshot.operations).toHaveLength(1);
    const op = snapshot.operations[0]!;
    expect(op.projectId).toBe('pilot');
    expect(op.projectRevision).toBe(project.revisionId);
    expect(op.status).toBe('complete');
    expect(op.artifact?.sha256).toBe(receipt.artifactGlbSha256);
    expect(Buffer.from(await live.readFile(op.operationId, 'asset.glb'))).toEqual(
      await readFile(output),
    );
    await writeFile(source, 'not valid code');
    const failure = await run();
    expect(failure.status).toBe(1);
    expect((await live.snapshot()).operations.filter((op) => op.status === 'failed')).toHaveLength(
      1,
    );
    await workspace.projects.update('pilot', project.revisionId, {
      materialDependencies: [
        {
          resourceId: 'missing',
          revisionId: `sha256:${'0'.repeat(64)}`,
          sha256: `sha256:${'0'.repeat(64)}`,
        },
      ],
    });
    const locked = await run();
    expect(locked.status).toBe(1);
    expect(locked.out).toContain('Locked material unavailable');
    const failures = (await live.snapshot()).operations.filter(
      (operation) => operation.status === 'failed',
    );
    expect(failures).toHaveLength(2);
    expect(
      failures.some((operation) => operation.error?.includes('Locked material unavailable')),
    ).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 20000);
