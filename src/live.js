// Freie Suche: Straßen, Bahnhöfe und Feuerwachen live aus den OpenStreetMap-Kartenkacheln (OpenFreeMap)
// rund um einen Punkt laden – im gleichen Format wie loadGeo() in data.js.
import { VectorTile } from '@mapbox/vector-tile';
import Pbf from 'pbf';
import { GraphBuilder } from './roadgraph.js';
import { poiCategory, isEmergencyPoi } from './objects.js';

const TILEJSON = 'https://tiles.openfreemap.org/planet';
const Z = 14;
const CLS = { motorway: 0, trunk: 1, primary: 1, secondary: 2, tertiary: 2, minor: 3, service: 3 };

const lon2x = (lon) => Math.floor(((lon + 180) / 360) * 2 ** Z);
const lat2y = (lat) => { const r = (lat * Math.PI) / 180; return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** Z); };

let template = null;
async function tileTemplate() {
  if (!template) template = (await (await fetch(TILEJSON)).json()).tiles[0];
  return template;
}

async function fetchTile(x, y) {
  const url = (await tileTemplate()).replace('{z}', Z).replace('{x}', x).replace('{y}', y);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 204 || res.status === 404) return null;
      if (!res.ok) throw new Error(res.status);
      return new VectorTile(new Pbf(new Uint8Array(await res.arrayBuffer())));
    } catch (e) {
      if (attempt === 2) throw e;
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    }
  }
  return null;
}

/**
 * Lädt alle Kacheln im Umkreis (Meter) um center und liefert { segs, transit, fireStations }.
 * onProgress(geladen, gesamt) für die Fortschrittsanzeige.
 */
export async function loadLiveGeo(center, radius = 5500, onProgress = () => {}) {
  const [lon, lat] = center;
  const dLon = radius / (Math.cos((lat * Math.PI) / 180) * 111320);
  const dLat = radius / 110540;
  const tiles = [];
  for (let x = lon2x(lon - dLon); x <= lon2x(lon + dLon); x++) {
    for (let y = lat2y(lat + dLat); y <= lat2y(lat - dLat); y++) tiles.push([x, y]);
  }
  const segs = [];
  const transit = new Map();
  const fireStations = [];
  const found = [];
  const emergency = [];
  const gb = new GraphBuilder(Z);
  let done = 0;
  const queue = tiles.slice();
  async function worker() {
    while (queue.length) {
      const [x, y] = queue.shift();
      const tile = await fetchTile(x, y);
      done++;
      onProgress(done, tiles.length);
      if (!tile) continue;
      gb.addTile(tile, x, y);
      const tn = tile.layers.transportation_name;
      for (let i = 0; tn && i < tn.length; i++) {
        const ft = tn.feature(i);
        const pr = ft.properties;
        const cls = CLS[pr.class];
        if (cls === undefined) continue;
        let name = String(pr['name:de'] || pr.name || '').trim();
        if (pr.class === 'motorway' && pr.ref) name = String(pr.ref).split(';')[0].trim();
        if (!name) continue;
        const g = ft.toGeoJSON(x, y, Z).geometry;
        if (g.type !== 'LineString' && g.type !== 'MultiLineString') continue;
        for (const coords of g.type === 'LineString' ? [g.coordinates] : g.coordinates) {
          if (coords.length < 2) continue;
          let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
          for (const [px, py] of coords) { if (px < a) a = px; if (py < b) b = py; if (px > c) c = px; if (py > d) d = py; }
          segs.push({ name, bezirk: '', cls, coords, bbox: [a, b, c, d] });
        }
      }
      const poi = tile.layers.poi;
      for (let i = 0; poi && i < poi.length; i++) {
        const ft = poi.feature(i);
        const pr = ft.properties;
        const g = ft.toGeoJSON(x, y, Z).geometry;
        const c = g.type === 'Point' ? g.coordinates : g.coordinates[0];
        if (pr.class === 'railway' && ['station', 'halt', 'subway'].includes(pr.subclass) && pr.name) {
          const raw = String(pr['name:de'] || pr.name).trim();
          if (/Betriebshof|Pbf$|Gbf$|Rbf$|Güter/.test(raw)) continue;
          const name = raw.replace(/^(Bahnhof|Haltepunkt|U-Bahnhof|S-Bahnhof) /, '').replace(/ Bf$/, '');
          if (!transit.has(name)) transit.set(name, { id: `osm:${name}`, name, modes: pr.subclass === 'subway' ? 'U' : 'S', center: c });
        }
        if (pr.class === 'fire_station' && pr.name) fireStations.push({ name: String(pr.name), center: c });
        if (isEmergencyPoi(pr)) emergency.push(c);
        const cat = poiCategory(pr);
        if (cat) found.push({ c: cat, n: String(pr['name:de'] || pr.name).trim(), p: c, fid: ft.id });
      }
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  // Objekte: Doppelte (Kachelrand, Knoten + Fläche) zusammenfassen
  const d = (a, b) => Math.hypot((b[0] - a[0]) * 111320 * Math.cos((a[1] * Math.PI) / 180), (b[1] - a[1]) * 110540);
  const objects = [];
  for (const o of found) {
    if (objects.some((k) => k.c === o.c && d(k.p, o.p) < 300 && (k.n === o.n || d(k.p, o.p) < 25))) continue;
    const rec = { id: `L${o.fid ?? objects.length}`, c: o.c, n: o.n, p: o.p };
    if (o.c === 'kh' && emergency.some((p) => d(p, o.p) < 400)) rec.e = 1;
    objects.push(rec);
  }
  return { segs, transit: [...transit.values()], fireStations, objects, roads: gb.finalize() };
}
