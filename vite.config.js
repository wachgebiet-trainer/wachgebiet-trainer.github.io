import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Eine Codebasis: Startseite unter /, je Stadt eine Seite (/berlin/, /duisburg/)
export default defineConfig({
  base: './',
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      input: {
        start: resolve(__dirname, 'index.html'),
        berlin: resolve(__dirname, 'berlin/index.html'),
        duisburg: resolve(__dirname, 'duisburg/index.html'),
      },
    },
  },
});
