// Straßengraph für den Anfahrt-Trainer.
//  - GraphBuilder: baut aus OpenMapTiles-Kacheln (z14) einen befahrbaren Graphen mit Straßennamen und Einbahnstraßen
//    (beim Bauen der Stadtdaten in Node und für die freie Suche im Browser).
//  - encodeGraph/decodeGraph: kompaktes JSON-Format (public/data/<stadt>/roads.json).
//  - RoadGraph: Routen berechnen (Dijkstra, Fahrzeit) und Fragen „Über welche Straße?“ erzeugen.

// Straßenklassen: Index = Routenklasse (rcls)
const RCLS = { motorway: 0, trunk: 1, primary: 2, secondary: 3, tertiary: 4, minor: 5 };
const SPEED = [90, 65, 50, 42, 36, 25]; // km/h, grobe Durchschnittswerte innerorts/außerorts
export const DISPLAY_CLS = [0, 1, 1, 2, 2, 3]; // wie streets.json: 0 Autobahn, 1 übergeordnet, 2 örtlich, 3 Nebenstraße
const NAME_CLS = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service']);
const KEYMUL = 2 ** 26;

export function streetName(pr) {
  if (pr.class === 'motorway' && pr.ref) return String(pr.ref).split(';')[0].trim();
  const name = String(pr['name:de'] || pr.name || '').trim();
  // Bundes- und Landesstraßen ohne Namen: Nummer verwenden (z. B. „B 43a“)
  if (!name && pr.ref && ['trunk', 'primary'].includes(pr.class) && /^B ?\d/.test(pr.ref)) return String(pr.ref).split(';')[0].trim();
  return name;
}

// Liang-Barsky: Strecke p→q auf das Quadrat [0,E]² beschneiden
function clip(px, py, qx, qy, E) {
  let t0 = 0, t1 = 1;
  const dx = qx - px, dy = qy - py;
  const P = [-dx, dx, -dy, dy], Q = [px, E - px, py, E - py];
  for (let i = 0; i < 4; i++) {
    if (P[i] === 0) {
      if (Q[i] < 0) return null;
    } else {
      const r = Q[i] / P[i];
      if (P[i] < 0) { if (r > t1) return null; if (r > t0) t0 = r; }
      else { if (r < t0) return null; if (r < t1) t1 = r; }
    }
  }
  const snap = (v) => (v < 0.5 ? 0 : v > E - 0.5 ? E : Math.round(v));
  return [snap(px + t0 * dx), snap(py + t0 * dy), snap(px + t1 * dx), snap(py + t1 * dy)];
}

export class GraphBuilder {
  constructor(z = 14) {
    this.z = z;
    this.keyIdx = new Map();
    this.gx = [];
    this.gy = [];
    this.edges = new Map(); // "a|b" -> { a, b, r, ow, name }
    this.names = [];
    this.nameIdx = new Map();
  }

