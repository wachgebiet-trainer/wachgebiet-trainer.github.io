import 'maplibre-gl/dist/maplibre-gl.css';
// Schriften lokal ausliefern (keine Verbindung zu Google Fonts)
import '@fontsource/barlow/latin-400.css';
import '@fontsource/barlow/latin-500.css';
import '@fontsource/barlow/latin-600.css';
import '@fontsource/barlow/latin-700.css';
import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/barlow-condensed/latin-700.css';
import '@fontsource/barlow-condensed/latin-800.css';
import './style.css';
import { TrainerMap, COLORS, targetFeatures } from './map.js';
import { loadStations, loadGeo, loadAreas, buildPool, streetsGeoJSON, DIFFICULTIES } from './data.js';
import { circleArea, polygonArea } from './area.js';
import { nearestOnLines, distance, formatDistance } from './geo.js';
import { store } from './store.js';
import { CITY, TYPE_LABEL, SITE_ROOT, LAST_CITY_KEY, DATA_BASE } from './city.js';

const RADII = [500, 1000, 2000, 3000, 4000, 5000];
const COUNTS = [10, 20, 0];
const TIME_LIMITS = [0, 10, 20, 30, 45, 60];
const DEFAULTS = { difficulty: 'mixed', radius: 2000, count: 10, timeLimit: 0, labels: false, transit: true, theme: 'city' };
const ico = (d) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const THEMES = [
  { value: 'auto', label: 'Auto', icon: ico('<circle cx="12" cy="12" r="8"/><path d="M12 4v16a8 8 0 0 0 0-16z" fill="currentColor"/>') },
  { value: 'light', label: 'Hell', icon: ico('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>') },
  { value: 'dark', label: 'Dunkel', icon: ico('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>') },
  { value: 'city', label: 'Stadtplan', icon: ico('<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>') },
];
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

const $panel = document.getElementById('panel');
const $app = document.getElementById('app');
const $toast = document.getElementById('toast');

const state = {
  view: 'loading',
  stations: [],
  meta: null,
  geo: null,
  filter: { q: '', type: 'all', area: '' },
  station: null,
  settings: { ...DEFAULTS, ...(store.settings ?? {}) },
  game: null,
  explore: null,
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const radiusLabel = (r) => (r < 1000 ? `${r} m` : `${r / 1000} km`);
const typeLabel = (t) => TYPE_LABEL[t] ?? TYPE_LABEL.BF;
const areaColor = (type) => (type === 'RW' ? COLORS.RWring : COLORS[type] ?? COLORS.BF);

function toast(msg) {
  $toast.textContent = msg;
  $toast.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => $toast.classList.remove('show'), 2600);
}

function resolvedTheme() {
  const t = state.settings.theme;
  return t === 'auto' ? (darkQuery.matches ? 'dark' : 'light') : t;
}
function applyTheme() {
  const t = resolvedTheme();
  document.documentElement.dataset.theme = t === 'dark' ? 'dark' : 'light';
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', t === 'dark' ? '#b0000e' : '#e30613');
  tmap?.setTheme?.(t);
}
let tmap = null;
applyTheme();
tmap = new TrainerMap('map', resolvedTheme());
darkQuery.addEventListener?.('change', () => state.settings.theme === 'auto' && tmap && applyTheme());

// ---------------------------------------------------------------- Start
async function init() {
  try {
    localStorage.setItem(LAST_CITY_KEY, CITY.id);
  } catch {
    /* ohne Speicher kein Merken der Stadt */
  }
  render();
  try {
    const [st, areas] = await Promise.all([loadStations(), loadAreas(), tmap.ready]);
    state.areas = areas;
    state.stations = st.stations;
    state.meta = st.meta;
  } catch (e) {
    state.view = 'error';
    state.error = e.message || String(e);
    render();
    return;
  }
  tmap.map.on('click', onMapClick);
  tmap.map.on('mousemove', onMapMove);
  for (const layer of ['stations', 'stations-split']) {
    tmap.map.on('mouseenter', layer, () => (tmap.map.getCanvas().style.cursor = 'pointer'));
    tmap.map.on('mouseleave', layer, () => (tmap.map.getCanvas().style.cursor = ''));
  }
  tmap.setLabels(true);

  const params = new URLSearchParams(location.search);
  const wanted = (params.get('wache') ?? params.get('station') ?? [...params.keys()].find((k) => /^\d{4}$/.test(k)) ?? '').trim().toLowerCase();
  const found = wanted && state.stations.find((s) => s.number === wanted || s.key === wanted);
  if (found) selectStation(found);
  else showHome();
  if (location.hash === '#impressum') {
    state.view = 'legal';
    render();
  }
}

window.addEventListener('hashchange', () => {
  if (location.hash === '#impressum' && state.stations.length) {
    stopTimer();
    state.view = 'legal';
    render();
  }
});

function setUrl(station) {
  const url = new URL(location.href);
  url.search = station ? `?wache=${station.number}` : '';
  history.replaceState(null, '', url);
}

// ---------------------------------------------------------------- Ansichten
function showHome() {
  stopTimer();
  state.view = 'home';
  state.station = null;
  state.game = null;
  state.explore = null;
  setUrl(null);
  tmap.clearOverlays();
  tmap.setLabels(true);
  tmap.showStations(filteredStations());
  tmap.fitCity();
  render();
}

