import { expect, test } from 'bun:test';
import { mkdtemp, writeFile, rm, readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { FileProjectStore } from '../projects-node';
import { FileProgramStore } from '../program-store-node';
import { retainProgram } from '../program-store';

const source = `const meta={name:'Hinge'};
function build(){const root=createRoot('Root');
createPart('Base',boxGeo(.4,.4,.4),gameMaterial(0x404040),{parent:root});
const arm=createPivot('Arm',[0,.5,0],root);
createPart('Beam',boxGeo(2,.2,.3),gameMaterial(0xff4030),{parent:arm,position:[1,0,0]});
return root;}
function animate(){return [createClip('Swing',2,[rotationTrack('Joint_Arm',[
{time:0,rotation:[0,0,0]},{time:1,rotation:[0,0,90]},{time:2,rotation:[0,0,0]}])])];}`;

test('edit, inspect and animation honor exact CLI project selection and the environment fallback', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-cli-project-selection-'));
  try {
    const projects = new FileProjectStore(root);
    const farm = await projects.create({ projectId: 'farm', name: 'Farm' });
    await projects.create({ projectId: 'city', name: 'City' });
    await projects.update('farm', farm.revisionId, { brief: 'New brief' });
    const store = new FileProgramStore(join(root, '.kiln', 'programs'));
    const ref = await retainProgram(store, source);
    await writeFile(
      join(root, 'edits.json'),
      JSON.stringify([{ oldString: "'Hinge'", newString: "'Door'" }]),
    );
    await writeFile(join(root, 'inspect.json'), JSON.stringify({ image: false, listParts: {} }));
    const env = {
      ...process.env,
      KILN_WORKSPACE: root,
      KILN_PROGRAM_STORE: store.directory,
      KILN_EVALUATOR_MODE: 'in-process',
      KILN_BUILD_CACHE: 'off',
      KILN_RENDER: 'cpu',
      KILN_PROJECT: 'city',
      KILN_LIVE_REVIEW: 'on',
    };
    const run = (args: string[]) =>
      Bun.spawnSync([process.execPath, resolve(import.meta.dir, '../cli.ts'), ...args], {
        cwd: root,
        env,
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 20000,
      });
    const commands = [
      ['edit', ref, '--edits', 'edits.json'],
      ['inspect', ref, '--request', 'inspect.json', '--json'],
      [
        'animation',
        ref,
        '--clip',
        'Swing',
        '--frames',
        '2',
        '--views',
        'motion.png',
        '--render',
        'cpu',
        '--json',
      ],
    ];
    for (const command of commands) {
      const result = run([...command, '--project', 'farm', '--project-revision', farm.revisionId]);
      expect(result.exitCode, result.stderr.toString() + result.stdout.toString()).toBe(0);
      const missing = run([...command, '--project', 'missing']);
      expect(missing.exitCode).toBe(1);
      expect(missing.stderr.toString() + missing.stdout.toString()).toContain('Project not found');
      const standalone = run([...command, '--no-project']);
      expect(standalone.exitCode, standalone.stderr.toString() + standalone.stdout.toString()).toBe(
        0,
      );
      const conflict = run([...command, '--no-project', '--project', 'farm']);
      expect(conflict.exitCode).not.toBe(0);
      expect(conflict.stderr.toString() + conflict.stdout.toString()).toContain('--no-project');
    }
    const fallback = run(commands[0]!);
    expect(fallback.exitCode, fallback.stderr.toString() + fallback.stdout.toString()).toBe(0);
    const records = await Promise.all(
      (await readdir(join(root, '.kiln', 'review')))
        .filter((name) => name.startsWith('op_'))
        .map(
          async (name) =>
            JSON.parse(await readFile(join(root, '.kiln', 'review', name, 'record.json'), 'utf8'))
              .operation,
        ),
    );
    for (const tool of ['kiln_edit', 'kiln_inspect', 'kiln_screenshot_animation'])
      expect(
        records.some(
          (op) =>
            op.tool === tool && op.projectId === 'farm' && op.projectRevision === farm.revisionId,
        ),
      ).toBe(true);
    expect(records.some((op) => op.tool === 'kiln_edit' && op.projectId === 'city')).toBe(true);
    for (const tool of ['kiln_edit', 'kiln_inspect', 'kiln_screenshot_animation'])
      expect(
        records.some(
          (op) => op.tool === tool && op.status === 'complete' && op.projectId === undefined,
        ),
      ).toBe(true);
    for (const args of [
      ['inspect', 'unreadable.js', '--project', '../bad', '--json'],
      [
        'animation',
        'unreadable.js',
        '--clip',
        'Swing',
        '--views',
        'unused.png',
        '--project',
        '../bad',
        '--json',
      ],
    ]) {
      const invalid = run(args);
      expect(invalid.exitCode).toBe(2);
      expect(invalid.stderr.toString()).not.toContain('ENOENT');
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 60_000); // Compiled-CLI project-selection runs: 7.7 to 11.5 s in the gates of 2 October 2026, 15.1 s in a fresh clone's gate beside two live sessions.
