import { projector } from './geo.js';

import { DATA_BASE, CITY } from './city.js';

const BASE = DATA_BASE;

let cache = null;

async function getJSON(name) {
  const res = await fetch(BASE + name);
  if (!res.ok) throw new Error(`${name} konnte nicht geladen werden (${res.status}).`);
  return res.json();
}

// Amtliche Gebiete der Stadt (z. B. Berliner Einsatzbereiche), falls vorhanden
export async function loadAreas() {
  if (!CITY.areas) return {};
  try {
    return await getJSON('areas.json');
  } catch {
    return {};
  }
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

// Grober Vorfilter: überlappt die Box des Abschnitts die (um pad Meter erweiterte) Box des Gebiets?
function boxNear(seg, area, pad) {
  const [a, b, c, d] = area.bbox;
  const dLon = pad / (Math.cos((area.center[1] * Math.PI) / 180) * 111320), dLat = pad / 110540;
  const [minX, minY, maxX, maxY] = seg.bbox;
  return maxX >= a - dLon && minX <= c + dLon && maxY >= b - dLat && minY <= d + dLat;
}
const segIn = (seg, area, pad = 0) => boxNear(seg, area, pad) && area.touches(seg.coords, pad);

export const DIFFICULTIES = [
  { value: 'main', label: 'Leicht', hint: 'Hauptstraßen & Bahnhöfe' },
  { value: 'mixed', label: 'Mittel', hint: 'Alle Straßen & Bahnhöfe' },
  { value: 'side', label: 'Schwer', hint: 'Nebenstraßen & Bahnhöfe' },
];

/**
 * Zielpool für ein Gebiet (Kreis oder Einsatzbereich): alle Straßen (nach Name zusammengefasst)
 * und Bahnhöfe innerhalb des Gebiets.
 */
export function buildPool(geo, area, { difficulty = 'mixed', transit = true } = {}) {
  const inside = new Map(); // name -> { minCls }
  for (const seg of geo.segs) {
    if (segIn(seg, area)) {
      const cur = inside.get(seg.name);
      inside.set(seg.name, Math.min(cur ?? 9, seg.cls));
    }
  }
  // Geometrie: alle Abschnitte mit diesem Namen im erweiterten Umkreis
  const lines = new Map();
  for (const seg of geo.segs) {
    if (!inside.has(seg.name)) continue;
    if (!boxNear(seg, area, 2500)) continue;
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
      if (area.contains(st.center)) {
        targets.push({ id: `t:${st.id}`, type: 'transit', name: st.name, modes: st.modes, lines: [[st.center]] });
      }
    }
  }
  targets.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  return targets;
}

// Alle Straßenabschnitte im Gebiet (plus Puffer) als GeoJSON (für den Erkunden-Modus)
export function streetsGeoJSON(geo, area, pad = 300) {
  const features = [];
  for (const seg of geo.segs) {
    if (!segIn(seg, area, pad)) continue;
    features.push({
      type: 'Feature',
      properties: { name: seg.name, cls: seg.cls },
      geometry: { type: 'LineString', coordinates: seg.coords },
    });
  }
  return { type: 'FeatureCollection', features };
}

// Objekte (Krankenhäuser, Einkaufszentren …) für den Objekt-Trainer
export async function loadObjects() {
  try {
    return (await getJSON('objects.json')).objects;
  } catch {
    return [];
  }
}

// Straßengraph für den Anfahrt-Trainer (kompaktes Format, siehe roadgraph.js)
export async function loadRoads() {
  return getJSON('roads.json');
}
