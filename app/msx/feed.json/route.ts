import { NextRequest, NextResponse } from "next/server";

/**
 * Каталог для Media Station X.
 *
 * MSX ставится из официальных магазинов Samsung и LG, поэтому это способ
 * попасть на эти телевизоры без режима разработчика и подписи.
 *
 * Важно: MSX — White Label, и оформление здесь НАШЕ. По документации
 * (Menu_Root_Object / Content_Root_Object) провайдер задаёт логотип, фон,
 * заголовок и прозрачность — именно поэтому каталоги разных сервисов внутри
 * MSX выглядят по-разному. Раскладку элементов задаёт она, всё остальное мы.
 *
 * Кроме того, MSX умеет ОТДАВАТЬ УПРАВЛЕНИЕ нашему приложению действием
 * system:hbbtv:launch (см. меню) — тогда виден наш интерфейс целиком. Работает
 * не на каждом телевизоре, поэтому этот каталог остаётся запасным путём.
 *
 * Один маршрут отдаёт все экраны, режим выбирается параметром view:
 *   list  — витрина категории (тренды / сериалы / новинки)
 *   item  — карточка: фильм сразу играется, у сериала показываются сезоны
 *   eps   — серии выбранного сезона
 *   play  — карточка серии с кнопкой воспроизведения
 *
 * Ссылки на поток резолвим ПРЯМО ПРИ ЗАПРОСЕ: у источника токены живут часами,
 * зашитые заранее протухнут.
 */
export const dynamic = "force-dynamic";

const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY || "275c9d09780aadb4b13ff57a731eda00";
const TMDB = "https://api.themoviedb.org/3";
const IMG = "https://sapkeflykino.ru/tmdb-img";
const RESOLVE = "https://kino.lead-seek.ru/hdrezka/api";
const SELF = "https://sapkeflykino.ru/msx/feed.json";

