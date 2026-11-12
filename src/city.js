// Stadt-Konfiguration. Die Stadt steht im <meta name="wachgebiet-city"> der jeweiligen HTML-Seite.
import CITY_LIST from './cities.json';

export const CONTACT_MAIL = 'wachgebiet.trainer@gmail.com';

// Besonderheiten der Städte mit amtlichen Wachenlisten
const SPECIAL = {
  berlin: {
    subtitle: 'Berlin · BF, FF &amp; Rettungswachen',
    intro: 'Wähle deine Wache – Berufsfeuerwehr, Freiwillige Feuerwehr oder Rettungswache – und trainiere Straßen und Bahnhöfe auf einer Karte ohne Beschriftung.',
    searchPlaceholder: 'Wachnummer, Name oder Ortsteil',
    areaLabel: (a) => `EB ${a}`,
    areaAll: 'Alle Einsatzbereiche',
    areaAria: 'Einsatzbereich',
    ffHint: 'Tipp: Freiwillige Feuerwehren am Stadtrand haben oft große Ausrückebereiche – probiere 4 oder 5 km.',
    officialName: 'Berliner Feuerwehr',
    disclaimerExtra: ' oder des Landes Berlin',
    footerSources: 'Daten: Geoportal Berlin (Feuerwehr-Standorte, Detailnetz Berlin, dl-de/zero-2-0) · © VBB (CC BY 4.0) · Karte © OpenFreeMap, © OpenStreetMap-Mitwirkende',
    sources: [
      'Standorte der Feuerwachen, Freiwilligen Feuerwehren und Rettungswachen sowie Straßennetz: Geoportal Berlin (WFS „Feuerwehr-Standorte“ und „Detailnetz Berlin“), Datenlizenz Deutschland – Zero – Version 2.0',
      'Einsatzbereiche: Geoportal Berlin, WFS „Feuerwehr Standorte und Einsatzbereiche“ (feuerwehr:b_feuerwehr_einsatzbereiche), Datenlizenz Deutschland – Namensnennung – Version 2.0',
      'S- und U-Bahnhöfe: VBB-Fahrplandaten (GTFS), © VBB Verkehrsverbund Berlin-Brandenburg GmbH, Lizenz CC BY 4.0, aufbereitet mit „vbb-stations“',
    ],
    storageKey: 'wachgebiet-trainer:v1',
    areas: true,
    areaName: 'Einsatzbereichs',
    areaSource: 'Geoportal Berlin, Berliner Feuerwehr',
  },
  duisburg: {
    subtitle: 'Duisburg · BF, FF &amp; Rettungswachen',
    intro: 'Wähle deine Wache – Feuer- und Rettungswache, Löschzug der Freiwilligen Feuerwehr oder Rettungswache – und trainiere Straßen und Bahnhöfe auf einer Karte ohne Beschriftung.',
    searchPlaceholder: 'Wache, Löschzug oder Stadtbezirk',
    areaAll: 'Alle Stadtbezirke',
    areaAria: 'Stadtbezirk',
    ffHint: 'Tipp: Löschzüge im Außenbereich haben oft große Ausrückebereiche – probiere 3 bis 5 km.',
    officialName: 'Feuerwehr Duisburg',
    disclaimerExtra: ' oder der Stadt Duisburg',
    footerSources: 'Daten: Stadt Duisburg – Open Data (CC BY 3.0 DE) · Straßen und Bahnhöfe © OpenStreetMap-Mitwirkende (ODbL) · Karte © OpenFreeMap',
    sources: [
      'Standorte der Feuer- und Rettungswachen, der Freiwilligen Feuerwehr und der Rettungswachen sowie Stadtgrenze und Stadtbezirke: Stadt Duisburg, Open Data Duisburg (Datensatz „Rettung“, Geoportal Duisburg), Lizenz CC BY 3.0 DE',
      'Straßen und Bahnhöfe: © OpenStreetMap-Mitwirkende (ODbL), über OpenMapTiles/OpenFreeMap',
    ],
    odbl: true,
  },
};

