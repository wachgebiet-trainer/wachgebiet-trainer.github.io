// Baut die kompakten Datendateien für den Wachgebiet-Trainer.
// Quellen: Berliner Feuerwehr WFS (Standorte), Detailnetz Berlin WFS (Straßen),
// VBB-Haltestellen (npm-Paket vbb-stations).
// Aufruf: node build-data.mjs   (erwartet raw/fw.json und raw/streets_dn.json)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const here = path.dirname(new URL(import.meta.url).pathname);
const out = path.join(here, '..', 'public', 'data', 'berlin');
fs.mkdirSync(out, { recursive: true });

// ---------- Wachen ----------
const fw = JSON.parse(fs.readFileSync(path.join(here, 'raw/fw.json'), 'utf8')).features;
const SKIP = /^(TD \d|Fernme|.*Ausweich)/i;

const titleCase = (s) =>
  s.toLowerCase()
    .replace(/(^|[\s\-/(])([a-zäöüß])/g, (m, a, b) => a + b.toUpperCase())
    .replace(/\bLrw\b/, 'LRW');

function cleanName(raw) {
  return titleCase(raw.replace(/^(FW|FF|RTW|RW)-/, '').replace(/\s*\(.*\)\s*$/, '').trim());
}
const slug = (s) =>
  s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const stations = [];
for (const f of fw) {
  const p = f.properties;
  const [lng, lat] = f.geometry.coordinates;
  const base = {
    address: `${p.adresse.replace(/\s+/g, ' ')}, ${p.plz} Berlin`,
    ortsteil: p.ortsteil,
    bezirk: p.bezirk,
    area: Number(String(p.eb_kurz).replace(/\D/g, '')) || null,
    center: [+lng.toFixed(6), +lat.toFixed(6)],
  };
  const name = cleanName(p.wach_name);
  if (p.wach_typ === 'BF' && !SKIP.test(p.wach_name)) {
    stations.push({ number: String(p.wach_nr), type: 'BF', name: `Feuerwache ${name}`, short: name, ...base });
  }
  if (p.wach_typ === 'FF') {
    stations.push({ number: String(p.wach_nr), type: 'FF', name: `Freiwillige Feuerwehr ${name}`, short: name, ...base });
  }
  // FF-Einheiten, die an einer BF- oder RTW-Wache untergebracht sind
  if (p.ff_nr && p.ff_nr !== '-') {
    const host = p.wach_typ === 'BF' ? `Feuerwache ${name}` : `Rettungswache ${name}`;
    stations.push({
      number: String(p.ff_nr), type: 'FF', name: `Freiwillige Feuerwehr ${name}`, short: name,
      hostedAt: `${host} (${p.wach_nr})`, ...base,
    });
  }
}
// Neue Wache, im WFS-Stand 09/2024 noch nicht enthalten
if (!stations.some((s) => s.number === '6600')) {
  stations.push({
    number: '6600', type: 'BF', name: 'Feuerwache Hohenschönhausen', short: 'Hohenschönhausen',
    address: 'Pablo-Picasso-Straße 34, 13057 Berlin', ortsteil: 'Neu-Hohenschönhausen', bezirk: 'Lichtenberg',
    area: 6, center: [13.520073, 52.56139], manual: true,
  });
}
stations.forEach((s) => (s.key = `${s.number}-${slug(s.short)}`));
stations.sort((a, b) => a.number.localeCompare(b.number));

// ---------- Straßen ----------
// strassenklasse1: I–IV = übergeordnetes Straßennetz, V = Nebenstraßen
const KEEP_KIND = new Set(['STRA', 'PLAT', 'AUBA', 'BRUE', 'PSTR']);
const TECHNICAL = /(Einfahrt|Ausfahrt|Einf |Ausf |Verbindungsstr|Tankstelle|Parkpl|Hauptfahrbahn|Rampe|Begl-Fb|>[NSOW])/;
// Autobahn-Teilstücke ("100 AS Gradestr …") auf die Autobahn selbst abbilden
function normalizeName(name, kind) {
  const a = name.match(/^(1\d\d)\s/);
  if (a) return `A ${a[1]}`;
  const bab = name.match(/^A (\d+) BAB/);
  if (bab) return `A ${bab[1]}`;
  if (/^Zufahrt/.test(name)) return null;
  if (TECHNICAL.test(name)) return null;
  if (/^(Fußweg|Weg|Privatweg|Gehweg|Radweg)\s*\d+/i.test(name)) return null;
  return name;
}
const dn = JSON.parse(fs.readFileSync(path.join(here, 'raw/streets_dn.json'), 'utf8')).features;
const names = [];
const nameIdx = new Map();
const segs = [];
const PREC = 1e5;
for (const f of dn) {
  const p = f.properties;
  if (!p.strassenname || !KEEP_KIND.has(p.strassenklasse2)) continue;
  if (!f.geometry) continue;
  const sname = normalizeName(p.strassenname.trim(), p.strassenklasse2);
  if (!sname) continue;
  const cls1 = p.strassenklasse1;
  // 0 = Autobahn/I, 1 = II, 2 = III/IV, 3 = Nebenstraße
  const cls = p.strassenklasse2 === 'AUBA' || cls1 === 'I' ? 0 : cls1 === 'II' ? 1 : cls1 === 'III' || cls1 === 'IV' ? 2 : 3;
  const key = `${sname}|${p.bezirk}`; // gleichnamige Straßen in verschiedenen Bezirken trennen
  let ni = nameIdx.get(key);
  if (ni === undefined) {
    ni = names.length;
    nameIdx.set(key, ni);
    names.push([sname, p.bezirk]);
  }
  const lines = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const line of lines) {
    // Delta-kodiert, 1e-5 Grad (~1 m)
    const flat = [];
    let px = 0, py = 0;
    for (const [x, y] of line) {
      const ix = Math.round(x * PREC), iy = Math.round(y * PREC);
      if (flat.length && ix === px && iy === py) continue;
      flat.push(ix - px, iy - py);
      px = ix; py = iy;
    }
    if (flat.length >= 4) segs.push([ni, cls, flat]);
  }
}

