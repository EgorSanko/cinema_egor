"use client";

import { fetchMoviesBySearchAction } from "@/app/actions";
import { Spinner } from "@/components/ui/spinner";
import type { Movie } from "@/lib/tmdb";
import { useCallback, useEffect, useRef, useState } from "react";
import { MovieCard } from "./movie-card";

interface InfiniteSearchGridProps {
  initialMovies: Movie[];
  query: string;
}

// Snapshot search results + scroll position so back-nav from a movie detail
// returns the user to where they were instead of resetting to top with only
// the first page of results.
type Snapshot = { movies: Movie[]; page: number; hasMore: boolean; scrollY: number; ts: number };
const STORAGE_KEY = (q: string) => `kino_grid_snap_search_${q}`;
const STALE_MS = 30 * 60 * 1000;

function readSnapshot(query: string): Snapshot | null {
  if (typeof window === "undefined" || !query) return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY(query));
    if (!raw) return null;
    const snap = JSON.parse(raw) as Snapshot;
    if (Date.now() - snap.ts > STALE_MS) return null;
    return snap;
  } catch { return null; }
}

function writeSnapshot(query: string, snap: Snapshot) {
  if (typeof window === "undefined" || !query) return;
  try { sessionStorage.setItem(STORAGE_KEY(query), JSON.stringify(snap)); } catch {}
}

export function InfiniteSearchGrid({ initialMovies, query }: InfiniteSearchGridProps) {
  const snap = typeof window !== "undefined" ? readSnapshot(query) : null;
  const [movies, setMovies] = useState<Movie[]>(snap?.movies ?? initialMovies);
  const [page, setPage] = useState(snap?.page ?? 2);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(snap?.hasMore ?? true);
  const observerTarget = useRef<HTMLDivElement>(null);
  const moviesRef = useRef(movies);
  const pageRef = useRef(page);
  const hasMoreRef = useRef(hasMore);

  useEffect(() => { moviesRef.current = movies; }, [movies]);
  useEffect(() => { pageRef.current = page; }, [page]);
  useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);

  useEffect(() => {
    if (!snap) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => window.scrollTo(0, snap.scrollY));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const save = () => {
      writeSnapshot(query, {
        movies: moviesRef.current,
        page: pageRef.current,
        hasMore: hasMoreRef.current,
        scrollY: window.scrollY,
        ts: Date.now(),
      });
    };
    window.addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", save);
    return () => {
      window.removeEventListener("pagehide", save);
      document.removeEventListener("visibilitychange", save);
      save();
    };
  }, [query]);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore || !query) return;
    setLoading(true);
    try {
      const newMovies = await fetchMoviesBySearchAction(query, page);
      if (newMovies.length === 0) { setHasMore(false); }
      else {
        const uniqueNewMovies = newMovies.filter(
          (movie) => !movies.some((existing) => existing.id === movie.id)
        );
        if (uniqueNewMovies.length === 0 && newMovies.length > 0) { setPage((prev) => prev + 1); }
        else { setMovies((prev) => [...prev, ...uniqueNewMovies]); setPage((prev) => prev + 1); }
      }
    } catch (error) { console.error("Error loading more movies:", error); }
    finally { setLoading(false); }
  }, [query, page, loading, hasMore, movies]);

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) loadMore();
    }, { threshold: 0.1 });
    if (observerTarget.current) observer.observe(observerTarget.current);
    return () => observer.disconnect();
  }, [loadMore]);

  return (
    <div className="space-y-8">
      {movies.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {movies.map((movie) => <MovieCard key={movie.id} movie={movie} />)}
        </div>
      ) : (
        <div className="text-center py-16">
          <p className="text-xl text-muted-foreground mb-4">
            {query ? "По вашему запросу ничего не найдено." : "Введите название фильма для поиска."}
          </p>
          {query && (
            <p className="text-sm text-muted-foreground">
              Попробуйте другое название или посмотрите популярные фильмы на главной странице.
            </p>
          )}
        </div>
      )}
      {hasMore && query && movies.length > 0 && (
        <div ref={observerTarget} className="flex justify-center py-8">
          {loading && <Spinner className="size-8" />}
        </div>
      )}
    </div>
  );
}
