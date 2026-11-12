// Wendet handgepflegte Ergänzungen aus build/supplements/<stadt>.json an.
// Einträge in "add":
//   { "type": "FF", "name": "...", "number": "12", "address": "Straße 1" }  → Ort per Hausnummer (geocode.mjs)
//   { "type": "BF", "name": "...", "query": "Feuerwache 7 Dortmund" }       → OSM-Suche, nur Treffer mit Feuer-/Rettungswache
//   { ..., "at": "Regex auf Namen einer vorhandenen Wache" }                 → gleicher Standort wie diese Wache
//   { ..., "center": [lon, lat] }                                             → fester Ort (nur mit Quelle)
// Einträge in "rename": { "match": "Regex auf Namen", "name": "...", "number": "...", "type": "..." }
// Einträge in "remove": ["Regex auf Namen"]
// Jeder Eintrag sollte "source" (Herkunft der Angabe) tragen.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { geocode } from './geocode.mjs';
import { namesSimilar } from './refine-stations.mjs';

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.join(here, '..');
const cities = JSON.parse(fs.readFileSync(path.join(root, 'src', 'cities.json'), 'utf8'));
const UA = 'WachgebietTrainer/1.0 (https://wachgebiet-trainer.github.io)';
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const dist = (a, b) => Math.hypot((a[0] - b[0]) * 111320 * Math.cos((a[1] * Math.PI) / 180), (a[1] - b[1]) * 110540);
const slug = (t) => t.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function nominatim(q, cfg) {
  const [[w, s], [e, n]] = cfg.bounds;
  const res = JSON.parse(execFileSync('curl', ['-sS', '--fail', '-m', '60', '-A', UA, '-G', 'https://nominatim.openstreetmap.org/search',
    '--data-urlencode', `q=${q}`, '--data-urlencode', `viewbox=${w},${n},${e},${s}`, '--data-urlencode', 'bounded=1',
    '--data-urlencode', 'limit=5', '--data-urlencode', 'format=jsonv2', '--data-urlencode', 'addressdetails=1']).toString());
  sleep(1200);
  const hit = res.find((r) => (r.category === 'amenity' && r.type === 'fire_station') || (r.category === 'emergency' && r.type === 'ambulance_station'));
  if (!hit) return null;
  const a = hit.address || {};
  const address = a.road ? `${a.road}${a.house_number ? ' ' + a.house_number : ''}, ${[a.postcode, a.city || a.town || a.village].filter(Boolean).join(' ')}` : '';
  return { center: [+(+hit.lon).toFixed(6), +(+hit.lat).toFixed(6)], address, osmName: hit.name };
}

export function applySupplements(id) {
  // handgepflegte Datei zuerst, danach automatisch gefundene Ergänzungen
  for (const f of [`${id}.json`, `${id}.auto.json`]) {
    const file = path.join(here, 'supplements', f);
    if (fs.existsSync(file)) applyFile(id, JSON.parse(fs.readFileSync(file, 'utf8')));
  }
}

function applyFile(id, sup) {
  const cfg = cities.find((c) => c.id === id);
  const dataFile = path.join(root, 'public', 'data', id, 'stations.json');
  const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  let st = data.stations;
  const log = [];

  for (const pattern of sup.remove ?? []) {
    const re = new RegExp(pattern, 'i');
    const before = st.length;
    st = st.filter((x) => !re.test(x.name));
    if (st.length < before) log.push(`entfernt: ${pattern}`);
  }
  for (const r of sup.rename ?? []) {
    const re = new RegExp(r.match, 'i');
    for (const x of st.filter((y) => re.test(y.name))) {
      if (r.name) x.name = x.short = r.name;
      if (r.number) x.number = r.number;
      if (r.type) x.type = r.type;
      if (r.address) x.address = r.address;
      log.push(`umbenannt: ${r.match} → ${x.name}`);
    }
  }
  for (const a of sup.add ?? []) {
    let loc = null;
    if (a.at) {
      const host = st.find((x) => new RegExp(a.at, 'i').test(x.name));
      if (host) loc = { center: host.center, address: host.address };
    } else if (a.center) loc = { center: a.center, address: a.address ?? '' };
    else if (a.address) {
      const g = geocode(id, a.address);
      if (g && (g.precision === 'house' || a.allowStreet)) loc = { center: g.center, address: `${a.address}, ${a.postcode ?? ''} ${cfg.name}`.replace(/\s+,/, ',').replace(/,\s+$/, '') };
    } else if (a.query) {
      loc = nominatim(a.query, cfg);
    }
    if (!loc) { log.push(`NICHT GEFUNDEN: ${a.name} (${a.address || a.query || a.at})`); continue; }
    const existing = st.find((x) => x.type === a.type && (x.name.toLowerCase() === a.name.toLowerCase() || (dist(x.center, loc.center) < 100 && namesSimilar(x.name, a.name, cfg.name))));
    if (existing) {
      existing.name = existing.short = a.name;
      if (a.number) existing.number = a.number;
      if (!existing.address && loc.address) existing.address = loc.address;
      log.push(`bestätigt: ${a.name}`);
      continue;
    }
    st.push({ number: a.number ?? (a.type === 'BF' ? 'FW' : a.type), type: a.type, name: a.name, short: a.name, address: loc.address, center: loc.center, source: `supplement:${a.source ?? sup.source ?? ''}` });
    log.push(`ergänzt: ${a.name}`);
  }
  // Einheiten direkt an einer BF-Wache
  for (const x of st) {
    if (x.type === 'BF') continue;
    const host = st.find((b) => b.type === 'BF' && dist(b.center, x.center) < 60);
    if (host) { x.center = host.center; x.hostedAt = host.name; } else delete x.hostedAt;
  }
  const order = { BF: 0, FF: 1, RW: 2 };
  st.sort((p, q) => order[p.type] - order[q.type] || p.name.localeCompare(q.name, 'de', { numeric: true }));
  const used = new Set();
  for (const x of st) {
    let k = x.key && !used.has(x.key) ? x.key : slug(`${x.number}-${x.short}`).slice(0, 60) || x.type.toLowerCase();
    while (used.has(k)) k += '-x';
    x.key = k;
    used.add(k);
  }
  data.stations = st;
  fs.writeFileSync(dataFile, JSON.stringify(data));
  console.log(`${cfg.name}:\n  ${log.join('\n  ')}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const id of process.argv.slice(2)) applySupplements(id);
}
