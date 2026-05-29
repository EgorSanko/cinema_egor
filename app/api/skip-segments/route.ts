import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

/**
 * Skip-segments cascade.
 *
 * Looks up intro/outro timestamps for a given (tmdb_id, type, season?, episode?)
 * across public crowdsourced databases (IntroDB.app today; AniSkip and
 * IntroHater can be added behind feature flags). Caches results on disk for
 * 30 days — even nulls — so a popular missing show doesn't pound the upstream
 * API on every play.
 *
 * Returns { intro: { start, end } | null, outro: { start, end } | null, source }.
 * `source` is "introdb" | "none" | "cache". An all-null response is normal and
 * the client just won't show any overlay.
 */

const TMDB_API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY!;
const TMDB_BASE = process.env.NEXT_PUBLIC_TMDB_BASE_URL || "https://api.themoviedb.org/3";

const CACHE_DIR = process.env.SYNC_DATA_DIR || path.join(process.cwd(), "user-data");
const CACHE_FILE = path.join(CACHE_DIR, "skip-cache.json");
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface Segment { start: number; end: number }
interface SkipResult { intro: Segment | null; outro: Segment | null; source: string }
interface CacheEntry extends SkipResult { fetchedAt: number }

function ensureDir() {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function readCache(): Record<string, CacheEntry> {
  try {
    ensureDir();
    if (!fs.existsSync(CACHE_FILE)) return {};
    return JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
  } catch { return {}; }
}

let writeTimer: NodeJS.Timeout | null = null;
let pendingWrites: Record<string, CacheEntry> = {};
function scheduleWrite(key: string, val: CacheEntry) {
  pendingWrites[key] = val;
  if (writeTimer) return;
  // Coalesce concurrent writes — many tabs opening simultaneously shouldn't
  // each rewrite the whole file. 2-second debounce is fine for cache misses.
  writeTimer = setTimeout(() => {
    try {
      ensureDir();
      const current = readCache();
      const merged = { ...current, ...pendingWrites };
      fs.writeFileSync(CACHE_FILE, JSON.stringify(merged), "utf-8");
    } catch (e) { console.error("skip-cache write failed", e); }
    pendingWrites = {};
    writeTimer = null;
  }, 2000);
}

async function getImdbId(tmdbId: number, type: "movie" | "tv"): Promise<string | null> {
  try {
    const res = await fetch(`${TMDB_BASE}/${type}/${tmdbId}/external_ids?api_key=${TMDB_API_KEY}`, {
      // 7 days — IMDB ids never change
      next: { revalidate: 7 * 24 * 60 * 60 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.imdb_id || null;
  } catch { return null; }
}

async function queryIntroDB(imdbId: string, season: number | null, episode: number | null): Promise<SkipResult | null> {
  try {
    const qs = new URLSearchParams({ imdb_id: imdbId });
    if (season != null) qs.set("season", String(season));
    if (episode != null) qs.set("episode", String(episode));
    const res = await fetch(`https://api.introdb.app/segments?${qs}`, {
      headers: { "User-Agent": "sapkeflykino/1.0 (crowdsourced skip lookup)" },
      // Short timeout — IntroDB usually responds in <500ms; if it doesn't,
      // we fall through to other sources rather than block the player.
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const intro = data.intro ? { start: data.intro.start_sec, end: data.intro.end_sec } : null;
    const outro = data.outro ? { start: data.outro.start_sec, end: data.outro.end_sec } : null;
    if (!intro && !outro) return null;
    return { intro, outro, source: "introdb" };
  } catch { return null; }
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const tmdbId = Number(sp.get("tmdb"));
  const type = sp.get("type") === "tv" ? "tv" : "movie";
  const season = sp.get("season") ? Number(sp.get("season")) : null;
  const episode = sp.get("episode") ? Number(sp.get("episode")) : null;

  if (!tmdbId) return NextResponse.json({ error: "tmdb required" }, { status: 400 });

  const cacheKey = `${type}-${tmdbId}${type === "tv" ? `-s${season ?? 0}e${episode ?? 0}` : ""}`;
  const cache = readCache();
  const cached = cache[cacheKey];
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return NextResponse.json({ ...cached, source: "cache" });
  }

  const imdbId = await getImdbId(tmdbId, type);
  let result: SkipResult = { intro: null, outro: null, source: "none" };
  if (imdbId) {
    const fromIntroDB = await queryIntroDB(imdbId, season, episode);
    if (fromIntroDB) result = fromIntroDB;
  }

  scheduleWrite(cacheKey, { ...result, fetchedAt: Date.now() });
  return NextResponse.json(result);
}
