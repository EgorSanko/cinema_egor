"use client";

import { useEffect, useRef, useState } from "react";
import { SkipForward } from "lucide-react";

interface Segment { start: number; end: number }
export interface SkipData { intro: Segment | null; outro: Segment | null; source: string }

interface Props {
  /** Live ref to the playing video element. Polled via timeupdate. */
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
  /** TMDB id of the title. */
  tmdbId: number;
  /** Whether this is a movie or a TV series. Determines if we fetch with
   *  season/episode params and whether the outro card offers Next-Episode. */
  type: "movie" | "tv";
  /** TV-only: current season / episode being watched. */
  season?: number;
  episode?: number;
  /** TV-only: called when the user accepts the "Next Episode" card. If
   *  hasNext is false the card hides itself. */
  hasNextEpisode?: boolean;
  onNextEpisode?: () => void;
}

const AUTO_NEXT_SECONDS = 10;

export function SkipOverlays({ videoRef, tmdbId, type, season, episode, hasNextEpisode, onNextEpisode }: Props) {
  const [data, setData] = useState<SkipData | null>(null);
  const [showSkipIntro, setShowSkipIntro] = useState(false);
  const [showOutroCard, setShowOutroCard] = useState(false);
  const [autoNextSecs, setAutoNextSecs] = useState(AUTO_NEXT_SECONDS);
  // Tracked separately so the user dismissing the card doesn't immediately
  // re-trigger if currentTime is still inside the outro window.
  const dismissedRef = useRef(false);
  const advanceTriggeredRef = useRef(false);
  const cardKeyRef = useRef("");

  // Reset state whenever the episode (or movie) changes.
  useEffect(() => {
    setData(null);
    setShowSkipIntro(false);
    setShowOutroCard(false);
    setAutoNextSecs(AUTO_NEXT_SECONDS);
    dismissedRef.current = false;
    advanceTriggeredRef.current = false;
    cardKeyRef.current = `${tmdbId}-${season ?? 0}-${episode ?? 0}`;

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

  // Watch playback time and toggle overlays. Polls via requestAnimationFrame
  // chained to timeupdate to stay responsive even when the timeupdate event
  // fires only every 250ms in some browsers.
  useEffect(() => {
    if (!data) return;
    let timerId: ReturnType<typeof setInterval> | null = null;
    const tick = () => {
      const v = videoRef.current;
      if (!v || v.paused) return;
      const ct = v.currentTime;

      if (data.intro && !dismissedRef.current) {
        const inIntro = ct >= data.intro.start && ct < data.intro.end;
        setShowSkipIntro(prev => prev === inIntro ? prev : inIntro);
      } else if (showSkipIntro) {
        setShowSkipIntro(false);
      }

      if (data.outro) {
        const inOutro = ct >= data.outro.start;
        if (inOutro && !showOutroCard && !advanceTriggeredRef.current) {
          setShowOutroCard(true);
          setAutoNextSecs(AUTO_NEXT_SECONDS);
        }
      }
    };
    timerId = setInterval(tick, 250);
    return () => { if (timerId) clearInterval(timerId); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, showOutroCard]);

  // Outro card countdown — ticks down to 0, then auto-advances if TV + has next.
  useEffect(() => {
    if (!showOutroCard) return;
    if (type === "movie" || !hasNextEpisode) return;
    if (autoNextSecs <= 0) {
      if (!advanceTriggeredRef.current && onNextEpisode) {
        advanceTriggeredRef.current = true;
        onNextEpisode();
      }
      return;
    }
    const t = setTimeout(() => setAutoNextSecs(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [showOutroCard, autoNextSecs, type, hasNextEpisode, onNextEpisode]);

  const skipIntro = () => {
    const v = videoRef.current;
    if (v && data?.intro) {
      v.currentTime = data.intro.end;
      setShowSkipIntro(false);
      dismissedRef.current = true;
    }
  };

  const dismissOutro = () => {
    setShowOutroCard(false);
    advanceTriggeredRef.current = true; // don't re-show this episode
  };

  return (
    <>
      {showSkipIntro && data?.intro && (
        <button
          onClick={skipIntro}
          className="absolute bottom-20 right-6 z-30 flex items-center gap-2 px-4 h-11 rounded-full bg-black/80 backdrop-blur-md text-white text-[13px] font-semibold ring-1 ring-white/15 hover:bg-white hover:text-black transition-colors shadow-lg pointer-events-auto"
          style={{ boxShadow: "0 6px 24px -4px rgba(0,0,0,0.6)" }}
        >
          <SkipForward size={16} />
          Пропустить заставку
        </button>
      )}

      {showOutroCard && (
        <div
          className="absolute top-4 right-4 z-30 w-[280px] sm:w-[320px] p-4 rounded-2xl bg-black/85 backdrop-blur-md ring-1 ring-white/15 shadow-xl pointer-events-auto"
          style={{ boxShadow: "0 10px 40px -6px rgba(0,0,0,0.7)" }}
        >
          {type === "tv" && hasNextEpisode ? (
            <>
              <div className="text-white/60 text-[10px] uppercase tracking-wider font-bold mb-1">
                Через {autoNextSecs} сек
              </div>
              <div className="text-white text-[15px] font-bold leading-tight mb-3">
                Следующая серия
              </div>
              <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden mb-3">
                <div
                  className="h-full bg-primary transition-[width] duration-1000 ease-linear"
                  style={{ width: `${(autoNextSecs / AUTO_NEXT_SECONDS) * 100}%` }}
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { advanceTriggeredRef.current = true; onNextEpisode?.(); }}
                  className="flex-1 h-9 px-3 rounded-full bg-primary text-primary-foreground text-[12px] font-bold hover:bg-primary/90 transition-colors"
                >
                  Перейти
                </button>
                <button
                  onClick={dismissOutro}
                  className="px-3 h-9 rounded-full bg-white/10 text-white/80 text-[12px] font-medium hover:bg-white/15 transition-colors"
                >
                  Остаться
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="text-white/60 text-[10px] uppercase tracking-wider font-bold mb-1">
                Финальные титры
              </div>
              <div className="text-white text-[14px] font-medium leading-snug mb-3">
                {type === "movie" ? "Фильм заканчивается" : "Серий больше нет"}
              </div>
              <button
                onClick={dismissOutro}
                className="w-full h-9 px-3 rounded-full bg-white/10 text-white/80 text-[12px] font-medium hover:bg-white/15 transition-colors"
              >
                Скрыть
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}
