import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

// Eine Codebasis: Startseite unter /, je Stadt eine Seite (/berlin/, /duisburg/, …)
// Die Stadtseiten erzeugt build/make-pages.mjs aus src/cities.json.
const cities = JSON.parse(readFileSync(resolve(__dirname, 'src/cities.json'), 'utf8'));

export default defineConfig({
  base: './',
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      input: {
        start: resolve(__dirname, 'index.html'),
        ...Object.fromEntries(cities.map((c) => [c.id, resolve(__dirname, `${c.id}/index.html`)])),
      },
    },
  },
});
