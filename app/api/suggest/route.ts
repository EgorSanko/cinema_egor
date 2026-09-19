import { NextRequest, NextResponse } from "next/server";
import { searchMovies, searchTV } from "@/lib/tmdb";

export const runtime = "nodejs";

/**
 * Подсказки для поиска в шапке (19.09.2026).
 *
 * Раньше шапка дёргала два серверных действия (fetchMoviesBySearchAction и
 * fetchTVBySearchAction) на каждый набранный кусок. Серверные действия ходят
 * методом POST — такой ответ не кладётся ни в кэш браузера, ни в наш кэш, и
 * одинаковые запросы каждый раз считались заново. На телефоне это и читалось
 * как «ищешь — выдаёт долго».
 *
 * Обычный GET решает сразу три вещи: ответ кэшируется на полчаса (повторный
 * набор того же слова отвечает мгновенно), запрос можно отменить, когда
 * человек допечатал следующую букву, и запрос теперь один вместо двух.
 */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  if (q.length < 2) return NextResponse.json({ results: [] });

  try {
    const [фильмы, сериалы] = await Promise.all([searchMovies(q, 1), searchTV(q, 1)]);
    const results = [
      ...(фильмы || []).slice(0, 4).map((m: any) => ({
        id: m.id, media_type: "movie", title: m.title,
        poster_path: m.poster_path, release_date: m.release_date, vote_average: m.vote_average,
      })),
      ...(сериалы || []).slice(0, 3).map((t: any) => ({
        id: t.id, media_type: "tv", name: t.name,
        poster_path: t.poster_path, first_air_date: t.first_air_date, vote_average: t.vote_average,
      })),
    ];
    return NextResponse.json({ results }, {
      headers: { "Cache-Control": "public, max-age=300, s-maxage=1800, stale-while-revalidate=86400" },
    });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
