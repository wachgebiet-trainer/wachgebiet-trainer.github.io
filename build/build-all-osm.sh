#!/usr/bin/env bash
# Baut alle Städte mit OpenStreetMap-Daten komplett neu:
#   1. Stadtgrenze + Kartenkacheln → Straßen, Bahnhöfe, Wachen   (build-osm-city.mjs)
#   2. OSM-Suche: weitere Wachen, Rettungswachen, Adressen         (enrich-nominatim.mjs, gecacht)
#   3. Ergänzungen aus Wikipedia/Hand                              (apply-supplements.mjs)
#   4. amtliche Standorte einmischen (RVR, Düsseldorf, Köln …)     (apply-official.mjs)
#   5. Objekte und Straßengraph für Objekt-/Anfahrt-Trainer         (build-extras.mjs)
# Aufruf: ./build/build-all-osm.sh [stadt-id ...]
set -uo pipefail
cd "$(dirname "$0")/.."
ids="$*"
[ -z "$ids" ] && ids=$(node -e "console.log(require('./src/cities.json').filter(c=>c.source==='osm').map(c=>c.id).join(' '))")
for id in $ids; do
  node build/build-osm-city.mjs "$id" --keep-tiles 2>&1 | tail -1
  node build/enrich-nominatim.mjs "$id" 2>&1 | tail -1
  node build/apply-supplements.mjs "$id" 2>&1 | grep -E "ergänzt|NICHT|entfernt" | sed "s/^/  /"
  # amtliche Standorte (falls vorhanden: build/official/<id>.json, siehe convert-official.mjs)
  [ -f "build/official/$id.json" ] && node build/apply-official.mjs "$id" 2>&1 | sed "s/^/  /"
  node build/build-extras.mjs "$id" 2>&1 | tail -1 | sed "s/^/  /"
done
node build/update-bounds.mjs
node build/make-pages.mjs
