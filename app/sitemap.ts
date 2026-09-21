import type { MetadataRoute } from "next";
import { getGenres, getPopularMovies, getPopularTV, getTrendingMovies, getTrendingTV } from "@/lib/tmdb";

/**
 * Карта сайта (21.09.2026).
 *
 * Её не было вовсе: /sitemap.xml отвечал страницей «не найдено», а в robots.txt
 * не было на неё ссылки. Поисковик знал только то, на что сам случайно набрёл
 * по ссылкам с главной. По логам за две недели это видно прямо: Googlebot
 * заходил 32 тысячи раз, а Яндекс — всего 2.5 тысячи, при том что зрители у
 * нас русскоязычные и идут в основном из Яндекса.
 *
 * Здесь перечислены разделы и карточки популярных фильмов и сериалов — около
 * тысячи адресов. Список собирается раз в сутки (revalidate ниже), поэтому на
 * каждый заход робота мы не ходим в TMDB заново.
 */
export const revalidate = 86400;

const САЙТ = "https://sapkeflykino.ru";

// Сколько страниц каталога забирать: на странице 20 карточек.
const СТРАНИЦ_ФИЛЬМОВ = 25;   // ~500 фильмов
const СТРАНИЦ_СЕРИАЛОВ = 15;  // ~300 сериалов

type Запись = MetadataRoute.Sitemap[number];

function адрес(путь: string, приоритет: number, частота: Запись["changeFrequency"]): Запись {
  return { url: САЙТ + путь, lastModified: new Date(), changeFrequency: частота, priority: приоритет };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const записи: Запись[] = [
    адрес("/", 1, "daily"),
    адрес("/tv", 0.9, "daily"),
    адрес("/anime", 0.9, "daily"),
    адрес("/collections", 0.8, "weekly"),
    адрес("/genres", 0.8, "weekly"),
    адрес("/terms", 0.2, "yearly"),
    адрес("/privacy", 0.2, "yearly"),
    адрес("/support", 0.3, "monthly"),
  ];

  // Жанры — отдельные страницы каталога, их стоит показать поиску целиком.
  try {
    const жанры = await getGenres();
    for (const ж of жанры || []) {
      if (ж?.id) записи.push(адрес(`/genres/${ж.id}`, 0.7, "weekly"));
    }
  } catch {}

  const собрать = async (
    грузить: (p: number) => Promise<any[]>,
    страниц: number,
    путь: "movie" | "tv",
    приоритет: number,
  ) => {
    const страницы = await Promise.all(
      Array.from({ length: страниц }, (_, i) =>
        грузить(i + 1).catch(() => [] as any[]),
      ),
    );
    const видели = new Set<number>();
    for (const список of страницы) {
      for (const э of список || []) {
        if (!э?.id || видели.has(э.id)) continue;
        видели.add(э.id);
        записи.push(адрес(`/${путь}/${э.id}`, приоритет, "weekly"));
      }
    }
  };

  await собрать(getPopularMovies, СТРАНИЦ_ФИЛЬМОВ, "movie", 0.8);
  await собрать(getPopularTV, СТРАНИЦ_СЕРИАЛОВ, "tv", 0.8);

  // Тренды недели — то, что ищут прямо сейчас; им приоритет выше.
  try {
    const [фильмы, сериалы] = await Promise.all([
      getTrendingMovies("week").catch(() => []),
      getTrendingTV("week").catch(() => []),
    ]);
    const уже = new Set(записи.map((з) => з.url));
    for (const ф of фильмы || []) {
      const u = `${САЙТ}/movie/${ф.id}`;
      if (ф?.id && !уже.has(u)) { уже.add(u); записи.push(адрес(`/movie/${ф.id}`, 0.9, "daily")); }
    }
    for (const с of сериалы || []) {
      const u = `${САЙТ}/tv/${с.id}`;
      if (с?.id && !уже.has(u)) { уже.add(u); записи.push(адрес(`/tv/${с.id}`, 0.9, "daily")); }
    }
  } catch {}

  return записи;
}
