import { searchMovies, searchTV } from "@/lib/tmdb";
import { isBlockedHd } from "@/lib/blocked-content";

// ── Unified HDRezka-driven search ────────────────────────────────────────────
// Single source of truth for BOTH the website (/search) and the TV app
// (components/tv/tv-search). HDRezka is the source of availability — everything
// returned is actually playable. Each HDRezka hit is matched to a TMDB entry for
// a rich card; hits with no TMDB match become an HDRezka-native item (token →
// /hd/[token] on the web, /tv-hd/[token] on TV). Keeping this in one place is
// why TV search now matches the site instead of "under-delivering".

const HDREZKA_FIND = "https://kino.lead-seek.ru/hdrezka/api/find";

export interface HdHit {
  name: string;
  year: number | null;
  type: "movie" | "tv";
  url: string;
  poster: string | null;
}

export type UnifiedItem =
  | { kind: "tmdb"; mt: "movie" | "tv"; obj: any }
  | { kind: "hd"; hit: HdHit; token: string };

function normTitle(s?: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9а-яё]/gi, "");
}

function dedupeById<T extends { id: number }>(items: T[]): T[] {
  const seen = new Set<number>();
  return items.filter((it) => (seen.has(it.id) ? false : (seen.add(it.id), true)));
}

async function getHdrezkaHits(query: string): Promise<HdHit[]> {
  try {
    const res = await fetch(`${HDREZKA_FIND}?q=${encodeURIComponent(query)}`, {
      next: { revalidate: 300 },
    });
    const data = await res.json();
    return Array.isArray(data?.results) ? data.results : [];
  } catch {
    return [];
  }
}

// TMDB caps search at 20/page; pull several pages so matching isn't starved.
async function searchMoviesPaged(query: string, pages: number) {
  const res = await Promise.all(Array.from({ length: pages }, (_, i) => searchMovies(query, i + 1)));
  return dedupeById(res.flat());
}
async function searchTVPaged(query: string, pages: number) {
  const res = await Promise.all(Array.from({ length: pages }, (_, i) => searchTV(query, i + 1)));
  return dedupeById(res.flat());
}

type TmdbCand = { obj: any; mt: "movie" | "tv" };

// Find a TMDB entry whose title (ru/original, either side containing the other)
// and year (±1) match the HDRezka hit.
function matchTmdb(hit: HdHit, pool: TmdbCand[]): TmdbCand | null {
  const hn = normTitle(hit.name);
  if (!hn) return null;
  const hy = hit.year;
  for (const cand of pool) {
    const t = cand.obj;
    const titles = [t.title, t.name, t.original_title, t.original_name].map(normTitle).filter(Boolean);
    const titleMatch = titles.some((x: string) => x === hn || x.includes(hn) || hn.includes(x));
    if (!titleMatch) continue;
    const ty = parseInt((t.release_date || t.first_air_date || "").slice(0, 4), 10) || null;
    if (hy && ty && Math.abs(hy - ty) > 1) continue;
    return cand;
  }
  return null;
}

export function tokenFor(url: string): string {
  return Buffer.from(url).toString("base64url");
}

/**
 * HDRezka-driven search shared by the site and the TV app. Returns movies/series
 * split into unified items (TMDB-matched rich card OR HDRezka-native token card).
 * Pages: 5 movie + 3 TV pages of TMDB, same depth the website uses.
 */
export async function searchUnified(
  query: string,
  moviePages = 5,
  tvPages = 3
): Promise<{ movies: UnifiedItem[]; tv: UnifiedItem[] }> {
  const q = query.trim();
  if (!q) return { movies: [], tv: [] };

  const [movieResults, tvResults, hdHits] = await Promise.all([
    searchMoviesPaged(q, moviePages),
    searchTVPaged(q, tvPages),
    getHdrezkaHits(q),
  ]);

  const movies: UnifiedItem[] = [];
  const tv: UnifiedItem[] = [];

  if (hdHits.length > 0) {
    // HDRezka drives the result set — only actually-available titles are shown.
    const pool: TmdbCand[] = [
      ...movieResults.map((m: any) => ({ obj: m, mt: "movie" as const })),
      ...tvResults.map((t: any) => ({ obj: t, mt: "tv" as const })),
    ];
    const usedTmdb = new Set<string>();
    const seenUrl = new Set<string>();
    for (const hit of hdHits) {
      if (!hit.url || seenUrl.has(hit.url)) continue;
      seenUrl.add(hit.url);
      if (isBlockedHd(hit.url, hit.name)) continue; // legal takedown

      const match = matchTmdb(hit, pool);
      const key = match ? match.mt + ":" + match.obj.id : "";
      if (match && !usedTmdb.has(key)) {
        usedTmdb.add(key);
        (match.mt === "tv" ? tv : movies).push({ kind: "tmdb", mt: match.mt, obj: match.obj });
      } else {
        // No TMDB match, or a distinct HDRezka title that fuzzy-collided with an
        // already-shown TMDB entry → keep it as its own HDRezka-native card.
        (hit.type === "tv" ? tv : movies).push({ kind: "hd", hit, token: tokenFor(hit.url) });
      }
    }
  } else {
    // Availability backend unreachable — degrade to plain TMDB so search still works.
    movieResults.forEach((m: any) => movies.push({ kind: "tmdb", mt: "movie", obj: m }));
    tvResults.forEach((t: any) => tv.push({ kind: "tmdb", mt: "tv", obj: t }));
  }

  return { movies, tv };
}
