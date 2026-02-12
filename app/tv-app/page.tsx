// === КУДА ПОЛОЖИТЬ: app/tv-app/page.tsx ===
// Server component — загружает данные из TMDB и передаёт в TV-интерфейс
import { TVHome } from "@/components/tv-home";
import {
  getTrendingMovies,
  getPopularMovies,
  getLatestMovies,
  getTrendingTV,
  getPopularTV,
} from "@/lib/tmdb";

export default async function TVPage() {
  const [trendingMovies, popularMovies, latestMovies, trendingTV, popularTV] =
    await Promise.all([
      getTrendingMovies("week"),
      getPopularMovies(),
      getLatestMovies(),
      getTrendingTV("week"),
      getPopularTV(),
    ]);

  return (
    <TVHome
      trendingMovies={trendingMovies}
      popularMovies={popularMovies}
      latestMovies={latestMovies}
      trendingTV={trendingTV}
      popularTV={popularTV}
    />
  );
}
