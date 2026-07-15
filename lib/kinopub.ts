// kino.pub — ad-free источник-фолбэк. Резолв идёт через наш Cloudflare Worker
// (RU-датацентры до kino.pub API ходят плохо, а CF-edge — надёжно; клиент зовёт
// воркер напрямую, воркер пускает только по Origin=sapkeflykino.ru). Воркер
// отдаёт единый адаптивный hls4-манифест: несколько качеств + все озвучки
// отдельными аудио-дорожками (мгновенное переключение через hls.js).
// Резолв/манифест воркера проксируем через НАШ домен (`/kp/` → nginx → воркер).
// Зачем: браузер юзера без VPN делал холодный DNS+TLS к workers.dev (~30с на
// первый коннект, потом тёплое). Через same-origin `/kp` браузер переиспользует
// уже тёплое соединение к sapkeflykino.ru → ноль холодных коннектов. Наш VPS до
// воркера ходит надёжно (10/10). Прямой абс. URL воркера нужен для замены хоста
// в возвращаемом hls4 (воркер строит его от своего origin).
export const KINOPUB_WORKER = "/kp";
const KINOPUB_WORKER_ABS = "https://kinopub-resolver.egor3sanko22.workers.dev";

// fetch с таймаутом на попытку + ретраи. Без VPN первое соединение RU-ISP к
// workers.dev часто сбрасывается/тормозит (DPI), а второе проходит («гонка
// соединений»). Одиночный fetch без таймаута → виснет навсегда («вечная
// загрузка»). Короткая пауза между попытками даёт DNS/TLS «прогреться».
async function fetchRetry(url: string, tries = 3, perTryMs = 7000): Promise<Response | null> {
  for (let i = 0; i < tries; i++) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), perTryMs);
    try {
      const r = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
      clearTimeout(to);
      if (r.ok) return r;
    } catch {
      clearTimeout(to);
    }
    if (i < tries - 1) await new Promise((f) => setTimeout(f, 400));
  }
  return null;
}

/** Прогрев соединения к воркеру (DNS+TLS) заранее — fire-and-forget. Зовём при
 *  заходе в kino.pub-режиме, чтобы к моменту play канал уже был живой (иначе
 *  первый холодный коннект без VPN сбрасывается и play висит). */
export function prewarmKinopub() {
  try { fetch(`${KINOPUB_WORKER}/health`, { cache: "no-store" }).catch(() => {}); } catch {}
}

const SOURCE_KEY = "kino_source"; // 'hdrezka' | 'kinopub' | 'zenithjs' | 'alloha'

export type KinoSource = "hdrezka" | "kinopub" | "zenithjs" | "alloha";

export function getSource(): KinoSource {
  // Дефолт для ВСЕХ — zenithjs (бесплатный источник). Явный выбор HDRezka/kino.pub
  // /alloha в профиле уважается; всё остальное (не задано / старые значения) →
  // zenithjs. alloha — тест-источник, тумблер виден только админам.
  try {
    const v = localStorage.getItem(SOURCE_KEY);
    return v === "kinopub" || v === "hdrezka" || v === "alloha" ? v : "zenithjs";
  } catch {
    return "zenithjs";
  }
}

// Оба «iframe-источника» (их плеер, не наш ArtPlayer): zenithjs (Collaps) и
// alloha. Плеер для них рендерит iframe из streamData.collapsEmbed.
export function isIframeSource(s?: KinoSource): boolean {
  const x = s || getSource();
  return x === "zenithjs" || x === "alloha";
}

// Alloha (VK Video cloud, 4K, все озвучки) — тест-источник. Резолвим imdb из
// TMDB → наш РФ-бэкенд /api/alloha (Alloha отдаёт только с РФ-IP) → iframe их
// плеера (сам держит озвучки/качество/серии). Для сериала прокидываем s/e.
export async function resolveAllohaEmbed(
  tmdbId: number, type: "movie" | "tv", season?: number, episode?: number,
): Promise<string | null> {
  try {
    const imdb = await fetchImdb(tmdbId, type);
    if (!imdb) return null;
    const r = await fetch(`https://kino.lead-seek.ru/hdrezka/api/alloha?imdb=${encodeURIComponent(imdb)}`).then((x) => x.json());
    // ТОЛЬКО Alloha (VK Video) — по решению Егора Плеер 2 = чисто Alloha, без
    // подмены на Collaps/др. Если у Alloha нет контента → null (плеер покажет
    // сообщение / юзер выберет Плеер 1/3).
    const block = (Array.isArray(r?.data) ? r.data : []).find((b: any) => b && b.type === "Alloha" && b.iframeUrl);
    if (!block) return null;
    let url: string = block.iframeUrl;
    if (type === "tv") url += (url.includes("?") ? "&" : "?") + `season=${season || 1}&episode=${episode || 1}`;
    return url;
  } catch {
    return null;
  }
}

// Единый резолвер iframe-embed по текущему источнику (zenithjs или alloha).
// opts.allohaFallbackToZenith: для FREE-тарифа (источник alloha) если у Alloha
// нет тайтла — падаем на zenithjs (Collaps), чтобы покрытие free не упало. Для
// Pro-плеера «Плеер 2» флаг НЕ ставим — там alloha строго без подмены.
export async function resolveIframeEmbed(
  tmdbId: number, type: "movie" | "tv", season?: number, episode?: number,
  opts?: { allohaFallbackToZenith?: boolean },
): Promise<string | null> {
  if (getSource() === "alloha") {
    const a = await resolveAllohaEmbed(tmdbId, type, season, episode);
    if (a) return a;
    if (opts?.allohaFallbackToZenith) return resolveZenithEmbed(tmdbId, type, season, episode);
    return null;
  }
  return resolveZenithEmbed(tmdbId, type, season, episode);
}

