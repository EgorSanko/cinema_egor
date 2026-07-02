import { API_BASE } from '../constants/theme';
import { filterBlocked, isBlockedMovie, isBlockedTV } from '../utils/blocked-content';

// HDRezka-backed data layer. Public signatures are unchanged (id-based) so the
// screens keep working; internally everything comes from kino-api /api/* and an
// id→url cache (warm because the app always browses/searches before opening a
// detail). Streams resolve BY URL when the url is known (collision-free).
const HD = `${API_BASE}/hdrezka/api`;

// hdrezka id → source URL, and url → raw /api/details payload (for credits reuse).
const urlCache = new Map<number, string>();
const detailCache = new Map<string, any>();

export function rememberUrl(id: number, url: string) {
  if (id && url) urlCache.set(id, url);
}
export function urlFor(id: number): string | undefined {
  return urlCache.get(id);
}

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
  url?: string;
}

export interface MovieDetails extends Movie {
  genres: { id: number; name: string }[];
  runtime: number;
  status: string;
  budget: number;
  revenue: number;
  production_companies: { id: number; name: string }[];
  original_title?: string;
}

export interface CastMember {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
  url?: string;
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
  url?: string;
}

export interface TVShowDetails extends TVShow {
  genres: { id: number; name: string }[];
  number_of_seasons: number;
  number_of_episodes: number;
  seasons: { id: number; name: string; season_number: number; episode_count: number; poster_path: string | null; air_date: string }[];
  status: string;
  original_name?: string;
  seasonsMap?: Record<string, number[]>;
}

export interface StreamData {
  title: string;
  stream: string;
  quality: string;
  streams: Record<string, string>;
  qualities: string[];
  translators: { id: number; name: string; is_premium?: boolean }[];
  active_translator_id?: number;
  is_series: boolean;
  url: string;
}

export interface Genre {
  id: number;
  name: string;
}

// ── HDRezka genre taxonomy ↔ TMDB genre ids (so genre ids stay stable app-wide) ──
const HD_GENRES: { slug: string; name: string; tmdb: number }[] = [
  { slug: 'action', name: 'Боевики', tmdb: 28 },
  { slug: 'fiction', name: 'Фантастика', tmdb: 878 },
  { slug: 'fantasy', name: 'Фэнтези', tmdb: 14 },
  { slug: 'comedy', name: 'Комедии', tmdb: 35 },
  { slug: 'melodrama', name: 'Мелодрамы', tmdb: 10749 },
  { slug: 'drama', name: 'Драмы', tmdb: 18 },
  { slug: 'thriller', name: 'Триллеры', tmdb: 53 },
  { slug: 'horror', name: 'Ужасы', tmdb: 27 },
  { slug: 'detective', name: 'Детективы', tmdb: 9648 },
  { slug: 'crime', name: 'Криминал', tmdb: 80 },
  { slug: 'adventures', name: 'Приключения', tmdb: 12 },
  { slug: 'military', name: 'Военные', tmdb: 10752 },
  { slug: 'historical', name: 'Исторические', tmdb: 36 },
  { slug: 'family', name: 'Семейные', tmdb: 10751 },
  { slug: 'cartoons', name: 'Мультфильмы', tmdb: 16 },
  { slug: 'documentary', name: 'Документальные', tmdb: 99 },
  { slug: 'western', name: 'Вестерны', tmdb: 37 },
  { slug: 'musical', name: 'Мюзиклы', tmdb: 10402 },
];
const TMDB_TO_SLUG: Record<number, string> = Object.fromEntries(HD_GENRES.map((g) => [g.tmdb, g.slug]));
const NAME_TO_TMDB: Record<string, number> = Object.fromEntries(HD_GENRES.map((g) => [g.name.toLowerCase(), g.tmdb]));

function genreIdOf(name: string): number {
  return NAME_TO_TMDB[(name || '').trim().toLowerCase()] || 0;
}

