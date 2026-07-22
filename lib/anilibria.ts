// Anilibria (anilibria.top) — аниме-источник для отдельной вкладки «Аниме».
// CORS открыт (API + HLS-CDN отражают Origin) → фронт ходит напрямую из браузера,
// HLS играется нашим ArtPlayer нативно. Token-free, RU-CDN (cache-rfn.libria.fun).
// Аниме НЕ мэпится на TMDB — своя логика/каталог/поиск, своя вкладка.

const API = "https://anilibria.top/api/v1";
const IMG_BASE = "https://anilibria.top";

export interface AniName { main: string; english?: string | null; alternative?: string | null; }
export interface AniPoster {
  src?: string; preview?: string; thumbnail?: string;
  optimized?: { src?: string; preview?: string; thumbnail?: string };
}
export interface AniGenre { id: number; name: string; }
export interface AniType { value: string; description: string; }
export interface AniRelease {
  id: number;
  alias: string;
  name: AniName;
  year: number;
  type: AniType;
  is_ongoing: boolean;
  episodes_total: number | null;
  description?: string | null;
  age_rating?: { label?: string; value?: string } | null;
  genres?: AniGenre[];
  poster?: AniPoster;
}
export interface AniSkip { start: number | null; stop: number | null; }
export interface AniEpisode {
  id: string;
  ordinal: number;
  name?: string | null;
  name_english?: string | null;
  duration?: number;
  hls_480?: string | null;
  hls_720?: string | null;
  hls_1080?: string | null;
  opening?: AniSkip | null;
  ending?: AniSkip | null;
  preview?: AniPoster | null;
}
export interface AniMember { nickname?: string; name?: string | null; role?: { value: string; description?: string } | null; }
export interface AniReleaseFull extends AniRelease { episodes: AniEpisode[]; members?: AniMember[]; }

/** Абсолютный URL постера. thumb = вебп-миниатюра для карточек, full = крупный. */
export function aniPoster(p?: AniPoster | null, size: "thumb" | "full" = "thumb"): string {
  if (!p) return "";
  const rel = size === "thumb"
    ? (p.optimized?.thumbnail || p.thumbnail || p.optimized?.src || p.src)
    : (p.optimized?.src || p.src || p.optimized?.thumbnail || p.thumbnail);
  return rel ? IMG_BASE + rel : "";
}

export function aniTitle(n?: AniName | null): string { return n?.main || n?.english || ""; }

async function aget<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(API + path, { headers: { Accept: "application/json" } });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch { return null; }
}

/** Каталог (пагинация): свежие релизы. */
export async function aniCatalog(page = 1, limit = 30): Promise<AniRelease[]> {
  const d = await aget<{ data?: AniRelease[] }>(`/anime/catalog/releases?page=${page}&limit=${limit}`);
  return (d && Array.isArray(d.data)) ? d.data : [];
}

/** Поиск по названию (ру/англ/ориг). */
export async function aniSearch(query: string): Promise<AniRelease[]> {
  const q = query.trim();
  if (!q) return [];
  const d = await aget<AniRelease[]>(`/app/search/releases?query=${encodeURIComponent(q)}`);
  return Array.isArray(d) ? d : [];
}

/** Полные детали релиза (эпизоды + HLS + команда озвучки). */
export async function aniRelease(id: number | string): Promise<AniReleaseFull | null> {
  return aget<AniReleaseFull>(`/anime/releases/${id}`);
}

/** episode → {качество: hlsUrl}, только непустые, высшее первым (1080→480). */
export function aniQualities(ep?: AniEpisode | null): Record<string, string> {
  const q: Record<string, string> = {};
  if (!ep) return q;
  if (ep.hls_1080) q["1080p"] = ep.hls_1080;
  if (ep.hls_720) q["720p"] = ep.hls_720;
  if (ep.hls_480) q["480p"] = ep.hls_480;
  return q;
}

/** Имена, кто озвучивал (для бейджа «Озвучка: …»). */
export function aniVoices(members?: AniMember[]): string[] {
  if (!members) return [];
  return members.filter((m) => (m.role?.value || "").toLowerCase() === "voicing")
    .map((m) => m.nickname || m.name || "").filter(Boolean);
}