// Standard für Städte, deren Wachen aus OpenStreetMap stammen
function osmDefaults(c) {
  return {
    subtitle: `${c.name} · Feuerwehr &amp; Rettungsdienst`,
    units: 'Feuerwachen & Freiwillige Feuerwehren',
    intro: 'Wähle deine Wache – Feuerwache, Freiwillige Feuerwehr oder Rettungswache – und trainiere Straßen und Bahnhöfe auf einer Karte ohne Beschriftung.',
    searchPlaceholder: 'Wache oder Stadtteil',
    areaAll: 'Alle Bereiche',
    areaAria: 'Bereich',
    ffHint: 'Tipp: Freiwillige Feuerwehren am Stadtrand haben oft große Ausrückebereiche – probiere 3 bis 5 km.',
    officialName: `Feuerwehr ${c.name}`,
    disclaimerExtra: ` oder der Stadt ${c.name}`,
    footerSources: 'Daten: Stadtgrenze © GeoBasis-DE / BKG (2026), dl-de/by-2-0 · Wachen, Straßen und Bahnhöfe © OpenStreetMap-Mitwirkende (ODbL) · Karte © OpenFreeMap',
    sources: [
      'Stadtgrenze: © GeoBasis-DE / BKG (2026), Verwaltungsgebiete 1:250 000 (VG250, Gemeinden), Datenlizenz Deutschland – Namensnennung – Version 2.0 (www.govdata.de/dl-de/by-2-0)',
      'Standorte der Wachen, Straßen und Bahnhöfe: © OpenStreetMap-Mitwirkende (ODbL), über OpenMapTiles/OpenFreeMap',
    ],
    odbl: true,
    dataNote: `Die Wachenstandorte für ${c.name} stammen aus OpenStreetMap und können unvollständig sein. Fehlt eine Wache oder stimmt etwas nicht? Schreib an ${CONTACT_MAIL}.`,
    ...(c.official ? officialOverrides(c) : {}),
  };
}

// Städte mit amtlicher Standortliste (ganz oder teilweise)
function officialOverrides(c) {
  const o = c.official;
  return {
    footerSources: `Daten: Wachen ${o.license.split(',')[0].replace(/^©\s*/, '© ')} · Stadtgrenze © GeoBasis-DE / BKG (2026), dl-de/by-2-0 · Straßen, Bahnhöfe${o.complete ? ' und private Rettungswachen' : ' und ergänzende Wachen'} © OpenStreetMap-Mitwirkende (ODbL) · Karte © OpenFreeMap`,
    sources: [
      `Standorte der Feuerwachen und Freiwilligen Feuerwehren: ${o.source}, ${o.license}`,
      'Stadtgrenze: © GeoBasis-DE / BKG (2026), Verwaltungsgebiete 1:250 000 (VG250, Gemeinden), Datenlizenz Deutschland – Namensnennung – Version 2.0 (www.govdata.de/dl-de/by-2-0)',
      `${o.complete ? 'Weitere Rettungswachen' : 'Ergänzende Wachen und Rettungswachen'}, Straßen und Bahnhöfe: © OpenStreetMap-Mitwirkende (ODbL), über OpenMapTiles/OpenFreeMap und Nominatim`,
    ],
    dataNote: o.complete
      ? null
      : `Feuerwachen und Freiwillige Feuerwehren für ${c.name} stammen aus der amtlichen Liste (${o.source.split(',')[0].replace(/ \(RVR\)$/, '')}), ergänzt um OpenStreetMap. Fehlt etwas? Schreib an ${CONTACT_MAIL}.`,
  };
}

export const CITIES = Object.fromEntries(
  CITY_LIST.map((c) => [
    c.id,
    {
      path: `${c.id}/`,
      areaLabel: (a) => a,
      storageKey: `wachgebiet-trainer:${c.id}:v1`,
      ...(c.source === 'osm' ? osmDefaults(c) : {}),
      ...c,
      ...(SPECIAL[c.id] ?? {}),
    },
  ]),
);

