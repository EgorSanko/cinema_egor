import { HeroSection } from "@/components/hero-section";
import { InfiniteScrollMovies } from "@/components/infinite-scroll-movies";
import { MovieSection } from "@/components/movie-section";
import { TVSection } from "@/components/tv-section";
import { ContinueWatching } from "@/components/continue-watching";
import { Recommendations } from "@/components/recommendations";
import { CollectionsRow } from "@/components/collections-row";
import { MoodAndRoulette } from "@/components/mood-and-roulette";
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

  // Mix top trending TV + Movies for the hero carousel (cinematic backdrops for both)
  const heroItems: any[] = [];
  for (let i = 0; i < 6; i++) {
    if (trendingTV[i]) heroItems.push(trendingTV[i]);
    if (trendingMovies[i]) heroItems.push(trendingMovies[i]);
  }
  const heroSlice = heroItems.filter(x => x?.backdrop_path).slice(0, 8);

  return (
    <>
      <Navbar />
      <TermsModal />
      <main className="bg-background pb-20 sm:pb-0">
        {heroSlice.length > 0 && <HeroSection movies={heroSlice} />}
        <div className="space-y-12 px-4 sm:px-6 lg:px-8 py-12 max-w-[1600px] mx-auto">
          <ContinueWatching />
          <MoodAndRoulette />
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
