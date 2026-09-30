import { expect, spyOn, test } from 'bun:test';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { inspectMain } from '../inspect-cli';

test('compiled CLI inspection measures surfaces, reuses references and preserves inputs on failed requests', async () => {
  const base = resolve(import.meta.dir, '../../tmp');
  await mkdir(base, { recursive: true });
  const directory = await mkdtemp(join(base, 'cli-inspect-'));
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
    const run = (...args: string[]) =>
      Bun.spawnSync(['node', join(directory, 'cli.mjs'), 'inspect', ...args], {
        cwd: directory,
        env,
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 20000,
      });
    // Keep the real compiled entry check above; execute the remaining shared
    // entry cases in-process so the coverage gate also sees their execution.
    const directRun = async (...args: string[]) => {
      const keys = [
        'KILN_EVALUATOR_MODE',
        'KILN_BUILD_CACHE',
        'KILN_WORKSPACE',
        'KILN_PROGRAM_STORE',
        'KILN_RENDER',
      ] as const;
      const previous = keys.map((key) => process.env[key]);
      const cwd = process.cwd();
      const lines: string[] = [];
      const errors: string[] = [];
      const log = spyOn(console, 'log').mockImplementation((value) => {
        lines.push(String(value));
      });
      const error = spyOn(console, 'error').mockImplementation((value) => {
        errors.push(String(value));
      });
      try {
        for (const key of keys) process.env[key] = env[key];
        process.chdir(directory);
        const exitCode = await inspectMain(args);
        return {
          exitCode,
          stdout: Buffer.from(lines.join('\n')),
          stderr: Buffer.from(errors.join('\n')),
        };
      } finally {
        process.chdir(cwd);
        keys.forEach((key, i) => {
          if (previous[i] === undefined) delete process.env[key];
          else process.env[key] = previous[i];
        });
        log.mockRestore();
        error.mockRestore();
      }
    };
    const source =
      "const meta={name:'gap'};function build(){const r=createRoot('R');createPart('A',boxGeo(1,1,1),gameMaterial('#888888'),{parent:r});createPart('B',boxGeo(1,1,1),gameMaterial('#888888'),{parent:r,position:[1.001,0,0]});return r;}";
    const request = {
      part: 'A',
      measure: {
        mode: 'surface',
        from: { subject: { name: 'Mesh_A' } },
        to: { subject: { name: 'Mesh_B' } },
      },
    };
    await writeFile(join(directory, 'source.js'), source);
    await writeFile(join(directory, 'request.json'), JSON.stringify(request));
    const result = run(
      'source.js',
      '--request',
      'request.json',
      '--views',
      'close.png',
      '--render',
      'cpu',
      '--json',
    );
    expect(result.stderr.toString()).toBe('');
    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout.toString());
    expect(output.measurement.distance).toBeCloseTo(0.001, 7);
    expect(output.measurement.status).toBe('complete');
    expect(output.pngBase64).toBeUndefined();
    expect((await readFile(join(directory, 'close.png'))).subarray(1, 4).toString()).toBe('PNG');
    const again = await directRun(
      output.programRef,
      '--request',
      'request.json',
      '--render',
      'cpu',
      '--json',
    );
    expect(again.exitCode).toBe(0);
    expect(JSON.parse(again.stdout.toString()).measurement).toEqual(output.measurement);
    await writeFile(
      join(directory, 'revised.js'),
      source.replace('position:[1.001,0,0]', 'position:[1.1,0,0]'),
    );
    await writeFile(
      join(directory, 'comparison.json'),
      JSON.stringify({ part: 'B', compare: { programRef: output.programRef } }),
    );
    const comparison = await directRun(
      'revised.js',
      '--request',
      'comparison.json',
      '--render',
      'cpu',
      '--json',
    );
    expect(comparison.exitCode).toBe(0);
    const receipt = JSON.parse(comparison.stdout.toString()).comparison;
    expect(receipt.programRef).toBe(output.programRef);
    expect(receipt.changes.find((c: { name: string }) => c.name === 'Mesh_B').fields).toEqual([
      'transform',
      'bounds',
    ]);
    expect(receipt.summary.added).toBe(0);
    expect(receipt.summary.removed).toBe(0);
    await writeFile(
      join(directory, 'numeric.json'),
      JSON.stringify({
        image: false,
        surfacePairs: [['/gap[0]/R[0]/Mesh_A[0]', '/gap[0]/R[0]/Mesh_B[0]']],
        compare: { programRef: output.programRef, paths: ['/gap[0]/R[0]/Mesh_A[0]'], limit: 1 },
      }),
    );
    const numeric = await directRun(
      'revised.js',
      '--request',
      'numeric.json',
      '--render-port',
      'http://127.0.0.1:1',
      '--json',
    );
    expect(numeric.exitCode).toBe(0);
    const numbers = JSON.parse(numeric.stdout.toString());
    expect(numbers.surfaceMeasurements.status).toBe('complete');
    expect(numbers.surfaceMeasurements.results[0].measurement.distance).toBeCloseTo(0.1, 6);
    expect(numbers.comparison.subtrees[0].status).toBe('unchanged');
    expect(numbers.images).toEqual([]);
    expect(numbers.viewFidelity).toBeUndefined();
    expect((await directRun('revised.js', '--request', 'numeric.json')).exitCode).toBe(0);
    expect(
      (await directRun('revised.js', '--request', 'numeric.json', '--views', 'close.png')).exitCode,
    ).toBe(1);
    const image = await readFile(join(directory, 'close.png'));
    await writeFile(
      join(directory, 'bad.json'),
      JSON.stringify({
        ...request,
        measure: { ...request.measure, to: { subject: { name: 'Missing' } } },
      }),
    );
    expect(
      (
        await directRun(
          'source.js',
          '--request',
          'bad.json',
          '--views',
          'close.png',
          '--render',
          'cpu',
          '--json',
        )
      ).exitCode,
    ).toBe(1);
    expect(await readFile(join(directory, 'close.png'))).toEqual(image);
    expect((await directRun('source.js', '--views', 'source.js', '--render', 'cpu')).exitCode).toBe(
      1,
    );
    expect(await readFile(join(directory, 'source.js'), 'utf8')).toBe(source);
    await writeFile(join(directory, 'bad.json'), JSON.stringify({ code: source }));
    expect((await directRun('source.js', '--request', 'bad.json')).exitCode).toBe(2);
    expect(run('source.js', '--category', 'prop').exitCode).toBe(2);
    expect((await directRun('source.js', '--json', '--json')).exitCode).toBe(2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 20000);