async function selectStation(station) {
  stopTimer();
  state.station = station;
  state.view = 'setup';
  state.game = null;
  state.explore = null;
  setUrl(station);
  tmap.clearOverlays();
  tmap.setLabels(true);
  tmap.showStations(state.stations, station.key);
  previewArea();
  render();
  if (!state.geo) {
    try {
      state.geo = await loadGeo();
    } catch (e) {
      toast(e.message);
      return;
    }
  }
  updatePoolPreview();
}

// Amtliches Gebiet der Wache (Berlin: Einsatzbereich), falls vorhanden
const stationAreaDef = (s) => (s && state.areas ? state.areas[String(s.area)] : null);
const AREA_MODE = -1; // Wert von settings.radius für „amtliches Gebiet“

// Aktuelles Trainingsgebiet: Einsatzbereich oder Kreis um die Wache
let areaCache = { key: '', area: null };
function currentArea() {
  const s = state.station;
  const def = state.settings.radius === AREA_MODE ? stationAreaDef(s) : null;
  const radius = state.settings.radius > 0 ? state.settings.radius : 2000;
  const key = `${s.key}|${def ? 'area' : radius}`;
  if (areaCache.key !== key) {
    areaCache = { key, area: def ? polygonArea(def.geometry, s.center, def.short) : circleArea(s.center, radius) };
  }
  return areaCache.area;
}

function previewArea() {
  const s = state.station;
  const area = currentArea();
  tmap.showArea(area, areaColor(s.type));
  tmap.fitArea(area);
}

function updatePoolPreview() {
  if (state.view !== 'setup' || !state.geo) return;
  const pool = buildPool(state.geo, currentArea(), state.settings);
  state.poolSize = pool.length;
  state.poolStreets = pool.filter((t) => t.type === 'street').length;
  const el = document.getElementById('pool-info');
  if (el) el.innerHTML = poolInfoHTML();
  const startBtn = document.getElementById('start-btn');
  if (startBtn) startBtn.disabled = !pool.length;
  const exploreBtn = document.querySelector('[data-act=explore]');
  if (exploreBtn) exploreBtn.disabled = false;
}

function poolInfoHTML() {
  if (state.poolSize == null) return '<span class="muted">Straßendaten werden geladen …</span>';
  const transit = state.poolSize - state.poolStreets;
  return `<strong>${state.poolSize}</strong> Ziele im Pool <span class="muted">· ${state.poolStreets} Straßen${state.settings.transit ? `, ${transit} Bahnhöfe` : ''}</span>`;
}

// ---------------------------------------------------------------- Training
function pickTargets(pool, count, stationKey) {
  const progress = store.station(stationKey).targets;
  const weighted = pool.map((t) => {
    const p = progress[t.id];
    let w = 1;
    if (p) w = p.last < 70 ? 3 : p.hits >= 3 ? 0.35 : 0.8;
    return { t, k: Math.random() ** (1 / w) }; // gewichtete Zufallsauswahl
  });
  weighted.sort((a, b) => b.k - a.k);
  const n = count ? Math.min(count, pool.length) : pool.length;
  return weighted.slice(0, n).map((x) => x.t);
}

function startGame(targets) {
  const s = state.settings;
  store.saveSettings(s);
  const pool = targets ?? buildPool(state.geo, currentArea(), s);
  if (!pool.length) {
    toast('Für diese Einstellungen gibt es keine Ziele.');
    return;
  }
  const queue = targets ?? pickTargets(pool, s.count, state.station.key);
  state.game = {
    queue,
    index: 0,
    results: [],
    guess: null,
    phase: 'guess',
    isRepeat: !!targets,
    modeKey: `${s.difficulty}-${currentArea().kind === 'polygon' ? 'eb' : currentArea().radius}-${s.transit ? 'b' : 'n'}`,
    labelsUsed: s.labels,
  };
  state.view = 'game';
  tmap.clearOverlays();
  tmap.hideStationsExcept(state.station);
  tmap.showArea(currentArea(), areaColor(state.station.type));
  tmap.setLabels(s.labels);
  tmap.fitArea(currentArea());
  nextTarget(true);
}

function currentTarget() {
  return state.game.queue[state.game.index];
}

function nextTarget(first = false) {
  const g = state.game;
  if (!first) g.index += 1;
  if (g.index >= g.queue.length) return finishGame();
  g.guess = null;
  g.phase = 'guess';
  tmap.set('points');
  tmap.set('solution');
  tmap.set('link');
  tmap.setLabels(state.settings.labels);
  if (!first) tmap.fitArea(currentArea(), { duration: 500 });
  startTimer();
  render();
}

function placeGuess(lngLat) {
  const g = state.game;
  if (!currentArea().contains(lngLat)) {
    toast(currentArea().kind === 'polygon' ? `Tipps sind nur innerhalb des ${CITY.areaName ?? 'Gebiets'} möglich.` : 'Tipps sind nur innerhalb des Kreises möglich.');
    return;
  }
  g.guess = lngLat;
  tmap.set('points', { type: 'Feature', properties: { kind: 'guess' }, geometry: { type: 'Point', coordinates: lngLat } });
  render();
}

function scoreFor(target, d) {
  const tol = target.type === 'transit' ? 120 : 15;
  if (d <= tol) return 100;
  const k = Math.max(150, Math.min(currentArea().eqRadius, 5000) * 0.12);
  return Math.max(0, Math.round(100 * Math.exp(-(d - tol) / k)));
}

function submitGuess(skipped = false) {
  const g = state.game;
  if (g.phase !== 'guess') return;
  stopTimer();
  const t = currentTarget();
  let result;
  if (!g.guess || skipped) {
    result = { id: t.id, name: t.name, type: t.type, target: t, skipped: true, distance: null, score: 0 };
  } else {
    const near = nearestOnLines(g.guess, t.lines);
    result = { id: t.id, name: t.name, type: t.type, target: t, guess: g.guess, nearest: near.point, distance: near.d, score: scoreFor(t, near.d) };
  }
  g.results.push(result);
  g.phase = 'reveal';
  showResultOnMap(result);
  render();
}

