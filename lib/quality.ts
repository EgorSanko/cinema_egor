// Smart default video quality.
//
// The backend exposes every tier up to 2K/4K. Defaulting everyone to the max
// buffers on phones / slow links, so pick a sane default from the connection:
//   • data-saver            → 720p
//   • 2G / slow-2G          → 480p
//   • 3G                    → 720p
//   • cellular (even 4G)    → 1080p   (don't burn a mobile plan on 4K)
//   • Wi-Fi / wired / 4G / unknown-desktop → highest available (2K/4K)
// A quality the user picks MANUALLY is remembered (as a target height) and wins
// over the connection guess on every later title.

const PREF_KEY = "kino-quality-pref";

export function qHeight(label: string): number {
  const s = (label || "").toLowerCase();
  if (s.includes("4k") || s.includes("2160")) return 2160;
  if (s.includes("2k") || s.includes("1440")) return 1440;
  let n = parseInt(s) || 0;
  if (s.includes("ultra")) n += 1; // 1080p Ultra ranks just above plain 1080p
  return n;
}

export function setQualityPref(label: string) {
  try {
    const h = qHeight(label);
    if (h > 0) localStorage.setItem(PREF_KEY, String(h));
  } catch {}
}

function getQualityPref(): number | null {
  try {
    const v = localStorage.getItem(PREF_KEY);
    return v ? parseInt(v, 10) : null;
  } catch {
    return null;
  }
}

function connectionCeiling(): number {
  const c: any =
    typeof navigator !== "undefined"
      ? (navigator as any).connection ||
        (navigator as any).mozConnection ||
        (navigator as any).webkitConnection
      : null;
  if (!c) return Infinity; // no API (Safari/desktop) → allow the max
  if (c.saveData) return 720;
  const et = c.effectiveType;
  if (et === "slow-2g" || et === "2g") return 480;
  if (et === "3g") return 720;
  // 4g or undefined: cap mobile data at 1080, otherwise allow the max.
  if (c.type === "cellular") return 1080;
  return Infinity;
}

/** Pick the default quality LABEL from the available streams. */
export function pickDefaultQuality(
  streams: Record<string, string> | undefined,
  fallback: string
): string {
  const keys = streams ? Object.keys(streams) : [];
  if (keys.length === 0) return fallback;
  // Highest → lowest by real height.
  const ranked = keys
    .map((k) => ({ k, h: qHeight(k) }))
    .sort((a, b) => b.h - a.h);

  // 1) Remembered manual choice: best available at or below that height.
  const pref = getQualityPref();
  if (pref != null) {
    const atOrBelow = ranked.find((r) => r.h <= pref);
    return (atOrBelow || ranked[ranked.length - 1]).k;
  }

  // 2) Connection-based ceiling.
  const ceil = connectionCeiling();
  const fit = ranked.find((r) => r.h <= ceil);
  return (fit || ranked[ranked.length - 1]).k;
}
