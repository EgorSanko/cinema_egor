import { TvWatch, type TvWatchMedia } from "@/components/tv/tv-watch";
import { isBlockedHd } from "@/lib/blocked-content";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

// TV playback for HDRezka-native titles (no TMDB match). Mirrors the website's
// /hd/[token] page, but renders the D-pad TvWatch player, which resolves the
// stream by URL via /hdrezka/api/resolve (media.hdUrl) instead of by TMDB title.

const BACKEND = "https://kino.lead-seek.ru/hdrezka/api";

interface PageProps {
  params: Promise<{ token: string }>;
}

interface HdDetails {
  url: string;
  title: string;
  orig_title?: string;
  year?: number | null;
  poster?: string | null;
  description?: string;
  type: "movie" | "tv";
  seasons?: Record<string, number[]>;
}

function decodeToken(token: string): string {
  try {
    return Buffer.from(decodeURIComponent(token), "base64url").toString("utf-8");
  } catch {
    return "";
  }
}

// Stable pseudo-id from the HDRezka URL — TvWatch keys its resume/dub history by
// media.id, and HDRezka-native titles have no TMDB id.
function pseudoId(url: string): number {
  let h = 0;
  for (let i = 0; i < url.length; i++) h = (h * 31 + url.charCodeAt(i)) | 0;
  return Math.abs(h) || 1;
}

async function getDetails(url: string): Promise<HdDetails | null> {
  try {
    const r = await fetch(`${BACKEND}/details?url=${encodeURIComponent(url)}`, {
      next: { revalidate: 3600 },
    });
    const d = await r.json();
    if (!d || d.error || !d.title) return null;
    return d as HdDetails;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const url = decodeToken(token);
  const d = url ? await getDetails(url) : null;
  return { title: d ? `${d.title}${d.year ? ` (${d.year})` : ""}` : "sapkeflykino TV" };
}

export default async function TvHdPage({ params }: PageProps) {
  const { token } = await params;
  const url = decodeToken(token);
  if (!url || isBlockedHd(url)) notFound();

  const d = await getDetails(url);
  if (!d || isBlockedHd(url, d.title)) notFound();

  const seasons = Object.entries(d.seasons || {})
    .map(([k, eps]) => ({
      season_number: Number(k),
      episode_count: Array.isArray(eps) ? eps.length : 0,
      name: `Сезон ${k}`,
    }))
    .filter((s) => !isNaN(s.season_number))
    .sort((a, b) => a.season_number - b.season_number);

  const media: TvWatchMedia = {
    id: pseudoId(url),
    type: d.type,
    title: d.title,
    originalTitle: d.orig_title || "",
    year: d.year ? String(d.year) : "",
    poster: d.poster || null,
    posterPath: null,
    backdrop: null,
    overview: d.description || "",
    seasons,
    hdUrl: url,
  };

  return <TvWatch media={media} />;
}