function showResultOnMap(r) {
  tmap.set('solution', { type: 'FeatureCollection', features: targetFeatures(r.target) });
  if (r.guess) {
    tmap.set('points', {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { kind: 'guess' }, geometry: { type: 'Point', coordinates: r.guess } },
        { type: 'Feature', properties: { kind: 'nearest' }, geometry: { type: 'Point', coordinates: r.nearest } },
      ],
    });
    tmap.set('link', { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [r.guess, r.nearest] } });
    tmap.fitLines(r.target.type === 'transit' ? [] : r.target.lines, [r.guess, r.nearest]);
  } else {
    tmap.set('points');
    tmap.set('link');
    tmap.fitLines(r.target.lines);
  }
}

function startTimer() {
  stopTimer();
  const limit = state.settings.timeLimit;
  if (!limit) return;
  const g = state.game;
  g.deadline = Date.now() + limit * 1000;
  const tick = () => {
    const left = Math.max(0, Math.ceil((g.deadline - Date.now()) / 1000));
    const el = document.getElementById('timer');
    if (el) {
      el.textContent = `${left}s`;
      el.classList.toggle('urgent', left <= 5);
    }
    if (left <= 0) {
      stopTimer();
      submitGuess(!g.guess);
    }
  };
  tick();
  state.timer = setInterval(tick, 250);
}

function stopTimer() {
  clearInterval(state.timer);
  state.timer = null;
}

function finishGame() {
  stopTimer();
  const g = state.game;
  const total = g.results.reduce((a, r) => a + r.score, 0);
  const placed = g.results.filter((r) => r.distance != null);
  const avgDistance = placed.length ? placed.reduce((a, r) => a + r.distance, 0) / placed.length : null;
  g.summary = { total, max: g.results.length * 100, avgDistance };
  const before = store.station(state.station.key).best[g.modeKey];
  g.newBest = !g.isRepeat && (!before || total / g.summary.max > before);
  if (!g.isRepeat) store.recordRound(state.station.key, { results: g.results, total, max: g.summary.max, avgDistance, modeKey: g.modeKey });
  state.view = 'results';
  showReview();
  render();
}

const scoreColor = (s) => (s >= 85 ? '#0b8a4b' : s >= 50 ? '#c99700' : s > 0 ? '#e07b00' : '#e30613');

function showReview(focusIndex = null) {
  const res = state.game.results;
  const list = focusIndex == null ? res : [res[focusIndex]];
  const lines = [];
  const points = [];
  const links = [];
  for (const r of list) {
    const color = scoreColor(r.score);
    for (const f of targetFeatures(r.target, { color })) (f.geometry.type === 'Point' ? points : lines).push(f);
    if (r.guess) {
      points.push({ type: 'Feature', properties: { color: COLORS.guess }, geometry: { type: 'Point', coordinates: r.guess } });
      links.push({ type: 'Feature', properties: { color }, geometry: { type: 'LineString', coordinates: [r.guess, r.nearest] } });
    }
  }
  tmap.set('solution');
  tmap.set('points');
  tmap.set('reviewLines', { type: 'FeatureCollection', features: lines });
  tmap.set('reviewPoints', { type: 'FeatureCollection', features: points });
  tmap.set('link', { type: 'FeatureCollection', features: links });
  tmap.setLabels(true);
  if (focusIndex == null) tmap.fitArea(currentArea());
  else {
    const r = res[focusIndex];
    tmap.fitLines(r.target.type === 'transit' ? [] : r.target.lines, r.guess ? [r.guess, r.nearest, r.target.lines[0][0]] : [r.target.lines[0][0]]);
  }
}

function verdict(pct) {
  if (pct >= 0.9) return 'Ortskundig wie ein alter Hase – das Wachgebiet sitzt.';
  if (pct >= 0.75) return 'Sehr sicher unterwegs. Nur wenige Ziele brauchen noch Feinschliff.';
  if (pct >= 0.55) return 'Gute Orientierung – die Richtung stimmt fast immer.';
  if (pct >= 0.35) return 'Solide Basis. Wiederhole die Fehler, dann geht es schnell voran.';
  return 'Das Gebiet ist noch neu – genau dafür ist das Training da.';
}

// ---------------------------------------------------------------- Erkunden
function startExplore() {
  const s = state.settings;
  store.saveSettings(s);
  state.view = 'explore';
  const pool = buildPool(state.geo, currentArea(), { difficulty: 'mixed', transit: true });
  state.explore = { pool, selected: null, hover: null };
  tmap.clearOverlays();
  tmap.hideStationsExcept(state.station);
  tmap.showArea(currentArea(), areaColor(state.station.type));
  tmap.set('explore', streetsGeoJSON(state.geo, currentArea(), 300));
  tmap.setLabels(s.labels);
  tmap.fitArea(currentArea());
  render();
}

function exploreSelect(target) {
  const ex = state.explore;
  ex.selected = target;
  tmap.set('solution', target ? { type: 'FeatureCollection', features: targetFeatures(target) } : null);
  if (target) tmap.fitLines(target.type === 'transit' ? [] : target.lines, target.type === 'transit' ? [target.lines[0][0]] : []);
  render();
}

