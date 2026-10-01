import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Avoid adding unpinned Node typings merely for this isolated build config.
const path = (relative: string) => decodeURIComponent(new URL(relative, import.meta.url).pathname).replace(/^\/([A-Za-z]:\/)/, '$1');

export default defineConfig({
  root: path('.'),
  envDir: false,
  plugins: [react()],
  define: { 'process.env.NODE_ENV': JSON.stringify('development') },
  resolve: {
    alias: [{ find: /^three$/, replacement: path('./three-runtime.ts') }],
    dedupe: ['three', 'react', 'react-dom', '@react-three/fiber'],
  },
  server: { host: '127.0.0.1', port: 4400, strictPort: true },
  build: { outDir: '../dist/spike', emptyOutDir: true },
});
