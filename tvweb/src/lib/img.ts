/**
 * Ссылки на картинки TMDB. Копия функций из lib/tmdb, без серверной части:
 * идём через НАШ прокси /tmdb-img — напрямую image.tmdb.org из России закрыт.
 */
const BASE = "/tmdb-img";

export function getImageUrl(path: string | null | undefined, size = "w500"): string {
  if (!path) return "";
  return `${BASE}/${size}${path}`;
}

export function getBackdropUrl(path: string | null | undefined, size = "w1280"): string {
  if (!path) return "";
  return `${BASE}/${size}${path}`;
}
