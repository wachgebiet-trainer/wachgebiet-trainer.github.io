// Baut die Daten für eine Stadt aus amtlicher Stadtgrenze + OpenStreetMap.
// Quellen:
//  - Stadtgrenze: © BKG (VG250, Gemeinden), dl-de/by-2-0, WFS sgx.geodatenzentrum.de
//  - Wachen, Straßen, Bahnhöfe: © OpenStreetMap-Mitwirkende (ODbL), über OpenMapTiles-Kacheln (z14) von OpenFreeMap
// Aufruf: node build/build-osm-city.mjs <stadt-id> [--keep-tiles]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { refineStations, classify, numberOf } from './refine-stations.mjs';

const require = createRequire(import.meta.url);
const { VectorTile } = require('@mapbox/vector-tile');
const PbfMod = require('pbf');
const Pbf = PbfMod.default ?? PbfMod;

const here = path.dirname(new URL(import.meta.url).pathname);
const cities = JSON.parse(fs.readFileSync(path.join(here, '..', 'src', 'cities.json'), 'utf8'));
const id = process.argv[2];
const keepTiles = process.argv.includes('--keep-tiles');
const cfg = cities.find((c) => c.id === id && c.source === 'osm');
if (!cfg) throw new Error(`Unbekannte OSM-Stadt: ${id}`);

const raw = path.join(here, 'raw-cities', id);
const out = path.join(here, '..', 'public', 'data', id);
fs.mkdirSync(path.join(raw, 'tiles'), { recursive: true });
fs.mkdirSync(out, { recursive: true });
const curl = (args) => execFileSync('curl', ['-sS', '--fail', '--retry', '3', ...args], { stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 1 << 28 });

// ---------- Stadtgrenze (BKG VG250) ----------
const boundaryFile = path.join(raw, 'boundary.json');
if (!fs.existsSync(boundaryFile)) {
  const filter = `<Filter xmlns="http://www.opengis.net/fes/2.0"><PropertyIsEqualTo><ValueReference>gen</ValueReference><Literal>${cfg.gen}</Literal></PropertyIsEqualTo></Filter>`;
  const body = curl(['-G', 'https://sgx.geodatenzentrum.de/wfs_vg250',
    '--data-urlencode', 'service=WFS', '--data-urlencode', 'version=2.0.0', '--data-urlencode', 'request=GetFeature',
    '--data-urlencode', 'typeNames=vg250:vg250_gem', '--data-urlencode', 'srsName=EPSG:4326',
    '--data-urlencode', 'outputFormat=application/json', '--data-urlencode', `FILTER=${filter}`]);
  fs.writeFileSync(boundaryFile, body);
}
const gem = JSON.parse(fs.readFileSync(boundaryFile, 'utf8')).features.filter((f) => String(f.properties.ars).startsWith(cfg.ars));
if (!gem.length) throw new Error(`Keine Stadtgrenze für ${cfg.gen}`);
const ringArea = (r) => Math.abs(r.reduce((a, [x1, y1], i) => { const [x2, y2] = r[(i + 1) % r.length]; return a + x1 * y2 - x2 * y1; }, 0) / 2);
let polys = gem.flatMap((f) => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates));
// Nur das Hauptgebiet (größte Fläche) und angrenzende Teile; weit entfernte Inseln (z. B. Neuwerk) weglassen
polys.sort((a, b) => ringArea(b[0]) - ringArea(a[0]));
const main = polys[0];
const mainBox = bboxOf(main[0]);
polys = polys.filter((p) => { const b = bboxOf(p[0]); return b[0] < mainBox[2] + 0.05 && b[2] > mainBox[0] - 0.05 && b[1] < mainBox[3] + 0.05 && b[3] > mainBox[1] - 0.05; });
function bboxOf(ring) {
  let [a, b, c, d] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of ring) { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); }
  return [a, b, c, d];
}
const box = polys.map((p) => bboxOf(p[0])).reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]);
function inRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const inCity = (pt) => pt[0] >= box[0] && pt[0] <= box[2] && pt[1] >= box[1] && pt[1] <= box[3]
  && polys.some(([outer, ...holes]) => inRing(pt, outer) && !holes.some((h) => inRing(pt, h)));