// MSX — стороннее приложение и читает нас кросс-доменно. Без этого заголовка
// браузер молча блокирует запрос, а MSX показывает «Data Load Error».
const HEADERS = { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" };

const TEMPLATE = {
  type: "separate",
  layout: "0,0,2,4",
  icon: "msx-white-soft:movie",
  color: "msx-glass",
};

// Фон и логотип на КАЖДОЙ странице каталога, иначе фирменным выглядит только
// стартовое меню, а внутри разделов приложение обезличивается.
const BRAND = {
  logo: "https://sapkeflykino.ru/logo.png",
  logoSize: "small",
  background: "https://sapkeflykino.ru/intro-logo-v2.jpg",
  transparent: 2,
};

type Any = Record<string, any>;

async function tmdb(path: string, params: Record<string, string> = {}): Promise<Any | null> {
  const q = new URLSearchParams({ api_key: TMDB_KEY, language: "ru-RU", ...params });
  try {
    const r = await fetch(`${TMDB}${path}?${q}`, { cache: "no-store" });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

/** Alloha отдаёт пару зеркал «A or B»; мёртвое зеркало = тайтл не играет. */
function firstMirror(u: string): string {
  return String(u || "").split(" or ")[0].trim();
}

const QORDER = ["1080", "1080p", "720", "720p", "480", "480p", "2160", "360", "360p"];

/**
 * Резолв потока той же цепочкой, что у сайта и ТВ-клиента: источник по коду
 * IMDb, затем запасной, затем поиск по названию. Без последнего шага тайтлы
 * без кода IMDb (свежие и российские) не играли бы вовсе.
 */
type Track = { name: string; quality: Record<string, string> };

/** Все дорожки источника — чтобы человек выбирал озвучку и качество сам. */
async function resolveTracks(
  id: string, type: "movie" | "tv", season?: string, episode?: string,
): Promise<Track[]> {
  const details = await tmdb(`/${type}/${id}`);
  const ids = await tmdb(`/${type}/${id}/external_ids`);
  const imdb = ids?.imdb_id;
  const tail = type === "tv" ? `&season=${season || 1}&episode=${episode || 1}` : "";

  const urls: string[] = [];
  if (imdb) {
    urls.push(`${RESOLVE}/alloha-hls?imdb=${encodeURIComponent(imdb)}&type=${type}${tail}`);
    urls.push(`${RESOLVE}/cdnhub?imdb=${encodeURIComponent(imdb)}&type=${type}${tail}`);
  }
  if (type === "movie" && details) {
    const title = details.title || "";
    const year = String(details.release_date || "").slice(0, 4);
    const p = new URLSearchParams({ title, year, type: "movie" });
    if (details.original_title && details.original_title !== title) p.set("otitle", details.original_title);
    urls.push(`${RESOLVE}/vkmovie?${p}`);
  }

  for (const u of urls) {
    try {
      const d = await fetch(u, { cache: "no-store" }).then((r) => r.json());
      const tr = d?.translations;
      if (tr?.length) return tr as Track[];
    } catch {
      /* пробуем следующий источник */
    }
  }
  return [];
}

/** Название дорожки по-человечески: у источника это техническая строка
 *  «(rus) AC3 20 @ 192 kbps - MVO 2x2 / Kravec», на телевизоре нечитаемо. */
function dubName(raw: string): string {
  let s = String(raw || "").replace(/^\s*\((?:rus|ru|eng|ukr|[a-z]{2,3})\)\s*/i, "");
  const dash = s.lastIndexOf(" - ");
  if (dash > -1) s = s.slice(dash + 3);
  s = s.replace(/\b(AC3|AAC|E-?AC3|DTS|MP3)\b/gi, "")
       .replace(/\d+\s*@\s*\d+\s*kbps/gi, "")
       .replace(/\s{2,}/g, " ").trim();
  return s || String(raw || "").trim() || "Дорожка";
}

function qualitiesOf(t: Track): string[] {
  const q = t.quality || {};
  const out = QORDER.filter((k) => q[k]);
  return out.length ? out : Object.keys(q);
}

/** Экран выбора озвучки. */
function tracksPage(headline: string, tracks: Track[], back: string) {
  if (!tracks.length) {
    return {
      ...BRAND, type: "list", headline,
      template: { ...TEMPLATE, layout: "0,0,8,2" },
      items: [{
        title: "Пока недоступно",
        titleFooter: "ни один источник не отдал этот тайтл",
        icon: "error",
        action: "info:Попробуйте другую серию или зайдите позже — каталог пополняется.",
      }],
    };
  }
  return {
    ...BRAND, type: "list", headline,
    template: { ...TEMPLATE, layout: "0,0,8,1" },
    items: tracks.map((t, i) => ({
      title: dubName(t.name),
      titleFooter: "качество: " + qualitiesOf(t).join(", "),
      icon: "msx-white-soft:record-voice-over",
      action: `content:${back}&tr=${i}`,
    })),
  };
}

/** Экран выбора качества выбранной озвучки. */
function qualityPage(headline: string, track: Track) {
  const qs = qualitiesOf(track);
  return {
    ...BRAND, type: "list", headline: headline + " · " + dubName(track.name),
    template: { ...TEMPLATE, layout: "0,0,4,1" },
    items: qs.map((q) => ({
      title: q.replace(/p$/, "") + "p",
      titleFooter: q === "2160" ? "4K" : "",
      icon: "msx-white-soft:play-arrow",
      // video:plugin: отдаёт воспроизведение НАШЕЙ странице вместо системного
      // плеера телевизора. На Samsung 2016+ MSX играет через Tizen AVPlay, и он
      // наш поток даже не запросил (в логах ноль обращений за видео), тогда как
      // на LG с HTML5-плеером всё заиграло.
      action: `video:plugin:https://sapkeflykino.ru/tvapp/msx-player.html?u=${encodeURIComponent(firstMirror(track.quality[q]))}`,
    })),
  };
}

function poster(p?: string | null) {
  return p ? `${IMG}/w342${p}` : "";
}

/** Витрина категории: плитки с постерами. */
async function viewList(cat: string) {
  const map: Record<string, { path: string; type: "movie" | "tv"; title: string }> = {
    trending: { path: "/trending/movie/week", type: "movie", title: "Сейчас в тренде" },
    tv: { path: "/tv/popular", type: "tv", title: "Популярные сериалы" },
    latest: { path: "/movie/now_playing", type: "movie", title: "Новинки" },
  };
  const c = map[cat] || map.trending;
  const d = await tmdb(c.path);
  const items = (d?.results || []).slice(0, 40).map((m: Any) => ({
    title: m.title || m.name,
    titleFooter: String(m.release_date || m.first_air_date || "").slice(0, 4),
    image: poster(m.poster_path),
    action: `content:${SELF}?view=item&id=${m.id}&type=${c.type}`,
  }));
  return { ...BRAND, type: "list", headline: c.title, template: TEMPLATE, items };
}

/** Карточка: фильм играем сразу, у сериала показываем сезоны. */
async function viewItem(id: string, type: "movie" | "tv", tr?: string | null) {
  const d = await tmdb(`/${type}/${id}`);
  if (!d) return { ...BRAND, type: "list", headline: "Не найдено", items: [] };

  if (type === "tv") {
    const seasons = (d.seasons || []).filter((s: Any) => s.season_number > 0);
    return {
      ...BRAND,
      type: "list",
      headline: d.name,
      template: { ...TEMPLATE, layout: "0,0,4,1" },
      items: seasons.map((s: Any) => ({
        title: `Сезон ${s.season_number}`,
        titleFooter: s.episode_count ? `${s.episode_count} серий` : "",
        image: poster(s.poster_path || d.poster_path),
        action: `content:${SELF}?view=eps&id=${id}&season=${s.season_number}`,
      })),
    };
  }

  const tracks = await resolveTracks(id, "movie");
  const back = `${SELF}?view=item&id=${id}&type=movie`;
  if (tr != null && tracks[Number(tr)]) return qualityPage(d.title, tracks[Number(tr)]);
  return tracksPage(d.title, tracks, back);
}

/** Список серий сезона. */
async function viewEps(id: string, season: string) {
  const d = await tmdb(`/tv/${id}/season/${season}`);
  const eps = d?.episodes || [];
  return {
    ...BRAND,
    type: "list",
    headline: `Сезон ${season}`,
    template: { ...TEMPLATE, layout: "0,0,8,1" },
    items: eps.map((e: Any) => ({
      title: `${e.episode_number}. ${e.name || "Серия " + e.episode_number}`,
      titleFooter: String(e.air_date || ""),
      image: poster(e.still_path || d?.poster_path),
      action: `content:${SELF}?view=play&id=${id}&season=${season}&episode=${e.episode_number}`,
    })),
  };
}

/** Карточка серии с кнопкой воспроизведения. */
async function viewPlay(id: string, season: string, episode: string, tr: string | null) {
  const tracks = await resolveTracks(id, "tv", season, episode);
  const head = `Серия ${episode}`;
  const back = `${SELF}?view=play&id=${id}&season=${season}&episode=${episode}`;
  if (tr !== null && tracks[Number(tr)]) return qualityPage(head, tracks[Number(tr)]);
  return tracksPage(head, tracks, back);
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const view = p.get("view") || "list";
  const id = p.get("id") || "";
  const type = (p.get("type") === "tv" ? "tv" : "movie") as "movie" | "tv";

  let body: Any;
  const tr = p.get("tr");
  if (view === "item") body = await viewItem(id, type, tr);
  else if (view === "eps") body = await viewEps(id, p.get("season") || "1");
  else if (view === "play") body = await viewPlay(id, p.get("season") || "1", p.get("episode") || "1", tr);
  else body = await viewList(p.get("cat") || "trending");

  return NextResponse.json(body, { headers: HEADERS });
}
