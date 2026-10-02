import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createKilnProgramToolRegistry } from '../tools/registry';
import { createLocalToolContext } from '../local-runtime';
import { MemoryProgramStore } from '../program-store';
import { decodePng } from '../views/png';

const SOURCE = `
const meta={name:'Hinge'};
function build(){const root=createRoot('Root');
createPart('Base',boxGeo(.4,.4,.4),gameMaterial(0x404040),{parent:root});
const arm=createPivot('Arm',[0,.5,0],root);
createPart('Beam',boxGeo(2,.2,.3),gameMaterial(0xff4030),{parent:arm,position:[1,0,0]});
return root;}
function animate(){return [createClip('Swing',2,[rotationTrack('Joint_Arm',[
{time:0,rotation:[0,0,0]},{time:1,rotation:[0,0,90]},{time:2,rotation:[0,0,0]}
])])];}`;

test('CLI samples real clips with the same frames as the shared tool and preserves failed destinations', async () => {
  const base = resolve(import.meta.dir, '../../tmp');
  await mkdir(base, { recursive: true });
  const directory = await mkdtemp(join(base, 'cli-animation-'));
  try {
    const build = await Bun.build({
      entrypoints: [resolve(import.meta.dir, '../cli.ts')],
      target: 'node',
      packages: 'external',
      outdir: directory,
      naming: 'cli.mjs',
    });
    expect(build.success).toBe(true);
    const env = {
      ...process.env,
      KILN_EVALUATOR_MODE: 'in-process',
      KILN_BUILD_CACHE: 'off',
      KILN_WORKSPACE: directory,
      KILN_PROGRAM_STORE: join(directory, 'programs'),
      KILN_RENDER: 'cpu',
    };
    const run = (args: string[]) =>
      Bun.spawnSync(['node', join(directory, 'cli.mjs'), 'animation', ...args], {
        cwd: directory,
        env,
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 20000,
      });
    await writeFile(join(directory, 'source.js'), SOURCE);
    await writeFile(
      join(directory, 'parts.json'),
      JSON.stringify([{ name: 'Joint_Arm' }, { name: 'Mesh_Base' }]),
    );
    const first = run([
      'source.js',
      '--clip',
      'Swing',
      '--phases',
      '0,0.5,1',
      '--camera',
      'right',
      '--render',
      'cpu',
      '--views',
      'motion.png',
      '--per-frame',
      '--measure-parts',
      'parts.json',
      '--json',
    ]);
    expect(first.stderr.toString()).toBe('');
    expect(first.exitCode).toBe(0);
    const result = JSON.parse(first.stdout.toString());
    expect(result.ok).toBe(true);
    expect(result.programRef).toMatch(/^p_[a-f0-9]{12}$/);
    expect(result.frameTimes).toEqual([0, 0.5, 1]);
    expect(result.duration).toBe(2);
    expect(result.viewFidelity.materialFaithful).toBe(false);
    expect(result.images.map((im: { phase: number }) => im.phase)).toEqual([0, 0.5, 1]);
    expect(result.pngBase64).toBeUndefined();
    expect(result.framesBase64).toBeUndefined();
    const context = createLocalToolContext(
      { programStore: new MemoryProgramStore() },
      { KILN_EVALUATOR_MODE: 'in-process', KILN_WORKSPACE: directory },
    );
    const tool = createKilnProgramToolRegistry(context).find(
      (t) => t.name === 'kiln_screenshot_animation',
    )!;
    const output = await tool.run({
      code: SOURCE,
      clip: 'Swing',
      frameTimes: [0, 0.5, 1],
      camera: 'right',
      perFrame: true,
      measureParts: [{ name: 'Joint_Arm' }, { name: 'Mesh_Base' }],
    });
    await context.liveReview?.flush?.();
    const expected = tool.mediaMulti!(output)!.pngs;
    expect(result.poseBounds).toEqual((output as { poseBounds: unknown }).poseBounds);
    expect(result.poseBounds[1].parts[0].bounds.max[1]).toBeCloseTo(2.5, 6);
    expect(result.poseBounds[1].parts[1].bounds.min[1]).toBeCloseTo(-0.2, 6);
    expect(result.poseBounds).toHaveLength(3);
    expect(
      result.poseBounds.map((p: { phase: number; timeSeconds: number }) => [
        p.phase,
        p.timeSeconds,
      ]),
    ).toEqual([
      [0, 0],
      [0.5, 1],
      [1, 2],
    ]);
    expect(result.poseBounds[0].scene.max[0]).toBeCloseTo(2, 6);
    expect(result.poseBounds[1].scene.max[1]).toBeCloseTo(2.5, 6);
    const frames = await Promise.all(
      result.images.map((im: { path: string }) => readFile(im.path)),
    );
    expect(frames).toHaveLength(3);
    frames.forEach((bytes, i) => {
      // Node and Bun can use different PNG compression; compare rendered pixels.
      const actual = decodePng(bytes);
      const reference = decodePng(Buffer.from(expected[i]!));
      expect([actual.width, actual.height]).toEqual([reference.width, reference.height]);
      expect(actual.rgb).toEqual(reference.rgb);
    });
    expect(frames[0]).not.toEqual(frames[1]);
    expect(await readFile(join(directory, 'source.js'), 'utf8')).toBe(SOURCE);
    expect((await readdir(directory)).some((name) => name.endsWith('.glb'))).toBe(false);

    await writeFile(
      join(directory, 'shot.json'),
      JSON.stringify({
        subject: { name: 'Joint_Arm' },
        visibility: 'context',
        camera: { type: 'orbit', relativeTo: 'part', azimuthDeg: 20, elevationDeg: 15 },
      }),
    );
    const grid = run([
      result.programRef,
      '--clip',
      'Swing',
      '--frames',
      '3',
      '--framing',
      'follow',
      '--shot',
      'shot.json',
      '--render',
      'cpu',
      '--views',
      'grid.png',
      '--json',
    ]);
    expect(grid.stderr.toString()).toBe('');
    expect(grid.exitCode).toBe(0);
    const gridResult = JSON.parse(grid.stdout.toString());
    expect(gridResult.frames).toBe(3);
    expect(gridResult.cameraShots).toHaveLength(3);
    expect(gridResult.images).toHaveLength(1);
    expect((await readFile(gridResult.images[0].path)).subarray(0, 4)).toEqual(
      Buffer.from([137, 80, 78, 71]),
    );

    // The frame size is selectable; the receipt is compact unless --detail full
    // asks for the complete QA report.
    expect(gridResult.qaReport.detail).toBe('compact');
    expect(gridResult.qaReport.ruleSummary).toBeDefined();
    const sized = run([
      result.programRef,
      '--clip',
      'Swing',
      '--frames',
      '2',
      '--size',
      '384',
      '--render',
      'cpu',
      '--views',
      'sized.png',
      '--json',
      '--detail',
      'full',
    ]);
    expect(sized.stderr.toString()).toBe('');
    expect(sized.exitCode).toBe(0);
    const sizedResult = JSON.parse(sized.stdout.toString());
    expect(decodePng(await readFile(sizedResult.images[0].path)).width).toBeGreaterThan(2 * 384);
    expect(Array.isArray(sizedResult.qaReport.rules)).toBe(true);
    expect(
      run([result.programRef, '--clip', 'Swing', '--views', 'x.png', '--detail', 'verbose'])
        .exitCode,
    ).not.toBe(0);

    await writeFile(join(directory, 'guard.png'), 'existing image');
    const absent = run([
      result.programRef,
      '--clip',
      'Missing',
      '--render',
      'cpu',
      '--views',
      'guard.png',
      '--json',
    ]);
    expect(absent.exitCode).toBe(1);
    expect(JSON.parse(absent.stdout.toString()).availableClips).toEqual(['Swing']);
    expect(await readFile(join(directory, 'guard.png'), 'utf8')).toBe('existing image');
    for (const extra of [
      ['--frames', '2', '--phases', '0,1'],
      ['--phases', '0,,1'],
      ['--phases', '0,2'],
      ['--frames', '2', '--frames', '3'],
      ['--unknown', 'value'],
      ['--size', '64'],
      ['--size', 'big'],
    ]) {
      const rejected = run([
        result.programRef,
        '--clip',
        'Swing',
        '--views',
        'guard.png',
        '--render',
        'cpu',
        ...extra,
      ]);
      expect(rejected.exitCode).not.toBe(0);
      expect(await readFile(join(directory, 'guard.png'), 'utf8')).toBe('existing image');
    }
    await writeFile(join(directory, 'bad-shot.json'), '{"unknown":true}');
    const badShot = run([
      result.programRef,
      '--clip',
      'Swing',
      '--shot',
      'bad-shot.json',
      '--views',
      'guard.png',
    ]);
    expect(badShot.exitCode).not.toBe(0);
    expect(await readFile(join(directory, 'guard.png'), 'utf8')).toBe('existing image');
    expect(run(['source.js', '--clip', 'Swing']).exitCode).not.toBe(0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30000);
