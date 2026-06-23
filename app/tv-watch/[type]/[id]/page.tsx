import { notFound } from "next/navigation";
import {
  getMovieDetails,
  getTVDetails,
  getImageUrl,
  getBackdropUrl,
} from "@/lib/tmdb";
import { TvWatch, type TvWatchMedia } from "@/components/tv/tv-watch";

// TV WebView watch + player page ("10-foot UI"). Standalone, D-pad navigable.
// Reuses the SAME TMDB fetchers + resolve machinery as the site player; the
// TV-specific player UI lives in components/tv/tv-watch.tsx.

export const metadata = {
  title: "SAPKEFLY KINO — Просмотр",
};

interface PageProps {
  params: Promise<{ type: string; id: string }>;
}

export default async function TvWatchPage({ params }: PageProps) {
  const { type, id } = await params;
  const numId = Number(id);
  if (!numId || (type !== "movie" && type !== "tv")) notFound();

  let media: TvWatchMedia;

  if (type === "movie") {
    const m = await getMovieDetails(numId);
    if (!m) notFound();
    media = {
      id: m.id,
      type: "movie",
      title: m.title,
      originalTitle: (m as { original_title?: string }).original_title || "",
      year: m.release_date ? m.release_date.slice(0, 4) : "",
      poster: m.poster_path ? getImageUrl(m.poster_path, "w500") : null,
      posterPath: m.poster_path || null,
      backdrop: m.backdrop_path ? getBackdropUrl(m.backdrop_path) : null,
      overview: m.overview || "",
      seasons: [],
    };
  } else {
    const s = await getTVDetails(numId);
    if (!s) notFound();
    media = {
      id: s.id,
      type: "tv",
      title: s.name,
      originalTitle: (s as { original_name?: string }).original_name || "",
      year: s.first_air_date ? s.first_air_date.slice(0, 4) : "",
      poster: s.poster_path ? getImageUrl(s.poster_path, "w500") : null,
      posterPath: s.poster_path || null,
      backdrop: s.backdrop_path ? getBackdropUrl(s.backdrop_path) : null,
      overview: s.overview || "",
      seasons: (s.seasons || []).map((sea) => ({
        season_number: sea.season_number,
        episode_count: sea.episode_count,
        name: sea.name,
      })),
    };
  }

  return <TvWatch media={media} />;
}
