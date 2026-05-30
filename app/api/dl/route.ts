import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";

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
  if (!hostAllowed(target.hostname)) {
    return NextResponse.json(
      { error: `host not allowed: ${target.hostname}` },
      { status: 403 },
    );
  }

  const filename = sanitizeFilename(filenameRaw);
  const isHls = /:hls:manifest\.m3u8/i.test(url) || /\.m3u8(\?|$)/i.test(url);

  if (isHls) {
    return streamHlsAsMp4(url, filename, req);
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
    return streamHlsAsMp4(url, filename, req);
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
