// Stadt-Konfiguration. Die Stadt steht im <meta name="wachgebiet-city"> der jeweiligen HTML-Seite.
const CITIES = {
  berlin: {
    id: 'berlin',
    name: 'Berlin',
    path: '',
    bounds: [[13.08, 52.33], [13.77, 52.68]],
    subtitle: 'Berlin · BF &amp; Freiwillige Feuerwehren',
    intro: 'Wähle deine Wache – Berufsfeuerwehr oder Freiwillige Feuerwehr – und trainiere Straßen und Bahnhöfe auf einer Karte ohne Beschriftung.',
    searchPlaceholder: 'Wachnummer, Name oder Ortsteil',
    areaLabel: (a) => `EB ${a}`,
    areaAll: 'Alle Einsatzbereiche',
    areaAria: 'Einsatzbereich',
    ffHint: 'Tipp: Freiwillige Feuerwehren am Stadtrand haben oft große Ausrückebereiche – probiere 4 oder 5 km.',
    officialName: 'Berliner Feuerwehr',
    disclaimerExtra: ' oder des Landes Berlin',
    footerSources: 'Daten: Geoportal Berlin (Feuerwehr-Standorte, Detailnetz Berlin, dl-de/zero-2-0) · VBB · Karte © OpenFreeMap, © OpenStreetMap-Mitwirkende',
    sources: [
      'Standorte der Feuerwachen und Freiwilligen Feuerwehren sowie Straßennetz: Geoportal Berlin (WFS „Feuerwehr-Standorte“ und „Detailnetz Berlin“), Datenlizenz Deutschland – Zero – Version 2.0',
      'S- und U-Bahnhöfe: VBB Verkehrsverbund Berlin-Brandenburg',
    ],
    storageKey: 'wachgebiet-trainer:v1',
  },
  duisburg: {
    id: 'duisburg',
    name: 'Duisburg',
    path: 'duisburg/',
    bounds: [[6.62, 51.33], [6.84, 51.57]],
    subtitle: 'Duisburg · BF, FF &amp; Rettungswachen',
    intro: 'Wähle deine Wache – Feuer- und Rettungswache, Löschzug der Freiwilligen Feuerwehr oder Rettungswache – und trainiere Straßen und Bahnhöfe auf einer Karte ohne Beschriftung.',
    searchPlaceholder: 'Wache, Löschzug oder Stadtbezirk',
    areaLabel: (a) => a,
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
    storageKey: 'wachgebiet-trainer:duisburg:v1',
  },
};

const wanted = document.querySelector('meta[name="wachgebiet-city"]')?.content ?? 'berlin';
export const CITY = CITIES[wanted] ?? CITIES.berlin;
export const OTHER_CITIES = Object.values(CITIES).filter((c) => c.id !== CITY.id);

// Wurzel der Seite (für Daten und Links zwischen den Städten), unabhängig von der Unterseite
const here = new URL('.', location.href);
export const SITE_ROOT = CITY.path ? new URL('../'.repeat(CITY.path.split('/').filter(Boolean).length), here) : here;
export const DATA_BASE = new URL(`data/${CITY.id}/`, SITE_ROOT).href;
export const cityUrl = (c) => new URL(c.path, SITE_ROOT).href;

export const TYPE_LABEL = {
  BF: 'Berufsfeuerwehr',
  FF: 'Freiwillige Feuerwehr',
  RW: 'Rettungswache',
};
