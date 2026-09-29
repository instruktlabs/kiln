import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { workbenchContrast } from './src/lib/shiki-contrast.ts';
export default defineConfig({
  site: 'https://kilnstudio.tools',
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory', inlineStylesheets: 'always' },
  integrations: [react()],
  markdown: { shikiConfig: { theme: 'github-light', wrap: false, transformers: [workbenchContrast] } },
  vite: { plugins: [tailwindcss()], build: { assetsInlineLimit: 0 } },
});
