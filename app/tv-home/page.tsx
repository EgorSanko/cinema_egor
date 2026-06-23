import {
  getLatestMovies,
  getPopularMovies,
  getTrendingMovies,
  getTrendingTV,
  getPopularTV,
  getImageUrl,
  type Movie,
  type TVShow,
} from "@/lib/tmdb";
import { TvHome, type TvCard, type TvRail } from "@/components/tv/tv-home";

// TV WebView home screen ("10-foot UI"). Standalone, D-pad navigable.
// Reuses the EXACT same server-side TMDB fetchers as app/page.tsx so there
// is no duplicated data layer and no new TMDB key.
// NOTE: lives at /tv-home because /tv is already the "Сериалы" listing page.

export const metadata = {
  title: "SAPKEFLY KINO — TV",
};

function movieToCard(m: Movie): TvCard {
  return {
    id: m.id,
    type: "movie",
    title: m.title,
    year: m.release_date ? m.release_date.slice(0, 4) : "",
    poster: getImageUrl(m.poster_path, "w500"),
  };
}

function tvToCard(t: TVShow): TvCard {
  return {
    id: t.id,
    type: "tv",
    title: t.name,
    year: t.first_air_date ? t.first_air_date.slice(0, 4) : "",
    poster: getImageUrl(t.poster_path, "w500"),
  };
}

export default async function TvHomePage() {
  const [trendingMovies, popularMovies, latestMovies, trendingTV, popularTV] =
    await Promise.all([
      getTrendingMovies("week"),
      getPopularMovies(),
      getLatestMovies(),
      getTrendingTV("week"),
      getPopularTV(),
    ]);

  // Rails mirror the titles the existing home (app/page.tsx) already uses.
  const rails: TvRail[] = [
    { title: "В тренде", cards: trendingMovies.slice(0, 18).map(movieToCard) },
    { title: "Новинки", cards: latestMovies.slice(0, 18).map(movieToCard) },
    {
      title: "Популярные сериалы",
      cards: trendingTV.slice(0, 18).map(tvToCard),
    },
    {
      title: "Высокий рейтинг",
      cards: [...popularMovies]
        .sort((a, b) => (b.vote_average ?? 0) - (a.vote_average ?? 0))
        .slice(0, 18)
        .map(movieToCard),
    },
    {
      title: "Сериалы в тренде",
      cards: popularTV.slice(0, 18).map(tvToCard),
    },
  ].filter((r) => r.cards.length > 0);

  return <TvHome rails={rails} />;
}
