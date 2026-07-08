"use client";

import type { MovieDetails } from "@/lib/tmdb";
import { MovieDownloadButton } from './movie-download-button';
import {
  Play, Film, ChevronDown, Mic, Clock, CalendarDays, Users,
  Tv as TvIcon, Subtitles, Maximize,
} from "lucide-react";
import { getImageUrl } from "@/lib/tmdb";
import Link from "next/link";
import { useState, useRef, useEffect, useCallback } from "react";
import Hls from "hls.js";
import { FavoriteButton } from "./favorite-button";
import { StatusButtons } from "./status-buttons";
import { ExpandableText } from "./expandable-text";
import { TrailerButton } from "./trailer-modal";
import { useAuthGate } from "./auth-gate";
import { SkipOverlays } from "./skip-overlays";
import { savePosition, getPosition, addToHistory, saveLastTranslator, getLastTranslator, recordTranslatorTry } from "@/lib/storage";
import { watchHeartbeat } from "@/lib/metrika";
import { pickDefaultQuality, setQualityPref } from "@/lib/quality";
import { hlsProxyUrl } from "@/lib/quality-probe";
import { warmStream } from "@/lib/stream-warm";
import { ArtPlayerView, type ArtSubtitle } from "./art-player";

interface MoviePlayerProps {
  movie: MovieDetails;
}

interface Translator {
  id: number;
  name: string;
  is_premium?: boolean;
}

