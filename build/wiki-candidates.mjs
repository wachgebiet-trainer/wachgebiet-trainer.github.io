// Zeigt für eine Stadt: unsere Wachen und die im Wikipedia-Artikel genannten Einheiten (Überschriften, Tabellenzeilen, Listen)
import fs from 'node:fs';
import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const id = process.argv[2];
const ours = JSON.parse(fs.readFileSync(path.join(here, '..', 'public', 'data', id, 'stations.json'), 'utf8')).stations;
console.log('== UNSERE:', ours.map((s) => `${s.type}:${s.name}`).join(' | '));
const wiki = fs.readFileSync(path.join(here, 'raw-wiki', `${id}.wiki`), 'utf8')
  .replace(/<ref[^>]*\/>/g, '').replace(/<ref[\s\S]*?<\/ref>/g, '')
  .replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1').replace(/'''?/g, '');
const KEY = /wache|löschzug|löschgruppe|löscheinheit|abteilung|freiwillige|ortsfeuerwehr|ortswehr|stadtteilfeuerwehr|gerätehaus|feuerwehrhaus|standort|einheit\b/i;
const ADDR = /[A-ZÄÖÜ][\wäöüß.-]*(straße|str\.|weg|allee|platz|ring|damm|gasse|chaussee|ufer|steig|pfad|markt|berg|feld|hof)\s*\d+/i;
const out = [];
for (const raw of wiki.split('\n')) {
  const line = raw.trim();
  if (!line || line.startsWith('[[Datei') || line.startsWith('{{') || line.startsWith('|-')) continue;
  const isHead = /^=+/.test(line);
  const isRow = /^[|!*#]/.test(line);
  if ((isHead && KEY.test(line)) || (isRow && (KEY.test(line) || ADDR.test(line))) || (!isRow && !isHead && ADDR.test(line) && KEY.test(line))) {
    out.push(line.replace(/\{\{[^}]*\}\}/g, '').replace(/\s+/g, ' ').slice(0, 220));
  }
}
console.log(out.join('\n'));
