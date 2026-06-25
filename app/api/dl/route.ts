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

// ── HLS→mp4 with a resumable disk cache (fixes iOS background downloads) ──────
//
// Plain streaming has no Content-Length and no Range, so iOS won't background it:
// leave Safari and the suspended connection drops with nothing to resume → the
// download "fails". Instead we ffmpeg-remux into a CACHE FILE that keeps writing
// even after the client disconnects, and serve it with Accept-Ranges. So:
//   • first request streams the growing file (bytes flow immediately, no abort);
//   • if the user backgrounds Safari and it drops, ffmpeg STILL finishes the file;
//   • iOS retries/resumes with a Range request → we serve 206 from the finished
//     file → the download completes in the background.
const CACHE_DIR = path.join(os.tmpdir(), "dlcache");
const remuxing = new Set<string>();

function cacheKey(url: string): string {
  return crypto.createHash("sha1").update(url).digest("hex");
}

// Best-effort: drop cache files older than 12h so /tmp doesn't grow unbounded.
function cleanupCache(): void {
  fs.readdir(CACHE_DIR, (e, files) => {
    if (e) return;
    const now = Date.now();
    for (const f of files) {
      const p = path.join(CACHE_DIR, f);
      fs.stat(p, (e2, st) => {
        if (!e2 && now - st.mtimeMs > 12 * 3600 * 1000) safeUnlink(p);
      });
    }
  });
}

/** Spawn ffmpeg to remux url → cache file, marking `<file>.done` on success.
 *  Deliberately NOT tied to req.signal — it keeps running after the client
 *  leaves, so a backgrounded iOS download can resume from the finished file. */
function ensureRemux(url: string, file: string, donePath: string, key: string): void {
  if (remuxing.has(key) || fs.existsSync(donePath)) return;
  remuxing.add(key);
  try { fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch {}
  safeUnlink(file); // start fresh
  const args = [
    "-nostdin", "-loglevel", "error",
    "-user_agent", UA, "-headers", `Referer: ${REFERER}\r\n`,
    "-i", url, "-c", "copy", "-bsf:a", "aac_adtstoasc",
    // fragmented mp4: valid at every prefix (so the growing file streams + Range
    // works), and modern iOS still reads its duration.
    "-movflags", "frag_keyframe+empty_moov+default_base_moof",
    "-f", "mp4", "-y", file,
  ];
  const ff = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
  let errTail = "";
  ff.stderr.on("data", (d) => { errTail = (errTail + d.toString()).slice(-400); });
  const finish = (ok: boolean) => {
    remuxing.delete(key);
    let size = 0; try { size = fs.statSync(file).size; } catch {}
    if (ok && size > 0) fs.writeFile(donePath, "1", () => {});
    else { if (errTail.trim()) console.error("[dl ffmpeg]", errTail.trim()); safeUnlink(file); }
  };
  ff.on("close", (c) => finish(c === 0));
  ff.on("error", () => finish(false));
}

/** Serve a finished cache file, honouring Range (206) so iOS can resume. */
function serveCompleteRange(file: string, size: number, range: string | null, filename: string): Response {
  let start = 0;
  let end = size - 1;
  const m = /bytes=(\d+)-(\d*)/.exec(range || "");
  if (m) {
    start = parseInt(m[1], 10);
    if (m[2]) end = Math.min(parseInt(m[2], 10), size - 1);
    if (start >= size || start < 0) start = 0;
  }
  const node = fs.createReadStream(file, { start, end });
  const headers: Record<string, string> = {
    "Content-Type": "video/mp4",
    "Content-Disposition": dispositionHeader(filename),
    "Accept-Ranges": "bytes",
    "Content-Length": String(end - start + 1),
    "Cache-Control": "no-store",
  };
  if (m) headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
  return new Response(Readable.toWeb(node) as unknown as ReadableStream, {
    status: m ? 206 : 200,
    headers,
  });
}

/** Stream the cache file as it grows (ffmpeg still writing), closing at EOF once
 *  `<file>.done` exists. Sends bytes immediately so the client never times out. */
function streamFromCache(file: string, donePath: string, filename: string, req: NextRequest): Response {
  let pos = 0;
  let stopped = false;
  let fh: fs.promises.FileHandle | undefined;
  const close = async () => {
    stopped = true;
    if (fh) { try { await fh.close(); } catch {} fh = undefined; }
  };
  req.signal.addEventListener("abort", () => { void close(); });

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (stopped) { controller.close(); return; }
        if (!fh) {
          // ffmpeg (started async in ensureRemux) may not have created the file
          // yet, or a /tmp reaper deleted it mid-flight. Wait for it instead of
          // letting open() throw ENOENT — that error, raised after the 200 is
          // already sent, resets the upstream connection and nginx returns its
          // own 502 (the iOS-download bug). Give up gracefully if it never shows.
          let waited = 0;
          while (!stopped && !fs.existsSync(file)) {
            if (fs.existsSync(donePath)) { controller.close(); return; }
            if (waited >= 30000) { controller.close(); return; }
            await new Promise((r) => setTimeout(r, 250));
            waited += 250;
          }
          if (stopped) { controller.close(); return; }
          try { fh = await fs.promises.open(file, "r"); }
          catch { controller.close(); return; }
        }
        while (!stopped) {
          let size = 0;
          try { size = (await fh.stat()).size; } catch {}
          if (pos < size) {
            const len = Math.min(256 * 1024, size - pos);
            const buf = Buffer.alloc(len);
            const { bytesRead } = await fh.read(buf, 0, len, pos);
            if (bytesRead > 0) {
              pos += bytesRead;
              controller.enqueue(new Uint8Array(buf.subarray(0, bytesRead)));
              return; // one chunk per pull
            }
          }
          if (fs.existsSync(donePath) && pos >= size) {
            await close();
            controller.close();
            return;
          }
          await new Promise((r) => setTimeout(r, 250)); // wait for more bytes
        }
        controller.close();
      } catch (e) {
        // Close (truncate) rather than error: erroring after the 200 is sent
        // resets the upstream connection → nginx 502 and can crash the worker.
        // iOS resumes via Range once `<file>.done` exists, so truncation is safe.
        console.error("[dl cache]", (e as Error)?.message || e);
        try { controller.close(); } catch {}
        await close();
      }
    },
    cancel() { void close(); },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "video/mp4",
      "Content-Disposition": dispositionHeader(filename),
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
    },
  });
}

async function remuxHls(url: string, filename: string, req: NextRequest): Promise<Response> {
  cleanupCache();
  const key = cacheKey(url);
  const file = path.join(CACHE_DIR, key + ".mp4");
  const donePath = file + ".done";

  // Low on disk and nothing cached yet → fall back to a plain ffmpeg pipe
  // (no caching) so a download still works without risking the disk.
  const free = await freeBytes(os.tmpdir());
  if (free !== null && free < MIN_FREE_BYTES && !fs.existsSync(donePath)) {
    return streamHlsAsMp4(url, filename, req);
  }

  ensureRemux(url, file, donePath, key);

  const range = req.headers.get("range");
  if (fs.existsSync(donePath)) {
    let size = 0; try { size = fs.statSync(file).size; } catch {}
    if (size > 0) return serveCompleteRange(file, size, range, filename);
  }
  // Not finished yet → stream the growing file from the start (ignore Range; the
  // client restarts, but ffmpeg keeps caching, so a later resume hits the
  // finished-file path above and gets a proper 206).
  return streamFromCache(file, donePath, filename, req);
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
