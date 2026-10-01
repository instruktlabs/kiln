import { sceneStandaloneConfig, sourcePath } from '@kiln-scenes/scene-kit/build';
import { resolve } from 'node:path';
const root = sourcePath(new URL('.', import.meta.url));
export default sceneStandaloneConfig({ root, outDir: resolve(root, '../dist/standalone'), mode: 'public' });
