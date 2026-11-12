// Findet in Wikipedia genannte Einheiten, deren Ortsteil in unserer Liste fehlt, und sucht sie gezielt in OSM.
// Ergebnis: Vorschläge als Ergänzungsdatei build/supplements/<stadt>.auto.json (nur bestätigte Feuer-/Rettungswachen).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.join(here, '..');
const cities = JSON.parse(fs.readFileSync(path.join(root, 'src', 'cities.json'), 'utf8'));
const UA = 'WachgebietTrainer/1.0 (https://wachgebiet-trainer.github.io)';
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const norm = (t) => t.toLowerCase().replace(/ß/g, 'ss').replace(/[^a-zäöü0-9]/g, '');

const UNIT = /(Löschzug|Löschgruppe|Löscheinheit|Abteilung|Ortsfeuerwehr|Stadtteilfeuerwehr|Freiwillige Feuerwehr|Ortswehr|FF)\s+(?:\d+\s*[–-]?\s*)?([A-ZÄÖÜ][\wäöüß.-]+(?:[ /-][A-ZÄÖÜ][\wäöüß.-]+)*)/g;
const STOP = new Set(['der', 'die', 'das', 'und', 'stadt', 'feuerwehr', 'freiwillige', 'abteilung', 'innenstadt', 'nord', 'süd', 'ost', 'west', 'mitte', 'gerätehaus', 'jugendfeuerwehr', 'einsatz', 'gefahrgut']);

function search(q, cfg) {
  const [[w, s], [e, n]] = cfg.bounds;
  const res = JSON.parse(execFileSync('curl', ['-sS', '--fail', '-m', '60', '-A', UA, '-G', 'https://nominatim.openstreetmap.org/search',
    '--data-urlencode', `q=${q}`, '--data-urlencode', `viewbox=${w},${n},${e},${s}`, '--data-urlencode', 'bounded=1',
    '--data-urlencode', 'limit=5', '--data-urlencode', 'format=jsonv2', '--data-urlencode', 'addressdetails=1']).toString());
  sleep(1200);
  return res.find((r) => (r.category === 'amenity' && r.type === 'fire_station') || (r.category === 'emergency' && r.type === 'ambulance_station'));
}

for (const id of process.argv.slice(2)) {
  const cfg = cities.find((c) => c.id === id);
  const wf = path.join(here, 'raw-wiki', `${id}.wiki`);
  if (!fs.existsSync(wf)) continue;
  const wiki = fs.readFileSync(wf, 'utf8').replace(/<ref[\s\S]*?<\/ref>/g, '').replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1').replace(/'''?/g, '');
  const ours = JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', id, 'stations.json'), 'utf8')).stations;
  const ourText = norm(ours.map((s) => `${s.name} ${s.address}`).join(' '));
  const missing = new Map();
  for (const m of wiki.matchAll(UNIT)) {
    const place = m[2].replace(/[.,]$/, '');
    const parts = place.split(/[ /-]/).filter((p) => p.length > 2 && !STOP.has(p.toLowerCase()));
    if (!parts.length) continue;
    if (parts.some((p) => ourText.includes(norm(p)))) continue;
    missing.set(place, `${m[1]} ${place}`);
  }
  const add = [];
  const notFound = [];
  for (const [place, unit] of missing) {
    const hit = search(`${unit} ${cfg.name}`, cfg) || search(`Feuerwehr ${place} ${cfg.name}`, cfg);
    if (hit) {
      const a = hit.address || {};
      add.push({
        type: hit.type === 'ambulance_station' ? 'RW' : 'FF', name: hit.name || unit, number: (unit.match(/\d+/) || [])[0],
        center: [+(+hit.lon).toFixed(6), +(+hit.lat).toFixed(6)],
        address: a.road ? `${a.road}${a.house_number ? ' ' + a.house_number : ''}, ${[a.postcode, a.city || a.town || a.village].filter(Boolean).join(' ')}` : '',
        source: `Wikipedia „Feuerwehr ${cfg.name}“ + OSM-Suche`,
      });
    } else notFound.push(unit);
  }
  fs.mkdirSync(path.join(here, 'supplements'), { recursive: true });
  fs.writeFileSync(path.join(here, 'supplements', `${id}.auto.json`), JSON.stringify({ source: 'automatisch: Wikipedia-Abgleich + OSM-Suche', add }, null, 1));
  console.log(`${cfg.name}: fehlend laut Wikipedia ${missing.size} · gefunden ${add.length}${add.length ? ' (' + add.map((x) => x.name).join(', ') + ')' : ''}${notFound.length ? ' · nicht in OSM: ' + notFound.join(', ') : ''}`);
}
