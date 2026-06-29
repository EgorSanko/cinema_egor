import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

/**
 * Skip-segments cascade.
 *
 * Looks up intro/outro timestamps for a given (tmdb_id, type, season?, episode?)
 * across public crowdsourced databases (IntroDB.app, AniSkip via Jikan-resolved
 * MAL ids, and IntroHater when an API key is configured). Caches results AND
 * the TMDB→MAL mapping on disk for 30 days — even nulls — so a popular missing
 * show doesn't pound upstream APIs on every play.
 *
 * Returns { intro: { start, end } | null, outro: { start, end } | null, source }.
 * `source` is "introdb" | "aniskip" | "introhater" | "merged" | "none" | "cache".
 * An all-null response is normal and the client just won't show any overlay.
 */

const TMDB_API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY!;
const TMDB_BASE = process.env.NEXT_PUBLIC_TMDB_BASE_URL || "https://api.themoviedb.org/3";
const INTROHATER_API_KEY = process.env.INTROHATER_API_KEY; // optional; if unset, IntroHater leg is skipped

// Dedicated cache dir — NOT user-data (these are global caches, not per-user
// profiles; writing them into user-data/ polluted the registered-user counts
// with "skip-cache" / "tmdb-mal-map" phantom profiles).
const CACHE_DIR = process.env.SKIP_CACHE_DIR || path.join(process.cwd(), "cache");
const CACHE_FILE = path.join(CACHE_DIR, "skip-cache.json");
const MAL_MAP_FILE = path.join(CACHE_DIR, "tmdb-mal-map.json");
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface Segment { start: number; end: number }
interface SkipResult { intro: Segment | null; outro: Segment | null; source: string }
interface CacheEntry extends SkipResult { fetchedAt: number }

function ensureDir() {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function readJson<T>(file: string, fallback: T): T {
  try {
    ensureDir();
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
  } catch { return fallback; }
}

let writeTimer: NodeJS.Timeout | null = null;
let pendingCacheWrites: Record<string, CacheEntry> = {};
let pendingMalWrites: Record<string, number | null> = {};

function scheduleWrites() {
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    try {
      ensureDir();
      if (Object.keys(pendingCacheWrites).length) {
        const cur = readJson<Record<string, CacheEntry>>(CACHE_FILE, {});
        fs.writeFileSync(CACHE_FILE, JSON.stringify({ ...cur, ...pendingCacheWrites }), "utf-8");
        pendingCacheWrites = {};
      }
      if (Object.keys(pendingMalWrites).length) {
        const cur = readJson<Record<string, number | null>>(MAL_MAP_FILE, {});
        fs.writeFileSync(MAL_MAP_FILE, JSON.stringify({ ...cur, ...pendingMalWrites }), "utf-8");
        pendingMalWrites = {};
      }
    } catch (e) { console.error("skip-cache write failed", e); }
    writeTimer = null;
  }, 2000);
}

