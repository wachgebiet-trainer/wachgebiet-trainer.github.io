// Erzeugt für jede Stadt aus src/cities.json eine Seite <id>/index.html
import fs from 'node:fs';
import path from 'node:path';
const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const cities = JSON.parse(fs.readFileSync(path.join(root, 'src', 'cities.json'), 'utf8'));
const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
for (const c of cities) {
  const desc = c.id === 'berlin'
    ? 'Ortskunde-Training für Berufsfeuerwehr und Freiwillige Feuerwehren in Berlin.'
    : `Ortskunde-Training für Feuerwehr und Rettungsdienst in ${c.name}.`;
  const html = `<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, interactive-widget=resizes-content" />
    <meta name="wachgebiet-city" content="${c.id}" />
    <meta name="theme-color" content="#e30613" />
    <meta name="description" content="${esc(desc)}" />
    <title>Wachgebiet-Trainer ${esc(c.name)}</title>
    <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 100 100%27%3E%3Ctext y=%27.9em%27 font-size=%2790%27%3E%F0%9F%9A%A8%3C/text%3E%3C/svg%3E" />
  </head>
  <body>
    <div id="app" data-view="loading">
      <aside id="panel" aria-live="polite"></aside>
      <main id="map" aria-label="Karte"></main>
      <div id="toast" role="status"></div>
    </div>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
`;
  fs.mkdirSync(path.join(root, c.id), { recursive: true });
  fs.writeFileSync(path.join(root, c.id, 'index.html'), html);
}
console.log(`${cities.length} Stadtseiten erzeugt`);
