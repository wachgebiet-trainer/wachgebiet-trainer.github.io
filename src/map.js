import maplibregl from 'maplibre-gl';

export const MAP_STYLES = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
  city: 'https://tiles.openfreemap.org/styles/liberty',
};
import { CITY } from './city.js';
const BOUNDS = CITY.bounds;
const EMPTY = { type: 'FeatureCollection', features: [] };

export const COLORS = { BF: '#a3000b', FF: '#ff4d55', RW: '#ffffff', RWring: '#a3000b', guess: '#1d5fbf', solution: '#0b8a4b' };

export class TrainerMap {
  constructor(container, theme = 'light') {
    this.labelLayers = [];
    this.labelsVisible = true;
    this.theme = theme;
    this.data = {};
    this.paint = {};
    this.ready = new Promise((resolve, reject) => {
      this.map = new maplibregl.Map({
        container,
        style: MAP_STYLES[theme],
        bounds: BOUNDS,
        fitBoundsOptions: { padding: 20 },
        attributionControl: { compact: true },
        dragRotate: false,
        pitchWithRotate: false,
        maxZoom: 18,
      });
      this.map.touchZoomRotate.disableRotation();
      this.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      this.map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
      this.map.once('load', () => {
        this.#setup();
        resolve();
      });
      this.map.on('error', (e) => {
        if (!this.map.loaded() && e?.error?.message?.includes('style')) reject(e.error);
      });
    });
  }

  setTheme(theme) {
    if (theme === this.theme) return;
    this.theme = theme;
    const filter = this.map.getLayer('explore-hover') ? this.map.getFilter('explore-hover') : null;
    this.map.setStyle(MAP_STYLES[theme], { diff: false });
    this.map.once('style.load', () => {
      this.#setup();
      for (const [id, data] of Object.entries(this.data)) this.map.getSource(id)?.setData(data);
      for (const [key, v] of Object.entries(this.paint)) this.map.setPaintProperty(...key.split('|'), v);
      if (filter) this.map.setFilter('explore-hover', filter);
      for (const [id, vis] of Object.entries(this.layout ?? {})) this.map.setLayoutProperty(id, 'visibility', vis);
      this.setLabels(this.labelsVisible);
    });
  }

