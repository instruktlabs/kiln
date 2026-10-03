import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

test('the generated timing kit reads its Node pin from the workspace toolchain', async () => {
  const workspace = resolve(import.meta.dir, '../..');
  await mkdir(resolve(workspace, '.tmp'), { recursive: true });
  // Keep the fixture inside the checkout for the generator's read-only Git provenance.
  const fixture = await mkdtemp(resolve(workspace, '.tmp/timing-kit-test-'));
  try {
    await mkdir(resolve(fixture, 'scripts'), { recursive: true });
    await writeFile(resolve(fixture, 'scripts/make-timing-kit.ts'), await readFile(resolve(workspace, 'scripts/make-timing-kit.ts')));
    await writeFile(resolve(fixture, 'scripts/timing-ab.ts'), 'export const fixtureRunner = true;\n');
    const node = '22.99.7'; // Deliberately different from every checked-in pin.
    await writeFile(resolve(fixture, 'toolchain.json'), JSON.stringify({ bun: '1.4.2', node, npm: '12.2.0' }));
    for (const label of ['before', 'after']) {
      const out = resolve(fixture, 'packages/farm/dist', label, 'test'); await mkdir(out, { recursive: true });
      await writeFile(resolve(out, 'index.html'), '<!doctype html><title>Fixture</title>');
      await writeFile(resolve(out, 'build.json'), JSON.stringify({ mode: 'test', scene: 'farm', release: 'fixture', packSha256: 'same-pack', chunks: [], source: 'fixture' }));
    }
    const child = Bun.spawn([process.execPath, 'scripts/make-timing-kit.ts', '--a', 'before', '--b', 'after', '--scenes', 'farm', '--out', 'out'], { cwd: fixture, stdout: 'pipe', stderr: 'pipe' });
    const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
    expect({ code, error: code ? stderr || stdout : '' }).toEqual({ code: 0, error: '' });
    const manifest = JSON.parse(await readFile(resolve(fixture, 'out/MANIFEST.json'), 'utf8'));
    const readme = await readFile(resolve(fixture, 'out/README.txt'), 'utf8');
    expect(manifest.runner.nodePin).toBe(node);
    expect(readme).toContain(`Node ${node} is the pin`);
    expect(readme).toContain(`/node-versions/v${node}/installation/node.exe`);
  } finally { await rm(fixture, { recursive: true, force: true }); }
});
