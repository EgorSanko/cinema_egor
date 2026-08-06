"use client";

import * as React from "react";
import { HeroSection } from "@/components/hero-section";

// Homepage hero with a brand intro. The intro video plays in the SAME boxed
// frame the old HeroVideo used (16:9, centered, max-1280, rounded — NOT the
// full-height banner), runs once, freezes on its last frame (the logo) for 5s,
// then fades and is replaced by the swipeable hero cards. Plays every visit;
// tap/Esc skips.

// Пауза на застывшем логотипе после ролика. Было 5с при 7-секундном видео;
// новый ролик короткий (3с), и держать логотип дольше самого ролика выглядело
// затянуто — 2с достаточно, весь интро укладывается в ~5с.
const HOLD_MS = 2000;
const FADE_MS = 750; // crossfade-out duration
const HARD_CAP_MS = 20000; // safety: never get stuck if onEnded never fires

type HeroMovies = React.ComponentProps<typeof HeroSection>["movies"];

export function HeroIntro({ movies }: { movies: HeroMovies }) {
  const [phase, setPhase] = React.useState<"intro" | "cards">("intro");
  const [fading, setFading] = React.useState(false);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const timers = React.useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  const finish = React.useCallback(() => {
    setFading(true);
    timers.current.push(setTimeout(() => setPhase("cards"), FADE_MS + 50));
  }, []);

  React.useEffect(() => {
    if (phase !== "intro") return;
    const v = videoRef.current;
    if (v) {
      v.muted = true;
      v.play().catch(() => {});
    }
    timers.current.push(setTimeout(finish, HARD_CAP_MS));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter") finish();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimers();
    };
  }, [phase, finish]);

  const onEnded = () => {
    // Element keeps showing its last frame (the logo) after `ended` → hold 5s.
    timers.current.push(setTimeout(finish, HOLD_MS));
  };

  if (phase === "cards") return <HeroSection movies={movies} />;

  return (
    // Span the same content width as the navbar/rows: left edge under the logo,
    // right edge under the profile/Войти. The inner box uses the video's native
    // aspect ratio so it's never squished or letterboxed.
    <div className="mx-auto mt-4 max-w-[1600px] px-4 sm:px-6 lg:px-8">
      <div
        onClick={finish}
        className="relative w-full cursor-pointer overflow-hidden rounded-2xl bg-black ring-1 ring-white/[0.06]"
        style={{
          aspectRatio: "1280 / 720",
          opacity: fading ? 0 : 1,
          transition: `opacity ${FADE_MS}ms ease-out`,
        }}
        aria-hidden="true"
      >
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          autoPlay
          muted
          playsInline
          preload="auto"
          poster="/intro-logo-v2.jpg"
          onEnded={onEnded}
          onError={finish}
        >
          {/* v2: новое имя файла — чтобы у вернувшихся юзеров не подтянулся
              старый ролик из кэша браузера. */}
          <source src="/intro-logo-v2.mp4" type="video/mp4" />
        </video>
        <span className="pointer-events-none absolute bottom-3 right-4 text-xs text-white/40 select-none">
          нажмите, чтобы пропустить
        </span>
      </div>
    </div>
  );
}
