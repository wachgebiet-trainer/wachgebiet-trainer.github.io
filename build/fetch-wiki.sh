#!/usr/bin/env bash
# Lädt die Wikipedia-Artikel „Feuerwehr <Stadt>“ (Wikitext) für den Abgleich der Wachenlisten.
# Langsam (Pause zwischen Anfragen), um Wikipedia nicht zu belasten.
set -uo pipefail
cd "$(dirname "$0")"
mkdir -p raw-wiki
UA="WachgebietTrainer/1.0 (https://wachgebiet-trainer.github.io)"
fetch() { # $1 = Titel, $2 = Datei
  curl -sS -m 30 -A "$UA" -G "https://de.wikipedia.org/w/index.php" --data-urlencode "title=$1" --data-urlencode "action=raw" -o "$2" -w "%{http_code}"
}
node -e "for (const c of require('../src/cities.json')) if (c.source === 'osm') console.log(c.id + '\t' + c.name)" | while IFS=$'\t' read -r id name; do
  f="raw-wiki/$id.wiki"
  [ -s "$f" ] && continue
  for title in "Feuerwehr $name" "Berufsfeuerwehr $name" "Feuerwehr ${name%% *}"; do
    code=$(fetch "$title" "$f")
    if [ "$code" = "200" ] && [ -s "$f" ]; then
      target=$(grep -oiE '^#(WEITERLEITUNG|REDIRECT) *\[\[[^]]+' "$f" | sed -E 's/^#[A-Za-z]+ *\[\[//' | head -1)
      if [ -n "$target" ]; then sleep 3; code=$(fetch "$target" "$f"); title="$target"; fi
      echo "$id: $title ($code, $(wc -c < "$f") Bytes)"
      break
    fi
    rm -f "$f"
    sleep 3
  done
  [ -s "$f" ] || echo "$id: kein Artikel"
  sleep 3
done