/** Zenithjs — сторонний iframe-плеер (тот же движок, что Lift) с собственными
 *  сезонами/сериями/озвучками. Принимает imdb-id прямо в URL. Резолвим imdb из
 *  TMDB external_ids и строим embed-ссылку. */
export async function resolveZenithEmbed(
  tmdbId: number, type: "movie" | "tv", season?: number, episode?: number,
): Promise<string | null> {
  // Проверяем, что движок collaps/zenithjs реально держит этот тайтл/серию —
  // через наш /api/collaps (тот же каталог, серверная проверка, кэш 5мин). Иначе
  // iframe просто отдал бы 404. null → плеер покажет сообщение (не битый фрейм).
  try {
    const p = new URLSearchParams({ tmdb_id: String(tmdbId), type: type === "tv" ? "tv" : "movie" });
    if (type === "tv") { p.set("season", String(season || 1)); p.set("episode", String(episode || 1)); }
    const d = await fetch(`/api/collaps/search?${p.toString()}`).then((r) => r.json());
    if (!d || !d.embed || !d.imdb) return null; // нет в каталоге
    let url = `https://api.zenithjs.ws/embed/imdb/${d.imdb}`;
    if (type === "tv") url += `?season=${season || 1}&episode=${episode || 1}`;
    return url;
  } catch {
    return null;
  }
}
export function setSource(s: KinoSource) {
  try {
    localStorage.setItem(SOURCE_KEY, s);
    window.dispatchEvent(new Event("kino-source-changed"));
  } catch {}
}

export interface KinopubStream {
  ok: true;
  kp_id: number;
  matched: { imdb: number; kinopoisk: number; year: number; type: string; title: string };
  ep: { season: number; episode: number; title: string } | null;
  hls4: string;
  hls?: string;
  http?: string;
  qualities: string[];
  ac3?: number;
}

// TMDB id → imdb_id (tt…) через наш same-origin прокси. Улучшает точность
// матчинга на стороне воркера (у kino.pub есть поле imdb).
async function fetchImdb(tmdbId: number, type: "movie" | "tv"): Promise<string> {
  try {
    const key = process.env.NEXT_PUBLIC_TMDB_API_KEY || "275c9d09780aadb4b13ff57a731eda00";
    const j = await fetch(`/tmdb-api/${type}/${tmdbId}/external_ids?api_key=${key}`).then((r) => r.json());
    return j.imdb_id || "";
  } catch {
    return "";
  }
}

export interface ResolveArgs {
  tmdbId: number;
  title: string;
  year: string | number;
  type: "movie" | "tv";
  season?: number;
  episode?: number;
  imdb?: string; // если уже известен
  otitle?: string; // оригинальное название — для ру-неоднозначных («Начало» и т.п.)
}

/** Резолвит тайтл в kino.pub-стрим. Возвращает null при промахе. */
export async function resolveKinopub(a: ResolveArgs): Promise<KinopubStream | null> {
  const imdb = a.imdb || (await fetchImdb(a.tmdbId, a.type));
  const p = new URLSearchParams({
    title: a.title || "",
    year: String(a.year || ""),
    type: a.type,
  });
  if (imdb) p.set("imdb", imdb);
  if (a.otitle && a.otitle !== a.title) p.set("otitle", a.otitle);
  if (a.type === "tv") {
    p.set("season", String(a.season || 1));
    p.set("episode", String(a.episode || 1));
  }
  try {
    const r = await fetchRetry(`${KINOPUB_WORKER}/resolve?${p.toString()}`);
    if (!r) return null;
    const d = await r.json();
    if (d && d.ok && d.hls4) {
      // Воркер строит hls4 от своего origin (workers.dev). Уводим на наш домен,
      // чтобы hls.js тянул манифест через тёплый same-origin `/kp` (без 30с).
      d.hls4 = String(d.hls4).replace(KINOPUB_WORKER_ABS, KINOPUB_WORKER);
      return d as KinopubStream;
    }
    return null;
  } catch {
    return null;
  }
}

export interface SportChannel {
  id: number;
  name: string;
  title: string;
  logo: string;
  stream: string; // живой HLS (токен эфира выдаётся при каждом запросе)
}

/** Список живых спорт-каналов (kino.pub /v1/tv). Стрим-токены свежие на момент
 *  запроса — вызывать при открытии страницы /sport. */
export async function fetchChannels(): Promise<SportChannel[]> {
  try {
    const r = await fetchRetry(`${KINOPUB_WORKER}/channels`);
    if (!r) return [];
    const d = await r.json();
    if (!d || !d.ok || !Array.isArray(d.channels)) return [];
    // Поток канала — HLS на mycdn.video, который браузер без VPN не тянет. Гоним
    // через наш same-origin прокси /api/kp-cdn (мастер + сегменты, mycdn достижим
    // с нашего VPS). Токен уже в URL — прокси его сохраняет.
    return (d.channels as SportChannel[]).map((c) => ({
      ...c,
      stream: c.stream ? `/api/kp-cdn?u=${encodeURIComponent(c.stream)}` : c.stream,
    }));
  } catch {
    return [];
  }
}
