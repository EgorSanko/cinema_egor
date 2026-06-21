import { NextRequest, NextResponse } from "next/server";

// Collaps source (api.ortified.ws) — drop-in replacement for the dying HDRezka
// backend. Resolves by IMDB id (the frontend already has TMDB ids; we map
// TMDB→IMDB via external_ids). The embed HTML carries everything server-side:
//   • movie : top-level `hls` master.m3u8 + in-manifest audio tracks + cc
//   • series: seasons[].episodes[] each with `hls` + audio + skip `sections`
// Dubs are AUDIO TRACKS inside ONE adaptive master.m3u8 — not separate streams —
// so there is no premium-stub / translator-substitution trap like HDRezka had.
// The player switches dub via hls.js audioTrack (no refetch) and quality via
// hls.js levels. We just hand back the master.m3u8 + the nice dub labels.

const TMDB_API_KEY = "275c9d09780aadb4b13ff57a731eda00";

const COLLAPS_BASE = "https://api.ortified.ws/embed/imdb/";
// Referer is checked by ortified — must look like it came from a lordfilm host.
const COLLAPS_REFERER = "https://vz.lordfilm135.ru/";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

// collaps stream URLs carry an expiring `t=` CDN token (minutes), so cache the
// PARSED embed only briefly. IMDB lookups never change → cache them long.
const EMBED_TTL_MS = 90_000;
const IMDB_TTL_MS = 24 * 3600_000;

type AudioInfo = { names: string[]; order: number[] } | null;
type ParsedEmbed =
  | {
      ok: true;
      type: "movie" | "series";
      hls: string;
      audio: AudioInfo;
      sections?: any[];
      seasonsAvail?: string[];
    }
  | { ok: false; reason: string; seasonsAvail?: string[]; epsInSeason?: string[] };

const embedCache = new Map<string, { at: number; html: string; status: number }>();
const imdbCache = new Map<string, { at: number; imdb: string }>();

async function resolveImdb(tmdbId: string, type: string): Promise<string> {
  const cached = imdbCache.get(tmdbId);
  if (cached && Date.now() - cached.at < IMDB_TTL_MS) return cached.imdb;
  const kind = type === "tv" || type === "series" ? "tv" : "movie";
  let imdb = "";
  try {
    const r = await fetch(
      `https://api.themoviedb.org/3/${kind}/${tmdbId}/external_ids?api_key=${TMDB_API_KEY}`
    );
    if (r.ok) {
      const j = await r.json();
      imdb = j.imdb_id || "";
    }
  } catch {}
  if (imdb) imdbCache.set(tmdbId, { at: Date.now(), imdb });
  return imdb;
}

async function fetchEmbed(imdb: string): Promise<{ html: string; status: number }> {
  const hit = embedCache.get(imdb);
  if (hit && Date.now() - hit.at < EMBED_TTL_MS) return { html: hit.html, status: hit.status };
  let status = 0;
  let html = "";
  try {
    const r = await fetch(COLLAPS_BASE + imdb, {
      headers: { "User-Agent": UA, Referer: COLLAPS_REFERER },
      redirect: "follow",
    });
    status = r.status;
    html = r.status === 200 ? await r.text() : "";
  } catch {
    status = 0;
  }
  embedCache.set(imdb, { at: Date.now(), html, status });
  return { html, status };
}

function grabAudio(seg: string): AudioInfo {
  const m = seg.match(
    /"?audio"?\s*:\s*\{\s*"names":\[([^\]]*)\]\s*,\s*"order":\[([^\]]*)\]/
  );
  if (!m) return null;
  let names: string[];
  try {
    names = JSON.parse("[" + m[1] + "]");
  } catch {
    names = m[1].split(",").map((s) => s.replace(/^"|"$/g, ""));
  }
  let order: number[];
  try {
    order = JSON.parse("[" + m[2] + "]");
  } catch {
    order = m[2].split(",").map(Number);
  }
  return { names, order };
}

