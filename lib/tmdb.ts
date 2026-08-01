import { filterBlocked, isBlockedMovie, isBlockedTV } from "./blocked-content";

const API_BASE_URL = process.env.NEXT_PUBLIC_TMDB_BASE_URL;
const API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;
const IMAGE_BASE_URL = process.env.NEXT_PUBLIC_TMDB_IMAGE_BASE_URL;
const BACKDROP_BASE_URL = process.env.NEXT_PUBLIC_TMDB_BACKDROP_BASE_URL;
const VIDSRC_BASE_URL = process.env.NEXT_PUBLIC_VIDSRC_BASE_URL;

if (!API_BASE_URL || !API_KEY) {
	console.error(
		"вљ пёЏ TMDB API configuration is missing. Please check your .env file."
	);
}

// Persistent disk cache for TMDB responses. TMDB (api.themoviedb.org) blips
// occasionally take the whole site down because every SSR page fetches it; this
// serves the LAST-GOOD response from disk when TMDB is unreachable, so the site
// stays up (slightly stale) instead of going blank/404. Server-only — the
// require is hidden from the bundler so this file stays client-safe (getImageUrl
// etc. are imported by client components).
function tmdbCache(): { read: (u: string) => unknown; write: (u: string, d: unknown) => void } | null {
	if (typeof window !== "undefined") return null;
	try {
		// Direct eval → the module's (Node) require on the server; hidden from the
		// bundler so "fs" is never pulled into the client bundle.
		// eslint-disable-next-line no-eval
		const req = eval("require") as NodeRequire;
		const fs = req("fs"), path = req("path"), crypto = req("crypto");
		const DIR = process.env.TMDB_CACHE_DIR || path.join(process.cwd(), "tmdb-cache");
		const file = (u: string) => path.join(DIR, crypto.createHash("sha1").update(u).digest("hex") + ".json");
		return {
			read: (u: string) => { try { return JSON.parse(fs.readFileSync(file(u), "utf-8")); } catch { return null; } },
			write: (u: string, d: unknown) => { try { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(file(u), JSON.stringify(d)); } catch { /* ignore */ } },
		};
	} catch { return null; }
}

