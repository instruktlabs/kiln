import { defineConfig } from 'vite';
import type { Plugin, UserConfig } from 'vite';
import react from '@vitejs/plugin-react';

export type SceneBuildMode = 'public' | 'test' | 'dev';
export const SCENE_DEDUPE = ['three', 'react', 'react-dom', '@react-three/fiber'];
export const sourcePath = (url: URL) => decodeURIComponent(url.pathname).replace(/^\/([A-Za-z]:\/)/, '$1');
export const THREE_RUNTIME_FACADE = sourcePath(new URL('../renderer/three-runtime.ts', import.meta.url));
/** The facade re-exports the same webgpu build; only the obsolete Clock API is adapted. */
export function sceneSourceConfig(mode: SceneBuildMode = 'public'): UserConfig {
  return {
    envDir: false,
    plugins: [react()],
    define: { 'import.meta.env.KILN_DEV': mode === 'dev', 'import.meta.env.KILN_TEST': mode === 'test' },
    resolve: { alias: [{ find: /^three$/, replacement: THREE_RUNTIME_FACADE }], dedupe: [...SCENE_DEDUPE] },
    server: { host: '127.0.0.1', port: 4400, strictPort: true },
  };
}
export function bundleModuleManifest(): Plugin {
  return { name: 'kiln-bundle-modules', generateBundle(_options, bundle) {
    const modules = new Set<string>();
    for (const chunk of Object.values(bundle)) if (chunk.type === 'chunk') for (const id of Object.keys(chunk.modules)) modules.add(id);
    this.emitFile({ type: 'asset', fileName: 'bundle-modules.json', source: JSON.stringify({ modules: [...modules].sort() }, null, 2) + '\n' });
  } };
}
export function sceneStandaloneConfig(options: { root: string; outDir: string; mode?: SceneBuildMode }): UserConfig {
  const config = sceneSourceConfig(options.mode);
  return defineConfig({ ...config, root: options.root, base: './', publicDir: false,
    plugins: [...(config.plugins ?? []), bundleModuleManifest()],
    build: { outDir: options.outDir, emptyOutDir: true, sourcemap: false, reportCompressedSize: true },
  });
}
