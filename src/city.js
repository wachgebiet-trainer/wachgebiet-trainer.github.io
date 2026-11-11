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
      'S- und U-Bahnhöfe: VBB-Fahrplandaten (GTFS), © VBB Verkehrsverbund Berlin-Brandenburg GmbH, Lizenz CC BY 4.0, aufbereitet mit „vbb-stations“',
    ],
    storageKey: 'wachgebiet-trainer:v1',
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
