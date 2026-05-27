"use client";

import { fetchPopularMoviesAction } from "@/app/actions";
import { Spinner } from "@/components/ui/spinner";
import type { Movie } from "@/lib/tmdb";
import { useCallback, useEffect, useRef, useState } from "react";
import { MovieCard } from "./movie-card";

interface InfiniteScrollMoviesProps {
  initialMovies: Movie[];
}

// Snapshot home/popular feed + scroll so back-nav from a movie detail
// returns the user to the same poster they tapped.
type Snapshot = { movies: Movie[]; page: number; hasMore: boolean; scrollY: number; ts: number };
const STORAGE_KEY = "kino_grid_snap_popular";
const STALE_MS = 30 * 60 * 1000;

function readSnapshot(): Snapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw) as Snapshot;
    if (Date.now() - snap.ts > STALE_MS) return null;
    return snap;
  } catch { return null; }
}

function writeSnapshot(snap: Snapshot) {
  if (typeof window === "undefined") return;
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snap)); } catch {}
}

export function InfiniteScrollMovies({ initialMovies }: InfiniteScrollMoviesProps) {
  const snap = typeof window !== "undefined" ? readSnapshot() : null;
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
      writeSnapshot({
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
  }, []);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;

    setLoading(true);
    try {
      const newMovies = await fetchPopularMoviesAction(page);

      if (newMovies.length === 0) {
        setHasMore(false);
      } else {
        const uniqueNewMovies = newMovies.filter(
          (movie) => !movies.some((existing) => existing.id === movie.id)
        );

        if (uniqueNewMovies.length === 0 && newMovies.length > 0) {
          setPage((prev) => prev + 1);
        } else {
          setMovies((prev) => [...prev, ...uniqueNewMovies]);
          setPage((prev) => prev + 1);
        }
      }
    } catch (error) {
      console.error("Error loading more movies:", error);
    } finally {
      setLoading(false);
    }
  }, [page, loading, hasMore, movies]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => observer.disconnect();
  }, [loadMore]);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {movies.map((movie) => (
          <MovieCard
            key={movie.id}
            movie={movie}
          />
        ))}
      </div>

      {hasMore && (
        <div
          ref={observerTarget}
          className="flex justify-center py-8">
          {loading && <Spinner className="size-8" />}
        </div>
      )}
    </div>
  );
}
