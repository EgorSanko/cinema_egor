"use client";

import { fetchMoviesByGenreAction } from "@/app/actions";
import { Spinner } from "@/components/ui/spinner";
import type { Movie } from "@/lib/tmdb";
import { useCallback, useEffect, useRef, useState } from "react";
import { MovieCard } from "./movie-card";

interface InfiniteMovieGridProps {
  initialMovies: Movie[];
  genreId: number;
}

// Snapshot the user's scroll state so when they tap a movie and then back
// they land on the SAME poster, not at the top with only 20 movies loaded.
// Without this every back-nav forced them to re-scroll dozens of items.
type Snapshot = { movies: Movie[]; page: number; hasMore: boolean; scrollY: number; ts: number };
const STORAGE_KEY = (id: number) => `kino_grid_snap_genre_${id}`;
const STALE_MS = 30 * 60 * 1000; // 30 min

function readSnapshot(genreId: number): Snapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY(genreId));
    if (!raw) return null;
    const snap = JSON.parse(raw) as Snapshot;
    if (Date.now() - snap.ts > STALE_MS) return null;
    return snap;
  } catch { return null; }
}

function writeSnapshot(genreId: number, snap: Snapshot) {
  if (typeof window === "undefined") return;
  try { sessionStorage.setItem(STORAGE_KEY(genreId), JSON.stringify(snap)); } catch {}
}

export function InfiniteMovieGrid({ initialMovies, genreId }: InfiniteMovieGridProps) {
  const snap = typeof window !== "undefined" ? readSnapshot(genreId) : null;
  const [movies, setMovies] = useState<Movie[]>(snap?.movies ?? initialMovies);
  const [page, setPage] = useState(snap?.page ?? 2);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(snap?.hasMore ?? true);
  const observerTarget = useRef<HTMLDivElement>(null);
  const moviesRef = useRef(movies);
  const pageRef = useRef(page);
  const hasMoreRef = useRef(hasMore);

  // Keep refs in sync so the unload listener can capture the latest values
  // without re-binding every render (which would also re-run the listener).
  useEffect(() => { moviesRef.current = movies; }, [movies]);
  useEffect(() => { pageRef.current = page; }, [page]);
  useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);

  // Restore scroll position after the restored DOM has actually painted —
  // requesting on mount alone fires before browsers have laid out tall
  // images, so it lands short. Two RAFs covers the initial paint window.
  useEffect(() => {
    if (!snap) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => window.scrollTo(0, snap.scrollY));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist before leaving the page (link click, back, refresh). We also
  // checkpoint on visibility change so iOS Safari — which may not fire
  // pagehide reliably when the user swipes the page away — still gets a save.
  useEffect(() => {
    const save = () => {
      writeSnapshot(genreId, {
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
  }, [genreId]);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const newMovies = await fetchMoviesByGenreAction(genreId, page);
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
  }, [genreId, page, loading, hasMore, movies]);

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
          <p className="text-muted-foreground">В этом жанре фильмы не найдены.</p>
        </div>
      )}
      {hasMore && (
        <div ref={observerTarget} className="flex justify-center py-8">
          {loading && <Spinner className="size-8" />}
        </div>
      )}
    </div>
  );
}
