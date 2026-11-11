# Wachgebiet-Trainer Berlin

Live: https://wachgebiet-trainer.github.io/

Ortskunde-Training für **Berufsfeuerwehr und Freiwillige Feuerwehren** in Berlin:
Wache wählen, Straße oder Bahnhof wird genannt, auf der Karte ohne Beschriftung antippen, Abstand wird bewertet.

## Funktionen
- 95 Einheiten: 36 BF-Wachen, 59 Freiwillige Feuerwehren (inkl. FF-Einheiten an BF-Wachen, z. B. 1201 an FW 1200)
- Suche nach Nummer, Name, Ortsteil oder Bezirk; Filter BF/FF und Einsatzbereich; Übersichtskarte
- Training: Schwierigkeit (Haupt-/alle/Nebenstraßen), Radius 500 m – 5 km, 10/20/alle Ziele, Zeitlimit, S-/U-Bahnhöfe optional, Straßennamen als Hilfe
- Auswertung mit Karte, Fehler wiederholen, Bestleistung je Modus; Fehler kommen in späteren Runden häufiger dran
- Erkunden-Modus: Straßen nach Klasse eingefärbt, Name per Hover/Tippen, Suche
- Direktlink: `?wache=2620` (auch `?3600` wie beim Original)
- Fortschritt lokal im Browser, Gastmodus
- Darstellung wählbar: Auto (System), Hell, Dunkel, Stadtplan – Oberfläche und Karte wechseln mit

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
