// Resolve a YouTube trailer key for a movie via TMDB /movie/{id}/videos.
// ru-RU often has no videos, so we fall back to en-US (where the official
// trailer almost always lives). Cached a day.
const API_BASE_URL = process.env.NEXT_PUBLIC_TMDB_BASE_URL;
const API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;

export async function resolveTrailerKey(movieId: number): Promise<string | null> {
  if (!API_BASE_URL || !API_KEY || !movieId) return null;
  try {
    // Pull BOTH locales and merge — TMDB sometimes lists a Russian video only
    // under the en-US query. Then strongly prefer ANY Russian-language video
    // over the English one, so the feed is Russian whenever a RU trailer exists
    // at all; English is used only when there's no Russian video.
    const [ru, en] = await Promise.all(
      ["ru-RU", "en-US"].map((lang) =>
        fetch(`${API_BASE_URL}/movie/${movieId}/videos?api_key=${API_KEY}&language=${lang}`, {
          next: { revalidate: 86400 },
        })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)
      )
    );

    const all: any[] = [];
    const seen = new Set<string>();
    for (const data of [ru, en]) {
      for (const v of ((data?.results as any[]) || [])) {
        if (v.site === "YouTube" && v.key && !seen.has(v.key)) {
          seen.add(v.key);
          all.push(v);
        }
      }
    }
    if (!all.length) return null;

    const isRu = (v: any) => v.iso_639_1 === "ru";
    const trailer = (v: any) => v.type === "Trailer";
    const teaser = (v: any) => v.type === "Teaser";
    const pick =
      all.find((v) => isRu(v) && trailer(v) && v.official) ||
      all.find((v) => isRu(v) && trailer(v)) ||
      all.find((v) => isRu(v) && teaser(v)) ||
      all.find((v) => isRu(v)) ||
      all.find((v) => trailer(v) && v.official) ||
      all.find((v) => trailer(v)) ||
      all.find((v) => teaser(v)) ||
      all[0];
    return (pick?.key as string) || null;
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
