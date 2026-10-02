import { expect, it } from 'bun:test';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { localWorkspaceRoot } from '../workspace-location';

it('renders retained source with a capture file and rejects invalid recipes before writing artifacts', async () => {
  const base = resolve(import.meta.dir, '../../tmp');
  await mkdir(base, { recursive: true });
  const directory = await mkdtemp(join(base, 'cli-capture-'));
  try {
    const built = await Bun.build({
      entrypoints: [resolve(import.meta.dir, '../cli.ts')],
      target: 'node',
      packages: 'external',
      outdir: directory,
      naming: 'cli.mjs',
    });
    expect(built.success).toBe(true);
    const env = {
      ...process.env,
      KILN_EVALUATOR_MODE: 'in-process',
      KILN_BUILD_CACHE: 'off',
      KILN_WORKSPACE: directory,
      KILN_PROGRAM_STORE: join(directory, 'programs'),
      KILN_RENDER: 'cpu',
    };
    expect(localWorkspaceRoot(env)).toBe(directory);
    const run = (args: string[]) =>
      Bun.spawnSync(['node', join(directory, 'cli.mjs'), ...args], {
        cwd: directory,
        env,
        stdout: 'pipe',
        stderr: 'pipe',
      });
    const code =
      "const meta={name:'CaptureFixture',category:'prop'};function build(){const root=createRoot('Root');const part=createPivot('Arm',[2,1,0],root);part.rotation.y=Math.PI/2;createPart('Beam',boxGeo(2,.3,.4),gameMaterial(0xff0000),{parent:part});createPart('Foot',boxGeo(.3,1,.3),gameMaterial(0x00ff00),{position:[-.7,-.5,0],parent:part});return root;}";
    await writeFile(join(directory, 'source.js'), code);
    const imported = run(['source', 'source.js']);
    expect(imported.exitCode).toBe(0);
    const ref = imported.stdout.toString().trim();
    expect(ref).toMatch(/^p_[a-f0-9]{12}$/);
    const recipe = {
      version: 'kiln.capture.v1',
      size: 160,
      cols: 2,
      output: 'grid',
      shots: [
        {
          name: 'Side',
          subject: { name: 'Joint_Arm' },
          visibility: 'isolate',
          camera: { type: 'orbit', relativeTo: 'part', azimuthDeg: 0, elevationDeg: 0 },
        },
        {
          name: 'Top',
          subject: { name: 'Joint_Arm' },
          visibility: 'context',
          camera: { type: 'orbit', relativeTo: 'part', azimuthDeg: 90, elevationDeg: 60 },
        },
      ],
    };
    await writeFile(join(directory, 'capture.json'), JSON.stringify(recipe));
    const first = run([
      'render',
      ref,
      '--render',
      'cpu',
      '--capture',
      'capture.json',
      '--views',
      'chosen.png',
      '--out',
      'chosen.glb',
    ]);
    expect(first.stderr.toString()).toBe('');
    expect(first.exitCode).toBe(0);
    expect(
      (await readdir(join(directory, '.kiln', 'review'))).filter((name) => name.startsWith('op_')),
    ).toHaveLength(1);
    const png = await readFile(join(directory, 'chosen.png'));
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([332, 168]);
    recipe.shots[0]!.camera.azimuthDeg = 180;
    await writeFile(join(directory, 'capture.json'), JSON.stringify(recipe));
    const changed = run([
      'render',
      ref,
      '--render',
      'cpu',
      '--capture',
      'capture.json',
      '--views',
      'changed.png',
      '--out',
      'changed.glb',
    ]);
    expect(changed.exitCode).toBe(0);
    expect(await readFile(join(directory, 'changed.png'))).not.toEqual(png);
    expect(await readFile(join(directory, 'changed.glb'))).toEqual(
      await readFile(join(directory, 'chosen.glb')),
    );
    expect(
      (await readdir(join(directory, 'programs'))).filter((name) => name.endsWith('.js')),
    ).toHaveLength(1);
    // Separate output writes one PNG per shot beside the --views stem, like MCP's
    // one image per shot; no composite sheet is written.
    await writeFile(
      join(directory, 'separate.json'),
      JSON.stringify({ ...recipe, output: 'separate' }),
    );
    const separate = run([
      'render',
      ref,
      '--render',
      'cpu',
      '--capture',
      'separate.json',
      '--views',
      'separate.png',
      '--out',
      'separate.glb',
      '--json',
    ]);
    expect(separate.stderr.toString()).toBe('');
    expect(separate.exitCode).toBe(0);
    const receipt = JSON.parse(separate.stdout.toString());
    expect(receipt.ok).toBe(true);
    expect(receipt.framesBase64).toBeUndefined();
    expect(receipt.cameraShots.map((shot: { name: string }) => shot.name)).toEqual(['Side', 'Top']);
    expect(await readdir(directory)).not.toContain('separate.png');
    const shots = await Promise.all(
      ['separate.shot-01.png', 'separate.shot-02.png'].map((name) =>
        readFile(join(directory, name)),
      ),
    );
    for (const shot of shots)
      expect([shot.readUInt32BE(16), shot.readUInt32BE(20)]).toEqual([160, 160]);
    expect(shots[0]).not.toEqual(shots[1]);
    expect(receipt.files).toEqual([
      {
        kind: 'glb',
        path: join(directory, 'separate.glb'),
        bytes: (await readFile(join(directory, 'separate.glb'))).length,
      },
      {
        kind: 'image',
        path: join(directory, 'separate.shot-01.png'),
        bytes: shots[0]!.length,
        shot: 'Side',
      },
      {
        kind: 'image',
        path: join(directory, 'separate.shot-02.png'),
        bytes: shots[1]!.length,
        shot: 'Top',
      },
    ]);
    const human = run([
      'render',
      ref,
      '--render',
      'cpu',
      '--capture',
      'separate.json',
      '--views',
      join('shots', 'part'),
    ]);
    expect(human.exitCode).toBe(0);
    expect(human.stdout.toString()).toContain(join('shots', 'part.shot-02.png'));
    expect((await readdir(join(directory, 'shots'))).sort()).toEqual([
      'part.shot-01.png',
      'part.shot-02.png',
    ]);
    for (const [name, body] of [
      ['unknown', JSON.stringify({ ...recipe, unsupportedCameraOption: true })],
      ['oversized', ' '.repeat(1024 * 1024 + 1)],
      ['malformed', '{bad json'],
    ]) {
      await writeFile(join(directory, `${name}.json`), body!);
      const rejected = run([
        'render',
        ref,
        '--capture',
        `${name}.json`,
        '--views',
        `${name}.png`,
        '--out',
        `${name}.glb`,
      ]);
      expect(rejected.exitCode).not.toBe(0);
      expect(await readdir(directory)).not.toContain(`${name}.png`);
      expect(await readdir(directory)).not.toContain(`${name}.glb`);
    }
    const missingSubject = { ...recipe, shots: [{ ...recipe.shots[0], subject: { name: 'Arm' } }] };
    await writeFile(join(directory, 'missing-subject.json'), JSON.stringify(missingSubject));
    const missing = run([
      'render',
      ref,
      '--render',
      'cpu',
      '--capture',
      'missing-subject.json',
      '--views',
      'missing-subject.png',
    ]);
    expect(missing.exitCode).not.toBe(0);
    expect(missing.stderr.toString()).toContain('missing camera subject');
    expect(missing.stderr.toString()).toContain('/CaptureFixture[0]/Root[0]/Joint_Arm[0]');
    expect(missing.stderr.toString()).not.toContain('returned no image');
    expect(await readdir(directory)).not.toContain('missing-subject.png');
    missingSubject.shots[0]!.subject = { path: '/CaptureFixture[0]/Root[0]/Joint_Arm[0]' } as never;
    await writeFile(join(directory, 'exact-subject.json'), JSON.stringify(missingSubject));
    const recovered = run([
      'render',
      ref,
      '--render',
      'cpu',
      '--capture',
      'exact-subject.json',
      '--views',
      'exact-subject.png',
    ]);
    expect(recovered.stderr.toString()).toBe('');
    expect(recovered.exitCode).toBe(0);
    const missingViews = run(['render', ref, '--capture', 'capture.json']);
    expect(missingViews.exitCode).not.toBe(0);
    expect(missingViews.stderr.toString()).toContain('--views');
    const legacy = { preset: '1x1', cells: [{ name: 'Legacy', azimuthDeg: 0, elevationDeg: 10 }] };
    await writeFile(join(directory, 'legacy.json'), JSON.stringify(legacy));
    const old = run([
      'render',
      ref,
      '--render',
      'cpu',
      '--capture',
      'legacy.json',
      '--views',
      'legacy.png',
    ]);
    expect(old.exitCode).toBe(0);
    const oldPNG = await readFile(join(directory, 'legacy.png'));
    expect(oldPNG.readUInt32BE(16)).toBe(oldPNG.readUInt32BE(20));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 90_000); // Compiled-CLI capture runs: 10.5 to 13.2 s in the gates of 2 October 2026, 21.1 s in a fresh clone's gate beside two live sessions and 19.2 s under coverage on the loaded host.
