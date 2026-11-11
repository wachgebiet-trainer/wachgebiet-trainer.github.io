// Kleine Geometrie-Helfer (lokale Projektion in Metern rund um einen Mittelpunkt)
const R = 6371008.8;
const RAD = Math.PI / 180;

export function projector([lng0, lat0]) {
  const kx = Math.cos(lat0 * RAD) * RAD * R;
  const ky = RAD * R;
  return {
    kx,
    ky,
    x: (lng) => (lng - lng0) * kx,
    y: (lat) => (lat - lat0) * ky,
    toLngLat: (x, y) => [lng0 + x / kx, lat0 + y / ky],
  };
}

export function distance([lng1, lat1], [lng2, lat2]) {
  const p = projector([(lng1 + lng2) / 2, (lat1 + lat2) / 2]);
  return Math.hypot((lng2 - lng1) * p.kx, (lat2 - lat1) * p.ky);
}

// Nächster Punkt einer Linienmenge zu einem Punkt -> { d, point }
export function nearestOnLines(pt, lines) {
  const p = projector(pt);
  let best = Infinity;
  let bx = 0;
  let by = 0;
  for (const line of lines) {
    if (line.length === 1) {
      const ax = p.x(line[0][0]);
      const ay = p.y(line[0][1]);
      const d = Math.hypot(ax, ay);
      if (d < best) [best, bx, by] = [d, ax, ay];
      continue;
    }
    for (let i = 0; i < line.length - 1; i++) {
      const ax = p.x(line[i][0]);
      const ay = p.y(line[i][1]);
      const cx = p.x(line[i + 1][0]);
      const cy = p.y(line[i + 1][1]);
      const dx = cx - ax;
      const dy = cy - ay;
      const len2 = dx * dx + dy * dy;
      let t = len2 ? -(ax * dx + ay * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const qx = ax + t * dx;
      const qy = ay + t * dy;
      const d = Math.hypot(qx, qy);
      if (d < best) [best, bx, by] = [d, qx, qy];
    }
  }
  return { d: best, point: p.toLngLat(bx, by) };
}

export function circle(center, radius, steps = 128) {
  const p = projector(center);
  const ring = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    ring.push(p.toLngLat(Math.cos(a) * radius, Math.sin(a) * radius));
  }
  return ring;
}

// Polygon mit Loch: alles außerhalb des Kreises abdunkeln
export function outsideMask(center, radius) {
  const world = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [world, circle(center, radius).reverse()] },
  };
}

export function boundsOf(center, radius) {
  const p = projector(center);
  const sw = p.toLngLat(-radius, -radius);
  const ne = p.toLngLat(radius, radius);
  return [sw, ne];
}

export function formatDistance(m) {
  if (!Number.isFinite(m)) return '–';
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 2 : 1).replace('.', ',')} km`;
}