  #node(gx, gy) {
    const k = gx * KEYMUL + gy;
    let i = this.keyIdx.get(k);
    if (i === undefined) {
      i = this.gx.length;
      this.keyIdx.set(k, i);
      this.gx.push(gx);
      this.gy.push(gy);
    }
    return i;
  }

  #name(n) {
    if (!n) return -1;
    let i = this.nameIdx.get(n);
    if (i === undefined) {
      i = this.names.length;
      this.names.push(n);
      this.nameIdx.set(n, i);
    }
    return i;
  }

  addTile(tile, x, y) {
    const tr = tile.layers.transportation;
    if (!tr) return;
    const E = tr.extent;
    // Straßennamen: Abschnitte der benannten Linien in einem Raster (64 Einheiten) zum schnellen Nachschlagen
    const grid = new Map();
    const tn = tile.layers.transportation_name;
    for (let i = 0; tn && i < tn.length; i++) {
      const ft = tn.feature(i);
      if (!NAME_CLS.has(ft.properties.class)) continue;
      const name = this.#name(streetName(ft.properties));
      if (name < 0) continue;
      for (const line of ft.loadGeometry()) {
        for (let j = 1; j < line.length; j++) {
          const a = line[j - 1], b = line[j];
          const seg = [a.x, a.y, b.x, b.y, name];
          for (let cx = Math.floor(Math.min(a.x, b.x) / 64); cx <= Math.floor(Math.max(a.x, b.x) / 64); cx++) {
            for (let cy = Math.floor(Math.min(a.y, b.y) / 64); cy <= Math.floor(Math.max(a.y, b.y) / 64); cy++) {
              const k = cx * 1000 + cy;
              if (!grid.has(k)) grid.set(k, []);
              grid.get(k).push(seg);
            }
          }
        }
      }
    }
    const nameAt = (mx, my) => {
      const list = grid.get(Math.floor(mx / 64) * 1000 + Math.floor(my / 64));
      if (!list) return -1;
      let best = -1, bd = 3.5 * 3.5;
      for (const [ax, ay, bx, by, n] of list) {
        const dx = bx - ax, dy = by - ay;
        const l2 = dx * dx + dy * dy;
        const t = l2 ? Math.max(0, Math.min(1, ((mx - ax) * dx + (my - ay) * dy) / l2)) : 0;
        const ex = ax + t * dx - mx, ey = ay + t * dy - my;
        const d = ex * ex + ey * ey;
        if (d < bd) { bd = d; best = n; }
      }
      return best;
    };

    for (let i = 0; i < tr.length; i++) {
      const ft = tr.feature(i);
      const pr = ft.properties;
      const r = RCLS[pr.class];
      if (r === undefined || pr.access === 'no' || pr.brunnel === 'ford') continue;
      const ow = pr.oneway === 1 || pr.oneway === '1' ? 1 : pr.oneway === -1 || pr.oneway === '-1' ? 2 : 0;
      for (const line of ft.loadGeometry()) {
        for (let j = 1; j < line.length; j++) {
          const c = clip(line[j - 1].x, line[j - 1].y, line[j].x, line[j].y, E);
          if (!c || (c[0] === c[2] && c[1] === c[3])) continue;
          const name = nameAt((c[0] + c[2]) / 2, (c[1] + c[3]) / 2);
          const a = this.#node(x * E + c[0], y * E + c[1]);
          const b = this.#node(x * E + c[2], y * E + c[3]);
          const key = a < b ? `${a}|${b}` : `${b}|${a}`;
          const prev = this.edges.get(key);
          if (prev && prev.r <= r) continue;
          this.edges.set(key, { a, b, r, ow, name });
        }
      }
    }
    this.E = E;
  }

  // Kachelgrenzen zusammennähen, Ketten verdichten, nur das größte zusammenhängende Netz behalten
  finalize() {
    const E = this.E ?? 4096;
    const n = this.gx.length;
    const parent = Int32Array.from({ length: n }, (_, i) => i);
    const find = (i) => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
    for (const [axis, other] of [[this.gx, this.gy], [this.gy, this.gx]]) {
      const byLine = new Map();
      for (let i = 0; i < n; i++) {
        if (axis[i] % E !== 0) continue;
        if (!byLine.has(axis[i])) byLine.set(axis[i], []);
        byLine.get(axis[i]).push(i);
      }
      for (const list of byLine.values()) {
        list.sort((p, q) => other[p] - other[q]);
        for (let k = 1; k < list.length; k++) if (other[list[k]] - other[list[k - 1]] <= 2) parent[find(list[k])] = find(list[k - 1]);
      }
    }
    // Kanten auf Repräsentanten umschreiben
    const edges = [];
    const seen = new Set();
    for (const e of this.edges.values()) {
      const a = find(e.a), b = find(e.b);
      if (a === b) continue;
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ a, b, r: e.r, ow: e.ow, name: e.name });
    }
    // Adjazenz (ungerichtet)
    const adj = new Map();
    const add = (v, ei) => { if (!adj.has(v)) adj.set(v, []); adj.get(v).push(ei); };
    edges.forEach((e, ei) => { add(e.a, ei); add(e.b, ei); });
    // größte Zusammenhangskomponente
    const comp = new Map();
    let bestComp = -1, bestSize = 0, cid = 0;
    for (const v of adj.keys()) {
      if (comp.has(v)) continue;
      const stack = [v];
      comp.set(v, cid);
      let size = 0;
      while (stack.length) {
        const u = stack.pop();
        size++;
        for (const ei of adj.get(u)) {
          const w = edges[ei].a === u ? edges[ei].b : edges[ei].a;
          if (!comp.has(w)) { comp.set(w, cid); stack.push(w); }
        }
      }
      if (size > bestSize) { bestSize = size; bestComp = cid; }
      cid++;
    }
    // Ketten verdichten: Knoten mit genau zwei gleichartigen Kanten entfallen
    const same = (e1, e2, v) => {
      if (e1.r !== e2.r || e1.name !== e2.name) return false;
      if (!e1.ow && !e2.ow) return true;
      if (!e1.ow || !e2.ow) return false;
      // Einbahn-Richtung muss durchgehend sein: eine Kante führt in v hinein, die andere hinaus
      const into = (e) => (e.ow === 1 ? e.b === v : e.a === v);
      return into(e1) !== into(e2);
    };
    const keep = (v) => {
      const l = adj.get(v);
      return l.length !== 2 || !same(edges[l[0]], edges[l[1]], v);
    };
    const used = new Uint8Array(edges.length);
    const out = [];
    const walk = (start, ei) => {
      const e0 = edges[ei];
      const path = [start];
      let v = start, cur = ei, len = 0;
      // Richtung der Einbahn relativ zum Start bestimmen
      const ow = e0.ow === 0 ? 0 : (e0.a === start) === (e0.ow === 1) ? 1 : 2;
      for (;;) {
        used[cur] = 1;
        const e = edges[cur];
        const w = e.a === v ? e.b : e.a;
        len += this.#meters(v, w);
        path.push(w);
        v = w;
        if (keep(v) || v === start) break;
        const nxt = adj.get(v).find((x) => !used[x]);
        if (nxt === undefined) break;
        cur = nxt;
      }
      out.push({ path, r: e0.r, ow, name: e0.name, len });
    };
    for (const v of adj.keys()) {
      if (comp.get(v) !== bestComp || !keep(v)) continue;
      for (const ei of adj.get(v)) if (!used[ei]) walk(v, ei);
    }
    // reine Ringe (ohne Kreuzung) bleiben übrig – auslassen
    return this.#encode(out);
  }

  #lngLat(i) {
    const s = this.E * 2 ** this.z;
    const lng = (this.gx[i] / s) * 360 - 180;
    const n = Math.PI - (2 * Math.PI * this.gy[i]) / s;
    const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    return [lng, lat];
  }

  #meters(i, j) {
    const [x1, y1] = this.#lngLat(i), [x2, y2] = this.#lngLat(j);
    return Math.hypot((x2 - x1) * 111320 * Math.cos((y1 * Math.PI) / 180), (y2 - y1) * 110540);
  }

  #encode(chains) {
    const PREC = 1e5;
    const nodeIdx = new Map();
    const nodes = [];
    let lx = 0, ly = 0;
    const q = (i) => { const [lng, lat] = this.#lngLat(i); return [Math.round(lng * PREC), Math.round(lat * PREC)]; };
    const node = (i) => {
      let k = nodeIdx.get(i);
      if (k === undefined) {
        k = nodeIdx.size;
        nodeIdx.set(i, k);
        const [x, y] = q(i);
        nodes.push(x - lx, y - ly);
        lx = x; ly = y;
      }
      return k;
    };
    const names = [];
    const nameMap = new Map();
    const nm = (i) => {
      if (i < 0) return -1;
      if (!nameMap.has(i)) { nameMap.set(i, names.length); names.push(this.names[i]); }
      return nameMap.get(i);
    };
    const edges = chains.map((c) => {
      const a = node(c.path[0]);
      const b = node(c.path.at(-1));
      const geom = [];
      let [px, py] = q(c.path[0]);
      for (const v of c.path.slice(1, -1)) {
        const [x, y] = q(v);
        geom.push(x - px, y - py);
        px = x; py = y;
      }
      return [a, b, c.r * 4 + c.ow, nm(c.name), Math.round(c.len), geom];
    });
    return { v: 1, prec: PREC, names, nodes, edges };
  }
}

