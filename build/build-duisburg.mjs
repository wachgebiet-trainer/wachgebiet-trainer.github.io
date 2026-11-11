// Baut die Datendateien für Duisburg.
// Quellen:
//  - Wachen, Stadtgrenze, Stadtbezirke: Geoportal Duisburg (OpenData-MapServer, CC BY 3.0 DE)
//  - Straßen und Bahnhöfe: OpenStreetMap über OpenMapTiles-Kacheln (z14) von OpenFreeMap (ODbL)
// Aufruf: node build/build-duisburg.mjs   (erwartet build/raw-duisburg/, siehe fetch-duisburg.sh)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { VectorTile } = require('@mapbox/vector-tile');
const PbfMod = require('pbf');
const Pbf = PbfMod.default ?? PbfMod;

const here = path.dirname(new URL(import.meta.url).pathname);
const raw = path.join(here, 'raw-duisburg');
const out = path.join(here, '..', 'public', 'data', 'duisburg');
fs.mkdirSync(out, { recursive: true });
const readJSON = (f) => JSON.parse(fs.readFileSync(path.join(raw, f), 'utf8'));

// ---------- Geometrie-Helfer ----------
function rings(geom) {
  return geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
}
function inRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inPolys(pt, polys) {
  return polys.some(([outer, ...holes]) => inRing(pt, outer) && !holes.some((h) => inRing(pt, h)));
}

const city = rings(readJSON('stadtgebiet.geojson').features[0].geometry);
const districts = readJSON('stadtbezirke.geojson').features.map((f) => ({ name: f.properties.STBNAME, polys: rings(f.geometry) }));
const districtOf = (pt) => districts.find((d) => inPolys(pt, d.polys))?.name ?? null;

// ---------- Wachen ----------
const rettung = readJSON('rettung.geojson').features;
const slug = (s) => s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const fmtAddress = (a) => a.replace(/\s+/g, ' ').replace(/ (\d{5}) /, ', $1 ').trim();

const stations = [];
for (const f of rettung) {
  const p = f.properties;
  const bez = (p.BEZ || '').trim();
  const [lng, lat] = f.geometry.coordinates;
  const base = {
    address: fmtAddress(p.ADRESSE || ''),
    center: [+lng.toFixed(6), +lat.toFixed(6)],
    area: districtOf([lng, lat]),
  };
  let m;
  if (p.COL_NAME === 'Feuerwehr' && (m = bez.match(/^Feuer- und Rettungswache (\d)$/))) {
    stations.push({ number: `FRW ${m[1]}`, type: 'BF', name: `Feuer- und Rettungswache ${m[1]}`, short: `FRW ${m[1]}`, ...base });
  } else if (p.COL_NAME === 'FeuerwehrFreiwillige' && (m = bez.match(/^Freiwillige Feuerwehr-Löschzug (\d{3}) ?\/ ?([^()]+?)(?: \((\d{3})\))?$/))) {
    const [, zug, ort, gruppe] = m;
    const place = ort.replace(/,/g, '/').trim();
    stations.push({ number: gruppe ?? zug, type: 'FF', name: `Löschzug ${zug} ${place}`, short: place, ...base });
  } else if (p.COL_NAME === 'FeuerwehrFreiwillige' && (m = bez.match(/^Freiwillige Feuerwehr-(\d{3}) (.+)$/))) {
    stations.push({ number: m[1], type: 'FF', name: `${m[2]} ${m[1]}`, short: m[2], ...base });
  } else if (/^Rettungswache/.test(bez)) {
    const nr = bez.match(/(\d+)$/)?.[1];
    stations.push({ number: nr ? `RW ${nr}` : 'RW', type: 'RW', name: bez, short: bez.replace(/^Rettungswache /, ''), ...base });
  }
}
// Einheiten an derselben Adresse wie eine Feuer- und Rettungswache: Standort angleichen
for (const s of stations) {
  if (s.type === 'BF') continue;
  const host = stations.find((b) => b.type === 'BF' && b.address === s.address);
  if (host) {
    s.center = host.center;
    s.hostedAt = host.name;
  }
}
const typeOrder = { BF: 0, FF: 1, RW: 2 };
stations.sort((a, b) => typeOrder[a.type] - typeOrder[b.type] || a.number.localeCompare(b.number, 'de', { numeric: true }) || a.name.localeCompare(b.name, 'de'));
stations.forEach((s) => (s.key = slug(`${s.number}-${s.short}`)));

