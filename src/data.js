import { projector } from './geo.js';

const BASE = import.meta.env.BASE_URL + 'data/';

let cache = null;

async function getJSON(name) {
  const res = await fetch(BASE + name);
  if (!res.ok) throw new Error(`${name} konnte nicht geladen werden (${res.status}).`);
  return res.json();
}

export async function loadStations() {
  const d = await getJSON('stations.json');
  return d;
}

// Straßen und Bahnhöfe laden und dekodieren (einmalig)
export async function loadGeo() {
  if (cache) return cache;
  const [streets, transit] = await Promise.all([getJSON('streets.json'), getJSON('transit.json')]);
  const prec = streets.precision;
  const segs = streets.segs.map(([ni, cls, flat]) => {
    const coords = [];
    let x = 0;
    let y = 0;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < flat.length; i += 2) {
      x += flat[i];
      y += flat[i + 1];
      const lng = x / prec;
      const lat = y / prec;
      coords.push([lng, lat]);
      if (lng < minX) minX = lng;
      if (lng > maxX) maxX = lng;
      if (lat < minY) minY = lat;
      if (lat > maxY) maxY = lat;
    }
    return { name: streets.names[ni][0], bezirk: streets.names[ni][1], cls, coords, bbox: [minX, minY, maxX, maxY] };
  });
  cache = { segs, transit: transit.stations };
  return cache;
}

function segWithin(seg, p, r) {
  // grober Boxtest
  const [minX, minY, maxX, maxY] = seg.bbox;
  const bx = Math.max(p.x(minX), Math.min(0, p.x(maxX)));
  const by = Math.max(p.y(minY), Math.min(0, p.y(maxY)));
  if (Math.hypot(bx, by) > r) return false;
  const c = seg.coords;
  for (let i = 0; i < c.length - 1; i++) {
    const ax = p.x(c[i][0]), ay = p.y(c[i][1]);
    const dx = p.x(c[i + 1][0]) - ax, dy = p.y(c[i + 1][1]) - ay;
    const l2 = dx * dx + dy * dy;
    let t = l2 ? -(ax * dx + ay * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    if (Math.hypot(ax + t * dx, ay + t * dy) <= r) return true;
  }
  return false;
}

export const DIFFICULTIES = [
  { value: 'main', label: 'Leicht', hint: 'Hauptstraßen & Bahnhöfe' },
  { value: 'mixed', label: 'Mittel', hint: 'Alle Straßen & Bahnhöfe' },
  { value: 'side', label: 'Schwer', hint: 'Nebenstraßen & Bahnhöfe' },
];

/**
 * Zielpool für eine Wache: alle Straßen (nach Name zusammengefasst) und
 * S-/U-Bahnhöfe innerhalb des Radius.
 */
export function buildPool(geo, center, radius, { difficulty = 'mixed', transit = true } = {}) {
  const p = projector(center);
  const inside = new Map(); // name -> { minCls }
  for (const seg of geo.segs) {
    if (segWithin(seg, p, radius)) {
      const cur = inside.get(seg.name);
      inside.set(seg.name, Math.min(cur ?? 9, seg.cls));
    }
  }
  // Geometrie: alle Abschnitte mit diesem Namen im erweiterten Umkreis
  const geomRadius = radius + 2500;
  const lines = new Map();
  for (const seg of geo.segs) {
    if (!inside.has(seg.name)) continue;
    if (!segWithin(seg, p, geomRadius)) continue;
    if (!lines.has(seg.name)) lines.set(seg.name, []);
    lines.get(seg.name).push(seg.coords);
  }

  const targets = [];
  for (const [name, cls] of inside) {
    const isMain = cls <= 2;
    if (difficulty === 'main' && !isMain) continue;
    if (difficulty === 'side' && isMain) continue;
    targets.push({ id: `s:${name}`, type: 'street', name, cls, lines: lines.get(name) });
  }
  if (transit) {
    for (const st of geo.transit) {
      if (Math.hypot(p.x(st.center[0]), p.y(st.center[1])) <= radius) {
        targets.push({ id: `t:${st.id}`, type: 'transit', name: st.name, modes: st.modes, lines: [[st.center]] });
      }
    }
  }
  targets.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  return targets;
}

// Alle Straßenabschnitte im Umkreis als GeoJSON (für den Erkunden-Modus)
export function streetsGeoJSON(geo, center, radius) {
  const p = projector(center);
  const features = [];
  for (const seg of geo.segs) {
    if (!segWithin(seg, p, radius)) continue;
    features.push({
      type: 'Feature',
      properties: { name: seg.name, cls: seg.cls },
      geometry: { type: 'LineString', coordinates: seg.coords },
    });
  }
  return { type: 'FeatureCollection', features };
}

// Straßenabschnitte gleichen Namens zu durchgehenden Linien verbinden (für Beschriftung)
export function streetNamesGeoJSON(geo, center, radius) {
  const byName = new Map();
  for (const f of streetsGeoJSON(geo, center, radius).features) {
    const n = f.properties.name;
    if (!byName.has(n)) byName.set(n, { cls: f.properties.cls, lines: [] });
    const e = byName.get(n);
    e.cls = Math.min(e.cls, f.properties.cls);
    e.lines.push(f.geometry.coordinates.slice());
  }
  const key = (p) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`;
  const features = [];
  for (const [name, { cls, lines }] of byName) {
    let pool = lines;
    let changed = true;
    while (changed && pool.length > 1) {
      changed = false;
      const out = [];
      while (pool.length) {
        let cur = pool.pop();
        for (let i = pool.length - 1; i >= 0; i--) {
          const l = pool[i];
          const cs = key(cur[0]), ce = key(cur[cur.length - 1]);
          const ls = key(l[0]), le = key(l[l.length - 1]);
          let merged = null;
          if (ce === ls) merged = cur.concat(l.slice(1));
          else if (le === cs) merged = l.concat(cur.slice(1));
          else if (ce === le) merged = cur.concat(l.slice().reverse().slice(1));
          else if (cs === ls) merged = l.slice().reverse().concat(cur.slice(1));
          if (merged) {
            cur = merged;
            pool.splice(i, 1);
            changed = true;
          }
        }
        out.push(cur);
      }
      pool = out;
    }
    // längstes Stück bekommt zusätzlich einen Mittelpunkt für die waagerechte Beschriftung
    let longest = null;
    let longestLen = -1;
    for (const coords of pool) {
      features.push({ type: 'Feature', properties: { name, cls }, geometry: { type: 'LineString', coordinates: coords } });
      let len = 0;
      for (let i = 1; i < coords.length; i++) len += Math.hypot(coords[i][0] - coords[i - 1][0], (coords[i][1] - coords[i - 1][1]) * 1.6);
      if (len > longestLen) [longest, longestLen] = [coords, len];
    }
    if (longest) {
      let acc = 0;
      let mid = longest[0];
      for (let i = 1; i < longest.length; i++) {
        acc += Math.hypot(longest[i][0] - longest[i - 1][0], (longest[i][1] - longest[i - 1][1]) * 1.6);
        if (acc >= longestLen / 2) {
          mid = [(longest[i][0] + longest[i - 1][0]) / 2, (longest[i][1] + longest[i - 1][1]) / 2];
          break;
        }
      }
      features.push({ type: 'Feature', properties: { name, cls, rank: cls * 1000 - Math.round(longestLen * 1e5) }, geometry: { type: 'Point', coordinates: mid } });
    }
  }
  return { type: 'FeatureCollection', features };
}
