// Shared team leaderboard — top 3 scores, persisted for everyone.
// Backed by a free jsonblob.com store; falls back to localStorage
// when the network is unavailable so the game never blocks.
const API = 'https://jsonblob.com/api/jsonBlob/019f99f1-1d65-7e38-8af1-714193384bd2';
const LOCAL_KEY = 'gal_top3';
const MAX_ENTRIES = 3;

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
    // Union of remote + local, best score per name, top 3 overall
    const byName = new Map();
    for (const e of [...remote, ...this.top]) {
      if (!e || typeof e.score !== 'number' || !e.name) continue;
      const prev = byName.get(e.name);
      if (!prev || e.score > prev.score) byName.set(e.name, e);
    }
    this.top = [...byName.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_ENTRIES);
  }

  // Pull latest shared scores (fire-and-forget; UI reads this.top)
  async refresh() {
    if (this.syncing) return;
    this.syncing = true;
    try {
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
      // Re-read remote first so we do not clobber a teammate's newer score
      const res = await fetch(API, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        this._merge(data.scores || []);
        this._saveLocal();
      }
      await fetch(API, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scores: this.top }),
      });
    } catch { /* offline — local copy still saved */ }
  }
}