// Validated against 20+ movies & series (incl. anime w/ 16 dubs, out-of-range
// season/episode, garbage id). Keep this in sync with the sandbox harness.
function parseCollaps(html: string, season: number, episode: number): ParsedEmbed {
  if (!html || html.length < 2500) return { ok: false, reason: "empty" };
  if (/Контент не найден|не доступен в вашем регионе/i.test(html) && html.length < 6000)
    return { ok: false, reason: "geo/notfound" };

  const isSeries =
    /"seasons?":\[|"season":\d+,"blocked"/.test(html) || /seasons:\[/.test(html);

  if (!isSeries) {
    const hls =
      (html.match(/["']?hls["']?\s*:\s*["']([^"']+\.m3u8[^"']*)["']/) ||
        html.match(/(https?:\/\/[^"'\s]+master\.m3u8[^"'\s]*)/) ||
        [])[1];
    if (!hls) return { ok: false, reason: "no-hls-movie" };
    const audio = grabAudio(html.slice(0, (html.indexOf(hls) || 0) + 1200));
    return { ok: true, type: "movie", hls, audio };
  }

  const S = String(season || 1);
  const E = String(episode || 1);
  const seasonStarts = [...html.matchAll(/\{"season":(\d+),"blocked":(true|false)/g)];
  const seasonsAvail = [...new Set(seasonStarts.map((m) => m[1]))];
  let targetChunk: string | null = null;
  for (let i = 0; i < seasonStarts.length; i++) {
    if (seasonStarts[i][1] === S) {
      const start = seasonStarts[i].index!;
      const end = i + 1 < seasonStarts.length ? seasonStarts[i + 1].index! : html.length;
      targetChunk = html.slice(start, end);
      break;
    }
  }
  if (!targetChunk) return { ok: false, reason: "season-missing", seasonsAvail };

  const epRe = new RegExp('\\{"episode":"' + E + '","id":\\d+[\\s\\S]*?"hls":"([^"]+)"');
  const m = targetChunk.match(epRe);
  if (!m) {
    const eps = [...new Set([...targetChunk.matchAll(/"episode":"(\d+)"/g)].map((x) => x[1]))];
    return { ok: false, reason: "episode-missing", seasonsAvail, epsInSeason: eps };
  }
  const hls = m[1];
  // Slice the WHOLE episode object (up to the next episode boundary) rather
  // than a fixed window — long CDN-token URLs can otherwise push the audio
  // block past a fixed cutoff and lose the nice dub labels.
  const rest = targetChunk.slice(m.index! + 1);
  const nextEp = rest.search(/\{"episode":"/);
  const epEnd = nextEp >= 0 ? m.index! + 1 + nextEp : targetChunk.length;
  const after = targetChunk.slice(m.index!, epEnd);
  const audio = grabAudio(after);
  let sections: any[] | undefined;
  const sm = after.match(/"sections":(\[[^\]]*\])/);
  if (sm) {
    try {
      sections = JSON.parse(sm[1]);
    } catch {}
  }
  return { ok: true, type: "series", hls, audio, sections, seasonsAvail };
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const tmdbId = sp.get("tmdb_id") || "";
  const type = sp.get("type") || "movie";
  const season = parseInt(sp.get("season") || "1", 10);
  const episode = parseInt(sp.get("episode") || "1", 10);
  let imdb = sp.get("imdb") || "";

  if (!imdb && !tmdbId)
    return NextResponse.json({ error: "missing tmdb_id or imdb", results: [] });

  if (!imdb) imdb = await resolveImdb(tmdbId, type);
  if (!imdb)
    return NextResponse.json({ error: "no imdb id", fallback: true, results: [] });

  const { html, status } = await fetchEmbed(imdb);
  if (status !== 200)
    return NextResponse.json({ error: "collaps http " + status, fallback: true, imdb, results: [] });

  const parsed = parseCollaps(html, season, episode);
  if (!parsed.ok)
    return NextResponse.json({ error: parsed.reason, fallback: true, imdb, results: [] });

  // Build nice dub labels in collaps' preferred display order. audioTracks in
  // the HLS manifest are index-aligned with `names`; `order` is the preferred
  // sequence (Russian dubs first), so order[0] is the sensible default track.
  let translators: { id: number; name: string; is_premium: boolean }[] = [];
  let defaultTrack = 0;
  if (parsed.audio && parsed.audio.names.length) {
    const { names, order } = parsed.audio;
    const seq = order && order.length === names.length ? order : names.map((_, i) => i);
    translators = seq.map((idx) => ({ id: idx, name: names[idx] || `Дорожка ${idx + 1}`, is_premium: false }));
    defaultTrack = seq[0] ?? 0;
  }

  // PLAYBACK = the collaps iframe embed. The raw HLS cannot be played by our
  // own hls.js: collaps signs every media segment via its cdn.js (rewrites to
  // /x-en-x/<sig>) and the CDN domain-locks segment tokens to lordfilm, so
  // plain segment requests get 410. The embed's own player does the signing,
  // and it plays fine when iframed on our domain. Series start at the right
  // episode via ?season=N&episode=M. We still parse above purely to confirm
  // collaps actually HAS this title/episode (else the caller falls back to
  // yohoho). `parsed.hls` is kept for diagnostics only — do not feed to a player.
  const embed =
    parsed.type === "series"
      ? `${COLLAPS_BASE}${imdb}?season=${season}&episode=${episode}`
      : `${COLLAPS_BASE}${imdb}`;

  return NextResponse.json(
    {
      title: "",
      source: "collaps",
      embed,
      is_series: parsed.type === "series",
      // dub labels collaps offers (informational; the embed has its own menu).
      translators,
      active_translator_id: defaultTrack,
      sections: (parsed as any).sections || [],
      imdb,
      url: COLLAPS_BASE + imdb,
      // diagnostics only — NOT playable directly (segment-signed, domain-locked).
      _stream: parsed.hls,
    },
    { headers: { "Cache-Control": "private, max-age=0, must-revalidate" } }
  );
}
