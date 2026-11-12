#!/usr/bin/env bash
# Baut alle Städte mit OpenStreetMap-Daten komplett neu:
#   1. Stadtgrenze + Kartenkacheln → Straßen, Bahnhöfe, Wachen   (build-osm-city.mjs)
#   2. OSM-Suche: weitere Wachen, Rettungswachen, Adressen         (enrich-nominatim.mjs, gecacht)
#   3. Ergänzungen aus Wikipedia/Hand                              (apply-supplements.mjs)
#   4. Ruhrgebiet: amtliche Standorte des RVR einmischen            (apply-official-rvr.mjs)
# Aufruf: ./build/build-all-osm.sh [stadt-id ...]
set -uo pipefail
cd "$(dirname "$0")/.."
ids="$*"
[ -z "$ids" ] && ids=$(node -e "console.log(require('./src/cities.json').filter(c=>c.source==='osm').map(c=>c.id).join(' '))")
for id in $ids; do
  node build/build-osm-city.mjs "$id" 2>&1 | tail -1
  node build/enrich-nominatim.mjs "$id" 2>&1 | tail -1
  node build/apply-supplements.mjs "$id" 2>&1 | grep -E "ergänzt|NICHT|entfernt" | sed "s/^/  /"
  # amtliche Standorte des Regionalverbands Ruhr (nur Ruhrgebietsstädte)
  if node -e "process.exit(require('./src/cities.json').find(c=>c.id==='$id')?.rvr ? 0 : 1)"; then
    node build/apply-official-rvr.mjs "$id" 2>&1 | sed "s/^/  /"
  fi
done
node build/update-bounds.mjs
node build/make-pages.mjs