// ---------- Straßen und Bahnhöfe aus den Kacheln ----------
const CLS = { motorway: 0, trunk: 1, primary: 1, secondary: 2, tertiary: 2, minor: 3, service: 3 };
const names = [];
const nameIdx = new Map();
const segs = [];
const PREC = 1e5;
const transitMap = new Map();
const tilesDir = path.join(raw, 'tiles');
for (const file of fs.readdirSync(tilesDir)) {
  let buf = fs.readFileSync(path.join(tilesDir, file));
  if (!buf.length) continue;
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
  const [x, y] = file.replace('.pbf', '').split('_').map(Number);
  const tile = new VectorTile(new Pbf(buf));

  const tn = tile.layers.transportation_name;
  for (let i = 0; tn && i < tn.length; i++) {
    const ft = tn.feature(i);
    const pr = ft.properties;
    const cls = CLS[pr.class];
    if (cls === undefined) continue;
    let name = (pr['name:de'] || pr.name || '').trim();
    if (pr.class === 'motorway' && pr.ref) name = String(pr.ref).split(';')[0].trim();
    if (!name) continue;
    const g = ft.toGeoJSON(x, y, 14).geometry;
    if (g.type !== 'LineString' && g.type !== 'MultiLineString') continue;
    const lines = g.type === 'LineString' ? [g.coordinates] : g.coordinates;
    for (const line of lines) {
      if (!line.some((pt) => inPolys(pt, city))) continue;
      const bez = districtOf(line[Math.floor(line.length / 2)]) ?? districtOf(line[0]) ?? 'Duisburg';
      const key = `${name}|${bez}`;
      let ni = nameIdx.get(key);
      if (ni === undefined) {
        ni = names.length;
        nameIdx.set(key, ni);
        names.push([name, bez]);
      }
      const flat = [];
      let px = 0, py = 0;
      for (const [lx, ly] of line) {
        const ix = Math.round(lx * PREC), iy = Math.round(ly * PREC);
        if (flat.length && ix === px && iy === py) continue;
        flat.push(ix - px, iy - py);
        px = ix; py = iy;
      }
      if (flat.length >= 4) segs.push([ni, cls, flat]);
    }
  }

  const poi = tile.layers.poi;
  for (let i = 0; poi && i < poi.length; i++) {
    const ft = poi.feature(i);
    const pr = ft.properties;
    if (pr.class !== 'railway' || !['station', 'halt', 'subway'].includes(pr.subclass) || !pr.name) continue;
    const g = ft.toGeoJSON(x, y, 14).geometry;
    const c = g.type === 'Point' ? g.coordinates : g.coordinates[0];
    if (!inPolys(c, city)) continue;
    const raw = String(pr['name:de'] || pr.name).trim();
    if (/Betriebshof|Pbf$|Gbf$/.test(raw)) continue; // keine Personenbahnhöfe
    const name = raw
      .replace(/^(Bahnhof|Haltepunkt|U-Bahnhof) /, '')
      .replace(/ Bf$/, '')
      .replace(/ - /g, '-')
      .replace(/^Duisburg Hauptbahnhof$/, 'Duisburg Hbf');
    if (!transitMap.has(name)) {
      transitMap.set(name, {
        id: `osm:${slug(name)}`, name, modes: pr.subclass === 'subway' ? 'U' : 'S',
        center: [+c[0].toFixed(6), +c[1].toFixed(6)],
      });
    }
  }
}
const transit = [...transitMap.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'));

const meta = {
  version: 1,
  city: 'duisburg',
  builtAt: new Date().toISOString(),
  sources: [
    'Stadt Duisburg – Open Data „Rettung“, Stadtgebiet, Stadtbezirke (Geoportal Duisburg), CC BY 3.0 DE',
    'Straßen und Bahnhöfe: © OpenStreetMap-Mitwirkende (ODbL), über OpenMapTiles/OpenFreeMap',
  ],
};
fs.writeFileSync(path.join(out, 'stations.json'), JSON.stringify({ meta, stations }));
fs.writeFileSync(path.join(out, 'streets.json'), JSON.stringify({ precision: PREC, names, segs }));
fs.writeFileSync(path.join(out, 'transit.json'), JSON.stringify({ stations: transit }));

const count = (t) => stations.filter((s) => s.type === t).length;
console.log(`Wachen: ${stations.length} (BF ${count('BF')}, FF ${count('FF')}, RW ${count('RW')})`);
console.log(`Straßen: ${new Set(names.map((n) => n[0])).size} Namen, ${segs.length} Segmente`);
console.log(`Bahnhöfe: ${transit.length}`);
for (const f of ['stations.json', 'streets.json', 'transit.json'])
  console.log(f, (fs.statSync(path.join(out, f)).size / 1024).toFixed(0), 'KB');
