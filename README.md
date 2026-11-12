# Wachgebiet-Trainer Berlin

Live: https://wachgebiet-trainer.github.io/ (Startseite mit Stadtauswahl) · [/berlin/](https://wachgebiet-trainer.github.io/berlin/) · [/duisburg/](https://wachgebiet-trainer.github.io/duisburg/)

Ortskunde-Training für **Berufsfeuerwehr und Freiwillige Feuerwehren** in Berlin:
Wache wählen, Straße oder Bahnhof wird genannt, auf der Karte ohne Beschriftung antippen, Abstand wird bewertet.

## Funktionen
- 95 Einheiten: 36 BF-Wachen, 59 Freiwillige Feuerwehren (inkl. FF-Einheiten an BF-Wachen, z. B. 1201 an FW 1200)
- Suche nach Nummer, Name, Ortsteil oder Bezirk; Filter BF/FF und Einsatzbereich; Übersichtskarte
- Training: Schwierigkeit (Haupt-/alle/Nebenstraßen), Radius 500 m – 5 km, 10/20/alle Ziele, Zeitlimit, S-/U-Bahnhöfe optional, Straßennamen als Hilfe
- Auswertung mit Karte, Fehler wiederholen, Bestleistung je Modus; Fehler kommen in späteren Runden häufiger dran
- Erkunden-Modus: Straßen nach Klasse eingefärbt, Name per Hover/Tippen, Suche
- Direktlink: `/berlin/?wache=2620` bzw. `/duisburg/?wache=530`; `#impressum` öffnet Impressum & Datenschutz
- Fortschritt lokal im Browser, Gastmodus
- Darstellung wählbar: Auto (System), Hell, Dunkel, Stadtplan – Oberfläche und Karte wechseln mit

## Städte
Eine Codebasis: `index.html` ist die Startseite mit Stadtauswahl (`src/start.js`), je Stadt gibt es eine Seite (`berlin/index.html`, `duisburg/index.html`).
Alte Direktlinks wie `/?wache=2620` leitet die Startseite nach `/berlin/` weiter.
Die Stadt-Einstellungen stehen in `src/city.js`, die Daten unter `public/data/<stadt>/`.

**Duisburg:** 7 Feuer- und Rettungswachen, 16 Einheiten der Freiwilligen Feuerwehr und 11 Rettungswachen
aus dem Open-Data-Datensatz „Rettung“ der Stadt Duisburg (CC BY 3.0 DE); Straßen und Bahnhöfe aus OpenStreetMap
(OpenMapTiles-Kacheln). Daten aktualisieren:
```
./build/fetch-duisburg.sh
npm run data:duisburg
```

**Weitere Städte** – Stadtgrenze amtlich vom BKG (VG250). Wachenliste aus mehreren Quellen, in dieser Reihenfolge:

1. **OpenStreetMap-Kartendaten** (OpenMapTiles-Kacheln): Straßen, Bahnhöfe, benannte Wachen – `build/build-osm-city.mjs`
2. **OpenStreetMap-Suche** (Nominatim): weitere Feuer- und Rettungswachen, Adressen – `build/enrich-nominatim.mjs`
3. **Ergänzungen** aus Wikipedia und Hand (`build/supplements/<stadt>.json`, automatische Funde in `<stadt>.auto.json`) – `build/apply-supplements.mjs`
4. **Amtliche Standortlisten**, wo vorhanden – `build/convert-official.mjs` → `build/official/<stadt>.json` → `build/apply-official.mjs`
   - Köln (WFS Stadt Köln) und Düsseldorf (Open Data): vollständig, ersetzen OSM für Feuerwachen und FF
   - Ruhrgebiet (Regionalverband Ruhr, POI „Rettungswesen“): Bochum, Bottrop, Dortmund, Essen, Gelsenkirchen,
     Hagen, Hamm, Herne, Moers, Mülheim an der Ruhr, Oberhausen – mit OSM zusammengeführt

Alles neu bauen: `./build/build-all-osm.sh` (oder einzelne Städte: `./build/build-all-osm.sh koeln essen`).
Vollständigkeit gegen Wikipedia prüfen: `./build/fetch-wiki.sh && node build/completeness.mjs`.

Neue Stadt aufnehmen:
1. Eintrag in `src/cities.json` (`source: "osm"`, `gen` = Gemeindename laut VG250, `ars` = Anfang des Regionalschlüssels)
   – oder `node build/add-cities.mjs '[{"id":"…","name":"…","kfz":"…","ars":"…"}]'`
2. `./build/build-all-osm.sh <id>`

## Veröffentlichen
Jeder Push auf `main` baut die Seite und veröffentlicht sie über GitHub Pages (`.github/workflows/pages.yml`).
Einmalig im Repository: Settings → Pages → Source: „GitHub Actions“.

## Entwickeln
```
npm install
npm run dev        # Entwicklungsserver
npm run build      # statische Seite nach dist/ (auf jedem Webspace hostbar)
```

## Daten aktualisieren
Rohdaten aus dem Geoportal Berlin (WFS `feuerwehr:a_feuerwehr_standorte`, `detailnetz:c_strassenabschnitte`) neu laden und aufbereiten:
```
./build/fetch-data.sh
npm run data
```
Die fertigen Daten liegen in `public/data/` und sind eingecheckt.
Die FW 6600 Hohenschönhausen fehlt im WFS-Stand 09/2024 und ist im Skript von Hand ergänzt.

Quellen: Geoportal Berlin (dl-de/zero-2-0), VBB-Haltestellen, Karte © OpenFreeMap / OpenMapTiles / OpenStreetMap-Mitwirkende.
