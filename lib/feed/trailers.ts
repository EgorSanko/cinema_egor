// Resolve a YouTube trailer key for a movie via TMDB /movie/{id}/videos.
// ru-RU often has no videos, so we fall back to en-US (where the official
// trailer almost always lives). Cached a day.
const API_BASE_URL = process.env.NEXT_PUBLIC_TMDB_BASE_URL;
const API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;

// Is a YouTube video actually playable (not private / deleted / access-
// restricted)? oEmbed returns non-200 for those, so it filters out the
// "Это видео с ограниченным доступом" trailers before they reach the feed.
// (Age-restricted / embedding-disabled still return 200 here — those are
// caught client-side via the IFrame onError auto-skip.)
async function isPlayable(key: string): Promise<boolean> {
  try {
    const r = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${key}&format=json`,
      { next: { revalidate: 86400 } }
    );
    return r.ok;
  } catch {
    return false;
  }
}

export async function resolveTrailerKey(movieId: number): Promise<string | null> {
  if (!API_BASE_URL || !API_KEY || !movieId) return null;
  try {
    // Pull BOTH locales and merge — TMDB sometimes lists a Russian video only
    // under the en-US query.
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

    // RUSSIAN ONLY — drop the movie entirely if it has no Russian-language
    // YouTube video (iso_639_1 === "ru").
    const isRu = (v: any) => v.iso_639_1 === "ru";
    const trailer = (v: any) => v.type === "Trailer";
    const teaser = (v: any) => v.type === "Teaser";
    const ruCandidates = [
      ...all.filter((v) => isRu(v) && trailer(v) && v.official),
      ...all.filter((v) => isRu(v) && trailer(v) && !v.official),
      ...all.filter((v) => isRu(v) && teaser(v)),
      ...all.filter((v) => isRu(v) && !trailer(v) && !teaser(v)),
    ];
    if (!ruCandidates.length) return null;

    // Return the first Russian trailer that is actually playable.
    for (const v of ruCandidates) {
      if (await isPlayable(v.key)) return v.key as string;
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
