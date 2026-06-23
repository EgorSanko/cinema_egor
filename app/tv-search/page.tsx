import { TvSearch } from "@/components/tv/tv-search";

// TV WebView search screen ("10-foot UI"). Standalone, D-pad navigable.
// All TMDB access happens through the existing server actions
// (fetchMoviesBySearchAction / fetchTVBySearchAction) so no TMDB key is
// ever shipped to the client.
// NOTE: lives at /tv-search to sit alongside /tv-home and /tv-watch.

export const metadata = {
  title: "Поиск — SAPKEFLY KINO TV",
};

export default function TvSearchPage() {
  return <TvSearch />;
}
