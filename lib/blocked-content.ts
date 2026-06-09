/**
 * Registry of TMDB IDs we are legally required to block from the site.
 *
 * Entries are added when we receive a takedown notice (e.g. via the hosting
 * provider's RKN escalation channel). We must:
 *   1. Make the detail page (/movie/[id] or /tv/[id]) un-viewable — `notFound()`
 *      so we return 404 from SSR and don't render the embed/Schema/comments.
 *   2. Strip the entry from every list response so users can't even discover
 *      it via search, genre browse, recommendations, or "similar movies".
 *
 * Why two layers: the detail page block is enough for the takedown notice
 * itself, but leaving the title in lists exposes the URL to crawlers and gives
 * RKN ammunition for "you're still distributing the link". Filtering at the
 * tmdb.ts boundary is cheap and covers every surface.
 *
 * Keep this list short and document each entry with the date + ticket so we
 * can re-evaluate (some takedowns expire or get overturned).
 */

export const BLOCKED_MOVIE_IDS = new Set<number>([
  // 2026-05-27 — RKN notice via hosting: "Бой со зверем" / Beast (2026)
  1292415,
  // 2026-06-02 — RKN notice via Timeweb ticket #12048565: movie/1083381
  1083381,
  // 2026-06-09 — RKN notice via Timeweb ticket #12080021: movie/128 «Принцесса Мононоке» (1997)
  128,
]);

export const BLOCKED_TV_IDS = new Set<number>([]);

export function isBlockedMovie(id: number): boolean {
  return BLOCKED_MOVIE_IDS.has(id);
}

export function isBlockedTV(id: number): boolean {
  return BLOCKED_TV_IDS.has(id);
}

/** Generic helper for list responses: drops blocked entries in-place. */
export function filterBlocked<T extends { id: number }>(items: T[], type: "movie" | "tv"): T[] {
  const set = type === "movie" ? BLOCKED_MOVIE_IDS : BLOCKED_TV_IDS;
  if (set.size === 0) return items;
  return items.filter(i => !set.has(i.id));
}
