/**
 * Registry of TMDB IDs we are legally required to block from the app
 * (mirrors the web side `movie/lib/blocked-content.ts`).
 *
 * Entries are added when the hosting provider escalates an RKN takedown
 * notice. The detail screen must refuse to render, and listings must drop
 * the entry so it doesn't surface in search/browse.
 *
 * Keep this list short and document each entry with the date + reason.
 */

export const BLOCKED_MOVIE_IDS = new Set<number>([
  // 2026-05-27 — RKN notice via hosting: "Бой со зверем" / Beast (2026)
  1292415,
  // 2026-06-02 — RKN notice via Timeweb ticket #12048565: movie/1083381
  1083381,
  // 2026-06-09 — RKN notice via Timeweb ticket #12080021: movie/128 «Принцесса Мононоке» (1997)
  128,
  // 2026-07-01 — takedown notice #?: movie/1020047
  1020047,
]);

export const BLOCKED_TV_IDS = new Set<number>([]);

export const isBlockedMovie = (id: number) => BLOCKED_MOVIE_IDS.has(id);
export const isBlockedTV = (id: number) => BLOCKED_TV_IDS.has(id);

/** Generic helper for list responses: drops blocked entries in-place. */
export function filterBlocked<T extends { id: number }>(items: T[], type: "movie" | "tv"): T[] {
  const set = type === "movie" ? BLOCKED_MOVIE_IDS : BLOCKED_TV_IDS;
  if (set.size === 0) return items;
  return items.filter(i => !set.has(i.id));
}