// ---------------------------------------------------------------- Karte
function onMapClick(e) {
  const lngLat = [e.lngLat.lng, e.lngLat.lat];
  if (state.view === 'home' || state.view === 'setup') {
    const f = tmap.map.queryRenderedFeatures(e.point, { layers: ['stations', 'stations-split'] })[0];
    if (f) {
      let key = f.properties.key;
      if (f.properties.type === 'BOTH') {
        // geteilter Kreis: linke Hälfte = BF, rechte Hälfte = FF
        const cx = tmap.map.project(f.geometry.coordinates).x;
        key = e.point.x < cx ? f.properties.bfKey : f.properties.ffKey;
      }
      const st = state.stations.find((s) => s.key === key);
      if (st) selectStation(st);
    }
    return;
  }
  if (state.view === 'game' && state.game.phase === 'guess') {
    placeGuess(lngLat);
    return;
  }
  if (state.view === 'explore') {
    const box = [[e.point.x - 8, e.point.y - 8], [e.point.x + 8, e.point.y + 8]];
    const f = tmap.map.queryRenderedFeatures(box, { layers: ['explore'] })[0];
    const target = f && state.explore.pool.find((t) => t.name === f.properties.name);
    exploreSelect(target ?? null);
  }
}

function onMapMove(e) {
  if (state.view !== 'explore') return;
  const box = [[e.point.x - 6, e.point.y - 6], [e.point.x + 6, e.point.y + 6]];
  const f = tmap.map.queryRenderedFeatures(box, { layers: ['explore'] })[0];
  const name = f?.properties.name ?? '';
  tmap.map.getCanvas().style.cursor = name ? 'pointer' : '';
  if (name === state.explore.hover) return;
  state.explore.hover = name;
  tmap.setHover(name);
  const el = document.getElementById('hover-name');
  if (el) el.textContent = name || ' ';
}

// ---------------------------------------------------------------- Rendering
function filteredStations() {
  const { q, type, area } = state.filter;
  const needle = q.trim().toLowerCase();
  return state.stations.filter(
    (s) =>
      (type === 'all' || s.type === type) &&
      (!area || String(s.area) === area) &&
      (!needle || s.number.includes(needle) || s.name.toLowerCase().includes(needle) || s.ortsteil?.toLowerCase().includes(needle) || s.bezirk?.toLowerCase().includes(needle)),
  );
}

function render() {
  const key = `${state.view}|${state.station?.key ?? ''}`;
  if (key !== render.last) {
    $panel.scrollTop = 0;
    render.last = key;
  }
  $app.dataset.view = state.view;
  const fn = { loading: renderLoading, error: renderError, home: renderHome, setup: renderSetup, game: renderGame, results: renderResults, explore: renderExplore, legal: renderLegal }[state.view];
  $panel.innerHTML = fn();
  if (state.view === 'home') {
    const inp = document.getElementById('search');
    if (inp && document.activeElement?.id !== 'search' && state.focusSearch) {
      inp.focus();
      inp.setSelectionRange(inp.value.length, inp.value.length);
    }
  }
}

const renderLoading = () => `<div class="center-msg"><div class="spinner"></div><p>Karte wird vorbereitet …</p></div>`;
const renderError = () => `<div class="center-msg"><h2>Da ist etwas schiefgelaufen</h2><p>${esc(state.error)}</p><button class="btn primary" data-act="reload">Erneut versuchen</button></div>`;

function header(sub = '') {
  return `<header class="brand">
    <button class="logo" data-act="home" aria-label="Zur Startseite">
      <span class="logo-icon" aria-hidden="true">🚨</span>
      <span><strong>Wachgebiet-Trainer</strong><small>${CITY.subtitle}</small></span>
    </button>${sub}
    <a class="city-btn" href="${SITE_ROOT.href}" title="Stadt wechseln" aria-label="Stadt wechseln (aktuell ${esc(CITY.name)})">${ico('<path d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10z"/><circle cx="12" cy="11" r="2.2"/>')}<span>Stadt</span></a>
    <button class="theme-btn" data-act="theme-menu" aria-expanded="${!!state.themeMenu}" aria-label="Darstellung wählen" title="Darstellung">${THEMES.find((t) => t.value === state.settings.theme)?.icon ?? THEMES[0].icon}</button>
  </header>
  ${state.themeMenu ? `<div class="theme-menu"><span class="lbl">Darstellung</span>${seg('theme', THEMES, state.settings.theme, (o) => `<b aria-hidden="true">${o.icon}</b>${o.label}`)}</div>` : ''}`;
}

function renderHome() {
  const list = filteredStations();
  const count = (t) => state.stations.filter((s) => s.type === t).length;
  const chip = (v, l, n) => `<button class="chip ${state.filter.type === v ? 'on' : ''}" data-act="ftype" data-v="${v}">${l} <span>${n}</span></button>`;
  const areas = [...new Set(state.stations.map((s) => s.area).filter(Boolean))].sort();
  return `${header()}
  <section class="intro">
    <h1>Kenne dein <em>Wachgebiet.</em></h1>
    <p>${CITY.intro}</p>
    ${CITY.dataNote ? `<p class="data-note">${esc(CITY.dataNote)}</p>` : ''}
  </section>
  <div class="search-row">
    <input id="search" type="search" placeholder="${CITY.searchPlaceholder}" value="${esc(state.filter.q)}" autocomplete="off" aria-label="Wache suchen" />
  </div>
  <div class="chips">
    ${chip('all', 'Alle', state.stations.length)}${['BF', 'FF', 'RW'].filter((t) => count(t)).map((t) => chip(t, `<i class="dot ${t}"></i>${TYPE_LABEL[t]}`, count(t))).join('')}
    <select id="area" aria-label="${CITY.areaAria}">
      <option value="">${CITY.areaAll}</option>
      ${areas.map((a) => `<option value="${esc(a)}" ${state.filter.area === String(a) ? 'selected' : ''}>${esc(CITY.areaLabel(a))}</option>`).join('')}
    </select>
  </div>
  <ul class="station-list">
    ${list.length ? list.map(stationItem).join('') : '<li class="empty">Keine passende Wache gefunden.</li>'}
  </ul>
  ${footer()}`;
}

