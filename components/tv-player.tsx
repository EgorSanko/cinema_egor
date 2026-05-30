"use client";
import { SendToTV } from './send-to-tv';
import { MovieDownloadButton } from './movie-download-button';

import type { TVShowDetails } from "@/lib/tmdb";
import {
  Play, Film, ChevronDown, Mic, Users, Tv as TvIcon, Subtitles, Settings, MoreHorizontal,
  ChevronLeft, ChevronRight, Maximize, SkipForward, Heart, Plus,
} from "lucide-react";
import { getImageUrl } from "@/lib/tmdb";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useRef, useEffect, useCallback } from "react";
import Hls from "hls.js";
import { FavoriteButton } from "./favorite-button";
import { BingoCard } from "./bingo-card";
import { StatusButtons } from "./status-buttons";
import { TrailerButton } from "./trailer-modal";
import { useAuthGate } from "./auth-gate";
import { SkipOverlays } from "./skip-overlays";
import { savePosition, getPosition, addToHistory, saveLastEpisode, getLastEpisode, saveLastTranslator, getLastTranslator, recordTranslatorTry } from "@/lib/storage";
import { ArtPlayerView, type ArtSubtitle } from "./art-player";

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
  is_premium?: boolean;
}

export function TVPlayer({ show }: TVPlayerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const requireAuth = useAuthGate();
  const [showPlayer, setShowPlayer] = useState(false);
  const [showBingo, setShowBingo] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showLoadingMascot, setShowLoadingMascot] = useState(false);
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
  // ArtPlayer container — once captured, SkipOverlays portals into it so
  // they stay visible in every fullscreen mode (web/native/mobile).
  const [playerContainer, setPlayerContainer] = useState<HTMLElement | null>(null);
  const [resumeTime, setResumeTime] = useState<number | null>(null);
  const [showResume, setShowResume] = useState(false);
  const [translators, setTranslators] = useState<Translator[]>([]);
  const [selectedTranslator, setSelectedTranslator] = useState<number | null>(null);
  const [showTranslators, setShowTranslators] = useState(false);
  const [translatorLoading, setTranslatorLoading] = useState(false);
  const [subtitles, setSubtitles] = useState<ArtSubtitle[]>([]);
  const [selectedSubtitleId, setSelectedSubtitleId] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const saveInterval = useRef<any>(null);
  const translatorRef = useRef<HTMLDivElement>(null);
  const autoplayTriggeredRef = useRef(false);
  const subsFetchedKeyRef = useRef<string>("");

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
    // Restore last used translator for this show
    const lastTr = getLastTranslator(show.id, "tv");
    if (lastTr) setSelectedTranslator(lastTr.id);

    // Query params override saved last-episode (e.g. from "Continue Watching" card)
    const params = new URLSearchParams(window.location.search);
    const qs = params.get("s");
    const qe = params.get("e");
    if (qs && qe) {
      // From Continue Watching: pre-select correct season/episode but DO NOT auto-play.
      // User clicks the big "Смотреть" overlay themselves.
      setSelectedSeason(parseInt(qs, 10));
      setSelectedEpisode(parseInt(qe, 10));
      return;
    }
    const last = getLastEpisode(show.id);
    if (last) {
      setSelectedSeason(last.season);
      setSelectedEpisode(last.episode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show.id]);

  useEffect(() => {
    const pos = getPosition(show.id, "tv", selectedSeason, selectedEpisode);
    if (pos && pos.time > 10) {
      setResumeTime(pos.time);
    } else {
      setResumeTime(null);
    }
  }, [show.id, selectedSeason, selectedEpisode]);

  // Live context for the save interval. Without these refs the interval
  // (set once via onVideoReady → startSaving) keeps writing history with
  // the FIRST episode's season/episode/quality/translator. Auto-next chain
  // (E1 → E2 → E3) silently piles all progress onto the E1 row, so the
  // user sees only E1 in history even though they watched 6 episodes.
  const ctxRef = useRef({
    season: selectedSeason,
    episode: selectedEpisode,
    quality: selectedQuality,
    translatorId: selectedTranslator,
    episodes,
    translators,
  });
  useEffect(() => {
    ctxRef.current = {
      season: selectedSeason,
      episode: selectedEpisode,
      quality: selectedQuality,
      translatorId: selectedTranslator,
      episodes,
      translators,
    };
  }, [selectedSeason, selectedEpisode, selectedQuality, selectedTranslator, episodes, translators]);

  const startSaving = useCallback(() => {
    if (saveInterval.current) clearInterval(saveInterval.current);
    saveInterval.current = setInterval(() => {
      if (videoRef.current && !videoRef.current.paused) {
        const ct = videoRef.current.currentTime;
        const dur = videoRef.current.duration;
        if (ct > 0 && dur > 0) {
          const ctx = ctxRef.current;
          savePosition(show.id, "tv", ct, dur, ctx.season, ctx.episode);
          saveLastEpisode(show.id, ctx.season, ctx.episode);
          const epName = ctx.episodes.find(e => e.episode_number === ctx.episode)?.name || "";
          const trName = ctx.translators.find(t => t.id === ctx.translatorId)?.name || "";
          addToHistory({
            id: show.id, type: "tv", title: show.name,
            poster_path: show.poster_path, vote_average: show.vote_average,
            first_air_date: show.first_air_date, watchedAt: Date.now(),
            progress: ct, duration: dur, season: ctx.season,
            episode: ctx.episode, episodeName: epName, quality: ctx.quality,
            translatorName: trName, translatorId: ctx.translatorId || undefined,
            genre_ids: show.genres?.map(g => g.id),
          });
        }
      }
    }, 5000);
  }, [show]);

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
    loadEpisodes();
  }, [selectedSeason, show.id]);

  const fetchStream = async (season: number, episode: number, translatorId?: number | null) => {
    setLoading(true);
    setError("");
    // Fallback chain — explicit arg > state > localStorage. Storage read covers
    // the race where the play button is tapped before the initial restore effect
    // sets selectedTranslator; without this the backend gets no translator_id
    // and returns the default dub even though the label shows the saved one.
    const effectiveTr = translatorId ?? selectedTranslator ?? getLastTranslator(show.id, "tv")?.id ?? null;
    if (effectiveTr && effectiveTr !== selectedTranslator) setSelectedTranslator(effectiveTr);
    if (!effectiveTr) setStreamData(null);
    try {
      const year = show.first_air_date ? new Date(show.first_air_date).getFullYear() : "";
      // HDRezka indexes Russian titles primarily — see the matching block in
      // movie-player.tsx for full context. Use localized first, fallback to
      // English original_name only if no result.
      const origName = ((show as any).original_name || "").replace(/["«»""]/g, "").trim();
      const ruName = (show.name || "").replace(/["«»""]/g, "").trim();
      const searchName = ruName || origName;
      const q = encodeURIComponent(searchName);
      const trParam = effectiveTr ? "&translator_id=" + effectiveTr : "";
      const res = await fetch("/hdrezka/api/search?q=" + q + "&year=" + year + "&type=tv&season=" + season + "&episode=" + episode + trParam);
      const data = await res.json();
      if (data.stream) {
        // Resolve which translator the returned stream actually represents.
        // Backend now reports `active_translator_id`; before relying on it,
        // selectedTranslator/list[0] divergence caused the UI to label the
        // wrong dub.
        const playedId: number | undefined = effectiveTr ?? data.active_translator_id ?? data.translators?.[0]?.id;
        const playedIsPremium = data.translators?.find((t: any) => t.id === playedId)?.is_premium;
        const freeAlt = data.translators?.find((t: any) => !t.is_premium);
        if (!translatorId && playedIsPremium && freeAlt && freeAlt.id !== playedId) {
          setTranslators(data.translators);
          setSelectedTranslator(freeAlt.id);
          saveLastTranslator(show.id, "tv", freeAlt.id, freeAlt.name);
          return fetchStream(season, episode, freeAlt.id);
        }
        setStreamData(data);
        setSelectedQuality(data.quality);
        if (data.translators && data.translators.length > 0 && translators.length === 0) {
          setTranslators(data.translators);
          if (!selectedTranslator) {
            setSelectedTranslator(data.active_translator_id ?? data.translators[0].id);
          }
        }
        // Track which dub user is actually watching with — counts toward Polyglot
        const activeId = effectiveTr ?? data.active_translator_id ?? data.translators?.[0]?.id;
        const activeName = data.translators?.find((t: any) => t.id === activeId)?.name;
        if (activeName) recordTranslatorTry(activeName);
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
                setSelectedTranslator(data2.active_translator_id ?? data2.translators[0].id);
              }
            }
            const activeId2 = effectiveTr ?? data2.active_translator_id ?? data2.translators?.[0]?.id;
            const activeName2 = data2.translators?.find((t: any) => t.id === activeId2)?.name;
            if (activeName2) recordTranslatorTry(activeName2);
            return;
          }
        }
        setError("Серия не найдена");
      } else { setError(data.error || "Сериал не найден"); }
    } catch { setError("Сервер не отвечает"); }
    finally { setLoading(false); setTranslatorLoading(false); }
  };

  const fetchSubtitles = useCallback(async () => {
    const key = `${show.id}/${selectedSeason}/${selectedEpisode}`;
    if (subsFetchedKeyRef.current === key) return;
    subsFetchedKeyRef.current = key;
    try {
      const params = new URLSearchParams({
        tmdb: String(show.id),
        season: String(selectedSeason),
        episode: String(selectedEpisode),
      });
      const res = await fetch(`/api/subtitles?${params}`);
      const data = await res.json();
      setSubtitles(data.subs || []);
    } catch {
      setSubtitles([]);
    }
  }, [show.id, selectedSeason, selectedEpisode]);

  // Reset subtitles on episode change
  useEffect(() => {
    setSelectedSubtitleId(null);
    setSubtitles([]);
    subsFetchedKeyRef.current = "";
  }, [selectedSeason, selectedEpisode]);

  const changeTranslator = async (trId: number) => {
    if (trId === selectedTranslator) { setShowTranslators(false); return; }
    setSelectedTranslator(trId);
    const trName = translators.find(t => t.id === trId)?.name || "";
    saveLastTranslator(show.id, "tv", trId, trName);
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

  // Min-show маскота 800ms — гарантия что не моргнёт
  useEffect(() => {
    if (loading) { setShowLoadingMascot(true); return; }
    const t = setTimeout(() => setShowLoadingMascot(false), 800);
    return () => clearTimeout(t);
  }, [loading]);

  // HLS loading + recovery + visibilitychange resume all live inside ArtPlayerView now.
  // The resume-time prompt still uses parent state — once stream is ready, ArtPlayer
  // jumps to the saved position automatically via the `resumeTime` prop.
  useEffect(() => {
    if (!streamData?.stream) return;
    const pos = getPosition(show.id, "tv", selectedSeason, selectedEpisode);
    if (pos && pos.time > 10 && !translatorLoading) {
      setShowResume(true);
    }
  }, [streamData, show.id, selectedSeason, selectedEpisode, translatorLoading]);

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
    // ArtPlayer picks up the new stream URL via the streamUrl prop change.
    setSelectedQuality(q);
    setStreamData((prev: any) => prev ? { ...prev, stream: prev.streams[q] } : prev);
  };

  const selectEpisode = (season: number, episode: number) => {
    setSelectedSeason(season);
    setSelectedEpisode(episode);
    setShowEpisodes(false);
    setShowSeasons(false);
    setShowResume(false);
    setResumeTime(null);
    // Sync URL so bookmarks/back-button match the currently-playing episode
    try { router.replace(`${pathname}?s=${season}&e=${episode}`, { scroll: false }); } catch {}
    fetchStream(season, episode, selectedTranslator);
  };

  // Released episodes only (filter unaired ones — TMDB sometimes lists future episodes
  // which HDRezka cannot resolve and falls back to episode 1 = duplicate content bug)
  const releasedEpisodes = episodes.filter(e => !e.air_date || new Date(e.air_date) <= new Date());

  const hasNextEpisode = (() => {
    const idx = releasedEpisodes.findIndex(e => e.episode_number === selectedEpisode);
    if (idx >= 0 && idx < releasedEpisodes.length - 1) return true;
    return selectedSeason < validSeasons.length;
  })();

  const nextEpisode = () => {
    const currentEpIndex = releasedEpisodes.findIndex(e => e.episode_number === selectedEpisode);
    if (currentEpIndex >= 0 && currentEpIndex < releasedEpisodes.length - 1) {
      selectEpisode(selectedSeason, releasedEpisodes[currentEpIndex + 1].episode_number);
    } else if (selectedSeason < validSeasons.length) {
      selectEpisode(selectedSeason + 1, 1);
    }
  };

  // Keep hasNextEpisode in a ref so listeners attached once read the latest value.
  const hasNextEpisodeRef = useRef(hasNextEpisode);
  useEffect(() => { hasNextEpisodeRef.current = hasNextEpisode; }, [hasNextEpisode]);

  // Auto-advance to the next episode when the current one ends.
  // No countdown overlay — just immediate transition. Native fullscreen on
  // <video> hides custom overlays anyway, so a no-UI auto-jump is more reliable
  // and matches what the user wants.
  // Also covers a case where some browsers loop-back to time 0 instead of firing
  // a clean ended event after fullscreen: a timeupdate watcher catches that too.
  useEffect(() => {
    if (!showPlayer) return;
    let cleanupFn: (() => void) | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let lastTime = 0;
    const attach = () => {
      const v = videoRef.current;
      if (!v) {
        retryTimer = setTimeout(attach, 200);
        return;
      }
      const triggerNext = () => {
        if (autoplayTriggeredRef.current) return;
        if (!hasNextEpisodeRef.current) return;
        autoplayTriggeredRef.current = true;
        // Flush a final history entry for the just-ended episode BEFORE we
        // switch — the 5-second save interval may not have fired since the
        // final 5 seconds of playback. Without this, episodes auto-advanced
        // mid-cycle land with stale progress (or no entry at all if it was
        // a fresh start).
        try {
          const v = videoRef.current;
          const ctx = ctxRef.current;
          if (v && v.duration > 0) {
            savePosition(show.id, "tv", v.duration, v.duration, ctx.season, ctx.episode);
            const epName = ctx.episodes.find(e => e.episode_number === ctx.episode)?.name || "";
            const trName = ctx.translators.find(t => t.id === ctx.translatorId)?.name || "";
            addToHistory({
              id: show.id, type: "tv", title: show.name,
              poster_path: show.poster_path, vote_average: show.vote_average,
              first_air_date: show.first_air_date, watchedAt: Date.now(),
              progress: v.duration, duration: v.duration, season: ctx.season,
              episode: ctx.episode, episodeName: epName, quality: ctx.quality,
              translatorName: trName, translatorId: ctx.translatorId || undefined,
              genre_ids: show.genres?.map(g => g.id),
            });
          }
        } catch {}
        nextEpisode();
      };
      const onEnded = () => triggerNext();
      const onTime = () => {
        // Detect fullscreen-loopback: was near end, now jumped back to 0 → end already happened
        const ct = v.currentTime, dur = v.duration || 0;
        if (lastTime > dur - 1.5 && lastTime > 5 && ct < 1 && dur > 60) {
          triggerNext();
        }
        lastTime = ct;
      };
      v.addEventListener("ended", onEnded);
      v.addEventListener("timeupdate", onTime);
      cleanupFn = () => {
        v.removeEventListener("ended", onEnded);
        v.removeEventListener("timeupdate", onTime);
      };
    };
    attach();
    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      if (cleanupFn) cleanupFn();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPlayer, selectedSeason, selectedEpisode, streamData]);

  // Reset trigger when episode changes
  useEffect(() => {
    autoplayTriggeredRef.current = false;
  }, [selectedSeason, selectedEpisode]);

  const toggleFullscreen = () => {
    const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
    const isTelegram = !!(window as any).Telegram?.WebApp;
    if (isTelegram) { try { (window as any).Telegram.WebApp.requestFullscreen(); } catch {} }
    // On desktop, fullscreen the WHOLE player container (not just <video>) so
    // overlays like the autoplay countdown remain visible.
    if (!isMobile && !isTelegram && containerRef.current?.requestFullscreen) {
      containerRef.current.requestFullscreen().catch(() => setCssFullscreen(true));
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
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div ref={containerRef} className={cssFullscreen
          ? "fixed inset-0 z-[9999] bg-black flex items-center justify-center"
          : "aspect-video bg-black rounded-2xl overflow-hidden relative shadow-2xl shadow-black/50 border border-white/5 group"
        }>
          {!showPlayer ? (
            <div className="w-full h-full relative cursor-pointer" onClick={() => {
              if (!requireAuth("Войдите, чтобы смотреть сериалы и сохранять прогресс")) return;
              setShowPlayer(true); fetchStream(selectedSeason, selectedEpisode);
            }}>
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
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="bg-primary text-white text-xs px-3 py-1 rounded-md font-bold">HD</span>
                  <span className="bg-white/10 backdrop-blur text-white/80 text-xs px-3 py-1 rounded-md">{"" + show.number_of_seasons + " сезон(ов)"}</span>
                  <span className="bg-white/10 backdrop-blur text-white/80 text-xs px-3 py-1 rounded-md">{show.vote_average.toFixed(1)}</span>
                  <div onClick={(e) => e.stopPropagation()}>
                    <TrailerButton mediaId={show.id} mediaType="tv" />
                  </div>
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
                <p className="text-lg font-semibold">{translatorLoading ? "Смена озвучки..." : "Загрузка серии"}</p>
                <p className="text-gray-500 text-sm">{"Сезон " + selectedSeason + ", Серия " + selectedEpisode}</p>
              </div>
            </div>
          ) : error ? (
            <div className="w-full h-full flex flex-col items-center justify-center bg-black text-white gap-4 px-8">
              <p className="text-red-400 text-center text-lg">{error}</p>
              <button onClick={() => fetchStream(selectedSeason, selectedEpisode)} className="px-6 py-3 bg-primary hover:bg-primary/90 rounded-xl font-medium transition-colors">Попробовать снова</button>
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
                  // Auto-resume now happens inside ArtPlayerView via the
                  // `resumeTime` prop + a loadedmetadata listener. Setting
                  // currentTime here used to fire too early (before MSE
                  // attaches) and got reset to 0 by the source swap.
                }}
                onVideoUnmount={() => { videoRef.current = null; if (saveInterval.current) clearInterval(saveInterval.current); }}
                onPlayerContainerReady={setPlayerContainer}
              />
              <SkipOverlays
                videoRef={videoRef}
                playerContainer={playerContainer}
                tmdbId={show.id}
                type="tv"
                season={selectedSeason}
                episode={selectedEpisode}
                hasNextEpisode={hasNextEpisode}
                onNextEpisode={nextEpisode}
              />
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
                    <p className="text-gray-400 text-sm">{"С" + selectedSeason + " Э" + selectedEpisode + " \u2014 " + formatTime(resumeTime || 0)}</p>
                    <div className="flex gap-3 justify-center">
                      <button onClick={handleResume} className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl font-medium transition-colors">Продолжить</button>
                      <button onClick={handleStartOver} className="px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl font-medium transition-colors border border-white/10">Сначала</button>
                    </div>
                  </div>
                </div>
              )}

            </>
          ) : null}
        </div>


        {!cssFullscreen && (
          <>
            {/* === INFO CARD: poster + title + meta + buttons + current episode progress === */}
            <section className="mt-7 grid grid-cols-[120px_1fr] sm:grid-cols-[180px_1fr] gap-5 sm:gap-7">
              {/* Poster */}
              <div className="rounded-2xl overflow-hidden ring-1 ring-white/[0.08] shadow-2xl shadow-black/40 aspect-[2/3] bg-foreground/[0.04]">
                {show.poster_path && (
                  <img
                    src={getImageUrl(show.poster_path, "w342")}
                    alt={show.name}
                    className="w-full h-full object-cover"
                  />
                )}
              </div>

              {/* Right column */}
              <div className="space-y-3.5 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-2xl sm:text-4xl font-bold text-foreground tracking-tight">{show.name}</h1>
                  <FavoriteButton size="md" item={{
                    id: show.id, type: "tv", title: show.name,
                    poster_path: show.poster_path, vote_average: show.vote_average,
                    first_air_date: show.first_air_date, addedAt: Date.now(),
                  }} />
                  <button
                    onClick={() => setShowBingo(true)}
                    title="Кино-бинго"
                    className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-foreground/[0.05] hover:bg-foreground/[0.10] ring-1 ring-white/[0.08] hover:ring-primary/30 transition-colors text-lg"
                  >
                    🎲
                  </button>
                </div>
                {showBingo && <BingoCard mediaId={show.id} mediaType="tv" onClose={() => setShowBingo(false)} />}

                <StatusButtons
                  id={show.id}
                  type="tv"
                  title={show.name}
                  poster_path={show.poster_path}
                  vote_average={show.vote_average}
                />

                {/* Meta row */}
                <div className="flex flex-wrap items-center gap-2 text-[13px]">
                  {show.first_air_date && (
                    <span className="px-2.5 py-1 rounded-md bg-foreground/[0.05] text-foreground/75 ring-1 ring-white/[0.06]">
                      {new Date(show.first_air_date).getFullYear()}
                      {(show as any).last_air_date && new Date((show as any).last_air_date).getFullYear() !== new Date(show.first_air_date).getFullYear()
                        ? " – " + new Date((show as any).last_air_date).getFullYear()
                        : ""}
                    </span>
                  )}
                  <span className="px-2.5 py-1 rounded-md bg-foreground/[0.05] text-foreground/75 ring-1 ring-white/[0.06]">
                    {show.number_of_seasons}{" "}{show.number_of_seasons === 1 ? "сезон" : show.number_of_seasons < 5 ? "сезона" : "сезонов"}
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-foreground/[0.05] text-foreground/75 ring-1 ring-white/[0.06]">
                    {show.number_of_episodes}{" серий"}
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/25 font-semibold">
                    {"★ " + show.vote_average.toFixed(1)}
                  </span>
                </div>

                {show.overview && (
                  <p className="text-foreground/65 text-[13px] sm:text-[14px] leading-relaxed line-clamp-2 max-w-2xl">{show.overview}</p>
                )}

                {/* Action buttons */}
                <div className="flex items-center gap-2 flex-wrap pt-1">
                  <button
                    onClick={() => {
                      if (!requireAuth("Войдите, чтобы смотреть сериалы и сохранять прогресс")) return;
                      if (!showPlayer) {
                        setShowPlayer(true);
                        // fetchStream itself falls back to storage when translatorId
                        // is null — covers fast-tap race before restore effect runs.
                        fetchStream(selectedSeason, selectedEpisode, selectedTranslator);
                      } else if (resumeTime && videoRef.current) videoRef.current.currentTime = resumeTime;
                    }}
                    className="inline-flex items-center gap-2 h-10 px-4 rounded-full bg-primary text-primary-foreground text-[13px] font-semibold hover:bg-primary/90 transition-colors"
                  >
                    <Play size={15} fill="currentColor" /> {resumeTime ? "Продолжить просмотр" : "Смотреть"}
                  </button>
                  <button
                    onClick={() => {
                      if (!requireAuth("Войдите, чтобы смотреть сериалы и сохранять прогресс")) return;
                      if (showPlayer) nextEpisode(); else { const n = nextEpisode; n(); setShowPlayer(true); }
                    }}
                    className="inline-flex items-center gap-2 h-10 px-4 rounded-full bg-foreground/[0.06] ring-1 ring-white/[0.08] text-foreground/85 hover:bg-foreground/[0.1] transition-colors text-[13px] font-medium"
                  >
                    <SkipForward size={15} /> {"Следующая серия"}
                  </button>

                  {/* Compact chips — feature shortcuts that used to live in the bottom options bar */}
                  {streamData && (
                    <SendToTV
                      streamData={{
                        stream: streamData.stream, quality: selectedQuality, streams: streamData.streams,
                        title: show.name + " S" + selectedSeason + "E" + selectedEpisode,
                        translators, selectedTranslator,
                        searchQuery: show.name,
                        year: show.first_air_date ? new Date(show.first_air_date).getFullYear().toString() : "",
                        season: selectedSeason, episode: selectedEpisode, isSeries: true,
                        totalSeasons: validSeasons.length, totalEpisodes: episodes.length,
                        mediaId: show.id, mediaType: "tv",
                        poster_path: show.poster_path, vote_average: show.vote_average,
                        first_air_date: show.first_air_date,
                        episodeName: episodes.find(e => e.episode_number === selectedEpisode)?.name || "",
                      }}
                    />
                  )}
                  <MovieDownloadButton
                    type="tv"
                    show={{
                      id: show.id,
                      name: show.name,
                      poster_path: show.poster_path,
                      first_air_date: show.first_air_date,
                      number_of_seasons: show.number_of_seasons || 1,
                      // TMDB returns `seasons: [{season_number, episode_count, ...}]`
                      // — pass it so the modal can render an exact dropdown of
                      // episodes per season instead of a free-form input.
                      seasons: (show as any).seasons,
                    }}
                    initialSeason={selectedSeason}
                    initialEpisode={selectedEpisode}
                  />
                  <Link
                    href={"/watch/create?q=" + encodeURIComponent(show.name) + "&id=" + show.id + "&type=tv&year=" + (show.first_air_date ? new Date(show.first_air_date).getFullYear() : "") + "&poster=" + (show.poster_path || "")}
                    className="inline-flex items-center gap-2 h-10 px-3.5 rounded-full bg-purple-500/12 ring-1 ring-purple-500/30 text-purple-300 hover:bg-purple-500/20 transition-colors text-[12.5px] font-semibold"
                    title="Смотреть вместе"
                  >
                    <Users size={14} /> {"Вместе"}
                  </Link>
                </div>

                {/* Current episode + progress */}
                {(() => {
                  const sp = getPosition(show.id, "tv", selectedSeason, selectedEpisode);
                  const epName = episodes.find(e => e.episode_number === selectedEpisode)?.name || "";
                  const progress = sp && sp.duration > 0 ? Math.min(100, (sp.time / sp.duration) * 100) : 0;
                  const remainingSec = sp && sp.duration > 0 ? Math.max(0, sp.duration - sp.time) : 0;
                  const remainingMin = Math.ceil(remainingSec / 60);
                  return (
                    <div className="pt-3 max-w-2xl">
                      <p className="text-foreground/85 text-[13px] font-semibold">
                        {"Сезон "}{selectedSeason}{", Серия "}{selectedEpisode}{epName ? ". " + epName : ""}
                      </p>
                      {progress > 0 && (
                        <>
                          <div className="mt-2 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all duration-500"
                              style={{ width: progress + "%" }}
                            />
                          </div>
                          <p className="mt-1.5 text-foreground/50 text-[11px] text-right">{"Осталось " + remainingMin + " мин"}</p>
                        </>
                      )}
                    </div>
                  );
                })()}
              </div>
            </section>

            {/* Player options (Озвучка / Субтитры / Качество / Скорость) moved INTO the ArtPlayer
                settings menu (gear icon, bottom-right of the player). На ТВ + Вместе are above
                next to "Смотреть". */}

            {/* === EPISODES SECTION === */}
            {validSeasons.length > 0 && (
              <section className="mt-10">
                <h2 className="text-2xl font-bold text-foreground tracking-tight mb-4">{"Эпизоды"}</h2>

                {/* Season tabs */}
                <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1 -mx-1 px-1">
                  {validSeasons.map((s) => (
                    <button
                      key={s.season_number}
                      onClick={() => selectEpisode(s.season_number, 1)}
                      className={"flex-shrink-0 inline-flex items-center h-9 px-4 rounded-full text-[13px] transition-colors " + (
                        selectedSeason === s.season_number
                          ? "bg-primary/15 text-primary ring-1 ring-primary/30 font-semibold"
                          : "bg-foreground/[0.04] text-foreground/65 ring-1 ring-white/[0.06] hover:bg-foreground/[0.07] hover:text-foreground"
                      )}
                    >
                      {"Сезон "}{s.season_number}
                    </button>
                  ))}
                </div>

                {/* Horizontal episode scroller */}
                <div className="relative">
                  <div
                    id="ep-scroller"
                    className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory -mx-1 px-1"
                    style={{ scrollbarWidth: "thin" }}
                  >
                    {loadingEpisodes && episodes.length === 0 ? (
                      Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="snap-start flex-shrink-0 w-[200px] aspect-[16/10] rounded-xl bg-foreground/[0.04] animate-pulse" />
                      ))
                    ) : episodes.map((ep) => {
                      const released = !ep.air_date || new Date(ep.air_date) <= new Date();
                      const active = ep.episode_number === selectedEpisode;
                      const stillUrl = ep.still_path ? getImageUrl(ep.still_path, "w300") : null;
                      return (
                        <button
                          key={ep.episode_number}
                          onClick={() => released && selectEpisode(selectedSeason, ep.episode_number)}
                          disabled={!released}
                          className="snap-start flex-shrink-0 w-[200px] text-left group disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <div className={"relative aspect-[16/10] rounded-xl overflow-hidden ring-2 transition-all duration-200 " + (
                            active
                              ? "ring-primary shadow-lg shadow-primary/30"
                              : "ring-white/[0.06] group-hover:ring-white/15"
                          )}>
                            {stillUrl ? (
                              <img src={stillUrl} alt={ep.name || ""} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full bg-foreground/[0.04] flex items-center justify-center">
                                <Film size={22} className="text-foreground/30" />
                              </div>
                            )}
                            <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/65 backdrop-blur text-white text-[11px] font-bold leading-none ring-1 ring-white/15 flex items-center h-5">
                              {ep.episode_number}
                            </div>
                            {!released && (
                              <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white/80 text-xs">
                                {"🔒 " + (ep.air_date ? new Date(ep.air_date).toLocaleDateString("ru-RU") : "")}
                              </div>
                            )}
                          </div>
                          <div className={"mt-2 px-0.5 " + (active ? "text-primary" : "text-foreground/85")}>
                            <p className="text-[13px] font-semibold leading-tight line-clamp-1">
                              {ep.name || ("Серия " + ep.episode_number)}
                            </p>
                            {ep.runtime > 0 && (
                              <p className="text-foreground/50 text-[11px] mt-0.5">{ep.runtime}{" мин"}</p>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Scroll arrows */}
                  <button
                    aria-label="Back"
                    onClick={() => { const el = document.getElementById("ep-scroller"); if (el) el.scrollBy({ left: -700, behavior: "smooth" }); }}
                    className="hidden sm:flex absolute left-0 top-[40%] -translate-y-1/2 -translate-x-2 w-9 h-9 rounded-full bg-background/85 ring-1 ring-white/15 backdrop-blur items-center justify-center text-foreground/80 hover:text-foreground hover:bg-background z-10 shadow-lg"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    aria-label="Next"
                    onClick={() => { const el = document.getElementById("ep-scroller"); if (el) el.scrollBy({ left: 700, behavior: "smooth" }); }}
                    className="hidden sm:flex absolute right-0 top-[40%] -translate-y-1/2 translate-x-2 w-9 h-9 rounded-full bg-background/85 ring-1 ring-white/15 backdrop-blur items-center justify-center text-foreground/80 hover:text-foreground hover:bg-background z-10 shadow-lg"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
