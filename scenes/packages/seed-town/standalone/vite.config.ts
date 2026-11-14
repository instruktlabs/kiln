import { sceneStandaloneConfig, sourcePath } from '@kiln-scenes/scene-kit/build';
import { resolve } from 'node:path';

const root = sourcePath(new URL('.', import.meta.url));
const built = sceneStandaloneConfig({ root, outDir: resolve(root, '../dist/standalone'), mode: 'public' });
export default {
  ...built,
  publicDir: resolve(root, 'public'),
  server: { ...built.server, host: '127.0.0.1', port: 4478, strictPort: true },
};