function stationItem(s) {
  const prog = store.station(s.key);
  const best = Math.max(0, ...Object.values(prog.best));
  return `<li><button class="station" data-act="select" data-key="${s.key}">
    <span class="badge ${s.type}">${s.number}</span>
    <span class="st-main"><strong>${esc(s.name)}</strong><small>${esc(s.hostedAt ? `an ${s.hostedAt}` : s.address || typeLabel(s.type))}</small></span>
    ${best ? `<span class="best" title="Bestleistung">${Math.round(best * 100)}%</span>` : ''}
  </button></li>`;
}

function renderLegal() {
  return `${header()}
  <button class="back" data-act="home">← Alle Wachen</button>
  <article class="legal">
    <h2>Impressum</h2>
    <p><strong>Angaben gemäß § 5 DDG</strong></p>
    <address>
      Vincent Wolf<br />
      Am Rain 8<br />
      13591 Berlin
    </address>
    <p><strong>Kontakt</strong><br />E-Mail: <a href="mailto:wachgebiet.trainer@gmail.com">wachgebiet.trainer@gmail.com</a><br />Telefon: 0162 9033110</p>
    <p><strong>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV:</strong><br />Vincent Wolf, Anschrift wie oben</p>

    <h3>Über den Wachgebiet-Trainer</h3>
    <p>Der Wachgebiet-Trainer ist ein privates, nicht-kommerzielles Projekt von <strong>Vincent Wolf</strong>.
      Er hilft Einsatzkräften der Berufsfeuerwehr, der Freiwilligen Feuerwehren und des Rettungsdienstes, die Straßen und Bahnhöfe
      in ihrem Wachgebiet zu lernen.</p>
    <p>Inspiriert vom Ortskunde-Trainer „Wachgebiet“ (<a href="https://geo.knt-fw.de" target="_blank" rel="noopener">geo.knt-fw.de</a>).
      Gestaltung und Umsetzung: Vincent Wolf. © ${new Date().getFullYear()} Vincent Wolf. Alle Rechte an Gestaltung und Programmcode vorbehalten,
      soweit nicht anders angegeben.</p>
    <p>Dies ist <strong>kein offizielles Angebot der ${CITY.officialName}</strong>${CITY.disclaimerExtra}. Alle Angaben ohne Gewähr;
      maßgeblich für den Einsatz sind ausschließlich die dienstlichen Unterlagen und Systeme.</p>

    <h3>Datenquellen ${esc(CITY.name)}</h3>
    <ul>
      ${CITY.sources.map((src) => `<li>${esc(src)}</li>`).join('')}
      <li>Hintergrundkarte: OpenFreeMap, OpenMapTiles, © OpenStreetMap-Mitwirkende (ODbL)</li>
    </ul>
    ${CITY.odbl ? `<p>Die für ${esc(CITY.name)} aus OpenStreetMap abgeleiteten Daten (Wachenstandorte, Straßen und Bahnhöfe) stehen unter der
      <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noopener">Open Database License (ODbL) 1.0</a>
      und können als Dateien abgerufen werden:
      <a href="${DATA_BASE}stations.json" target="_blank" rel="noopener">Wachen</a>,
      <a href="${DATA_BASE}streets.json" target="_blank" rel="noopener">Straßen</a>,
      <a href="${DATA_BASE}transit.json" target="_blank" rel="noopener">Bahnhöfe</a>.</p>` : ''}

    <h3>Datenschutz</h3>
    <p><strong>Verantwortlich:</strong> Vincent Wolf, Am Rain 8, 13591 Berlin, E-Mail: <a href="mailto:wachgebiet.trainer@gmail.com">wachgebiet.trainer@gmail.com</a></p>
    <p>Diese Seite verwendet keine Cookies, kein Tracking und keine Analyse-Werkzeuge. Es gibt keine Anmeldung,
      und es werden keine personenbezogenen Daten an den Betreiber übermittelt.</p>
    <p><strong>Speicherung auf deinem Gerät:</strong> Einstellungen und Trainingsfortschritt werden ausschließlich
      im Browser deines Geräts gespeichert (Local Storage) und verlassen es nicht. Du kannst sie jederzeit über
      „Lokalen Fortschritt löschen“ oder die Browser-Einstellungen entfernen. Im Gastmodus wird kein Fortschritt gespeichert.</p>
    <p><strong>Hosting:</strong> Die Seite wird über GitHub Pages (GitHub Inc., USA) bereitgestellt. Beim Aufruf
      verarbeitet GitHub technisch notwendige Verbindungsdaten wie die IP-Adresse, um die Seite auszuliefern und die
      Sicherheit des Dienstes zu gewährleisten (Art. 6 Abs. 1 lit. f DSGVO). Näheres in der
      <a href="https://docs.github.com/de/site-policy/privacy-policies/github-general-privacy-statement" target="_blank" rel="noopener">Datenschutzerklärung von GitHub</a>.</p>
    <p><strong>Kartendienst:</strong> Die Hintergrundkarte wird von OpenFreeMap geladen. Dabei wird deine IP-Adresse an
      deren Server übertragen, damit die Kartenausschnitte ausgeliefert werden können (Art. 6 Abs. 1 lit. f DSGVO).
      Siehe <a href="https://openfreemap.org" target="_blank" rel="noopener">openfreemap.org</a>.</p>
    <p>Schriften und alle übrigen Inhalte werden direkt von dieser Seite ausgeliefert; es besteht keine Verbindung zu Google.</p>
    <p>Du hast das Recht auf Auskunft, Berichtigung, Löschung und Einschränkung der Verarbeitung sowie ein Beschwerderecht
      bei einer Datenschutz-Aufsichtsbehörde.</p>
  </article>
  ${footer()}`;
}

