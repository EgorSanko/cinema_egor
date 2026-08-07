import { NextResponse } from "next/server";

/**
 * Меню для Media Station X — ПРОБНИК.
 *
 * Задача этой версии одна: выяснить, проигрывает ли старый телевизор (Tizen 2.4,
 * 2016 г.) наш HLS-поток. Поэтому здесь всего пара тайтлов, зато в разных
 * качествах — чтобы сразу увидеть, что заходит, а что нет. Каталог, поиск и
 * серии добавим, только если проба удастся.
 *
 * Ссылки на поток резолвим ПРЯМО СЕЙЧАС, при запросе: у VK токены живут часами,
 * зашитые заранее ссылки протухли бы.
 */
export const dynamic = "force-dynamic";

type Probe = { label: string; imdb: string; type: "movie" | "tv"; season?: number; episode?: number };

const PROBES: Probe[] = [
  { label: "Лакомый кусок — фильм", imdb: "tt32642706", type: "movie" },
  { label: "Офис — сезон 2, серия 1", imdb: "tt0386676", type: "tv", season: 2, episode: 1 },
];

/** Первое зеркало из строки вида "https://A... or https://B..." (Alloha отдаёт пару). */
function firstMirror(url: string): string {
  return String(url || "").split(" or ")[0].trim();
}

async function resolveQualities(p: Probe): Promise<Record<string, string>> {
  const q = new URLSearchParams({ imdb: p.imdb, type: p.type });
  if (p.type === "tv") {
    q.set("season", String(p.season || 1));
    q.set("episode", String(p.episode || 1));
  }
  try {
    const r = await fetch(`https://kino.lead-seek.ru/hdrezka/api/alloha-hls?${q}`, { cache: "no-store" });
    const d = await r.json();
    return d?.translations?.[0]?.quality || {};
  } catch {
    return {};
  }
}

export async function GET() {
  const items: any[] = [];

  for (const p of PROBES) {
    const quality = await resolveQualities(p);
    // Порядок от лёгкого к тяжёлому: на телевизоре 2016 года 480p имеет больше
    // шансов, чем 1080p, и по тому, что заиграет, сразу поймём потолок железа.
    for (const q of ["480", "720", "1080"]) {
      const url = quality[q];
      if (!url) continue;
      items.push({
        title: `${p.label} — ${q}p`,
        titleFooter: "нажмите OK, чтобы проверить воспроизведение",
        icon: "play-arrow",
        action: `video:${firstMirror(url)}`,
      });
    }
    if (!Object.keys(quality).length) {
      items.push({
        title: `${p.label} — поток не найден`,
        titleFooter: "источник не отдал ссылку",
        icon: "error",
        action: "info:Источник сейчас не отдаёт этот тайтл",
      });
    }
  }

  return NextResponse.json(
    // По параметру «menu:» MSX ждёт ОБЪЕКТ МЕНЮ: массив menu, где у каждого
    // пункта в data лежит объект контента. Сначала я отдал сразу контент —
    // приложение ответило «Menu is missing» (проверено в самой MSX).
    {
      headline: "SAPKEFLY KINO",
      menu: [
        {
          label: "Проверка воспроизведения",
          icon: "play-arrow",
          data: {
            type: "list",
            headline: "Проверка воспроизведения",
            template: {
              type: "separate",
              layout: "0,0,8,2",
              color: "msx-glass",
            },
            items: items.length
              ? items
              : [{ title: "Ничего не зарезолвилось", titleFooter: "проверьте бэкенд", icon: "error" }],
          },
        },
      ],
    },
    {
      headers: {
        "Cache-Control": "no-store",
        // MSX — стороннее приложение (msx.benzac.de и веб-обёртки на ТВ), оно
        // читает наш JSON кросс-доменно. Без этого заголовка браузер молча
        // блокирует запрос, и MSX показывает «Data Load Error» (проверено).
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}
