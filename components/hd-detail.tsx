"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArtPlayerView } from "./art-player";
import { hlsProxyUrl } from "@/lib/quality-probe";
import { Play, Loader2, Film, Tv } from "lucide-react";

export interface HdDetails {
  url: string;
  title: string;
  orig_title?: string;
  year?: number | null;
  poster?: string | null;
  description?: string;
  type: "movie" | "tv";
  genres?: string[];
  countries?: string[];
  duration?: string;
  seasons?: Record<string, number[]>;
}

type Translator = { id: number; name: string; is_premium?: boolean };

// HDRezka-native detail + watch page — for titles that have no TMDB match. All
// data (poster, card, seasons) comes from HDRezka; the player resolves the stream
// DIRECTLY by the HDRezka URL via /hdrezka/api/resolve. Seasons/episodes are
// scoped to the SELECTED dub (HDRezka-style), and the in-player dub switcher only
// offers voiceovers that have the current episode.
export function HdDetail({ details }: { details: HdDetails }) {
  const isSeries = details.type === "tv";
  const seasons = details.seasons || {};
  const seasonNums = Object.keys(seasons).map(Number).filter((n) => !isNaN(n)).sort((a, b) => a - b);
  const firstSeason = seasonNums[0] || 1;
  const firstEpisode = (seasons[String(firstSeason)] || [1]).filter((e) => e > 0)[0] || (seasons[String(firstSeason)] || [1])[0] || 1;

  const [season, setSeason] = useState(firstSeason);
  const [episode, setEpisode] = useState(firstEpisode);
  const [panelSeason, setPanelSeason] = useState(firstSeason);
  const [showPlayer, setShowPlayer] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [streamData, setStreamData] = useState<any>(null);
  const [selectedQuality, setSelectedQuality] = useState("");
  const [translators, setTranslators] = useState<Translator[]>([]);
  const [selectedTranslator, setSelectedTranslator] = useState<number | null>(null);
  const [seekOnSwitch, setSeekOnSwitch] = useState<number | undefined>(undefined);
  // Per-dub season/episode tree (HDRezka scopes them to the dub). null → use the
  // default details.seasons.
  const [availTree, setAvailTree] = useState<Record<number, number[]> | null>(null);
  // Dubs that have the CURRENT (season, episode) — filters the in-player switcher.
  const [episodeDubIds, setEpisodeDubIds] = useState<number[] | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const eptrKeyRef = useRef<string>("");

  // Season/episode source: the selected dub's tree if loaded, else the default.
  const effSeasonNums = availTree ? Object.keys(availTree).map(Number).sort((a, b) => a - b) : seasonNums;
  const effEpisodes = (s: number): number[] => (availTree ? (availTree[s] || []) : (seasons[String(s)] || []));

  const apply = (d: any) => {
    const sq = d.quality && d.streams?.[d.quality] ? d.quality : Object.keys(d.streams || {})[0];
    const url = sq && d.streams?.[sq] ? hlsProxyUrl(d.streams[sq]) : d.stream;
    setStreamData({ ...d, stream: url });
    setSelectedQuality(sq || d.quality || "");
    if (d.translators?.length) {
      setTranslators(d.translators);
      setSelectedTranslator((prev) => prev ?? d.active_translator_id ?? d.translators[0].id);
    }
  };

  const resolve = useCallback(async (s: number, e: number, trId?: number | null) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ url: details.url });
      if (isSeries) {
        params.set("season", String(s));
        params.set("episode", String(e));
      }
      if (trId) params.set("translator_id", String(trId));
      const r = await fetch(`/hdrezka/api/resolve?${params.toString()}`);
      const d = await r.json();
      if (d.stream) apply(d);
      else setError(isSeries ? "Серия недоступна. Попробуйте другую серию или озвучку." : "Не удалось загрузить. Попробуйте позже.");
    } catch {
      setError("Сервер не отвечает.");
    }
    setLoading(false);
  }, [details.url, isSeries]);

  // Load the per-dub season/episode tree (also yields the translator list). Used
  // on mount (default dub) and whenever the dub changes.
  const loadTree = useCallback(async (trId?: number | null) => {
    try {
      const p = new URLSearchParams({ url: details.url });
      if (trId) p.set("translator_id", String(trId));
      const r = await fetch(`/hdrezka/api/episodes?${p.toString()}`);
      const d = await r.json();
      if (d?.translators?.length) {
        setTranslators((prev) => (prev.length ? prev : d.translators));
        setSelectedTranslator((prev) => prev ?? d.active_translator_id ?? d.translators[0].id);
      }
      if (d?.seasons) {
        const tree: Record<number, number[]> = {};
        for (const [s, eps] of Object.entries(d.seasons)) tree[parseInt(s, 10)] = (eps as number[]) || [];
        setAvailTree(tree);
        return tree;
      }
    } catch { /* keep default seasons on failure */ }
    return null;
  }, [details.url]);

  // On mount: get the dub list, then load the DEFAULT dub's actual tree. (The
  // no-translator /api/episodes response is the page union of ALL seasons, not
  // what the default dub really has — e.g. One Piece page shows 22 seasons but
  // Дубляж only has 12, so gate to the real dub.)
  useEffect(() => {
    if (!isSeries) return;
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`/hdrezka/api/episodes?url=${encodeURIComponent(details.url)}`);
        const d = await r.json();
        if (!alive) return;
        const list: Translator[] = d?.translators || [];
        if (list.length) {
          setTranslators(list);
          const defId = d?.active_translator_id ?? list[0].id;
          setSelectedTranslator((p) => p ?? defId);
          await loadTree(defId);
          return;
        }
        if (d?.seasons) {
          const tree: Record<number, number[]> = {};
          for (const [s, eps] of Object.entries(d.seasons)) tree[parseInt(s, 10)] = (eps as number[]) || [];
          if (alive) setAvailTree(tree);
        }
      } catch { /* keep default seasons on failure */ }
    })();
    return () => { alive = false; };
  }, [isSeries, details.url, loadTree]);

  // Keep the open panel season valid for the loaded tree.
  useEffect(() => {
    if (!availTree) return;
    const ss = Object.keys(availTree).map(Number).sort((a, b) => a - b);
    if (ss.length && !availTree[panelSeason]) setPanelSeason(ss[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availTree]);

  // Which dubs have the current (season, episode) — to filter the in-player switcher.
  useEffect(() => {
    if (!isSeries) return;
    const key = season + "|" + episode;
    if (eptrKeyRef.current === key) return;
    eptrKeyRef.current = key;
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`/hdrezka/api/episode-translators?url=${encodeURIComponent(details.url)}&season=${season}&episode=${episode}`);
        const d = await r.json();
        if (alive) setEpisodeDubIds(Array.isArray(d?.ids) ? d.ids : null);
      } catch { if (alive) setEpisodeDubIds(null); }
    })();
    return () => { alive = false; };
  }, [details.url, isSeries, season, episode]);

  const start = () => {
    setShowPlayer(true);
    resolve(season, episode, selectedTranslator);
  };

  const changeQuality = (q: string) => {
    if (!streamData?.streams?.[q]) return;
    const url = hlsProxyUrl(streamData.streams[q]);
    const pos = videoRef.current?.currentTime || 0;
    setSeekOnSwitch(pos > 1 ? pos : undefined);
    setSelectedQuality(q);
    setStreamData((prev: any) => (prev ? { ...prev, stream: url } : prev));
  };

  const changeTranslator = async (id: number) => {
    if (id === selectedTranslator) return;
    setSelectedTranslator(id);
    const tree = await loadTree(id);
    let s = season, e = episode;
    if (tree) {
      const ss = Object.keys(tree).map(Number).sort((a, b) => a - b);
      // Current season not in this dub → jump to its first available season/episode.
      if (ss.length && !tree[s]) {
        s = ss[0];
        e = (tree[s] && tree[s][0]) || 1;
        setSeason(s); setPanelSeason(s); setEpisode(e);
      }
    }
    // Re-resolve the stream only if the player is already active.
    if (showPlayer || streamData?.stream) {
      const pos = videoRef.current?.currentTime || 0;
      setSeekOnSwitch(pos > 1 ? pos : undefined);
      resolve(s, e, id);
    }
  };

  const pickEpisode = (s: number, e: number) => {
    setSeason(s);
    setEpisode(e);
    if (!showPlayer) setShowPlayer(true);
    resolve(s, e, selectedTranslator);
  };

  // In-player dubs = only those with the current episode (always keep the active
  // one). Falls back to all when unknown.
  const playerDubs = (() => {
    if (!episodeDubIds || episodeDubIds.length === 0) return translators;
    const allow = new Set(episodeDubIds);
    if (selectedTranslator != null) allow.add(selectedTranslator);
    const f = translators.filter((t) => allow.has(t.id));
    return f.length ? f : translators;
  })();

  const dubList = Array.from(new Map(translators.map((t) => [t.id, t])).values());
  const TypeIcon = isSeries ? Tv : Film;

  return (
    <main className="bg-background min-h-screen pb-16">
      {/* Player / hero */}
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="aspect-video bg-black rounded-2xl overflow-hidden relative shadow-2xl shadow-black/50 border border-white/5">
          {streamData?.stream ? (
            <ArtPlayerView
              streamUrl={streamData.stream}
              poster={details.poster || undefined}
              qualities={streamData.streams}
              selectedQuality={selectedQuality}
              onQualityChange={changeQuality}
              translators={playerDubs}
              selectedTranslator={selectedTranslator}
              onTranslatorChange={changeTranslator}
              autoStart={showPlayer}
              seekOnSwitch={seekOnSwitch}
              onVideoReady={(v) => { videoRef.current = v; }}
              onVideoUnmount={() => { videoRef.current = null; }}
            />
          ) : (
            <>
              {details.poster && (
                <img src={details.poster} alt={details.title} className="absolute inset-0 w-full h-full object-cover opacity-50" />
              )}
              <div className="absolute inset-0 flex items-center justify-center">
                {loading ? (
                  <Loader2 size={48} className="animate-spin text-primary" />
                ) : error ? (
                  <div className="text-center px-6">
                    <p className="text-foreground/90 text-sm mb-3">{error}</p>
                    <button onClick={start} className="px-5 h-11 rounded-full bg-primary text-primary-foreground font-bold text-sm">Повторить</button>
                  </div>
                ) : (
                  <button onClick={start} className="group flex items-center gap-3 px-7 h-14 rounded-full bg-primary text-primary-foreground font-bold shadow-2xl shadow-primary/30 hover:scale-[1.03] transition-transform">
                    <Play size={22} className="fill-current" /> Смотреть
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* Info */}
        <div className="mt-6 flex flex-col md:flex-row gap-6">
          {details.poster && (
            <img src={details.poster} alt={details.title} className="hidden md:block w-40 h-60 object-cover rounded-xl ring-1 ring-white/10 flex-shrink-0" />
          )}
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/15 ring-1 ring-primary/30 text-primary text-[11px] font-bold uppercase tracking-[0.16em]">
              <TypeIcon size={12} /> {isSeries ? "Сериал" : "Фильм"}
            </span>
            <h1 className="mt-3 text-3xl sm:text-4xl font-black text-foreground tracking-tight">{details.title}</h1>
            {details.orig_title && details.orig_title !== details.title && (
              <p className="text-foreground/45 text-sm mt-1">{details.orig_title}</p>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-foreground/60 text-[13px]">
              {details.year && <span>{details.year}</span>}
              {details.duration && <span>{details.duration}</span>}
              {(details.countries || []).slice(0, 2).map((c) => <span key={c}>{c}</span>)}
            </div>
            {(details.genres || []).length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {details.genres!.map((g) => (
                  <span key={g} className="px-2.5 py-1 rounded-full bg-foreground/[0.06] ring-1 ring-white/[0.06] text-foreground/70 text-[12px]">{g}</span>
                ))}
              </div>
            )}
            {details.description && (
              <p className="mt-4 text-foreground/75 text-[14px] leading-relaxed max-w-3xl">{details.description}</p>
            )}
          </div>
        </div>

        {/* Episodes (series) */}
        {isSeries && effSeasonNums.length > 0 && (
          <section className="mt-10">
            <h2 className="text-2xl font-bold text-foreground mb-4">Эпизоды</h2>

            {/* Озвучка selector — pick a dub and the seasons/episodes below scope
                to exactly what THAT dub has (HDRezka-style). */}
            {dubList.length > 0 && (
              <div className="mb-5">
                <div className="text-[13px] font-semibold text-foreground/50 mb-2">Озвучка</div>
                <div className="flex flex-wrap items-center gap-2">
                  {dubList.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => changeTranslator(t.id)}
                      className={"inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-[13px] transition-colors " + (
                        selectedTranslator === t.id
                          ? "bg-primary/15 text-primary ring-1 ring-primary/30 font-semibold"
                          : "bg-foreground/[0.04] text-foreground/65 ring-1 ring-white/[0.06] hover:bg-foreground/[0.07] hover:text-foreground"
                      )}
                    >
                      {t.name}
                      {t.is_premium && (
                        <span className="text-[9px] font-bold px-1 rounded bg-amber-400/20 text-amber-300 leading-none py-0.5">PRO</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Season tabs (wrapped, scoped to the dub) */}
            <div className="flex flex-wrap gap-2 mb-4">
              {effSeasonNums.map((s) => (
                <button
                  key={s}
                  onClick={() => setPanelSeason(s)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${panelSeason === s ? "bg-primary text-primary-foreground" : "bg-foreground/[0.06] text-foreground/70 hover:bg-foreground/10"}`}
                >
                  Сезон {s}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
              {effEpisodes(panelSeason).map((e) => {
                const isCur = panelSeason === season && e === episode && showPlayer;
                return (
                  <button
                    key={e}
                    onClick={() => pickEpisode(panelSeason, e)}
                    className={`h-12 rounded-xl text-sm font-bold transition-colors ${isCur ? "bg-primary text-primary-foreground" : "bg-foreground/[0.06] text-foreground/80 hover:bg-foreground/12 ring-1 ring-white/[0.06]"}`}
                  >
                    {e === 0 ? "0" : e}
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
