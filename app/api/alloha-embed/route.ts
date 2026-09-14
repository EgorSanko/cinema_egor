import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Адрес окна плеера Alloha для конкретного фильма или серии.
 *
 * Зачем так, а не как раньше. До 14.09 мы доставали у Alloha прямую ссылку на
 * видео и гнали поток через свой сервер. Оказалось, это обходной путь: ссылки
 * выпускались под ЧУЖОЙ домен (theatre.stravers.live), и VK резал такие сессии
 * через 5–8 минут — «зависает на шестой минуте». Проверено на трёх серверах и
 * на домашнем ПК: цифры совпадали до десятой доли минуты, дело не в нас.
 *
 * Официальный способ у Alloha один: их окно. Оно под нашим доменом и нашим
 * токеном играет часами, отдаёт 4K и все озвучки. Поэтому здесь мы только
 * спрашиваем у них адрес окна и уводим браузер на него.
 *
 * Токен запроса держим на сервере: в браузер уходит лишь готовый адрес окна.
 */

const БАЗА = "https://apbugall.org/v2";
const ТОКЕН = process.env.ALLOHA_API_TOKEN || "";

// token_movie у тайтла не меняется, а лимит запросов к их API — 120 в минуту на
// токен. Держим найденное в памяти, чтобы не тратить лимит на каждое открытие.
const кэш = new Map<string, { адрес: string; до: number }>();
const ЧАС = 3600_000;

async function адресОкна(tmdb: string, сериал: boolean): Promise<string | null> {
  const ключ = `${tmdb}:${сериал ? "serial" : "movie"}`;
  const есть = кэш.get(ключ);
  if (есть && есть.до > Date.now()) return есть.адрес;

  try {
    const о = await fetch(
      `${БАЗА}/movies/tmdb/${encodeURIComponent(tmdb)}?category=${сериал ? "serial" : "movie"}`,
      {
        headers: { Authorization: `Bearer ${ТОКЕН}`, Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!о.ok) return null;
    const д = await о.json();
    const адрес: string | undefined = д?.data?.iframe;
    if (!адрес) return null;
    кэш.set(ключ, { адрес, до: Date.now() + ЧАС });
    return адрес;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  if (!ТОКЕН) {
    return NextResponse.json({ error: "Alloha не настроена" }, { status: 503 });
  }

  const п = req.nextUrl.searchParams;
  const tmdb = (п.get("tmdb") || "").trim();
  if (!/^\d+$/.test(tmdb)) {
    return NextResponse.json({ error: "нужен tmdb" }, { status: 400 });
  }
  const сериал = п.get("type") === "tv";

  const адрес = await адресОкна(tmdb, сериал);
  if (!адрес) {
    // Тайтла у них нет или API молчит — пусть плеер уходит к другому источнику.
    return NextResponse.json({ error: "не найдено" }, { status: 404 });
  }

  const url = new URL(адрес);
  if (сериал) {
    url.searchParams.set("season", п.get("season") || "1");
    url.searchParams.set("episode", п.get("episode") || "1");
  }
  // Продолжить с места остановки: их плеер понимает секунды в параметре start.
  const старт = Number(п.get("start") || 0);
  if (старт > 5) url.searchParams.set("start", String(Math.floor(старт)));

  return NextResponse.redirect(url.toString(), {
    status: 302,
    headers: { "Cache-Control": "no-store" },
  });
}
