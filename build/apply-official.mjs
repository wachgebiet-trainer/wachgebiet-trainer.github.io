// Mischt amtliche Standorte (build/official/<stadt>.json, erzeugt von convert-official.mjs) in die Wachenliste:
//  - amtliche Einträge bestätigen vorhandene Wachen (amtlicher Name, Nummer und Adresse haben Vorrang)
//  - fehlende amtliche Wachen werden ergänzt
//  - nur in OpenStreetMap vorhandene Wachen bleiben erhalten
// Aufruf: node build/apply-official.mjs <stadt-id> [...]
import fs from 'node:fs';
import path from 'node:path';
import { numberOf, namesSimilar } from './refine-stations.mjs';

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.join(here, '..');
const cities = JSON.parse(fs.readFileSync(path.join(root, 'src', 'cities.json'), 'utf8'));
const dist = (a, b) => Math.hypot((a[0] - b[0]) * 111320 * Math.cos((a[1] * Math.PI) / 180), (a[1] - b[1]) * 110540);
const slug = (t) => t.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function applyOfficial(id) {
  const offFile = path.join(here, 'official', `${id}.json`);
  if (!fs.existsSync(offFile)) return false;
  const cfg = cities.find((c) => c.id === id);
  const off = JSON.parse(fs.readFileSync(offFile, 'utf8'));
  // Rettungswache am selben Ort wie eine BF-Wache ist die Feuer- und Rettungswache selbst
  const list = off.stations.filter((o) => !(o.type === 'RW' && off.stations.some((b) => b.type === 'BF' && dist(b.center, o.center) < 40)));

  const file = path.join(root, 'public', 'data', id, 'stations.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const st = data.stations;
  let confirmed = 0, added = 0;
  for (const o of list) {
    // zu allgemeine amtliche Namen („Berufsfeuerwehr Dortmund“) um die Straße ergänzen
    const generic = /^(städtische )?berufsfeuerwehr( [a-zäöüß. -]+)?$/i.test(o.name);
    const label = generic && o.street ? `${o.name} (${o.street})` : o.name;
    const number = numberOf(o.name, o.type);
    const match = st.find((x) => x.type === o.type && (x.name.toLowerCase() === o.name.toLowerCase() || (dist(x.center, o.center) < 150 && namesSimilar(x.name, o.name, cfg.name))))
      || st.find((x) => x.type === o.type && dist(x.center, o.center) < 80);
    if (match) {
      if (!generic) match.name = match.short = o.name;
      if (o.address) match.address = o.address;
      if (/\d/.test(number)) match.number = number;
      match.center = o.center; // amtliche Koordinate
      match.source = 'official';
      confirmed++;
    } else {
      st.push({ number, type: o.type, name: label, short: label, address: o.address, center: o.center, source: 'official' });
      added++;
    }
  }
  // Typen mit vollständiger amtlicher Liste: Einträge nur aus OSM entfernen
  const complete = new Set(off.complete ?? []);
  const removed = st.filter((x) => complete.has(x.type) && x.source !== 'official');
  for (const r of removed) st.splice(st.indexOf(r), 1);
  if (removed.length) console.log(`  nur in OSM, entfernt (amtliche Liste vollständig): ${removed.map((r) => r.name).join(', ')}`);
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
  data.meta.official = { source: off.source, license: off.license };
  fs.writeFileSync(file, JSON.stringify(data));
  const c = (t) => st.filter((x) => x.type === t).length;
  console.log(`${cfg.name}: amtlich ${list.length} (bestätigt ${confirmed}, neu ${added}) → gesamt BF ${c('BF')} FF ${c('FF')} RW ${c('RW')}`);
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const id of process.argv.slice(2)) applyOfficial(id);
}
