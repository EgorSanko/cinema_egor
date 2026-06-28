"use client";

import * as React from "react";
import { HeroSection } from "@/components/hero-section";

// Homepage hero with a brand intro. The intro video plays in the SAME boxed
// frame the old HeroVideo used (16:9, centered, max-1280, rounded — NOT the
// full-height banner), runs once, freezes on its last frame (the logo) for 5s,
// then fades and is replaced by the swipeable hero cards. Plays every visit;
// tap/Esc skips.

const HOLD_MS = 5000; // hold the frozen logo for 5s after the video ends
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
    <div
      onClick={finish}
      className="relative w-full aspect-video cursor-pointer overflow-hidden bg-black md:mx-auto md:mt-4 md:max-w-[1280px] md:rounded-2xl md:ring-1 md:ring-white/[0.06]"
      style={{ opacity: fading ? 0 : 1, transition: `opacity ${FADE_MS}ms ease-out` }}
      aria-hidden="true"
    >
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-contain"
        autoPlay
        muted
        playsInline
        preload="auto"
        poster="/intro-logo-poster.jpg"
        onEnded={onEnded}
        onError={finish}
      >
        <source src="/intro-logo.mp4" type="video/mp4" />
      </video>
      <span className="pointer-events-none absolute bottom-3 right-4 text-xs text-white/40 select-none">
        нажмите, чтобы пропустить
      </span>
    </div>
  );
}
