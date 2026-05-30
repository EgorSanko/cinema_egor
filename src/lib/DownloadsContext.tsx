/**
 * Active downloads context.
 *
 * Lets the user tap "1080p", close the picker, and navigate to /Downloads
 * to watch progress — the actual download keeps running in this context's
 * state. Without this, the download would die the moment the modal closed
 * (its useState held the promise).
 *
 * Only tracks active jobs; finished items live in AsyncStorage via
 * addDownload/updateDownload in lib/downloads.ts.
 */
import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import {
  DownloadEntry, addDownload, buildFilename, downloadToGallery,
  toProxyUrl, updateDownload,
} from "./downloads";

export interface ActiveDownload {
  key: string;                  // unique per (entry, started time)
  entry: Omit<DownloadEntry, "downloadedAt">;
  filename: string;
  progress: number;             // 0..1
  bytesWritten: number;
  totalBytes: number;
  status: "running" | "done" | "error";
  error?: string;
}

interface Ctx {
  active: ActiveDownload[];
  start: (entry: Omit<DownloadEntry, "downloadedAt">) => Promise<void>;
  dismiss: (key: string) => void;
}

const DownloadsContext = createContext<Ctx | null>(null);

export function useDownloads(): Ctx {
  const ctx = useContext(DownloadsContext);
  if (!ctx) throw new Error("useDownloads must be inside DownloadsProvider");
  return ctx;
}

function entryKey(e: Pick<DownloadEntry, "id" | "type" | "season" | "episode" | "quality">): string {
  return `${e.type}-${e.id}-s${e.season ?? 0}e${e.episode ?? 0}-${e.quality}`;
}

export function DownloadsProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<ActiveDownload[]>([]);
  const activeRef = useRef(active);
  activeRef.current = active;

  const update = useCallback((key: string, patch: Partial<ActiveDownload>) => {
    setActive(prev => prev.map(a => a.key === key ? { ...a, ...patch } : a));
  }, []);

  const start = useCallback(async (entry: Omit<DownloadEntry, "downloadedAt">) => {
    const filename = buildFilename(entry);
    const proxyUrl = toProxyUrl(entry.url, filename);
    const key = `${entryKey(entry)}-${Date.now()}`;

    // De-dupe: if a download with the same logical key is already running,
    // don't kick off another one. Users tapping twice happens.
    const existing = activeRef.current.find(a =>
      a.status === "running" && entryKey(a.entry) === entryKey(entry)
    );
    if (existing) return;

    const job: ActiveDownload = {
      key, entry, filename,
      progress: 0, bytesWritten: 0, totalBytes: 0,
      status: "running",
    };
    setActive(prev => [job, ...prev]);

    // Record placeholder in history immediately so the Downloads screen
    // shows the item even before bytes start moving. Saved fields are
    // filled in after success.
    await addDownload(entry);

    try {
      const result = await downloadToGallery(proxyUrl, filename, (frac, w, t) => {
        update(key, { progress: frac, bytesWritten: w, totalBytes: t });
      });
      // Patch the persisted entry with localUri/assetId for offline playback
      await updateDownload(
        entry.id, entry.type,
        { localUri: result.localUri, mediaAssetId: result.mediaAssetId, sizeBytes: result.sizeBytes },
        entry.season, entry.episode, entry.quality,
      );
      update(key, { progress: 1, status: "done", totalBytes: result.sizeBytes });
    } catch (e: any) {
      update(key, { status: "error", error: String(e?.message || e) });
    }
  }, [update]);

  const dismiss = useCallback((key: string) => {
    setActive(prev => prev.filter(a => a.key !== key));
  }, []);

  return (
    <DownloadsContext.Provider value={{ active, start, dismiss }}>
      {children}
    </DownloadsContext.Provider>
  );
}
