/**
 * Schema.org JSON-LD generators for movie + TV pages.
 *
 * Why: rich results in Google, AI-engine citations (ChatGPT/Perplexity/AI
 * Overviews pull from structured data when present), better social previews.
 * Output is meant to be embedded in a `<script type="application/ld+json">`
 * tag inside the page body — Next.js renders it as-is.
 */
import { getImageUrl } from "./tmdb";

const SITE_URL = "https://sapkeflykino.ru";

type AnyMovie = {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  last_air_date?: string;
  runtime?: number;
  episode_run_time?: number[];
  vote_average?: number;
  vote_count?: number;
  genres?: { id: number; name: string }[];
  number_of_seasons?: number;
  number_of_episodes?: number;
};

function isoMinutes(min?: number): string | undefined {
  if (!min || min <= 0) return undefined;
  // Schema.org expects ISO 8601 duration (PT90M for 90-minute runtime)
  return `PT${Math.round(min)}M`;
}

export function movieSchema(movie: AnyMovie) {
  const url = `${SITE_URL}/movie/${movie.id}`;
  const img = movie.backdrop_path
    ? getImageUrl(movie.backdrop_path, "w1280")
    : movie.poster_path
      ? getImageUrl(movie.poster_path, "w500")
      : undefined;

  return {
    "@context": "https://schema.org",
    "@type": "Movie",
    "@id": url,
    url,
    name: movie.title || movie.original_title || "",
    alternateName: movie.original_title && movie.original_title !== movie.title ? movie.original_title : undefined,
    description: movie.overview || undefined,
    image: img,
    datePublished: movie.release_date || undefined,
    duration: isoMinutes(movie.runtime),
    inLanguage: "ru",
    genre: movie.genres?.map(g => g.name),
    aggregateRating: movie.vote_average && movie.vote_count && movie.vote_count > 0
      ? {
          "@type": "AggregateRating",
          ratingValue: Number(movie.vote_average.toFixed(1)),
          bestRating: 10,
          worstRating: 0,
          ratingCount: movie.vote_count,
        }
      : undefined,
  };
}

export function tvSchema(show: AnyMovie) {
  const url = `${SITE_URL}/tv/${show.id}`;
  const img = show.backdrop_path
    ? getImageUrl(show.backdrop_path, "w1280")
    : show.poster_path
      ? getImageUrl(show.poster_path, "w500")
      : undefined;
  const epRun = show.episode_run_time && show.episode_run_time.length > 0
    ? show.episode_run_time[0]
    : undefined;

  return {
    "@context": "https://schema.org",
    "@type": "TVSeries",
    "@id": url,
    url,
    name: show.name || show.original_name || "",
    alternateName: show.original_name && show.original_name !== show.name ? show.original_name : undefined,
    description: show.overview || undefined,
    image: img,
    startDate: show.first_air_date || undefined,
    endDate: show.last_air_date || undefined,
    timeRequired: isoMinutes(epRun),
    inLanguage: "ru",
    numberOfSeasons: show.number_of_seasons,
    numberOfEpisodes: show.number_of_episodes,
    genre: show.genres?.map(g => g.name),
    aggregateRating: show.vote_average && show.vote_count && show.vote_count > 0
      ? {
          "@type": "AggregateRating",
          ratingValue: Number(show.vote_average.toFixed(1)),
          bestRating: 10,
          worstRating: 0,
          ratingCount: show.vote_count,
        }
      : undefined,
  };
}

/**
 * Strip undefined keys recursively. JSON-LD validators flag null/undefined
 * fields as invalid; this keeps the output clean.
 */
export function clean<T>(obj: T): T {
  if (Array.isArray(obj)) return obj.map(clean) as any;
  if (obj && typeof obj === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined || v === null) continue;
      out[k] = clean(v as any);
    }
    return out;
  }
  return obj;
}
