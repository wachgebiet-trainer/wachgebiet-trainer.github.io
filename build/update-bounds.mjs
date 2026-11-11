// Überträgt die Kartenausschnitte (bounds) aus public/data/<stadt>/stations.json nach src/cities.json
import fs from 'node:fs';
import path from 'node:path';
const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const file = path.join(root, 'src', 'cities.json');
const cities = JSON.parse(fs.readFileSync(file, 'utf8'));
for (const c of cities) {
  if (c.source !== 'osm') continue;
  const f = path.join(root, 'public', 'data', c.id, 'stations.json');
  if (!fs.existsSync(f)) continue;
  const { meta } = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (meta?.bounds) c.bounds = meta.bounds;
}
fs.writeFileSync(file, '[\n' + cities.map((c) => '  ' + JSON.stringify(c)).join(',\n') + '\n]\n');
console.log('Kartenausschnitte aktualisiert');
