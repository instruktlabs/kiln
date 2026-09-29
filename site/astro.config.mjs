import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { sceneSourceConfig } from './scripts/scene-source.mjs';
import { workbenchContrast } from './src/lib/shiki-contrast.ts';

// The Farm scene is consumed as source from a scenes workspace (see scripts/scene-source.mjs).
const scene = sceneSourceConfig();

export default defineConfig({
  site: 'https://kilnstudio.tools',
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory', inlineStylesheets: 'always' },
  integrations: [react()],
  markdown: { shikiConfig: { theme: 'github-light', wrap: false, transformers: [workbenchContrast] } },
  vite: {
    plugins: [tailwindcss(), ...scene.plugins],
    define: scene.define,
    resolve: scene.resolve,
    server: scene.server,
    build: { assetsInlineLimit: 0 },
  },
});
