import maplibregl from 'maplibre-gl';
import { outsideMask, circle, boundsOf } from './geo.js';

export const MAP_STYLES = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
  city: 'https://tiles.openfreemap.org/styles/liberty',
};
const BERLIN = [[13.08, 52.33], [13.77, 52.68]];
const EMPTY = { type: 'FeatureCollection', features: [] };

export const COLORS = { BF: '#c8102e', FF: '#e07b00', guess: '#1f5fbf', solution: '#0b8a4b' };

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
        bounds: BERLIN,
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
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, ['case', ['get', 'selected'], 8, 5], 14, ['case', ['get', 'selected'], 13, 9]],
        'circle-color': ['match', ['get', 'type'], 'FF', COLORS.FF, COLORS.BF],
        'circle-stroke-color': ['case', ['get', 'selected'], ink, halo],
        'circle-stroke-width': ['case', ['get', 'selected'], 3, 1.5],
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

  showStations(stations, selectedKey) {
    this.#setVis('stations', 'visible');
    this.#setVis('stations-label', 'visible');
    this.set('stations', {
      type: 'FeatureCollection',
      features: stations.map((s) => ({
        type: 'Feature',
        properties: { key: s.key, number: s.number, type: s.type, selected: s.key === selectedKey },
        geometry: { type: 'Point', coordinates: s.center },
      })),
    });
  }

  hideStationsExcept(station) {
    this.showStations([station], station.key);
    this.#setVis('stations-label', 'none');
  }

  showArea(center, radius, color = COLORS.BF) {
    this.set('mask', { type: 'FeatureCollection', features: [outsideMask(center, radius)] });
    this.set('ring', { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: circle(center, radius) } });
    this.paint['ring|line-color'] = color;
    this.map.setPaintProperty('ring', 'line-color', color);
  }

  fitArea(center, radius, opts = {}) {
    this.map.fitBounds(boundsOf(center, radius), { padding: 24, duration: 700, ...opts });
  }

  fitBerlin() {
    this.map.fitBounds(BERLIN, { padding: 20, duration: 700 });
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
