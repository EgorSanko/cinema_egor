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

const СТРАНИЦА_НЕТ_ФИЛЬМА = `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Нет в плеере</title>
<style>html,body{height:100%;margin:0}body{display:flex;align-items:center;justify-content:center;
background:#000;color:#fff;font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;
text-align:center;padding:0 24px}b{display:block;font-size:20px;margin-bottom:6px}
span{color:rgba(255,255,255,.6)}</style></head><body><div><b>Этого фильма пока нет в плеере</b>
<span>Мы уже знаем и добавим, как только он появится.</span></div></body></html>`;

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
    // Тайтла у них нет или API молчит. Отдаём страницу, а не JSON: адрес
    // открывается прямо в окне плеера, и при единственном плеере человек иначе
    // увидел бы на месте видео голый {"error":"не найдено"}.
    return new NextResponse(СТРАНИЦА_НЕТ_ФИЛЬМА, {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const url = new URL(адрес);
  if (сериал) {
    url.searchParams.set("season", п.get("season") || "1");
    url.searchParams.set("episode", п.get("episode") || "1");
  }
  // Продолжить с места остановки: их плеер понимает секунды в параметре start.
  const старт = Number(п.get("start") || 0);
  if (старт > 5) url.searchParams.set("start", String(Math.floor(старт)));

  // Автозапуска в самой ссылке НЕТ — и это намеренно. Окно монтируется
  // заранее, скрытым, пока человек читает описание: так «Смотреть» включает
  // уже прогруженный плеер, а не ждёт загрузки чужой страницы. Играть оно
  // начинает по команде postMessage {"api":"play"} из плеера.

  return NextResponse.redirect(url.toString(), {
    status: 302,
    headers: { "Cache-Control": "no-store" },
  });
}
