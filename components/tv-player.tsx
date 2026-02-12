"use client";
import { SendToTV } from './send-to-tv';

import type { TVShowDetails } from "@/lib/tmdb";
import { Play, Film, ChevronDown, Mic } from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import Hls from "hls.js";
import { FavoriteButton } from "./favorite-button";
import { savePosition, getPosition, addToHistory, saveLastEpisode, getLastEpisode } from "@/lib/storage";

interface TVPlayerProps {
  show: TVShowDetails;
}

interface Episode {
  id: number;
  name: string;
  episode_number: number;
  season_number: number;
  air_date: string;
  overview: string;
  still_path: string | null;
  runtime: number;
  vote_average: number;
}

interface Translator {
  id: number;
  name: string;
}

export function TVPlayer({ show }: TVPlayerProps) {
  const [showPlayer, setShowPlayer] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [streamData, setStreamData] = useState<any>(null);
  const [selectedQuality, setSelectedQuality] = useState("");
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [selectedEpisode, setSelectedEpisode] = useState(1);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const [showSeasons, setShowSeasons] = useState(false);
  const [showEpisodes, setShowEpisodes] = useState(false);
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

  const validSeasons = show.seasons?.filter(s => s.season_number > 0) || [];

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
    const last = getLastEpisode(show.id);
    if (last) {
      setSelectedSeason(last.season);
      setSelectedEpisode(last.episode);
    }
  }, [show.id]);

  useEffect(() => {
    const pos = getPosition(show.id, "tv", selectedSeason, selectedEpisode);
    if (pos && pos.time > 10) {
      setResumeTime(pos.time);
    } else {
      setResumeTime(null);
    }
  }, [show.id, selectedSeason, selectedEpisode]);

  const startSaving = useCallback(() => {
    if (saveInterval.current) clearInterval(saveInterval.current);
    saveInterval.current = setInterval(() => {
      if (videoRef.current && !videoRef.current.paused) {
        const ct = videoRef.current.currentTime;
        const dur = videoRef.current.duration;
        if (ct > 0 && dur > 0) {
          savePosition(show.id, "tv", ct, dur, selectedSeason, selectedEpisode);
          saveLastEpisode(show.id, selectedSeason, selectedEpisode);
          const epName = episodes.find(e => e.episode_number === selectedEpisode)?.name || "";
          addToHistory({
            id: show.id, type: "tv", title: show.name,
            poster_path: show.poster_path, vote_average: show.vote_average,
            first_air_date: show.first_air_date, watchedAt: Date.now(),
            progress: ct, duration: dur, season: selectedSeason,
            episode: selectedEpisode, episodeName: epName, quality: selectedQuality,
          });
        }
      }
    }, 5000);
  }, [show, selectedSeason, selectedEpisode, selectedQuality, episodes]);

  useEffect(() => {
    return () => { if (saveInterval.current) clearInterval(saveInterval.current); };
  }, []);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (videoRef.current) {
        savePosition(show.id, "tv", videoRef.current.currentTime, videoRef.current.duration, selectedSeason, selectedEpisode);
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [show.id, selectedSeason, selectedEpisode]);

  useEffect(() => {
    const loadEpisodes = async () => {
      setLoadingEpisodes(true);
      try {
        const res = await fetch("/api/tv-episodes?id=" + show.id + "&season=" + selectedSeason);
        const eps = await res.json();
        setEpisodes(Array.isArray(eps) ? eps : []);
      } catch { setEpisodes([]); }
      finally { setLoadingEpisodes(false); }
    };
    if (showPlayer) loadEpisodes();
  }, [selectedSeason, showPlayer, show.id]);

  const fetchStream = async (season: number, episode: number, translatorId?: number | null) => {
    setLoading(true);
    setError("");
    if (!translatorId) setStreamData(null);
    try {
      const year = show.first_air_date ? new Date(show.first_air_date).getFullYear() : "";
      const q = encodeURIComponent(show.name);
      const trParam = translatorId ? "&translator_id=" + translatorId : "";
      const res = await fetch("/hdrezka/api/search?q=" + q + "&year=" + year + "&type=tv&season=" + season + "&episode=" + episode + trParam);
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
          const res2 = await fetch("/hdrezka/api/search?q=" + q + "&year=" + year + "&index=" + i + "&season=" + season + "&episode=" + episode + trParam);
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
        setError("Серия не найдена");
      } else { setError(data.error || "Сериал не найден"); }
    } catch { setError("Сервер не отвечает"); }
    finally { setLoading(false); setTranslatorLoading(false); }
  };

  const changeTranslator = async (trId: number) => {
    if (trId === selectedTranslator) { setShowTranslators(false); return; }
    setSelectedTranslator(trId);
    setShowTranslators(false);
    setTranslatorLoading(true);
    const currentTime = videoRef.current?.currentTime || 0;
    await fetchStream(selectedSeason, selectedEpisode, trId);
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
      const pos = getPosition(show.id, "tv", selectedSeason, selectedEpisode);
      if (pos && pos.time > 10 && !translatorLoading) {
        setShowResume(true);
        loadStream(streamData.stream);
      } else {
        loadStream(streamData.stream);
      }
    }
    return () => { if (hlsRef.current) hlsRef.current.destroy(); };
  }, [streamData]);

  const handleResume = () => {
    if (videoRef.current && resumeTime) videoRef.current.currentTime = resumeTime;
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

  const selectEpisode = (season: number, episode: number) => {
    setSelectedSeason(season);
    setSelectedEpisode(episode);
    setShowEpisodes(false);
    setShowSeasons(false);
    setShowResume(false);
    setResumeTime(null);
    fetchStream(season, episode, selectedTranslator);
  };

  const nextEpisode = () => {
    const currentEpIndex = episodes.findIndex(e => e.episode_number === selectedEpisode);
    if (currentEpIndex < episodes.length - 1) {
      selectEpisode(selectedSeason, episodes[currentEpIndex + 1].episode_number);
    } else if (selectedSeason < validSeasons.length) {
      setSelectedSeason(selectedSeason + 1);
      setSelectedEpisode(1);
      fetchStream(selectedSeason + 1, 1, selectedTranslator);
    }
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
    return h > 0 ? `${h}:${m.toString().padStart(2,"0")}:${sec.toString().padStart(2,"0")}` : `${m}:${sec.toString().padStart(2,"0")}`;
  };

  const getTranslatorName = () => {
    if (!selectedTranslator || translators.length === 0) return "Озвучка";
    const t = translators.find(t => t.id === selectedTranslator);
    return t ? t.name : "Озвучка";
  };

  const backdropUrl = show.backdrop_path
    ? "/tmdb-img/w1280" + show.backdrop_path
    : show.poster_path
      ? "/tmdb-img/w780" + show.poster_path
      : null;

  const currentEpisodeName = episodes.find(e => e.episode_number === selectedEpisode)?.name || "Серия " + selectedEpisode;

  return (
    <div className="relative w-full">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className={cssFullscreen
          ? "fixed inset-0 z-[9999] bg-black flex items-center justify-center"
          : "aspect-video bg-black rounded-2xl overflow-hidden relative shadow-2xl shadow-black/50 border border-white/5 group"
        }>
          {!showPlayer ? (
            <div className="w-full h-full relative cursor-pointer" onClick={() => { setShowPlayer(true); fetchStream(selectedSeason, selectedEpisode); }}>
              {backdropUrl && <img src={backdropUrl} alt={show.name} className={`absolute inset-0 w-full h-full transition-transform duration-700 group-hover:scale-105 ${show.backdrop_path ? "object-cover" : "object-contain bg-black/90"}`} />}
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-black/10 flex items-center justify-center">
                <div className="flex flex-col items-center gap-5">
                  <div className="w-24 h-24 rounded-full bg-primary/90 flex items-center justify-center shadow-xl shadow-primary/40 transition-all duration-300 group-hover:scale-110 group-hover:bg-primary">
                    <Play size={44} className="text-white ml-1.5" fill="white" />
                  </div>
                  <span className="text-white/80 text-sm font-semibold tracking-widest uppercase">
                    {resumeTime ? "Продолжить с " + formatTime(resumeTime) : "Смотреть онлайн"}
                  </span>
                </div>
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-black/90 to-transparent">
                <h2 className="text-white font-bold text-2xl mb-3">{show.name}</h2>
                <div className="flex items-center gap-2">
                  <span className="bg-primary text-white text-xs px-3 py-1 rounded-md font-bold">HD</span>
                  <span className="bg-white/10 backdrop-blur text-white/80 text-xs px-3 py-1 rounded-md">{"" + show.number_of_seasons + " сезон(ов)"}</span>
                  <span className="bg-white/10 backdrop-blur text-white/80 text-xs px-3 py-1 rounded-md">{show.vote_average.toFixed(1)}</span>
                </div>
              </div>
              <div className="absolute top-4 right-4 z-10">
                <div className="bg-black/60 backdrop-blur-sm rounded-full p-2">
                  <FavoriteButton size="md" item={{
                    id: show.id, type: "tv", title: show.name,
                    poster_path: show.poster_path, vote_average: show.vote_average,
                    first_air_date: show.first_air_date, addedAt: Date.now(),
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
              <p className="text-lg font-semibold">{translatorLoading ? "Смена озвучки..." : "Загрузка серии"}</p>
              <p className="text-gray-500 text-sm">{"Сезон " + selectedSeason + ", Серия " + selectedEpisode}</p>
            </div>
          ) : error ? (
            <div className="w-full h-full flex flex-col items-center justify-center bg-black text-white gap-4 px-8">
              <p className="text-red-400 text-center text-lg">{error}</p>
              <button onClick={() => fetchStream(selectedSeason, selectedEpisode)} className="px-6 py-3 bg-primary hover:bg-primary/90 rounded-xl font-medium transition-colors">Попробовать снова</button>
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
                    <p className="text-gray-400 text-sm">{"С" + selectedSeason + " Э" + selectedEpisode + " \u2014 " + formatTime(resumeTime || 0)}</p>
                    <div className="flex gap-3 justify-center">
                      <button onClick={handleResume} className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl font-medium transition-colors">Продолжить</button>
                      <button onClick={handleStartOver} className="px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl font-medium transition-colors border border-white/10">Сначала</button>
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

        {showPlayer && (
          <div className="mt-4 flex items-center gap-3 flex-wrap">
            {streamData && <SendToTV streamData={{ stream: streamData.stream, quality: selectedQuality, streams: streamData.streams, title: show.name + " S" + selectedSeason + "E" + selectedEpisode, translators, selectedTranslator, searchQuery: show.name, year: show.first_air_date ? new Date(show.first_air_date).getFullYear().toString() : "", season: selectedSeason, episode: selectedEpisode, isSeries: true, totalSeasons: validSeasons.length, totalEpisodes: episodes.length, mediaId: show.id, mediaType: "tv", poster_path: show.poster_path, vote_average: show.vote_average, first_air_date: show.first_air_date, episodeName: episodes.find(e => e.episode_number === selectedEpisode)?.name || "" }} />}
            {translators.length > 1 && (
              <div className="relative" ref={translatorRef}>
                <button onClick={() => { setShowTranslators(!showTranslators); setShowSeasons(false); setShowEpisodes(false); }}
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
            <div className="relative">
              <button onClick={() => { setShowSeasons(!showSeasons); setShowEpisodes(false); setShowTranslators(false); }}
                className="flex items-center gap-2 px-4 py-2.5 bg-gray-800/80 hover:bg-gray-700 rounded-xl text-sm font-medium text-white transition-colors border border-white/10">
                {"Сезон " + selectedSeason}
                <ChevronDown size={16} className={"transition-transform " + (showSeasons ? "rotate-180" : "")} />
              </button>
              {showSeasons && (
                <div className="absolute bottom-full left-0 mb-2 bg-gray-900/95 backdrop-blur border border-white/10 rounded-xl overflow-hidden shadow-2xl z-50 min-w-[180px] max-h-[300px] overflow-y-auto">
                  {validSeasons.map(s => (
                    <button key={s.season_number} onClick={() => { setSelectedSeason(s.season_number); setSelectedEpisode(1); setShowSeasons(false); }}
                      className={"w-full text-left px-4 py-3 text-sm hover:bg-white/5 transition-colors border-b border-white/5 last:border-0 " +
                        (selectedSeason === s.season_number ? "text-primary font-semibold" : "text-gray-300")}>
                      {"Сезон " + s.season_number + " (" + s.episode_count + " серий)"}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="relative">
              <button onClick={() => { setShowEpisodes(!showEpisodes); setShowSeasons(false); setShowTranslators(false); }}
                className="flex items-center gap-2 px-4 py-2.5 bg-gray-800/80 hover:bg-gray-700 rounded-xl text-sm font-medium text-white transition-colors border border-white/10">
                {"Серия " + selectedEpisode + ": " + (currentEpisodeName.length > 20 ? currentEpisodeName.slice(0, 20) + "..." : currentEpisodeName)}
                <ChevronDown size={16} className={"transition-transform " + (showEpisodes ? "rotate-180" : "")} />
              </button>
              {showEpisodes && (
                <div className="absolute bottom-full left-0 mb-2 bg-gray-900/95 backdrop-blur border border-white/10 rounded-xl overflow-hidden shadow-2xl z-50 min-w-[300px] max-h-[300px] overflow-y-auto">
                  {loadingEpisodes ? (
                    <div className="px-4 py-6 text-center text-gray-400 text-sm">Загрузка...</div>
                  ) : episodes.map(ep => (
                    <button key={ep.episode_number} onClick={() => selectEpisode(selectedSeason, ep.episode_number)}
                      className={"w-full text-left px-4 py-3 text-sm hover:bg-white/5 transition-colors border-b border-white/5 last:border-0 " +
                        (selectedEpisode === ep.episode_number ? "text-primary font-semibold" : "text-gray-300")}>
                      {ep.episode_number + ". " + (ep.name || "Серия " + ep.episode_number)}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={nextEpisode} className="px-4 py-2.5 rounded-xl text-sm font-medium bg-gray-800/80 text-gray-300 border border-white/10 hover:bg-gray-700 transition-colors">{"\u25B6 Следующая"}</button>
            {streamData?.streams && Object.keys(streamData.streams).map((q: string) => (
              <button key={q} onClick={() => changeQuality(q)}
                className={"px-4 py-2.5 rounded-xl text-sm font-medium transition-colors border " +
                  (selectedQuality === q ? "bg-primary text-white border-primary" : "bg-gray-800/80 text-gray-300 border-white/10 hover:bg-gray-700")}>{q}</button>
            ))}
            <button onClick={toggleFullscreen} className="px-4 py-2.5 rounded-xl text-sm font-medium bg-gray-800/80 text-gray-300 border border-white/10 hover:bg-gray-700 transition-colors">На весь экран</button>
            {streamData?.title && <span className="px-4 py-2.5 bg-gray-800/50 rounded-xl text-sm text-gray-400 border border-white/5">{streamData.title}</span>}
          </div>
        )}

        {!cssFullscreen && (
          <div className="mt-8 space-y-4">
            <div className="flex items-center gap-4">
              <h1 className="text-4xl font-bold text-foreground tracking-tight">{show.name}</h1>
              <FavoriteButton size="md" item={{
                id: show.id, type: "tv", title: show.name,
                poster_path: show.poster_path, vote_average: show.vote_average,
                first_air_date: show.first_air_date, addedAt: Date.now(),
              }} />
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="bg-gray-800 px-4 py-2 rounded-xl text-gray-300">{show.first_air_date ? new Date(show.first_air_date).toLocaleDateString("ru-RU") : ""}</span>
              <span className="bg-gray-800 px-4 py-2 rounded-xl text-gray-300">{show.number_of_seasons + " сезон(ов)"}</span>
              <span className="bg-gray-800 px-4 py-2 rounded-xl text-gray-300">{show.number_of_episodes + " серий"}</span>
              <span className="bg-gray-800 px-4 py-2 rounded-xl text-gray-300">{show.vote_average.toFixed(1) + "/10"}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}




