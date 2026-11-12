// Ergänzt Wachen und Adressen über die OpenStreetMap-Suche (Nominatim).
//  - fragt amenity=fire_station und emergency=ambulance_station im Stadtgebiet ab (gecacht)
//  - ergänzt Adressen bestehender Wachen
//  - fügt fehlende benannte Wachen hinzu; unbenannte nur, wenn die Stadt laut Wikipedia noch Lücken hat
// Aufruf: node build/enrich-nominatim.mjs <stadt-id> [...]   (Nutzungsregeln: max. 1 Anfrage/Sekunde)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { refineStations, classify, numberOf, SKIP, namesSimilar } from './refine-stations.mjs';

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.join(here, '..');
const cities = JSON.parse(fs.readFileSync(path.join(root, 'src', 'cities.json'), 'utf8'));
const UA = 'WachgebietTrainer/1.0 (https://wachgebiet-trainer.github.io)';
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const dist = (a, b) => Math.hypot((a[0] - b[0]) * 111320 * Math.cos((a[1] * Math.PI) / 180), (a[1] - b[1]) * 110540);

function inRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function search(query, box) {
  const results = [];
  const seen = new Set();
  for (let page = 0; page < 8; page++) {
    const args = ['-sS', '--fail', '-m', '60', '-A', UA, '-G', 'https://nominatim.openstreetmap.org/search',
      '--data-urlencode', `q=${query}`, '--data-urlencode', `viewbox=${box[0]},${box[3]},${box[2]},${box[1]}`,
      '--data-urlencode', 'bounded=1', '--data-urlencode', 'limit=50', '--data-urlencode', 'format=jsonv2',
      '--data-urlencode', 'addressdetails=1', '--data-urlencode', 'extratags=1'];
    if (seen.size) args.push('--data-urlencode', `exclude_place_ids=${[...seen].join(',')}`);
    const res = JSON.parse(execFileSync('curl', args).toString());
    sleep(1200);
    const fresh = res.filter((r) => !seen.has(r.place_id));
    fresh.forEach((r) => { seen.add(r.place_id); results.push(r); });
    if (res.length < 50 || !fresh.length) break;
  }
  return results;
}

function formatAddress(a) {
  if (!a?.road) return '';
  const street = `${a.road}${a.house_number ? ' ' + a.house_number : ''}`;
  const city = a.city || a.town || a.village || '';
  return `${street}${a.postcode || city ? ', ' : ''}${[a.postcode, city].filter(Boolean).join(' ')}`;
}

