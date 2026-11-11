#!/usr/bin/env bash
# Lädt die Rohdaten für Duisburg neu (danach: npm run data:duisburg)
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p raw-duisburg/tiles
cd raw-duisburg
GP=https://geoportal.duisburg.de/arcgisserver/rest/services/OpenData/OpenData/MapServer
curl -sSf -o rettung.geojson      "$GP/34/query?where=1%3D1&outFields=*&outSR=4326&f=geojson"
curl -sSf -o stadtgebiet.geojson  "$GP/7/query?where=1%3D1&outFields=*&outSR=4326&f=geojson"
curl -sSf -o stadtbezirke.geojson "$GP/6/query?where=1%3D1&outFields=*&outSR=4326&f=geojson"
# OpenMapTiles-Kacheln (z14) der aktuellen OpenFreeMap-Version für das Stadtgebiet
curl -sSf -o tilejson.json https://tiles.openfreemap.org/planet
python3 - > urls.txt <<'PY'
import json, math
z = 14
tpl = json.load(open('tilejson.json'))['tiles'][0]
lon2x = lambda lon: int((lon + 180) / 360 * 2**z)
lat2y = lambda lat: int((1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * 2**z)
for x in range(lon2x(6.62), lon2x(6.84) + 1):
    for y in range(lat2y(51.57), lat2y(51.33) + 1):
        print(f'url = "{tpl.format(z=z, x=x, y=y)}"\noutput = "tiles/{x}_{y}.pbf"')
PY
curl -sS --parallel --parallel-max 6 --retry 3 -K urls.txt
cd .. && npm install --no-audit --no-fund
echo "Fertig. Jetzt im Projektordner: npm run data:duisburg"
