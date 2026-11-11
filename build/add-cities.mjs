// Fügt Städte zu src/cities.json hinzu (bestehende Einträge bleiben unverändert)
// Aufruf: node build/add-cities.mjs '<json-array mit {id,name,kfz,gen,ars}>'
import fs from 'node:fs';
import path from 'node:path';
const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const file = path.join(root, 'src', 'cities.json');
const cities = JSON.parse(fs.readFileSync(file, 'utf8'));
const add = JSON.parse(process.argv[2]);
let n = 0;
for (const c of add) {
  if (cities.some((x) => x.id === c.id)) continue;
  cities.push({ id: c.id, name: c.name, kfz: c.kfz, source: 'osm', gen: c.gen ?? c.name, ars: c.ars });
  n++;
}
cities.sort((a, b) => a.name.localeCompare(b.name, 'de'));
fs.writeFileSync(file, '[\n' + cities.map((c) => '  ' + JSON.stringify(c)).join(',\n') + '\n]\n');
console.log(`${n} Städte ergänzt, insgesamt ${cities.length}`);
