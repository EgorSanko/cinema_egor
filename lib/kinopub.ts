// kino.pub — ad-free источник-фолбэк. Резолв идёт через наш Cloudflare Worker
// (RU-датацентры до kino.pub API ходят плохо, а CF-edge — надёжно; клиент зовёт
// воркер напрямую, воркер пускает только по Origin=sapkeflykino.ru). Воркер
// отдаёт единый адаптивный hls4-манифест: несколько качеств + все озвучки
// отдельными аудио-дорожками (мгновенное переключение через hls.js).
export const KINOPUB_WORKER = "https://kinopub-resolver.egor3sanko22.workers.dev";

const SOURCE_KEY = "kino_source"; // 'hdrezka' | 'kinopub'

export type KinoSource = "hdrezka" | "kinopub";

export function getSource(): KinoSource {
  try {
    return localStorage.getItem(SOURCE_KEY) === "kinopub" ? "kinopub" : "hdrezka";
  } catch {
    return "hdrezka";
  }
}
export function setSource(s: KinoSource) {
  try {
    localStorage.setItem(SOURCE_KEY, s);
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
