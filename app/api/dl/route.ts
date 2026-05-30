import { NextRequest, NextResponse } from "next/server";

// Streaming proxy for HDRezka mp4 downloads. Two reasons it exists:
//  1. Android Chrome ignores the `download` attribute on cross-origin <a>,
//     so the mp4 just plays in a tab. Going through /api/dl makes the
//     request same-origin → `download` is honored.
//  2. We can set Content-Disposition with a proper UTF-8 filename
//     (RFC 5987), so users get "Силиконовая долина S01E01 [1080p].mp4"
//     instead of "xjtoc.mp4" or mojibake.
//
// Bandwidth caveat: every byte streams through this VPS. Acceptable for
// occasional downloads; if this becomes a hot path, move to Cloudflare R2
// or a Bunny pull-zone in front.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Whitelist of allowed upstream hosts. Without this we're an open
// mp4 redirector and someone will use us to hammer random hosts.
const ALLOWED_HOST_PATTERNS = [
  /^([a-z0-9-]+\.)?vdbmate\.org$/i,
  /^([a-z0-9-]+\.)?hdrezka(-ag)?\.[a-z]+$/i,
  /^([a-z0-9-]+\.)?prx-?\d*\.[a-z]+$/i,
];

function hostAllowed(host: string): boolean {
  return ALLOWED_HOST_PATTERNS.some((re) => re.test(host));
}

function sanitizeFilename(raw: string): string {
  // Strip control chars and path separators. Cap at 200 chars to keep the
  // header reasonable.
  return raw.replace(/[\r\n"\\\/]/g, "_").trim().slice(0, 200) || "video.mp4";
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
  if (!hostAllowed(target.hostname)) {
    return NextResponse.json(
      { error: `host not allowed: ${target.hostname}` },
      { status: 403 },
    );
  }

  const upstreamHeaders: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
    Referer: "https://hdrezka.ag/",
  };
  // Forward Range header so the browser can resume / seek mid-download.
  const range = req.headers.get("range");
  if (range) upstreamHeaders["Range"] = range;

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), {
      headers: upstreamHeaders,
      redirect: "follow",
      // No timeout — large movies legitimately take minutes
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "upstream fetch failed", detail: String(e?.message || e) },
      { status: 502 },
    );
  }

  if (!upstream.ok && upstream.status !== 206) {
    return NextResponse.json(
      { error: `upstream ${upstream.status}` },
      { status: 502 },
    );
  }

  const filename = sanitizeFilename(filenameRaw);
  // RFC 5987 — filename* takes a UTF-8 percent-encoded value, which is the
  // only way to ship Cyrillic without mojibake. Keep a plain `filename=`
  // fallback for ancient clients.
  const asciiFallback = filename.replace(/[^\x20-\x7E]/g, "_");
  const disposition = `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;

  const headers = new Headers();
  headers.set("Content-Type", upstream.headers.get("content-type") || "video/mp4");
  headers.set("Content-Disposition", disposition);
  headers.set("Accept-Ranges", "bytes");
  const cl = upstream.headers.get("content-length");
  if (cl) headers.set("Content-Length", cl);
  const cr = upstream.headers.get("content-range");
  if (cr) headers.set("Content-Range", cr);
  // Cache control: short, just so a refresh during download doesn't re-fetch
  headers.set("Cache-Control", "private, max-age=60");

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
}