function footer() {
  return `<footer class="foot">
    <p class="credit">Erstellt von <strong>Vincent Wolf</strong> · © ${new Date().getFullYear()} Vincent Wolf · inspiriert von „Wachgebiet“ (geo.knt-fw.de)</p>
    <p class="disclaimer">Private Trainings-Anwendung – kein offizielles Angebot der ${CITY.officialName}.</p>
    <p>${CITY.footerSources}</p>
    <p class="other-cities"><a class="btn city-switch" href="${SITE_ROOT.href}">${ico('<path d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10z"/><circle cx="12" cy="11" r="2.2"/>')} Stadt wechseln</a></p>
    <p class="foot-links"><button class="link" data-act="legal">Impressum &amp; Datenschutz</button><button class="link" data-act="clear">Lokalen Fortschritt löschen</button></p>
  </footer>`;
}

function seg(name, options, current, fmt = (o) => o.label) {
  return `<div class="seg" role="radiogroup">${options
    .map((o) => `<button role="radio" aria-checked="${o.value === current}" class="${o.value === current ? 'on' : ''}" data-act="set" data-k="${name}" data-v="${o.value}">${fmt(o)}</button>`)
    .join('')}</div>`;
}

function renderSetup() {
  const s = state.station;
  const st = state.settings;
  const prog = store.station(s.key);
  const modeKey = `${st.difficulty}-${currentArea().kind === 'polygon' ? 'eb' : currentArea().radius}-${st.transit ? 'b' : 'n'}`;
  const best = prog.best[modeKey];
  const mastered = Object.values(prog.targets).filter((t) => t.hits >= 2 && t.last >= 70).length;
  const ff = s.type === 'FF';
  return `${header()}
  <button class="back" data-act="home">← Alle Wachen</button>
  <section class="station-card ${s.type}">
    <div class="sc-top"><span class="badge ${s.type} big">${s.number}</span><span class="type">${typeLabel(s.type)}${s.area ? ` · ${esc(CITY.areaLabel(s.area))}` : ''}</span></div>
    <h2>${esc(s.name)}</h2>
    ${s.address || s.ortsteil ? `<p>${esc(s.address)}${s.address && s.ortsteil ? ' · ' : ''}${esc(s.ortsteil ?? '')}</p>` : ''}
    ${s.hostedAt ? `<p class="hosted">Untergebracht an der ${esc(s.hostedAt)}</p>` : ''}
    ${ff && !s.hostedAt ? `<p class="hint">${CITY.ffHint}</p>` : ''}
  </section>

  <section class="settings">
    <label class="lbl">Schwierigkeit</label>
    ${seg('difficulty', DIFFICULTIES, st.difficulty, (o) => `${o.label}<small>${o.hint}</small>`)}
    <label class="lbl">Trainingsgebiet</label>
    ${seg('radius', [...(stationAreaDef(s) ? [{ value: AREA_MODE, label: stationAreaDef(s).short }] : []), ...RADII.map((r) => ({ value: r, label: radiusLabel(r) }))], currentArea().kind === 'polygon' ? AREA_MODE : currentArea().radius)}
    ${currentArea().kind === 'polygon' ? `<p class="muted small area-hint">${esc(stationAreaDef(s).name)} – amtliches Gebiet (${esc(CITY.areaSource ?? '')}).</p>` : ''}
    <label class="lbl">Ziele pro Runde</label>
    ${seg('count', COUNTS.map((c) => ({ value: c, label: c ? String(c) : 'Alle' })), st.count)}
    <label class="lbl">Zeitlimit pro Ziel</label>
    ${seg('timeLimit', TIME_LIMITS.map((t) => ({ value: t, label: t ? `${t}s` : 'Keins' })), st.timeLimit)}
    <div class="toggles">
      <label class="switch"><input type="checkbox" data-act="toggle" data-k="transit" ${st.transit ? 'checked' : ''}/><span></span>S-/U-Bahnhöfe abfragen</label>
      <label class="switch"><input type="checkbox" data-act="toggle" data-k="labels" ${st.labels ? 'checked' : ''}/><span></span>Straßennamen anzeigen (Orientierungshilfe)</label>
    </div>
    <p id="pool-info" class="pool">${poolInfoHTML()}</p>
  </section>
  <div class="actions">
    <button id="start-btn" class="btn primary" data-act="start" ${state.poolSize ? '' : 'disabled'}>Training starten</button>
    <button class="btn" data-act="explore" ${state.geo ? '' : 'disabled'}>Gebiet erkunden</button>
  </div>
  <section class="stats">
    <div><strong>${prog.rounds.length}</strong><small>Runden auf diesem Gerät</small></div>
    <div><strong>${best ? Math.round(best * 100) + '%' : '–'}</strong><small>Bestleistung in diesem Modus</small></div>
    <div><strong>${mastered}</strong><small>Ziele sicher gefunden</small></div>
  </section>
  ${store.guest ? '<p class="muted small">Gastmodus aktiv · Fortschritt wird nicht gespeichert</p>' : ''}
  <label class="switch small"><input type="checkbox" data-act="guest" ${store.guest ? 'checked' : ''}/><span></span>Gastmodus (z. B. auf fremden Geräten)</label>`;
}

