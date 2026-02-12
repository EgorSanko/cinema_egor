"use client";

import type { MovieDetails } from "@/lib/tmdb";
import { SendToTV } from './send-to-tv';
import { Play, Film, ChevronDown, Mic, Clock, CalendarDays } from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import Hls from "hls.js";
import { FavoriteButton } from "./favorite-button";
import { savePosition, getPosition, addToHistory } from "@/lib/storage";

interface MoviePlayerProps {
  movie: MovieDetails;
}

interface Translator {
  id: number;
  name: string;
}

export function MoviePlayer({ movie }: MoviePlayerProps) {
  const [showPlayer, setShowPlayer] = useState(false);
  const [loading, setLoading] = useState(false);
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const saveInterval = useRef<any>(null);
  const translatorRef = useRef<HTMLDivElement>(null);

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
  }, [movie.id]);

  const startSaving = useCallback(() => {
    if (saveInterval.current) clearInterval(saveInterval.current);
    saveInterval.current = setInterval(() => {
      if (videoRef.current && !videoRef.current.paused) {
        const ct = videoRef.current.currentTime;
        const dur = videoRef.current.duration;
        if (ct > 0 && dur > 0) {
          savePosition(movie.id, "movie", ct, dur);
          addToHistory({
            id: movie.id, type: "movie", title: movie.title,
            poster_path: movie.poster_path, vote_average: movie.vote_average,
            release_date: movie.release_date, watchedAt: Date.now(),
            progress: ct, duration: dur, quality: selectedQuality,
          });
        }
      }
    }, 5000);
  }, [movie, selectedQuality]);

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
    if (!translatorId) setStreamData(null);
    try {
      const year = movie.release_date ? new Date(movie.release_date).getFullYear() : "";
      const q = encodeURIComponent(movie.title);
      const trParam = translatorId ? "&translator_id=" + translatorId : "";
      const res = await fetch("/hdrezka/api/search?q=" + q + "&year=" + year + "&type=movie" + trParam);
      const data = await res.json();
      if (data.stream) {
        setStreamData(data);
        setSelectedQuality(data.quality);
        if (data.translators && data.translators.length > 0 && translators.length === 0) {
          setTranslators(data.translators);
          if (!selectedTranslator) {
            setSelectedTranslator(data.translators[0].id);
          }
        }
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
                setSelectedTranslator(data2.translators[0].id);
              }
            }
            return;
          }
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

  const loadStream = (url: string, seekTo?: number) => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    if (url.includes(".m3u8") && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true });
      hlsRef.current = hls;
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (seekTo && seekTo > 0) video.currentTime = seekTo;
        video.play().catch(() => {});
        startSaving();
      });
    } else {
      video.src = url;
      if (seekTo && seekTo > 0) video.currentTime = seekTo;
      video.play().catch(() => {});
      startSaving();
    }
  };

  useEffect(() => {
    if (streamData?.stream && videoRef.current) {
      if (resumeTime && resumeTime > 10 && !translatorLoading) {
        setShowResume(true);
        loadStream(streamData.stream);
      } else {
        loadStream(streamData.stream);
      }
    }
    return () => { if (hlsRef.current) hlsRef.current.destroy(); };
  }, [streamData]);

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
    const time = videoRef.current?.currentTime || 0;
    setSelectedQuality(q);
    loadStream(streamData.streams[q], time);
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
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className={cssFullscreen
          ? "fixed inset-0 z-[9999] bg-black flex items-center justify-center"
          : "aspect-video bg-black rounded-2xl overflow-hidden relative shadow-2xl shadow-black/50 border border-white/5 group"
        }>
          {!showPlayer ? (
            <div className="w-full h-full relative cursor-pointer" onClick={() => { if (!isNotReleased) { setShowPlayer(true); fetchStream(); } }}>
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
                <div className="flex items-center gap-2">
                  {isNotReleased ? (
                    <span className="bg-amber-600/80 text-white text-xs px-3 py-1 rounded-md font-bold">Скоро</span>
                  ) : (
                    <span className="bg-primary text-white text-xs px-3 py-1 rounded-md font-bold">HD</span>
                  )}
                  {movie.runtime > 0 && <span className="bg-white/10 backdrop-blur text-white/80 text-xs px-3 py-1 rounded-md">{Math.round(movie.runtime) + " мин"}</span>}
                  <span className="bg-white/10 backdrop-blur text-white/80 text-xs px-3 py-1 rounded-md">{movie.vote_average.toFixed(1)}</span>
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
          ) : loading && !streamData ? (
            <div className="w-full h-full flex flex-col items-center justify-center bg-black text-white gap-4">
              <div className="relative">
                <div className="w-20 h-20 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                <Film size={24} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-primary" />
              </div>
              <p className="text-lg font-semibold">{translatorLoading ? "Смена озвучки..." : "Загрузка фильма"}</p>
              <p className="text-gray-500 text-sm">Поиск лучшего качества...</p>
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
              <video ref={videoRef} className={cssFullscreen ? "w-full h-full" : "w-full h-full bg-black"} controls playsInline />
              {translatorLoading && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
                    <p className="text-white text-sm">Смена озвучки...</p>
                  </div>
                </div>
              )}
              {showResume && (
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

        {showPlayer && streamData && !cssFullscreen && (
          <div className="mt-4 flex items-center gap-3 flex-wrap">
            {translators.length > 1 && (
              <div className="relative" ref={translatorRef}>
                <button onClick={() => setShowTranslators(!showTranslators)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-gray-800/80 hover:bg-gray-700 rounded-xl text-sm font-medium text-white transition-colors border border-white/10 backdrop-blur">
                  <Mic size={14} />
                  <span className="max-w-[150px] truncate">{getTranslatorName()}</span>
                  <ChevronDown size={14} className={"transition-transform " + (showTranslators ? "rotate-180" : "")} />
                </button>
                {showTranslators && (
                  <div className="absolute bottom-full left-0 mb-2 bg-gray-900/95 backdrop-blur border border-white/10 rounded-xl overflow-hidden shadow-2xl z-50 min-w-[220px] max-h-[300px] overflow-y-auto">
                    {translators.map((t) => (
                      <button key={t.id + "-" + t.name} onClick={() => changeTranslator(t.id)}
                        className={"w-full text-left px-4 py-3 text-sm hover:bg-white/5 transition-colors border-b border-white/5 last:border-0 " +
                          (selectedTranslator === t.id ? "text-primary bg-primary/5" : "text-gray-300")}>
                        {selectedTranslator === t.id ? "\u2713 " : ""}{t.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {streamData && <SendToTV streamData={{ stream: streamData.stream, quality: selectedQuality, streams: streamData.streams, title: streamData.title, translators, selectedTranslator, searchQuery: movie.title, year: movie.release_date ? new Date(movie.release_date).getFullYear().toString() : "", isSeries: false, mediaId: movie.id, mediaType: "movie", poster_path: movie.poster_path, vote_average: movie.vote_average, release_date: movie.release_date }} />}
            {streamData.streams && Object.keys(streamData.streams).map((q: string) => (
              <button key={q} onClick={() => changeQuality(q)}
                className={"px-4 py-2.5 rounded-xl text-sm font-medium transition-colors border " +
                  (selectedQuality === q ? "bg-primary text-white border-primary" : "bg-gray-800/80 text-gray-300 border-white/10 hover:bg-gray-700")}>
                {q}
              </button>
            ))}
            <button onClick={toggleFullscreen}
              className="px-4 py-2.5 rounded-xl text-sm font-medium bg-gray-800/80 text-gray-300 border border-white/10 hover:bg-gray-700 transition-colors">
              На весь экран
            </button>
            {streamData?.title && <span className="px-4 py-2.5 bg-gray-800/50 rounded-xl text-sm text-gray-400 border border-white/5">{streamData.title}</span>}
          </div>
        )}

        {!cssFullscreen && (
          <div className="mt-8 space-y-4">
            <div className="flex items-center gap-4">
              <h1 className="text-4xl font-bold text-foreground tracking-tight">{movie.title}</h1>
              <FavoriteButton size="md" item={{
                id: movie.id, type: "movie", title: movie.title,
                poster_path: movie.poster_path, vote_average: movie.vote_average,
                release_date: movie.release_date, addedAt: Date.now(),
              }} />
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="bg-gray-800 px-4 py-2 rounded-xl text-gray-300">{new Date(movie.release_date).toLocaleDateString("ru-RU")}</span>
              {movie.runtime > 0 && <span className="bg-gray-800 px-4 py-2 rounded-xl text-gray-300">{movie.runtime + " мин"}</span>}
              <span className="bg-gray-800 px-4 py-2 rounded-xl text-gray-300">{movie.vote_average.toFixed(1) + "/10"}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


