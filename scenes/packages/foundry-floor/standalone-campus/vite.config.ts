import { sceneStandaloneConfig, sourcePath } from '@kiln-scenes/scene-kit/build';
import { resolve } from 'node:path';
const root = sourcePath(new URL('.', import.meta.url));
// FF-C1: the campus page builds to dist/campus/ (never dist/standalone/, FF2's output).
export default sceneStandaloneConfig({ root, outDir: resolve(root, '../dist/campus/standalone'), mode: 'public' });
