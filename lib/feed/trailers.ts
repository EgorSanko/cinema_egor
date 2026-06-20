// Resolve a YouTube trailer key for a movie via TMDB /movie/{id}/videos.
// ru-RU often has no videos, so we fall back to en-US (where the official
// trailer almost always lives). Cached a day.
const API_BASE_URL = process.env.NEXT_PUBLIC_TMDB_BASE_URL;
const API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;

export async function resolveTrailerKey(movieId: number): Promise<string | null> {
  if (!API_BASE_URL || !API_KEY || !movieId) return null;
  try {
    for (const lang of ["ru-RU", "en-US"]) {
      const res = await fetch(
        `${API_BASE_URL}/movie/${movieId}/videos?api_key=${API_KEY}&language=${lang}`,
        { next: { revalidate: 86400 } }
      );
      if (!res.ok) continue;
      const data = await res.json();
      const vids = ((data.results as any[]) || []).filter(
        (v) => v.site === "YouTube" && v.key
      );
      if (!vids.length) continue;
      const pick =
        vids.find((v) => v.type === "Trailer" && v.official) ||
        vids.find((v) => v.type === "Trailer") ||
        vids.find((v) => v.type === "Teaser") ||
        vids[0];
      if (pick?.key) return pick.key as string;
    }
    return null;
  } catch {
    return null;
  }
}

/** Resolve trailer keys for many movies in parallel, keeping only those that
    actually have an embeddable YouTube trailer. */
export async function resolveTrailers<T extends { id: number }>(
  movies: T[]
): Promise<Array<T & { ytKey: string }>> {
  const settled = await Promise.all(
    movies.map(async (m) => {
      const ytKey = await resolveTrailerKey(m.id);
      return ytKey ? { ...m, ytKey } : null;
    })
  );
  return settled.filter(Boolean) as Array<T & { ytKey: string }>;
}