// ---------------------------------------------------------------- Routen
class Heap {
  constructor() { this.k = []; this.v = []; }
  push(key, val) {
    const k = this.k, v = this.v;
    let i = k.length;
    k.push(key); v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p]; v[i] = v[p];
      i = p;
    }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v;
    const top = v[0];
    const lk = k.pop(), lv = v.pop();
    if (k.length) {
      let i = 0;
      const n = k.length;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= lk) break;
        k[i] = k[c]; v[i] = v[c];
        i = c;
      }
      k[i] = lk; v[i] = lv;
    }
    return top;
  }
  get size() { return this.k.length; }
}

const dist = (a, b) => Math.hypot((b[0] - a[0]) * 111320 * Math.cos((a[1] * Math.PI) / 180), (b[1] - a[1]) * 110540);

export class RoadGraph {
  constructor(enc) {
    const P = enc.prec;
    this.names = enc.names;
    const n = enc.nodes.length / 2;
    this.lng = new Float64Array(n);
    this.lat = new Float64Array(n);
    let x = 0, y = 0;
    for (let i = 0; i < n; i++) {
      x += enc.nodes[2 * i]; y += enc.nodes[2 * i + 1];
      this.lng[i] = x / P; this.lat[i] = y / P;
    }
    this.edges = enc.edges.map(([a, b, f, name, len, flat]) => {
      const coords = [[this.lng[a], this.lat[a]]];
      let px = Math.round(this.lng[a] * P), py = Math.round(this.lat[a] * P);
      for (let i = 0; i < flat.length; i += 2) {
        px += flat[i]; py += flat[i + 1];
        coords.push([px / P, py / P]);
      }
      coords.push([this.lng[b], this.lat[b]]);
      const r = f >> 2;
      return { a, b, r, ow: f & 3, name, len, time: len / (SPEED[r] / 3.6), coords };
    });
    // gerichtete Adjazenz (CSR)
    const deg = new Int32Array(n + 1);
    for (const e of this.edges) { if (e.ow !== 2) deg[e.a + 1]++; if (e.ow !== 1) deg[e.b + 1]++; }
    for (let i = 0; i < n; i++) deg[i + 1] += deg[i];
    this.off = deg;
    this.adjE = new Int32Array(deg[n]);
    const fill = deg.slice();
    this.edges.forEach((e, ei) => {
      if (e.ow !== 2) this.adjE[fill[e.a]++] = ei;
      if (e.ow !== 1) this.adjE[fill[e.b]++] = ei;
    });
    // rückwärts (für „Fahrzeit bis zum Ziel“)
    const rdeg = new Int32Array(n + 1);
    for (const e of this.edges) { if (e.ow !== 2) rdeg[e.b + 1]++; if (e.ow !== 1) rdeg[e.a + 1]++; }
    for (let i = 0; i < n; i++) rdeg[i + 1] += rdeg[i];
    this.roff = rdeg;
    this.radjE = new Int32Array(rdeg[n]);
    const rfill = rdeg.slice();
    this.edges.forEach((e, ei) => {
      if (e.ow !== 2) this.radjE[rfill[e.b]++] = ei;
      if (e.ow !== 1) this.radjE[rfill[e.a]++] = ei;
    });
  }

