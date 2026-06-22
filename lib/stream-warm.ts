// Warm the stream CDN as soon as a movie/episode page opens — BEFORE the user
// clicks play. Opens the TLS/HTTP connection to the (rotating) stream host and
// pulls the HLS manifests into the browser's connection/memory, so when play is
// pressed the connection is already hot and the first chunk arrives fast.
//
// Best-effort, fire-and-forget. The video itself lives on HDRezka's CDN (not our
// server), so this costs us nothing. Keep it light (manifests only, no segments)
// so just browsing a page doesn't pull megabytes.

let _lastWarmed = "";

export function warmStream(url: string | undefined | null) {
  if (typeof window === "undefined") return;
  if (!url || url === _lastWarmed) return;
  _lastWarmed = url;
  try {
    // 1) Warm the connection to the stream host (works regardless of CORS).
    fetch(url, { mode: "no-cors", credentials: "omit" }).catch(() => {});
    // 2) Best-effort: read the master manifest and warm the first variant too.
    fetch(url, { credentials: "omit" })
      .then((r) => (r.ok ? r.text() : ""))
      .then((m) => {
        if (!m) return;
        const base = url.slice(0, url.lastIndexOf("/") + 1);
        const variant = (m.match(/^[^#\s].*\.m3u8[^\n]*$/m) || [])[0];
        if (!variant) return;
        const vurl = /^https?:/.test(variant) ? variant : base + variant;
        fetch(vurl, { mode: "no-cors", credentials: "omit" }).catch(() => {});
      })
      .catch(() => {});
  } catch {}
}
