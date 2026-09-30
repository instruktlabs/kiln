/** Loopback host. Only explicitly configured library/workspace resources are routable. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AssetLibrary } from './assets';
import { listAssetCatalog } from './asset-catalog';
import { exportLibraryAssetBundle, readAssetResource } from './assets-resources';
import {
  serveWorkspaceRequest,
  WorkspaceHttpError,
  type WorkspaceHttpServices,
} from './workspace-http';

export async function startAssetViewer(
  library: AssetLibrary,
  options: WorkspaceHttpServices & {
    port?: number;
    staticDirectory?: string;
    standalone?: { name: string; bytes: Uint8Array };
  } = {},
) {
  const staticDirectory =
    options.staticDirectory ??
    (import.meta.url.endsWith('.ts')
      ? join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'viewer')
      : join(dirname(fileURLToPath(import.meta.url)), 'viewer'));
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    const address = server.address();
    const origin = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
    if (
      req.headers.host !== origin.slice(7) ||
      (req.headers.origin && req.headers.origin !== origin)
    ) {
      res.writeHead(403);
      res.end('Forbidden origin');
      return;
    }
    const send = (bytes: Uint8Array | string, mime = 'application/json', name?: string) => {
      res.setHeader('Content-Type', mime);
      if (name) res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
      res.end(req.method === 'HEAD' ? undefined : bytes);
    };
    try {
      const url = new URL(req.url ?? '/', origin);
      if (await serveWorkspaceRequest(req, res, url, { ...options, assetLibrary: library })) return;
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405);
        res.end('Method not available');
        return;
      }
      if (url.pathname === '/api/collections')
        return send(JSON.stringify({ collections: library.collections() }));
      if (url.pathname === '/api/library')
        return send(JSON.stringify(await listAssetCatalog(library)));
      if (url.pathname === '/api/assets')
        return send(
          JSON.stringify({
            assets: await library.list(url.searchParams.get('collection') ?? 'project'),
          }),
        );
      if (url.pathname === '/api/standalone' && options.standalone)
        return send(
          options.standalone.bytes,
          options.standalone.name.endsWith('.zip') ? 'application/zip' : 'model/gltf-binary',
        );
      if (url.pathname === '/api/bundle') {
        const selected = url.searchParams.getAll('revision');
        if (!selected.length || selected.length > 100) throw new Error('Select 1..100 revisions');
        const records = await Promise.all(
          selected.map((value) => {
            const [collection, asset, revision, extra] = value.split('/');
            if (!collection || !asset || !revision || extra) throw new Error('Invalid revision');
            return library.read(collection, asset, revision);
          }),
        );
        return send(
          await exportLibraryAssetBundle(library, records),
          'application/zip',
          'kiln-assets.zip',
        );
      }
      if (url.pathname.startsWith('/files/')) {
        const file = await readAssetResource(library, `kiln://assets/${url.pathname.slice(7)}`);
        return send(
          file.bytes,
          file.mimeType,
          url.searchParams.has('download') ? file.name : undefined,
        );
      }
      const staticFiles: Record<string, [string, string]> = {
        '/': ['index.html', 'text/html; charset=utf-8'],
        '/app.js': ['app.js', 'text/javascript'],
        '/style.css': ['style.css', 'text/css'],
      };
      const file = staticFiles[url.pathname];
      if (!file) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; connect-src 'self' blob: data:; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      );
      return send(await readFile(join(staticDirectory, file[0])), file[1]);
    } catch (error) {
      res.statusCode =
        error instanceof WorkspaceHttpError
          ? error.status
          : error &&
              typeof error === 'object' &&
              'code' in error &&
              error.code === 'PROJECT_CONFLICT'
            ? 409
            : 400;
      send(JSON.stringify({ error: error instanceof Error ? error.message : 'Asset unavailable' }));
    }
  });
  server.requestTimeout = 15000;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 4318, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Viewer did not bind');
  return {
    url: `http://127.0.0.1:${address.port}/`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}
