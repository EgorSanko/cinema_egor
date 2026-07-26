"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SkipForward } from "lucide-react";

interface Segment { start: number; end: number }
export interface SkipData { intro: Segment | null; outro: Segment | null; source: string }

interface Props {
  /** Live ref to the playing video element. Polled via timeupdate. */
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
  /** ArtPlayer's $player container. If provided, overlays are portalled
   *  INTO it so they survive every fullscreen mode. */
  playerContainer?: HTMLElement | null;
  /** TMDB id of the title. */
  tmdbId: number;
  /** Movie or TV — determines if we fetch with season/episode params. */
  type: "movie" | "tv";
  /** TV-only: current season / episode being watched (for the segments fetch). */
  season?: number;
  episode?: number;
  // Приняты для обратной совместимости с вызовами (tv-player / tv-watch), но
  // НЕ используются: оверлей авто-перехода на следующую серию УБРАН (2026-07-26).
  // Причина: срабатывал не вовремя (по кривому data.outro из /api/skip-segments —
  // мог выскочить за 7 мин до конца) и дублировал штатный переход. Переключение
  // серий теперь: авто по РЕАЛЬНОМУ концу видео (ended-listener в tv-player) +
  // удобная ручная панель серий (player-episode-bar). Оставлена только кнопка
  // «Пропустить заставку».
  hasNextEpisode?: boolean;
  onNextEpisode?: () => void;
}

export function SkipOverlays({ videoRef, playerContainer, tmdbId, type, season, episode }: Props) {
  const [data, setData] = useState<SkipData | null>(null);
  const [showSkipIntro, setShowSkipIntro] = useState(false);
  const dismissedRef = useRef(false);

  // Reset + fetch intro segment whenever the episode (or movie) changes.
  useEffect(() => {
    setData(null);
    setShowSkipIntro(false);
    dismissedRef.current = false;

    let cancelled = false;
    const qs = new URLSearchParams({ tmdb: String(tmdbId), type });
    if (type === "tv" && season) qs.set("season", String(season));
    if (type === "tv" && episode) qs.set("episode", String(episode));
    fetch(`/api/skip-segments?${qs}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled && d) setData(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [tmdbId, type, season, episode]);

  // Watch playback time and toggle the Skip-Intro button. Forgiving window:
  // show a bit before the intro begins and keep it a few seconds after.
  useEffect(() => {
    if (!data?.intro) return;
    const PRE_BUFFER = 5;
    const POST_BUFFER = 5;
    const tick = () => {
      const v = videoRef.current;
      if (!v) return;
      const ct = v.currentTime;
      if (!dismissedRef.current && data.intro) {
        const inIntro =
          ct >= Math.max(0, data.intro.start - PRE_BUFFER)
          && ct < data.intro.end + POST_BUFFER;
        setShowSkipIntro(prev => (prev === inIntro ? prev : inIntro));
      } else {
        setShowSkipIntro(prev => (prev ? false : prev));
      }
    };
    const timerId = setInterval(tick, 250);
    return () => clearInterval(timerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const skipIntro = () => {
    const v = videoRef.current;
    if (v && data?.intro) {
      v.currentTime = data.intro.end;
      setShowSkipIntro(false);
      dismissedRef.current = true;
    }
  };

  const overlays = (
    <>
      {showSkipIntro && data?.intro && (
        <button
          onClick={skipIntro}
          className="absolute bottom-20 right-6 z-[2147483647] flex items-center gap-2 px-4 h-11 rounded-full bg-black/80 backdrop-blur-md text-white text-[13px] font-semibold ring-1 ring-white/15 hover:bg-white hover:text-black transition-colors shadow-lg pointer-events-auto"
          style={{ boxShadow: "0 6px 24px -4px rgba(0,0,0,0.6)" }}
        >
          <SkipForward size={16} />
          Пропустить заставку
        </button>
      )}
    </>
  );

  // Portal into ArtPlayer's container when provided so the overlay travels
  // inside any fullscreen mode; fall back to inline until the target is ready.
  return playerContainer ? createPortal(overlays, playerContainer) : overlays;
}
