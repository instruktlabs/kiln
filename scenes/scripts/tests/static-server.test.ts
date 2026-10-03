import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isServerEntry, startStaticServer } from '../static-server.mjs';

const root = resolve(import.meta.dir, '../..');

test('WebP GET, HEAD and byte ranges use image/webp with exact bytes and nosniff', async () => {
  await mkdir(resolve(root, '.tmp'), { recursive: true });
  const dir = await mkdtemp(resolve(root, '.tmp', 'webp-server-'));
  const bytes = Buffer.from('RIFF1234WEBPfixture');
  await writeFile(resolve(dir, 'image.webp'), bytes);
  let server: Awaited<ReturnType<typeof startStaticServer>> | undefined;
  try {
    server = await startStaticServer({ root: dir, port: 0 });
    for (const method of ['GET', 'HEAD']) {
      const response = await fetch(`${server.url}/image.webp`, { method });
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('image/webp');
      expect(response.headers.get('content-length')).toBe(String(bytes.length));
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(Buffer.from(await response.arrayBuffer())).toEqual(method === 'GET' ? bytes : Buffer.alloc(0));
    }
    const partial = await fetch(`${server.url}/image.webp`, { headers: { Range: 'bytes=8-11' } });
    expect(partial.status).toBe(206); expect(partial.headers.get('content-type')).toBe('image/webp');
    expect(partial.headers.get('content-range')).toBe(`bytes 8-11/${bytes.length}`);
    expect(await partial.text()).toBe('WEBP');
    const invalid = await fetch(`${server.url}/image.webp`, { headers: { Range: 'bytes=999-' } });
    expect(invalid.status).toBe(416); await invalid.arrayBuffer();
    const forbidden = await fetch(`${server.url}/%5coutside.webp`);
    expect(forbidden.status).toBe(403); await forbidden.arrayBuffer();
  } finally { try { await server?.close(); } finally { await rm(dir, { recursive: true, force: true }); } }
});

// FARM-005: the hub kit bundles scripts/static-server.mjs into runner/look-farm.mjs (through scene-kit's serveOwned). Inside a
// bundle the module's import.meta.url is the bundle's own, so the file's CLI guard must not start a server there.
describe('static server CLI guard (FARM-005)', () => {
  test('serves only when static-server.mjs or a serve.mjs copy is itself the entry', () => {
    const file = (path: string) => resolve(root, path), url = (path: string) => pathToFileURL(file(path)).href;
    expect(isServerEntry(file('scripts/static-server.mjs'), url('scripts/static-server.mjs'))).toBe(true);
    expect(isServerEntry(file('packages/farm/dist/m3/public/serve.mjs'), url('packages/farm/dist/m3/public/serve.mjs'))).toBe(true);
    expect(isServerEntry(file('packages/farm/dist/hub-kit/runner/look-farm.mjs'), url('packages/farm/dist/hub-kit/runner/look-farm.mjs'))).toBe(false);
    expect(isServerEntry(file('scripts/run-m0.ts'), url('scripts/static-server.mjs'))).toBe(false);
    expect(isServerEntry(undefined, url('scripts/static-server.mjs'))).toBe(false);
  });
  test('a bundle that imports the server module exits by itself and starts no server', async () => {
    await mkdir(resolve(root, '.tmp'), { recursive: true });
    const dir = await mkdtemp(resolve(root, '.tmp', 'static-server-bundle-'));
    try {
      const entry = resolve(dir, 'entry.mjs'), server = relative(dir, resolve(root, 'scripts/static-server.mjs')).split(sep).join('/');
      await writeFile(entry, `import { startStaticServer } from './${server}';\nconsole.log(typeof startStaticServer);\n`);
      const built = await Bun.build({ entrypoints: [entry], target: 'node', format: 'esm', outdir: dir, naming: 'look-farm.mjs' });
      expect(built.success).toBe(true);
      const run = spawnSync(process.execPath, [resolve(dir, 'look-farm.mjs')], { cwd: dir, encoding: 'utf8', timeout: 8_000, windowsHide: true });
      expect({ error: run.error?.message ?? null, signal: run.signal, status: run.status, stdout: run.stdout.trim() }).toEqual({ error: null, signal: null, status: 0, stdout: 'function' });
    } finally { await rm(dir, { recursive: true, force: true }); }
    // A bundle plus two cold process starts; the child is killed at 8 s if it keeps a server open (the failure this guards).
  }, 20_000);
});
