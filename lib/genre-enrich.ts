/**
 * Backfill genre_ids for history items that don't have them (everything
 * watched before we started storing genre_ids per entry).
 *
 * Strategy:
 *  - Build a localStorage cache keyed by `${type}-${id}` → number[]
 *  - For each unique (type, id) in history missing genres, fetch TMDB
 *    via /tmdb-api/{type}/{id} (already proxied through our nginx)
 *  - Throttle to 4 in-flight requests so we don't hammer the proxy
 *  - Return an enriched history copy with genre_ids filled where possible
 *
 * The cache persists across sessions — next visit is instant for items
 * we've already seen.
 */

import type { HistoryItem } from "./storage";

const CACHE_KEY = "kino_genre_cache_v1";
const CONCURRENCY = 4;
const TMDB_API = "/tmdb-api";
const API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY || "275c9d09780aadb4b13ff57a731eda00";

type GenreCache = Record<string, number[]>;

function loadCache(): GenreCache {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}"); } catch { return {}; }
}

function saveCache(cache: GenreCache) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch {}
}

async function fetchOne(type: "movie" | "tv", id: number): Promise<number[]> {
  try {
    const res = await fetch(`${TMDB_API}/${type}/${id}?api_key=${API_KEY}&language=ru-RU`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.genres) ? data.genres.map((g: any) => g.id).filter((x: any) => typeof x === "number") : [];
  } catch {
    return [];
  }
}

/**
 * Enrich history items in place. Returns the same array (mutated copies)
 * with genre_ids filled where we could fetch them. Also returns a flag
 * indicating whether new data was fetched (so caller can re-render).
 */
export async function enrichHistoryWithGenres(history: HistoryItem[]): Promise<HistoryItem[]> {
  if (history.length === 0) return history;
  const cache = loadCache();

  // Find unique (type, id) pairs that we don't already know about
  const needed: { type: "movie" | "tv"; id: number; key: string }[] = [];
  const seen = new Set<string>();
  for (const h of history) {
    const key = `${h.type}-${h.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // Skip if item already has genres in its own field
    if (h.genre_ids && h.genre_ids.length > 0) {
      cache[key] = h.genre_ids;
      continue;
    }
    if (cache[key]) continue; // already cached
    needed.push({ type: h.type, id: h.id, key });
  }

  if (needed.length > 0) {
    // Throttled fetch: keep CONCURRENCY workers chugging through the queue
    const queue = [...needed];
    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (queue.length > 0) {
        const job = queue.shift();
        if (!job) break;
        const ids = await fetchOne(job.type, job.id);
        cache[job.key] = ids; // store empty array too — avoids re-fetching dead IDs
      }
    });
    await Promise.all(workers);
    saveCache(cache);
  }

  // Build enriched history (copy items, fill genre_ids from cache when missing)
  return history.map(h => {
    if (h.genre_ids && h.genre_ids.length > 0) return h;
    const cached = cache[`${h.type}-${h.id}`];
    if (cached && cached.length > 0) return { ...h, genre_ids: cached };
    return h;
  });
}
