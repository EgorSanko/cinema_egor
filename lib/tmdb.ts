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

		return response;
	} catch (error) {
		if (retries > 0) {
			console.warn(
				`вљ пёЏ Request failed, retrying... (${retries} attempts left). Error: ${error}`
			);
			await new Promise((resolve) => setTimeout(resolve, 1000));
			return fetchWithRetry(url, options, retries - 1);
		}
		console.error("вќЊ Fetch failed after retries:", error);
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

export async function searchMovies(query: string, page = 1) {
	if (!query.trim()) return [];
	try {
		const response = await fetchWithRetry(
			`${API_BASE_URL}/search/movie?api_key=${API_KEY}&query=${encodeURIComponent(
				query
			)}&language=ru-RU&page=${page}`,
			{ next: { revalidate: 300 } }
		);
		const data = await response.json();
		return filterBlocked(data.results as Movie[], "movie");
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
    const response = await fetchWithRetry(
      `${API_BASE_URL}/search/tv?api_key=${API_KEY}&query=${encodeURIComponent(query)}&language=ru-RU&page=${page}`,
      { next: { revalidate: 300 } }
    );
    const data = await response.json();
    return data.results as TVShow[];
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
