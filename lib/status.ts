/**
 * Watch status tracking per title — Letterboxd/Trakt-style.
 * Three buckets:
 *   - "want"    : Хочу посмотреть
 *   - "watching": Смотрю (только TV)
 *   - "watched" : Просмотрел
 *
 * Stored locally + synced via /api/sync alongside favorites/history.
 */

export type WatchStatus = "want" | "watching" | "watched";

interface StatusEntry {
  id: number;
  type: "movie" | "tv";
  status: WatchStatus;
  title: string;
  poster_path: string | null;
  vote_average?: number;
  updatedAt: number;
}

const KEY = "kino_status_v1";

function read(): Record<string, StatusEntry> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; }
}
function write(map: Record<string, StatusEntry>) {
  try { localStorage.setItem(KEY, JSON.stringify(map)); } catch {}
  try { window.dispatchEvent(new Event("status-changed")); } catch {}
}

function key(type: string, id: number) { return `${type}-${id}`; }

export function getStatus(type: "movie" | "tv", id: number): WatchStatus | null {
  return read()[key(type, id)]?.status ?? null;
}

export function setStatus(
  type: "movie" | "tv",
  id: number,
  status: WatchStatus | null,
  meta: { title: string; poster_path: string | null; vote_average?: number }
) {
  const map = read();
  const k = key(type, id);
  if (status === null) {
    delete map[k];
  } else {
    map[k] = { id, type, status, title: meta.title, poster_path: meta.poster_path, vote_average: meta.vote_average, updatedAt: Date.now() };
  }
  write(map);
}

export function getAllByStatus(status: WatchStatus): StatusEntry[] {
  return Object.values(read())
    .filter(e => e.status === status)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getAllStatuses(): Record<string, StatusEntry> {
  return read();
}

export function applyServerStatuses(serverMap: Record<string, StatusEntry> | undefined) {
  if (!serverMap || typeof serverMap !== "object") return;
  // Merge by updatedAt — keep newest
  const local = read();
  for (const [k, v] of Object.entries(serverMap)) {
    const cur = local[k];
    if (!cur || (v.updatedAt || 0) > (cur.updatedAt || 0)) local[k] = v;
  }
  try { localStorage.setItem(KEY, JSON.stringify(local)); } catch {}
}
