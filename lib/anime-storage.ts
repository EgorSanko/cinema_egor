"use client";

// Отдельная история/прогресс для аниме (Anilibria). НЕ смешиваем с kino_history
// (там тип movie/tv + TMDB-постеры через getImageUrl) — у аниме свои id релизов
// (пересекутся с TMDB-id → коллизии) и постеры полными URL. Позиции пишем в
// kino_pos_anime_* (они синкаются на сервер вместе с прочими kino_pos_ и чистятся
// при смене аккаунта). Список истории — kino_anime_history_v1 (локально).

export interface AnimeHistoryItem {
  id: number;         // Anilibria release id
  title: string;
  poster: string;     // полный URL
  ordinal: number;    // номер серии
  episodeId: string;
  progress: number;   // сек
  duration: number;   // сек
  watchedAt: number;
}

const HKEY = "kino_anime_history_v1";
const posKey = (id: number, ordinal: number) => `kino_pos_anime_${id}_e${ordinal}`;

export function saveAnimePosition(id: number, ordinal: number, time: number, duration: number): void {
  if (typeof window === "undefined" || time < 5 || duration < 10) return;
  const key = posKey(id, ordinal);
  try {
    // Досмотрел (>95%) → чистим позицию, чтобы «продолжить» не звало на конец.
    if (time / duration > 0.95) { localStorage.removeItem(key); return; }
    localStorage.setItem(key, JSON.stringify({ time, duration, savedAt: Date.now() }));
  } catch {}
}

export function getAnimePosition(id: number, ordinal: number): { time: number; duration: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const d = localStorage.getItem(posKey(id, ordinal));
    return d ? JSON.parse(d) : null;
  } catch { return null; }
}

export function getAnimeHistory(): AnimeHistoryItem[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(HKEY) || "[]"); } catch { return []; }
}

export function addAnimeHistory(item: Omit<AnimeHistoryItem, "watchedAt">): void {
  if (typeof window === "undefined") return;
  try {
    // Одна строка на (релиз+серия), свежее — сверху.
    const list = getAnimeHistory().filter((h) => !(h.id === item.id && h.ordinal === item.ordinal));
    list.unshift({ ...item, watchedAt: Date.now() });
    localStorage.setItem(HKEY, JSON.stringify(list.slice(0, 300)));
    try { window.dispatchEvent(new Event("anime-history-changed")); } catch {}
  } catch {}
}

/** «Продолжить смотреть»: по одному пункту на релиз — самая свежая серия. */
export function getAnimeContinue(): AnimeHistoryItem[] {
  const seen = new Set<number>();
  const out: AnimeHistoryItem[] = [];
  for (const h of getAnimeHistory()) { // отсортировано по watchedAt (unshift сверху)
    if (seen.has(h.id)) continue;
    seen.add(h.id);
    out.push(h);
  }
  return out;
}

/** Последняя смотренная серия релиза (для авто-выбора серии на странице). */
export function getLastAnimeEpisode(id: number): AnimeHistoryItem | null {
  for (const h of getAnimeHistory()) if (h.id === id) return h;
  return null;
}

export function clearAnimeHistory(): void {
  try { localStorage.removeItem(HKEY); window.dispatchEvent(new Event("anime-history-changed")); } catch {}
}
