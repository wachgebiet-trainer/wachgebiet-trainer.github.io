#!/usr/bin/env bash
# Lädt die Rohdaten aus dem Geoportal Berlin neu herunter (danach: npm run data)
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p raw
WFS=https://gdi.berlin.de/services/wfs
curl -sSf -o raw/fw.json "$WFS/feuerwehr?service=WFS&version=2.0.0&request=GetFeature&typeNames=feuerwehr:a_feuerwehr_standorte&outputFormat=application/json&srsName=EPSG:4326"
curl -sSf -o raw/ewb.json "$WFS/feuerwehr?service=WFS&version=2.0.0&request=GetFeature&typeNames=feuerwehr:b_feuerwehr_einsatzbereiche&outputFormat=application/json&srsName=EPSG:4326"
curl -sSf -o raw/streets_dn.json "$WFS/detailnetz?service=WFS&version=2.0.0&request=GetFeature&typeNames=detailnetz:c_strassenabschnitte&outputFormat=application/json&srsName=EPSG:4326&propertyName=strassenname,strassenklasse1,strassenklasse,strassenklasse2,stadtteil,bezirk,geom"
npm install --no-audit --no-fund
echo "Fertig. Jetzt im Projektordner: npm run data"
