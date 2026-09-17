import { NextRequest, NextResponse } from "next/server";
import { ALLOHA_AD_TOKEN } from "@/lib/kinopub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Отдельный адрес, а НЕ /msx/feed.json: тот путь nginx отдаёт статическим
// файлом из /var/www/msx-static, и новый режим туда просто не доходил — MSX
// получал старый каталог и уходил по его ссылке на /tvweb/.
const HEADERS = { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" };
const BRAND = {
  logo: "https://sapkeflykino.ru/logo.png",
  logoSize: "small",
  background: "https://sapkeflykino.ru/intro-logo-v2.jpg",
  transparent: 2,
};
const TEMPLATE = { type: "separate", layout: "0,0,2,4", icon: "msx-white-soft:movie", color: "msx-glass" };

/**
 * Окно Alloha в ПЛЕЕРЕ MSX (17.09.2026).
 *
 * Лёгкий ТВ-клиент на Samsung уходит сюда, когда видео есть только у Alloha.
 * Их окно прямо на странице клиента забирало кнопку «назад», и выйти было
 * нельзя. Здесь его играет плагин плеера MSX (tvapp/msx-alloha.html): пульт и
 * «назад» обрабатывает сама MSX. Верхнее action страницы запускает плеер сразу,
 * пункты ниже — повторить и вернуться в кинотеатр (там откроется та же карточка).
 */
function viewAlloha(p: URLSearchParams) {
  const id = (p.get("id") || "").replace(/\D/g, "");
  const type = p.get("type") === "tv" ? "tv" : "movie";
  const imdb = /^tt\d+$/.test(p.get("imdb") || "") ? p.get("imdb")! : "";
  const q = new URLSearchParams(imdb ? { imdb } : { tmdb: id });
  q.set("type", type === "tv" ? "serial" : "movie");
  if (type === "tv") { q.set("season", p.get("season") || "1"); q.set("episode", p.get("episode") || "1"); }
  const start = Math.floor(Number(p.get("start") || 0));
  if (start > 5) q.set("start", String(start));
  q.set("autoplay", "1");
  q.set("token", ALLOHA_AD_TOKEN);
  const allohaUrl = `https://player.sapkeflykino.ru/?${q.toString()}`;
  const plugin = `video:plugin:https://sapkeflykino.ru/tvapp/msx-alloha.html?src=${encodeURIComponent(allohaUrl)}${start > 5 ? `&start=${start}` : ""}`;
  const title = (p.get("title") || "Alloha").slice(0, 80);
  return {
    ...BRAND,
    type: "list",
    headline: title,
    action: plugin,
    template: { ...TEMPLATE, layout: "0,0,8,2" },
    items: [
      { title: "Вернуться в кинотеатр", titleFooter: "откроется та же карточка", icon: "msx-white-soft:arrow-back",
        action: "[settings:validate_links:0|link:https://sapkeflykino.ru/tvweb/?msx=1]" },
      { title: "Смотреть ещё раз", titleFooter: "плеер Alloha", icon: "msx-white-soft:play-arrow", action: plugin },
    ],
  };
}

export async function GET(req: NextRequest) {
  return NextResponse.json(viewAlloha(req.nextUrl.searchParams), { headers: HEADERS });
}
