// Vollständigkeitsbericht: Anzahl Wachen laut Wikipedia-Infobox vs. Daten der App
import fs from 'node:fs';
import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const cities = JSON.parse(fs.readFileSync(path.join(here, '..', 'src', 'cities.json'), 'utf8'));
const field = (txt, name) => {
  const m = txt.match(new RegExp(`\\|\\s*${name}\\s*=\\s*([^\\n|<]*)`));
  const n = m && m[1].match(/\d+/);
  return n ? +n[0] : null;
};
const rows = [];
for (const c of cities) {
  const wf = path.join(here, 'raw-wiki', `${c.id}.wiki`);
  const d = JSON.parse(fs.readFileSync(path.join(here, '..', 'public', 'data', c.id, 'stations.json'), 'utf8')).stations;
  const n = (t) => d.filter((s) => s.type === t).length;
  const wiki = fs.existsSync(wf) ? fs.readFileSync(wf, 'utf8') : '';
  const wb = field(wiki, 'beruf_einheiten');
  const wfz = field(wiki, 'frei_einheiten');
  const gap = (wb != null ? Math.max(0, wb - n('BF')) : 0) + (wfz != null ? Math.max(0, wfz - n('FF')) : 0);
  rows.push({ id: c.id, src: c.source, bf: n('BF'), wikiBf: wb, ff: n('FF'), wikiFf: wfz, gap });
}
rows.sort((a, b) => b.gap - a.gap);
console.log('Stadt'.padEnd(18), 'BF  (Wiki)', '  FF  (Wiki)', '  fehlen');
for (const r of rows) {
  const f = (a, b) => `${String(a).padStart(3)} (${b == null ? ' ? ' : String(b).padStart(3)})`;
  console.log(r.id.padEnd(18), f(r.bf, r.wikiBf), '  ', f(r.ff, r.wikiFf), '  ', r.gap || '');
}
fs.writeFileSync(path.join(here, 'raw-wiki', 'completeness.json'), JSON.stringify(rows, null, 1));
