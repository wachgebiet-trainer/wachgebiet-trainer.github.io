// Zusatzdaten je Stadt für Objekt- und Anfahrt-Trainer:
//  - public/data/<id>/objects.json: Krankenhäuser, Einkaufszentren, Veranstaltungsorte … mit Adresse,
//    Notaufnahme und Fachrichtungen (OpenStreetMap über OpenMapTiles-Kacheln + Nominatim-Lookup)
//  - public/data/<id>/roads.json: befahrbarer Straßengraph (Einbahnstraßen, Straßenklassen, Namen)
// Quellen: © OpenStreetMap-Mitwirkende (ODbL); Stadtgrenze © BKG (VG250), dl-de/by-2-0
// Aufruf: node build/build-extras.mjs <stadt-id> [...] [--keep-tiles]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { GraphBuilder } from '../src/roadgraph.js';
import { poiCategory, isEmergencyPoi, osmRef } from '../src/objects.js';

const require = createRequire(import.meta.url);
const { VectorTile } = require('@mapbox/vector-tile');
const PbfMod = require('pbf');
const Pbf = PbfMod.default ?? PbfMod;

const here = path.dirname(new URL(import.meta.url).pathname);
const cities = JSON.parse(fs.readFileSync(path.join(here, '..', 'src', 'cities.json'), 'utf8'));
const keepTiles = process.argv.includes('--keep-tiles');
const ids = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const UA = 'WachgebietTrainer/1.0 (https://wachgebiet-trainer.github.io)';
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const curl = (args) => execFileSync('curl', ['-sS', '--fail', '--retry', '3', ...args], { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28 });
const BOUNDARY_KEYS = { berlin: { gen: 'Berlin', ars: '11' }, duisburg: { gen: 'Duisburg', ars: '05112' } };

let tpl = null;
const tileTemplate = () => (tpl ??= JSON.parse(curl(['https://tiles.openfreemap.org/planet']).toString()).tiles[0]);

function boundary(cfg, raw) {
  const keys = BOUNDARY_KEYS[cfg.id] ?? cfg;
  const file = path.join(raw, 'boundary.json');
  if (!fs.existsSync(file)) {
    const filter = `<Filter xmlns="http://www.opengis.net/fes/2.0"><PropertyIsEqualTo><ValueReference>gen</ValueReference><Literal>${keys.gen}</Literal></PropertyIsEqualTo></Filter>`;
    fs.writeFileSync(file, curl(['-G', 'https://sgx.geodatenzentrum.de/wfs_vg250',
      '--data-urlencode', 'service=WFS', '--data-urlencode', 'version=2.0.0', '--data-urlencode', 'request=GetFeature',
      '--data-urlencode', 'typeNames=vg250:vg250_gem', '--data-urlencode', 'srsName=EPSG:4326',
      '--data-urlencode', 'outputFormat=application/json', '--data-urlencode', `FILTER=${filter}`]));
  }
  const gem = JSON.parse(fs.readFileSync(file, 'utf8')).features.filter((f) => String(f.properties.ars).startsWith(keys.ars));
  const polys = gem.flatMap((f) => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates));
  const inRing = ([x, y], ring) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  if (!polys.length) return () => true;
  return (pt) => polys.some(([outer, ...holes]) => inRing(pt, outer) && !holes.some((h) => inRing(pt, h)));
}

const dist = (a, b) => Math.hypot((b[0] - a[0]) * 111320 * Math.cos((a[1] * Math.PI) / 180), (b[1] - a[1]) * 110540);
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9äöüß]/g, '');

function lookup(refs, cacheFile) {
  const cache = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, 'utf8')) : {};
  const todo = refs.filter((r) => !(r in cache));
  for (let i = 0; i < todo.length; i += 50) {
    const batch = todo.slice(i, i + 50);
    let res = [];
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        res = JSON.parse(curl(['-A', UA, '-G', 'https://nominatim.openstreetmap.org/lookup', '--data-urlencode', `osm_ids=${batch.join(',')}`,
          '--data-urlencode', 'format=jsonv2', '--data-urlencode', 'extratags=1', '--data-urlencode', 'addressdetails=1']).toString());
        break;
      } catch {
        sleep(5000 * (attempt + 1));
      }
    }
    for (const r of batch) cache[r] = null;
    for (const r of res) {
      const ref = `${r.osm_type[0].toUpperCase()}${r.osm_id}`;
      const a = r.address ?? {};
      const street = a.road || a.pedestrian || a.square || a.footway || '';
      cache[ref] = {
        addr: street ? `${street}${a.house_number ? ' ' + a.house_number : ''}` : '',
        emergency: r.extratags?.emergency ?? null,
        spec: r.extratags?.['healthcare:speciality'] ?? null,
      };
    }
    fs.writeFileSync(cacheFile, JSON.stringify(cache));
    sleep(1100);
  }
  return cache;
}

