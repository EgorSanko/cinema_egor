"use client";

/**
 * Download history — what the user has downloaded.
 *
 * Stored in localStorage and synced to server via /api/sync. Used both
 * for the /downloads page (list of all downloads) and for the "Скачано"
 * badge on movie/TV cards so the user remembers which titles they've
 * already pulled.
 *
 * Tracking is best-effort: we record at the moment the browser begins
 * the download, not at completion. Real-world: 95%+ of started downloads
 * finish, and the user mostly wants "did I already grab this?" not "did
 * the bytes actually land". For finished-vs-interrupted distinction the
 * browser would have to call us back, which it doesn't.
 */

export interface DownloadEntry {
  id: number;            // TMDB id
  type: "movie" | "tv";
  title: string;
  poster_path: string | null;
  season?: number;
  episode?: number;
  episodeName?: string;
  quality: string;       // e.g. "1080p"
  url: string;           // the actual mp4 url (signed, expires ~24h)
  downloadedAt: number;
  release_date?: string;
  first_air_date?: string;
  translatorName?: string;
}

const KEY = "kino_downloads_v1";

export function getDownloads(): DownloadEntry[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}

/** Add a download. Dedupes by (id, type, season, episode, quality) — re-downloading
 *  the same item just bumps the timestamp instead of cluttering history. */
export function addDownload(entry: Omit<DownloadEntry, "downloadedAt">): void {
  const all = getDownloads();
  const sameKey = (a: DownloadEntry, b: typeof entry) =>
    a.id === b.id && a.type === b.type
    && (a.season ?? null) === (b.season ?? null)
    && (a.episode ?? null) === (b.episode ?? null)
    && a.quality === b.quality;
  const filtered = all.filter(d => !sameKey(d, entry));
  filtered.unshift({ ...entry, downloadedAt: Date.now() });
  try {
    localStorage.setItem(KEY, JSON.stringify(filtered.slice(0, 500)));
    window.dispatchEvent(new CustomEvent("downloads-changed"));
  } catch {}
  // Best-effort sync to server — the existing scheduler picks this up
  // via /api/sync since downloads array will be included.
  try {
    const event = new CustomEvent("kino-sync-now");
    window.dispatchEvent(event);
  } catch {}
}

/** Returns the highest-quality download for a (id, type) tuple, or null. */
export function hasDownloaded(id: number, type: "movie" | "tv", season?: number, episode?: number): DownloadEntry | null {
  const all = getDownloads();
  const matches = all.filter(d =>
    d.id === id && d.type === type
    && (season === undefined || d.season === season)
    && (episode === undefined || d.episode === episode)
  );
  if (matches.length === 0) return null;
  // Prefer highest quality
  const rank = (q: string) => parseInt(q) || 0;
  matches.sort((a, b) => rank(b.quality) - rank(a.quality));
  return matches[0];
}

export function deleteDownload(id: number, type: "movie" | "tv", season?: number, episode?: number, quality?: string): void {
  const all = getDownloads();
  const filtered = all.filter(d => !(
    d.id === id && d.type === type
    && (season === undefined || d.season === season)
    && (episode === undefined || d.episode === episode)
    && (quality === undefined || d.quality === quality)
  ));
  try {
    localStorage.setItem(KEY, JSON.stringify(filtered));
    window.dispatchEvent(new CustomEvent("downloads-changed"));
  } catch {}
}

export function clearAllDownloads(): void {
  try {
    localStorage.removeItem(KEY);
    window.dispatchEvent(new CustomEvent("downloads-changed"));
  } catch {}
}

/** Build a nice filename for the saved file. Browsers respect `<a download>`
 *  only for same-origin URLs — for cross-origin (HDRezka CDN) we set it
 *  anyway, some browsers honour it, others use whatever the server sends. */
export function buildFilename(entry: Omit<DownloadEntry, "downloadedAt" | "url">): string {
  const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "").trim();
  const year = entry.release_date || entry.first_air_date
    ? new Date((entry.release_date || entry.first_air_date) as string).getFullYear()
    : "";
  if (entry.type === "tv" && entry.season != null && entry.episode != null) {
    const s = String(entry.season).padStart(2, "0");
    const e = String(entry.episode).padStart(2, "0");
    return safe(`${entry.title} S${s}E${e} [${entry.quality}].mp4`);
  }
  return safe(`${entry.title}${year ? ` (${year})` : ""} [${entry.quality}].mp4`);
}

/** Trigger the browser download. Uses `<a download>` for desktop and falls
 *  back to a new tab on iOS (Safari ignores `download` attribute for
 *  cross-origin URLs and just navigates instead, which interrupts playback). */
export function triggerBrowserDownload(url: string, filename: string): void {
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (isIOS) {
    // iOS will navigate to the URL; user then long-presses → Download
    window.open(url, "_blank");
    return;
  }
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => a.remove(), 1000);
}
