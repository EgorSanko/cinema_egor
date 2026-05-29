"use client";

import type { MovieDetails } from "@/lib/tmdb";
import { SendToTV } from './send-to-tv';
import {
  Play, Film, ChevronDown, Mic, Clock, CalendarDays, Users,
  Tv as TvIcon, Subtitles, Maximize,
} from "lucide-react";
import { getImageUrl } from "@/lib/tmdb";
import Link from "next/link";
import { useState, useRef, useEffect, useCallback } from "react";
import Hls from "hls.js";
import { FavoriteButton } from "./favorite-button";
import { BingoCard } from "./bingo-card";
import { StatusButtons } from "./status-buttons";
import { TrailerButton } from "./trailer-modal";
import { useAuthGate } from "./auth-gate";
import { SkipOverlays } from "./skip-overlays";
import { savePosition, getPosition, addToHistory, saveLastTranslator, getLastTranslator, recordTranslatorTry } from "@/lib/storage";
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
  const [showBingo, setShowBingo] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showLoadingMascot, setShowLoadingMascot] = useState(false);
  const [error, setError] = useState("");
  const [streamData, setStreamData] = useState<any>(null);
  const [selectedQuality, setSelectedQuality] = useState("");
  const [cssFullscreen, setCssFullscreen] = useState(false);
  const [resumeTime, setResumeTime] = useState<number | null>(null);
  const [showResume, setShowResume] = useState(false);
  const [translators, setTranslators] = useState<Translator[]>([]);
  const [selectedTranslator, setSelectedTranslator] = useState<number | null>(null);
  const [showTranslators, setShowTranslators] = useState(false);
  const [translatorLoading, setTranslatorLoading] = useState(false);
  const [subtitles, setSubtitles] = useState<ArtSubtitle[]>([]);
  const [selectedSubtitleId, setSelectedSubtitleId] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const saveInterval = useRef<any>(null);
  const translatorRef = useRef<HTMLDivElement>(null);
  const subsFetchedRef = useRef(false);

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

  const startSaving = useCallback(() => {
    if (saveInterval.current) clearInterval(saveInterval.current);
    saveInterval.current = setInterval(() => {
      if (videoRef.current && !videoRef.current.paused) {
        const ct = videoRef.current.currentTime;
        const dur = videoRef.current.duration;
        if (ct > 0 && dur > 0) {
          savePosition(movie.id, "movie", ct, dur);
          const trName = translators.find(t => t.id === selectedTranslator)?.name || "";
          addToHistory({
            id: movie.id, type: "movie", title: movie.title,
            poster_path: movie.poster_path, vote_average: movie.vote_average,
            release_date: movie.release_date, watchedAt: Date.now(),
            progress: ct, duration: dur, quality: selectedQuality,
            translatorName: trName, translatorId: selectedTranslator || undefined,
            genre_ids: movie.genres?.map(g => g.id),
          });
        }
      }
    }, 5000);
  }, [movie, selectedQuality, selectedTranslator, translators]);

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

  const fetchStream = async (translatorId?: number | null) => {
    if (isNotReleased) return;
    setLoading(true);
    setError("");
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
      const trParam = effectiveTr ? "&translator_id=" + effectiveTr : "";
      const res = await fetch("/hdrezka/api/search?q=" + q + "&year=" + year + "&type=movie" + trParam);
      const data = await res.json();
      if (data.stream) {
        // Auto-skip HDRezka premium dubs on first play — they serve a 60-sec
        // "buy subscription" pre-roll instead of the stream.
        // Backend now reports `active_translator_id` so we know which dub
        // is actually playing instead of assuming translators[0].
        const playedId: number | undefined = effectiveTr ?? data.active_translator_id ?? data.translators?.[0]?.id;
        const playedIsPremium = data.translators?.find((t: any) => t.id === playedId)?.is_premium;
        const freeAlt = data.translators?.find((t: any) => !t.is_premium);
        if (!translatorId && playedIsPremium && freeAlt && freeAlt.id !== playedId) {
          setTranslators(data.translators);
          setSelectedTranslator(freeAlt.id);
          saveLastTranslator(movie.id, "movie", freeAlt.id, freeAlt.name);
          return fetchStream(freeAlt.id);
        }
        setStreamData(data);
        setSelectedQuality(data.quality);
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
            setStreamData(data2);
            setSelectedQuality(data2.quality);
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
          setStreamData(dataAlt);
          setSelectedQuality(dataAlt.quality);
          if (dataAlt.translators && dataAlt.translators.length > 0 && translators.length === 0) {
            setTranslators(dataAlt.translators);
            if (!selectedTranslator) setSelectedTranslator(dataAlt.active_translator_id ?? dataAlt.translators[0].id);
          }
          return;
        }
      }
      setError("Фильм пока недоступен для просмотра");
    } catch {
      setError("Сервер не отвечает");
    } finally {
      setLoading(false);
      setTranslatorLoading(false);
    }
  };

  const changeTranslator = async (trId: number) => {
    if (trId === selectedTranslator) { setShowTranslators(false); return; }
    setSelectedTranslator(trId);
    const trName = translators.find(t => t.id === trId)?.name || "";
    saveLastTranslator(movie.id, "movie", trId, trName);
    setShowTranslators(false);
    setTranslatorLoading(true);
    const currentTime = videoRef.current?.currentTime || 0;
    await fetchStream(trId);
    setTimeout(() => {
      if (videoRef.current && currentTime > 0) {
        videoRef.current.currentTime = currentTime;
      }
    }, 500);
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
    setSelectedQuality(q);
    setStreamData((prev: any) => prev ? { ...prev, stream: prev.streams[q] } : prev);
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
          {!showPlayer ? (
            <div className="w-full h-full relative cursor-pointer" onClick={() => {
              if (isNotReleased) return;
              if (!requireAuth("Войдите, чтобы смотреть фильмы и сохранять прогресс")) return;
              setShowPlayer(true); fetchStream();
            }}>
              {backdropUrl && <img src={backdropUrl} alt={movie.title} className={"absolute inset-0 w-full h-full transition-transform duration-700 group-hover:scale-105 " + (movie.backdrop_path ? "object-cover" : "object-contain bg-black/90")} />}
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-black/10 flex items-center justify-center">
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
                    <>
                      <div className="w-24 h-24 rounded-full bg-primary/90 flex items-center justify-center shadow-xl shadow-primary/40 transition-all duration-300 group-hover:scale-110 group-hover:bg-primary">
                        <Play size={44} className="text-white ml-1.5" fill="white" />
                      </div>
                      <span className="text-white/80 text-sm font-semibold tracking-widest uppercase">
                        {resumeTime ? "Продолжить с " + formatTime(resumeTime) : "Смотреть онлайн"}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-black/90 to-transparent">
                <h2 className="text-white font-bold text-2xl mb-3">{movie.title}</h2>
                <div className="flex items-center gap-2 flex-wrap">
                  {isNotReleased ? (
                    <span className="bg-amber-600/80 text-white text-xs px-3 py-1 rounded-md font-bold">Скоро</span>
                  ) : (
                    <span className="bg-primary text-white text-xs px-3 py-1 rounded-md font-bold">HD</span>
                  )}
                  {movie.runtime > 0 && <span className="bg-white/10 backdrop-blur text-white/80 text-xs px-3 py-1 rounded-md">{Math.round(movie.runtime) + " мин"}</span>}
                  <span className="bg-white/10 backdrop-blur text-white/80 text-xs px-3 py-1 rounded-md">{movie.vote_average.toFixed(1)}</span>
                  <div onClick={(e) => e.stopPropagation()}>
                    <TrailerButton mediaId={movie.id} mediaType="movie" />
                  </div>
                </div>
              </div>
              <div className="absolute top-4 right-4 z-10">
                <div className="bg-black/60 backdrop-blur-sm rounded-full p-2">
                  <FavoriteButton size="md" item={{
                    id: movie.id, type: "movie", title: movie.title,
                    poster_path: movie.poster_path, vote_average: movie.vote_average,
                    release_date: movie.release_date, addedAt: Date.now(),
                  }} />
                </div>
              </div>
            </div>
          ) : (loading || showLoadingMascot) && !streamData ? (
            <div className="w-full h-full flex flex-col items-center justify-center bg-black text-white gap-5">
              <video
                src="/mascot.webm"
                autoPlay
                muted
                loop
                playsInline
                preload="auto"
                disablePictureInPicture
                controlsList="nodownload noplaybackrate nofullscreen"
                className="w-80 h-80 sm:w-96 sm:h-96 md:w-[28rem] md:h-[28rem] lg:w-[34rem] lg:h-[34rem] xl:w-[40rem] xl:h-[40rem] object-contain pointer-events-none select-none drop-shadow-[0_0_80px_rgba(163,230,53,0.3)]"
                style={{ mixBlendMode: "screen" }}
                aria-hidden="true"
                tabIndex={-1}
              />
              <div className="flex flex-col items-center gap-1">
                <p className="text-lg font-semibold">{translatorLoading ? "Смена озвучки..." : "Загрузка фильма"}</p>
                <p className="text-gray-500 text-sm">Поиск лучшего качества...</p>
              </div>
            </div>
          ) : error ? (
            <div className="w-full h-full flex flex-col items-center justify-center bg-black text-white gap-4 px-8">
              <Clock size={48} className="text-gray-500" />
              <p className="text-gray-300 text-center text-lg">{error}</p>
              <p className="text-gray-500 text-center text-sm">Попробуйте позже или выберите другой фильм</p>
              <button onClick={() => fetchStream()} className="px-6 py-3 bg-primary hover:bg-primary/90 rounded-xl font-medium transition-colors">Попробовать снова</button>
            </div>
          ) : streamData ? (
            <>
              <ArtPlayerView
                streamUrl={streamData.stream}
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
                resumeTime={resumeTime || undefined}
                onVideoReady={(v) => {
                  videoRef.current = v;
                  startSaving();
                  // Resume is handled inside ArtPlayerView (loadedmetadata).
                }}
                onVideoUnmount={() => { videoRef.current = null; if (saveInterval.current) clearInterval(saveInterval.current); }}
              />
              <SkipOverlays videoRef={videoRef} tmdbId={movie.id} type="movie" />
              {translatorLoading && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
                    <p className="text-white text-sm">Смена озвучки...</p>
                  </div>
                </div>
              )}
              {false && showResume && (
                <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/80 backdrop-blur-sm">
                  <div className="bg-gray-900 border border-white/10 rounded-2xl p-6 max-w-sm mx-4 text-center space-y-4">
                    <p className="text-white text-lg font-semibold">Продолжить просмотр?</p>
                    <p className="text-gray-400 text-sm">{"Вы остановились на " + formatTime(resumeTime || 0)}</p>
                    <div className="flex gap-3 justify-center">
                      <button onClick={handleResume} className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl font-medium transition-colors">
                        Продолжить
                      </button>
                      <button onClick={handleStartOver} className="px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl font-medium transition-colors border border-white/10">
                        Сначала
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {cssFullscreen && (
                <button onClick={() => setCssFullscreen(false)} className="fixed top-3 right-3 z-[10000] bg-black/70 backdrop-blur text-white px-3 py-2 rounded-lg text-sm">{"\u2715 Закрыть"}</button>
              )}
            </>
          ) : null}
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
                  <button
                    onClick={() => setShowBingo(true)}
                    title="Кино-бинго"
                    className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-foreground/[0.05] hover:bg-foreground/[0.10] ring-1 ring-white/[0.08] hover:ring-primary/30 transition-colors text-lg"
                  >
                    🎲
                  </button>
                </div>
                {showBingo && <BingoCard mediaId={movie.id} mediaType="movie" onClose={() => setShowBingo(false)} />}

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
                </div>

                {movie.overview && (
                  <p className="text-foreground/65 text-[13px] sm:text-[14px] leading-relaxed line-clamp-2 max-w-2xl">{movie.overview}</p>
                )}

                <div className="flex items-center gap-2 flex-wrap pt-1">
                  <button
                    onClick={() => {
                      if (isNotReleased) return;
                      if (!requireAuth("Войдите, чтобы смотреть фильмы и сохранять прогресс")) return;
                      if (!showPlayer) { setShowPlayer(true); fetchStream(); }
                      else if (resumeTime && videoRef.current) videoRef.current.currentTime = resumeTime;
                    }}
                    disabled={isNotReleased}
                    className="inline-flex items-center gap-2 h-10 px-4 rounded-full bg-primary text-primary-foreground text-[13px] font-semibold hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isNotReleased ? (
                      <><CalendarDays size={15} /> {"Скоро в кино"}</>
                    ) : (
                      <><Play size={15} fill="currentColor" /> {resumeTime ? "Продолжить просмотр" : "Смотреть"}</>
                    )}
                  </button>
                  {streamData && (
                    <SendToTV
                      streamData={{
                        stream: streamData.stream, quality: selectedQuality, streams: streamData.streams,
                        title: streamData.title || movie.title,
                        translators, selectedTranslator,
                        searchQuery: movie.title,
                        year: movie.release_date ? new Date(movie.release_date).getFullYear().toString() : "",
                        isSeries: false,
                        mediaId: movie.id, mediaType: "movie",
                        poster_path: movie.poster_path, vote_average: movie.vote_average,
                        release_date: movie.release_date,
                      }}
                    />
                  )}
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
