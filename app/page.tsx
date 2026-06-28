import { HeroIntro } from "@/components/hero-intro";
import { InfiniteScrollMovies } from "@/components/infinite-scroll-movies";
import { MovieSection } from "@/components/movie-section";
import { TVSection } from "@/components/tv-section";
import { ContinueWatching } from "@/components/continue-watching";
import { Recommendations } from "@/components/recommendations";
import { CollectionsRow } from "@/components/collections-row";
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
        <HeroIntro movies={trendingMovies.slice(0, 8)} />
        <div className="space-y-16 px-4 sm:px-6 lg:px-8 py-14 max-w-[1600px] mx-auto">
          <ContinueWatching />
          <Recommendations />
          <MovieSection title="Сейчас в тренде" movies={trendingMovies.slice(0, 12)} />
          <CollectionsRow />
          <MovieSection title="Новинки" movies={latestMovies.slice(0, 12)} />
          {trendingTV.length > 0 && (
            <TVSection title="Популярные сериалы" shows={trendingTV.slice(0, 12)} />
          )}
          {popularTV.length > 0 && (
            <TVSection title="Сериалы в тренде" shows={popularTV.slice(0, 12)} />
          )}
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-foreground tracking-tight">Популярные фильмы</h2>
            <InfiniteScrollMovies initialMovies={popularMovies} />
          </div>
        </div>
      </main>
    </>
  );
}
