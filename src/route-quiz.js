// Anfahrt-Trainer: Fragen „Über welche Straße fährst du?“ aus dem Straßengraphen erzeugen.
import { DISPLAY_CLS } from './roadgraph.js';

const dist = (a, b) => Math.hypot((b[0] - a[0]) * 111320 * Math.cos((a[1] * Math.PI) / 180), (b[1] - a[1]) * 110540);
const shuffle = (arr) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};
const MIN_TARGET_DIST = 700; // Ziele direkt an der Wache sind zu einfach
const DETOUR = 1.25; // Ablenker: Weg darüber mindestens 25 % langsamer
// Keine sinnvollen Antworten: Straßennummern (A 100, B 43, L 3193 …), Tunnel, Brücken, Rampen
const isRef = (name) => /^[ABLKS] ?\d/.test(name) || /^(tunnel|brücke)\b|(tunnel|brücke|unterführung|überführung|auffahrt|abfahrt|rampe)$/i.test(name);

/**
 * Vorbereitung für eine Wache und ein Gebiet: Fahrzeitbaum ab der Wache und mögliche Zielstraßen.
 * Gibt null zurück, wenn die Wache nicht ans Straßennetz angebunden werden kann.
 */
export function prepareRoutes(graph, station, area) {
  const src = graph.nearestNode(station.center);
  if (src < 0) return null;
  const [a, b, c, d] = area.bbox;
  const padLon = 2500 / (111320 * Math.cos((area.center[1] * Math.PI) / 180)), padLat = 2500 / 110540;
  const box = [a - padLon, b - padLat, c + padLon, d + padLat];
  const tree = graph.tree(src, box);
  const origin = graph.point(src);

  // Zielstraßen: benannte Straßen mit erreichbaren Knoten im Gebiet (nicht direkt an der Wache)
  const streets = new Map();
  // Straßen mit Lage (für Ablenker): Knoten je Name
  const byName = new Map();
  graph.edges.forEach((e) => {
    if (e.name < 0) return;
    const name = graph.names[e.name];
    if (isRef(name)) return;
    for (const v of [e.a, e.b]) {
      if (!Number.isFinite(tree.t[v])) continue;
      const p = graph.point(v);
      if (!byName.has(name)) byName.set(name, { nodes: new Set(), r: e.r });
      const m = byName.get(name);
      m.nodes.add(v);
      m.r = Math.min(m.r, e.r);
      if (e.r === 0 || !area.contains(p) || dist(origin, p) < MIN_TARGET_DIST) continue;
      if (!streets.has(name)) streets.set(name, { nodes: new Set(), r: e.r });
      const s = streets.get(name);
      s.nodes.add(v);
      s.r = Math.min(s.r, e.r);
    }
  });
  const targets = [...streets].map(([name, s]) => ({ id: `r:${name}`, name, nodes: [...s.nodes], r: s.r }));
  targets.sort((x, y) => x.name.localeCompare(y.name, 'de'));

  // Wie viele Routen nutzen eine Straße? (Ausfallstraßen der Wache sind kaum eine Frage wert)
  const usage = new Map();
  const sample = shuffle(targets.slice()).slice(0, 60);
  for (const t of sample) {
    const steps = graph.route(tree, t.nodes[Math.floor(t.nodes.length / 2)]);
    if (!steps) continue;
    for (const n of new Set(graph.routeStreets(steps).map((s) => s.name))) usage.set(n, (usage.get(n) ?? 0) + 1);
  }
  for (const [n, k] of usage) usage.set(n, k / Math.max(1, sample.length));
  return { src, box, tree, targets, byName, origin, usage };
}

/** Eine Frage zu einer Zielstraße erzeugen (oder null, wenn die Route keine sinnvolle Frage hergibt) */
export function makeQuestion(graph, prep, target) {
  const nodes = shuffle(target.nodes.slice());
  for (const dst of nodes.slice(0, 3)) {
    const steps = graph.route(prep.tree, dst);
    if (!steps || !steps.length) continue;
    const seq = graph.routeStreets(steps);
    const firstNamed = seq.find((s) => s.name)?.name;
    const totalLen = seq.reduce((a, s) => a + s.len, 0);
    if (totalLen < MIN_TARGET_DIST) continue;
    // Antwort: markante Straße der Route (lang, bedeutend, nicht jede Route nutzt sie)
    const lens = new Map();
    for (const s of seq) {
      if (!s.name || isRef(s.name) || s.name === firstNamed || s.name === target.name) continue;
      const cur = lens.get(s.name) ?? { len: 0, r: 9 };
      cur.len += s.len;
      cur.r = Math.min(cur.r, s.r);
      lens.set(s.name, cur);
    }
    let best = null, bestScore = 0;
    for (const [name, v] of lens) {
      if (v.len < 200) continue;
      const common = prep.usage.get(name) ?? 0;
      const score = v.len * (v.r <= 3 ? 2 : v.r === 4 ? 1.4 : 1) * (1.15 - Math.min(1, common));
      if (score > bestScore) { bestScore = score; best = { name, ...v }; }
    }
    if (!best) continue;
    const onRoute = new Set(seq.map((s) => s.name));

    // Mitte des Antwort-Abschnitts als Bezugspunkt für die Ablenker
    let anchor = graph.point(dst);
    {
      let acc = 0;
      for (const { ei, to } of steps) {
        const e = graph.edges[ei];
        if (graph.names[e.name] !== best.name) continue;
        acc += e.len;
        if (acc >= best.len / 2) { anchor = graph.point(to); break; }
      }
    }
    // Ablenker: ähnlich bedeutende Straßen in der Nähe, über die der Weg deutlich länger wäre
    const maxR = Math.max(best.r, 4);
    const cands = [];
    for (const [name, m] of prep.byName) {
      if (onRoute.has(name) || name === target.name || m.r > maxR) continue;
      if (name.includes(best.name) || best.name.includes(name)) continue;
      let d = Infinity;
      for (const v of m.nodes) d = Math.min(d, dist(anchor, graph.point(v)));
      if (d < 3000) cands.push({ name, d, nodes: m.nodes });
    }
    cands.sort((x, y) => x.d - y.d);
    const back = graph.tree(dst, prep.box, true);
    const tOpt = prep.tree.t[dst];
    const good = [];
    for (const c of cands.slice(0, 20)) {
      let via = Infinity;
      for (const v of c.nodes) via = Math.min(via, prep.tree.t[v] + back.t[v]);
      if (via > tOpt * DETOUR + 30) good.push(c.name);
    }
    if (good.length < 3) continue;
    const choices = shuffle([best.name, ...shuffle(good.slice(0, 7)).slice(0, 3)]);
    const dest = graph.point(dst);
    return {
      id: target.id,
      type: 'route',
      name: target.name,
      cls: DISPLAY_CLS[target.r],
      dest,
      choices,
      answer: best.name,
      route: graph.routeCoords(steps),
      streets: seq.filter((s) => s.name && s.len >= 80).map((s) => s.name).filter((n, i, a) => n !== a[i - 1]),
      km: totalLen / 1000,
      minutes: tOpt / 60,
      lines: [[dest]],
    };
  }
  return null;
}
