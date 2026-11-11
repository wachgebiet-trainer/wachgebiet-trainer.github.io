// Lokaler Fortschritt (nur auf diesem Gerät)
const KEY = 'wachgebiet-trainer:v1';

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? {};
  } catch {
    return {};
  }
}
function write(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* Speicher nicht verfügbar – Fortschritt wird nicht gesichert */
  }
}

export const store = {
  guest: false,
  get settings() {
    return read().settings ?? null;
  },
  saveSettings(settings) {
    const d = read();
    d.settings = settings;
    write(d);
  },
  station(key) {
    return read().stations?.[key] ?? { targets: {}, rounds: [], best: {} };
  },
  recordRound(key, round) {
    if (this.guest) return;
    const d = read();
    d.stations ??= {};
    const s = (d.stations[key] ??= { targets: {}, rounds: [], best: {} });
    for (const r of round.results) {
      const t = (s.targets[r.id] ??= { seen: 0, hits: 0, last: 0 });
      t.seen += 1;
      t.last = r.score;
      if (r.score >= 70) t.hits += 1;
      t.ts = Date.now();
    }
    s.rounds.push({ ts: Date.now(), mode: round.modeKey, score: round.total, max: round.max, avg: round.avgDistance });
    s.rounds = s.rounds.slice(-50);
    const pct = round.max ? round.total / round.max : 0;
    if (!s.best[round.modeKey] || pct > s.best[round.modeKey]) s.best[round.modeKey] = pct;
    write(d);
  },
  clear() {
    const d = read();
    write({ settings: d.settings });
  },
};
