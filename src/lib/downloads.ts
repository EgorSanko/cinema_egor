/**
 * Download tracking + Gallery save.
 *
 * Flow (Android):
 *   1. expo-file-system downloads mp4 to cacheDirectory (private, invisible)
 *   2. expo-media-library moves it into the "sapkeflykino" album in
 *      /Movies/sapkeflykino — visible in Gallery and Files app
 *   3. DownloadEntry stores localUri (MediaLibrary asset URI) so the
 *      Downloads screen can play it offline and delete it later
 *
 * Two paths for cancellation/error: cache file is best-effort cleaned up;
 * if we crash mid-download the OS will evict the cache eventually.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import { Platform } from "react-native";

const KEY = "kino_downloads_v1";
const PROXY_BASE = "https://sapkeflykino.ru/api/dl";
const ALBUM_NAME = "sapkeflykino";

export interface DownloadEntry {
  id: number;
  type: "movie" | "tv";
  title: string;
  poster_path: string | null;
  season?: number;
  episode?: number;
  episodeName?: string;
  quality: string;
  url: string;                  // original HDRezka stream URL
  downloadedAt: number;
  release_date?: string;
  first_air_date?: string;
  translatorName?: string;
  /** MediaLibrary URI (file:// or content://) once saved to gallery.
   *  Used for offline playback. Empty if the file was deleted from gallery. */
  localUri?: string;
  /** MediaLibrary asset id — needed to delete the file from the album later. */
  mediaAssetId?: string;
  /** File size in bytes (filled after successful save). */
  sizeBytes?: number;
}

export async function getDownloads(): Promise<DownloadEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function writeDownloads(items: DownloadEntry[]): Promise<void> {
  try { await AsyncStorage.setItem(KEY, JSON.stringify(items.slice(0, 500))); } catch {}
}

export async function addDownload(entry: Omit<DownloadEntry, "downloadedAt">): Promise<DownloadEntry> {
  const all = await getDownloads();
  const sameKey = (a: DownloadEntry) =>
    a.id === entry.id && a.type === entry.type
    && (a.season ?? null) === (entry.season ?? null)
    && (a.episode ?? null) === (entry.episode ?? null)
    && a.quality === entry.quality;
  const filtered = all.filter(d => !sameKey(d));
  const fresh: DownloadEntry = { ...entry, downloadedAt: Date.now() };
  filtered.unshift(fresh);
  await writeDownloads(filtered);
  return fresh;
}

export async function updateDownload(
  id: number, type: "movie" | "tv",
  patch: Partial<DownloadEntry>,
  season?: number, episode?: number, quality?: string,
): Promise<void> {
  const all = await getDownloads();
  const idx = all.findIndex(d => d.id === id && d.type === type
    && (season === undefined || d.season === season)
    && (episode === undefined || d.episode === episode)
    && (quality === undefined || d.quality === quality));
  if (idx === -1) return;
  all[idx] = { ...all[idx], ...patch };
  await writeDownloads(all);
}

export async function deleteDownload(
  entry: DownloadEntry,
  alsoDeleteFile = true,
): Promise<void> {
  if (alsoDeleteFile && entry.mediaAssetId) {
    try {
      await MediaLibrary.deleteAssetsAsync([entry.mediaAssetId]);
    } catch {
      // User denied / asset already gone — fall through to remove the entry
    }
  }
  const all = await getDownloads();
  const filtered = all.filter(d => !(
    d.id === entry.id && d.type === entry.type
    && (d.season ?? null) === (entry.season ?? null)
    && (d.episode ?? null) === (entry.episode ?? null)
    && d.quality === entry.quality
  ));
  await writeDownloads(filtered);
}

export async function clearAllDownloads(alsoDeleteFiles = false): Promise<void> {
  if (alsoDeleteFiles) {
    const all = await getDownloads();
    const ids = all.map(d => d.mediaAssetId).filter(Boolean) as string[];
    if (ids.length > 0) {
      try { await MediaLibrary.deleteAssetsAsync(ids); } catch {}
    }
  }
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

export function toProxyUrl(streamUrl: string, filename: string): string {
  const raw = streamUrl.replace(/:hls:manifest\.m3u8$/i, "");
  return `${PROXY_BASE}?url=${encodeURIComponent(raw)}&name=${encodeURIComponent(filename)}`;
}

export type ProgressCb = (fraction: number, bytesWritten: number, totalBytes: number) => void;

export interface SaveResult {
  localUri: string;        // file:// or content:// URI usable by expo-av
  mediaAssetId: string;
  sizeBytes: number;
}

/**
 * Download to cache, then move into the sapkeflykino album in the system
 * Gallery. Returns the asset URI + id so DownloadEntry can be updated.
 *
 * On permission denial: returns null and caller should surface that.
 */
export async function downloadToGallery(
  proxyUrl: string,
  filename: string,
  onProgress?: ProgressCb,
): Promise<SaveResult> {
  if (Platform.OS === "web") {
    throw new Error("Web platform: use the browser <a download> path");
  }

  // Permission first — saveToLibraryAsync needs WRITE on Android 9 and below,
  // and READ_MEDIA_VIDEO on Android 13+. The granular permission flow is
  // handled by expo-media-library.
  const perm = await MediaLibrary.requestPermissionsAsync(true);
  if (!perm.granted) {
    throw new Error("Нет разрешения на Галерею. Разреши в настройках Android → Приложения → sapkeflykino → Разрешения.");
  }

  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) throw new Error("No cache directory");
  const tmpDir = `${cacheDir}downloads/`;
  try { await FileSystem.makeDirectoryAsync(tmpDir, { intermediates: true }); } catch {}
  const tmpPath = `${tmpDir}${filename}`;

  try { await FileSystem.deleteAsync(tmpPath, { idempotent: true }); } catch {}

  const resumable = FileSystem.createDownloadResumable(
    proxyUrl,
    tmpPath,
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
  if (!result?.uri) throw new Error("Download failed (no uri)");

  // Move from cache to MediaLibrary, then to our album. Cache copy is
  // deleted afterwards because MediaLibrary makes its own copy.
  const asset = await MediaLibrary.createAssetAsync(result.uri);
  let album = await MediaLibrary.getAlbumAsync(ALBUM_NAME);
  if (!album) {
    album = await MediaLibrary.createAlbumAsync(ALBUM_NAME, asset, false);
  } else {
    try {
      await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
    } catch {
      // Some Android versions report success-as-error on first add; ignore.
    }
  }
  try { await FileSystem.deleteAsync(result.uri, { idempotent: true }); } catch {}

  // Size for display in Downloads list
  let sizeBytes = 0;
  try {
    const info = await MediaLibrary.getAssetInfoAsync(asset);
    sizeBytes = (info as any)?.fileSize ?? 0;
  } catch {}

  return {
    localUri: asset.uri,
    mediaAssetId: asset.id,
    sizeBytes,
  };
}

/** Check whether a saved asset still exists on device. Users delete from
 *  the Gallery app and we need to react. */
export async function isLocalFileStillThere(entry: DownloadEntry): Promise<boolean> {
  if (!entry.mediaAssetId) return false;
  try {
    const info = await MediaLibrary.getAssetInfoAsync(entry.mediaAssetId);
    return !!info?.localUri || !!info?.uri;
  } catch {
    return false;
  }
}
