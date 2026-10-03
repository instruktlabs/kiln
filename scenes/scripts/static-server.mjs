import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat, readFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute, extname, sep, basename } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const inside = (base, file) => { const rel = relative(base, file); return rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel); };

export async function verifyAssets(root) {
  const base = await realpath(resolve(root, 'assets'));
  const pack = JSON.parse(await readFile(resolve(base, 'pack.json'), 'utf8'));
  if (pack.schema !== 'kiln.scene-pack/1' || !Array.isArray(pack.files)) throw new Error('Invalid asset pack');
  for (const entry of pack.files) {
    const target = resolve(base, entry.path);
    if (!inside(base, target) || !inside(base, await realpath(target))) throw new Error('Unsafe asset path');
    const data = await readFile(target);
    if (data.length !== entry.bytes || createHash('sha256').update(data).digest('hex') !== entry.sha256) throw new Error('Asset verification failed: ' + entry.path);
  }
  return pack.files.length;
}

// A bind failure never contacts the existing listener. The caller owns only this server.
export async function startStaticServer({ root, port = 4400, host = '127.0.0.1', verify = false }) {
  const base = await realpath(root);
  if (verify) await verifyAssets(base);
  const server = createServer(async (req, res) => {
    const send = (status, message) => { res.writeHead(status, { 'Content-Type': 'text/plain' }); res.end(req.method === 'HEAD' ? undefined : message); };
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, 'Method not allowed');
      let pathname;
      try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { return send(400, 'Bad path'); }
      if (pathname.includes('\0') || pathname.includes('\\') || pathname.includes(':')) return send(403, 'Forbidden');
      let file = resolve(base, '.' + pathname);
      if (!inside(base, file)) return send(403, 'Forbidden');
      let metadata = await stat(file);
      if (metadata.isDirectory()) { file = resolve(file, 'index.html'); metadata = await stat(file); }
      if (!inside(base, await realpath(file)) || !metadata.isFile()) return send(403, 'Forbidden');
      const headers = { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*', 'Accept-Ranges': 'bytes', 'Cache-Control': /[.-][\w-]{8,}\.(js|css|glb|png)$/.test(file) ? 'public, max-age=31536000, immutable' : 'no-cache', 'X-Content-Type-Options': 'nosniff' };
      let start = 0, end = metadata.size - 1, status = 200;
      if (req.headers.range) {
        const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
        if (!range || (!range[1] && !range[2])) { res.writeHead(416, { 'Content-Range': `bytes */${metadata.size}` }); return res.end(); }
        if (!range[1]) start = Math.max(0, metadata.size - Number(range[2]));
        else { start = Number(range[1]); if (range[2]) end = Math.min(end, Number(range[2])); }
        if (start > end || start >= metadata.size) { res.writeHead(416, { 'Content-Range': `bytes */${metadata.size}` }); return res.end(); }
        status = 206;
        headers['Content-Range'] = `bytes ${start}-${end}/${metadata.size}`;
      }
      headers['Content-Length'] = String(Math.max(0, end - start + 1));
      res.writeHead(status, headers);
      if (req.method === 'HEAD' || metadata.size === 0) return res.end();
      const stream = createReadStream(file, { start, end });
      stream.on('error', () => res.destroy());
      stream.pipe(res);
    } catch (error) { if (!res.headersSent) send(error.code === 'ENOENT' ? 404 : 500, error.code === 'ENOENT' ? 'Not found' : 'Server error'); else res.destroy(); }
  });
  await new Promise((accept, reject) => { server.once('error', reject); server.listen(port, host, () => { server.off('error', reject); accept(); }); });
  return { server, url: `http://${host}:${server.address().port}`, close: () => new Promise((accept, reject) => { server.closeIdleConnections?.(); server.close(error => error ? reject(error) : accept()); }) };
}

/** True only when this file itself is the process entry: scripts/static-server.mjs, or the serve.mjs copy in a build output.
 * A bundle that inlines this module (the hub kit's runner/look-farm.mjs, through scene-kit's serveOwned) shares its entry's
 * import.meta.url, so the file name decides as well (FARM-005). */
export function isServerEntry(entry = process.argv[1], moduleUrl = import.meta.url) {
  return !!entry && moduleUrl === pathToFileURL(resolve(entry)).href && /^(static-server|serve)\.mjs$/.test(basename(fileURLToPath(moduleUrl)));
}

if (isServerEntry()) {
  const args = process.argv.slice(2);
  const value = (key, fallback) => { const n = args.indexOf(key); return n < 0 ? fallback : args[n + 1]; };
  const { url } = await startStaticServer({ root: resolve(value('--root', fileURLToPath(new URL('.', import.meta.url)))), port: Number(value('--port', '4400')), host: value('--host', '127.0.0.1'), verify: args.includes('--verify') });
  console.log(url);
}