function renderGame() {
  const g = state.game;
  const t = currentTarget();
  const r = g.phase === 'reveal' ? g.results.at(-1) : null;
  const total = g.results.reduce((a, x) => a + x.score, 0);
  const kind = t.type === 'transit' ? 'Finde den Bahnhof.' : 'Finde die Straße.';
  return `<div class="game">
    <div class="game-top">
      <button class="icon-btn" data-act="abort" title="Runde abbrechen" aria-label="Runde abbrechen">✕</button>
      <span class="progress">${g.index + 1} / ${g.queue.length}${g.isRepeat ? ' · Wiederholung' : ''}</span>
      <span class="score">${total} Punkte</span>
      ${state.settings.timeLimit && g.phase === 'guess' ? '<span id="timer" class="timer"></span>' : ''}
    </div>
    <div class="prompt">
      <small>${kind}</small>
      <h2>${esc(t.name)}</h2>
      ${state.settings.labels ? '<p class="muted small">Straßennamen sind als Orientierungshilfe sichtbar.</p>' : ''}
    </div>
    ${
      r
        ? `<div class="reveal" style="--c:${scoreColor(r.score)}">
            ${r.skipped ? '<strong>Lösung angezeigt</strong><span>Dieses Ziel kommt in die Wiederholung.</span>' : `<strong>${formatDistance(r.distance)} daneben</strong><span>${r.score} Punkte${r.score === 100 ? ' · Treffer!' : ''}</span>`}
          </div>
          <div class="actions"><button class="btn primary" data-act="next" autofocus>${g.index + 1 < g.queue.length ? 'Nächstes Ziel' : 'Auswertung ansehen'}</button></div>`
        : `<p class="muted small">${g.guess ? 'Marker gesetzt – du kannst ihn noch verschieben.' : 'Tippe auf die Karte, um deinen Tipp zu setzen.'}</p>
          <div class="actions">
            <button class="btn primary" data-act="submit" ${g.guess ? '' : 'disabled'}>Tipp abgeben</button>
            <button class="btn" data-act="skip">Weiß ich nicht</button>
          </div>`
    }
  </div>`;
}

function renderResults() {
  const g = state.game;
  const { total, max, avgDistance } = g.summary;
  const pct = max ? total / max : 0;
  const misses = g.results.filter((r) => r.score < 70);
  return `<div class="results">
    <button class="back" data-act="setup">← ${esc(state.station.name)}</button>
    <h2>Runde abgeschlossen</h2>
    <div class="big-score"><strong>${Math.round(pct * 100)}%</strong><span>${total} von ${max} Punkten</span></div>
    ${g.newBest ? '<p class="newbest">Neue Bestleistung in diesem Modus!</p>' : ''}
    <p>${verdict(pct)}</p>
    <div class="stats">
      <div><strong>${formatDistance(avgDistance)}</strong><small>Ø Abstand</small></div>
      <div><strong>${g.results.filter((r) => r.score === 100).length}</strong><small>Treffer</small></div>
      <div><strong>${g.results.filter((r) => r.skipped).length}</strong><small>Übersprungen</small></div>
    </div>
    ${g.labelsUsed ? '<p class="muted small">Diese Runde wurde mit Straßennamen als Orientierungshilfe gespielt.</p>' : ''}
    <div class="actions">
      ${misses.length ? `<button class="btn primary" data-act="repeat">${misses.length} Fehler wiederholen</button>` : ''}
      <button class="btn ${misses.length ? '' : 'primary'}" data-act="start">Neue Runde</button>
    </div>
    <h3>Tipps und Abstände <button class="link" data-act="review-all">Alle auf der Karte</button></h3>
    <ol class="result-list">
      ${g.results
        .map(
          (r, i) => `<li><button data-act="review" data-i="${i}">
          <span class="dot" style="background:${scoreColor(r.score)}"></span>
          <span class="rl-name">${esc(r.name)}</span>
          <span class="rl-val">${r.skipped ? 'übersprungen' : formatDistance(r.distance)}</span>
          <span class="rl-pts">${r.score}</span></button></li>`,
        )
        .join('')}
    </ol>
  </div>`;
}

function renderExplore() {
  const ex = state.explore;
  const sel = ex.selected;
  return `<div class="explore">
    <button class="back" data-act="setup">← ${esc(state.station.name)}</button>
    <h2>Gebiet erkunden</h2>
    <p class="muted">Fahre über die Karte oder tippe eine Straße an, um ihren Namen zu sehen. Oder suche gezielt:</p>
    <input id="ex-search" type="search" list="ex-names" placeholder="Straße oder Bahnhof suchen" autocomplete="off" />
    <datalist id="ex-names">${ex.pool.map((t) => `<option value="${esc(t.name)}"></option>`).join('')}</datalist>
    <div class="hover-name" id="hover-name">${esc(ex.hover || ' ')}</div>
    ${sel ? `<div class="selected"><small>${sel.type === 'transit' ? 'Bahnhof' : sel.cls <= 2 ? 'Hauptstraße' : 'Nebenstraße'}</small><strong>${esc(sel.name)}</strong></div>` : ''}
    <div class="legend">
      <span><i style="background:#b0326e"></i>Autobahn / großräumig</span>
      <span><i style="background:#c8102e"></i>übergeordnet</span>
      <span><i style="background:#e07b00"></i>örtlich / ergänzend</span>
      <span><i style="background:#1f5fbf"></i>Nebenstraße</span>
    </div>
    <label class="switch"><input type="checkbox" data-act="toggle-ex-labels" ${tmap.labelsVisible ? 'checked' : ''}/><span></span>Straßennamen der Karte anzeigen</label>
    <p class="muted small">${ex.pool.length} Straßen und Bahnhöfe ${currentArea().kind === 'polygon' ? `im ${esc(currentArea().label)}` : `im Radius von ${currentArea().label}`}.</p>
    <div class="actions"><button class="btn primary" data-act="start">Jetzt trainieren</button></div>
  </div>`;
}

