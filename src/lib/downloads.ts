/**
 * Download tracking + native file download.
 *
 * Mirrors the web app's lib/downloads.ts in spirit: history is the source of
 * truth so the user can see what they grabbed and re-download. The download
 * itself goes through the web's /api/dl proxy so we inherit:
 *   - Proper Cyrillic filename via Content-Disposition (RFC 5987 UTF-8)
 *   - Same-origin auth/headers
 *   - Single code path to maintain
 *
 * After download completes, expo-sharing opens the system "Save to..." sheet
 * so the user can drop the file in Downloads, send it to Telegram, etc.
 * That sheet is friendlier than asking for MediaLibrary permissions and works
 * uniformly across Android 11/12/13/14.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
// expo-file-system v19 moved the legacy `cacheDirectory` + `createDownloadResumable`
// API to a subpath. The new API (Paths/File/Directory) doesn't have a clean
// resumable-with-progress path yet, so legacy is the right tool here.
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

const KEY = "kino_downloads_v1";
const PROXY_BASE = "https://sapkeflykino.ru/api/dl";

export interface DownloadEntry {
  id: number;
  type: "movie" | "tv";
  title: string;
  poster_path: string | null;
  season?: number;
  episode?: number;
  episodeName?: string;
  quality: string;
  url: string;
  downloadedAt: number;
  release_date?: string;
  first_air_date?: string;
  translatorName?: string;
}

export async function getDownloads(): Promise<DownloadEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function addDownload(entry: Omit<DownloadEntry, "downloadedAt">): Promise<void> {
  const all = await getDownloads();
  const sameKey = (a: DownloadEntry) =>
    a.id === entry.id && a.type === entry.type
    && (a.season ?? null) === (entry.season ?? null)
    && (a.episode ?? null) === (entry.episode ?? null)
    && a.quality === entry.quality;
  const filtered = all.filter(d => !sameKey(d));
  filtered.unshift({ ...entry, downloadedAt: Date.now() });
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(filtered.slice(0, 500)));
  } catch {}
}

export async function deleteDownload(
  id: number, type: "movie" | "tv", season?: number, episode?: number, quality?: string,
): Promise<void> {
  const all = await getDownloads();
  const filtered = all.filter(d => !(
    d.id === id && d.type === type
    && (season === undefined || d.season === season)
    && (episode === undefined || d.episode === episode)
    && (quality === undefined || d.quality === quality)
  ));
  try { await AsyncStorage.setItem(KEY, JSON.stringify(filtered)); } catch {}
}

export async function clearAllDownloads(): Promise<void> {
  try { await AsyncStorage.removeItem(KEY); } catch {}
}

export function buildFilename(entry: Omit<DownloadEntry, "downloadedAt" | "url">): string {
  const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "").trim();
  const year = (entry.release_date || entry.first_air_date)
    ? new Date(entry.release_date || entry.first_air_date as string).getFullYear()
    : "";
  if (entry.type === "tv" && entry.season != null && entry.episode != null) {
    const s = String(entry.season).padStart(2, "0");
    const e = String(entry.episode).padStart(2, "0");
    return safe(`${entry.title} S${s}E${e} [${entry.quality}].mp4`);
  }
  return safe(`${entry.title}${year ? ` (${year})` : ""} [${entry.quality}].mp4`);
}

/** Build the same-origin web proxy URL. Server adds UTF-8 Content-Disposition. */
export function toProxyUrl(streamUrl: string, filename: string): string {
  // Strip the :hls:manifest.m3u8 suffix to get the raw mp4
  const raw = streamUrl.replace(/:hls:manifest\.m3u8$/i, "");
  return `${PROXY_BASE}?url=${encodeURIComponent(raw)}&name=${encodeURIComponent(filename)}`;
}

export type ProgressCb = (fraction: number, bytesWritten: number, totalBytes: number) => void;

/**
 * Download to a temp file in the app cache, then hand off to the system share
 * sheet so the user can drop it in Downloads, Telegram, etc.
 *
 * Returns the local file URI on success. The temp file lives in cacheDirectory
 * and the OS can evict it under storage pressure — by then the user has
 * already moved it via Sharing.
 */
export async function downloadToDevice(
  proxyUrl: string,
  filename: string,
  onProgress?: ProgressCb,
): Promise<string> {
  if (Platform.OS === "web") {
    throw new Error("Web platform: use the browser <a download> path");
  }
  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) throw new Error("No cache directory available");
  const dir = `${cacheDir}downloads/`;
  try { await FileSystem.makeDirectoryAsync(dir, { intermediates: true }); } catch {}
  const target = `${dir}${filename}`;

  // Delete any leftover from a previous attempt — createDownloadResumable
  // will resume only if size matches and we trust the file is good.
  try { await FileSystem.deleteAsync(target, { idempotent: true }); } catch {}

  const resumable = FileSystem.createDownloadResumable(
    proxyUrl,
    target,
    {},
    (progress) => {
      if (onProgress && progress.totalBytesExpectedToWrite > 0) {
        onProgress(
          progress.totalBytesWritten / progress.totalBytesExpectedToWrite,
          progress.totalBytesWritten,
          progress.totalBytesExpectedToWrite,
        );
      }
    },
  );
  const result = await resumable.downloadAsync();
  if (!result?.uri) throw new Error("Download failed");

  // Offer the system share sheet — user picks "Save to Downloads" / Telegram / etc.
  if (await Sharing.isAvailableAsync()) {
    try {
      await Sharing.shareAsync(result.uri, {
        mimeType: "video/mp4",
        dialogTitle: filename,
        UTI: "public.movie",
      });
    } catch {
      // User cancelled — fine, file still in cache
    }
  }
  return result.uri;
}
