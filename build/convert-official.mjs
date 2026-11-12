// Übersetzt amtliche Wachen-Datensätze in ein einheitliches Format: build/official/<stadt>.json
//   { "source": "...", "license": "...", "stations": [{ "type": "BF|FF|RW", "name", "address", "center": [lon, lat] }] }
// Rohdaten liegen in build/raw-official/ (siehe build/fetch-official.sh).
import fs from 'node:fs';
import path from 'node:path';
import { utm32ToLonLat } from './utm.mjs';
import { BF } from './refine-stations.mjs';

const here = path.dirname(new URL(import.meta.url).pathname);
const raw = (f) => JSON.parse(fs.readFileSync(path.join(here, 'raw-official', f), 'utf8'));
const out = path.join(here, 'official');
fs.mkdirSync(out, { recursive: true });
const dist = (a, b) => Math.hypot((a[0] - b[0]) * 111320 * Math.cos((a[1] * Math.PI) / 180), (a[1] - b[1]) * 110540);
// complete: Typen, für die die amtliche Liste vollständig ist (dann ersetzt sie die OSM-Einträge)
const write = (id, source, license, stations, complete = []) => {
  fs.writeFileSync(path.join(out, `${id}.json`), JSON.stringify({ source, license, complete, stations }, null, 1));
  const c = (t) => stations.filter((s) => s.type === t).length;
  console.log(`${id}: ${stations.length} amtliche Standorte (BF ${c('BF')}, FF ${c('FF')}, RW ${c('RW')}) – ${source}`);
};
const SKIP = /^amt für|jugendfeuerwehr|kinderfeuerwehr|musikzug|ehrenabteilung|alters|verwaltung|leitstelle|werkstatt|lager|schule|akademie|löschboot|technik- und kommunikationszug|umweltschutzzug|kommunikationszug|spielmannszug|\bnktw\b/i;

// ---------- Regionalverband Ruhr ----------
if (fs.existsSync(path.join(here, 'raw-official', 'rvr_rettung.json'))) {
  const cities = JSON.parse(fs.readFileSync(path.join(here, '..', 'src', 'cities.json'), 'utf8')).filter((c) => c.rvr);
  const TYPE = { Berufsfeuerwehr: 'BF', 'freiwillige Feuerwehr': 'FF', Rettungswachen: 'RW' };
  const all = raw('rvr_rettung.json').features;
  for (const c of cities) {
    const list = [];
    for (const f of all.filter((x) => x.properties.ort === c.rvr)) {
      const p = f.properties;
      const name = (p.name || '').replace(/\s+/g, ' ').trim();
      let type = TYPE[p.kategorie];
      if (!type || !name || SKIP.test(name)) continue;
      if (type === 'RW' && BF.test(name)) type = 'BF';
      const center = utm32ToLonLat(...f.geometry.coordinates);
      const street = [p.strasse, p.hausnummer].map((s) => (s || '').trim()).filter(Boolean).join(' ');
      const address = street ? `${street}, ${[p.plz, p.ort].filter(Boolean).join(' ')}` : '';
      const twin = list.find((o) => o.name === name && dist(o.center, center) < 50);
      if (twin) { if (type === 'BF') twin.type = 'BF'; continue; }
      list.push({ type, name, address, center, street: (p.strasse || '').trim() });
    }
    write(c.id, 'Regionalverband Ruhr (RVR), POI-Datensatz „Rettungswesen“', '© Regionalverband Ruhr, Datenlizenz Deutschland – Namensnennung – Version 2.0', list);
  }
}

// ---------- Düsseldorf ----------
if (fs.existsSync(path.join(here, 'raw-official', 'duesseldorf.geojson'))) {
  const list = [];
  for (const f of raw('duesseldorf.geojson').features) {
    const p = f.properties;
    if (SKIP.test(p.name)) continue;
    const type = p.art === 'Freiwillige Feuerwehr' ? 'FF' : BF.test(p.name) ? 'BF' : /rettungswache/i.test(p.name) ? 'RW' : 'BF';
    list.push({ type, name: p.name, address: `${p.adresse}, ${p.plz} Düsseldorf`, center: f.geometry.coordinates.map((v) => +v.toFixed(6)), street: p.adresse.replace(/\s+\d.*$/, '') });
  }
  write('duesseldorf', 'Landeshauptstadt Düsseldorf, Open Data „Standorte der Feuerwehr Düsseldorf und Freiwilligen Feuerwehr Düsseldorf“', 'Datenlizenz Deutschland – Zero – Version 2.0', list, ['BF', 'FF']);
}

// ---------- Köln ----------
if (fs.existsSync(path.join(here, 'raw-official', 'koeln_feuerwehrwachen.json'))) {
  const list = [];
  for (const [file, defType] of [['koeln_feuerwehrwachen.json', 'BF'], ['koeln_freiwillige_feuerwehrwachen.json', 'FF'], ['koeln_rettungswachen.json', 'RW']]) {
    for (const f of raw(file).features) {
      const p = f.properties;
      const name = (p.Name || '').trim();
      if (!name || SKIP.test(name)) continue;
      const [x, y] = f.geometry.coordinates;
      const center = Math.abs(x) > 180 ? utm32ToLonLat(x, y) : [+x.toFixed(6), +y.toFixed(6)];
      let type = defType;
      if (defType === 'BF' && /löschgruppe|freiwillige/i.test(name)) type = 'FF';
      else if (defType === 'BF' && !BF.test(name) && /rettungswache|nef|stützpunkt|hubschrauber/i.test(name)) type = 'RW';
      const label = /^hubschrauberstation$/i.test(name) ? 'Hubschrauberstation (Rettungshubschrauber)' : name;
      list.push({ type, name: label, address: (p.Adresse || '').trim(), center, street: (p.Adresse || '').replace(/\s+\d.*$/, '').trim() });
    }
  }
  write('koeln', 'Stadt Köln, WFS „Feuer- und Rettungswachen, Löschgruppen“', 'Stadt Köln, Datenlizenz Deutschland – Zero – Version 2.0', list, ['BF', 'FF']);
}