// ---------- Kacheln laden ----------
const z = 14;
const lon2x = (lon) => Math.floor(((lon + 180) / 360) * 2 ** z);
const lat2y = (lat) => { const r = (lat * Math.PI) / 180; return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z); };
const tilejson = JSON.parse(curl(['https://tiles.openfreemap.org/planet']).toString());
const tpl = tilejson.tiles[0];
const tileList = [];
for (let x = lon2x(box[0]); x <= lon2x(box[2]); x++) for (let y = lat2y(box[3]); y <= lat2y(box[1]); y++) tileList.push([x, y]);
const missing = tileList.filter(([x, y]) => !fs.existsSync(path.join(raw, 'tiles', `${x}_${y}.pbf`)));
if (missing.length) {
  const cfgFile = path.join(raw, 'urls.txt');
  fs.writeFileSync(cfgFile, missing.map(([x, y]) => `url = "${tpl.replace('{z}', z).replace('{x}', x).replace('{y}', y)}"\noutput = "${path.join(raw, 'tiles', `${x}_${y}.pbf`)}"`).join('\n'));
  execFileSync('curl', ['-sS', '--parallel', '--parallel-max', '6', '--retry', '3', '-K', cfgFile], { stdio: 'inherit' });
}

// ---------- Auswerten ----------
const CLS = { motorway: 0, trunk: 1, primary: 1, secondary: 2, tertiary: 2, minor: 3, service: 3 };
const names = [];
const nameIdx = new Map();
const segs = [];
const PREC = 1e5;
const transitMap = new Map();
const firePois = [];
const places = [];
for (const [x, y] of tileList) {
  const f = path.join(raw, 'tiles', `${x}_${y}.pbf`);
  if (!fs.existsSync(f)) continue;
  let buf = fs.readFileSync(f);
  if (!buf.length) continue;
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
  const tile = new VectorTile(new Pbf(buf));

  const tn = tile.layers.transportation_name;
  for (let i = 0; tn && i < tn.length; i++) {
    const ft = tn.feature(i);
    const pr = ft.properties;
    const cls = CLS[pr.class];
    if (cls === undefined) continue;
    let name = String(pr['name:de'] || pr.name || '').trim();
    if (pr.class === 'motorway' && pr.ref) name = String(pr.ref).split(';')[0].trim();
    if (!name) continue;
    const g = ft.toGeoJSON(x, y, z).geometry;
    if (g.type !== 'LineString' && g.type !== 'MultiLineString') continue;
    const lines = g.type === 'LineString' ? [g.coordinates] : g.coordinates;
    for (const line of lines) {
      if (!line.some(inCity)) continue;
      let ni = nameIdx.get(name);
      if (ni === undefined) {
        ni = names.length;
        nameIdx.set(name, ni);
        names.push([name, cfg.name]);
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

  const pl = tile.layers.place;
  for (let i = 0; pl && i < pl.length; i++) {
    const ft = pl.feature(i);
    const pr = ft.properties;
    if (!pr.name || !['suburb', 'quarter', 'neighbourhood', 'village', 'hamlet', 'town', 'isolated_dwelling'].includes(pr.class)) continue;
    const c = ft.toGeoJSON(x, y, z).geometry.coordinates;
    if (inCity(c)) places.push({ name: String(pr['name:de'] || pr.name), cls: pr.class, center: [+c[0].toFixed(5), +c[1].toFixed(5)] });
  }

  const poi = tile.layers.poi;
  for (let i = 0; poi && i < poi.length; i++) {
    const ft = poi.feature(i);
    const pr = ft.properties;
    const g = ft.toGeoJSON(x, y, z).geometry;
    const c = g.type === 'Point' ? g.coordinates : g.coordinates[0];
    if (!inCity(c)) continue;
    if (pr.class === 'fire_station' || pr.subclass === 'ambulance_station') {
      firePois.push({ name: String(pr['name:de'] || pr.name || '').trim(), center: c, subclass: pr.subclass });
    }
    if (pr.class === 'railway' && ['station', 'halt', 'subway'].includes(pr.subclass) && pr.name) {
      const rawName = String(pr['name:de'] || pr.name).trim();
      if (/Betriebshof|Pbf$|Gbf$|Rbf$|Güter/.test(rawName)) continue;
      const name = rawName.replace(/^(Bahnhof|Haltepunkt|U-Bahnhof|S-Bahnhof) /, '').replace(/ Bf$/, '').replace(/ - /g, '-');
      if (!transitMap.has(name)) {
        transitMap.set(name, { id: `osm:${name}`, name, modes: pr.subclass === 'subway' ? 'U' : 'S', center: [+c[0].toFixed(6), +c[1].toFixed(6)] });
      }
    }
  }
}

// ---------- Wachen einordnen (Regeln in refine-stations.mjs) ----------
const dist = (a, b) => Math.hypot((a[0] - b[0]) * 111320 * Math.cos((a[1] * Math.PI) / 180), (a[1] - b[1]) * 110540);
const stations = [];
for (const p of firePois) {
  const type = classify(p);
  if (!type) continue;
  const dup = stations.find((s) => s.name.toLowerCase() === p.name.toLowerCase() && dist(s.center, p.center) < 250);
  if (dup) continue;
  const short = p.name
    .replace(/^(Freiwillige Feuerwehr|FF|Feuerwehr|Feuer- und Rettungswache|Feuerwache|Rettungswache|Berufsfeuerwehr)\s*/i, '')
    .replace(new RegExp(`^${cfg.name}\\s*[-–]?\\s*`, 'i'), '')
    .trim() || p.name;
  stations.push({ number: numberOf(p.name, type), type, name: p.name, short, address: '', center: [+p.center[0].toFixed(6), +p.center[1].toFixed(6)] });
}
// Doppelte zusammenfassen, Sondereinrichtungen entfernen
const refined = refineStations(stations, cfg.name);
stations.length = 0;
stations.push(...refined);
// FF/RW direkt an einer BF-Wache (unter 60 m): Standort angleichen
for (const s of stations) {
  if (s.type === 'BF') continue;
  const host = stations.find((b) => b.type === 'BF' && dist(b.center, s.center) < 60);
  if (host) {
    s.center = host.center;
    s.hostedAt = host.name;
  }
}
const slug = (s) => s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const typeOrder = { BF: 0, FF: 1, RW: 2 };
stations.sort((a, b) => typeOrder[a.type] - typeOrder[b.type] || a.name.localeCompare(b.name, 'de', { numeric: true }));
const used = new Set();
for (const s of stations) {
  let k = slug(`${s.number}-${s.short}`).slice(0, 60) || s.type.toLowerCase();
  while (used.has(k)) k += '-x';
  used.add(k);
  s.key = k;
}
const transit = [...transitMap.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'));

const meta = {
  version: 1,
  city: id,
  builtAt: new Date().toISOString(),
  bounds: [[+box[0].toFixed(4), +box[1].toFixed(4)], [+box[2].toFixed(4), +box[3].toFixed(4)]],
  sources: ['Stadtgrenze: © BKG (VG250), dl-de/by-2-0', 'Wachen, Straßen und Bahnhöfe: © OpenStreetMap-Mitwirkende (ODbL)'],
};
fs.writeFileSync(path.join(out, 'stations.json'), JSON.stringify({ meta, stations }));
// Zusatzdaten für den Abgleich (nicht veröffentlicht): unbenannte Feuerwachen und Ortsteile
const unnamed = [];
for (const p of firePois) {
  if (p.name) continue;
  if (stations.some((st) => dist(st.center, p.center) < 120) || unnamed.some((u) => dist(u.center, p.center) < 60)) continue;
  unnamed.push({ center: [+p.center[0].toFixed(6), +p.center[1].toFixed(6)] });
}
const uniqPlaces = [...new Map(places.map((p) => [p.name + p.cls, p])).values()];
fs.writeFileSync(path.join(raw, 'extras.json'), JSON.stringify({ unnamed, places: uniqPlaces }));
fs.writeFileSync(path.join(out, 'streets.json'), JSON.stringify({ precision: PREC, names, segs }));
fs.writeFileSync(path.join(out, 'transit.json'), JSON.stringify({ stations: transit }));
if (!keepTiles) fs.rmSync(path.join(raw, 'tiles'), { recursive: true, force: true });

const count = (t) => stations.filter((s) => s.type === t).length;
const size = (f) => (fs.statSync(path.join(out, f)).size / 1024).toFixed(0);
console.log(`${cfg.name}: ${tileList.length} Kacheln · Wachen ${stations.length} (BF ${count('BF')}, FF ${count('FF')}, RW ${count('RW')}) · unbenannt ${unnamed.length} · Straßen ${names.length} · Bahnhöfe ${transit.length} · streets.json ${size('streets.json')} KB`);
