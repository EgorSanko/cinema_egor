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

// Кто «владелец» данных, лежащих сейчас в localStorage. Нужен, чтобы при смене
// аккаунта не залить/не показать чужой профиль. Ставится при любой загрузке
// данных аккаунта, снимается при очистке.
const OWNER_KEY = "kino_data_owner";
export function getDataOwner(): string | null {
  if (typeof window === "undefined") return null;
  try { return localStorage.getItem(OWNER_KEY); } catch { return null; }
}
function setDataOwner(email: string) {
  try { localStorage.setItem(OWNER_KEY, email); } catch {}
}

// Все ключи одного профиля. Стираем их при смене/выходе аккаунта, иначе данные
// прошлого юзера утекают в новый (пушатся на сервер и показываются).
const PROFILE_KEYS = [
  "kino_favorites", "kino_history", "kino_comments", "kino_lists_v1",
  "kino_status_v1", "kino_downloads_v1", "kino_tried_translators", "kino_friend_code",
  "kino_canon_v1",
];
export function clearLocalProfile(): void {
  if (typeof window === "undefined") return;
  try {
    for (const k of PROFILE_KEYS) localStorage.removeItem(k);
    const del: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith("kino_pos_") || key.startsWith("last-ep-") || key.startsWith("last-tr-"))) del.push(key);
    }
    del.forEach((k) => localStorage.removeItem(k));
    localStorage.removeItem(OWNER_KEY);
    try {
      window.dispatchEvent(new CustomEvent("sync-complete"));
      window.dispatchEvent(new CustomEvent("downloads-changed"));
      window.dispatchEvent(new Event("status-changed"));
    } catch {}
  } catch {}
}

// ТОЛЬКО загрузка данных аккаунта с сервера, без пуша локального. Используется
// при входе в ДРУГОЙ аккаунт — локальное уже стёрто, пушить нечего и незачем.
export async function loadFromServer(email: string): Promise<boolean> {
  try {
    const res = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "load", email }),
    });
    if (res.ok) {
      const result = await res.json();
      if (result.data) {
        applyServerData(result.data);
        if (result.data.friendCode) {
          try { localStorage.setItem("kino_friend_code", result.data.friendCode); } catch {}
        }
        setDataOwner(email);
        window.dispatchEvent(new CustomEvent("sync-complete"));
        return true;
      }
    }
    return false;
  } catch { return false; }
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
      canon: (() => { try { return JSON.parse(localStorage.getItem("kino_canon_v1") || "[]"); } catch { return []; } })(),
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
      canon: (() => { try { return JSON.parse(localStorage.getItem("kino_canon_v1") || "[]"); } catch { return []; } })(),
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
        setDataOwner(email);
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
  // Топ-5 (canon) — синкается, чтобы следовать за аккаунтом (раньше был локальным
  // per-устройство → при смене аккаунта у PRO пропадал). Массив-пик заменяем целиком.
  if (Array.isArray(data.canon)) {
    try {
      localStorage.setItem("kino_canon_v1", JSON.stringify(data.canon));
      window.dispatchEvent(new Event("canon-changed"));
    } catch {}
  }
}

// Кап позиций синка: у активного юзера ключей kino_pos_* могут накапливаться
// тысячи (каждый начатый эпизод <95%), и все летели в каждый синк + серверный
// JSON — без ограничения. Шлём только новейшие POSITIONS_CAP по savedAt.
const POSITIONS_CAP = 300;
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
  const entries = Object.entries(positions);
  if (entries.length <= POSITIONS_CAP) return positions;
  const capped = entries
    .sort((a, b) => ((b[1] as any)?.savedAt || 0) - ((a[1] as any)?.savedAt || 0))
    .slice(0, POSITIONS_CAP);
  return Object.fromEntries(capped);
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

/**
 * Починка типа записи.
 *
 * В истории Егора лежала запись «Холода» с типом `movie`, хотя у неё стояла
 * дата первого эфира и не было даты выхода в прокат — так бывает только у
 * сериала. «Продолжить просмотр» открывал по ней movie/318354, а под этим
 * номером в TMDB лежит СОВСЕМ ДРУГОЙ тайтл («Сказочная Русь») без кода IMDb.
 * Источнику нечего было искать, и тайтл «не отдавался», хотя на сайте
 * открывался нормально — там путь /tv/318354.
 *
 * Номера у фильмов и сериалов в TMDB независимы и пересекаются, поэтому
 * потерянный тип — это не «неточность», а другой фильм.
 */
function fixType<T extends { type?: string; first_air_date?: string; release_date?: string }>(r: T): T {
  if (r && r.type === "movie" && r.first_air_date && !r.release_date) {
    return { ...r, type: "tv" as T["type"] };
  }
  return r;
}

export function getHistory(): HistoryItem[] {
  if (typeof window === "undefined") return [];
  // Чиним на чтении, а не только на записи: испорченные записи уже разъехались
  // по устройствам и по серверной копии, и переписывать их все негде.
  try {
    const raw = JSON.parse(localStorage.getItem("kino_history") || "[]");
    return Array.isArray(raw) ? raw.map(fixType) : [];
  } catch { return []; }
}

export function addToHistory(item: HistoryItem): void {
  item = fixType(item);
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
  if (currentTime / duration > 0.95) {
    // Досмотрено. НЕ удаляем ключ, а пишем «надгробие» done:true — иначе
    // удаление не доезжает до сервера (мёрж синка только добавляет/обновляет,
    // никогда не удаляет), и на другом устройстве / после ре-логина фильм
    // «воскресает» с резюме у самого конца. Надгробие разъезжается по
    // устройствам через тот же newest-savedAt мёрж; getPosition его прячет.
    localStorage.setItem(key, JSON.stringify({ time: 0, duration, savedAt: Date.now(), done: true }));
    scheduleSyncToServer();
    return;
  }
  localStorage.setItem(key, JSON.stringify({ time: currentTime, duration, savedAt: Date.now() }));
  scheduleSyncToServer();
}

export function getPosition(id: number, type: "movie" | "tv", season?: number, episode?: number): { time: number; duration: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const key = positionKey(id, type, season, episode);
    const data = localStorage.getItem(key);
    if (!data) return null;
    const parsed = JSON.parse(data);
    if (parsed?.done) return null; // досмотрено → резюме не предлагаем (старт с 0)
    return parsed;
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