export function enrich(id) {
  const cfg = cities.find((c) => c.id === id);
  const raw = path.join(here, 'raw-cities', id);
  const boundary = JSON.parse(fs.readFileSync(path.join(raw, 'boundary.json'), 'utf8')).features.filter((f) => String(f.properties.ars).startsWith(cfg.ars));
  const polys = boundary.flatMap((f) => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates));
  const inCity = (pt) => polys.some(([outer, ...holes]) => inRing(pt, outer) && !holes.some((h) => inRing(pt, h)));
  const [[w, s], [e, n]] = cfg.bounds;

  const cache = path.join(raw, 'nominatim.json');
  let found;
  if (fs.existsSync(cache)) found = JSON.parse(fs.readFileSync(cache, 'utf8'));
  else {
    found = [...search('[fire_station]', [w, s, e, n]).map((r) => ({ ...r, kind: 'fire' })), ...search('[ambulance_station]', [w, s, e, n]).map((r) => ({ ...r, kind: 'ambulance' }))];
    fs.writeFileSync(cache, JSON.stringify(found));
  }
  const items = found
    .map((r) => ({ name: (r.name || '').trim(), kind: r.kind, center: [+(+r.lon).toFixed(6), +(+r.lat).toFixed(6)], address: formatAddress(r.address), suburb: r.address?.suburb || r.address?.city_district || r.address?.quarter || '' }))
    .filter((r) => inCity(r.center) && !(r.name && SKIP.test(r.name)));

  const file = path.join(root, 'public', 'data', id, 'stations.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const st = data.stations;
  const gaps = JSON.parse(fs.readFileSync(path.join(here, 'raw-wiki', 'completeness.json'), 'utf8')).find((r) => r.id === id);
  let ffGap = gaps && gaps.wikiFf != null ? Math.max(0, gaps.wikiFf - st.filter((x) => x.type === 'FF').length) : 0;
  let added = 0, addresses = 0;

  for (const it of items) {
    const type = it.name ? classify({ name: it.name, subclass: it.kind === 'ambulance' ? 'ambulance_station' : '' }) : it.kind === 'ambulance' ? 'RW' : null;
    // passende vorhandene Wache: gleicher Name oder sehr nah
    const match = st.find((x) => (it.name && x.name.toLowerCase() === it.name.toLowerCase()) || (dist(x.center, it.center) < (it.name ? 80 : 120) && (!it.name || namesSimilar(x.name, it.name, cfg.name))));
    if (match) {
      if (!match.address && it.address) { match.address = it.address; addresses++; }
      continue;
    }
    if (type && it.name) {
      // zu allgemeine Namen („Rettungswache“, „Deutsches Rotes Kreuz“) um Ortsteil oder Straße ergänzen
      const generic = /^(rettungswache|feuerwehr|freiwillige feuerwehr|deutsches rotes kreuz|johanniter(-unfall-hilfe)?( e\. ?v\.)?|malteser hilfsdienst( e\. ?v\.)?|arbeiter-samariter-bund|drk rettungswache|johanniter rettungswache|malteser rettungswache|rettungswache malteser|rettungswache johanniter(-| )unfall(-| )?hilfe)$/i.test(it.name);
      const where = it.suburb || it.address.split(',')[0];
      const name = generic && where ? `${it.name} (${where})` : it.name;
      st.push({ number: numberOf(it.name, type), type, name, short: name, address: it.address, center: it.center, source: 'nominatim' });
      added++;
    } else if (!it.name && it.kind === 'fire' && ffGap > 0) {
      const where = it.suburb || it.address.split(',')[0] || cfg.name;
      st.push({ number: 'FF', type: 'FF', name: `Feuerwehrhaus ${where}`, short: where, address: it.address, center: it.center, source: 'nominatim-unnamed' });
      added++;
      ffGap--;
    } else if (!it.name && it.kind === 'ambulance') {
      const where = it.suburb || it.address.split(',')[0] || cfg.name;
      st.push({ number: 'RW', type: 'RW', name: `Rettungswache ${where}`, short: where, address: it.address, center: it.center, source: 'nominatim-unnamed' });
      added++;
    }
  }
  // allgemeine Namen eindeutig machen (Straße der Adresse anhängen)
  const GENERIC = /^(rettungswache|feuerwehr|freiwillige feuerwehr|deutsches rotes kreuz|johanniter(-unfall-hilfe)?( e\. ?v\.)?|malteser hilfsdienst( e\. ?v\.)?|malteser rettungswache|drk rettungswache|arbeiter-samariter-bund)$/i;
  for (const x of st) {
    if (GENERIC.test(x.name) && x.address) {
      x.name = `${x.name} (${x.address.split(',')[0]})`;
      x.short = x.name;
    }
  }
  data.stations = refineStations(st, cfg.name);
  // Einheiten direkt an einer BF-Wache: Standort angleichen
  for (const x of data.stations) {
    if (x.type === 'BF' || x.hostedAt) continue;
    const host = data.stations.find((b) => b.type === 'BF' && dist(b.center, x.center) < 60);
    if (host) { x.center = host.center; x.hostedAt = host.name; }
  }
  const order = { BF: 0, FF: 1, RW: 2 };
  data.stations.sort((a, b) => order[a.type] - order[b.type] || a.name.localeCompare(b.name, 'de', { numeric: true }));
  const slug = (t) => t.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const used = new Set();
  for (const x of data.stations) {
    if (!x.key || used.has(x.key)) {
      let k = slug(`${x.number}-${x.short}`).slice(0, 60) || x.type.toLowerCase();
      while (used.has(k)) k += '-x';
      x.key = k;
    }
    used.add(x.key);
  }
  fs.writeFileSync(file, JSON.stringify(data));
  const c = (t) => data.stations.filter((x) => x.type === t).length;
  const withAddr = data.stations.filter((x) => x.address).length;
  console.log(`${cfg.name}: Nominatim ${items.length} · neu ${added} · Adressen ergänzt ${addresses} · jetzt BF ${c('BF')} FF ${c('FF')} RW ${c('RW')} · mit Adresse ${withAddr}/${data.stations.length}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const id of process.argv.slice(2)) {
    try { enrich(id); } catch (err) { console.log(`${id}: FEHLER ${err.message.split('\n')[0]}`); }
  }
}