// Freie Suche: eine einzelne Wache irgendwo in Deutschland, übergeben per Adresszeile
// (?n=Name&lat=…&lon=…&t=BF|FF|RW&a=Adresse&o=OSM-Kennung)
const FREE_PARAMS = new URLSearchParams(location.search);
const freeLat = parseFloat(FREE_PARAMS.get('lat'));
const freeLon = parseFloat(FREE_PARAMS.get('lon'));
export const FREE_STATION = Number.isFinite(freeLat) && Number.isFinite(freeLon)
  ? {
      key: `osm-${(FREE_PARAMS.get('o') || `${freeLat.toFixed(5)}-${freeLon.toFixed(5)}`).replace(/[^a-z0-9-]/gi, '')}`,
      number: { BF: 'FW', FF: 'FF', RW: 'RW' }[FREE_PARAMS.get('t')] ?? 'FW',
      type: ['BF', 'FF', 'RW'].includes(FREE_PARAMS.get('t')) ? FREE_PARAMS.get('t') : 'FF',
      name: (FREE_PARAMS.get('n') || 'Feuerwache').slice(0, 120),
      short: (FREE_PARAMS.get('n') || 'Feuerwache').slice(0, 120),
      address: (FREE_PARAMS.get('a') || '').slice(0, 160),
      center: [freeLon, freeLat],
    }
  : null;
CITIES.frei = {
  id: 'frei',
  name: 'Freie Suche',
  path: 'frei/',
  free: true,
  source: 'free',
  bounds: FREE_STATION
    ? [[FREE_STATION.center[0] - 0.08, FREE_STATION.center[1] - 0.05], [FREE_STATION.center[0] + 0.08, FREE_STATION.center[1] + 0.05]]
    : [[5.9, 47.3], [15.0, 55.1]],
  subtitle: 'Freie Suche · ganz Deutschland',
  searchPlaceholder: '',
  areaLabel: (a) => a,
  ffHint: 'Tipp: Freiwillige Feuerwehren haben oft große Ausrückebereiche – probiere 3 bis 5 km.',
  officialName: 'zuständigen Feuerwehr',
  disclaimerExtra: ' oder Gemeinde',
  footerSources: 'Daten: Wache, Straßen und Bahnhöfe © OpenStreetMap-Mitwirkende (ODbL), live über OpenFreeMap und Nominatim · Karte © OpenFreeMap',
  sources: ['Wache, Straßen und Bahnhöfe: © OpenStreetMap-Mitwirkende (ODbL), live über OpenMapTiles/OpenFreeMap und die OpenStreetMap-Suche Nominatim'],
  dataNote: `Freie Suche: Wache, Straßen und Bahnhöfe stammen direkt aus OpenStreetMap und werden nicht geprüft. Fehler kannst du an ${CONTACT_MAIL} melden.`,
  storageKey: 'wachgebiet-trainer:frei:v1',
};

const wanted = document.querySelector('meta[name="wachgebiet-city"]')?.content ?? '';
// Auf der Startseite (ohne Stadt) ist CITY null
export const CITY = CITIES[wanted] ?? null;
export const OTHER_CITIES = Object.values(CITIES).filter((c) => c.id !== CITY?.id);

// Wurzel der Seite (für Daten und Links zwischen den Städten), unabhängig von der Unterseite
const here = new URL('.', location.href);
export const SITE_ROOT = CITY?.path ? new URL('../'.repeat(CITY.path.split('/').filter(Boolean).length), here) : here;
export const DATA_BASE = CITY ? new URL(`data/${CITY.id}/`, SITE_ROOT).href : null;
export const dataUrl = (c, file) => new URL(`data/${c.id}/${file}`, SITE_ROOT).href;
export const LAST_CITY_KEY = 'wachgebiet-trainer:last-city';
export const cityUrl = (c) => new URL(c.path, SITE_ROOT).href;

export const TYPE_LABEL = {
  BF: 'Berufsfeuerwehr',
  FF: 'Freiwillige Feuerwehr',
  RW: 'Rettungswache',
};
