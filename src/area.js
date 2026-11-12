// Trainingsgebiet: Kreis um die Wache oder amtliches Polygon (z. B. Berliner Einsatzbereich)
import { projector, circle, distance } from './geo.js';

function inRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function bboxOf(rings) {
  let [a, b, c, d] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const r of rings) for (const [x, y] of r) {
    if (x < a) a = x; if (y < b) b = y; if (x > c) c = x; if (y > d) d = y;
  }
  return [a, b, c, d];
}

/** Kreis mit Radius in Metern */
export function circleArea(center, radius) {
  const p = projector(center);
  const ring = circle(center, radius);
  return {
    kind: 'circle',
    center,
    radius,
    eqRadius: radius,
    label: radius < 1000 ? `${radius} m` : `${radius / 1000} km`,
    rings: [ring],
    bbox: bboxOf([ring]),
    contains: (pt) => distance(pt, center) <= radius + 1,
    // Liegt ein Linienzug (ganz oder teilweise) im Gebiet, ggf. mit Puffer?
    touches(coords, pad = 0) {
      const r = radius + pad;
      for (let i = 0; i < coords.length - 1; i++) {
        const ax = p.x(coords[i][0]), ay = p.y(coords[i][1]);
        const dx = p.x(coords[i + 1][0]) - ax, dy = p.y(coords[i + 1][1]) - ay;
        const l2 = dx * dx + dy * dy;
        let t = l2 ? -(ax * dx + ay * dy) / l2 : 0;
        t = Math.max(0, Math.min(1, t));
        if (Math.hypot(ax + t * dx, ay + t * dy) <= r) return true;
      }
      return coords.length === 1 && Math.hypot(p.x(coords[0][0]), p.y(coords[0][1])) <= r;
    },
  };
}

/** Polygon (GeoJSON MultiPolygon/Polygon), center = Bezugspunkt (Wache) */
export function polygonArea(geometry, center, label) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const outer = polys.map((p) => p[0]);
  const bbox = bboxOf(outer);
  const p = projector(center);
  // Fläche in m² → Radius eines gleich großen Kreises (für Bewertung und Zoom)
  let area = 0;
  for (const poly of polys) poly.forEach((ring, ri) => {
    let a = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += p.x(ring[j][0]) * p.y(ring[i][1]) - p.x(ring[i][0]) * p.y(ring[j][1]);
    area += (ri === 0 ? 1 : -1) * Math.abs(a / 2);
  });
  const contains = (pt) => pt[0] >= bbox[0] && pt[0] <= bbox[2] && pt[1] >= bbox[1] && pt[1] <= bbox[3]
    && polys.some(([o, ...holes]) => inRing(pt, o) && !holes.some((h) => inRing(pt, h)));
  const k = Math.cos((center[1] * Math.PI) / 180) * 111320;
  return {
    kind: 'polygon',
    center,
    eqRadius: Math.sqrt(area / Math.PI),
    label,
    rings: polys.flat(),
    outerRings: outer,
    bbox,
    contains,
    touches(coords, pad = 0) {
      if (coords.some((c) => contains(c))) return true;
      if (!pad) return false;
      const dLon = pad / k, dLat = pad / 110540;
      return coords.some(([x, y]) => x >= bbox[0] - dLon && x <= bbox[2] + dLon && y >= bbox[1] - dLat && y <= bbox[3] + dLat);
    },
  };
}
