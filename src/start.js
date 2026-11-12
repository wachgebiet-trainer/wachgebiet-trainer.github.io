// Startseite: Suche (Großstädte + bundesweite Wachensuche) und Großstädte nach Bundesland
import '@fontsource/barlow/latin-400.css';
import '@fontsource/barlow/latin-500.css';
import '@fontsource/barlow/latin-600.css';
import '@fontsource/barlow/latin-700.css';
import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/barlow-condensed/latin-700.css';
import '@fontsource/barlow-condensed/latin-800.css';
import './style.css';
import { CITIES, cityUrl, dataUrl, LAST_CITY_KEY, CONTACT_MAIL, SITE_ROOT } from './city.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const norm = (s) => s.toLowerCase().replace(/ß/g, 'ss').normalize('NFD').replace(/[̀-ͯ]/g, '');

// Bundesländer nach Amtlichem Regionalschlüssel (erste zwei Ziffern)
const LAENDER = {
  '01': 'Schleswig-Holstein', '02': 'Hamburg', '03': 'Niedersachsen', '04': 'Bremen', '05': 'Nordrhein-Westfalen',
  '06': 'Hessen', '07': 'Rheinland-Pfalz', '08': 'Baden-Württemberg', '09': 'Bayern', '10': 'Saarland',
  '11': 'Berlin', '12': 'Brandenburg', '13': 'Mecklenburg-Vorpommern', '14': 'Sachsen', '15': 'Sachsen-Anhalt', '16': 'Thüringen',
};
const landOf = (c) => LAENDER[(c.ars ?? { berlin: '11', duisburg: '05' }[c.id] ?? '').slice(0, 2)] ?? 'Weitere';

