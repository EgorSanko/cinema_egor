"use server";

import { getMoviesByGenre, getPopularMovies, searchMovies, searchTV, getPopularTV, getTVByGenre, getImageUrl } from "@/lib/tmdb";
import { searchUnified, type UnifiedItem } from "@/lib/search/unified";

// Card shape consumed by the TV search UI. `href` is the ready-to-open route:
// TMDB-matched → /tv-watch/{type}/{id}; HDRezka-native → /tv-hd/{token}.
export type TvSearchCard = {
  key: string;
  mt: "movie" | "tv";
  title: string;
  year: string;
  poster: string;
  href: string;
};

function unifiedToTvCard(it: UnifiedItem): TvSearchCard {
  if (it.kind === "tmdb") {
    const o = it.obj;
    return {
      key: `${it.mt}:${o.id}`,
      mt: it.mt,
      title: o.title || o.name || "",
      year: String(o.release_date || o.first_air_date || "").slice(0, 4),
      poster: getImageUrl(o.poster_path, "w500"),
      href: `/tv-watch/${it.mt}/${o.id}`,
    };
  }
  return {
    key: `hd:${it.token}`,
    mt: it.hit.type,
    title: it.hit.name,
    year: it.hit.year ? String(it.hit.year) : "",
    // HDRezka poster domains (statichdrezka.ac …) are blocked from RU clients —
    // route through the same-origin /hd-img/ proxy (nginx → wsrv), like /tmdb-img/.
    poster: it.hit.poster ? `/hd-img/${it.hit.poster.replace(/^https?:\/\//, "")}` : "",
    href: `/tv-hd/${it.token}`,
  };
}

// HDRezka-driven TV search — same result set as the website /search (availability
// from HDRezka + TMDB enrichment + HDRezka-native titles). Lighter TMDB depth
// (3 movie / 2 TV pages) since this runs live on every keystroke. Movies first,
// then series, so the two groups stay visually separable in the rail.
export async function searchTvUnifiedAction(query: string): Promise<TvSearchCard[]> {
  const { movies, tv } = await searchUnified(query, 3, 2);
  const m = movies.map(unifiedToTvCard);
  const t = tv.map(unifiedToTvCard);
  // ЧЕРЕДУЕМ фильм-сериал-фильм-сериал, а не «сначала все фильмы, потом все
  // сериалы». Раньше был простой конкат, и ТВ-обёртка (она показывает первые
  // 60 карточек) обрезала сериалы ЦЕЛИКОМ: по запросу «Холод» TMDB отдаёт 60
  // фильмов — ровно лимит, сериалам не оставалось ни одного места. Сериал
  // «Холод» при этом стоял ПЕРВЫМ в своей выдаче, но на экран не попадал.
  // На сайте такого не было: там фильмы и сериалы в отдельных секциях.
  const out: TvSearchCard[] = [];
  for (let i = 0; i < Math.max(m.length, t.length); i++) {
    if (i < m.length) out.push(m[i]);
    if (i < t.length) out.push(t[i]);
  }
  return out;
}

export async function fetchMoreRelatedMovies(genreId: number, page: number) {
  return await getMoviesByGenre(genreId, page);
}

export async function fetchMoviesByGenreAction(genreId: number, page: number) {
  return await getMoviesByGenre(genreId, page);
}

export async function fetchMoviesBySearchAction(query: string, page: number) {
  return await searchMovies(query, page);
}

export async function fetchPopularMoviesAction(page: number) {
  return await getPopularMovies(page);
}

export async function fetchTVBySearchAction(query: string, page: number) {
  return await searchTV(query, page);
}

export async function fetchPopularTVAction(page: number) {
  return await getPopularTV(page);
}

export async function fetchTVByGenreAction(genreId: number, page: number) {
  return await getTVByGenre(genreId, page);
}