// Helper for robust fetching with retry logic
async function fetchWithRetry(
	url: string,
	options: RequestInit = {},
	retries = 3
) {
	if (!API_KEY) {
		console.error("вќЊ API Key is missing, skipping fetch.");
		throw new Error("API Key is missing");
	}

	try {
		const response = await fetch(url, {
			...options,
			// Bound every TMDB call: from a RU host the connection to api.themoviedb.org
			// periodically stalls, and without a timeout undici keeps a dead socket and
			// the request hangs ~indefinitely → the whole /feed route times out. A hard
			// 7s abort makes a stalled call fail fast so the retry below opens a fresh
			// connection and the feed self-heals instead of dying until a manual restart.
			signal: options.signal ?? AbortSignal.timeout(7000),
			headers: {
				...options.headers,
				"Content-Type": "application/json",
			},
		});

		if (!response.ok) {
			// Handle specific HTTP errors
			if (response.status === 401) {
				throw new Error("Unauthorized: Invalid API Key");
			}
			if (response.status === 404) {
				throw new Error("Resource not found");
			}
			if (response.status === 429) {
				throw new Error("Rate limit exceeded");
			}
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		// Cache a fresh copy to disk (from a clone so the caller's body is intact).
		const okOps = tmdbCache();
		if (okOps) {
			try { response.clone().json().then((d) => okOps.write(url, d)).catch(() => {}); } catch { /* ignore */ }
		}
		return response;
	} catch (error) {
		if (retries > 0) {
			console.warn(
				`вљ пёЏ Request failed, retrying... (${retries} attempts left). Error: ${error}`
			);
			await new Promise((resolve) => setTimeout(resolve, 1000));
			return fetchWithRetry(url, options, retries - 1);
		}
		// TMDB unreachable after retries — serve the last-good disk cache so the
		// site degrades to slightly-stale instead of blank/404.
		const failOps = tmdbCache();
		const stale = failOps?.read(url);
		if (stale != null) {
			console.warn("TMDB unreachable — serving stale disk cache for", url.slice(0, 70));
			return new Response(JSON.stringify(stale), { status: 200, headers: { "content-type": "application/json" } });
		}
		console.error("Fetch failed after retries:", error);
		throw error;
	}
}

export interface Movie {
	id: number;
	title: string;
	poster_path: string | null;
	backdrop_path: string | null;
	overview: string;
	release_date: string;
	genre_ids: number[];
	popularity: number;
	vote_average: number;
	vote_count: number;
}

export interface Genre {
	id: number;
	name: string;
}

export interface MovieDetails extends Movie {
	genres: Genre[];
	runtime: number;
	status: string;
	budget: number;
	revenue: number;
}


export interface TVShow {
  id: number;
  name: string;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string;
  first_air_date: string;
  genre_ids: number[];
  popularity: number;
  vote_average: number;
  vote_count: number;
}

export interface TVSeason {
  id: number;
  name: string;
  season_number: number;
  episode_count: number;
  air_date: string;
  poster_path: string | null;
  overview: string;
}

export interface TVEpisode {
  id: number;
  name: string;
  episode_number: number;
  season_number: number;
  air_date: string;
  overview: string;
  still_path: string | null;
  runtime: number;
  vote_average: number;
}

export interface TVShowDetails extends TVShow {
  genres: Genre[];
  number_of_seasons: number;
  number_of_episodes: number;
  seasons: TVSeason[];
  status: string;
  episode_run_time: number[];
}

export async function getTrendingMovies(timeWindow: "day" | "week" = "week") {
	try {
		const response = await fetchWithRetry(
			`${API_BASE_URL}/trending/movie/${timeWindow}?api_key=${API_KEY}&language=ru-RU`,
			{
				next: { revalidate: 3600 },
			}
		);
		const data = await response.json();
		return filterBlocked(data.results as Movie[], "movie");
	} catch (error) {
		console.error("Error fetching trending movies:", error);
		return [];
	}
}

export async function getLatestMovies() {
	try {
		const response = await fetchWithRetry(
			`${API_BASE_URL}/movie/now_playing?api_key=${API_KEY}&language=ru-RU&page=1`,
			{
				next: { revalidate: 3600 },
			}
		);
		const data = await response.json();
		return filterBlocked(data.results as Movie[], "movie");
	} catch (error) {
		console.error("Error fetching latest movies:", error);
		return [];
	}
}

export async function getPopularMovies(page: number = 1) {
	try {
		const response = await fetchWithRetry(
			`${API_BASE_URL}/movie/popular?api_key=${API_KEY}&language=ru-RU&page=${page}`,
			{
				next: { revalidate: 3600 },
			}
		);
		const data = await response.json();
		return filterBlocked(data.results as Movie[], "movie");
	} catch (error) {
		console.error("Error fetching popular movies:", error);
		return [];
	}
}

export async function getGenres() {
	try {
		const response = await fetchWithRetry(
			`${API_BASE_URL}/genre/movie/list?api_key=${API_KEY}&language=ru-RU`,
			{
				next: { revalidate: 86400 },
			}
		);
		const data = await response.json();
		return data.genres as Genre[];
	} catch (error) {
		console.error("Error fetching genres:", error);
		return [];
	}
}

// TMDB хранит русские названия через «ё» и НЕ считает «е»≡«ё» при поиске: запрос
// «люди в черном» находил 2 части из 4, а «люди в чёрном» — все 4. Но «ё» почти
// никто не печатает, поэтому дублируем запрос с заменой е→ё (и ё→е) и объединяем
// результаты, сохраняя порядок исходного запроса и убирая дубли по id. Слияние
// только на 1-й странице — там умещается вся выдача таких запросов, а сложную
// пагинацию не ломаем.
function yoQueries(query: string): string[] {
	const set = new Set<string>([query]);
	if (/[еЕ]/.test(query)) set.add(query.replace(/е/g, "ё").replace(/Е/g, "Ё"));
	if (/[ёЁ]/.test(query)) set.add(query.replace(/ё/g, "е").replace(/Ё/g, "Е"));
	return [...set];
}

async function tmdbSearchMerged(
	kind: "movie" | "tv",
	query: string,
	page: number
): Promise<any[]> {
	const q0 = query.trim();
	if (!q0) return [];
	const queries = page === 1 ? yoQueries(q0) : [q0];
	const lists = await Promise.all(
		queries.map(async (q) => {
			try {
				const r = await fetchWithRetry(
					`${API_BASE_URL}/search/${kind}?api_key=${API_KEY}&query=${encodeURIComponent(
						q
					)}&language=ru-RU&page=${page}`,
					{ next: { revalidate: 300 } }
				);
				const d = await r.json();
				return (d.results as any[]) || [];
			} catch {
				return [];
			}
		})
	);
	const seen = new Set<number>();
	const merged: any[] = [];
	for (const list of lists)
		for (const it of list)
			if (it && !seen.has(it.id)) {
				seen.add(it.id);
				merged.push(it);
			}
	return merged;
}

export async function searchMovies(query: string, page = 1) {
	if (!query.trim()) return [];
	try {
		const merged = await tmdbSearchMerged("movie", query, page);
		return filterBlocked(merged as Movie[], "movie");
	} catch (error) {
		console.error("Error searching movies:", error);
		return [];
	}
}

export async function getMovieDetails(movieId: number) {
	if (!movieId || isNaN(movieId)) return null;
	// Belt-and-suspenders: pages already short-circuit on isBlockedMovie before
	// calling this, but any other caller that forgets to gate will get null
	// and render an empty/not-found state.
	if (isBlockedMovie(movieId)) return null;
	try {
		const response = await fetchWithRetry(
			`${API_BASE_URL}/movie/${movieId}?api_key=${API_KEY}&language=ru-RU&append_to_response=credits,release_dates`,
			{
				next: { revalidate: 3600 },
			}
		);
		const data = await response.json();
		return data as MovieDetails;
	} catch (error) {
		console.error(`Error fetching movie details for ID ${movieId}:`, error);
		return null;
	}
}

export async function getMoviesByGenre(genreId: number, page = 1) {
	try {
		const response = await fetchWithRetry(
			`${API_BASE_URL}/discover/movie?api_key=${API_KEY}&with_genres=${genreId}&language=ru-RU&sort_by=popularity.desc&page=${page}`,
			{ next: { revalidate: 3600 } }
		);
		const data = await response.json();
		return filterBlocked(data.results as Movie[], "movie");
	} catch (error) {
		console.error("Error fetching movies by genre:", error);
		return [];
	}
}

// Lightweight: one popular movie + total count per genre, for the genres page cards
export async function getGenreInfo(genreId: number): Promise<{ total: number; backdrop: string | null }> {
	try {
		const r = await fetchWithRetry(
			`${API_BASE_URL}/discover/movie?api_key=${API_KEY}&with_genres=${genreId}&language=ru-RU&sort_by=popularity.desc&page=1`,
			{ next: { revalidate: 86400 } }
		);
		const data = await r.json();
		return { total: data.total_results || 0, backdrop: data.results?.[0]?.backdrop_path || null };
	} catch {
		return { total: 0, backdrop: null };
	}
}


export async function getTrendingTV(timeWindow: "day" | "week" = "week") {
  try {
    const response = await fetchWithRetry(
      `${API_BASE_URL}/trending/tv/${timeWindow}?api_key=${API_KEY}&language=ru-RU`,
      { next: { revalidate: 3600 } }
    );
    const data = await response.json();
    return filterBlocked(data.results as TVShow[], "tv");
  } catch (error) {
    console.error("Error fetching trending TV:", error);
    return [];
  }
}

export async function getPopularTV(page: number = 1) {
  try {
    const response = await fetchWithRetry(
      `${API_BASE_URL}/tv/popular?api_key=${API_KEY}&language=ru-RU&page=${page}`,
      { next: { revalidate: 3600 } }
    );
    const data = await response.json();
    return filterBlocked(data.results as TVShow[], "tv");
  } catch (error) {
    console.error("Error fetching popular TV:", error);
    return [];
  }
}

export async function getTVDetails(tvId: number) {
  if (!tvId || isNaN(tvId)) return null;
  if (isBlockedTV(tvId)) return null;
  try {
    const response = await fetchWithRetry(
      `${API_BASE_URL}/tv/${tvId}?api_key=${API_KEY}&language=ru-RU&append_to_response=credits,content_ratings`,
      { next: { revalidate: 3600 } }
    );
    const data = await response.json();
    return data as TVShowDetails;
  } catch (error) {
    console.error(`Error fetching TV details for ID ${tvId}:`, error);
    return null;
  }
}

export async function getTVRecommendations(tvId: number): Promise<TVShow[]> {
  if (!tvId || isNaN(tvId)) return [];
  try {
    const response = await fetchWithRetry(
      `${API_BASE_URL}/tv/${tvId}/recommendations?api_key=${API_KEY}&language=ru-RU&page=1`,
      { next: { revalidate: 3600 } }
    );
    const data = await response.json();
    return filterBlocked((data.results as TVShow[]) || [], "tv");
  } catch {
    return [];
  }
}

export async function getMovieRecommendations(movieId: number): Promise<Movie[]> {
  if (!movieId || isNaN(movieId)) return [];
  try {
    const response = await fetchWithRetry(
      `${API_BASE_URL}/movie/${movieId}/recommendations?api_key=${API_KEY}&language=ru-RU&page=1`,
      { next: { revalidate: 3600 } }
    );
    const data = await response.json();
    const results = ((data.results as Movie[]) || []).slice();
    // TMDB recommendations can be empty/short for niche titles — top up from
    // /similar (genre+keyword based) so we never fall back to random-by-genre.
    if (results.length < 6) {
      try {
        const sim = await fetchWithRetry(
          `${API_BASE_URL}/movie/${movieId}/similar?api_key=${API_KEY}&language=ru-RU&page=1`,
          { next: { revalidate: 3600 } }
        );
        const simData = await sim.json();
        const seen = new Set(results.map((m) => m.id));
        for (const m of ((simData.results as Movie[]) || [])) {
          if (!seen.has(m.id)) { results.push(m); seen.add(m.id); }
        }
      } catch {}
    }
    return filterBlocked(results, "movie");
  } catch {
    return [];
  }
}

export async function getTVSeasonEpisodes(tvId: number, seasonNumber: number) {
  try {
    const response = await fetchWithRetry(
      `${API_BASE_URL}/tv/${tvId}/season/${seasonNumber}?api_key=${API_KEY}&language=ru-RU`,
      { next: { revalidate: 3600 } }
    );
    const data = await response.json();
    return data.episodes as TVEpisode[];
  } catch (error) {
    console.error("Error fetching TV season episodes:", error);
    return [];
  }
}

export async function searchTV(query: string, page = 1) {
  if (!query.trim()) return [];
  try {
    // е↔ё-нормализация — см. tmdbSearchMerged (без неё «черном» терял части).
    return (await tmdbSearchMerged("tv", query, page)) as TVShow[];
  } catch (error) {
    console.error("Error searching TV:", error);
    return [];
  }
}

export async function getTVByGenre(genreId: number, page = 1) {
  try {
    const response = await fetchWithRetry(
      `${API_BASE_URL}/discover/tv?api_key=${API_KEY}&with_genres=${genreId}&language=ru-RU&sort_by=popularity.desc&page=${page}`,
      { next: { revalidate: 3600 } }
    );
    const data = await response.json();
    return data.results as TVShow[];
  } catch (error) {
    console.error("Error fetching TV by genre:", error);
    return [];
  }
}

export async function getTVGenres() {
  try {
    const response = await fetchWithRetry(
      `${API_BASE_URL}/genre/tv/list?api_key=${API_KEY}&language=ru-RU`,
      { next: { revalidate: 86400 } }
    );
    const data = await response.json();
    return data.genres as Genre[];
  } catch (error) {
    console.error("Error fetching TV genres:", error);
    return [];
  }
}
export function getImageUrl(path: string | null, size = "w500") {
	if (!path) return "/abstract-movie-poster.png";

	// Already a full or already-proxied URL (e.g. a poster_path saved to
	// localStorage in proxied form) — don't prefix again, or it becomes
	// /tmdb-img/w500/tmdb-img/w500/… → 404. (Raw TMDB paths like "/abc.jpg"
	// don't start with /tmdb-img/, so they still get prefixed below.)
	if (/^https?:\/\//.test(path) || path.startsWith("/tmdb-img/")) {
		return path;
	}

	const envBase =
		process.env.NEXT_PUBLIC_TMDB_IMAGE_BASE_URL ||
		"/tmdb-img/w500";

	// If the requested size matches the env var's implied size (w500), just use it.
	if (size === "w500" && envBase.endsWith("/w500")) {
		return `${envBase}${path}`;
	}

	// If envBase has a size at the end, replace it.
	const sizeRegex = /\/w\d+$/;
	if (sizeRegex.test(envBase)) {
		return `${envBase.replace(sizeRegex, "/" + size)}${path}`;
	}

	// Otherwise append size
	return `${envBase}/${size}${path}`;
}

export function getBackdropUrl(path: string | null) {
	if (!path) return "/movie-backdrop.png";
	const envBase =
		process.env.NEXT_PUBLIC_TMDB_BACKDROP_BASE_URL ||
		"/tmdb-img/w1280";
	return `${envBase}${path}`;
}

export function getVidSrcUrl(
	mediaId: number,
	type: "movie" | "tv" = "movie",
	season?: number,
	episode?: number
) {
	const baseUrl =
		process.env.NEXT_PUBLIC_VIDSRC_BASE_URL || "https://vidsrc.cc";
	if (type === "movie") {
		return `${baseUrl}/v2/embed/movie/${mediaId}?autoPlay=true`;
	}
	if (type === "tv" && season && episode) {
		return `${baseUrl}/v2/embed/tv/${mediaId}/${season}/${episode}?autoPlay=true`;
	}
	return "#";
}






// === Trailers ===
export interface TmdbVideo {
	id: string;
	key: string;          // YouTube video ID (when site === "YouTube")
	name: string;
	site: string;         // "YouTube" usually
	type: string;         // "Trailer" | "Teaser" | "Clip" | "Featurette"
	official: boolean;
	published_at: string;
}

async function getVideos(type: "movie" | "tv", id: number): Promise<TmdbVideo[]> {
	if (!id) return [];
	try {
		// Try Russian first, fall back to English (most trailers are in EN)
		const ru = await fetchWithRetry(
			`${API_BASE_URL}/${type}/${id}/videos?api_key=${API_KEY}&language=ru-RU`,
			{ next: { revalidate: 3600 } }
		);
		const ruData = await ru.json();
		const ruResults = (ruData.results || []) as TmdbVideo[];
		if (ruResults.length > 0) return ruResults;
		const en = await fetchWithRetry(
			`${API_BASE_URL}/${type}/${id}/videos?api_key=${API_KEY}&language=en-US`,
			{ next: { revalidate: 3600 } }
		);
		const enData = await en.json();
		return (enData.results || []) as TmdbVideo[];
	} catch (e) {
		console.error("getVideos error:", e);
		return [];
	}
}

export const getMovieVideos = (id: number) => getVideos("movie", id);
export const getTVVideos = (id: number) => getVideos("tv", id);

// Pick the best trailer: prefer official YouTube Trailer
export function pickBestTrailer(videos: TmdbVideo[]): TmdbVideo | null {
	if (!videos || videos.length === 0) return null;
	const yt = videos.filter(v => v.site === "YouTube");
	const officialTrailer = yt.find(v => v.type === "Trailer" && v.official);
	if (officialTrailer) return officialTrailer;
	const anyTrailer = yt.find(v => v.type === "Trailer");
	if (anyTrailer) return anyTrailer;
	return yt[0] || null;
}

// === People search ===
export interface Person {
	id: number;
	name: string;
	profile_path: string | null;
	known_for_department: string;
	popularity: number;
	known_for?: { id: number; title?: string; name?: string; media_type: "movie" | "tv"; poster_path: string | null }[];
}

export async function searchPeople(query: string, page = 1): Promise<Person[]> {
	if (!query.trim()) return [];
	try {
		const res = await fetchWithRetry(
			`${API_BASE_URL}/search/person?api_key=${API_KEY}&query=${encodeURIComponent(query)}&language=ru-RU&page=${page}`,
			{ next: { revalidate: 1800 } }
		);
		const data = await res.json();
		return (data.results || []) as Person[];
	} catch (e) {
		console.error("searchPeople error:", e);
		return [];
	}
}

export async function getPersonDetails(id: number): Promise<{ details: any; credits: any } | null> {
	if (!id) return null;
	try {
		const [d, c] = await Promise.all([
			fetchWithRetry(`${API_BASE_URL}/person/${id}?api_key=${API_KEY}&language=ru-RU`, { next: { revalidate: 3600 } }),
			fetchWithRetry(`${API_BASE_URL}/person/${id}/combined_credits?api_key=${API_KEY}&language=ru-RU`, { next: { revalidate: 3600 } }),
		]);
		const details = await d.json();
		const credits = await c.json();
		return { details, credits };
	} catch (e) {
		console.error("getPersonDetails error:", e);
		return null;
	}
}

export function profileUrl(path: string | null, size = "w185") {
	if (!path) return null;
	const envBase = process.env.NEXT_PUBLIC_TMDB_PROFILE_BASE_URL || `/tmdb-img/${size}`;
	return `${envBase}${path}`;
}

// Franchise parts for the "Часть серии" block (belongs_to_collection on a movie).
export async function getCollection(id: number): Promise<{ name: string; parts: Movie[] } | null> {
	if (!id) return null;
	try {
		const r = await fetchWithRetry(
			`${API_BASE_URL}/collection/${id}?api_key=${API_KEY}&language=ru-RU`,
			{ next: { revalidate: 86400 } }
		);
		const data = await r.json();
		const parts = filterBlocked((data.parts || []) as Movie[], "movie")
			.sort((a: any, b: any) => (a.release_date || "").localeCompare(b.release_date || ""));
		return { name: data.name, parts };
	} catch (e) {
		console.error("getCollection error:", e);
		return null;
	}
}
