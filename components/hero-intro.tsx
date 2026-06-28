"use client";

import * as React from "react";
import { HeroSection } from "@/components/hero-section";

// Homepage hero with a brand intro. The intro video plays INLINE inside the hero
// block (same footprint as the cards — not a full-screen pre-page overlay): it
// runs once, freezes on its last frame (the logo) for 5s, then fades to reveal
// the swipeable hero cards underneath. Shown once per session; tap/Esc skips.

const HOLD_MS = 5000; // hold the frozen logo for 5s after the video ends
const FADE_MS = 750; // crossfade-out duration
const HARD_CAP_MS = 20000; // safety: never get stuck if onEnded never fires

type HeroMovies = React.ComponentProps<typeof HeroSection>["movies"];

export function HeroIntro({ movies }: { movies: HeroMovies }) {
  const [intro, setIntro] = React.useState(false);
  const [fading, setFading] = React.useState(false);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const timers = React.useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  const finish = React.useCallback(() => {
    setFading(true);
    timers.current.push(setTimeout(() => setIntro(false), FADE_MS + 50));
  }, []);

  // Play the intro on every homepage load (client-only).
  React.useEffect(() => {
    setIntro(true);
    return clearTimers;
  }, []);

  React.useEffect(() => {
    if (!intro) return;
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
  }, [intro, finish]);

  const onEnded = () => {
    // The element keeps showing its last frame (the logo) after `ended` → hold 5s.
    timers.current.push(setTimeout(finish, HOLD_MS));
  };

  return (
    <div className="relative">
      <HeroSection movies={movies} />
      {intro && (
        <div
          onClick={finish}
          className="absolute inset-0 z-30 flex cursor-pointer items-center justify-center bg-black"
          style={{ opacity: fading ? 0 : 1, transition: `opacity ${FADE_MS}ms ease-out` }}
          aria-hidden="true"
        >
          <video
            ref={videoRef}
            className="h-full w-full object-contain"
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
          <span className="pointer-events-none absolute bottom-4 right-6 text-xs text-white/40 select-none">
            нажмите, чтобы пропустить
          </span>
        </div>
      )}
    </div>
  );
}
