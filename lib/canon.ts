/**
 * Top 5 personal canon — Letterboxd-style "Four Favourites" (we go 5).
 * User-curated picks shown on profile + included in sync payload.
 *
 * Stored in localStorage as a slim array (just id+type+title+poster) so
 * we don't need to refetch from TMDB to render. Keyed differently per
 * user via the sync layer that handles auth.
 */

import { getFavorites, getHistory } from "./storage";

export interface CanonPick {
  id: number;
  type: "movie" | "tv";
  title: string;
  poster_path: string | null;
}

const KEY = "kino_canon_v1";

export function getCanon(): CanonPick[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.slice(0, 5) : [];
  } catch { return []; }
}

export function setCanon(picks: CanonPick[]): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(KEY, JSON.stringify(picks.slice(0, 5))); } catch {}
  try { window.dispatchEvent(new Event("canon-changed")); } catch {}
}

/**
 * Source pool for the picker — combines favorites + history, deduped,
 * sorted by "engagement" (favorited > watched once).
 */
export function getCanonCandidates(): CanonPick[] {
  const favs = getFavorites();
  const hist = getHistory();
  const seen = new Set<string>();
  const out: CanonPick[] = [];
  for (const f of favs) {
    const key = `${f.type}-${f.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: f.id, type: f.type, title: f.title, poster_path: f.poster_path });
  }
  for (const h of hist) {
    const key = `${h.type}-${h.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: h.id, type: h.type, title: h.title, poster_path: h.poster_path });
  }
  return out;
}
