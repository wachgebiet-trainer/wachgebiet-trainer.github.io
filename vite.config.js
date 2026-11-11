import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Eine Codebasis, eine Seite pro Stadt: Berlin unter /, Duisburg unter /duisburg/
export default defineConfig({
  base: './',
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      input: {
        berlin: resolve(__dirname, 'index.html'),
        duisburg: resolve(__dirname, 'duisburg/index.html'),
      },
    },
  },
});
