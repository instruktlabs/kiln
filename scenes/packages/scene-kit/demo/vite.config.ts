import { sceneStandaloneConfig, sourcePath } from '../src/build/index.ts';
export default ({ mode }: { mode: string }) => sceneStandaloneConfig({
  root: sourcePath(new URL('.', import.meta.url)),
  outDir: sourcePath(new URL('../dist/' + (mode === 'public' ? 'standalone' : mode), import.meta.url)),
  mode: mode === 'test' || mode === 'dev' ? mode : 'public',
});
