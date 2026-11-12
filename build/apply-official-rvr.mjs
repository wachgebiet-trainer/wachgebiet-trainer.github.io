// Amtliche Wachenstandorte des Regionalverbands Ruhr (RVR, POI-Datensatz, © Regionalverband Ruhr, dl-de/by-2-0)
// werden mit den Daten aus OpenStreetMap zusammengeführt: amtliche Einträge bestätigen vorhandene Wachen
// (amtlicher Name und Adresse), fehlende werden ergänzt, nur in OSM vorhandene bleiben erhalten.
// Aufruf: node build/apply-official-rvr.mjs <stadt-id> [...]   (erwartet build/raw-official/rvr_rettung.json)
import fs from 'node:fs';
import path from 'node:path';
import { numberOf, namesSimilar, BF } from './refine-stations.mjs';

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.join(here, '..');
const cities = JSON.parse(fs.readFileSync(path.join(root, 'src', 'cities.json'), 'utf8'));
const dist = (a, b) => Math.hypot((a[0] - b[0]) * 111320 * Math.cos((a[1] * Math.PI) / 180), (a[1] - b[1]) * 110540);
const slug = (t) => t.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ETRS89 / UTM Zone 32N (EPSG:25832) → WGS84 Länge/Breite
export function utm32ToLonLat(E, N) {
  const a = 6378137, f = 1 / 298.257222101, k0 = 0.9996, e2 = f * (2 - f), ep2 = e2 / (1 - e2);
  const x = E - 500000, y = N;
  const M = y / k0;
  const mu = M / (a * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 ** 3) / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const phi1 = mu + ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) + ((21 * e1 * e1) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu)
    + ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) + ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
  const C1 = ep2 * Math.cos(phi1) ** 2, T1 = Math.tan(phi1) ** 2;
  const N1 = a / Math.sqrt(1 - e2 * Math.sin(phi1) ** 2), R1 = (a * (1 - e2)) / (1 - e2 * Math.sin(phi1) ** 2) ** 1.5;
  const D = x / (N1 * k0);
  const lat = phi1 - ((N1 * Math.tan(phi1)) / R1) * (D * D / 2 - ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4) / 24
    + ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6) / 720);
  const lon = (D - ((1 + 2 * T1 + C1) * D ** 3) / 6 + ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5) / 120) / Math.cos(phi1);
  return [+(9 + (lon * 180) / Math.PI).toFixed(6), +((lat * 180) / Math.PI).toFixed(6)];
}

const SKIP = /^amt für|jugendfeuerwehr|kinderfeuerwehr|musikzug|ehrenabteilung|alters|verwaltung|leitstelle|werkstatt|lager|schule|akademie/i;
const TYPE = { Berufsfeuerwehr: 'BF', 'freiwillige Feuerwehr': 'FF', Rettungswachen: 'RW' };

export function applyRvr(id) {
  const cfg = cities.find((c) => c.id === id);
  if (!cfg?.rvr) throw new Error(`${id}: keine RVR-Stadt`);
  const rvr = JSON.parse(fs.readFileSync(path.join(here, 'raw-official', 'rvr_rettung.json'), 'utf8')).features
    .filter((f) => f.properties.ort === cfg.rvr && !SKIP.test(f.properties.name || ''));
  const official = [];
  for (const f of rvr) {
    const p = f.properties;
    let type = TYPE[p.kategorie];
    if (type === 'RW' && BF.test(p.name || '')) type = 'BF';
    const name = (p.name || '').replace(/\s+/g, ' ').trim();
    if (!type || !name) continue;
    const center = utm32ToLonLat(...f.geometry.coordinates);
    const street = [p.strasse, p.hausnummer].map((s) => (s || '').trim()).filter(Boolean).join(' ');
    const address = street ? `${street}, ${[p.plz, p.ort].filter(Boolean).join(' ')}` : '';
    // Feuer- und Rettungswachen stehen doppelt drin (als BF und als Rettungswache) → nur einmal, BF bevorzugt
    const twin = official.find((o) => o.name === name && dist(o.center, center) < 50);
    if (twin) { if (type === 'BF') twin.type = 'BF'; continue; }
    // zu allgemeine amtliche Namen („Berufsfeuerwehr Dortmund“) um die Straße ergänzen
    const label = /^(städtische )?berufsfeuerwehr( [a-zäöüß. -]+)?$/i.test(name) && p.strasse ? `${name} (${p.strasse.trim()})` : name;
    official.push({ number: numberOf(name, type), type, name: label, short: label, rawName: name, address, center, source: 'rvr' });
  }
  // Rettungswache am selben Ort wie eine BF-Wache: ist die Feuer- und Rettungswache selbst
  const offFinal = official.filter((o) => !(o.type === 'RW' && official.some((b) => b.type === 'BF' && dist(b.center, o.center) < 40)));

  const file = path.join(root, 'public', 'data', id, 'stations.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const st = data.stations;
  let confirmed = 0, added = 0;
  for (const o of offFinal) {
    const match = st.find((x) => x.type === o.type && (x.name.toLowerCase() === o.rawName.toLowerCase() || (dist(x.center, o.center) < 150 && namesSimilar(x.name, o.rawName, cfg.name))))
      || st.find((x) => x.type === o.type && dist(x.center, o.center) < 80);
    if (match) {
      // amtlichen Namen nur übernehmen, wenn er nicht allgemeiner ist (z. B. „Städtische Berufsfeuerwehr“)
      if (!/^städtische|^berufsfeuerwehr\b/i.test(o.rawName)) match.name = match.short = o.name;
      if (o.address) match.address = o.address;
      if (/\d/.test(o.number)) match.number = o.number; // amtliche Nummer hat Vorrang
      match.source = 'rvr';
      delete o.rawName;
      confirmed++;
    } else {
      delete o.rawName;
      st.push(o);
      added++;
    }
  }
  for (const x of st) {
    if (x.type === 'BF') continue;
    const host = st.find((b) => b.type === 'BF' && dist(b.center, x.center) < 60);
    if (host) { x.center = host.center; x.hostedAt = host.name; } else delete x.hostedAt;
  }
  const order = { BF: 0, FF: 1, RW: 2 };
  st.sort((a, b) => order[a.type] - order[b.type] || a.name.localeCompare(b.name, 'de', { numeric: true }));
  const used = new Set();
  for (const x of st) {
    let k = slug(`${x.number}-${x.short}`).slice(0, 60) || x.type.toLowerCase();
    while (used.has(k)) k += '-x';
    x.key = k;
    used.add(k);
  }
  data.stations = st;
  data.meta.stationSource = 'rvr+osm';
  fs.writeFileSync(file, JSON.stringify(data));
  const c = (t) => st.filter((x) => x.type === t).length;
  console.log(`${cfg.name}: amtlich ${offFinal.length} (bestätigt ${confirmed}, neu ${added}) → gesamt BF ${c('BF')} FF ${c('FF')} RW ${c('RW')}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const id of process.argv.slice(2)) applyRvr(id);
}
