// The same page with the kit's dev constants on: URL parameters, test hooks and frame data on the scene root.
// It also takes pictures: a frame posted to /__capture?name=<name> is written to ../review/<name>.png.
import { sceneStandaloneConfig, sourcePath } from '@kiln-scenes/scene-kit/build';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = sourcePath(new URL('.', import.meta.url));
const review = resolve(root, '../review');
const built = sceneStandaloneConfig({ root, outDir: resolve(root, '../dist/dev'), mode: 'dev' });
const capture = {
  name: 'seed-town-capture',
  configureServer(server: { middlewares: { use(path: string, handler: (request: any, response: any) => void): void } }) {
    server.middlewares.use('/__capture', (request, response) => {
      const name = new URL(request.url ?? '', 'http://local').searchParams.get('name') ?? '';
      if (request.method !== 'POST' || !/^[a-z0-9][a-z0-9-]{0,80}$/.test(name)) { response.statusCode = 400; response.end('bad capture'); return; }
      const chunks: Uint8Array[] = [];
      request.on('data', (chunk: Uint8Array) => chunks.push(chunk));
      request.on('end', () => {
        mkdirSync(review, { recursive: true });
        const bytes = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
        let at = 0;
        for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
        writeFileSync(resolve(review, `${name}.png`), bytes);
        response.end('saved');
      });
    });
  },
};
export default {
  ...built,
  plugins: [...(built.plugins ?? []), capture],
  publicDir: resolve(root, 'public'),
  server: { ...built.server, host: '127.0.0.1', port: 4479, strictPort: true },
};
