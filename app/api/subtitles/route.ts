import { NextResponse } from "next/server";

const WYZIE_BASE = "https://sub.wyzie.io";

// Only ru + en. Wyzie returns 20+ languages we don't need; users want clean UI.
const ALLOWED_LANGS = new Set(["ru", "en"]);
const PRIORITY_LANGS = ["ru", "en"];

interface WyzieSub {
  id: string;
  url: string;
  flagUrl?: string;
  format: string;
  encoding: string;
  display: string;
  language: string;
  isHearingImpaired: boolean;
  source: string;
  release?: string;
  downloadCount?: number;
}

export async function GET(req: Request) {
  const key = process.env.WYZIE_API_KEY;
  if (!key) return NextResponse.json({ error: "WYZIE_API_KEY not configured" }, { status: 500 });

  const url = new URL(req.url);
  const tmdb = url.searchParams.get("tmdb");
  const season = url.searchParams.get("season");
  const episode = url.searchParams.get("episode");

  if (!tmdb) return NextResponse.json({ error: "tmdb param required" }, { status: 400 });

  const params = new URLSearchParams({ id: tmdb, key });
  if (season) params.set("season", season);
  if (episode) params.set("episode", episode);

  try {
    const res = await fetch(`${WYZIE_BASE}/search?${params}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; sapkeflykino/1.0)" },
      // 10 min cache — same season+episode rarely changes
      next: { revalidate: 600 },
    });

    if (!res.ok) {
      // 400 from wyzie usually means "no subs found" — treat as empty list
      if (res.status === 400) return NextResponse.json({ subs: [] });
      return NextResponse.json({ error: `wyzie ${res.status}` }, { status: 502 });
    }

    const data: WyzieSub[] = await res.json();

    // Keep only allowed langs, group by (language + HI flag), top 3 per group.
    // Wyzie sometimes serves mojibake bytes for the most popular SRT, so users
    // need a fallback to pick a different release that decodes cleanly.
    const grouped = new Map<string, WyzieSub[]>();
    for (const s of data) {
      if (!ALLOWED_LANGS.has(s.language)) continue;
      const key = `${s.language}:${s.isHearingImpaired ? "hi" : "n"}`;
      const arr = grouped.get(key) || [];
      arr.push(s);
      grouped.set(key, arr);
    }
    const flat: WyzieSub[] = [];
    for (const [, arr] of grouped) {
      arr.sort((a, b) => (b.downloadCount || 0) - (a.downloadCount || 0));
      flat.push(...arr.slice(0, 3));
    }

    const subs = flat
      .map((s, idx) => ({
        id: s.id,
        language: s.language,
        display: s.display,
        hi: s.isHearingImpaired,
        flagUrl: s.flagUrl,
        release: s.release,
        // Proxied through our backend — handles SRT->VTT conversion + dodges CORS
        vttUrl: `/api/subtitles/vtt?u=${encodeURIComponent(s.url)}`,
      }))
      .sort((a, b) => {
        const ai = PRIORITY_LANGS.indexOf(a.language);
        const bi = PRIORITY_LANGS.indexOf(b.language);
        if (ai === -1 && bi === -1) return a.display.localeCompare(b.display);
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });

    return NextResponse.json({ subs });
  } catch (e) {
    return NextResponse.json({ error: "fetch failed" }, { status: 502 });
  }
}
