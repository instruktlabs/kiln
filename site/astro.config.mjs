import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { sceneSiteConfig } from './scripts/scene-source.mjs';
import { workbenchContrast } from './src/lib/shiki-contrast.ts';

// Scene runtimes are built and staged outside this graph (scripts/scene-runtime.mjs, scripts/scene-pack.mjs);
// the site only learns which are staged (scripts/scene-source.mjs).
const scene = sceneSiteConfig();

export default defineConfig({
  site: 'https://kilnstudio.tools',
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory', inlineStylesheets: 'always' },
  integrations: [react()],
  markdown: { shikiConfig: { theme: 'github-light', wrap: false, transformers: [workbenchContrast] } },
  vite: {
    plugins: [tailwindcss(), ...scene.plugins],
    build: { assetsInlineLimit: 0 },
  },
});