// ---------- S-/U-Bahnhöfe ----------
const vbb = require('vbb-stations')('all');
const transit = [];
for (const s of vbb) {
  if (!s.id.startsWith('de:11000:')) continue;
  const m = s.name.match(/^(S\+U|S|U) (.+)$/);
  if (!m) continue;
  transit.push({
    id: s.id, name: s.name.replace(/ \(Berlin\)$/, ''), modes: m[1],
    center: [+s.location.longitude.toFixed(6), +s.location.latitude.toFixed(6)],
  });
}

const meta = {
  version: 1,
  builtAt: new Date().toISOString(),
  sources: [
    'Berliner Feuerwehr – Standorte (Geoportal Berlin, WFS feuerwehr:a_feuerwehr_standorte), dl-de/zero-2-0',
    'Detailnetz Berlin – Straßenabschnitte (Geoportal Berlin, WFS detailnetz:c_strassenabschnitte), dl-de/zero-2-0',
    'VBB Haltestellen (vbb-stations)',
  ],
};

fs.writeFileSync(path.join(out, 'stations.json'), JSON.stringify({ meta, stations }));
fs.writeFileSync(path.join(out, 'streets.json'), JSON.stringify({ precision: PREC, names, segs }));
fs.writeFileSync(path.join(out, 'transit.json'), JSON.stringify({ stations: transit }));

const count = (t) => stations.filter((s) => s.type === t).length;
console.log(`Wachen: ${stations.length} (BF ${count('BF')}, FF ${count('FF')})`);
console.log(`Straßen: ${names.length} Namen, ${segs.length} Segmente`);
console.log(`Bahnhöfe: ${transit.length}`);
for (const f of ['stations.json', 'streets.json', 'transit.json'])
  console.log(f, (fs.statSync(path.join(out, f)).size / 1024).toFixed(0), 'KB');
