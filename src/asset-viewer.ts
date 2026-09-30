/** Loopback host. Only explicitly configured library/workspace resources are routable. */
import { createServer, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AssetLibrary } from './assets';
import { listAssetCatalog } from './asset-catalog';
import { exportLibraryAssetBundle, readAssetResource } from './assets-resources';
import { LOOPBACK_HOSTNAMES } from './loopback';
import {
  serveWorkspaceRequest,
  WorkspaceHttpError,
  type WorkspaceHttpServices,
} from './workspace-http';

/** A bounded, escaped echo of a request header for a refusal message. */
function quoted(value: string | undefined): string {
  if (value === undefined) return '(none)';
  return JSON.stringify(value.length > 80 ? `${value.slice(0, 80)}...` : value);
}

function refuse(res: ServerResponse, message: string): void {
  res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(`${message}\n`);
}

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
    const port = typeof address === 'object' && address ? address.port : 0;
    // DNS-rebinding guard: answer only a loopback Host on this port. Serve under the
    // origin that Host names, so a page opened as localhost can also write.
    const host = req.headers.host?.toLowerCase();
    if (!host || !LOOPBACK_HOSTNAMES.some((name) => host === `${name}:${port}`)) {
      refuse(
        res,
        `This Kiln viewer only answers requests addressed to a loopback host on port ${port}; other hostnames are refused to prevent DNS rebinding. Open http://127.0.0.1:${port}/ instead. (Host: ${quoted(req.headers.host)})`,
      );
      return;
    }
    const origin = `http://${host}`;
    if (req.headers.origin && req.headers.origin !== origin) {
      refuse(
        res,
        `This Kiln viewer only accepts requests from its own page at ${origin}/. (Origin: ${quoted(req.headers.origin)})`,
      );
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
