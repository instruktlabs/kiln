import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { encodePng } from '../views/png';
import { fakeRenderHealth } from './helpers/fake-render-service';

const base = resolve(import.meta.dir, '../../tmp');
let directory: string;
const source = `const meta={name:'RenderEnvironment'};
function build(){const r=createRoot('Root');
createPart('Box',boxGeo(1,1,1),gameMaterial('#809080',{metalness:.8}),{parent:r});return r;}
function animate(){return [createClip('Turn',1,[rotationTrack('Mesh_Box',[
{time:0,rotation:[0,0,0]},{time:1,rotation:[0,90,0]}])])];}`;

beforeAll(async () => {
  await mkdir(base, { recursive: true });
  directory = await mkdtemp(join(base, 'cli-render-environment-'));
  const built = await Bun.build({
    entrypoints: [resolve(import.meta.dir, '../cli.ts')],
    target: 'node',
    packages: 'external',
    outdir: directory,
    naming: 'cli.mjs',
  });
  expect(built.success).toBe(true);
  await writeFile(join(directory, 'source.js'), source);
  await writeFile(join(directory, 'capture.json'), JSON.stringify({ preset: '1x1' }));
});

afterAll(async () => {
  if (directory && resolve(directory).startsWith(base + sep))
    await rm(directory, { recursive: true, force: true });
});

async function run(args: string[], mode: string | null = 'cpu') {
  const paths: string[] = [];
  // A compatible private fixture makes accidental auto selection observable in
  // both the receipt and HTTP requests, without ever starting a native renderer.
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      const path = new URL(request.url).pathname;
      paths.push(path);
      if (path === '/health') return Response.json(fakeRenderHealth());
      const body = await request.json();
      const width = body.width ?? body.size;
      const height = body.height ?? body.size;
      const png = Buffer.from(encodePng(new Uint8Array(width * height * 3), width, height));
      return Response.json({
        ok: true,
        rendererId: 'test-renderer',
        cameras: body.cameras,
        width,
        height,
        views: (body.cameras ?? body.views).map(() => png.toString('base64')),
        fidelity: {
          version: 'kiln.render-fidelity.v1',
          producer: 'kiln-render-service',
          delivered: 'full-material',
          materialFaithful: true,
          degraded: false,
          inputGlbSha256:
            'sha256:' +
            createHash('sha256').update(Buffer.from(body.glb_base64, 'base64')).digest('hex'),
          rendererId: 'test-renderer',
        },
      });
    },
  });
  try {
    const child = Bun.spawn(['node', join(directory, 'cli.mjs'), ...args], {
      cwd: directory,
      env: {
        ...process.env,
        KILN_RENDER: mode ?? undefined,
        KILN_RENDER_PORT_URL: '',
        KILN_RENDER_SERVICE_PORT: String(server.port),
        KILN_RENDER_SERVICE_DIR: resolve(import.meta.dir, '../../render-service'),
        KILN_EVALUATOR_MODE: 'in-process',
        KILN_BUILD_CACHE: 'off',
        KILN_PROGRAM_STORE: join(directory, 'programs'),
        KILN_COLLECTIONS: JSON.stringify({ project: join(directory, 'collection') }),
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [code, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    const receipt = code === 0 ? JSON.parse(stdout) : undefined;
    let fidelity = receipt?.viewFidelity;
    if (receipt?.asset) {
      const manifest = JSON.parse(
        await readFile(
          join(
            directory,
            'collection',
            receipt.asset.assetId,
            'revisions',
            receipt.asset.revisionId,
            'manifest.json',
          ),
          'utf8',
        ),
      );
      fidelity = manifest.preview?.fidelity;
    }
    return { code, stdout, stderr, paths, fidelity };
  } finally {
    await server.stop(true);
  }
}

const commands = [
  { name: 'render', args: ['render', 'source.js', '--views', 'sheet.png', '--json'] },
  {
    name: 'capture',
    args: ['render', 'source.js', '--capture', 'capture.json', '--views', 'sheet.png', '--json'],
  },
  { name: 'inspect', args: ['inspect', 'source.js', '--views', 'close.png', '--json'] },
  {
    name: 'animation',
    args: [
      'animation',
      'source.js',
      '--clip',
      'Turn',
      '--phases',
      '0,1',
      '--views',
      'motion.png',
      '--json',
    ],
  },
  { name: 'save', args: ['save', 'source.js', '--name', 'RenderEnvironment'] },
];

for (const { name, args } of commands) {
  test(`${name}: KILN_RENDER=cpu selects CPU without discovering or starting a service`, async () => {
    const result = await run(args);
    expect(result.code, result.stdout + result.stderr).toBe(0);
    const fidelity = result.fidelity;
    expect(fidelity.materialFaithful).toBe(false);
    if (name === 'render' || name === 'capture')
      expect(fidelity.rendererId).toStartWith('cpu-raster:');
    expect(result.paths).toEqual([]);
  });

  test(`${name}: explicit GPU overrides KILN_RENDER=cpu`, async () => {
    const result = await run([...args, '--render', 'gpu']);
    expect(result.code, result.stdout + result.stderr).toBe(0);
    expect(result.fidelity.materialFaithful).toBe(true);
    expect(result.paths).toContain('/render');
  });

  test(`${name}: invalid environment fails before service discovery`, async () => {
    const result = await run(args, 'invalid-render-mode');
    expect(result.code).not.toBe(0);
    expect(result.stdout + result.stderr).toContain('KILN_RENDER must be auto, cpu or gpu');
    expect(result.paths).toEqual([]);
  });

  test(`${name}: explicit CPU overrides an invalid environment`, async () => {
    const result = await run([...args, '--render', 'cpu'], 'invalid-render-mode');
    expect(result.code, result.stdout + result.stderr).toBe(0);
    expect(result.fidelity.materialFaithful).toBe(false);
    expect(result.paths).toEqual([]);
  });
}

test('an invalid explicit render option is not replaced by the CPU environment', async () => {
  const result = await run([...commands[0]!.args, '--render', 'invalid-render-mode']);
  expect(result.code).not.toBe(0);
  expect(result.stdout + result.stderr).toContain('--render must be auto, cpu or gpu');
  expect(result.paths).toEqual([]);
});

test('discovery names an invalid environment before probing a renderer', async () => {
  const result = await run(['discover', '--capabilities', '--json'], 'invalid-render-mode');
  expect(result.code).not.toBe(0);
  expect(result.stdout + result.stderr).toContain('KILN_RENDER must be auto, cpu or gpu');
  expect(result.paths).toEqual([]);
});

test('omitting both the render option and environment preserves auto selection', async () => {
  const result = await run(commands[1]!.args, null);
  expect(result.code, result.stdout + result.stderr).toBe(0);
  expect(result.fidelity.materialFaithful).toBe(true);
  expect(result.paths).toContain('/render');
});
