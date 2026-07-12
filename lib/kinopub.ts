// kino.pub — ad-free источник-фолбэк. Резолв идёт через наш Cloudflare Worker
// (RU-датацентры до kino.pub API ходят плохо, а CF-edge — надёжно; клиент зовёт
// воркер напрямую, воркер пускает только по Origin=sapkeflykino.ru). Воркер
// отдаёт единый адаптивный hls4-манифест: несколько качеств + все озвучки
// отдельными аудио-дорожками (мгновенное переключение через hls.js).
export const KINOPUB_WORKER = "https://kinopub-resolver.egor3sanko22.workers.dev";

const SOURCE_KEY = "kino_source"; // 'hdrezka' | 'kinopub' | 'zenithjs'

export type KinoSource = "hdrezka" | "kinopub" | "zenithjs";

export function getSource(): KinoSource {
  try {
    const v = localStorage.getItem(SOURCE_KEY);
    return v === "kinopub" || v === "zenithjs" ? v : "hdrezka";
  } catch {
    return "hdrezka";
  }
}

/** Zenithjs — сторонний iframe-плеер (тот же движок, что Lift) с собственными
 *  сезонами/сериями/озвучками. Принимает imdb-id прямо в URL. Резолвим imdb из
 *  TMDB external_ids и строим embed-ссылку. */
export async function resolveZenithEmbed(
  tmdbId: number, type: "movie" | "tv", season?: number, episode?: number,
): Promise<string | null> {
  const imdb = await fetchImdb(tmdbId, type);
  if (!imdb) return null;
  let url = `https://api.zenithjs.ws/embed/imdb/${imdb}`;
  if (type === "tv") url += `?season=${season || 1}&episode=${episode || 1}`;
  return url;
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
  if (a.type === "tv") {
    p.set("season", String(a.season || 1));
    p.set("episode", String(a.episode || 1));
  }
  try {
    const r = await fetch(`${KINOPUB_WORKER}/resolve?${p.toString()}`);
    const d = await r.json();
    if (d && d.ok && d.hls4) return d as KinopubStream;
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
    const r = await fetch(`${KINOPUB_WORKER}/channels`);
    const d = await r.json();
    return d && d.ok && Array.isArray(d.channels) ? (d.channels as SportChannel[]) : [];
  } catch {
    return [];
  }
}
