import { NextRequest, NextResponse } from "next/server";
import { ALLOHA_AD_TOKEN } from "@/lib/kinopub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Есть ли тайтл у Alloha.
 *
 * Плеер 1 — это ОКНО Alloha (их собственный плеер по нашему токену). Окно мы
 * открываем прямо по коду TMDB, спрашивать у них адрес не нужно. Но если
 * тайтла у них нет, окно покажет свою заглушку, а человек останется без
 * фильма: переключатель плееров есть только у Про.
 *
 * Поэтому перед показом окна спрашиваем их каталог: есть — открываем окно,
 * нет — плеер уходит на следующий источник (cdnhub, затем vkmovie), как было
 * и раньше.
 *
 * Своего потока Alloha официально не отдаёт, только окно. Раньше мы достали
 * прямые ссылки в обход, но VK закрывал такую сессию на 5–8 минуте — обратно
 * к этому не возвращаться.
 */

// Тот же токен, что стоит в адресе окна (он публичный и привязан к домену
// плеера), — берём из одного места, env позволяет подменить.
const ТОКЕН = process.env.ALLOHA_TOKEN || ALLOHA_AD_TOKEN;

// Ответ «есть/нет» у тайтла не меняется днями, а лимит у них 120 запросов в
// минуту на токен. Держим в памяти процесса, чтобы не тратить лимит на каждое
// открытие страницы.
const кэш = new Map<string, { есть: boolean; до: number }>();
const ЧАС = 3600_000;

export async function GET(req: NextRequest) {
  const п = req.nextUrl.searchParams;
  const tmdb = (п.get("tmdb") || "").trim();
  if (!/^\d+$/.test(tmdb)) {
    return NextResponse.json({ error: "нужен tmdb" }, { status: 400 });
  }
  const сериал = п.get("type") === "tv";
  const ключ = `${tmdb}:${сериал ? "serial" : "movie"}`;

  const было = кэш.get(ключ);
  if (было && было.до > Date.now()) {
    return NextResponse.json({ ok: было.есть }, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const адрес =
      `https://api.alloha.tv/?token=${encodeURIComponent(ТОКЕН)}` +
      `&tmdb=${encodeURIComponent(tmdb)}&type=${сериал ? "serial" : "movie"}`;
    // У их API сертификат периодически числится просроченным, а ответ при этом
    // верный. Ходим обычным fetch: Node с их цепочкой справляется, но таймаут
    // держим коротким — это проверка перед открытием плеера, ждать нельзя.
    const о = await fetch(адрес, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (!о.ok) {
      // Их API молчит — НЕ говорим «нет»: иначе при их аварии мы увели бы всех
      // с рабочего плеера. Отвечаем «есть» и даём окну попробовать само.
      return NextResponse.json({ ok: true, guessed: true }, { headers: { "Cache-Control": "no-store" } });
    }
    const д = await о.json();
    const есть = д?.status === "success" && !!д?.data?.token_movie;
    кэш.set(ключ, { есть, до: Date.now() + ЧАС });
    return NextResponse.json({ ok: есть }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: true, guessed: true }, { headers: { "Cache-Control": "no-store" } });
  }
}
