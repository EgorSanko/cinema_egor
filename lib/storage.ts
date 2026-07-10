"use client";

// === TYPES ===

export interface FavoriteItem {
  id: number;
  type: "movie" | "tv";
  title: string;
  poster_path: string | null;
  vote_average: number;
  release_date?: string;
  first_air_date?: string;
  addedAt: number;
}

export interface HistoryItem {
  id: number;
  type: "movie" | "tv";
  title: string;
  poster_path: string | null;
  vote_average: number;
  release_date?: string;
  first_air_date?: string;
  watchedAt: number;
  progress: number;
  duration: number;
  season?: number;
  episode?: number;
  episodeName?: string;
  episodeCount?: number; // episodes in this season (TMDB) — for the "next episode" bounds check
  seasonCount?: number;  // number of real seasons (TMDB)
  quality?: string;
  translatorName?: string;
  translatorId?: number;
  // TMDB genre IDs — used by computeStats to build byGenre breakdown.
  // Optional for backward compatibility with old history entries.
  genre_ids?: number[];
}

export interface Comment {
  id: string;
  mediaId: number;
  mediaType: "movie" | "tv";
  author: string;
  text: string;
  rating: number;
  createdAt: number;
}

// === SYNC ===

let syncTimeout: any = null;

function getCurrentEmail(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const user = JSON.parse(localStorage.getItem("user") || "null");
    return user?.email || null;
  } catch { return null; }
}

function scheduleSyncToServer() {
  const email = getCurrentEmail();
  if (!email) return;
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(() => {
    syncToServer(email);
  }, 3000);
}

async function syncToServer(email: string) {
  try {
    let lists: any[] = [];
    let statuses: any = {};
    let downloads: any[] = [];
    try { lists = JSON.parse(localStorage.getItem("kino_lists_v1") || "[]"); } catch {}
    try { statuses = JSON.parse(localStorage.getItem("kino_status_v1") || "{}"); } catch {}
    try { downloads = JSON.parse(localStorage.getItem("kino_downloads_v1") || "[]"); } catch {}
    const data = {
      favorites: getFavorites(),
      history: getHistory(),
      positions: getAllPositions(),
      comments: getAllComments(),
      lists,
      statuses,
      downloads,
    };
    const res = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save", email, data }),
    });
    if (res.ok) {
      const result = await res.json();
      if (result.data) {
        applyServerData(result.data);
        // Stash friendCode for /profile to display
        if (result.data.friendCode) {
          try { localStorage.setItem("kino_friend_code", result.data.friendCode); } catch {}
        }
        window.dispatchEvent(new CustomEvent("sync-complete"));
      }
    }
  } catch (e) {
    console.error("Sync to server failed:", e);
  }
}

