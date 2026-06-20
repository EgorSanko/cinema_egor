import { NextRequest, NextResponse } from "next/server";
import {
  getTrendingMovies, getPopularMovies, getMoviesByGenre, type Movie,
} from "@/lib/tmdb";
import { resolveTrailers } from "@/lib/feed/trailers";
import { scoreItem, diversify } from "@/lib/feed/features";
import { cfBoost } from "@/lib/feed/cooc";
import type { FeedRequest, FeedTrailer, TasteVector } from "@/lib/feed/types";

const CF_WEIGHT = 0.6; // how much "похожим зашло" nudges the content ranking

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const decadeOf = (date?: string): number => {
  const y = date ? new Date(date).getFullYear() : 0;
  return y ? Math.floor(y / 10) * 10 : 0;
};

// Top genres the user currently likes (positive taste weight), best first.
function topGenres(taste: TasteVector | null, k: number): number[] {
  if (!taste) return [];
  return Object.entries(taste.genres)
    .filter(([, w]) => w > 0.05)
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([g]) => Number(g));
}

const rndPage = () => 1 + Math.floor(Math.random() * 5);

export async function POST(req: NextRequest) {
  let body: FeedRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ items: [] } as { items: FeedTrailer[] });
  }
  const taste = body.taste ?? null;
  const seen = new Set<number>(body.seen || []);
  const positives = (body.positives || []).map(Number).filter(Boolean);
  const n = Math.min(Math.max(body.n || 8, 1), 12);
  const rank = (it: FeedTrailer) => scoreItem(taste, it) + CF_WEIGHT * cfBoost(it.movieId, positives);

  // Candidate pool: trending + popular for breadth, plus the user's favourite
  // genres so the feed leans into learned taste. Random pages add variety so a
  // refresh/next-batch doesn't repeat the same titles.
  const sources: Promise<Movie[]>[] = [
    getTrendingMovies("week"),
    getPopularMovies(),
  ];
  for (const g of topGenres(taste, 2)) sources.push(getMoviesByGenre(g, rndPage()));
  // A wildcard genre keeps exploration alive even once taste is strong.
  sources.push(getMoviesByGenre([28, 35, 18, 878, 12, 16][Math.floor(Math.random() * 6)], rndPage()));

  const pools = await Promise.all(sources.map((p) => p.catch(() => [] as Movie[])));

  // Merge, dedupe, drop already-seen and trailerless-prone (no poster).
  const byId = new Map<number, Movie>();
  for (const pool of pools) {
    for (const m of pool) {
      if (!m?.id || seen.has(m.id) || byId.has(m.id) || !m.poster_path) continue;
      byId.set(m.id, m);
    }
  }
  // Bound TMDB video lookups: pre-rank by a cheap taste score, take the best ~24.
  const candidates = Array.from(byId.values());
  const prelim: FeedTrailer[] = candidates.map((m) => ({
    movieId: m.id,
    title: m.title || "",
    year: m.release_date ? String(new Date(m.release_date).getFullYear()) : "",
    poster: m.poster_path || null,
    overview: m.overview || "",
    voteAverage: m.vote_average || 0,
    genreIds: m.genre_ids || [],
    decade: decadeOf(m.release_date),
    ytKey: "",
  }));
  prelim.sort((a, b) => rank(b) - rank(a));
  const shortlist = prelim.slice(0, 24);

  // Resolve real trailer keys (parallel); keep only movies that have one.
  const withTrailers = await resolveTrailers(
    shortlist.map((it) => ({ id: it.movieId, it }))
  );
  let items: FeedTrailer[] = withTrailers.map(({ it, ytKey }) => ({ ...it, ytKey }));

  // Final taste + collaborative ranking, then diversity interspersing.
  items.sort((a, b) => rank(b) - rank(a));
  items = diversify(items).slice(0, n);

  return NextResponse.json({ items } as { items: FeedTrailer[] });
}