  #setVis(id, vis) {
    (this.layout ??= {})[id] = vis;
    this.map.setLayoutProperty(id, 'visibility', vis);
  }

  #setup() {
    const m = this.map;
    const dark = this.theme === 'dark';
    const ink = dark ? '#ffffff' : '#17212b';
    const halo = dark ? '#0c0c0c' : '#ffffff';
    this.labelLayers = m.getStyle().layers.filter((l) => l.type === 'symbol').map((l) => l.id);
    const src = (id) => m.addSource(id, { type: 'geojson', data: EMPTY });
    ['mask', 'ring', 'explore', 'solution', 'link', 'points', 'stations', 'reviewLines', 'reviewPoints'].forEach(src);

    m.addLayer({ id: 'mask', type: 'fill', source: 'mask', paint: { 'fill-color': dark ? '#000000' : '#17212b', 'fill-opacity': dark ? 0.55 : 0.35 } });
    m.addLayer({ id: 'ring', type: 'line', source: 'ring', paint: { 'line-color': COLORS.BF, 'line-width': 2.5, 'line-dasharray': [2, 1.5] } });
    m.addLayer({
      id: 'explore', type: 'line', source: 'explore',
      paint: {
        'line-color': ['match', ['get', 'cls'], 0, '#b0326e', 1, '#c8102e', 2, '#e07b00', '#1f5fbf'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 12, ['match', ['get', 'cls'], 0, 4, 1, 3.5, 2, 3, 2], 17, ['match', ['get', 'cls'], 0, 12, 1, 10, 2, 9, 7]],
        'line-opacity': dark ? 0.75 : 0.55,
      },
    });
    m.addLayer({
      id: 'explore-hover', type: 'line', source: 'explore', filter: ['==', ['get', 'name'], ''],
      paint: { 'line-color': ink, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 5, 17, 13] },
    });
    m.addLayer({
      id: 'reviewLines', type: 'line', source: 'reviewLines',
      paint: { 'line-color': ['get', 'color'], 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 4, 17, 10], 'line-opacity': 0.8 },
    });
    m.addLayer({
      id: 'solution-casing', type: 'line', source: 'solution',
      paint: { 'line-color': halo, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 7, 17, 16] },
    });
    m.addLayer({
      id: 'solution', type: 'line', source: 'solution',
      paint: { 'line-color': COLORS.solution, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 4, 17, 11] },
    });
    m.addLayer({
      id: 'solution-point', type: 'circle', source: 'solution', filter: ['==', ['geometry-type'], 'Point'],
      paint: { 'circle-radius': 9, 'circle-color': COLORS.solution, 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 },
    });
    m.addLayer({
      id: 'link', type: 'line', source: 'link',
      paint: { 'line-color': ['coalesce', ['get', 'color'], ink], 'line-width': 2.5, 'line-dasharray': [1.5, 1.2] },
    });
    m.addLayer({
      id: 'reviewPoints', type: 'circle', source: 'reviewPoints',
      paint: { 'circle-radius': 7, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 },
    });
    m.addLayer({
      id: 'points', type: 'circle', source: 'points',
      paint: {
        'circle-radius': ['match', ['get', 'kind'], 'nearest', 5, 9],
        'circle-color': ['match', ['get', 'kind'], 'nearest', COLORS.solution, COLORS.guess],
        'circle-stroke-color': '#fff',
        'circle-stroke-width': 3,
      },
    });
    m.addLayer({
      id: 'stations', type: 'circle', source: 'stations',
      filter: ['!=', ['get', 'type'], 'BOTH'],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, ['case', ['get', 'selected'], 8, 5], 14, ['case', ['get', 'selected'], 13, 9]],
        'circle-color': ['match', ['get', 'type'], 'FF', COLORS.FF, 'RW', COLORS.RW, COLORS.BF],
        'circle-stroke-color': ['case', ['get', 'selected'], ink, ['==', ['get', 'type'], 'RW'], COLORS.RWring, halo],
        'circle-stroke-width': ['case', ['get', 'selected'], 3.5, ['==', ['get', 'type'], 'RW'], 3, 1.5],
      },
    });
    // BF und FF am selben Standort: senkrecht geteilter Kreis (links BF, rechts FF)
    this.#addSplitImages(halo, ink);
    m.addLayer({
      id: 'stations-split', type: 'symbol', source: 'stations',
      filter: ['==', ['get', 'type'], 'BOTH'],
      layout: {
        'icon-image': ['case', ['get', 'selected'], 'split-selected', 'split'],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 9, ['case', ['get', 'selected'], 0.5, 0.375], 14, ['case', ['get', 'selected'], 0.8, 0.625]],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
    });
    m.addLayer({
      id: 'stations-label', type: 'symbol', source: 'stations', minzoom: 11,
      layout: {
        'text-field': ['get', 'number'],
        'text-font': ['Noto Sans Regular'],
        'text-size': 11,
        'text-offset': [0, 1.4],
        'text-allow-overlap': false,
      },
      paint: { 'text-color': ink, 'text-halo-color': halo, 'text-halo-width': 1.5 },
    });
  }

  set(id, data) {
    this.data[id] = data ?? EMPTY;
    this.map.getSource(id)?.setData(this.data[id]);
  }

  clearOverlays() {
    ['mask', 'ring', 'explore', 'solution', 'link', 'points', 'reviewLines', 'reviewPoints'].forEach((id) => this.set(id));
    this.map.setFilter('explore-hover', ['==', ['get', 'name'], '']);
  }

  setHover(name) {
    this.map.setFilter('explore-hover', ['==', ['get', 'name'], name]);
  }

  setLabels(visible) {
    this.labelsVisible = visible;
    for (const id of this.labelLayers) {
      if (this.map.getLayer(id)) this.map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
    }
  }

  #addSplitImages(halo, ink) {
    const draw = (selected) => {
      const size = 64;
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const g = c.getContext('2d');
      const r = size / 2;
      const stroke = selected ? 9 : 4;
      const inner = r - stroke / 2 - 1;
      g.beginPath();
      g.arc(r, r, inner, Math.PI / 2, (Math.PI * 3) / 2);
      g.closePath();
      g.fillStyle = COLORS.BF;
      g.fill();
      g.beginPath();
      g.arc(r, r, inner, -Math.PI / 2, Math.PI / 2);
      g.closePath();
      g.fillStyle = COLORS.FF;
      g.fill();
      g.beginPath();
      g.arc(r, r, inner, 0, Math.PI * 2);
      g.lineWidth = stroke;
      g.strokeStyle = selected ? ink : halo;
      g.stroke();
      return g.getImageData(0, 0, size, size);
    };
    const m = this.map;
    if (m.hasImage('split')) m.removeImage('split');
    if (m.hasImage('split-selected')) m.removeImage('split-selected');
    m.addImage('split', draw(false), { pixelRatio: 2 });
    m.addImage('split-selected', draw(true), { pixelRatio: 2 });
  }

  showStations(stations, selectedKey) {
    this.#setVis('stations', 'visible');
    this.#setVis('stations-split', 'visible');
    this.#setVis('stations-label', 'visible');
    // Wachen am selben Standort zusammenfassen
    const groups = new Map();
    for (const s of stations) {
      const k = `${s.center[0].toFixed(5)},${s.center[1].toFixed(5)}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(s);
    }
    const features = [];
    for (const group of groups.values()) {
      const bf = group.find((s) => s.type === 'BF');
      const ff = group.find((s) => s.type === 'FF');
      if (bf && ff) {
        features.push({
          type: 'Feature',
          properties: {
            type: 'BOTH', bfKey: bf.key, ffKey: ff.key, number: `${bf.number}/${ff.number}`,
            selected: group.some((s) => s.key === selectedKey),
          },
          geometry: { type: 'Point', coordinates: bf.center },
        });
        group.filter((s) => s !== bf && s !== ff).forEach((s) => features.push(stationFeature(s, selectedKey)));
      } else {
        group.forEach((s) => features.push(stationFeature(s, selectedKey)));
      }
    }
    this.set('stations', { type: 'FeatureCollection', features });
  }

  hideStationsExcept(station) {
    this.showStations([station], station.key);
    this.#setVis('stations-label', 'none');
  }

  // Gebiet (Kreis oder Einsatzbereich) hervorheben: außen abdunkeln, Grenze als Linie
  showArea(area, color = COLORS.BF) {
    const world = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];
    const holes = (area.outerRings ?? area.rings).map((r) => r.slice().reverse());
    this.set('mask', { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [world, ...holes] } });
    this.set('ring', { type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: area.rings } });
    this.paint['ring|line-color'] = color;
    this.map.setPaintProperty('ring', 'line-color', color);
  }

  fitArea(area, opts = {}) {
    const [a, b, c, d] = area.bbox;
    this.map.fitBounds([[a, b], [c, d]], { padding: 24, duration: 700, ...opts });
  }

  fitCity() {
    this.map.fitBounds(BOUNDS, { padding: 20, duration: 700 });
  }

  fitLines(lines, extra = []) {
    const pts = lines.flat().concat(extra);
    if (!pts.length) return;
    let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, y] of pts) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    this.map.fitBounds([[minX, minY], [maxX, maxY]], { padding: 70, maxZoom: 16.5, duration: 700 });
  }
}

export function targetFeatures(target, props = {}) {
  if (target.type === 'transit') {
    return [{ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: target.lines[0][0] } }];
  }
  return [{ type: 'Feature', properties: props, geometry: { type: 'MultiLineString', coordinates: target.lines } }];
}

function stationFeature(s, selectedKey) {
  return {
    type: 'Feature',
    properties: { key: s.key, number: s.number, type: s.type, selected: s.key === selectedKey },
    geometry: { type: 'Point', coordinates: s.center },
  };
}