export async function syncFromServer(email: string): Promise<boolean> {
  try {
    let lists: any[] = [];
    let statuses: any = {};
    try { lists = JSON.parse(localStorage.getItem("kino_lists_v1") || "[]"); } catch {}
    try { statuses = JSON.parse(localStorage.getItem("kino_status_v1") || "{}"); } catch {}
    let downloads: any[] = [];
    try { downloads = JSON.parse(localStorage.getItem("kino_downloads_v1") || "[]"); } catch {}
    const localData = {
      favorites: getFavorites(),
      history: getHistory(),
      positions: getAllPositions(),
      comments: getAllComments(),
      lists,
      statuses,
      downloads,
    };

    const res = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save", email, data: localData }),
    });

    if (res.ok) {
      const result = await res.json();
      if (result.data) {
        applyServerData(result.data);
        if (result.data.friendCode) {
          try { localStorage.setItem("kino_friend_code", result.data.friendCode); } catch {}
        }
        window.dispatchEvent(new CustomEvent("sync-complete"));
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

function applyServerData(data: any) {
  if (data.favorites) localStorage.setItem("kino_favorites", JSON.stringify(data.favorites));
  if (data.history) localStorage.setItem("kino_history", JSON.stringify(data.history));
  if (data.comments) localStorage.setItem("kino_comments", JSON.stringify(data.comments));
  if (data.lists) localStorage.setItem("kino_lists_v1", JSON.stringify(data.lists));
  if (data.downloads) {
    localStorage.setItem("kino_downloads_v1", JSON.stringify(data.downloads));
    try { window.dispatchEvent(new CustomEvent("downloads-changed")); } catch {}
  }
  if (data.statuses && typeof data.statuses === "object") {
    // Merge with local — keep newest by updatedAt per entry
    try {
      const local = JSON.parse(localStorage.getItem("kino_status_v1") || "{}");
      for (const [k, v] of Object.entries(data.statuses)) {
        const cur = local[k];
        const incoming: any = v;
        if (!cur || (incoming.updatedAt || 0) > (cur.updatedAt || 0)) local[k] = incoming;
      }
      localStorage.setItem("kino_status_v1", JSON.stringify(local));
      window.dispatchEvent(new Event("status-changed"));
    } catch {}
  }
  if (data.positions) {
    for (const [key, val] of Object.entries(data.positions)) {
      localStorage.setItem(key, JSON.stringify(val));
    }
  }
}

function getAllPositions(): Record<string, any> {
  if (typeof window === "undefined") return {};
  const positions: Record<string, any> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith("kino_pos_")) {
      try {
        positions[key] = JSON.parse(localStorage.getItem(key) || "null");
      } catch {}
    }
  }
  return positions;
}

function getAllComments(): Comment[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem("kino_comments") || "[]"); } catch { return []; }
}

// === FAVORITES ===

export function getFavorites(): FavoriteItem[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem("kino_favorites") || "[]"); } catch { return []; }
}

export function isFavorite(id: number, type: "movie" | "tv"): boolean {
  return getFavorites().some(f => f.id === id && f.type === type);
}

export function toggleFavorite(item: FavoriteItem): boolean {
  const favs = getFavorites();
  const idx = favs.findIndex(f => f.id === item.id && f.type === item.type);
  if (idx >= 0) {
    favs.splice(idx, 1);
    localStorage.setItem("kino_favorites", JSON.stringify(favs));
    scheduleSyncToServer();
    return false;
  } else {
    favs.unshift({ ...item, addedAt: Date.now() });
    localStorage.setItem("kino_favorites", JSON.stringify(favs.slice(0, 200)));
    scheduleSyncToServer();
    return true;
  }
}

// === HISTORY ===

export function getHistory(): HistoryItem[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem("kino_history") || "[]"); } catch { return []; }
}

export function addToHistory(item: HistoryItem): void {
  const history = getHistory();
  // Dedupe key: movies = id+type (one row per movie), TV = id+type+season+episode
  // (one row per episode so /wrapped + achievements count cumulative hours
  // and episodes correctly). Pre-fix this collapsed all episodes of a
  // series into a single row, undercounting heavily.
  const filtered = history.filter(h => {
    if (h.id !== item.id || h.type !== item.type) return true;
    if (item.type === "tv") return h.season !== item.season || h.episode !== item.episode;
    return false;
  });
  filtered.unshift({ ...item, watchedAt: Date.now() });
  localStorage.setItem("kino_history", JSON.stringify(filtered.slice(0, 500)));
  scheduleSyncToServer();
}

export function getHistoryItem(id: number, type: "movie" | "tv", season?: number, episode?: number): HistoryItem | null {
  const history = getHistory();
  if (type === "tv" && season && episode) return history.find(h => h.id === id && h.type === type && h.season === season && h.episode === episode) || null;
  return history.find(h => h.id === id && h.type === type) || null;
}

// === PLAYBACK POSITION ===

function positionKey(id: number, type: "movie" | "tv", season?: number, episode?: number): string {
  if (type === "tv" && season && episode) return `kino_pos_tv_${id}_s${season}e${episode}`;
  return `kino_pos_${type}_${id}`;
}

export function savePosition(id: number, type: "movie" | "tv", currentTime: number, duration: number, season?: number, episode?: number): void {
  if (currentTime < 5 || duration < 10) return;
  const key = positionKey(id, type, season, episode);
  if (currentTime / duration > 0.95) { localStorage.removeItem(key); return; }
  localStorage.setItem(key, JSON.stringify({ time: currentTime, duration, savedAt: Date.now() }));
  scheduleSyncToServer();
}

