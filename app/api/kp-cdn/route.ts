import { NextRequest } from "next/server";

// Same-origin прокси видео kino.pub. Гоним поток через наш домен, т.к. браузер
// юзера без VPN делает холодный/битый коннект к чужим CDN, а наш VPS до них
// дотягивается быстро. Два источника:
//   • Фильмы/сериалы: cdntogo.net — сегменты в плейлистах АБСОЛЮТНЫЕ (.ts).
//   • Спорт (live): mycdn.video — fMP4, URL в плейлистах ОТНОСИТЕЛЬНЫЕ (?token=).
// Поэтому переписываем плейлисты построчно с резолвом каждой ссылки от базы
// (new URL(uri, base)) → абсолют → /api/kp-cdn. Сегменты стримим байтами.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = /^https:\/\/([a-z0-9.\-]+\.cdntogo\.net|[a-z0-9.\-]+\.mycdn\.video)\//i;

const proxied = (abs: string) => `/api/kp-cdn?u=${encodeURIComponent(abs)}`;

function rewritePlaylist(text: string, base: string): string {
  const rewriteUri = (uri: string): string => {
    try {
      const abs = new URL(uri, base).toString();
      return ALLOWED.test(abs) ? proxied(abs) : uri;
    } catch {
      return uri;
    }
  };
  return text
    .split("\n")
    .map((line) => {
      const t = line.trim();
      if (!t) return line;
      // Строки-теги: переписываем только URI="..." (EXT-X-MEDIA/KEY/MAP).
      if (t.startsWith("#")) return line.replace(/URI="([^"]+)"/g, (_m, u) => `URI="${rewriteUri(u)}"`);
      // Иначе строка — сама ссылка (вариант/сегмент), абсолютная или относительная.
      return rewriteUri(t);
    })
    .join("\n");
}

export async function GET(req: NextRequest) {
  const target = req.nextUrl.searchParams.get("u") || "";
  if (!ALLOWED.test(target)) return new Response("bad target", { status: 400 });

  const range = req.headers.get("range");
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      // cache:"no-store" критично: иначе Next кэширует upstream на диск → ENOSPC
      // на web-VPS (видео). Мы просто реле.
      cache: "no-store",
      headers: range ? { Range: range } : {},
      redirect: "follow",
    });
  } catch {
    return new Response("upstream error", { status: 502 });
  }

  const ct = (upstream.headers.get("content-type") || "").toLowerCase();
  const isPlaylist = /\.m3u8(\?|$)/i.test(target) || ct.includes("mpegurl");

  if (isPlaylist) {
    const text = await upstream.text();
    const rewritten = rewritePlaylist(text, target);
    return new Response(rewritten, {
      status: upstream.status,
      headers: { "content-type": "application/vnd.apple.mpegurl", "cache-control": "no-store" },
    });
  }

  // Сегмент (.ts/.fmp4) — стримим байты насквозь, сохраняя нужные заголовки.
  const headers = new Headers();
  for (const h of ["content-type", "content-length", "content-range", "accept-ranges"]) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  headers.set("cache-control", "no-store");
  return new Response(upstream.body, { status: upstream.status, headers });
}
