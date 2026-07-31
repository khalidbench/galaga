// Shared team leaderboard — top 3 scores, persisted for everyone.
// The store URL lives in leaderboard-config.json (repo root) so the
// weekly keepalive GitHub Action can transparently repoint the game
// if it ever has to recreate the store. Falls back to localStorage
// when the network is unavailable so the game never blocks.
const DEFAULT_API = 'https://extendsclass.com/api/json-storage/bin/dbebebb';
const LOCAL_KEY = 'gal_top3';
const MAX_ENTRIES = 3;

// Resolve the store URL once; DEFAULT_API covers local dev without the config
const apiUrl = fetch('./leaderboard-config.json', { cache: 'no-store' })
  .then(r => (r.ok ? r.json() : null))
  .then(cfg => (cfg && cfg.api) ? cfg.api : DEFAULT_API)
  .catch(() => DEFAULT_API);

export class Leaderboard {
  constructor() {
    this.top = this._loadLocal();
    this.syncing = false;
    this.refresh();
  }

  _loadLocal() {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_KEY)) || [];
    } catch {
      return [];
    }
  }

  _saveLocal() {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(this.top));
  }

  _merge(remote) {
    // Union of remote + local, top 3 overall. The same player may hold
    // several slots (classic arcade style) — only exact name+score
    // duplicates are collapsed (they're the same submission seen twice).
    const seen = new Set();
    const all = [];
    for (const e of [...remote, ...this.top]) {
      if (!e || typeof e.score !== 'number' || !e.name) continue;
      const key = e.name + '|' + e.score;
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(e);
    }
    this.top = all
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_ENTRIES);
  }

  // Pull latest shared scores (fire-and-forget; UI reads this.top)
  async refresh() {
    if (this.syncing) return;
    this.syncing = true;
    try {
      const API = await apiUrl;
      const res = await fetch(API, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        this._merge(data.scores || []);
        this._saveLocal();
      }
    } catch { /* offline — keep local copy */ }
    this.syncing = false;
  }

  qualifies(score) {
    if (score <= 0) return false;
    if (this.top.length < MAX_ENTRIES) return true;
    return score > this.top[this.top.length - 1].score;
  }

  async submit(name, score) {
    this.top.push({ name, score });
    this.top.sort((a, b) => b.score - a.score);
    this.top = this.top.slice(0, MAX_ENTRIES);
    this._saveLocal();
    try {
      const API = await apiUrl;
      // Re-read remote first so we do not clobber a teammate's newer score
      const res = await fetch(API, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        this._merge(data.scores || []);
        this._saveLocal();
      }
      await fetch(await apiUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scores: this.top }),
      });
    } catch { /* offline — local copy still saved */ }
  }
}