export function getPosition(id: number, type: "movie" | "tv", season?: number, episode?: number): { time: number; duration: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const key = positionKey(id, type, season, episode);
    const data = localStorage.getItem(key);
    if (!data) return null;
    return JSON.parse(data);
  } catch { return null; }
}

// === LAST EPISODE ===

export function saveLastEpisode(showId: number, season: number, episode: number): void {
  try {
    localStorage.setItem("last-ep-" + showId, JSON.stringify({ season, episode }));
  } catch {}
}

export function getLastEpisode(showId: number): { season: number; episode: number } | null {
  try {
    const data = localStorage.getItem("last-ep-" + showId);
    if (!data) return null;
    return JSON.parse(data);
  } catch { return null; }
}

// === LAST TRANSLATOR (per show/movie) ===
// Saved so user-preferred dubbing persists across sessions and episodes.

export function saveLastTranslator(mediaId: number, mediaType: "movie" | "tv", translatorId: number, translatorName?: string): void {
  try {
    localStorage.setItem(`last-tr-${mediaType}-${mediaId}`, JSON.stringify({ id: translatorId, name: translatorName || "" }));
    // Also track unique translator NAMES the user has tried — used for achievements.
    // Storing names (not ids) because the same dub studio has different IDs across titles.
    if (translatorName) {
      const set = new Set<string>(JSON.parse(localStorage.getItem("kino_tried_translators") || "[]"));
      set.add(translatorName);
      localStorage.setItem("kino_tried_translators", JSON.stringify(Array.from(set)));
    }
  } catch {}
}

export function getTriedTranslators(): string[] {
  try {
    return JSON.parse(localStorage.getItem("kino_tried_translators") || "[]");
  } catch { return []; }
}

// Record any translator the user has been served — used for the Polyglot achievement.
// Called whenever a stream is loaded so even default dubbings count toward unique tally.
export function recordTranslatorTry(translatorName: string): void {
  if (!translatorName) return;
  try {
    const set = new Set<string>(JSON.parse(localStorage.getItem("kino_tried_translators") || "[]"));
    set.add(translatorName);
    localStorage.setItem("kino_tried_translators", JSON.stringify(Array.from(set)));
  } catch {}
}

export function getLastTranslator(mediaId: number, mediaType: "movie" | "tv"): { id: number; name: string } | null {
  try {
    const data = localStorage.getItem(`last-tr-${mediaType}-${mediaId}`);
    if (!data) return null;
    return JSON.parse(data);
  } catch { return null; }
}

// === COMMENTS ===

export function getComments(mediaId: number, mediaType: "movie" | "tv"): Comment[] {
  const all = getAllComments();
  return all.filter(c => c.mediaId === mediaId && c.mediaType === mediaType);
}

export function addComment(comment: Omit<Comment, "id" | "createdAt">): Comment {
  const all = typeof window !== "undefined" ? JSON.parse(localStorage.getItem("kino_comments") || "[]") : [];
  const newComment: Comment = { ...comment, id: Math.random().toString(36).slice(2, 10), createdAt: Date.now() };
  all.unshift(newComment);
  localStorage.setItem("kino_comments", JSON.stringify(all.slice(0, 2000)));
  scheduleSyncToServer();
  return newComment;
}

export function deleteComment(commentId: string): void {
  const all = typeof window !== "undefined" ? JSON.parse(localStorage.getItem("kino_comments") || "[]") : [];
  const filtered = all.filter((c: Comment) => c.id !== commentId);
  localStorage.setItem("kino_comments", JSON.stringify(filtered));
  scheduleSyncToServer();
}

// === CLEAR ===

export function clearHistory(): void {
  localStorage.removeItem("kino_history");
  scheduleSyncToServer();
}

export function clearFavorites(): void {
  localStorage.removeItem("kino_favorites");
  scheduleSyncToServer();
}