async function getTmdbMeta(tmdbId: number, type: "movie" | "tv") {
  try {
    const res = await fetch(`${TMDB_BASE}/${type}/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`, {
      next: { revalidate: 7 * 24 * 60 * 60 },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function resolveMalId(tmdbId: number, type: "movie" | "tv", meta: any): Promise<number | null> {
  const malKey = `${type}-${tmdbId}`;
  const malMap = readJson<Record<string, number | null>>(MAL_MAP_FILE, {});
  if (malKey in malMap) return malMap[malKey];

  // Only attempt anime resolution for animated, Japan-originating TV.
  const isAnime = meta?.genres?.some((g: any) => g.id === 16)
    && (meta?.origin_country?.includes("JP") || meta?.original_language === "ja");
  if (!isAnime) {
    pendingMalWrites[malKey] = null;
    scheduleWrites();
    return null;
  }

  // Jikan rate-limits at 3 RPS unauth — we don't pound it because every
  // result is cached forever (TMDB↔MAL is a stable mapping).
  try {
    const query = meta.original_name || meta.original_title || meta.name || meta.title;
    if (!query) return null;
    const res = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=3&type=tv`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const malId = data?.data?.[0]?.mal_id;
    const result = typeof malId === "number" ? malId : null;
    pendingMalWrites[malKey] = result;
    scheduleWrites();
    return result;
  } catch { return null; }
}

async function queryIntroDB(imdbId: string, season: number | null, episode: number | null): Promise<SkipResult | null> {
  try {
    const qs = new URLSearchParams({ imdb_id: imdbId });
    if (season != null) qs.set("season", String(season));
    if (episode != null) qs.set("episode", String(episode));
    const res = await fetch(`https://api.introdb.app/segments?${qs}`, {
      headers: { "User-Agent": "sapkeflykino/1.0 (crowdsourced skip lookup)" },
      signal: AbortSignal.timeout(3500),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const intro = data.intro ? { start: data.intro.start_sec, end: data.intro.end_sec } : null;
    const outro = data.outro ? { start: data.outro.start_sec, end: data.outro.end_sec } : null;
    if (!intro && !outro) return null;
    return { intro, outro, source: "introdb" };
  } catch { return null; }
}

async function queryAniSkip(malId: number, episode: number, episodeLength?: number): Promise<SkipResult | null> {
  try {
    // episodeLength helps AniSkip pick the right cut variant; if we don't
    // know yet (player hasn't reported duration), pass a generous default
    // and AniSkip still returns something useful.
    const len = episodeLength && episodeLength > 0 ? Math.round(episodeLength) : 1440;
    const url = `https://api.aniskip.com/v2/skip-times/${malId}/${episode}?types=op&types=ed&episodeLength=${len}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3500) });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.found || !Array.isArray(data.results)) return null;
    const op = data.results.find((r: any) => r.skipType === "op");
    const ed = data.results.find((r: any) => r.skipType === "ed");
    const intro = op?.interval ? { start: Math.round(op.interval.startTime), end: Math.round(op.interval.endTime) } : null;
    const outro = ed?.interval ? { start: Math.round(ed.interval.startTime), end: Math.round(ed.interval.endTime) } : null;
    if (!intro && !outro) return null;
    return { intro, outro, source: "aniskip" };
  } catch { return null; }
}

async function queryIntroHater(imdbId: string, season: number | null, episode: number | null): Promise<SkipResult | null> {
  if (!INTROHATER_API_KEY) return null;
  try {
    const res = await fetch(`https://introhater.com/api/v1/segments/${imdbId}`, {
      headers: { "X-API-Key": INTROHATER_API_KEY },
      signal: AbortSignal.timeout(3500),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data)) return null;
    // Response is the full segment list for the show. We filter to the
    // specific (season, episode) and bucket by label. For movies videoId
    // is just the imdb id with no :s:e suffix; we accept any match.
    const wanted = season != null && episode != null
      ? `${imdbId}:${season}:${episode}`
      : imdbId;
    const forEp = data.filter((s: any) => s.videoId === wanted);
    if (forEp.length === 0) return null;
    // Prefer verified entries; among ties take the one with most votes.
    const pick = (label: string) => {
      const candidates = forEp.filter((s: any) => (s.label || "").toLowerCase() === label);
      if (candidates.length === 0) return null;
      candidates.sort((a: any, b: any) =>
        (Number(!!b.verified) - Number(!!a.verified)) || ((b.votes || 0) - (a.votes || 0))
      );
      const top = candidates[0];
      return { start: Math.round(top.start), end: Math.round(top.end) };
    };
    const intro = pick("intro");
    const outro = pick("outro") || pick("credits");
    if (!intro && !outro) return null;
    return { intro, outro, source: "introhater" };
  } catch { return null; }
}

/** First non-null intro + first non-null outro across sources, in priority order.
 *  We trust IntroDB first because it has highest verification standards, then
 *  AniSkip for anime-specific accuracy, then IntroHater as the catch-all. */
function merge(results: (SkipResult | null)[]): SkipResult {
  const present = results.filter((r): r is SkipResult => r !== null);
  if (present.length === 0) return { intro: null, outro: null, source: "none" };
  const intro = present.find(r => r.intro)?.intro ?? null;
  const outro = present.find(r => r.outro)?.outro ?? null;
  if (!intro && !outro) return { intro: null, outro: null, source: "none" };
  // Single source → keep its name; otherwise mark merged.
  const sources = present.filter(r => r.intro || r.outro).map(r => r.source);
  return { intro, outro, source: sources.length === 1 ? sources[0] : sources.join("+") };
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const tmdbId = Number(sp.get("tmdb"));
  const type = sp.get("type") === "tv" ? "tv" : "movie";
  const season = sp.get("season") ? Number(sp.get("season")) : null;
  const episode = sp.get("episode") ? Number(sp.get("episode")) : null;
  const episodeLength = sp.get("duration") ? Number(sp.get("duration")) : undefined;

  if (!tmdbId) return NextResponse.json({ error: "tmdb required" }, { status: 400 });

  const cacheKey = `${type}-${tmdbId}${type === "tv" ? `-s${season ?? 0}e${episode ?? 0}` : ""}`;
  const cached = readJson<Record<string, CacheEntry>>(CACHE_FILE, {})[cacheKey];
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return NextResponse.json({ intro: cached.intro, outro: cached.outro, source: "cache" });
  }

  const meta = await getTmdbMeta(tmdbId, type);
  const imdbId = meta?.external_ids?.imdb_id || meta?.imdb_id || null;

  // Fire all available sources in parallel — total latency = slowest one,
  // not the sum. Each promise resolves to null on failure so merge() is safe.
  const promises: Promise<SkipResult | null>[] = [];
  if (imdbId) promises.push(queryIntroDB(imdbId, season, episode));
  if (imdbId && INTROHATER_API_KEY) promises.push(queryIntroHater(imdbId, season, episode));
  if (type === "tv" && episode && meta) {
    promises.push(
      resolveMalId(tmdbId, type, meta).then(mal => mal ? queryAniSkip(mal, episode, episodeLength) : null)
    );
  }
  const results = await Promise.all(promises);
  const merged = merge(results);

  pendingCacheWrites[cacheKey] = { ...merged, fetchedAt: Date.now() };
  scheduleWrites();
  return NextResponse.json(merged);
}
