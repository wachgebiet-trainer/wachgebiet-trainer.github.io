// Einfacher Adress-Geokodierer ohne externen Dienst:
// Straße aus public/data/<stadt>/streets.json, Hausnummer aus der OpenMapTiles-Ebene „housenumber“ (z14).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { VectorTile } = require('@mapbox/vector-tile');
const PbfMod = require('pbf');
const Pbf = PbfMod.default ?? PbfMod;

const here = path.dirname(new URL(import.meta.url).pathname);
const Z = 14;
let tpl = null;

export const normStreet = (s) =>
  s.toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/str\.?(?=\s|$)/g, 'strasse')
    .replace(/[-\s.]+/g, '')
    .replace(/strasse$/, 'str');

const lon2x = (lon) => Math.floor(((lon + 180) / 360) * 2 ** Z);
const lat2y = (lat) => { const r = (lat * Math.PI) / 180; return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** Z); };

function tileFile(cityId, x, y) {
  const dir = path.join(here, 'raw-cities', cityId, 'tiles');
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, `${x}_${y}.pbf`);
  if (!fs.existsSync(f)) {
    if (!tpl) tpl = JSON.parse(execFileSync('curl', ['-sS', '--fail', 'https://tiles.openfreemap.org/planet']).toString()).tiles[0];
    execFileSync('curl', ['-sS', '--fail', '--retry', '3', '-o', f, tpl.replace('{z}', Z).replace('{x}', x).replace('{y}', y)]);
  }
  return f;
}

function housenumbers(cityId, x, y) {
  let buf = fs.readFileSync(tileFile(cityId, x, y));
  if (!buf.length) return [];
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
  const layer = new VectorTile(new Pbf(buf)).layers.housenumber;
  const out = [];
  for (let i = 0; layer && i < layer.length; i++) {
    const f = layer.feature(i);
    const g = f.toGeoJSON(x, y, Z).geometry;
    const c = g.type === 'Point' ? g.coordinates : g.type === 'MultiPoint' ? g.coordinates[0] : g.coordinates[0][0] ?? g.coordinates[0];
    // „101-103“ oder „101;103“ → alle Einzelnummern
    for (const part of String(f.properties.housenumber).toLowerCase().replace(/\s/g, '').split(/[;,]/)) {
      const r = part.match(/^(\d+)([a-z]?)-(\d+)$/);
      if (r) for (let n = +r[1]; n <= +r[3] && n - +r[1] < 20; n++) out.push({ nr: String(n), c });
      else out.push({ nr: part, c });
    }
  }
  return out;
}

const cache = new Map();
function streetsOf(cityId) {
  if (!cache.has(cityId)) {
    const d = JSON.parse(fs.readFileSync(path.join(here, '..', 'public', 'data', cityId, 'streets.json'), 'utf8'));
    const byName = new Map();
    for (const [ni, , flat] of d.segs) {
      const key = normStreet(d.names[ni][0]);
      const line = [];
      let x = 0, y = 0;
      for (let i = 0; i < flat.length; i += 2) { x += flat[i]; y += flat[i + 1]; line.push([x / d.precision, y / d.precision]); }
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push(line);
    }
    cache.set(cityId, byName);
  }
  return cache.get(cityId);
}

const meters = (a, b) => Math.hypot((a[0] - b[0]) * 111320 * Math.cos((a[1] * Math.PI) / 180), (a[1] - b[1]) * 110540);
function distToLines(p, lines) {
  let best = Infinity;
  for (const l of lines) for (let i = 0; i < l.length - 1; i++) {
    const [ax, ay] = l[i], [bx, by] = l[i + 1];
    const k = Math.cos((p[1] * Math.PI) / 180);
    const dx = (bx - ax) * k, dy = by - ay;
    const len = dx * dx + dy * dy;
    let t = len ? (((p[0] - ax) * k) * dx + (p[1] - ay) * dy) / len : 0;
    t = Math.max(0, Math.min(1, t));
    best = Math.min(best, meters(p, [ax + t * (bx - ax), ay + t * (by - ay)]));
  }
  return best;
}

/** „Musterstraße 12a“ → { center, precision: 'house' | 'street' } oder null */
export function geocode(cityId, address) {
  const m = address.trim().match(/^(.+?)\s+(\d+\s*[a-zA-Z]?)(?:\s*[-–\/]\s*\d+\s*[a-zA-Z]?)?\b/);
  const streetName = (m ? m[1] : address).replace(/,.*$/, '').trim();
  const nr = m ? m[2].toLowerCase().replace(/\s/g, '') : null;
  const lines = streetsOf(cityId).get(normStreet(streetName));
  if (!lines) return null;
  if (nr) {
    const tiles = new Set();
    for (const l of lines) for (const [lx, ly] of l) tiles.add(`${lon2x(lx)}_${lat2y(ly)}`);
    let best = null;
    for (const t of tiles) {
      const [x, y] = t.split('_').map(Number);
      for (const h of housenumbers(cityId, x, y)) {
        if (h.nr !== nr && h.nr !== nr.replace(/[a-z]$/, '')) continue;
        const d = distToLines(h.c, lines);
        if (d < 150 && (!best || d < best.d)) best = { d, c: h.c };
      }
    }
    if (best) return { center: [+best.c[0].toFixed(6), +best.c[1].toFixed(6)], precision: 'house' };
  }
  // ohne passende Hausnummer: Mitte der (längsten) Straßenlinie
  const longest = lines.reduce((a, b) => (b.length > a.length ? b : a));
  const mid = longest[Math.floor(longest.length / 2)];
  return { center: [+mid[0].toFixed(6), +mid[1].toFixed(6)], precision: 'street' };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(geocode(process.argv[2], process.argv.slice(3).join(' '))));
}
