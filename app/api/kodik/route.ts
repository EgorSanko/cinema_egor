import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Плеер 5 — Kodik (18.09.2026).
 *
 * База Kodik специализируется на восточном контенте: аниме, дорамы, турецкие,
 * индийские и бразильские сериалы. Западное и российское туда не кладут (кроме
 * стримингов по их тематике), поэтому Kodik у нас не замена остальным плеерам,
 * а пятый — тот, что закрывает аниме и дорамы, где остальные пустые.
 *
 * Отдают только своё окно (iframe): в бесплатном режиме реклама внутри их
 * плеера оплачивает трафик. Прямые ссылки — платный режим со своей рекламой.
 *
 * Токен НЕ в коде: в репозитории стоит блокировка секретов, ключ живёт в
 * переменной окружения KODIK_TOKEN на сервере.
 */
const API = "https://kodik-api.com/search";
const ТИПЫ_ФИЛЬМОВ = "foreign-movie,soviet-cartoon,foreign-cartoon,russian-cartoon,anime,russian-movie";
const ТИПЫ_СЕРИАЛОВ = "cartoon-serial,documentary-serial,russian-serial,foreign-serial,anime-serial,multi-part-film";

type Найденное = {
  link?: string;
  title?: string;
  type?: string;
  year?: number;
  last_season?: number;
  last_episode?: number;
  translation?: { title?: string };
};

/** Ссылки приходят без схемы: «//kodikplayer.com/serial/...». */
function полныйАдрес(link: string): string {
  return link.startsWith("//") ? "https:" + link : link;
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const imdb = (p.get("imdb") || "").trim();
  const shikimori = (p.get("shikimori") || "").replace(/\D/g, "");
  const type = p.get("type") === "tv" ? "tv" : "movie";
  const токен = process.env.KODIK_TOKEN || "";

  if (!токен) return NextResponse.json({ ok: false, error: "no_token" });
  if (!/^tt\d+$/.test(imdb) && !shikimori) return NextResponse.json({ ok: false, error: "no_id" });

  const q = new URLSearchParams({
    token: токен,
    limit: "20",
    types: type === "tv" ? ТИПЫ_СЕРИАЛОВ : ТИПЫ_ФИЛЬМОВ,
  });
  if (/^tt\d+$/.test(imdb)) q.set("imdb_id", imdb);
  if (shikimori) q.set("shikimori_id", shikimori);

  try {
    const r = await fetch(`${API}?${q.toString()}`, { next: { revalidate: 3600 } });
    if (!r.ok) return NextResponse.json({ ok: false, error: "api_" + r.status });
    const d = await r.json();
    const список: Найденное[] = Array.isArray(d?.results) ? d.results : [];
    // Kodik уже сортирует выдачу по релевантности и приоритету озвучек
    // (дубляж и профессиональный многоголосый выше), поэтому берём первый
    // ответ со ссылкой.
    const найдено = список.find((x) => typeof x.link === "string" && x.link.length > 10);
    if (!найдено) {
      return NextResponse.json({ ok: false, error: "not_found" }, {
        headers: { "Cache-Control": "public, max-age=1800" },
      });
    }
    return NextResponse.json(
      {
        ok: true,
        link: полныйАдрес(найдено.link!),
        title: найдено.title || "",
        type: найдено.type || "",
        year: найдено.year || null,
        lastSeason: найдено.last_season ?? null,
        lastEpisode: найдено.last_episode ?? null,
        translation: найдено.translation?.title || "",
      },
      { headers: { "Cache-Control": "public, max-age=3600" } },
    );
  } catch {
    return NextResponse.json({ ok: false, error: "fetch_failed" });
  }
}
