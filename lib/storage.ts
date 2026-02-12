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
  quality?: string;
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
    const data = {
      favorites: getFavorites(),
      history: getHistory(),
      positions: getAllPositions(),
      comments: getAllComments(),
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
      }
    }
  } catch (e) {
    console.error("Sync to server failed:", e);
  }
}

export async function syncFromServer(email: string): Promise<boolean> {
  try {
    const localData = {
      favorites: getFavorites(),
      history: getHistory(),
      positions: getAllPositions(),
      comments: getAllComments(),
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
  const filtered = history.filter(h => !(h.id === item.id && h.type === item.type));
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