// statichdrezka.ac is RU-blocked → route posters through the same-origin /hd-img
// proxy. Return an ABSOLUTE url so RN <Image> can load it directly.
function hdImgAbs(u?: string | null): string | null {
  if (!u) return null;
  if (u.startsWith('/hd-img/')) return `${API_BASE}${u}`;
  if (/^https?:\/\//.test(u)) return `${API_BASE}/hd-img/` + u.replace(/^https?:\/\//, '');
  return u;
}

// ── card mappers ──
function toMovie(it: any): Movie {
  rememberUrl(it.id, it.url);
  return {
    id: it.id || 0, title: it.title || it.name || '',
    poster_path: hdImgAbs(it.poster), backdrop_path: hdImgAbs(it.poster),
    overview: '', release_date: it.year ? `${it.year}-01-01` : '',
    genre_ids: [], vote_average: 0, vote_count: 0, popularity: 0, url: it.url,
  };
}
function toTV(it: any): TVShow {
  rememberUrl(it.id, it.url);
  return {
    id: it.id || 0, name: it.title || it.name || '',
    poster_path: hdImgAbs(it.poster), backdrop_path: hdImgAbs(it.poster),
    overview: '', first_air_date: it.year ? `${it.year}-01-01` : '',
    genre_ids: [], vote_average: 0, vote_count: 0, url: it.url,
  };
}

async function browse(cat: string, sort?: string, page = 1, genre?: string): Promise<any[]> {
  try {
    const qs = new URLSearchParams({ cat });
    if (sort) qs.set('sort', sort);
    if (genre) qs.set('genre', genre);
    if (page > 1) qs.set('page', String(page));
    const res = await fetch(`${HD}/browse?${qs}`);
    const d = await res.json();
    return Array.isArray(d.items) ? d.items.filter((i: any) => i.url && i.title) : [];
  } catch { return []; }
}

async function find(query: string): Promise<any[]> {
  try {
    const res = await fetch(`${HD}/find?q=${encodeURIComponent(query)}`);
    const d = await res.json();
    return Array.isArray(d.results) ? d.results.filter((i: any) => i.url) : [];
  } catch { return []; }
}

async function fetchDetails(url: string): Promise<any> {
  if (detailCache.has(url)) return detailCache.get(url);
  const res = await fetch(`${HD}/details?url=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error(`details ${res.status}`);
  const d = await res.json();
  detailCache.set(url, d);
  return d;
}

function genresOf(d: any): { id: number; name: string }[] {
  const names: string[] = (d.genre_links?.map((g: any) => g.name) || d.genres || []).filter(Boolean);
  return names.map((n: string) => ({ id: genreIdOf(n), name: n }));
}
function runtimeMin(duration?: string): number {
  if (!duration) return 0;
  const m = /(\d+)\s*ч/.exec(duration); const mm = /(\d+)\s*мин/.exec(duration);
  return (m ? +m[1] * 60 : 0) + (mm ? +mm[1] : 0);
}
function ratingOf(d: any): number {
  const r = d.ratings?.imdb?.rating ?? d.ratings?.kp?.rating ?? d.ratings?.hdrezka?.rating;
  return typeof r === 'number' ? r : 0;
}

function adaptMovieDetails(d: any, url: string): MovieDetails {
  rememberUrl(d.hdrezka_id || 0, url);
  return {
    id: d.hdrezka_id || 0, title: d.title, original_title: d.orig_title || d.title,
    poster_path: hdImgAbs(d.poster), backdrop_path: hdImgAbs(d.poster),
    overview: d.description || '', release_date: d.year ? `${d.year}-01-01` : '',
    genre_ids: genresOf(d).map((g) => g.id), vote_average: ratingOf(d), vote_count: 0, popularity: 0,
    genres: genresOf(d), runtime: runtimeMin(d.duration), status: '', budget: 0, revenue: 0,
    production_companies: [], url,
  };
}
function adaptTVDetails(d: any, url: string): TVShowDetails {
  rememberUrl(d.hdrezka_id || 0, url);
  const seasonsMap: Record<string, number[]> = d.seasons || {};
  const nums = Object.keys(seasonsMap).map(Number).filter((n) => !isNaN(n)).sort((a, b) => a - b);
  return {
    id: d.hdrezka_id || 0, name: d.title, original_name: d.orig_title || d.title,
    poster_path: hdImgAbs(d.poster), backdrop_path: hdImgAbs(d.poster),
    overview: d.description || '', first_air_date: d.year ? `${d.year}-01-01` : '',
    genre_ids: genresOf(d).map((g) => g.id), vote_average: ratingOf(d), vote_count: 0,
    genres: genresOf(d), number_of_seasons: nums.length,
    number_of_episodes: Object.values(seasonsMap).reduce((a, b) => a + (b?.length || 0), 0),
    seasons: nums.map((n) => ({ id: n, name: `Сезон ${n}`, season_number: n, episode_count: (seasonsMap[String(n)] || []).length, poster_path: hdImgAbs(d.poster), air_date: '' })),
    status: '', url, seasonsMap,
  };
}
function castOf(d: any): CastMember[] {
  return (d.persons || []).slice(0, 20).map((p: any) => ({ id: 0, name: p.name, character: '', profile_path: hdImgAbs(p.image), url: p.url }));
}
function relatedToCards(items: any[], type: 'movie' | 'tv'): any[] {
  return items.map((it) => (type === 'tv' ? toTV(it) : toMovie(it)));
}

// ── Movies ──
export const getTrending = () => browse('films', 'watching').then((r) => filterBlocked(r.map(toMovie), 'movie'));
export const getPopular = (page = 1) => browse('films', 'popular', page).then((r) => filterBlocked(r.map(toMovie), 'movie'));
export const getLatest = () => browse('new').then((r) => filterBlocked(r.map(toMovie), 'movie'));
export const getTopRated = () => browse('films', 'best').then((r) => filterBlocked(r.map(toMovie), 'movie'));

export const getMovieDetails = async (id: number): Promise<MovieDetails> => {
  if (isBlockedMovie(id)) throw new Error('blocked');
  const url = urlCache.get(id);
  if (!url) throw new Error('no url for id');
  return adaptMovieDetails(await fetchDetails(url), url);
};

export const getMoviesByGenre = (genreId: number, page = 1) =>
  browse('films', undefined, page, TMDB_TO_SLUG[genreId]).then((r) => filterBlocked(r.map(toMovie), 'movie'));

export const getMovieCredits = async (id: number): Promise<CastMember[]> => {
  const url = urlCache.get(id); if (!url) return [];
  return castOf(await fetchDetails(url));
};

export const getMovieRecommendations = async (id: number): Promise<Movie[]> => {
  const url = urlCache.get(id); if (!url) return [];
  try {
    const d = await fetch(`${HD}/related?url=${encodeURIComponent(url)}`).then((r) => r.json());
    return filterBlocked(relatedToCards(d.items || [], 'movie') as Movie[], 'movie');
  } catch { return []; }
};
export const getSimilarMovies = getMovieRecommendations;

// ── Search / TV ──
export const searchMovies = (query: string) => find(query).then((r) => filterBlocked(r.filter((x) => x.type !== 'tv').map(toMovie), 'movie'));
export const searchTV = (query: string) => find(query).then((r) => filterBlocked(r.filter((x) => x.type === 'tv').map(toTV), 'tv'));

export const getTrendingTV = () => browse('series', 'watching').then((r) => filterBlocked(r.map(toTV), 'tv'));
export const getPopularTV = () => browse('series', 'popular').then((r) => filterBlocked(r.map(toTV), 'tv'));

export const getTVDetails = async (id: number): Promise<TVShowDetails> => {
  if (isBlockedTV(id)) throw new Error('blocked');
  const url = urlCache.get(id);
  if (!url) throw new Error('no url for id');
  return adaptTVDetails(await fetchDetails(url), url);
};

export const getTVCredits = async (id: number): Promise<CastMember[]> => {
  const url = urlCache.get(id); if (!url) return [];
  return castOf(await fetchDetails(url));
};

export const getTVRecommendations = async (id: number): Promise<TVShow[]> => {
  const url = urlCache.get(id); if (!url) return [];
  try {
    const d = await fetch(`${HD}/related?url=${encodeURIComponent(url)}`).then((r) => r.json());
    return filterBlocked(relatedToCards(d.items || [], 'tv') as TVShow[], 'tv');
  } catch { return []; }
};

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

// Season episode list — synthesized from the HDRezka season→episode-numbers tree.
export const getSeasonEpisodes = async (tvId: number, seasonNumber: number): Promise<Episode[]> => {
  const url = urlCache.get(tvId); if (!url) return [];
  try {
    const d = await fetch(`${HD}/episodes?url=${encodeURIComponent(url)}`).then((r) => r.json());
    const nums: number[] = (d.seasons || {})[String(seasonNumber)] || [];
    return nums.map((n) => ({
      id: n, name: `Серия ${n}`, overview: '', air_date: '', episode_number: n,
      season_number: seasonNumber, still_path: null, vote_average: 0, runtime: null,
    }));
  } catch { return []; }
};

export function isEpisodeReleased(ep: Episode): boolean {
  if (!ep.air_date) return true; // HDRezka only lists released episodes
  return new Date(ep.air_date) <= new Date();
}

// ── Genres ──
export const getGenres = async (): Promise<Genre[]> => HD_GENRES.map((g) => ({ id: g.tmdb, name: g.name }));
export const getTVGenres = getGenres;

// Swipe discovery — HDRezka films of the given genres.
export const discoverMovies = async (genreIds: number[], page = 1): Promise<Movie[]> => {
  const slugs = [...new Set(genreIds.map((id) => TMDB_TO_SLUG[id]).filter(Boolean))];
  const out: Movie[] = [];
  for (const slug of slugs) {
    const items = await browse('films', undefined, page, slug);
    out.push(...items.map(toMovie));
  }
  return out;
};

// ── Stream (HDRezka) ──
export async function getStream(
  title: string,
  year: string,
  type: 'movie' | 'tv',
  opts?: { season?: number; episode?: number; translator_id?: number; index?: number; url?: string }
): Promise<StreamData> {
  // Resolve BY URL when known (collision-free); otherwise fall back to title search.
  if (opts?.url) {
    const p = new URLSearchParams({ url: opts.url });
    if (opts.season) p.set('season', String(opts.season));
    if (opts.episode) p.set('episode', String(opts.episode));
    if (opts.translator_id) p.set('translator_id', String(opts.translator_id));
    const res = await fetch(`${HD}/resolve?${p}`);
    if (!res.ok) throw new Error(`Stream ${res.status}`);
    return res.json();
  }
  const params = new URLSearchParams({ q: title, year, type });
  if (opts?.season) params.set('season', String(opts.season));
  if (opts?.episode) params.set('episode', String(opts.episode));
  if (opts?.translator_id) params.set('translator_id', String(opts.translator_id));
  if (opts?.index) params.set('index', String(opts.index));
  const res = await fetch(`${HD}/search?${params}`);
  if (!res.ok) throw new Error(`Stream ${res.status}`);
  return res.json();
}

// ── Image helpers ── (HDRezka posters are already absolute /hd-img urls) ──
export function posterUrl(path: string | null, _size = 'w342') {
  if (!path) return null;
  return /^https?:\/\//.test(path) ? path : `${API_BASE}/hd-img/${path.replace(/^https?:\/\//, '')}`;
}
export function backdropUrl(path: string | null) {
  return posterUrl(path, 'w1280');
}
export function profileUrl(path: string | null) {
  return posterUrl(path, 'w185');
}

export function formatBudget(amount: number): string {
  if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(1)} млрд`;
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(0)} млн`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)} тыс`;
  return `$${amount}`;
}

// ── Trailers (HDRezka → YouTube id) ──
export interface TmdbVideo {
  id: string;
  key: string;
  name: string;
  site: string;
  type: string;
  official: boolean;
  published_at: string;
}

async function getVideos(_type: 'movie' | 'tv', id: number): Promise<TmdbVideo[]> {
  const url = urlCache.get(id); if (!url) return [];
  try {
    const d = await fetch(`${HD}/trailer?url=${encodeURIComponent(url)}`).then((r) => r.json());
    if (!d.youtube_id) return [];
    return [{ id: d.youtube_id, key: d.youtube_id, name: 'Трейлер', site: 'YouTube', type: 'Trailer', official: true, published_at: '' }];
  } catch { return []; }
}
export const getMovieVideos = (id: number) => getVideos('movie', id);
export const getTVVideos = (id: number) => getVideos('tv', id);

export function pickBestTrailer(videos: TmdbVideo[]): TmdbVideo | null {
  if (!videos || videos.length === 0) return null;
  const yt = videos.filter((v) => v.site === 'YouTube');
  return yt[0] || null;
}

// ── People ── (HDRezka person search isn't exposed; people surface via cast) ──
export interface Person {
  id: number;
  name: string;
  profile_path: string | null;
  known_for_department: string;
  popularity: number;
  known_for?: { id: number; title?: string; name?: string; media_type: 'movie' | 'tv'; poster_path: string | null }[];
}

export async function searchPeople(_query: string): Promise<Person[]> {
  return []; // person search not available on HDRezka; cast → person still works via url
}

export async function getPersonDetails(_id: number): Promise<{ details: any; credits: any } | null> {
  return null;
}
