// Nachbearbeitung der Wachenliste aus OpenStreetMap:
//  - Werk-/Betriebsfeuerwehren und Sondereinrichtungen entfernen
//  - doppelte Einträge gleichen Typs am selben Ort zusammenfassen
// Direkt aufrufbar: node build/refine-stations.mjs <stadt-id> [...]
import fs from 'node:fs';
import path from 'node:path';

export const SKIP = /werk(s)?feuerwehr|\bwf\b|betriebsfeuerwehr|uniklinik|klinikum|flughafen|bundeswehr|jugendfeuerwehr|museum|schule|akademie|werkstatt|kleiderkammer|lager|leitstelle|verwaltung|übungs|ausbildung|polizei|\bthw\b|wasserwacht|dlrg|army|militär|nato|stützpunkt|löschboot|bootshaus|bauhof|katastrophenschutz|katastophenschutz|sondereinsatz|geschäftsstelle|kreisverband|ortsverband|regionalverband|ausbildungs|krankentransport|blutspende|lebens-rettungs|rettungshunde|werks?ambulanz|werkrettung|gesundheitsdienst|baufläche|neubau|fachdienst|kliniken|klinik\b|\bktw\b|first responder|stellplatz|fraport|bereitschaft(?!.*wache)/i;

export const ORG = /\b(drk|brk|asb|juh|mhd|johanniter|malteser|falck|arbeiter-samariter|rotes kreuz)\b/i;
export const RW = /rettungswache|rettungsdienst|rettungsstation|notarzt|\brtw\b|\bdrk\b|\basb\b|johanniter|malteser|arbeiter-samariter|rotes kreuz/i;
export const BF = /feuerwache|berufsfeuerwehr|feuer-?\s?(und|u\.)\s?rettungswache|feuer-?\s?(und|u\.)\s?umweltwache|umweltwache|rettungszentrum|feuerwehrzentrum|\bfu?rw\b|hauptfeuerwache|hauptwache|\bwache \d|\bfw \d|^f ?\d{1,3}\b|\(f ?\d{1,3}\)/i;
export const FF = /freiwillige|\bff\b|\bffw\b|löschzug|löschgruppe|löscheinheit|ortswehr|ortsfeuerwehr|gerätehaus|feuerwehrhaus|löschabteilung|abteilung|stadtteilfeuerwehr|\blz\b|\blg\b|\ble\b/i;
export function classify(p) {
  const n = p.name;
  if (!n || SKIP.test(n)) return null;
  if (/freiwillige|löschzug|löschgruppe|löscheinheit/i.test(n) && !/feuerwache|rettungswache/i.test(n)) return 'FF';
  if (BF.test(n) && !(ORG.test(n) && !/feuer/i.test(n))) return 'BF';
  if (RW.test(n) || p.subclass === 'ambulance_station') return 'RW';
  if (FF.test(n)) return 'FF';
  return /feuerwehr/i.test(n) ? 'FF' : null;
}
export function numberOf(name, type) {
  const m = name.match(/\(?\b(F ?\d{1,3})\b\)?/) || name.match(/(?:wache|zug|gruppe|einheit|abteilung|FW|FRW|FuRW|LZ|LG|RW|Nr\.?)\s*(\d{1,4})\b/i) || name.match(/\b(\d{1,4})\b/);
  if (m) return m[1].replace(/\s/g, '');
  return type === 'BF' ? 'FW' : type;
}

const dist = (a, b) => Math.hypot((a[0] - b[0]) * 111320 * Math.cos((a[1] * Math.PI) / 180), (a[1] - b[1]) * 110540);

// Haben zwei Namen ein gemeinsames, aussagekräftiges Wort (z. B. Ortsteil)?
const GENERIC_WORDS = new Set(['feuerwehr', 'freiwillige', 'feuerwache', 'rettungswache', 'wache', 'abteilung', 'löschzug', 'löschgruppe', 'löscheinheit', 'gerätehaus', 'feuerwehrhaus', 'rettung', 'und', 'der', 'die', 'das', 'stadt', 'drk', 'asb', 'juh', 'johanniter', 'malteser', 'falck', 'deutsches', 'rotes', 'kreuz', 'berufsfeuerwehr', 'hauptwache', 'standort', 'e.v.']);
export function namesSimilar(a, b, city = '') {
  const cityWords = new Set(city.toLowerCase().split(/[\s()-]+/));
  const words = (t) => new Set(t.toLowerCase().replace(/[()–,.+/]/g, ' ').split(/[\s-]+/).filter((w) => w.length > 2 && !GENERIC_WORDS.has(w) && !cityWords.has(w) && !/^\d+$/.test(w)));
  const A = words(a), B = words(b);
  if (!A.size || !B.size) return true; // zu wenig Information: als gleich behandeln
  for (const w of A) if (B.has(w)) return true;
  return false;
}

export function refineStations(stations, cityName = '') {
  const kept = [];
  // „Feuerwehr <Stadt>“ ohne Zusatz ist in der Regel die Hauptwache der Berufsfeuerwehr
  const hq = cityName ? new RegExp(`^(Feuerwehr|Berufsfeuerwehr) ${cityName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') : null;
  for (const s of stations) {
    // „Feuer-und Rettungswache“ (ohne Leerzeichen) o. Ä. ist eine Wache der Berufsfeuerwehr
    if (s.type === 'RW' && /feuer-?\s?(und|u\.)\s?rettungswache|feuerwache/i.test(s.name)) {
      s.type = 'BF';
      const n = s.name.match(/wache\s*(\d{1,3})/i);
      s.number = n ? n[1] : 'FW';
    }
    // „DRK Wache 40“, „Johanniter Wache 41/51“: Rettungswachen von Hilfsorganisationen
    if (s.type === 'BF' && ORG.test(s.name) && !/feuer/i.test(s.name)) {
      s.type = 'RW';
      if (!/\d/.test(s.number)) s.number = 'RW';
    }
    if (hq && hq.test(s.name) && s.type !== 'BF') {
      s.type = 'BF';
      if (!/\d/.test(s.number)) s.number = 'FW';
    }
  }
  for (const s of stations.filter((x) => !SKIP.test(x.name))) {
    const dup = kept.find((k) => k.type === s.type && dist(k.center, s.center) < 60 && namesSimilar(k.name, s.name, cityName));
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
