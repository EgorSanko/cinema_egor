"use client";

import { useCallback, useRef, useState } from "react";
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

// HDRezka-native detail + watch page — for titles that have no TMDB match. All
// data (poster, card, seasons) comes from HDRezka; the player resolves the stream
// DIRECTLY by the HDRezka URL via /hdrezka/api/resolve.
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
  const [translators, setTranslators] = useState<{ id: number; name: string }[]>([]);
  const [selectedTranslator, setSelectedTranslator] = useState<number | null>(null);
  const [seekOnSwitch, setSeekOnSwitch] = useState<number | undefined>(undefined);
  const videoRef = useRef<HTMLVideoElement | null>(null);

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

  const changeTranslator = (id: number) => {
    setSelectedTranslator(id);
    resolve(season, episode, id);
  };

  const pickEpisode = (s: number, e: number) => {
    setSeason(s);
    setEpisode(e);
    if (!showPlayer) setShowPlayer(true);
    resolve(s, e, selectedTranslator);
  };

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
              translators={translators}
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
        {isSeries && seasonNums.length > 0 && (
          <section className="mt-10">
            <h2 className="text-2xl font-bold text-foreground mb-4">Эпизоды</h2>
            <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
              {seasonNums.map((s) => (
                <button
                  key={s}
                  onClick={() => setPanelSeason(s)}
                  className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${panelSeason === s ? "bg-primary text-primary-foreground" : "bg-foreground/[0.06] text-foreground/70 hover:bg-foreground/10"}`}
                >
                  Сезон {s}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
              {(seasons[String(panelSeason)] || []).map((e) => {
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
