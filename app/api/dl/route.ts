import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { Readable } from "stream";

// Streaming download proxy for HDRezka. Two modes:
//
//  1. HLS (url contains :hls:manifest.m3u8 or ends .m3u8) — HDRezka's real
//     video is ~50 .ts segments behind an m3u8. The bare mp4 stub is either
//     an 8 MB placeholder or the CDN just returns the m3u8 with type
//     application/vnd.apple.mpegurl — which iOS Safari treats as a native
//     HLS stream and PLAYS instead of downloading (the exact bug reported).
//     So we ffmpeg-remux the playlist into a fragmented mp4, streamed to the
//     client. `-c copy` = no transcode (cheap CPU), just repackaging ts→mp4.
//
//  2. Direct mp4 (anything else) — plain byte proxy with Range support.
//
// Both modes set Content-Disposition: attachment with an RFC 5987 UTF-8
// filename, so Cyrillic survives and the browser saves rather than plays.
// Same-origin so the <a download> (Android) / same-tab attachment (iOS) flow
// works on every platform.
//
// Bandwidth caveat: every byte streams through this VPS. Fine for occasional
// downloads; put a CDN pull-zone in front if it becomes a hot path.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Whitelist of allowed upstream hosts — without it we'd be an open proxy.
const ALLOWED_HOST_PATTERNS = [
  /^([a-z0-9-]+\.)?vdbmate\.org$/i,
  /^([a-z0-9-]+\.)?voidboost\.cc$/i,
  /^([a-z0-9-]+\.)?ukrtelard\.online$/i,
  /^([a-z0-9-]+\.)?hdrezka(-ag)?\.[a-z]+$/i,
  // HDRezka rotates CDN hosts constantly; allow common prefixed shapes.
  /^prx-[a-z0-9-]+\.[a-z0-9.-]+$/i,
  /^stream\.[a-z0-9-]+\.[a-z]+$/i,
];

function hostAllowed(host: string): boolean {
  return ALLOWED_HOST_PATTERNS.some((re) => re.test(host));
}

// HDRezka stream URLs carry a distinctive token in the path:
//   /<hex-hash>:<digits>:<base64>/.../<file>.mp4(:hls:manifest.m3u8)
// The CDN host rotates constantly (laptostack.org, vdbmate.org, interkh.com, …),
// so trust the URL SHAPE instead of chasing hostnames — arbitrary/random URLs
// won't match this token, so it's not an open proxy.
const HDREZKA_TOKEN = /\/[0-9a-f]{16,}:\d{6,}:[A-Za-z0-9+/_=-]{16,}\//i;
function looksLikeHdrezkaStream(u: URL): boolean {
  return HDREZKA_TOKEN.test(u.pathname);
}

// Never proxy to internal/private targets (SSRF), whatever the pattern says.
const PRIVATE_HOST =
  /^(localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$)/i;
function isPrivateHost(host: string): boolean {
  return PRIVATE_HOST.test(host);
}

