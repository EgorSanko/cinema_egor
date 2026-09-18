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
const кэш = new Map<string, { есть: boolean; by: "tmdb" | "imdb"; tm: string; до: number }>();
const ЧАС = 3600_000;

export async function GET(req: NextRequest) {
  const п = req.nextUrl.searchParams;
  const tmdb = (п.get("tmdb") || "").trim();
  if (!/^\d+$/.test(tmdb)) {
    return NextResponse.json({ error: "нужен tmdb" }, { status: 400 });
  }
  const сериал = п.get("type") === "tv";
  const ключ = `${tmdb}:${сериал ? "serial" : "movie"}`;

  // IMDb передаёт клиент: у части тайтлов в каталоге Alloha НЕ заполнен код
  // TMDB (так было с «Мэйдэй» 2026 — tmdb пустой, а imdb и kp есть). Тогда
  // ищем по IMDb, и окно открываем тоже по нему (поле by в ответе).
  const imdb = (п.get("imdb") || "").trim();
  const imdbOk = /^tt\d+$/.test(imdb);
  const ключПолный = ключ + ":" + (imdbOk ? imdb : "");

  const было = кэш.get(ключПолный);
  if (было && было.до > Date.now()) {
    return NextResponse.json({ ok: было.есть, by: было.by, tm: было.tm }, { headers: { "Cache-Control": "no-store" } });
  }

  // Вместе с ответом забираем token_movie — «паспорт» тайтла в их базе. Окно
  // надёжнее открывать по нему, чем по коду TMDB: у части тайтлов их каталог
  // просто не находит себя по внешним кодам (у «Тетради смерти» IMDb записан с
  // опечаткой — t0877057 вместо tt0877057, и окно по tmdb отвечало «контент не
  // найден», хотя все 37 серий у них есть).
  let токенФильма = "";
  const спросить = async (запрос: string): Promise<"да" | "нет" | "сбой"> => {
    try {
      const о = await fetch(
        `https://api.alloha.tv/?token=${encodeURIComponent(ТОКЕН)}&${запрос}&type=${сериал ? "serial" : "movie"}`,
        { headers: { Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(6000) },
      );
      if (!о.ok) return "сбой";
      const д = await о.json();
      if (д?.status === "success" && д?.data?.token_movie) {
        токенФильма = String(д.data.token_movie);
        return "да";
      }
      return "нет";
    } catch {
      return "сбой";
    }
  };

  const поTmdb = await спросить(`tmdb=${encodeURIComponent(tmdb)}`);
  let итог: { есть: boolean; by: "tmdb" | "imdb" } | null = null;
  if (поTmdb === "да") итог = { есть: true, by: "tmdb" };
  else if (imdbOk) {
    const поImdb = await спросить(`imdb=${encodeURIComponent(imdb)}`);
    if (поImdb === "да") итог = { есть: true, by: "imdb" };
    else if (поTmdb === "нет" && поImdb === "нет") итог = { есть: false, by: "tmdb" };
  } else if (поTmdb === "нет") итог = { есть: false, by: "tmdb" };

  // Их API молчит — НЕ говорим «нет»: иначе при их аварии мы увели бы всех
  // с рабочего плеера. Отвечаем «есть» и даём окну попробовать само.
  if (!итог) return NextResponse.json({ ok: true, by: "tmdb", guessed: true }, { headers: { "Cache-Control": "no-store" } });

  кэш.set(ключПолный, { есть: итог.есть, by: итог.by, tm: токенФильма, до: Date.now() + ЧАС });
  return NextResponse.json({ ok: итог.есть, by: итог.by, tm: токенФильма }, { headers: { "Cache-Control": "no-store" } });
}