// ---------------------------------------------------------------- Events
$panel.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b || b.tagName === 'INPUT' || b.tagName === 'SELECT') return;
  const act = b.dataset.act;
  switch (act) {
    case 'home': return showHome();
    case 'reload': return location.reload();
    case 'select': return selectStation(state.stations.find((s) => s.key === b.dataset.key));
    case 'ftype':
      state.filter.type = b.dataset.v;
      tmap.showStations(filteredStations());
      return render();
    case 'set': {
      const k = b.dataset.k;
      state.settings[k] = k === 'difficulty' || k === 'theme' ? b.dataset.v : Number(b.dataset.v);
      store.saveSettings(state.settings);
      if (k === 'theme') {
        applyTheme();
        return render();
      }
      if (k === 'radius') previewArea();
      render();
      return updatePoolPreview();
    }
    case 'theme-menu':
      state.themeMenu = !state.themeMenu;
      return render();
    case 'start': return startGame();
    case 'explore': return startExplore();
    case 'setup': return selectStation(state.station);
    case 'submit': return submitGuess();
    case 'skip': return submitGuess(true);
    case 'next': return nextTarget();
    case 'abort':
      if (state.game.results.length && confirm('Runde abbrechen und auswerten?')) return finishGame();
      return selectStation(state.station);
    case 'repeat': {
      const misses = state.game.results.filter((r) => r.score < 70).map((r) => r.target);
      return startGame(misses.sort(() => Math.random() - 0.5));
    }
    case 'review': return showReview(Number(b.dataset.i));
    case 'review-all': return showReview();
    case 'legal':
      stopTimer();
      state.view = 'legal';
      return render();
    case 'clear':
      if (confirm('Gesamten lokalen Trainingsfortschritt auf diesem Gerät löschen?')) {
        store.clear();
        render();
        toast('Fortschritt gelöscht.');
      }
      return;
  }
});

$panel.addEventListener('change', (e) => {
  const el = e.target;
  if (el.id === 'area') {
    state.filter.area = el.value;
    tmap.showStations(filteredStations());
    return render();
  }
  if (el.dataset.act === 'toggle') {
    state.settings[el.dataset.k] = el.checked;
    store.saveSettings(state.settings);
    if (el.dataset.k === 'transit') updatePoolPreview();
  }
  if (el.dataset.act === 'guest') {
    store.guest = el.checked;
    render();
  }
  if (el.dataset.act === 'toggle-ex-labels') tmap.setLabels(el.checked);
  if (el.id === 'ex-search') {
    const t = state.explore.pool.find((x) => x.name.toLowerCase() === el.value.trim().toLowerCase());
    if (t) exploreSelect(t);
  }
});

$panel.addEventListener('input', (e) => {
  if (e.target.id === 'search') {
    state.filter.q = e.target.value;
    state.focusSearch = true;
    tmap.showStations(filteredStations());
    const ul = $panel.querySelector('.station-list');
    const list = filteredStations();
    ul.innerHTML = list.length ? list.map(stationItem).join('') : '<li class="empty">Keine passende Wache gefunden.</li>';
  }
  if (e.target.id === 'ex-search') {
    const t = state.explore.pool.find((x) => x.name.toLowerCase() === e.target.value.trim().toLowerCase());
    if (t) exploreSelect(t);
  }
});

$panel.addEventListener('keydown', (e) => {
  if (e.target.id === 'search' && e.key === 'Enter') {
    const first = filteredStations()[0];
    if (first) selectStation(first);
  }
});

document.addEventListener('keydown', (e) => {
  if (state.view !== 'game' || ['INPUT', 'BUTTON', 'SELECT'].includes(e.target.tagName)) return;
  if (e.key === 'Enter') {
    if (state.game.phase === 'guess' && state.game.guess) submitGuess();
    else if (state.game.phase === 'reveal') nextTarget();
  }
});

// Ändert sich die Kartengröße (Drehen des Geräts, Wechsel ins Training),
// den aktuellen Ausschnitt neu einpassen, damit der Kreis vollständig sichtbar bleibt.
let lastMapSize = '';
let refitTimer = null;
new ResizeObserver(([entry]) => {
  const { width, height } = entry.contentRect;
  const size = `${Math.round(width)}x${Math.round(height)}`;
  if (size === lastMapSize || !width || !height) return;
  lastMapSize = size;
  clearTimeout(refitTimer);
  refitTimer = setTimeout(() => {
    if (!tmap?.map) return;
    tmap.map.resize();
    if (!state.station) return;
    if (state.view === 'setup' || state.view === 'explore' || (state.view === 'game' && state.game?.phase === 'guess')) {
      tmap.fitArea(currentArea(), { duration: 300 });
    } else if (state.view === 'results') {
      tmap.fitArea(currentArea(), { duration: 300 });
    }
  }, 120);
}).observe(document.getElementById('map'));

init();
