import { HeroSection } from "@/components/hero-section";
import { InfiniteScrollMovies } from "@/components/infinite-scroll-movies";
import { MovieSection } from "@/components/movie-section";
import { TVSection } from "@/components/tv-section";
import { ContinueWatching } from "@/components/continue-watching";
import { Recommendations } from "@/components/recommendations";
import { Navbar } from "@/components/navbar";
import { TermsModal } from "@/components/terms-modal";
import {
  getLatestMovies,
  getPopularMovies,
  getTrendingMovies,
  getTrendingTV,
  getPopularTV,
} from "@/lib/tmdb";

export default async function Home() {
  const [trendingMovies, popularMovies, latestMovies, trendingTV, popularTV] = await Promise.all([
    getTrendingMovies("week"),
    getPopularMovies(),
    getLatestMovies(),
    getTrendingTV("week"),
    getPopularTV(),
  ]);

  return (
    <>
      <Navbar />
      <TermsModal />
      <main className="bg-background pb-20 sm:pb-0">
        {trendingMovies.length > 0 && (
          <HeroSection movies={trendingMovies.slice(0, 10)} />
        )}
        <div className="space-y-12 px-4 py-12 max-w-7xl mx-auto">
          <ContinueWatching />
          <Recommendations />
          <MovieSection title="Сейчас в тренде" movies={trendingMovies.slice(0, 12)} />
          <MovieSection title="Новинки" movies={latestMovies.slice(0, 12)} />
          {trendingTV.length > 0 && (
            <TVSection title="🔥 Популярные сериалы" shows={trendingTV.slice(0, 12)} />
          )}
          {popularTV.length > 0 && (
            <TVSection title="Сериалы в тренде" shows={popularTV.slice(0, 12)} />
          )}
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-foreground">Популярные фильмы</h2>
            <InfiniteScrollMovies initialMovies={popularMovies} />
          </div>
        </div>
      </main>
    </>
  );
}
