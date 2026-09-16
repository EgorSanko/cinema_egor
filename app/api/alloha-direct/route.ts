import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Сырые ссылки Alloha для НАШЕГО плеера на домене плеера.
 *
 * Обычный /api/alloha-hls заворачивает каждую ссылку в наш прокси — и это
 * ровно то, чего надо избежать: VK закрывает серверный адрес за 2–3 минуты
 * (замер 15.09: наш сервер режут, браузер зрителя качает 92 куска из 92 без
 * отказов). Поэтому здесь отдаём ссылки КАК ЕСТЬ, а тянет их сам зритель со
 * своего адреса.
 *
 * Ключ к бэкенду держим на сервере: наружу уходят только ссылки, без wv и
 * bearer — иначе они утекут в исходник страницы.
 */

const БЭКЕНД = "https://kino.lead-seek.ru/hdrezka";
// Ключ живёт только в окружении (.env.local на сервере). В коде его быть не
// должно: репозиторий публичный, а с этим ключом бэкенд отдаёт сырые ссылки.
const СЕКРЕТ = process.env.ALLOHA_RAW_SECRET || "";
const КЛЮЧ_TMDB = process.env.NEXT_PUBLIC_TMDB_API_KEY || process.env.TMDB_API_KEY || "";

async function imdbПоTmdb(tmdb: string, тип: "movie" | "tv"): Promise<string | null> {
  try {
    const о = await fetch(
      `https://api.themoviedb.org/3/${тип}/${tmdb}/external_ids?api_key=${КЛЮЧ_TMDB}`,
      { cache: "no-store", signal: AbortSignal.timeout(8000) },
    );
    if (!о.ok) return null;
    const д = await о.json();
    return д?.imdb_id || null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const п = req.nextUrl.searchParams;
  const tmdb = (п.get("tmdb") || "").trim();
  if (!/^\d+$/.test(tmdb)) {
    return NextResponse.json({ error: "нужен tmdb" }, { status: 400 });
  }
  const тип = п.get("type") === "tv" ? "tv" : "movie";

  const imdb = await imdbПоTmdb(tmdb, тип);
  if (!imdb) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const зпр = new URLSearchParams({ imdb, type: тип, secret: СЕКРЕТ });
  if (тип === "tv") {
    зпр.set("season", п.get("season") || "1");
    зпр.set("episode", п.get("episode") || "1");
  }

  try {
    const о = await fetch(`${БЭКЕНД}/api/alloha-raw?${зпр}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    });
    const д = await о.json();
    if (д?.error) {
      return NextResponse.json({ error: д.error }, { status: 404 });
    }
    // Наружу — только то, что нужно плееру.
    return NextResponse.json(
      { translations: д.translations || [], skipTime: д.skipTime ?? null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "источник не ответил" }, { status: 502 });
  }
}