  point(i) { return [this.lng[i], this.lat[i]]; }

  // Nächster Knoten (nicht an Autobahn/Kraftfahrstraße) zu einem Punkt
  nearestNode(pt, maxRcls = 5, minRcls = 2) {
    let best = -1, bd = Infinity;
    for (const e of this.edges) {
      if (e.r < minRcls || e.r > maxRcls) continue;
      for (const v of [e.a, e.b]) {
        const d = dist(pt, [this.lng[v], this.lat[v]]);
        if (d < bd) { bd = d; best = v; }
      }
    }
    return best;
  }

  // Kürzeste Fahrzeit von src zu allen Knoten (innerhalb eines Rechtecks); reverse: von allen Knoten zu src
  tree(src, box, reverse = false) {
    const off = reverse ? this.roff : this.off;
    const adjE = reverse ? this.radjE : this.adjE;
    const n = this.lng.length;
    const t = new Float64Array(n).fill(Infinity);
    const prevE = new Int32Array(n).fill(-1);
    const h = new Heap();
    t[src] = 0;
    h.push(0, src);
    const [w, s, e, nn] = box;
    while (h.size) {
      const u = h.pop();
      const tu = t[u];
      for (let k = off[u]; k < off[u + 1]; k++) {
        const ei = adjE[k];
        const ed = this.edges[ei];
        const v = ed.a === u ? ed.b : ed.a;
        const nt = tu + ed.time;
        if (nt >= t[v]) continue;
        const lx = this.lng[v], ly = this.lat[v];
        if (lx < w || lx > e || ly < s || ly > nn) continue;
        t[v] = nt;
        prevE[v] = ei;
        h.push(nt, v);
      }
    }
    return { src, t, prevE };
  }

  // Route aus dem Baum: Liste von { ei, from, to }
  route(tree, dst) {
    if (!Number.isFinite(tree.t[dst])) return null;
    const steps = [];
    let v = dst;
    while (v !== tree.src) {
      const ei = tree.prevE[v];
      const e = this.edges[ei];
      const u = e.a === v ? e.b : e.a;
      steps.push({ ei, from: u, to: v });
      v = u;
    }
    steps.reverse();
    return steps;
  }

  // Linienzug einer Route
  routeCoords(steps) {
    const out = [];
    for (const { ei, from } of steps) {
      const c = this.edges[ei].coords;
      const seq = this.edges[ei].a === from ? c : [...c].reverse();
      out.push(...(out.length ? seq.slice(1) : seq));
    }
    return out;
  }

  // Straßenfolge einer Route (zusammengefasst, mit Längen)
  routeStreets(steps) {
    const seq = [];
    for (const { ei } of steps) {
      const e = this.edges[ei];
      const name = e.name >= 0 ? this.names[e.name] : '';
      const last = seq.at(-1);
      if (last && last.name === name) { last.len += e.len; last.r = Math.min(last.r, e.r); }
      else seq.push({ name, len: e.len, r: e.r });
    }
    return seq;
  }
}
