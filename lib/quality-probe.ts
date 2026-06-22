// Client-side quality speed probe.
//
// HDRezka serves each quality tier from a different CDN edge (encoded in the
// segment token). Some edges peer badly with a given viewer's ISP, so a tier
// can crawl at ~40 KB/s for one user while flying for another — it's
// route-dependent, so it MUST be measured from the viewer's browser, not our
// server (our server has a fast path to every edge and would call them all
// fast). The browser can read the segments (same CORS the player relies on), so
// we fetch each tier's first segment, measure real throughput in a short budget,
// and report which tiers are actually fast for THIS viewer.
//
// Best-effort: any failure just leaves the tier out of the "fast" set, and the
// caller falls back to its normal default.

import { qHeight } from "./quality";

const BUDGET_MS = 1300; // how long to sample each tier's first segment
const FAST_BYTES = 380_000; // bytes within the budget to count a tier as "fast"

async function probeTier(manifestUrl: string): Promise<number> {
  try {
    const ctrl = new AbortController();
    // Hard cap: a fully-stuck tier never sends a first byte, so the byte/time
    // budget inside the read loop never trips — abort it here instead (manifest
    // ~1.4s + a short grace for the segment).
    const kill = setTimeout(() => ctrl.abort(), 2600);
    // 1) media playlist → first segment URL
    const m = await fetch(manifestUrl, { credentials: "omit", signal: ctrl.signal })
      .then((r) => (r.ok ? r.text() : ""));
    const segLine = (m.match(/^[^#\s].*\.ts[^\n]*$/m) || [])[0];
    if (!segLine) { clearTimeout(kill); return 0; }
    const base = manifestUrl.slice(0, manifestUrl.lastIndexOf("/") + 1);
    const seg = /^https?:/.test(segLine) ? segLine : base + segLine;
    // 2) stream the first segment, count bytes within the budget
    const resp = await fetch(seg, { credentials: "omit", signal: ctrl.signal });
    if (!resp.ok || !resp.body) { clearTimeout(kill); return 0; }
    const reader = resp.body.getReader();
    let got = 0;
    const t0 = performance.now();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      got += value.length;
      if (got >= FAST_BYTES || performance.now() - t0 >= BUDGET_MS) break;
    }
    try { ctrl.abort(); } catch {}
    clearTimeout(kill);
    // normalise to "bytes per BUDGET_MS" so an early FAST_BYTES break still ranks high
    const elapsed = Math.max(1, performance.now() - t0);
    return Math.round((got / elapsed) * BUDGET_MS);
  } catch {
    return 0;
  }
}

// LeadSeek HLS proxy — for tiers HDRezka throttles on this viewer's route. The
// proxy fetches the manifest + segments from its (fast) route to the CDN edge
// and relays them, so a tier that hangs direct loads normally through here.
// Path ends in .m3u8 so ArtPlayer routes it to the hls.js handler (it picks the
// player type by URL extension); without it the proxy manifest never reaches
// hls.js and segments aren't proxied.
const HLS_PROXY = "https://kino.lead-seek.ru/hdrezka/api/hls.m3u8?u=";

export function hlsProxyUrl(directManifestUrl: string): string {
  const b64 = btoa(unescape(encodeURIComponent(directManifestUrl)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return HLS_PROXY + b64;
}

/** Probe a single tier — true if it loads fast for this viewer. */
export async function isTierFast(directManifestUrl: string): Promise<boolean> {
  return (await probeTier(directManifestUrl)) >= FAST_BYTES;
}

/** Pick the URL to actually play for a tier: direct when it's in the known-fast
 *  set, otherwise routed through the LeadSeek proxy (throttled on this route, or
 *  the probe found nothing fast at all → fast=[]). No probe info → play direct. */
export function streamUrlFor(
  quality: string,
  directUrl: string,
  fast?: string[] | null
): string {
  if (fast && !fast.includes(quality)) return hlsProxyUrl(directUrl);
  return directUrl;
}

/** Return the tiers that load fast for THIS viewer, fastest-first.
 *  Optimised for the common case: probe plain 1080p (the usual default) first —
 *  if it's fast we stop there (one cheap sample, no extra bandwidth). Only when
 *  1080p is missing or throttled do we probe the other tiers to find a fast one.
 *  Empty array ⇒ inconclusive (caller keeps its normal default). */
export async function probeFastQualities(
  streams: Record<string, string> | undefined
): Promise<string[]> {
  if (typeof window === "undefined" || !streams) return [];
  const all = Object.keys(streams);
  const p1080 = all.find((q) => qHeight(q) === 1080);
  if (p1080) {
    const b = await probeTier(streams[p1080]);
    if (b >= FAST_BYTES) return [p1080]; // default is fast → done
  }
  // 1080p missing or throttled on this route → find a fast alternative.
  const cands = all.filter((q) => qHeight(q) >= 720 && q !== p1080);
  if (!cands.length) return [];
  const results = await Promise.all(
    cands.map((q) => probeTier(streams[q]).then((bytes) => ({ q, bytes })))
  );
  return results
    .filter((r) => r.bytes >= FAST_BYTES)
    .sort((a, b) => b.bytes - a.bytes)
    .map((r) => r.q);
}