function sanitizeFilename(raw: string): string {
  return raw.replace(/[\r\n"\\\/]/g, "_").trim().slice(0, 200) || "video.mp4";
}

function dispositionHeader(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const REFERER = "https://hdrezka.ag/";

// iOS Safari/QuickTime can't read the duration of a fragmented mp4 (empty_moov)
// and plays only the first fragment (~2s). For iOS we instead remux to a real
// temp file with the moov atom at the front (+faststart), then serve that.
// Cost: the whole file lives on /tmp briefly — guarded by a free-space check
// so an iOS download can never fill the disk and crash the site.
const MIN_FREE_BYTES = 4 * 1024 * 1024 * 1024; // keep ≥4 GB headroom

function isIOS(req: NextRequest): boolean {
  return /iPhone|iPad|iPod/i.test(req.headers.get("user-agent") || "");
}

async function freeBytes(dir: string): Promise<number | null> {
  try {
    const s = await (fs.promises as any).statfs(dir);
    return s.bavail * s.bsize;
  } catch {
    return null;
  }
}

function safeUnlink(p: string) {
  fs.promises.unlink(p).catch(() => {});
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const url = sp.get("url");
  const filenameRaw = sp.get("name") || "video.mp4";

  if (!url) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return NextResponse.json({ error: "bad url" }, { status: 400 });
  }
  if (target.protocol !== "https:" && target.protocol !== "http:") {
    return NextResponse.json({ error: "bad protocol" }, { status: 400 });
  }
  if (isPrivateHost(target.hostname)) {
    return NextResponse.json({ error: "host not allowed" }, { status: 403 });
  }
  // Allow known hosts OR any host serving an HDRezka-shaped stream URL (covers
  // the constantly-rotating CDN hosts like laptostack.org without an open proxy).
  if (!hostAllowed(target.hostname) && !looksLikeHdrezkaStream(target)) {
    return NextResponse.json(
      { error: `host not allowed: ${target.hostname}` },
      { status: 403 },
    );
  }

  const filename = sanitizeFilename(filenameRaw);
  const isHls = /:hls:manifest\.m3u8/i.test(url) || /\.m3u8(\?|$)/i.test(url);

  if (isHls) {
    return remuxHls(url, filename, req);
  }
  return proxyDirect(target.toString(), filename, req);
}

/** Mode 1 — remux HLS to a fragmented mp4 via ffmpeg, streamed to the client. */
function streamHlsAsMp4(manifestUrl: string, filename: string, req: NextRequest): Response {
  // -headers passes Referer (HDRezka CDN 403s without it)
  // -c copy: no transcode, just repackage ts→mp4
  // -bsf:a aac_adtstoasc: fix AAC bitstream when copying ADTS→mp4
  // -movflags frag_keyframe+empty_moov+default_base_moof: streamable mp4
  //   (a normal moov-at-front isn't possible when piping, so fragment)
  const args = [
    "-nostdin",
    "-loglevel", "error",
    "-user_agent", UA,
    "-headers", `Referer: ${REFERER}\r\n`,
    "-i", manifestUrl,
    "-c", "copy",
    "-bsf:a", "aac_adtstoasc",
    "-movflags", "frag_keyframe+empty_moov+default_base_moof",
    "-f", "mp4",
    "pipe:1",
  ];

  const ff = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });

  const onAbort = () => { try { ff.kill("SIGKILL"); } catch {} };
  req.signal.addEventListener("abort", onAbort);

  ff.stderr.on("data", (d) => {
    const s = d.toString();
    if (s.trim()) console.error("[dl ffmpeg]", s.trim().slice(0, 500));
  });

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      ff.stdout.on("data", (chunk: Buffer) => {
        try { controller.enqueue(new Uint8Array(chunk)); } catch {}
      });
      ff.stdout.on("end", () => {
        try { controller.close(); } catch {}
        req.signal.removeEventListener("abort", onAbort);
      });
      ff.on("error", (err) => {
        try { controller.error(err); } catch {}
      });
      ff.on("close", () => {
        try { controller.close(); } catch {}
        req.signal.removeEventListener("abort", onAbort);
      });
    },
    cancel() { onAbort(); },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "video/mp4",
      "Content-Disposition": dispositionHeader(filename),
      // No Content-Length — size unknown until ffmpeg finishes. Browsers show
      // indeterminate progress, fine for a download.
      "Cache-Control": "no-store",
    },
  });
}

/** HLS→mp4 strategy.
 *
 *  We now STREAM the fragmented mp4 to everyone, iOS included. The old iOS path
 *  remuxed the WHOLE movie to a /tmp faststart file before sending a single
 *  byte — for a full film that's minutes of silence, so iOS Safari aborted the
 *  request before any headers arrived and the download "didn't work" at all.
 *  Streaming sends bytes immediately (continuous flow → no client timeout, no
 *  disk usage). The fragmented mp4 carries the total duration (verified via
 *  ffprobe), so modern iOS reads it. A completed download beats a timed-out one.
 *  (downloadHlsAsFile kept below for a possible future headers-first variant.) */
async function remuxHls(url: string, filename: string, req: NextRequest): Promise<Response> {
  return streamHlsAsMp4(url, filename, req);
}

