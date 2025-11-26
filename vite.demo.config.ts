import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig(({ command }) => ({
  root: 'demo',
  base: command === 'serve' ? '/' : '/webm-meta-lite/', // Base URL for GitHub Pages (production) vs Root (local)
  build: {
    outDir: '../demo-dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'demo/index.html'),
      },
    },
  },
  resolve: {
    alias: {
      '../src': resolve(__dirname, 'src'),
    },
  },
}));
