// Startseite: Auswahl der Stadt
import '@fontsource/barlow/latin-400.css';
import '@fontsource/barlow/latin-500.css';
import '@fontsource/barlow/latin-600.css';
import '@fontsource/barlow/latin-700.css';
import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/barlow-condensed/latin-700.css';
import '@fontsource/barlow-condensed/latin-800.css';
import './style.css';
import { CITIES, cityUrl, dataUrl, LAST_CITY_KEY } from './city.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Darstellung wie in der App übernehmen (hell/dunkel), Stadtplan zählt als hell
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

const CITY_INFO = {
  berlin: { units: 'Berufsfeuerwehr & Freiwillige Feuerwehren', crest: 'B' },
  duisburg: { units: 'Feuerwehr, Freiwillige Feuerwehr & Rettungswachen', crest: 'DU' },
};

function cityCard(c, counts) {
  const info = CITY_INFO[c.id] ?? { units: '', crest: c.name.slice(0, 2) };
  const parts = counts
    ? [['BF', 'Feuerwachen'], ['FF', 'FF-Einheiten'], ['RW', 'Rettungswachen']]
        .filter(([t]) => counts[t])
        .map(([t, l]) => `<span><i class="dot ${t}"></i><b>${counts[t]}</b> ${l}</span>`)
        .join('')
    : '';
  return `<a class="city-card" href="${cityUrl(c)}">
    <span class="city-mark" aria-hidden="true">${esc(info.crest)}</span>
    <span class="city-body">
      <span class="city-name">${esc(c.name)}${last === c.id ? '<em>zuletzt genutzt</em>' : ''}</span>
      <span class="city-units">${esc(info.units)}</span>
      <span class="city-counts" data-city="${c.id}">${parts}</span>
    </span>
    <span class="city-go" aria-hidden="true">→</span>
  </a>`;
}

function render(countsByCity = {}) {
  const cities = Object.values(CITIES);
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
      <p>Straßen und Bahnhöfe rund um deine Wache lernen – auf einer Karte ohne Beschriftung. Wähle deine Stadt:</p>
    </section>
    <nav class="city-list" aria-label="Stadt wählen">
      ${cities.map((c) => cityCard(c, countsByCity[c.id])).join('')}
    </nav>
    <section class="how">
      <h2>So funktioniert's</h2>
      <ol>
        <li><b>Wache wählen</b> – Feuerwache, Freiwillige Feuerwehr oder Rettungswache.</li>
        <li><b>Straße oder Bahnhof finden</b> – auf der Karte antippen, so genau wie möglich.</li>
        <li><b>Abstand sehen</b> – Fehler kommen in späteren Runden öfter dran.</li>
      </ol>
    </section>
    <footer class="foot">
      <p class="credit">Erstellt von <strong>Vincent Wolf</strong> · © ${new Date().getFullYear()} Vincent Wolf · inspiriert von „Wachgebiet“ (geo.knt-fw.de)</p>
      <p class="disclaimer">Private Trainings-Anwendung – kein offizielles Angebot einer Feuerwehr oder Stadtverwaltung.</p>
      <p class="foot-links"><a class="link" href="${cityUrl(CITIES[last] ?? CITIES.berlin)}#impressum">Impressum &amp; Datenschutz</a></p>
    </footer>
  </main>`;
}

applyTheme();
render();

// Anzahl der Wachen je Stadt nachladen
Promise.all(
  Object.values(CITIES).map(async (c) => {
    try {
      const res = await fetch(dataUrl(c, 'stations.json'));
      const { stations } = await res.json();
      const counts = {};
      for (const s of stations) counts[s.type] = (counts[s.type] ?? 0) + 1;
      return [c.id, counts];
    } catch {
      return [c.id, null];
    }
  }),
).then((entries) => render(Object.fromEntries(entries)));
