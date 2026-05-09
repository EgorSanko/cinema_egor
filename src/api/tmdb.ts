import { API_BASE, TMDB_IMG } from '../constants/theme';

// Proxied through our server to bypass TMDB block in Russia
const TMDB_API = `${API_BASE}/tmdb-api`;
const API_KEY = '275c9d09780aadb4b13ff57a731eda00';

export interface Movie {
  id: number;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string;
  release_date: string;
  genre_ids: number[];
  vote_average: number;
  vote_count: number;
  popularity: number;
}

export interface MovieDetails extends Movie {
  genres: { id: number; name: string }[];
  runtime: number;
  status: string;
  budget: number;
  revenue: number;
  production_companies: { id: number; name: string }[];
}

export interface CastMember {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
}

export interface TVShow {
  id: number;
  name: string;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string;
  first_air_date: string;
  genre_ids: number[];
  vote_average: number;
  vote_count: number;
}

export interface TVShowDetails extends TVShow {
  genres: { id: number; name: string }[];
  number_of_seasons: number;
  number_of_episodes: number;
  seasons: { id: number; name: string; season_number: number; episode_count: number; poster_path: string | null; air_date: string }[];
  status: string;
}

export interface StreamData {
  title: string;
  stream: string;
  quality: string;
  streams: Record<string, string>;
  qualities: string[];
  translators: { id: number; name: string }[];
  is_series: boolean;
  url: string;
}

export interface Genre {
  id: number;
  name: string;
}

async function tmdbFetch<T>(path: string): Promise<T> {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${TMDB_API}${path}${sep}api_key=${API_KEY}&language=ru-RU`);
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  return res.json();
}

// Movies
export const getTrending = () =>
  tmdbFetch<{ results: Movie[] }>('/trending/movie/week').then(d => d.results);

export const getPopular = (page = 1) =>
  tmdbFetch<{ results: Movie[] }>(`/movie/popular?page=${page}`).then(d => d.results);

export const getLatest = () =>
  tmdbFetch<{ results: Movie[] }>('/movie/now_playing?page=1').then(d => d.results);

export const getTopRated = () =>
  tmdbFetch<{ results: Movie[] }>('/movie/top_rated?page=1').then(d => d.results);

export const getMovieDetails = (id: number) =>
  tmdbFetch<MovieDetails>(`/movie/${id}`);

export const getMoviesByGenre = (genreId: number, page = 1) =>
  tmdbFetch<{ results: Movie[] }>(`/discover/movie?with_genres=${genreId}&sort_by=popularity.desc&page=${page}`).then(d => d.results);

export const getMovieCredits = (id: number) =>
  tmdbFetch<{ cast: CastMember[] }>(`/movie/${id}/credits`).then(d => d.cast.slice(0, 20));

export const getMovieRecommendations = (id: number) =>
  tmdbFetch<{ results: Movie[] }>(`/movie/${id}/recommendations`).then(d => d.results);

export const getSimilarMovies = (id: number) =>
  tmdbFetch<{ results: Movie[] }>(`/movie/${id}/similar`).then(d => d.results);

// TV
export const searchMovies = (query: string) =>
  tmdbFetch<{ results: Movie[] }>(`/search/movie?query=${encodeURIComponent(query)}`).then(d => d.results);

export const searchTV = (query: string) =>
  tmdbFetch<{ results: TVShow[] }>(`/search/tv?query=${encodeURIComponent(query)}`).then(d => d.results);

export const getTrendingTV = () =>
  tmdbFetch<{ results: TVShow[] }>('/trending/tv/week').then(d => d.results);

export const getPopularTV = () =>
  tmdbFetch<{ results: TVShow[] }>('/tv/popular?page=1').then(d => d.results);

export const getTVDetails = (id: number) =>
  tmdbFetch<TVShowDetails>(`/tv/${id}`);

export const getTVCredits = (id: number) =>
  tmdbFetch<{ cast: CastMember[] }>(`/tv/${id}/credits`).then(d => d.cast.slice(0, 20));

export const getTVRecommendations = (id: number) =>
  tmdbFetch<{ results: TVShow[] }>(`/tv/${id}/recommendations`).then(d => d.results);

export interface Episode {
  id: number;
  name: string;
  overview: string;
  air_date: string | null;
  episode_number: number;
  season_number: number;
  still_path: string | null;
  vote_average: number;
  runtime: number | null;
}

export const getSeasonEpisodes = (tvId: number, seasonNumber: number) =>
  tmdbFetch<{ episodes: Episode[] }>(`/tv/${tvId}/season/${seasonNumber}`).then(d => d.episodes || []);

export function isEpisodeReleased(ep: Episode): boolean {
  if (!ep.air_date) return false;
  return new Date(ep.air_date) <= new Date();
}

// Genres
export const getGenres = () =>
  tmdbFetch<{ genres: Genre[] }>('/genre/movie/list').then(d => d.genres);

export const getTVGenres = () =>
  tmdbFetch<{ genres: Genre[] }>('/genre/tv/list').then(d => d.genres);

// Discovery - for swipe feature
export const discoverMovies = (genreIds: number[], page = 1) =>
  tmdbFetch<{ results: Movie[] }>(`/discover/movie?with_genres=${genreIds.join(',')}&sort_by=popularity.desc&vote_count.gte=50&page=${page}`).then(d => d.results);

// HDRezka stream API
export async function getStream(
  title: string,
  year: string,
  type: 'movie' | 'tv',
  opts?: { season?: number; episode?: number; translator_id?: number; index?: number }
): Promise<StreamData> {
  const params = new URLSearchParams({ q: title, year, type });
  if (opts?.season) params.set('season', String(opts.season));
  if (opts?.episode) params.set('episode', String(opts.episode));
  if (opts?.translator_id) params.set('translator_id', String(opts.translator_id));
  if (opts?.index) params.set('index', String(opts.index));
  const res = await fetch(`${API_BASE}/hdrezka/api/search?${params}`);
  if (!res.ok) throw new Error(`Stream ${res.status}`);
  return res.json();
}

// Image helpers
export function posterUrl(path: string | null, size = 'w342') {
  if (!path) return null;
  return `${TMDB_IMG}/${size}${path}`;
}

export function backdropUrl(path: string | null) {
  if (!path) return null;
  return `${TMDB_IMG}/w1280${path}`;
}

export function profileUrl(path: string | null) {
  if (!path) return null;
  return `${TMDB_IMG}/w185${path}`;
}

// Format helpers
export function formatBudget(amount: number): string {
  if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(1)} млрд`;
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(0)} млн`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)} тыс`;
  return `$${amount}`;
}