export function MoviePlayer({ movie }: MoviePlayerProps) {
  const requireAuth = useAuthGate();
  const [showPlayer, setShowPlayer] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showLoadingMascot, setShowLoadingMascot] = useState(false);
  const [error, setError] = useState("");
  const [streamData, setStreamData] = useState<any>(null);
  // Position to start the next source switch at — set on a quality switch so the
  // new stream begins where playback is, not at 0.
  const [seekOnSwitch, setSeekOnSwitch] = useState<number | undefined>(undefined);
  const [selectedQuality, setSelectedQuality] = useState("");
  const [cssFullscreen, setCssFullscreen] = useState(false);
  // ArtPlayer container — once captured, SkipOverlays portals into it so
  // they stay visible in every fullscreen mode (web/native/mobile).
  const [playerContainer, setPlayerContainer] = useState<HTMLElement | null>(null);
  const [resumeTime, setResumeTime] = useState<number | null>(null);
  const [showResume, setShowResume] = useState(false);
  // "Смотреть" starts from 0; "Продолжить просмотр" is the ONLY thing that
  // seeks to the saved position. wantResume gates the auto-seek so the main
  // play button never does the jarring load-from-0-then-jump.
  const [wantResume, setWantResume] = useState(false);
  const [translators, setTranslators] = useState<Translator[]>([]);
  const [selectedTranslator, setSelectedTranslator] = useState<number | null>(null);
  const [showTranslators, setShowTranslators] = useState(false);
  const [translatorLoading, setTranslatorLoading] = useState(false);
  const [subtitles, setSubtitles] = useState<ArtSubtitle[]>([]);
  const [selectedSubtitleId, setSelectedSubtitleId] = useState<string | null>(null);
  // Available quality + dub count, surfaced from the prefetch so the user sees
  // "1080p · N озвучек" before pressing play (no extra request).
  const [availInfo, setAvailInfo] = useState<{ quality?: string; dubs?: number } | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const saveInterval = useRef<any>(null);
  const translatorRef = useRef<HTMLDivElement>(null);
  const subsFetchedRef = useRef(false);
  // Warmed HDRezka resolve — populated on mount so clicking "Смотреть" plays
  // instantly instead of waiting ~2s. fetchStream reuses this exact in-flight
  // request when the URL matches (no duplicate call).
  const prefetchRef = useRef<{ url: string; promise: Promise<any> } | null>(null);
  // True once the user actually pressed play — gates the (async) pre-warm probe
  // from clobbering the stream the click already started resolving.
  const startedRef = useRef(false);

  const fetchSubtitles = useCallback(async () => {
    if (subsFetchedRef.current) return;
    subsFetchedRef.current = true;
    try {
      const res = await fetch(`/api/subtitles?tmdb=${movie.id}`);
      const data = await res.json();
      setSubtitles(data.subs || []);
    } catch {
      setSubtitles([]);
    }
  }, [movie.id]);

  const isNotReleased = movie.release_date ? new Date(movie.release_date) > new Date() : false;
  const releaseStr = movie.release_date ? new Date(movie.release_date).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" }) : "";

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (translatorRef.current && !translatorRef.current.contains(e.target as Node)) {
        setShowTranslators(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    const pos = getPosition(movie.id, "movie");
    if (pos && pos.time > 10) {
      setResumeTime(pos.time);
    }
    const lastTr = getLastTranslator(movie.id, "movie");
    if (lastTr) setSelectedTranslator(lastTr.id);
  }, [movie.id]);

  // Prefetch the stream on mount so "Смотреть" is instant. Built to match the
  // exact URL fetchStream uses for its primary search (same title/year/dub),
  // so fetchStream consumes this in-flight request instead of firing a new one.
  useEffect(() => {
    if (isNotReleased) return;
    let alive = true;
    try {
      const year = movie.release_date ? new Date(movie.release_date).getFullYear() : "";
      const ruTitle = (movie.title || "").replace(/["«»""]/g, "").trim();
      const origTitle = ((movie as any).original_title || "").replace(/["«»""]/g, "").trim();
      const searchTitle = ruTitle || origTitle;
      if (!searchTitle) return;
      const tr = getLastTranslator(movie.id, "movie")?.id ?? null;
      const q = encodeURIComponent(searchTitle);
      // Also pass the original title so the backend can disambiguate generic
      // RU titles that HDRezka mis-resolves ("Страх"/Fear 1996 → wrongly
      // "Первобытный страх"). Backend only pays the extra search when the RU
      // hit isn't exact.
      const origParam = (origTitle && origTitle !== searchTitle) ? "&orig=" + encodeURIComponent(origTitle) : "";
      const trParam = tr ? "&translator_id=" + tr : "";
      const url = "/hdrezka/api/search?q=" + q + "&year=" + year + "&type=movie" + origParam + trParam;
      const p = fetch(url).then((r) => r.json()).catch(() => null);
      prefetchRef.current = { url, promise: p };
      p.then((d: any) => {
        if (!alive || !d?.stream) return;
        setAvailInfo({ quality: d.quality, dubs: (d.translators || []).length });
        // Warm the CDN connection + manifest the moment the page opens.
        warmStream(d.stream);
        // Pre-buffer the player (mounts hidden) so play is instant — gated to
        // fast connections so we don't pre-pull video on mobile. Everything
        // plays through the LeadSeek proxy (applyStream), so there's no throttle
        // lottery and no speed probe needed.
        const c: any = (navigator as any).connection;
        const fast = !c || (!c.saveData && c.type !== "cellular" &&
          c.effectiveType !== "2g" && c.effectiveType !== "slow-2g" && c.effectiveType !== "3g");
        if (fast && !isNotReleased && !startedRef.current) applyStream(d);
      });
    } catch {}
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movie.id]);

  // Same stale-closure trap as tv-player. Quality/translator changes mid-play
  // would otherwise keep writing the OLD label into history because the
  // interval captured them at startSaving time.
  const ctxRef = useRef({ quality: selectedQuality, translatorId: selectedTranslator, translators });
  useEffect(() => {
    ctxRef.current = { quality: selectedQuality, translatorId: selectedTranslator, translators };
  }, [selectedQuality, selectedTranslator, translators]);

  const startSaving = useCallback(() => {
    if (saveInterval.current) clearInterval(saveInterval.current);
    saveInterval.current = setInterval(() => {
      if (videoRef.current && !videoRef.current.paused) {
        const ct = videoRef.current.currentTime;
        const dur = videoRef.current.duration;
        if (ct > 0 && dur > 0) {
          const ctx = ctxRef.current;
          watchHeartbeat();
          savePosition(movie.id, "movie", ct, dur);
          const trName = ctx.translators.find(t => t.id === ctx.translatorId)?.name || "";
          addToHistory({
            id: movie.id, type: "movie", title: movie.title,
            poster_path: movie.poster_path, vote_average: movie.vote_average,
            release_date: movie.release_date, watchedAt: Date.now(),
            progress: ct, duration: dur, quality: ctx.quality,
            translatorName: trName, translatorId: ctx.translatorId || undefined,
            genre_ids: movie.genres?.map(g => g.id),
          });
        }
      }
    }, 5000);
  }, [movie]);

  useEffect(() => {
    return () => { if (saveInterval.current) clearInterval(saveInterval.current); };
  }, []);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (videoRef.current) {
        savePosition(movie.id, "movie", videoRef.current.currentTime, videoRef.current.duration);
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [movie.id]);

  // Apply a fetched resolve with the smart default quality (connection-aware +
  // remembered manual choice) instead of the backend's raw max.
  const applyStream = (d: any) => {
    const sq = pickDefaultQuality(d.streams, d.quality);
    // Everything plays through the LeadSeek proxy — it has a fast route to every
    // CDN edge, so there's no per-route throttle "lottery" on any quality/dub.
    const url = sq && d.streams?.[sq] ? hlsProxyUrl(d.streams[sq]) : d.stream;
    setStreamData(sq && d.streams?.[sq] ? { ...d, stream: url, quality: sq } : d);
    setSelectedQuality(sq || d.quality);
    // Populate the dub list here too — the pre-warm path (mount on open) sets the
    // stream via applyStream but NOT through fetchStream, so without this the
    // "Озвучка" menu was empty / showed a single dub.
    if (d.translators?.length) {
      setTranslators(d.translators);
      setSelectedTranslator((prev) => prev ?? d.active_translator_id ?? d.translators[0].id);
    }
  };

  const fetchStream = async (translatorId?: number | null, _attempt = 0) => {
    if (isNotReleased) return;
    setLoading(true);
    setError("");
    let retrying = false; // when true, the finally skips clearing loading
    // Fallback chain — explicit arg > state > localStorage. Storage read covers
    // the race where the play button is tapped before the initial restore effect
    // sets selectedTranslator state; without this the backend gets no
    // translator_id and returns the default dub even though the label says
    // "saved translator".
    const effectiveTr = translatorId ?? selectedTranslator ?? getLastTranslator(movie.id, "movie")?.id ?? null;
    if (effectiveTr && effectiveTr !== selectedTranslator) setSelectedTranslator(effectiveTr);
    if (!effectiveTr) setStreamData(null);
    try {
      const year = movie.release_date ? new Date(movie.release_date).getFullYear() : "";
      // HDRezka indexes Russian titles primarily — searching by the English
      // `original_title` fails for Russian-language productions ("Normal" → no
      // hit, "Нормал" → match). Use the localized title first, fall back to
      // original only if the search returns nothing.
      const origTitle = ((movie as any).original_title || "").replace(/["«»""]/g, "").trim();
      const ruTitle = (movie.title || "").replace(/["«»""]/g, "").trim();
      const searchTitle = ruTitle || origTitle;
      const q = encodeURIComponent(searchTitle);
      const origParam = (origTitle && origTitle !== searchTitle) ? "&orig=" + encodeURIComponent(origTitle) : "";
      const trParam = effectiveTr ? "&translator_id=" + effectiveTr : "";
      const url = "/hdrezka/api/search?q=" + q + "&year=" + year + "&type=movie" + origParam + trParam;
      // Reuse the warmed prefetch when it matches (instant play); otherwise fetch.
      let data: any = null;
      if (prefetchRef.current && prefetchRef.current.url === url) {
        data = await prefetchRef.current.promise;
        prefetchRef.current = null;
      }
      if (!data) {
        const res = await fetch(url);
        data = await res.json();
      }
      if (data.stream) {
        // What dub is ACTUALLY playing? Trust the backend's
        // active_translator_id, NOT effectiveTr — they diverge when HDRezka
        // substitutes a premium dub (whose stream is a 60-sec "buy
        // subscription" pre-roll). Using effectiveTr hid the substitution.
        const actualId: number | undefined = data.active_translator_id ?? data.translators?.[0]?.id;
        const actualIsPremium = !!data.translators?.find((t: any) => t.id === actualId)?.is_premium;
        const requestedId = effectiveTr;
        const substituted = requestedId != null && actualId != null && requestedId !== actualId;
        const freeAlt = data.translators?.find((t: any) => !t.is_premium && t.id !== requestedId);

        // First play / no explicit pick: if the default is a premium stub,
        // silently switch to a free dub.
        if (!translatorId && actualIsPremium && freeAlt) {
          setTranslators(data.translators);
          setSelectedTranslator(freeAlt.id);
          saveLastTranslator(movie.id, "movie", freeAlt.id, freeAlt.name);
          return fetchStream(freeAlt.id);
        }

        // Requested dub got substituted with a premium stub — don't play it.
        if (substituted && actualIsPremium) {
          if (data.translators?.length) setTranslators(data.translators);
          setStreamData(null);
          setError("Этот фильм в выбранной озвучке доступен только по подписке. Выберите другую озвучку.");
          setShowTranslators(true);
          return;
        }

        applyStream(data);
        if (data.translators && data.translators.length > 0 && translators.length === 0) {
          setTranslators(data.translators);
          if (!selectedTranslator) {
            setSelectedTranslator(data.active_translator_id ?? data.translators[0].id);
          }
        }
        const activeId = effectiveTr ?? data.active_translator_id ?? data.translators?.[0]?.id;
        const activeName = data.translators?.find((t: any) => t.id === activeId)?.name;
        if (activeName) recordTranslatorTry(activeName);
        return;
      }
      if (data.results && data.results.length > 0) {
        for (let i = 0; i < Math.min(data.results.length, 5); i++) {
          const res2 = await fetch("/hdrezka/api/search?q=" + q + "&year=" + year + "&type=movie&index=" + i + trParam);
          const data2 = await res2.json();
          if (data2.stream) {
            applyStream(data2);
            if (data2.translators && data2.translators.length > 0 && translators.length === 0) {
              setTranslators(data2.translators);
              if (!selectedTranslator) {
                setSelectedTranslator(data2.active_translator_id ?? data2.translators[0].id);
              }
            }
            const activeId2 = effectiveTr ?? data2.active_translator_id ?? data2.translators?.[0]?.id;
            const activeName2 = data2.translators?.find((t: any) => t.id === activeId2)?.name;
            if (activeName2) recordTranslatorTry(activeName2);
            return;
          }
        }
      }
      // Fallback: if our primary (Russian) title returned nothing, retry with
      // original_title. Covers titles HDRezka indexes only in English.
      if (origTitle && origTitle !== ruTitle) {
        const q2 = encodeURIComponent(origTitle);
        const resAlt = await fetch("/hdrezka/api/search?q=" + q2 + "&year=" + year + "&type=movie" + trParam);
        const dataAlt = await resAlt.json();
        if (dataAlt.stream) {
          applyStream(dataAlt);
          if (dataAlt.translators && dataAlt.translators.length > 0 && translators.length === 0) {
            setTranslators(dataAlt.translators);
            if (!selectedTranslator) setSelectedTranslator(dataAlt.active_translator_id ?? dataAlt.translators[0].id);
          }
          return;
        }
      }
      // Auto-retry once before giving up — covers transient HDRezka blips so
      // the user doesn't have to reload the page.
      if (_attempt < 1) { retrying = true; await new Promise(r => setTimeout(r, 800)); return fetchStream(translatorId, _attempt + 1); }
      setError("Фильм пока недоступен для просмотра");
    } catch {
      if (_attempt < 1) { retrying = true; await new Promise(r => setTimeout(r, 800)); return fetchStream(translatorId, _attempt + 1); }
      setError("Сервер не отвечает");
    } finally {
      if (!retrying) { setLoading(false); setTranslatorLoading(false); }
    }
  };

  const changeTranslator = async (trId: number) => {
    if (trId === selectedTranslator) { setShowTranslators(false); return; }
    setSelectedTranslator(trId);
    const trName = translators.find(t => t.id === trId)?.name || "";
    saveLastTranslator(movie.id, "movie", trId, trName);
    setShowTranslators(false);
    setTranslatorLoading(true);
    // Resume at the current position once the new dub's stream loads — via the
    // same reliable seekOnSwitch path the quality switch uses (the old fixed
    // 500ms seek fired before the proxied stream was ready → restarted at 0).
    const currentTime = videoRef.current?.currentTime || 0;
    setSeekOnSwitch(currentTime > 1 ? currentTime : undefined);
    await fetchStream(trId);
  };

  // HLS loading + recovery + visibilitychange resume live inside ArtPlayerView now.
  useEffect(() => {
    if (!streamData?.stream) return;
    if (resumeTime && resumeTime > 10 && !translatorLoading) setShowResume(true);
  }, [streamData, resumeTime, translatorLoading]);

  // Min-show маскота 800ms — гарантия что не моргнёт
  useEffect(() => {
    if (loading) { setShowLoadingMascot(true); return; }
    const t = setTimeout(() => setShowLoadingMascot(false), 800);
    return () => clearTimeout(t);
  }, [loading]);

  // Open the player. resume=false → start from 0 ("Смотреть"); resume=true →
  // seek to the saved position ("Продолжить просмотр").
  const openPlayer = (resume: boolean) => {
    if (isNotReleased) return;
    if (!requireAuth("Войдите, чтобы смотреть фильмы и сохранять прогресс")) return;
    startedRef.current = true;
    setWantResume(resume);
    if (resume && resumeTime && videoRef.current) videoRef.current.currentTime = resumeTime;
    setShowPlayer(true);
    // If the player was already pre-warmed (streamData set on open), revealing it
    // flips autoStart → the player starts the buffered video instantly. Only do a
    // cold resolve when nothing is prewarmed yet.
    if (!streamData?.stream) fetchStream();
  };

  const handleResume = () => {
    if (videoRef.current && resumeTime) {
      videoRef.current.currentTime = resumeTime;
    }
    setShowResume(false);
  };

  const handleStartOver = () => {
    if (videoRef.current) videoRef.current.currentTime = 0;
    setShowResume(false);
  };

  const changeQuality = (q: string) => {
    if (!streamData?.streams?.[q]) return;
    setQualityPref(q); // remember explicit choice for future titles
    // Always via the proxy — any tier loads reliably, no throttle lottery.
    const url = hlsProxyUrl(streamData.streams[q]);
    // Start the new stream AT the current position (seekOnSwitch) instead of
    // resetting to 0, then only re-assert play if it sneaks in a pause — NEVER
    // touch currentTime here, or we'd fight a forward seek made right after.
    const pos = videoRef.current?.currentTime || 0;
    setSeekOnSwitch(pos > 1 ? pos : undefined);
    setSelectedQuality(q);
    setStreamData((prev: any) => prev ? { ...prev, stream: url } : prev);
    let n = 0;
    const iv = setInterval(() => {
      const v = videoRef.current;
      if (v && v.paused && v.readyState >= 2) v.play().catch(() => {});
      if ((v && !v.paused) || ++n > 16) clearInterval(iv);
    }, 400);
  };

  const toggleFullscreen = () => {
    const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
    const isTelegram = !!(window as any).Telegram?.WebApp;
    if (isTelegram) { try { (window as any).Telegram.WebApp.requestFullscreen(); } catch {} }
    if (!isMobile && !isTelegram && videoRef.current?.requestFullscreen) {
      videoRef.current.requestFullscreen().catch(() => setCssFullscreen(true));
      return;
    }
    setCssFullscreen(!cssFullscreen);
    try { screen.orientation.lock("landscape").catch(() => {}); } catch {}
  };

  useEffect(() => {
    if (!cssFullscreen) { try { screen.orientation.unlock(); } catch {} }
  }, [cssFullscreen]);

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    return h > 0 ? h + ":" + m.toString().padStart(2,"0") + ":" + sec.toString().padStart(2,"0") : m + ":" + sec.toString().padStart(2,"0");
  };

  const getTranslatorName = () => {
    if (!selectedTranslator || translators.length === 0) return "Озвучка";
    const t = translators.find(t => t.id === selectedTranslator);
    return t ? t.name : "Озвучка";
  };

  const backdropUrl = movie.backdrop_path
    ? "/tmdb-img/w1280" + movie.backdrop_path
    : movie.poster_path
      ? "/tmdb-img/w780" + movie.poster_path
      : null;

  return (
    <div className="relative w-full">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className={cssFullscreen
          ? "fixed inset-0 z-[9999] bg-black flex items-center justify-center"
          : "aspect-video bg-black rounded-2xl overflow-hidden relative shadow-2xl shadow-black/50 border border-white/5 group"
        }>
          {/* Player mounts + pre-buffers as soon as the stream resolves
              (autoStart=false) HIDDEN behind the poster, so "Смотреть" plays
              instantly. interactive={showPlayer} keeps the pre-warmed player
              non-interactive (pointer-events:none) until the auth gate passes in
              openPlayer — otherwise unregistered users could tap the hidden
              player and bypass the gate. */}
          {streamData?.stream && (
            <ArtPlayerView
              streamUrl={streamData.stream}
              poster={backdropUrl || undefined}
              qualities={streamData.streams}
              selectedQuality={selectedQuality}
              onQualityChange={changeQuality}
              translators={translators}
              selectedTranslator={selectedTranslator}
              onTranslatorChange={changeTranslator}
              subtitles={subtitles}
              selectedSubtitleId={selectedSubtitleId}
              onSubtitleChange={setSelectedSubtitleId}
              onLoadSubtitles={fetchSubtitles}
              resumeTime={wantResume ? (resumeTime || undefined) : undefined}
              seekOnSwitch={seekOnSwitch}
              autoStart={showPlayer}
              interactive={showPlayer}
              onVideoReady={(v) => { videoRef.current = v; startSaving(); }}
              onVideoUnmount={() => { videoRef.current = null; if (saveInterval.current) clearInterval(saveInterval.current); }}
              onPlayerContainerReady={setPlayerContainer}
            />
          )}
          {streamData?.stream && showPlayer && (
            <SkipOverlays videoRef={videoRef} playerContainer={playerContainer} tmdbId={movie.id} type="movie" />
          )}
          {streamData?.stream && showPlayer && translatorLoading && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-3">
                <div className="w-12 h-12 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
                <p className="text-white text-sm">Смена озвучки...</p>
              </div>
            </div>
          )}

          {/* Loading mascot / error — only after play was pressed and the stream
              isn't ready yet (cold start / slow connection). */}
          {showPlayer && !streamData?.stream && error ? (
            <div className="w-full h-full flex flex-col items-center justify-center bg-black text-white gap-4 px-8 overflow-y-auto py-8">
              <Clock size={48} className="text-gray-500" />
              <p className="text-gray-300 text-center text-lg">{error}</p>
              {translators.length > 1 ? (
                <div className="w-full max-w-sm">
                  <p className="text-[11px] uppercase tracking-wider text-white/45 font-semibold mb-2 text-center">Выберите озвучку</p>
                  <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto">
                    {Array.from(new Map(translators.map(t => [t.id, t])).values()).map(t => (
                      <button
                        key={t.id}
                        onClick={() => { setError(""); fetchStream(t.id); }}
                        className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-[14px] text-left transition-colors ${
                          t.id === selectedTranslator ? "bg-primary/20 text-white" : "bg-white/[0.06] text-white hover:bg-white/[0.12]"
                        }`}
                      >
                        <span>{t.name}</span>
                        {t.id === selectedTranslator && <span className="text-primary text-xs">текущая</span>}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-gray-500 text-center text-sm">Попробуйте позже или выберите другой фильм</p>
              )}
              <button onClick={() => fetchStream()} className="px-6 py-3 bg-primary hover:bg-primary/90 rounded-xl font-medium transition-colors">Попробовать снова</button>
            </div>
          ) : showPlayer && !streamData?.stream && (loading || showLoadingMascot) ? (
            <div className="w-full h-full flex flex-col items-center justify-center bg-black text-white gap-4">
              <div className="w-12 h-12 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
              <p className="text-[15px] font-medium text-white/85">{translatorLoading ? "Смена озвучки..." : "Загрузка фильма"}</p>
            </div>
          ) : null}

          {/* Poster overlay — covers the (pre-buffering) player until play. */}
          {!showPlayer && (
            <div className="absolute inset-0 z-30 cursor-pointer group/play" onClick={() => openPlayer(false)}>
              {backdropUrl && <img src={backdropUrl} alt={movie.title} className={"absolute inset-0 w-full h-full " + (movie.backdrop_path ? "object-cover" : "object-contain bg-black/90")} />}
              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-t from-black via-black/30 to-black/10">
                <div className="flex flex-col items-center gap-5">
                  {isNotReleased ? (
                    <>
                      <div className="w-24 h-24 rounded-full bg-gray-700/90 flex items-center justify-center shadow-xl">
                        <CalendarDays size={44} className="text-gray-300" />
                      </div>
                      <div className="text-center">
                        <p className="text-white/90 text-lg font-semibold">{"\u0421\u043A\u043E\u0440\u043E \u0432 \u043A\u0438\u043D\u043E"}</p>
                        <p className="text-white/50 text-sm mt-1">{"Дата выхода: " + releaseStr}</p>
                      </div>
                    </>
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-white/90 flex items-center justify-center shadow-xl shadow-black/40 transition-transform duration-300 group-hover:scale-110">
                      <Play size={38} className="text-black ml-1" fill="currentColor" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>


        {!cssFullscreen && (
          <>
            {/* === INFO CARD === */}
            <section className="mt-7 grid grid-cols-[120px_1fr] sm:grid-cols-[180px_1fr] gap-5 sm:gap-7">
              <div className="rounded-2xl overflow-hidden ring-1 ring-white/[0.08] shadow-2xl shadow-black/40 aspect-[2/3] bg-foreground/[0.04]">
                {movie.poster_path && (
                  <img
                    src={getImageUrl(movie.poster_path, "w342")}
                    alt={movie.title}
                    className="w-full h-full object-cover"
                  />
                )}
              </div>
              <div className="space-y-3.5 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-2xl sm:text-4xl font-bold text-foreground tracking-tight">{movie.title}</h1>
                  <FavoriteButton size="md" item={{
                    id: movie.id, type: "movie", title: movie.title,
                    poster_path: movie.poster_path, vote_average: movie.vote_average,
                    release_date: movie.release_date, addedAt: Date.now(),
                  }} />
                </div>

                {/* Watch status — Хочу / Просмотрел toggle pills */}
                <StatusButtons
                  id={movie.id}
                  type="movie"
                  title={movie.title}
                  poster_path={movie.poster_path}
                  vote_average={movie.vote_average}
                />

                <div className="flex flex-wrap items-center gap-2 text-[13px]">
                  {movie.release_date && (
                    <span className="px-2.5 py-1 rounded-md bg-foreground/[0.05] text-foreground/75 ring-1 ring-white/[0.06]">
                      {new Date(movie.release_date).getFullYear()}
                    </span>
                  )}
                  {movie.runtime > 0 && (
                    <span className="px-2.5 py-1 rounded-md bg-foreground/[0.05] text-foreground/75 ring-1 ring-white/[0.06]">
                      {movie.runtime}{" мин"}
                    </span>
                  )}
                  <span className="px-2.5 py-1 rounded-md bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/25 font-semibold">
                    {"★ " + movie.vote_average.toFixed(1)}
                  </span>
                  {movie.genres && movie.genres.slice(0, 2).map(g => (
                    <span key={g.id} className="px-2.5 py-1 rounded-md bg-foreground/[0.05] text-foreground/75 ring-1 ring-white/[0.06]">{g.name}</span>
                  ))}
                  {availInfo?.quality && (
                    <span className="px-2.5 py-1 rounded-md bg-primary/12 text-primary ring-1 ring-primary/25 font-semibold">{availInfo.quality}</span>
                  )}
                  {availInfo?.dubs ? (
                    <span className="px-2.5 py-1 rounded-md bg-foreground/[0.05] text-foreground/75 ring-1 ring-white/[0.06]">{availInfo.dubs} {availInfo.dubs === 1 ? "озвучка" : availInfo.dubs < 5 ? "озвучки" : "озвучек"}</span>
                  ) : null}
                </div>

                {movie.overview && (
                  <ExpandableText
                    text={movie.overview}
                    className="text-foreground/65 text-[13px] sm:text-[14px] leading-relaxed"
                  />
                )}

                <div className="flex items-center gap-2 flex-wrap pt-1">
                  <button
                    onClick={() => openPlayer(false)}
                    disabled={isNotReleased}
                    className="inline-flex items-center gap-2 h-10 px-4 rounded-full bg-primary text-primary-foreground text-[13px] font-semibold hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isNotReleased ? (
                      <><CalendarDays size={15} /> {"Скоро в кино"}</>
                    ) : (
                      <><Play size={15} fill="currentColor" /> {"Смотреть"}</>
                    )}
                  </button>
                  {!isNotReleased && resumeTime && resumeTime > 10 && (
                    <button
                      onClick={() => openPlayer(true)}
                      className="inline-flex items-center gap-2 h-10 px-4 rounded-full bg-white/[0.06] ring-1 ring-white/15 text-foreground/90 text-[13px] font-semibold hover:bg-white/[0.12] transition-colors"
                    >
                      <Play size={15} fill="currentColor" /> {"Продолжить с " + formatTime(resumeTime)}
                    </button>
                  )}
                  <MovieDownloadButton type="movie" movie={{
                    id: movie.id,
                    title: movie.title,
                    poster_path: movie.poster_path,
                    release_date: movie.release_date,
                    runtime: movie.runtime,
                  }} />
                  <Link
                    href={"/watch/create?q=" + encodeURIComponent(movie.title) + "&id=" + movie.id + "&type=movie&year=" + (movie.release_date ? new Date(movie.release_date).getFullYear() : "") + "&poster=" + (movie.poster_path || "")}
                    className="inline-flex items-center gap-2 h-10 px-3.5 rounded-full bg-purple-500/12 ring-1 ring-purple-500/30 text-purple-300 hover:bg-purple-500/20 transition-colors text-[12.5px] font-semibold"
                    title="Смотреть вместе"
                  >
                    <Users size={14} /> {"Вместе"}
                  </Link>
                </div>

                {/* Progress bar if any */}
                {resumeTime && resumeTime > 10 && (() => {
                  const sp = getPosition(movie.id, "movie");
                  if (!sp || sp.duration <= 0) return null;
                  const progress = Math.min(100, (sp.time / sp.duration) * 100);
                  const remainingMin = Math.ceil(Math.max(0, sp.duration - sp.time) / 60);
                  return (
                    <div className="pt-3 max-w-2xl">
                      <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all duration-500"
                          style={{ width: progress + "%" }}
                        />
                      </div>
                      <p className="mt-1.5 text-foreground/50 text-[11px] text-right">{"Осталось " + remainingMin + " мин"}</p>
                    </div>
                  );
                })()}
              </div>
            </section>

            {/* Player options (Озвучка / Субтитры / Качество / Скорость) moved INTO
                the ArtPlayer settings menu (gear icon, bottom-right of the player). */}
          </>
        )}
      </div>
    </div>
  );
}
