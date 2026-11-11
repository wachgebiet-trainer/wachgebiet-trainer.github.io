// Nachbearbeitung der Wachenliste aus OpenStreetMap:
//  - Werk-/Betriebsfeuerwehren und Sondereinrichtungen entfernen
//  - doppelte Einträge gleichen Typs am selben Ort zusammenfassen
// Direkt aufrufbar: node build/refine-stations.mjs <stadt-id> [...]
import fs from 'node:fs';
import path from 'node:path';

export const SKIP = /werk(s)?feuerwehr|\bwf\b|betriebsfeuerwehr|uniklinik|klinikum|flughafen|bundeswehr|jugendfeuerwehr|museum|schule|akademie|werkstatt|kleiderkammer|lager|leitstelle|verwaltung|übungs|ausbildung|polizei|\bthw\b|wasserwacht|dlrg|army|militär|nato/i;

const dist = (a, b) => Math.hypot((a[0] - b[0]) * 111320 * Math.cos((a[1] * Math.PI) / 180), (a[1] - b[1]) * 110540);

export function refineStations(stations, cityName = '') {
  const kept = [];
  // „Feuerwehr <Stadt>“ ohne Zusatz ist in der Regel die Hauptwache der Berufsfeuerwehr
  const hq = cityName ? new RegExp(`^(Feuerwehr|Berufsfeuerwehr) ${cityName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') : null;
  for (const s of stations) {
    if (hq && hq.test(s.name) && s.type !== 'BF') {
      s.type = 'BF';
      if (!/\d/.test(s.number)) s.number = 'FW';
    }
  }
  for (const s of stations.filter((x) => !SKIP.test(x.name))) {
    const dup = kept.find((k) => k.type === s.type && dist(k.center, s.center) < 60);
    if (dup) {
      // aussagekräftigeren Eintrag behalten: mit Nummer bzw. „Freiwillige Feuerwehr …“ im Namen
      const better = (x) => (/\d/.test(x.number) ? 2 : 0) + (/freiwillige|feuerwache|rettungswache/i.test(x.name) ? 1 : 0);
      if (better(s) > better(dup)) Object.assign(dup, s);
      continue;
    }
    kept.push({ ...s });
  }
  return kept;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
  const cities = JSON.parse(fs.readFileSync(path.join(root, 'src', 'cities.json'), 'utf8'));
  for (const id of process.argv.slice(2)) {
    const f = path.join(root, 'public', 'data', id, 'stations.json');
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    const before = d.stations.length;
    d.stations = refineStations(d.stations, cities.find((c) => c.id === id)?.name);
    const order = { BF: 0, FF: 1, RW: 2 };
    d.stations.sort((a, b) => order[a.type] - order[b.type] || a.name.localeCompare(b.name, 'de', { numeric: true }));
    fs.writeFileSync(f, JSON.stringify(d));
    console.log(`${id}: ${before} → ${d.stations.length} Wachen`);
  }
}
