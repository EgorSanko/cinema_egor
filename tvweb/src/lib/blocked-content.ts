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
  // 2026-06-25 — copyright claim via Beget (ООО "Исола Динамикс" for ООО "РВВ Филм"):
  // movie/1020047 «Кодекс Данте» / In the Hand of Dante (2025)
  1020047,
  // 2026-06-30 — copyright claim via Beget (ООО "Исола Динамикс" for ООО "Экспонента Фильм"):
  // movie/1284016 «Это хит!» / Power Ballad (2026) — the only OUR url cited in the notice
  1284016,
  // 2026-07-01 — copyright claim via Beget (ООО "Исола Динамикс" / isola-dynamics.com):
  // movie/1279493 «Ночной бизнес» / The Get Out (2026) — cited OUR url in the notice
  1279493,
  // 2026-07-21 — takedown notice #12330615: movie/1212763
  1212763,
]);

export const BLOCKED_TV_IDS = new Set<number>([]);

/**
 * HDRezka-native blocks. Titles reachable via /hd/[token] resolve by HDRezka URL,
 * not a TMDB id, so the id sets above don't cover them. Match by URL slug (the
 * mirror HOST changes, but the numeric-id + slug are stable) and by normalized
 * title as a backstop.
 */
export const BLOCKED_HD_SLUGS: string[] = [
  // 2026-06-25 — copyright claim via Beget (ООО "Исола Динамикс" / ООО "РВВ Филм"):
  // «Кодекс Данте» / In the Hand of Dante (2025)
  "kodeks-dante-2025",
  // 2026-06-30 — copyright claim via Beget (ООО "Исола Динамикс" / ООО "Экспонента Фильм"):
  // «Это хит!» / Power Ballad (2026) — hdrezka …/90004-eto-hit-2026.html
  "eto-hit-2026",
];
const BLOCKED_HD_TITLES: string[] = [
  "кодексданте",
  "этохит",
];

export function isBlockedHd(url?: string | null, title?: string | null): boolean {
  const u = (url || "").toLowerCase();
  if (BLOCKED_HD_SLUGS.some((s) => u.includes(s))) return true;
  const t = (title || "").toLowerCase().replace(/[^a-z0-9а-яё]/gi, "");
  if (t && BLOCKED_HD_TITLES.some((b) => t === b || t.includes(b))) return true;
  return false;
}

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