function applyTheme() {
  let theme = 'city';
  try {
    for (const c of Object.values(CITIES)) {
      const t = JSON.parse(localStorage.getItem(c.storageKey))?.settings?.theme;
      if (t) theme = t;
    }
  } catch {
    /* Standard verwenden */
  }
  const dark = theme === 'dark' || (theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

let last = null;
try {
  last = localStorage.getItem(LAST_CITY_KEY);
} catch {
  /* kein Speicher */
}

const cities = Object.values(CITIES).filter((c) => !c.free).sort((a, b) => a.name.localeCompare(b.name, 'de'));
const byLand = new Map();
for (const c of cities) {
  const l = landOf(c);
  if (!byLand.has(l)) byLand.set(l, []);
  byLand.get(l).push(c);
}
const laender = [...byLand.keys()].sort((a, b) => a.localeCompare(b, 'de'));
const lastLand = last && CITIES[last] ? landOf(CITIES[last]) : null;

function cityCard(c) {
  return `<a class="city-card" href="${cityUrl(c)}" data-name="${esc(norm(c.name))}">
    <span class="city-mark" aria-hidden="true">${esc(c.kfz ?? c.name.slice(0, 2))}</span>
    <span class="city-body">
      <span class="city-name">${esc(c.name)}${last === c.id ? '<em>zuletzt genutzt</em>' : ''}</span>
      <span class="city-counts" data-city="${c.id}"></span>
    </span>
    <span class="city-go" aria-hidden="true">→</span>
  </a>`;
}

function render() {
  document.getElementById('start').innerHTML = `
  <header class="brand start-brand">
    <span class="logo">
      <span class="logo-icon" aria-hidden="true">🚨</span>
      <span><strong>Wachgebiet-Trainer</strong><small>Ortskunde für Feuerwehr &amp; Rettungsdienst</small></span>
    </span>
  </header>
  <main class="start-main">
    <section class="intro">
      <h1>Kenne dein <em>Wachgebiet.</em></h1>
      <p>Straßen, Objekte und Anfahrtswege rund um deine Wache lernen – auf einer Karte ohne Beschriftung.</p>
    </section>
    <section class="how">
      <h2>So funktioniert's</h2>
      <ol>
        <li><b>Stadt wählen oder Wache suchen</b> – Großstädte unten nach Bundesland, alle anderen Orte über die Suche.</li>
        <li><b>Wache wählen</b> – Feuerwache, Freiwillige Feuerwehr oder Rettungswache.</li>
        <li><b>Trainingsart wählen</b> – <i>Straßen</i>, <i>Objekte</i> (Krankenhäuser, Einkaufszentren …) oder <i>Anfahrt</i>.</li>
        <li><b>Auf der Karte antworten</b> – Ziel antippen bzw. die richtige Straße wählen.</li>
        <li><b>Ergebnis sehen</b> – Fehler kommen in späteren Runden öfter dran.</li>
      </ol>
    </section>

    <section class="finder" id="suche">
      <h2>Wache oder Stadt suchen</h2>
      <form class="finder-form" id="finder" role="search">
        <input id="q" type="search" placeholder="Stadt, Ort oder Wache" autocomplete="off" aria-label="Stadt, Ort oder Wache" />
        <button class="btn primary" type="submit">Suchen</button>
      </form>
      <p class="finder-hint">Großstädte werden beim Tippen gefiltert. <b>Suchen</b> findet zusätzlich jede Feuer- und Rettungswache in Deutschland.</p>
      <div id="finder-results" aria-live="polite"></div>
    </section>

    <section class="cities" aria-label="Großstädte nach Bundesland">
      <h2 class="cities-title">Großstädte <span id="cities-count">${cities.length}</span></h2>
      <div id="filtered" class="city-list" hidden></div>
      <div id="by-land">
        ${laender.map((l) => `
          <details class="land" ${l === lastLand ? 'open' : ''}>
            <summary><span>${esc(l)}</span><span class="land-count">${byLand.get(l).length}</span></summary>
            <div class="city-list">${byLand.get(l).map(cityCard).join('')}</div>
          </details>`).join('')}
      </div>
    </section>

    <section class="contact-card">
      <h2>Deine Stadt fehlt?</h2>
      <p>Jede Wache in Deutschland findest du über die Suche. Für eine eigene Seite mit geprüfter Wachenliste schreib mir gern – oder melde fehlende und falsche Wachen:</p>
      <p class="contact-mail"><a href="mailto:${CONTACT_MAIL}?subject=Wachgebiet-Trainer%3A%20Stadt%20vorschlagen">${CONTACT_MAIL}</a></p>
    </section>
    <footer class="foot">
      <p class="credit">Erstellt von <strong>Vincent Wolf</strong> · © ${new Date().getFullYear()} Vincent Wolf · inspiriert von „Wachgebiet“ (geo.knt-fw.de)</p>
      <p class="disclaimer">Private Trainings-Anwendung – kein offizielles Angebot einer Feuerwehr oder Stadtverwaltung.</p>
      <p class="foot-links"><a class="link" href="${cityUrl(CITIES[last] ?? CITIES.berlin)}#impressum">Impressum &amp; Datenschutz</a></p>
    </footer>
  </main>`;
}

// ---------- Großstädte filtern (beim Tippen) ----------
function filterCities(q) {
  const n = norm(q.trim());
  const filtered = document.getElementById('filtered');
  const byLandEl = document.getElementById('by-land');
  if (!n) {
    filtered.hidden = true;
    byLandEl.hidden = false;
    return;
  }
  const hits = cities.filter((c) => norm(c.name).includes(n));
  filtered.innerHTML = hits.length ? hits.map(cityCard).join('') : '<p class="city-empty">Keine Großstadt mit diesem Namen – mit <b>Suchen</b> findest du Wachen in jedem Ort.</p>';
  filtered.hidden = false;
  byLandEl.hidden = true;
  fillCounts();
}

// ---------- bundesweite Wachensuche (OpenStreetMap / Nominatim) ----------
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const isStation = (r) => r.type === 'fire_station' || r.type === 'ambulance_station';
const SKIP = /werk(s)?feuerwehr|jugendfeuerwehr|museum|schule|übungs|lager|leitstelle|verwaltung|army|bundeswehr|flughafen/i;
function typeOf(r) {
  const n = r.name || '';
  if (r.type === 'ambulance_station' || /rettungswache|rettungsdienst/i.test(n) && !/feuer/i.test(n)) return 'RW';
  if (/feuerwache|berufsfeuerwehr|feuer-?\s?(und|u\.)\s?rettungswache|hauptwache|umweltwache/i.test(n) && !/freiwillige/i.test(n)) return 'BF';
  return 'FF';
}
async function nominatim(q) {
  const url = `${NOMINATIM}?${new URLSearchParams({ q, countrycodes: 'de', limit: '20', format: 'jsonv2', addressdetails: '1', 'accept-language': 'de' })}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(res.status);
  return res.json();
}
let searching = false;
let lastSearch = 0;
async function searchStations(q) {
  const box = document.getElementById('finder-results');
  if (searching || !q.trim()) return;
  // höchstens eine Suche pro Sekunde (Nutzungsregeln der OSM-Suche)
  const wait = Math.max(0, 1100 - (Date.now() - lastSearch));
  searching = true;
  box.innerHTML = '<p class="muted">Suche läuft …</p>';
  try {
    await new Promise((r) => setTimeout(r, wait));
    const looksLikeStation = /feuer|ff\b|ffw|wache|löschzug|löschgruppe|rettung/i.test(q);
    const queries = looksLikeStation ? [q, `Feuerwehr in ${q.replace(/^(ff|ffw|freiwillige feuerwehr|feuerwehr|feuerwache)\s+/i, '')}`] : [`Feuerwehr in ${q}`, `Rettungswache in ${q}`];
    const found = new Map();
    for (const [i, qq] of queries.entries()) {
      if (i) await new Promise((r) => setTimeout(r, 1100));
      for (const r of await nominatim(qq)) {
        if (isStation(r) && r.name && !SKIP.test(r.name)) found.set(`${r.osm_type}${r.osm_id}`, r);
      }
    }
    lastSearch = Date.now();
    const list = [...found.values()].slice(0, 25);
    box.innerHTML = list.length
      ? `<p class="finder-meta">${list.length} Wache${list.length === 1 ? '' : 'n'} gefunden · Daten aus OpenStreetMap</p>
         <ul class="station-results">${list.map(resultItem).join('')}</ul>`
      : '<p class="muted">Keine Wache gefunden. Versuche den Ortsnamen (z. B. „Hösbach“) oder den Namen der Wache.</p>';
  } catch {
    box.innerHTML = '<p class="muted">Die Suche ist gerade nicht erreichbar. Bitte in einem Moment erneut versuchen.</p>';
  } finally {
    searching = false;
  }
}
function resultItem(r) {
  const a = r.address || {};
  const type = typeOf(r);
  const place = a.city || a.town || a.village || a.municipality || a.suburb || '';
  const street = a.road ? `${a.road}${a.house_number ? ' ' + a.house_number : ''}` : '';
  const address = [street, [a.postcode, place].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const params = new URLSearchParams({ n: r.name, lat: (+r.lat).toFixed(6), lon: (+r.lon).toFixed(6), t: type, a: address, o: `${r.osm_type[0]}${r.osm_id}` });
  return `<li><a class="station" href="${new URL(`frei/?${params}`, SITE_ROOT).href}">
    <span class="badge ${type}">${type === 'BF' ? 'FW' : type}</span>
    <span class="st-main"><strong>${esc(r.name)}</strong><small>${esc([address, a.state].filter(Boolean).join(' · '))}</small></span>
  </a></li>`;
}

// ---------- Anzahl der Wachen je Großstadt ----------
const counts = {};
function fillCounts() {
  for (const el of document.querySelectorAll('.city-counts')) {
    const c = counts[el.dataset.city];
    if (!c || el.childElementCount) continue;
    el.innerHTML = [['BF', 'Feuerwachen'], ['FF', 'FF-Einheiten'], ['RW', 'Rettungswachen']]
      .filter(([t]) => c[t]).map(([t, l]) => `<span><i class="dot ${t}"></i><b>${c[t]}</b> ${l}</span>`).join('');
  }
}

applyTheme();
render();

const root = document.getElementById('start');
root.addEventListener('input', (e) => {
  if (e.target.id === 'q') {
    filterCities(e.target.value);
    if (!e.target.value.trim()) document.getElementById('finder-results').innerHTML = '';
  }
});
root.addEventListener('submit', (e) => {
  if (e.target.id === 'finder') {
    e.preventDefault();
    searchStations(document.getElementById('q').value);
  }
});
if (location.hash === '#suche') setTimeout(() => document.getElementById('q')?.focus(), 50);

Promise.all(
  cities.map(async (c) => {
    try {
      const { stations } = await (await fetch(dataUrl(c, 'stations.json'))).json();
      const k = {};
      for (const s of stations) k[s.type] = (k[s.type] ?? 0) + 1;
      counts[c.id] = k;
    } catch {
      /* ohne Zahlen */
    }
  }),
).then(fillCounts);
