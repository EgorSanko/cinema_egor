/**
 * Данные для ТВ-обёртки без Next.
 *
 * На сайте эти данные готовил сервер (серверные компоненты и серверные
 * действия). Здесь приложение статическое — значит ходим в те же API прямо из
 * браузера телевизора: TMDB через наш прокси /tmdb-api (напрямую он из России
 * закрыт), поиск — через /api/tv-search, который повторяет логику серверного
 * действия searchTvUnifiedAction.
 */
import { getImageUrl } from "./img";

const TMDB = "/tmdb-api";
const KEY = "275c9d09780aadb4b13ff57a731eda00";

async function tmdb(path: string, params: Record<string, string> = {}): Promise<any> {
  const q = new URLSearchParams({ api_key: KEY, language: "ru-RU", ...params });
  try {
    const r = await fetch(`${TMDB}${path}?${q}`);
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

// ── Поиск (был серверным действием) ──────────────────────────────────────
export type TvSearchCard = {
  id: number;
  type: "movie" | "tv";
  title: string;
  year: string;
  poster: string;
  hdUrl?: string;
  token?: string;
};

export async function searchTvUnifiedAction(query: string): Promise<TvSearchCard[]> {
  try {
    const r = await fetch(`/api/tv-search?q=${encodeURIComponent(query)}`);
    if (!r.ok) return [];
    const d = await r.json();
    return Array.isArray(d) ? d : [];
  } catch {
    return [];
  }
}

// ── Полки главного экрана (были серверной страницей) ─────────────────────
export type Rail = { title: string; cards: any[] };

function movieCard(m: any) {
  return {
    id: m.id, type: "movie" as const, title: m.title,
    year: String(m.release_date || "").slice(0, 4),
    poster: getImageUrl(m.poster_path, "w500"),
  };
}
function tvCard(t: any) {
  return {
    id: t.id, type: "tv" as const, title: t.name,
    year: String(t.first_air_date || "").slice(0, 4),
    poster: getImageUrl(t.poster_path, "w500"),
  };
}

/** Те же полки и в том же порядке, что на серверной странице /tv-home. */
export async function loadRails(): Promise<Rail[]> {
  const [trendM, popM, latest, trendT, popT] = await Promise.all([
    tmdb("/trending/movie/week"),
    tmdb("/movie/popular"),
    tmdb("/movie/now_playing"),
    tmdb("/trending/tv/week"),
    tmdb("/tv/popular"),
  ]);
  const R = (d: any) => (d && d.results ? d.results : []);
  const rails: Rail[] = [
    { title: "В тренде", cards: R(trendM).slice(0, 18).map(movieCard) },
    { title: "Новинки", cards: R(latest).slice(0, 18).map(movieCard) },
    { title: "Популярные сериалы", cards: R(trendT).slice(0, 18).map(tvCard) },
    {
      title: "Высокий рейтинг",
      cards: R(popM).slice().sort((a: any, b: any) => (b.vote_average || 0) - (a.vote_average || 0))
        .slice(0, 18).map(movieCard),
    },
    { title: "Сериалы в тренде", cards: R(popT).slice(0, 18).map(tvCard) },
  ];
  return rails.filter((r) => r.cards.length > 0);
}

// ── Данные для экрана просмотра (была серверная страница) ────────────────
export async function loadWatchMedia(type: "movie" | "tv", id: number): Promise<any | null> {
  const d = await tmdb(`/${type}/${id}`);
  if (!d) return null;
  if (type === "movie") {
    return {
      id: d.id, type: "movie", title: d.title || "", originalTitle: d.original_title || "",
      year: String(d.release_date || "").slice(0, 4),
      poster: getImageUrl(d.poster_path, "w500"), posterPath: d.poster_path || null,
      backdrop: d.backdrop_path ? getImageUrl(d.backdrop_path, "w1280") : null,
      overview: d.overview || "", seasons: [],
    };
  }
  const seasons = (d.seasons || [])
    .filter((s: any) => s.season_number > 0)
    .map((s: any) => ({ season_number: s.season_number, episode_count: s.episode_count, name: s.name }));
  return {
    id: d.id, type: "tv", title: d.name || "", originalTitle: d.original_name || "",
    year: String(d.first_air_date || "").slice(0, 4),
    poster: getImageUrl(d.poster_path, "w500"), posterPath: d.poster_path || null,
    backdrop: d.backdrop_path ? getImageUrl(d.backdrop_path, "w1280") : null,
    overview: d.overview || "", seasons,
  };
}
