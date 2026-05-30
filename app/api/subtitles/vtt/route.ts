import { NextResponse } from "next/server";

// SRT timecode "00:03:34,555 --> 00:03:35,618" -> WEBVTT "00:03:34.555 --> 00:03:35.618"
const TIMECODE_RE = /(\d{2}:\d{2}:\d{2}),(\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}),(\d{3})/g;
// Strip legacy <font color="..."> SRT styling — VTT players ignore it anyway
const FONT_TAG_RE = /<\/?font[^>]*>/gi;

function srtToVtt(srt: string): string {
  const body = srt
    .replace(/\r\n/g, "\n")
    .replace(TIMECODE_RE, "$1.$2 --> $3.$4")
    .replace(FONT_TAG_RE, "")
    // Drop SRT cue numbers on their own line — VTT allows them but they're noise
    .replace(/^\d+\n(?=\d{2}:\d{2}:\d{2}\.)/gm, "");
  return "WEBVTT\n\n" + body.trim() + "\n";
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const wyzieUrl = url.searchParams.get("u");
  if (!wyzieUrl) return NextResponse.json({ error: "u param required" }, { status: 400 });

  // Whitelist: only proxy wyzie URLs
  if (!/^https:\/\/sub\.wyzie\.io\//.test(wyzieUrl)) {
    return NextResponse.json({ error: "invalid source" }, { status: 400 });
  }

  try {
    // Force SRT — wyzie returns it reliably; we convert client-side format here
    const u = new URL(wyzieUrl);
    u.searchParams.set("format", "srt");
    u.searchParams.set("encoding", "UTF-8");

    const res = await fetch(u.toString(), {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; sapkeflykino/1.0)" },
    });

    if (!res.ok) return NextResponse.json({ error: `upstream ${res.status}` }, { status: 502 });

    const srt = await res.text();
    const vtt = srtToVtt(srt);

    return new NextResponse(vtt, {
      headers: {
        "Content-Type": "text/vtt; charset=utf-8",
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: "fetch failed" }, { status: 502 });
  }
}
