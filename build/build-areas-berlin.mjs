// Einsatzbereiche der Berliner Feuerwehr (Geoportal Berlin, WFS feuerwehr:b_feuerwehr_einsatzbereiche)
// → public/data/berlin/areas.json  { "<eb>": { name, short, geometry: MultiPolygon } }
// Aufruf: node build/build-areas-berlin.mjs   (erwartet build/raw/ewb.json, siehe fetch-data.sh)
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const src = JSON.parse(fs.readFileSync(path.join(here, 'raw', 'ewb.json'), 'utf8')).features;

// Douglas-Peucker in lokalen Metern
function simplify(ring, tol = 5) {
  const k = Math.cos((ring[0][1] * Math.PI) / 180) * 111320;
  const xy = ring.map(([x, y]) => [x * k, y * 110540]);
  const keep = new Uint8Array(ring.length);
  keep[0] = keep[ring.length - 1] = 1;
  const stack = [[0, ring.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let max = 0, idx = -1;
    const [ax, ay] = xy[a], [bx, by] = xy[b];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
    for (let i = a + 1; i < b; i++) {
      // geschlossener Ring (Anfang = Ende): Abstand zum Punkt statt zur Linie
      const d = Math.hypot(dx, dy) < 1e-6 ? Math.hypot(xy[i][0] - ax, xy[i][1] - ay) : Math.abs(dy * (xy[i][0] - ax) - dx * (xy[i][1] - ay)) / len;
      if (d > max) { max = d; idx = i; }
    }
    if (max > tol && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return ring.filter((_, i) => keep[i]).map(([x, y]) => [+x.toFixed(5), +y.toFixed(5)]);
}

const out = {};
for (const f of src) {
  const p = f.properties;
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  out[String(p.eb)] = {
    name: `Einsatzbereich ${p.eb} – ${p.eb_name}`,
    short: `EB ${p.eb}`,
    geometry: { type: 'MultiPolygon', coordinates: polys.map((poly) => poly.map((r) => simplify(r)).filter((r) => r.length >= 4)).filter((poly) => poly.length) },
  };
}
const file = path.join(here, '..', 'public', 'data', 'berlin', 'areas.json');
fs.writeFileSync(file, JSON.stringify(out));
console.log(`Einsatzbereiche: ${Object.keys(out).length} · ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