for (const id of ids) {
  const cfg = cities.find((c) => c.id === id);
  if (!cfg) { console.log(`${id}: unbekannt`); continue; }
  const raw = path.join(here, 'raw-cities', id);
  const out = path.join(here, '..', 'public', 'data', id);
  fs.mkdirSync(path.join(raw, 'tiles'), { recursive: true });
  const inCity = boundary(cfg, raw);

  // Kacheln (z14) für den Kartenausschnitt der Stadt
  const z = 14;
  const lon2x = (lon) => Math.floor(((lon + 180) / 360) * 2 ** z);
  const lat2y = (lat) => { const r = (lat * Math.PI) / 180; return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z); };
  const [[w, s], [e, n]] = cfg.bounds;
  const tiles = [];
  for (let x = lon2x(w); x <= lon2x(e); x++) for (let y = lat2y(n); y <= lat2y(s); y++) tiles.push([x, y]);
  const missing = tiles.filter(([x, y]) => !fs.existsSync(path.join(raw, 'tiles', `${x}_${y}.pbf`)));
  if (missing.length) {
    const cfgFile = path.join(raw, 'urls.txt');
    fs.writeFileSync(cfgFile, missing.map(([x, y]) => `url = "${tileTemplate().replace('{z}', z).replace('{x}', x).replace('{y}', y)}"\noutput = "${path.join(raw, 'tiles', `${x}_${y}.pbf`)}"`).join('\n'));
    execFileSync('curl', ['-sS', '--parallel', '--parallel-max', '6', '--retry', '3', '-K', cfgFile], { stdio: 'inherit' });
  }

  const gb = new GraphBuilder(z);
  const found = [];
  const emergencyPts = [];
  for (const [x, y] of tiles) {
    const f = path.join(raw, 'tiles', `${x}_${y}.pbf`);
    if (!fs.existsSync(f)) continue;
    let buf = fs.readFileSync(f);
    if (!buf.length) continue;
    if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
    const tile = new VectorTile(new Pbf(buf));
    gb.addTile(tile, x, y);
    const poi = tile.layers.poi;
    for (let i = 0; poi && i < poi.length; i++) {
      const ft = poi.feature(i);
      const pr = ft.properties;
      const g = ft.toGeoJSON(x, y, z).geometry;
      const c = g.type === 'Point' ? g.coordinates : g.coordinates[0];
      if (isEmergencyPoi(pr)) { emergencyPts.push(c); continue; }
      const cat = poiCategory(pr);
      if (!cat || !inCity(c)) continue;
      found.push({ cat, name: String(pr['name:de'] || pr.name).trim(), center: [+c[0].toFixed(6), +c[1].toFixed(6)], ref: osmRef(ft.id), rank: pr.rank ?? 99 });
    }
  }

  // Doppelte (Kachelrand, Knoten + Fläche) zusammenfassen
  const objects = [];
  for (const o of found.sort((a, b) => a.rank - b.rank)) {
    const dup = objects.find((k) => k.cat === o.cat && dist(k.center, o.center) < 300 && (norm(k.name) === norm(o.name) || dist(k.center, o.center) < 25));
    if (dup) { if (o.ref && !dup.refs.includes(o.ref)) dup.refs.push(o.ref); continue; }
    objects.push({ ...o, refs: o.ref ? [o.ref] : [] });
  }

  // Adresse, Notaufnahme, Fachrichtungen nachschlagen
  const info = lookup([...new Set(objects.flatMap((o) => o.refs))], path.join(raw, 'objects-lookup.json'));
  const result = objects.map((o, i) => {
    const d = o.refs.map((r) => info[r]).filter(Boolean);
    const rec = { id: `o${i}`, c: o.cat, n: o.name, p: o.center };
    const addr = d.find((x) => x.addr)?.addr;
    if (addr) rec.a = addr;
    if (o.cat === 'kh') {
      const em = d.map((x) => x.emergency).find((v) => v != null);
      const near = emergencyPts.some((p) => dist(p, o.center) < 400);
      if (em === 'yes' || near) rec.e = 1;
      else if (em === 'no') rec.e = 0;
      const spec = [...new Set(d.flatMap((x) => (x.spec ? x.spec.split(';').map((s) => s.trim()) : [])))];
      if (spec.length) rec.s = spec;
    }
    // stabile ID aus OSM-Objekt (für den Lernfortschritt)
    if (o.refs[0]) rec.id = o.refs[0];
    return rec;
  });

  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'objects.json'), JSON.stringify({ objects: result }));
  const roads = gb.finalize();
  const roadsJson = JSON.stringify(roads);
  fs.writeFileSync(path.join(out, 'roads.json'), roadsJson);
  const cnt = {};
  for (const r of result) cnt[r.c] = (cnt[r.c] ?? 0) + 1;
  const kh = result.filter((r) => r.c === 'kh');
  console.log(`${cfg.name}: ${tiles.length} Kacheln · Objekte ${result.length} (${Object.entries(cnt).map(([k, v]) => `${k} ${v}`).join(', ')}) · KH mit Notaufnahme ${kh.filter((k) => k.e === 1).length}/${kh.length}, mit Fachrichtungen ${kh.filter((k) => k.s).length} · mit Adresse ${result.filter((r) => r.a).length} · Straßengraph ${roads.edges.length} Kanten, ${(roadsJson.length / 1024).toFixed(0)} KB (gz ${(zlib.gzipSync(roadsJson).length / 1024).toFixed(0)} KB)`);
  if (!keepTiles) fs.rmSync(path.join(raw, 'tiles'), { recursive: true, force: true });
}