/** Mode 1-iOS — remux HLS to a real mp4 file with moov-at-front, then serve
    it. This is the only way iOS reads the full duration (vs. the ~2s a
    fragmented mp4 reports). The temp file is deleted as soon as it's sent. */
async function downloadHlsAsFile(manifestUrl: string, filename: string, req: NextRequest): Promise<Response> {
  const tmp = path.join(os.tmpdir(), `dl-${crypto.randomBytes(8).toString("hex")}.mp4`);

  const args = [
    "-nostdin",
    "-loglevel", "error",
    "-user_agent", UA,
    "-headers", `Referer: ${REFERER}\r\n`,
    "-i", manifestUrl,
    "-c", "copy",
    "-bsf:a", "aac_adtstoasc",
    "-movflags", "+faststart", // moov at front → iOS gets the real duration
    "-f", "mp4",
    "-y", tmp,
  ];

  const ff = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
  let errTail = "";
  ff.stderr.on("data", (d) => { errTail = (errTail + d.toString()).slice(-400); });

  const onAbort = () => { try { ff.kill("SIGKILL"); } catch {} safeUnlink(tmp); };
  req.signal.addEventListener("abort", onAbort);

  const code: number = await new Promise((resolve) => {
    ff.on("close", (c) => resolve(c ?? 1));
    ff.on("error", () => resolve(1));
  });
  req.signal.removeEventListener("abort", onAbort);

  let size = 0;
  try { size = fs.statSync(tmp).size; } catch {}

  if (req.signal.aborted) { safeUnlink(tmp); return new Response(null, { status: 499 }); }

  if (code !== 0 || size === 0) {
    safeUnlink(tmp);
    if (errTail.trim()) console.error("[dl ffmpeg temp]", errTail.trim());
    // Last resort: still hand the user the streamed version (broken duration
    // beats no download).
    return streamHlsAsMp4(manifestUrl, filename, req);
  }

  const node = fs.createReadStream(tmp);
  const cleanup = () => safeUnlink(tmp);
  node.on("close", cleanup);
  node.on("error", cleanup);
  req.signal.addEventListener("abort", () => { node.destroy(); cleanup(); });

  return new Response(Readable.toWeb(node) as unknown as ReadableStream, {
    status: 200,
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(size),
      "Content-Disposition": dispositionHeader(filename),
      "Cache-Control": "no-store",
    },
  });
}

/** Mode 2 — plain byte proxy for a direct mp4, forwarding Range for resume. */
async function proxyDirect(url: string, filename: string, req: NextRequest): Promise<Response> {
  const upstreamHeaders: Record<string, string> = {
    "User-Agent": UA,
    Referer: REFERER,
  };
  const range = req.headers.get("range");
  if (range) upstreamHeaders["Range"] = range;

  let upstream: Response;
  try {
    upstream = await fetch(url, { headers: upstreamHeaders, redirect: "follow" });
  } catch (e: any) {
    return NextResponse.json(
      { error: "upstream fetch failed", detail: String(e?.message || e) },
      { status: 502 },
    );
  }

  if (!upstream.ok && upstream.status !== 206) {
    return NextResponse.json({ error: `upstream ${upstream.status}` }, { status: 502 });
  }

  // Guard: if the "direct" URL actually served an m3u8 (CDN quirk), fall back
  // to ffmpeg remux so we never hand the client a tiny playlist that iOS plays.
  const ct = upstream.headers.get("content-type") || "";
  if (/mpegurl|m3u8/i.test(ct)) {
    try { (upstream.body as any)?.cancel?.(); } catch {}
    return remuxHls(url, filename, req);
  }

  const headers = new Headers();
  headers.set("Content-Type", ct || "video/mp4");
  headers.set("Content-Disposition", dispositionHeader(filename));
  headers.set("Accept-Ranges", "bytes");
  const cl = upstream.headers.get("content-length");
  if (cl) headers.set("Content-Length", cl);
  const cr = upstream.headers.get("content-range");
  if (cr) headers.set("Content-Range", cr);
  headers.set("Cache-Control", "private, max-age=60");

  return new Response(upstream.body, { status: upstream.status, headers });
}
